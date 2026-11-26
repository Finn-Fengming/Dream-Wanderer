import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import {
  gameAssets,
  mergeRedundantVrmSkinnedMeshes,
  MixamoClipKey,
  VrmCastKey,
} from '../assets/assetLoader';
import {
  retargetMixamoToFbxRig,
  retargetMixamoToVrm,
  retargetUalClipToVrm,
  UalClipKey,
} from './vrmRetarget';
import {
  attachLingshaMartialOrnaments,
  tailorXianxiaOutfitOntoVrm,
} from './xianxiaGarments';
import { CharacterFootIK, FootIkBones } from './ikSolver';
import { snowFootprints } from '../world/surfaceMaterials';
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
  key: string;
  fallbackKey?: string;
  startFrac?: number;
  endFrac?: number;
  warp?: 'linear' | 'delayedSlam' | 'fivePhaseSlash' | 'fastSnap';
}

const MOCAP_CLIP_MAP: Partial<Record<ActionClipName, MocapMapping>> = {
  light1: { key: 'ual_Sword_Attack', fallbackKey: 'slash', startFrac: 0.04, endFrac: 0.92, warp: 'fivePhaseSlash' },
  light2: { key: 'crouch_slash', fallbackKey: 'slash', startFrac: 0.06, endFrac: 0.92, warp: 'fivePhaseSlash' },
  light3: { key: 'slash', fallbackKey: 'jump_hit', startFrac: 0.04, endFrac: 0.96, warp: 'fivePhaseSlash' },
  heavy: { key: 'jump_hit', startFrac: 0.02, endFrac: 0.96, warp: 'fivePhaseSlash' },
  jumpSlash: { key: 'jump_hit', startFrac: 0.10, endFrac: 0.96, warp: 'fastSnap' },
  dodge: { key: 'ual_Roll', fallbackKey: 'jump', startFrac: 0.04, endFrac: 0.94, warp: 'linear' },
  guardCounter: { key: 'ual_Sword_Attack', fallbackKey: 'crouch_slash', startFrac: 0.06, endFrac: 0.96, warp: 'fivePhaseSlash' },
  skill_rush: { key: 'crouch_slash', startFrac: 0.02, endFrac: 0.96, warp: 'fivePhaseSlash' },
  riposte: { key: 'slash', startFrac: 0.02, endFrac: 0.98, warp: 'fivePhaseSlash' },
  hurt: { key: 'ual_Hit_Chest', fallbackKey: 'idle', startFrac: 0.05, endFrac: 0.92, warp: 'fastSnap' },
  staggerKneel: { key: 'ual_Fixing_Kneeling', fallbackKey: 'crouch', startFrac: 0.0, endFrac: 0.45, warp: 'linear' },
  death: { key: 'ual_Death01', fallbackKey: 'crouch', startFrac: 0.0, endFrac: 0.98, warp: 'linear' },
  xx_combo1: { key: 'ual_Sword_Attack', fallbackKey: 'slash', startFrac: 0.04, endFrac: 0.94, warp: 'fivePhaseSlash' },
  xx_combo2: { key: 'crouch_slash', startFrac: 0.06, endFrac: 0.94, warp: 'fivePhaseSlash' },
  xx_delaySlam: { key: 'jump_hit', startFrac: 0.0, endFrac: 0.96, warp: 'delayedSlam' },
  xx_thrust: { key: 'slash', startFrac: 0.10, endFrac: 0.92, warp: 'fivePhaseSlash' },
  xx_palm: { key: 'kick', startFrac: 0.05, endFrac: 0.92, warp: 'fastSnap' },
  xx_swordRain: { key: 'ual_Spell_Simple_Shoot', fallbackKey: 'idle', startFrac: 0.04, endFrac: 0.95, warp: 'linear' },
  xx_roar: { key: 'ual_Spell_Simple_Shoot', fallbackKey: 'idle', startFrac: 0.0, endFrac: 0.88, warp: 'linear' },
  xx_dance: { key: 'crouch_slash', startFrac: 0.0, endFrac: 0.98, warp: 'linear' },
  xx_meteor: { key: 'jump_hit', startFrac: 0.0, endFrac: 0.98, warp: 'delayedSlam' },
};

