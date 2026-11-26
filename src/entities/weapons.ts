import * as THREE from 'three';
import { gameAssets } from '../assets/assetLoader';
import { scaleUvMeters } from '../world/surfaceMaterials';

export interface WeaponRig {
  group: THREE.Group;
  basePoint: THREE.Object3D;
  tipPoint: THREE.Object3D;
  glowMaterials: THREE.Material[];
}

let cachedEngravedBladeMaps: { runeEmissive: THREE.CanvasTexture; metalNormal: THREE.CanvasTexture } | null = null;
function getEngravedBladeMaps() {
  if (cachedEngravedBladeMaps) return cachedEngravedBladeMaps;

  const cEm = document.createElement('canvas');
  const cNor = document.createElement('canvas');
  cEm.width = cNor.width = 256;
  cEm.height = cNor.height = 1024;
  const eCtx = cEm.getContext('2d')!;
  const nCtx = cNor.getContext('2d')!;

  eCtx.fillStyle = '#000000';
  eCtx.fillRect(0, 0, 256, 1024);
  nCtx.fillStyle = 'rgb(128,128,255)';
  nCtx.fillRect(0, 0, 256, 1024);

  nCtx.fillStyle = 'rgb(94,128,245)';
  nCtx.fillRect(102, 40, 24, 920);
  nCtx.fillStyle = 'rgb(162,128,245)';
  nCtx.fillRect(130, 40, 24, 920);

  eCtx.strokeStyle = '#ffffff';
  eCtx.lineWidth = 4;
  eCtx.beginPath();
  eCtx.moveTo(128, 70);
  eCtx.lineTo(128, 920);
  eCtx.stroke();

  for (let y = 130; y < 880; y += 88) {
    eCtx.strokeRect(112, y, 32, 42);
    eCtx.beginPath();
    eCtx.arc(128, y + 21, 12, 0, Math.PI * 2);
    eCtx.stroke();
  }

  const runeEmissive = new THREE.CanvasTexture(cEm);
  const metalNormal = new THREE.CanvasTexture(cNor);
  cachedEngravedBladeMaps = { runeEmissive, metalNormal };
  return cachedEngravedBladeMaps;
}

function buildSculptedBladeGeometry(
  stations: { y: number; halfWidth: number; halfThick: number }[],
  tipY: number
): THREE.BufferGeometry {
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];

  const stride = 6;
  const y0 = stations[0].y;
  const totalLen = Math.max(0.01, tipY - y0);

  for (const st of stations) {
    const v = (st.y - y0) / totalLen;
    const hw = st.halfWidth;
    const ht = st.halfThick;
    const rw = hw * 0.28;
    const ring: [number, number, number, number][] = [
      [0, st.y, hw, 0.0],
      [ht, st.y, rw, 0.35],
      [ht, st.y, -rw, 0.65],
      [0, st.y, -hw, 1.0],
      [-ht, st.y, -rw, 0.65],
      [-ht, st.y, rw, 0.35],
    ];
    for (const [x, y, z, u] of ring) {
      pos.push(x, y, z);
      uvs.push(u, v);
    }
  }

  const tipIdx = pos.length / 3;
  pos.push(0, tipY, 0);
  uvs.push(0.5, 1.0);

  for (let r = 0; r < stations.length - 1; r++) {
    for (let s = 0; s < stride; s++) {
      const sn = (s + 1) % stride;
      const a = r * stride + s;
      const b = (r + 1) * stride + s;
      const c = (r + 1) * stride + sn;
      const d = r * stride + sn;
      idx.push(a, b, d, b, c, d);
    }
  }

  const lastStart = (stations.length - 1) * stride;
  for (let s = 0; s < stride; s++) {
    const sn = (s + 1) % stride;
    idx.push(lastStart + s, tipIdx, lastStart + sn);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const uvAttr = new THREE.Float32BufferAttribute(uvs, 2);
  geo.setAttribute('uv', uvAttr);
  geo.setAttribute('uv1', uvAttr.clone());
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function buildCurvedCrossguardWing(
  pts: THREE.Vector3[],
  radius: number,
  mat: THREE.Material
): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(pts);
  const m = new THREE.Mesh(scaleUvMeters(new THREE.TubeGeometry(curve, 14, radius, 8, false), 2.0, 1.0), mat);
  m.scale.set(0.55, 1.0, 1.0);
  return m;
}

