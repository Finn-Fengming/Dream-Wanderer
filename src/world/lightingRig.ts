import * as THREE from 'three';

export interface WarmLightEmitter {
  pos: THREE.Vector3;
  color: THREE.Color;
  intensity: number;
  distance: number;
  flickerSpeed: number;
  flickerAmp: number;
  phase: number;
}

/**
 * High-Contrast Kunlun Moonlit-Twilight Lighting Rig (`苍月冷锋 × 暖金宫灯火盆池`):
 * - Replaces washed-out midday flat light with a dramatic low-elevation silvery-moon key light
 *   + opposite cool cyan rim light + deep slate shadow fill (> 4.5:1 contrast!).
 * - Maintains a FIXED-SIZE pool of hardware `PointLight`s (`LanternLightPool`) dynamically assigned
 *   every frame to the braziers/lanterns/veins nearest the camera — ZERO shader recompilation!
 */
export class KunlunLightingRig {
  public sunLight: THREE.DirectionalLight;
  public rimLight: THREE.DirectionalLight;
  public hemiLight: THREE.HemisphereLight;
  public sunOffset = new THREE.Vector3(34, 32, -46); // Low grazing moonlit/twilight angle from North-East!

  private emitters: WarmLightEmitter[] = [];
  private lightPool: THREE.PointLight[] = [];
  private demonFactor = 0;

  constructor(scene: THREE.Scene, shadowMapSize: number, poolSize = 8) {
    // Deep twilight hemisphere fill (keeps undersides dark so warm lanterns & AO pop!)
    this.hemiLight = new THREE.HemisphereLight(0x7ca6d8, 0x182234, 0.44);
    scene.add(this.hemiLight);

    // Primary Moon/Twilight Key Light casting crisp long shadows across stone reliefs & snow
    this.sunLight = new THREE.DirectionalLight(0xdcecff, 2.25);
    this.sunLight.position.copy(this.sunOffset);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    this.sunLight.shadow.camera.near = 4;
    this.sunLight.shadow.camera.far = 165;
    const d = 38;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.00032;
    this.sunLight.shadow.normalBias = 0.022;
    scene.add(this.sunLight);
    scene.add(this.sunLight.target);

    // Subtle Opposite Rim Back-Light (carves crisp silver-azure silhouette edges on armor & pines)
    this.rimLight = new THREE.DirectionalLight(0x5da8eb, 0.58);
    this.rimLight.position.set(-36, 22, 44);
    scene.add(this.rimLight);
    scene.add(this.rimLight.target);

    // Pre-allocate fixed PointLight pool (never toggled visible/invisible -> zero WebGL program rebuilds!)
    const count = Math.max(4, poolSize);
    for (let i = 0; i < count; i++) {
      const pl = new THREE.PointLight(0xff9c42, 0, 20, 1.22);
      pl.position.set(0, -500, 0);
      scene.add(pl);
      this.lightPool.push(pl);
    }
  }

  public addEmitter(
    pos: THREE.Vector3,
    colorHex = 0xff9838,
    intensity = 3.4,
    distance = 16.5,
    flickerAmp = 0.16
  ): WarmLightEmitter {
    const em: WarmLightEmitter = {
      pos: pos.clone(),
      color: new THREE.Color(colorHex),
      intensity,
      distance,
      flickerSpeed: 6.2 + Math.random() * 4.5,
      flickerAmp,
      phase: Math.random() * Math.PI * 2,
    };
    this.emitters.push(em);
    return em;
  }

  public setDemonFactor(f: number) {
    this.demonFactor = THREE.MathUtils.clamp(f, 0, 1);
    this.sunLight.color.lerpColors(
      new THREE.Color(0xdcecff),
      new THREE.Color(0xff6b3d),
      this.demonFactor
    );
    this.sunLight.intensity = THREE.MathUtils.lerp(2.25, 2.65, this.demonFactor);
    this.hemiLight.color.lerpColors(
      new THREE.Color(0x7ca6d8),
      new THREE.Color(0xd94832),
      this.demonFactor
    );
    this.hemiLight.groundColor.lerpColors(
      new THREE.Color(0x182234),
      new THREE.Color(0x28090b),
      this.demonFactor
    );
    this.rimLight.color.lerpColors(
      new THREE.Color(0x5da8eb),
      new THREE.Color(0xff9e3d),
      this.demonFactor
    );
  }

  public update(elapsed: number, focusPos: THREE.Vector3, activeCount?: number) {
    // Quantize shadow camera texel steps to eliminate shadow edge shimmering while moving
    const snap = 0.75;
    const tx = Math.round(focusPos.x / snap) * snap;
    const ty = Math.round(focusPos.y / snap) * snap;
    const tz = Math.round(focusPos.z / snap) * snap;

    this.sunLight.target.position.set(tx, ty, tz);
    this.sunLight.position.set(
      tx + this.sunOffset.x,
      ty + this.sunOffset.y,
      tz + this.sunOffset.z
    );
    this.rimLight.target.position.set(tx, ty, tz);
    this.rimLight.position.set(tx - 32, ty + 18, tz + 38);

    // Assign hardware PointLights to closest registered warm lanterns/braziers/spirit-veins!
    const limit = Math.min(this.lightPool.length, activeCount ?? this.lightPool.length);
    const ranked = this.emitters
      .map((e) => ({ e, d2: e.pos.distanceToSquared(focusPos) }))
      .sort((a, b) => a.d2 - b.d2);

    for (let i = 0; i < this.lightPool.length; i++) {
      const pl = this.lightPool[i];
      if (i < limit && i < ranked.length && ranked[i].d2 < 72 * 72) {
        const { e, d2 } = ranked[i];
        const distFade = 1.0 - THREE.MathUtils.smoothstep(Math.sqrt(d2), 38, 70);
        const flicker =
          1.0 +
          (Math.sin(elapsed * e.flickerSpeed + e.phase) * 0.65 +
            Math.sin(elapsed * e.flickerSpeed * 2.37 + e.phase * 1.7) * 0.35) *
            e.flickerAmp;
        pl.position.copy(e.pos);
        pl.color.copy(e.color);
        pl.distance = e.distance * 1.25;
        pl.intensity = e.intensity * 2.15 * flicker * distFade;
      } else {
        pl.intensity = 0;
        pl.position.set(0, -500, 0);
      }
    }
  }
}
