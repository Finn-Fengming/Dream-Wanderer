import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { textureCompress } from '@gltf-transform/functions';

const OUT_CHAR_DIR = path.resolve('public/assets/models/characters');
fs.mkdirSync(OUT_CHAR_DIR, { recursive: true });

/**
 * Surgically customizes & compresses embedded PNG textures inside a VRM 0.x GLB
 * WITHOUT touching any VRM humanoid, SpringBone, or BlendShape extensions!
 */
async function processVrm(srcPath, outName, config) {
  const buf = fs.readFileSync(srcPath);
  const magic = buf.subarray(0, 4).toString('ascii');
  if (magic !== 'glTF') throw new Error(`Invalid GLB magic in ${srcPath}`);

  const jsonLen = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const binChunkStart = 20 + jsonLen + 8;
  const oldBin = buf.subarray(binChunkStart);

  // Map image index -> material names using it
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

  // Also check VRM materialProperties textureProperties (_MainTex, _ShadeTexture, etc.)
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
    if (config.tuneMToon) {
      config.tuneMToon(mp);
    }
  }

  // Also update standard glTF material baseColorFactor if needed
  for (const mat of gltf.materials || []) {
    if (config.tuneGltfMat) {
      config.tuneGltfMat(mat);
    }
  }

  // Rebuild binary buffer cleanly: copy non-image bufferViews as-is, re-encode image bufferViews!
  const imageBvSet = new Map(); // bvIdx -> imgIdx
  (gltf.images || []).forEach((img, imgIdx) => {
    if (typeof img.bufferView === 'number') {
      imageBvSet.set(img.bufferView, imgIdx);
    }
  });

  const newChunks = [];
  let cursor = 0;
  const pad4 = (len) => (4 - (len % 4)) % 4;

  // Notice: multiple accessors might share a bufferView, so iterate bufferViews in order!
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
      const maxDim = isNormal ? 512 : /Face|Eye/i.test(matTags) ? 1024 : 1024;
      if ((meta.width || 0) > maxDim || (meta.height || 0) > maxDim) {
        pipeline = pipeline.resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true });
      }

      if (!isNormal && config.transformImage) {
        pipeline = config.transformImage(pipeline, matTags, imgDef.name || '');
      }

      // Encode as crisp compressed PNG (100% compatible with VRM MToon & alpha cutouts!)
      const outImg = await pipeline.png({ compressionLevel: 9, palette: !isNormal && !/Face|SKIN|Eye/i.test(matTags), quality: 88 }).toBuffer();

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

  let jsonStr = JSON.stringify(gltf);
  let jsonBuf = Buffer.from(jsonStr, 'utf8');
  const jp = pad4(jsonBuf.length);
  if (jp > 0) {
    jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jp, 0x20)]); // space padding per GLB spec
  }

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
  console.log(`Built ${outName}: ${(totalLen / 1024 / 1024).toFixed(2)} MB`);
}

function setMToonColors(mp, litRgba, shadeRgba, rimRgba = [0.22, 0.35, 0.48, 1]) {
  if (!mp.vectorProperties) mp.vectorProperties = {};
  mp.vectorProperties._Color = litRgba;
  mp.vectorProperties._ShadeColor = shadeRgba;
  mp.vectorProperties._RimColor = rimRgba;
  if (!mp.floatProperties) mp.floatProperties = {};
  mp.floatProperties._ShadeToony = 0.88;
  mp.floatProperties._ShadeShift = -0.05;
  mp.floatProperties._RimFresnelPower = 3.2;
  mp.floatProperties._RimLift = 0.08;
}

// 1. YUN TIANHE (云天河 — Qingluan Mountain Azure-Indigo Tunic, Raven Spiky Hair, Warm Skin)
await processVrm('/tmp/Sakurada_Fumiriya.vrm', 'tianhe.vrm', {
  transformImage(pipe, tags) {
    if (/Tops_01/i.test(tags)) {
      // Boost Qingluan azure-teal martial tunic richness
      return pipe.linear([1.05, 1.45, 1.85], [8, 22, 38]);
    }
    if (/Hair/i.test(tags)) {
      return pipe.modulate({ saturation: 0.08, brightness: 1.05 });
    }
    return pipe;
  },
  tuneMToon(mp) {
    const n = mp.name || '';
    if (/Hair/i.test(n)) {
      setMToonColors(mp, [0.19, 0.17, 0.22, 1], [0.09, 0.08, 0.13, 1], [0.25, 0.48, 0.68, 1]);
    } else if (/Tops_01/i.test(n)) {
      setMToonColors(mp, [0.88, 0.96, 1.0, 1], [0.48, 0.62, 0.78, 1], [0.35, 0.72, 0.95, 1]);
    } else if (/Bottoms_01/i.test(n)) {
      setMToonColors(mp, [0.85, 0.92, 1.0, 1], [0.45, 0.52, 0.68, 1]);
    } else if (/SKIN|Face_00/i.test(n)) {
      setMToonColors(mp, [1.0, 0.97, 0.95, 1], [0.93, 0.75, 0.70, 1], [0.30, 0.42, 0.55, 1]);
    }
  },
});

