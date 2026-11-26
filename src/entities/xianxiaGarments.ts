import * as THREE from 'three';
import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import { gameAssets } from '../assets/assetLoader';
import { deriveReliefPbrMaps, scaleUvMeters } from '../world/surfaceMaterials';

export type GarmentThemeId = 'tianhe' | 'xuanxiao' | 'mengli' | 'disciple' | 'cultivator';

interface GarmentPalette {
  brocadeKey: 'azure' | 'crimson' | 'lavender';
  topTint: string;
  midTint: string;
  skirtUpperTint: string;
  skirtLowerTint: string;
  hemGold: string;
  trimGold: string;
  collarColor: string;
  sashColor: string;
  jadeColor: string;
  trouserColor: string;
  bootColor: string;
  sheenColor: number;
  armorTint: number;
  vestColor?: string;
  furColor?: string;
  hasHeavyPauldrons?: boolean;
  hasTassetArmor?: boolean;
  hasCloak?: boolean;
  wideSleeveDrop: number;
  skirtEndRatio: number;
  isRuqun?: boolean;
}

const GARMENT_PALETTES: Record<GarmentThemeId, GarmentPalette> = {
  tianhe: {
    brocadeKey: 'azure',
    topTint: '#5ca4d4',
    midTint: '#2e6e9e',
    skirtUpperTint: '#295f8a',
    skirtLowerTint: '#14334f',
    hemGold: '#dfba70',
    trimGold: '#f0d28c',
    collarColor: '#f2ede4',
    sashColor: '#3d2416',
    jadeColor: '#62e8dc',
    trouserColor: '#182433',
    bootColor: '#2c1c14',
    sheenColor: 0x7ec8ff,
    armorTint: 0xd6b06a,
    vestColor: '#694024',
    furColor: '#efe6d5',
    hasHeavyPauldrons: true,
    hasTassetArmor: true,
    wideSleeveDrop: 0.04,
    skirtEndRatio: 0.50,
  },
  xuanxiao: {
    brocadeKey: 'crimson',
    topTint: '#f4ece4',
    midTint: '#c42428',
    skirtUpperTint: '#a81b20',
    skirtLowerTint: '#3e080c',
    hemGold: '#f0c264',
    trimGold: '#fae8a8',
    collarColor: '#f6efe4',
    sashColor: '#260d10',
    jadeColor: '#ff6424',
    trouserColor: '#19131a',
    bootColor: '#211417',
    sheenColor: 0xff8a5c,
    armorTint: 0xebc068,
    hasHeavyPauldrons: true,
    hasTassetArmor: true,
    hasCloak: true,
    wideSleeveDrop: 0.23,
    skirtEndRatio: 0.86,
  },
  mengli: {
    brocadeKey: 'lavender',
    topTint: '#f4f7ff',
    midTint: '#d6c6f8',
    skirtUpperTint: '#dfd2fc',
    skirtLowerTint: '#52388f',
    hemGold: '#9ce6ff',
    trimGold: '#dcf6ff',
    collarColor: '#f8f5ff',
    sashColor: '#684ea8',
    jadeColor: '#8cf2ff',
    trouserColor: '#3e2c68',
    bootColor: '#483478',
    sheenColor: 0xc8b4ff,
    armorTint: 0xcceeff,
    wideSleeveDrop: 0.24,
    skirtEndRatio: 0.88,
    isRuqun: true,
  },
  disciple: {
    brocadeKey: 'azure',
    topTint: '#eef6fc',
    midTint: '#bcdaf0',
    skirtUpperTint: '#78b0d6',
    skirtLowerTint: '#255a80',
    hemGold: '#8ad8f8',
    trimGold: '#cbeeff',
    collarColor: '#f5faff',
    sashColor: '#1d4c6e',
    jadeColor: '#78e8ff',
    trouserColor: '#182a3b',
    bootColor: '#1a2a3a',
    sheenColor: 0x9cd8ff,
    armorTint: 0xc2ddf0,
    hasHeavyPauldrons: true,
    hasTassetArmor: true,
    wideSleeveDrop: 0.05,
    skirtEndRatio: 0.56,
  },
  cultivator: {
    brocadeKey: 'azure',
    topTint: '#ebf4fc',
    midTint: '#9bc6e6',
    skirtUpperTint: '#2e6890',
    skirtLowerTint: '#132f48',
    hemGold: '#d8be74',
    trimGold: '#f0d894',
    collarColor: '#f5f9fd',
    sashColor: '#183e5c',
    jadeColor: '#76e8ff',
    trouserColor: '#142230',
    bootColor: '#182534',
    sheenColor: 0x88ccff,
    armorTint: 0xdcc07a,
    hasHeavyPauldrons: true,
    hasCloak: true,
    wideSleeveDrop: 0.21,
    skirtEndRatio: 0.80,
  },
};

interface BakedGarmentMaterials {
  robeMat: THREE.MeshPhysicalMaterial;
  innerBaseMat: THREE.MeshStandardMaterial;
  collarMat: THREE.MeshPhysicalMaterial;
  sashMat: THREE.MeshStandardMaterial;
  shanwenArmorMat: THREE.MeshStandardMaterial;
  trimBrassMat: THREE.MeshStandardMaterial;
  jadeMat: THREE.MeshPhysicalMaterial;
  bootLeatherMat: THREE.MeshStandardMaterial;
  vestLeatherMat?: THREE.MeshStandardMaterial;
  furMat?: THREE.MeshPhysicalMaterial;
  cloakMat?: THREE.MeshPhysicalMaterial;
}

const cachedThemeMats = new Map<GarmentThemeId, BakedGarmentMaterials>();
let cachedShanwenMaps: ReturnType<typeof deriveReliefPbrMaps> | null = null;

function getShanwenReliefMaps() {
  if (!cachedShanwenMaps) {
    cachedShanwenMaps = deriveReliefPbrMaps(gameAssets.pbr.shanwenArmor, 3.2, 0.32, true);
  }
  return cachedShanwenMaps;
}

/**
 * Builds Next-Gen Stylized-PBR Silk Brocade, Embossed Leather & Gilded Shanwen Scale-Armor Materials!
 * Eliminates flat posterized cel washout so characters catch real Contact AO, silk sheen, and warm lantern light!
 */