/**
 * 1. 【望舒剑】(Wangshu Sword) — Forged Kunlun Frost-Steel & Translucent Ice-Jade Twin-Spine Jian
 */
export function createWangshuSword(): WeaponRig {
  const group = new THREE.Group();
  const glowMaterials: THREE.Material[] = [];
  const maps = getEngravedBladeMaps();

  const crystalBladeMat = new THREE.MeshPhysicalMaterial({
    color: 0xb4eeff,
    map: gameAssets.pbr.armorBlade.color,
    normalMap: gameAssets.pbr.armorBlade.normal,
    roughnessMap: gameAssets.pbr.armorBlade.roughness,
    emissive: new THREE.Color(0.18, 0.85, 1.38),
    emissiveMap: maps.runeEmissive,
    emissiveIntensity: 0.95,
    roughness: 0.12,
    metalness: 0.58,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
  });
  glowMaterials.push(crystalBladeMat);

  const coreBeamMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.65, 1.48, 1.95),
  });
  glowMaterials.push(coreBeamMat);

  const silverHiltMat = new THREE.MeshStandardMaterial({
    color: 0xdcebf6,
    map: gameAssets.pbr.armorBrass.color,
    normalMap: gameAssets.pbr.armorBrass.normal,
    roughnessMap: gameAssets.pbr.armorBrass.roughness,
    roughness: 0.22,
    metalness: 0.90,
  });

  const leatherGripMat = new THREE.MeshStandardMaterial({
    color: 0x1b3a54,
    map: gameAssets.pbr.armorLeather.color,
    normalMap: gameAssets.pbr.armorLeather.normal,
    roughnessMap: gameAssets.pbr.armorLeather.roughness,
    roughness: 0.52,
    metalness: 0.15,
  });

  const grip = new THREE.Mesh(
    scaleUvMeters(new THREE.CylinderGeometry(0.017, 0.020, 0.23, 14), 2.0, 3.0),
    leatherGripMat
  );
  grip.scale.set(0.76, 1.0, 1.15);
  grip.position.y = -0.115;
  group.add(grip);

  const pommelRing = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.0075, 8, 18), silverHiltMat);
  pommelRing.rotation.y = Math.PI / 2;
  pommelRing.position.y = -0.25;
  group.add(pommelRing);

  const tasselCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.27, 0),
    new THREE.Vector3(0, -0.36, 0.025),
    new THREE.Vector3(0, -0.46, 0.06),
  ]);
  const tassel = new THREE.Mesh(
    new THREE.TubeGeometry(tasselCurve, 10, 0.0085, 6, false),
    new THREE.MeshStandardMaterial({ color: 0x3ec8f8, roughness: 0.52 })
  );
  group.add(tassel);

  for (const side of [-1, 1]) {
    group.add(
      buildCurvedCrossguardWing(
        [
          new THREE.Vector3(0, 0.01, 0),
          new THREE.Vector3(0, 0.038, side * 0.076),
          new THREE.Vector3(0, 0.115, side * 0.138),
        ],
        0.018,
        silverHiltMat
      )
    );

    const spineGeo = buildSculptedBladeGeometry(
      [
        { y: 0.03, halfWidth: 0.022, halfThick: 0.009 },
        { y: 0.28, halfWidth: 0.026, halfThick: 0.010 },
        { y: 0.68, halfWidth: 0.021, halfThick: 0.008 },
        { y: 1.00, halfWidth: 0.016, halfThick: 0.006 },
      ],
      1.18
    );
    const spineMesh = new THREE.Mesh(spineGeo, crystalBladeMat);
    spineMesh.position.z = side * 0.024;
    group.add(spineMesh);
  }

  const centerTipGeo = buildSculptedBladeGeometry(
    [
      { y: 0.94, halfWidth: 0.036, halfThick: 0.010 },
      { y: 1.06, halfWidth: 0.026, halfThick: 0.008 },
    ],
    1.24
  );
  group.add(new THREE.Mesh(centerTipGeo, crystalBladeMat));

  const coreFilament = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.94, 0.010), coreBeamMat);
  coreFilament.position.y = 0.50;
  group.add(coreFilament);

  const basePoint = new THREE.Object3D();
  basePoint.position.set(0, 0.08, 0);
  group.add(basePoint);

  const tipPoint = new THREE.Object3D();
  tipPoint.position.set(0, 1.25, 0);
  group.add(tipPoint);

  return { group, basePoint, tipPoint, glowMaterials };
}

