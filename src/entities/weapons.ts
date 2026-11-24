import * as THREE from 'three';

export interface WeaponRig {
  group: THREE.Group;
  basePoint: THREE.Object3D; // Guard/base of blade for Ribbon Trail
  tipPoint: THREE.Object3D;  // Tip of blade for Ribbon Trail & hit ray
  glowMaterials: THREE.Material[];
}

/**
 * 1. 【望舒剑】(Wangshu Sword) — Translucent Ice-Crystal Twin-Spine Hollow Sword
 */
export function createWangshuSword(): WeaponRig {
  const group = new THREE.Group();
  const glowMaterials: THREE.Material[] = [];

  // Blade runs along -Y or +Y? Convention: grip at (0,0,0), blade extends along +Y (length ~ 1.18m), edge along Z
  const crystalMat = new THREE.MeshStandardMaterial({
    color: 0x8be4ff,
    emissive: new THREE.Color(0.28, 1.15, 1.85),
    emissiveIntensity: 1.0,
    roughness: 0.12,
    metalness: 0.35,
    transparent: true,
    opacity: 0.92,
  });
  glowMaterials.push(crystalMat);

  const coreBeamMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.75, 1.85, 2.45),
  });
  glowMaterials.push(coreBeamMat);

  const silverJadeMat = new THREE.MeshStandardMaterial({
    color: 0xd7e8f4,
    roughness: 0.25,
    metalness: 0.82,
  });

  // Grip & Pommel (-0.22 .. 0)
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.025, 0.22, 10), silverJadeMat);
  grip.position.y = -0.11;
  group.add(grip);

  const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.042, 0), crystalMat);
  pommel.position.y = -0.24;
  group.add(pommel);

  // Crescent Moon Guard (月牙寒玉剑格)
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.19, 4), silverJadeMat);
    wing.position.set(0, 0.03, side * 0.085);
    wing.rotation.x = side * 1.18;
    group.add(wing);
  }
  const guardGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.045, 0), coreBeamMat);
  guardGem.position.y = 0.02;
  group.add(guardGem);

  // Twin-Pronged Hollow Crystal Blade Spines (镂空双脊寒晶剑身, Y: 0.04 .. 0.98)
  for (const side of [-1, 1]) {
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.92, 0.032), crystalMat);
    spine.position.set(0, 0.50, side * 0.028);
    spine.castShadow = true;
    group.add(spine);

    // Side frost barbs
    const barb = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.16, 4), crystalMat);
    barb.position.set(0, 0.26, side * 0.056);
    barb.rotation.x = side * 0.42;
    group.add(barb);
  }

  // Glowing Ice Energy Core Thread inside the hollow slot
  const coreThread = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.98, 0.014), coreBeamMat);
  coreThread.position.y = 0.54;
  group.add(coreThread);

  // Diamond Spear-Tip (Y: 0.96 .. 1.20)
  const bladeTip = new THREE.Mesh(new THREE.ConeGeometry(0.052, 0.26, 4), crystalMat);
  bladeTip.position.y = 1.08;
  bladeTip.scale.set(0.36, 1.0, 1.0);
  bladeTip.castShadow = true;
  group.add(bladeTip);

  const basePoint = new THREE.Object3D();
  basePoint.position.set(0, 0.08, 0);
  group.add(basePoint);

  const tipPoint = new THREE.Object3D();
  tipPoint.position.set(0, 1.21, 0);
  group.add(tipPoint);

  return { group, basePoint, tipPoint, glowMaterials };
}

/**
 * 2. 【羲和剑】(Xihe Sword) — Xuanxiao's Blazing Solar-Flame Greatsword
 */
