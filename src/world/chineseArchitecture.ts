import * as THREE from 'three';
import { PbrMaterialMaps } from '../assets/assetLoader';

/**
 * Injects world-space Kunlun Snow Accumulation onto any MeshStandardMaterial
 * so cliffs, boulders, and glazed palace roofs naturally collect sparkling snow on upward faces!
 */
export function applyWorldSnowShader(
  mat: THREE.MeshStandardMaterial,
  snowPbr: PbrMaterialMaps,
  snowStrength = 0.78,
  threshold = 0.42
): THREE.MeshStandardMaterial {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSnowMap = { value: snowPbr.color };
    shader.uniforms.uSnowStrength = { value: snowStrength };
    shader.uniforms.uSnowThreshold = { value: threshold };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying vec3 vSnowWorldPos;
        varying vec3 vSnowWorldNormal;
        `
      )
      .replace(
        '#include <worldpos_vertex>',
        /* glsl */ `
        #include <worldpos_vertex>
        vec4 snowWp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          snowWp = instanceMatrix * snowWp;
        #endif
        snowWp = modelMatrix * snowWp;
        vSnowWorldPos = snowWp.xyz;
        mat3 snowNMat = mat3(modelMatrix);
        #ifdef USE_INSTANCING
          snowNMat = snowNMat * mat3(instanceMatrix);
        #endif
        vSnowWorldNormal = normalize(snowNMat * objectNormal);
        `
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        uniform sampler2D uSnowMap;
        uniform float uSnowStrength;
        uniform float uSnowThreshold;
        varying vec3 vSnowWorldPos;
        varying vec3 vSnowWorldNormal;
        `
      )
      .replace(
        '#include <map_fragment>',
        /* glsl */ `
        #include <map_fragment>
        float upDot = normalize(vSnowWorldNormal).y;
        float snowNoise = sin(vSnowWorldPos.x * 0.65) * cos(vSnowWorldPos.z * 0.65) * 0.08;
        float snowMask = smoothstep(uSnowThreshold, uSnowThreshold + 0.30, upDot + snowNoise) * uSnowStrength;
        vec3 snowTex = texture2D(uSnowMap, vSnowWorldPos.xz * 0.18).rgb;
        // Bright crisp anime-realistic snow tint (icy sky-blue shadow tint + sunlit white)
        vec3 snowTint = snowTex * vec3(0.96, 1.01, 1.08);
        diffuseColor.rgb = mix(diffuseColor.rgb, snowTint, snowMask);
        `
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `
        #include <roughnessmap_fragment>
        float snowMaskR = smoothstep(uSnowThreshold, uSnowThreshold + 0.30, normalize(vSnowWorldNormal).y) * uSnowStrength;
        roughnessFactor = mix(roughnessFactor, 0.72, snowMaskR);
        `
      );
  };
  mat.customProgramCacheKey = () => `kunlun_snow_${snowStrength.toFixed(2)}_${threshold.toFixed(2)}`;
  return mat;
}

/**
 * Generates an authentic sweeping Chinese curved-tile roof (`飞檐翘角歇山顶`) with:
 * - Catenary concave slope + dramatic upturned flying corner eaves (`翼角起翘`)
 * - Sculpted main ridge (`正脊`) + dragon-tail `鸱吻` finials
 * - 4 sweeping corner hip ridges (`戗脊`) + hanging golden wind bells
 * - Carved vermilion-and-gold `斗拱` corbel brackets underneath
 */
