import * as THREE from 'three';
import { DamageableTarget, PlayerController } from '../combat/playerController';
import { QionghuaWorld } from '../world/qionghuaWorld';
import { ActionClipName, XianxiaCharacterRig } from './xianxiaRig';
import { CombatVfxManager, SwordRibbonTrail } from '../vfx/combatVfx';
import { HuimengAudioEngine } from '../audio/huimengAudio';
import { SoulsCamera } from '../camera/soulsCamera';

export type XuanxiaoState =
  | 'dormant'
  | 'intro'
  | 'neutral'
  | 'combo1'
  | 'combo2'
  | 'delaySlam'
  | 'healPunish'
  | 'frostPalm'
  | 'swordRain'
  | 'phaseTransition'
  | 'bloodDance'
  | 'iceFireSplit'
  | 'meteorUltimate'
  | 'stagger'
  | 'dead';

export class XuanxiaoBoss implements DamageableTarget {
  public id = 'boss_xuanxiao';
  public name = '苍岚剑宗 · 玄霄';
  public isBoss = true;

  public rig: XianxiaCharacterRig;
  public trail: SwordRibbonTrail;
  public auraLight: THREE.PointLight;

  public arenaCenter = new THREE.Vector3(0, 10.5, -63.0);
  public pos = new THREE.Vector3(0, 10.5, -66.0);
  public yaw = Math.PI; // Facing +Z toward Fog Gate
  public radius = 0.62;

  public maxHp = 2600;
  public hp = 2600;
  public maxPoise = 180;
  public poise = 180;
  public alive = true;
  public defeated = false;
  public isStaggeredKneeling = false;
  public phase: 1 | 2 = 1;

  public state: XuanxiaoState = 'dormant';
  public stateTimer = 0;
  public stateDuration = 1.0;
  public hitStopTimer = 0;
  public poiseRegenDelay = 0;
  public cooldown = 0.8;

  private hitFlags = new Set<number>();
  private strafeDir = 1;
  private meteorStartPos = new THREE.Vector3();
  private meteorTargetPos = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.rig = new XianxiaCharacterRig('xuanxiao');
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = 0;
    scene.add(this.rig.root);

    this.trail = new SwordRibbonTrail(
      scene,
      new THREE.Color(2.4, 1.15, 0.32),
      new THREE.Color(1.65, 0.28, 0.08),
      26
    );