// 2. XUANXIAO (玄霄 — Qionghua Crimson-White-Gold Grandmaster Robes, Intense Crimson Eyes, Raven Hair)
await processVrm('/tmp/AvatarSample_C.vrm', 'xuanxiao.vrm', {
  transformImage(pipe, tags) {
    if (/Tops_01/i.test(tags)) {
      // Transform dark coat [23,23,23] into rich Qionghua Crimson-Vermilion & Gold-Edged Grandmaster Vestments!
      return pipe.linear([4.6, 1.35, 1.25], [68, 14, 14]);
    }
    if (/Bottoms_01/i.test(tags)) {
      // Transform dark trousers into snow-jade & slate-gold lower vestments
      return pipe.linear([3.2, 3.3, 3.6], [135, 142, 155]);
    }
    return pipe;
  },
  tuneMToon(mp) {
    const n = mp.name || '';
    if (/Tops_01/i.test(n)) {
      setMToonColors(mp, [1.0, 0.94, 0.90, 1], [0.62, 0.22, 0.24, 1], [0.85, 0.35, 0.16, 1]);
    } else if (/Bottoms_01/i.test(n)) {
      setMToonColors(mp, [0.96, 0.97, 1.0, 1], [0.64, 0.68, 0.78, 1], [0.75, 0.32, 0.16, 1]);
    } else if (/Hair/i.test(n)) {
      setMToonColors(mp, [0.28, 0.24, 0.28, 1], [0.12, 0.09, 0.14, 1], [0.65, 0.22, 0.14, 1]);
    } else if (/SKIN|Face_00/i.test(n)) {
      setMToonColors(mp, [1.0, 0.97, 0.95, 1], [0.90, 0.74, 0.72, 1], [0.55, 0.24, 0.15, 1]);
    }
  },
});

// 3. HAN LINGSHA (韩菱纱 — Vibrant Crimson-Ruby & Gold Chinese Collar Attire)
await processVrm('/tmp/Darkness_Shibu.vrm', 'lingsha.vrm', {
  transformImage(pipe, tags) {
    if (/Tops_01|Onepiece/i.test(tags)) {
      return pipe.linear([2.6, 0.95, 0.95], [55, 12, 18]);
    }
    return pipe;
  },
  tuneMToon(mp) {
    const n = mp.name || '';
    if (/Hair/i.test(n)) {
      setMToonColors(mp, [0.26, 0.14, 0.16, 1], [0.12, 0.06, 0.09, 1], [0.65, 0.25, 0.32, 1]);
    } else if (/Tops_01/i.test(n)) {
      setMToonColors(mp, [1.0, 0.92, 0.88, 1], [0.68, 0.28, 0.32, 1], [0.75, 0.35, 0.38, 1]);
    } else if (/SKIN|Face_00/i.test(n)) {
      setMToonColors(mp, [1.0, 0.97, 0.95, 1], [0.95, 0.78, 0.75, 1]);
    }
  },
});

// 4. LIU MENGLI (柳梦璃 — Ethereal Lavender-Jade Moonlight Princess Gown & Midnight-Violet Hair)
await processVrm('/tmp/Sendagaya_Shino.vrm', 'mengli.vrm', {
  transformImage(pipe, tags) {
    if (/Tops_01|Bottoms_01/i.test(tags)) {
      return pipe.linear([2.1, 1.95, 2.55], [62, 54, 88]);
    }
    return pipe;
  },
  tuneMToon(mp) {
    const n = mp.name || '';
    if (/Hair/i.test(n)) {
      setMToonColors(mp, [0.22, 0.18, 0.38, 1], [0.11, 0.09, 0.24, 1], [0.48, 0.68, 0.98, 1]);
    } else if (/Tops_01|Bottoms_01/i.test(n)) {
      setMToonColors(mp, [0.95, 0.92, 1.0, 1], [0.64, 0.58, 0.85, 1], [0.45, 0.80, 1.0, 1]);
    } else if (/SKIN|Face_00/i.test(n)) {
      setMToonColors(mp, [1.0, 0.98, 0.97, 1], [0.94, 0.80, 0.82, 1]);
    }
  },
});

// 5. QIONGHUA DISCIPLE & CULTIVATOR (琼华派执剑弟子/御剑修士 — Snow-White & Ice-Cyan Qionghua Sect Uniform)
await processVrm('/tmp/Sakurada_Fumiriya.vrm', 'disciple.vrm', {
  transformImage(pipe, tags) {
    if (/Tops_01/i.test(tags)) {
      return pipe.linear([2.35, 2.55, 2.75], [52, 68, 86]);
    }
    if (/Bottoms_01/i.test(tags)) {
      return pipe.linear([2.2, 2.6, 3.1], [35, 58, 82]);
    }
    if (/AccessoryNeck/i.test(tags)) {
      // Turn red collar accent into Qionghua Ice-Cyan!
      return pipe.modulate({ hue: 195, saturation: 0.85, brightness: 1.35 });
    }
    if (/Hair/i.test(tags)) {
      return pipe.modulate({ saturation: 0.08 });
    }
    return pipe;
  },
  tuneMToon(mp) {
    const n = mp.name || '';
    if (/Hair/i.test(n)) {
      setMToonColors(mp, [0.18, 0.20, 0.25, 1], [0.09, 0.11, 0.16, 1], [0.32, 0.68, 0.92, 1]);
    } else if (/Tops_01|Bottoms_01|AccessoryNeck/i.test(n)) {
      setMToonColors(mp, [0.92, 0.98, 1.0, 1], [0.56, 0.72, 0.86, 1], [0.35, 0.78, 1.0, 1]);
    } else if (/SKIN|Face_00/i.test(n)) {
      setMToonColors(mp, [1.0, 0.97, 0.95, 1], [0.92, 0.76, 0.72, 1]);
    }
  },
});

// Also compress weapon GLBs (katana_base.glb, potion.glb, scabbard.glb)
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const wFile of ['katana_base.glb', 'potion.glb', 'scabbard.glb']) {
  const wp = path.resolve('public/assets/models/weapons', wFile);
  if (fs.existsSync(wp)) {
    const doc = await io.read(wp);
    await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 86 }));
    await io.write(wp, doc);
    console.log(`Compressed weapon ${wFile}: ${(fs.statSync(wp).size / 1024).toFixed(0)} KB`);
  }
}