/**
 * 2. 【羲和剑】(Xihe Sword) — Xuanxiao's Forged Solar-Dragon Crimson-Steel Greatsword
 */
export function createXiheSword(): WeaponRig {
  const group = new THREE.Group();
  const glowMaterials: THREE.Material[] = [];
  const maps = getEngravedBladeMaps();

  const crimsonBladeMat = new THREE.MeshStandardMaterial({
    color: 0xc4281a,
    map: gameAssets.pbr.armorBlade.color,
    normalMap: gameAssets.pbr.armorBlade.normal,
    roughnessMap: gameAssets.pbr.armorBlade.roughness,
    emissive: new THREE.Color(1.38, 0.34, 0.06),
    emissiveMap: maps.runeEmissive,
    emissiveIntensity: 1.05,
    roughness: 0.22,
    metalness: 0.84,
  });
  glowMaterials.push(crimsonBladeMat);

  const magmaCoreMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(1.75, 0.68, 0.16),
  });
  glowMaterials.push(magmaCoreMat);

  const imperialGoldMat = new THREE.MeshStandardMaterial({
    color: 0xebb652,
    map: gameAssets.pbr.armorBrass.color,
    normalMap: gameAssets.pbr.armorBrass.normal,
    roughnessMap: gameAssets.pbr.armorBrass.roughness,
    roughness: 0.22,
    metalness: 0.92,
  });

  const grip = new THREE.Mesh(
    scaleUvMeters(new THREE.CylinderGeometry(0.021, 0.025, 0.28, 14), 2.0, 3.0),
    imperialGoldMat
  );
  grip.scale.set(0.75, 1.0, 1.2);
  grip.position.y = -0.14;
  group.add(grip);

  const pommel = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.010, 8, 18), imperialGoldMat);
  pommel.rotation.y = Math.PI / 2;
  pommel.position.y = -0.30;
  group.add(pommel);

  for (const side of [-1, 1]) {
    group.add(
      buildCurvedCrossguardWing(
        [
          new THREE.Vector3(0, 0.02, 0),
          new THREE.Vector3(0, 0.055, side * 0.095),
          new THREE.Vector3(0, 0.16, side * 0.165),
        ],
        0.022,
        imperialGoldMat
      )
    );
    group.add(
      buildCurvedCrossguardWing(
        [
          new THREE.Vector3(0, 0.04, side * 0.03),
          new THREE.Vector3(0, 0.11, side * 0.09),
          new THREE.Vector3(0, 0.22, side * 0.12),
        ],
        0.014,
        imperialGoldMat
      )
    );
  }
  const sunGem = new THREE.Mesh(new THREE.SphereGeometry(0.032, 14, 12), magmaCoreMat);
  sunGem.scale.set(0.6, 1.1, 1.1);
  sunGem.position.y = 0.045;
  group.add(sunGem);

  const bladeGeo = buildSculptedBladeGeometry(
    [
      { y: 0.04, halfWidth: 0.068, halfThick: 0.016 },
      { y: 0.28, halfWidth: 0.052, halfThick: 0.014 },
      { y: 0.56, halfWidth: 0.064, halfThick: 0.014 },
      { y: 0.92, halfWidth: 0.050, halfThick: 0.012 },
      { y: 1.22, halfWidth: 0.042, halfThick: 0.010 },
    ],
    1.46
  );
  group.add(new THREE.Mesh(bladeGeo, crimsonBladeMat));

  const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.024, 1.04, 0.015), magmaCoreMat);
  fuller.position.y = 0.60;
  group.add(fuller);

  const basePoint = new THREE.Object3D();
  basePoint.position.set(0, 0.08, 0);
  group.add(basePoint);

  const tipPoint = new THREE.Object3D();
  tipPoint.position.set(0, 1.48, 0);
  group.add(tipPoint);

  return { group, basePoint, tipPoint, glowMaterials };
}