export function createXiheSword(): WeaponRig {
  const group = new THREE.Group();
  const glowMaterials: THREE.Material[] = [];

  const crimsonBladeMat = new THREE.MeshStandardMaterial({
    color: 0xb82414,
    emissive: new THREE.Color(1.55, 0.32, 0.06),
    emissiveIntensity: 1.05,
    roughness: 0.22,
    metalness: 0.65,
  });
  glowMaterials.push(crimsonBladeMat);

  const magmaCoreMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(2.35, 0.92, 0.22),
  });
  glowMaterials.push(magmaCoreMat);

  const darkGoldMat = new THREE.MeshStandardMaterial({
    color: 0xc9963e,
    roughness: 0.28,
    metalness: 0.85,
  });

  // Grip & Dragon-Sun Pommel
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.28, 10), darkGoldMat);
  grip.position.y = -0.14;
  group.add(grip);

  const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.052, 0), magmaCoreMat);
  pommel.position.y = -0.30;
  group.add(pommel);

  // Solar Flame-Wing Crossguard (阳炎龙翼剑格)
  for (const side of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.26, 4), darkGoldMat);
    horn.position.set(0, 0.06, side * 0.11);
    horn.rotation.x = side * 0.95;
    group.add(horn);
  }
  const sunCore = new THREE.Mesh(new THREE.SphereGeometry(0.048, 10, 10), magmaCoreMat);
  sunCore.position.y = 0.03;
  group.add(sunCore);

  // Heavy Jagged Flame Blade (Y: 0.05 .. 1.32)
  const mainBlade = new THREE.Mesh(new THREE.BoxGeometry(0.024, 1.12, 0.095), crimsonBladeMat);
  mainBlade.position.y = 0.62;
  mainBlade.castShadow = true;
  group.add(mainBlade);

  // Molten central fuller
  const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.028, 1.06, 0.024), magmaCoreMat);
  fuller.position.y = 0.62;
  group.add(fuller);

  // Asymmetric flame serrations along the blade edges
  for (let i = 0; i < 4; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.16, 4), crimsonBladeMat);
    tooth.position.set(0, 0.26 + i * 0.21, side * 0.068);
    tooth.rotation.x = side * 0.52;
    group.add(tooth);
  }

  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.068, 0.30, 4), crimsonBladeMat);
  tip.position.y = 1.32;
  tip.scale.set(0.38, 1.0, 1.0);
  tip.castShadow = true;
  group.add(tip);

  const basePoint = new THREE.Object3D();
  basePoint.position.set(0, 0.08, 0);
  group.add(basePoint);

  const tipPoint = new THREE.Object3D();
  tipPoint.position.set(0, 1.46, 0);
  group.add(tipPoint);

  return { group, basePoint, tipPoint, glowMaterials };
}

/**
 * 3. 【后羿射日弓】(Houyi Sun-Shooting Divine Bow) — Slung on Yun Tianhe's back & drawn for Ash of War #2
 */
export function createHouyiBow(): { group: THREE.Group; arrowMesh: THREE.Group } {
  const group = new THREE.Group();

  const goldBronzeMat = new THREE.MeshStandardMaterial({
    color: 0xd6a64f,
    emissive: 0x452606,
    emissiveIntensity: 0.45,
    roughness: 0.28,
    metalness: 0.85,
  });
  const crimsonGemMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(2.1, 0.68, 0.18),
  });

  // Recurve bow curve in YZ plane (limbs curve backward -Z when held, string at -Z)
  const pts = [
    new THREE.Vector3(0, -0.58, -0.16),
    new THREE.Vector3(0, -0.34, 0.04),
    new THREE.Vector3(0, 0.0, 0.09),
    new THREE.Vector3(0, 0.34, 0.04),
    new THREE.Vector3(0, 0.58, -0.16),
  ];
  const curve = new THREE.CatmullRomCurve3(pts);
  const limbMesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.024, 8, false), goldBronzeMat);
  limbMesh.castShadow = true;
  group.add(limbMesh);

  // Sun-bird wing accents near grip
  for (const dir of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.24, 4), goldBronzeMat);
    wing.position.set(0, dir * 0.16, 0.17);
    wing.rotation.x = dir * 0.35;
    group.add(wing);
  }
  const coreSun = new THREE.Mesh(new THREE.OctahedronGeometry(0.048, 0), crimsonGemMat);
  coreSun.position.set(0, 0, 0.19);
  group.add(coreSun);

  // Glowing golden bowstring
  const stringGeo = new THREE.CylinderGeometry(0.004, 0.004, 1.24, 6);
  const stringMesh = new THREE.Mesh(
    stringGeo,
    new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.4, 0.55) })
  );
  stringMesh.position.set(0, 0, -0.17);
  group.add(stringMesh);

  // Radiant Sun Arrow (visible when charging【恸天贯日式】)
  const arrowMesh = new THREE.Group();
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.01, 0.01, 1.05, 6),
    crimsonGemMat
  );
  shaft.rotation.x = Math.PI / 2;
  arrowMesh.add(shaft);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.038, 0.18, 4), crimsonGemMat);
  head.rotation.x = Math.PI / 2;
  head.position.z = 0.56;
  arrowMesh.add(head);
  arrowMesh.visible = false;
  group.add(arrowMesh);

  return { group, arrowMesh };
}

