import * as THREE from 'three';
import { gameAssets } from '../assets/assetLoader';

export interface WeaponRig {
  group: THREE.Group;
  basePoint: THREE.Object3D;
  tipPoint: THREE.Object3D;
  glowMaterials: THREE.Material[];
}

/**
 * 1. 【望舒剑】(Wangshu Sword) — Translucent Kunlun Ice-Crystal Twin-Spine Hollow Immortal Sword
 *    Grip at (0,0,0), blade extends along +Y (~1.22m), flat edge along Z.
 */
export function createWangshuSword(): WeaponRig {
  const group = new THREE.Group();
  const glowMaterials: THREE.Material[] = [];

  const crystalMat = new THREE.MeshPhysicalMaterial({
    color: 0x9cecff,
    emissive: new THREE.Color(0.26, 1.15, 1.88),
    emissiveIntensity: 0.95,
    roughness: 0.08,
    metalness: 0.22,
    transmission: 0.35,
    clearcoat: 1.0,
    transparent: true,
    opacity: 0.94,
  });
  glowMaterials.push(crystalMat);

  const coreBeamMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.85, 1.95, 2.55),
  });
  glowMaterials.push(coreBeamMat);

  const silverJadeMat = new THREE.MeshStandardMaterial({
    color: 0xe6f3fc,
    roughness: 0.2,
    metalness: 0.86,
  });

  // Silk-Wrapped Silver Grip & Ice-Lotus Pommel + Flowing Cyan Tassel (`剑穗`)
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.023, 0.23, 12), silverJadeMat);
  grip.position.y = -0.115;
  group.add(grip);

  const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.044, 0), crystalMat);
  pommel.position.y = -0.25;
  group.add(pommel);

  const tasselMat = new THREE.MeshStandardMaterial({ color: 0x3ec8f8, roughness: 0.55 });
  const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.18, 8), tasselMat);
  tassel.position.set(0, -0.35, 0.02);
  tassel.rotation.x = 0.25;
  group.add(tassel);

  // Sculpted Crescent Moon-Cloud Crossguard (`望舒寒玉剑格`)
  const guardHub = new THREE.Mesh(new THREE.OctahedronGeometry(0.052, 1), silverJadeMat);
  guardHub.scale.set(0.65, 0.85, 1.25);
  guardHub.position.y = 0.02;
  group.add(guardHub);

  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.ConeGeometry(0.038, 0.22, 4), silverJadeMat);
    wing.position.set(0, 0.045, side * 0.095);
    wing.rotation.x = side * 1.12;
    group.add(wing);

    const innerFeather = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.14, 4), crystalMat);
    innerFeather.position.set(0, 0.08, side * 0.068);
    innerFeather.rotation.x = side * 0.72;
    group.add(innerFeather);
  }

  const guardGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.038, 0), coreBeamMat);
  guardGem.position.y = 0.025;
  group.add(guardGem);

  // Twin-Pronged Beveled Hollow Ice-Crystal Blade Spines (`镂空双脊寒晶剑身`)
  for (const side of [-1, 1]) {
    const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, 0.94, 4), crystalMat);
    spine.scale.set(0.55, 1.0, 1.35);
    spine.rotation.y = Math.PI / 4;
    spine.position.set(0, 0.51, side * 0.028);
    spine.castShadow = true;
    group.add(spine);

    const barb = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.18, 4), crystalMat);
    barb.position.set(0, 0.28, side * 0.058);
    barb.rotation.x = side * 0.42;
    group.add(barb);
  }

  // Radiant Frost-Spirit Core Filament
  const coreThread = new THREE.Mesh(new THREE.BoxGeometry(0.009, 1.02, 0.016), coreBeamMat);
  coreThread.position.y = 0.56;
  group.add(coreThread);

  // Diamond Spear-Point Tip
  const bladeTip = new THREE.Mesh(new THREE.ConeGeometry(0.056, 0.28, 4), crystalMat);
  bladeTip.position.y = 1.10;
  bladeTip.scale.set(0.34, 1.0, 1.05);
  bladeTip.castShadow = true;
  group.add(bladeTip);

  const basePoint = new THREE.Object3D();
  basePoint.position.set(0, 0.08, 0);
  group.add(basePoint);

  const tipPoint = new THREE.Object3D();
  tipPoint.position.set(0, 1.24, 0);
  group.add(tipPoint);

  return { group, basePoint, tipPoint, glowMaterials };
}

/**
 * 2. 【羲和剑】(Xihe Sword) — Xuanxiao's Blazing Solar-Flame Dragon Greatsword
 */
