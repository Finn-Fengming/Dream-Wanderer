import * as THREE from 'three';
import { detectInitialQuality, QUALITY_PRESETS, QualityTier } from './core/quality';
import {
  createF3DebugOverlay,
  endInputFrame,
  initInput,
  mouse,
  pressed,
  requestGamePointerLock,
  setPointerLockAllowed,
  simulatePress,
  simulateRelease,
} from './core/input';
import { GameRenderer } from './core/renderer';
import { QionghuaWorld, SpiritVeinSite } from './world/qionghuaWorld';
import { SoulsCamera } from './camera/soulsCamera';
import { CharacterShowcaseStage } from './showcase/charShowcase';
import { CombatVfxManager } from './vfx/combatVfx';
import { HuimengAudioEngine } from './audio/huimengAudio';
import { DamageableTarget, PlayerController } from './combat/playerController';
import {
  createLootPillarMesh,
  LootPillar,
  RegularEnemy,
  SpiritCompanion,
  updateAttackTokens,
} from './entities/enemySystem';
import { XuanxiaoBoss } from './entities/xuanxiaoBoss';
import { SoulsUiManager } from './ui/soulsUi';

const ARENA_SHOTS: Record<
  string,
  { label: string; pos: [number, number, number]; look: [number, number, number]; demon?: number }
> = {
  vista: { label: '山门远眺', pos: [0, 3.8, 80.5], look: [0, 6.2, 40.0], demon: 0 },
  terrace: { label: '断檐高台与中庭', pos: [15.5, 9.2, 41.5], look: [0, 5.2, 12.0], demon: 0 },
  foggate: { label: '灵脉与金色雾门', pos: [-4.2, 13.2, -26.5], look: [0, 13.5, -45.0], demon: 0 },
  summit_p1: { label: '卷云台·一阶段苍岚', pos: [0, 15.8, -42.5], look: [0, 13.0, -68.0], demon: 0 },
  summit_p2: { label: '卷云台·二阶段焚天赤月', pos: [8.5, 16.5, -43.5], look: [0, 14.5, -68.0], demon: 1 },
};

function setBootProgress(pct: number, text: string) {
  const bar = document.getElementById('loader-bar');
  const step = document.getElementById('loader-step');
  if (bar) bar.style.width = `${pct}%`;
  if (step) step.textContent = text;
}

function hideBootLoader() {
  const loader = document.getElementById('boot-loader');
  if (loader) {
    loader.classList.add('hidden');
    setTimeout(() => loader.remove(), 750);
  }
}