    this.auraLight = new THREE.PointLight(0xff6432, 1.4, 14, 1.5);
    this.auraLight.position.set(this.pos.x, this.pos.y + 2.0, this.pos.z);
    scene.add(this.auraLight);
  }

  public resetDormant() {
    if (this.defeated) return;
    this.alive = true;
    this.hp = this.maxHp;
    this.poise = this.maxPoise;
    this.phase = 1;
    this.name = '苍岚剑宗 · 玄霄';
    this.pos.set(0, 10.5, -66.0);
    this.yaw = Math.PI;
    this.state = 'dormant';
    this.isStaggeredKneeling = false;
    this.rig.setDemonWings(0);
    this.rig.activeClip = 'none';
    this.rig.root.visible = true;
    this.trail.clear();
  }

  public startEncounter(
    audio: HuimengAudioEngine,
    onSubtitle: (speaker: string, text: string, dur: number) => void
  ) {
    if (this.state !== 'dormant' || this.defeated) return;
    this.state = 'intro';
    this.stateTimer = 0;
    this.stateDuration = 2.4;
    audio.setMood('boss_p1');
    const line = '「天河，你既执望舒登此卷云台，便休怪为兄剑下无情！」';
    onSubtitle('苍岚剑宗 · 玄霄', line, 4.2);
    audio.speakLine(line, 'xuanxiao');
  }

  public takeHit(
    dmg: number,
    poiseDmg: number,
    knockDir: THREE.Vector3,
    isHeavy: boolean,
    isParryBreak = false
  ): 'hit' | 'blocked' | 'staggered' | 'killed' {
    if (!this.alive || this.state === 'phaseTransition') return 'hit';

    this.hp = Math.max(0, this.hp - dmg);
    this.poise -= poiseDmg;
    this.poiseRegenDelay = 5.5;
    this.hitStopTimer = isHeavy ? 0.095 : 0.058;
    this.rig.flashHit(0.12);

    if (knockDir.lengthSq() > 0.01 && this.state === 'neutral') {
      this.pos.x += knockDir.x * 0.18;
      this.pos.z += knockDir.z * 0.18;
      this.clampInsideArena();
    }

    if (this.hp <= 0) {
      this.alive = false;
      this.defeated = true;
      this.isStaggeredKneeling = false;
      this.state = 'dead';
      this.stateTimer = 0;
      this.stateDuration = 3.2;
      this.rig.activeClip = 'death';
      this.rig.clipProgress = 0;
      return 'killed';
    }

    // Trigger Phase 2 Transition once HP drops <= 50%!
    if (this.phase === 1 && this.hp <= this.maxHp * 0.5) {
      this.phase = 2;
      this.isStaggeredKneeling = false;
      this.poise = this.maxPoise;
      this.state = 'phaseTransition';
      this.stateTimer = 0;
      this.stateDuration = 5.4;
      this.rig.activeClip = 'xx_roar';
      this.rig.clipProgress = 0;
      return 'hit';
    }

    if ((this.poise <= 0 || isParryBreak) && this.state !== 'meteorUltimate') {
      this.poise = this.maxPoise;
      this.isStaggeredKneeling = true;
      this.state = 'stagger';
      this.stateTimer = 0;
      this.stateDuration = 3.1;
      this.rig.activeClip = 'staggerKneel';
      this.rig.clipProgress = 0;
      return 'staggered';
    }

    return 'hit';
  }

  private clampInsideArena() {
    const dx = this.pos.x - this.arenaCenter.x;
    const dz = this.pos.z - this.arenaCenter.z;
    const d = Math.hypot(dx, dz);
    if (d > 21.2) {
      this.pos.x = this.arenaCenter.x + (dx / d) * 21.2;
      this.pos.z = this.arenaCenter.z + (dz / d) * 21.2;
    }
  }

  private enterMove(state: XuanxiaoState, clip: ActionClipName, duration: number) {
    this.state = state;
    this.stateTimer = 0;
    this.stateDuration = duration;
    this.rig.activeClip = clip;
    this.rig.clipProgress = 0;
    this.hitFlags.clear();
  }

  private checkMeleeStrike(
    reach: number,
    arcCos: number,
    damage: number,
    unblockable: boolean,
    player: PlayerController,
    audio: HuimengAudioEngine,
    vfx: CombatVfxManager,
    cam: SoulsCamera,
    onHurtFlash: () => void
  ) {
    const toP = new THREE.Vector3(player.pos.x - this.pos.x, 0, player.pos.z - this.pos.z);
    const dist = toP.length();
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    if (dist <= reach && (dist < 0.8 || toP.clone().normalize().dot(fwd) >= arcCos)) {
      const res = player.receiveAttack(damage, this.pos, unblockable, audio, vfx, cam, onHurtFlash, this);
      if (res === 'parried') {
        // Parrying Xuanxiao briefly interrupts his combo chain!
        if (this.state === 'combo1' || this.state === 'combo2' || this.state === 'healPunish') {
          if (!this.isStaggeredKneeling) {
            this.state = 'neutral';
            this.cooldown = 0.95;
            this.rig.activeClip = 'hurt';
          }
        }
      }
    }
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
    onSubtitle: (speaker: string, text: string, dur: number) => void,
    onBossDefeated: () => void
  ) {
    if (this.state === 'dormant') {
      // Sleep & hide Boss completely while player is far down the mountain (> 40m away)!
      const nearSummit = player.pos.z < -22;
      this.rig.root.visible = nearSummit;
      this.auraLight.visible = nearSummit;
      if (nearSummit) {
        this.rig.updateAnimation(dt, 0, true);
      }
      return;
    }
    this.rig.root.visible = true;
    this.auraLight.visible = true;

    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= dt;
      return;
    }

    if (this.poiseRegenDelay > 0) {
      this.poiseRegenDelay -= dt;
    } else if (this.alive && !this.isStaggeredKneeling) {
      this.poise = Math.min(this.maxPoise, this.poise + 15 * dt);
    }

    const toPlayer = new THREE.Vector3(player.pos.x - this.pos.x, 0, player.pos.z - this.pos.z);
    const dist = toPlayer.length();
    let planarSpeed = 0;

    if (this.state === 'dead') {
      this.stateTimer += dt;
      this.rig.clipProgress = Math.min(1, this.stateTimer / 1.5);
      this.rig.updateAnimation(dt, 0, false);
      this.trail.update(dt, elapsed, this.pos, this.pos, false);

      if (!this.hitFlags.has(99)) {
        this.hitFlags.add(99);
        const dyingLine = '「九天玄火……终究敌不过一场凡尘回梦么……」';
        onSubtitle('玄霄', dyingLine, 5.0);
        audio.speakLine(dyingLine, 'xuanxiao');
        onBossDefeated();
      }
      return;
    }

    // PHASE 2 REAL-TIME CINEMATIC TRANSITION!
    if (this.state === 'phaseTransition') {
      this.stateTimer += dt;
      const p = THREE.MathUtils.clamp(this.stateTimer / this.stateDuration, 0, 1);
      this.rig.clipProgress = p;

      // Teleport smoothly to center of Juanyun Taiji Seal for majestic framing
      this.pos.lerp(new THREE.Vector3(0, 10.5, -63.0), Math.min(1, dt * 5));
      this.yaw = Math.atan2(-(player.pos.x - this.pos.x), -(player.pos.z - this.pos.z));

      if (!this.hitFlags.has(1)) {
        this.hitFlags.add(1);
        this.name = '焚天成魔 · 玄霄';
        audio.setMood('boss_p2');
        const roarLine = '「苍天弃吾——吾宁成魔！！」';
        onSubtitle('焚天成魔 · 玄霄', roarLine, 5.2);
        audio.speakLine(roarLine, 'xuanxiao');

        // Frame dramatic low-angle Boss shot for first 3.6s, then smoothly hand back camera!
        const camDir = new THREE.Vector3(player.pos.x - this.pos.x, 0, player.pos.z - this.pos.z);
        if (camDir.lengthSq() < 0.1) camDir.set(0, 0, 1);
        camDir.normalize();
        cam.setCustomShot(
          new THREE.Vector3(this.pos.x + camDir.x * 6.8 + 1.4, 12.2, this.pos.z + camDir.z * 6.8),
          new THREE.Vector3(this.pos.x, 12.3, this.pos.z)
        );
      }

      const demonF = THREE.MathUtils.smoothstep(p, 0.12, 0.72);
      world.setDemonTransition(demonF);
      this.rig.setDemonWings(demonF);
      this.auraLight.intensity = 1.4 + demonF * 3.0;

      if (p >= 0.48 && !this.hitFlags.has(2)) {
        this.hitFlags.add(2);
        audio.playSfx('meteor_boom');
        cam.addShake(0.42, 0.55);
        vfx.spawnShockwaveRing(this.pos, 0.6, 18.0, 0.75, new THREE.Color(2.4, 0.65, 0.18), 0);
        vfx.spawnHitSparks(
          this.pos.clone().add(new THREE.Vector3(0, 1.5, 0)),
          new THREE.Vector3(0, 1, 0),
          55,
          new THREE.Color(2.4, 0.75, 0.2)
        );
      }

      if (p >= 0.76) {
        cam.clearCustomShot();
      }

      if (this.stateTimer >= this.stateDuration) {
        this.state = 'neutral';
        this.cooldown = 0.6;
        this.rig.activeClip = 'none';
      }

      this.rig.root.position.copy(this.pos);
      this.rig.root.rotation.y = this.yaw + Math.PI;
      this.rig.updateAnimation(dt, 0, true);
      return;
    }

    if (this.state === 'intro') {
      this.stateTimer += dt;
      this.yaw = Math.atan2(-toPlayer.x, -toPlayer.z);
      if (this.stateTimer >= this.stateDuration) {
        this.state = 'neutral';
        this.cooldown = 0.35;
      }
    } else if (this.state === 'stagger') {
      this.stateTimer += dt;
      this.rig.clipProgress = Math.min(1, this.stateTimer / this.stateDuration);
      if (this.stateTimer >= this.stateDuration || !this.isStaggeredKneeling) {
        this.isStaggeredKneeling = false;
        this.state = 'neutral';
        this.cooldown = 0.55;
        this.rig.activeClip = 'none';
      }
    } else if (this.state === 'neutral') {
      this.rig.activeClip = 'none';
      this.cooldown -= dt;
      this.yaw = Math.atan2(-toPlayer.x, -toPlayer.z);

      // ELDEN RING INPUT-READING HEAL PUNISH!
      if (player.justStartedDrinking && dist > 3.2 && dist < 15.5) {
        audio.playSfx('swing_heavy');
        this.enterMove('healPunish', 'xx_thrust', 0.82);
      } else if (this.cooldown <= 0 && player.state !== 'dead') {
        // Choose next Grandmaster / Demon move based on range & phase!
        const roll = Math.random();
        if (this.phase === 2 && roll < 0.26) {
          // Signature Phase 2 Ultimate:【羲和焚天】(Meteor Dive + Double Jump-Shockwave!)
          this.meteorStartPos.copy(this.pos);
          this.meteorTargetPos.copy(player.pos);
          const sub = '「羲和焚天——万剑俱灭！」';
          onSubtitle('焚天成魔 · 玄霄', sub, 3.0);
          this.enterMove('meteorUltimate', 'xx_meteor', 2.35);
        } else if (this.phase === 2 && dist < 9.5 && roll < 0.58) {
          this.enterMove('bloodDance', 'xx_dance', 1.48);
        } else if (this.phase === 2 && dist < 7.5 && roll < 0.76) {
          this.enterMove('iceFireSplit', 'xx_palm', 1.28);
        } else if (dist > 8.5) {
          if (roll < 0.52) {
            this.enterMove('healPunish', 'xx_thrust', 0.88);
          } else {
            this.enterMove('swordRain', 'xx_swordRain', 1.32);
          }
        } else if (dist < 3.4 && roll < 0.28) {
          this.enterMove('frostPalm', 'xx_palm', 1.05);
        } else {
          this.enterMove('combo1', 'xx_combo1', 0.78);
        }
      } else {
        // Prowl / circle with Grandmaster poise
        const dir = toPlayer.clone().normalize();
        const right = new THREE.Vector3(-dir.z, 0, dir.x);
        const approach = dist > 4.2 ? 4.8 : 0.8;
        const move = dir.multiplyScalar(approach).addScaledVector(right, this.strafeDir * 2.1);
        planarSpeed = move.length();
        this.pos.addScaledVector(move, dt);
        this.clampInsideArena();
      }
    } else if (this.state === 'combo1') {
      // 羲和三叠浪 Hit 1 (Fast slash)
      this.stateTimer += dt;
      const p = this.stateTimer / this.stateDuration;
      this.rig.clipProgress = p;
      if (p < 0.4) this.yaw = Math.atan2(-toPlayer.x, -toPlayer.z);
      if (p >= 0.25 && p <= 0.55) {
        const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
        this.pos.addScaledVector(fwd, 5.2 * dt);
        this.clampInsideArena();
      }
      if (p >= 0.52 && !this.hitFlags.has(1)) {
        this.hitFlags.add(1);
        audio.playSfx('swing_light');
        this.checkMeleeStrike(3.5, 0.1, 96, false, player, audio, vfx, cam, onHurtFlash);
      }
      if (this.stateTimer >= this.stateDuration) {
        if (dist < 6.0) {
          this.enterMove('combo2', 'xx_combo2', 0.76);
        } else {
          this.state = 'neutral';
          this.cooldown = 0.7;
        }
      }
    } else if (this.state === 'combo2') {
      // 羲和三叠浪 Hit 2 (Fast backhand) -> Chains into Delayed Overhead Slam!
      this.stateTimer += dt;
      const p = this.stateTimer / this.stateDuration;
      this.rig.clipProgress = p;
      if (p < 0.38) this.yaw = Math.atan2(-toPlayer.x, -toPlayer.z);
      if (p >= 0.50 && !this.hitFlags.has(1)) {
        this.hitFlags.add(1);
        audio.playSfx('swing_light');
        this.checkMeleeStrike(3.5, 0.08, 105, false, player, audio, vfx, cam, onHurtFlash);
      }
      if (this.stateTimer >= this.stateDuration) {
        this.enterMove('delaySlam', 'xx_delaySlam', 1.46);
      }
    } else if (this.state === 'delaySlam') {
      // Classic Elden Ring Delayed Attack! Hoists blazing blade 0..0.56, tracks player, then SLAMS at 0.72!
      this.stateTimer += dt;
      const p = this.stateTimer / this.stateDuration;
      this.rig.clipProgress = p;

      if (p < 0.56) {
        this.yaw = Math.atan2(-toPlayer.x, -toPlayer.z);
      }
      if (p >= 0.56 && p <= 0.74) {
        const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
        this.pos.addScaledVector(fwd, 7.5 * dt);
        this.clampInsideArena();
      }
      if (p >= 0.72 && !this.hitFlags.has(1)) {
        this.hitFlags.add(1);
        audio.playSfx('swing_heavy');
        cam.addShake(0.24, 0.25);
        const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
        const impact = this.pos.clone().addScaledVector(fwd, 2.2);
        vfx.spawnShockwaveRing(impact, 0.4, 4.2, 0.32, new THREE.Color(2.3, 0.7, 0.2), 0);
        this.checkMeleeStrike(3.9, 0.15, 148, false, player, audio, vfx, cam, onHurtFlash);
      }
      if (this.stateTimer >= this.stateDuration) {
        this.state = 'neutral';
        this.cooldown = 1.15; // Generous punish window after dodging the delayed slam!
        this.strafeDir *= -1;
      }
    } else if (this.state === 'healPunish') {
      // High-speed Yang-Flame Gap-Closing Thrust!
      this.stateTimer += dt;
      const p = this.stateTimer / this.stateDuration;
      this.rig.clipProgress = p;

      if (p < 0.34) {
        this.yaw = Math.atan2(-toPlayer.x, -toPlayer.z);
      }
      if (p >= 0.24 && p <= 0.54) {
        const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
        const rushSpd = Math.min(22.0, Math.max(0, dist - 1.5) * 6.5);
        this.pos.addScaledVector(fwd, rushSpd * dt);
        this.clampInsideArena();
      }
      if (p >= 0.46 && !this.hitFlags.has(1)) {
        this.hitFlags.add(1);
        audio.playSfx('swing_heavy');
        this.checkMeleeStrike(3.8, 0.2, 122, false, player, audio, vfx, cam, onHurtFlash);
      }
      if (this.stateTimer >= this.stateDuration) {
        this.state = 'neutral';
        this.cooldown = 0.95;
      }
    } else if (this.state === 'frostPalm') {
      // Close-range Frost-Pulse Palm + Delayed Ice Burst
      this.stateTimer += dt;
      const p = this.stateTimer / this.stateDuration;
      this.rig.clipProgress = p;
      if (p >= 0.54 && !this.hitFlags.has(1)) {
        this.hitFlags.add(1);
        audio.playSfx('swing_heavy');
        vfx.spawnShockwaveRing(this.pos, 0.5, 4.6, 0.34, new THREE.Color(0.5, 1.8, 2.5), 0);
        if (dist <= 4.3) {
          player.receiveAttack(95, this.pos, false, audio, vfx, cam, onHurtFlash, this);
        }
        vfx.spawnDelayedGroundBurst(player.pos.clone(), 0.75, 3.0, 105, 35, false, false);
      }
      if (this.stateTimer >= this.stateDuration) {
        this.state = 'neutral';
        this.cooldown = 1.0;
      }
    } else if (this.state === 'swordRain') {
      // Summon 5 Floating Spirit Swords in an arc overhead!
      this.stateTimer += dt;
      const p = this.stateTimer / this.stateDuration;
      this.rig.clipProgress = p;
      this.yaw = Math.atan2(-toPlayer.x, -toPlayer.z);

      if (p >= 0.56 && !this.hitFlags.has(1)) {
        this.hitFlags.add(1);
        audio.playSfx('bow_release');
        const count = this.phase === 2 ? 7 : 5;
        for (let i = 0; i < count; i++) {
          const spread = (i - (count - 1) / 2) * 0.14;
          const origin = this.pos.clone().add(new THREE.Vector3((i - 2) * 0.65, 2.8 + (i % 2) * 0.4, 0));
          const aim = player.pos
            .clone()
            .add(new THREE.Vector3(0, 1.05, 0))
            .sub(origin)
            .normalize();
          aim.applyAxisAngle(new THREE.Vector3(0, 1, 0), spread);
          vfx.spawnProjectile(
            origin,
            aim.multiplyScalar(this.phase === 2 ? 20.5 : 17.5),
            76,
            22,
            false,
            this.phase === 2 ? 'xihe_sword' : 'frost_sword'
          );
        }
      }
      if (this.stateTimer >= this.stateDuration) {
        this.state = 'neutral';
        this.cooldown = 1.1;
      }
    } else if (this.state === 'bloodDance') {
      // Phase 2: 3-Burst Advancing Flame Sword Dance leaving delayed fire runes!
      this.stateTimer += dt;
      const p = this.stateTimer / this.stateDuration;
      this.rig.clipProgress = p;

      if (p < 0.75) {
        const targetYaw = Math.atan2(-toPlayer.x, -toPlayer.z);
        let diff = targetYaw - this.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.yaw += diff * Math.min(1, dt * 8);

        const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
        this.pos.addScaledVector(fwd, 7.8 * dt);
        this.clampInsideArena();
      }

      const strikes = [0.22, 0.48, 0.76];
      strikes.forEach((st, idx) => {
        if (p >= st && !this.hitFlags.has(idx + 1)) {
          this.hitFlags.add(idx + 1);
          audio.playSfx(idx === 2 ? 'swing_heavy' : 'swing_light');
          this.checkMeleeStrike(3.8, 0.05, idx === 2 ? 132 : 88, false, player, audio, vfx, cam, onHurtFlash);
          // Plant delayed exploding Xihe fire rune!
          const runePos = this.pos.clone();
          runePos.y = 10.5;
          vfx.spawnDelayedGroundBurst(runePos, 0.85, 2.8, 98, 30, false, true);
        }
      });

      if (this.stateTimer >= this.stateDuration) {
        this.state = 'neutral';
        this.cooldown = 1.3;
      }
    } else if (this.state === 'iceFireSplit') {
      // Phase 2: Inner Frost Burst -> Delayed Outer Hellfire Ring (rewards rolling INWARD!)
      this.stateTimer += dt;
      const p = this.stateTimer / this.stateDuration;
      this.rig.clipProgress = p;

      if (p >= 0.48 && !this.hitFlags.has(1)) {
        this.hitFlags.add(1);
        audio.playSfx('meteor_boom');
        vfx.spawnShockwaveRing(this.pos, 0.5, 4.5, 0.32, new THREE.Color(0.5, 1.85, 2.5), 0);
        if (dist <= 4.3) {
          player.receiveAttack(105, this.pos, false, audio, vfx, cam, onHurtFlash, this);
        }
        // Spawn 6 outer ring fire runes at R = 6.8m (safe inside close range!)
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const rPos = new THREE.Vector3(this.pos.x + Math.cos(a) * 6.8, 10.5, this.pos.z + Math.sin(a) * 6.8);
          vfx.spawnDelayedGroundBurst(rPos, 0.72, 3.2, 118, 40, false, true);
        }
      }
      if (this.stateTimer >= this.stateDuration) {
        this.state = 'neutral';
        this.cooldown = 1.15;
      }
    } else if (this.state === 'meteorUltimate') {
      // Phase 2 Signature Ultimate:【羲和焚天】
      // 0..0.48: Ascend 8.5m into the sky wreathed in crimson solar fire!
      // 0.48..0.68: Meteor dive onto locked arena target!
      // 0.68 & 0.84: Unleash TWO sequential Jump-Dodgeable Hellfire Shockwave Rings!
      this.stateTimer += dt;
      const p = THREE.MathUtils.clamp(this.stateTimer / this.stateDuration, 0, 1);
      this.rig.clipProgress = p;

      if (p < 0.48) {
        const u = p / 0.48;
        this.pos.y = 10.5 + Math.sin(u * Math.PI * 0.5) * 8.2;
        this.meteorTargetPos.lerp(new THREE.Vector3(player.pos.x, 10.5, player.pos.z), dt * 4.5);
        // Clamp target within arena
        const dx = this.meteorTargetPos.x - this.arenaCenter.x;
        const dz = this.meteorTargetPos.z - this.arenaCenter.z;
        const d = Math.hypot(dx, dz);
        if (d > 18) {
          this.meteorTargetPos.x = this.arenaCenter.x + (dx / d) * 18;
          this.meteorTargetPos.z = this.arenaCenter.z + (dz / d) * 18;
        }
        this.yaw = Math.atan2(-toPlayer.x, -toPlayer.z);
      } else if (p < 0.68) {
        const u = (p - 0.48) / 0.20;
        const divePos = new THREE.Vector3().lerpVectors(
          new THREE.Vector3(this.meteorStartPos.x, 18.7, this.meteorStartPos.z),
          this.meteorTargetPos,
          u * u
        );
        this.pos.copy(divePos);
      } else {
        this.pos.y = 10.5;
        if (!this.hitFlags.has(1)) {
          this.hitFlags.add(1);
          audio.playSfx('meteor_boom');
          cam.addShake(0.45, 0.45);
          vfx.spawnHitSparks(
            this.pos.clone().add(new THREE.Vector3(0, 0.8, 0)),
            new THREE.Vector3(0, 1, 0),
            65,
            new THREE.Color(2.5, 0.85, 0.2)
          );
          // Direct impact hit if right under the meteor without i-frames
          if (dist <= 3.8) {
            player.receiveAttack(165, this.pos, true, audio, vfx, cam, onHurtFlash, this);
          }
          // Expanding Hellfire Ring #1 (Jump over with Space!)
          vfx.spawnShockwaveRing(this.pos, 1.2, 22.0, 1.05, new THREE.Color(2.4, 0.62, 0.14), 108);
        }

        if (p >= 0.83 && !this.hitFlags.has(2)) {
          this.hitFlags.add(2);
          audio.playSfx('swing_heavy');
          // Expanding Hellfire Ring #2!
          vfx.spawnShockwaveRing(this.pos, 1.0, 20.0, 1.0, new THREE.Color(2.2, 0.95, 0.22), 95);
        }
      }

      if (this.stateTimer >= this.stateDuration) {
        this.pos.y = 10.5;
        this.state = 'neutral';
        this.cooldown = 1.65; // Big rewarding punish window if player jumped the fire rings!
      }
    }

    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.yaw + Math.PI;
    this.rig.updateAnimation(dt, planarSpeed, true);

    if (this.rig.weapon) {
      const bPos = new THREE.Vector3();
      const tPos = new THREE.Vector3();
      this.rig.weapon.basePoint.getWorldPosition(bPos);
      this.rig.weapon.tipPoint.getWorldPosition(tPos);
      const swinging =
        this.state === 'combo1' ||
        this.state === 'combo2' ||
        (this.state === 'delaySlam' && this.rig.clipProgress > 0.5) ||
        this.state === 'healPunish' ||
        this.state === 'bloodDance' ||
        this.state === 'meteorUltimate';
      this.trail.update(dt, elapsed, bPos, tPos, swinging);
    }

    this.auraLight.position.set(this.pos.x, this.pos.y + 2.1, this.pos.z);
  }
}
