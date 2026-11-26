import * as THREE from 'three';
import { PbrMaterialMaps } from '../assets/assetLoader';
import { applyKunlunSurfaceShader, boxMeters, scaleUvMeters } from './surfaceMaterials';

export function applyWorldSnowShader(
  mat: THREE.MeshStandardMaterial,
  snowPbr: PbrMaterialMaps,
  snowStrength = 0.58,
  _threshold = 0.42
): THREE.MeshStandardMaterial {
  return applyKunlunSurfaceShader(mat, snowPbr, {
    snowCoverage: snowStrength,
    iceGlaze: 0.16,
    stoneMacroBreakup: 0.32,
  });
}

/**
 * Generates an authentic sweeping Chinese curved-tile roof (`飞檐翘角歇山顶`) with:
 * - World-meter ceramic tile UVs (`scaleUvMeters`)
 * - Painted imperial `旋子彩画` frieze beam (`friezeMat`) + tiered `斗拱` corbel bracket clusters!
 * - Sculpted ridge `正脊`, `鸱吻` dragon-tail finials, 4 sweeping corner hip ridges (`戗脊`), and bronze bells!
 */
export function createSweepingChineseRoof(
  spanX: number,
  spanZ: number,
  riseY: number,
  curveLift: number,
  roofMat: THREE.Material,
  goldMat: THREE.Material,
  woodMat: THREE.Material,
  friezeMat?: THREE.Material
): THREE.Group {
  const group = new THREE.Group();
  const segX = 22;
  const segZ = 18;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const halfX = spanX * 0.5;
  const halfZ = spanZ * 0.5;
  const ridgeHalfX = Math.max(0.4, halfX * 0.48);

  const evalRoofPoint = (nx: number, nz: number): THREE.Vector3 => {
    const ax = Math.abs(nx);
    const az = Math.abs(nz);
    const dxRidge = Math.max(0, ax * halfX - ridgeHalfX) / Math.max(0.01, halfX - ridgeHalfX);
    const distFromPeak = Math.min(1.0, Math.hypot(dxRidge * 0.92, az));

    const concave = Math.pow(1.0 - distFromPeak, 1.58);
    const cornerFactor = Math.pow(ax * az, 1.85);
    const edgeFlare = Math.pow(distFromPeak, 3.0) * 0.12;

    const x = nx * halfX * (1.0 + cornerFactor * 0.085);
    const z = nz * halfZ * (1.0 + cornerFactor * 0.085);
    const y = concave * riseY + cornerFactor * curveLift + edgeFlare * riseY;
    return new THREE.Vector3(x, y, z);
  };

  for (let iz = 0; iz <= segZ; iz++) {
    const nz = (iz / segZ) * 2 - 1;
    for (let ix = 0; ix <= segX; ix++) {
      const nx = (ix / segX) * 2 - 1;
      const p = evalRoofPoint(nx, nz);
      positions.push(p.x, p.y, p.z);
      uvs.push((nx + 1) * 0.5 * (spanX * 0.52), (nz + 1) * 0.5 * (spanZ * 0.52));
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
  const uvAttr = new THREE.Float32BufferAttribute(uvs, 2);
  roofGeo.setAttribute('uv', uvAttr);
  roofGeo.setAttribute('uv1', uvAttr.clone());
  roofGeo.setIndex(indices);
  roofGeo.computeVertexNormals();

  const roofMesh = new THREE.Mesh(roofGeo, roofMat);
  roofMesh.castShadow = true;
  roofMesh.receiveShadow = true;
  group.add(roofMesh);

  // Eave fascia drip-edge (`瓦当滴水`) around perimeter
  const soffitW = spanX * 0.80;
  const soffitD = spanZ * 0.78;
  const architrave = new THREE.Mesh(
    boxMeters(soffitW, 0.46, soffitD, 0.35),
    friezeMat ?? woodMat
  );
  architrave.position.y = -0.22;
  architrave.castShadow = true;
  architrave.receiveShadow = true;
  group.add(architrave);

  // Authentic Tiered Dougong Bracket Clusters (`斗拱攒`) along front & back eaves!
  const bracketCount = Math.max(3, Math.round(soffitW / 2.2));
  for (let b = 0; b < bracketCount; b++) {
    const bx = ((b / (bracketCount - 1)) - 0.5) * (soffitW * 0.90);
    for (const sz of [-1, 1]) {
      const bz = sz * (soffitD * 0.5 + 0.08);
      const dou = new THREE.Mesh(boxMeters(0.42, 0.16, 0.38, 0.8), woodMat);
      dou.position.set(bx, -0.34, bz);
      group.add(dou);
      const gong = new THREE.Mesh(boxMeters(0.68, 0.14, 0.54, 0.8), goldMat);
      gong.position.set(bx, -0.18, bz + sz * 0.08);
      group.add(gong);
    }
  }

  // Main Ridge Beam (`正脊`) & Sculpted Dragon-Tail Finials (`鸱吻`)
  const mainRidgeLen = ridgeHalfX * 2.08;
  const mainRidge = new THREE.Mesh(boxMeters(mainRidgeLen, 0.34, 0.32, 0.5), goldMat);
  mainRidge.position.y = riseY + 0.14;
  mainRidge.castShadow = true;
  group.add(mainRidge);

  for (const sx of [-1, 1]) {
    const chiwen = new THREE.Mesh(scaleUvMeters(new THREE.ConeGeometry(0.28, 0.95, 6), 1.2, 1.2), goldMat);
    chiwen.position.set(sx * (ridgeHalfX + 0.08), riseY + 0.50, 0);
    chiwen.rotation.z = -sx * 0.32;
    group.add(chiwen);
  }

  // 4 Sweeping Corner Hip Ridges (`戗脊`) + Immortal Ridge Beasts (`仙人走兽`) + Bronze Wind Bells
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
      const ridgeTube = new THREE.Mesh(
        scaleUvMeters(new THREE.TubeGeometry(curve, 12, 0.09, 6, false), 2.5, 0.5),
        goldMat
      );
      ridgeTube.castShadow = true;
      group.add(ridgeTube);

      const tipPt = pts[pts.length - 1];
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.58, 5), goldMat);
      horn.position.set(tipPt.x * 1.02, tipPt.y + 0.24, tipPt.z * 1.02);
      horn.rotation.set(sz * 0.45, 0, -sx * 0.45);
      group.add(horn);

      const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 0.26, 8), goldMat);
      bell.position.set(tipPt.x * 0.96, tipPt.y - 0.30, tipPt.z * 0.96);
      group.add(bell);
    }
  }

  return group;
}

