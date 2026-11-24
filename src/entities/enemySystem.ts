import * as THREE from 'three';
import { DamageableTarget, PlayerController } from '../combat/playerController';
import { QionghuaWorld } from '../world/qionghuaWorld';
import { ActionClipName, ArchetypeId, XianxiaCharacterRig } from './xianxiaRig';
import { CombatVfxManager, SwordRibbonTrail } from '../vfx/combatVfx';
import { HuimengAudioEngine } from '../audio/huimengAudio';
import { SoulsCamera } from '../camera/soulsCamera';

export interface LootPillar {
  id: string;
  name: string;
  description: string;
  pos: THREE.Vector3;
  collected: boolean;
  group: THREE.Group;
  onCollect: (player: PlayerController) => void;
}

export class RegularEnemy implements DamageableTarget {
  public id: string;
  public name: string;
  public kind: 'disciple' | 'cultivator' | 'golem';
  public rig: XianxiaCharacterRig;
  public trail: SwordRibbonTrail | null;

  public spawnPos: THREE.Vector3;
  public pos: THREE.Vector3;
  public yaw = Math.PI; // Facing +Z (down the stairs toward approaching player)
  public radius: number;

  public hp: number;
  public maxHp: number;
  public poise: number;
  public maxPoise: number;
  public lingyunReward: number;
  public alive = true;
  public permanentlyDefeated = false; // True for Courtyard Elite【镇岳剑傀】!
  public isStaggeredKneeling = false;

  public aiState: 'idle' | 'aggro' | 'windup' | 'recover' | 'hurt' | 'stagger' | 'dead' = 'idle';
  public stateTimer = 0;
  public stateDuration = 0;
  public currentClip: ActionClipName = 'none';
  public hitStopTimer = 0;
  public poiseRegenDelay = 0;
  public attackCooldown = 0;
  public dealtDamageThisSwing = false;
  public hasAttackToken = false;
  private strafeSign = Math.random() < 0.5 ? -1 : 1;

  constructor(
    id: string,
    kind: 'disciple' | 'cultivator' | 'golem',
    spawnPos: THREE.Vector3,
    scene: THREE.Scene
  ) {
    this.id = id;
    this.kind = kind;
    this.spawnPos = spawnPos.clone();
    this.pos = spawnPos.clone();

    if (kind === 'golem') {
      this.name = '镇岳剑傀';
      this.maxHp = 880;
      this.maxPoise = 140;
      this.radius = 0.92;
      this.lingyunReward = 680;
    } else if (kind === 'cultivator') {
      this.name = '琼华御剑修士';
      this.maxHp = 230;
      this.maxPoise = 45;
      this.radius = 0.46;
      this.lingyunReward = 160;
    } else {
      this.name = '琼华执剑弟子';
      this.maxHp = 310;
      this.maxPoise = 68;
      this.radius = 0.48;
      this.lingyunReward = 150;
    }

    this.hp = this.maxHp;
    this.poise = this.maxPoise;

    this.rig = new XianxiaCharacterRig(kind as ArchetypeId);
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = 0;
    scene.add(this.rig.root);

    this.trail =
      kind === 'cultivator'
        ? null
        : new SwordRibbonTrail(
            scene,
            new THREE.Color(0.85, 1.85, 2.35),
            new THREE.Color(0.2, 0.68, 1.25),
            18
          );
  }

  public respawn() {
    if (this.permanentlyDefeated) return;
    this.alive = true;
    this.hp = this.maxHp;
    this.poise = this.maxPoise;
    this.pos.copy(this.spawnPos);
    this.yaw = Math.PI;
    this.aiState = 'idle';
    this.isStaggeredKneeling = false;
    this.rig.root.visible = true;
    this.rig.activeClip = 'none';
    this.rig.isBlocking = false;
    this.trail?.clear();
  }

