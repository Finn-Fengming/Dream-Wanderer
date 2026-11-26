import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const PUB = path.join(ROOT, 'public/assets');
const UA = 'DreamWanderer/4.0 (https://github.com/Finn-Fengming/Dream-Wanderer)';

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function fetchBuf(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, 800 * attempt));
    }
  }
}

async function downloadFile(url, destPath) {
  try {
    const st = await fs.stat(destPath);
    if (st.size > 1024) {
      console.log(`  [skip existing] ${path.relative(ROOT, destPath)} (${(st.size / 1024).toFixed(0)} KB)`);
      return;
    }
  } catch {}
  await ensureDir(path.dirname(destPath));
  const buf = await fetchBuf(url);
  await fs.writeFile(destPath, buf);
  console.log(`  [ok] ${path.relative(ROOT, destPath)} (${(buf.length / 1024).toFixed(0)} KB)`);
}

/**
 * Downloads a PolyHaven 3D model (`.gltf` + `.bin` + included `1k` textures) and packs
 * everything into a single self-contained binary `.glb` file!
 */
async function downloadPolyHavenModelAsGlb(assetId, outGlbPath, res = '1k') {
  try {
    const st = await fs.stat(outGlbPath);
    if (st.size > 4096) {
      console.log(`  [skip existing glb] ${path.relative(ROOT, outGlbPath)} (${(st.size / 1024).toFixed(0)} KB)`);
      return;
    }
  } catch {}

  const metaBuf = await fetchBuf(`https://api.polyhaven.com/files/${assetId}`);
  const meta = JSON.parse(metaBuf.toString('utf8'));
  const gltfGroup = meta?.gltf?.[res]?.gltf ?? meta?.gltf?.['2k']?.gltf;
  if (!gltfGroup?.url) {
    console.warn(`  [warn] No glTF entry found for PolyHaven model ${assetId}`);
    return;
  }

  const gltfJsonBuf = await fetchBuf(gltfGroup.url);
  const gltf = JSON.parse(gltfJsonBuf.toString('utf8'));
  const include = gltfGroup.include || {};

  // Collect binary chunks: first original buffers, then embedded images
  const chunks = [];
  let totalBinLen = 0;
  const align4 = (n) => (n + 3) & ~3;

  // 1. Resolve external .bin buffers
  const origBuffers = gltf.buffers || [];
  const bufferOffsets = [];
  for (const b of origBuffers) {
    const incEntry = include[b.uri] || Object.values(include).find((v) => v.url.endsWith(b.uri));
    const binUrl = incEntry ? incEntry.url : new URL(b.uri, gltfGroup.url).href;
    const data = await fetchBuf(binUrl);
    const paddedLen = align4(data.length);
    const padded = Buffer.alloc(paddedLen);
    data.copy(padded);
    bufferOffsets.push({ offset: totalBinLen, length: data.length });
    chunks.push(padded);
    totalBinLen += paddedLen;
  }

  // Update bufferViews if multiple buffers existed (usually 1)
  if (gltf.bufferViews) {
    for (const bv of gltf.bufferViews) {
      const bIdx = bv.buffer || 0;
      bv.byteOffset = (bv.byteOffset || 0) + (bufferOffsets[bIdx]?.offset || 0);
      bv.buffer = 0;
    }
  }
  gltf.bufferViews = gltf.bufferViews || [];

  // 2. Embed external texture images into binary bufferViews
  if (gltf.images) {
    for (const img of gltf.images) {
      if (!img.uri || img.uri.startsWith('data:')) continue;
      const normUri = img.uri.replace(/^\.\//, '');
      const incEntry =
        include[normUri] ||
        Object.entries(include).find(([k]) => k.endsWith(path.basename(normUri)))?.[1];
      const imgUrl = incEntry ? incEntry.url : new URL(normUri, gltfGroup.url).href;
      const imgData = await fetchBuf(imgUrl);

      const bvIndex = gltf.bufferViews.length;
      gltf.bufferViews.push({
        buffer: 0,
        byteOffset: totalBinLen,
        byteLength: imgData.length,
      });

      const ext = path.extname(normUri).toLowerCase();
      img.bufferView = bvIndex;
      img.mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      delete img.uri;

      const paddedLen = align4(imgData.length);
      const padded = Buffer.alloc(paddedLen);
      imgData.copy(padded);
      chunks.push(padded);
      totalBinLen += paddedLen;
    }
  }

  gltf.buffers = [{ byteLength: totalBinLen }];

  // 3. Assemble GLB 2.0 container
  const jsonRaw = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonPaddedLen = align4(jsonRaw.length);
  const jsonChunk = Buffer.alloc(jsonPaddedLen, 0x20); // pad JSON with spaces
  jsonRaw.copy(jsonChunk);

  const binChunk = Buffer.concat(chunks, totalBinLen);
  const totalGlbLen = 12 + 8 + jsonPaddedLen + 8 + totalBinLen;

  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // 'glTF'
  header.writeUInt32LE(2, 4); // version 2
  header.writeUInt32LE(totalGlbLen, 8);

  const jsonHdr = Buffer.alloc(8);
  jsonHdr.writeUInt32LE(jsonPaddedLen, 0);
  jsonHdr.writeUInt32LE(0x4e4f534a, 4); // 'JSON'

  const binHdr = Buffer.alloc(8);
  binHdr.writeUInt32LE(totalBinLen, 0);
  binHdr.writeUInt32LE(0x004e4942, 4); // 'BIN\0'

  await ensureDir(path.dirname(outGlbPath));
  await fs.writeFile(outGlbPath, Buffer.concat([header, jsonHdr, jsonChunk, binHdr, binChunk]));
  console.log(`  [packed glb] ${path.relative(ROOT, outGlbPath)} (${(totalGlbLen / 1024).toFixed(0)} KB)`);
}

async function downloadPolyHavenTexture2k(texId, localPrefix) {
  const metaBuf = await fetchBuf(`https://api.polyhaven.com/files/${texId}`);
  const meta = JSON.parse(metaBuf.toString('utf8'));
  const pickUrl = (slot) => {
    const s = meta[slot]?.['2k'] ?? meta[slot]?.['1k'];
    if (!s) return null;
    return s.jpg?.url ?? s.png?.url ?? null;
  };
  const slots = [
    ['Diffuse', 'color'],
    ['nor_gl', 'normal'],
    ['Rough', 'roughness'],
    ['AO', 'ao'],
  ];
  for (const [phSlot, suffix] of slots) {
    const url = pickUrl(phSlot);
    if (url) {
      const ext = url.endsWith('.png') ? 'png' : 'jpg';
      await downloadFile(url, path.join(PUB, `textures/pbr_2k/${localPrefix}_${suffix}.${ext}`));
    }
  }
}

async function main() {
  console.log('=== 1. Downloading PolyHaven 2K HDRI & 2K 4-Channel PBR Material Sets (CC0) ===');
  await downloadFile(
    'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/kloppenheim_02_puresky_2k.hdr',
    path.join(PUB, 'hdri/kunlun_moonlit_2k.hdr')
  );

  const pbrSets = [
    ['slate_driveway', 'slate_flagstone'],
    ['stone_tile_wall', 'ashlar_stone'],
    ['rock_face_03', 'kunlun_cliff'],
    ['snow_02', 'alpine_snow'],
    ['grey_roof_tiles', 'ceramic_tile'],
    ['dark_wood', 'palace_wood'],
    ['marble_01', 'white_jade'],
  ];
  for (const [phId, localName] of pbrSets) {
    await downloadPolyHavenTexture2k(phId, localName);
  }

  console.log('=== 2. Downloading & Packing PolyHaven CC0 3D Props, Cliffs, Foliage & Weapons ===');
  const phModels = [
    ['chinese_chandelier', 'models/env/chinese_chandelier.glb', '1k'],
    ['wooden_lantern_01', 'models/env/wooden_lantern.glb', '1k'],
    ['brass_vase_02', 'models/env/bronze_censer.glb', '1k'],
    ['brass_vase_03', 'models/env/ritual_urn.glb', '1k'],
    ['rock_face_01', 'models/env/rock_face_01.glb', '1k'],
    ['rock_07', 'models/env/alpine_rock_07.glb', '1k'],
    ['fern_02', 'models/env/alpine_fern.glb', '1k'],
    ['shrub_03', 'models/env/mountain_shrub.glb', '1k'],
    ['pine_roots', 'models/env/pine_roots.glb', '1k'],
    ['antique_katana_01', 'models/weapons/antique_katana.glb', '1k'],
  ];
  for (const [id, relOut, res] of phModels) {
    await downloadPolyHavenModelAsGlb(id, path.join(PUB, relOut), res);
  }

  console.log('=== 3. Downloading Quaternius CC0 46-Clip RPG Animation Library & Rotten-Souls MIT Assets ===');
  const rsBase = 'https://raw.githubusercontent.com/igorjohn/rotten-souls/main/public/assets';
  await downloadFile(`${rsBase}/models/personagem-cc0.glb`, path.join(PUB, 'models/characters/ual_46_anims.glb'));
  await downloadFile(`${rsBase}/models/vharen.glb`, path.join(PUB, 'models/characters/warlord_vharen.glb'));

  const armorFolders = ['aco-lamina', 'aco-placa', 'couro', 'latao', 'malha-ferro', 'tecido'];
  for (const folder of armorFolders) {
    for (const map of ['color', 'normal', 'roughness', 'ao']) {
      await downloadFile(
        `${rsBase}/textures/materiais/${folder}/${map}.webp`,
        path.join(PUB, `textures/armor/${folder}/${map}.webp`)
      );
    }
  }

  for (let i = 1; i <= 9; i++) {
    const n = String(i).padStart(2, '0');
    await downloadFile(`${rsBase}/audio/swings/swing-${n}.mp3`, path.join(PUB, `audio/sfx/swing-${n}.mp3`));
  }
  await downloadFile(`${rsBase}/audio/cues/portao-stinger.mp3`, path.join(PUB, 'audio/sfx/fog-stinger.mp3'));
  await downloadFile(`${rsBase}/audio/cues/morte.mp3`, path.join(PUB, 'audio/sfx/death-stinger.mp3'));
  await downloadFile(`${rsBase}/audio/cues/vitoria.mp3`, path.join(PUB, 'audio/sfx/victory-stinger.mp3'));

  console.log('=== 4. Downloading Full MIT Multi-Material Samurai Palette & Extra Mocap Clips ===');
  const samBase = 'https://raw.githubusercontent.com/achrefelouafi/SamuraiThirdPersonTemplateThreeJS/main/public';
  await downloadFile(`${samBase}/models/textures.glb`, path.join(PUB, 'models/characters/guardian_palette_full.glb'));
  await downloadFile(`${samBase}/models/weapons/sword.glb`, path.join(PUB, 'models/weapons/forged_sword.glb'));
  await downloadFile(`${samBase}/animations/Crouch.fbx`, path.join(PUB, 'animations/crouch.fbx'));
  await downloadFile(`${samBase}/animations/Crouch%20walk.fbx`, path.join(PUB, 'animations/crouch_walk.fbx'));

  console.log('=== ALL V4.0 HIGH-RES ASSETS DOWNLOADED SUCCESSFULLY ===');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