const UAL_CLIPS_TO_LOAD: UalClipKey[] = [
  'Idle_Loop',
  'Sword_Idle',
  'Walk_Loop',
  'Walk_Formal_Loop',
  'Jog_Fwd_Loop',
  'Sprint_Loop',
  'Roll',
  'Sword_Attack',
  'Spell_Simple_Shoot',
  'Hit_Chest',
  'Hit_Head',
  'Fixing_Kneeling',
  'Death01',
];

/**
 * 5-Phase Martial Sword Motion Warping (`起手蓄力 -> 蓄势停顿 -> 四次方爆发斩击 -> 过冲 -> 惯性收剑`)!
 * Eliminates floaty linear mocap scrubbing so every slash has real crisp snap and physical weight!
 */
function mapWarpedProgress(p: number, warp: MocapMapping['warp']): number {
  const x = THREE.MathUtils.clamp(p, 0, 1);
  if (warp === 'fivePhaseSlash') {
    if (x < 0.20) {
      // Phase 1: Smooth windup coil
      return THREE.MathUtils.smoothstep(x, 0.0, 0.20) * 0.20;
    }
    if (x < 0.27) {
      // Phase 2: Subtle 70ms martial poise hold right before release!
      return 0.20 + ((x - 0.20) / 0.07) * 0.03;
    }
    if (x < 0.56) {
      // Phase 3: Explosive quartic strike acceleration through hit window!
      const u = (x - 0.27) / 0.29;
      const snap = 1.0 - Math.pow(1.0 - u, 3.2);
      return 0.23 + snap * 0.57;
    }
    // Phase 4 & 5: Follow-through settle & recovery
    return 0.80 + ((x - 0.56) / 0.44) * 0.20;
  }
  if (warp === 'delayedSlam') {
    if (x < 0.55) return (x / 0.55) * 0.32;
    if (x < 0.78) {
      const u = (x - 0.55) / 0.23;
      return 0.32 + (1.0 - Math.pow(1.0 - u, 3.0)) * 0.54;
    }
    return 0.86 + ((x - 0.78) / 0.22) * 0.14;
  }
  if (warp === 'fastSnap') {
    return Math.pow(x, 0.82);
  }
  return x;
}

export class XianxiaCharacterRig {
  public archetype: ArchetypeId;
  public root: THREE.Group;

  public vrm: VRM | null = null;
  public mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private clipDurations = new Map<string, number>();
  private currentWeights = new Map<string, number>();

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
  private weaponSheathed = false;
  private combatHoldTimer = 4.0;

  private footIk = new CharacterFootIK();
  private footIkBones: FootIkBones | null = null;
  private _leftFootW = new THREE.Vector3();
  private _rightFootW = new THREE.Vector3();

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