  public takeHit(
    dmg: number,
    poiseDmg: number,
    knockDir: THREE.Vector3,
    isHeavy: boolean,
    isParryBreak = false
  ): 'hit' | 'blocked' | 'staggered' | 'killed' {
    if (!this.alive) return 'hit';

    // Sword Disciples in neutral/aggro guard stance can block 1 careless light attack & counter-attack!
    if (
      this.kind === 'disciple' &&
      this.rig.isBlocking &&
      !isHeavy &&
      !isParryBreak &&
      this.aiState === 'aggro'
    ) {
      this.rig.isBlocking = false;
      this.poise -= poiseDmg * 0.6;
      this.attackCooldown = 0.05; // Immediately counter-slash!
      return 'blocked';
    }

    this.hp = Math.max(0, this.hp - dmg);
    this.poise -= poiseDmg;
    this.poiseRegenDelay = 5.0;
    this.hitStopTimer = isHeavy ? 0.105 : 0.068;
    this.rig.flashHit(0.13);
    this.rig.isBlocking = false;

    if (knockDir.lengthSq() > 0.01 && !this.isStaggeredKneeling) {
      const kb = this.kind === 'golem' ? 0.15 : isHeavy ? 0.55 : 0.25;
      this.pos.x += knockDir.x * kb;
      this.pos.z += knockDir.z * kb;
    }

    if (this.hp <= 0) {
      this.alive = false;
      this.isStaggeredKneeling = false;
      this.aiState = 'dead';
      this.stateTimer = 0;
      this.stateDuration = 1.6;
      this.rig.activeClip = 'death';
      this.rig.clipProgress = 0;
      if (this.kind === 'golem') {
        this.permanentlyDefeated = true;
      }
      return 'killed';
    }

    if (this.poise <= 0 || isParryBreak) {
      this.poise = this.maxPoise;
      this.isStaggeredKneeling = true;
      this.aiState = 'stagger';
      this.stateTimer = 0;
      this.stateDuration = 2.85;
      this.rig.activeClip = 'staggerKneel';
      this.rig.clipProgress = 0;
      return 'staggered';
    }

    if (this.kind !== 'golem' || isHeavy) {
      if (this.aiState !== 'stagger') {
        this.aiState = 'hurt';
        this.stateTimer = 0;
        this.stateDuration = 0.34;
        this.rig.activeClip = 'hurt';
        this.rig.clipProgress = 0;
      }
    }
    return 'hit';
  }

  public update(
    dt: number,
    elapsed: number,
    player: PlayerController,
    world: QionghuaWorld,
    vfx: CombatVfxManager,
    audio: HuimengAudioEngine,
    cam: SoulsCamera,
    onHurtFlash: () => void,
    onEliteKilled?: (pos: THREE.Vector3) => void
  ) {
    if (!this.rig.root.visible) return;

    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= dt;
      return;
    }

    if (this.poiseRegenDelay > 0) {
      this.poiseRegenDelay -= dt;
    } else if (this.alive && !this.isStaggeredKneeling) {
      this.poise = Math.min(this.maxPoise, this.poise + 14 * dt);
    }
    if (this.attackCooldown > 0) this.attackCooldown -= dt;

    let planarSpeed = 0;
    const toPlayer = new THREE.Vector3(player.pos.x - this.pos.x, 0, player.pos.z - this.pos.z);
    const dist = toPlayer.length();
    const leashDist = this.pos.distanceTo(this.spawnPos);

    if (this.aiState === 'dead') {
      this.stateTimer += dt;
      this.rig.clipProgress = Math.min(1, this.stateTimer / 1.15);
      this.rig.updateAnimation(dt, 0, false);
      this.trail?.update(dt, elapsed, this.pos, this.pos, false);

      if (this.stateTimer >= 2.2) {
        this.rig.root.visible = false;
        if (this.kind === 'golem' && onEliteKilled) {
          onEliteKilled(this.pos.clone());
          onEliteKilled = undefined;
        }
      }
      return;
    }