export function createSweepingChineseRoof(
  spanX: number,
  spanZ: number,
  riseY: number,
  curveLift: number,
  roofMat: THREE.Material,
  goldMat: THREE.Material,
  woodMat: THREE.Material
): THREE.Group {
  const group = new THREE.Group();
  const segX = 20;
  const segZ = 16;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const halfX = spanX * 0.5;
  const halfZ = spanZ * 0.5;
  const ridgeHalfX = Math.max(0.4, halfX * 0.48);

  const evalRoofPoint = (nx: number, nz: number): THREE.Vector3 => {
    // nx, nz in [-1, 1]
    const ax = Math.abs(nx);
    const az = Math.abs(nz);
    // Hip-and-gable distance from central ridge line [-ridgeHalfX .. +ridgeHalfX] at z=0
    const dxRidge = Math.max(0, ax * halfX - ridgeHalfX) / Math.max(0.01, halfX - ridgeHalfX);
    const distFromPeak = Math.min(1.0, Math.hypot(dxRidge * 0.92, az));

    // Classic Chinese catenary concave curve (`举折`): steeper near ridge, sweeping horizontal at eaves
    const concave = Math.pow(1.0 - distFromPeak, 1.58);
    // Upturned flying corner lift (`翼角起翘`) at the 4 corners!
    const cornerFactor = Math.pow(ax * az, 1.85);
    const edgeFlare = Math.pow(distFromPeak, 3.0) * 0.12;

    const x = nx * halfX * (1.0 + cornerFactor * 0.08);
    const z = nz * halfZ * (1.0 + cornerFactor * 0.08);
    const y = concave * riseY + cornerFactor * curveLift + edgeFlare * riseY;
    return new THREE.Vector3(x, y, z);
  };

  for (let iz = 0; iz <= segZ; iz++) {
    const nz = (iz / segZ) * 2 - 1;
    for (let ix = 0; ix <= segX; ix++) {
      const nx = (ix / segX) * 2 - 1;
      const p = evalRoofPoint(nx, nz);
      positions.push(p.x, p.y, p.z);
      uvs.push((nx + 1) * 0.5 * (spanX * 0.35), (nz + 1) * 0.5 * (spanZ * 0.35));
    }
  }

  const stride = segX + 1;
  for (let iz = 0; iz < segZ; iz++) {
    for (let ix = 0; ix < segX; ix++) {
      const a = iz * stride + ix;
      const b = (iz + 1) * stride + ix;
      const c = (iz + 1) * stride + (ix + 1);
      const d = iz * stride + (ix + 1);
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  const roofGeo = new THREE.BufferGeometry();
  roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  roofGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  roofGeo.setIndex(indices);
  roofGeo.computeVertexNormals();

  const roofMesh = new THREE.Mesh(roofGeo, roofMat);
  roofMesh.castShadow = true;
  roofMesh.receiveShadow = true;
  group.add(roofMesh);

  // Dark lacquered underside soffit + Dougong corbel bracket beam
  const soffitW = spanX * 0.78;
  const soffitD = spanZ * 0.76;
  const dougongBeam = new THREE.Mesh(new THREE.BoxGeometry(soffitW, 0.42, soffitD), woodMat);
  dougongBeam.position.y = -0.18;
  dougongBeam.castShadow = true;
  group.add(dougongBeam);

  const goldFrieze = new THREE.Mesh(new THREE.BoxGeometry(soffitW + 0.16, 0.14, soffitD + 0.16), goldMat);
  goldFrieze.position.y = 0.02;
  group.add(goldFrieze);

  // Main Ridge Beam (`正脊`) & Dragon-Tail Finials (`鸱吻`)
  const mainRidgeLen = ridgeHalfX * 2.08;
  const mainRidge = new THREE.Mesh(new THREE.BoxGeometry(mainRidgeLen, 0.32, 0.30), goldMat);
  mainRidge.position.y = riseY + 0.12;
  mainRidge.castShadow = true;
  group.add(mainRidge);

  for (const sx of [-1, 1]) {
    const chiwen = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.85, 5), goldMat);
    chiwen.position.set(sx * (ridgeHalfX + 0.08), riseY + 0.46, 0);
    chiwen.rotation.z = -sx * 0.32;
    group.add(chiwen);
  }

  // 4 Sweeping Corner Hip Ridges (`戗脊`) + Upturned Horn Tips + Golden Bells
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 6; k++) {
        const t = k / 6;
        const nx = THREE.MathUtils.lerp(sx * (ridgeHalfX / halfX), sx * 1.0, t);
        const nz = THREE.MathUtils.lerp(0, sz * 1.0, t);
        const pt = evalRoofPoint(nx, nz);
        pt.y += 0.08;
        pts.push(pt);
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const ridgeTube = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.09, 6, false), goldMat);
      ridgeTube.castShadow = true;
      group.add(ridgeTube);

      const tipPt = pts[pts.length - 1];
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.55, 4), goldMat);
      horn.position.set(tipPt.x * 1.02, tipPt.y + 0.22, tipPt.z * 1.02);
      horn.rotation.set(sz * 0.45, 0, -sx * 0.45);
      group.add(horn);

      // Hanging wind-bell under flying eave corner
      const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.11, 0.24, 6), goldMat);
      bell.position.set(tipPt.x * 0.96, tipPt.y - 0.28, tipPt.z * 0.96);
      group.add(bell);
    }
  }

  return group;
}

