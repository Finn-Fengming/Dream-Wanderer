import * as THREE from 'three';
import { SoulsCamera } from '../camera/soulsCamera';
import { getMoveAxes, keys, mouse, pressed, released } from '../core/input';
import { QionghuaWorld } from '../world/qionghuaWorld';
import { ActionClipName, XianxiaCharacterRig } from '../entities/xianxiaRig';
import { CombatVfxManager, SwordRibbonTrail } from '../vfx/combatVfx';
import { HuimengAudioEngine } from '../audio/huimengAudio';

export interface DamageableTarget {
  id: string;
  name: string;
  pos: THREE.Vector3;
  yaw: number;
  radius: number;
  hp: number;
  maxHp: number;
  poise: number;
  maxPoise: number;
  alive: boolean;
  isStaggeredKneeling: boolean;
  isBoss?: boolean;
  takeHit: (
    dmg: number,
    poiseDmg: number,
    knockDir: THREE.Vector3,
    isHeavy: boolean,
    isParryBreak?: boolean
  ) => 'hit' | 'blocked' | 'staggered' | 'killed';
}

interface ActiveMoveSpec {
  clip: ActionClipName;
  duration: number;
  hitStart: number;
  hitEnd: number;
  damage: number;
  poiseDamage: number;
  reach: number;
  arcCos: number;
  lungeSpeed: number;
  isHeavy: boolean;
  canChainNext?: boolean;
}

const MOVE_SPECS: Record<string, ActiveMoveSpec> = {
  light1: {
    clip: 'light1',
    duration: 0.54,
    hitStart: 0.34,
    hitEnd: 0.58,
    damage: 78,
    poiseDamage: 24,
    reach: 2.75,
    arcCos: 0.2,
    lungeSpeed: 5.5,
    isHeavy: false,
    canChainNext: true,
  },
  light2: {
    clip: 'light2',
    duration: 0.52,
    hitStart: 0.32,
    hitEnd: 0.56,
    damage: 88,
    poiseDamage: 28,
    reach: 2.8,
    arcCos: 0.15,
    lungeSpeed: 5.2,
    isHeavy: false,
    canChainNext: true,
  },
  light3: {
    clip: 'light3',
    duration: 0.68,
    hitStart: 0.38,
    hitEnd: 0.62,
    damage: 125,
    poiseDamage: 46,
    reach: 3.1,
    arcCos: 0.25,
    lungeSpeed: 7.2,
    isHeavy: true,
    canChainNext: false,
  },
  heavy: {
    clip: 'heavy',
    duration: 0.78,
    hitStart: 0.48,
    hitEnd: 0.68,
    damage: 176,
    poiseDamage: 78,
    reach: 3.2,
    arcCos: 0.25,
    lungeSpeed: 6.8,
    isHeavy: true,
  },
  jumpSlash: {
    clip: 'jumpSlash',
    duration: 0.66,
    hitStart: 0.38,
    hitEnd: 0.68,
    damage: 158,
    poiseDamage: 74,
    reach: 3.15,
    arcCos: 0.15,
    lungeSpeed: 5.5,
    isHeavy: true,
  },
  guardCounter: {
    clip: 'guardCounter',
    duration: 0.64,
    hitStart: 0.34,
    hitEnd: 0.58,
    damage: 168,
    poiseDamage: 88,
    reach: 3.15,
    arcCos: 0.1,
    lungeSpeed: 6.5,
    isHeavy: true,
  },
  skill_rush: {
    clip: 'skill_rush',
    duration: 0.74,
    hitStart: 0.36,
    hitEnd: 0.66,
    damage: 205,
    poiseDamage: 68,
    reach: 3.4,
    arcCos: -0.1,
    lungeSpeed: 15.5,
    isHeavy: true,
  },
};

export class PlayerController {
  public rig: XianxiaCharacterRig;
  public swordTrail: SwordRibbonTrail;
  public charLight: THREE.PointLight;

  public pos = new THREE.Vector3(0, 0, 76.0);
  public yaw = 0; // 0 = facing -Z (North)
  public velY = 0;
  public grounded = true;
  public groundY = 0;

  // Core RPG Stats (精 / 神 / 气)
  public level = 1;
  public lingyun = 0;
  public hp = 620;
  public maxHp = 620;
  public fp = 120;
  public maxFp = 120;
  public stamina = 140;
  public maxStamina = 140;
  public attackBonus = 1.0;

  public crimsonFlasks = 5;
  public maxCrimsonFlasks = 5;
  public ceruleanFlasks = 2;
  public maxCeruleanFlasks = 2;
  public activeFlask: 'crimson' | 'cerulean' = 'crimson';
  public activeSkill: 'rush' | 'bow' = 'rush';
  public hasWangshuCharm = false;
  public spiritContractUnlocked = false;
  public spiritSummonedThisFight = false;
  public godMode = false;

  // Combat & Action States
  public state:
    | 'free'
    | 'attack'
    | 'dodge'
    | 'parry'
    | 'drink'
    | 'skill_bow'
    | 'riposte'
    | 'hurt'
    | 'dead' = 'free';
  public stateTimer = 0;
  public stateDuration = 0;
  public currentMoveKey = 'light1';
  public comboStep = 0;
  public comboResetTimer = 0;

