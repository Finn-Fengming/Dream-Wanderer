import * as THREE from 'three';

const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vC = new THREE.Vector3();
const _vT = new THREE.Vector3();
const _ab = new THREE.Vector3();
const _bc = new THREE.Vector3();
const _ac = new THREE.Vector3();
const _at = new THREE.Vector3();
const _axis1 = new THREE.Vector3();
const _axis2 = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _qParentInv = new THREE.Quaternion();
const _qWorld = new THREE.Quaternion();
const _qDelta = new THREE.Quaternion();
const _qOrigUpper = new THREE.Quaternion();
const _qOrigLower = new THREE.Quaternion();

/**
 * Analytical 2-Bone IK Solver operating as a clean world-space delta over the animated pose!
 * Preserves natural bone roll/twist, never pops at full extension, and works identically on
 * VRM `rawBoneNode` skeletons and Mixamo/GLTF `THREE.Bone` chains!
 */
export function solveTwoBoneIK(
  upperBone: THREE.Object3D,
  lowerBone: THREE.Object3D,
  endBone: THREE.Object3D,
  targetWorldPos: THREE.Vector3,
  poleDirWorld: THREE.Vector3,
  weight = 1.0
) {
  if (weight <= 0.001) return;
  const w = THREE.MathUtils.clamp(weight, 0, 1);

  _qOrigUpper.copy(upperBone.quaternion);
  _qOrigLower.copy(lowerBone.quaternion);

  upperBone.updateWorldMatrix(true, false);
  lowerBone.updateWorldMatrix(true, false);
  endBone.updateWorldMatrix(true, false);

  _vA.setFromMatrixPosition(upperBone.matrixWorld);
  _vB.setFromMatrixPosition(lowerBone.matrixWorld);
  _vC.setFromMatrixPosition(endBone.matrixWorld);
  _vT.copy(targetWorldPos);

  const lenAB = _vA.distanceTo(_vB);
  const lenBC = _vB.distanceTo(_vC);
  if (lenAB < 1e-4 || lenBC < 1e-4) return;

  _at.subVectors(_vT, _vA);
  const rawDistAT = _at.length();
  if (rawDistAT < 1e-4) return;

  // Softly clamp reach so knees/elbows never snap at 180 deg singularity
  const minReach = Math.abs(lenAB - lenBC) + 0.02;
  const maxReach = (lenAB + lenBC) * 0.992;
  const clampedDist = THREE.MathUtils.clamp(rawDistAT, minReach, maxReach);

  _ac.subVectors(_vC, _vA);
  const curDistAC = _ac.length();
  if (curDistAC < 1e-4) return;

  // 1. Adjust interior bend angle at `lowerBone` (knee/elbow) via Law of Cosines
  const cosCur = THREE.MathUtils.clamp(
    (lenAB * lenAB + lenBC * lenBC - curDistAC * curDistAC) / (2 * lenAB * lenBC),
    -0.999,
    0.999
  );
  const cosTarget = THREE.MathUtils.clamp(
    (lenAB * lenAB + lenBC * lenBC - clampedDist * clampedDist) / (2 * lenAB * lenBC),
    -0.999,
    0.999
  );
  const curInterior = Math.acos(cosCur);
  const targetInterior = Math.acos(cosTarget);
  const deltaKneeAngle = curInterior - targetInterior;

  // World hinge axis perpendicular to limb plane (stabilized by poleDirWorld when nearly straight)
  _ab.subVectors(_vB, _vA).normalize();
  _bc.subVectors(_vC, _vB).normalize();
  _axis1.crossVectors(_ab, _bc);
  if (_axis1.lengthSq() < 1e-4) {
    _pole.copy(poleDirWorld).normalize();
    _axis1.crossVectors(_at, _pole);
  }
  if (_axis1.lengthSq() > 1e-6) {
    _axis1.normalize();
    _qDelta.setFromAxisAngle(_axis1, deltaKneeAngle);
    lowerBone.getWorldQuaternion(_qWorld);
    _qWorld.premultiply(_qDelta);
    if (lowerBone.parent) {
      lowerBone.parent.getWorldQuaternion(_qParentInv).invert();
      lowerBone.quaternion.copy(_qParentInv.multiply(_qWorld));
    } else {
      lowerBone.quaternion.copy(_qWorld);
    }
    lowerBone.updateWorldMatrix(true, true);
  }

  // 2. Swing `upperBone` (hip/shoulder) so updated `endBone` aligns onto `targetWorldPos`
  _vC.setFromMatrixPosition(endBone.matrixWorld);
  _ac.subVectors(_vC, _vA).normalize();
  _at.normalize();

  _qDelta.setFromUnitVectors(_ac, _at);
  upperBone.getWorldQuaternion(_qWorld);
  _qWorld.premultiply(_qDelta);

  // Nudge knee plane gently toward `poleDirWorld` so knees never splay inward awkwardly
  if (poleDirWorld.lengthSq() > 0.01) {
    upperBone.parent?.getWorldQuaternion(_qParentInv).invert();
    if (upperBone.parent) {
      upperBone.quaternion.copy(_qParentInv.multiply(_qWorld));
    } else {
      upperBone.quaternion.copy(_qWorld);
    }
    upperBone.updateWorldMatrix(true, true);

    _vB.setFromMatrixPosition(lowerBone.matrixWorld);
    _vC.setFromMatrixPosition(endBone.matrixWorld);
    _ac.subVectors(_vC, _vA).normalize();
    // Project current knee offset & desired pole onto plane perpendicular to AC
    const curKneeProj = _ab.subVectors(_vB, _vA).addScaledVector(_ac, -_vB.clone().sub(_vA).dot(_ac));
    const desPoleProj = _pole.copy(poleDirWorld).addScaledVector(_ac, -poleDirWorld.dot(_ac));
    if (curKneeProj.lengthSq() > 1e-4 && desPoleProj.lengthSq() > 1e-4) {
      curKneeProj.normalize();
      desPoleProj.normalize();
      _qDelta.setFromUnitVectors(curKneeProj, desPoleProj);
      // Partial 45% pole alignment keeps mocap's natural stance while preventing reverse-knee flips!
      _axis2.set(0, 0, 0);
      const halfQ = new THREE.Quaternion().slerp(_qDelta, 0.45);
      upperBone.getWorldQuaternion(_qWorld);
      _qWorld.premultiply(halfQ);
      if (upperBone.parent) {
        upperBone.parent.getWorldQuaternion(_qParentInv).invert();
        upperBone.quaternion.copy(_qParentInv.multiply(_qWorld));
      } else {
        upperBone.quaternion.copy(_qWorld);
      }
    }
  } else if (upperBone.parent) {
    upperBone.parent.getWorldQuaternion(_qParentInv).invert();
    upperBone.quaternion.copy(_qParentInv.multiply(_qWorld));
  }

  if (w < 0.999) {
    upperBone.quaternion.copy(_qOrigUpper).slerp(upperBone.quaternion, w);
    lowerBone.quaternion.copy(_qOrigLower).slerp(lowerBone.quaternion, w);
  }
  upperBone.updateWorldMatrix(true, true);
}

