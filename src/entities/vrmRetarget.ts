import * as THREE from 'three';
import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';

/**
 * Official Mixamo -> VRM Humanoid Bone Mapping (supports both `mixamorigHips` and `mixamorig:Hips`).
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
  mixamorigRightHandIndex1: 'rightIndexProximal',
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

function findMixamoNode(root: THREE.Object3D, rawName: string): THREE.Object3D | null {
  const direct = root.getObjectByName(rawName);
  if (direct) return direct;
  const clean = rawName.replace(':', '');
  const alt = root.getObjectByName(clean);
  if (alt) return alt;
  const withColon = clean.replace(/^mixamorig/, 'mixamorig:');
  return root.getObjectByName(withColon) ?? null;
}

/**
 * Non-destructively retargets a pre-loaded Mixamo FBX asset onto a VRM's Normalized Humanoid rig.
 * Zeroes out horizontal X/Z root motion on `hips.position` so gameplay controller owns world position!
 */
export function retargetMixamoToVrm(
  fbxAsset: THREE.Group,
  vrm: VRM,
  clipName: string
): THREE.AnimationClip | null {
  const srcClip =
    THREE.AnimationClip.findByName(fbxAsset.animations, 'mixamo.com') ?? fbxAsset.animations[0];
  if (!srcClip) return null;

  const tracks: THREE.KeyframeTrack[] = [];
  const restRotationInverse = new THREE.Quaternion();
  const parentRestWorldRotation = new THREE.Quaternion();
  const quatA = new THREE.Quaternion();

  const mixamoHips = findMixamoNode(fbxAsset, 'mixamorigHips');
  const motionHipsHeight = Math.max(0.01, Math.abs(mixamoHips?.position.y ?? 100));
  const vrmHipsPos = vrm.humanoid?.normalizedRestPose?.hips?.position;
  const vrmHipsHeight = vrmHipsPos ? Math.abs(vrmHipsPos[1]) : 0.92;
  const hipsPositionScale = vrmHipsHeight / motionHipsHeight;
  const isVrm0 = vrm.meta?.metaVersion === '0';

  for (const track of srcClip.tracks) {
    const dotIdx = track.name.indexOf('.');
    if (dotIdx < 0) continue;
    const rawRigName = track.name.slice(0, dotIdx);
    const propertyName = track.name.slice(dotIdx + 1);
    const cleanRigName = rawRigName.replace(':', '');

    const vrmBoneName = MIXAMO_TO_VRM_BONES[cleanRigName];
    if (!vrmBoneName) continue;

    const vrmNode = vrm.humanoid?.getNormalizedBoneNode(vrmBoneName);
    const mixamoRigNode = findMixamoNode(fbxAsset, rawRigName);
    if (!vrmNode || !mixamoRigNode || !mixamoRigNode.parent) continue;

    mixamoRigNode.getWorldQuaternion(restRotationInverse).invert();
    mixamoRigNode.parent.getWorldQuaternion(parentRestWorldRotation);

    if (track instanceof THREE.QuaternionKeyframeTrack) {
      // Clone values so source FBX clip is NEVER mutated across characters!
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
          `${vrmNode.name}.${propertyName}`,
          Float32Array.from(track.times),
          outValues
        )
      );
    } else if (
      track instanceof THREE.VectorKeyframeTrack &&
      propertyName === 'position' &&
      vrmBoneName === 'hips'
    ) {
      // Keep vertical Y bob/jump, lock X and Z to 0 so character never drifts out of capsule!
      const outValues = new Float32Array(track.values.length);
      for (let i = 0; i < track.values.length; i += 3) {
        outValues[i] = 0;
        outValues[i + 1] = track.values[i + 1] * hipsPositionScale;
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

  return new THREE.AnimationClip(clipName, srcClip.duration, tracks);
}

/**
 * Retargets a Mixamo FBX animation onto another Mixamo-rigged FBX body (e.g. `armored_guardian.fbx`),
 * locking horizontal X/Z hips translation in-place.
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
    const dotIdx = track.name.indexOf('.');
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
        out[i + 1] = track.values[i + 1] * scale;
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