  public hitStopTimer = 0;
  public iframeTimer = 0;
  public postHurtIframe = 0;
  public staminaRegenDelay = 0;
  public guardCounterWindow = 0;
  public parryActiveTimer = 0;
  public drinkHealed = false;
  public bowFired = false;
  public rushBurstSpawned = false;
  public justStartedDrinking = false;

  private hitTargetsThisSwing = new Set<string>();
  private bufferedAction: 'none' | 'light' | 'heavy' | 'dodge' | 'skill' = 'none';
  private dodgeDir = new THREE.Vector3(0, 0, -1);
  private riposteTarget: DamageableTarget | null = null;
  private riposteDealt = false;
  private shiftDownTime = 0;

  constructor(scene: THREE.Scene) {
    this.rig = new XianxiaCharacterRig('tianhe');
    // Character model faces +Z locally; yaw=0 faces -Z in world, so rotate root by yaw + Math.PI
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = Math.PI;
    scene.add(this.rig.root);

    this.swordTrail = new SwordRibbonTrail(
      scene,
      new THREE.Color(1.25, 2.05, 2.5),
      new THREE.Color(0.2, 0.78, 1.45),
      22
    );

    // Subtle character rim/fill light so Yun Tianhe & nearby enemies always read clearly in twilight shadows
    this.charLight = new THREE.PointLight(0x9fd8ff, 0.95, 9.5, 1.6);
    this.charLight.position.set(0, 2.3, 0);
    scene.add(this.charLight);
  }

  public resetAtPosition(pos: THREE.Vector3, yaw = 0, fullRestore = true) {
    this.pos.copy(pos);
    this.groundY = pos.y;
    this.velY = 0;
    this.grounded = true;
    this.yaw = yaw;
    this.state = 'free';
    this.rig.activeClip = 'none';
    this.rig.clipProgress = 0;
    this.hitStopTimer = 0;
    this.iframeTimer = 0;
    this.guardCounterWindow = 0;
    this.bufferedAction = 'none';
    this.swordTrail.clear();

    if (fullRestore) {
      this.hp = this.maxHp;
      this.fp = this.maxFp;
      this.stamina = this.maxStamina;
      this.crimsonFlasks = this.maxCrimsonFlasks;
      this.ceruleanFlasks = this.maxCeruleanFlasks;
    }
  }

  private consumeStamina(cost: number): boolean {
    const actual = this.hasWangshuCharm ? cost * 0.85 : cost;
    if (this.stamina <= 2) return false;
    this.stamina = Math.max(0, this.stamina - actual);
    this.staminaRegenDelay = 0.44;
    return true;
  }

  public getForwardDir(): THREE.Vector3 {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
  }

  private startDodge(cam: SoulsCamera, audio: HuimengAudioEngine, vfx: CombatVfxManager) {
    if (!this.consumeStamina(22)) return;
    const axes = getMoveAxes();
    const { forward, right } = cam.getPlanarBasis();
    const moveVec = new THREE.Vector3()
      .addScaledVector(forward, -axes.z)
      .addScaledVector(right, axes.x);

    if (moveVec.lengthSq() > 0.04) {
      moveVec.normalize();
      this.dodgeDir.copy(moveVec);
      this.yaw = Math.atan2(-moveVec.x, -moveVec.z);
    } else {
      this.dodgeDir.copy(this.getForwardDir());
    }

    this.state = 'dodge';
    this.stateTimer = 0;
    this.stateDuration = 0.48;
    this.iframeTimer = 0.35; // Crisp Elden Ring dodge i-frames!
    this.hitStopTimer = 0;   // Dodge immediately breaks hit-stop too
    this.rig.isChargingHeavy = false;
    this.rig.isBlocking = false;
    this.rig.activeClip = 'dodge';
    this.rig.clipProgress = 0;
    this.bufferedAction = 'none';

    audio.playSfx('swing_light');
    vfx.spawnHitSparks(
      this.pos.clone().add(new THREE.Vector3(0, 0.35, 0)),
      this.dodgeDir.clone().negate(),
      10,
      new THREE.Color(0.45, 1.55, 2.2)
    );
  }

