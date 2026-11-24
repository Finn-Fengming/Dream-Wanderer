import * as THREE from 'three';
import {
  createGolemGreatsword,
  createHouyiBow,
  createSectSword,
  createWangshuSword,
  createXiheSword,
  WeaponRig,
} from './weapons';

export type ArchetypeId =
  | 'tianhe'
  | 'xuanxiao'
  | 'disciple'
  | 'cultivator'
  | 'golem'
  | 'lingsha'
  | 'mengli';

export type BoneName =
  | 'root'
  | 'hips'
  | 'spine'
  | 'chest'
  | 'neck'
  | 'head'
  | 'ribbonA'
  | 'ribbonB'
  | 'lUp'
  | 'lFore'
  | 'lHand'
  | 'rUp'
  | 'rFore'
  | 'rHand'
  | 'lThigh'
  | 'lShin'
  | 'lFoot'
  | 'rThigh'
  | 'rShin'
  | 'rFoot'
  | 'capeA'
  | 'capeB'
  | 'capeC';

export type ActionClipName =
  | 'none'
  | 'light1'
  | 'light2'
  | 'light3'
  | 'heavy'
  | 'jumpSlash'
  | 'dodge'
  | 'guardCounter'
  | 'parry'
  | 'skill_rush'
  | 'skill_bow'
  | 'drink'
  | 'hurt'
  | 'staggerKneel'
  | 'riposte'
  | 'death'
  | 'xx_combo1'
  | 'xx_combo2'
  | 'xx_delaySlam'
  | 'xx_thrust'
  | 'xx_palm'
  | 'xx_swordRain'
  | 'xx_roar'
  | 'xx_dance'
  | 'xx_meteor';

interface LoftRing {
  y: number;
  rx: number;
  rz: number;
  cx?: number;
  cz?: number;
  boneA: number;
  boneB: number;
  weightB: number;
}

const BONE_ORDER: BoneName[] = [
  'root',
  'hips',
  'spine',
  'chest',
  'neck',
  'head',
  'ribbonA',
  'ribbonB',
  'lUp',
  'lFore',
  'lHand',
  'rUp',
  'rFore',
  'rHand',
  'lThigh',
  'lShin',
  'lFoot',
  'rThigh',
  'rShin',
  'rFoot',
  'capeA',
  'capeB',
  'capeC',
];

const BONE_INDEX: Record<BoneName, number> = Object.fromEntries(
  BONE_ORDER.map((b, i) => [b, i])
) as Record<BoneName, number>;

/**
 * Builds a seamless multi-ring lofted BufferGeometry with smooth 2-bone GPU skinning weights.
 */