/**
 * Builds an authentic Carved White-Jade Balustrade Run (`汉白玉云头望柱雕花栏杆`) with physical meter UVs!
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

  const horizLen = Math.hypot(delta.x, delta.z) || 0.001;
  const yaw = Math.atan2(delta.x, delta.z);
  const slopePitch = -Math.atan2(delta.y, horizLen);

  const railCarrier = new THREE.Group();
  railCarrier.position.copy(mid);
  railCarrier.rotation.y = yaw;

  const plinth = new THREE.Mesh(boxMeters(0.30, 0.20, totalLen, 0.65), marbleMat);
  plinth.position.y = 0.10;
  plinth.rotation.x = slopePitch;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  railCarrier.add(plinth);

  const panel = new THREE.Mesh(boxMeters(0.12, 0.50, totalLen * 0.98, 0.75), marbleMat);
  panel.position.y = 0.46;
  panel.rotation.x = slopePitch;
  panel.castShadow = true;
  panel.receiveShadow = true;
  railCarrier.add(panel);

  const topRail = new THREE.Mesh(boxMeters(0.24, 0.13, totalLen + 0.18, 0.65), marbleMat);
  topRail.position.y = 0.84;
  topRail.rotation.x = slopePitch;
  topRail.castShadow = true;
  railCarrier.add(topRail);

  const goldInlay = new THREE.Mesh(boxMeters(0.16, 0.05, totalLen * 0.98, 0.8), goldMat);
  goldInlay.position.y = 0.74;
  goldInlay.rotation.x = slopePitch;
  railCarrier.add(goldInlay);

  group.add(railCarrier);

  const nPosts = Math.max(2, postCount);
  for (let i = 0; i < nPosts; i++) {
    const t = i / (nPosts - 1);
    const p = new THREE.Vector3().lerpVectors(start, end, t);
    const post = new THREE.Mesh(boxMeters(0.30, 1.08, 0.30, 0.75), marbleMat);
    post.position.set(p.x, p.y + 0.54, p.z);
    post.rotation.y = yaw;
    post.castShadow = true;
    post.receiveShadow = true;
    group.add(post);

    // Carved Lotus Necking + Cloud Finial (`莲花云头柱头`)
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.16, 0.10, 10), goldMat);
    collar.position.set(p.x, p.y + 1.11, p.z);
    group.add(collar);

    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), marbleMat);
    finial.scale.set(1, 1.38, 1);
    finial.position.set(p.x, p.y + 1.24, p.z);
    finial.castShadow = true;
    group.add(finial);
  }

  return group;
}

/**
 * Builds a Covered Pillared Vermilion Palace Cloister (`朱红雕花窗棂抄手游廊`)
 * with hanging Chinese palace chandeliers & warm lantern light anchor positions!
 */