/**
 * 4. 【琼华制式青锋长剑】(Qionghua Sect Daoist Sword)
 */
export function createSectSword(): WeaponRig {
  const group = new THREE.Group();
  const bladeMat = new THREE.MeshStandardMaterial({
    color: 0xcbe2f0,
    emissive: 0x184c6e,
    emissiveIntensity: 0.45,
    roughness: 0.2,
    metalness: 0.85,
  });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xb69454, roughness: 0.35, metalness: 0.78 });

  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.20, 8), brassMat);
  grip.position.y = -0.10;
  group.add(grip);

  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.03, 0.18), brassMat);
  guard.position.y = 0.015;
  group.add(guard);

  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.88, 0.048), bladeMat);
  blade.position.y = 0.46;
  blade.castShadow = true;
  group.add(blade);

  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.034, 0.18, 4), bladeMat);
  tip.position.y = 0.99;
  tip.scale.set(0.4, 1, 1);
  group.add(tip);

  const basePoint = new THREE.Object3D();
  basePoint.position.set(0, 0.05, 0);
  group.add(basePoint);

  const tipPoint = new THREE.Object3D();
  tipPoint.position.set(0, 1.08, 0);
  group.add(tipPoint);

  return { group, basePoint, tipPoint, glowMaterials: [bladeMat] };
}

/**
 * 5. 【镇岳玄铁巨剑】(Zhenyue Giant Sword Golem's Rune Slab Greatsword)
 */
export function createGolemGreatsword(): WeaponRig {
  const group = new THREE.Group();
  const stoneBronzeMat = new THREE.MeshStandardMaterial({
    color: 0x4c6270,
    roughness: 0.48,
    metalness: 0.58,
  });
  const runeGlowMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.42, 1.55, 2.05),
  });

  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.052, 0.48, 8), stoneBronzeMat);
  grip.position.y = -0.24;
  group.add(grip);

  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.56), stoneBronzeMat);
  guard.position.y = 0.06;
  group.add(guard);

  const slab = new THREE.Mesh(new THREE.BoxGeometry(0.065, 1.65, 0.26), stoneBronzeMat);
  slab.position.y = 0.94;
  slab.castShadow = true;
  group.add(slab);

  const runeLine = new THREE.Mesh(new THREE.BoxGeometry(0.072, 1.42, 0.045), runeGlowMat);
  runeLine.position.y = 0.92;
  group.add(runeLine);

  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.38, 4), stoneBronzeMat);
  tip.position.y = 1.95;
  tip.scale.set(0.36, 1, 1);
  group.add(tip);

  const basePoint = new THREE.Object3D();
  basePoint.position.set(0, 0.14, 0);
  group.add(basePoint);

  const tipPoint = new THREE.Object3D();
  tipPoint.position.set(0, 2.12, 0);
  group.add(tipPoint);

  return { group, basePoint, tipPoint, glowMaterials: [runeGlowMat] };
}