    if (this.aiState === 'stagger') {
      this.stateTimer += dt;
      this.rig.clipProgress = Math.min(1, this.stateTimer / this.stateDuration);
      if (this.stateTimer >= this.stateDuration || !this.isStaggeredKneeling) {
        this.isStaggeredKneeling = false;
        this.aiState = 'aggro';
        this.rig.activeClip = 'none';
      }
    } else if (this.aiState === 'hurt') {
      this.stateTimer += dt;
      this.rig.clipProgress = Math.min(1, this.stateTimer / this.stateDuration);
      if (this.stateTimer >= this.stateDuration) {
        this.aiState = 'aggro';
        this.rig.activeClip = 'none';
      }
    } else if (this.aiState === 'idle') {
      this.rig.activeClip = 'none';
      const detectRange = this.kind === 'cultivator' ? 21.0 : 16.5;
      if (player.state !== 'dead' && dist < detectRange && Math.abs(player.pos.y - this.pos.y) < 7.0) {
        this.aiState = 'aggro';
      }
    } else if (this.aiState === 'aggro') {
      this.rig.activeClip = 'none';
      if (player.state === 'dead' || dist > 28 || leashDist > 24) {
        // Return calmly toward post
        const back = new THREE.Vector3().subVectors(this.spawnPos, this.pos);
        back.y = 0;
        if (back.length() > 1.2) {
          back.normalize();
          planarSpeed = 3.2;
          const res = world.resolveHorizontalMove(
            this.pos,
            this.pos.x + back.x * 3.2 * dt,
            this.pos.z + back.z * 3.2 * dt,
            this.pos.y,
            this.radius
          );
          this.pos.set(res.x, res.groundY, res.z);
          this.yaw = Math.atan2(-back.x, -back.z);
        } else {
          this.aiState = 'idle';
        }
      } else {
        // Face player
        this.yaw = Math.atan2(-toPlayer.x, -toPlayer.z);

        if (this.kind === 'cultivator') {
          // Ranged Flying-Sword Cultivator: keep ~10..15m distance & fire frost swords!
          const dir = toPlayer.clone().normalize();
          if (dist < 7.0) {
            planarSpeed = 3.0;
            const res = world.resolveHorizontalMove(
              this.pos,
              this.pos.x - dir.x * 3.0 * dt,
              this.pos.z - dir.z * 3.0 * dt,
              this.pos.y,
              this.radius
            );
            this.pos.set(res.x, res.groundY, res.z);
          }
          if (this.attackCooldown <= 0) {
            this.aiState = 'windup';
            this.currentClip = 'light1';
            this.stateTimer = 0;
            this.stateDuration = 1.05;
            this.dealtDamageThisSwing = false;
            this.rig.activeClip = 'light1';
          }
        } else {
          // Melee Disciple or Giant Golem
          const idealRange = this.kind === 'golem' ? 3.5 : 2.35;
          const dir = toPlayer.clone().normalize();
          const right = new THREE.Vector3(-dir.z, 0, dir.x);

          if (!this.hasAttackToken && this.kind === 'disciple') {
            // Circle menacingly with blade raised in guard while teammate attacks!
            this.rig.isBlocking = dist < 5.5;
            const targetDist = 4.2;
            const radial = dist > targetDist + 0.5 ? 1 : dist < targetDist - 0.5 ? -1 : 0;
            const move = dir.clone().multiplyScalar(radial * 2.2).addScaledVector(right, this.strafeSign * 2.0);
            planarSpeed = move.length();
            const res = world.resolveHorizontalMove(
              this.pos,
              this.pos.x + move.x * dt,
              this.pos.z + move.z * dt,
              this.pos.y,
              this.radius
            );
            this.pos.set(res.x, res.groundY, res.z);
          } else {
            this.rig.isBlocking = this.kind === 'disciple' && dist > 2.6 && dist < 5.2;
            if (dist > idealRange) {
              const spd = this.kind === 'golem' ? 3.8 : 4.6;
              planarSpeed = spd;
              const res = world.resolveHorizontalMove(
                this.pos,
                this.pos.x + dir.x * spd * dt,
                this.pos.z + dir.z * spd * dt,
                this.pos.y,
                this.radius
              );
              this.pos.set(res.x, res.groundY, res.z);
            } else if (this.attackCooldown <= 0) {
              this.rig.isBlocking = false;
              this.aiState = 'windup';
              this.stateTimer = 0;
              this.dealtDamageThisSwing = false;
              if (this.kind === 'golem') {
                // Alternate between sweeping heavy cleave & Jump-tutorial Shockwave Slam!
                const useSlam = Math.random() < 0.52;
                this.currentClip = useSlam ? 'xx_delaySlam' : 'heavy';
                this.stateDuration = useSlam ? 1.48 : 1.18;
              } else {
                this.currentClip = Math.random() < 0.5 ? 'light1' : 'light2';
                this.stateDuration = 0.92;
              }
              this.rig.activeClip = this.currentClip;
            }
          }
        }
      }
    } else if (this.aiState === 'windup') {
      this.stateTimer += dt;
      const p = THREE.MathUtils.clamp(this.stateTimer / this.stateDuration, 0, 1);
      this.rig.clipProgress = p;

      // Track player during early windup, lock angle before strike so player can dodge behind!
      if (p < 0.42 && dist > 0.2) {
        const targetYaw = Math.atan2(-toPlayer.x, -toPlayer.z);
        let diff = targetYaw - this.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.yaw += diff * Math.min(1, dt * 6);
      }

      if (this.kind === 'cultivator' && p >= 0.48 && !this.dealtDamageThisSwing) {
        this.dealtDamageThisSwing = true;
        const origin = this.pos.clone().add(new THREE.Vector3(0, 1.45, 0));
        const aim = player.pos.clone().add(new THREE.Vector3(0, 1.1, 0)).sub(origin).normalize();
        vfx.spawnProjectile(origin, aim.multiplyScalar(15.5), 68, 20, false, 'frost_sword');
        audio.playSfx('swing_light');
      } else if (this.kind !== 'cultivator') {
        const hitFrame = this.currentClip === 'xx_delaySlam' ? 0.68 : 0.50;
        if (p >= hitFrame && !this.dealtDamageThisSwing) {
          this.dealtDamageThisSwing = true;
          audio.playSfx(this.kind === 'golem' ? 'swing_heavy' : 'swing_light');

          if (this.kind === 'golem' && this.currentClip === 'xx_delaySlam') {
            // Giant Golem Ground Shockwave Ring (teaches Space Jump-Dodge!)
            const slamSpot = this.pos
              .clone()
              .addScaledVector(new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)), 1.8);
            slamSpot.y = this.pos.y;
            vfx.spawnShockwaveRing(slamSpot, 0.8, 12.5, 0.82, new THREE.Color(0.45, 1.85, 2.45), 92);
            cam.addShake(0.28, 0.28);
            audio.playSfx('meteor_boom');
          }

          const reach = this.kind === 'golem' ? 4.2 : 2.7;
          const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
          if (dist <= reach && toPlayer.clone().normalize().dot(fwd) > 0.1) {
            const rawDmg = this.kind === 'golem' ? 128 : 74;
            player.receiveAttack(
              rawDmg,
              this.pos,
              false,
              audio,
              vfx,
              cam,
              onHurtFlash,
              this
            );
          }
        }
      }

      if (this.stateTimer >= this.stateDuration) {
        this.aiState = 'aggro';
        this.rig.activeClip = 'none';
        this.attackCooldown = this.kind === 'golem' ? 1.35 : this.kind === 'cultivator' ? 2.1 : 1.15;
      }
    }

    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.yaw + Math.PI;
    this.rig.updateAnimation(dt, planarSpeed, this.aiState !== 'idle');

    if (this.trail && this.rig.weapon) {
      const bPos = new THREE.Vector3();
      const tPos = new THREE.Vector3();
      this.rig.weapon.basePoint.getWorldPosition(bPos);
      this.rig.weapon.tipPoint.getWorldPosition(tPos);
      const emitting = this.aiState === 'windup' && this.rig.clipProgress > 0.35 && this.rig.clipProgress < 0.82;
      this.trail.update(dt, elapsed, bPos, tPos, emitting);
    }
  }
}

