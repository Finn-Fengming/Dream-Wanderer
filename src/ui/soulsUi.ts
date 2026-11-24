import * as THREE from 'three';
import { DamageableTarget, PlayerController } from '../combat/playerController';
import { XuanxiaoBoss } from '../entities/xuanxiaoBoss';
import { RegularEnemy } from '../entities/enemySystem';
import { QualityTier } from '../core/quality';
import { touchInput, simulatePress } from '../core/input';

export class SoulsUiManager {
  private root: HTMLElement;
  public inTitleScreen = true;
  public inGraceMenu = false;
  public inControlsModal = false;

  // Cached DOM references
  private titleWrap!: HTMLElement;
  private hudWrap!: HTMLElement;
  private hpFill!: HTMLElement;
  private hpDelayFill!: HTMLElement;
  private fpFill!: HTMLElement;
  private stamFill!: HTMLElement;
  private levelBadge!: HTMLElement;
  private lingyunText!: HTMLElement;

  private slotSkill!: HTMLElement;
  private slotFlask!: HTMLElement;
  private slotWeapon!: HTMLElement;
  private slotSpirit!: HTMLElement;
  private guardCounterHint!: HTMLElement;

  private bossWrap!: HTMLElement;
  private bossNameEl!: HTMLElement;
  private bossFill!: HTMLElement;
  private bossDelayFill!: HTMLElement;
  private bossComboDmgEl!: HTMLElement;

  private lockReticle!: HTMLElement;
  private interactPrompt!: HTMLElement;
  private subtitleWrap!: HTMLElement;
  private bannerWrap!: HTMLElement;
  private graceModal!: HTMLElement;
  private epilogueModal!: HTMLElement;

  // Delayed yellow bar trackers
  private playerDelayPct = 100;
  private bossDelayPct = 100;
  private lastBossHp = -1;
  private comboDmgAccum = 0;
  private comboDmgTimer = 0;
  private subtitleTimer = 0;
  private bannerTimer = 0;

  // Dirty-value cache to avoid redundant DOM writes
  private cache: Record<string, string> = {};

  constructor(
    uiRoot: HTMLElement,
    callbacks: {
      onStartGame: (directBoss: boolean) => void;
      onLevelUp: (stat: 'hp' | 'fp' | 'atk') => void;
      onCloseGrace: () => void;
      onChangeQuality: (q: QualityTier) => void;
      onToggleMute: () => boolean;
      onRestartBoss: () => void;
    }
  ) {
    this.root = uiRoot;
    this.injectStyles();
    this.buildDom(callbacks);
  }

  private setStyleCached(key: string, el: HTMLElement, prop: 'width' | 'display' | 'transform', val: string) {
    if (this.cache[key] !== val) {
      this.cache[key] = val;
      el.style[prop] = val;
    }
  }

  private setTextCached(key: string, el: HTMLElement, val: string) {
    if (this.cache[key] !== val) {
      this.cache[key] = val;
      el.textContent = val;
    }
  }

  private injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      /* Title Screen over Live 3D Qionghua Scene */
      .hm-title-screen {
        position: fixed; inset: 0; z-index: 80;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        background: radial-gradient(circle at 50% 45%, rgba(8,15,26,0.28) 0%, rgba(5,9,16,0.78) 100%);
        transition: opacity 0.6s ease;
      }
      .hm-title-screen.hidden { opacity: 0; pointer-events: none; }
      .hm-main-logo {
        font-size: clamp(38px, 6vw, 68px);
        letter-spacing: 14px; text-indent: 14px;
        color: #f4e6c8;
        text-shadow: 0 0 28px rgba(102, 198, 255, 0.55), 0 4px 20px rgba(0,0,0,0.9);
        margin-bottom: 8px;
      }
      .hm-sub-logo {
        font-size: 15px; letter-spacing: 6px; color: #b9d2e6;
        margin-bottom: 42px; text-shadow: 0 2px 10px rgba(0,0,0,0.9);
      }
      .hm-menu-btns { display: flex; flex-direction: column; gap: 13px; width: 270px; }
      .hm-btn {
        padding: 12px 22px; font-family: inherit; font-size: 16px; letter-spacing: 4px;
        color: #f2e3c4; background: linear-gradient(90deg, rgba(12,22,36,0.4), rgba(24,42,64,0.82), rgba(12,22,36,0.4));
        border: none; border-top: 1px solid rgba(218, 184, 118, 0.55); border-bottom: 1px solid rgba(218, 184, 118, 0.55);
        cursor: pointer; transition: all 0.22s ease; text-align: center;
      }
      .hm-btn:hover {
        color: #ffffff;
        background: linear-gradient(90deg, rgba(28,52,78,0.5), rgba(196,148,74,0.42), rgba(28,52,78,0.5));
        box-shadow: 0 0 24px rgba(120, 206, 255, 0.3);
        transform: scale(1.03);
      }
      .hm-controls-hint {
        margin-top: 32px; font-size: 12px; letter-spacing: 1.5px;
        color: rgba(210, 224, 238, 0.78); text-align: center; line-height: 1.8;
        background: rgba(6, 11, 18, 0.55); padding: 10px 20px; border: 1px solid rgba(212,180,118,0.22);
      }