export function createChineseCoveredCloister(
  lengthZ: number,
  bays: number,
  marbleMat: THREE.Material,
  woodMat: THREE.Material,
  roofMat: THREE.Material,
  goldMat: THREE.Material,
  friezeMat: THREE.Material,
  chandelierTemplate?: THREE.Group
): { group: THREE.Group; lanternLocalPositions: THREE.Vector3[] } {
  const group = new THREE.Group();
  const widthX = 3.8;
  const colH = 4.2;
  const lanternLocalPositions: THREE.Vector3[] = [];

  // Raised White-Jade Sumeru Walkway Base (`游廊台基`)
  const base = new THREE.Mesh(boxMeters(widthX, 0.65, lengthZ, 0.55), marbleMat);
  base.position.y = 0.325;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  // Back Lattice Wall (`雕花漏窗廊墙` on outer side x = +widthX*0.42)
  const backWall = new THREE.Mesh(boxMeters(0.26, colH * 0.92, lengthZ * 0.96, 0.45), woodMat);
  backWall.position.set(widthX * 0.42, 0.65 + colH * 0.46, 0);
  backWall.castShadow = true;
  backWall.receiveShadow = true;
  group.add(backWall);

  const backFrieze = new THREE.Mesh(boxMeters(0.32, 0.55, lengthZ * 0.97, 0.35), friezeMat);
  backFrieze.position.set(widthX * 0.40, 0.65 + colH - 0.28, 0);
  group.add(backFrieze);

  // Paired Vermilion Columns + `美人靠` Bench Railings + Hanging Chandeliers
  for (let i = 0; i <= bays; i++) {
    const pz = ((i / bays) - 0.5) * (lengthZ * 0.92);
    for (const sx of [-1, 1]) {
      const px = sx * (widthX * 0.40);
      const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.28, 12), marbleMat);
      plinth.position.set(px, 0.78, pz);
      group.add(plinth);

      const col = new THREE.Mesh(
        scaleUvMeters(new THREE.CylinderGeometry(0.20, 0.23, colH, 14), 1.5, 2.5),
        woodMat
      );
      col.position.set(px, 0.65 + colH * 0.5, pz);
      col.castShadow = true;
      col.receiveShadow = true;
      group.add(col);
    }

    if (i < bays) {
      const midZ = (((i + 0.5) / bays) - 0.5) * (lengthZ * 0.92);
      const baySpan = (lengthZ * 0.92) / bays;

      // Overhead Painted Frieze Beam (`倒挂楣子 + 彩画额枋`)
      const beam = new THREE.Mesh(boxMeters(0.28, 0.52, baySpan, 0.35), friezeMat);
      beam.position.set(-widthX * 0.40, 0.65 + colH - 0.26, midZ);
      group.add(beam);

      // Hanging Palace Chandelier in alternate bays!
      if (i % 2 === 1) {
        if (chandelierTemplate) {
          const ch = chandelierTemplate.clone(true);
          ch.scale.setScalar(1.65);
          ch.position.set(0, 0.65 + colH - 1.05, midZ);
          group.add(ch);
        }
        const bulb = new THREE.Mesh(
          new THREE.SphereGeometry(0.16, 10, 8),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(2.1, 1.25, 0.45) })
        );
        bulb.position.set(0, 0.65 + colH - 0.85, midZ);
        group.add(bulb);
        lanternLocalPositions.push(new THREE.Vector3(0, 0.65 + colH - 0.85, midZ));
      }
    }
  }

  const roof = createSweepingChineseRoof(
    widthX + 2.2,
    lengthZ + 2.4,
    1.85,
    0.95,
    roofMat,
    goldMat,
    woodMat,
    friezeMat
  );
  roof.position.y = 0.65 + colH;
  group.add(roof);

  return { group, lanternLocalPositions };
}

