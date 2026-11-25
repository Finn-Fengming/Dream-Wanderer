import * as THREE from 'three';
import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';

export type GarmentThemeId = 'tianhe' | 'xuanxiao' | 'mengli' | 'disciple' | 'cultivator';

interface GarmentPalette {
  topUpper: string;
  topMid: string;
  topLower: string;
  skirtUpper: string;
  skirtLower: string;
  hemBand: string;
  trimGold: string;
  collarColor: string;
  sashColor: string;
  jadeColor: string;
  trouserColor: string;
  bootColor: string;
  vestColor?: string;
  furColor?: string;
  cloakUpper?: string;
  cloakLower?: string;
  shadeTint: THREE.Color;
  rimTint: THREE.Color;
  wideSleeveDrop: number; // 0.04 = fitted martial sleeve, 0.24 = flowing immortal wide sleeve
  skirtEndRatio: number;  // 0.48 = knee martial tunic, 0.88 = ankle immortal robe
  isRuqun?: boolean;      // High empire waist for Liu Mengli
}

const GARMENT_PALETTES: Record<GarmentThemeId, GarmentPalette> = {
  tianhe: {
    topUpper: '#468cb8',
    topMid: '#2b6792',
    topLower: '#1b4566',
    skirtUpper: '#2d6894',
    skirtLower: '#153753',
    hemBand: '#dcb66e',
    trimGold: '#ebd08e',
    collarColor: '#f3efe6',
    sashColor: '#482d1b',
    jadeColor: '#66e2d8',
    trouserColor: '#1b2736',
    bootColor: '#342218',
    vestColor: '#6e4528',
    furColor: '#f2eadb',
    shadeTint: new THREE.Color(0.68, 0.76, 0.90),
    rimTint: new THREE.Color(0.32, 0.72, 1.0),
    wideSleeveDrop: 0.04,
    skirtEndRatio: 0.48,
  },
  xuanxiao: {
    topUpper: '#f5efe8',
    topMid: '#be2428',
    topLower: '#7d1216',
    skirtUpper: '#ab1d21',
    skirtLower: '#46090d',
    hemBand: '#ecc062',
    trimGold: '#f5cf78',
    collarColor: '#f7f1e6',
    sashColor: '#291013',
    jadeColor: '#ff6a2b',
    trouserColor: '#1b161d',
    bootColor: '#24181b',
    cloakUpper: '#a21a1e',
    cloakLower: '#38070a',
    shadeTint: new THREE.Color(0.74, 0.62, 0.66),
    rimTint: new THREE.Color(0.95, 0.36, 0.16),
    wideSleeveDrop: 0.24,
    skirtEndRatio: 0.86,
  },
  mengli: {
    topUpper: '#f2f7fd',
    topMid: '#d8caf6',
    topLower: '#a188de',
    skirtUpper: '#e2d7fb',
    skirtLower: '#5e429c',
    hemBand: '#9ee9ff',
    trimGold: '#d2f4ff',
    collarColor: '#f8f6ff',
    sashColor: '#765cb8',
    jadeColor: '#8cf0ff',
    trouserColor: '#463272',
    bootColor: '#523c84',
    shadeTint: new THREE.Color(0.78, 0.72, 0.92),
    rimTint: new THREE.Color(0.55, 0.82, 1.0),
    wideSleeveDrop: 0.23,
    skirtEndRatio: 0.88,
    isRuqun: true,
  },
  disciple: {
    topUpper: '#f2f8fd',
    topMid: '#cde3f3',
    topLower: '#84b5d4',
    skirtUpper: '#d4e8f6',
    skirtLower: '#2f6d94',
    hemBand: '#82d8fa',
    trimGold: '#c2e9fc',
    collarColor: '#f7fbff',
    sashColor: '#23577a',
    jadeColor: '#7ee8ff',
    trouserColor: '#1b2e40',
    bootColor: '#1e2e3e',
    shadeTint: new THREE.Color(0.68, 0.80, 0.92),
    rimTint: new THREE.Color(0.35, 0.78, 1.0),
    wideSleeveDrop: 0.06,
    skirtEndRatio: 0.56,
  },
  cultivator: {
    topUpper: '#eef6fc',
    topMid: '#b5d6ed',
    topLower: '#326b92',
    skirtUpper: '#346f97',
    skirtLower: '#163550',
    hemBand: '#8ee0ff',
    trimGold: '#dec47a',
    collarColor: '#f6f9fd',
    sashColor: '#1b4565',
    jadeColor: '#7ceaff',
    trouserColor: '#162636',
    bootColor: '#1a2836',
    cloakUpper: '#2c668e',
    cloakLower: '#132e46',
    shadeTint: new THREE.Color(0.66, 0.78, 0.92),
    rimTint: new THREE.Color(0.40, 0.82, 1.0),
    wideSleeveDrop: 0.21,
    skirtEndRatio: 0.78,
  },
};

interface BakedGarmentTextures {
  robeMat: THREE.MeshStandardMaterial;
  innerBaseMat: THREE.MeshStandardMaterial;
  collarMat: THREE.MeshStandardMaterial;
  sashMat: THREE.MeshStandardMaterial;
  trimMat: THREE.MeshStandardMaterial;
  jadeMat: THREE.MeshStandardMaterial;
  bootMat: THREE.MeshStandardMaterial;
  vestMat?: THREE.MeshStandardMaterial;
  furMat?: THREE.MeshStandardMaterial;
  cloakMat?: THREE.MeshStandardMaterial;
}

const cachedThemeMats = new Map<GarmentThemeId, BakedGarmentTextures>();

/**
 * Injects Genshin / Honkai-style Half-Lambert Cel-PBR Shading + Highlight Roll-off + Fresnel Rim
 * so custom Xianxia garments match the VRM Anime Face & Hair 100% seamlessly!
 */