      /* In-Game Souls HUD */
      .hm-hud { position: fixed; inset: 0; z-index: 40; pointer-events: none; transition: opacity 0.35s; }
      .hm-hud.hidden { opacity: 0; }

      /* Top-Left Bars */
      .hm-bars-panel {
        position: absolute; top: 24px; left: 28px;
        display: flex; align-items: flex-start; gap: 12px;
      }
      .hm-emblem {
        width: 46px; height: 46px; border: 1.5px solid #cfa866;
        background: radial-gradient(circle, #1c354d 0%, #0b1420 100%);
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        box-shadow: 0 0 14px rgba(90, 190, 245, 0.32);
      }
      .hm-emblem-char { font-size: 17px; color: #f2dfb8; line-height: 1; }
      .hm-emblem-lv { font-size: 10px; color: #9ec9e6; margin-top: 2px; font-family: ui-monospace, monospace; }
      .hm-bars-stack { display: flex; flex-direction: column; gap: 6px; padding-top: 3px; }
      .hm-bar-row { display: flex; align-items: center; gap: 7px; }
      .hm-bar-tag { font-size: 11px; color: #dccaa6; opacity: 0.85; width: 14px; }
      .hm-bar-track {
        height: 10px; background: rgba(8, 12, 18, 0.82);
        border: 1px solid rgba(204, 174, 118, 0.52);
        position: relative; overflow: hidden;
        clip-path: polygon(0 0, calc(100% - 5px) 0, 100% 50%, calc(100% - 5px) 100%, 0 100%);
      }
      .hm-bar-delay {
        position: absolute; left: 0; top: 0; bottom: 0;
        background: #e8c252; transition: none;
      }
      .hm-bar-fill {
        position: absolute; left: 0; top: 0; bottom: 0;
        box-shadow: inset -2px 0 4px rgba(255,255,255,0.55);
      }
      .hm-hp-fill { background: linear-gradient(90deg, #7a1818, #c92d2d, #ea5246); }
      .hm-fp-fill { background: linear-gradient(90deg, #163e6c, #2876b8, #4eb8f0); }
      .hm-st-fill { background: linear-gradient(90deg, #1a543b, #2e8c5e, #54c98a); }

      /* Bottom-Left Elden Ring D-Pad Quick Slots */
      .hm-dpad {
        position: absolute; left: 32px; bottom: 28px;
        display: grid; grid-template-columns: 58px 64px 58px; grid-template-rows: 54px 58px 54px;
        gap: 5px; align-items: center; justify-items: center;
      }
      .hm-slot {
        width: 100%; height: 100%;
        background: rgba(8, 14, 24, 0.78);
        border: 1px solid rgba(206, 174, 114, 0.48);
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        padding: 3px; text-align: center; position: relative;
      }
      .hm-slot.glow-ready {
        border-color: #7ee2ff;
        box-shadow: 0 0 14px rgba(96, 212, 255, 0.42);
      }
      .hm-slot-key {
        position: absolute; top: 2px; left: 4px;
        font-size: 9px; color: #cbb68c; font-family: ui-monospace, monospace;
      }
      .hm-slot-title { font-size: 11px; color: #f2e4c8; line-height: 1.15; }
      .hm-slot-sub { font-size: 10px; color: #8cd4f5; font-family: ui-monospace, monospace; }

      /* Bottom-Right Lingyun (Runes) */
      .hm-runes {
        position: absolute; right: 30px; bottom: 28px;
        background: rgba(8, 14, 24, 0.78);
        border: 1px solid rgba(206, 174, 114, 0.45);
        padding: 7px 16px; display: flex; align-items: center; gap: 10px;
      }
      .hm-runes-label { font-size: 12px; letter-spacing: 2px; color: #d6be92; }
      .hm-runes-val { font-size: 18px; color: #fff1cc; font-family: ui-monospace, monospace; min-width: 62px; text-align: right; }

      /* Boss Health Bar */
      .hm-boss-hud {
        position: absolute; left: 50%; bottom: 44px; transform: translateX(-50%);
        width: min(680px, 64vw); display: none; flex-direction: column; gap: 5px;
      }
      .hm-boss-hud.active { display: flex; }
      .hm-boss-header { display: flex; justify-content: space-between; align-items: baseline; padding: 0 4px; }
      .hm-boss-name {
        font-size: 18px; letter-spacing: 4px; color: #f5e6c8;
        text-shadow: 0 2px 8px rgba(0,0,0,0.95);
      }
      .hm-boss-dmg { font-size: 14px; color: #f0d084; font-family: ui-monospace, monospace; }
      .hm-boss-track {
        width: 100%; height: 13px; background: rgba(8, 10, 15, 0.88);
        border: 1.5px solid #c9a461; position: relative; overflow: hidden;
        box-shadow: 0 0 18px rgba(0,0,0,0.85);
      }
      .hm-boss-fill {
        position: absolute; left: 0; top: 0; bottom: 0;
        background: linear-gradient(90deg, #6e1212, #b8221e, #eb5234);
      }

      /* Guard Counter / Riposte Prompt */
      .hm-combat-cue {
        position: absolute; left: 50%; top: 62%; transform: translateX(-50%);
        font-size: 14px; letter-spacing: 3px; color: #fff1b8;
        background: rgba(18, 28, 42, 0.82); border: 1px solid #e8c266;
        padding: 5px 14px; display: none; text-shadow: 0 0 10px rgba(255,205,95,0.8);
      }

      /* Lock-On Diamond Reticle */
      .hm-lock-dot {
        position: fixed; width: 16px; height: 16px; margin-left: -8px; margin-top: -8px;
        border: 2px solid #fff7dc; transform: rotate(45deg);
        box-shadow: 0 0 10px rgba(120, 215, 255, 0.9);
        display: none; pointer-events: none; z-index: 38;
      }
      .hm-lock-dot.staggered {
        width: 24px; height: 24px; margin-left: -12px; margin-top: -12px;
        border-color: #ffae38; background: rgba(255, 160, 40, 0.35);
        box-shadow: 0 0 18px #ff8822;
      }

      /* Context Interact Bar */
      .hm-interact {
        position: fixed; left: 50%; bottom: 132px; transform: translateX(-50%);
        background: rgba(8, 14, 24, 0.86); border: 1px solid rgba(216, 184, 120, 0.62);
        padding: 8px 22px; font-size: 15px; letter-spacing: 2.5px; color: #f6e7c8;
        display: none; z-index: 45; pointer-events: auto; cursor: pointer;
      }

      /* Dialogue Subtitles */
      .hm-subtitle {
        position: fixed; left: 50%; bottom: 96px; transform: translateX(-50%);
        max-width: min(720px, 86vw); text-align: center;
        background: linear-gradient(90deg, transparent, rgba(6,10,18,0.82) 18%, rgba(6,10,18,0.82) 82%, transparent);
        padding: 8px 28px; font-size: 16px; letter-spacing: 2px; color: #f4e9d2;
        text-shadow: 0 2px 8px #000; display: none; z-index: 60; pointer-events: none;
      }
      .hm-subtitle strong { color: #8ad8ff; margin-right: 8px; }

      /* Fullscreen Elden Ring Calligraphic Banner */
      .hm-banner {
        position: fixed; left: 0; right: 0; top: 38%;
        padding: 24px 0; text-align: center;
        background: linear-gradient(180deg, transparent, rgba(0,0,0,0.86) 22%, rgba(0,0,0,0.86) 78%, transparent);
        font-size: clamp(32px, 5vw, 56px); letter-spacing: 18px; text-indent: 18px;
        display: none; z-index: 75; pointer-events: none;
      }

      /* Spirit Vein Menu & Epilogue Modals */
      .hm-modal {
        position: fixed; inset: 0; z-index: 85;
        background: rgba(5, 9, 16, 0.76); backdrop-filter: blur(6px);
        display: none; align-items: center; justify-content: center;
      }
      .hm-modal.active { display: flex; }
      .hm-modal-card {
        width: min(520px, 92vw); background: rgba(11, 19, 31, 0.95);
        border: 1px solid rgba(214, 180, 116, 0.6); padding: 26px 30px;
        box-shadow: 0 12px 48px rgba(0,0,0,0.85);
      }
      .hm-modal-title { font-size: 24px; letter-spacing: 5px; color: #f3dfb6; margin-bottom: 10px; }
      .hm-memory-box {
        font-size: 14px; line-height: 1.7; color: #bfe2f7;
        background: rgba(24, 46, 68, 0.42); border-left: 3px solid #6ecdf5;
        padding: 10px 14px; margin-bottom: 18px;
      }
      .hm-upgrade-list { display: flex; flex-direction: column; gap: 9px; margin-bottom: 18px; }
      .hm-upg-btn {
        display: flex; justify-content: space-between; align-items: center;
        padding: 9px 14px; background: rgba(255,255,255,0.05);
        border: 1px solid rgba(212,180,118,0.35); color: #efe1c6;
        font-family: inherit; font-size: 14px; cursor: pointer;
      }
      .hm-upg-btn:hover { background: rgba(212,180,118,0.2); border-color: #e8c47e; }

      /* Top-Right Utility Mini-Bar */
      .hm-top-tools {
        position: fixed; top: 18px; right: 22px; z-index: 65;
        display: flex; gap: 8px; pointer-events: auto;
      }
      .hm-mini-btn {
        background: rgba(8, 14, 24, 0.72); color: #dfd0b4;
        border: 1px solid rgba(206,174,114,0.38); padding: 5px 10px;
        font-family: inherit; font-size: 12px; cursor: pointer;
      }
      .hm-mini-btn:hover { border-color: #ebd096; color: #fff; }

      /* Mobile Touch Controls */
      .hm-touch-layer { position: fixed; inset: 0; z-index: 50; display: none; pointer-events: none; }
      .hm-touch-layer.active { display: block; }
      .hm-stick-zone {
        position: absolute; left: 24px; bottom: 28px; width: 130px; height: 130px;
        border-radius: 50%; border: 1.5px solid rgba(212,180,118,0.4);
        background: rgba(10,18,28,0.38); pointer-events: auto; touch-action: none;
      }
      .hm-touch-btns {
        position: absolute; right: 20px; bottom: 26px; width: 175px; height: 155px;
        pointer-events: auto; display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; align-content: flex-end;
      }
      .hm-tbtn {
        width: 52px; height: 52px; border-radius: 50%;
        background: rgba(14,26,42,0.78); border: 1.5px solid rgba(216,184,120,0.55);
        color: #f3e2c2; font-family: inherit; font-size: 13px;
      }
    `;
    document.head.appendChild(style);
  }

  private buildDom(callbacks: {
    onStartGame: (directBoss: boolean) => void;
    onLevelUp: (stat: 'hp' | 'fp' | 'atk') => void;
    onCloseGrace: () => void;
    onChangeQuality: (q: QualityTier) => void;
    onToggleMute: () => boolean;
    onRestartBoss: () => void;
  }) {
    // 1. Live-3D Title Screen
    this.titleWrap = document.createElement('div');
    this.titleWrap.className = 'hm-title-screen';
    this.titleWrap.innerHTML = `
      <div class="hm-main-logo">回梦游仙·青春版</div>
      <div class="hm-sub-logo">仙剑奇侠传四 · 冰火琼华 × 艾尔登法环动作重制</div>
      <div class="hm-menu-btns">
        <button class="hm-btn" id="btn-start-story">踏入琼华山门 (完整流程)</button>
        <button class="hm-btn" id="btn-start-boss">直达卷云台 (决战玄霄)</button>
      </div>
      <div class="hm-controls-hint">
        【移动】WASD &nbsp;·&nbsp; 【轻斩 / 蓄力重劈】鼠标左键(点按/长按) 或 J / H &nbsp;·&nbsp; 【踏步翻滚/冲刺】Shift<br/>
        【跳跃 / 跳劈】空格 / 空格+左键 &nbsp;·&nbsp; 【横剑格挡 / 卸力防反】右键+左键 &nbsp;·&nbsp; 【剑气弹反】Q<br/>
        【天河剑诀(狂龙迅影斩 / 恸天贯日式)】F (Tab切换) &nbsp;·&nbsp; 【饮药】R (C切换红蓝) &nbsp;·&nbsp; 【锁定目标】Z / 中键 &nbsp;·&nbsp; 【回梦灵契】V
      </div>
    `;
    this.root.appendChild(this.titleWrap);

    this.titleWrap.querySelector('#btn-start-story')!.addEventListener('click', () => {
      this.hideTitle();
      callbacks.onStartGame(false);
    });
    this.titleWrap.querySelector('#btn-start-boss')!.addEventListener('click', () => {
      this.hideTitle();
      callbacks.onStartGame(true);
    });

    // 2. Top-Right Quick Controls (Audio Mute + Quality + Controls Help)
    const topTools = document.createElement('div');
    topTools.className = 'hm-top-tools';
    topTools.innerHTML = `
      <button class="hm-mini-btn" id="btn-mute-toggle">音律：开</button>
      <button class="hm-mini-btn" id="btn-quality-cycle">画质：精致</button>
    `;
    this.root.appendChild(topTools);

    const muteBtn = topTools.querySelector('#btn-mute-toggle') as HTMLButtonElement;
    muteBtn.onclick = () => {
      const isMuted = callbacks.onToggleMute();
      muteBtn.textContent = isMuted ? '音律：静' : '音律：开';
    };

    const tiers: QualityTier[] = ['low', 'medium', 'high', 'ultra'];
    const labels: Record<QualityTier, string> = { low: '流畅', medium: '均衡', high: '精致', ultra: '极高' };
    let tierIdx = 2;
    const qBtn = topTools.querySelector('#btn-quality-cycle') as HTMLButtonElement;
    qBtn.onclick = () => {
      tierIdx = (tierIdx + 1) % tiers.length;
      const t = tiers[tierIdx];
      callbacks.onChangeQuality(t);
      qBtn.textContent = `画质：${labels[t]}`;
    };

    // 3. In-Game Souls HUD
    this.hudWrap = document.createElement('div');
    this.hudWrap.className = 'hm-hud hidden';
    this.hudWrap.innerHTML = `
      <div class="hm-bars-panel">
        <div class="hm-emblem">
          <span class="hm-emblem-char">望舒</span>
          <span class="hm-emblem-lv" id="hud-lv">Lv.1</span>
        </div>
        <div class="hm-bars-stack">
          <div class="hm-bar-row">
            <span class="hm-bar-tag">精</span>
            <div class="hm-bar-track" id="hud-hp-track" style="width: 240px;">
              <div class="hm-bar-delay" id="hud-hp-delay" style="width:100%"></div>
              <div class="hm-bar-fill hm-hp-fill" id="hud-hp-fill" style="width:100%"></div>
            </div>
          </div>
          <div class="hm-bar-row">
            <span class="hm-bar-tag">神</span>
            <div class="hm-bar-track" style="width: 155px;">
              <div class="hm-bar-fill hm-fp-fill" id="hud-fp-fill" style="width:100%"></div>
            </div>
          </div>
          <div class="hm-bar-row">
            <span class="hm-bar-tag">气</span>
            <div class="hm-bar-track" style="width: 195px;">
              <div class="hm-bar-fill hm-st-fill" id="hud-st-fill" style="width:100%"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="hm-dpad">
        <div></div>
        <div class="hm-slot" id="slot-skill">
          <span class="hm-slot-key">F/Tab</span>
          <span class="hm-slot-title">狂龙迅影斩</span>
          <span class="hm-slot-sub">耗神 18</span>
        </div>
        <div></div>

        <div class="hm-slot" id="slot-weapon">
          <span class="hm-slot-key">神兵</span>
          <span class="hm-slot-title">望舒剑</span>
          <span class="hm-slot-sub">寒晶剑气</span>
        </div>
        <div class="hm-slot" id="slot-flask">
          <span class="hm-slot-key">R/C</span>
          <span class="hm-slot-title">鼠儿果露</span>
          <span class="hm-slot-sub">×5</span>
        </div>
        <div class="hm-slot" id="slot-spirit">
          <span class="hm-slot-key">V</span>
          <span class="hm-slot-title">回梦灵契</span>
          <span class="hm-slot-sub">待解锁</span>
        </div>
      </div>

      <div class="hm-runes">
        <span class="hm-runes-label">灵蕴</span>
        <span class="hm-runes-val" id="hud-lingyun">0</span>
      </div>

      <div class="hm-boss-hud" id="hud-boss">
        <div class="hm-boss-header">
          <span class="hm-boss-name" id="hud-boss-name">苍岚剑宗 · 玄霄</span>
          <span class="hm-boss-dmg" id="hud-boss-dmg"></span>
        </div>
        <div class="hm-boss-track">
          <div class="hm-bar-delay" id="hud-boss-delay" style="width:100%"></div>
          <div class="hm-boss-fill" id="hud-boss-fill" style="width:100%"></div>
        </div>
      </div>

      <div class="hm-combat-cue" id="hud-combat-cue"></div>
    `;
    this.root.appendChild(this.hudWrap);

    this.hpFill = this.hudWrap.querySelector('#hud-hp-fill')!;
    this.hpDelayFill = this.hudWrap.querySelector('#hud-hp-delay')!;
    this.fpFill = this.hudWrap.querySelector('#hud-fp-fill')!;
    this.stamFill = this.hudWrap.querySelector('#hud-st-fill')!;
    this.levelBadge = this.hudWrap.querySelector('#hud-lv')!;
    this.lingyunText = this.hudWrap.querySelector('#hud-lingyun')!;

    this.slotSkill = this.hudWrap.querySelector('#slot-skill')!;
    this.slotFlask = this.hudWrap.querySelector('#slot-flask')!;
    this.slotWeapon = this.hudWrap.querySelector('#slot-weapon')!;
    this.slotSpirit = this.hudWrap.querySelector('#slot-spirit')!;
    this.guardCounterHint = this.hudWrap.querySelector('#hud-combat-cue')!;

    this.bossWrap = this.hudWrap.querySelector('#hud-boss')!;
    this.bossNameEl = this.hudWrap.querySelector('#hud-boss-name')!;
    this.bossFill = this.hudWrap.querySelector('#hud-boss-fill')!;
    this.bossDelayFill = this.hudWrap.querySelector('#hud-boss-delay')!;
    this.bossComboDmgEl = this.hudWrap.querySelector('#hud-boss-dmg')!;

    // 4. Lock-On Reticle, Interaction Prompt, Subtitle & Calligraphic Banner
    this.lockReticle = document.createElement('div');
    this.lockReticle.className = 'hm-lock-dot';
    this.root.appendChild(this.lockReticle);

    this.interactPrompt = document.createElement('div');
    this.interactPrompt.className = 'hm-interact';
    this.interactPrompt.onclick = () => simulatePress('KeyE');
    this.root.appendChild(this.interactPrompt);

    this.subtitleWrap = document.createElement('div');
    this.subtitleWrap.className = 'hm-subtitle';
    this.root.appendChild(this.subtitleWrap);

    this.bannerWrap = document.createElement('div');
    this.bannerWrap.className = 'hm-banner';
    this.root.appendChild(this.bannerWrap);

    // 5. Spirit Vein Rest & Upgrade Modal
    this.graceModal = document.createElement('div');
    this.graceModal.className = 'hm-modal';
    this.graceModal.innerHTML = `
      <div class="hm-modal-card">
        <div class="hm-modal-title" id="grace-title">天地灵脉 · 休整</div>
        <div class="hm-memory-box" id="grace-memory"></div>
        <div class="hm-upgrade-list">
          <button class="hm-upg-btn" data-upg="hp">
            <span>淬炼体魄 (气血上限 +85)</span>
            <span class="upg-cost">耗费 150 灵蕴</span>
          </button>
          <button class="hm-upg-btn" data-upg="atk">
            <span>精修望舒剑意 (全剑招与神弓伤害 +14%)</span>
            <span class="upg-cost">耗费 150 灵蕴</span>
          </button>
          <button class="hm-upg-btn" data-upg="fp">
            <span>凝练五灵仙术 (仙术值上限 +30 & 精力 +15)</span>
            <span class="upg-cost">耗费 150 灵蕴</span>
          </button>
        </div>
        <button class="hm-btn" style="width:100%" id="btn-leave-grace">起身继续前行</button>
      </div>
    `;
    this.root.appendChild(this.graceModal);

    this.graceModal.querySelectorAll('button[data-upg]').forEach((b) => {
      b.addEventListener('click', () => {
        const stat = (b as HTMLElement).dataset.upg as 'hp' | 'fp' | 'atk';
        callbacks.onLevelUp(stat);
      });
    });
    this.graceModal.querySelector('#btn-leave-grace')!.addEventListener('click', () => {
      this.closeGraceMenu();
      callbacks.onCloseGrace();
    });

    // 6. Victory Epilogue Card (百年青鸾峰 · 回梦游仙)
    this.epilogueModal = document.createElement('div');
    this.epilogueModal.className = 'hm-modal';
    this.epilogueModal.innerHTML = `
      <div class="hm-modal-card" style="text-align:center">
        <div class="hm-modal-title" style="letter-spacing:8px">宿孽尽散 · 回梦游仙</div>
        <div class="hm-memory-box" style="text-align:left">
          卷云台上的赤炎与风雪渐渐散去，羲和与望舒终归沉寂。<br/><br/>
          恍惚间，竹笛声再起于青鸾峰巅——木屋前芳草萋萋，故人持伞回眸，恰似少年初下山时的一场清梦。
        </div>
        <div style="display:flex; gap:12px; justify-content:center;">
          <button class="hm-btn" id="btn-replay-boss" style="flex:1">再战卷云台玄霄</button>
          <button class="hm-btn" id="btn-close-epilogue" style="flex:1">留驻琼华漫游</button>
        </div>
      </div>
    `;
    this.root.appendChild(this.epilogueModal);
    this.epilogueModal.querySelector('#btn-replay-boss')!.addEventListener('click', () => {
      this.epilogueModal.classList.remove('active');
      callbacks.onRestartBoss();
    });
    this.epilogueModal.querySelector('#btn-close-epilogue')!.addEventListener('click', () => {
      this.epilogueModal.classList.remove('active');
    });

    // 7. Mobile Touch Controls (auto-shown on touch devices)
    const touchLayer = document.createElement('div');
    touchLayer.className = 'hm-touch-layer';
    touchLayer.innerHTML = `
      <div class="hm-stick-zone" id="touch-stick"></div>
      <div class="hm-touch-btns">
        <button class="hm-tbtn" data-code="KeyZ">锁定</button>
        <button class="hm-tbtn" data-code="KeyR">饮药</button>
        <button class="hm-tbtn" data-code="KeyF">剑诀</button>
        <button class="hm-tbtn" data-code="Space">跳跃</button>
        <button class="hm-tbtn" data-code="KeyL">翻滚</button>
        <button class="hm-tbtn" data-code="KeyJ" style="background:rgba(165,45,35,0.75)">出剑</button>
      </div>
    `;
    this.root.appendChild(touchLayer);

    const stick = touchLayer.querySelector('#touch-stick') as HTMLElement;
    let stickCenter = { x: 0, y: 0 };
    stick.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      const rect = stick.getBoundingClientRect();
      stickCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      touchInput.moveX = THREE.MathUtils.clamp((t.clientX - stickCenter.x) / 50, -1, 1);
      touchInput.moveY = THREE.MathUtils.clamp((t.clientY - stickCenter.y) / 50, -1, 1);
    });
    stick.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      touchInput.moveX = THREE.MathUtils.clamp((t.clientX - stickCenter.x) / 50, -1, 1);
      touchInput.moveY = THREE.MathUtils.clamp((t.clientY - stickCenter.y) / 50, -1, 1);
    });
    stick.addEventListener('touchend', () => {
      touchInput.moveX = 0;
      touchInput.moveY = 0;
    });

    touchLayer.querySelectorAll('button[data-code]').forEach((btn) => {
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const code = (btn as HTMLElement).dataset.code!;
        simulatePress(code);
      });
    });

    window.addEventListener(
      'touchstart',
      () => {
        if (!this.inTitleScreen) touchLayer.classList.add('active');
      },
      { once: true, passive: true }
    );
  }

  public hideTitle() {
    this.inTitleScreen = false;
    this.titleWrap.classList.add('hidden');
    this.hudWrap.classList.remove('hidden');
  }

  public openGraceMenu(title: string, speaker: string, line: string, player: PlayerController) {
    this.inGraceMenu = true;
    this.graceModal.classList.add('active');
    this.graceModal.querySelector('#grace-title')!.textContent = `${title} · 休整 (当前灵蕴: ${player.lingyun})`;
    this.graceModal.querySelector('#grace-memory')!.innerHTML = `<strong>${speaker}：</strong>${line}`;
    this.refreshGraceCosts(player);
  }

  public refreshGraceCosts(player: PlayerController) {
    const cost = 120 + (player.level - 1) * 45;
    const titleEl = this.graceModal.querySelector('#grace-title');
    if (titleEl && titleEl.textContent) {
      titleEl.textContent = titleEl.textContent.replace(/\(当前灵蕴:.*\)/, `(当前灵蕴: ${player.lingyun} · Lv.${player.level})`);
    }
    this.graceModal.querySelectorAll('.upg-cost').forEach((el) => {
      el.textContent = `耗费 ${cost} 灵蕴`;
    });
  }

  public closeGraceMenu() {
    this.inGraceMenu = false;
    this.graceModal.classList.remove('active');
  }

  public showSubtitle(speaker: string, text: string, duration = 4.0) {
    this.subtitleWrap.innerHTML = `<strong>${speaker}</strong>${text}`;
    this.subtitleWrap.style.display = 'block';
    this.subtitleTimer = duration;
  }

  public showBanner(text: string, colorHex = '#f3d27a', duration = 3.2) {
    this.bannerWrap.textContent = text;
    this.bannerWrap.style.color = colorHex;
    this.bannerWrap.style.textShadow = `0 0 28px ${colorHex}, 0 4px 16px #000`;
    this.bannerWrap.style.display = 'block';
    this.bannerTimer = duration;
  }

  public showEpilogue() {
    this.epilogueModal.classList.add('active');
  }

  public setPrompt(text: string | null) {
    if (!text || this.inTitleScreen || this.inGraceMenu) {
      this.setStyleCached('promptDisp', this.interactPrompt, 'display', 'none');
    } else {
      this.setStyleCached('promptDisp', this.interactPrompt, 'display', 'block');
      this.setTextCached('promptTxt', this.interactPrompt, text);
    }
  }

  public update(
    dt: number,
    player: PlayerController,
    boss: XuanxiaoBoss,
    eliteGolem: RegularEnemy | null,
    lockedTarget: DamageableTarget | null,
    camera: THREE.PerspectiveCamera,
    inBossArena: boolean
  ) {
    if (this.subtitleTimer > 0) {
      this.subtitleTimer -= dt;
      if (this.subtitleTimer <= 0) this.subtitleWrap.style.display = 'none';
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.bannerWrap.style.display = 'none';
    }

    // Hide HUD cleanly during Xuanxiao's Phase 2 Cinematic Roar!
    const hideHudForCutscene = boss.state === 'phaseTransition' && boss.stateTimer < 4.2;
    this.hudWrap.classList.toggle('hidden', this.inTitleScreen || hideHudForCutscene);
    if (this.inTitleScreen) return;

    // 1. Player Bars + Elden Ring Delayed Yellow Bar
    const hpPct = THREE.MathUtils.clamp((player.hp / player.maxHp) * 100, 0, 100);
    if (this.playerDelayPct > hpPct) {
      this.playerDelayPct = Math.max(hpPct, this.playerDelayPct - 32 * dt);
    } else {
      this.playerDelayPct = hpPct;
    }
    const fpPct = THREE.MathUtils.clamp((player.fp / player.maxFp) * 100, 0, 100);
    const stPct = THREE.MathUtils.clamp((player.stamina / player.maxStamina) * 100, 0, 100);

    this.setStyleCached('hpW', this.hpFill, 'width', `${hpPct.toFixed(1)}%`);
    this.setStyleCached('hpDW', this.hpDelayFill, 'width', `${this.playerDelayPct.toFixed(1)}%`);
    this.setStyleCached('fpW', this.fpFill, 'width', `${fpPct.toFixed(1)}%`);
    this.setStyleCached('stW', this.stamFill, 'width', `${stPct.toFixed(1)}%`);
    this.setTextCached('lv', this.levelBadge, `Lv.${player.level}`);
    this.setTextCached('ly', this.lingyunText, String(player.lingyun));

    // 2. Quick-Slot Equipment Readout
    const skTitle = player.activeSkill === 'rush' ? '狂龙迅影斩' : '恸天贯日式';
    const skSub = player.activeSkill === 'rush' ? '耗神 18' : '射日弓 · 22';
    this.setTextCached('skT', this.slotSkill.children[1] as HTMLElement, skTitle);
    this.setTextCached('skS', this.slotSkill.children[2] as HTMLElement, skSub);

    const flTitle = player.activeFlask === 'crimson' ? '鼠儿果露' : '百花蜜茶';
    const flCount = player.activeFlask === 'crimson' ? player.crimsonFlasks : player.ceruleanFlasks;
    this.setTextCached('flT', this.slotFlask.children[1] as HTMLElement, flTitle);
    this.setTextCached('flS', this.slotFlask.children[2] as HTMLElement, `×${flCount}`);

    this.setTextCached(
      'wpS',
      this.slotWeapon.children[2] as HTMLElement,
      player.hasWangshuCharm ? '冰晶佩加持' : '寒晶剑气'
    );

    const canSummon =
      inBossArena && player.spiritContractUnlocked && !player.spiritSummonedThisFight && boss.alive;
    this.slotSpirit.classList.toggle('glow-ready', canSummon);
    this.setTextCached(
      'spS',
      this.slotSpirit.children[2] as HTMLElement,
      player.spiritSummonedThisFight
        ? '幻影助战中'
        : canSummon
          ? '按 V 吹笛召唤'
          : player.spiritContractUnlocked
            ? '雾门内可用'
            : '前阶灵脉获取'
    );

    // 3. Guard Counter / Riposte Cue (works whether locked-on or free-aiming!)
    let cue: string | null = null;
    const anyKneelingNear =
      (lockedTarget && lockedTarget.alive && lockedTarget.isStaggeredKneeling) ||
      (boss.alive && boss.isStaggeredKneeling && boss.pos.distanceTo(player.pos) < 5.5) ||
      (eliteGolem && eliteGolem.alive && eliteGolem.isStaggeredKneeling && eliteGolem.pos.distanceTo(player.pos) < 5.5);

    if (player.guardCounterWindow > 0) {
      cue = '【防反契机】立按 左键 / H 施展卸力重斩！';
    } else if (anyKneelingNear) {
      cue = '【护体剑罡已破】近身按 左键 施展「御剑贯心」处决！';
    }
    this.setStyleCached('cueDisp', this.guardCounterHint, 'display', cue ? 'block' : 'none');
    if (cue) this.setTextCached('cueTxt', this.guardCounterHint, cue);

    // 4. Boss or Courtyard Elite Bottom Health Bar
    let activeBarTarget: { name: string; hp: number; maxHp: number } | null = null;
    if (boss.state !== 'dormant' && boss.alive) {
      activeBarTarget = boss;
    } else if (eliteGolem && eliteGolem.alive && eliteGolem.aiState !== 'idle') {
      activeBarTarget = eliteGolem;
    }

    this.bossWrap.classList.toggle('active', !!activeBarTarget);
    if (activeBarTarget) {
      this.setTextCached('bName', this.bossNameEl, activeBarTarget.name);
      const bPct = THREE.MathUtils.clamp((activeBarTarget.hp / activeBarTarget.maxHp) * 100, 0, 100);
      if (this.lastBossHp > activeBarTarget.hp) {
        this.comboDmgAccum += this.lastBossHp - activeBarTarget.hp;
        this.comboDmgTimer = 2.0;
      }
      this.lastBossHp = activeBarTarget.hp;

      if (this.comboDmgTimer > 0) {
        this.comboDmgTimer -= dt;
        this.setTextCached('bDmg', this.bossComboDmgEl, `${Math.round(this.comboDmgAccum)}`);
      } else {
        this.comboDmgAccum = 0;
        this.setTextCached('bDmg', this.bossComboDmgEl, '');
      }

      if (this.bossDelayPct > bPct) {
        this.bossDelayPct = Math.max(bPct, this.bossDelayPct - 25 * dt);
      } else {
        this.bossDelayPct = bPct;
      }
      this.setStyleCached('bFill', this.bossFill, 'width', `${bPct.toFixed(1)}%`);
      this.setStyleCached('bDelay', this.bossDelayFill, 'width', `${this.bossDelayPct.toFixed(1)}%`);
    } else {
      this.lastBossHp = -1;
    }

    // 5. 3D Lock-On Diamond Reticle Projection
    if (lockedTarget && lockedTarget.alive && !hideHudForCutscene) {
      const worldLock = lockedTarget.pos.clone().add(new THREE.Vector3(0, 1.32, 0));
      worldLock.project(camera);
      if (worldLock.z < 1.0) {
        const sx = (worldLock.x * 0.5 + 0.5) * window.innerWidth;
        const sy = (-worldLock.y * 0.5 + 0.5) * window.innerHeight;
        this.setStyleCached('lockDisp', this.lockReticle, 'display', 'block');
        this.lockReticle.style.left = `${sx.toFixed(1)}px`;
        this.lockReticle.style.top = `${sy.toFixed(1)}px`;
        this.lockReticle.classList.toggle('staggered', lockedTarget.isStaggeredKneeling);
      } else {
        this.setStyleCached('lockDisp', this.lockReticle, 'display', 'none');
      }
    } else {
      this.setStyleCached('lockDisp', this.lockReticle, 'display', 'none');
    }
  }
}