/**
 * Builds the monumental Three-Bay Five-Roof Qionghua Mountain Gate (`三间五楼·琼华仙门牌坊`)
 * with authentic `青绿旋子彩画` beams, `抱鼓石` drum bases, and hanging palace lanterns!
 */
export function createQionghuaGrandPaifang(
  marbleMat: THREE.Material,
  woodMat: THREE.Material,
  roofMat: THREE.Material,
  goldMat: THREE.Material,
  lanternTemplate?: THREE.Group,
  friezeMat?: THREE.Material
): THREE.Group {
  const gate = new THREE.Group();
  const beamMat = friezeMat ?? woodMat;

  const pillarXs = [-8.2, -4.4, 4.4, 8.2];
  const pillarHs = [9.2, 11.6, 11.6, 9.2];

  for (let i = 0; i < 4; i++) {
    const px = pillarXs[i];
    const ph = pillarHs[i];

    // Carved White-Jade Sumeru Plinth & Drum Stones (`抱鼓石夹杆石`)
    const plinth = new THREE.Mesh(
      scaleUvMeters(new THREE.CylinderGeometry(0.86, 1.02, 1.20, 16), 2.2, 0.8),
      marbleMat
    );
    plinth.position.set(px, 0.60, 0);
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    gate.add(plinth);

    for (const sz of [-1, 1]) {
      const drumBlock = new THREE.Mesh(boxMeters(0.42, 0.72, 1.15, 0.75), marbleMat);
      drumBlock.position.set(px, 0.36, sz * 1.05);
      drumBlock.castShadow = true;
      drumBlock.receiveShadow = true;
      gate.add(drumBlock);

      const drum = new THREE.Mesh(
        scaleUvMeters(new THREE.CylinderGeometry(0.58, 0.58, 0.36, 18), 1.4, 0.5),
        marbleMat
      );
      drum.rotation.z = Math.PI / 2;
      drum.position.set(px, 0.88, sz * 1.08);
      drum.castShadow = true;
      gate.add(drum);
    }

    const col = new THREE.Mesh(
      scaleUvMeters(new THREE.CylinderGeometry(0.44, 0.50, ph, 20), 1.6, 4.5),
      woodMat
    );
    col.position.set(px, ph * 0.5 + 0.4, 0);
    col.castShadow = true;
    col.receiveShadow = true;
    gate.add(col);

    for (const ry of [1.45, ph - 0.55]) {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.54, 0.24, 18), goldMat);
      ring.position.set(px, ry, 0);
      gate.add(ring);
    }
  }

  // Painted Imperial Dragon-Cloud Architrave Crossbeams (`大额枋 / 小额枋 / 龙凤花板`)
  const lowerBeam = new THREE.Mesh(boxMeters(17.8, 0.86, 0.88, 0.32), beamMat);
  lowerBeam.position.set(0, 8.25, 0);
  lowerBeam.castShadow = true;
  gate.add(lowerBeam);

  const lowerGoldTrim = new THREE.Mesh(boxMeters(17.9, 0.16, 0.96, 0.5), goldMat);
  lowerGoldTrim.position.set(0, 8.74, 0);
  gate.add(lowerGoldTrim);

  const upperBeam = new THREE.Mesh(boxMeters(10.0, 0.92, 0.94, 0.32), beamMat);
  upperBeam.position.set(0, 10.55, 0);
  upperBeam.castShadow = true;
  gate.add(upperBeam);

  // Five Sweeping Curved Roofs (Center Main Roof + 2 Inner Bay Roofs + 2 Outer Wing Tip Roofs)
  const centerRoof = createSweepingChineseRoof(12.4, 4.6, 2.05, 1.18, roofMat, goldMat, woodMat, beamMat);
  centerRoof.position.set(0, 11.75, 0);
  gate.add(centerRoof);

  for (const side of [-1, 1]) {
    const innerRoof = createSweepingChineseRoof(5.8, 3.9, 1.50, 0.90, roofMat, goldMat, woodMat, beamMat);
    innerRoof.position.set(side * 6.45, 9.15, 0);
    gate.add(innerRoof);

    const wingRoof = createSweepingChineseRoof(3.4, 3.1, 1.05, 0.68, roofMat, goldMat, woodMat, beamMat);
    wingRoof.position.set(side * 9.35, 7.65, 0);
    gate.add(wingRoof);

    const lx = side * 3.35;
    const ly = 7.25;
    if (lanternTemplate) {
      const lMesh = lanternTemplate.clone(true);
      lMesh.scale.setScalar(3.5);
      lMesh.position.set(lx, ly - 0.55, 0);
      gate.add(lMesh);
    }
    const glowCore = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 12, 10),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.32, 0.50) })
    );
    glowCore.position.set(lx, ly + 0.22, 0);
    gate.add(glowCore);
  }

  // Calligraphic Gold-Inlaid Jade Plaque「瓊 華 仙 宗」
  const cPlaque = document.createElement('canvas');
  cPlaque.width = 512;
  cPlaque.height = 220;
  const pCtx = cPlaque.getContext('2d')!;
  const bg = pCtx.createLinearGradient(0, 0, 0, 220);
  bg.addColorStop(0, '#0f2032');
  bg.addColorStop(1, '#07111d');
  pCtx.fillStyle = bg;
  pCtx.fillRect(0, 0, 512, 220);
  pCtx.strokeStyle = '#d9b15f';
  pCtx.lineWidth = 14;
  pCtx.strokeRect(12, 12, 488, 196);
  pCtx.strokeStyle = 'rgba(130, 205, 250, 0.42)';
  pCtx.lineWidth = 3;
  pCtx.strokeRect(26, 26, 460, 168);
  pCtx.fillStyle = '#fae1a0';
  pCtx.shadowColor = 'rgba(255, 185, 75, 0.65)';
  pCtx.shadowBlur = 10;
  pCtx.font = 'bold 74px "STKaiti", "Kaiti SC", "Songti SC", serif';
  pCtx.textAlign = 'center';
  pCtx.textBaseline = 'middle';
  pCtx.fillText('瓊 華 仙 宗', 256, 114);

  const plaqueTex = new THREE.CanvasTexture(cPlaque);
  plaqueTex.colorSpace = THREE.SRGBColorSpace;
  const plaque = new THREE.Mesh(
    boxMeters(4.3, 1.76, 0.36, 0.23),
    new THREE.MeshStandardMaterial({
      map: plaqueTex,
      emissive: new THREE.Color(0x3a260a),
      emissiveIntensity: 0.55,
      roughness: 0.32,
      metalness: 0.42,
    })
  );
  // Restore exact 0..1 front-face UVs on plaque so text reads cleanly
  const pGeo = new THREE.BoxGeometry(4.3, 1.76, 0.36);
  plaque.geometry.dispose();
  plaque.geometry = pGeo;
  plaque.position.set(0, 9.55, 0.44);
  gate.add(plaque);

  return gate;
}

