import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import { gameAssets, MixamoClipKey, VrmCastKey } from '../assets/assetLoader';
import { retargetMixamoToFbxRig, retargetMixamoToVrm } from './vrmRetarget';
import { getContactShadowTexture } from '../world/proceduralTextures';
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

// Maps gameplay ActionClipNames to real motion-captured Mixamo FBX clips!
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
    // Classic Elden Ring delayed windup: hoist overhead from 0..0.55, then violent slam 0.55..0.80!
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
  private cloakPivot: THREE.Group | null = null;

  public activeClip: ActionClipName = 'none';
  public clipProgress = 0;
  public isBlocking = false;
  public isChargingHeavy = false;
  public demonWingOpen = 0;

  private idleClock = Math.random() * 10;
  private blinkTimer = 1.5 + Math.random() * 3.0;
  private flashTimer = 0;
  private hitTintMeshes: { mat: THREE.Material; origEmissive?: THREE.Color }[] = [];

  constructor(archetype: ArchetypeId) {
    this.archetype = archetype;
    this.root = new THREE.Group();

    // Ground Contact Shadow Disc so feet always sit solidly on jade & snow!
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
      lingsha: 0.98,
      mengli: 1.01,
    };
    this.root.scale.setScalar(scales[arch]);
    this.root.add(vrm.scene);

    // Collect raw bone sockets inside vrm.scene (note: VRM0 faces -Z locally before vrm.scene.rotation.y = PI)
    this.rHandSocket = vrm.humanoid?.getRawBoneNode('rightHand') ?? null;
    this.lHandSocket = vrm.humanoid?.getRawBoneNode('leftHand') ?? null;
    this.chestSocket =
      vrm.humanoid?.getRawBoneNode('upperChest') ?? vrm.humanoid?.getRawBoneNode('chest') ?? null;
    this.hipsSocket = vrm.humanoid?.getRawBoneNode('hips') ?? null;
    this.headSocket = vrm.humanoid?.getRawBoneNode('head') ?? null;

    // Keep MToon opaque/cutout render order intact so anime eyes & lashes never depth-sort glitch!
    const isSpirit = arch === 'lingsha' || arch === 'mengli';
    if (isSpirit) {
      const spiritRing = new THREE.Mesh(
        new THREE.RingGeometry(0.42, 0.56, 32),
        new THREE.MeshBasicMaterial({
          color: arch === 'lingsha' ? new THREE.Color(2.0, 0.55, 0.72) : new THREE.Color(0.85, 1.35, 2.25),
          transparent: true,
          opacity: 0.65,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      spiritRing.rotation.x = -Math.PI / 2;
      spiritRing.position.y = 0.04;
      this.root.add(spiritRing);
    }

    vrm.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          if (!m) continue;
          this.hitTintMeshes.push({ mat: m });
        }
      }
    });

    // Retarget all Mixamo clips onto this VRM's Normalized Humanoid
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
    // In VRM0 local hand frame: wrist->fingers is +X (right) / -X (left), palm is -Y, thumb/forward is -Z.
    // Rotating weapon +Y -> -Z (-PI/2 around X) puts the sword pointing cleanly forward out of the gripped hand!
    const sideSign = isLeft ? -1 : 1;
    w.group.position.set(sideSign * 0.065, -0.028, -0.025);
    w.group.rotation.set(-Math.PI * 0.48, 0, sideSign * 0.08);
    handSocket.add(w.group);
  }

  private addXianxiaWaistAndRobeSkirt(
    robeHex: number,
    trimHex: number,
    skirtLen: number,
    withCloakHex?: number
  ) {
    const robeMat = new THREE.MeshStandardMaterial({
      color: robeHex,
      map: gameAssets.pbr.cloth.color,
      normalMap: gameAssets.pbr.cloth.normal,
      roughness: 0.62,
      side: THREE.DoubleSide,
    });
    const trimMat = new THREE.MeshStandardMaterial({
      color: trimHex,
      roughness: 0.28,
      metalness: 0.82,
    });

    if (this.hipsSocket) {
      // Sculpted Waist Sash (`束腰玉带`) + Gold Buckle (`-Z` is front in VRM0!)
      const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.148, 0.155, 0.085, 18, 1, true), trimMat);
      belt.position.set(0, -0.02, 0.005);
      this.hipsSocket.add(belt);

      const buckle = new THREE.Mesh(new THREE.OctahedronGeometry(0.038, 0), trimMat);
      buckle.position.set(0, -0.02, -0.152);
      buckle.scale.set(1.2, 0.9, 0.45);
      this.hipsSocket.add(buckle);

      // Open-Front Split Xianxia Martial/Immortal Robe Skirt (`开衩战袍/仙袍下摆`)
      const skirt = new THREE.Mesh(
        new THREE.CylinderGeometry(0.152, 0.255, skirtLen, 20, 1, true, -Math.PI * 0.82, Math.PI * 1.64),
        robeMat
      );
      // Open slit faces -Z (front in VRM0) so legs kick freely during slashes without clipping!
      skirt.rotation.y = Math.PI;
      skirt.position.set(0, -skirtLen * 0.5 - 0.04, 0.01);
      skirt.castShadow = true;
      this.hipsSocket.add(skirt);

      // Central Embroidered Front Apron Tasset (`前摆蔽膝`)
      const apron = new THREE.Mesh(new THREE.PlaneGeometry(0.14, skirtLen * 0.92), robeMat);
      apron.position.set(0, -skirtLen * 0.46 - 0.04, -0.158);
      apron.rotation.x = -0.08;
      this.hipsSocket.add(apron);

      const apronBorder = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.022, 0.008), trimMat);
      apronBorder.position.set(0, -skirtLen * 0.92 - 0.03, -0.185);
      this.hipsSocket.add(apronBorder);
    }

    if (withCloakHex !== undefined && this.chestSocket) {
      const cloakMat = new THREE.MeshStandardMaterial({
        color: withCloakHex,
        map: gameAssets.pbr.cloth.color,
        normalMap: gameAssets.pbr.cloth.normal,
        roughness: 0.58,
        side: THREE.DoubleSide,
      });
      const pivot = new THREE.Group();
      pivot.position.set(0, 0.12, 0.11); // +Z is back of shoulders in VRM0!
      const capeGeo = new THREE.PlaneGeometry(0.46, 0.98, 4, 8);
      // Flare wider toward bottom hem
      const posAttr = capeGeo.attributes.position;
      for (let i = 0; i < posAttr.count; i++) {
        const py = posAttr.getY(i); // +0.49 .. -0.49
        const t = (0.49 - py) / 0.98;
        posAttr.setX(i, posAttr.getX(i) * (1.0 + t * 0.55));
        posAttr.setZ(i, Math.cos(posAttr.getX(i) * 4.0) * 0.035);
      }
      capeGeo.computeVertexNormals();
      const capeMesh = new THREE.Mesh(capeGeo, cloakMat);
      capeMesh.position.set(0, -0.49, 0.03);
      capeMesh.rotation.x = 0.16;
      capeMesh.castShadow = true;
      pivot.add(capeMesh);
      this.chestSocket.add(pivot);
      this.cloakPivot = pivot;
    }
  }

  private attachVrmOrnamentsAndWeapons(arch: Exclude<ArchetypeId, 'golem'>) {
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xe6be68,
      roughness: 0.24,
      metalness: 0.88,
    });

    if (arch === 'tianhe') {
      // Qingluan Mountain Martial Tunic Skirt + Bronze-Gold Waist Sash!
      this.addXianxiaWaistAndRobeSkirt(0x285c84, 0xd4a44e, 0.36);
      // 1. Yun Tianhe's Iconic Crimson Headband (`赤红抹额`) + Fluttering Tails (`+Z` is back of head in VRM0!)
      if (this.headSocket) {
        const bandMat = new THREE.MeshStandardMaterial({
          color: 0xd62828,
          emissive: 0x3a0606,
          roughness: 0.48,
        });
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.102, 0.012, 8, 24), bandMat);
        band.rotation.x = Math.PI / 2;
        band.position.set(0, 0.085, -0.005);
        this.headSocket.add(band);

        for (const side of [-1, 1]) {
          const tailPivot = new THREE.Group();
          tailPivot.position.set(side * 0.032, 0.08, 0.095);
          const tail = new THREE.Mesh(new THREE.PlaneGeometry(0.036, 0.34, 1, 4), bandMat);
          tail.material.side = THREE.DoubleSide;
          tail.position.set(0, -0.17, 0.03);
          tail.rotation.x = 0.28;
          tailPivot.add(tail);
          this.headSocket.add(tailPivot);
          this.headbandRibbons.push(tailPivot);
        }
      }

      // 2. Qingluan Fur-Trimmed Shoulder Guard + Scabbard + Houyi Sun-Shooting Bow on Back (`+Z` in VRM0!)
      if (this.chestSocket) {
        const furMat = new THREE.MeshStandardMaterial({ color: 0x6e472b, roughness: 0.82 });
        const pauldron = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.038, 8, 18, Math.PI * 1.15), furMat);
        pauldron.rotation.set(Math.PI * 0.42, 0.2, -0.2);
        pauldron.position.set(-0.08, 0.13, 0.0);
        this.chestSocket.add(pauldron);

        this.houyiBow = createHouyiBow();
        this.houyiBow.group.position.set(0.0, 0.05, 0.16);
        this.houyiBow.group.rotation.set(0, Math.PI * 0.5, 0.58);
        this.chestSocket.add(this.houyiBow.group);
      }

      // 3. Potion Gourd (`potion.glb`) in Left Hand (visible during `drink`)
      if (this.lHandSocket && gameAssets.weaponModels?.potion) {
        this.potionProp = gameAssets.weaponModels.potion.clone(true);
        this.potionProp.scale.setScalar(1.15);
        this.potionProp.position.set(-0.06, -0.04, -0.03);
        this.potionProp.visible = false;
        this.lHandSocket.add(this.potionProp);
      }

      // 4. 【望舒剑】in Right Hand
      const wangshu = createWangshuSword();
      this.weapon = wangshu;
      this.attachVrmWeaponToHand(this.rHandSocket, wangshu, false);
    } else if (arch === 'xuanxiao') {
      // Qionghua Grandmaster Full-Length Crimson-and-Gold Immortal Robes + Flowing Cloak!
      this.addXianxiaWaistAndRobeSkirt(0x981b1e, 0xe8be64, 0.68, 0x861418);
      // 1. Xuanxiao's Qionghua Golden Immortal Crown (`紫金莲华道冠`)
      if (this.headSocket) {
        const crown = new THREE.Group();
        crown.position.set(0, 0.155, 0.01);
        const circlet = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.058, 0.085, 12), goldMat);
        crown.add(circlet);
        const ruby = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.026, 0),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.35, 0.12) })
        );
        ruby.position.set(0, 0.01, -0.066);
        crown.add(ruby);
        const hairpin = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.22, 8), goldMat);
        hairpin.rotation.z = Math.PI / 2;
        hairpin.position.y = 0.02;
        crown.add(hairpin);
        this.headSocket.add(crown);
      }

      // 2. Gilded Dragon Shoulder Pauldrons + 9-Blade Levitating Crimson-Gold Demon Sword Wings (`+Z` back!)
      if (this.chestSocket) {
        for (const side of [-1, 1]) {
          const shoulder = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.22, 5), goldMat);
          shoulder.position.set(side * 0.175, 0.135, 0.0);
          shoulder.rotation.z = -side * 1.15;
          this.chestSocket.add(shoulder);
        }

        const wings = new THREE.Group();
        wings.position.set(0, 0.12, 0.20);
        const wingBladeMat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(2.25, 0.58, 0.16),
        });
        for (let i = 0; i < 9; i++) {
          const frac = (i - 4) / 4; // -1 .. +1
          const ang = frac * 1.18;
          const holder = new THREE.Group();
          holder.position.set(Math.sin(ang) * 0.44, Math.cos(ang) * 0.34, Math.abs(frac) * 0.08);
          holder.rotation.z = -ang;
          const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.036, 1.18, 4), wingBladeMat);
          blade.scale.set(0.35, 1, 1.2);
          blade.position.y = 0.58;
          holder.add(blade);
          wings.add(holder);
        }
        wings.visible = false;
        this.chestSocket.add(wings);
        this.demonSwordWings = wings;
      }

      // 3. 【羲和剑】in Right Hand
      const xihe = createXiheSword();
      this.weapon = xihe;
      this.attachVrmWeaponToHand(this.rHandSocket, xihe, false);
    } else if (arch === 'disciple' || arch === 'cultivator') {
      // Qionghua Ice-Cyan & Snow-White Daoist Sect Robe Skirt + Jade Sash!
      this.addXianxiaWaistAndRobeSkirt(0xd6eaf6, 0x4aa8d8, arch === 'cultivator' ? 0.58 : 0.44, arch === 'cultivator' ? 0x2c6e98 : undefined);
      // Qionghua Jade Daoist Crown + Sect Sword (+ 3 Orbiting Spirit Swords for Cultivator!)
      if (this.headSocket) {
        const jadeCrownMat = new THREE.MeshStandardMaterial({
          color: 0xbce8ff,
          roughness: 0.25,
          metalness: 0.55,
        });
        const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.045, 0.075, 10), jadeCrownMat);
        crown.position.set(0, 0.15, 0.01);
        this.headSocket.add(crown);
      }

      const sectSword = createSectSword();
      this.weapon = sectSword;
      this.attachVrmWeaponToHand(this.rHandSocket, sectSword, false);

      if (arch === 'cultivator' && this.chestSocket) {
        const orbit = new THREE.Group();
        orbit.position.set(0, 0.16, 0.22);
        const spiritMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 1.65, 2.35) });
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2;
          const sb = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.024, 0.78, 4), spiritMat);
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
      // Liu Mengli Flowing Lavender-Moonlight Celestial Gown Skirt!
      this.addXianxiaWaistAndRobeSkirt(0xc9b8f0, 0x8ce2ff, 0.64);
      // Floating Glowing Violet-Jade Konghou (`箜篌`) beside Liu Mengli!
      if (this.chestSocket) {
        const harp = new THREE.Group();
        const harpMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.05, 1.55, 2.35) });
        const frame = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.018, 10, 28, Math.PI * 1.5), harpMat);
        harp.add(frame);
        for (let s = -3; s <= 3; s++) {
          const str = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.42, 4), harpMat);
          str.position.x = s * 0.045;
          harp.add(str);
        }
        harp.position.set(-0.48, 0.04, -0.06);
        this.chestSocket.add(harp);
      }
    }
  }

  /**
   * Builds the 3.15m Courtyard Elite `【镇岳剑傀】` from real rigged `armored_guardian.fbx` + PBR armor palette!
   */
  private buildGolemFbxRig() {
    const model = SkeletonUtils.clone(gameAssets.guardianFbxTemplate) as THREE.Group;
    model.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(model);
    const rawHeight = Math.max(0.01, box.max.y - box.min.y);
    const targetHeight = 3.15;
    const fbxScale = targetHeight / rawHeight;
    model.scale.setScalar(fbxScale);
    model.position.y = -box.min.y * fbxScale;

    // Apply authored PBR armor materials + Qionghua Spirit-Construct Cyan Glow!
    model.traverse((node) => {
      if ((node as THREE.Mesh).isMesh) {
        const mesh = node as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;

        const origMats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const normKey = (s: string) =>
          String(s ?? '')
            .replace(/(\.\d{3}|\s*\(\d+\))$/, '')
            .toLowerCase()
            .replace(/^(?:material|mat)|(?:material|mat)$/g, '')
            .replace(/[^a-z0-9]/g, '');
        const meshKey = normKey(mesh.name);
        const newMats = origMats.map((om) => {
          const key = normKey(om?.name ?? '');
          const matched =
            gameAssets.guardianMaterials.get(key) ??
            gameAssets.guardianMaterials.get(meshKey) ??
            gameAssets.guardianDefaultMat ??
            new THREE.MeshStandardMaterial({ color: 0x4c6678, metalness: 0.75, roughness: 0.32 });
          const cloned = matched.clone();
          cloned.color.multiply(new THREE.Color(0.88, 1.02, 1.12));
          this.hitTintMeshes.push({ mat: cloned, origEmissive: cloned.emissive.clone() });
          return cloned;
        });
        mesh.material = Array.isArray(mesh.material) ? newMats : newMats[0];
      }
    });

    this.root.add(model);

    // Find Mixamo RightHand & Spine2 bones inside FBX
    let rightHandBone: THREE.Object3D | null = null;
    let chestBone: THREE.Object3D | null = null;
    model.traverse((obj) => {
      if (/RightHand$/i.test(obj.name)) rightHandBone = obj;
      if (/Spine2$/i.test(obj.name)) chestBone = obj;
    });

    // Glowing Cyan Spirit-Core Rune Halo on Golem's Chest/Back
    if (chestBone) {
      const coreHalo = new THREE.Mesh(
        new THREE.TorusGeometry(0.45 / fbxScale, 0.035 / fbxScale, 8, 24),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(0.45, 1.75, 2.35) })
      );
      coreHalo.position.set(0, 0.08 / fbxScale, -0.22 / fbxScale);
      (chestBone as THREE.Object3D).add(coreHalo);
    }

    // Attach 2.2m【镇岳玄铁巨剑】counter-scaled by `1 / fbxScale` so Mixamo cm units don't shrink it!
    const greatsword = createGolemGreatsword();
    this.weapon = greatsword;
    if (rightHandBone) {
      greatsword.group.scale.setScalar(0.82 / fbxScale);
      greatsword.group.position.set(-0.04 / fbxScale, 0.09 / fbxScale, 0.04 / fbxScale);
      greatsword.group.rotation.set(Math.PI * 0.52, 0, -Math.PI * 0.45);
      (rightHandBone as THREE.Object3D).add(greatsword.group);
    } else {
      this.root.add(greatsword.group);
    }

    // Retarget Mixamo clips onto the FBX skeleton
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

    // 1. Hit Flash Feedback
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      for (const entry of this.hitTintMeshes) {
        const std = entry.mat as THREE.MeshStandardMaterial;
        if (std.emissive) {
          std.emissive.setRGB(0.85, 0.85, 0.95);
          std.emissiveIntensity = 0.7;
        }
      }
    } else {
      for (const entry of this.hitTintMeshes) {
        const std = entry.mat as THREE.MeshStandardMaterial;
        if (std.emissive && entry.origEmissive) {
          std.emissive.copy(entry.origEmissive);
          std.emissiveIntensity = 0;
        } else if (std.emissive && std.emissiveIntensity > 0.01) {
          std.emissiveIntensity = 0;
        }
      }
    }

    // 2. Equipment Socket Switching (Houyi Bow & Crimson/Cerulean Potion Gourd!)
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
          this.houyiBow.group.position.set(0.0, 0.05, 0.16);
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
    if (this.cloakPivot) {
      this.cloakPivot.rotation.x = 0.08 + Math.min(0.45, planarSpeed * 0.06) + Math.sin(t * 3.1) * 0.07;
    }

    // Flutter Yun Tianhe's crimson headband ribbons!
    for (let i = 0; i < this.headbandRibbons.length; i++) {
      const r = this.headbandRibbons[i];
      r.rotation.x = 0.18 + Math.min(0.65, planarSpeed * 0.08) + Math.sin(t * 4.5 + i) * 0.14;
      r.rotation.z = (i === 0 ? -0.12 : 0.12) + Math.cos(t * 3.2 + i) * 0.09;
    }

    // 3. Drive Real Mixamo AnimationMixer Weights & Scrubbed Combat Clips!
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
        // Free Locomotion Blend: idle <-> walk <-> sword_run (or floating for Mengli / Demon Hover!)
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

    // 4. Additive / Specialized Xianxia Martial Poses on VRM Normalized Humanoid Bones
    //    (VRM0 Normalized space: faces -Z, +Y up, +X right arm, -X left arm)
    if (this.vrm) {
      const p = THREE.MathUtils.clamp(this.clipProgress, 0, 1);

      if (this.activeClip === 'none') {
        if (this.isBlocking) {
          // Crisp Two-Handed Cross-Body Sword Guard!
          this.setVrmBoneEuler('spine', -0.10, 0.22, 0, 0.85);
          this.setVrmBoneEuler('chest', -0.12, 0.28, 0, 0.85);
          this.setVrmBoneEuler('rightUpperArm', 0.45, 0.68, -0.45, 0.92);
          this.setVrmBoneEuler('rightLowerArm', 0.0, 1.15, 0.35, 0.92);
          this.setVrmBoneEuler('leftUpperArm', 0.38, -0.62, 0.52, 0.88);
          this.setVrmBoneEuler('leftLowerArm', 0.0, -1.05, -0.25, 0.88);
        } else if (this.isChargingHeavy) {
          // Coiled Two-Handed Overhead Mountain-Cleaver Charge!
          const tremble = Math.sin(t * 34) * 0.025;
          this.setVrmBoneEuler('spine', 0.14, -0.22, 0, 0.9);
          this.setVrmBoneEuler('chest', 0.18, -0.28, 0, 0.9);
          this.setVrmBoneEuler('rightUpperArm', 0.25, 0.35, 1.18 + tremble, 0.95);
          this.setVrmBoneEuler('rightLowerArm', 0.0, 0.72, 0, 0.95);
          this.setVrmBoneEuler('leftUpperArm', 0.22, -0.42, -1.05, 0.9);
          this.setVrmBoneEuler('leftLowerArm', 0.0, -0.68, 0, 0.9);
        } else if (inCombat && planarSpeed < 0.35) {
          // Subtle poised Wuxia sword-ready right arm stance at idle
          this.setVrmBoneEuler('rightUpperArm', 0.15, 0.28, -0.95, 0.55);
          this.setVrmBoneEuler('rightLowerArm', 0.0, 0.52, 0.0, 0.55);
        }
      } else if (this.activeClip === 'parry') {
        const sweep = Math.sin(p * Math.PI);
        this.setVrmBoneEuler('chest', -0.08, -0.48 * sweep, 0, 0.95);
        this.setVrmBoneEuler('rightUpperArm', 0.35, 0.95 - 1.55 * sweep, -0.25, 0.95);
        this.setVrmBoneEuler('rightLowerArm', 0, 0.85 * (1 - sweep * 0.6), 0, 0.95);
      } else if (this.activeClip === 'skill_bow') {
        // Draw【后羿射日弓】with Left Arm extended forward (-Z) and Right Hand drawing string!
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
        // Poise broken! Drop onto knee, vulnerable to【御剑贯心】Riposte!
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
        // Xuanxiao Skyward Immersion /「苍天弃吾，吾宁成魔！！」
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

      // 5. Anime Facial Expressions (`blink`, `angry`, `aa`) via VRM ExpressionManager!
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

      // 6. Propagate Normalized Humanoid -> Raw Bones AND step real VRM SpringBone hair/cloth physics!
      this.vrm.update(dt);
    }
  }
}