    const shadowRadius = archetype === 'golem' ? 1.38 : 0.62;
    const contactShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(shadowRadius * 2, shadowRadius * 2),
      new THREE.MeshBasicMaterial({
        map: getContactShadowTexture(),
        transparent: true,
        opacity: 0.74,
        depthWrite: false,
      })
    );
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = 0.02;
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

  private registerAction(key: string, clip: THREE.AnimationClip, initialWeight = 0) {
    if (!this.mixer) return;
    const act = this.mixer.clipAction(clip);
    act.enabled = true;
    act.setEffectiveWeight(initialWeight);
    act.play();
    this.actions.set(key, act);
    this.clipDurations.set(key, Math.max(0.01, clip.duration));
    this.currentWeights.set(key, initialWeight);
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

    // Tailor Multi-Layered 2K Silk Brocade & 3D Shanwen Armor Onto VRM Skeleton!
    if (arch === 'lingsha') {
      attachLingshaMartialOrnaments(vrm);
    } else {
      tailorXianxiaOutfitOntoVrm(vrm, arch);
    }

    this.rHandSocket = vrm.humanoid?.getRawBoneNode('rightHand') ?? null;
    this.lHandSocket = vrm.humanoid?.getRawBoneNode('leftHand') ?? null;
    this.chestSocket =
      vrm.humanoid?.getRawBoneNode('upperChest') ?? vrm.humanoid?.getRawBoneNode('chest') ?? null;
    this.hipsSocket = vrm.humanoid?.getRawBoneNode('hips') ?? null;
    this.headSocket = vrm.humanoid?.getRawBoneNode('head') ?? null;

    // Bind-pose Foot IK bone references & exact sole heights
    vrm.scene.updateMatrixWorld(true);
    const rawHips = vrm.humanoid?.getRawBoneNode('hips');
    const rawLUp = vrm.humanoid?.getRawBoneNode('leftUpperLeg');
    const rawLLow = vrm.humanoid?.getRawBoneNode('leftLowerLeg');
    const rawLFoot = vrm.humanoid?.getRawBoneNode('leftFoot');
    const rawRUp = vrm.humanoid?.getRawBoneNode('rightUpperLeg');
    const rawRLow = vrm.humanoid?.getRawBoneNode('rightLowerLeg');
    const rawRFoot = vrm.humanoid?.getRawBoneNode('rightFoot');

    if (rawHips && rawLUp && rawLLow && rawLFoot && rawRUp && rawRLow && rawRFoot) {
      const pL = new THREE.Vector3();
      const pR = new THREE.Vector3();
      rawLFoot.getWorldPosition(pL);
      rawRFoot.getWorldPosition(pR);
      const scaleInv = 1 / (scales[arch] || 1);
      this.footIkBones = {
        hips: rawHips,
        leftUpperLeg: rawLUp,
        leftLowerLeg: rawLLow,
        leftFoot: rawLFoot,
        rightUpperLeg: rawRUp,
        rightLowerLeg: rawRLow,
        rightFoot: rawRFoot,
        soleHeightL: Math.max(0.055, pL.y * scaleInv),
        soleHeightR: Math.max(0.055, pR.y * scaleInv),
      };
    }

    if (arch === 'lingsha' || arch === 'mengli') {
      const spiritRing = new THREE.Mesh(
        new THREE.RingGeometry(0.42, 0.56, 32),
        new THREE.MeshBasicMaterial({
          color: arch === 'lingsha' ? new THREE.Color(1.65, 0.45, 0.60) : new THREE.Color(0.72, 1.18, 1.85),
          transparent: true,
          opacity: 0.58,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      spiritRing.rotation.x = -Math.PI / 2;
      spiritRing.position.y = 0.03;
      this.root.add(spiritRing);
    }

    this.mixer = new THREE.AnimationMixer(vrm.scene);

    // 1. Load Mixamo Mocap Suite
    for (const [key, fbxSrc] of gameAssets.mixamoSources.entries()) {
      const clip = retargetMixamoToVrm(fbxSrc, vrm, key);
      if (clip) {
        this.registerAction(key, clip, 0);
      }
    }

    // 2. Load Quaternius 46-Clip RPG Suite (`ual_46_anims.glb`)!
    if (gameAssets.ual46Glb) {
      for (const uKey of UAL_CLIPS_TO_LOAD) {
        const clip = retargetUalClipToVrm(gameAssets.ual46Glb, uKey, vrm, `ual_${uKey}`);
        if (clip) {
          this.registerAction(`ual_${uKey}`, clip, uKey === 'Sword_Idle' ? 1 : 0);
        }
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
    this.weaponSheathed = false;
  }

  private setTianheSwordSheathed(sheathed: boolean) {
    if (this.archetype !== 'tianhe' || !this.weapon || !this.rHandSocket || !this.chestSocket) return;
    if (sheathed === this.weaponSheathed) return;
    this.weaponSheathed = sheathed;
    if (sheathed) {
      // Mount Wangshu Sword diagonally across back (+Z in VRM0) alongside Houyi Bow!
      this.chestSocket.add(this.weapon.group);
      this.weapon.group.position.set(-0.14, 0.28, 0.135);
      this.weapon.group.rotation.set(Math.PI, 0.12, -0.56);
    } else {
      this.attachVrmWeaponToHand(this.rHandSocket, this.weapon, false);
    }
  }

  private attachVrmOrnamentsAndWeapons(arch: Exclude<ArchetypeId, 'golem'>) {
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xe6be68,
      map: gameAssets.pbr.armorBrass.color,
      normalMap: gameAssets.pbr.armorBrass.normal,
      roughnessMap: gameAssets.pbr.armorBrass.roughness,
      roughness: 0.24,
      metalness: 0.90,
    });

    if (arch === 'tianhe') {
      if (this.headSocket) {
        const bandMat = new THREE.MeshStandardMaterial({
          color: 0xc42020,
          map: gameAssets.pbr.yunbrocadeCrimson,
          roughness: 0.48,
          side: THREE.DoubleSide,
        });
        const band = new THREE.Mesh(
          new THREE.CylinderGeometry(0.098, 0.101, 0.022, 20, 1, true),
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
            new THREE.Vector3(side * 0.035, -0.34, 0.075),
          ]);
          const ribbon = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.011, 6, false), bandMat);
          ribbon.scale.set(1.6, 1.0, 0.35);
          tailPivot.add(ribbon);
          this.headSocket.add(tailPivot);
          this.headbandRibbons.push(tailPivot);
        }
      }

      if (this.chestSocket && gameAssets.weaponModels?.scabbard) {
        const backScabbard = gameAssets.weaponModels.scabbard.clone(true);
        backScabbard.scale.setScalar(1.02);
        backScabbard.position.set(-0.08, 0.04, 0.13);
        backScabbard.rotation.set(0.08, Math.PI, 0.56);
        this.chestSocket.add(backScabbard);
      }

      if (this.chestSocket) {
        this.houyiBow = createHouyiBow();
        this.houyiBow.group.position.set(0.02, 0.05, 0.17);
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
      if (this.headSocket) {
        const crown = new THREE.Group();
        crown.position.set(0, 0.135, 0.012);
        const baseRing = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.0085, 8, 18), goldMat);
        baseRing.rotation.x = Math.PI / 2;
        crown.add(baseRing);

        const lotus = new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.038, 0.068, 8, 1, true), goldMat);
        lotus.position.y = 0.034;
        crown.add(lotus);

        const hairpin = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.20, 8), goldMat);
        hairpin.rotation.z = Math.PI / 2;
        hairpin.position.y = 0.036;
        crown.add(hairpin);
        this.headSocket.add(crown);
      }

      if (this.chestSocket) {
        const wings = new THREE.Group();
        wings.position.set(0, 0.12, 0.21);
        for (let i = 0; i < 9; i++) {
          const frac = (i - 4) / 4;
          const ang = frac * 1.18;
          const holder = new THREE.Group();
          holder.position.set(Math.sin(ang) * 0.44, Math.cos(ang) * 0.32, Math.abs(frac) * 0.08);
          holder.rotation.z = -ang;
          holder.add(createSpiritWingSwordMesh());
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
      if (this.headSocket) {
        const jadeMat = new THREE.MeshPhysicalMaterial({
          color: 0xd8f2ff,
          roughness: 0.18,
          metalness: 0.25,
          clearcoat: 0.8,
        });
        const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.036, 0.064, 10), jadeMat);
        crown.position.set(0, 0.135, 0.012);
        this.headSocket.add(crown);

        const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.16, 6), goldMat);
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

      const sectSword = createSectSword(arch === 'cultivator');
      this.weapon = sectSword;
      this.attachVrmWeaponToHand(this.rHandSocket, sectSword, false);

      if (arch === 'cultivator' && this.chestSocket) {
        const orbit = new THREE.Group();
        orbit.position.set(0, 0.16, 0.22);
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2;
          const sb = createSectSword(false).group;
          sb.scale.setScalar(0.72);
          sb.position.set(Math.cos(a) * 0.48, Math.sin(a) * 0.48, 0);
          sb.rotation.z = a - Math.PI / 2;
          orbit.add(sb);
        }
        this.chestSocket.add(orbit);
        this.spiritOrbitSwords = orbit;
      }
    } else if (arch === 'lingsha') {
      const daggerR = createSectSword(true);
      daggerR.group.scale.set(0.82, 0.58, 0.82);
      this.weapon = daggerR;
      this.attachVrmWeaponToHand(this.rHandSocket, daggerR, false);

      const daggerL = createSectSword(true);
      daggerL.group.scale.set(0.82, 0.58, 0.82);
      this.offhandWeapon = daggerL;
      this.attachVrmWeaponToHand(this.lHandSocket, daggerL, true);
    } else if (arch === 'mengli') {
      if (this.chestSocket) {
        const harp = new THREE.Group();
        const harpMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.92, 1.38, 1.95) });
        const frame = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.015, 10, 28, Math.PI * 1.5), goldMat);
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

    // Assign Full 24.5MB Multi-Part PBR Steel/Brass/Leather/Cloth Palette!
    model.traverse((node) => {
      if ((node as THREE.Mesh).isMesh) {
        const mesh = node as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;

        const origMats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const newMats = origMats.map((om) => {
          return (
            gameAssets.resolveGuardianMaterial(om?.name ?? '', mesh.name) ??
            new THREE.MeshStandardMaterial({
              color: 0x5c7488,
              map: gameAssets.pbr.armorPlate.color,
              normalMap: gameAssets.pbr.armorPlate.normal,
              roughnessMap: gameAssets.pbr.armorPlate.roughness,
              metalness: 0.82,
              roughness: 0.32,
            })
          );
        });
        mesh.material = Array.isArray(mesh.material) ? newMats : newMats[0];
      }
    });

    mergeRedundantVrmSkinnedMeshes(model);
    this.root.add(model);

    let rightHandBone: THREE.Object3D | null = null;
    let chestBone: THREE.Object3D | null = null;
    let hipsBone: THREE.Object3D | null = null;
    let lUpLeg: THREE.Object3D | null = null;
    let lLowLeg: THREE.Object3D | null = null;
    let lFoot: THREE.Object3D | null = null;
    let rUpLeg: THREE.Object3D | null = null;
    let rLowLeg: THREE.Object3D | null = null;
    let rFoot: THREE.Object3D | null = null;

    model.traverse((obj) => {
      if (/RightHand$/i.test(obj.name)) rightHandBone = obj;
      if (/Spine2$/i.test(obj.name)) chestBone = obj;
      if (/Hips$/i.test(obj.name)) hipsBone = obj;
      if (/LeftUpLeg$/i.test(obj.name)) lUpLeg = obj;
      if (/LeftLeg$/i.test(obj.name)) lLowLeg = obj;
      if (/LeftFoot$/i.test(obj.name)) lFoot = obj;
      if (/RightUpLeg$/i.test(obj.name)) rUpLeg = obj;
      if (/RightLeg$/i.test(obj.name)) rLowLeg = obj;
      if (/RightFoot$/i.test(obj.name)) rFoot = obj;
    });

    model.updateMatrixWorld(true);
    if (hipsBone && lUpLeg && lLowLeg && lFoot && rUpLeg && rLowLeg && rFoot) {
      const pL = new THREE.Vector3();
      const pR = new THREE.Vector3();
      (lFoot as THREE.Object3D).getWorldPosition(pL);
      (rFoot as THREE.Object3D).getWorldPosition(pR);
      this.footIkBones = {
        hips: hipsBone,
        leftUpperLeg: lUpLeg,
        leftLowerLeg: lLowLeg,
        leftFoot: lFoot,
        rightUpperLeg: rUpLeg,
        rightLowerLeg: rLowLeg,
        rightFoot: rFoot,
        soleHeightL: Math.max(0.10, pL.y),
        soleHeightR: Math.max(0.10, pR.y),
      };
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
        this.registerAction(key, clip, key === 'idle' ? 1 : 0);
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
    this.hitFlashShell.intensity = 2.8;
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

  /**
   * Updates smooth inertial AnimationMixer blending (`0.10s–0.14s` cross-fades -> ZERO robotic cuts!),
   * 5-phase martial swing curves, exploration back-sheathing, and 2-Bone Analytical Stair Foot IK!
   */
  public updateAnimation(
    dt: number,
    planarSpeed: number,
    inCombat = true,
    _strafeDir = 0,
    sampleFootHeight?: (x: number, z: number, refY: number) => number,
    isGrounded = true
  ) {
    this.idleClock += dt;
    const t = this.idleClock;

    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0 && this.hitFlashShell) {
        this.hitFlashShell.intensity = 0;
      }
    }

    // Exploration Auto-Sheathe / Combat Instant Unsheathe on Yun Tianhe!
    if (this.archetype === 'tianhe') {
      if (inCombat || this.activeClip !== 'none' || this.isBlocking || this.isChargingHeavy) {
        this.combatHoldTimer = 4.2;
      } else {
        this.combatHoldTimer = Math.max(0, this.combatHoldTimer - dt);
      }
      const wantSheathed = this.combatHoldTimer <= 0 && this.activeClip === 'none';
      this.setTianheSwordSheathed(wantSheathed);
    }

    // Equipment Socket Switching (Houyi Bow & Crimson/Cerulean Potion Gourd)
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
          this.houyiBow.group.position.set(0.02, 0.05, 0.17);
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

    // Smooth Inertial Action Weight Blending across 46-Clip UAL + Mixamo Suite!
    if (this.mixer) {
      const targetWeights = new Map<string, number>();
      const pick = (preferred: string, fallback: string) =>
        this.actions.has(preferred) ? preferred : fallback;

      const mocapSpec = this.activeClip !== 'none' ? MOCAP_CLIP_MAP[this.activeClip] : undefined;
      const resolvedActiveKey = mocapSpec
        ? this.actions.has(mocapSpec.key)
          ? mocapSpec.key
          : mocapSpec.fallbackKey && this.actions.has(mocapSpec.fallbackKey)
            ? mocapSpec.fallbackKey
            : null
        : null;

      if (mocapSpec && resolvedActiveKey) {
        const act = this.actions.get(resolvedActiveKey)!;
        const dur = this.clipDurations.get(resolvedActiveKey) ?? 1.0;
        const sFrac = mocapSpec.startFrac ?? 0;
        const eFrac = mocapSpec.endFrac ?? 1;
        const warped = mapWarpedProgress(this.clipProgress, mocapSpec.warp);
        act.paused = false;
        act.time = THREE.MathUtils.lerp(sFrac, eFrac, warped) * dur;
        targetWeights.set(resolvedActiveKey, 1.0);

        // Smoothly blend back toward idle during the final 16% recovery tail -> zero snap to idle!
        if (
          this.clipProgress > 0.84 &&
          this.activeClip !== 'death' &&
          this.activeClip !== 'staggerKneel'
        ) {
          const recBlend = (this.clipProgress - 0.84) / 0.16;
          const baseIdleKey = pick('ual_Sword_Idle', 'idle');
          targetWeights.set(resolvedActiveKey, 1.0 - recBlend * 0.65);
          targetWeights.set(baseIdleKey, recBlend * 0.65);
        }
      } else {
        const idleKey = this.weaponSheathed
          ? pick('ual_Idle_Loop', 'idle')
          : pick('ual_Sword_Idle', 'idle');
        const walkKey =
          this.archetype === 'xuanxiao'
            ? pick('ual_Walk_Formal_Loop', 'walk')
            : pick('ual_Walk_Loop', 'walk');
        const jogKey = pick('ual_Jog_Fwd_Loop', 'run');
        const sprintKey = this.weaponSheathed
          ? pick('ual_Sprint_Loop', 'run')
          : pick('sword_run', 'ual_Sprint_Loop');

        if (this.archetype === 'mengli' && this.actions.has('floating')) {
          targetWeights.set('floating', 1.0);
        } else if (!isGrounded && this.actions.has('ual_Jump_Loop')) {
          targetWeights.set('ual_Jump_Loop', 1.0);
        } else if (this.isBlocking && planarSpeed > 0.35 && this.actions.has('crouch_walk')) {
          targetWeights.set('crouch_walk', 0.65);
          targetWeights.set(walkKey, 0.35);
        } else if (planarSpeed < 0.22) {
          targetWeights.set(idleKey, 1.0);
        } else if (planarSpeed < 4.2) {
          const w = THREE.MathUtils.clamp((planarSpeed - 0.22) / 3.8, 0, 1);
          targetWeights.set(idleKey, 1 - w);
          targetWeights.set(walkKey, w);
        } else if (planarSpeed < 7.0) {
          const w = THREE.MathUtils.clamp((planarSpeed - 4.2) / 2.6, 0, 1);
          targetWeights.set(walkKey, 1 - w);
          targetWeights.set(jogKey, w);
        } else {
          const w = THREE.MathUtils.clamp((planarSpeed - 7.0) / 2.2, 0, 1);
          targetWeights.set(jogKey, 1 - w);
          targetWeights.set(sprintKey, w);
        }
      }

      // Exponential inertial damping (`~0.11s` smooth blend, NEVER instant 0ms weight snapping!)
      const blendRate = resolvedActiveKey ? 18.0 : 13.5;
      const alpha = 1.0 - Math.exp(-blendRate * Math.max(0.001, dt));

      for (const [k, act] of this.actions.entries()) {
        const desired = targetWeights.get(k) ?? 0;
        const prev = this.currentWeights.get(k) ?? 0;
        let next = prev + (desired - prev) * alpha;
        if (next < 0.004 && desired === 0) next = 0;
        if (next > 0.996 && desired === 1) next = 1;
        this.currentWeights.set(k, next);
        act.setEffectiveWeight(next);
      }

      this.mixer.update(resolvedActiveKey ? 0 : dt);
    }

    if (this.vrm) {
      const p = THREE.MathUtils.clamp(this.clipProgress, 0, 1);

      // Additive Upper-Body Combat Layering (Block, Heavy Charge, Parry, Houyi Bow, Flask Drink)
      if (this.activeClip === 'none') {
        if (this.isBlocking) {
          this.setVrmBoneEuler('spine', -0.10, 0.24, 0, 0.85);
          this.setVrmBoneEuler('chest', -0.12, 0.30, 0, 0.85);
          this.setVrmBoneEuler('rightUpperArm', 0.45, 0.68, -0.45, 0.92);
          this.setVrmBoneEuler('rightLowerArm', 0.0, 1.15, 0.35, 0.92);
          this.setVrmBoneEuler('leftUpperArm', 0.38, -0.62, 0.52, 0.88);
          this.setVrmBoneEuler('leftLowerArm', 0.0, -1.05, -0.25, 0.88);
        } else if (this.isChargingHeavy) {
          const tremble = Math.sin(t * 34) * 0.022;
          this.setVrmBoneEuler('spine', 0.14, -0.22, 0, 0.9);
          this.setVrmBoneEuler('chest', 0.18, -0.28, 0, 0.9);
          this.setVrmBoneEuler('rightUpperArm', 0.25, 0.35, 1.18 + tremble, 0.95);
          this.setVrmBoneEuler('rightLowerArm', 0.0, 0.72, 0, 0.95);
          this.setVrmBoneEuler('leftUpperArm', 0.22, -0.42, -1.05, 0.9);
          this.setVrmBoneEuler('leftLowerArm', 0.0, -0.68, 0, 0.9);
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
            ? 0.82
            : this.demonWingOpen > 0.3
              ? 0.65
              : 0;
        expr.setValue('angry', fierce);
        expr.setValue('aa', this.activeClip === 'xx_roar' ? 0.85 : fierce * 0.22);
      }

      // Copy normalized bones -> raw bones & step hair/ribbon SpringBones!
      this.vrm.update(dt);
    }

    // Apply Post-Animation 2-Bone Analytical Stair/Slope Foot IK & Stamp Interactive Snow Footprints!
    if (sampleFootHeight && this.footIkBones && this.archetype !== 'mengli') {
      const disableIkForClip =
        !isGrounded ||
        this.activeClip === 'dodge' ||
        this.activeClip === 'jumpSlash' ||
        this.activeClip === 'xx_meteor' ||
        this.activeClip === 'death';
      const ikWeight = disableIkForClip ? 0.0 : this.activeClip === 'none' ? 1.0 : 0.72;

      this.footIk.apply(
        dt,
        this.root,
        this.footIkBones,
        sampleFootHeight,
        ikWeight,
        this._leftFootW,
        this._rightFootW
      );

      if (
        isGrounded &&
        planarSpeed > 0.4 &&
        (this.archetype === 'tianhe' || this.archetype === 'golem' || this.archetype === 'xuanxiao')
      ) {
        snowFootprints.recordBootStep(this._leftFootW, this._rightFootW, this.root.position.y);
      }
    }
  }
}