/**
 * Spirit Ash Companion (韩菱纱 & 柳梦璃 回梦灵影) summoned inside Juanyun Boss Arena!
 */
export class SpiritCompanion {
  public lingsha: XianxiaCharacterRig;
  public mengli: XianxiaCharacterRig;
  public lingshaPos = new THREE.Vector3();
  public mengliPos = new THREE.Vector3();
  public lingshaTrail: SwordRibbonTrail;
  public active = false;

  private attackTimer = 0;
  private healNoteTimer = 0;

  constructor(scene: THREE.Scene) {
    this.lingsha = new XianxiaCharacterRig('lingsha');
    this.lingsha.root.visible = false;
    scene.add(this.lingsha.root);

    this.mengli = new XianxiaCharacterRig('mengli');
    this.mengli.root.visible = false;
    scene.add(this.mengli.root);

    this.lingshaTrail = new SwordRibbonTrail(
      scene,
      new THREE.Color(2.2, 0.65, 0.85),
      new THREE.Color(1.2, 0.18, 0.35),
      16
    );
  }

  public summonNear(playerPos: THREE.Vector3, vfx: CombatVfxManager, audio: HuimengAudioEngine) {
    this.active = true;
    this.lingshaPos.set(playerPos.x + 2.2, playerPos.y, playerPos.z - 1.5);
    this.mengliPos.set(playerPos.x - 2.4, playerPos.y, playerPos.z + 1.2);
    this.lingsha.root.visible = true;
    this.mengli.root.visible = true;
    this.attackTimer = 0.6;
    this.healNoteTimer = 4.5;

    audio.playSfx('flute_summon');
    vfx.spawnShockwaveRing(this.lingshaPos, 0.3, 2.8, 0.4, new THREE.Color(2.1, 0.6, 0.8), 0);
    vfx.spawnShockwaveRing(this.mengliPos, 0.3, 2.8, 0.4, new THREE.Color(1.3, 0.9, 2.2), 0);
  }