export function createXiheSword(): WeaponRig {
  const group = new THREE.Group();
  const glowMaterials: THREE.Material[] = [];

  const crimsonBladeMat = new THREE.MeshStandardMaterial({
    color: 0xc82616,
    emissive: new THREE.Color(1.58, 0.34, 0.07),
    emissiveIntensity: 1.05,
    roughness: 0.18,
    metalness: 0.72,
  });
  glowMaterials.push(crimsonBladeMat);

  const magmaCoreMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(2.38, 0.96, 0.24),
  });
  glowMaterials.push(magmaCoreMat);

  const darkGoldMat = new THREE.MeshStandardMaterial({
    color: 0xe0aa48,
    roughness: 0.22,
    metalness: 0.88,
  });

  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.029, 0.28, 12), darkGoldMat);
  grip.position.y = -0.14;
  group.add(grip);

  const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.054, 0), magmaCoreMat);
  pommel.position.y = -0.30;
  group.add(pommel);

  // Solar Dragon-Wing Crossguard (`阳炎金乌剑格`)
  for (const side of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.056, 0.28, 4), darkGoldMat);
    horn.position.set(0, 0.065, side * 0.115);
    horn.rotation.x = side * 0.95;
    group.add(horn);
  }
  const sunCore = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), magmaCoreMat);
  sunCore.position.y = 0.035;
  group.add(sunCore);

  // Beveled Diamond Crimson-Flame Greatsword Blade
  const mainBlade = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.064, 1.14, 4), crimsonBladeMat);
  mainBlade.scale.set(0.36, 1.0, 1.38);
  mainBlade.rotation.y = Math.PI / 4;
  mainBlade.position.y = 0.63;
  mainBlade.castShadow = true;
  group.add(mainBlade);

  const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.030, 1.08, 0.024), magmaCoreMat);
  fuller.position.y = 0.62;
  group.add(fuller);

  for (let i = 0; i < 4; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.036, 0.17, 4), crimsonBladeMat);
    tooth.position.set(0, 0.26 + i * 0.22, side * 0.072);
    tooth.rotation.x = side * 0.52;
    group.add(tooth);
  }

  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.072, 0.32, 4), crimsonBladeMat);
  tip.position.y = 1.35;
  tip.scale.set(0.36, 1.0, 1.05);
  tip.castShadow = true;
  group.add(tip);

  const basePoint = new THREE.Object3D();
  basePoint.position.set(0, 0.08, 0);
  group.add(basePoint);

  const tipPoint = new THREE.Object3D();
  tipPoint.position.set(0, 1.48, 0);
  group.add(tipPoint);

  return { group, basePoint, tipPoint, glowMaterials };
}

/**
 * 3. 【后羿射日弓】(Houyi Sun-Shooting Divine Bow)
 */
export function createHouyiBow(): { group: THREE.Group; arrowMesh: THREE.Group } {
  const group = new THREE.Group();

  const goldBronzeMat = new THREE.MeshStandardMaterial({
    color: 0xe5b458,
    emissive: new THREE.Color(0x4a2808),
    emissiveIntensity: 0.42,
    roughness: 0.22,
    metalness: 0.88,
  });
  const crimsonGemMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(2.2, 0.72, 0.2),
  });

  const pts = [
    new THREE.Vector3(0, -0.60, -0.17),
    new THREE.Vector3(0, -0.35, 0.05),
    new THREE.Vector3(0, 0.0, 0.10),
    new THREE.Vector3(0, 0.35, 0.05),
    new THREE.Vector3(0, 0.60, -0.17),
  ];
  const curve = new THREE.CatmullRomCurve3(pts);
  const limbMesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 0.025, 10, false), goldBronzeMat);
  limbMesh.castShadow = true;
  group.add(limbMesh);

  // Layered Golden Sun-Bird Plumes (`金乌神羽`)
  for (const dir of [-1, 1]) {
    for (let f = 0; f < 3; f++) {
      const feather = new THREE.Mesh(new THREE.ConeGeometry(0.036, 0.24 - f * 0.03, 4), goldBronzeMat);
      feather.position.set(0, dir * (0.14 + f * 0.11), 0.15 - f * 0.02);
      feather.rotation.x = dir * (0.38 + f * 0.12);
      group.add(feather);
    }
  }
  const coreSun = new THREE.Mesh(new THREE.OctahedronGeometry(0.052, 0), crimsonGemMat);
  coreSun.position.set(0, 0, 0.19);
  group.add(coreSun);

  const stringMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.004, 0.004, 1.26, 6),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(1.9, 1.48, 0.6) })
  );
  stringMesh.position.set(0, 0, -0.17);
  group.add(stringMesh);

  const arrowMesh = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.08, 6), crimsonGemMat);
  shaft.rotation.x = Math.PI / 2;
  arrowMesh.add(shaft);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.2, 4), crimsonGemMat);
  head.rotation.x = Math.PI / 2;
  head.position.z = 0.58;
  arrowMesh.add(head);
  arrowMesh.visible = false;
  group.add(arrowMesh);

  return { group, arrowMesh };
}