/**
 * Builds an authentic Carved White-Jade Balustrade Run (`汉白玉雕花栏杆`) between two 3D points!
 */
export function createJadeBalustradeRun(
  start: THREE.Vector3,
  end: THREE.Vector3,
  postCount: number,
  marbleMat: THREE.Material,
  goldMat: THREE.Material
): THREE.Group {
  const group = new THREE.Group();
  const delta = new THREE.Vector3().subVectors(end, start);
  const totalLen = delta.length();
  const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);

  // Orient rail group along start -> end in XZ, pitching smoothly if sloped (stairways!)
  const horizLen = Math.hypot(delta.x, delta.z) || 0.001;
  const yaw = Math.atan2(delta.x, delta.z);
  const slopePitch = -Math.atan2(delta.y, horizLen);

  const railCarrier = new THREE.Group();
  railCarrier.position.copy(mid);
  railCarrier.rotation.y = yaw;

  // Lower plinth (`地袱`), carved middle screen (`栏板`), top coping rail (`寻杖`)
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, totalLen), marbleMat);
  plinth.position.y = 0.09;
  plinth.rotation.x = slopePitch;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  railCarrier.add(plinth);

  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.52, totalLen * 0.98), marbleMat);
  panel.position.y = 0.46;
  panel.rotation.x = slopePitch;
  panel.castShadow = true;
  panel.receiveShadow = true;
  railCarrier.add(panel);

  const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, totalLen + 0.18), marbleMat);
  topRail.position.y = 0.82;
  topRail.rotation.x = slopePitch;
  topRail.castShadow = true;
  railCarrier.add(topRail);

  const goldInlay = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.05, totalLen * 0.98), goldMat);
  goldInlay.position.y = 0.72;
  goldInlay.rotation.x = slopePitch;
  railCarrier.add(goldInlay);

  group.add(railCarrier);

  // Upright vertical lotus-finial posts (`云头望柱`)
  const nPosts = Math.max(2, postCount);
  for (let i = 0; i < nPosts; i++) {
    const t = i / (nPosts - 1);
    const p = new THREE.Vector3().lerpVectors(start, end, t);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.06, 0.28), marbleMat);
    post.position.set(p.x, p.y + 0.53, p.z);
    post.rotation.y = yaw;
    post.castShadow = true;
    post.receiveShadow = true;
    group.add(post);

    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), goldMat);
    finial.scale.set(1, 1.35, 1);
    finial.position.set(p.x, p.y + 1.16, p.z);
    group.add(finial);
  }

  return group;
}

/**
 * Builds the monumental Three-Bay Five-Roof Qionghua Mountain Gate (`三间五楼·琼华仙门牌坊`)!
 */
