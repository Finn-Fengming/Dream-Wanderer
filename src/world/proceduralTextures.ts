import * as THREE from 'three';

export interface QionghuaTextureSet {
  jadeTileMap: THREE.CanvasTexture;
  jadeTileBump: THREE.CanvasTexture;
  jadeTileRoughness: THREE.CanvasTexture;
  taijiFloorMap: THREE.CanvasTexture;
  taijiFloorBump: THREE.CanvasTexture;
  taijiEmissiveMap: THREE.CanvasTexture;
  pillarMap: THREE.CanvasTexture;
  pillarBump: THREE.CanvasTexture;
  snowflakeTex: THREE.CanvasTexture;
  softGlowTex: THREE.CanvasTexture;
  runeRingTex: THREE.CanvasTexture;
}

function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function buildProceduralTextures(): QionghuaTextureSet {
  const rand = seededRand(20070801); // PAL4 release date tribute :)

  // 1. Snow-dusted Qionghua White-Jade Flagstone Tile (Color + Bump + Roughness)
  const tileSize = 512;
  const cColor = document.createElement('canvas');
  const cBump = document.createElement('canvas');
  const cRough = document.createElement('canvas');
  cColor.width = cBump.width = cRough.width = tileSize;
  cColor.height = cBump.height = cRough.height = tileSize;

  const ctxC = cColor.getContext('2d')!;
  const ctxB = cBump.getContext('2d')!;
  const ctxR = cRough.getContext('2d')!;

  // Base cold jade-marble tone
  ctxC.fillStyle = '#bccad4';
  ctxC.fillRect(0, 0, tileSize, tileSize);
  ctxB.fillStyle = '#c8c8c8';
  ctxB.fillRect(0, 0, tileSize, tileSize);
  ctxR.fillStyle = '#686868';
  ctxR.fillRect(0, 0, tileSize, tileSize);

  // Subtle mineral clouding & frost patches
  for (let i = 0; i < 240; i++) {
    const x = rand() * tileSize;
    const y = rand() * tileSize;
    const r = 16 + rand() * 58;
    const isSnow = rand() > 0.56;
    const gradC = ctxC.createRadialGradient(x, y, 2, x, y, r);
    if (isSnow) {
      gradC.addColorStop(0, 'rgba(238, 246, 252, 0.34)');
      gradC.addColorStop(1, 'rgba(238, 246, 252, 0)');
    } else {
      gradC.addColorStop(0, 'rgba(116, 146, 166, 0.22)');
      gradC.addColorStop(1, 'rgba(116, 146, 166, 0)');
    }
    ctxC.fillStyle = gradC;
    ctxC.fillRect(x - r, y - r, r * 2, r * 2);

    // Icy glaze vs powdery snow roughness variation
    const gradR = ctxR.createRadialGradient(x, y, 2, x, y, r);
    gradR.addColorStop(0, isSnow ? 'rgba(225,225,225,0.42)' : 'rgba(32,32,32,0.45)');
    gradR.addColorStop(1, 'rgba(128,128,128,0)');
    ctxR.fillStyle = gradR;
    ctxR.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Carved stone block seams (4x4 staggered courses)
  const rows = 4;
  const rowH = tileSize / rows;
  ctxC.strokeStyle = 'rgba(58, 76, 92, 0.65)';
  ctxC.lineWidth = 3;
  ctxB.strokeStyle = '#222222';
  ctxB.lineWidth = 5;
  ctxR.strokeStyle = '#dcdcdc';
  ctxR.lineWidth = 5;

  for (let r = 0; r < rows; r++) {
    const y = r * rowH;
    ctxC.beginPath();
    ctxC.moveTo(0, y);
    ctxC.lineTo(tileSize, y);
    ctxC.stroke();

    ctxB.beginPath();
    ctxB.moveTo(0, y);
    ctxB.lineTo(tileSize, y);
    ctxB.stroke();

    ctxR.beginPath();
    ctxR.moveTo(0, y);
    ctxR.lineTo(tileSize, y);
    ctxR.stroke();

    const offset = (r % 2) * (tileSize / 4);
    for (let c = 0; c < 2; c++) {
      const x = (offset + c * (tileSize / 2)) % tileSize;
      ctxC.beginPath();
      ctxC.moveTo(x, y);
      ctxC.lineTo(x, y + rowH);
      ctxC.stroke();

      ctxB.beginPath();
      ctxB.moveTo(x, y);
      ctxB.lineTo(x, y + rowH);
      ctxB.stroke();
    }
  }

  // Inner carved border bevels on each slab
  ctxC.strokeStyle = 'rgba(225, 240, 248, 0.25)';
  ctxC.lineWidth = 1.5;
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (tileSize / 4);
    for (let c = 0; c < 2; c++) {
      const x = (offset + c * (tileSize / 2)) % tileSize;
      ctxC.strokeRect(x + 8, r * rowH + 8, tileSize / 2 - 16, rowH - 16);
    }
  }

  const wrapRepeat = (canvas: HTMLCanvasElement, srgb = false, repX = 6, repY = 6) => {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repX, repY);
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };

  // 2. Juanyun Summit Grand Taiji & Bagua Jade Platform Texture (1024x1024)
  const tjSize = 1024;
  const cTj = document.createElement('canvas');
  const cTjBump = document.createElement('canvas');
  const cTjEmis = document.createElement('canvas');
  cTj.width = cTjBump.width = cTjEmis.width = tjSize;
  cTj.height = cTjBump.height = cTjEmis.height = tjSize;

  const tjC = cTj.getContext('2d')!;
  const tjB = cTjBump.getContext('2d')!;
  const tjE = cTjEmis.getContext('2d')!;

  const cx = tjSize / 2;
  const cy = tjSize / 2;

  // Radial white-jade stone base
  const radBg = tjC.createRadialGradient(cx, cy, 40, cx, cy, tjSize * 0.5);
  radBg.addColorStop(0, '#c8d6df');
  radBg.addColorStop(0.65, '#9cb0bf');
  radBg.addColorStop(1, '#6f8394');
  tjC.fillStyle = radBg;
  tjC.fillRect(0, 0, tjSize, tjSize);

  tjB.fillStyle = '#b8b8b8';
  tjB.fillRect(0, 0, tjSize, tjSize);
  tjE.fillStyle = '#000000';
  tjE.fillRect(0, 0, tjSize, tjSize);

  // Concentric immortal rings + radial stone segments
  const radii = [120, 210, 320, 430, 488];
  for (const rad of radii) {
    tjC.strokeStyle = 'rgba(216, 182, 118, 0.62)';
    tjC.lineWidth = rad === 210 || rad === 430 ? 6 : 3;
    tjC.beginPath();
    tjC.arc(cx, cy, rad, 0, Math.PI * 2);
    tjC.stroke();

    tjB.strokeStyle = '#383838';
    tjB.lineWidth = 6;
    tjB.beginPath();
    tjB.arc(cx, cy, rad, 0, Math.PI * 2);
    tjB.stroke();
  }

  // 24 radial masonry lines
  tjC.strokeStyle = 'rgba(54, 72, 88, 0.45)';
  tjC.lineWidth = 2;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    tjC.beginPath();
    tjC.moveTo(cx + Math.cos(a) * 120, cy + Math.sin(a) * 120);
    tjC.lineTo(cx + Math.cos(a) * 488, cy + Math.sin(a) * 488);
    tjC.stroke();
  }

  // Eight Trigrams (Bagua 八卦爻纹) around middle ring (220..305)
  const trigrams = [
    [1, 1, 1],
    [0, 1, 1],
    [1, 0, 1],
    [0, 0, 1],
    [1, 1, 0],
    [0, 1, 0],
    [1, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    tjC.save();
    tjC.translate(cx, cy);
    tjC.rotate(ang);
    tjC.fillStyle = 'rgba(218, 184, 116, 0.72)';
    tjE.save();
    tjE.translate(cx, cy);
    tjE.rotate(ang);
    tjE.fillStyle = i % 2 === 0 ? 'rgba(90, 195, 255, 0.45)' : 'rgba(255, 112, 62, 0.48)';

    for (let bar = 0; bar < 3; bar++) {
      const yOff = -242 - bar * 20;
      if (trigrams[i][bar] === 1) {
        tjC.fillRect(-38, yOff, 76, 9);
        tjE.fillRect(-38, yOff, 76, 9);
      } else {
        tjC.fillRect(-38, yOff, 32, 9);
        tjC.fillRect(6, yOff, 32, 9);
        tjE.fillRect(-38, yOff, 32, 9);
        tjE.fillRect(6, yOff, 32, 9);
      }
    }
    tjC.restore();
    tjE.restore();
  }

  // Central Yin-Yang (Wangshu Cyan Ice vs Xihe Crimson Flame)
  const yyR = 116;
  tjC.save();
  tjC.beginPath();
  tjC.arc(cx, cy, yyR, 0, Math.PI * 2);
  tjC.clip();

  tjC.fillStyle = '#365872';
  tjC.fillRect(cx - yyR, cy - yyR, yyR * 2, yyR * 2);

  tjC.fillStyle = '#d8e4ec';
  tjC.beginPath();
  tjC.arc(cx, cy, yyR, -Math.PI * 0.5, Math.PI * 0.5);
  tjC.arc(cx, cy + yyR * 0.5, yyR * 0.5, Math.PI * 0.5, -Math.PI * 0.5, true);
  tjC.arc(cx, cy - yyR * 0.5, yyR * 0.5, Math.PI * 0.5, -Math.PI * 0.5, false);
  tjC.closePath();
  tjC.fill();

  // Yin-Yang glowing eyes (Ice & Fire)
  tjE.fillStyle = '#5ad0ff';
  tjE.beginPath();
  tjE.arc(cx, cy - yyR * 0.5, 16, 0, Math.PI * 2);
  tjE.fill();

  tjE.fillStyle = '#ff6a3d';
  tjE.beginPath();
  tjE.arc(cx, cy + yyR * 0.5, 16, 0, Math.PI * 2);
  tjE.fill();
  tjC.restore();

  // Battle-scarred glowing magma cracks across the outer ring
  tjE.strokeStyle = 'rgba(255, 96, 42, 0.72)';
  tjE.lineWidth = 3;
  for (let c = 0; c < 12; c++) {
    let a = (c / 12) * Math.PI * 2 + rand() * 0.25;
    let r = 135 + rand() * 60;
    tjE.beginPath();
    tjE.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    for (let s = 0; s < 7; s++) {
      r += 34 + rand() * 24;
      a += (rand() - 0.5) * 0.16;
      tjE.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    tjE.stroke();
  }

  const taijiFloorMap = new THREE.CanvasTexture(cTj);
  taijiFloorMap.colorSpace = THREE.SRGBColorSpace;
  taijiFloorMap.anisotropy = 8;
  const taijiFloorBump = new THREE.CanvasTexture(cTjBump);
  const taijiEmissiveMap = new THREE.CanvasTexture(cTjEmis);
  taijiEmissiveMap.colorSpace = THREE.SRGBColorSpace;

  // 3. Fluted Stone Pillar Texture
  const cPil = document.createElement('canvas');
  const cPilB = document.createElement('canvas');
  cPil.width = cPilB.width = 256;
  cPil.height = cPilB.height = 512;
  const pC = cPil.getContext('2d')!;
  const pB = cPilB.getContext('2d')!;

  const pGrad = pC.createLinearGradient(0, 0, 0, 512);
  pGrad.addColorStop(0, '#728698');
  pGrad.addColorStop(0.75, '#8fa3b4');
  pGrad.addColorStop(1, '#dcebf5'); // Snow rime at bottom
  pC.fillStyle = pGrad;
  pC.fillRect(0, 0, 256, 512);

  pB.fillStyle = '#909090';
  pB.fillRect(0, 0, 256, 512);

  for (let x = 0; x < 256; x += 16) {
    pC.fillStyle = 'rgba(35, 50, 66, 0.22)';
    pC.fillRect(x, 0, 4, 512);
    pB.fillStyle = '#404040';
    pB.fillRect(x, 0, 5, 512);
  }
  // Golden immortal band rings
  pC.fillStyle = '#c5a059';
  pC.fillRect(0, 46, 256, 18);
  pC.fillRect(0, 440, 256, 16);

  // 4. Soft Snowflake & Glow Sprite Textures
  const cSnow = document.createElement('canvas');
  cSnow.width = cSnow.height = 64;
  const sCtx = cSnow.getContext('2d')!;
  const sGrad = sCtx.createRadialGradient(32, 32, 1, 32, 32, 30);
  sGrad.addColorStop(0, 'rgba(255,255,255,1)');
  sGrad.addColorStop(0.4, 'rgba(220,242,255,0.65)');
  sGrad.addColorStop(1, 'rgba(200,235,255,0)');
  sCtx.fillStyle = sGrad;
  sCtx.fillRect(0, 0, 64, 64);

  const cGlow = document.createElement('canvas');
  cGlow.width = cGlow.height = 128;
  const gCtx = cGlow.getContext('2d')!;
  const gGrad = gCtx.createRadialGradient(64, 64, 2, 64, 64, 62);
  gGrad.addColorStop(0, 'rgba(255,255,255,1)');
  gGrad.addColorStop(0.28, 'rgba(255,255,255,0.52)');
  gGrad.addColorStop(1, 'rgba(255,255,255,0)');
  gCtx.fillStyle = gGrad;
  gCtx.fillRect(0, 0, 128, 128);

  // 5. Golden Sword-Array Magic Circle Texture (for Spirit Veins, Fog Gate & Boss AoE Warnings)
  const cRune = document.createElement('canvas');
  cRune.width = cRune.height = 512;
  const rCtx = cRune.getContext('2d')!;
  rCtx.strokeStyle = '#ffffff';
  rCtx.lineWidth = 4;
  rCtx.beginPath();
  rCtx.arc(256, 256, 236, 0, Math.PI * 2);
  rCtx.stroke();
  rCtx.lineWidth = 2;
  rCtx.beginPath();
  rCtx.arc(256, 256, 206, 0, Math.PI * 2);
  rCtx.stroke();
  rCtx.beginPath();
  rCtx.arc(256, 256, 136, 0, Math.PI * 2);
  rCtx.stroke();
  // Octagram star
  for (let offset = 0; offset < 2; offset++) {
    rCtx.beginPath();
    for (let i = 0; i <= 4; i++) {
      const a = (i / 4) * Math.PI * 2 + offset * (Math.PI / 4);
      const px = 256 + Math.cos(a) * 206;
      const py = 256 + Math.sin(a) * 206;
      if (i === 0) rCtx.moveTo(px, py);
      else rCtx.lineTo(px, py);
    }
    rCtx.stroke();
  }

  return {
    jadeTileMap: wrapRepeat(cColor, true, 6, 6),
    jadeTileBump: wrapRepeat(cBump, false, 6, 6),
    jadeTileRoughness: wrapRepeat(cRough, false, 6, 6),
    taijiFloorMap,
    taijiFloorBump,
    taijiEmissiveMap,
    pillarMap: wrapRepeat(cPil, true, 2, 1),
    pillarBump: wrapRepeat(cPilB, false, 2, 1),
    snowflakeTex: new THREE.CanvasTexture(cSnow),
    softGlowTex: new THREE.CanvasTexture(cGlow),
    runeRingTex: new THREE.CanvasTexture(cRune),
  };
}
