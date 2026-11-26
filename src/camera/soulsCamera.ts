import * as THREE from 'three';
import { mouse, touchInput } from '../core/input';
import { QionghuaWorld } from '../world/qionghuaWorld';

export class SoulsCamera {
  public camera: THREE.PerspectiveCamera;
  public yaw = 0; // 0 = looking toward -Z (North toward Juanyun Summit)
  public pitch = 0.22;
  public distance = 5.4;

  public lockedTargetPos: THREE.Vector3 | null = null;
  public customShot: { pos: THREE.Vector3; lookAt: THREE.Vector3; blend?: number } | null = null;

  private currentFocus = new THREE.Vector3(0, 1.6, 78);
  private currentCamPos = new THREE.Vector3(0, 3.8, 83.5);
  private shakeTimer = 0;
  private shakeIntensity = 0;
  private handoffBlend = 1.0;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(54, window.innerWidth / Math.max(1, window.innerHeight), 0.15, 900);
    this.camera.position.copy(this.currentCamPos);
  }

  public snapBehind(targetPos: THREE.Vector3, yaw = 0, pitch = 0.22) {
    this.yaw = yaw;
    this.pitch = pitch;
    this.currentFocus.set(targetPos.x, targetPos.y + 1.55, targetPos.z);
    const desired = this.computeDesiredCamPos(this.currentFocus);
    this.currentCamPos.copy(desired);
    this.camera.position.copy(this.currentCamPos);
    this.camera.lookAt(this.currentFocus);
  }

  public addShake(intensity: number, duration = 0.22) {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    this.shakeTimer = Math.max(this.shakeTimer, duration);
  }

  public setCustomShot(pos: THREE.Vector3, lookAt: THREE.Vector3) {
    this.customShot = { pos: pos.clone(), lookAt: lookAt.clone() };
    this.handoffBlend = 0.15;
  }

  public clearCustomShot() {
    this.customShot = null;
  }

  private computeDesiredCamPos(focus: THREE.Vector3): THREE.Vector3 {
    const horizDist = Math.cos(this.pitch) * this.distance;
    const vertOff = Math.sin(this.pitch) * this.distance;
    // Slight over-the-right-shoulder offset for authentic Elden Ring framing
    const rightX = Math.cos(this.yaw) * 0.42;
    const rightZ = -Math.sin(this.yaw) * 0.42;

    return new THREE.Vector3(
      focus.x + Math.sin(this.yaw) * horizDist + rightX,
      focus.y + vertOff,
      focus.z + Math.cos(this.yaw) * horizDist + rightZ
    );
  }

  public update(dt: number, playerPos: THREE.Vector3, world: QionghuaWorld) {
    if (this.customShot) {
      this.camera.position.lerp(this.customShot.pos, Math.min(1, dt * 8));
      this.currentFocus.lerp(this.customShot.lookAt, Math.min(1, dt * 8));
      this.camera.lookAt(this.currentFocus);
      return;
    }

    this.handoffBlend = Math.min(1.0, this.handoffBlend + dt * 1.6);

    // Free look vs Hard Lock-On
    const lookSensitivity = 0.0024;
    if (!this.lockedTargetPos) {
      this.yaw -= (mouse.deltaX + touchInput.lookDeltaX) * lookSensitivity;
      this.pitch += (mouse.deltaY + touchInput.lookDeltaY) * lookSensitivity * 0.85;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -0.28, 0.82);
    } else {
      const dx = this.lockedTargetPos.x - playerPos.x;
      const dz = this.lockedTargetPos.z - playerPos.z;
      const dy = this.lockedTargetPos.y + 1.3 - (playerPos.y + 1.55);
      const horiz = Math.max(0.5, Math.hypot(dx, dz));
      // Yaw = 0 faces -Z, so atan2(-dx, -dz) aligns camera behind player toward locked target
      const desiredYaw = Math.atan2(-dx, -dz);
      let diff = desiredYaw - this.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.yaw += diff * Math.min(1, dt * 9.5);

      const desiredPitch = THREE.MathUtils.clamp(0.24 - Math.atan2(dy, horiz) * 0.45, 0.04, 0.58);
      this.pitch = THREE.MathUtils.lerp(this.pitch, desiredPitch, Math.min(1, dt * 7.0));
    }

    // Focus point with bounded leash toward locked target (keeps player firmly inside frame)
    const targetFocus = new THREE.Vector3(playerPos.x, playerPos.y + 1.58, playerPos.z);
    if (this.lockedTargetPos) {
      const toEnemy = new THREE.Vector3().subVectors(this.lockedTargetPos, playerPos);
      const leashLen = Math.min(toEnemy.length() * 0.28, 3.2);
      if (toEnemy.lengthSq() > 0.01) {
        toEnemy.normalize().multiplyScalar(leashLen);
        targetFocus.add(toEnemy);
        targetFocus.y = THREE.MathUtils.lerp(playerPos.y + 1.58, this.lockedTargetPos.y + 1.35, 0.32);
      }
    }

    const followRate = Math.min(1, dt * 14 * this.handoffBlend);
    this.currentFocus.lerp(targetFocus, followRate);

    const desiredPos = this.computeDesiredCamPos(new THREE.Vector3(playerPos.x, playerPos.y + 1.58, playerPos.z));
    // Clamp camera height above walkable stone stairs/decks so it never clips underground
    const groundAtCam = world.sampleWalkableHeight(desiredPos.x, desiredPos.z, desiredPos.y + 4);
    if (groundAtCam !== null && desiredPos.y < groundAtCam + 0.72) {
      desiredPos.y = groundAtCam + 0.72;
    }

    this.currentCamPos.lerp(desiredPos, Math.min(1, dt * 15 * this.handoffBlend));
    this.camera.position.copy(this.currentCamPos);

    // Apply transient hit/parry/meteor camera shake
    if (this.shakeTimer > 0) {
      this.shakeTimer -= dt;
      const mag = this.shakeIntensity * Math.max(0, this.shakeTimer * 3.5);
      this.camera.position.x += (Math.random() - 0.5) * mag;
      this.camera.position.y += (Math.random() - 0.5) * mag * 0.8;
      if (this.shakeTimer <= 0) this.shakeIntensity = 0;
    }

    this.camera.lookAt(this.currentFocus);
    world.updateCameraOccluders(this.camera.position, playerPos);
  }

  /** Forward & Right unit vectors on XZ plane for camera-relative player movement */
  public getPlanarBasis(): { forward: THREE.Vector3; right: THREE.Vector3 } {
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).normalize();
    return { forward, right };
  }
}