export function createQionghuaGrandPaifang(
  marbleMat: THREE.Material,
  woodMat: THREE.Material,
  roofMat: THREE.Material,
  goldMat: THREE.Material,
  lanternTemplate?: THREE.Group
): THREE.Group {
  const gate = new THREE.Group();

  // 4 Vermilion-Lacquer Columns with Carved White-Jade Drum Bases (`抱鼓石`)
  const pillarXs = [-8.2, -4.4, 4.4, 8.2];
  const pillarHs = [9.0, 11.4, 11.4, 9.0];

  for (let i = 0; i < 4; i++) {
    const px = pillarXs[i];
    const ph = pillarHs[i];

    // Carved White-Jade Drum Pedestal
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.84, 0.98, 1.15, 16), marbleMat);
    plinth.position.set(px, 0.57, 0);
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    gate.add(plinth);

    for (const sz of [-1, 1]) {
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.34, 16), marbleMat);
      drum.rotation.z = Math.PI / 2;
      drum.position.set(px, 0.72, sz * 0.95);
      drum.castShadow = true;
      gate.add(drum);
    }

    // Vermilion-Wood Immortal Column
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.52, ph, 20), woodMat);
    col.position.set(px, ph * 0.5 + 0.4, 0);
    col.castShadow = true;
    col.receiveShadow = true;
    gate.add(col);

    // Golden Dragon-Collar Rings
    for (const ry of [1.4, ph - 0.6]) {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.54, 0.24, 18), goldMat);
      ring.position.set(px, ry, 0);
      gate.add(ring);
    }
  }

  // Painted Emerald-and-Gold Crossbeams (`额枋` & `花板`)
  const lowerBeam = new THREE.Mesh(new THREE.BoxGeometry(17.6, 0.72, 0.86), woodMat);
  lowerBeam.position.set(0, 8.2, 0);
  lowerBeam.castShadow = true;
  gate.add(lowerBeam);

  const lowerGoldTrim = new THREE.Mesh(new THREE.BoxGeometry(17.7, 0.16, 0.94), goldMat);
  lowerGoldTrim.position.set(0, 8.6, 0);
  gate.add(lowerGoldTrim);

  const upperBeam = new THREE.Mesh(new THREE.BoxGeometry(9.8, 0.82, 0.92), woodMat);
  upperBeam.position.set(0, 10.4, 0);
  upperBeam.castShadow = true;
  gate.add(upperBeam);

  // Five Sweeping Curved Roofs (1 Grand Center Roof + 2 Inner Flanking Roofs + 2 Outer Wing Roofs)
  const centerRoof = createSweepingChineseRoof(12.2, 4.4, 1.95, 1.15, roofMat, goldMat, woodMat);
  centerRoof.position.set(0, 11.55, 0);
  gate.add(centerRoof);

  for (const side of [-1, 1]) {
    const sideRoof = createSweepingChineseRoof(5.6, 3.8, 1.45, 0.88, roofMat, goldMat, woodMat);
    sideRoof.position.set(side * 6.5, 9.05, 0);
    gate.add(sideRoof);

    // Hanging Real 3D Palace Lanterns + Warm Candle Halo
    const lx = side * 3.45;
    const ly = 7.25;
    if (lanternTemplate) {
      const lMesh = lanternTemplate.clone(true);
      lMesh.scale.setScalar(3.6);
      lMesh.position.set(lx, ly - 0.55, 0);
      gate.add(lMesh);
    }
    const glowCore = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 12, 10),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.35, 0.55) })
    );
    glowCore.position.set(lx, ly + 0.25, 0);
    gate.add(glowCore);
  }

  // Calligraphic Gold-Inlaid Jade Plaque「瓊 華 仙 宗」
  const cPlaque = document.createElement('canvas');
  cPlaque.width = 512;
  cPlaque.height = 220;
  const pCtx = cPlaque.getContext('2d')!;
  const bg = pCtx.createLinearGradient(0, 0, 0, 220);
  bg.addColorStop(0, '#13263a');
  bg.addColorStop(1, '#0b1826');
  pCtx.fillStyle = bg;
  pCtx.fillRect(0, 0, 512, 220);
  pCtx.strokeStyle = '#e5be6b';
  pCtx.lineWidth = 14;
  pCtx.strokeRect(12, 12, 488, 196);
  pCtx.strokeStyle = 'rgba(116, 212, 255, 0.45)';
  pCtx.lineWidth = 3;
  pCtx.strokeRect(26, 26, 460, 168);
  pCtx.fillStyle = '#fce5a8';
  pCtx.shadowColor = 'rgba(255, 195, 90, 0.65)';
  pCtx.shadowBlur = 12;
  pCtx.font = 'bold 74px "STKaiti", "Kaiti SC", "Songti SC", serif';
  pCtx.textAlign = 'center';
  pCtx.textBaseline = 'middle';
  pCtx.fillText('瓊 華 仙 宗', 256, 114);

  const plaqueTex = new THREE.CanvasTexture(cPlaque);
  plaqueTex.colorSpace = THREE.SRGBColorSpace;
  const plaque = new THREE.Mesh(
    new THREE.BoxGeometry(4.2, 1.72, 0.34),
    new THREE.MeshStandardMaterial({
      map: plaqueTex,
      emissive: new THREE.Color(0x4a3312),
      emissiveIntensity: 0.6,
      roughness: 0.3,
      metalness: 0.35,
    })
  );
  plaque.position.set(0, 9.45, 0.42);
  gate.add(plaque);

  return gate;
}