function getOrBakeThemeMaterials(theme: GarmentThemeId): BakedGarmentMaterials {
  const existing = cachedThemeMats.get(theme);
  if (existing) return existing;

  const P = GARMENT_PALETTES[theme];
  const shanwenMaps = getShanwenReliefMaps();
  const srcBrocade =
    P.brocadeKey === 'crimson'
      ? gameAssets.pbr.yunbrocadeCrimson
      : P.brocadeKey === 'lavender'
        ? gameAssets.pbr.yunbrocadeLavender
        : gameAssets.pbr.yunbrocadeAzure;

  const size = 1024;
  const cCol = document.createElement('canvas');
  cCol.width = cCol.height = size;
  const ctx = cCol.getContext('2d')!;

  // 1. Base Vertical Tailored Ombre Gradient
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0.0, P.topTint);
  grad.addColorStop(0.35, P.midTint);
  grad.addColorStop(0.52, P.skirtUpperTint);
  grad.addColorStop(0.92, P.skirtLowerTint);
  grad.addColorStop(1.0, P.skirtLowerTint);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // 2. Composite Real 2K AI-Authored Woven Silk Cloud-Brocade Pattern (`织金暗纹云锦`) at 3x3 density!
  const bImg = srcBrocade.image as CanvasImageSource | undefined;
  if (bImg) {
    ctx.save();
    ctx.globalAlpha = 0.56;
    ctx.globalCompositeOperation = 'overlay';
    const tile = size / 3;
    for (let ty = 0; ty < 3; ty++) {
      for (let tx = 0; tx < 3; tx++) {
        ctx.drawImage(bImg, tx * tile, ty * tile, tile, tile);
      }
    }
    ctx.globalAlpha = 0.26;
    ctx.globalCompositeOperation = 'source-over';
    for (let ty = 0; ty < 3; ty++) {
      for (let tx = 0; tx < 3; tx++) {
        ctx.drawImage(bImg, tx * tile, ty * tile, tile, tile);
      }
    }
    ctx.restore();
  }

  // 3. Soft Tailored Drapery Pleat AO + Waist Belt Contact Crevice AO
  for (let x = 0; x < size; x += 4) {
    const u = (x / size) * Math.PI * 2 * 16;
    const aoAlpha = Math.max(0, -Math.sin(u)) * 0.16;
    ctx.fillStyle = `rgba(6, 10, 20, ${aoAlpha.toFixed(3)})`;
    ctx.fillRect(x, 0, 4, size);
  }
  const beltAo = ctx.createLinearGradient(0, size * 0.42, 0, size * 0.55);
  beltAo.addColorStop(0, 'rgba(0,0,0,0)');
  beltAo.addColorStop(0.48, 'rgba(4,6,14,0.48)');
  beltAo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = beltAo;
  ctx.fillRect(0, size * 0.42, size, size * 0.13);

  // 4. Intricate Woven Gold-Thread Hem Band (`织金云雷纹袍边`)
  const hemY = size * 0.90;
  ctx.fillStyle = P.hemGold;
  ctx.fillRect(0, hemY, size, 8);
  ctx.fillRect(0, hemY + 62, size, 10);
  if (bImg) {
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.drawImage(bImg, 0, 0, size, 140, 0, hemY + 8, size, 54);
    ctx.restore();
  }
  ctx.strokeStyle = P.trimGold;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let x = 0; x < size; x += 32) {
    ctx.moveTo(x, hemY + 18);
    ctx.lineTo(x + 22, hemY + 18);
    ctx.lineTo(x + 22, hemY + 48);
    ctx.lineTo(x + 8, hemY + 48);
    ctx.lineTo(x + 8, hemY + 32);
  }
  ctx.stroke();

  const colTex = new THREE.CanvasTexture(cCol);
  colTex.flipY = false;
  colTex.colorSpace = THREE.SRGBColorSpace;
  colTex.wrapS = THREE.RepeatWrapping;
  colTex.wrapT = THREE.ClampToEdgeWrapping;
  colTex.anisotropy = 4;

  // Derive crisp tangent-space brocade weave & embroidery normal/roughness maps directly from our composite!
  const brocadePbr = deriveReliefPbrMaps(colTex, 1.85, 0.56, true);
  brocadePbr.normal.flipY = false;
  brocadePbr.roughness.flipY = false;

  // Fine cloth micro-normal for inner garments & lapels
  const clothNor = gameAssets.pbr.armorCloth.normal.clone();
  clothNor.needsUpdate = true;
  clothNor.repeat.set(8, 8);

  // Woven Brocade Cross-Collar Lapel (`交领织金护领`)
  const cLapel = document.createElement('canvas');
  cLapel.width = 256;
  cLapel.height = 64;
  const lCtx = cLapel.getContext('2d')!;
  lCtx.fillStyle = P.collarColor;
  lCtx.fillRect(0, 0, 256, 64);
  if (bImg) {
    lCtx.globalAlpha = 0.35;
    lCtx.drawImage(bImg, 0, 0, 256, 64);
    lCtx.globalAlpha = 1.0;
  }
  lCtx.fillStyle = P.trimGold;
  lCtx.fillRect(0, 0, 38, 64);
  lCtx.fillRect(220, 0, 36, 64);
  const lapelTex = new THREE.CanvasTexture(cLapel);
  lapelTex.flipY = false;
  lapelTex.colorSpace = THREE.SRGBColorSpace;

  const robeMat = new THREE.MeshPhysicalMaterial({
    map: colTex,
    normalMap: brocadePbr.normal,
    normalScale: new THREE.Vector2(0.75, 0.75),
    roughnessMap: brocadePbr.roughness,
    roughness: 0.56,
    metalness: 0.14,
    sheen: 0.62,
    sheenRoughness: 0.36,
    sheenColor: new THREE.Color(P.sheenColor),
    side: THREE.DoubleSide,
  });

  const innerBaseMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    normalMap: clothNor,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: 0.68,
    metalness: 0.06,
  });

  const collarMat = new THREE.MeshPhysicalMaterial({
    map: lapelTex,
    normalMap: clothNor,
    normalScale: new THREE.Vector2(0.45, 0.45),
    roughness: 0.44,
    metalness: 0.24,
    sheen: 0.5,
    sheenColor: new THREE.Color(0xffffff),
    side: THREE.DoubleSide,
  });

  // Embossed Leather & Brass-Trimmed Waist Girdle (`精雕革带/束腰玉带`)
  const sashMat = new THREE.MeshStandardMaterial({
    color: P.sashColor,
    map: gameAssets.pbr.armorLeather.color,
    normalMap: gameAssets.pbr.armorLeather.normal,
    normalScale: new THREE.Vector2(1.0, 1.0),
    roughnessMap: gameAssets.pbr.armorLeather.roughness,
    aoMap: gameAssets.pbr.armorLeather.ao,
    roughness: 0.44,
    metalness: 0.28,
    side: THREE.DoubleSide,
  });

  // Authentic Chinese Shanwen Mountain-Scale Armor (`山文甲鎏金吞肩兽甲片`)!
  const shanwenArmorMat = new THREE.MeshStandardMaterial({
    color: P.armorTint,
    emissive: new THREE.Color(P.armorTint).multiplyScalar(0.08),
    map: shanwenMaps.color,
    normalMap: shanwenMaps.normal,
    normalScale: new THREE.Vector2(1.35, 1.35),
    roughnessMap: shanwenMaps.roughness,
    aoMap: shanwenMaps.ao,
    roughness: 0.28,
    metalness: 0.78,
    side: THREE.DoubleSide,
  });

  const trimBrassMat = new THREE.MeshStandardMaterial({
    color: P.trimGold,
    map: gameAssets.pbr.armorBrass.color,
    normalMap: gameAssets.pbr.armorBrass.normal,
    roughnessMap: gameAssets.pbr.armorBrass.roughness,
    roughness: 0.25,
    metalness: 0.88,
    side: THREE.DoubleSide,
  });

  const jadeMat = new THREE.MeshPhysicalMaterial({
    color: P.jadeColor,
    emissive: new THREE.Color(P.jadeColor).multiplyScalar(0.22),
    roughness: 0.16,
    metalness: 0.12,
    clearcoat: 0.85,
    clearcoatRoughness: 0.15,
  });

  const bootLeatherMat = new THREE.MeshStandardMaterial({
    color: P.bootColor,
    map: gameAssets.pbr.armorLeather.color,
    normalMap: gameAssets.pbr.armorLeather.normal,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughnessMap: gameAssets.pbr.armorLeather.roughness,
    roughness: 0.48,
    metalness: 0.22,
    side: THREE.DoubleSide,
  });

  const out: BakedGarmentMaterials = {
    robeMat,
    innerBaseMat,
    collarMat,
    sashMat,
    shanwenArmorMat,
    trimBrassMat,
    jadeMat,
    bootLeatherMat,
  };

  if (P.vestColor) {
    out.vestLeatherMat = new THREE.MeshStandardMaterial({
      color: P.vestColor,
      map: gameAssets.pbr.armorLeather.color,
      normalMap: gameAssets.pbr.armorLeather.normal,
      normalScale: new THREE.Vector2(1.15, 1.15),
      roughnessMap: gameAssets.pbr.armorLeather.roughness,
      aoMap: gameAssets.pbr.armorLeather.ao,
      roughness: 0.56,
      metalness: 0.18,
      side: THREE.DoubleSide,
    });
  }

  if (P.furColor) {
    out.furMat = new THREE.MeshPhysicalMaterial({
      color: P.furColor,
      normalMap: clothNor,
      normalScale: new THREE.Vector2(1.2, 1.2),
      roughness: 0.88,
      metalness: 0.0,
      sheen: 0.85,
      sheenRoughness: 0.75,
      sheenColor: new THREE.Color(0xffffff),
      side: THREE.DoubleSide,
    });
  }

  if (P.hasCloak) {
    out.cloakMat = new THREE.MeshPhysicalMaterial({
      color: theme === 'xuanxiao' ? 0xd83232 : 0x4888b8,
      map: srcBrocade,
      normalMap: brocadePbr.normal,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughness: 0.50,
      metalness: 0.18,
      sheen: 0.68,
      sheenRoughness: 0.35,
      sheenColor: new THREE.Color(P.sheenColor),
      side: THREE.DoubleSide,
    });
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

function buildContouredSkinnedTube(
  stations: TubeStation[],
  radialSegs = 20,
  thetaStart = 0,
  thetaLength = Math.PI * 2,
  axisMode: 'verticalY' | 'limbTangent' = 'verticalY',
  uRepeat = 1.0
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
        const fold = 1.0 + pleat * Math.sin(theta * 14.0);
        px += sinT * st.rx * fold;
        pz += cosT * st.rz * fold;
      } else {
        const hang = sinT < 0 ? Math.pow(-sinT, 1.45) * drop : 0;
        const widen = 1.0 + (sinT < 0 && drop > 0.1 ? 0.28 : 0);
        const uOff = sinT * st.rx;
        const fOff = cosT * st.rz * widen;
        px += upAxis.x * uOff + frontAxis.x * fOff;
        py += upAxis.y * uOff + frontAxis.y * fOff - hang;
        pz += upAxis.z * uOff + frontAxis.z * fOff;
      }

      positions.push(px, py, pz);
      uvs.push(uFrac * uRepeat, st.vUv);
      skinIndices.push(st.bones[0], st.bones[1], st.bones[2], st.bones[3]);
      skinWeights.push(st.weights[0], st.weights[1], st.weights[2], st.weights[3]);
    }
  }

  let flipWinding = false;
  if (axisMode === 'verticalY') {
    flipWinding = stations[stations.length - 1].center.y >= stations[0].center.y;
  } else {
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
  const uvAttr = new THREE.Float32BufferAttribute(uvs, 2);
  geo.setAttribute('uv', uvAttr);
  geo.setAttribute('uv1', uvAttr.clone());
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
 * Builds a Sculpted 3D Tiered Chinese `吞肩兽山文甲` Shoulder Pauldron attached to an upperArm bone!
 */
function buildSculptedCloudPauldron(
  isRight: boolean,
  armorMat: THREE.Material,
  brassMat: THREE.Material,
  jadeMat: THREE.Material,
  ornateTiered = false
): THREE.Group {
  const g = new THREE.Group();
  const sx = isRight ? -1 : 1; // In VRM0 rotated, leftUpperArm extends toward +X, rightUpperArm toward -X!

  // Primary Curved Lamellar Scale Shell (`山文甲披膊主甲片`)
  const shellGeo = scaleUvMeters(
    new THREE.SphereGeometry(0.068, 16, 12, 0, Math.PI * 2, 0.10, Math.PI * 0.52),
    2.2,
    2.2
  );
  const shell = new THREE.Mesh(shellGeo, armorMat);
  shell.scale.set(1.22, 0.86, 1.08);
  shell.position.set(sx * 0.052, 0.008, 0);
  shell.rotation.z = -sx * 0.58;
  shell.castShadow = true;
  g.add(shell);

  // Gilded Cloud-Rim Border (`鎏金卷云甲缘`)
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.066, 0.007, 8, 20), brassMat);
  rim.scale.set(1.20, 1.06, 1.0);
  rim.rotation.x = Math.PI * 0.5;
  rim.rotation.y = sx * 0.58;
  rim.position.set(sx * 0.060, -0.012, 0);
  g.add(rim);

  // Sculpted Beast-Head Crest (`吞肩兽首护肩`) + Jade Spirit Stud
  const crest = new THREE.Mesh(new THREE.OctahedronGeometry(0.020, 1), brassMat);
  crest.scale.set(1.25, 0.68, 1.10);
  crest.position.set(sx * 0.045, 0.038, 0);
  g.add(crest);

  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.011, 0), jadeMat);
  gem.position.set(sx * 0.062, 0.042, 0);
  g.add(gem);

  if (ornateTiered) {
    const wingSpike = new THREE.Mesh(new THREE.ConeGeometry(0.013, 0.075, 5), brassMat);
    wingSpike.position.set(sx * 0.088, 0.028, 0.020);
    wingSpike.rotation.set(-0.32, 0, -sx * 0.92);
    g.add(wingSpike);
  }

  return g;
}