  public dismiss() {
    this.active = false;
    this.lingsha.root.visible = false;
    this.mengli.root.visible = false;
    this.lingshaTrail.clear();
  }

  public update(
    dt: number,
    elapsed: number,
    player: PlayerController,
    bossTarget: DamageableTarget | null,
    vfx: CombatVfxManager,
    audio: HuimengAudioEngine
  ) {
    if (!this.active || !bossTarget || !bossTarget.alive) {
      if (this.active && (!bossTarget || !bossTarget.alive)) {
        this.lingsha.activeClip = 'none';
        this.mengli.activeClip = 'none';
        this.lingsha.updateAnimation(dt, 0, false);
        this.mengli.updateAnimation(dt, 0, false);
      }
      return;
    }

    // 1. Han Lingsha: Agile Crimson Skirmisher orbiting & slashing Boss!
    const toBoss = new THREE.Vector3().subVectors(bossTarget.pos, this.lingshaPos);
    toBoss.y = 0;
    const dist = toBoss.length();
    const lYaw = Math.atan2(-toBoss.x, -toBoss.z);
    let lSpeed = 0;

    this.attackTimer -= dt;
    if (dist > 2.6) {
      toBoss.normalize();
      lSpeed = 6.8;
      this.lingshaPos.addScaledVector(toBoss, lSpeed * dt);
      this.lingsha.activeClip = 'none';
    } else if (this.attackTimer <= 0) {
      this.attackTimer = 1.65;
      this.lingsha.activeClip = Math.random() < 0.5 ? 'light1' : 'light2';
      this.lingsha.clipProgress = 0;
      bossTarget.takeHit(42, 14, toBoss.normalize(), false);
      vfx.spawnHitSparks(
        bossTarget.pos.clone().add(new THREE.Vector3(0, 1.2, 0)),
        new THREE.Vector3(0, 1, 0),
        10,
        new THREE.Color(2.2, 0.6, 0.8)
      );
    }

    if (this.lingsha.activeClip !== 'none') {
      this.lingsha.clipProgress += dt / 0.55;
      if (this.lingsha.clipProgress >= 1) this.lingsha.activeClip = 'none';
    }

    this.lingshaPos.y = bossTarget.pos.y;
    this.lingsha.root.position.copy(this.lingshaPos);
    this.lingsha.root.rotation.y = lYaw + Math.PI;
    this.lingsha.updateAnimation(dt, lSpeed, true);

    if (this.lingsha.weapon) {
      const b = new THREE.Vector3();
      const t = new THREE.Vector3();
      this.lingsha.weapon.basePoint.getWorldPosition(b);
      this.lingsha.weapon.tipPoint.getWorldPosition(t);
      this.lingshaTrail.update(dt, elapsed, b, t, this.lingsha.activeClip !== 'none');
    }

    // 2. Liu Mengli: Graceful Konghou Support orbiting player, launching Spirit Notes & Gentle Heal!
    const idealMengli = new THREE.Vector3(
      player.pos.x + Math.cos(elapsed * 0.6) * 5.2,
      bossTarget.pos.y,
      player.pos.z + Math.sin(elapsed * 0.6) * 5.2
    );
    const dM = Math.hypot(idealMengli.x - -0, idealMengli.z - -63);
    if (dM < 21.5) {
      this.mengliPos.lerp(idealMengli, Math.min(1, dt * 2.2));
    }
    const mToBoss = new THREE.Vector3().subVectors(bossTarget.pos, this.mengliPos);
    const mYaw = Math.atan2(-mToBoss.x, -mToBoss.z);
    this.mengli.root.position.copy(this.mengliPos);
    this.mengli.root.rotation.y = mYaw + Math.PI;
    this.mengli.updateAnimation(dt, 1.2, true);

    this.healNoteTimer -= dt;
    if (this.healNoteTimer <= 0) {
      this.healNoteTimer = 4.2;
      const origin = this.mengliPos.clone().add(new THREE.Vector3(0, 1.45, 0));
      const aim = bossTarget.pos.clone().add(new THREE.Vector3(0, 1.2, 0)).sub(origin).normalize();
      vfx.spawnProjectile(origin, aim.multiplyScalar(19.0), 54, 16, true, 'spirit_note');

      // Gentle Konghou regeneration blessing for Yun Tianhe
      if (player.state !== 'dead' && player.hp < player.maxHp) {
        player.hp = Math.min(player.maxHp, player.hp + 38);
        vfx.spawnShockwaveRing(player.pos, 0.3, 2.2, 0.45, new THREE.Color(1.2, 0.9, 2.2), 0);
      }
      audio.playSfx('heal_drink');
    }
  }
}