export interface FootIkBones {
  hips: THREE.Object3D;
  leftUpperLeg: THREE.Object3D;
  leftLowerLeg: THREE.Object3D;
  leftFoot: THREE.Object3D;
  rightUpperLeg: THREE.Object3D;
  rightLowerLeg: THREE.Object3D;
  rightFoot: THREE.Object3D;
  soleHeightL: number;
  soleHeightR: number;
}

/**
 * Stateful Per-Character Stair & Slope Foot IK Solver:
 * - Raycasts individual stone stair treads (`sampleFootHeight`) under Left & Right ankles.
 * - Smoothly lowers pelvis when one foot steps down onto a lower stair riser.
 * - Solves 2-Bone Analytical Leg IK on both legs so boots plant 100% flush with zero sinking!
 */
export class CharacterFootIK {
  private smoothedPelvisY = 0;
  private smoothedLiftL = 0;
  private smoothedLiftR = 0;
  private _footL = new THREE.Vector3();
  private _footR = new THREE.Vector3();
  private _targetL = new THREE.Vector3();
  private _targetR = new THREE.Vector3();
  private _fwdWorld = new THREE.Vector3();

  public reset() {
    this.smoothedPelvisY = 0;
    this.smoothedLiftL = 0;
    this.smoothedLiftR = 0;
  }