/**
 * Builds the Monumental Three-Tiered Qionghua Main Immortal Palace (`重檐庑殿·太一仙宫大殿`)
 * with carved Sumeru cornices, white-jade balustrades, carved dragon Danbi ramp,
 * lattice `隔扇门窗`, painted `旋子彩画` friezes, and flanking Bell & Drum Towers!
 */
export function createTaiyiImmortalPalace(
  marbleMat: THREE.Material,
  stoneWallMat: THREE.Material,
  woodMat: THREE.Material,
  roofMat: THREE.Material,
  goldMat: THREE.Material,
  friezeMat?: THREE.Material,
  dragonRampMat?: THREE.Material
): THREE.Group {
  const palace = new THREE.Group();
  const beamMat = friezeMat ?? woodMat;

  // 1. Two-Tier Carved Sumeru Terrace (`双层汉白玉须弥座丹墀`) with Molded Cornices & Balustrades!
  const podiumSpecs = [
    { y: 0.0, h: 4.4, w: 42.0, d: 24.0 },
    { y: 4.4, h: 3.4, w: 33.5, d: 19.2 },
  ];

  for (const p of podiumSpecs) {
    // Ashlar stone core
    const core = new THREE.Mesh(boxMeters(p.w - 0.6, p.h - 0.5, p.d - 0.6, 0.35), stoneWallMat);
    core.position.y = p.y + p.h * 0.5;
    core.castShadow = true;
    core.receiveShadow = true;
    palace.add(core);

    // Carved White-Jade Bottom Plinth & Top Lotus Cornice (`下枋 / 上枭混`)
    const botMold = new THREE.Mesh(boxMeters(p.w + 0.4, 0.55, p.d + 0.4, 0.45), marbleMat);
    botMold.position.y = p.y + 0.275;
    botMold.receiveShadow = true;
    palace.add(botMold);

    const topMold = new THREE.Mesh(boxMeters(p.w + 0.5, 0.52, p.d + 0.5, 0.45), marbleMat);
    topMold.position.y = p.y + p.h - 0.24;
    topMold.castShadow = true;
    topMold.receiveShadow = true;
    palace.add(topMold);

    // Front White-Jade Balustrades leaving center 7.6m open for Imperial Dragon Stairway!
    const topY = p.y + p.h;
    const frontZ = p.d * 0.5;
    for (const sx of [-1, 1]) {
      const rail = createJadeBalustradeRun(
        new THREE.Vector3(sx * 4.0, topY, frontZ),
        new THREE.Vector3(sx * (p.w * 0.5 - 0.3), topY, frontZ),
        5,
        marbleMat,
        goldMat
      );
      palace.add(rail);
    }
  }

  // Central Ceremonial Stairway + Carved Imperial Dragon Ramp (`御路云龙石雕`) up the Palace Podium!
  const rampH = 7.8;
  const rampRun = 9.5;
  const frontEdgeZ = 12.0;
  const totalSteps = 22;
  for (let i = 0; i < totalSteps; i++) {
    const t = (i + 0.5) / totalSteps;
    const sy = t * rampH;
    const sz = frontEdgeZ + (1 - t) * rampRun;
    const step = new THREE.Mesh(boxMeters(7.8, rampH / totalSteps + 0.4, rampRun / totalSteps + 0.15, 0.55), marbleMat);
    step.position.set(0, sy - 0.15, sz);
    step.castShadow = true;
    step.receiveShadow = true;
    palace.add(step);
  }
  if (dragonRampMat) {
    const rampAngle = Math.atan2(rampH, rampRun);
    const rampLen = Math.hypot(rampH, rampRun);
    const dragonSlab = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.26, rampLen), dragonRampMat);
    dragonSlab.position.set(0, rampH * 0.5 + 0.12, frontEdgeZ + rampRun * 0.5);
    dragonSlab.rotation.x = rampAngle;
    dragonSlab.castShadow = true;
    dragonSlab.receiveShadow = true;
    palace.add(dragonSlab);
  }
  for (const sx of [-1, 1]) {
    palace.add(
      createJadeBalustradeRun(
        new THREE.Vector3(sx * 4.0, 0, frontEdgeZ + rampRun),
        new THREE.Vector3(sx * 4.0, rampH, frontEdgeZ),
        6,
        marbleMat,
        goldMat
      )
    );
  }

  // Subtle warm candlelit rice-paper lattice glow (NOT blown-out white blocks!)
  const paperGlowMat = new THREE.MeshStandardMaterial({
    color: 0xffdca8,
    emissive: new THREE.Color(0xff9b3d),
    emissiveIntensity: 1.05,
    roughness: 0.65,
  });

  // 3 Sweeping Pagoda Palace Tiers with Framed Lattice `隔扇门窗` & Painted Frieze Beams
  const tiers = [
    { baseY: 7.8, w: 26.0, h: 6.0, d: 14.4, roofW: 33.8, roofD: 21.2, roofH: 4.4, lift: 2.25, cols: 7 },
    { baseY: 16.5, w: 18.2, h: 5.0, d: 10.4, roofW: 24.8, roofD: 16.2, roofH: 3.7, lift: 1.95, cols: 5 },
    { baseY: 24.0, w: 11.2, h: 4.5, d: 7.0, roofW: 17.0, roofD: 12.0, roofH: 3.5, lift: 1.75, cols: 3 },
  ];

  for (const t of tiers) {
    const hallCore = new THREE.Mesh(boxMeters(t.w, t.h, t.d, 0.38), woodMat);
    hallCore.position.y = t.baseY + t.h * 0.5;
    hallCore.castShadow = true;
    hallCore.receiveShadow = true;
    palace.add(hallCore);

    const friezeBand = new THREE.Mesh(boxMeters(t.w + 0.5, 0.72, t.d + 0.5, 0.30), beamMat);
    friezeBand.position.y = t.baseY + t.h - 0.38;
    palace.add(friezeBand);

    // Framed Chinese Lattice Doors (`雕花直棂隔扇门`)
    for (let c = 0; c < t.cols - 1; c++) {
      const wx = ((c + 0.5) / (t.cols - 1) - 0.5) * (t.w * 0.78);
      const winH = t.h * 0.62;
      const winY = t.baseY + winH * 0.5 + 0.15;
      const winZ = t.d * 0.5 + 0.06;

      const paper = new THREE.Mesh(new THREE.PlaneGeometry(1.45, winH), paperGlowMat);
      paper.position.set(wx, winY, winZ);
      palace.add(paper);

      // Vertical & horizontal dark-red wood muntin lattice bars across the warm rice-paper!
      for (const mx of [-0.48, 0, 0.48]) {
        const barV = new THREE.Mesh(boxMeters(0.10, winH + 0.08, 0.10, 1.0), woodMat);
        barV.position.set(wx + mx, winY, winZ + 0.03);
        palace.add(barV);
      }
      for (const my of [-0.28, 0.05, 0.34]) {
        const barH = new THREE.Mesh(boxMeters(1.52, 0.10, 0.10, 1.0), woodMat);
        barH.position.set(wx, winY + my * winH, winZ + 0.03);
        palace.add(barH);
      }
    }

    // Perimeter Vermilion Pillars on Carved Marble Drum Bases
    for (let c = 0; c < t.cols; c++) {
      const px = (c / (t.cols - 1) - 0.5) * (t.w + 0.7);
      const pz = t.d * 0.5 + 0.32;
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.54, 0.36, 12), marbleMat);
      drum.position.set(px, t.baseY + 0.18, pz);
      palace.add(drum);

      const col = new THREE.Mesh(
        scaleUvMeters(new THREE.CylinderGeometry(0.35, 0.40, t.h, 14), 1.5, 3.0),
        woodMat
      );
      col.position.set(px, t.baseY + t.h * 0.5, pz);
      col.castShadow = true;
      palace.add(col);
    }

    const roof = createSweepingChineseRoof(
      t.roofW,
      t.roofD,
      t.roofH,
      t.lift,
      roofMat,
      goldMat,
      woodMat,
      beamMat
    );
    roof.position.y = t.baseY + t.h;
    palace.add(roof);
  }

  // Flanking Side Bell & Drum Pavilions (`配殿钟鼓楼`)
  for (const side of [-1, 1]) {
    const pav = new THREE.Group();
    pav.position.set(side * 25.5, 4.0, 4.5);

    const base = new THREE.Mesh(boxMeters(9.4, 4.6, 9.4, 0.38), stoneWallMat);
    base.position.y = 2.3;
    base.castShadow = true;
    base.receiveShadow = true;
    pav.add(base);

    const cornice = new THREE.Mesh(boxMeters(9.9, 0.48, 9.9, 0.45), marbleMat);
    cornice.position.y = 4.5;
    pav.add(cornice);

    const body = new THREE.Mesh(boxMeters(6.6, 5.2, 6.6, 0.42), woodMat);
    body.position.y = 7.2;
    body.castShadow = true;
    pav.add(body);

    const pRoof = createSweepingChineseRoof(11.2, 11.2, 3.3, 1.68, roofMat, goldMat, woodMat, beamMat);
    pRoof.position.y = 9.8;
    pav.add(pRoof);
    palace.add(pav);
  }

  // Gilded Pagoda Crown Spire (`九重相轮鎏金宝顶`)
  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.72, 6.6, 12), goldMat);
  spire.position.y = 34.8;
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

  const wTop = 1.38;
  const wMid = 1.18;
  const tTop = 0.42;
  const tMid = 0.34;
  const verts = new Float32Array([
    wTop, 11.2, 0,
    0, 11.2, tTop,
    -wTop, 11.2, 0,
    0, 11.2, -tTop,
    wMid, -11.5, 0,
    0, -11.5, tMid,
    -wMid, -11.5, 0,
    0, -11.5, -tMid,
    0, -16.8, 0,
  ]);
  const indices = [
    0, 4, 1, 1, 4, 5,
    1, 5, 2, 2, 5, 6,
    2, 6, 3, 3, 6, 7,
    3, 7, 0, 0, 7, 4,
    4, 8, 5,
    5, 8, 6,
    6, 8, 7,
    7, 8, 4,
  ];
  const bladeGeo = new THREE.BufferGeometry();
  bladeGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  const uvs = new Float32Array([
    1, 6, 0.5, 6, 0, 6, 0.5, 6,
    1, 1, 0.5, 1, 0, 1, 0.5, 1,
    0.5, 0,
  ]);
  bladeGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  bladeGeo.setAttribute('uv1', new THREE.BufferAttribute(uvs.slice(), 2));
  bladeGeo.setIndex(indices);
  bladeGeo.computeVertexNormals();

  const blade = new THREE.Mesh(bladeGeo, stoneBladeMat);
  blade.castShadow = true;
  swordGroup.add(blade);

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

  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.56, 4.8, 10), goldMat);
  grip.position.y = 14.2;
  swordGroup.add(grip);

  const pommelRing = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.22, 8, 20), goldMat);
  pommelRing.position.y = 17.2;
  swordGroup.add(pommelRing);

  // Kept <= 1.85 HDR peak so Bloom glows softly without blowing out to pure white!
  const runeMat = new THREE.MeshBasicMaterial({
    color: isFireSide ? new THREE.Color(1.75, 0.48, 0.14) : new THREE.Color(0.38, 1.32, 1.95),
  });
  const runeStrip = new THREE.Mesh(new THREE.BoxGeometry(0.28, 21.0, 0.88), runeMat);
  runeStrip.position.y = -0.2;
  swordGroup.add(runeStrip);

  const swordHalo = new THREE.Mesh(new THREE.TorusGeometry(2.7, 0.07, 6, 32), runeMat);
  swordHalo.rotation.x = Math.PI / 2;
  swordHalo.position.y = 11.4;
  swordGroup.add(swordHalo);

  return { group: swordGroup, runeMat };
}