/**
 * Builds a 3-layer glowing loot pillar (Bright core + Mid column + Soft ground halo per VFX guide!)
 */
export function createLootPillarMesh(pos: THREE.Vector3, isGoldRare: boolean): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);

  const coreCol = isGoldRare ? new THREE.Color(2.2, 1.75, 0.55) : new THREE.Color(0.55, 1.85, 2.4);
  const midCol = isGoldRare ? new THREE.Color(1.4, 0.95, 0.22) : new THREE.Color(0.22, 0.95, 1.55);

  const orb = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.24, 1),
    new THREE.MeshBasicMaterial({ color: coreCol })
  );
  orb.position.y = 0.55;
  g.add(orb);

  const coreBeam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.07, 3.6, 10, 1, true),
    new THREE.MeshBasicMaterial({
      color: coreCol,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  coreBeam.position.y = 1.8;
  g.add(coreBeam);

  const wideHalo = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.42, 2.6, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: midCol,
      transparent: true,
      opacity: 0.32,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  wideHalo.position.y = 1.3;
  g.add(wideHalo);

  return g;
}

/**
 * Assigns at most `maxTokens` simultaneous melee attack tokens to engaged regular enemies!
 */
export function updateAttackTokens(enemies: RegularEnemy[], playerPos: THREE.Vector3, maxTokens = 1) {
  for (const e of enemies) e.hasAttackToken = false;

  const candidates = enemies
    .filter((e) => e.alive && e.kind === 'disciple' && (e.aiState === 'aggro' || e.aiState === 'windup'))
    .sort((a, b) => a.pos.distanceToSquared(playerPos) - b.pos.distanceToSquared(playerPos));

  for (let i = 0; i < Math.min(maxTokens, candidates.length); i++) {
    candidates[i].hasAttackToken = true;
  }
}