async function bootstrap() {
  const container = document.getElementById('game-canvas-wrap')!;
  const uiRoot = document.getElementById('ui-root')!;
  const showcaseBar = document.getElementById('showcase-bar')!;

  const params = new URLSearchParams(window.location.search);
  const showMode = params.get('show'); // 'arena' | 'chars' | null
  const stageParam = params.get('stage'); // 'boss' | null
  const autoStart = params.get('auto') === '1' || stageParam === 'boss';
  const godParam = params.get('god') === '1';

  setBootProgress(25, '正在凝结冰火琼华山门与云海灵脉…');
  initInput(container);

  const quality = detectInitialQuality();
  const scene = new THREE.Scene();
  const soulsCam = new SoulsCamera();
  const gameRenderer = new GameRenderer(container, scene, soulsCam.camera, quality);
  const world = new QionghuaWorld(scene, quality);
  const vfx = new CombatVfxManager(scene, world.textures.softGlowTex, world.textures.runeRingTex);

  // Mute automatically during automated showcase/headless modes so background tests stay silent
  const audio = new HuimengAudioEngine(Boolean(showMode));

  setBootProgress(60, '正在锻造望舒羲和双剑与人物骨骼…');
  const player = new PlayerController(scene);
  player.godMode = godParam;

  // Populate Level Enemies:
  // 1) Frost-Crystal Staircase & Outer Gate: 3 Qionghua Sword Disciples + 1 High-Terrace Flying-Sword Cultivator
  // 2) Taiji Seal Courtyard Plaza: 1 Courtyard Cultivator + Elite Guardian【镇岳剑傀】
  const enemies: RegularEnemy[] = [
    new RegularEnemy('disc_1', 'disciple', new THREE.Vector3(-2.4, 1.3, 48.5), scene),
    new RegularEnemy('disc_2', 'disciple', new THREE.Vector3(2.8, 2.3, 42.5), scene),
    new RegularEnemy('cult_1', 'cultivator', new THREE.Vector3(11.8, 4.6, 38.5), scene),
    new RegularEnemy('disc_3', 'disciple', new THREE.Vector3(-4.2, 4.5, 22.5), scene),
    new RegularEnemy('cult_2', 'cultivator', new THREE.Vector3(9.5, 4.5, 16.0), scene),
    new RegularEnemy('elite_golem', 'golem', new THREE.Vector3(0, 4.5, 9.5), scene),
  ];
  const eliteGolem = enemies.find((e) => e.kind === 'golem') || null;
  const rewardedEnemyIds = new Set<string>();

  // Final Boss:【苍岚剑宗 -> 焚天成魔 · 玄霄】
  const boss = new XuanxiaoBoss(scene);
  const spirits = new SpiritCompanion(scene);

  // World Loot Pillars:
  // Loot #1:【琼浆玉露】on Right Broken Eaves Terrace (+1 Crimson Flask!)
  const lootItems: LootPillar[] = [];
  const terraceLootPos = new THREE.Vector3(12.6, 5.6, 31.5);
  const terraceLootMesh = createLootPillarMesh(terraceLootPos, true);
  scene.add(terraceLootMesh);
  lootItems.push({
    id: 'qiongjiang',
    name: '琼浆玉露',
    description: '鼠儿果露上限 +1，并补满一瓶灵露！',
    pos: terraceLootPos,
    collected: false,
    group: terraceLootMesh,
    onCollect: (pl) => {
      pl.maxCrimsonFlasks += 1;
      pl.crimsonFlasks += 1;
    },
  });

  // Corpse Sword-Soul (残剑剑魄 — dropped Lingyun on death)
  let corpseSoul: { pos: THREE.Vector3; amount: number; group: THREE.Group } | null = null;
  let lastSafePos = player.pos.clone();
  let activeRespawnVein: SpiritVeinSite = world.spiritVeins[0];
  let lockedTarget: DamageableTarget | null = null;
  let deathHandled = false;
  let deathRespawnTimer = 0;
  let victorySequenceTimer = -1;

  const getAllCombatTargets = (): DamageableTarget[] => {
    const list: DamageableTarget[] = [];
    for (const e of enemies) {
      if (e.alive) list.push(e);
    }
    if (boss.state !== 'dormant' && boss.alive) {
      list.push(boss);
    }
    return list;
  };

  const jumpToBossEntrance = () => {
    const vein2 = world.spiritVeins[1];
    vein2.unlocked = true;
    vein2.light.intensity = 2.4;
    activeRespawnVein = vein2;
    player.spiritContractUnlocked = true;
    player.resetAtPosition(new THREE.Vector3(0, 10.5, -33.5), 0, true);
    soulsCam.clearCustomShot();
    soulsCam.snapBehind(player.pos, 0, 0.2);
    audio.setMood('explore');
  };

  const startPlaySession = (directBoss: boolean) => {
    audio.unlock();
    soulsCam.clearCustomShot();
    setPointerLockAllowed(true);
    requestGamePointerLock();

    if (directBoss) {
      jumpToBossEntrance();
      ui.showSubtitle('柳梦璃 · 回梦残影', vein2Line(), 4.5);
    } else {
      player.resetAtPosition(new THREE.Vector3(0, 0, 76.5), 0, true);
      soulsCam.snapBehind(player.pos, 0, 0.2);
      audio.setMood('explore');
      ui.showSubtitle(
        '云天河',
        '「玄霄大哥……琼华派就要撞上大地了，无论如何我今天都要拦下你！」',
        4.5
      );
    }
  };

  function vein2Line() {
    return '「云公子，穿过前方金色剑幕便是卷云台了。危急之时按 V 吹响灵笛，梦璃与菱纱定来相助。」';
  }

  const respawnAfterDeath = () => {
    deathHandled = false;
    lockedTarget = null;
    soulsCam.lockedTargetPos = null;
    spirits.dismiss();
    player.spiritSummonedThisFight = false;

    for (const e of enemies) {
      if (!e.permanentlyDefeated) {
        e.respawn();
        rewardedEnemyIds.delete(e.id);
      }
    }

    if (!boss.defeated) {
      boss.resetDormant();
      world.setFogGateState(true, false);
      world.setDemonTransition(0);
      gameRenderer.setDemonFactor(0);
    }

    player.resetAtPosition(activeRespawnVein.respawnPos, activeRespawnVein.respawnYaw, true);
    soulsCam.clearCustomShot();
    soulsCam.snapBehind(player.pos, activeRespawnVein.respawnYaw, 0.2);
    audio.setMood('explore');
    setPointerLockAllowed(true);
  };

  const ui = new SoulsUiManager(uiRoot, {
    onStartGame: (directBoss) => startPlaySession(directBoss),
    onLevelUp: (stat) => {
      const cost = 120 + (player.level - 1) * 45;
      if (player.lingyun < cost) {
        ui.showSubtitle('天地灵脉', '「灵蕴尚不足以贯通此脉，可先击退山上执剑守卫积攒灵蕴。」', 2.6);
        return;
      }
      player.lingyun -= cost;
      player.level += 1;
      if (stat === 'hp') {
        player.maxHp += 85;
        player.hp = player.maxHp;
      } else if (stat === 'atk') {
        player.attackBonus += 0.14;
      } else {
        player.maxFp += 30;
        player.fp = player.maxFp;
        player.maxStamina += 15;
        player.stamina = player.maxStamina;
      }
      audio.playSfx('grace_chime');
      ui.refreshGraceCosts(player);
    },
    onCloseGrace: () => {
      setPointerLockAllowed(true);
      requestGamePointerLock();
    },
    onChangeQuality: (tier) => {
      if (QUALITY_PRESETS[tier]) {
        gameRenderer.applyQuality(QUALITY_PRESETS[tier], world.sunLight);
      }
    },
    onToggleMute: () => {
      if (!audio.muted) {
        audio.setMuted(true);
        return true;
      } else {
        audio.setMuted(false);
        audio.unlock();
        return false;
      }
    },
    onRestartBoss: () => {
      boss.defeated = false;
      boss.resetDormant();
      world.setFogGateState(true, false);
      world.setDemonTransition(0);
      gameRenderer.setDemonFactor(0);
      spirits.dismiss();
      player.spiritSummonedThisFight = false;
      jumpToBossEntrance();
      setPointerLockAllowed(true);
    },
  });

  // Setup Showcase Modes (?show=arena | ?show=chars) vs Gameplay
  let charShowcase: CharacterShowcaseStage | null = null;
  const applyArenaShot = (shotKey: string) => {
    const s = ARENA_SHOTS[shotKey];
    if (!s) return;
    soulsCam.setCustomShot(new THREE.Vector3(...s.pos), new THREE.Vector3(...s.look));
    const demon = s.demon ?? 0;
    world.setDemonTransition(demon);
    gameRenderer.setDemonFactor(demon);
    showcaseBar.querySelectorAll('button[data-shot]').forEach((b) => {
      b.classList.toggle('current', (b as HTMLElement).dataset.shot === shotKey);
    });
  };

  if (showMode === 'arena') {
    ui.hideTitle();
    document.querySelector('.hm-hud')?.classList.add('hidden');
    player.rig.root.visible = false;
    enemies.forEach((e) => (e.rig.root.visible = false));
    boss.rig.root.visible = false;

    showcaseBar.classList.add('active');
    showcaseBar.innerHTML = `<span>【场景光影检验展台 ?show=arena】</span>`;
    for (const [key, cfg] of Object.entries(ARENA_SHOTS)) {
      const btn = document.createElement('button');
      btn.dataset.shot = key;
      btn.textContent = cfg.label;
      btn.onclick = () => applyArenaShot(key);
      showcaseBar.appendChild(btn);
    }
    applyArenaShot(params.get('shot') || 'vista');
  } else if (showMode === 'chars') {
    ui.hideTitle();
    document.querySelector('.hm-hud')?.classList.add('hidden');
    player.rig.root.visible = false;
    enemies.forEach((e) => (e.rig.root.visible = false));
    boss.rig.root.visible = false;
    charShowcase = new CharacterShowcaseStage(scene, soulsCam, showcaseBar);
  } else if (autoStart) {
    ui.hideTitle();
    setPointerLockAllowed(true);
    if (stageParam === 'boss') {
      jumpToBossEntrance();
    } else {
      soulsCam.snapBehind(player.pos, 0, 0.2);
    }
  } else {
    // Scenic rotating live camera on Title Screen!
    soulsCam.setCustomShot(new THREE.Vector3(3.2, 4.2, 81.5), new THREE.Vector3(0, 6.0, 42.0));
  }

  let elapsed = 0;
  let fpsSmooth = 60;

  const updateF3 = createF3DebugOverlay(() => {
    return [
      `fps    : ${fpsSmooth.toFixed(1)} | tier: ${gameRenderer.quality.tier}`,
      `player : (${player.pos.x.toFixed(2)}, ${player.pos.y.toFixed(2)}, ${player.pos.z.toFixed(2)}) state=${player.state} hp=${player.hp}/${player.maxHp}`,
      `boss   : state=${boss.state} phase=${boss.phase} hp=${boss.hp}/${boss.maxHp} poise=${boss.poise.toFixed(0)}`,
      `lock   : ${lockedTarget ? lockedTarget.name : 'none'} | shortcut: ${world.shortcutUnlocked}`,
    ].join('\n');
  });

  function toggleOrCycleLockOn(cycleDelta = 0) {
    const candidates = getAllCombatTargets().filter(
      (t) => t.alive && t.pos.distanceTo(player.pos) <= 28.0
    );
    if (candidates.length === 0) {
      lockedTarget = null;
      return;
    }
    candidates.sort((a, b) => a.pos.distanceToSquared(player.pos) - b.pos.distanceToSquared(player.pos));

    if (cycleDelta !== 0 && lockedTarget) {
      const curIdx = candidates.findIndex((c) => c.id === lockedTarget!.id);
      const nextIdx = (curIdx + cycleDelta + candidates.length) % candidates.length;
      lockedTarget = candidates[nextIdx];
      return;
    }

    if (lockedTarget) {
      lockedTarget = null;
    } else {
      lockedTarget = candidates[0];
    }
  }

  function handleWorldInteractions(inBossArena: boolean) {
    if (ui.inTitleScreen || ui.inGraceMenu || player.state === 'dead') {
      ui.setPrompt(null);
      return;
    }

    let promptText: string | null = null;
    let onInteract: (() => void) | null = null;

    // 1. Corpse Sword-Soul Recovery
    if (corpseSoul && corpseSoul.pos.distanceTo(player.pos) < 2.5) {
      promptText = `[E] 拾回残剑剑魄 (+${corpseSoul.amount} 灵蕴)`;
      onInteract = () => {
        if (!corpseSoul) return;
        player.lingyun += corpseSoul.amount;
        scene.remove(corpseSoul.group);
        corpseSoul = null;
        audio.playSfx('grace_chime');
        ui.showBanner('剑 魄 归 元', '#7ee6ff', 2.0);
      };
    }

    // 2. World Loot Pillars
    if (!onInteract) {
      for (const item of lootItems) {
        if (!item.collected && item.pos.distanceTo(player.pos) < 2.4) {
          promptText = `[E] 拾取【${item.name}】`;
          onInteract = () => {
            item.collected = true;
            item.group.visible = false;
            item.onCollect(player);
            audio.playSfx('grace_chime');
            ui.showSubtitle('获得仙家奇珍', `【${item.name}】— ${item.description}`, 3.8);
          };
          break;
        }
      }
    }

    // 3. Shortcut Sword-Bridge Pedestal at (-14.8, 4.5, 14)
    const shortcutPos = new THREE.Vector3(-14.8, 4.5, 14);
    if (!onInteract && !world.shortcutUnlocked && shortcutPos.distanceTo(player.pos) < 2.8) {
      promptText = '[E] 催动御剑石台 (打通返回山门灵脉捷径)';
      onInteract = () => {
        world.unlockShortcut();
        audio.playSfx('grace_chime');
        ui.showBanner('飞 剑 捷 径 已 通', '#7ce2ff', 2.4);
      };
    }

    // 4. Golden Sword-Array Fog Gate at (0, 10.5, -38.5)
    const fogPos = new THREE.Vector3(0, 10.5, -38.5);
    if (
      !onInteract &&
      world.fogGateVisible &&
      !world.fogGateSealed &&
      !boss.defeated &&
      player.pos.z > -38.5 &&
      fogPos.distanceTo(player.pos) < 3.4
    ) {
      promptText = '[E] 穿过金色剑幕 (决战卷云台)';
      onInteract = () => {
        // Place player safely inside Juanyun Arena (Z=-45.2 so camera is also well clear of Fog Gate!) BEFORE sealing!
        player.pos.set(0, 10.5, -45.2);
        player.groundY = 10.5;
        player.yaw = 0;
        soulsCam.snapBehind(player.pos, 0, 0.22);
        world.setFogGateState(true, true);
        audio.playSfx('fog_gate');
        boss.startEncounter(audio, (sp, tx, d) => ui.showSubtitle(sp, tx, d));
        lockedTarget = boss;
      };
    }

    // 5. Spirit Vein Shrines (only when not locked inside active Boss fight)
    if (!onInteract && !inBossArena) {
      for (const sv of world.spiritVeins) {
        if (sv.position.distanceTo(player.pos) < 2.8) {
          promptText = sv.unlocked ? `[E] 于「${sv.name}」休整修行` : `[E] 契合天地灵脉「${sv.name}」`;
          onInteract = () => {
            const firstUnlock = !sv.unlocked;
            sv.unlocked = true;
            sv.light.intensity = 2.5;
            sv.flameMat.color.setRGB(0.85, 1.85, 1.55);
            activeRespawnVein = sv;

            if (sv.id === 'juanyun_steps') {
              player.spiritContractUnlocked = true;
            }

            // Rest restores HP/FP/Flasks & respawns regular non-elite guards
            player.hp = player.maxHp;
            player.fp = player.maxFp;
            player.stamina = player.maxStamina;
            player.crimsonFlasks = player.maxCrimsonFlasks;
            player.ceruleanFlasks = player.maxCeruleanFlasks;
            for (const e of enemies) {
              if (!e.permanentlyDefeated) {
                e.respawn();
                rewardedEnemyIds.delete(e.id);
              }
            }

            audio.playSfx('grace_chime');
            if (firstUnlock) {
              ui.showBanner('灵 脉 已 契', '#8cf0d8', 2.4);
            }
            setPointerLockAllowed(false);
            ui.openGraceMenu(sv.name, sv.memorySpeaker, sv.memoryLine, player);
          };
          break;
        }
      }
    }

    ui.setPrompt(promptText);
    if (onInteract && pressed.has('KeyE')) {
      onInteract();
    }

    // 6. Spirit Ash Summon (`KeyV`) inside Boss Arena!
    if (
      inBossArena &&
      boss.alive &&
      player.spiritContractUnlocked &&
      !player.spiritSummonedThisFight &&
      pressed.has('KeyV')
    ) {
      player.spiritSummonedThisFight = true;
      spirits.summonNear(player.pos, vfx, audio);
      ui.showSubtitle('韩菱纱 & 柳梦璃', '「天河，别怕！我们陪你一起拦住玄霄！」', 3.8);
    }
  }

  function stepSimulation(dt: number, renderFrame = true) {
    const clampedDt = Math.min(dt, 0.05);
    elapsed += clampedDt;

    if (showMode === 'arena') {
      world.update(clampedDt, elapsed, soulsCam.camera.position);
      soulsCam.update(clampedDt, soulsCam.camera.position, world);
      if (renderFrame) gameRenderer.render(scene, soulsCam.camera, elapsed);
      endInputFrame();
      return;
    }

    if (showMode === 'chars') {
      charShowcase?.update(clampedDt, elapsed);
      world.update(clampedDt, elapsed, new THREE.Vector3(0, 10.5, -63));
      soulsCam.update(clampedDt, new THREE.Vector3(0, 10.5, -63), world);
      if (renderFrame) gameRenderer.render(scene, soulsCam.camera, elapsed);
      endInputFrame();
      return;
    }

    // Title Screen gentle orbital panorama
    if (ui.inTitleScreen) {
      const swayX = Math.sin(elapsed * 0.25) * 4.2;
      soulsCam.setCustomShot(new THREE.Vector3(swayX, 4.4, 81.0), new THREE.Vector3(0, 6.2, 42.0));
      world.update(clampedDt, elapsed, player.pos);
      soulsCam.update(clampedDt, player.pos, world);
      audio.update(clampedDt);
      if (renderFrame) gameRenderer.render(scene, soulsCam.camera, elapsed);
      endInputFrame();
      return;
    }

    // Lock-on Toggle (`KeyZ` or `MMB`) & Target Cycling (`MouseWheel`)
    if (!ui.inGraceMenu && player.state !== 'dead') {
      if (pressed.has('KeyZ') || pressed.has('MMB')) {
        toggleOrCycleLockOn(0);
      } else if (mouse.wheelDelta !== 0 && lockedTarget) {
        toggleOrCycleLockOn(mouse.wheelDelta > 0 ? 1 : -1);
      }
    }

    if (lockedTarget && (!lockedTarget.alive || lockedTarget.pos.distanceTo(player.pos) > 34)) {
      lockedTarget = null;
      // Auto-reacquire next nearby target if one exists
      const next = getAllCombatTargets().find((t) => t.alive && t.pos.distanceTo(player.pos) < 16);
      if (next) lockedTarget = next;
    }
    soulsCam.lockedTargetPos = lockedTarget ? lockedTarget.pos : null;

    const inBossArena = boss.state !== 'dormant' && boss.alive;
    const controlsLockedOut = ui.inGraceMenu || boss.state === 'phaseTransition';

    // Record safe grounded position for Corpse Sword-Soul drop
    if (player.grounded && player.state !== 'dead') {
      lastSafePos.copy(player.pos);
    }

    const targets = getAllCombatTargets();

    // Update Player
    player.update(
      clampedDt,
      elapsed,
      world,
      soulsCam,
      targets,
      lockedTarget,
      vfx,
      audio,
      controlsLockedOut
    );

    // Update Regular Enemies + AttackToken Tactical Coordinator
    updateAttackTokens(enemies, player.pos, 1);
    for (const e of enemies) {
      e.update(
        clampedDt,
        elapsed,
        player,
        world,
        vfx,
        audio,
        soulsCam,
        () => gameRenderer.flashHurt(0.85),
        (golemDeathPos) => {
          // Spawn Loot #2:【望舒冰晶佩】when Courtyard Elite Zhenyue Golem falls!
          const charmPos = golemDeathPos.clone();
          const charmMesh = createLootPillarMesh(charmPos, false);
          scene.add(charmMesh);
          lootItems.push({
            id: 'wangshu_charm',
            name: '望舒冰晶佩',
            description: '望舒剑气共鸣：全剑招伤害 +18%，精力消耗降低 15%！',
            pos: charmPos,
            collected: false,
            group: charmMesh,
            onCollect: (pl) => {
              pl.hasWangshuCharm = true;
              gameRenderer.flashFrost(0.8);
            },
          });
          ui.showBanner('镇 岳 剑 傀 · 已 破', '#7ce4ff', 2.8);
        }
      );

      // Grant Lingyun immediately upon enemy defeat
      if (!e.alive && !rewardedEnemyIds.has(e.id)) {
        rewardedEnemyIds.add(e.id);
        player.lingyun += e.lingyunReward;
      }
    }

    // Update Final Boss Xuanxiao
    boss.update(
      clampedDt,
      elapsed,
      player,
      world,
      vfx,
      audio,
      soulsCam,
      () => gameRenderer.flashHurt(0.9),
      (sp, tx, d) => ui.showSubtitle(sp, tx, d),
      () => {
        // Boss Defeated!
        player.lingyun += 3600;
        world.setFogGateState(false, false);
        audio.setMood('victory');
        audio.playSfx('grace_chime');
        ui.showBanner('宿 孽 获 诛', '#f7d87c', 4.2);
        victorySequenceTimer = 4.6;
      }
    );
    gameRenderer.setDemonFactor(world.demonFactor);

    if (victorySequenceTimer > 0) {
      victorySequenceTimer -= clampedDt;
      if (victorySequenceTimer <= 0) {
        victorySequenceTimer = -1;
        setPointerLockAllowed(false);
        // Calmly restore serene twilight moon over Juanyun Summit
        world.setDemonTransition(0.15);
        gameRenderer.setDemonFactor(0.15);
        ui.showEpilogue();
      }
    }

    // Update Spirit Ash Companions (Han Lingsha & Liu Mengli)
    spirits.update(clampedDt, elapsed, player, boss.alive ? boss : null, vfx, audio);

    // Update VFX, Projectiles & Delayed Ground Rune Bursts
    vfx.update(clampedDt, (burst) => {
      if (burst.fromPlayer) {
        for (const t of targets) {
          if (!t.alive) continue;
          if (Math.hypot(t.pos.x - burst.pos.x, t.pos.z - burst.pos.z) <= burst.radius + t.radius) {
            const res = t.takeHit(burst.damage, burst.poiseDamage, new THREE.Vector3(0, 0, -1), true);
            if (res === 'staggered') audio.playSfx('poise_break');
            else audio.playSfx('hit_heavy');
          }
        }
      } else if (player.state !== 'dead') {
        if (Math.hypot(player.pos.x - burst.pos.x, player.pos.z - burst.pos.z) <= burst.radius) {
          player.receiveAttack(
            burst.damage,
            burst.pos,
            false,
            audio,
            vfx,
            soulsCam,
            () => gameRenderer.flashHurt(0.85)
          );
        }
      }
    });

    // Projectile Collision Checks
    for (let i = vfx.projectiles.length - 1; i >= 0; i--) {
      const p = vfx.projectiles[i];
      if (p.fromPlayer) {
        let hitAny = false;
        for (const t of targets) {
          if (!t.alive) continue;
          const distXZ = Math.hypot(p.pos.x - t.pos.x, p.pos.z - t.pos.z);
          if (distXZ <= p.radius + t.radius && Math.abs(p.pos.y - (t.pos.y + 1.1)) < 1.8) {
            const out = t.takeHit(p.damage, p.poiseDamage, p.vel.clone().normalize(), true);
            vfx.spawnHitSparks(p.pos, p.vel, 22, new THREE.Color(2.4, 1.3, 0.35));
            if (out === 'staggered') audio.playSfx('poise_break');
            else audio.playSfx('hit_heavy');
            hitAny = true;
            break;
          }
        }
        if (hitAny) vfx.removeProjectileAt(i);
      } else if (player.state !== 'dead') {
        const distXZ = Math.hypot(p.pos.x - player.pos.x, p.pos.z - player.pos.z);
        if (distXZ <= p.radius + 0.48 && Math.abs(p.pos.y - (player.pos.y + 1.1)) < 1.5) {
          const res = player.receiveAttack(
            p.damage,
            p.pos,
            false,
            audio,
            vfx,
            soulsCam,
            () => gameRenderer.flashHurt(0.8)
          );
          if (res !== 'dodged') {
            vfx.removeProjectileAt(i);
          }
        }
      }
    }

    // Handle Player Death ("梦 碎") & Corpse Sword-Soul Spawn
    if (player.state === 'dead') {
      if (!deathHandled) {
        deathHandled = true;
        deathRespawnTimer = 2.6;
        setPointerLockAllowed(false);
        ui.showBanner('梦 碎', '#d8382c', 2.5);

        if (player.lingyun > 0) {
          if (corpseSoul) scene.remove(corpseSoul.group);
          const dropMesh = createLootPillarMesh(lastSafePos, false);
          scene.add(dropMesh);
          corpseSoul = {
            pos: lastSafePos.clone(),
            amount: player.lingyun,
            group: dropMesh,
          };
          player.lingyun = 0;
        }
      }
      deathRespawnTimer -= clampedDt;
      if (deathRespawnTimer <= 0) {
        respawnAfterDeath();
      }
    }

    handleWorldInteractions(inBossArena);

    world.update(clampedDt, elapsed, player.pos);
    soulsCam.update(clampedDt, player.pos, world);
    ui.update(clampedDt, player, boss, eliteGolem, lockedTarget, soulsCam.camera, inBossArena);
    audio.update(clampedDt);

    if (renderFrame) {
      gameRenderer.render(scene, soulsCam.camera, elapsed);
    }
    updateF3();
    endInputFrame();
  }

  // Deterministic Verification & Debugging API on window.G
  (window as unknown as Record<string, unknown>).G = {
    step: (frames = 60, dt = 1 / 60) => {
      for (let i = 0; i < frames; i++) stepSimulation(dt, i === frames - 1);
      gameRenderer.render(scene, soulsCam.camera, elapsed);
    },
    upd: (frames = 60, dt = 1 / 60) => {
      for (let i = 0; i < frames; i++) stepSimulation(dt, false);
    },
    start: (directBoss = false) => {
      ui.hideTitle();
      startPlaySession(directBoss);
      stepSimulation(1 / 60, true);
    },
    press: simulatePress,
    release: simulateRelease,
    setShot: (keyOrPos: string | [number, number, number], look?: [number, number, number], demon?: number) => {
      if (typeof keyOrPos === 'string') {
        applyArenaShot(keyOrPos);
      } else if (look) {
        soulsCam.setCustomShot(new THREE.Vector3(...keyOrPos), new THREE.Vector3(...look));
        if (typeof demon === 'number') {
          world.setDemonTransition(demon);
          gameRenderer.setDemonFactor(demon);
        }
      }
      stepSimulation(1 / 60, true);
    },
    clearShot: () => soulsCam.clearCustomShot(),
    setDemon: (f: number) => {
      world.setDemonTransition(f);
      gameRenderer.setDemonFactor(f);
      stepSimulation(1 / 60, true);
    },
    teleport: (x: number, y: number, z: number, yaw = 0) => {
      player.resetAtPosition(new THREE.Vector3(x, y, z), yaw, false);
      soulsCam.snapBehind(player.pos, yaw, 0.22);
      stepSimulation(1 / 60, true);
    },
    damageBoss: (dmg: number, poiseDmg = 0) => {
      const res = boss.takeHit(dmg, poiseDmg, new THREE.Vector3(0, 0, -1), true);
      stepSimulation(1 / 60, true);
      return res;
    },
    unlockShortcut: () => world.unlockShortcut(),
    state: () => ({
      elapsed: Number(elapsed.toFixed(2)),
      fps: Number(fpsSmooth.toFixed(1)),
      inTitle: ui.inTitleScreen,
      inGrace: ui.inGraceMenu,
      pos: [Number(player.pos.x.toFixed(2)), Number(player.pos.y.toFixed(2)), Number(player.pos.z.toFixed(2))],
      playerState: player.state,
      hp: player.hp,
      maxHp: player.maxHp,
      fp: player.fp,
      stamina: Math.round(player.stamina),
      lingyun: player.lingyun,
      flasks: [player.crimsonFlasks, player.ceruleanFlasks],
      bossState: boss.state,
      bossPhase: boss.phase,
      bossHp: boss.hp,
      bossPoise: Math.round(boss.poise),
      bossKneeling: boss.isStaggeredKneeling,
      spiritsActive: spirits.active,
      demonFactor: Number(world.demonFactor.toFixed(2)),
      shortcutUnlocked: world.shortcutUnlocked,
      aliveEnemies: enemies.filter((e) => e.alive).map((e) => e.id),
    }),
  };

  setBootProgress(100, '琼华幻境已成');
  hideBootLoader();

  stepSimulation(1 / 60, true);

  let lastTime = performance.now();
  function animate(now: number) {
    requestAnimationFrame(animate);
    const rawDt = Math.max(0.001, (now - lastTime) / 1000);
    lastTime = now;
    fpsSmooth = THREE.MathUtils.lerp(fpsSmooth, 1 / rawDt, 0.08);
    stepSimulation(rawDt, true);
  }
  requestAnimationFrame(animate);
}

bootstrap().catch((err) => {
  console.error('[Dream-Wanderer Bootstrap Error]', err);
});