  private startMove(
    moveKey: string,
    targets: DamageableTarget[],
    lockedTarget: DamageableTarget | null,
    audio: HuimengAudioEngine
  ) {
    const spec = MOVE_SPECS[moveKey];
    if (!spec) return;
    if (!this.consumeStamina(spec.isHeavy ? 28 : 16)) return;

    // Attack Magnetism: snap yaw toward locked target or best nearby enemy in front cone!
    let bestTarget = lockedTarget && lockedTarget.alive ? lockedTarget : null;
    if (!bestTarget) {
      const fwd = this.getForwardDir();
      let bestScore = 999;
      for (const t of targets) {
        if (!t.alive) continue;
        const toT = new THREE.Vector3().subVectors(t.pos, this.pos);
        toT.y = 0;
        const d = toT.length();
        if (d < 5.8 && d > 0.05) {
          const dot = toT.normalize().dot(fwd);
          if (dot > -0.15) {
            const score = d - dot * 2.0;
            if (score < bestScore) {
              bestScore = score;
              bestTarget = t;
            }
          }
        }
      }
    }
    if (bestTarget) {
      const dx = bestTarget.pos.x - this.pos.x;
      const dz = bestTarget.pos.z - this.pos.z;
      this.yaw = Math.atan2(-dx, -dz);
    }

    this.state = 'attack';
    this.currentMoveKey = moveKey;
    this.stateTimer = 0;
    this.stateDuration = spec.duration;
    this.rig.activeClip = spec.clip;
    this.rig.clipProgress = 0;
    this.rig.isChargingHeavy = false;
    this.hitTargetsThisSwing.clear();
    this.rushBurstSpawned = false;
    this.bufferedAction = 'none';

    audio.playSfx(spec.isHeavy ? 'swing_heavy' : 'swing_light');
  }

  private tryTriggerRiposte(
    targets: DamageableTarget[],
    audio: HuimengAudioEngine,
    cam: SoulsCamera
  ): boolean {
    for (const t of targets) {
      if (!t.alive || !t.isStaggeredKneeling) continue;
      const d = Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
      if (d <= t.radius + 2.4) {
        // Snap cleanly in front of kneeling target for cinematic【御剑贯心】execution!
        const dirFromTarget = new THREE.Vector3(this.pos.x - t.pos.x, 0, this.pos.z - t.pos.z);
        if (dirFromTarget.lengthSq() < 0.01) dirFromTarget.set(0, 0, 1);
        dirFromTarget.normalize();

        this.pos.x = t.pos.x + dirFromTarget.x * (t.radius + 1.05);
        this.pos.z = t.pos.z + dirFromTarget.z * (t.radius + 1.05);
        this.yaw = Math.atan2(-(t.pos.x - this.pos.x), -(t.pos.z - this.pos.z));

        this.state = 'riposte';
        this.stateTimer = 0;
        this.stateDuration = 0.96;
        this.iframeTimer = 1.05;
        this.riposteTarget = t;
        this.riposteDealt = false;
        this.rig.activeClip = 'riposte';
        this.rig.clipProgress = 0;
        audio.playSfx('guard_counter');
        cam.addShake(0.14, 0.25);
        return true;
      }
    }
    return false;
  }

  public receiveAttack(
    rawDamage: number,
    attackerPos: THREE.Vector3,
    unblockable: boolean,
    audio: HuimengAudioEngine,
    vfx: CombatVfxManager,
    cam: SoulsCamera,
    onHurtFlash: () => void,
    attackerRef?: DamageableTarget
  ): 'dodged' | 'parried' | 'blocked' | 'hit' {
    if (this.state === 'dead') return 'dodged';
    if (this.iframeTimer > 0 || this.postHurtIframe > 0) {
      return 'dodged';
    }

    // 1. Check Active Sword-Qi Parry Window (`KeyQ`, 0.26s)!
    if (!unblockable && this.parryActiveTimer > 0) {
      audio.playSfx('parry_clang');
      cam.addShake(0.28, 0.28);
      this.guardCounterWindow = 1.25;
      const sparkPos = this.pos.clone().add(new THREE.Vector3(0, 1.25, 0));
      vfx.spawnHitSparks(sparkPos, new THREE.Vector3(0, 1, 0), 32, new THREE.Color(2.4, 2.0, 0.8));
      vfx.spawnShockwaveRing(this.pos, 0.4, 3.6, 0.28, new THREE.Color(1.4, 2.1, 2.5), 0);
      if (attackerRef) {
        attackerRef.takeHit(35, 95, new THREE.Vector3(), true, true);
      }
      return 'parried';
    }

    // 2. Check Frontal Sword Block (`RMB` / `KeyK`)
    const toAttacker = new THREE.Vector3(attackerPos.x - this.pos.x, 0, attackerPos.z - this.pos.z).normalize();
    const facingDot = toAttacker.dot(this.getForwardDir());
    if (!unblockable && this.rig.isBlocking && facingDot > -0.15) {
      const stamCost = rawDamage * 0.32;
      this.stamina -= stamCost;
      this.staminaRegenDelay = 0.55;
      const chipDmg = this.godMode ? 0 : Math.round(rawDamage * 0.14);
      this.hp = Math.max(1, this.hp - chipDmg);

      if (this.stamina > 0) {
        this.guardCounterWindow = 0.92; // Open Elden Ring Guard Counter Window!
        audio.playSfx('guard_block');
        cam.addShake(0.14, 0.16);
        vfx.spawnHitSparks(
          this.pos.clone().add(new THREE.Vector3(0, 1.2, 0)).addScaledVector(toAttacker, 0.5),
          toAttacker,
          18,
          new THREE.Color(1.8, 1.9, 2.3)
        );
        return 'blocked';
      } else {
        this.stamina = 0;
        audio.playSfx('poise_break');
      }
    }

    // 3. Direct Hit!
    const finalDmg = this.godMode ? 0 : Math.round(rawDamage);
    this.hp = Math.max(0, this.hp - finalDmg);
    this.postHurtIframe = 0.48;
    this.rig.flashHit(0.14);
    this.rig.isChargingHeavy = false;
    onHurtFlash();
    cam.addShake(0.24, 0.24);
    audio.playSfx('hit_heavy');

    vfx.spawnHitSparks(
      this.pos.clone().add(new THREE.Vector3(0, 1.15, 0)),
      toAttacker.clone().negate(),
      20,
      new THREE.Color(2.2, 0.35, 0.2)
    );

    if (this.hp <= 0 && !this.godMode) {
      this.state = 'dead';
      this.stateTimer = 0;
      this.stateDuration = 2.4;
      this.rig.activeClip = 'death';
      this.rig.clipProgress = 0;
    } else if (this.state !== 'riposte') {
      this.state = 'hurt';
      this.stateTimer = 0;
      this.stateDuration = 0.34;
      this.rig.activeClip = 'hurt';
      this.rig.clipProgress = 0;
    }
    return 'hit';
  }