/**
 * Builds the Monumental Three-Tiered Qionghua Main Immortal Palace (`太一仙宫`)
 * crowning the distant Kunlun snow peaks behind Juanyun Summit!
 */
export function createTaiyiImmortalPalace(
  marbleMat: THREE.Material,
  woodMat: THREE.Material,
  roofMat: THREE.Material,
  goldMat: THREE.Material
): THREE.Group {
  const palace = new THREE.Group();

  // Grand White-Jade Imperial Sumeru Terrace (`汉白玉须弥座`)
  const terrace1 = new THREE.Mesh(new THREE.BoxGeometry(38, 4.5, 22), marbleMat);
  terrace1.position.y = 2.25;
  terrace1.castShadow = true;
  terrace1.receiveShadow = true;
  palace.add(terrace1);

  const terrace2 = new THREE.Mesh(new THREE.BoxGeometry(31, 3.2, 18), marbleMat);
  terrace2.position.y = 6.1;
  terrace2.castShadow = true;
  palace.add(terrace2);

  // Warm glowing lattice window material
  const windowGlowMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(1.65, 1.18, 0.58),
  });

  // 3 Sweeping Pagoda Palace Tiers
  const tiers = [
    { baseY: 7.7, w: 25.0, h: 5.8, d: 14.0, roofW: 32.5, roofD: 20.5, roofH: 4.2, lift: 2.2, cols: 7 },
    { baseY: 16.2, w: 17.5, h: 5.0, d: 10.2, roofW: 24.0, roofD: 15.8, roofH: 3.6, lift: 1.9, cols: 5 },
    { baseY: 23.6, w: 10.8, h: 4.4, d: 6.8, roofW: 16.5, roofD: 11.6, roofH: 3.4, lift: 1.7, cols: 3 },
  ];

  for (const t of tiers) {
    const hallCore = new THREE.Mesh(new THREE.BoxGeometry(t.w, t.h, t.d), woodMat);
    hallCore.position.y = t.baseY + t.h * 0.5;
    hallCore.castShadow = true;
    palace.add(hallCore);

    // Glowing palace doorway/windows facing Juanyun Arena (+Z)
    for (let c = 0; c < t.cols - 1; c++) {
      const wx = ((c + 0.5) / (t.cols - 1) - 0.5) * (t.w * 0.76);
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.4, t.h * 0.58), windowGlowMat);
      win.position.set(wx, t.baseY + t.h * 0.48, t.d * 0.5 + 0.06);
      palace.add(win);
    }

    // Perimeter Vermilion Pillars
    for (let c = 0; c < t.cols; c++) {
      const px = (c / (t.cols - 1) - 0.5) * (t.w + 0.6);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, t.h, 12), woodMat);
      col.position.set(px, t.baseY + t.h * 0.5, t.d * 0.5 + 0.25);
      palace.add(col);
    }

    // Sweeping Curved Glazed Roof
    const roof = createSweepingChineseRoof(t.roofW, t.roofD, t.roofH, t.lift, roofMat, goldMat, woodMat);
    roof.position.y = t.baseY + t.h;
    palace.add(roof);
  }

  // Flanking Side Pavilions (`配殿钟鼓楼`)
  for (const side of [-1, 1]) {
    const pav = new THREE.Group();
    pav.position.set(side * 24.5, 4.2, 4.0);
    const base = new THREE.Mesh(new THREE.BoxGeometry(9.2, 4.5, 9.2), marbleMat);
    base.position.y = 2.25;
    pav.add(base);
    const body = new THREE.Mesh(new THREE.BoxGeometry(6.4, 5.2, 6.4), woodMat);
    body.position.y = 7.1;
    pav.add(body);
    const pRoof = createSweepingChineseRoof(10.8, 10.8, 3.2, 1.65, roofMat, goldMat, woodMat);
    pRoof.position.y = 9.7;
    pav.add(pRoof);
    palace.add(pav);
  }

  // Golden Immortal Spire (`九重相轮宝顶`)
  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.75, 6.8, 12), goldMat);
  spire.position.y = 34.2;
  palace.add(spire);

  return palace;
}