function buildSkinnedLoftGeometry(rings: LoftRing[], radialSegments = 14, closeCaps = true): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const skinIndices: number[] = [];
  const skinWeights: number[] = [];
  const indices: number[] = [];

  const ringCount = rings.length;
  const stride = radialSegments + 1;

  for (let r = 0; r < ringCount; r++) {
    const ring = rings[r];
    const v = r / Math.max(1, ringCount - 1);
    const cx = ring.cx ?? 0;
    const cz = ring.cz ?? 0;
    const wA = 1.0 - ring.weightB;
    const wB = ring.weightB;

    for (let s = 0; s <= radialSegments; s++) {
      const u = s / radialSegments;
      const theta = u * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      const px = cx + cosT * ring.rx;
      const py = ring.y;
      const pz = cz + sinT * ring.rz;

      positions.push(px, py, pz);
      const nx = cosT / Math.max(0.01, ring.rx);
      const nz = sinT / Math.max(0.01, ring.rz);
      const nLen = Math.hypot(nx, nz) || 1;
      normals.push(nx / nLen, 0.08, nz / nLen);
      uvs.push(u, v);

      skinIndices.push(ring.boneA, ring.boneB, 0, 0);
      skinWeights.push(wA, wB, 0, 0);
    }
  }

  for (let r = 0; r < ringCount - 1; r++) {
    for (let s = 0; s < radialSegments; s++) {
      const a = r * stride + s;
      const b = (r + 1) * stride + s;
      const c = (r + 1) * stride + (s + 1);
      const d = r * stride + (s + 1);
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  if (closeCaps && ringCount >= 2) {
    // Bottom & top center cap vertices
    const bot = rings[0];
    const botCenterIdx = positions.length / 3;
    positions.push(bot.cx ?? 0, bot.y, bot.cz ?? 0);
    normals.push(0, -1, 0);
    uvs.push(0.5, 0);
    skinIndices.push(bot.boneA, bot.boneB, 0, 0);
    skinWeights.push(1 - bot.weightB, bot.weightB, 0, 0);
    for (let s = 0; s < radialSegments; s++) {
      indices.push(botCenterIdx, s + 1, s);
    }

    const top = rings[ringCount - 1];
    const topRingStart = (ringCount - 1) * stride;
    const topCenterIdx = positions.length / 3;
    positions.push(top.cx ?? 0, top.y, top.cz ?? 0);
    normals.push(0, 1, 0);
    uvs.push(0.5, 1);
    skinIndices.push(top.boneA, top.boneB, 0, 0);
    skinWeights.push(1 - top.weightB, top.weightB, 0, 0);
    for (let s = 0; s < radialSegments; s++) {
      indices.push(topCenterIdx, topRingStart + s, topRingStart + s + 1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a skinned flowing cape/sash ribbon strip across capeA -> capeB -> capeC.
 */
function buildSkinnedCapeGeometry(widthTop: number, widthBot: number, yTop = 1.44, yBot = 0.26): THREE.BufferGeometry {
  const rows = 9;
  const cols = 6;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const skinIndices: number[] = [];
  const skinWeights: number[] = [];
  const indices: number[] = [];

  for (let r = 0; r <= rows; r++) {
    const v = r / rows;
    const y = THREE.MathUtils.lerp(yTop, yBot, v);
    const halfW = THREE.MathUtils.lerp(widthTop, widthBot, v) * 0.5;
    const zBase = THREE.MathUtils.lerp(-0.11, -0.19, v);

    let bA = BONE_INDEX.capeA;
    let bB = BONE_INDEX.capeB;
    let wB = 0;
    if (v < 0.5) {
      bA = BONE_INDEX.capeA;
      bB = BONE_INDEX.capeB;
      wB = v * 2.0;
    } else {
      bA = BONE_INDEX.capeB;
      bB = BONE_INDEX.capeC;
      wB = (v - 0.5) * 2.0;
    }

    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      const x = (u - 0.5) * 2 * halfW;
      const drapeZ = zBase - Math.cos((u - 0.5) * Math.PI) * 0.028;
      positions.push(x, y, drapeZ);
      normals.push(0, 0.1, -1);
      uvs.push(u, v);
      skinIndices.push(bA, bB, 0, 0);
      skinWeights.push(1 - wB, wB, 0, 0);
    }
  }

  const stride = cols + 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * stride + c;
      const b = (r + 1) * stride + c;
      const d = r * stride + (c + 1);
      const e = (r + 1) * stride + (c + 1);
      indices.push(a, b, d);
      indices.push(b, e, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

type PoseMap = Partial<Record<BoneName, [number, number, number]>>;

interface KeyframeDef {
  t: number; // 0..1 normalized progress
  ease?: 'lin' | 'in' | 'out' | 'snap' | 'io';
  pose: PoseMap;
  hipsY?: number;
  hipsZ?: number;
}

const BASE_COMBAT_READY: PoseMap = {
  hips: [0, -0.22, 0],
  spine: [0.06, 0.10, 0],
  chest: [0.08, 0.14, 0],
  head: [-0.06, -0.04, 0],
  rUp: [-0.26, -0.18, -0.34],
  rFore: [-0.62, 0, 0.12],
  rHand: [0.35, 0, -0.12],
  lUp: [-0.28, 0.22, 0.28],
  lFore: [-0.72, 0, -0.15],
  lThigh: [-0.14, 0.08, 0.04],
  lShin: [0.24, 0, 0],
  lFoot: [-0.10, 0, 0],
  rThigh: [0.12, -0.10, -0.04],
  rShin: [0.16, 0, 0],
  rFoot: [-0.24, 0, 0],
};

// 5-beat weighted martial-arts sword clips (windup -> pause -> quartic snap -> overshoot -> recover)
const ACTION_CLIPS: Record<Exclude<ActionClipName, 'none'>, KeyframeDef[]> = {
  light1: [
    // Right-shoulder diagonal downward slash (斜劈斩)
    { t: 0.16, ease: 'out', hipsY: -0.03, pose: { hips: [0, 0.35, 0], spine: [-0.08, 0.28, 0], chest: [-0.1, 0.35, 0], rUp: [-1.45, -0.35, -0.55], rFore: [-0.85, 0, 0], rHand: [-0.25, 0, 0], lUp: [-0.3, 0.4, 0.4] } },
    { t: 0.26, ease: 'lin', hipsY: -0.04, pose: { hips: [0, 0.38, 0], spine: [-0.1, 0.32, 0], chest: [-0.12, 0.40, 0], rUp: [-1.58, -0.4, -0.62], rFore: [-0.92, 0, 0], rHand: [-0.3, 0, 0], lUp: [-0.3, 0.45, 0.45] } },
    { t: 0.50, ease: 'snap', hipsY: -0.08, hipsZ: 0.12, pose: { hips: [0.08, -0.48, 0], spine: [0.18, -0.35, 0], chest: [0.22, -0.45, 0], rUp: [0.45, 0.55, -0.18], rFore: [-0.18, 0, 0], rHand: [0.95, 0, 0.25], lUp: [0.35, -0.3, 0.5] } },
    { t: 0.68, ease: 'out', hipsY: -0.07, hipsZ: 0.10, pose: { hips: [0.08, -0.52, 0], spine: [0.18, -0.38, 0], chest: [0.22, -0.48, 0], rUp: [0.52, 0.62, -0.15], rFore: [-0.12, 0, 0], rHand: [1.05, 0, 0.28], lUp: [0.4, -0.35, 0.55] } },
  ],
  light2: [
    // Backhand rising horizontal sweep (反手横扫)
    { t: 0.18, ease: 'out', hipsY: -0.05, pose: { hips: [0.05, -0.55, 0], chest: [0.12, -0.55, 0], rUp: [-0.45, 0.85, -0.15], rFore: [-0.55, 0, -0.3], rHand: [0.6, 0.4, 0] } },
    { t: 0.48, ease: 'snap', hipsY: -0.06, hipsZ: 0.10, pose: { hips: [0.02, 0.58, 0], spine: [0.08, 0.42, 0], chest: [0.1, 0.55, 0], rUp: [-0.55, -0.95, -0.78], rFore: [-0.15, 0, 0], rHand: [0.85, -0.5, -0.3], lUp: [-0.4, 0.5, 0.35] } },
    { t: 0.68, ease: 'out', hipsY: -0.05, pose: { hips: [0.02, 0.62, 0], spine: [0.08, 0.45, 0], chest: [0.1, 0.58, 0], rUp: [-0.50, -1.02, -0.82], rFore: [-0.12, 0, 0], rHand: [0.92, -0.5, -0.3] } },
  ],
  light3: [
    // Whirlwind advancing thrust-cleave (旋身破风斩)
    { t: 0.22, ease: 'in', hipsY: -0.09, pose: { hips: [0.1, 0.85, 0], chest: [0.15, 0.65, 0], rUp: [-1.35, -0.65, -0.65], rFore: [-0.7, 0, 0], lUp: [-0.75, 0.4, 0.3] } },
    { t: 0.52, ease: 'snap', hipsY: -0.12, hipsZ: 0.22, pose: { hips: [0.16, -0.68, 0], spine: [0.22, -0.45, 0], chest: [0.26, -0.55, 0], rUp: [-0.78, 0.15, -0.08], rFore: [-0.08, 0, 0], rHand: [1.28, 0, 0], lUp: [0.52, -0.4, 0.65], lThigh: [-0.45, 0, 0], lShin: [0.55, 0, 0], rThigh: [0.38, 0, 0] } },
    { t: 0.74, ease: 'out', hipsY: -0.10, hipsZ: 0.18, pose: { hips: [0.14, -0.72, 0], spine: [0.20, -0.48, 0], chest: [0.24, -0.58, 0], rUp: [-0.72, 0.18, -0.08], rFore: [-0.08, 0, 0], rHand: [1.32, 0, 0] } },
  ],
  heavy: [
    // Two-handed overhead mountain-splitting cleave (蓄势崩山重劈)
    { t: 0.28, ease: 'out', hipsY: -0.06, pose: { hips: [-0.08, 0.25, 0], spine: [-0.18, 0.15, 0], chest: [-0.22, 0.2, 0], rUp: [-2.25, -0.15, -0.25], rFore: [-0.65, 0, 0], rHand: [-0.35, 0, 0], lUp: [-2.15, 0.25, 0.22], lFore: [-0.7, 0, 0] } },
    { t: 0.40, ease: 'lin', hipsY: -0.04, pose: { hips: [-0.1, 0.28, 0], spine: [-0.22, 0.18, 0], chest: [-0.26, 0.22, 0], rUp: [-2.38, -0.15, -0.22], rFore: [-0.72, 0, 0], rHand: [-0.42, 0, 0], lUp: [-2.28, 0.25, 0.2] } },
    { t: 0.62, ease: 'snap', hipsY: -0.18, hipsZ: 0.24, pose: { hips: [0.22, -0.32, 0], spine: [0.28, -0.22, 0], chest: [0.34, -0.28, 0], rUp: [0.25, 0.15, -0.15], rFore: [-0.12, 0, 0], rHand: [1.22, 0, 0], lUp: [0.18, -0.2, 0.18], lFore: [-0.25, 0, 0], lThigh: [-0.52, 0, 0], lShin: [0.68, 0, 0], rThigh: [0.42, 0, 0] } },
    { t: 0.80, ease: 'out', hipsY: -0.15, hipsZ: 0.20, pose: { hips: [0.2, -0.32, 0], spine: [0.25, -0.22, 0], chest: [0.3, -0.28, 0], rUp: [0.3, 0.15, -0.15], rHand: [1.25, 0, 0] } },
  ],
  jumpSlash: [
    // Airborne Falling-Star Plunge Cleave (腾空坠星跳劈)
    { t: 0.28, ease: 'out', hipsY: 0.12, pose: { chest: [-0.25, 0.15, 0], rUp: [-2.35, -0.2, -0.35], rFore: [-0.55, 0, 0], lUp: [-1.8, 0.3, 0.4], lThigh: [-0.65, 0, 0], lShin: [1.1, 0, 0], rThigh: [-0.35, 0, 0], rShin: [0.85, 0, 0] } },
    { t: 0.58, ease: 'snap', hipsY: -0.20, pose: { hips: [0.26, -0.35, 0], spine: [0.32, -0.25, 0], chest: [0.35, -0.3, 0], rUp: [0.32, 0.2, -0.18], rFore: [-0.1, 0, 0], rHand: [1.3, 0, 0], lThigh: [-0.58, 0, 0], lShin: [0.75, 0, 0], rThigh: [0.35, 0, 0], rShin: [0.45, 0, 0] } },
    { t: 0.78, ease: 'out', hipsY: -0.16, pose: { hips: [0.22, -0.35, 0], chest: [0.28, -0.3, 0], rUp: [0.32, 0.2, -0.18], rHand: [1.28, 0, 0] } },
  ],
  dodge: [
    // Crisp low tuck-and-dash dodge roll / frost-step (踏步掠影翻滚)
    { t: 0.22, ease: 'out', hipsY: -0.34, hipsZ: 0.15, pose: { hips: [0.95, 0, 0], spine: [0.65, 0, 0], chest: [0.55, 0, 0], head: [0.35, 0, 0], rUp: [0.35, 0, -0.45], rFore: [-1.2, 0, 0], lUp: [0.35, 0, 0.45], lFore: [-1.2, 0, 0], lThigh: [-1.15, 0, 0], lShin: [1.45, 0, 0], rThigh: [-0.95, 0, 0], rShin: [1.35, 0, 0] } },
    { t: 0.55, ease: 'io', hipsY: -0.38, hipsZ: 0.22, pose: { hips: [1.45, 0, 0], spine: [0.75, 0, 0], chest: [0.65, 0, 0], rUp: [0.2, 0, -0.35], rFore: [-1.3, 0, 0], lThigh: [-1.2, 0, 0], lShin: [1.5, 0, 0], rThigh: [-1.1, 0, 0], rShin: [1.4, 0, 0] } },
    { t: 0.82, ease: 'out', hipsY: -0.14, pose: { hips: [0.32, -0.15, 0], spine: [0.2, 0, 0], lThigh: [-0.4, 0, 0], lShin: [0.55, 0, 0] } },
  ],
  guardCounter: [
    // Elden Ring Guard Counter: recoil off block into explosive upward-diagonal cleave!
    { t: 0.18, ease: 'out', hipsY: -0.1, pose: { hips: [0.08, -0.45, 0], chest: [0.1, -0.45, 0], rUp: [-0.35, 0.65, -0.25], rFore: [-1.1, 0, -0.45], rHand: [0.4, 0, -0.8] } },
    { t: 0.48, ease: 'snap', hipsY: -0.05, hipsZ: 0.2, pose: { hips: [-0.06, 0.62, 0], spine: [0.12, 0.45, 0], chest: [0.15, 0.58, 0], rUp: [-1.35, -0.85, -0.68], rFore: [-0.12, 0, 0], rHand: [0.95, -0.35, 0], lUp: [0.45, -0.3, 0.55] } },
    { t: 0.75, ease: 'out', hipsY: -0.06, pose: { hips: [-0.04, 0.65, 0], chest: [0.15, 0.6, 0], rUp: [-1.28, -0.9, -0.7], rHand: [1.0, -0.35, 0] } },
  ],
  parry: [
    // Crisp circular Sword-Qi deflection arc (剑气弹反)
    { t: 0.14, ease: 'out', pose: { chest: [0.05, -0.35, 0], rUp: [-0.65, 0.55, -0.2], rFore: [-0.95, 0, -0.5], rHand: [0.3, 0, -0.9] } },
    { t: 0.38, ease: 'snap', pose: { hips: [0, 0.42, 0], chest: [-0.08, 0.52, 0], rUp: [-0.95, -0.88, -0.75], rFore: [-0.22, 0, 0], rHand: [0.65, -0.4, 0.3], lUp: [-0.45, 0.45, 0.45] } },
    { t: 0.72, ease: 'out', pose: { hips: [0, 0.32, 0], chest: [-0.05, 0.38, 0], rUp: [-0.8, -0.75, -0.65] } },
  ],
  skill_rush: [
    // Ash of War #1:【狂龙迅影斩】Iai sheath crouch -> supersonic frost lunge!
    { t: 0.28, ease: 'out', hipsY: -0.22, pose: { hips: [0.18, -0.58, 0], spine: [0.22, -0.35, 0], chest: [0.24, -0.45, 0], rUp: [0.15, 0.68, -0.15], rFore: [-1.15, 0, -0.55], rHand: [0.55, 0.4, -0.6], lUp: [-0.45, -0.4, 0.2], lThigh: [-0.62, 0, 0], lShin: [0.85, 0, 0], rThigh: [0.35, 0, 0], rShin: [0.55, 0, 0] } },
    { t: 0.38, ease: 'lin', hipsY: -0.25, pose: { hips: [0.2, -0.62, 0], spine: [0.25, -0.38, 0], chest: [0.28, -0.48, 0], rUp: [0.18, 0.72, -0.15], rFore: [-1.2, 0, -0.55], rHand: [0.55, 0.4, -0.6], lThigh: [-0.68, 0, 0], lShin: [0.92, 0, 0] } },
    { t: 0.58, ease: 'snap', hipsY: -0.14, hipsZ: 0.35, pose: { hips: [0.15, 0.68, 0], spine: [0.18, 0.48, 0], chest: [0.2, 0.62, 0], rUp: [-0.72, -0.98, -0.82], rFore: [-0.08, 0, 0], rHand: [1.15, -0.4, 0], lUp: [0.55, 0.3, 0.65], lThigh: [-0.55, 0, 0], lShin: [0.65, 0, 0], rThigh: [0.52, 0, 0] } },
    { t: 0.82, ease: 'out', hipsY: -0.12, hipsZ: 0.28, pose: { hips: [0.12, 0.68, 0], chest: [0.18, 0.62, 0], rUp: [-0.68, -1.0, -0.82], rHand: [1.18, -0.4, 0] } },
  ],
  skill_bow: [
    // Ash of War #2:【恸天贯日式】Draw Houyi Sun-Shooting Bow & loose solar arrow!
    { t: 0.25, ease: 'out', hipsY: -0.06, pose: { hips: [0, -1.15, 0], spine: [0, 0.35, 0], chest: [0, 0.65, 0], head: [0, 0.15, 0], lUp: [-1.48, -0.15, 0.08], lFore: [-0.08, 0, 0], rUp: [-1.45, 0.35, -0.65], rFore: [-1.75, 0, 0] } },
    { t: 0.58, ease: 'lin', hipsY: -0.08, pose: { hips: [0, -1.2, 0], spine: [0, 0.38, 0], chest: [0, 0.68, 0], head: [0, 0.18, 0], lUp: [-1.52, -0.12, 0.06], lFore: [-0.05, 0, 0], rUp: [-1.48, 0.42, -0.78], rFore: [-1.92, 0, 0] } },
    { t: 0.72, ease: 'snap', hipsY: -0.05, pose: { hips: [0, -1.15, 0], chest: [-0.08, 0.62, 0], lUp: [-1.55, -0.12, 0.1], rUp: [-1.35, 0.65, -0.95], rFore: [-0.45, 0, 0] } },
  ],
  drink: [
    // Drink Crimson/Cerulean Flask (仰头饮用鼠儿果露)
    { t: 0.30, ease: 'out', pose: { head: [-0.38, 0, 0], chest: [-0.12, 0, 0], lUp: [-1.35, -0.38, 0.15], lFore: [-1.65, 0, -0.35], rUp: [-0.15, 0, -0.28] } },
    { t: 0.72, ease: 'lin', pose: { head: [-0.44, 0, 0], chest: [-0.15, 0, 0], lUp: [-1.42, -0.42, 0.15], lFore: [-1.72, 0, -0.35], rUp: [-0.15, 0, -0.28] } },
  ],
  hurt: [
    { t: 0.22, ease: 'snap', hipsZ: -0.12, pose: { hips: [-0.12, 0.18, 0], spine: [-0.22, 0.1, 0.08], chest: [-0.26, 0.15, 0], head: [-0.32, 0.15, 0], rUp: [-0.1, 0.2, -0.55], lUp: [-0.1, -0.2, 0.55] } },
    { t: 0.65, ease: 'out', hipsZ: -0.08, pose: { spine: [-0.12, 0.05, 0], chest: [-0.14, 0.08, 0] } },
  ],
  staggerKneel: [
    // Poise broken! Drop onto one knee, head bowed, vulnerable to【御剑贯心】Riposte!
    { t: 0.18, ease: 'snap', hipsY: -0.44, pose: { hips: [0.22, 0, 0], spine: [0.28, 0, 0], chest: [0.32, 0, 0], head: [0.42, 0, 0], lThigh: [-1.25, 0, 0], lShin: [1.55, 0, 0], rThigh: [0.15, 0, 0], rShin: [1.65, 0, 0], rUp: [0.25, 0, -0.32], rFore: [-0.45, 0, 0], lUp: [0.35, 0, 0.28] } },
    { t: 0.88, ease: 'lin', hipsY: -0.44, pose: { hips: [0.24, 0, 0], spine: [0.30, 0, 0], chest: [0.34, 0, 0], head: [0.45, 0, 0], lThigh: [-1.25, 0, 0], lShin: [1.55, 0, 0], rThigh: [0.15, 0, 0], rShin: [1.65, 0, 0], rUp: [0.25, 0, -0.32], rFore: [-0.45, 0, 0], lUp: [0.35, 0, 0.28] } },
  ],
  riposte: [
    // Critical Execution【御剑贯心】: reverse-grip windup -> heart-piercing thrust -> yank blade out!
    { t: 0.26, ease: 'out', hipsY: -0.10, pose: { hips: [0.05, 0.55, 0], chest: [-0.08, 0.55, 0], rUp: [-0.85, -0.55, -0.45], rFore: [-1.05, 0, 0], rHand: [1.1, 0, 0], lUp: [-0.65, 0.45, 0.35] } },
    { t: 0.48, ease: 'snap', hipsY: -0.16, hipsZ: 0.32, pose: { hips: [0.18, -0.58, 0], spine: [0.22, -0.38, 0], chest: [0.25, -0.45, 0], rUp: [-1.35, 0.08, -0.05], rFore: [-0.05, 0, 0], rHand: [1.48, 0, 0], lUp: [0.55, -0.35, 0.55], lThigh: [-0.65, 0, 0], lShin: [0.78, 0, 0], rThigh: [0.48, 0, 0] } },
    { t: 0.74, ease: 'lin', hipsY: -0.15, hipsZ: 0.30, pose: { hips: [0.18, -0.58, 0], chest: [0.25, -0.45, 0], rUp: [-1.35, 0.08, -0.05], rHand: [1.48, 0, 0] } },
    { t: 0.90, ease: 'snap', hipsY: -0.05, pose: { hips: [-0.05, 0.45, 0], chest: [-0.1, 0.45, 0], rUp: [-0.95, -0.85, -0.75], rHand: [0.65, 0, 0] } },
  ],
  death: [
    { t: 0.35, ease: 'out', hipsY: -0.45, hipsZ: -0.18, pose: { hips: [-0.35, 0.2, 0.1], spine: [-0.25, 0, 0], lThigh: [-0.8, 0, 0], lShin: [1.4, 0, 0], rThigh: [-0.4, 0, 0], rShin: [1.2, 0, 0], rUp: [0.4, 0, -0.6], lUp: [0.4, 0, 0.6] } },
    { t: 0.85, ease: 'out', hipsY: -0.82, hipsZ: -0.45, pose: { hips: [-1.38, 0.15, 0.12], spine: [-0.18, 0, 0], head: [-0.25, 0.3, 0], rUp: [0.15, 0, -0.95], lUp: [0.15, 0, 0.95], lThigh: [0.1, 0, 0.1], lShin: [0.25, 0, 0], rThigh: [0.15, 0, -0.1], rShin: [0.35, 0, 0] } },
    { t: 1.0, ease: 'lin', hipsY: -0.82, hipsZ: -0.45, pose: { hips: [-1.38, 0.15, 0.12], spine: [-0.18, 0, 0], head: [-0.25, 0.3, 0], rUp: [0.15, 0, -0.95], lUp: [0.15, 0, 0.95], lThigh: [0.1, 0, 0.1], lShin: [0.25, 0, 0], rThigh: [0.15, 0, -0.1], rShin: [0.35, 0, 0] } },
  ],
  // Xuanxiao Boss Clips (with signature Elden Ring delayed windups!)
  xx_combo1: [
    { t: 0.24, ease: 'out', pose: { hips: [0, 0.45, 0], chest: [-0.08, 0.48, 0], rUp: [-1.45, -0.45, -0.6], rFore: [-0.75, 0, 0] } },
    { t: 0.54, ease: 'snap', hipsZ: 0.18, pose: { hips: [0.1, -0.58, 0], chest: [0.18, -0.55, 0], rUp: [0.42, 0.62, -0.15], rFore: [-0.12, 0, 0], rHand: [1.1, 0, 0.2] } },
    { t: 0.78, ease: 'out', pose: { hips: [0.08, -0.6, 0], chest: [0.18, -0.58, 0], rUp: [0.45, 0.65, -0.15], rHand: [1.15, 0, 0.2] } },
  ],
  xx_combo2: [
    { t: 0.22, ease: 'out', pose: { hips: [0.05, -0.6, 0], chest: [0.12, -0.58, 0], rUp: [-0.5, 0.85, -0.15], rFore: [-0.6, 0, -0.3] } },
    { t: 0.52, ease: 'snap', hipsZ: 0.16, pose: { hips: [0.02, 0.65, 0], chest: [0.12, 0.62, 0], rUp: [-0.62, -1.02, -0.82], rFore: [-0.12, 0, 0], rHand: [0.95, -0.45, -0.25] } },
    { t: 0.78, ease: 'out', pose: { hips: [0.02, 0.68, 0], chest: [0.12, 0.65, 0], rUp: [-0.58, -1.05, -0.82] } },
  ],
  xx_delaySlam: [
    // Classic Elden Ring Delayed Attack! Hoists blazing Xihe Sword high, holds 0.0 -> 0.58, then slams!
    { t: 0.25, ease: 'out', hipsY: 0.04, pose: { hips: [-0.1, 0.22, 0], spine: [-0.2, 0.15, 0], chest: [-0.26, 0.2, 0], rUp: [-2.42, -0.15, -0.28], rFore: [-0.52, 0, 0], rHand: [-0.45, 0, 0], lUp: [-1.45, 0.35, 0.45] } },
    { t: 0.56, ease: 'lin', hipsY: 0.06, pose: { hips: [-0.12, 0.26, 0], spine: [-0.25, 0.18, 0], chest: [-0.30, 0.22, 0], rUp: [-2.52, -0.15, -0.25], rFore: [-0.55, 0, 0], rHand: [-0.5, 0, 0], lUp: [-1.55, 0.4, 0.5] } },
    { t: 0.74, ease: 'snap', hipsY: -0.22, hipsZ: 0.28, pose: { hips: [0.28, -0.38, 0], spine: [0.34, -0.25, 0], chest: [0.38, -0.32, 0], rUp: [0.35, 0.18, -0.12], rFore: [-0.08, 0, 0], rHand: [1.35, 0, 0], lThigh: [-0.58, 0, 0], lShin: [0.75, 0, 0], rThigh: [0.45, 0, 0] } },
    { t: 0.90, ease: 'out', hipsY: -0.18, hipsZ: 0.24, pose: { hips: [0.25, -0.38, 0], chest: [0.32, -0.32, 0], rUp: [0.35, 0.18, -0.12], rHand: [1.35, 0, 0] } },
  ],
  xx_thrust: [
    // Heal-punish instant Yang-Flame lunge thrust!
    { t: 0.24, ease: 'out', hipsY: -0.12, pose: { hips: [0.1, 0.65, 0], chest: [0.12, 0.58, 0], rUp: [-0.45, -0.65, -0.35], rFore: [-1.05, 0, 0], rHand: [1.15, 0, 0], lUp: [-1.1, 0.2, 0.25] } },
    { t: 0.48, ease: 'snap', hipsY: -0.16, hipsZ: 0.36, pose: { hips: [0.18, -0.68, 0], spine: [0.22, -0.45, 0], chest: [0.24, -0.52, 0], rUp: [-1.42, 0.06, -0.04], rFore: [-0.04, 0, 0], rHand: [1.52, 0, 0], lUp: [0.65, -0.35, 0.65], lThigh: [-0.62, 0, 0], lShin: [0.78, 0, 0], rThigh: [0.55, 0, 0] } },
    { t: 0.78, ease: 'out', hipsY: -0.14, hipsZ: 0.30, pose: { hips: [0.16, -0.68, 0], chest: [0.22, -0.52, 0], rUp: [-1.38, 0.06, -0.04], rHand: [1.5, 0, 0] } },
  ],
  xx_palm: [
    // Frost-Pulse Palm AoE pushback
    { t: 0.34, ease: 'out', pose: { hips: [0, -0.55, 0], chest: [-0.1, -0.55, 0], lUp: [-0.85, -0.65, 0.35], lFore: [-1.15, 0, 0], rUp: [-0.35, 0.3, -0.55] } },
    { t: 0.56, ease: 'snap', hipsZ: 0.14, pose: { hips: [0.12, 0.58, 0], chest: [0.18, 0.62, 0], lUp: [-1.48, 0.05, 0.05], lFore: [-0.05, 0, 0], rUp: [0.35, 0.2, -0.65] } },
    { t: 0.82, ease: 'out', pose: { hips: [0.1, 0.55, 0], chest: [0.15, 0.58, 0], lUp: [-1.45, 0.05, 0.05] } },
  ],
  xx_swordRain: [
    // Summon 5 Floating Spirit Swords overhead
    { t: 0.32, ease: 'out', hipsY: 0.25, pose: { chest: [-0.18, 0, 0], head: [-0.22, 0, 0], rUp: [-2.45, 0, -0.45], rFore: [-0.25, 0, 0], lUp: [-2.15, 0, 0.55], lFore: [-0.35, 0, 0] } },
    { t: 0.72, ease: 'snap', hipsY: 0.12, pose: { chest: [0.18, -0.35, 0], rUp: [-1.35, 0.2, -0.15], rFore: [-0.1, 0, 0], rHand: [1.35, 0, 0], lUp: [-0.45, -0.2, 0.55] } },
  ],
  xx_roar: [
    // Phase 2 Cutscene:「苍天弃吾，吾宁成魔！！」
    { t: 0.28, ease: 'out', hipsY: -0.14, pose: { spine: [0.32, 0, 0], chest: [0.38, 0, 0], head: [0.45, 0, 0], rUp: [-0.85, 0.45, -0.25], rFore: [-1.25, 0, 0], lUp: [-0.85, -0.45, 0.25], lFore: [-1.25, 0, 0] } },
    { t: 0.52, ease: 'snap', hipsY: 0.18, pose: { spine: [-0.32, 0, 0], chest: [-0.42, 0, 0], head: [-0.52, 0, 0], rUp: [-1.85, 0, -0.95], rFore: [-0.25, 0, 0], lUp: [-1.85, 0, 0.95], lFore: [-0.25, 0, 0] } },
    { t: 0.88, ease: 'lin', hipsY: 0.22, pose: { spine: [-0.34, 0, 0], chest: [-0.45, 0, 0], head: [-0.55, 0, 0], rUp: [-1.92, 0, -1.02], rFore: [-0.22, 0, 0], lUp: [-1.92, 0, 1.02], lFore: [-0.22, 0, 0] } },
  ],
  xx_dance: [
    // Phase 2 Blood-Flame Sword Dance (燃血连斩)
    { t: 0.20, ease: 'snap', hipsZ: 0.2, pose: { hips: [0.1, -0.65, 0], chest: [0.18, -0.62, 0], rUp: [-0.55, 0.82, -0.2], rHand: [1.05, 0, 0.3] } },
    { t: 0.48, ease: 'snap', hipsZ: 0.22, pose: { hips: [0.06, 0.72, 0], chest: [0.15, 0.68, 0], rUp: [-0.68, -1.05, -0.85], rHand: [1.05, -0.45, -0.25] } },
    { t: 0.78, ease: 'snap', hipsY: -0.15, hipsZ: 0.26, pose: { hips: [0.22, -0.52, 0], chest: [0.28, -0.48, 0], rUp: [0.32, 0.25, -0.15], rHand: [1.35, 0, 0] } },
  ],
  xx_meteor: [
    // Phase 2 Ultimate【羲和焚天】: Hover coil -> Meteor Slam!
    { t: 0.45, ease: 'out', hipsY: 0.35, pose: { spine: [-0.28, 0, 0], chest: [-0.35, 0, 0], rUp: [-2.55, -0.15, -0.35], rFore: [-0.45, 0, 0], lUp: [-2.35, 0.15, 0.35], lThigh: [-0.55, 0, 0], lShin: [0.95, 0, 0] } },
    { t: 0.70, ease: 'snap', hipsY: -0.28, pose: { hips: [0.35, -0.3, 0], spine: [0.38, -0.2, 0], chest: [0.42, -0.25, 0], rUp: [0.42, 0.15, -0.12], rHand: [1.42, 0, 0], lThigh: [-0.75, 0, 0], lShin: [0.95, 0, 0], rThigh: [0.45, 0, 0] } },
    { t: 0.90, ease: 'out', hipsY: -0.24, pose: { hips: [0.32, -0.3, 0], chest: [0.36, -0.25, 0], rUp: [0.42, 0.15, -0.12], rHand: [1.42, 0, 0] } },
  ],
};

function applyEase(mode: KeyframeDef['ease'], u: number): number {
  const x = THREE.MathUtils.clamp(u, 0, 1);
  switch (mode) {
    case 'in':
      return x * x;
    case 'out':
      return 1 - (1 - x) * (1 - x);
    case 'snap':
      return 1 - Math.pow(1 - x, 4); // Quartic fast snap for heavy weapon release!
    case 'lin':
      return x;
    default:
      return x * x * (3 - 2 * x);
  }
}

export class XianxiaCharacterRig {
  public archetype: ArchetypeId;
  public root: THREE.Group;
  public skeleton: THREE.Skeleton;
  public bones: Record<BoneName, THREE.Bone>;
  public restPositions: Record<BoneName, THREE.Vector3>;

  public weapon: WeaponRig | null = null;
  public offhandWeapon: WeaponRig | null = null;
  public houyiBow: { group: THREE.Group; arrowMesh: THREE.Group } | null = null;
  public demonSwordWings: THREE.Group | null = null;
  public spiritOrbitSwords: THREE.Group | null = null;

  public activeClip: ActionClipName = 'none';
  public clipProgress = 0; // 0..1
  public isBlocking = false;
  public isChargingHeavy = false;
  public demonWingOpen = 0;

  private stridePhase = Math.random() * Math.PI * 2;
  private idleClock = Math.random() * 10;
  private moveBlend = 0;
  private prevWorldPos = new THREE.Vector3();
  private ribbonVel = new THREE.Vector2();
  private capePitch = 0;
  private flashTimer = 0;
  private flashMaterials: THREE.MeshStandardMaterial[] = [];

  constructor(archetype: ArchetypeId) {
    this.archetype = archetype;
    this.root = new THREE.Group();

    const { bones, skeleton, restPositions } = this.createSkeleton();
    this.bones = bones;
    this.skeleton = skeleton;
    this.restPositions = restPositions;

    // Attach bone hierarchy to character root
    this.root.add(this.bones.root);

    this.buildCharacterVisuals();
  }

  private createSkeleton() {
    const defs: [BoneName, BoneName | null, number, number, number][] = [
      ['root', null, 0, 0, 0],
      ['hips', 'root', 0, 0.95, 0],
      ['spine', 'hips', 0, 0.16, 0],
      ['chest', 'spine', 0, 0.19, 0],
      ['neck', 'chest', 0, 0.21, 0],
      ['head', 'neck', 0, 0.09, 0.01],
      ['ribbonA', 'head', 0, 0.08, -0.09],
      ['ribbonB', 'ribbonA', 0, -0.22, -0.05],
      ['lUp', 'chest', 0.195, 0.15, 0],
      ['lFore', 'lUp', 0.015, -0.28, 0],
      ['lHand', 'lFore', 0.01, -0.25, 0],
      ['rUp', 'chest', -0.195, 0.15, 0],
      ['rFore', 'rUp', -0.015, -0.28, 0],
      ['rHand', 'rFore', -0.01, -0.25, 0],
      ['lThigh', 'hips', 0.105, -0.04, 0],
      ['lShin', 'lThigh', 0, -0.44, 0],
      ['lFoot', 'lShin', 0, -0.44, 0.04],
      ['rThigh', 'hips', -0.105, -0.04, 0],
      ['rShin', 'rThigh', 0, -0.44, 0],
      ['rHand' as BoneName, 'rFore', -0.01, -0.25, 0], // placeholder overwritten cleanly below
      ['rFoot', 'rShin', 0, -0.44, 0.04],
      ['capeA', 'chest', 0, 0.14, -0.11],
      ['capeB', 'capeA', 0, -0.42, -0.04],
      ['capeC', 'capeB', 0, -0.44, -0.04],
    ];

    const bones = {} as Record<BoneName, THREE.Bone>;
    const restPositions = {} as Record<BoneName, THREE.Vector3>;

    for (const bName of BONE_ORDER) {
      const b = new THREE.Bone();
      b.name = bName;
      bones[bName] = b;
    }

    for (const [name, parent, x, y, z] of defs) {
      if (parent && bones[name].parent) continue; // skip duplicate
      bones[name].position.set(x, y, z);
      restPositions[name] = new THREE.Vector3(x, y, z);
      if (parent) {
        bones[parent].add(bones[name]);
      }
    }

    bones.root.updateMatrixWorld(true);
    const orderedBones = BONE_ORDER.map((n) => bones[n]);
    const skeleton = new THREE.Skeleton(orderedBones);

    return { bones, skeleton, restPositions };
  }

  private addSkinnedPart(geo: THREE.BufferGeometry, mat: THREE.MeshStandardMaterial) {
    const mesh = new THREE.SkinnedMesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.bind(this.skeleton);
    this.root.add(mesh);
    this.flashMaterials.push(mat);
    return mesh;
  }

  private buildCharacterVisuals() {
    const arch = this.archetype;
    const isSpirit = arch === 'lingsha' || arch === 'mengli';

    // Palette per Sword and Fairy 4 character!
    const palettes: Record<
      ArchetypeId,
      {
        tunic: number;
        trim: number;
        vestOrOuter: number;
        skirt: number;
        trousers: number;
        boots: number;
        cape: number;
        hair: number;
        skin: number;
        scale: number;
        robeLength: number;
        wideSleeve: number;
      }
    > = {
      tianhe: {
        tunic: 0x2b6e96,       // Qingluan Mountain azure tunic
        trim: 0xe6dec8,        // Off-white collar & cuffs
        vestOrOuter: 0x5c3d28, // Iconic mountain-boar fur vest (兽皮坎肩)
        skirt: 0x235575,
        trousers: 0x243447,
        boots: 0x3b2a1e,
        cape: 0xc92a2a,        // Crimson headband!
        hair: 0x17181c,
        skin: 0xe4bca0,
        scale: 1.0,
        robeLength: 0.68,      // Agile short martial tunic hem
        wideSleeve: 0.068,
      },
      xuanxiao: {
        tunic: 0xdce6f0,       // Snow-white Qionghua Grandmaster inner robe
        trim: 0xd9a84e,        // Imperial gold trim
        vestOrOuter: 0x9e1b1b, // Crimson-vermilion Sect Master surcoat (红白金纹掌门仙袍)
        skirt: 0xcfdbe6,
        trousers: 0x1f2833,
        boots: 0x262e38,
        cape: 0x8f1515,        // Flowing crimson-gold immortal cloak
        hair: 0x15151a,
        skin: 0xe8cab4,
        scale: 1.13,           // Commanding 2.02m Boss presence!
        robeLength: 0.22,      // Full-length flowing immortal robe
        wideSleeve: 0.115,     // Regal wide Xianxia sleeves
      },
      disciple: {
        tunic: 0xd8e8f2,       // Qionghua white-cyan uniform
        trim: 0x3c8cb8,
        vestOrOuter: 0x2f6d94,
        skirt: 0xcadce8,
        trousers: 0x2a3e52,
        boots: 0x233242,
        cape: 0x32759e,
        hair: 0x1b1e24,
        skin: 0xdfb89c,
        scale: 0.98,
        robeLength: 0.36,
        wideSleeve: 0.085,
      },
      cultivator: {
        tunic: 0x24486b,
        trim: 0x6fd0ff,
        vestOrOuter: 0xcbe0ee,
        skirt: 0x1f3d5c,
        trousers: 0x1a2d42,
        boots: 0x1d2b3a,
        cape: 0x2b6b99,
        hair: 0x1b1e24,
        skin: 0xdfb89c,
        scale: 0.99,
        robeLength: 0.28,
        wideSleeve: 0.105,
      },
      golem: {
        tunic: 0x3a4f5e,       // Ancient bronze-jade construct
        trim: 0xc79d52,
        vestOrOuter: 0x526b7c,
        skirt: 0x324554,
        trousers: 0x273642,
        boots: 0x2d3e4c,
        cape: 0x1e384a,
        hair: 0x455c6c,
        skin: 0x4a6272,
        scale: 1.72,           // Towering 3.1m Courtyard Elite!
        robeLength: 0.48,
        wideSleeve: 0.125,
      },
      lingsha: {
        tunic: 0xb82832,       // Han Lingsha vibrant crimson Jianghu attire
        trim: 0xf0d290,
        vestOrOuter: 0x24222c,
        skirt: 0x9c1f28,
        trousers: 0x1f1d26,
        boots: 0x2e2024,
        cape: 0xd63640,
        hair: 0x1a1618,
        skin: 0xeac5ad,
        scale: 0.92,
        robeLength: 0.66,
        wideSleeve: 0.058,
      },
      mengli: {
        tunic: 0xc6b4eb,       // Liu Mengli lavender-moonlight dress
        trim: 0x94e8ff,
        vestOrOuter: 0x6f52a8,
        skirt: 0xd8ccf5,
        trousers: 0x4a3875,
        boots: 0x564285,
        cape: 0x9e84db,
        hair: 0x241936,
        skin: 0xf0d4c2,
        scale: 0.95,
        robeLength: 0.18,
        wideSleeve: 0.12,
      },
    };

    const P = palettes[arch];
    this.root.scale.setScalar(P.scale);

    const mkMat = (hex: number, rough = 0.58, metal = 0.12, emissiveHex = 0x000000, emInt = 0) => {
      return new THREE.MeshStandardMaterial({
        color: hex,
        roughness: rough,
        metalness: metal,
        emissive: isSpirit ? new THREE.Color(hex) : new THREE.Color(emissiveHex),
        emissiveIntensity: isSpirit ? 0.55 : emInt,
        transparent: isSpirit,
        opacity: isSpirit ? 0.78 : 1.0,
        side: THREE.DoubleSide,
      });
    };

    const tunicMat = mkMat(P.tunic, 0.62, 0.08);
    const outerMat = mkMat(P.vestOrOuter, arch === 'golem' ? 0.38 : 0.65, arch === 'golem' ? 0.68 : 0.15);
    const trimMat = mkMat(P.trim, 0.35, 0.55);
    const skirtMat = mkMat(P.skirt, 0.62, 0.1);
    const legMat = mkMat(P.trousers, 0.7, 0.08);
    const bootMat = mkMat(P.boots, 0.5, 0.22);
    const skinMat = mkMat(P.skin, 0.55, 0.04);
    const hairMat = mkMat(P.hair, 0.48, 0.12);
    const capeMat = mkMat(P.cape, 0.58, 0.12);

    // 1. Continuous Skinned Torso & Waist Sash (Hips -> Spine -> Chest -> Neck)
    const bHips = BONE_INDEX.hips;
    const bSpine = BONE_INDEX.spine;
    const bChest = BONE_INDEX.chest;
    const bNeck = BONE_INDEX.neck;

    const torsoGeo = buildSkinnedLoftGeometry([
      { y: 0.90, rx: 0.155, rz: 0.11, boneA: bHips, boneB: bSpine, weightB: 0.0 },
      { y: 1.02, rx: 0.142, rz: 0.102, boneA: bHips, boneB: bSpine, weightB: 0.55 },
      { y: 1.14, rx: 0.156, rz: 0.112, boneA: bSpine, boneB: bChest, weightB: 0.35 },
      { y: 1.30, rx: 0.192, rz: 0.126, boneA: bSpine, boneB: bChest, weightB: 0.85 },
      { y: 1.44, rx: 0.205, rz: 0.118, boneA: bChest, boneB: bNeck, weightB: 0.15 },
      { y: 1.51, rx: 0.095, rz: 0.082, boneA: bChest, boneB: bNeck, weightB: 0.75 },
    ]);
    this.addSkinnedPart(torsoGeo, tunicMat);

    // Outer Surcoat / Yun Tianhe's Fur Vest / Xuanxiao's Crimson-Gold Vestments
    const vestGeo = buildSkinnedLoftGeometry(
      [
        { y: 0.99, rx: 0.158, rz: 0.116, boneA: bHips, boneB: bSpine, weightB: 0.4 },
        { y: 1.16, rx: 0.172, rz: 0.124, boneA: bSpine, boneB: bChest, weightB: 0.45 },
        { y: 1.36, rx: 0.214, rz: 0.136, boneA: bChest, boneB: bChest, weightB: 0 },
        { y: 1.46, rx: 0.218, rz: 0.128, boneA: bChest, boneB: bNeck, weightB: 0.2 },
      ],
      14,
      false
    );
    this.addSkinnedPart(vestGeo, outerMat);

    // Golden/Jade Belt Sash + Lower Xianxia Robe Skirt (下摆) weighted smoothly to Hips + Thighs
    const sashGeo = buildSkinnedLoftGeometry(
      [
        { y: 0.95, rx: 0.164, rz: 0.122, boneA: bHips, boneB: bSpine, weightB: 0.2 },
        { y: 1.03, rx: 0.162, rz: 0.120, boneA: bHips, boneB: bSpine, weightB: 0.4 },
      ],
      14,
      false
    );
    this.addSkinnedPart(sashGeo, trimMat);

    const skirtGeo = buildSkinnedLoftGeometry(
      [
        { y: 0.96, rx: 0.160, rz: 0.118, boneA: bHips, boneB: bHips, weightB: 0 },
        { y: THREE.MathUtils.lerp(0.96, P.robeLength, 0.5), rx: 0.215, rz: 0.158, boneA: bHips, boneB: BONE_INDEX.lThigh, weightB: 0.22 },
        { y: P.robeLength, rx: 0.265, rz: 0.195, boneA: bHips, boneB: BONE_INDEX.rThigh, weightB: 0.32 },
      ],
      16,
      false
    );
    this.addSkinnedPart(skirtGeo, skirtMat);

    // 2. Skinned Arms, Sleeves & Hands (Left = +X, Right = -X)
    for (const side of [1, -1] as const) {
      const bUp = side > 0 ? BONE_INDEX.lUp : BONE_INDEX.rUp;
      const bFore = side > 0 ? BONE_INDEX.lFore : BONE_INDEX.rFore;
      const bHand = side > 0 ? BONE_INDEX.lHand : BONE_INDEX.rHand;
      const sx = side * 0.205;

      // Upper & Forearm Sleeve
      const armGeo = buildSkinnedLoftGeometry([
        { y: 1.47, rx: 0.068, rz: 0.068, cx: sx * 0.95, boneA: bChest, boneB: bUp, weightB: 0.75 },
        { y: 1.32, rx: 0.064, rz: 0.064, cx: sx, boneA: bUp, boneB: bUp, weightB: 0 },
        { y: 1.18, rx: P.wideSleeve, rz: P.wideSleeve * 1.12, cx: sx * 1.04, boneA: bUp, boneB: bFore, weightB: 0.55 },
        { y: 1.00, rx: 0.052, rz: 0.052, cx: sx * 1.06, boneA: bFore, boneB: bFore, weightB: 0 },
        { y: 0.89, rx: 0.044, rz: 0.044, cx: sx * 1.08, boneA: bFore, boneB: bHand, weightB: 0.35 },
      ]);
      this.addSkinnedPart(armGeo, tunicMat);

      // Bracer (护腕) & Hand
      const bracerGeo = buildSkinnedLoftGeometry(
        [
          { y: 1.02, rx: 0.055, rz: 0.055, cx: sx * 1.06, boneA: bFore, boneB: bFore, weightB: 0 },
          { y: 0.90, rx: 0.047, rz: 0.047, cx: sx * 1.08, boneA: bFore, boneB: bHand, weightB: 0.25 },
        ],
        10,
        false
      );
      this.addSkinnedPart(bracerGeo, trimMat);

      const handGeo = buildSkinnedLoftGeometry([
        { y: 0.90, rx: 0.038, rz: 0.034, cx: sx * 1.08, boneA: bHand, boneB: bHand, weightB: 0 },
        { y: 0.81, rx: 0.034, rz: 0.028, cx: sx * 1.08, boneA: bHand, boneB: bHand, weightB: 0 },
      ]);
      this.addSkinnedPart(handGeo, skinMat);
    }

    // 3. Skinned Legs & Martial Boots (Feet cleanly touching Y = 0.0!)
    for (const side of [1, -1] as const) {
      const bThigh = side > 0 ? BONE_INDEX.lThigh : BONE_INDEX.rThigh;
      const bShin = side > 0 ? BONE_INDEX.lShin : BONE_INDEX.rShin;
      const bFoot = side > 0 ? BONE_INDEX.lFoot : BONE_INDEX.rFoot;
      const lx = side * 0.105;

      const legGeo = buildSkinnedLoftGeometry([
        { y: 0.93, rx: 0.082, rz: 0.086, cx: lx, boneA: bHips, boneB: bThigh, weightB: 0.8 },
        { y: 0.68, rx: 0.072, rz: 0.074, cx: lx, boneA: bThigh, boneB: bThigh, weightB: 0 },
        { y: 0.47, rx: 0.058, rz: 0.060, cx: lx, boneA: bThigh, boneB: bShin, weightB: 0.5 },
        { y: 0.34, rx: 0.056, rz: 0.058, cx: lx, boneA: bShin, boneB: bShin, weightB: 0 },
      ]);
      this.addSkinnedPart(legGeo, legMat);

      const bootGeo = buildSkinnedLoftGeometry([
        { y: 0.36, rx: 0.062, rz: 0.064, cx: lx, boneA: bShin, boneB: bShin, weightB: 0 },
        { y: 0.12, rx: 0.048, rz: 0.054, cx: lx, boneA: bShin, boneB: bFoot, weightB: 0.5 },
        { y: 0.01, rx: 0.052, rz: 0.095, cx: lx, cz: 0.035, boneA: bFoot, boneB: bFoot, weightB: 0 },
      ]);
      this.addSkinnedPart(bootGeo, bootMat);
    }

    // 4. Sculpted Head, Hair, Crown / Fur Collar / Flowing Ribbon & Cloak
    const headNode = this.bones.head;

    // Neck + Sculpted Head attached directly to head/neck bones
    const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.062, 0.12, 10), skinMat);
    neckMesh.position.set(0, -0.04, 0);
    headNode.add(neckMesh);

    const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.108, 16, 14), skinMat);
    cranium.scale.set(0.92, 1.08, 0.98);
    cranium.position.set(0, 0.075, 0.01);
    cranium.castShadow = true;
    headNode.add(cranium);

    // Subtle dark brows & eyes facing +Z
    const browMat = new THREE.MeshBasicMaterial({
      color: arch === 'golem' ? new THREE.Color(0.5, 1.8, 2.2) : new THREE.Color(0x18181f),
    });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.009, 0.012), browMat);
      eye.position.set(side * 0.036, 0.082, 0.104);
      eye.rotation.z = -side * 0.12;
      headNode.add(eye);
    }

    // Hair Cap + Layered Xianxia Forehead Locks & Sideburns (告别圆球头套感)
    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 14), hairMat);
    hairCap.scale.set(0.98, 1.08, 1.06);
    hairCap.position.set(0, 0.096, -0.016);
    headNode.add(hairCap);

    for (const side of [-1, 1]) {
      const sideLock = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.16, 5), hairMat);
      sideLock.position.set(side * 0.086, 0.045, 0.048);
      sideLock.rotation.set(0.18, 0, side * 0.16);
      sideLock.rotation.x += Math.PI;
      headNode.add(sideLock);
    }

    // Crossed Xianxia Lapel Collar (古风交领衣襟) on Chest
    for (const side of [-1, 1]) {
      const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.24, 0.024), trimMat);
      lapel.position.set(side * 0.045, 0.09, 0.125);
      lapel.rotation.z = side * 0.36;
      this.bones.chest.add(lapel);
    }

    if (arch === 'tianhe') {
      // Yun Tianhe's Spiky Bangs + Red Headband Ring + High Ponytail + Fur Vest Collar + Houyi Bow!
      for (let b = -1; b <= 1; b++) {
        const bang = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.095, 4), hairMat);
        bang.position.set(b * 0.035, 0.125, 0.098);
        bang.rotation.set(Math.PI - 0.35, 0, -b * 0.22);
        headNode.add(bang);
      }

      const bandRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.108, 0.016, 8, 20),
        mkMat(0xd62828, 0.45, 0.1)
      );
      bandRing.rotation.x = Math.PI / 2 - 0.12;
      bandRing.position.set(0, 0.128, -0.006);
      headNode.add(bandRing);

      // Spiky ponytail tuft
      const ponytail = new THREE.Mesh(new THREE.ConeGeometry(0.062, 0.26, 7), hairMat);
      ponytail.position.set(0, 0.16, -0.14);
      ponytail.rotation.x = -1.05;
      headNode.add(ponytail);

      // Flowing Crimson Headband Tails on ribbonA / ribbonB bones!
      const tailMat = mkMat(0xd92626, 0.45, 0.1);
      const rTail1 = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.24, 0.012), tailMat);
      rTail1.position.set(0, -0.11, -0.02);
      this.bones.ribbonA.add(rTail1);
      const rTail2 = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.26, 0.012), tailMat);
      rTail2.position.set(0, -0.12, -0.02);
      this.bones.ribbonB.add(rTail2);

      // Pale Mountain-Fur Shoulder Trim & Diagonal Chest Baldric Strap
      for (const side of [-1, 1]) {
        const furPad = new THREE.Mesh(new THREE.SphereGeometry(0.068, 10, 8), mkMat(0xe2dad0, 0.88, 0.02));
        furPad.scale.set(1.25, 0.65, 1.15);
        furPad.position.set(side * 0.165, 0.175, 0.0);
        this.bones.chest.add(furPad);
      }
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.36, 0.275), mkMat(0x3a2618, 0.6, 0.2));
      strap.position.set(0, 0.04, 0.005);
      strap.rotation.z = 0.62;
      this.bones.chest.add(strap);

      // Houyi Sun-Shooting Bow mounted cleanly flat across Back (-Z = -0.18, zero neck clipping!)
      this.houyiBow = createHouyiBow();
      this.houyiBow.group.position.set(0.0, 0.03, -0.19);
      this.houyiBow.group.rotation.set(0.0, Math.PI * 0.5, 0.62);
      this.houyiBow.group.scale.setScalar(0.82);
      this.bones.chest.add(this.houyiBow.group);

      // Equip Legendary【望舒剑】in Right Hand!
      this.equipRightHandWeapon(createWangshuSword());
    } else if (arch === 'xuanxiao') {
      // Xuanxiao: Imperial Gold Qionghua Crown + Waist-Length Hair + Flowing Cloak +【羲和剑】+ 9 Floating Demon Sword Wings!
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.042, 0.14, 8), trimMat);
      crown.position.set(0, 0.22, -0.01);
      headNode.add(crown);

      const hairPin = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.22, 6), trimMat);
      hairPin.rotation.z = Math.PI / 2;
      hairPin.position.set(0, 0.23, -0.01);
      headNode.add(hairPin);

      // Long black flowing hair down the back
      const longHair = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.45, 0.04), hairMat);
      longHair.position.set(0, -0.20, -0.04);
      this.bones.ribbonA.add(longHair);

      // Flowing Crimson-Gold Qionghua Sect Master Cloak
      const capeGeo = buildSkinnedCapeGeometry(0.36, 0.56, 1.44, 0.20);
      this.addSkinnedPart(capeGeo, capeMat);

      // Golden Cloud Pauldrons on Shoulders
      for (const side of [-1, 1]) {
        const pauldron = new THREE.Mesh(new THREE.ConeGeometry(0.095, 0.18, 5), trimMat);
        pauldron.position.set(side * 0.21, 0.18, 0);
        pauldron.rotation.z = -side * 1.15;
        this.bones.chest.add(pauldron);
      }

      // 9 Levitating Crimson-Gold Phantom Sword Wings on a Celestial Halo Arc (with air gap!)
      this.demonSwordWings = new THREE.Group();
      this.demonSwordWings.position.set(0, 0.18, -0.28);
      const wingOuterMat = new THREE.MeshStandardMaterial({
        color: 0xa81c10,
        emissive: new THREE.Color(1.35, 0.22, 0.05),
        roughness: 0.25,
        metalness: 0.65,
        transparent: true,
        opacity: 0.9,
      });
      const wingCoreMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(2.1, 0.85, 0.24),
      });
      for (let i = 0; i < 9; i++) {
        const frac = (i - 4) / 4; // -1 .. +1 fan
        const ang = frac * 1.15;
        const bladeHolder = new THREE.Group();
        // Offset outward along halo arc (+sin(ang), +cos(ang)) so all 9 swords radiate outward cleanly!
        bladeHolder.position.set(Math.sin(ang) * 0.52, Math.cos(ang) * 0.38, -Math.abs(frac) * 0.08);

        const guard = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.028, 0.03), trimMat);
        guard.position.y = 0.08;
        bladeHolder.add(guard);

        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.95, 0.016), wingOuterMat);
        blade.position.y = 0.58;
        bladeHolder.add(blade);

        const core = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.90, 0.022), wingCoreMat);
        core.position.y = 0.58;
        bladeHolder.add(core);

        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.038, 0.22, 4), wingOuterMat);
        tip.position.y = 1.16;
        tip.scale.set(1, 1, 0.4);
        bladeHolder.add(tip);

        bladeHolder.rotation.z = -ang;
        bladeHolder.rotation.x = -0.14;
        this.demonSwordWings.add(bladeHolder);
      }
      this.demonSwordWings.scale.setScalar(0.001);
      this.demonSwordWings.visible = false;
      this.bones.chest.add(this.demonSwordWings);

      this.equipRightHandWeapon(createXiheSword());
    } else if (arch === 'disciple' || arch === 'cultivator') {
      // Qionghua Daoist Silver Topknot Crown
      const daoCrown = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.032, 0.10, 8), trimMat);
      daoCrown.position.set(0, 0.21, -0.01);
      headNode.add(daoCrown);

      const capeGeo = buildSkinnedCapeGeometry(0.30, 0.44, 1.42, 0.42);
      this.addSkinnedPart(capeGeo, capeMat);

      this.equipRightHandWeapon(createSectSword());

      if (arch === 'cultivator') {
        // 3 Orbiting Spirit Swords behind the Flying-Sword Cultivator!
        this.spiritOrbitSwords = new THREE.Group();
        this.spiritOrbitSwords.position.set(0, 0.28, -0.25);
        for (let i = 0; i < 3; i++) {
          const sw = createSectSword().group;
          sw.scale.setScalar(0.72);
          const ang = (i / 3) * Math.PI * 2;
          sw.position.set(Math.cos(ang) * 0.52, Math.sin(ang) * 0.52, 0);
          sw.rotation.z = ang - Math.PI / 2;
          this.spiritOrbitSwords.add(sw);
        }
        this.bones.chest.add(this.spiritOrbitSwords);
      }
    } else if (arch === 'golem') {
      // Zhenyue Giant Bronze-Jade Sword Golem: Horned Helm, Glowing Yin-Yang Reactor Core & Pauldrons
      for (const side of [-1, 1]) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.28, 5), trimMat);
        horn.position.set(side * 0.09, 0.20, 0.02);
        horn.rotation.z = -side * 0.45;
        headNode.add(horn);

        const heavyPad = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.22), outerMat);
        heavyPad.position.set(side * 0.24, 0.17, 0);
        this.bones.chest.add(heavyPad);
      }
      const coreCrystal = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.085, 0),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(0.45, 1.65, 2.2) })
      );
      coreCrystal.position.set(0, 0.08, 0.13);
      this.bones.chest.add(coreCrystal);

      this.equipRightHandWeapon(createGolemGreatsword());
    } else if (arch === 'lingsha') {
      // Han Lingsha Spirit Phantom: Twin hair buns + Dual Daggers!
      for (const side of [-1, 1]) {
        const bun = new THREE.Mesh(new THREE.SphereGeometry(0.048, 10, 10), hairMat);
        bun.position.set(side * 0.095, 0.15, -0.02);
        headNode.add(bun);
      }
      const daggerR = createSectSword();
      daggerR.group.scale.set(0.85, 0.58, 0.85);
      this.equipRightHandWeapon(daggerR);

      const daggerL = createSectSword();
      daggerL.group.scale.set(0.85, 0.58, 0.85);
      daggerL.group.position.set(0, -0.03, 0.02);
      daggerL.group.rotation.set(Math.PI * 0.52, 0, 0);
      this.bones.lHand.add(daggerL.group);
      this.offhandWeapon = daggerL;
    } else if (arch === 'mengli') {
      // Liu Mengli Spirit Phantom: Flowing Cape + Floating Violet-Jade Konghou Harp!
      const capeGeo = buildSkinnedCapeGeometry(0.32, 0.54, 1.42, 0.18);
      this.addSkinnedPart(capeGeo, capeMat);

      const harp = new THREE.Group();
      const harpMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.95, 1.45, 2.25) });
      const frame = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.018, 8, 20, Math.PI * 1.45), harpMat);
      harp.add(frame);
      harp.position.set(0.32, 0.12, 0.25);
      this.bones.chest.add(harp);
    }
  }

  public equipRightHandWeapon(w: WeaponRig) {
    this.weapon = w;
    // Align grip inside right palm, blade pointing forward/up along hand direction
    w.group.position.set(0, -0.03, 0.02);
    w.group.rotation.set(Math.PI * 0.52, 0, 0);
    this.bones.rHand.add(w.group);
  }

  public flashHit(duration = 0.11) {
    this.flashTimer = duration;
  }

  public setDemonWings(openAmount: number) {
    this.demonWingOpen = THREE.MathUtils.clamp(openAmount, 0, 1);
    if (this.demonSwordWings) {
      this.demonSwordWings.visible = this.demonWingOpen > 0.01;
      const s = THREE.MathUtils.lerp(0.01, 1.0, this.demonWingOpen);
      this.demonSwordWings.scale.setScalar(s);
    }
  }

  /**
   * Updates full skeletal animation (idle breathing, foot-planted stride, block/charge overrides,
   * active 5-beat martial-arts clip, and spring-physics hair/ribbon/cape).
   */
  public updateAnimation(dt: number, planarSpeed: number, inCombat = true, strafeDir = 0) {
    this.idleClock += dt;
    const t = this.idleClock;

    // Hit flash emissive pulse
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      for (const m of this.flashMaterials) {
        m.emissive.setRGB(0.85, 0.85, 0.95);
        m.emissiveIntensity = 0.65;
      }
    } else if (this.archetype !== 'lingsha' && this.archetype !== 'mengli') {
      for (const m of this.flashMaterials) {
        if (m.emissiveIntensity > 0.01) {
          m.emissiveIntensity = 0;
        }
      }
    }

    // Toggle Yun Tianhe's Houyi Bow between Back & Left Hand during `skill_bow`!
    if (this.houyiBow) {
      if (this.activeClip === 'skill_bow' && this.clipProgress < 0.86) {
        if (this.houyiBow.group.parent !== this.bones.lHand) {
          this.bones.lHand.add(this.houyiBow.group);
          this.houyiBow.group.position.set(0, -0.04, 0.04);
          this.houyiBow.group.rotation.set(-Math.PI * 0.5, 0, 0);
        }
        this.houyiBow.arrowMesh.visible = this.clipProgress < 0.70;
        if (this.weapon) this.weapon.group.visible = false;
      } else {
        if (this.houyiBow.group.parent !== this.bones.chest) {
          this.bones.chest.add(this.houyiBow.group);
          this.houyiBow.group.position.set(0.0, 0.03, -0.19);
          this.houyiBow.group.rotation.set(0.0, Math.PI * 0.5, 0.62);
        }
        this.houyiBow.arrowMesh.visible = false;
        if (this.weapon) this.weapon.group.visible = true;
      }
    }

    if (this.spiritOrbitSwords) {
      this.spiritOrbitSwords.rotation.z += dt * 1.65;
    }

    // 1. Reset rotations & rest translations
    for (const bName of BONE_ORDER) {
      this.bones[bName].rotation.set(0, 0, 0);
      this.bones[bName].position.copy(this.restPositions[bName]);
    }

    const eulers: Record<BoneName, [number, number, number]> = {} as Record<BoneName, [number, number, number]>;
    for (const bName of BONE_ORDER) eulers[bName] = [0, 0, 0];

    let hipsOffY = 0;
    let hipsOffZ = 0;

    // 2. Base Combat Ready Stance + Subtle Breathing
    const readyW = inCombat ? 1.0 : 0.45;
    for (const [b, rot] of Object.entries(BASE_COMBAT_READY) as [BoneName, [number, number, number]][]) {
      eulers[b][0] += rot[0] * readyW;
      eulers[b][1] += rot[1] * readyW;
      eulers[b][2] += rot[2] * readyW;
    }

    const breath = Math.sin(t * 2.1);
    eulers.chest[0] += 0.022 * breath;
    eulers.rUp[2] -= 0.018 * breath;
    eulers.lUp[2] += 0.018 * breath;
    eulers.head[1] += 0.04 * Math.sin(t * 0.7);

    // 3. Natural Foot-Planted Locomotion Stride
    const targetMove = planarSpeed > 0.15 ? Math.min(1.25, planarSpeed / 5.5) : 0;
    this.moveBlend = THREE.MathUtils.lerp(this.moveBlend, targetMove, 1 - Math.exp(-dt * 10));

    if (this.moveBlend > 0.01) {
      const cadence = THREE.MathUtils.lerp(5.8, 10.6, Math.min(1, planarSpeed / 8.5));
      this.stridePhase += dt * cadence;
      const s = Math.sin(this.stridePhase);
      const c = Math.cos(this.stridePhase);
      const mw = Math.min(1, this.moveBlend * 1.25);

      const swingAmp = THREE.MathUtils.lerp(0.42, 0.78, Math.min(1, planarSpeed / 8.0));
      const kneeLift = THREE.MathUtils.lerp(0.48, 0.96, Math.min(1, planarSpeed / 8.0));

      // Dampen standing leg pose during stride
      for (const lb of ['lThigh', 'lShin', 'lFoot', 'rThigh', 'rShin', 'rFoot'] as BoneName[]) {
        eulers[lb][0] *= 1 - mw;
        eulers[lb][1] *= 1 - mw;
        eulers[lb][2] *= 1 - mw;
      }

      eulers.lThigh[0] += -s * swingAmp * mw;
      eulers.lShin[0] += Math.max(0, c) * kneeLift * mw + 0.08 * mw;
      eulers.lFoot[0] += (s * 0.25 - Math.max(0, c) * 0.35) * mw;

      eulers.rThigh[0] += s * swingAmp * mw;
      eulers.rShin[0] += Math.max(0, -c) * kneeLift * mw + 0.08 * mw;
      eulers.rFoot[0] += (-s * 0.25 - Math.max(0, -c) * 0.35) * mw;

      // Strafe hip twist when locked on
      eulers.hips[1] = THREE.MathUtils.lerp(eulers.hips[1], -strafeDir * 0.35 - 0.08 * s * mw, mw);
      // Forward sprint lean & double-frequency vertical hip bounce
      const lean = THREE.MathUtils.lerp(0.08, 0.24, Math.min(1, planarSpeed / 9.0)) * mw;
      eulers.spine[0] += lean * 0.5;
      eulers.chest[0] += lean * 0.5;
      eulers.chest[1] += 0.14 * s * mw;
      hipsOffY += (-0.035 + 0.032 * Math.cos(this.stridePhase * 2)) * mw;

      // Counter-swing arms (sword hand stays controlled in front/side)
      eulers.lUp[0] += s * 0.52 * mw;
      eulers.lFore[0] += (-0.35 - 0.25 * Math.max(0, -s)) * mw;
      eulers.rUp[0] += -s * 0.26 * mw;
    }

    // 4. Sword Guard Stance (RMB Held — close diagonal cross-body guard per combat-feel guide!)
    if (this.isBlocking && this.activeClip === 'none') {
      eulers.hips[1] = -0.32;
      eulers.chest[0] = 0.12;
      eulers.chest[1] = -0.25;
      eulers.rUp = [-0.78, 0.52, -0.22];
      eulers.rFore = [-1.18, 0, -0.58];
      eulers.rHand = [0.28, 0.15, -0.92];
      eulers.lUp = [-0.88, -0.45, 0.25];
      eulers.lFore = [-1.15, 0, 0.35];
      hipsOffY -= 0.05;
    }

    // Heavy Charge Hold Pose
    if (this.isChargingHeavy && this.activeClip === 'none') {
      const tremble = Math.sin(t * 36) * 0.025;
      eulers.hips = [-0.08, 0.32, 0];
      eulers.spine = [-0.18, 0.20, 0];
      eulers.chest = [-0.24, 0.25, 0];
      eulers.rUp = [-2.28 + tremble, -0.18, -0.25];
      eulers.rFore = [-0.68, 0, 0];
      eulers.rHand = [-0.38, 0, 0];
      eulers.lUp = [-2.12, 0.25, 0.22];
      eulers.lFore = [-0.72, 0, 0];
      hipsOffY -= 0.07;
    }

    // 5. Active Martial-Arts Action Clip Override / Blend
    if (this.activeClip !== 'none') {
      const keys = ACTION_CLIPS[this.activeClip];
      if (keys && keys.length > 0) {
        const p = THREE.MathUtils.clamp(this.clipProgress, 0, 1);

        // Build full key list anchored at t=0 and t=1 (except death/staggerKneel which hold end pose)
        const holdsEnd = this.activeClip === 'death' || this.activeClip === 'staggerKneel';
        const fullKeys: KeyframeDef[] = [{ t: 0, ease: 'lin', pose: eulers, hipsY: hipsOffY, hipsZ: 0 }, ...keys];
        if (!holdsEnd && fullKeys[fullKeys.length - 1].t < 1.0) {
          fullKeys.push({ t: 1.0, ease: 'io', pose: BASE_COMBAT_READY, hipsY: 0, hipsZ: 0 });
        }

        let kA = fullKeys[0];
        let kB = fullKeys[fullKeys.length - 1];
        for (let i = 0; i < fullKeys.length - 1; i++) {
          if (p >= fullKeys[i].t && p <= fullKeys[i + 1].t) {
            kA = fullKeys[i];
            kB = fullKeys[i + 1];
            break;
          }
        }

        const span = Math.max(0.0001, kB.t - kA.t);
        const rawU = THREE.MathUtils.clamp((p - kA.t) / span, 0, 1);
        const u = applyEase(kB.ease, rawU);

        // Interpolate all bones mentioned in the clip
        for (const bName of BONE_ORDER) {
          const rotA = kA.pose[bName] ?? BASE_COMBAT_READY[bName] ?? [0, 0, 0];
          const rotB = kB.pose[bName] ?? kA.pose[bName] ?? BASE_COMBAT_READY[bName] ?? [0, 0, 0];
          eulers[bName] = [
            THREE.MathUtils.lerp(rotA[0], rotB[0], u),
            THREE.MathUtils.lerp(rotA[1], rotB[1], u),
            THREE.MathUtils.lerp(rotA[2], rotB[2], u),
          ];
        }
        hipsOffY = THREE.MathUtils.lerp(kA.hipsY ?? 0, kB.hipsY ?? 0, u);
        hipsOffZ = THREE.MathUtils.lerp(kA.hipsZ ?? 0, kB.hipsZ ?? 0, u);
      }
    }

    // 6. Spring-Physics Secondary Motion on Flowing Headband/Hair & Immortal Cloak!
    const worldPos = new THREE.Vector3();
    this.root.getWorldPosition(worldPos);
    const moveSpeedVis = Math.min(1.2, planarSpeed / 7.5);
    this.prevWorldPos.copy(worldPos);

    const windWave = Math.sin(t * 3.4) * 0.14 + 0.16;
    const targetCape = 0.18 + moveSpeedVis * 0.68 + windWave * 0.5;
    this.capePitch = THREE.MathUtils.lerp(this.capePitch, targetCape, 1 - Math.exp(-dt * 8));

    eulers.ribbonA = [0.22 + moveSpeedVis * 0.65 + Math.sin(t * 4.2) * 0.12, Math.sin(t * 2.7) * 0.16, 0];
    eulers.ribbonB = [0.18 + moveSpeedVis * 0.45 + Math.cos(t * 4.8) * 0.18, Math.cos(t * 3.1) * 0.18, 0];

    eulers.capeA = [this.capePitch * 0.55, Math.sin(t * 2.1) * 0.06, 0];
    eulers.capeB = [this.capePitch * 0.42 + Math.sin(t * 3.6 - 0.8) * 0.12, 0, 0];
    eulers.capeC = [this.capePitch * 0.35 + Math.sin(t * 4.4 - 1.6) * 0.16, 0, 0];

    // Commit final bone transforms
    for (const bName of BONE_ORDER) {
      const [rx, ry, rz] = eulers[bName];
      this.bones[bName].rotation.set(rx, ry, rz);
    }
    this.bones.hips.position.y = this.restPositions.hips.y + hipsOffY;
    this.bones.hips.position.z = this.restPositions.hips.z + hipsOffZ;

    this.bones.root.updateMatrixWorld(true);
  }
}
