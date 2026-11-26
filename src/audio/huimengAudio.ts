import { gameAssets } from '../assets/assetLoader';
import { HUIMENG_ACCOMP, HUIMENG_TOTAL_BEATS, HUIMENG_TREBLE } from './huimengScore';

export type MusicMood = 'serene' | 'explore' | 'boss_p1' | 'boss_p2' | 'victory';

export type SfxId =
  | 'swing_light'
  | 'swing_heavy'
  | 'hit_light'
  | 'hit_heavy'
  | 'guard_block'
  | 'guard_counter'
  | 'parry_clang'
  | 'poise_break'
  | 'riposte_stab'
  | 'heal_drink'
  | 'grace_chime'
  | 'fog_gate'
  | 'flute_summon'
  | 'bow_release'
  | 'meteor_boom'
  | 'death_stinger';

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export class HuimengAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain!: GainNode;
  private musicGain!: GainNode;
  private sfxGain!: GainNode;
  private reverbNode!: ConvolverNode;
  private noiseBuffer!: AudioBuffer;
  private decodedSfx = new Map<string, AudioBuffer>();
  private decodingStarted = false;

  public muted = false;
  public mood: MusicMood = 'serene';

  private beatCursor = 0;
  private trebleIdx = 0;
  private accompIdx = 0;
  private drumBeatAccum = 0;

  constructor(autoMute = false) {
    this.muted = autoMute;
  }

  public unlock() {
    if (this.muted) return;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.85;
      this.masterGain.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.24;

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.82;
      this.sfxGain.connect(this.masterGain);

      this.reverbNode = this.ctx.createConvolver();
      this.reverbNode.buffer = this.createHallImpulse(2.2);

      const wetGain = this.ctx.createGain();
      wetGain.gain.value = 0.42;
      this.musicGain.connect(this.masterGain);
      this.musicGain.connect(this.reverbNode);
      this.reverbNode.connect(wetGain);
      wetGain.connect(this.masterGain);

      this.noiseBuffer = this.createNoiseBuffer(4.0);
      this.startAmbientWind();
      this.decodeLoadedSamples();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  private decodeLoadedSamples() {
    if (!this.ctx || this.decodingStarted) return;
    this.decodingStarted = true;
    const ctx = this.ctx;
    for (const [name, rawBuf] of gameAssets.sfxBuffers.entries()) {
      ctx
        .decodeAudioData(rawBuf.slice(0))
        .then((audioBuf) => {
          this.decodedSfx.set(name, audioBuf);
        })
        .catch(() => {});
    }
  }

  private playSample(name: string, volume = 0.72, rate = 1.0): boolean {
    if (!this.ctx || this.muted) return false;
    const buf = this.decodedSfx.get(name);
    if (!buf) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = volume;
    src.connect(g);
    g.connect(this.sfxGain);
    src.start();
    return true;
  }

  public setMuted(mute: boolean) {
    this.muted = mute;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(mute ? 0 : 0.85, this.ctx.currentTime, 0.08);
    }
  }

  public setMood(mood: MusicMood) {
    if (this.mood !== mood && mood === 'victory') {
      this.playSample('victory-stinger', 0.65, 1.0);
    }
    this.mood = mood;
  }

  private createHallImpulse(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const decay = Math.pow(1 - i / len, 2.6);
        data[i] = (Math.random() * 2 - 1) * decay * 0.5;
      }
    }
    return buf;
  }

  private createNoiseBuffer(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buf;
  }

  private startAmbientWind() {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 340;
    filter.Q.value = 2.4;

    const windGain = ctx.createGain();
    windGain.gain.value = 0.045;

    src.connect(filter);
    filter.connect(windGain);
    windGain.connect(this.masterGain);
    src.start();
  }

  private playDiziOrPipaNote(freq: number, durSec: number, isCombatLead: boolean) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    if (isCombatLead) {
      osc.type = 'sawtooth';
      osc2.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      osc2.frequency.setValueAtTime(freq * 2, now);

      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(freq * 5.5, now);
      lp.frequency.exponentialRampToValueAtTime(freq * 1.4, now + Math.min(0.6, durSec));

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.18, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, now + Math.max(0.18, durSec * 0.95));

      osc.connect(lp);
      osc2.connect(lp);
      lp.connect(gain);
      gain.connect(this.musicGain);

      osc.start(now);
      osc2.start(now);
      osc.stop(now + durSec + 0.05);
      osc2.stop(now + durSec + 0.05);
    } else {
      osc.type = 'triangle';
      osc2.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      osc2.frequency.setValueAtTime(freq * 2.0, now);

      const vib = this.ctx.createOscillator();
      const vibGain = this.ctx.createGain();
      vib.frequency.value = 5.4;
      vibGain.gain.value = freq * 0.008;
      vib.connect(vibGain);
      vibGain.connect(osc.frequency);

      const osc2Gain = this.ctx.createGain();
      osc2Gain.gain.value = 0.22;

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.16, now + 0.055);
      gain.gain.setValueAtTime(0.14, now + Math.max(0.06, durSec * 0.72));
      gain.gain.exponentialRampToValueAtTime(0.001, now + durSec + 0.08);

      osc.connect(gain);
      osc2.connect(osc2Gain);
      osc2Gain.connect(gain);
      gain.connect(this.musicGain);

      osc.start(now);
      osc2.start(now);
      vib.start(now);
      osc.stop(now + durSec + 0.12);
      osc2.stop(now + durSec + 0.12);
      vib.stop(now + durSec + 0.12);
    }
  }

  private playGuzhengPluck(freq: number, durSec: number) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.11, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + Math.min(1.4, durSec * 1.2));

    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(now);
    osc.stop(now + Math.min(1.45, durSec * 1.25));
  }

  private playWarDrum(accent: boolean) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(accent ? 118 : 86, now);
    osc.frequency.exponentialRampToValueAtTime(36, now + 0.24);

    gain.gain.setValueAtTime(accent ? 0.28 : 0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  public update(dt: number) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;

    const bpm =
      this.mood === 'boss_p2'
        ? 132
        : this.mood === 'boss_p1'
          ? 108
          : this.mood === 'explore'
            ? 78
            : 84;
    const beatsPerSec = bpm / 60;
    const beatDelta = dt * beatsPerSec;
    this.beatCursor += beatDelta;

    if (this.beatCursor >= HUIMENG_TOTAL_BEATS) {
      this.beatCursor -= HUIMENG_TOTAL_BEATS;
      this.trebleIdx = 0;
      this.accompIdx = 0;
    }

    const isBoss = this.mood === 'boss_p1' || this.mood === 'boss_p2';
    const pitchShift = this.mood === 'boss_p2' ? 2 : 0;

    while (
      this.trebleIdx < HUIMENG_TREBLE.length &&
      HUIMENG_TREBLE[this.trebleIdx][0] <= this.beatCursor
    ) {
      const [, durBeats, pitch] = HUIMENG_TREBLE[this.trebleIdx];
      if (this.mood !== 'explore' || this.trebleIdx % 2 === 0) {
        this.playDiziOrPipaNote(midiToFreq(pitch + pitchShift), durBeats / beatsPerSec, isBoss);
      }
      this.trebleIdx++;
    }

    while (
      this.accompIdx < HUIMENG_ACCOMP.length &&
      HUIMENG_ACCOMP[this.accompIdx][0] <= this.beatCursor
    ) {
      const [, durBeats, pitch] = HUIMENG_ACCOMP[this.accompIdx];
      this.playGuzhengPluck(midiToFreq(pitch + pitchShift + 12), durBeats / beatsPerSec);
      this.accompIdx++;
    }

    if (isBoss) {
      this.drumBeatAccum += beatDelta;
      const step = this.mood === 'boss_p2' ? 0.5 : 1.0;
      if (this.drumBeatAccum >= step) {
        this.drumBeatAccum -= step;
        const beatInBar = Math.floor(this.beatCursor) % 4;
        this.playWarDrum(beatInBar === 0 || (this.mood === 'boss_p2' && beatInBar === 2));
      }
    }
  }

  public playSfx(id: SfxId) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const noiseBurst = (dur: number, freq: number, q: number, vol: number) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const flt = ctx.createBiquadFilter();
      flt.type = 'bandpass';
      flt.frequency.setValueAtTime(freq, now);
      flt.frequency.exponentialRampToValueAtTime(Math.max(120, freq * 0.35), now + dur);
      flt.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + dur);
      src.connect(flt);
      flt.connect(g);
      g.connect(this.sfxGain);
      src.start(now, Math.random() * 2.0, dur + 0.02);
    };

    const tone = (
      type: OscillatorType,
      f0: number,
      f1: number,
      dur: number,
      vol: number,
      delay = 0
    ) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f0, now + delay);
      osc.frequency.exponentialRampToValueAtTime(Math.max(24, f1), now + delay + dur);
      g.gain.setValueAtTime(vol, now + delay);
      g.gain.exponentialRampToValueAtTime(0.001, now + delay + dur);
      osc.connect(g);
      g.connect(this.sfxGain);
      osc.start(now + delay);
      osc.stop(now + delay + dur + 0.02);
    };

    switch (id) {
      case 'swing_light': {
        const idx = 1 + Math.floor(Math.random() * 6);
        const played = this.playSample(`swing-0${idx}`, 0.65, 0.96 + Math.random() * 0.12);
        if (!played) {
          noiseBurst(0.14, 1450, 2.2, 0.32);
          tone('sine', 520, 190, 0.12, 0.12);
        }
        break;
      }
      case 'swing_heavy': {
        const idx = 6 + Math.floor(Math.random() * 4);
        const played = this.playSample(`swing-0${idx}`, 0.82, 0.84 + Math.random() * 0.10);
        if (!played) {
          noiseBurst(0.24, 920, 1.8, 0.48);
        }
        tone('triangle', 320, 92, 0.22, 0.22);
        break;
      }
      case 'hit_light':
        noiseBurst(0.11, 2100, 1.6, 0.45);
        tone('sawtooth', 190, 58, 0.11, 0.38);
        break;
      case 'hit_heavy':
        noiseBurst(0.19, 1600, 1.4, 0.62);
        tone('sawtooth', 145, 42, 0.22, 0.55);
        tone('sine', 92, 32, 0.26, 0.5);
        break;
      case 'guard_block':
        tone('square', 980, 620, 0.12, 0.32);
        noiseBurst(0.1, 2600, 3.5, 0.35);
        break;
      case 'guard_counter':
        tone('sine', 1320, 1310, 0.38, 0.48);
        tone('triangle', 1980, 1960, 0.32, 0.35, 0.02);
        noiseBurst(0.15, 3200, 4.0, 0.35);
        break;
      case 'parry_clang':
        tone('sine', 1560, 1540, 0.55, 0.62);
        tone('triangle', 2340, 2300, 0.45, 0.45);
        tone('square', 780, 420, 0.18, 0.35);
        noiseBurst(0.16, 3800, 3.8, 0.48);
        break;
      case 'poise_break':
        tone('sine', 135, 28, 0.68, 0.82);
        tone('sawtooth', 220, 55, 0.48, 0.45);
        tone('sine', 880, 860, 0.65, 0.32);
        break;
      case 'riposte_stab':
        this.playSample('swing-09', 0.78, 0.88);
        noiseBurst(0.28, 2400, 1.8, 0.68);
        tone('sawtooth', 260, 45, 0.38, 0.65);
        tone('sine', 1240, 620, 0.32, 0.38, 0.06);
        break;
      case 'heal_drink':
        tone('sine', 587, 880, 0.34, 0.28);
        tone('sine', 880, 1175, 0.38, 0.24, 0.1);
        break;
      case 'grace_chime':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, idx) => {
          tone('sine', f, f * 1.002, 0.75, 0.22, idx * 0.08);
        });
        break;
      case 'fog_gate':
        if (!this.playSample('fog-stinger', 0.75, 1.0)) {
          noiseBurst(0.65, 780, 2.5, 0.38);
          tone('sine', 330, 495, 0.65, 0.25);
        }
        break;
      case 'death_stinger':
        if (!this.playSample('death-stinger', 0.80, 1.0)) {
          tone('sine', 110, 42, 1.2, 0.65);
        }
        break;
      case 'flute_summon':
        tone('triangle', 659.25, 783.99, 0.42, 0.32);
        tone('triangle', 987.77, 880.0, 0.55, 0.30, 0.32);
        break;
      case 'bow_release':
        this.playSample('swing-04', 0.55, 1.25);
        noiseBurst(0.22, 2800, 2.6, 0.52);
        tone('sawtooth', 680, 180, 0.28, 0.42);
        break;
      case 'meteor_boom':
        noiseBurst(0.75, 420, 1.1, 0.82);
        tone('sine', 110, 24, 0.85, 0.85);
        tone('sawtooth', 165, 36, 0.65, 0.55);
        break;
    }
  }

  public speakLine(text: string, role: 'xuanxiao' | 'lingsha' | 'mengli') {
    if (this.muted || typeof window.speechSynthesis === 'undefined') return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text.replace(/[「」]/g, ''));
      utter.lang = 'zh-CN';
      utter.pitch = role === 'xuanxiao' ? 0.62 : role === 'lingsha' ? 1.25 : 1.08;
      utter.rate = role === 'xuanxiao' ? 0.88 : 1.0;
      utter.volume = 0.88;

      if (this.musicGain && this.ctx) {
        this.musicGain.gain.setTargetAtTime(0.11, this.ctx.currentTime, 0.1);
        utter.onend = () => {
          if (this.musicGain && this.ctx) {
            this.musicGain.gain.setTargetAtTime(0.24, this.ctx.currentTime, 0.25);
          }
        };
      }
      window.speechSynthesis.speak(utter);
    } catch {
      // Ignore speech synthesis errors on restricted platforms
    }
  }
}
