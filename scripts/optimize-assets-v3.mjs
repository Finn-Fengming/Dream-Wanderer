import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { simplify, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

await MeshoptSimplifier.ready;

// 1. Finish boulder_01.glb & compress env GLB textures cleanly
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
{
  const b1 = await io.read('public/assets/models/env/boulder_01.glb');
  await b1.transform(
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio: 0.035, error: 0.25, lockBorder: false }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 82 })
  );
  await io.write('public/assets/models/env/boulder_01.glb', b1);
  let tris = 0;
  for (const m of b1.getRoot().listMeshes()) {
    for (const p of m.listPrimitives()) tris += p.getIndices().getCount() / 3;
  }
  console.log(`boulder_01.glb -> ${Math.round(tris)} tris (${(fs.statSync('public/assets/models/env/boulder_01.glb').size / 1024 / 1024).toFixed(2)} MB)`);
}

for (const envF of ['boulder_02.glb', 'cliff_peak.glb', 'palace_lantern.glb', 'mountain_tree.glb']) {
  const p = path.resolve('public/assets/models/env', envF);
  const doc = await io.read(p);
  await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 82 }));
  await io.write(p, doc);
  console.log(`Compressed ${envF} -> ${(fs.statSync(p).size / 1024 / 1024).toFixed(2)} MB`);
}

// 2. Build VRM v3.0 Cast:
//    - Strips modern school/tracksuit clothes (Tops, AccessoryNeck, Bottoms, Shoes) when stripModernCloth = true
//    - Tunes MToon face/hair/eye cel-shading & fine anime line-art outlines so faces never blow out!
//    - Compresses embedded PNGs cleanly while keeping 100% of VRM0 Humanoid, SpringBone & BlendShape data!
const OUT_CHAR_DIR = path.resolve('public/assets/models/characters');

async function buildCleanVrm(srcPath, outName, config) {
  const buf = fs.readFileSync(srcPath);
  const jsonLen = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const binChunkStart = 20 + jsonLen + 8;
  const oldBin = buf.subarray(binChunkStart);

  // Strip modern clothing primitives (sweater vests, zip-up hoodies, school skirts, penny loafers)
  // while keeping Body_SKIN (neck, collarbone, hands/wrists, ankles), Face, Eyes, and SpringBone Hair!
  if (config.stripModernCloth) {
    for (const mesh of gltf.meshes || []) {
      if (!mesh.primitives) continue;
      mesh.primitives = mesh.primitives.filter((prim) => {
        const mName = gltf.materials?.[prim.material]?.name || '';
        if (/Tops_|Bottoms_|Shoes_|AccessoryNeck_/i.test(mName)) {
          return false;
        }
        return true;
      });
    }
  }

  // Map image index -> material tags
  const imageMatNames = new Map();
  for (const mat of gltf.materials || []) {
    const visitTex = (tInfo) => {
      if (tInfo && typeof tInfo.index === 'number') {
        const imgIdx = gltf.textures[tInfo.index]?.source;
        if (typeof imgIdx === 'number') {
          if (!imageMatNames.has(imgIdx)) imageMatNames.set(imgIdx, []);
          imageMatNames.get(imgIdx).push(mat.name || '');
        }
      }
    };
    visitTex(mat.pbrMetallicRoughness?.baseColorTexture);
    visitTex(mat.emissiveTexture);
    visitTex(mat.normalTexture);
  }

  const vrmMatProps = gltf.extensions?.VRM?.materialProperties || [];
  for (const mp of vrmMatProps) {
    const texProps = mp.textureProperties || {};
    for (const [propName, texIdx] of Object.entries(texProps)) {
      const imgIdx = gltf.textures?.[texIdx]?.source;
      if (typeof imgIdx === 'number') {
        if (!imageMatNames.has(imgIdx)) imageMatNames.set(imgIdx, []);
        imageMatNames.get(imgIdx).push(`${mp.name}:${propName}`);
      }
    }
    if (config.tuneMToon) config.tuneMToon(mp);
  }

  const imageBvSet = new Map();
  (gltf.images || []).forEach((img, imgIdx) => {
    if (typeof img.bufferView === 'number') imageBvSet.set(img.bufferView, imgIdx);
  });

  const newChunks = [];
  let cursor = 0;
  const pad4 = (len) => (4 - (len % 4)) % 4;

  for (let bvIdx = 0; bvIdx < gltf.bufferViews.length; bvIdx++) {
    const bv = gltf.bufferViews[bvIdx];
    const start = bv.byteOffset || 0;
    const rawSlice = oldBin.subarray(start, start + bv.byteLength);

    if (imageBvSet.has(bvIdx)) {
      const imgIdx = imageBvSet.get(bvIdx);
      const imgDef = gltf.images[imgIdx];
      const matTags = (imageMatNames.get(imgIdx) || []).join(' ');
      const isNormal = /normal|_BumpMap/i.test(matTags) || /normal|nml/i.test(imgDef.name || '');

      let pipeline = sharp(rawSlice);
      const meta = await pipeline.metadata();
      const maxDim = isNormal ? 512 : 1024;
      if ((meta.width || 0) > maxDim || (meta.height || 0) > maxDim) {
        pipeline = pipeline.resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true });
      }
      if (!isNormal && config.transformImage) {
        pipeline = config.transformImage(pipeline, matTags, imgDef.name || '');
      }

      const outImg = await pipeline
        .png({ compressionLevel: 9, palette: !isNormal && !/Face|SKIN|Eye/i.test(matTags), quality: 88 })
        .toBuffer();

      bv.byteOffset = cursor;
      bv.byteLength = outImg.length;
      imgDef.mimeType = 'image/png';
      newChunks.push(outImg);
      cursor += outImg.length;
      const p = pad4(outImg.length);
      if (p > 0) {
        newChunks.push(Buffer.alloc(p, 0));
        cursor += p;
      }
    } else {
      bv.byteOffset = cursor;
      newChunks.push(Buffer.from(rawSlice));
      cursor += rawSlice.length;
      const p = pad4(rawSlice.length);
      if (p > 0) {
        newChunks.push(Buffer.alloc(p, 0));
        cursor += p;
      }
    }
  }

  const newBin = Buffer.concat(newChunks);
  gltf.buffers[0].byteLength = newBin.length;

  let jsonBuf = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jp = pad4(jsonBuf.length);
  if (jp > 0) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jp, 0x20)]);

  const totalLen = 12 + 8 + jsonBuf.length + 8 + newBin.length;
  const header = Buffer.alloc(20);
  header.write('glTF', 0, 4, 'ascii');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLen, 8);
  header.writeUInt32LE(jsonBuf.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);

  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(newBin.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);

  const outPath = path.join(OUT_CHAR_DIR, outName);
  fs.writeFileSync(outPath, Buffer.concat([header, jsonBuf, binHeader, newBin]));
  console.log(`Built clean VRM ${outName}: ${(totalLen / 1024 / 1024).toFixed(2)} MB`);
}