  public apply(
    dt: number,
    rigRoot: THREE.Object3D,
    bones: FootIkBones,
    sampleFootHeight: (x: number, z: number, refY: number) => number,
    ikWeight: number,
    outLeftFootWorld?: THREE.Vector3,
    outRightFootWorld?: THREE.Vector3
  ) {
    rigRoot.updateWorldMatrix(true, true);
    bones.leftFoot.getWorldPosition(this._footL);
    bones.rightFoot.getWorldPosition(this._footR);

    if (outLeftFootWorld) outLeftFootWorld.copy(this._footL);
    if (outRightFootWorld) outRightFootWorld.copy(this._footR);

    if (ikWeight <= 0.01) {
      this.smoothedPelvisY = THREE.MathUtils.lerp(this.smoothedPelvisY, 0, Math.min(1, dt * 12));
      this.smoothedLiftL = THREE.MathUtils.lerp(this.smoothedLiftL, 0, Math.min(1, dt * 12));
      this.smoothedLiftR = THREE.MathUtils.lerp(this.smoothedLiftR, 0, Math.min(1, dt * 12));
      return;
    }

    const rootY = rigRoot.position.y;
    const scale = rigRoot.scale.y || 1.0;

    // Animated height of each sole above the character's logical root plane (preserves walk/run foot lift!)
    const animClearanceL = Math.max(0, this._footL.y - bones.soleHeightL * scale - rootY);
    const animClearanceR = Math.max(0, this._footR.y - bones.soleHeightR * scale - rootY);

    const groundYL = sampleFootHeight(this._footL.x, this._footL.z, rootY + 0.55);
    const groundYR = sampleFootHeight(this._footR.x, this._footR.z, rootY + 0.55);

    const deltaL = THREE.MathUtils.clamp(groundYL - rootY, -0.42, 0.45);
    const deltaR = THREE.MathUtils.clamp(groundYR - rootY, -0.42, 0.45);

    // Lower pelvis slightly when one leg reaches down to a lower step so the knee doesn't over-stretch
    const desiredPelvisDrop = Math.min(0, Math.min(deltaL, deltaR)) * 0.85;
    this.smoothedPelvisY = THREE.MathUtils.lerp(
      this.smoothedPelvisY,
      desiredPelvisDrop * ikWeight,
      Math.min(1, dt * 15)
    );
    bones.hips.position.y += this.smoothedPelvisY / scale;
    bones.hips.updateWorldMatrix(true, true);

    this.smoothedLiftL = THREE.MathUtils.lerp(this.smoothedLiftL, deltaL, Math.min(1, dt * 20));
    this.smoothedLiftR = THREE.MathUtils.lerp(this.smoothedLiftR, deltaR, Math.min(1, dt * 20));

    // Character forward knee pole direction in world space (VRM0 rotated faces +Z in local rigRoot!)
    this._fwdWorld.set(0, 0.15, 1).applyQuaternion(rigRoot.quaternion).normalize();

    // Re-read ankle X/Z after pelvis adjustment
    bones.leftFoot.getWorldPosition(this._footL);
    bones.rightFoot.getWorldPosition(this._footR);

    const desiredAnkleYL = rootY + this.smoothedLiftL + bones.soleHeightL * scale + animClearanceL;
    const desiredAnkleYR = rootY + this.smoothedLiftR + bones.soleHeightR * scale + animClearanceR;

    // Always prevent downward penetration into uphill stair treads, and plant downhill foot when near ground!
    const weightL = animClearanceL < 0.16 || desiredAnkleYL > this._footL.y ? ikWeight : ikWeight * 0.35;
    const weightR = animClearanceR < 0.16 || desiredAnkleYR > this._footR.y ? ikWeight : ikWeight * 0.35;

    this._targetL.set(this._footL.x, Math.max(desiredAnkleYL, groundYL + bones.soleHeightL * scale), this._footL.z);
    this._targetR.set(this._footR.x, Math.max(desiredAnkleYR, groundYR + bones.soleHeightR * scale), this._footR.z);

    solveTwoBoneIK(
      bones.leftUpperLeg,
      bones.leftLowerLeg,
      bones.leftFoot,
      this._targetL,
      this._fwdWorld,
      weightL
    );
    solveTwoBoneIK(
      bones.rightUpperLeg,
      bones.rightLowerLeg,
      bones.rightFoot,
      this._targetR,
      this._fwdWorld,
      weightR
    );

    if (outLeftFootWorld) {
      bones.leftFoot.getWorldPosition(outLeftFootWorld);
      outLeftFootWorld.y -= bones.soleHeightL * scale;
    }
    if (outRightFootWorld) {
      bones.rightFoot.getWorldPosition(outRightFootWorld);
      outRightFootWorld.y -= bones.soleHeightR * scale;
    }
  }
}