export function createSpiritWingSwordMesh(): THREE.Group {
  const g = new THREE.Group();
  const bladeMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(1.75, 0.52, 0.14),
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xefc062,
    emissive: new THREE.Color(0.45, 0.16, 0.04),
    roughness: 0.24,
    metalness: 0.88,
  });

  const bladeGeo = buildSculptedBladeGeometry(
    [
      { y: 0.12, halfWidth: 0.042, halfThick: 0.010 },
      { y: 0.88, halfWidth: 0.032, halfThick: 0.008 },
    ],
    1.16
  );
  g.add(new THREE.Mesh(bladeGeo, bladeMat));

  for (const side of [-1, 1]) {
    g.add(
      buildCurvedCrossguardWing(
        [
          new THREE.Vector3(0, 0.11, 0),
          new THREE.Vector3(0, 0.16, side * 0.085),
        ],
        0.012,
        goldMat
      )
    );
  }
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.16, 8), goldMat);
  grip.position.y = 0.03;
  g.add(grip);

  return g;
}

/**
 * 3. 【后羿射日弓】(Houyi Sun-Shooting Divine Bow — Forged Gilded Bronze PBR)
 */
export function createHouyiBow(): { group: THREE.Group; arrowMesh: THREE.Group } {
  const group = new THREE.Group();

  const goldBronzeMat = new THREE.MeshStandardMaterial({
    color: 0xe6b456,
    map: gameAssets.pbr.armorBrass.color,
    normalMap: gameAssets.pbr.armorBrass.normal,
    roughnessMap: gameAssets.pbr.armorBrass.roughness,
    emissive: new THREE.Color(0.24, 0.12, 0.03),
    roughness: 0.24,
    metalness: 0.90,
  });
  const crimsonGemMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(1.80, 0.62, 0.16),
  });

  const pts = [
    new THREE.Vector3(0, -0.60, -0.17),
    new THREE.Vector3(0, -0.35, 0.05),
    new THREE.Vector3(0, 0.0, 0.10),
    new THREE.Vector3(0, 0.35, 0.05),
    new THREE.Vector3(0, 0.60, -0.17),
  ];
  const limbMesh = new THREE.Mesh(
    scaleUvMeters(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 28, 0.024, 10, false), 4.0, 1.0),
    goldBronzeMat
  );
  group.add(limbMesh);

  for (const dir of [-1, 1]) {
    for (let f = 0; f < 3; f++) {
      group.add(
        buildCurvedCrossguardWing(
          [
            new THREE.Vector3(0, dir * (0.08 + f * 0.10), 0.09),
            new THREE.Vector3(0, dir * (0.20 + f * 0.12), 0.20 - f * 0.02),
          ],
          0.013 - f * 0.002,
          goldBronzeMat
        )
      );
    }
  }
  const coreSun = new THREE.Mesh(new THREE.SphereGeometry(0.036, 12, 10), crimsonGemMat);
  coreSun.position.set(0, 0, 0.13);
  group.add(coreSun);

  const stringMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.003, 0.003, 1.24, 6),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(1.65, 1.25, 0.45) })
  );
  stringMesh.position.set(0, 0, -0.17);
  group.add(stringMesh);

  const arrowMesh = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.08, 6), crimsonGemMat);
  shaft.rotation.x = Math.PI / 2;
  arrowMesh.add(shaft);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.18, 4), crimsonGemMat);
  head.rotation.x = Math.PI / 2;
  head.position.z = 0.58;
  arrowMesh.add(head);
  arrowMesh.visible = false;
  group.add(arrowMesh);

  return { group, arrowMesh };
}

/**
 * 4. 【琼华精锻青锋剑】(Qionghua Sect Sword — Real Photogrammetry `antique_katana.glb` / `forged_sword.glb`)
 */
