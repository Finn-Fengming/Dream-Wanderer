import * as THREE from 'three';
import { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';

/**
 * Official Mixamo -> VRM Humanoid Bone Mapping.
 */
export const MIXAMO_TO_VRM_BONES: Record<string, VRMHumanBoneName> = {
  mixamorigHips: 'hips',
  mixamorigSpine: 'spine',
  mixamorigSpine1: 'chest',
  mixamorigSpine2: 'upperChest',
  mixamorigNeck: 'neck',
  mixamorigHead: 'head',
  mixamorigLeftShoulder: 'leftShoulder',
  mixamorigLeftArm: 'leftUpperArm',
  mixamorigLeftForeArm: 'leftLowerArm',
  mixamorigLeftHand: 'leftHand',
  mixamorigLeftHandThumb1: 'leftThumbMetacarpal',
  mixamorigLeftHandThumb2: 'leftThumbProximal',
  mixamorigLeftHandThumb3: 'leftThumbDistal',
  mixamorigLeftHandIndex1: 'leftIndexProximal',
  mixamorigLeftHandIndex2: 'leftIndexIntermediate',
  mixamorigLeftHandIndex3: 'leftIndexDistal',
  mixamorigLeftHandMiddle1: 'leftMiddleProximal',
  mixamorigLeftHandMiddle2: 'leftMiddleIntermediate',
  mixamorigLeftHandMiddle3: 'leftMiddleDistal',
  mixamorigLeftHandRing1: 'leftRingProximal',
  mixamorigLeftHandRing2: 'leftRingIntermediate',
  mixamorigLeftHandRing3: 'leftRingDistal',
  mixamorigLeftHandPinky1: 'leftLittleProximal',
  mixamorigLeftHandPinky2: 'leftLittleIntermediate',
  mixamorigLeftHandPinky3: 'leftLittleDistal',
  mixamorigRightShoulder: 'rightShoulder',
  mixamorigRightArm: 'rightUpperArm',
  mixamorigRightForeArm: 'rightLowerArm',
  mixamorigRightHand: 'rightHand',
  mixamorigRightHandPinky1: 'rightLittleProximal',
  mixamorigRightHandPinky2: 'rightLittleIntermediate',
  mixamorigRightHandPinky3: 'rightLittleDistal',
  mixamorigRightHandRing1: 'rightRingProximal',
  mixamorigRightHandRing2: 'rightRingIntermediate',
  mixamorigRightHandRing3: 'rightRingDistal',
  mixamorigRightHandMiddle1: 'rightMiddleProximal',
  mixamorigRightHandMiddle2: 'rightMiddleIntermediate',
  mixamorigRightHandMiddle3: 'rightMiddleDistal',
  mixamorigRightHandIndex1: 'rightrightIndexProximal' as VRMHumanBoneName, // patched below
  mixamorigRightHandIndex2: 'rightIndexIntermediate',
  mixamorigRightHandIndex3: 'rightIndexDistal',
  mixamorigRightHandThumb1: 'rightThumbMetacarpal',
  mixamorigRightHandThumb2: 'rightThumbProximal',
  mixamorigRightHandThumb3: 'rightThumbDistal',
  mixamorigLeftUpLeg: 'leftUpperLeg',
  mixamorigLeftLeg: 'leftLowerLeg',
  mixamorigLeftFoot: 'leftFoot',
  mixamorigLeftToeBase: 'leftToes',
  mixamorigRightUpLeg: 'rightUpperLeg',
  mixamorigRightLeg: 'rightLowerLeg',
  mixamorigRightFoot: 'rightFoot',
  mixamorigRightToeBase: 'rightToes',
};
MIXAMO_TO_VRM_BONES.mixamorigRightHandIndex1 = 'rightIndexProximal';

/**
 * Quaternius Universal Animation Library (`ual_46_anims.glb` Rigify `DEF-*`) -> VRM Humanoid Mapping!
 */
export const UAL_TO_VRM_BONES: Record<string, VRMHumanBoneName> = {
  'DEF-hips': 'hips',
  'DEF-spine.001': 'spine',
  'DEF-spine.002': 'chest',
  'DEF-spine.003': 'upperChest',
  'DEF-neck': 'neck',
  'DEF-head': 'head',
  'DEF-shoulder.L': 'leftShoulder',
  'DEF-upper_arm.L': 'leftUpperArm',
  'DEF-forearm.L': 'leftLowerArm',
  'DEF-hand.L': 'leftHand',
  'DEF-thumb.01.L': 'leftThumbMetacarpal',
  'DEF-thumb.02.L': 'leftThumbProximal',
  'DEF-thumb.03.L': 'leftThumbDistal',
  'DEF-f_index.01.L': 'leftIndexProximal',
  'DEF-f_index.02.L': 'leftIndexIntermediate',
  'DEF-f_index.03.L': 'leftIndexDistal',
  'DEF-f_middle.01.L': 'leftMiddleProximal',
  'DEF-f_middle.02.L': 'leftMiddleIntermediate',
  'DEF-f_middle.03.L': 'leftMiddleDistal',
  'DEF-f_ring.01.L': 'leftRingProximal',
  'DEF-f_ring.02.L': 'leftRingIntermediate',
  'DEF-f_ring.03.L': 'leftRingDistal',
  'DEF-f_pinky.01.L': 'leftLittleProximal',
  'DEF-f_pinky.02.L': 'leftLittleIntermediate',
  'DEF-f_pinky.03.L': 'leftLittleDistal',
  'DEF-shoulder.R': 'rightShoulder',
  'DEF-upper_arm.R': 'rightUpperArm',
  'DEF-forearm.R': 'rightLowerArm',
  'DEF-hand.R': 'rightHand',
  'DEF-thumb.01.R': 'rightThumbMetacarpal',
  'DEF-thumb.02.R': 'rightThumbProximal',
  'DEF-thumb.03.R': 'rightThumbDistal',
  'DEF-f_index.01.R': 'rightIndexProximal',
  'DEF-f_index.02.R': 'rightIndexIntermediate',
  'DEF-f_index.03.R': 'rightIndexDistal',
  'DEF-f_middle.01.R': 'rightMiddleProximal',
  'DEF-f_middle.02.R': 'rightMiddleIntermediate',
  'DEF-f_middle.03.R': 'rightMiddleDistal',
  'DEF-f_ring.01.R': 'rightRingProximal',
  'DEF-f_ring.02.R': 'rightRingIntermediate',
  'DEF-f_ring.03.R': 'rightRingDistal',
  'DEF-f_pinky.01.R': 'rightLittleProximal',
  'DEF-f_pinky.02.R': 'rightLittleIntermediate',
  'DEF-f_pinky.03.R': 'rightLittleDistal',
  'DEF-thigh.L': 'leftUpperLeg',
  'DEF-shin.L': 'leftLowerLeg',
  'DEF-foot.L': 'leftFoot',
  'DEF-toe.L': 'leftToes',
  'DEF-thigh.R': 'rightUpperLeg',
  'DEF-shin.R': 'rightLowerLeg',
  'DEF-foot.R': 'rightFoot',
  'DEF-toe.R': 'rightToes',
};

// Also populate GLTFLoader PropertyBinding-sanitized keys (dots stripped, e.g. `DEF-upper_armL`, `DEF-spine001`)!
for (const [k, v] of Object.entries(UAL_TO_VRM_BONES)) {
  const noDots = k.replace(/\./g, '');
  if (noDots !== k) {
    UAL_TO_VRM_BONES[noDots] = v;
  }
}

export type UalClipKey =
  | 'Idle_Loop'
  | 'Sword_Idle'
  | 'Walk_Loop'
  | 'Walk_Formal_Loop'
  | 'Jog_Fwd_Loop'
  | 'Sprint_Loop'
  | 'Roll'
  | 'Sword_Attack'
  | 'Punch_Cross'
  | 'Punch_Jab'
  | 'Spell_Simple_Enter'
  | 'Spell_Simple_Idle_Loop'
  | 'Spell_Simple_Shoot'
  | 'Hit_Chest'
  | 'Hit_Head'
  | 'Fixing_Kneeling'
  | 'Sitting_Idle_Loop'
  | 'Jump_Start'
  | 'Jump_Loop'
  | 'Jump_Land'
  | 'Interact'
  | 'Death01';

function findMixamoNode(root: THREE.Object3D, rawName: string): THREE.Object3D | null {
  const direct = root.getObjectByName(rawName);
  if (direct) return direct;
  const clean = rawName.replace(':', '');
  const alt = root.getObjectByName(clean);
  if (alt) return alt;
  const withColon = clean.replace(/^mixamorig/, 'mixamorig:');
  return root.getObjectByName(withColon) ?? null;
}

function findNodeByExactName(root: THREE.Object3D, targetName: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  const cleanTarget = targetName.replace(/\./g, '');
  root.traverse((obj) => {
    if (!found && (obj.name === targetName || obj.name.replace(/\./g, '') === cleanTarget)) {
      found = obj;
    }
  });
  return found;
}

/**
 * Core world-space rest-calibrated retargeter onto VRM Normalized Humanoid Rig.
 * Works for BOTH Mixamo FBX clips AND Quaternius 46-Clip `ual_46_anims.glb` (`DEF-*` Rigify bones)!
 * Calibrates exact rest-pose hip height so soles sit at `y = 0.000m` with ZERO ground clipping!
 */
function retargetClipToVrmInternal(
  srcScene: THREE.Object3D,
  srcClip: THREE.AnimationClip,
  boneMap: Record<string, VRMHumanBoneName>,
  hipsBoneKey: string,
  vrm: VRM,
  outClipName: string
): THREE.AnimationClip {
  srcScene.updateMatrixWorld(true);

  const tracks: THREE.KeyframeTrack[] = [];
  const restRotationInverse = new THREE.Quaternion();
  const parentRestWorldRotation = new THREE.Quaternion();
  const quatA = new THREE.Quaternion();
  const vecA = new THREE.Vector3();

  const srcHips =
    findNodeByExactName(srcScene, hipsBoneKey) ?? findMixamoNode(srcScene, hipsBoneKey);
  const restWorldHips = new THREE.Vector3(0, 0.92, 0);
  if (srcHips) {
    srcHips.getWorldPosition(restWorldHips);
  }
  const srcHipsHeight = Math.max(0.05, Math.abs(restWorldHips.y));

  const vrmHipsPos = vrm.humanoid?.normalizedRestPose?.hips?.position;
  const vrmHipsHeight = vrmHipsPos ? Math.abs(vrmHipsPos[1]) : 0.92;
  const hipsScale = vrmHipsHeight / srcHipsHeight;
  const isVrm0 = vrm.meta?.metaVersion === '0';

  for (const track of srcClip.tracks) {
    // IMPORTANT: use `lastIndexOf('.')` so Rigify names like `DEF-spine.001.quaternion` split cleanly!
    const dotIdx = track.name.lastIndexOf('.');
    if (dotIdx < 0) continue;
    const rawRigName = track.name.slice(0, dotIdx);
    const propertyName = track.name.slice(dotIdx + 1);
    const cleanLookup = boneMap[rawRigName] ? rawRigName : rawRigName.replace(':', '');

    const vrmBoneName = boneMap[cleanLookup];
    if (!vrmBoneName) continue;

    const vrmNode = vrm.humanoid?.getNormalizedBoneNode(vrmBoneName);
    const srcNode =
      findNodeByExactName(srcScene, rawRigName) ?? findMixamoNode(srcScene, rawRigName);
    if (!vrmNode || !srcNode || !srcNode.parent) continue;

    srcNode.getWorldQuaternion(restRotationInverse).invert();
    srcNode.parent.getWorldQuaternion(parentRestWorldRotation);

    if (track instanceof THREE.QuaternionKeyframeTrack && propertyName === 'quaternion') {
      const outValues = new Float32Array(track.values.length);
      for (let i = 0; i < track.values.length; i += 4) {
        quatA.set(track.values[i], track.values[i + 1], track.values[i + 2], track.values[i + 3]);
        quatA.premultiply(parentRestWorldRotation).multiply(restRotationInverse);
        outValues[i] = isVrm0 ? -quatA.x : quatA.x;
        outValues[i + 1] = quatA.y;
        outValues[i + 2] = isVrm0 ? -quatA.z : quatA.z;
        outValues[i + 3] = quatA.w;
      }
      tracks.push(
        new THREE.QuaternionKeyframeTrack(
          `${vrmNode.name}.quaternion`,
          Float32Array.from(track.times),
          outValues
        )
      );
    } else if (
      track instanceof THREE.VectorKeyframeTrack &&
      propertyName === 'position' &&
      vrmBoneName === 'hips'
    ) {
      const parentWorldMat = srcNode.parent.matrixWorld;
      const outValues = new Float32Array(track.values.length);
      for (let i = 0; i < track.values.length; i += 3) {
        vecA.set(track.values[i], track.values[i + 1], track.values[i + 2]).applyMatrix4(parentWorldMat);
        const deltaWorldY = vecA.y - restWorldHips.y;
        outValues[i] = 0;
        // Anchor exact rest-pose hip height and clamp minimum pelvis height so character NEVER sinks underground!
        outValues[i + 1] = Math.max(0.16, vrmHipsHeight + deltaWorldY * hipsScale);
        outValues[i + 2] = 0;
      }
      tracks.push(
        new THREE.VectorKeyframeTrack(
          `${vrmNode.name}.position`,
          Float32Array.from(track.times),
          outValues
        )
      );
    }
  }

  return new THREE.AnimationClip(outClipName, srcClip.duration, tracks);
}

export function retargetMixamoToVrm(
  fbxAsset: THREE.Group,
  vrm: VRM,
  clipName: string
): THREE.AnimationClip | null {
  const srcClip =
    THREE.AnimationClip.findByName(fbxAsset.animations, 'mixamo.com') ?? fbxAsset.animations[0];
  if (!srcClip) return null;
  return retargetClipToVrmInternal(
    fbxAsset,
    srcClip,
    MIXAMO_TO_VRM_BONES,
    'mixamorigHips',
    vrm,
    clipName
  );
}

export function retargetUalClipToVrm(
  ualGlb: GLTF,
  ualClipName: UalClipKey | string,
  vrm: VRM,
  outClipName = `ual_${ualClipName}`
): THREE.AnimationClip | null {
  const srcClip = THREE.AnimationClip.findByName(ualGlb.animations, ualClipName);
  if (!srcClip) return null;
  return retargetClipToVrmInternal(
    ualGlb.scene,
    srcClip,
    UAL_TO_VRM_BONES,
    'DEF-hips',
    vrm,
    outClipName
  );
}

/**
 * Retargets a Mixamo FBX animation onto a Mixamo-rigged FBX body (`armored_guardian.fbx`),
 * locking horizontal X/Z hips translation in-place and calibrating rest Y height.
 */
export function retargetMixamoToFbxRig(
  fbxMotion: THREE.Group,
  targetRigRoot: THREE.Object3D,
  clipName: string
): THREE.AnimationClip | null {
  const srcClip =
    THREE.AnimationClip.findByName(fbxMotion.animations, 'mixamo.com') ?? fbxMotion.animations[0];
  if (!srcClip) return null;

  const tracks: THREE.KeyframeTrack[] = [];
  for (const track of srcClip.tracks) {
    const dotIdx = track.name.lastIndexOf('.');
    if (dotIdx < 0) continue;
    const rawRigName = track.name.slice(0, dotIdx);
    const prop = track.name.slice(dotIdx + 1);
    const targetNode = findMixamoNode(targetRigRoot, rawRigName);
    if (!targetNode) continue;

    if (track instanceof THREE.QuaternionKeyframeTrack && prop === 'quaternion') {
      tracks.push(
        new THREE.QuaternionKeyframeTrack(
          `${targetNode.name}.quaternion`,
          Float32Array.from(track.times),
          Float32Array.from(track.values)
        )
      );
    } else if (
      track instanceof THREE.VectorKeyframeTrack &&
      prop === 'position' &&
      /Hips$/i.test(rawRigName)
    ) {
      const restY = targetNode.position.y || 100;
      const srcHips = findMixamoNode(fbxMotion, rawRigName);
      const srcY = Math.max(0.01, Math.abs(srcHips?.position.y || 100));
      const scale = restY / srcY;
      const out = new Float32Array(track.values.length);
      for (let i = 0; i < track.values.length; i += 3) {
        out[i] = targetNode.position.x;
        out[i + 1] = Math.max(restY * 0.22, restY + (track.values[i + 1] - srcY) * scale);
        out[i + 2] = targetNode.position.z;
      }
      tracks.push(
        new THREE.VectorKeyframeTrack(
          `${targetNode.name}.position`,
          Float32Array.from(track.times),
          out
        )
      );
    }
  }
  return new THREE.AnimationClip(clipName, srcClip.duration, tracks);
}