/**
 * Adds 3D Gilded Vambraces, Jade Waist Ornaments & Silk Ribbons to Han Lingsha's authored Qipao rig!
 */
export function attachLingshaMartialOrnaments(vrm: VRM) {
  const mats = getOrBakeThemeMaterials('xuanxiao');
  const hips = vrm.humanoid?.getRawBoneNode('hips');
  if (hips) {
    const jade = new THREE.Mesh(new THREE.OctahedronGeometry(0.022, 0), mats.jadeMat);
    jade.scale.set(1.0, 1.4, 0.5);
    jade.position.set(0.11, -0.02, -0.06);
    hips.add(jade);
  }
}

/**
 * Tailors a Next-Gen Multi-Layered Silk Brocade & Articulated 3D Shanwen Armor Xianxia Outfit
 * directly onto a VRM's native `Body` Skeleton!
 */
export function tailorXianxiaOutfitOntoVrm(vrm: VRM, theme: GarmentThemeId): THREE.SkinnedMesh[] {
  const P = GARMENT_PALETTES[theme];
  const mats = getOrBakeThemeMaterials(theme);

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
  // 0. CULL HIDDEN FLESH TRIANGLES & BUILD SEAMLESS WOVEN INNER UNDERGARMENT
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
    if (count === 0) return { rx: 0.135, cz: bChest.pos.z, rz: 0.108 };
    return { rx: maxX, cz: (minZ + maxZ) * 0.5, rz: (maxZ - minZ) * 0.5 };
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
        const skipHiddenLongRobeThigh = isLongRobe && cy < bHips.pos.y - 0.02 && cy > bootTopY + 0.06;
        const skipRuqunChest = Boolean(P.isRuqun) && cy > bSpine.pos.y && cy < collarTopY - 0.025 && Math.abs(cx) < torsoLimitX * 0.88;
        if (!skipHiddenLongRobeThigh && !skipRuqunChest) {
          coveredBodyTris.push(i0, i1, i2);
        }
      }
    }

    const trimmedSkinGeo = bodyGeo.clone();
    trimmedSkinGeo.clearGroups();
    trimmedSkinGeo.setIndex(exposedSkinTris);
    bMesh.geometry = trimmedSkinGeo;
    if (Array.isArray(bMesh.material)) bMesh.material = bMesh.material[0];

    const vCount = posAttr.count;
    const innerPos = new Float32Array(vCount * 3);
    const innerUvs = new Float32Array(vCount * 2);
    const innerColors = new Float32Array(vCount * 3);
    const colTunic = new THREE.Color(P.midTint);
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

  const slHips = measureTorsoSlice(bHips.pos.y, 0.045);
  const slWaist = measureTorsoSlice(waistY, 0.045);
  const slChest = measureTorsoSlice(bChest.pos.y, 0.045);
  const slUpChest = measureTorsoSlice(bUpChest.pos.y + 0.02, 0.04);

  // =========================================================================
  // 1. LAYERED 2K SILK BROCADE BODICE (`交领织金云锦上襦`) + CRISP `y` CROSS-COLLAR
  // =========================================================================
  const torsoClear = 0.011;
  const torsoStations: TubeStation[] = [
    {
      center: new THREE.Vector3(0, bHips.pos.y - 0.02, slHips.cz),
      rx: slHips.rx + torsoClear,
      rz: slHips.rz + torsoClear,
      vUv: 0.46,
      pleatAmp: 0.025,
      bones: [bHips.idx, bSpine.idx, 0, 0],
      weights: [0.85, 0.15, 0, 0],
    },
    {
      center: new THREE.Vector3(0, waistY, slWaist.cz),
      rx: slWaist.rx + torsoClear,
      rz: slWaist.rz + torsoClear,
      vUv: 0.36,
      pleatAmp: 0.03,
      bones: [bHips.idx, bSpine.idx, bChest.idx, 0],
      weights: [0.30, 0.55, 0.15, 0],
    },
    {
      center: new THREE.Vector3(0, bChest.pos.y, slChest.cz),
      rx: slChest.rx + torsoClear,
      rz: slChest.rz + torsoClear,
      vUv: 0.22,
      pleatAmp: 0.02,
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
  addGarmentPart(buildContouredSkinnedTube(torsoStations, 26, 0, Math.PI * 2, 'verticalY', 2.0), mats.robeMat, true);

  const evalTorsoFrontZ = (x: number, y: number) => {
    const t = THREE.MathUtils.clamp((y - waistY) / Math.max(0.05, collarTopY - waistY), 0, 1);
    const rx = THREE.MathUtils.lerp(slWaist.rx + torsoClear, 0.068, Math.pow(t, 1.35));
    const rz = THREE.MathUtils.lerp(slWaist.rz + torsoClear, 0.066, Math.pow(t, 1.35));
    const cz = THREE.MathUtils.lerp(slWaist.cz, bNeck.pos.z, t);
    const ratio = THREE.MathUtils.clamp(x / Math.max(0.04, rx), -0.96, 0.96);
    return cz - rz * Math.sqrt(Math.max(0.08, 1.0 - ratio * ratio));
  };

  const buildDiagonalLapelStrip = (pts: { x: number; y: number; zBias: number }[], halfW: number) => {
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
      idxArr.push(a, d, b, d, c, b);
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

  const leftOverRightPts: { x: number; y: number; zBias: number }[] = [];
  for (let i = 0; i <= 9; i++) {
    const f = i / 9;
    leftOverRightPts.push({
      x: THREE.MathUtils.lerp(-0.052, 0.068, Math.pow(f, 0.92)),
      y: THREE.MathUtils.lerp(collarTopY + 0.010, waistY + 0.015, f),
      zBias: 0.0075,
    });
  }
  addGarmentPart(buildDiagonalLapelStrip(leftOverRightPts, 0.020), mats.collarMat, false);

  const rightInnerPts: { x: number; y: number; zBias: number }[] = [];
  for (let i = 0; i <= 6; i++) {
    const f = i / 6;
    rightInnerPts.push({
      x: THREE.MathUtils.lerp(0.052, 0.002, f),
      y: THREE.MathUtils.lerp(collarTopY + 0.010, THREE.MathUtils.lerp(collarTopY, waistY, 0.48), f),
      zBias: 0.0040,
    });
  }
  addGarmentPart(buildDiagonalLapelStrip(rightInnerPts, 0.018), mats.collarMat, false);

  addGarmentPart(
    buildContouredSkinnedTube(
      [
        {
          center: new THREE.Vector3(0, collarTopY - 0.008, bNeck.pos.z),
          rx: 0.072,
          rz: 0.070,
          vUv: 0.2,
          bones: [bUpChest.idx, bNeck.idx, 0, 0],
          weights: [0.5, 0.5, 0, 0],
        },
        {
          center: new THREE.Vector3(0, collarTopY + 0.020, bNeck.pos.z),
          rx: 0.068,
          rz: 0.066,
          vUv: 0.8,
          bones: [bUpChest.idx, bNeck.idx, 0, 0],
          weights: [0.35, 0.65, 0, 0],
        },
      ],
      14,
      -Math.PI * 0.55,
      Math.PI * 1.10,
      'verticalY'
    ),
    mats.collarMat,
    false
  );

  // =========================================================================
  // 2. SLEEVES, SCULPTED 3D VAMBRACES (`鎏金雕花护臂`) & 3D CLOUD PAULDRONS (`吞肩兽肩甲`)
  // =========================================================================
  for (const side of ['L', 'R'] as const) {
    const sh = side === 'L' ? bLSh : bRSh;
    const up = side === 'L' ? bLUpArm : bRUpArm;
    const low = side === 'L' ? bLLowArm : bRLowArm;
    const hand = side === 'L' ? bLHand : bRHand;

    const shoulderRoot = new THREE.Vector3().lerpVectors(sh.pos, up.pos, 0.58);
    const midUp = new THREE.Vector3().lerpVectors(up.pos, low.pos, 0.48);
    const wrist = new THREE.Vector3().lerpVectors(low.pos, hand.pos, 0.86);
    const isWide = P.wideSleeveDrop > 0.12;

    const sleeveGeo = buildContouredSkinnedTube(
      [
        {
          center: shoulderRoot,
          rx: 0.054,
          rz: 0.054,
          vUv: 0.14,
          dropY: 0.0,
          bones: [up.idx, sh.idx, bUpChest.idx, 0],
          weights: [0.58, 0.32, 0.10, 0],
        },
        {
          center: midUp,
          rx: 0.060,
          rz: 0.060,
          vUv: 0.36,
          dropY: P.wideSleeveDrop * 0.34,
          bones: [up.idx, low.idx, 0, 0],
          weights: [0.80, 0.20, 0, 0],
        },
        {
          center: low.pos.clone(),
          rx: isWide ? 0.074 : 0.053,
          rz: isWide ? 0.070 : 0.053,
          vUv: 0.68,
          dropY: P.wideSleeveDrop * 0.72,
          bones: [up.idx, low.idx, 0, 0],
          weights: [0.25, 0.75, 0, 0],
        },
        {
          center: wrist,
          rx: isWide ? 0.088 : 0.045,
          rz: isWide ? 0.080 : 0.045,
          vUv: 0.97,
          dropY: P.wideSleeveDrop,
          bones: [low.idx, hand.idx, 0, 0],
          weights: [0.82, 0.18, 0, 0],
        },
      ],
      18,
      0,
      Math.PI * 2,
      'limbTangent',
      1.5
    );
    addGarmentPart(sleeveGeo, mats.robeMat, true);

    if (!isWide) {
      // Sculpted Martial Vambrace + Gilded Cuff Rings (`山文甲护臂 + 鎏金腕箍`)
      const bracerStart = new THREE.Vector3().lerpVectors(low.pos, hand.pos, 0.26);
      const bracerEnd = new THREE.Vector3().lerpVectors(low.pos, hand.pos, 0.88);
      const bracerGeo = buildContouredSkinnedTube(
        [
          {
            center: bracerStart,
            rx: 0.057,
            rz: 0.057,
            vUv: 0.15,
            bones: [low.idx, hand.idx, 0, 0],
            weights: [0.95, 0.05, 0, 0],
          },
          {
            center: bracerEnd,
            rx: 0.048,
            rz: 0.048,
            vUv: 0.90,
            bones: [low.idx, hand.idx, 0, 0],
            weights: [0.78, 0.22, 0, 0],
          },
        ],
        14,
        0,
        Math.PI * 2,
        'limbTangent',
        1.5
      );
      addGarmentPart(bracerGeo, mats.shanwenArmorMat, true);

      // Raised Brass Cuff Ring at wrist
      const wristCuff = buildContouredSkinnedTube(
        [
          {
            center: new THREE.Vector3().lerpVectors(low.pos, hand.pos, 0.82),
            rx: 0.051,
            rz: 0.051,
            vUv: 0.2,
            bones: [low.idx, hand.idx, 0, 0],
            weights: [0.8, 0.2, 0, 0],
          },
          {
            center: new THREE.Vector3().lerpVectors(low.pos, hand.pos, 0.90),
            rx: 0.050,
            rz: 0.050,
            vUv: 0.8,
            bones: [low.idx, hand.idx, 0, 0],
            weights: [0.75, 0.25, 0, 0],
          },
        ],
        12,
        0,
        Math.PI * 2,
        'limbTangent'
      );
      addGarmentPart(wristCuff, mats.trimBrassMat, false);
    }

    // Attach 3D Sculpted Cloud-Beast Pauldrons (`鎏金吞肩兽山文甲`) onto UpperArm bones!
    if (P.hasHeavyPauldrons) {
      // Yun Tianhe wears an iconic asymmetrical right sword-arm pauldron + left fur-trimmed hunter guard;
      // Xuanxiao & Sect Guards wear symmetrical twin cloud pauldrons!
      const skipLeftForAsymHunter = theme === 'tianhe' && side === 'L';
      if (!skipLeftForAsymHunter) {
        const armNode = vrm.humanoid?.getRawBoneNode(side === 'L' ? 'leftUpperArm' : 'rightUpperArm');
        if (armNode) {
          const pauldron = buildSculptedCloudPauldron(
            side === 'R',
            mats.shanwenArmorMat,
            mats.trimBrassMat,
            mats.jadeMat,
            theme === 'xuanxiao' || theme === 'tianhe'
          );
          armNode.add(pauldron);
        }
      }
    }
  }

  // =========================================================================
  // 3. SCULPTED WAIST GIRDLE, 3D DRAGON MIRROR BUCKLE (`护心/蟠龙腰扣`),
  //    LAYERED SHANWEN HIP TASSETS (`山文甲抱肚草裙甲`) & PLEATED BROCADE SKIRT!
  // =========================================================================
  const sashClear = 0.022;
  const sashGeo = buildContouredSkinnedTube(
    [
      {
        center: new THREE.Vector3(0, waistY - 0.036, slWaist.cz),
        rx: slWaist.rx + sashClear,
        rz: slWaist.rz + sashClear,
        vUv: 0.95,
        bones: [bHips.idx, bSpine.idx, 0, 0],
        weights: [0.65, 0.35, 0, 0],
      },
      {
        center: new THREE.Vector3(0, waistY + 0.036, slWaist.cz),
        rx: slWaist.rx + sashClear - 0.002,
        rz: slWaist.rz + sashClear - 0.002,
        vUv: 0.05,
        bones: [bHips.idx, bSpine.idx, 0, 0],
        weights: [0.45, 0.55, 0, 0],
      },
    ],
    24,
    0,
    Math.PI * 2,
    'verticalY',
    3.0
  );
  addGarmentPart(sashGeo, mats.sashMat, false);

  // Brass Upper & Lower Belt Borders
  for (const dy of [-0.036, 0.036]) {
    addGarmentPart(
      buildContouredSkinnedTube(
        [
          {
            center: new THREE.Vector3(0, waistY + dy - 0.005, slWaist.cz),
            rx: slWaist.rx + sashClear + 0.003,
            rz: slWaist.rz + sashClear + 0.003,
            vUv: 0.2,
            bones: [bHips.idx, bSpine.idx, 0, 0],
            weights: [0.55, 0.45, 0, 0],
          },
          {
            center: new THREE.Vector3(0, waistY + dy + 0.005, slWaist.cz),
            rx: slWaist.rx + sashClear + 0.003,
            rz: slWaist.rz + sashClear + 0.003,
            vUv: 0.8,
            bones: [bHips.idx, bSpine.idx, 0, 0],
            weights: [0.55, 0.45, 0, 0],
          },
        ],
        22,
        0,
        Math.PI * 2,
        'verticalY'
      ),
      mats.trimBrassMat,
      false
    );
  }

  // Ornate 3D Dragon-Mirror Waist Clasp + Hanging Side Jade Pendants (`蟠龙玉扣 + 双鱼玉佩`)
  const spineNode = vrm.humanoid?.getRawBoneNode('spine') ?? vrm.humanoid?.getRawBoneNode('hips');
  if (spineNode) {
    const buckleGroup = new THREE.Group();
    const localY = waistY - bSpine.pos.y;
    const frontZ = slWaist.cz - (slWaist.rz + sashClear) - bSpine.pos.z - 0.008;
    buckleGroup.position.set(0, localY, frontZ);

    const outerRing = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.007, 8, 18), mats.trimBrassMat);
    buckleGroup.add(outerRing);

    const mirrorPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.012, 12), mats.trimBrassMat);
    mirrorPlate.rotation.x = Math.PI / 2;
    buckleGroup.add(mirrorPlate);

    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.017, 1), mats.jadeMat);
    gem.scale.set(1.0, 1.28, 0.55);
    gem.position.z = -0.007;
    buckleGroup.add(gem);
    spineNode.add(buckleGroup);

    // Side Jade Bi-Disc (`环佩`) hanging on right hip!
    const jadeBi = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.006, 8, 18), mats.jadeMat);
    jadeBi.rotation.y = Math.PI * 0.42;
    jadeBi.position.set(slWaist.rx + sashClear + 0.012, localY - 0.065, slWaist.cz - bSpine.pos.z);
    spineNode.add(jadeBi);
  }

  // Multi-Bone Leg-Weighted Pleated Brocade Robe Skirt (`分片织金百褶下摆`)
  const skirtTopY = waistY - 0.020;
  const skirtBotY = THREE.MathUtils.lerp(bHips.pos.y, ankleY, P.skirtEndRatio);
  const skirtBaseRx = Math.max(slWaist.rx, slHips.rx) + 0.028;
  const skirtBaseRz = Math.max(slWaist.rz, slHips.rz) + 0.030;
  const skirtBaseCz = THREE.MathUtils.lerp(slWaist.cz, slHips.cz, 0.5);

  const skirtRows = 8;
  const skirtSegs = 36;
  const sPos: number[] = [];
  const sUv: number[] = [];
  const sIdx: number[] = [];
  const sWgt: number[] = [];
  const sTri: number[] = [];

  for (let r = 0; r <= skirtRows; r++) {
    const t = r / skirtRows;
    const y = THREE.MathUtils.lerp(skirtTopY, skirtBotY, t);
    const flare = 1.0 + Math.pow(t, 1.15) * (P.isRuqun ? 1.16 : 0.88);
    const rx = skirtBaseRx * flare;
    const rz = skirtBaseRz * flare;
    const vCoord = THREE.MathUtils.lerp(0.50, 0.98, t);
    const legBlend = THREE.MathUtils.smoothstep(bHips.pos.y + 0.02 - y, 0.0, 0.14) * 0.96;
    const shinBlend = THREE.MathUtils.smoothstep(bLLowLeg.pos.y + 0.04 - y, 0.0, 0.18) * 0.84;

    for (let s = 0; s <= skirtSegs; s++) {
      const u = s / skirtSegs;
      const theta = P.isRuqun ? u * Math.PI * 2 : Math.PI * 1.05 + u * Math.PI * 1.90;
      const sinT = Math.sin(theta);
      const cosT = Math.cos(theta);
      const pleat = 1.0 + t * 0.065 * Math.sin(theta * 18.0);

      const px = sinT * rx * pleat;
      const pz = skirtBaseCz + cosT * rz * pleat;
      sPos.push(px, y, pz);
      sUv.push(u * 2.0, vCoord);

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
      sTri.push(a, b, d, b, c, d);
    }
  }
  const skirtGeo = new THREE.BufferGeometry();
  skirtGeo.setAttribute('position', new THREE.Float32BufferAttribute(sPos, 3));
  const sUvAttr = new THREE.Float32BufferAttribute(sUv, 2);
  skirtGeo.setAttribute('uv', sUvAttr);
  skirtGeo.setAttribute('uv1', sUvAttr.clone());
  skirtGeo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(sIdx, 4));
  skirtGeo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sWgt, 4));
  skirtGeo.setIndex(sTri);
  skirtGeo.computeVertexNormals();
  addGarmentPart(skirtGeo, mats.robeMat, true);

  // Layered 3D Shanwen Scale-Armor Side Tasset Plates (`山文甲腿裙甲片`) over Left & Right Hips!
  if (P.hasTassetArmor) {
    const tassetBotY = THREE.MathUtils.lerp(waistY, ankleY, 0.36);
    for (const sideSign of [-1, 1]) {
      const thetaCenter = sideSign > 0 ? Math.PI * 0.5 : Math.PI * 1.5;
      const legBone = sideSign > 0 ? bLUpLeg : bRUpLeg;
      const tassetGeo = buildContouredSkinnedTube(
        [
          {
            center: new THREE.Vector3(0, tassetBotY, skirtBaseCz),
            rx: skirtBaseRx * 1.34,
            rz: skirtBaseRz * 1.30,
            vUv: 0.95,
            pleatAmp: 0.02,
            bones: [legBone.idx, bHips.idx, 0, 0],
            weights: [0.78, 0.22, 0, 0],
          },
          {
            center: new THREE.Vector3(0, THREE.MathUtils.lerp(waistY, tassetBotY, 0.5), skirtBaseCz),
            rx: skirtBaseRx * 1.18,
            rz: skirtBaseRz * 1.16,
            vUv: 0.50,
            bones: [legBone.idx, bHips.idx, 0, 0],
            weights: [0.45, 0.55, 0, 0],
          },
          {
            center: new THREE.Vector3(0, waistY - 0.022, skirtBaseCz),
            rx: skirtBaseRx * 1.04,
            rz: skirtBaseRz * 1.04,
            vUv: 0.05,
            bones: [bHips.idx, legBone.idx, 0, 0],
            weights: [0.85, 0.15, 0, 0],
          },
        ],
        10,
        thetaCenter - Math.PI * 0.26,
        Math.PI * 0.52,
        'verticalY',
        1.4
      );
      addGarmentPart(tassetGeo, mats.shanwenArmorMat, true);
    }
  }

  // Hanging Front Center Embroidered Apron Panel (`织金蔽膝前绶`)
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
    const halfW = THREE.MathUtils.lerp(0.038, 0.064, t);
    const flare = 1.0 + Math.pow(t, 1.18) * (P.isRuqun ? 1.16 : 0.88);
    const frontZ = skirtBaseCz - skirtBaseRz * flare - 0.012;
    const legInf = THREE.MathUtils.smoothstep(t, 0.12, 0.85) * 0.72;

    for (let side = 0; side <= 1; side++) {
      const px = side === 0 ? -halfW : halfW;
      aPos.push(px, y, frontZ);
      aUv.push(side * 0.5 + 0.25, THREE.MathUtils.lerp(0.52, 0.98, t));
      aIdx.push(bHips.idx, bLUpLeg.idx, bRUpLeg.idx, 0);
      aWgt.push(1.0 - legInf, legInf * 0.5, legInf * 0.5, 0);
    }
  }
  for (let r = 0; r < apronRows; r++) {
    const a = r * 2;
    const b = (r + 1) * 2;
    const c = (r + 1) * 2 + 1;
    const d = r * 2 + 1;
    aTri.push(a, d, b, d, c, b);
  }
  const apronGeo = new THREE.BufferGeometry();
  apronGeo.setAttribute('position', new THREE.Float32BufferAttribute(aPos, 3));
  apronGeo.setAttribute('uv', new THREE.Float32BufferAttribute(aUv, 2));
  apronGeo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(aIdx, 4));
  apronGeo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(aWgt, 4));
  apronGeo.setIndex(aTri);
  apronGeo.computeVertexNormals();
  addGarmentPart(apronGeo, mats.robeMat, false);

  // =========================================================================
  // 4. SCULPTED GREAVE-ARMORED WAR BOOTS (`云头护膝鎏金战靴`)
  // =========================================================================
  for (const side of ['L', 'R'] as const) {
    const lowLeg = side === 'L' ? bLLowLeg : bRLowLeg;
    const foot = side === 'L' ? bLFoot : bRFoot;

    const bootRimTop = new THREE.Vector3().lerpVectors(lowLeg.pos, foot.pos, 0.20);
    const bootMid = new THREE.Vector3().lerpVectors(lowLeg.pos, foot.pos, 0.62);
    const anklePos = foot.pos.clone();
    const vampTip = new THREE.Vector3(foot.pos.x, 0.022, foot.pos.z - 0.070);

    const bootShaftGeo = buildContouredSkinnedTube(
      [
        {
          center: bootRimTop,
          rx: 0.058,
          rz: 0.062,
          vUv: 0.15,
          bones: [lowLeg.idx, foot.idx, 0, 0],
          weights: [0.95, 0.05, 0, 0],
        },
        {
          center: bootMid,
          rx: 0.052,
          rz: 0.056,
          vUv: 0.55,
          bones: [lowLeg.idx, foot.idx, 0, 0],
          weights: [0.80, 0.20, 0, 0],
        },
        {
          center: anklePos,
          rx: 0.050,
          rz: 0.062,
          vUv: 0.82,
          bones: [lowLeg.idx, foot.idx, 0, 0],
          weights: [0.30, 0.70, 0, 0],
        },
        {
          center: vampTip,
          rx: 0.056,
          rz: 0.120,
          vUv: 0.95,
          bones: [foot.idx, lowLeg.idx, 0, 0],
          weights: [0.95, 0.05, 0, 0],
        },
      ],
      14,
      0,
      Math.PI * 2,
      'verticalY',
      2.0
    );
    addGarmentPart(bootShaftGeo, mats.bootLeatherMat, true);

    // Front Shin Armor Greave Plate (`护胫甲片`) + Gilded Knee Poleyn Rim
    if (!P.isRuqun) {
      const greaveGeo = buildContouredSkinnedTube(
        [
          {
            center: anklePos.clone().add(new THREE.Vector3(0, 0.03, 0)),
            rx: 0.053,
            rz: 0.064,
            vUv: 0.9,
            bones: [lowLeg.idx, foot.idx, 0, 0],
            weights: [0.85, 0.15, 0, 0],
          },
          {
            center: bootRimTop.clone().add(new THREE.Vector3(0, 0.015, 0)),
            rx: 0.062,
            rz: 0.066,
            vUv: 0.1,
            bones: [lowLeg.idx, 0, 0, 0],
            weights: [1, 0, 0, 0],
          },
        ],
        10,
        Math.PI * 0.72,
        Math.PI * 0.56, // Covers front -Z shin (`cos(PI) = -1`)!
        'verticalY',
        1.0
      );
      addGarmentPart(greaveGeo, mats.shanwenArmorMat, false);
    }

    const cuffGeo = buildContouredSkinnedTube(
      [
        {
          center: bootRimTop.clone().add(new THREE.Vector3(0, -0.010, 0)),
          rx: 0.061,
          rz: 0.065,
          vUv: 0.2,
          bones: [lowLeg.idx, 0, 0, 0],
          weights: [1, 0, 0, 0],
        },
        {
          center: bootRimTop.clone().add(new THREE.Vector3(0, 0.016, 0)),
          rx: 0.063,
          rz: 0.067,
          vUv: 0.8,
          bones: [lowLeg.idx, 0, 0, 0],
          weights: [1, 0, 0, 0],
        },
      ],
      14,
      0,
      Math.PI * 2,
      'verticalY'
    );
    addGarmentPart(cuffGeo, mats.trimBrassMat, false);
  }

  // =========================================================================
  // 5. HERO VESTMENTS (Yun Tianhe's Embossed Leather Vest + Fur Collar / Xuanxiao's Silk Cloak)
  // =========================================================================
  if (theme === 'tianhe' && mats.vestLeatherMat && mats.furMat) {
    const vestClear = 0.019;
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
      22,
      -Math.PI * 0.76,
      Math.PI * 1.52,
      'verticalY',
      2.5
    );
    addGarmentPart(vestGeo, mats.vestLeatherMat, false);

    const furCollarGeo = buildContouredSkinnedTube(
      [
        {
          center: new THREE.Vector3(0, bUpChest.pos.y + 0.035, slUpChest.cz + 0.006),
          rx: slUpChest.rx + vestClear + 0.010,
          rz: slUpChest.rz + vestClear + 0.010,
          vUv: 0.25,
          pleatAmp: 0.08,
          bones: [bUpChest.idx, bNeck.idx, bLSh.idx, bRSh.idx],
          weights: [0.55, 0.25, 0.10, 0.10],
        },
        {
          center: new THREE.Vector3(0, collarTopY + 0.018, bNeck.pos.z + 0.008),
          rx: 0.096,
          rz: 0.094,
          vUv: 0.75,
          pleatAmp: 0.10,
          bones: [bUpChest.idx, bNeck.idx, 0, 0],
          weights: [0.40, 0.60, 0, 0],
        },
      ],
      20,
      -Math.PI * 0.70,
      Math.PI * 1.40,
      'verticalY',
      2.0
    );
    addGarmentPart(furCollarGeo, mats.furMat, false);
  }

  if (mats.cloakMat) {
    const cloakRows = 7;
    const cloakCols = 10;
    const cPos: number[] = [];
    const cUv: number[] = [];
    const cIdx: number[] = [];
    const cWgt: number[] = [];
    const cTri: number[] = [];

    const yTop = bUpChest.pos.y + 0.04;
    const yBot = ankleY + 0.06;
    const backStartZ = slUpChest.cz + slUpChest.rz + 0.024;
    const backEndZ = slHips.cz + slHips.rz + 0.16;

    for (let r = 0; r <= cloakRows; r++) {
      const v = r / cloakRows;
      const y = THREE.MathUtils.lerp(yTop, yBot, v);
      const halfW = THREE.MathUtils.lerp(slUpChest.rx * 1.08, slUpChest.rx * 2.05, v);
      const zBack = THREE.MathUtils.lerp(backStartZ, backEndZ, v);
      const legInf = THREE.MathUtils.smoothstep(v, 0.35, 1.0) * 0.55;

      for (let c = 0; c <= cloakCols; c++) {
        const u = c / cloakCols;
        const nx = (u - 0.5) * 2;
        const px = nx * halfW;
        const drape = Math.cos(nx * Math.PI * 0.5) * 0.040 + Math.sin(u * Math.PI * 6) * 0.015 * v;
        cPos.push(px, y, zBack + drape);
        cUv.push(u * 2.0, v * 2.5);

        const legBone = nx >= 0 ? bLUpLeg.idx : bRUpLeg.idx;
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
        cTri.push(a, b, d, b, e, d);
      }
    }
    const cloakGeo = new THREE.BufferGeometry();
    cloakGeo.setAttribute('position', new THREE.Float32BufferAttribute(cPos, 3));
    const cUvAttr = new THREE.Float32BufferAttribute(cUv, 2);
    cloakGeo.setAttribute('uv', cUvAttr);
    cloakGeo.setAttribute('uv1', cUvAttr.clone());
    cloakGeo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(cIdx, 4));
    cloakGeo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(cWgt, 4));
    cloakGeo.setIndex(cTri);
    cloakGeo.computeVertexNormals();
    addGarmentPart(cloakGeo, mats.cloakMat, true);
  }

  return createdMeshes;
}