export function createSectSword(useAntique = true): WeaponRig {
  const group = new THREE.Group();
  const glowMaterials: THREE.Material[] = [];

  if (useAntique && gameAssets.weaponModels?.antiqueKatana) {
    // `antique_katana.glb` is natively Y-aligned (-0.307..+0.696)
    const model = gameAssets.weaponModels.antiqueKatana.clone(true);
    model.scale.setScalar(1.32);
    model.position.set(0, 0.18, 0);
    model.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        m.castShadow = true;
        glowMaterials.push(m.material as THREE.Material);
      }
    });
    group.add(model);
  } else if (gameAssets.weaponModels?.forgedSword) {
    // `forged_sword.glb` is Z-aligned (-0.141..+0.966) -> rotate -90 deg X to point +Y
    const model = gameAssets.weaponModels.forgedSword.clone(true);
    model.rotation.set(-Math.PI / 2, 0, 0);
    model.position.set(0, 0.06, 0);
    model.scale.setScalar(1.12);
    model.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        m.castShadow = true;
        glowMaterials.push(m.material as THREE.Material);
      }
    });
    group.add(model);
  }

  const basePoint = new THREE.Object3D();
  basePoint.position.set(0, 0.08, 0);
  group.add(basePoint);

  const tipPoint = new THREE.Object3D();
  tipPoint.position.set(0, 1.12, 0);
  group.add(tipPoint);

  return { group, basePoint, tipPoint, glowMaterials };
}

/**
 * 5. 【镇岳玄铁巨剑】(Zhenyue Giant Sword Golem's Forged Steel-Plate Rune Broadsword)
 */
export function createGolemGreatsword(): WeaponRig {
  const group = new THREE.Group();
  const maps = getEngravedBladeMaps();

  const darkIronMat = new THREE.MeshStandardMaterial({
    color: 0x4c6276,
    map: gameAssets.pbr.armorPlate.color,
    normalMap: gameAssets.pbr.armorPlate.normal,
    roughnessMap: gameAssets.pbr.armorPlate.roughness,
    emissive: new THREE.Color(0.22, 1.05, 1.48),
    emissiveMap: maps.runeEmissive,
    emissiveIntensity: 0.95,
    roughness: 0.30,
    metalness: 0.88,
  });
  const antiqueGoldMat = new THREE.MeshStandardMaterial({
    color: 0xd8aa58,
    map: gameAssets.pbr.armorBrass.color,
    normalMap: gameAssets.pbr.armorBrass.normal,
    roughnessMap: gameAssets.pbr.armorBrass.roughness,
    roughness: 0.26,
    metalness: 0.90,
  });

  const grip = new THREE.Mesh(
    scaleUvMeters(new THREE.CylinderGeometry(0.032, 0.038, 0.44, 12), 2.0, 3.0),
    antiqueGoldMat
  );
  grip.position.y = -0.22;
  group.add(grip);

  const pommelRing = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.016, 8, 18), antiqueGoldMat);
  pommelRing.rotation.y = Math.PI / 2;
  pommelRing.position.y = -0.46;
  group.add(pommelRing);

  for (const side of [-1, 1]) {
    group.add(
      buildCurvedCrossguardWing(
        [
          new THREE.Vector3(0, 0.02, 0),
          new THREE.Vector3(0, 0.08, side * 0.16),
          new THREE.Vector3(0, 0.22, side * 0.26),
        ],
        0.034,
        antiqueGoldMat
      )
    );
  }

  const bladeGeo = buildSculptedBladeGeometry(
    [
      { y: 0.04, halfWidth: 0.135, halfThick: 0.028 },
      { y: 0.45, halfWidth: 0.115, halfThick: 0.025 },
      { y: 1.15, halfWidth: 0.125, halfThick: 0.024 },
      { y: 1.68, halfWidth: 0.098, halfThick: 0.020 },
    ],
    2.04
  );
  const slab = new THREE.Mesh(bladeGeo, darkIronMat);
  slab.castShadow = true;
  group.add(slab);

  const basePoint = new THREE.Object3D();
  basePoint.position.set(0, 0.12, 0);
  group.add(basePoint);

  const tipPoint = new THREE.Object3D();
  tipPoint.position.set(0, 2.06, 0);
  group.add(tipPoint);

  return { group, basePoint, tipPoint, glowMaterials: [darkIronMat] };
}
