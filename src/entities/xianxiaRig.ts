import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import { gameAssets, mergeRedundantVrmSkinnedMeshes, MixamoClipKey, VrmCastKey } from '../assets/assetLoader';
import { retargetMixamoToFbxRig, retargetMixamoToVrm } from './vrmRetarget';
import { tailorXianxiaOutfitOntoVrm } from './xianxiaGarments';
import { getContactShadowTexture } from '../world/proceduralTextures';
import {
  createGolemGreatsword,
  createHouyiBow,
  createSectSword,
  createSpiritWingSwordMesh,
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

interface MocapMapping {
  key: MixamoClipKey;
  startFrac?: number;
  endFrac?: number;
  warp?: 'linear' | 'delayedSlam' | 'fastSnap';
}

const MOCAP_CLIP_MAP: Partial<Record<ActionClipName, MocapMapping>> = {
  light1: { key: 'slash', startFrac: 0.05, endFrac: 0.92, warp: 'fastSnap' },
  light2: { key: 'crouch_slash', startFrac: 0.08, endFrac: 0.92, warp: 'fastSnap' },
  light3: { key: 'jump_hit', startFrac: 0.12, endFrac: 0.95, warp: 'fastSnap' },
  heavy: { key: 'jump_hit', startFrac: 0.0, endFrac: 0.96, warp: 'linear' },
  jumpSlash: { key: 'jump_hit', startFrac: 0.08, endFrac: 0.96, warp: 'fastSnap' },
  dodge: { key: 'jump', startFrac: 0.12, endFrac: 0.88, warp: 'linear' },
  guardCounter: { key: 'crouch_slash', startFrac: 0.05, endFrac: 0.95, warp: 'fastSnap' },
  skill_rush: { key: 'crouch_slash', startFrac: 0.0, endFrac: 0.96, warp: 'fastSnap' },
  riposte: { key: 'slash', startFrac: 0.0, endFrac: 0.98, warp: 'fastSnap' },
  xx_combo1: { key: 'slash', startFrac: 0.04, endFrac: 0.94, warp: 'fastSnap' },
  xx_combo2: { key: 'crouch_slash', startFrac: 0.06, endFrac: 0.94, warp: 'fastSnap' },
  xx_delaySlam: { key: 'jump_hit', startFrac: 0.0, endFrac: 0.96, warp: 'delayedSlam' },
  xx_thrust: { key: 'slash', startFrac: 0.12, endFrac: 0.92, warp: 'fastSnap' },
  xx_palm: { key: 'kick', startFrac: 0.05, endFrac: 0.92, warp: 'fastSnap' },
  xx_dance: { key: 'crouch_slash', startFrac: 0.0, endFrac: 0.98, warp: 'linear' },
  xx_meteor: { key: 'jump_hit', startFrac: 0.0, endFrac: 0.98, warp: 'delayedSlam' },
};

function mapWarpedProgress(p: number, warp: MocapMapping['warp']): number {
  const x = THREE.MathUtils.clamp(p, 0, 1);
  if (warp === 'delayedSlam') {
    if (x < 0.55) return (x / 0.55) * 0.34;
    if (x < 0.80) return 0.34 + ((x - 0.55) / 0.25) * 0.52;
    return 0.86 + ((x - 0.80) / 0.20) * 0.14;
  }
  if (warp === 'fastSnap') {
    return Math.pow(x, 0.85);
  }
  return x;
}

export class XianxiaCharacterRig {
  public archetype: ArchetypeId;
  public root: THREE.Group;

  public vrm: VRM | null = null;
  public mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<MixamoClipKey, THREE.AnimationAction>();
  private clipDurations = new Map<MixamoClipKey, number>();

  public weapon: WeaponRig | null = null;
  public offhandWeapon: WeaponRig | null = null;
  public houyiBow: { group: THREE.Group; arrowMesh: THREE.Group } | null = null;
  public potionProp: THREE.Group | null = null;
  public demonSwordWings: THREE.Group | null = null;
  public spiritOrbitSwords: THREE.Group | null = null;
  private headbandRibbons: THREE.Group[] = [];

  private rHandSocket: THREE.Object3D | null = null;
  private lHandSocket: THREE.Object3D | null = null;
  private chestSocket: THREE.Object3D | null = null;
  private hipsSocket: THREE.Object3D | null = null;
  private headSocket: THREE.Object3D | null = null;

  public activeClip: ActionClipName = 'none';
  public clipProgress = 0;
  public isBlocking = false;
  public isChargingHeavy = false;
  public demonWingOpen = 0;

  private idleClock = Math.random() * 10;
  private blinkTimer = 1.5 + Math.random() * 3.0;
  private flashTimer = 0;
  private hitFlashShell: THREE.PointLight | null = null;

  constructor(archetype: ArchetypeId) {
    this.archetype = archetype;
    this.root = new THREE.Group();

    const shadowRadius = archetype === 'golem' ? 1.35 : 0.62;
    const contactShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(shadowRadius * 2, shadowRadius * 2),
      new THREE.MeshBasicMaterial({
        map: getContactShadowTexture(),
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
      })
    );
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = 0.025;
    this.root.add(contactShadow);

    if (archetype === 'golem') {
      this.buildGolemFbxRig();
    } else {
      this.buildVrmAnimeRig(archetype);
    }
    this.updateAnimation(0.016, 0, true);
  }

  private getVrmCastKey(arch: Exclude<ArchetypeId, 'golem'>): VrmCastKey {
    if (arch === 'cultivator') return 'disciple';
    return arch;
  }

  private buildVrmAnimeRig(arch: Exclude<ArchetypeId, 'golem'>) {
    const vrm = gameAssets.takeVrm(this.getVrmCastKey(arch));
    this.vrm = vrm;

    const scales: Record<Exclude<ArchetypeId, 'golem'>, number> = {
      tianhe: 1.04,
      xuanxiao: 1.15,
      disciple: 1.02,
      cultivator: 1.03,
      lingsha: 0.99,
      mengli: 1.02,
    };
    this.root.scale.setScalar(scales[arch]);
    this.root.add(vrm.scene);

    // Tailor Full-Body Multi-Bone GPU-Skinned Ancient Xianxia Robes & Boots directly onto VRM skeleton!
    if (arch !== 'lingsha') {
      tailorXianxiaOutfitOntoVrm(vrm, arch);
    }

    this.rHandSocket = vrm.humanoid?.getRawBoneNode('rightHand') ?? null;
    this.lHandSocket = vrm.humanoid?.getRawBoneNode('leftHand') ?? null;
    this.chestSocket =
      vrm.humanoid?.getRawBoneNode('upperChest') ?? vrm.humanoid?.getRawBoneNode('chest') ?? null;
    this.hipsSocket = vrm.humanoid?.getRawBoneNode('hips') ?? null;
    this.headSocket = vrm.humanoid?.getRawBoneNode('head') ?? null;

    if (arch === 'lingsha' || arch === 'mengli') {
      const spiritRing = new THREE.Mesh(
        new THREE.RingGeometry(0.42, 0.56, 32),
        new THREE.MeshBasicMaterial({
          color: arch === 'lingsha' ? new THREE.Color(1.85, 0.50, 0.65) : new THREE.Color(0.80, 1.30, 2.15),
          transparent: true,
          opacity: 0.62,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      spiritRing.rotation.x = -Math.PI / 2;
      spiritRing.position.y = 0.035;
      this.root.add(spiritRing);
    }

    this.mixer = new THREE.AnimationMixer(vrm.scene);
    for (const [key, fbxSrc] of gameAssets.mixamoSources.entries()) {
      const clip = retargetMixamoToVrm(fbxSrc, vrm, key);
      if (clip) {
        const act = this.mixer.clipAction(clip);
        act.enabled = true;
        act.setEffectiveWeight(key === 'idle' ? 1 : 0);
        act.play();
        this.actions.set(key, act);
        this.clipDurations.set(key, Math.max(0.01, clip.duration));
      }
    }

    this.attachVrmOrnamentsAndWeapons(arch);
  }

  private attachVrmWeaponToHand(handSocket: THREE.Object3D | null, w: WeaponRig, isLeft = false) {
    if (!handSocket) return;
    const sideSign = isLeft ? -1 : 1;
    w.group.position.set(sideSign * 0.065, -0.028, -0.025);
    w.group.rotation.set(-Math.PI * 0.48, 0, sideSign * 0.08);
    handSocket.add(w.group);
  }

  private attachVrmOrnamentsAndWeapons(arch: Exclude<ArchetypeId, 'golem'>) {
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xe6be68,
      roughness: 0.22,
      metalness: 0.88,
    });

    if (arch === 'tianhe') {
      // 1. Woven Crimson Silk Headband (`织金赤红抹额`) + Multi-Segment Ribbons
      if (this.headSocket) {
        const bandMat = new THREE.MeshStandardMaterial({
          color: 0xc82222,
          roughness: 0.52,
          side: THREE.DoubleSide,
        });
        const band = new THREE.Mesh(
          new THREE.CylinderGeometry(0.098, 0.101, 0.020, 20, 1, true),
          bandMat
        );
        band.position.set(0, 0.075, -0.005);
        this.headSocket.add(band);

        for (const side of [-1, 1]) {
          const tailPivot = new THREE.Group();
          tailPivot.position.set(side * 0.028, 0.072, 0.095);
          const curve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(side * 0.015, -0.14, 0.03),
            new THREE.Vector3(side * 0.035, -0.32, 0.07),
          ]);
          const ribbon = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.011, 6, false), bandMat);
          ribbon.scale.set(1.6, 1.0, 0.35);
          tailPivot.add(ribbon);
          this.headSocket.add(tailPivot);
          this.headbandRibbons.push(tailPivot);
        }
      }

      // 2. Waist Scabbard (`scabbard.glb`) + Houyi Sun-Shooting Bow on Back (`+Z` in VRM0!)
      if (this.hipsSocket && gameAssets.weaponModels?.scabbard) {
        const scabbard = gameAssets.weaponModels.scabbard.clone(true);
        scabbard.scale.setScalar(0.95);
        scabbard.position.set(-0.14, -0.04, 0.03);
        scabbard.rotation.set(0.35, Math.PI, -0.22);
        this.hipsSocket.add(scabbard);
      }

      if (this.chestSocket) {
        this.houyiBow = createHouyiBow();
        this.houyiBow.group.position.set(0.0, 0.05, 0.165);
        this.houyiBow.group.rotation.set(0, Math.PI * 0.5, 0.58);
        this.chestSocket.add(this.houyiBow.group);
      }

      if (this.lHandSocket && gameAssets.weaponModels?.potion) {
        this.potionProp = gameAssets.weaponModels.potion.clone(true);
        this.potionProp.scale.setScalar(1.12);
        this.potionProp.position.set(-0.06, -0.04, -0.03);
        this.potionProp.visible = false;
        this.lHandSocket.add(this.potionProp);
      }

      const wangshu = createWangshuSword();
      this.weapon = wangshu;
      this.attachVrmWeaponToHand(this.rHandSocket, wangshu, false);
    } else if (arch === 'xuanxiao') {
      // 1. Sculpted Filigree Golden Lotus Crown (`紫金莲华道冠`)
      if (this.headSocket) {
        const crown = new THREE.Group();
        crown.position.set(0, 0.135, 0.012);
        const baseRing = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.008, 8, 18), goldMat);
        baseRing.rotation.x = Math.PI / 2;
        crown.add(baseRing);

        const lotus = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.038, 0.065, 8, 1, true), goldMat);
        lotus.position.y = 0.032;
        crown.add(lotus);

        const hairpin = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.19, 8), goldMat);
        hairpin.rotation.z = Math.PI / 2;
        hairpin.position.y = 0.035;
        crown.add(hairpin);
        this.headSocket.add(crown);
      }

      // 2. Sculpted 9-Blade Levitating Solar-Crystal Demon Sword Wings (`焚天九剑翼`)
      if (this.chestSocket) {
        const wings = new THREE.Group();
        wings.position.set(0, 0.12, 0.21);
        for (let i = 0; i < 9; i++) {
          const frac = (i - 4) / 4;
          const ang = frac * 1.18;
          const holder = new THREE.Group();
          holder.position.set(Math.sin(ang) * 0.44, Math.cos(ang) * 0.32, Math.abs(frac) * 0.08);
          holder.rotation.z = -ang;
          const wingSword = createSpiritWingSwordMesh();
          holder.add(wingSword);
          wings.add(holder);
        }
        wings.visible = false;
        this.chestSocket.add(wings);
        this.demonSwordWings = wings;
      }

      const xihe = createXiheSword();
      this.weapon = xihe;
      this.attachVrmWeaponToHand(this.rHandSocket, xihe, false);
    } else if (arch === 'disciple' || arch === 'cultivator') {
      // Sculpted White-Jade Daoist Topknot Crown (`白玉莲冠`) + Hip Scabbard
      if (this.headSocket) {
        const jadeMat = new THREE.MeshStandardMaterial({
          color: 0xd8f2ff,
          roughness: 0.22,
          metalness: 0.45,
        });
        const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.036, 0.062, 10), jadeMat);
        crown.position.set(0, 0.135, 0.012);
        this.headSocket.add(crown);

        const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.16, 6), jadeMat);
        pin.rotation.z = Math.PI / 2;
        pin.position.set(0, 0.14, 0.012);
        this.headSocket.add(pin);
      }

      if (this.hipsSocket && gameAssets.weaponModels?.scabbard) {
        const scabbard = gameAssets.weaponModels.scabbard.clone(true);
        scabbard.scale.setScalar(0.92);
        scabbard.position.set(-0.14, -0.03, 0.03);
        scabbard.rotation.set(0.35, Math.PI, -0.20);
        this.hipsSocket.add(scabbard);
      }

      const sectSword = createSectSword();
      this.weapon = sectSword;
      this.attachVrmWeaponToHand(this.rHandSocket, sectSword, false);

      if (arch === 'cultivator' && this.chestSocket) {
        const orbit = new THREE.Group();
        orbit.position.set(0, 0.16, 0.22);
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2;
          const sb = createSectSword().group;
          sb.scale.setScalar(0.72);
          sb.position.set(Math.cos(a) * 0.48, Math.sin(a) * 0.48, 0);
          sb.rotation.z = a - Math.PI / 2;
          orbit.add(sb);
        }
        this.chestSocket.add(orbit);
        this.spiritOrbitSwords = orbit;
      }
    } else if (arch === 'lingsha') {
      const daggerR = createSectSword();
      daggerR.group.scale.set(0.85, 0.62, 0.85);
      this.weapon = daggerR;
      this.attachVrmWeaponToHand(this.rHandSocket, daggerR, false);

      const daggerL = createSectSword();
      daggerL.group.scale.set(0.85, 0.62, 0.85);
      this.offhandWeapon = daggerL;
      this.attachVrmWeaponToHand(this.lHandSocket, daggerL, true);
    } else if (arch === 'mengli') {
      if (this.chestSocket) {
        const harp = new THREE.Group();
        const harpMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.05, 1.55, 2.35) });
        const frame = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.015, 10, 28, Math.PI * 1.5), harpMat);
        harp.add(frame);
        for (let s = -3; s <= 3; s++) {
          const str = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.38, 4), harpMat);
          str.position.x = s * 0.042;
          harp.add(str);
        }
        harp.position.set(-0.48, 0.04, -0.05);
        this.chestSocket.add(harp);
      }
    }
  }

  private buildGolemFbxRig() {
    const model = SkeletonUtils.clone(gameAssets.guardianFbxTemplate) as THREE.Group;
    model.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(model);
    const rawHeight = Math.max(0.01, box.max.y - box.min.y);
    const targetHeight = 3.15;
    const fbxScale = targetHeight / rawHeight;
    model.scale.setScalar(fbxScale);
    model.position.y = -box.min.y * fbxScale;

    const normKey = (s: string) =>
      String(s ?? '')
        .replace(/(\.\d{3}|\s*\(\d+\))$/, '')
        .toLowerCase()
        .replace(/^(?:material|mat)|(?:material|mat)$/g, '')
        .replace(/[^a-z0-9]/g, '');

    // Assign shared authored PBR armor materials directly (zero per-mesh texture/material cloning!)
    model.traverse((node) => {
      if ((node as THREE.Mesh).isMesh) {
        const mesh = node as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;

        const meshKey = normKey(mesh.name);
        const origMats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const newMats = origMats.map((om) => {
          const key = normKey(om?.name ?? '');
          return (
            gameAssets.guardianMaterials.get(key) ??
            gameAssets.guardianMaterials.get(meshKey) ??
            gameAssets.guardianDefaultMat ??
            new THREE.MeshStandardMaterial({ color: 0x4c6678, metalness: 0.75, roughness: 0.32 })
          );
        });
        mesh.material = Array.isArray(mesh.material) ? newMats : newMats[0];
      }
    });

    mergeRedundantVrmSkinnedMeshes(model);
    this.root.add(model);

    let rightHandBone: THREE.Object3D | null = null;
    let chestBone: THREE.Object3D | null = null;
    model.traverse((obj) => {
      if (/RightHand$/i.test(obj.name)) rightHandBone = obj;
      if (/Spine2$/i.test(obj.name)) chestBone = obj;
    });

    if (chestBone) {
      const coreHalo = new THREE.Mesh(
        new THREE.TorusGeometry(0.45 / fbxScale, 0.032 / fbxScale, 8, 24),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(0.45, 1.75, 2.35) })
      );
      coreHalo.position.set(0, 0.08 / fbxScale, -0.22 / fbxScale);
      (chestBone as THREE.Object3D).add(coreHalo);
    }

    const greatsword = createGolemGreatsword();
    this.weapon = greatsword;
    if (rightHandBone) {
      greatsword.group.scale.setScalar(0.84 / fbxScale);
      greatsword.group.position.set(-0.04 / fbxScale, 0.09 / fbxScale, 0.04 / fbxScale);
      greatsword.group.rotation.set(Math.PI * 0.52, 0, -Math.PI * 0.45);
      (rightHandBone as THREE.Object3D).add(greatsword.group);
    } else {
      this.root.add(greatsword.group);
    }

    this.mixer = new THREE.AnimationMixer(model);
    for (const [key, fbxSrc] of gameAssets.mixamoSources.entries()) {
      const clip = retargetMixamoToFbxRig(fbxSrc, model, key);
      if (clip) {
        const act = this.mixer.clipAction(clip);
        act.enabled = true;
        act.setEffectiveWeight(key === 'idle' ? 1 : 0);
        act.play();
        this.actions.set(key, act);
        this.clipDurations.set(key, Math.max(0.01, clip.duration));
      }
    }
  }

  public flashHit(duration = 0.12) {
    this.flashTimer = duration;
    if (!this.hitFlashShell) {
      this.hitFlashShell = new THREE.PointLight(0xffffff, 0, 3.8, 2.0);
      this.hitFlashShell.position.set(0, 1.25, 0.35);
      this.root.add(this.hitFlashShell);
    }
    this.hitFlashShell.intensity = 3.2;
  }

  public setDemonWings(openAmount: number) {
    this.demonWingOpen = THREE.MathUtils.clamp(openAmount, 0, 1);
    if (this.demonSwordWings) {
      this.demonSwordWings.visible = this.demonWingOpen > 0.01;
      const s = THREE.MathUtils.lerp(0.01, 1.0, this.demonWingOpen);
      this.demonSwordWings.scale.setScalar(s);
    }
  }

  private setVrmBoneEuler(bone: VRMHumanBoneName, rx: number, ry: number, rz: number, blend = 1.0) {
    const node = this.vrm?.humanoid?.getNormalizedBoneNode(bone);
    if (!node) return;
    if (blend >= 0.999) {
      node.rotation.set(rx, ry, rz);
    } else {
      const targetQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
      node.quaternion.slerp(targetQ, blend);
    }
  }

  public updateAnimation(dt: number, planarSpeed: number, inCombat = true, _strafeDir = 0) {
    this.idleClock += dt;
    const t = this.idleClock;

    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0 && this.hitFlashShell) {
        this.hitFlashShell.intensity = 0;
      }
    }

    // Equipment Socket Switching (Houyi Bow & Crimson/Cerulean Potion Gourd!)
    if (this.houyiBow && this.lHandSocket && this.chestSocket) {
      if (this.activeClip === 'skill_bow' && this.clipProgress < 0.88) {
        if (this.houyiBow.group.parent !== this.lHandSocket) {
          this.lHandSocket.add(this.houyiBow.group);
          this.houyiBow.group.position.set(-0.06, -0.03, -0.02);
          this.houyiBow.group.rotation.set(0, Math.PI, Math.PI * 0.5);
        }
        this.houyiBow.arrowMesh.visible = this.clipProgress < 0.72;
        if (this.weapon) this.weapon.group.visible = false;
      } else {
        if (this.houyiBow.group.parent !== this.chestSocket) {
          this.chestSocket.add(this.houyiBow.group);
          this.houyiBow.group.position.set(0.0, 0.05, 0.165);
          this.houyiBow.group.rotation.set(0, Math.PI * 0.5, 0.58);
        }
        this.houyiBow.arrowMesh.visible = false;
        if (this.weapon) this.weapon.group.visible = true;
      }
    }

    if (this.potionProp) {
      this.potionProp.visible = this.activeClip === 'drink' && this.clipProgress < 0.85;
    }

    if (this.spiritOrbitSwords) {
      this.spiritOrbitSwords.rotation.z += dt * 1.85;
    }

    for (let i = 0; i < this.headbandRibbons.length; i++) {
      const r = this.headbandRibbons[i];
      r.rotation.x = 0.12 + Math.min(0.55, planarSpeed * 0.07) + Math.sin(t * 4.2 + i) * 0.12;
      r.rotation.z = (i === 0 ? -0.10 : 0.10) + Math.cos(t * 3.0 + i) * 0.08;
    }

    // Drive Real Mixamo AnimationMixer Weights & Scrubbed Combat Clips!
    if (this.mixer) {
      for (const act of this.actions.values()) {
        act.setEffectiveWeight(0);
      }

      const mocapSpec = this.activeClip !== 'none' ? MOCAP_CLIP_MAP[this.activeClip] : undefined;

      if (mocapSpec && this.actions.has(mocapSpec.key)) {
        const act = this.actions.get(mocapSpec.key)!;
        const dur = this.clipDurations.get(mocapSpec.key) ?? 1.0;
        const sFrac = mocapSpec.startFrac ?? 0;
        const eFrac = mocapSpec.endFrac ?? 1;
        const warped = mapWarpedProgress(this.clipProgress, mocapSpec.warp);
        act.setEffectiveWeight(1.0);
        act.paused = false;
        act.time = THREE.MathUtils.lerp(sFrac, eFrac, warped) * dur;
        this.mixer.update(0);
      } else {
        const idleAct = this.actions.get('idle');
        const walkAct = this.actions.get('walk');
        const runKey: MixamoClipKey = this.actions.has('sword_run') ? 'sword_run' : 'run';
        const runAct = this.actions.get(runKey);
        const floatAct = this.actions.get('floating');

        if (this.archetype === 'mengli' && floatAct) {
          floatAct.setEffectiveWeight(1.0);
        } else if (planarSpeed < 0.25) {
          idleAct?.setEffectiveWeight(1.0);
        } else if (planarSpeed < 4.8) {
          const w = THREE.MathUtils.clamp((planarSpeed - 0.25) / 4.2, 0, 1);
          idleAct?.setEffectiveWeight(1 - w);
          walkAct?.setEffectiveWeight(w);
        } else {
          const w = THREE.MathUtils.clamp((planarSpeed - 4.8) / 3.4, 0, 1);
          walkAct?.setEffectiveWeight(1 - w);
          runAct?.setEffectiveWeight(w);
        }
        this.mixer.update(dt);
      }
    }

    if (this.vrm) {
      const p = THREE.MathUtils.clamp(this.clipProgress, 0, 1);

      if (this.activeClip === 'none') {
        if (this.isBlocking) {
          this.setVrmBoneEuler('spine', -0.10, 0.24, 0, 0.85);
          this.setVrmBoneEuler('chest', -0.12, 0.30, 0, 0.85);
          this.setVrmBoneEuler('rightUpperArm', 0.45, 0.68, -0.45, 0.92);
          this.setVrmBoneEuler('rightLowerArm', 0.0, 1.15, 0.35, 0.92);
          this.setVrmBoneEuler('leftUpperArm', 0.38, -0.62, 0.52, 0.88);
          this.setVrmBoneEuler('leftLowerArm', 0.0, -1.05, -0.25, 0.88);
        } else if (this.isChargingHeavy) {
          const tremble = Math.sin(t * 34) * 0.025;
          this.setVrmBoneEuler('spine', 0.14, -0.22, 0, 0.9);
          this.setVrmBoneEuler('chest', 0.18, -0.28, 0, 0.9);
          this.setVrmBoneEuler('rightUpperArm', 0.25, 0.35, 1.18 + tremble, 0.95);
          this.setVrmBoneEuler('rightLowerArm', 0.0, 0.72, 0, 0.95);
          this.setVrmBoneEuler('leftUpperArm', 0.22, -0.42, -1.05, 0.9);
          this.setVrmBoneEuler('leftLowerArm', 0.0, -0.68, 0, 0.9);
        } else if (inCombat && planarSpeed < 0.35) {
          this.setVrmBoneEuler('rightUpperArm', 0.15, 0.28, -0.95, 0.55);
          this.setVrmBoneEuler('rightLowerArm', 0.0, 0.52, 0.0, 0.55);
        }
      } else if (this.activeClip === 'parry') {
        const sweep = Math.sin(p * Math.PI);
        this.setVrmBoneEuler('chest', -0.08, -0.48 * sweep, 0, 0.95);
        this.setVrmBoneEuler('rightUpperArm', 0.35, 0.95 - 1.55 * sweep, -0.25, 0.95);
        this.setVrmBoneEuler('rightLowerArm', 0, 0.85 * (1 - sweep * 0.6), 0, 0.95);
      } else if (this.activeClip === 'skill_bow') {
        const draw = p < 0.68 ? THREE.MathUtils.smoothstep(p, 0, 0.28) : 1 - (p - 0.68) / 0.32;
        this.setVrmBoneEuler('hips', 0, 1.05 * draw, 0, 0.92);
        this.setVrmBoneEuler('chest', 0, -0.58 * draw, 0, 0.92);
        this.setVrmBoneEuler('head', 0, -0.35 * draw, 0, 0.92);
        this.setVrmBoneEuler('leftUpperArm', 0, -0.32 * draw, 0.05, 0.95);
        this.setVrmBoneEuler('leftLowerArm', 0, -0.08, 0, 0.95);
        this.setVrmBoneEuler('rightUpperArm', 0, 0.35 * draw, 0.12, 0.95);
        this.setVrmBoneEuler('rightLowerArm', 0, 1.85 * draw, 0, 0.95);
      } else if (this.activeClip === 'drink') {
        const sip = Math.sin(Math.min(1, p * 1.2) * Math.PI);
        this.setVrmBoneEuler('head', 0.35 * sip, 0, 0, 0.9);
        this.setVrmBoneEuler('leftUpperArm', 0.45 * sip, -0.78 * sip, 0.25, 0.95);
        this.setVrmBoneEuler('leftLowerArm', 0, -1.65 * sip, -0.35 * sip, 0.95);
      } else if (this.activeClip === 'hurt') {
        const flinch = Math.sin(p * Math.PI);
        this.setVrmBoneEuler('spine', 0.28 * flinch, 0.15 * flinch, 0, 0.9);
        this.setVrmBoneEuler('head', 0.32 * flinch, 0, 0, 0.9);
      } else if (this.activeClip === 'staggerKneel') {
        const k = Math.min(1, p / 0.2);
        const hipsNode = this.vrm.humanoid?.getNormalizedBoneNode('hips');
        if (hipsNode) hipsNode.position.y -= 0.38 * k;
        this.setVrmBoneEuler('spine', -0.28 * k, 0, 0, 0.95);
        this.setVrmBoneEuler('head', -0.38 * k, 0, 0, 0.95);
        this.setVrmBoneEuler('leftUpperLeg', 1.18 * k, 0, 0, 0.95);
        this.setVrmBoneEuler('leftLowerLeg', -1.52 * k, 0, 0, 0.95);
        this.setVrmBoneEuler('rightUpperLeg', -0.18 * k, 0, 0, 0.95);
        this.setVrmBoneEuler('rightLowerLeg', -1.58 * k, 0, 0, 0.95);
      } else if (this.activeClip === 'xx_swordRain' || this.activeClip === 'xx_roar') {
        const roar = Math.sin(Math.min(1, p * 1.15) * Math.PI);
        this.setVrmBoneEuler('spine', 0.24 * roar, 0, 0, 0.95);
        this.setVrmBoneEuler('chest', 0.32 * roar, 0, 0, 0.95);
        this.setVrmBoneEuler('head', 0.42 * roar, 0, 0, 0.95);
        this.setVrmBoneEuler('rightUpperArm', 0, 0.25, 0.85 * roar, 0.95);
        this.setVrmBoneEuler('leftUpperArm', 0, -0.25, -0.85 * roar, 0.95);
      } else if (this.activeClip === 'death') {
        const fall = THREE.MathUtils.smoothstep(p, 0, 0.78);
        const hipsNode = this.vrm.humanoid?.getNormalizedBoneNode('hips');
        if (hipsNode) hipsNode.position.y -= 0.78 * fall;
        this.setVrmBoneEuler('hips', 1.38 * fall, 0.12 * fall, 0, 0.98);
        this.setVrmBoneEuler('rightUpperArm', 0, 0, -0.85 * fall, 0.95);
        this.setVrmBoneEuler('leftUpperArm', 0, 0, 0.85 * fall, 0.95);
      }

      const expr = this.vrm.expressionManager;
      if (expr) {
        this.blinkTimer -= dt;
        let blinkVal = 0;
        if (this.blinkTimer <= 0) {
          const blinkPhase = -this.blinkTimer / 0.14;
          if (blinkPhase < 1.0) {
            blinkVal = Math.sin(blinkPhase * Math.PI);
          } else {
            this.blinkTimer = 2.6 + Math.random() * 3.2;
          }
        }
        expr.setValue('blink', blinkVal);

        const fierce =
          this.activeClip !== 'none' &&
          this.activeClip !== 'drink' &&
          this.activeClip !== 'death'
            ? 0.85
            : this.demonWingOpen > 0.3
              ? 0.65
              : 0;
        expr.setValue('angry', fierce);
        expr.setValue('aa', this.activeClip === 'xx_roar' ? 0.85 : fierce * 0.25);
      }

      this.vrm.update(dt);
    }
  }
}