export function applyAnimeCelShader(
  mat: THREE.MeshStandardMaterial,
  shadeTint: THREE.Color,
  rimTint: THREE.Color,
  rimStrength = 0.26
): THREE.MeshStandardMaterial {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uCelShadeTint = { value: shadeTint };
    shader.uniforms.uCelRimTint = { value: rimTint };
    shader.uniforms.uCelRimStrength = { value: rimStrength };

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        uniform vec3 uCelShadeTint;
        uniform vec3 uCelRimTint;
        uniform float uCelRimStrength;
        `
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `
        // Smooth anime cel-PBR compression: prevents white blowout while keeping warm rich shadows!
        float celLum = dot(outgoingLight, vec3(0.299, 0.587, 0.114));
        float celBand = smoothstep(0.15, 0.50, celLum);
        vec3 shadedCol = diffuseColor.rgb * uCelShadeTint * 0.68;
        vec3 litCol = min(outgoingLight, diffuseColor.rgb * 1.15 + vec3(0.12));
        outgoingLight = mix(shadedCol, litCol, celBand);

        // View-space Fresnel Rim Light (Genshin character edge pop!)
        float fresnel = pow(1.0 - clamp(abs(dot(normalize(vNormal), normalize(vViewPosition))), 0.0, 1.0), 3.4);
        outgoingLight += uCelRimTint * fresnel * uCelRimStrength;
        #include <opaque_fragment>
        `
      );
  };
  mat.customProgramCacheKey = () =>
    `anime_cel_${mat.vertexColors ? 'vc_' : ''}${shadeTint.getHexString()}_${rimTint.getHexString()}_${rimStrength.toFixed(2)}`;
  return mat;
}

/**
 * Bakes high-resolution 1024x1024 Silk Damask, Ombre Gradient, Cloud Fretwork Embroidery,
 * Fold Ambient Occlusion, and Cloth Weave Normal Maps once per theme (shared across instances!).
 */
function getOrBakeThemeMaterials(theme: GarmentThemeId): BakedGarmentTextures {
  const existing = cachedThemeMats.get(theme);
  if (existing) return existing;

  const P = GARMENT_PALETTES[theme];
  const size = 1024;

  // 1. Main Silk/Brocade Robe Albedo + Roughness + Cloth-Pleat Normal Map
  const cCol = document.createElement('canvas');
  const cNor = document.createElement('canvas');
  const cRou = document.createElement('canvas');
  cCol.width = cNor.width = cRou.width = size;
  cCol.height = cNor.height = cRou.height = size;

  const ctx = cCol.getContext('2d')!;
  const nCtx = cNor.getContext('2d')!;
  const rCtx = cRou.getContext('2d')!;

  // Vertical ombre gradient: with flipY = false, vUv = 0.0 is y = 0 (collar) and vUv = 1.0 is y = size (hem)!
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0.0, P.topUpper);
  grad.addColorStop(0.34, P.topMid);
  grad.addColorStop(0.54, P.skirtUpper);
  grad.addColorStop(0.90, P.skirtLower);
  grad.addColorStop(1.0, P.skirtLower);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  rCtx.fillStyle = '#b6b6b6'; // Soft silk roughness (~0.71)
  rCtx.fillRect(0, 0, size, size);

  nCtx.fillStyle = 'rgb(128, 128, 255)';
  nCtx.fillRect(0, 0, size, size);

  // Subtle vertical drapery fold AO + normal waves (16 pleats around circumference)
  for (let x = 0; x < size; x += 4) {
    const u = (x / size) * Math.PI * 2 * 16;
    const wave = Math.sin(u);
    const slope = Math.cos(u);
    const aoAlpha = Math.max(0, -wave) * 0.13;
    ctx.fillStyle = `rgba(10, 14, 26, ${aoAlpha.toFixed(3)})`;
    ctx.fillRect(x, 0, 4, size);

    const nx = Math.round(128 + slope * 24);
    nCtx.fillStyle = `rgb(${nx}, 128, 245)`;
    nCtx.fillRect(x, 0, 4, size);
  }

  // Tone-on-tone Chinese Cloud/Diamond Brocade Damask (`暗纹云锦`)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.09)';
  ctx.lineWidth = 2;
  for (let gy = 48; gy < size - 120; gy += 64) {
    for (let gx = 32; gx < size; gx += 64) {
      const offX = ((gy / 64) % 2) * 32;
      ctx.beginPath();
      ctx.arc(gx + offX, gy, 16, 0, Math.PI * 1.35);
      ctx.stroke();
    }
  }

  // Under-belt soft Ambient Occlusion band around waist (vUv ~ 0.43..0.54)
  const beltAo = ctx.createLinearGradient(0, size * 0.43, 0, size * 0.54);
  beltAo.addColorStop(0, 'rgba(0,0,0,0)');
  beltAo.addColorStop(0.45, 'rgba(8,10,18,0.38)');
  beltAo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = beltAo;
  ctx.fillRect(0, size * 0.43, size, size * 0.11);

  // Ornate Metallic Gold / Jade Fretwork Embroidery Band at Bottom Hem & Wide Sleeve Cuffs (vUv: 0.90..0.98)
  const hemY = size * 0.90;
  ctx.fillStyle = P.hemBand;
  ctx.fillRect(0, hemY, size, 12);
  ctx.fillRect(0, hemY + 56, size, 10);

  // Chinese `回纹` geometric fretwork between the gold borders
  ctx.strokeStyle = P.trimGold;
  ctx.lineWidth = 4;
  for (let x = 8; x < size; x += 48) {
    ctx.strokeRect(x + 6, hemY + 18, 32, 30);
    ctx.beginPath();
    ctx.moveTo(x + 16, hemY + 33);
    ctx.lineTo(x + 28, hemY + 33);
    ctx.stroke();
  }
  rCtx.fillStyle = '#363636';
  rCtx.fillRect(0, hemY, size, 68);

  const colTex = new THREE.CanvasTexture(cCol);
  colTex.flipY = false;
  colTex.colorSpace = THREE.SRGBColorSpace;
  colTex.wrapS = THREE.RepeatWrapping;
  colTex.wrapT = THREE.ClampToEdgeWrapping;

  const norTex = new THREE.CanvasTexture(cNor);
  norTex.flipY = false;
  norTex.wrapS = THREE.RepeatWrapping;
  norTex.wrapT = THREE.ClampToEdgeWrapping;

  const rouTex = new THREE.CanvasTexture(cRou);
  rouTex.flipY = false;
  rouTex.wrapS = THREE.RepeatWrapping;
  rouTex.wrapT = THREE.ClampToEdgeWrapping;

  // 2. Crisp Ivory-and-Gold Cross-Collar Lapel Ribbon Texture (`交领织金领缘`)
  const cLapel = document.createElement('canvas');
  cLapel.width = 256;
  cLapel.height = 64;
  const lCtx = cLapel.getContext('2d')!;
  lCtx.fillStyle = P.collarColor;
  lCtx.fillRect(0, 0, 256, 64);
  lCtx.fillStyle = P.trimGold;
  lCtx.fillRect(0, 0, 44, 64);
  lCtx.fillRect(218, 0, 38, 64);
  lCtx.strokeStyle = P.hemBand;
  lCtx.lineWidth = 3;
  lCtx.strokeRect(52, 6, 158, 52);
  const lapelTex = new THREE.CanvasTexture(cLapel);
  lapelTex.flipY = false;
  lapelTex.colorSpace = THREE.SRGBColorSpace;

  // 3. Sculpted Brocade Waist Belt Texture (`束腰玉带/革带`)
  const cSash = document.createElement('canvas');
  cSash.width = 256;
  cSash.height = 128;
  const sCtx = cSash.getContext('2d')!;
  sCtx.fillStyle = P.sashColor;
  sCtx.fillRect(0, 0, 256, 128);
  sCtx.fillStyle = P.trimGold;
  sCtx.fillRect(0, 0, 256, 18);
  sCtx.fillRect(0, 110, 256, 18);
  sCtx.strokeStyle = P.hemBand;
  sCtx.lineWidth = 3;
  for (let x = 12; x < 256; x += 32) {
    sCtx.strokeRect(x, 34, 20, 60);
  }
  const sashTex = new THREE.CanvasTexture(cSash);
  sashTex.flipY = false;
  sashTex.wrapS = THREE.RepeatWrapping;
  sashTex.colorSpace = THREE.SRGBColorSpace;

  const robeMat = applyAnimeCelShader(
    new THREE.MeshStandardMaterial({
      map: colTex,
      normalMap: norTex,
      normalScale: new THREE.Vector2(0.42, 0.42),
      roughnessMap: rouTex,
      roughness: 0.72,
      metalness: 0.08,
      side: THREE.DoubleSide,
    }),
    P.shadeTint,
    P.rimTint,
    0.28
  );

  // Seamless Vertex-Colored Inner Anatomical Garment (1 draw call for inner tunic + armpits + trousers + foot boots!)
  const innerBaseMat = applyAnimeCelShader(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      normalMap: norTex,
      normalScale: new THREE.Vector2(0.22, 0.22),
      roughness: 0.74,
      metalness: 0.06,
    }),
    P.shadeTint,
    P.rimTint,
    0.18
  );

  const collarMat = applyAnimeCelShader(
    new THREE.MeshStandardMaterial({
      map: lapelTex,
      roughness: 0.52,
      metalness: 0.22,
      side: THREE.DoubleSide,
    }),
    P.shadeTint,
    P.rimTint,
    0.22
  );

  const sashMat = applyAnimeCelShader(
    new THREE.MeshStandardMaterial({
      map: sashTex,
      roughness: 0.46,
      metalness: 0.35,
      side: THREE.DoubleSide,
    }),
    P.shadeTint,
    P.rimTint,
    0.22
  );

  const trimMat = applyAnimeCelShader(
    new THREE.MeshStandardMaterial({
      color: P.trimGold,
      roughness: 0.26,
      metalness: 0.80,
      side: THREE.DoubleSide,
    }),
    P.shadeTint,
    P.rimTint,
    0.24
  );

  const jadeMat = new THREE.MeshStandardMaterial({
    color: P.jadeColor,
    emissive: new THREE.Color(P.jadeColor).multiplyScalar(0.32),
    roughness: 0.18,
    metalness: 0.25,
  });

  const bootMat = applyAnimeCelShader(
    new THREE.MeshStandardMaterial({
      color: P.bootColor,
      normalMap: norTex,
      normalScale: new THREE.Vector2(0.25, 0.25),
      roughness: 0.50,
      metalness: 0.18,
      side: THREE.DoubleSide,
    }),
    P.shadeTint,
    P.rimTint,
    0.18
  );

  const out: BakedGarmentTextures = {
    robeMat,
    innerBaseMat,
    collarMat,
    sashMat,
    trimMat,
    jadeMat,
    bootMat,
  };

  if (P.vestColor) {
    const cVest = document.createElement('canvas');
    cVest.width = cVest.height = 256;
    const vCtx = cVest.getContext('2d')!;
    vCtx.fillStyle = P.vestColor;
    vCtx.fillRect(0, 0, 256, 256);
    // Gold-trimmed front & bottom borders on mountain-boar leather vest
    vCtx.fillStyle = P.trimGold;
    vCtx.fillRect(0, 0, 14, 256);
    vCtx.fillRect(242, 0, 14, 256);
    vCtx.fillRect(0, 238, 256, 18);
    const vestTex = new THREE.CanvasTexture(cVest);
    vestTex.flipY = false;
    vestTex.colorSpace = THREE.SRGBColorSpace;

    out.vestMat = applyAnimeCelShader(
      new THREE.MeshStandardMaterial({
        map: vestTex,
        normalMap: norTex,
        normalScale: new THREE.Vector2(0.32, 0.32),
        roughness: 0.66,
        metalness: 0.12,
        side: THREE.DoubleSide,
      }),
      P.shadeTint,
      P.rimTint,
      0.22
    );
  }
  if (P.furColor) {
    out.furMat = applyAnimeCelShader(
      new THREE.MeshStandardMaterial({
        color: P.furColor,
        roughness: 0.90,
        metalness: 0.0,
        side: THREE.DoubleSide,
      }),
      new THREE.Color(0.76, 0.78, 0.88),
      P.rimTint,
      0.30
    );
  }
  if (P.cloakUpper && P.cloakLower) {
    const cCloak = document.createElement('canvas');
    cCloak.width = cCloak.height = 512;
    const kCtx = cCloak.getContext('2d')!;
    const kGrad = kCtx.createLinearGradient(0, 0, 0, 512);
    kGrad.addColorStop(0, P.cloakUpper);
    kGrad.addColorStop(0.86, P.cloakLower);
    kGrad.addColorStop(1, P.hemBand);
    kCtx.fillStyle = kGrad;
    kCtx.fillRect(0, 0, 512, 512);
    kCtx.strokeStyle = P.trimGold;
    kCtx.lineWidth = 10;
    kCtx.strokeRect(12, 12, 488, 488);
    const kTex = new THREE.CanvasTexture(cCloak);
    kTex.flipY = false;
    kTex.colorSpace = THREE.SRGBColorSpace;

    out.cloakMat = applyAnimeCelShader(
      new THREE.MeshStandardMaterial({
        map: kTex,
        normalMap: norTex,
        normalScale: new THREE.Vector2(0.35, 0.35),
        roughness: 0.65,
        side: THREE.DoubleSide,
      }),
      P.shadeTint,
      P.rimTint,
      0.28
    );
  }

  cachedThemeMats.set(theme, out);
  return out;
}

interface TubeStation {
  center: THREE.Vector3;
  rx: number;
  rz: number;
  vUv: number;
  pleatAmp?: number;
  dropY?: number;
  bones: [number, number, number, number];
  weights: [number, number, number, number];
}

/**
 * Generates a smooth, anatomically-contoured Skinned BufferGeometry along arbitrary 3D bone stations.
 * - `'verticalY'`: Horizontal XZ cross-sections for torso, sash, vest, and collar.
 * - `'limbTangent'`: Orthonormal Frenet frame perpendicular to true 3D bone segment tangents,
 *   preventing vertical shoulder fins on angled arms while supporting gravity sleeve drop (`dropY`)!
 */
function buildContouredSkinnedTube(
  stations: TubeStation[],
  radialSegs = 20,
  thetaStart = 0,
  thetaLength = Math.PI * 2,
  axisMode: 'verticalY' | 'limbTangent' = 'verticalY'
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const skinIndices: number[] = [];
  const skinWeights: number[] = [];
  const indices: number[] = [];

  const isClosed = Math.abs(thetaLength - Math.PI * 2) < 0.001;
  const stride = radialSegs + 1;

  const worldUp = new THREE.Vector3(0, 1, 0);
  const tangent = new THREE.Vector3();
  const frontAxis = new THREE.Vector3();
  const upAxis = new THREE.Vector3();

  for (let r = 0; r < stations.length; r++) {
    const st = stations[r];
    const pleat = st.pleatAmp ?? 0;
    const drop = st.dropY ?? 0;

    if (axisMode === 'limbTangent') {
      const prev = stations[Math.max(0, r - 1)].center;
      const next = stations[Math.min(stations.length - 1, r + 1)].center;
      tangent.subVectors(next, prev);
      if (tangent.lengthSq() < 1e-6) tangent.set(1, 0, 0);
      tangent.normalize();

      // Build perpendicular frame (frontAxis ~ +/-Z, upAxis ~ +Y)
      if (Math.abs(tangent.y) > 0.92) {
        frontAxis.set(0, 0, 1);
        upAxis.crossVectors(tangent, frontAxis).normalize();
        frontAxis.crossVectors(upAxis, tangent).normalize();
      } else {
        frontAxis.crossVectors(tangent, worldUp).normalize();
        upAxis.crossVectors(frontAxis, tangent).normalize();
        if (upAxis.y < 0) {
          upAxis.negate();
          frontAxis.negate();
        }
      }
    }

    for (let s = 0; s <= radialSegs; s++) {
      const uFrac = s / radialSegs;
      const theta = thetaStart + uFrac * thetaLength;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      let px = st.center.x;
      let py = st.center.y;
      let pz = st.center.z;

      if (axisMode === 'verticalY') {
        const fold = 1.0 + pleat * Math.sin(theta * 12.0);
        px += sinT * st.rx * fold;
        pz += cosT * st.rz * fold;
      } else {
        // Perpendicular to bone tangent, with wide sleeves hanging cleanly in world -Y!
        const hang = sinT < 0 ? Math.pow(-sinT, 1.45) * drop : 0;
        const widen = 1.0 + (sinT < 0 && drop > 0.1 ? 0.28 : 0);
        const uOff = sinT * st.rx;
        const fOff = cosT * st.rz * widen;
        px += upAxis.x * uOff + frontAxis.x * fOff;
        py += upAxis.y * uOff + frontAxis.y * fOff - hang;
        pz += upAxis.z * uOff + frontAxis.z * fOff;
      }

      positions.push(px, py, pz);
      uvs.push(uFrac, st.vUv);
      skinIndices.push(st.bones[0], st.bones[1], st.bones[2], st.bones[3]);
      skinWeights.push(st.weights[0], st.weights[1], st.weights[2], st.weights[3]);
    }
  }

  // Ensure outward-facing CCW vertex normals for both verticalY and limbTangent tubes!
  let flipWinding = false;
  if (axisMode === 'verticalY') {
    flipWinding = stations[stations.length - 1].center.y >= stations[0].center.y;
  } else {
    // Check orientation of first quad (a, b, d) against radial offset from stations[0].center
    const aVec = new THREE.Vector3(positions[0], positions[1], positions[2]);
    const bVec = new THREE.Vector3(positions[stride * 3], positions[stride * 3 + 1], positions[stride * 3 + 2]);
    const dVec = new THREE.Vector3(positions[3], positions[4], positions[5]);
    const nTest = new THREE.Vector3().subVectors(bVec, aVec).cross(new THREE.Vector3().subVectors(dVec, aVec));
    const radTest = new THREE.Vector3().subVectors(aVec, stations[0].center);
    flipWinding = nTest.dot(radTest) < 0;
  }

  for (let r = 0; r < stations.length - 1; r++) {
    for (let s = 0; s < radialSegs; s++) {
      const a = r * stride + s;
      const b = (r + 1) * stride + s;
      const c = (r + 1) * stride + (s + 1);
      const d = r * stride + (s + 1);
      if (flipWinding) {
        indices.push(a, d, b);
        indices.push(d, c, b);
      } else {
        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  if (isClosed) {
    const nAttr = geo.attributes.normal;
    const va = new THREE.Vector3();
    const vb = new THREE.Vector3();
    for (let r = 0; r < stations.length; r++) {
      const i0 = r * stride;
      const i1 = r * stride + radialSegs;
      va.fromBufferAttribute(nAttr, i0);
      vb.fromBufferAttribute(nAttr, i1);
      va.add(vb).normalize();
      nAttr.setXYZ(i0, va.x, va.y, va.z);
      nAttr.setXYZ(i1, va.x, va.y, va.z);
    }
  }
  return geo;
}

/**
 * Tailors a complete, multi-bone GPU-skinned Ancient Xianxia Outfit directly onto a stripped VRM's
 * native `Body` Skeleton, culling hidden torso/leg/toe flesh triangles and replacing them with a
 * 1-draw-call seamless anatomical inner garment + multi-layered outer Hanfu robes & boots!
 */
export function tailorXianxiaOutfitOntoVrm(vrm: VRM, theme: GarmentThemeId): THREE.SkinnedMesh[] {
  const P = GARMENT_PALETTES[theme];
  const mats = getOrBakeThemeMaterials(theme);

  // Locate the primary `Body` SkinnedMesh (excluding Face with BlendShapes and Hair)
  let bodyMesh: THREE.SkinnedMesh | null = null;
  let fallbackSkinMesh: THREE.SkinnedMesh | null = null;
  vrm.scene.traverse((obj) => {
    if ((obj as THREE.SkinnedMesh).isSkinnedMesh) {
      const sm = obj as THREE.SkinnedMesh;
      const matNames = (Array.isArray(sm.material) ? sm.material : [sm.material])
        .map((m) => m?.name ?? '')
        .join(' ');
      const fullTag = `${sm.name} ${sm.parent?.name ?? ''} ${matNames}`.toLowerCase();
      const hasFaceMorphs = sm.morphTargetDictionary && Object.keys(sm.morphTargetDictionary).length > 8;
      if (
        !hasFaceMorphs &&
        (fullTag.includes('body') || (fullTag.includes('skin') && sm.skeleton.bones.length > 40)) &&
        !fullTag.includes('face') &&
        !fullTag.includes('hair') &&
        !fullTag.includes('eye') &&
        !fullTag.includes('brow') &&
        !fullTag.includes('lash')
      ) {
        if (!bodyMesh || sm.geometry.attributes.position.count > bodyMesh.geometry.attributes.position.count) {
          bodyMesh = sm;
        }
      }
      if (!fallbackSkinMesh || sm.skeleton.bones.length > fallbackSkinMesh.skeleton.bones.length) {
        fallbackSkinMesh = sm;
      }
    }
  });

  const targetMesh = (bodyMesh ?? fallbackSkinMesh) as THREE.SkinnedMesh | null;
  if (!targetMesh) return [];

  const skeleton = targetMesh.skeleton;
  const meshParent = targetMesh.parent ?? vrm.scene;

  const getBoneInfo = (name: VRMHumanBoneName, fallback?: { idx: number; pos: THREE.Vector3 }) => {
    const rawNode = vrm.humanoid?.getRawBoneNode(name);
    if (rawNode) {
      const idx = skeleton.bones.indexOf(rawNode as THREE.Bone);
      if (idx >= 0) {
        const bindMat = skeleton.boneInverses[idx].clone().invert();
        const pos = new THREE.Vector3().setFromMatrixPosition(bindMat);
        return { idx, pos };
      }
    }
    return fallback ?? { idx: 0, pos: new THREE.Vector3() };
  };

  const bHips = getBoneInfo('hips');
  const bSpine = getBoneInfo('spine', bHips);
  const bChest = getBoneInfo('chest', bSpine);
  const bUpChest = getBoneInfo('upperChest', bChest);
  const bNeck = getBoneInfo('neck', bUpChest);

  const bLSh = getBoneInfo('leftShoulder', bUpChest);
  const bLUpArm = getBoneInfo('leftUpperArm', bLSh);
  const bLLowArm = getBoneInfo('leftLowerArm', bLUpArm);
  const bLHand = getBoneInfo('leftHand', bLLowArm);

  const bRSh = getBoneInfo('rightShoulder', bUpChest);
  const bRUpArm = getBoneInfo('rightUpperArm', bRSh);
  const bRLowArm = getBoneInfo('rightLowerArm', bRUpArm);
  const bRHand = getBoneInfo('rightHand', bRLowArm);

  const bLUpLeg = getBoneInfo('leftUpperLeg', bHips);
  const bLLowLeg = getBoneInfo('leftLowerLeg', bLUpLeg);
  const bLFoot = getBoneInfo('leftFoot', bLLowLeg);

  const bRUpLeg = getBoneInfo('rightUpperLeg', bHips);
  const bRLowLeg = getBoneInfo('rightLowerLeg', bRUpLeg);
  const bRFoot = getBoneInfo('rightFoot', bRLowLeg);

  const createdMeshes: THREE.SkinnedMesh[] = [];
  const addGarmentPart = (geo: THREE.BufferGeometry, mat: THREE.Material, castShadow = true) => {
    const sm = new THREE.SkinnedMesh(geo, mat);
    sm.castShadow = castShadow;
    sm.receiveShadow = true;
    sm.frustumCulled = false;
    sm.bind(skeleton, targetMesh.bindMatrix);
    meshParent.add(sm);
    createdMeshes.push(sm);
    return sm;
  };

  const waistY = THREE.MathUtils.lerp(bHips.pos.y, bSpine.pos.y, P.isRuqun ? 1.32 : 0.44);
  const collarTopY = THREE.MathUtils.lerp(bUpChest.pos.y, bNeck.pos.y, 0.72);
  const bootTopY = THREE.MathUtils.lerp(bLLowLeg.pos.y, bLFoot.pos.y, 0.24);
  const ankleY = Math.max(0.10, bLFoot.pos.y + 0.025);

  // =========================================================================
  // 0. MEASURE EXACT 3D BODY CONTOURS & REPLACE HIDDEN SKIN WITH SEAMLESS INNER CLOTH!
  //    Eliminates 100% of belly/hip/knee/toe skin poke-through AND shoulder/armpit gaps!
  // =========================================================================
  const bodyGeo = targetMesh.geometry;
  const posAttr = bodyGeo.attributes.position;
  const normAttr = bodyGeo.attributes.normal;
  const torsoLimitX = Math.max(0.145, Math.min(Math.abs(bLUpArm.pos.x), Math.abs(bRUpArm.pos.x)) * 0.94);

  const measureTorsoSlice = (yCenter: number, halfBand = 0.045) => {
    let maxX = 0.11;
    let minZ = -0.095;
    let maxZ = 0.095;
    let count = 0;
    for (let i = 0; i < posAttr.count; i++) {
      const py = posAttr.getY(i);
      if (Math.abs(py - yCenter) <= halfBand) {
        const px = Math.abs(posAttr.getX(i));
        if (px <= torsoLimitX) {
          const pz = posAttr.getZ(i);
          if (px > maxX) maxX = px;
          if (pz < minZ) minZ = pz;
          if (pz > maxZ) maxZ = pz;
          count++;
        }
      }
    }
    if (count === 0) {
      return { rx: 0.135, cz: bChest.pos.z, rz: 0.108 };
    }
    return {
      rx: maxX,
      cz: (minZ + maxZ) * 0.5,
      rz: (maxZ - minZ) * 0.5,
    };
  };

  const bMesh = bodyMesh as THREE.SkinnedMesh | null;
  if (bMesh && bodyGeo.index) {
    const srcIdx = bodyGeo.index;
    const exposedSkinTris: number[] = [];
    const coveredBodyTris: number[] = [];
    const handCutX = Math.max(0.28, Math.min(Math.abs(bLHand.pos.x), Math.abs(bRHand.pos.x)) - 0.016);
    const neckSkinCutY = THREE.MathUtils.lerp(bUpChest.pos.y, bNeck.pos.y, 0.56);
    const isLongRobe = P.skirtEndRatio >= 0.72;

    for (let t = 0; t < srcIdx.count; t += 3) {
      const i0 = srcIdx.getX(t);
      const i1 = srcIdx.getX(t + 1);
      const i2 = srcIdx.getX(t + 2);

      const cx = (posAttr.getX(i0) + posAttr.getX(i1) + posAttr.getX(i2)) / 3;
      const cy = (posAttr.getY(i0) + posAttr.getY(i1) + posAttr.getY(i2)) / 3;

      const isNeckOrHead = cy >= neckSkinCutY;
      const isHand = cy > bHips.pos.y + 0.05 && Math.abs(cx) >= handCutX;

      if (isNeckOrHead || isHand) {
        exposedSkinTris.push(i0, i1, i2);
      } else {
        // On ankle-length immortal robes, omit hidden mid-thigh/knee inner triangles so lunges never clip!
        const skipHiddenLongRobeThigh = isLongRobe && cy < bHips.pos.y - 0.02 && cy > bootTopY + 0.06;
        if (!skipHiddenLongRobeThigh) {
          coveredBodyTris.push(i0, i1, i2);
        }
      }
    }

    // 0a. Keep ONLY exposed Neck & Hand triangles on `Body`!
    const trimmedSkinGeo = bodyGeo.clone();
    trimmedSkinGeo.clearGroups();
    trimmedSkinGeo.setIndex(exposedSkinTris);
    bMesh.geometry = trimmedSkinGeo;
    if (Array.isArray(bMesh.material)) {
      bMesh.material = bMesh.material[0];
    }

    // 0b. Build 1-Draw-Call Seamless Anatomical Inner Garment (Inner Tunic + Armpits + Trousers + Boot Base)
    const vCount = posAttr.count;
    const innerPos = new Float32Array(vCount * 3);
    const innerUvs = new Float32Array(vCount * 2);
    const innerColors = new Float32Array(vCount * 3);

    const colTunic = new THREE.Color(P.topMid);
    const colTrouser = new THREE.Color(P.trouserColor);
    const colBoot = new THREE.Color(P.bootColor);

    for (let i = 0; i < vCount; i++) {
      const px = posAttr.getX(i);
      const py = posAttr.getY(i);
      const pz = posAttr.getZ(i);
      const nx = normAttr ? normAttr.getX(i) : 0;
      const ny = normAttr ? normAttr.getY(i) : 0;
      const nz = normAttr ? normAttr.getZ(i) : 0;

      innerPos[i * 3] = px + nx * 0.0025;
      innerPos[i * 3 + 1] = py + ny * 0.0025;
      innerPos[i * 3 + 2] = pz + nz * 0.0025;

      innerUvs[i * 2] = Math.atan2(px, pz) / (Math.PI * 2) + 0.5;
      innerUvs[i * 2 + 1] = THREE.MathUtils.clamp(1.0 - py / 1.6, 0.05, 0.85);

      const c = py >= waistY - 0.04 ? colTunic : py >= bootTopY ? colTrouser : colBoot;
      innerColors[i * 3] = c.r;
      innerColors[i * 3 + 1] = c.g;
      innerColors[i * 3 + 2] = c.b;
    }

    const innerGeo = new THREE.BufferGeometry();
    innerGeo.setAttribute('position', new THREE.BufferAttribute(innerPos, 3));
    if (normAttr) innerGeo.setAttribute('normal', normAttr);
    innerGeo.setAttribute('uv', new THREE.BufferAttribute(innerUvs, 2));
    innerGeo.setAttribute('color', new THREE.BufferAttribute(innerColors, 3));
    innerGeo.setAttribute('skinIndex', bodyGeo.attributes.skinIndex);
    innerGeo.setAttribute('skinWeight', bodyGeo.attributes.skinWeight);
    innerGeo.setIndex(coveredBodyTris);
    addGarmentPart(innerGeo, mats.innerBaseMat, true);
  }

  // Measure exact slices from actual 3D body!
  const slHips = measureTorsoSlice(bHips.pos.y, 0.045);
  const slWaist = measureTorsoSlice(waistY, 0.045);
  const slChest = measureTorsoSlice(bChest.pos.y, 0.045);
  const slUpChest = measureTorsoSlice(bUpChest.pos.y + 0.02, 0.04);

  // =========================================================================
  // 1. OUTER SILK ROBE BODICE (`交领仙衣上襦`) + CRISP `y`-SHAPED CROSS-COLLAR (`交领右衽`)
  // =========================================================================
  const torsoClear = 0.010;
  const torsoStations: TubeStation[] = [
    {
      center: new THREE.Vector3(0, bHips.pos.y - 0.02, slHips.cz),
      rx: slHips.rx + torsoClear,
      rz: slHips.rz + torsoClear,
      vUv: 0.46,
      bones: [bHips.idx, bSpine.idx, 0, 0],
      weights: [0.85, 0.15, 0, 0],
    },
    {
      center: new THREE.Vector3(0, waistY, slWaist.cz),
      rx: slWaist.rx + torsoClear,
      rz: slWaist.rz + torsoClear,
      vUv: 0.36,
      bones: [bHips.idx, bSpine.idx, bChest.idx, 0],
      weights: [0.30, 0.55, 0.15, 0],
    },
    {
      center: new THREE.Vector3(0, bChest.pos.y, slChest.cz),
      rx: slChest.rx + torsoClear,
      rz: slChest.rz + torsoClear,
      vUv: 0.22,
      bones: [bSpine.idx, bChest.idx, bUpChest.idx, 0],
      weights: [0.20, 0.55, 0.25, 0],
    },
    {
      center: new THREE.Vector3(0, bUpChest.pos.y + 0.025, slUpChest.cz),
      rx: slUpChest.rx + torsoClear,
      rz: slUpChest.rz + torsoClear,
      vUv: 0.10,
      bones: [bChest.idx, bUpChest.idx, bLSh.idx, bRSh.idx],
      weights: [0.20, 0.60, 0.10, 0.10],
    },
    {
      center: new THREE.Vector3(0, collarTopY, bNeck.pos.z),
      rx: 0.068,
      rz: 0.066,
      vUv: 0.03,
      bones: [bUpChest.idx, bNeck.idx, 0, 0],
      weights: [0.45, 0.55, 0, 0],
    },
  ];
  const torsoGeo = buildContouredSkinnedTube(torsoStations, 24, 0, Math.PI * 2, 'verticalY');
  addGarmentPart(torsoGeo, mats.robeMat, true);

  // Helper to evaluate front surface Z of `torsoGeo` at any (x, y) so diagonal cross-collar ribbons hug the chest!
  const evalTorsoFrontZ = (x: number, y: number) => {
    const t = THREE.MathUtils.clamp((y - waistY) / Math.max(0.05, collarTopY - waistY), 0, 1);
    const rx = THREE.MathUtils.lerp(slWaist.rx + torsoClear, 0.068, Math.pow(t, 1.35));
    const rz = THREE.MathUtils.lerp(slWaist.rz + torsoClear, 0.066, Math.pow(t, 1.35));
    const cz = THREE.MathUtils.lerp(slWaist.cz, bNeck.pos.z, t);
    const ratio = THREE.MathUtils.clamp(x / Math.max(0.04, rx), -0.96, 0.96);
    return cz - rz * Math.sqrt(Math.max(0.08, 1.0 - ratio * ratio));
  };

  const buildDiagonalLapelStrip = (
    pts: { x: number; y: number; zBias: number }[],
    halfW: number
  ): THREE.BufferGeometry => {
    const pArr: number[] = [];
    const uArr: number[] = [];
    const siArr: number[] = [];
    const swArr: number[] = [];
    const idxArr: number[] = [];

    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const tChest = THREE.MathUtils.clamp((p.y - waistY) / Math.max(0.05, collarTopY - waistY), 0, 1);
      for (let side = 0; side <= 1; side++) {
        const px = p.x + (side === 0 ? -halfW : halfW);
        const pz = evalTorsoFrontZ(px, p.y) - p.zBias;
        pArr.push(px, p.y, pz);
        uArr.push(side, i / (pts.length - 1));

        if (tChest > 0.65) {
          siArr.push(bNeck.idx, bUpChest.idx, bChest.idx, 0);
          swArr.push(0.45, 0.45, 0.10, 0);
        } else if (tChest > 0.30) {
          siArr.push(bUpChest.idx, bChest.idx, bSpine.idx, 0);
          swArr.push(0.35, 0.50, 0.15, 0);
        } else {
          siArr.push(bChest.idx, bSpine.idx, bHips.idx, 0);
          swArr.push(0.25, 0.55, 0.20, 0);
        }
      }
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const a = i * 2;
      const b = (i + 1) * 2;
      const c = (i + 1) * 2 + 1;
      const d = i * 2 + 1;
      // Front faces -Z!
      idxArr.push(a, d, b);
      idxArr.push(d, c, b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pArr, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uArr, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(siArr, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(swArr, 4));
    g.setIndex(idxArr);
    g.computeVertexNormals();
    return g;
  };

  // Authentic `交领右衽` Y-Collar: Left lapel (-X) crosses diagonally over Right lapel (+X) down to right waist!
  const leftOverRightPts: { x: number; y: number; zBias: number }[] = [];
  const stepsL = 9;
  for (let i = 0; i <= stepsL; i++) {
    const f = i / stepsL;
    leftOverRightPts.push({
      x: THREE.MathUtils.lerp(-0.052, 0.068, Math.pow(f, 0.92)),
      y: THREE.MathUtils.lerp(collarTopY + 0.010, waistY + 0.015, f),
      zBias: 0.0065,
    });
  }
  addGarmentPart(buildDiagonalLapelStrip(leftOverRightPts, 0.019), mats.collarMat, false);

  const rightInnerPts: { x: number; y: number; zBias: number }[] = [];
  const stepsR = 6;
  for (let i = 0; i <= stepsR; i++) {
    const f = i / stepsR;
    rightInnerPts.push({
      x: THREE.MathUtils.lerp(0.052, 0.002, f),
      y: THREE.MathUtils.lerp(collarTopY + 0.010, THREE.MathUtils.lerp(collarTopY, waistY, 0.48), f),
      zBias: 0.0035,
    });
  }
  addGarmentPart(buildDiagonalLapelStrip(rightInnerPts, 0.018), mats.collarMat, false);

  // Back-of-neck standing collar band (`护领`) connecting left & right lapels cleanly around +Z neck
  const backCollarGeo = buildContouredSkinnedTube(
    [
      {
        center: new THREE.Vector3(0, collarTopY - 0.008, bNeck.pos.z),
        rx: 0.071,
        rz: 0.069,
        vUv: 0.2,
        bones: [bUpChest.idx, bNeck.idx, 0, 0],
        weights: [0.5, 0.5, 0, 0],
      },
      {
        center: new THREE.Vector3(0, collarTopY + 0.018, bNeck.pos.z),
        rx: 0.067,
        rz: 0.066,
        vUv: 0.8,
        bones: [bUpChest.idx, bNeck.idx, 0, 0],
        weights: [0.35, 0.65, 0, 0],
      },
    ],
    12,
    -Math.PI * 0.55,
    Math.PI * 1.10,
    'verticalY'
  );
  addGarmentPart(backCollarGeo, mats.collarMat, false);

  // =========================================================================
  // 2. TANGENT-ALIGNED FLOWING IMMORTAL SLEEVES (`流云广袖`) & MARTIAL BRACERS (`鎏金护腕`)
  // =========================================================================
  for (const side of ['L', 'R'] as const) {
    const sh = side === 'L' ? bLSh : bRSh;
    const up = side === 'L' ? bLUpArm : bRUpArm;
    const low = side === 'L' ? bLLowArm : bRLowArm;
    const hand = side === 'L' ? bLHand : bRHand;

    const shoulderRoot = new THREE.Vector3().lerpVectors(sh.pos, up.pos, 0.96);
    const midUp = new THREE.Vector3().lerpVectors(up.pos, low.pos, 0.52);
    const wrist = new THREE.Vector3().lerpVectors(low.pos, hand.pos, 0.86);
    const isWide = P.wideSleeveDrop > 0.12;

    const sleeveGeo = buildContouredSkinnedTube(
      [
        {
          center: shoulderRoot,
          rx: 0.044,
          rz: 0.044,
          vUv: 0.16,
          dropY: 0.0,
          bones: [up.idx, sh.idx, 0, 0],
          weights: [0.92, 0.08, 0, 0],
        },
        {
          center: midUp,
          rx: 0.058,
          rz: 0.058,
          vUv: 0.36,
          dropY: P.wideSleeveDrop * 0.32,
          bones: [up.idx, low.idx, 0, 0],
          weights: [0.80, 0.20, 0, 0],
        },
        {
          center: low.pos.clone(),
          rx: isWide ? 0.070 : 0.052,
          rz: isWide ? 0.068 : 0.052,
          vUv: 0.68,
          dropY: P.wideSleeveDrop * 0.70,
          bones: [up.idx, low.idx, 0, 0],
          weights: [0.25, 0.75, 0, 0],
        },
        {
          center: wrist,
          rx: isWide ? 0.082 : 0.044,
          rz: isWide ? 0.076 : 0.044,
          vUv: 0.97,
          dropY: P.wideSleeveDrop,
          bones: [low.idx, hand.idx, 0, 0],
          weights: [0.82, 0.18, 0, 0],
        },
      ],
      16,
      0,
      Math.PI * 2,
      'limbTangent'
    );
    addGarmentPart(sleeveGeo, mats.robeMat, true);

    if (!isWide) {
      const bracerStart = new THREE.Vector3().lerpVectors(low.pos, hand.pos, 0.30);
      const bracerEnd = new THREE.Vector3().lerpVectors(low.pos, hand.pos, 0.90);
      const bracerGeo = buildContouredSkinnedTube(
        [
          {
            center: bracerStart,
            rx: 0.054,
            rz: 0.054,
            vUv: 0.20,
            bones: [low.idx, hand.idx, 0, 0],
            weights: [0.95, 0.05, 0, 0],
          },
          {
            center: bracerEnd,
            rx: 0.046,
            rz: 0.046,
            vUv: 0.90,
            bones: [low.idx, hand.idx, 0, 0],
            weights: [0.78, 0.22, 0, 0],
          },
        ],
        12,
        0,
        Math.PI * 2,
        'limbTangent'
      );
      addGarmentPart(bracerGeo, mats.sashMat, false);
    }
  }

  // =========================================================================
  // 3. SCULPTED WAIST SASH (`束腰玉带`), JADE CLASP (`白玉腰扣`), FRONT TASSEL (`蔽膝宫绦`)
  //    & MULTI-BONE LEG-WEIGHTED PLEATED XIANXIA ROBE SKIRT (`分片百褶仙袍下摆`)
  // =========================================================================
  const sashClear = 0.022;
  const sashGeo = buildContouredSkinnedTube(
    [
      {
        center: new THREE.Vector3(0, waistY - 0.032, slWaist.cz),
        rx: slWaist.rx + sashClear,
        rz: slWaist.rz + sashClear,
        vUv: 0.95,
        bones: [bHips.idx, bSpine.idx, 0, 0],
        weights: [0.65, 0.35, 0, 0],
      },
      {
        center: new THREE.Vector3(0, waistY + 0.032, slWaist.cz),
        rx: slWaist.rx + sashClear - 0.002,
        rz: slWaist.rz + sashClear - 0.002,
        vUv: 0.05,
        bones: [bHips.idx, bSpine.idx, 0, 0],
        weights: [0.45, 0.55, 0, 0],
      },
    ],
    22,
    0,
    Math.PI * 2,
    'verticalY'
  );
  addGarmentPart(sashGeo, mats.sashMat, false);

  // Ornate 3D Gold & Glowing Jade Waist Buckle (`蟠龙玉带扣`) attached to spine/hips
  const spineNode = vrm.humanoid?.getRawBoneNode('spine') ?? vrm.humanoid?.getRawBoneNode('hips');
  if (spineNode) {
    const buckleGroup = new THREE.Group();
    const localY = waistY - bSpine.pos.y;
    const frontZ = slWaist.cz - (slWaist.rz + sashClear) - bSpine.pos.z - 0.006;
    buckleGroup.position.set(0, localY, frontZ);

    const frame = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.030, 0.012, 8), mats.trimMat);
    frame.rotation.x = Math.PI / 2;
    frame.scale.set(1.25, 1.0, 0.85);
    buckleGroup.add(frame);

    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.016, 0), mats.jadeMat);
    gem.scale.set(1.1, 1.3, 0.55);
    gem.position.z = -0.005;
    buckleGroup.add(gem);
    spineNode.add(buckleGroup);
  }

  // Build Leg-Weighted Pleated Xianxia Robe Skirt (`分片百褶仙袍下摆`)
  const skirtTopY = waistY - 0.020;
  const skirtBotY = THREE.MathUtils.lerp(bHips.pos.y, ankleY, P.skirtEndRatio);
  const skirtBaseRx = Math.max(slWaist.rx, slHips.rx) + 0.028;
  const skirtBaseRz = Math.max(slWaist.rz, slHips.rz) + 0.030;
  const skirtBaseCz = THREE.MathUtils.lerp(slWaist.cz, slHips.cz, 0.5);

  const skirtRows = 7;
  const skirtSegs = 32;
  const sPos: number[] = [];
  const sUv: number[] = [];
  const sIdx: number[] = [];
  const sWgt: number[] = [];
  const sTri: number[] = [];

  for (let r = 0; r <= skirtRows; r++) {
    const t = r / skirtRows; // 0 = waist, 1 = hem
    const y = THREE.MathUtils.lerp(skirtTopY, skirtBotY, t);
    const flare = 1.0 + Math.pow(t, 1.15) * (P.isRuqun ? 1.15 : 0.88);
    const rx = skirtBaseRx * flare;
    const rz = skirtBaseRz * flare;
    const vCoord = THREE.MathUtils.lerp(0.50, 0.98, t);
    const legBlend = THREE.MathUtils.smoothstep(bHips.pos.y + 0.02 - y, 0.0, 0.14) * 0.96;
    const shinBlend = THREE.MathUtils.smoothstep(bLLowLeg.pos.y + 0.04 - y, 0.0, 0.18) * 0.84;

    for (let s = 0; s <= skirtSegs; s++) {
      const u = s / skirtSegs;
      const theta = P.isRuqun
        ? u * Math.PI * 2
        : Math.PI * 1.04 + u * Math.PI * 1.92; // Subtle front center slit covered by hanging sash apron!
      const sinT = Math.sin(theta);
      const cosT = Math.cos(theta);
      const pleat = 1.0 + t * 0.05 * Math.sin(theta * 16.0);

      const px = sinT * rx * pleat;
      const pz = skirtBaseCz + cosT * rz * pleat;
      sPos.push(px, y, pz);
      sUv.push(u, vCoord);

      const rightness = THREE.MathUtils.clamp(0.5 + (px / Math.max(0.08, rx)) * 0.85, 0, 1);
      const leftness = 1.0 - rightness;

      const wHips = 1.0 - legBlend;
      const wThigh = legBlend * (1.0 - shinBlend);
      const wShin = legBlend * shinBlend;

      if (rightness >= leftness) {
        sIdx.push(bHips.idx, bRUpLeg.idx, bRLowLeg.idx, bLUpLeg.idx);
        sWgt.push(wHips, wThigh * rightness, wShin, wThigh * leftness);
      } else {
        sIdx.push(bHips.idx, bLUpLeg.idx, bLLowLeg.idx, bRUpLeg.idx);
        sWgt.push(wHips, wThigh * leftness, wShin, wThigh * rightness);
      }
    }
  }

  const sStride = skirtSegs + 1;
  for (let r = 0; r < skirtRows; r++) {
    for (let s = 0; s < skirtSegs; s++) {
      const a = r * sStride + s;
      const b = (r + 1) * sStride + s;
      const c = (r + 1) * sStride + (s + 1);
      const d = r * sStride + (s + 1);
      sTri.push(a, b, d);
      sTri.push(b, c, d);
    }
  }
  const skirtGeo = new THREE.BufferGeometry();
  skirtGeo.setAttribute('position', new THREE.Float32BufferAttribute(sPos, 3));
  skirtGeo.setAttribute('uv', new THREE.Float32BufferAttribute(sUv, 2));
  skirtGeo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(sIdx, 4));
  skirtGeo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sWgt, 4));
  skirtGeo.setIndex(sTri);
  skirtGeo.computeVertexNormals();
  addGarmentPart(skirtGeo, mats.robeMat, true);

  // Hanging Front Center Brocade Sash Panel (`悬垂前摆蔽膝/长绦`) — authentic Xianxia front centerpiece!
  const apronRows = 6;
  const aPos: number[] = [];
  const aUv: number[] = [];
  const aIdx: number[] = [];
  const aWgt: number[] = [];
  const aTri: number[] = [];
  const apronBotY = THREE.MathUtils.lerp(waistY, skirtBotY, 0.94);

  for (let r = 0; r <= apronRows; r++) {
    const t = r / apronRows;
    const y = THREE.MathUtils.lerp(waistY - 0.01, apronBotY, t);
    const halfW = THREE.MathUtils.lerp(0.036, 0.058, t);
    const flare = 1.0 + Math.pow(t, 1.18) * (P.isRuqun ? 1.15 : 0.85);
    const frontZ = skirtBaseCz - skirtBaseRz * flare - 0.010;
    const legInf = THREE.MathUtils.smoothstep(t, 0.12, 0.85) * 0.72;

    for (let side = 0; side <= 1; side++) {
      const px = side === 0 ? -halfW : halfW;
      aPos.push(px, y, frontZ);
      aUv.push(side, THREE.MathUtils.lerp(0.55, 0.98, t));
      aIdx.push(bHips.idx, bLUpLeg.idx, bRUpLeg.idx, 0);
      aWgt.push(1.0 - legInf, legInf * 0.5, legInf * 0.5, 0);
    }
  }
  for (let r = 0; r < apronRows; r++) {
    const a = r * 2;
    const b = (r + 1) * 2;
    const c = (r + 1) * 2 + 1;
    const d = r * 2 + 1;
    aTri.push(a, d, b);
    aTri.push(d, c, b);
  }
  const apronGeo = new THREE.BufferGeometry();
  apronGeo.setAttribute('position', new THREE.Float32BufferAttribute(aPos, 3));
  apronGeo.setAttribute('uv', new THREE.Float32BufferAttribute(aUv, 2));
  apronGeo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(aIdx, 4));
  apronGeo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(aWgt, 4));
  apronGeo.setIndex(aTri);
  apronGeo.computeVertexNormals();
  addGarmentPart(apronGeo, mats.collarMat, false);

  // =========================================================================
  // 4. SCULPTED KNEE-CUFFED ANCIENT XIANXIA BOOTS (`云纹护胫战靴`)
  // =========================================================================
  for (const side of ['L', 'R'] as const) {
    const lowLeg = side === 'L' ? bLLowLeg : bRLowLeg;
    const foot = side === 'L' ? bLFoot : bRFoot;

    const bootRimTop = new THREE.Vector3().lerpVectors(lowLeg.pos, foot.pos, 0.22);
    const bootMid = new THREE.Vector3().lerpVectors(lowLeg.pos, foot.pos, 0.62);
    const anklePos = foot.pos.clone();
    const vampTip = new THREE.Vector3(foot.pos.x, 0.024, foot.pos.z - 0.068);

    const bootShaftGeo = buildContouredSkinnedTube(
      [
        {
          center: bootRimTop,
          rx: 0.057,
          rz: 0.060,
          vUv: 0.15,
          bones: [lowLeg.idx, foot.idx, 0, 0],
          weights: [0.95, 0.05, 0, 0],
        },
        {
          center: bootMid,
          rx: 0.050,
          rz: 0.054,
          vUv: 0.55,
          bones: [lowLeg.idx, foot.idx, 0, 0],
          weights: [0.80, 0.20, 0, 0],
        },
        {
          center: anklePos,
          rx: 0.049,
          rz: 0.060,
          vUv: 0.82,
          bones: [lowLeg.idx, foot.idx, 0, 0],
          weights: [0.30, 0.70, 0, 0],
        },
        {
          center: vampTip,
          rx: 0.055,
          rz: 0.118,
          vUv: 0.94,
          bones: [foot.idx, lowLeg.idx, 0, 0],
          weights: [0.95, 0.05, 0, 0],
        },
      ],
      12,
      0,
      Math.PI * 2,
      'verticalY'
    );
    addGarmentPart(bootShaftGeo, mats.bootMat, true);

    // Metallic Gold/Jade Knee-Guard Rim on top of boot
    const cuffGeo = buildContouredSkinnedTube(
      [
        {
          center: bootRimTop.clone().add(new THREE.Vector3(0, -0.012, 0)),
          rx: 0.059,
          rz: 0.062,
          vUv: 0.2,
          bones: [lowLeg.idx, 0, 0, 0],
          weights: [1, 0, 0, 0],
        },
        {
          center: bootRimTop.clone().add(new THREE.Vector3(0, 0.014, 0)),
          rx: 0.060,
          rz: 0.063,
          vUv: 0.8,
          bones: [lowLeg.idx, 0, 0, 0],
          weights: [1, 0, 0, 0],
        },
      ],
      12,
      0,
      Math.PI * 2,
      'verticalY'
    );
    addGarmentPart(cuffGeo, mats.trimMat, false);
  }

  // =========================================================================
  // 5. CHARACTER-SPECIFIC HERO VESTMENTS (Yun Tianhe's Fur Vest / Xuanxiao's Immortal Cloak)
  // =========================================================================
  if (theme === 'tianhe' && mats.vestMat && mats.furMat) {
    const vestClear = 0.018; // Strictly outside torsoGeo (+0.010m)!
    const vestGeo = buildContouredSkinnedTube(
      [
        {
          center: new THREE.Vector3(0, waistY + 0.025, slWaist.cz),
          rx: slWaist.rx + vestClear,
          rz: slWaist.rz + vestClear,
          vUv: 0.95,
          bones: [bSpine.idx, bChest.idx, 0, 0],
          weights: [0.70, 0.30, 0, 0],
        },
        {
          center: new THREE.Vector3(0, bChest.pos.y, slChest.cz),
          rx: slChest.rx + vestClear,
          rz: slChest.rz + vestClear,
          vUv: 0.50,
          bones: [bChest.idx, bUpChest.idx, 0, 0],
          weights: [0.55, 0.45, 0, 0],
        },
        {
          center: new THREE.Vector3(0, bUpChest.pos.y + 0.03, slUpChest.cz),
          rx: slUpChest.rx + vestClear,
          rz: slUpChest.rz + vestClear,
          vUv: 0.06,
          bones: [bUpChest.idx, bLSh.idx, bRSh.idx, 0],
          weights: [0.72, 0.14, 0.14, 0],
        },
      ],
      20,
      -Math.PI * 0.76,
      Math.PI * 1.52,
      'verticalY'
    );
    addGarmentPart(vestGeo, mats.vestMat, false);

    // Sculpted Fluffy Sherpa Fur Collar (`青鸾白毛领`) draped cleanly around upper shoulders & neck
    const furCollarGeo = buildContouredSkinnedTube(
      [
        {
          center: new THREE.Vector3(0, bUpChest.pos.y + 0.035, slUpChest.cz + 0.006),
          rx: slUpChest.rx + vestClear + 0.008,
          rz: slUpChest.rz + vestClear + 0.008,
          vUv: 0.25,
          pleatAmp: 0.07,
          bones: [bUpChest.idx, bNeck.idx, bLSh.idx, bRSh.idx],
          weights: [0.55, 0.25, 0.10, 0.10],
        },
        {
          center: new THREE.Vector3(0, collarTopY + 0.015, bNeck.pos.z + 0.008),
          rx: 0.094,
          rz: 0.092,
          vUv: 0.75,
          pleatAmp: 0.09,
          bones: [bUpChest.idx, bNeck.idx, 0, 0],
          weights: [0.40, 0.60, 0, 0],
        },
      ],
      18,
      -Math.PI * 0.70,
      Math.PI * 1.40,
      'verticalY'
    );
    addGarmentPart(furCollarGeo, mats.furMat, false);
  }

  if (mats.cloakMat) {
    // Multi-Bone Skinned Flowing Immortal Cloak (`仙宗织金大氅` on +Z back!)
    const cloakRows = 6;
    const cloakCols = 8;
    const cPos: number[] = [];
    const cUv: number[] = [];
    const cIdx: number[] = [];
    const cWgt: number[] = [];
    const cTri: number[] = [];

    const yTop = bUpChest.pos.y + 0.04;
    const yBot = ankleY + 0.07;
    const backStartZ = slUpChest.cz + slUpChest.rz + 0.022;
    const backEndZ = slHips.cz + slHips.rz + 0.14;

    for (let r = 0; r <= cloakRows; r++) {
      const v = r / cloakRows;
      const y = THREE.MathUtils.lerp(yTop, yBot, v);
      const halfW = THREE.MathUtils.lerp(slUpChest.rx * 1.05, slUpChest.rx * 1.95, v);
      const zBack = THREE.MathUtils.lerp(backStartZ, backEndZ, v);
      const legInf = THREE.MathUtils.smoothstep(v, 0.35, 1.0) * 0.55;

      for (let c = 0; c <= cloakCols; c++) {
        const u = c / cloakCols;
        const nx = (u - 0.5) * 2;
        const px = nx * halfW;
        const drape = Math.cos(nx * Math.PI * 0.5) * 0.036 + Math.sin(u * Math.PI * 5) * 0.012 * v;
        cPos.push(px, y, zBack + drape);
        cUv.push(u, v);

        const legBone = nx >= 0 ? bRUpLeg.idx : bLUpLeg.idx;
        cIdx.push(bUpChest.idx, bHips.idx, legBone, 0);
        cWgt.push((1 - v) * (1 - legInf), v * (1 - legInf), legInf, 0);
      }
    }
    const cStride = cloakCols + 1;
    for (let r = 0; r < cloakRows; r++) {
      for (let c = 0; c < cloakCols; c++) {
        const a = r * cStride + c;
        const b = (r + 1) * cStride + c;
        const d = r * cStride + (c + 1);
        const e = (r + 1) * cStride + (c + 1);
        cTri.push(a, b, d);
        cTri.push(b, e, d);
      }
    }
    const cloakGeo = new THREE.BufferGeometry();
    cloakGeo.setAttribute('position', new THREE.Float32BufferAttribute(cPos, 3));
    cloakGeo.setAttribute('uv', new THREE.Float32BufferAttribute(cUv, 2));
    cloakGeo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(cIdx, 4));
    cloakGeo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(cWgt, 4));
    cloakGeo.setIndex(cTri);
    cloakGeo.computeVertexNormals();
    addGarmentPart(cloakGeo, mats.cloakMat, true);
  }

  return createdMeshes;
}