  public update(
    dt: number,
    elapsed: number,
    world: QionghuaWorld,
    cam: SoulsCamera,
    targets: DamageableTarget[],
    lockedTarget: DamageableTarget | null,
    vfx: CombatVfxManager,
    audio: HuimengAudioEngine,
    controlsLockedOut = false
  ) {
    this.justStartedDrinking = false;

    // Timers that tick regardless of hit-stop
    if (this.iframeTimer > 0) this.iframeTimer = Math.max(0, this.iframeTimer - dt);
    if (this.postHurtIframe > 0) this.postHurtIframe = Math.max(0, this.postHurtIframe - dt);
    if (this.guardCounterWindow > 0) this.guardCounterWindow = Math.max(0, this.guardCounterWindow - dt);
    if (this.parryActiveTimer > 0) this.parryActiveTimer = Math.max(0, this.parryActiveTimer - dt);
    if (this.comboResetTimer > 0) {
      this.comboResetTimer -= dt;
      if (this.comboResetTimer <= 0) this.comboStep = 0;
    }

    // Buffer inputs even during hit-stop or late move frames so controls feel hyper-responsive!
    if (!controlsLockedOut && this.state !== 'dead') {
      if (pressed.has('ShiftLeft') || pressed.has('ShiftRight')) {
        this.shiftDownTime = performance.now();
      }
      const dodgeTapped =
        pressed.has('KeyL') ||
        ((released.has('ShiftLeft') || released.has('ShiftRight')) &&
          performance.now() - this.shiftDownTime < 260) ||
        (pressed.has('ShiftLeft') && this.state !== 'free');

      if (dodgeTapped) {
        this.bufferedAction = 'dodge';
      } else if (pressed.has('KeyH')) {
        this.bufferedAction = 'heavy';
      } else if (pressed.has('KeyF')) {
        this.bufferedAction = 'skill';
      } else if (pressed.has('LMB') || pressed.has('KeyJ')) {
        this.bufferedAction = 'light';
      }

      // Quick equipment toggles
      if (pressed.has('KeyC')) {
        this.activeFlask = this.activeFlask === 'crimson' ? 'cerulean' : 'crimson';
      }
      if (pressed.has('Tab') || pressed.has('Digit1') || pressed.has('Digit2')) {
        if (pressed.has('Digit1')) this.activeSkill = 'rush';
        else if (pressed.has('Digit2')) this.activeSkill = 'bow';
        else this.activeSkill = this.activeSkill === 'rush' ? 'bow' : 'rush';
      }
    }

    // Highest-priority Dodge Cancel (can cancel attack recovery, drink, block, charge, AND hit-stop!)
    if (
      !controlsLockedOut &&
      this.bufferedAction === 'dodge' &&
      this.state !== 'dead' &&
      this.state !== 'hurt' &&
      this.state !== 'riposte' &&
      !(this.state === 'dodge' && this.stateTimer < 0.34)
    ) {
      this.startDodge(cam, audio, vfx);
    }

    // Per-character Hit-Stop freeze
    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= dt;
      this.charLight.position.set(this.pos.x, this.pos.y + 2.2, this.pos.z);
      return;
    }

    // Stamina Regeneration
    if (this.staminaRegenDelay > 0) {
      this.staminaRegenDelay -= dt;
    } else if (this.state === 'free') {
      const rate = this.rig.isBlocking ? 16 : 52;
      this.stamina = Math.min(this.maxStamina, this.stamina + rate * dt);
    }

    let planarSpeed = 0;
    let strafeDir = 0;

    // Vertical Jump & Gravity Physics
    if (!this.grounded || this.velY > 0) {
      this.velY -= 20.5 * dt;
      this.pos.y += this.velY * dt;
      if (this.pos.y <= this.groundY) {
        this.pos.y = this.groundY;
        this.velY = 0;
        this.grounded = true;
      }
    } else {
      this.pos.y = THREE.MathUtils.lerp(this.pos.y, this.groundY, Math.min(1, dt * 18));
    }