/**
 * Builds a sculpted Diamond-Beveled Colossal Floating Rune Greatsword (`镇派悬空巨剑`)!
 */
export function createSculptedColossalSword(
  stoneBladeMat: THREE.Material,
  goldMat: THREE.Material,
  isFireSide: boolean
): { group: THREE.Group; runeMat: THREE.MeshBasicMaterial } {
  const swordGroup = new THREE.Group();

  // Seamless Single-Piece Diamond-Beveled Monumental Blade (Y: +11.2 guard -> -11.5 body -> -16.8 sharp tip)
  const wTop = 1.38;
  const wMid = 1.18;
  const tTop = 0.42;
  const tMid = 0.34;
  // Cross-section vertices at Y=+11.2 (ring 0) and Y=-11.5 (ring 1), converging to tip (0, -16.8, 0) (v8)
  const verts = new Float32Array([
    // Ring 0 (Y = +11.2): +X, +Z, -X, -Z
    wTop, 11.2, 0,
    0, 11.2, tTop,
    -wTop, 11.2, 0,
    0, 11.2, -tTop,
    // Ring 1 (Y = -11.5): +X, +Z, -X, -Z
    wMid, -11.5, 0,
    0, -11.5, tMid,
    -wMid, -11.5, 0,
    0, -11.5, -tMid,
    // Tip (vertex 8)
    0, -16.8, 0,
  ]);
  const indices = [
    // Upper-to-lower 4 beveled faces
    0, 4, 1,  1, 4, 5,
    1, 5, 2,  2, 5, 6,
    2, 6, 3,  3, 6, 7,
    3, 7, 0,  0, 7, 4,
    // 4 sharp spear-tip faces
    4, 8, 5,
    5, 8, 6,
    6, 8, 7,
    7, 8, 4,
  ];
  const bladeGeo = new THREE.BufferGeometry();
  bladeGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  const uvs = new Float32Array([
    1, 1,  0.5, 1,  0, 1,  0.5, 1,
    1, 0.2, 0.5, 0.2, 0, 0.2, 0.5, 0.2,
    0.5, 0,
  ]);
  bladeGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  bladeGeo.setIndex(indices);
  bladeGeo.computeVertexNormals();

  const blade = new THREE.Mesh(bladeGeo, stoneBladeMat);
  blade.castShadow = true;
  swordGroup.add(blade);

  // Swept Dragon-Wing Crossguard
  const guardCenter = new THREE.Mesh(new THREE.OctahedronGeometry(1.55, 0), goldMat);
  guardCenter.position.y = 11.4;
  guardCenter.scale.set(1.35, 0.85, 0.65);
  swordGroup.add(guardCenter);

  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.ConeGeometry(0.92, 4.8, 4), goldMat);
    wing.position.set(side * 2.85, 12.15, 0);
    wing.rotation.z = -side * 1.15;
    wing.rotation.y = Math.PI / 4;
    swordGroup.add(wing);
  }

  // Carved Grip & Pommel Ring
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.56, 4.8, 10), goldMat);
  grip.position.y = 14.2;
  swordGroup.add(grip);

  const pommelRing = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.22, 8, 20), goldMat);
  pommelRing.position.y = 17.2;
  swordGroup.add(pommelRing);

  // Glowing Daoist Rune Core Channel + Floating Halo Ring
  const runeMat = new THREE.MeshBasicMaterial({
    color: isFireSide ? new THREE.Color(1.85, 0.52, 0.18) : new THREE.Color(0.42, 1.45, 2.15),
  });
  const runeStrip = new THREE.Mesh(new THREE.BoxGeometry(0.32, 21.0, 0.88), runeMat);
  runeStrip.position.y = -0.2;
  swordGroup.add(runeStrip);

  const swordHalo = new THREE.Mesh(new THREE.TorusGeometry(2.7, 0.08, 6, 32), runeMat);
  swordHalo.rotation.x = Math.PI / 2;
  swordHalo.position.y = 11.4;
  swordGroup.add(swordHalo);

  return { group: swordGroup, runeMat };
}