/**
 * 4. 【琼华制式青锋仙剑】(Qionghua Sect Sword — Real 3D `katana_base.glb` infused with Cyan Sword-Qi!)
 */
export function createSectSword(): WeaponRig {
  const group = new THREE.Group();
  const glowMaterials: THREE.Material[] = [];

  if (gameAssets.weaponModels?.katanaBase) {
    const model = gameAssets.weaponModels.katanaBase.clone(true);
    // `katana_base.glb` blade runs along +Z (~1.11m). Rotate -90 deg X so blade points cleanly along +Y!
    model.rotation.set(-Math.PI / 2, 0, 0);
    model.position.set(0, 0.06, 0);
    model.scale.setScalar(1.05);
    model.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        m.castShadow = true;
        const std = (m.material as THREE.MeshStandardMaterial).clone();
        std.emissive = new THREE.Color(0x1e608a);
        std.emissiveIntensity = 0.38;
        m.material = std;
        glowMaterials.push(std);
      }
    });
    group.add(model);
  } else {
    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0xd4eaf7,
      emissive: 0x1e608a,
      emissiveIntensity: 0.45,
      roughness: 0.18,
      metalness: 0.88,
    });
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.92, 0.048), bladeMat);
    blade.position.y = 0.48;
    group.add(blade);
    glowMaterials.push(bladeMat);
  }

  const basePoint = new THREE.Object3D();
  basePoint.position.set(0, 0.06, 0);
  group.add(basePoint);

  const tipPoint = new THREE.Object3D();
  tipPoint.position.set(0, 1.12, 0);
  group.add(tipPoint);

  return { group, basePoint, tipPoint, glowMaterials };
}

/**
 * 5. 【镇岳玄铁巨剑】(Zhenyue Giant Sword Golem's Sculpted Rune Greatsword)
 *    Scaled in standard meter units (attached to unscaled world-size Golem socket or normalized hand!).
 */
export function createGolemGreatsword(): WeaponRig {
  const group = new THREE.Group();
  const stoneBronzeMat = new THREE.MeshStandardMaterial({
    color: 0x5c7588,
    roughness: 0.36,
    metalness: 0.72,
  });
  const goldTrimMat = new THREE.MeshStandardMaterial({
    color: 0xdab05e,
    roughness: 0.26,
    metalness: 0.86,
  });
  const runeGlowMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.45, 1.65, 2.25),
  });

  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.048, 0.48, 10), goldTrimMat);
  grip.position.y = -0.24;
  group.add(grip);

  const guard = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), goldTrimMat);
  guard.scale.set(0.55, 0.65, 1.45);
  guard.position.y = 0.06;
  group.add(guard);

  // Sleek Seamless Diamond-Beveled Rune Greatsword Blade (Y: +0.08 -> +1.65 -> +2.08 sharp point)
  const verts = new Float32Array([
    0.13, 0.08, 0,   0, 0.08, 0.036,   -0.13, 0.08, 0,   0, 0.08, -0.036,
    0.105, 1.65, 0,  0, 1.65, 0.028,   -0.105, 1.65, 0,  0, 1.65, -0.028,
    0, 2.08, 0,
  ]);
  const indices = [
    0, 1, 4,  1, 5, 4,
    1, 2, 5,  2, 6, 5,
    2, 3, 6,  3, 7, 6,
    3, 0, 7,  0, 4, 7,
    4, 5, 8,  5, 6, 8,  6, 7, 8,  7, 4, 8,
  ];
  const bladeGeo = new THREE.BufferGeometry();
  bladeGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  bladeGeo.setIndex(indices);
  bladeGeo.computeVertexNormals();

  const slab = new THREE.Mesh(bladeGeo, stoneBronzeMat);
  slab.castShadow = true;
  group.add(slab);

  const runeLine = new THREE.Mesh(new THREE.BoxGeometry(0.032, 1.54, 0.082), runeGlowMat);
  runeLine.position.y = 0.90;
  group.add(runeLine);

  const basePoint = new THREE.Object3D();
  basePoint.position.set(0, 0.12, 0);
  group.add(basePoint);

  const tipPoint = new THREE.Object3D();
  tipPoint.position.set(0, 2.10, 0);
  group.add(tipPoint);

  return { group, basePoint, tipPoint, glowMaterials: [runeGlowMat] };
}