    // Check Jump-Dodgeable Expanding Shockwave Rings from Boss / Golem!
    for (const r of vfx.rings) {
      if (!r.isDamageWave || r.hitPlayerAlready || !r.waveCenter) continue;
      const curRadius = r.mesh.scale.x;
      const dist = Math.hypot(this.pos.x - r.waveCenter.x, this.pos.z - r.waveCenter.z);
      if (Math.abs(dist - curRadius) < 0.85) {
        // Jumping above +0.42m cleanly vaults over the shockwave!
        const jumpHeightAboveFloor = this.pos.y - this.groundY;
        if (jumpHeightAboveFloor < 0.42) {
          r.hitPlayerAlready = true;
          this.receiveAttack(r.waveDamage ?? 90, r.waveCenter, true, audio, vfx, cam, () => {});
        }
      }
    }

    // State Machine Execution
    if (this.state === 'free' && !controlsLockedOut) {
      this.rig.activeClip = 'none';
      this.rig.clipProgress = 0;
      this.rig.isBlocking = keys.has('RMB') || keys.has('KeyK');

      // Check LMB hold -> Charged Heavy Slash!
      const holdingLmb = keys.has('LMB') && !mouse.lmbChargedTriggered;
      if (holdingLmb && performance.now() - mouse.lmbDownTime > 250 && this.grounded) {
        this.rig.isChargingHeavy = true;
        if (performance.now() - mouse.lmbDownTime > 580) {
          mouse.lmbChargedTriggered = true;
          this.bufferedAction = 'heavy';
        }
      } else if (!keys.has('LMB') && this.rig.isChargingHeavy) {
        this.rig.isChargingHeavy = false;
        this.bufferedAction = 'heavy';
      }

      // Jump (`Space`)
      if (pressed.has('Space') && this.grounded && this.consumeStamina(12)) {
        this.velY = 7.8;
        this.grounded = false;
        audio.playSfx('swing_light');
      }

      // Sword-Qi Parry (`KeyQ`)
      if (pressed.has('KeyQ') && this.grounded && this.consumeStamina(14)) {
        this.state = 'parry';
        this.stateTimer = 0;
        this.stateDuration = 0.44;
        this.parryActiveTimer = 0.26;
        this.rig.activeClip = 'parry';
        this.rig.isBlocking = false;
        audio.playSfx('swing_light');
      }
      // Drink Flask (`KeyR`)
      else if (pressed.has('KeyR') && this.grounded) {
        const canCrimson = this.activeFlask === 'crimson' && this.crimsonFlasks > 0;
        const canCerulean = this.activeFlask === 'cerulean' && this.ceruleanFlasks > 0;
        if (canCrimson || canCerulean) {
          this.state = 'drink';
          this.stateTimer = 0;
          this.stateDuration = 0.78;
          this.drinkHealed = false;
          this.justStartedDrinking = true;
          this.rig.activeClip = 'drink';
          this.rig.isBlocking = false;
        }
      }
      // Ash of War / 天河剑诀 (`KeyF`)
      else if (this.bufferedAction === 'skill') {
        this.bufferedAction = 'none';
        if (this.activeSkill === 'rush' && this.fp >= 18) {
          this.fp -= 18;
          this.startMove('skill_rush', targets, lockedTarget, audio);
        } else if (this.activeSkill === 'bow' && this.fp >= 22) {
          this.fp -= 22;
          if (lockedTarget && lockedTarget.alive) {
            this.yaw = Math.atan2(-(lockedTarget.pos.x - this.pos.x), -(lockedTarget.pos.z - this.pos.z));
          } else {
            this.yaw = cam.yaw;
          }
          this.state = 'skill_bow';
          this.stateTimer = 0;
          this.stateDuration = 0.84;
          this.bowFired = false;
          this.rig.activeClip = 'skill_bow';
          this.rig.isBlocking = false;
          audio.playSfx('swing_heavy');
        }
      }
      // Heavy Attack or Guard Counter!
      else if (this.bufferedAction === 'heavy') {
        this.bufferedAction = 'none';
        if (this.guardCounterWindow > 0) {
          this.guardCounterWindow = 0;
          audio.playSfx('guard_counter');
          this.startMove('guardCounter', targets, lockedTarget, audio);
        } else if (!this.grounded) {
          this.startMove('jumpSlash', targets, lockedTarget, audio);
        } else {
          this.startMove('heavy', targets, lockedTarget, audio);
        }
      }
      // Light Attack / Riposte / Guard Counter / Jump Slash!
      else if (this.bufferedAction === 'light') {
        this.bufferedAction = 'none';
        if (!this.tryTriggerRiposte(targets, audio, cam)) {
          if (this.guardCounterWindow > 0) {
            this.guardCounterWindow = 0;
            audio.playSfx('guard_counter');
            this.startMove('guardCounter', targets, lockedTarget, audio);
          } else if (!this.grounded) {
            this.startMove('jumpSlash', targets, lockedTarget, audio);
          } else {
            const nextKey =
              this.comboStep === 0 ? 'light1' : this.comboStep === 1 ? 'light2' : 'light3';
            this.comboStep = (this.comboStep + 1) % 3;
            this.comboResetTimer = 1.25;
            this.startMove(nextKey, targets, lockedTarget, audio);
          }
        }
      }

      // Free Movement if still in 'free'
      if (this.state === 'free') {
        const axes = getMoveAxes();
        const { forward, right } = cam.getPlanarBasis();
        const moveVec = new THREE.Vector3()
          .addScaledVector(forward, -axes.z)
          .addScaledVector(right, axes.x);

        const sprinting =
          (keys.has('ShiftLeft') || keys.has('ShiftRight')) &&
          performance.now() - this.shiftDownTime >= 220 &&
          moveVec.lengthSq() > 0.05 &&
          !this.rig.isBlocking &&
          this.stamina > 5;

        if (sprinting) {
          this.stamina = Math.max(0, this.stamina - 16 * dt);
          this.staminaRegenDelay = 0.35;
        }

        const baseSpeed = this.rig.isBlocking
          ? 3.4
          : this.rig.isChargingHeavy
            ? 2.4
            : sprinting
              ? 8.8
              : 5.9;

        if (moveVec.lengthSq() > 0.01) {
          moveVec.normalize();
          planarSpeed = baseSpeed;
          const desiredX = this.pos.x + moveVec.x * baseSpeed * dt;
          const desiredZ = this.pos.z + moveVec.z * baseSpeed * dt;
          const res = world.resolveHorizontalMove(this.pos, desiredX, desiredZ, this.pos.y, 0.46);
          this.pos.x = res.x;
          this.pos.z = res.z;
          this.groundY = res.groundY;

          if (lockedTarget && lockedTarget.alive && !sprinting) {
            this.yaw = Math.atan2(-(lockedTarget.pos.x - this.pos.x), -(lockedTarget.pos.z - this.pos.z));
            strafeDir = axes.x;
          } else {
            const targetYaw = Math.atan2(-moveVec.x, -moveVec.z);
            let diff = targetYaw - this.yaw;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            this.yaw += diff * Math.min(1, dt * 14);
          }
        } else if (lockedTarget && lockedTarget.alive) {
          this.yaw = Math.atan2(-(lockedTarget.pos.x - this.pos.x), -(lockedTarget.pos.z - this.pos.z));
        }
      }
    } else if (this.state === 'dodge') {
      this.stateTimer += dt;
      const p = this.stateTimer / this.stateDuration;
      this.rig.clipProgress = p;
      const dashSpeed = p < 0.65 ? 11.2 : 4.2;
      const res = world.resolveHorizontalMove(
        this.pos,
        this.pos.x + this.dodgeDir.x * dashSpeed * dt,
        this.pos.z + this.dodgeDir.z * dashSpeed * dt,
        this.pos.y,
        0.46
      );
      this.pos.x = res.x;
      this.pos.z = res.z;
      this.groundY = res.groundY;

      if (this.stateTimer >= this.stateDuration) {
        this.state = 'free';
      }
    } else if (this.state === 'attack') {
      this.stateTimer += dt;
      const spec = MOVE_SPECS[this.currentMoveKey];
      const p = THREE.MathUtils.clamp(this.stateTimer / this.stateDuration, 0, 1);
      this.rig.clipProgress = p;

      // Controlled Attack Lunge Magnetism (stops cleanly at reach distance, never overshoots through target!)
      if (p >= 0.18 && p <= spec.hitEnd) {
        const fwd = this.getForwardDir();
        let maxSlide = spec.lungeSpeed * dt;
        for (const t of targets) {
          if (!t.alive) continue;
          const d = Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
          const stopGap = t.radius + 1.08;
          if (d < 4.5) {
            maxSlide = Math.min(maxSlide, Math.max(0, d - stopGap));
          }
        }
        if (maxSlide > 0.001) {
          const res = world.resolveHorizontalMove(
            this.pos,
            this.pos.x + fwd.x * maxSlide,
            this.pos.z + fwd.z * maxSlide,
            this.pos.y,
            0.46
          );
          this.pos.x = res.x;
          this.pos.z = res.z;
          this.groundY = res.groundY;
        }
      }

      // Ash of War #1【狂龙迅影斩】plants a delayed frost crystal explosion!
      if (this.currentMoveKey === 'skill_rush' && p >= 0.52 && !this.rushBurstSpawned) {
        this.rushBurstSpawned = true;
        const burstSpot = this.pos.clone().addScaledVector(this.getForwardDir(), 1.6);
        burstSpot.y = this.groundY;
        vfx.spawnDelayedGroundBurst(
          burstSpot,
          0.62,
          3.4,
          Math.round(135 * this.attackBonus),
          45,
          true,
          false
        );
      }

      // Active Melee Hitbox Window
      if (p >= spec.hitStart && p <= spec.hitEnd) {
        const fwd = this.getForwardDir();
        const charmMul = this.hasWangshuCharm ? 1.18 : 1.0;
        const dmg = Math.round(spec.damage * this.attackBonus * charmMul);

        // Also allow slashing incoming enemy flying-sword projectiles out of the air!
        for (let pi = vfx.projectiles.length - 1; pi >= 0; pi--) {
          const proj = vfx.projectiles[pi];
          if (!proj.fromPlayer && proj.deflectable) {
            if (proj.pos.distanceTo(this.pos) < spec.reach + 0.6) {
              vfx.spawnHitSparks(proj.pos, fwd, 14, new THREE.Color(0.6, 1.9, 2.5));
              audio.playSfx('guard_block');
              vfx.removeProjectileAt(pi);
            }
          }
        }

        for (const t of targets) {
          if (!t.alive || this.hitTargetsThisSwing.has(t.id)) continue;
          const toT = new THREE.Vector3(t.pos.x - this.pos.x, 0, t.pos.z - this.pos.z);
          const dist = toT.length();
          if (dist <= spec.reach + t.radius) {
            const dot = dist > 0.05 ? toT.clone().normalize().dot(fwd) : 1.0;
            if (dot >= spec.arcCos) {
              this.hitTargetsThisSwing.add(t.id);
              const outcome = t.takeHit(dmg, spec.poiseDamage, fwd, spec.isHeavy);

              // Per-character Hit-Stop & Directional Sparks!
              this.hitStopTimer = spec.isHeavy ? 0.105 : 0.068;
              cam.addShake(spec.isHeavy ? 0.18 : 0.09, 0.16);
              const contact = this.pos
                .clone()
                .add(new THREE.Vector3(0, 1.2, 0))
                .addScaledVector(fwd, Math.min(dist, 1.5));

              if (outcome === 'blocked') {
                audio.playSfx('guard_block');
                vfx.spawnHitSparks(contact, fwd.clone().negate(), 16, new THREE.Color(2.0, 2.0, 2.2));
              } else if (outcome === 'staggered') {
                audio.playSfx('poise_break');
                cam.addShake(0.32, 0.34);
                vfx.spawnShockwaveRing(t.pos, 0.4, 4.2, 0.35, new THREE.Color(2.3, 1.85, 0.65), 0);
                vfx.spawnHitSparks(contact, fwd, 30, new THREE.Color(2.4, 1.9, 0.65));
              } else {
                audio.playSfx(spec.isHeavy ? 'hit_heavy' : 'hit_light');
                vfx.spawnHitSparks(contact, fwd, spec.isHeavy ? 24 : 14, new THREE.Color(0.55, 1.85, 2.5));
              }
            }
          }
        }
      }

      // Smoothly chain buffered combo attack at 74% progress
      if (p >= 0.74 && spec.canChainNext && this.bufferedAction === 'light') {
        const nextKey = this.comboStep === 1 ? 'light2' : 'light3';
        this.comboStep = (this.comboStep + 1) % 3;
        this.comboResetTimer = 1.25;
        this.startMove(nextKey, targets, lockedTarget, audio);
      } else if (this.stateTimer >= this.stateDuration) {
        this.state = 'free';
      }
    } else if (this.state === 'skill_bow') {
      // Ash of War #2:【恸天贯日式】Draw Houyi Sun-Shooting Bow & Fire Solar Piercing Bolt!
      this.stateTimer += dt;
      const p = THREE.MathUtils.clamp(this.stateTimer / this.stateDuration, 0, 1);
      this.rig.clipProgress = p;

      if (lockedTarget && lockedTarget.alive && p < 0.62) {
        this.yaw = Math.atan2(-(lockedTarget.pos.x - this.pos.x), -(lockedTarget.pos.z - this.pos.z));
      }

      if (p >= 0.62 && !this.bowFired) {
        this.bowFired = true;
        const origin = this.pos.clone().add(new THREE.Vector3(0, 1.38, 0)).addScaledVector(this.getForwardDir(), 0.7);
        let dir = this.getForwardDir();
        if (lockedTarget && lockedTarget.alive) {
          dir = new THREE.Vector3()
            .subVectors(lockedTarget.pos.clone().add(new THREE.Vector3(0, 1.15, 0)), origin)
            .normalize();
        }
        vfx.spawnProjectile(
          origin,
          dir.multiplyScalar(32.0),
          Math.round(245 * this.attackBonus),
          82,
          true,
          'solar_arrow'
        );
        vfx.spawnShockwaveRing(this.pos, 0.3, 3.2, 0.25, new THREE.Color(2.3, 1.0, 0.25), 0);
        audio.playSfx('bow_release');
        cam.addShake(0.22, 0.22);
      }

      if (this.stateTimer >= this.stateDuration) {
        this.state = 'free';
      }
    } else if (this.state === 'riposte') {
      this.stateTimer += dt;
      const p = THREE.MathUtils.clamp(this.stateTimer / this.stateDuration, 0, 1);
      this.rig.clipProgress = p;

      if (p >= 0.48 && !this.riposteDealt && this.riposteTarget && this.riposteTarget.alive) {
        this.riposteDealt = true;
        const critDmg = Math.round(360 * this.attackBonus);
        this.riposteTarget.isStaggeredKneeling = false;
        this.riposteTarget.takeHit(critDmg, 0, this.getForwardDir(), true);
        audio.playSfx('riposte_stab');
        cam.addShake(0.36, 0.35);
        vfx.spawnHitSparks(
          this.riposteTarget.pos.clone().add(new THREE.Vector3(0, 1.2, 0)),
          this.getForwardDir(),
          38,
          new THREE.Color(0.8, 2.2, 2.6)
        );
        vfx.spawnShockwaveRing(this.riposteTarget.pos, 0.5, 4.8, 0.36, new THREE.Color(0.6, 1.9, 2.5), 0);
      }

      if (this.stateTimer >= this.stateDuration) {
        this.state = 'free';
        this.riposteTarget = null;
      }
    } else if (this.state === 'drink') {
      // Authentic Elden Ring slow-walk while drinking Flask!
      this.stateTimer += dt;
      const p = THREE.MathUtils.clamp(this.stateTimer / this.stateDuration, 0, 1);
      this.rig.clipProgress = p;

      const axes = getMoveAxes();
      const { forward, right } = cam.getPlanarBasis();
      const moveVec = new THREE.Vector3().addScaledVector(forward, -axes.z).addScaledVector(right, axes.x);
      if (moveVec.lengthSq() > 0.02) {
        moveVec.normalize();
        planarSpeed = 2.1;
        const res = world.resolveHorizontalMove(
          this.pos,
          this.pos.x + moveVec.x * 2.1 * dt,
          this.pos.z + moveVec.z * 2.1 * dt,
          this.pos.y,
          0.46
        );
        this.pos.x = res.x;
        this.pos.z = res.z;
        this.groundY = res.groundY;
      }

      if (p >= 0.46 && !this.drinkHealed) {
        this.drinkHealed = true;
        if (this.activeFlask === 'crimson' && this.crimsonFlasks > 0) {
          this.crimsonFlasks--;
          this.hp = Math.min(this.maxHp, this.hp + 310);
          vfx.spawnHitSparks(
            this.pos.clone().add(new THREE.Vector3(0, 1.0, 0)),
            new THREE.Vector3(0, 1, 0),
            18,
            new THREE.Color(0.6, 2.1, 1.3)
          );
        } else if (this.activeFlask === 'cerulean' && this.ceruleanFlasks > 0) {
          this.ceruleanFlasks--;
          this.fp = Math.min(this.maxFp, this.fp + 85);
          vfx.spawnHitSparks(
            this.pos.clone().add(new THREE.Vector3(0, 1.0, 0)),
            new THREE.Vector3(0, 1, 0),
            18,
            new THREE.Color(0.5, 1.6, 2.4)
          );
        }
        audio.playSfx('heal_drink');
      }

      if (this.stateTimer >= this.stateDuration) {
        this.state = 'free';
      }
    } else if (this.state === 'parry' || this.state === 'hurt') {
      this.stateTimer += dt;
      this.rig.clipProgress = THREE.MathUtils.clamp(this.stateTimer / this.stateDuration, 0, 1);
      if (this.stateTimer >= this.stateDuration) {
        this.state = 'free';
      }
    } else if (this.state === 'dead') {
      this.stateTimer += dt;
      this.rig.clipProgress = THREE.MathUtils.clamp(this.stateTimer / 1.4, 0, 1);
    }

