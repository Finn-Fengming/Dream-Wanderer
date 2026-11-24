import * as THREE from 'three';
import { gameAssets } from '../assets/assetLoader';

export interface QionghuaTextureSet {
  jadeTileMap: THREE.Texture;
  jadeTileBump: THREE.Texture;
  jadeTileRoughness: THREE.Texture;
  taijiFloorMap: THREE.CanvasTexture;
  taijiFloorBump: THREE.CanvasTexture;
  taijiEmissiveMap: THREE.CanvasTexture;
  pillarMap: THREE.Texture;
  pillarBump: THREE.Texture;
  snowflakeTex: THREE.CanvasTexture;
  softGlowTex: THREE.CanvasTexture;
  runeRingTex: THREE.CanvasTexture;
  contactShadowTex: THREE.CanvasTexture;
}

function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

let cachedContactShadowTex: THREE.CanvasTexture | null = null;
export function getContactShadowTexture(): THREE.CanvasTexture {
  if (cachedContactShadowTex) return cachedContactShadowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 60);
  g.addColorStop(0, 'rgba(8, 16, 28, 0.58)');
  g.addColorStop(0.48, 'rgba(12, 22, 36, 0.28)');
  g.addColorStop(1, 'rgba(12, 22, 36, 0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  cachedContactShadowTex = new THREE.CanvasTexture(c);
  return cachedContactShadowTex;
}