function setGenshinMToon(mp, litRgba, shadeRgba, rimRgba, outlineWidth = 0.09) {
  if (!mp.vectorProperties) mp.vectorProperties = {};
  if (!mp.floatProperties) mp.floatProperties = {};
  mp.vectorProperties._Color = litRgba;
  mp.vectorProperties._ShadeColor = shadeRgba;
  mp.vectorProperties._RimColor = rimRgba;
  mp.vectorProperties._OutlineColor = [0.16, 0.09, 0.08, 1];
  mp.floatProperties._ShadeToony = 0.78;   // Smooth Genshin-like cel terminator (not harsh jagged binary!)
  mp.floatProperties._ShadeShift = -0.06;  // Preserves nose/cheek shadow definition!
  mp.floatProperties._RimFresnelPower = 3.6;
  mp.floatProperties._RimLift = 0.05;
  mp.floatProperties._LightColorAttenuation = 0.35; // Prevents blinding directional blowout!
  if (!/Eye|Brow|Mouth|Eyelash|Eyeline/i.test(mp.name || '')) {
    mp.floatProperties._OutlineWidthMode = 1; // WorldCoordinates
    mp.floatProperties._OutlineWidth = outlineWidth;
  } else {
    mp.floatProperties._OutlineWidthMode = 0;
    mp.floatProperties._OutlineWidth = 0;
  }
}

// 1. Yun Tianhe (Head, Hands, Raven Spiky Hair — modern school sweater/slacks/loafers stripped!)
await buildCleanVrm('/tmp/Sakurada_Fumiriya.vrm', 'tianhe.vrm', {
  stripModernCloth: true,
  transformImage(pipe, tags) {
    if (/Hair/i.test(tags)) return pipe.modulate({ saturation: 0.06, brightness: 1.02 });
    return pipe;
  },
  tuneMToon(mp) {
    const n = mp.name || '';
    if (/Hair/i.test(n)) {
      setGenshinMToon(mp, [0.18, 0.16, 0.22, 1], [0.08, 0.07, 0.13, 1], [0.22, 0.48, 0.72, 1], 0.08);
    } else if (/SKIN|Face_00/i.test(n)) {
      setGenshinMToon(mp, [0.97, 0.92, 0.89, 1], [0.85, 0.65, 0.60, 1], [0.25, 0.38, 0.52, 1], 0.06);
    }
  },
});