    // Body-to-Body Soft Separation against living enemies (except during dodge/riposte!)
    if (this.state !== 'dodge' && this.state !== 'riposte' && this.state !== 'dead') {
      for (const t of targets) {
        if (!t.alive || Math.abs(t.pos.y - this.pos.y) > 2.5) continue;
        const dx = this.pos.x - t.pos.x;
        const dz = this.pos.z - t.pos.z;
        const dist = Math.hypot(dx, dz);
        const minSep = 0.46 + t.radius;
        if (dist < minSep && dist > 0.001) {
          const push = (minSep - dist) * 0.65;
          const res = world.resolveHorizontalMove(
            this.pos,
            this.pos.x + (dx / dist) * push,
            this.pos.z + (dz / dist) * push,
            this.pos.y,
            0.46
          );
          this.pos.x = res.x;
          this.pos.z = res.z;
        }
      }
    }

    // Sync Character Rig Transform & Skeletal Animation
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.yaw + Math.PI;
    this.rig.updateAnimation(dt, planarSpeed, true, strafeDir);

    // Update Wangshu Sword Ribbon Trail
    if (this.rig.weapon && this.rig.weapon.group.visible) {
      const bPos = new THREE.Vector3();
      const tPos = new THREE.Vector3();
      this.rig.weapon.basePoint.getWorldPosition(bPos);
      this.rig.weapon.tipPoint.getWorldPosition(tPos);
      const emitting =
        (this.state === 'attack' && this.rig.clipProgress >= 0.22 && this.rig.clipProgress <= 0.72) ||
        (this.state === 'riposte' && this.rig.clipProgress >= 0.32 && this.rig.clipProgress <= 0.85) ||
        this.state === 'parry';
      this.swordTrail.update(dt, elapsed, bPos, tPos, emitting);
    } else {
      this.swordTrail.update(dt, elapsed, this.pos, this.pos, false);
    }

    this.charLight.position.set(this.pos.x, this.pos.y + 2.25, this.pos.z);
  }
}