export function buildProceduralTextures(): QionghuaTextureSet {
  const rand = seededRand(20070801);

  // 1. High-Resolution 2048x2048 Gold-Inlaid Kunlun White-Jade Taiji & Bagua Medallion
  //    Composited directly over real PolyHaven `jade_marble` photogrammetry!
  const tjSize = 2048;
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

  // Base luminous jade gradient
  const radBg = tjC.createRadialGradient(cx, cy, 80, cx, cy, tjSize * 0.5);
  radBg.addColorStop(0, '#eef6fa');
  radBg.addColorStop(0.62, '#d4e4ee');
  radBg.addColorStop(1, '#abc2d2');
  tjC.fillStyle = radBg;
  tjC.fillRect(0, 0, tjSize, tjSize);

  // Tile real photogrammetry marble veins across the 2048px medallion!
  const marbleImg = gameAssets.pbr?.jadeMarble?.color?.image as CanvasImageSource | undefined;
  if (marbleImg) {
    tjC.save();
    tjC.globalAlpha = 0.58;
    for (let gx = 0; gx < 2; gx++) {
      for (let gy = 0; gy < 2; gy++) {
        tjC.drawImage(marbleImg, gx * 1024, gy * 1024, 1024, 1024);
      }
    }
    tjC.restore();
  }

  tjB.fillStyle = '#bcbcbc';
  tjB.fillRect(0, 0, tjSize, tjSize);
  tjE.fillStyle = '#000000';
  tjE.fillRect(0, 0, tjSize, tjSize);

  // Concentric Gold-Inlaid Jade Rings
  const radii = [245, 430, 650, 875, 980];
  for (const rad of radii) {
    tjC.strokeStyle = 'rgba(214, 174, 96, 0.88)';
    tjC.lineWidth = rad === 430 || rad === 875 ? 11 : 6;
    tjC.beginPath();
    tjC.arc(cx, cy, rad, 0, Math.PI * 2);
    tjC.stroke();

    tjB.strokeStyle = '#303030';
    tjB.lineWidth = 10;
    tjB.beginPath();
    tjB.arc(cx, cy, rad, 0, Math.PI * 2);
    tjB.stroke();
  }

  // 32 Radial Carved Jade Slab Seams + Subtle Gold Fret Dots
  tjC.strokeStyle = 'rgba(72, 98, 118, 0.36)';
  tjC.lineWidth = 3;
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    tjC.beginPath();
    tjC.moveTo(cx + Math.cos(a) * 245, cy + Math.sin(a) * 245);
    tjC.lineTo(cx + Math.cos(a) * 980, cy + Math.sin(a) * 980);
    tjC.stroke();

    tjB.strokeStyle = '#505050';
    tjB.lineWidth = 4;
    tjB.beginPath();
    tjB.moveTo(cx + Math.cos(a) * 245, cy + Math.sin(a) * 245);
    tjB.lineTo(cx + Math.cos(a) * 980, cy + Math.sin(a) * 980);
    tjB.stroke();
  }

  // Eight Trigrams (Bagua 八卦金镶爻纹) around middle ring (470..615)
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
    tjC.fillStyle = '#d8ae5e';
    tjC.strokeStyle = '#7d5b21';
    tjC.lineWidth = 2.5;

    tjE.save();
    tjE.translate(cx, cy);
    tjE.rotate(ang);
    tjE.fillStyle = i % 2 === 0 ? 'rgba(80, 205, 255, 0.55)' : 'rgba(255, 115, 58, 0.55)';

    for (let bar = 0; bar < 3; bar++) {
      const yOff = -492 - bar * 42;
      if (trigrams[i][bar] === 1) {
        tjC.fillRect(-82, yOff, 164, 18);
        tjC.strokeRect(-82, yOff, 164, 18);
        tjE.fillRect(-82, yOff, 164, 18);
      } else {
        tjC.fillRect(-82, yOff, 68, 18);
        tjC.strokeRect(-82, yOff, 68, 18);
        tjC.fillRect(14, yOff, 68, 18);
        tjC.strokeRect(14, yOff, 68, 18);
        tjE.fillRect(-82, yOff, 68, 18);
        tjE.fillRect(14, yOff, 68, 18);
      }
    }
    tjC.restore();
    tjE.restore();
  }

  // Central Yin-Yang (Wangshu Ice-Sapphire Jade vs Snow-White Kunlun Jade)
  const yyR = 238;
  tjC.save();
  tjC.beginPath();
  tjC.arc(cx, cy, yyR, 0, Math.PI * 2);
  tjC.clip();

  tjC.fillStyle = '#2d5775';
  tjC.fillRect(cx - yyR, cy - yyR, yyR * 2, yyR * 2);

  tjC.fillStyle = '#f2f7fb';
  tjC.beginPath();
  tjC.arc(cx, cy, yyR, -Math.PI * 0.5, Math.PI * 0.5);
  tjC.arc(cx, cy + yyR * 0.5, yyR * 0.5, Math.PI * 0.5, -Math.PI * 0.5, true);
  tjC.arc(cx, cy - yyR * 0.5, yyR * 0.5, Math.PI * 0.5, -Math.PI * 0.5, false);
  tjC.closePath();
  tjC.fill();

  // Golden S-curve divider
  tjC.strokeStyle = '#dfb564';
  tjC.lineWidth = 7;
  tjC.stroke();

  // Yin-Yang glowing spirit cores (Wangshu Frost & Xihe Flame)
  tjC.fillStyle = '#6fe0ff';
  tjC.beginPath();
  tjC.arc(cx, cy - yyR * 0.5, 30, 0, Math.PI * 2);
  tjC.fill();

  tjC.fillStyle = '#ff7847';
  tjC.beginPath();
  tjC.arc(cx, cy + yyR * 0.5, 30, 0, Math.PI * 2);
  tjC.fill();

  tjE.fillStyle = '#66dcff';
  tjE.beginPath();
  tjE.arc(cx, cy - yyR * 0.5, 30, 0, Math.PI * 2);
  tjE.fill();

  tjE.fillStyle = '#ff6e3a';
  tjE.beginPath();
  tjE.arc(cx, cy + yyR * 0.5, 30, 0, Math.PI * 2);
  tjE.fill();
  tjC.restore();

  // Subtle Sword-Qi & Xihe Spirit Channels across outer ring
  for (let c = 0; c < 16; c++) {
    let a = (c / 16) * Math.PI * 2 + rand() * 0.2;
    let r = 270 + rand() * 90;
    tjE.strokeStyle = c % 2 === 0 ? 'rgba(92, 212, 255, 0.42)' : 'rgba(255, 102, 48, 0.52)';
    tjE.lineWidth = 4.5;
    tjE.beginPath();
    tjE.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    for (let s = 0; s < 7; s++) {
      r += 72 + rand() * 44;
      a += (rand() - 0.5) * 0.14;
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

  // 2. Crisp 6-Pointed Crystalline Snowflake Sprite
  const cSnow = document.createElement('canvas');
  cSnow.width = cSnow.height = 128;
  const sCtx = cSnow.getContext('2d')!;
  const sGrad = sCtx.createRadialGradient(64, 64, 2, 64, 64, 58);
  sGrad.addColorStop(0, 'rgba(255,255,255,1)');
  sGrad.addColorStop(0.35, 'rgba(225,245,255,0.72)');
  sGrad.addColorStop(1, 'rgba(200,235,255,0)');
  sCtx.fillStyle = sGrad;
  sCtx.fillRect(0, 0, 128, 128);
  sCtx.strokeStyle = 'rgba(255,255,255,0.9)';
  sCtx.lineWidth = 3;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    sCtx.beginPath();
    sCtx.moveTo(64, 64);
    sCtx.lineTo(64 + Math.cos(a) * 46, 64 + Math.sin(a) * 46);
    sCtx.stroke();
  }

  // 3. Soft Glow Sprite
  const cGlow = document.createElement('canvas');
  cGlow.width = cGlow.height = 128;
  const gCtx = cGlow.getContext('2d')!;
  const gGrad = gCtx.createRadialGradient(64, 64, 2, 64, 64, 62);
  gGrad.addColorStop(0, 'rgba(255,255,255,1)');
  gGrad.addColorStop(0.28, 'rgba(255,255,255,0.52)');
  gGrad.addColorStop(1, 'rgba(255,255,255,0)');
  gCtx.fillStyle = gGrad;
  gCtx.fillRect(0, 0, 128, 128);

  // 4. High-Detail Daoist Sword-Array Magic Circle Texture (1024x1024)
  const cRune = document.createElement('canvas');
  cRune.width = cRune.height = 1024;
  const rCtx = cRune.getContext('2d')!;
  rCtx.strokeStyle = '#ffffff';
  rCtx.lineWidth = 7;
  rCtx.beginPath();
  rCtx.arc(512, 512, 476, 0, Math.PI * 2);
  rCtx.stroke();
  rCtx.lineWidth = 4;
  rCtx.beginPath();
  rCtx.arc(512, 512, 424, 0, Math.PI * 2);
  rCtx.stroke();
  rCtx.beginPath();
  rCtx.arc(512, 512, 290, 0, Math.PI * 2);
  rCtx.stroke();

  // Octagram star + 16 radial sword-glyph ticks
  for (let offset = 0; offset < 2; offset++) {
    rCtx.beginPath();
    for (let i = 0; i <= 4; i++) {
      const a = (i / 4) * Math.PI * 2 + offset * (Math.PI / 4);
      const px = 512 + Math.cos(a) * 424;
      const py = 512 + Math.sin(a) * 424;
      if (i === 0) rCtx.moveTo(px, py);
      else rCtx.lineTo(px, py);
    }
    rCtx.stroke();
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    rCtx.beginPath();
    rCtx.moveTo(512 + Math.cos(a) * 432, 512 + Math.sin(a) * 432);
    rCtx.lineTo(512 + Math.cos(a) * 468, 512 + Math.sin(a) * 468);
    rCtx.stroke();
  }

  return {
    jadeTileMap: gameAssets.pbr.jadeMarble.color,
    jadeTileBump: gameAssets.pbr.jadeMarble.normal,
    jadeTileRoughness: gameAssets.pbr.jadeMarble.roughness,
    taijiFloorMap,
    taijiFloorBump,
    taijiEmissiveMap,
    pillarMap: gameAssets.pbr.stone.color,
    pillarBump: gameAssets.pbr.stone.normal,
    snowflakeTex: new THREE.CanvasTexture(cSnow),
    softGlowTex: new THREE.CanvasTexture(cGlow),
    runeRingTex: new THREE.CanvasTexture(cRune),
    contactShadowTex: getContactShadowTexture(),
  };
}