// 2. Xuanxiao (Head, Hands, Sharp Dark Hair, Crimson Eyes — modern zip-up tracksuit stripped!)
await buildCleanVrm('/tmp/AvatarSample_C.vrm', 'xuanxiao.vrm', {
  stripModernCloth: true,
  tuneMToon(mp) {
    const n = mp.name || '';
    if (/Hair/i.test(n)) {
      setGenshinMToon(mp, [0.22, 0.18, 0.22, 1], [0.09, 0.06, 0.10, 1], [0.65, 0.20, 0.12, 1], 0.08);
    } else if (/SKIN|Face_00/i.test(n)) {
      setGenshinMToon(mp, [0.97, 0.93, 0.91, 1], [0.84, 0.66, 0.64, 1], [0.52, 0.20, 0.14, 1], 0.06);
    }
  },
});

// 3. Han Lingsha (Keeps authentic Chinese Mandarin-collar flare-sleeve tunic & SpringBone skirt, refined brocade!)
await buildCleanVrm('/tmp/Darkness_Shibu.vrm', 'lingsha.vrm', {
  stripModernCloth: false,
  transformImage(pipe, tags) {
    if (/Tops_01|Onepiece/i.test(tags)) {
      return pipe.linear([2.45, 0.82, 0.85], [48, 10, 14]);
    }
    if (/Shoes/i.test(tags)) {
      return pipe.linear([1.5, 0.7, 0.7], [22, 12, 14]);
    }
    return pipe;
  },
  tuneMToon(mp) {
    const n = mp.name || '';
    if (/Hair/i.test(n)) {
      setGenshinMToon(mp, [0.22, 0.11, 0.14, 1], [0.10, 0.05, 0.07, 1], [0.62, 0.22, 0.28, 1], 0.08);
    } else if (/Tops_01|Shoes/i.test(n)) {
      setGenshinMToon(mp, [0.96, 0.88, 0.85, 1], [0.62, 0.22, 0.26, 1], [0.75, 0.35, 0.32, 1], 0.10);
    } else if (/SKIN|Face_00/i.test(n)) {
      setGenshinMToon(mp, [0.98, 0.93, 0.91, 1], [0.87, 0.68, 0.66, 1], [0.45, 0.25, 0.28, 1], 0.06);
    }
  },
});

// 4. Liu Mengli (Head, Hands, Long Flowing Midnight-Violet Princess Hair — modern sailor uniform stripped!)
await buildCleanVrm('/tmp/Sendagaya_Shino.vrm', 'mengli.vrm', {
  stripModernCloth: true,
  tuneMToon(mp) {
    const n = mp.name || '';
    if (/Hair/i.test(n)) {
      setGenshinMToon(mp, [0.22, 0.18, 0.38, 1], [0.10, 0.08, 0.22, 1], [0.45, 0.68, 0.98, 1], 0.08);
    } else if (/SKIN|Face_00/i.test(n)) {
      setGenshinMToon(mp, [0.98, 0.94, 0.93, 1], [0.87, 0.70, 0.72, 1], [0.40, 0.58, 0.85, 1], 0.06);
    }
  },
});

// 5. Qionghua Disciple & Cultivator (Head, Hands, Raven Hair — modern school sweater stripped!)
await buildCleanVrm('/tmp/Sakurada_Fumiriya.vrm', 'disciple.vrm', {
  stripModernCloth: true,
  transformImage(pipe, tags) {
    if (/Hair/i.test(tags)) return pipe.modulate({ saturation: 0.05 });
    return pipe;
  },
  tuneMToon(mp) {
    const n = mp.name || '';
    if (/Hair/i.test(n)) {
      setGenshinMToon(mp, [0.17, 0.20, 0.26, 1], [0.08, 0.10, 0.15, 1], [0.30, 0.68, 0.92, 1], 0.08);
    } else if (/SKIN|Face_00/i.test(n)) {
      setGenshinMToon(mp, [0.97, 0.92, 0.89, 1], [0.85, 0.66, 0.62, 1], [0.25, 0.48, 0.68, 1], 0.06);
    }
  },
});
