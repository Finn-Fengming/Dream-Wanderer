import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { QualityConfig } from '../core/quality';
import { buildProceduralTextures, QionghuaTextureSet } from './proceduralTextures';

export interface CircleObstacle {
  x: number;
  z: number;
  r: number;
  minY: number;
  maxY: number;
}

export interface SpiritVeinSite {
  id: string;
  name: string;
  position: THREE.Vector3;
  respawnPos: THREE.Vector3;
  respawnYaw: number;
  memorySpeaker: string;
  memoryLine: string;
  unlocked: boolean;
  group: THREE.Group;
  flameMat: THREE.MeshBasicMaterial;
  light: THREE.PointLight;
}

const SkyDomeShader = {
  uniforms: {
    uTime: { value: 0 },
    uDemonFactor: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec3 vWorldDir;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorldDir = normalize(position);
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform float uDemonFactor;
    varying vec3 vWorldDir;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }
    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
        f.y
      );
    }
    float fbm(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      for (int i = 0; i < 4; i++) {
        v += a * noise(p);
        p = p * 2.03 + vec2(17.1, 31.7);
        a *= 0.5;
      }
      return v;
    }

    void main() {
      vec3 d = normalize(vWorldDir);
      float h = d.y;

      // Phase 1: Celestial Twilight Jade-Indigo + Golden-Amber Horizon
      vec3 p1Zenith  = vec3(0.035, 0.075, 0.145);
      vec3 p1Mid     = vec3(0.095, 0.195, 0.305);
      vec3 p1Horizon = vec3(0.42, 0.52, 0.62);

      // Phase 2 (Demon Xuanxiao): Torn Crimson Eclipse + Hellfire Horizon
      vec3 p2Zenith  = vec3(0.075, 0.02, 0.04);
      vec3 p2Mid     = vec3(0.28, 0.055, 0.065);
      vec3 p2Horizon = vec3(0.76, 0.24, 0.10);

      vec3 zenith  = mix(p1Zenith, p2Zenith, uDemonFactor);
      vec3 midSky  = mix(p1Mid, p2Mid, uDemonFactor);
      vec3 horizon = mix(p1Horizon, p2Horizon, uDemonFactor);

      vec3 col = mix(horizon, midSky, smoothstep(-0.06, 0.28, h));
      col = mix(col, zenith, smoothstep(0.25, 0.85, h));

      // Celestial Moon / Crimson Blood-Eclipse high behind Juanyun Summit (-Z, +Y)
      vec3 moonDir = normalize(vec3(0.14, 0.44, -0.88));
      float moonDot = max(dot(d, moonDir), 0.0);
      float moonDisc = smoothstep(0.9965, 0.9978, moonDot);
      float moonHalo = pow(moonDot, 22.0) * 0.55 + pow(moonDot, 5.0) * 0.16;

      vec3 p1MoonCol = vec3(0.75, 0.92, 1.0);
      vec3 p2MoonCol = vec3(1.45, 0.26, 0.12);
      col += mix(p1MoonCol, p2MoonCol, uDemonFactor) * moonHalo;

      // Eclipse dark core in Phase 2
      float eclipseCore = smoothstep(0.9972, 0.9984, dot(d, normalize(moonDir + vec3(0.006 * uDemonFactor, 0.0, 0.0))));
      vec3 discCol = mix(vec3(1.25, 1.35, 1.45), vec3(1.8, 0.42, 0.16), uDemonFactor);
      col = mix(col, discCol, moonDisc);
      col = mix(col, vec3(0.08, 0.01, 0.015), eclipseCore * uDemonFactor * 0.92);

      // Moving upper clouds & abyssal cloud sea
      vec2 cloudUv = d.xz / (abs(d.y) + 0.18) * 1.45 + vec2(uTime * 0.012, uTime * 0.008);
      float c = fbm(cloudUv);
      float cloudMask = smoothstep(0.38, 0.78, c) * (1.0 - smoothstep(0.55, 0.92, abs(h)));
      vec3 cloudLit = mix(vec3(0.56, 0.70, 0.82), vec3(1.15, 0.36, 0.14), uDemonFactor);
      col = mix(col, cloudLit, cloudMask * 0.42);

      // Deep cloud-sea glow below horizon
      if (h < 0.05) {
        float seaNoise = fbm(d.xz * 3.8 + vec2(-uTime * 0.02, uTime * 0.015));
        vec3 abyssBase = mix(vec3(0.06, 0.12, 0.19), vec3(0.16, 0.04, 0.04), uDemonFactor);
        vec3 abyssCrest = mix(vec3(0.28, 0.42, 0.54), vec3(0.75, 0.20, 0.08), uDemonFactor);
        vec3 seaCol = mix(abyssBase, abyssCrest, smoothstep(0.32, 0.76, seaNoise));
        col = mix(col, seaCol, smoothstep(0.05, -0.28, h));
      }

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

const GoldenMistShader = {
  uniforms: {
    uTime: { value: 0 },
    uOpacity: { value: 0.92 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform float uOpacity;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }
    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
        f.y
      );
    }

    void main() {
      float n1 = noise(vUv * vec2(5.0, 3.5) + vec2(0.0, -uTime * 0.42));
      float n2 = noise(vUv * vec2(11.0, 7.0) + vec2(uTime * 0.18, -uTime * 0.75));
      float swirl = n1 * 0.62 + n2 * 0.38;

      // Vertical sword-talisman threads
      float threads = pow(0.5 + 0.5 * sin(vUv.x * 28.0 + n1 * 3.0), 8.0) * 0.35;

      float edgeFade = smoothstep(0.0, 0.14, vUv.x) * smoothstep(1.0, 0.86, vUv.x)
                     * smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.82, vUv.y);

      vec3 deepGold = vec3(0.75, 0.52, 0.16);
      vec3 brightGold = vec3(1.85, 1.45, 0.62); // Controlled HDR peak < 2.2
      vec3 col = mix(deepGold, brightGold, smoothstep(0.32, 0.82, swirl + threads));

      float alpha = edgeFade * (0.58 + 0.38 * swirl) * uOpacity;
      gl_FragColor = vec4(col, alpha);
    }
  `,
};

export class QionghuaWorld {
  public scene: THREE.Scene;
  public textures: QionghuaTextureSet;
  public sunLight: THREE.DirectionalLight;
  public hemiLight: THREE.HemisphereLight;
  public bossArenaLight: THREE.PointLight;

  public obstacles: CircleObstacle[] = [];
  public spiritVeins: SpiritVeinSite[] = [];
  public occluderGroups: { obj: THREE.Object3D; center: THREE.Vector3; radius: number }[] = [];

  public shortcutUnlocked = false;
  public fogGateSealed = false;
  public fogGateVisible = true;
  public demonFactor = 0;

  private skyMat!: THREE.ShaderMaterial;
  private fogGateMesh!: THREE.Mesh;
  private fogGateMat!: THREE.ShaderMaterial;
  private shortcutBridgeGroup!: THREE.Group;
  private shortcutPedestalGlow!: THREE.Mesh;

  private snowPoints!: THREE.Points;
  private snowPositions!: Float32Array;
  private emberPoints!: THREE.Points;
  private emberPositions!: Float32Array;
  private floatingRocks: { mesh: THREE.Object3D; baseY: number; phase: number; speed: number }[] = [];
  private giantSwords: { group: THREE.Group; baseY: number; phase: number; runeMat: THREE.MeshBasicMaterial }[] = [];
  private taijiMat!: THREE.MeshStandardMaterial;
  private iceReflector: Reflector | null = null;

  constructor(scene: THREE.Scene, quality: QualityConfig) {
    this.scene = scene;
    this.textures = buildProceduralTextures();

    // Atmospheric fog
    this.scene.fog = new THREE.FogExp2(0x132536, 0.0068);

    // Hemisphere + Directional Moonlight/Sunlight
    this.hemiLight = new THREE.HemisphereLight(0x8ec5e8, 0x1e2c3a, 0.85);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xd8ecff, 2.15);
    this.sunLight.position.set(34, 62, -45);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
    this.sunLight.shadow.camera.near = 8;
    this.sunLight.shadow.camera.far = 210;
    const d = 78;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);
    this.sunLight.target.position.set(0, 6, -15);

    this.bossArenaLight = new THREE.PointLight(0x6ac8ff, 1.8, 52, 1.5);
    this.bossArenaLight.position.set(0, 18, -63);
    this.scene.add(this.bossArenaLight);

    this.buildSkyAndCloudSea();
    this.buildLevelGeometry(quality);
    this.buildLandmarksAndProps();
    this.buildSpiritVeins();
    this.buildFogGate();
    this.buildWeatherParticles(quality);
  }

  private buildSkyAndCloudSea() {
    const skyGeo = new THREE.SphereGeometry(320, 40, 28);
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(SkyDomeShader.uniforms),
      vertexShader: SkyDomeShader.vertexShader,
      fragmentShader: SkyDomeShader.fragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    const skyMesh = new THREE.Mesh(skyGeo, this.skyMat);
    this.scene.add(skyMesh);

    // Layered drifting cloud-sea planes beneath the floating Qionghua peaks
    const cloudMat = new THREE.MeshBasicMaterial({
      map: this.textures.softGlowTex,
      color: 0x5d84a6,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    });
    for (let i = 0; i < 28; i++) {
      const ang = (i / 28) * Math.PI * 2;
      const dist = 36 + (i % 4) * 26;
      const puff = new THREE.Mesh(new THREE.PlaneGeometry(58, 58), cloudMat);
      puff.rotation.x = -Math.PI / 2;
      puff.position.set(Math.cos(ang) * dist, -10 - (i % 3) * 4, -18 + Math.sin(ang) * dist * 1.25);
      this.scene.add(puff);
    }
  }

  private createJadeStoneMaterial(repX = 4, repY = 4): THREE.MeshStandardMaterial {
    const map = this.textures.jadeTileMap.clone();
    const bump = this.textures.jadeTileBump.clone();
    const rough = this.textures.jadeTileRoughness.clone();
    map.needsUpdate = bump.needsUpdate = rough.needsUpdate = true;
    map.repeat.set(repX, repY);
    bump.repeat.set(repX, repY);
    rough.repeat.set(repX, repY);

    return new THREE.MeshStandardMaterial({
      map,
      bumpMap: bump,
      bumpScale: 0.08,
      roughnessMap: rough,
      roughness: 0.48,
      metalness: 0.12,
    });
  }

  private buildDeckBlock(
    x: number,
    topY: number,
    z: number,
    w: number,
    len: number,
    thickness = 3.2,
    repX = 4,
    repY = 4
  ): THREE.Mesh {
    const mat = this.createJadeStoneMaterial(repX, repY);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, thickness, len), mat);
    mesh.position.set(x, topY - thickness * 0.5, z);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    this.scene.add(mesh);

    // Subtle carved bronze-gold trim along edges
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x9b8256,
      roughness: 0.38,
      metalness: 0.65,
    });
    for (const side of [-1, 1]) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, len), trimMat);
      curb.position.set(x + side * (w * 0.5 - 0.21), topY + 0.12, z);
      curb.receiveShadow = true;
      curb.castShadow = true;
      this.scene.add(curb);
    }
    return mesh;
  }

  private buildStairFlight(
    x: number,
    zStart: number,
    zEnd: number,
    yStart: number,
    yEnd: number,
    width: number,
    steps: number
  ) {
    const mat = this.createJadeStoneMaterial(3, 1);
    const stepLen = (zEnd - zStart) / steps;
    const stepRise = (yEnd - yStart) / steps;

    const group = new THREE.Group();
    for (let i = 0; i < steps; i++) {
      const sy = yStart + (i + 0.5) * stepRise;
      const sz = zStart + (i + 0.5) * stepLen;
      const stepMesh = new THREE.Mesh(
        new THREE.BoxGeometry(width, Math.abs(stepRise) + 1.4, Math.abs(stepLen) + 0.12),
        mat
      );
      stepMesh.position.set(x, sy - 0.7, sz);
      stepMesh.receiveShadow = true;
      stepMesh.castShadow = true;
      group.add(stepMesh);
    }

    // Sloped stone stringers (垂带栏杆) on both sides
    const len3D = Math.hypot(zEnd - zStart, yEnd - yStart);
    const slopeAngle = Math.atan2(yEnd - yStart, zStart - zEnd); // climbing toward -Z
    const railMat = new THREE.MeshStandardMaterial({
      color: 0xaabcc9,
      roughness: 0.45,
      metalness: 0.15,
    });
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, len3D), railMat);
      rail.position.set(x + side * (width * 0.5 + 0.25), (yStart + yEnd) * 0.5 + 0.2, (zStart + zEnd) * 0.5);
      rail.rotation.x = slopeAngle;
      rail.castShadow = true;
      rail.receiveShadow = true;
      group.add(rail);
    }
    this.scene.add(group);
  }

  private buildLevelGeometry(quality: QualityConfig) {
    // Zone 0: Awakening Broken Bridge & Outer Gate Deck (Z: +56 -> +84, Y: 0)
    this.buildDeckBlock(0, 0, 70, 15, 28, 4.0, 4, 8);
    // Shattered bridge fragments trailing south into the cloud abyss (Z: +85..+96)
    const fragMat = this.createJadeStoneMaterial(1, 1);
    const frags = [
      { x: -2.4, y: -0.3, z: 86.5, s: [4.2, 1.4, 3.2], r: 0.08 },
      { x: 2.8, y: -0.9, z: 88.2, s: [3.6, 1.2, 2.8], r: -0.14 },
      { x: -0.6, y: -1.8, z: 92.0, s: [3.2, 1.0, 2.4], r: 0.2 },
    ];
    for (const f of frags) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(f.s[0], f.s[1], f.s[2]), fragMat);
      m.position.set(f.x, f.y, f.z);
      m.rotation.z = f.r;
      m.castShadow = true;
      m.receiveShadow = true;
      this.scene.add(m);
    }

    // Zone 1: Frost-Crystal Grand Staircase (Z: +56 -> +30, Y: 0 -> +4.5)
    this.buildStairFlight(0, 56, 30, 0.0, 4.5, 14, 22);

    // Zone 1B: Right-Side Elevated Broken Eaves Terrace (Exploration Jump Path)
    this.buildDeckBlock(12.2, 2.2, 46.5, 7.6, 7.5, 3.5, 2, 2);
    this.buildDeckBlock(12.6, 4.6, 39.0, 8.2, 8.0, 4.2, 2, 2);
    this.buildDeckBlock(12.6, 5.6, 31.5, 8.4, 7.4, 4.8, 2, 2);

    // Zone 2: Taiji Seal Courtyard Plaza (Center (0, 4.5, +12), Octagonal/Circular R=18.5m)
    const plazaGeo = new THREE.CylinderGeometry(18.8, 16.2, 4.8, 16);
    const plazaMat = new THREE.MeshStandardMaterial({
      map: this.textures.taijiFloorMap,
      bumpMap: this.textures.taijiFloorBump,
      bumpScale: 0.07,
      emissiveMap: this.textures.taijiEmissiveMap,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.55,
      roughness: 0.42,
      metalness: 0.16,
    });
    const plazaMesh = new THREE.Mesh(plazaGeo, plazaMat);
    plazaMesh.position.set(0, 4.5 - 2.4, 12);
    plazaMesh.receiveShadow = true;
    plazaMesh.castShadow = true;
    this.scene.add(plazaMesh);

    // Shortcut Levitating Jade Sword Bridge (West side: connects (-13.5, 4.5, +14) to (-6.8, 0.0, +64))
    this.shortcutBridgeGroup = new THREE.Group();
    const bridgeStart = new THREE.Vector3(-13.5, 4.45, 14);
    const bridgeEnd = new THREE.Vector3(-6.8, 0.05, 64);
    const stepsCount = 14;
    const swordStoneMat = new THREE.MeshStandardMaterial({
      color: 0x8fd6ef,
      emissive: 0x1b6d96,
      emissiveIntensity: 0.75,
      roughness: 0.25,
      metalness: 0.45,
    });
    for (let i = 0; i <= stepsCount; i++) {
      const t = i / stepsCount;
      const p = new THREE.Vector3().lerpVectors(bridgeStart, bridgeEnd, t);
      const pad = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.36, 3.4), swordStoneMat);
      pad.position.copy(p);
      pad.lookAt(bridgeEnd.x, p.y, bridgeEnd.z);
      pad.receiveShadow = true;
      this.shortcutBridgeGroup.add(pad);
    }
    this.shortcutBridgeGroup.visible = false;
    this.scene.add(this.shortcutBridgeGroup);

    // Shortcut Activation Pedestal at (-14.6, 4.5, 14)
    const pedGroup = new THREE.Group();
    pedGroup.position.set(-14.8, 4.5, 14);
    const pedBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.65, 0.85, 1.2, 8),
      new THREE.MeshStandardMaterial({ color: 0x7c8f9e, roughness: 0.4 })
    );
    pedBase.position.y = 0.6;
    pedGroup.add(pedBase);
    this.shortcutPedestalGlow = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.38, 0),
      new THREE.MeshBasicMaterial({ color: 0x5fd8ff })
    );
    this.shortcutPedestalGlow.position.y = 1.65;
    pedGroup.add(this.shortcutPedestalGlow);
    this.scene.add(pedGroup);

    // Zone 3: Ascension Floating Stairway (Z: -6 -> -26, Y: +4.5 -> +10.5)
    this.buildStairFlight(0, -6, -26, 4.5, 10.5, 11.5, 20);

    // Zone 3B: Pre-Boss Spirit Vein Terrace (Z: -26 -> -39.5, Y: +10.5)
    this.buildDeckBlock(0, 10.5, -32.8, 18.5, 13.8, 4.6, 5, 4);

    // Zone 4: Grand Boss Arena — Juanyun Summit【卷云台】(Center (0, 10.5, -63), R=24m)
    this.taijiMat = new THREE.MeshStandardMaterial({
      map: this.textures.taijiFloorMap,
      bumpMap: this.textures.taijiFloorBump,
      bumpScale: 0.08,
      emissiveMap: this.textures.taijiEmissiveMap,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.72,
      roughness: quality.iceReflection ? 0.34 : 0.28,
      metalness: 0.2,
      transparent: quality.iceReflection,
      opacity: quality.iceReflection ? 0.88 : 1.0,
    });

    // Planar reflection beneath the semi-translucent frosted jade arena
    if (quality.iceReflection) {
      const reflGeo = new THREE.CircleGeometry(23.8, 48);
      this.iceReflector = new Reflector(reflGeo, {
        clipBias: 0.003,
        textureWidth: Math.floor(window.innerWidth * 0.5),
        textureHeight: Math.floor(window.innerHeight * 0.5),
        color: 0x46627a,
      });
      this.iceReflector.rotation.x = -Math.PI / 2;
      this.iceReflector.position.set(0, 10.48, -63);
      this.scene.add(this.iceReflector);
    }

    const arenaPedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(24.2, 19.5, 7.5, 48),
      new THREE.MeshStandardMaterial({
        map: this.textures.pillarMap,
        bumpMap: this.textures.pillarBump,
        bumpScale: 0.08,
        roughness: 0.55,
      })
    );
    arenaPedestal.position.set(0, 10.5 - 3.78, -63);
    arenaPedestal.receiveShadow = true;
    this.scene.add(arenaPedestal);

    const arenaTopDisc = new THREE.Mesh(new THREE.CircleGeometry(24.0, 64), this.taijiMat);
    arenaTopDisc.rotation.x = -Math.PI / 2;
    arenaTopDisc.position.set(0, 10.51, -63);
    arenaTopDisc.receiveShadow = true;
    this.scene.add(arenaTopDisc);

    // Golden-jade carved rim ring around Boss Arena
    const rimRing = new THREE.Mesh(
      new THREE.TorusGeometry(24.0, 0.38, 10, 64),
      new THREE.MeshStandardMaterial({ color: 0xb9975b, roughness: 0.35, metalness: 0.7 })
    );
    rimRing.rotation.x = Math.PI / 2;
    rimRing.position.set(0, 10.58, -63);
    this.scene.add(rimRing);
  }

  private buildQionghuaArchway(x: number, y: number, z: number, scale = 1.0) {
    const gate = new THREE.Group();
    gate.position.set(x, y, z);
    gate.scale.setScalar(scale);

    const colMat = new THREE.MeshStandardMaterial({
      map: this.textures.pillarMap,
      bumpMap: this.textures.pillarBump,
      bumpScale: 0.08,
      roughness: 0.42,
      metalness: 0.18,
    });
    const roofMat = new THREE.MeshStandardMaterial({
      color: 0x243b52,
      roughness: 0.32,
      metalness: 0.35,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xd4ae6a,
      roughness: 0.3,
      metalness: 0.78,
      emissive: 0x3a2508,
      emissiveIntensity: 0.35,
    });

    // 4 Pillars (3 bays: central wide bay + 2 side bays)
    const pillarXs = [-8.2, -4.4, 4.4, 8.2];
    const pillarHs = [9.2, 11.8, 11.8, 9.2];
    for (let i = 0; i < 4; i++) {
      const px = pillarXs[i];
      const ph = pillarHs[i];
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.54, ph, 16), colMat);
      cyl.position.set(px, ph * 0.5, 0);
      cyl.castShadow = true;
      cyl.receiveShadow = true;
      gate.add(cyl);

      // Pedestal drum stone
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.76, 0.88, 0.9, 12), colMat);
      base.position.set(px, 0.45, 0);
      gate.add(base);

      // Cloud spire finial on top of pillar
      const finial = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.3, 8), goldMat);
      finial.position.set(px, ph + 0.65, 0);
      gate.add(finial);

      // Register real collision for pillars
      this.obstacles.push({
        x: x + px * scale,
        z,
        r: 0.78 * scale,
        minY: y - 1,
        maxY: y + 14 * scale,
      });
    }

    // Crossbeams & Upturned Flying Eaves (飞檐翘角)
    const mainBeam = new THREE.Mesh(new THREE.BoxGeometry(17.8, 0.85, 0.95), colMat);
    mainBeam.position.set(0, 8.6, 0);
    mainBeam.castShadow = true;
    gate.add(mainBeam);

    const upperBeam = new THREE.Mesh(new THREE.BoxGeometry(10.2, 0.9, 1.05), colMat);
    upperBeam.position.set(0, 10.6, 0);
    upperBeam.castShadow = true;
    gate.add(upperBeam);

    // Central Main Eave + Upturned Wing Tips
    const centerRoof = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.55, 2.8), roofMat);
    centerRoof.position.set(0, 12.1, 0);
    centerRoof.castShadow = true;
    gate.add(centerRoof);

    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.6, 4), roofMat);
      wing.position.set(side * 6.3, 12.65, 0);
      wing.rotation.z = -side * 1.12;
      wing.rotation.y = Math.PI / 4;
      gate.add(wing);

      // Side bay lower roofs
      const sideRoof = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.48, 2.4), roofMat);
      sideRoof.position.set(side * 6.5, 9.45, 0);
      sideRoof.castShadow = true;
      gate.add(sideRoof);

      const sideWing = new THREE.Mesh(new THREE.ConeGeometry(1.05, 2.1, 4), roofMat);
      sideWing.position.set(side * 9.1, 9.95, 0);
      sideWing.rotation.z = -side * 1.12;
      sideWing.rotation.y = Math.PI / 4;
      gate.add(sideWing);

      // Hanging Cyan Jade Lanterns
      const lantern = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.42, 0),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(0.65, 1.55, 2.1) })
      );
      lantern.position.set(side * 3.5, 7.6, 0);
      gate.add(lantern);
    }

    // Inscribed Plaque「瓊 華」
    const cPlaque = document.createElement('canvas');
    cPlaque.width = 256;
    cPlaque.height = 128;
    const pCtx = cPlaque.getContext('2d')!;
    pCtx.fillStyle = '#152232';
    pCtx.fillRect(0, 0, 256, 128);
    pCtx.strokeStyle = '#d9b56f';
    pCtx.lineWidth = 8;
    pCtx.strokeRect(8, 8, 240, 112);
    pCtx.fillStyle = '#f5dfb0';
    pCtx.font = 'bold 58px "STKaiti", "Kaiti SC", serif';
    pCtx.textAlign = 'center';
    pCtx.textBaseline = 'middle';
    pCtx.fillText('瓊 華', 128, 66);
    const plaqueTex = new THREE.CanvasTexture(cPlaque);
    plaqueTex.colorSpace = THREE.SRGBColorSpace;

    const plaque = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 1.45, 0.35),
      new THREE.MeshStandardMaterial({
        map: plaqueTex,
        emissive: 0x3b2a10,
        emissiveIntensity: 0.45,
        roughness: 0.35,
      })
    );
    plaque.position.set(0, 9.75, 0.45);
    gate.add(plaque);

    this.scene.add(gate);
    this.occluderGroups.push({
      obj: gate,
      center: new THREE.Vector3(x, y + 6 * scale, z),
      radius: 4.5 * scale,
    });
  }

  private buildFrostCrystalCluster(x: number, y: number, z: number, scale = 1.0, isCrimson = false) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.scale.setScalar(scale);

    const mat = new THREE.MeshStandardMaterial({
      color: isCrimson ? 0xff542e : 0x5ccfff,
      emissive: isCrimson ? new THREE.Color(1.45, 0.28, 0.08) : new THREE.Color(0.22, 0.88, 1.35),
      roughness: 0.16,
      metalness: 0.25,
      transparent: true,
      opacity: 0.88,
    });

    const shards = [
      { ox: 0, oz: 0, h: 2.8, r: 0.48, rx: 0.06, rz: -0.05 },
      { ox: 0.42, oz: 0.24, h: 1.9, r: 0.34, rx: 0.24, rz: -0.28 },
      { ox: -0.38, oz: 0.18, h: 2.1, r: 0.36, rx: 0.18, rz: 0.31 },
      { ox: 0.12, oz: -0.42, h: 1.5, r: 0.28, rx: -0.32, rz: 0.12 },
    ];
    for (const s of shards) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(s.r, s.h, 6), mat);
      m.position.set(s.ox, s.h * 0.45, s.oz);
      m.rotation.set(s.rx, 0, s.rz);
      m.castShadow = true;
      g.add(m);
    }
    this.scene.add(g);
    this.obstacles.push({ x, z, r: 0.85 * scale, minY: y - 0.5, maxY: y + 3.0 * scale });
  }

  private buildLandmarksAndProps() {
    // 1. Grand Qionghua Mountain Archway at Outer Gate (Z = +57)
    this.buildQionghuaArchway(0, 0, 57, 1.0);

    // 2. Courtyard Pillars (Tactical cover in Zone 2 Plaza, Center (0, 4.5, +12))
    const colMat = new THREE.MeshStandardMaterial({
      map: this.textures.pillarMap,
      bumpMap: this.textures.pillarBump,
      bumpScale: 0.08,
      roughness: 0.45,
    });
    const courtyardPillars = [
      { x: -7.8, z: 20.0, h: 7.4 },
      { x: 7.8, z: 20.0, h: 5.2 }, // Broken column!
      { x: -7.8, z: 4.0, h: 7.4 },
      { x: 7.8, z: 4.0, h: 7.4 },
    ];
    for (const cp of courtyardPillars) {
      const pMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.84, cp.h, 16), colMat);
      pMesh.position.set(cp.x, 4.5 + cp.h * 0.5, cp.z);
      pMesh.castShadow = true;
      pMesh.receiveShadow = true;
      this.scene.add(pMesh);
      this.obstacles.push({ x: cp.x, z: cp.z, r: 1.05, minY: 4.0, maxY: 4.5 + cp.h });
      this.occluderGroups.push({
        obj: pMesh,
        center: new THREE.Vector3(cp.x, 4.5 + cp.h * 0.5, cp.z),
        radius: 1.6,
      });
    }

    // 3. Frost Crystal Clusters & Crimson Magma Cracks along the ascent
    this.buildFrostCrystalCluster(-6.4, 0.0, 63.5, 0.95, false);
    this.buildFrostCrystalCluster(6.6, 0.0, 74.0, 1.1, false);
    this.buildFrostCrystalCluster(-12.5, 4.5, 19.5, 1.15, false);
    this.buildFrostCrystalCluster(13.2, 4.5, 8.2, 1.1, true); // Xihe fire intrusion!
    this.buildFrostCrystalCluster(7.2, 10.5, -30.5, 1.05, true);
    this.buildFrostCrystalCluster(-7.8, 10.5, -35.2, 0.9, false);

    // 4. Bronze Flame Braziers flanking the Golden Mist Gate & Stairs
    const brazierPositions = [
      [-5.6, 0.0, 59.5],
      [5.6, 0.0, 59.5],
      [-5.8, 4.5, 28.5],
      [5.8, 4.5, 28.5],
      [-5.6, 10.5, -36.5],
      [5.6, 10.5, -36.5],
    ];
    const bronzeMat = new THREE.MeshStandardMaterial({ color: 0x5c4b36, roughness: 0.4, metalness: 0.72 });
    for (const [bx, by, bz] of brazierPositions) {
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.42, 1.5, 8), bronzeMat);
      stand.position.set(bx, by + 0.75, bz);
      stand.castShadow = true;
      this.scene.add(stand);

      const fireOrb = new THREE.Mesh(
        new THREE.ConeGeometry(0.38, 0.85, 7),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(1.85, 0.82, 0.28) })
      );
      fireOrb.position.set(bx, by + 1.75, bz);
      this.scene.add(fireOrb);
      this.obstacles.push({ x: bx, z: bz, r: 0.72, minY: by, maxY: by + 2.2 });
    }

    // 5. Anti-Gravity Levitating Rocks & Talisman Stones along Ascension Causeway & Summit
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x596d80,
      roughness: 0.75,
      metalness: 0.1,
    });
    for (let i = 0; i < 24; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const rx = side * (11 + (i % 5) * 4.8);
      const rz = 52 - i * 5.2;
      const ry = 2.0 + (i / 24) * 14.0 + ((i * 7) % 5);
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.1 + (i % 3) * 0.75, 0), rockMat);
      rock.position.set(rx, ry, rz);
      rock.rotation.set(i * 0.7, i * 1.1, i * 0.4);
      rock.scale.set(1.0, 1.45, 0.9);
      this.scene.add(rock);
      this.floatingRocks.push({
        mesh: rock,
        baseY: ry,
        phase: i * 0.85,
        speed: 0.65 + (i % 4) * 0.2,
      });
    }

    // 6. NINE COLOSSAL FLOATING STONE SWORDS (九柄镇派悬空巨剑) crowning Juanyun Summit!
    const stoneBladeMat = new THREE.MeshStandardMaterial({
      color: 0x73889c,
      roughness: 0.42,
      metalness: 0.35,
    });
    const guardGoldMat = new THREE.MeshStandardMaterial({
      color: 0xc29b56,
      roughness: 0.32,
      metalness: 0.75,
    });
    for (let i = 0; i < 9; i++) {
      const frac = i / 8; // Semi-circle + full crown framing (-Z)
      const angle = -Math.PI * 0.12 - frac * Math.PI * 0.76; // Arc behind & flanking the Boss Arena
      const dist = 35.5 + (i % 2) * 4.5;
      const sx = Math.cos(angle) * dist;
      const sz = -63 + Math.sin(angle) * dist;
      const sy = 15.0 + (i === 4 ? 7.5 : (i % 3) * 2.8);

      const swordGroup = new THREE.Group();
      swordGroup.position.set(sx, sy, sz);

      // Blade (24m monumental stone greatsword!)
      const blade = new THREE.Mesh(new THREE.BoxGeometry(2.1, 22.0, 0.55), stoneBladeMat);
      swordGroup.add(blade);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(1.15, 4.2, 4), stoneBladeMat);
      tip.position.y = -13.1;
      tip.rotation.x = Math.PI;
      tip.rotation.y = Math.PI / 4;
      swordGroup.add(tip);

      // Crossguard & Hilt
      const guard = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.1, 1.2), guardGoldMat);
      guard.position.y = 11.2;
      swordGroup.add(guard);
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.62, 4.8, 8), guardGoldMat);
      grip.position.y = 14.0;
      swordGroup.add(grip);

      // Glowing Rune Core Strip down the blade
      const isFireSide = i % 2 === 1;
      const runeMat = new THREE.MeshBasicMaterial({
        color: isFireSide ? new THREE.Color(1.75, 0.48, 0.16) : new THREE.Color(0.38, 1.35, 1.95),
      });
      const runeStrip = new THREE.Mesh(new THREE.BoxGeometry(0.34, 19.5, 0.62), runeMat);
      swordGroup.add(runeStrip);

      // Slight dramatic tilt inward toward Juanyun Arena center
      swordGroup.lookAt(0, sy + 22, -63);
      swordGroup.rotateX(Math.PI * 0.44);

      this.scene.add(swordGroup);
      this.giantSwords.push({
        group: swordGroup,
        baseY: sy,
        phase: i * 0.7,
        runeMat,
      });
    }

    // 7. Distant Floating Qionghua Immortal Peaks & Celestial Sword-Array Halo (-Z = -132)
    const palaceGroup = new THREE.Group();
    palaceGroup.position.set(0, 20, -132);
    const silhouetteMat = new THREE.MeshStandardMaterial({
      color: 0x1a2c40,
      roughness: 0.65,
      metalness: 0.22,
    });
    const eaveGoldMat = new THREE.MeshStandardMaterial({
      color: 0xb69254,
      emissive: 0x3b260a,
      emissiveIntensity: 0.45,
      roughness: 0.35,
      metalness: 0.72,
    });

    // Flanking Kunlun Mountain Spires
    const spires = [
      { x: 0, y: -16, z: 0, r: 22, h: 42 },
      { x: -34, y: -12, z: -8, r: 16, h: 36 },
      { x: 36, y: -10, z: -6, r: 17, h: 38 },
      { x: -58, y: -18, z: 12, r: 13, h: 28 },
      { x: 60, y: -16, z: 14, r: 14, h: 30 },
    ];
    for (const sp of spires) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(sp.r, sp.h, 7), silhouetteMat);
      cone.rotation.x = Math.PI;
      cone.position.set(sp.x, sp.y, sp.z);
      palaceGroup.add(cone);

      const capPeak = new THREE.Mesh(new THREE.ConeGeometry(sp.r * 0.72, sp.h * 0.52, 7), silhouetteMat);
      capPeak.position.set(sp.x, sp.y + sp.h * 0.65, sp.z);
      palaceGroup.add(capPeak);
    }

    // Tiered Qionghua Main Immortal Hall with curved pagoda eaves
    const tiers = [
      { y: 7, w: 26, h: 5.5, d: 14, roofR: 20, roofH: 4.6 },
      { y: 14.2, w: 18, h: 5.0, d: 10, roofR: 14.5, roofH: 4.2 },
      { y: 20.8, w: 10.5, h: 4.5, d: 7, roofR: 9.2, roofH: 4.4 },
    ];
    for (const t of tiers) {
      const body = new THREE.Mesh(new THREE.BoxGeometry(t.w, t.h, t.d), silhouetteMat);
      body.position.y = t.y;
      palaceGroup.add(body);

      const roof = new THREE.Mesh(new THREE.ConeGeometry(t.roofR, t.roofH, 4), silhouetteMat);
      roof.position.y = t.y + t.h * 0.5 + t.roofH * 0.42;
      roof.rotation.y = Math.PI / 4;
      palaceGroup.add(roof);

      const trim = new THREE.Mesh(new THREE.BoxGeometry(t.w + 3.2, 0.36, t.d + 3.2), eaveGoldMat);
      trim.position.y = t.y + t.h * 0.5;
      palaceGroup.add(trim);
    }

    // Spire needle & Celestial Floating Halo Ring behind the Main Hall
    const spirePin = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.55, 8.5, 8), eaveGoldMat);
    spirePin.position.y = 28.5;
    palaceGroup.add(spirePin);

    const haloRing = new THREE.Mesh(
      new THREE.PlaneGeometry(46, 46),
      new THREE.MeshBasicMaterial({
        map: this.textures.runeRingTex,
        color: new THREE.Color(0.58, 1.25, 1.65),
        transparent: true,
        opacity: 0.42,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    haloRing.position.set(0, 22, -6);
    palaceGroup.add(haloRing);
    this.floatingRocks.push({ mesh: haloRing, baseY: 22, phase: 0, speed: 0.25 });

    this.scene.add(palaceGroup);
  }

  private buildSpiritVeins() {
    const configs = [
      {
        id: 'outer_gate',
        name: '琼华外山门 · 灵脉',
        pos: new THREE.Vector3(0, 0, 68.5),
        respawn: new THREE.Vector3(0, 0, 71.2),
        yaw: 0,
        speaker: '韩菱纱 · 回梦残影',
        line: '「野人，山上寒气与剑煞越来越重了……握紧望舒剑，莫要勉强硬接，看准破绽再出剑！」',
        unlocked: true,
      },
      {
        id: 'juanyun_steps',
        name: '卷云台前阶 · 灵脉',
        pos: new THREE.Vector3(-5.2, 10.5, -31.5),
        respawn: new THREE.Vector3(-2.6, 10.5, -31.5),
        yaw: 0,
        speaker: '柳梦璃 · 回梦残影',
        line: '「云公子，金雾之后便是玄霄师叔了。这支幻瞑灵笛请你收下——若战局凶险，梦璃与菱纱的灵影定会伴你左右。」',
        unlocked: false,
      },
    ];

    for (const cfg of configs) {
      const g = new THREE.Group();
      g.position.copy(cfg.pos);

      // Ancient Sword-Shrine Stone Pedestal + Coiled Sword (Bonfire / Site of Grace)
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.95, 1.15, 0.32, 12),
        new THREE.MeshStandardMaterial({ color: 0x6f8496, roughness: 0.45 })
      );
      base.position.y = 0.16;
      base.receiveShadow = true;
      g.add(base);

      // Planted Spirit Sword
      const sword = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 1.85, 0.05),
        new THREE.MeshStandardMaterial({
          color: 0xd8ecff,
          emissive: 0x3aa8e8,
          emissiveIntensity: 0.85,
          metalness: 0.8,
          roughness: 0.2,
        })
      );
      sword.position.y = 1.08;
      sword.rotation.z = 0.08;
      g.add(sword);

      // Floating Golden-Jade Grace Wisp Core
      const flameMat = new THREE.MeshBasicMaterial({
        color: cfg.unlocked ? new THREE.Color(0.85, 1.75, 1.55) : new THREE.Color(0.55, 0.85, 1.05),
      });
      const wisp = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 1), flameMat);
      wisp.position.y = 1.35;
      g.add(wisp);

      // Ground Magic Rune Ring
      const runeDisc = new THREE.Mesh(
        new THREE.PlaneGeometry(3.2, 3.2),
        new THREE.MeshBasicMaterial({
          map: this.textures.runeRingTex,
          color: 0x6fe8d8,
          transparent: true,
          opacity: 0.55,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      runeDisc.rotation.x = -Math.PI / 2;
      runeDisc.position.y = 0.04;
      g.add(runeDisc);

      const light = new THREE.PointLight(0x6fe8d8, cfg.unlocked ? 2.2 : 0.8, 12, 1.6);
      light.position.y = 1.6;
      g.add(light);

      this.scene.add(g);
      this.spiritVeins.push({
        id: cfg.id,
        name: cfg.name,
        position: cfg.pos,
        respawnPos: cfg.respawn,
        respawnYaw: cfg.yaw,
        memorySpeaker: cfg.speaker,
        memoryLine: cfg.line,
        unlocked: cfg.unlocked,
        group: g,
        flameMat,
        light,
      });
    }
  }

  private buildFogGate() {
    // Golden Sword-Array Mist Wall at Z = -38.5 (entrance to Juanyun Boss Arena)
    const gateFrame = new THREE.Group();
    gateFrame.position.set(0, 10.5, -38.5);

    const colMat = new THREE.MeshStandardMaterial({
      map: this.textures.pillarMap,
      roughness: 0.4,
      metalness: 0.25,
    });
    for (const side of [-1, 1]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.74, 8.2, 14), colMat);
      col.position.set(side * 5.2, 4.1, 0);
      col.castShadow = true;
      gateFrame.add(col);
      this.obstacles.push({ x: side * 5.2, z: -38.5, r: 0.92, minY: 10, maxY: 19 });
    }

    this.fogGateMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(GoldenMistShader.uniforms),
      vertexShader: GoldenMistShader.vertexShader,
      fragmentShader: GoldenMistShader.fragmentShader,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.fogGateMesh = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 6.8), this.fogGateMat);
    this.fogGateMesh.position.set(0, 3.4, 0);
    gateFrame.add(this.fogGateMesh);

    this.scene.add(gateFrame);
  }

  private buildWeatherParticles(quality: QualityConfig) {
    // 1. Snowflakes (camera-centered wrapping volume: 56 x 28 x 56m)
    const sCount = quality.snowCount;
    const sGeo = new THREE.BufferGeometry();
    this.snowPositions = new Float32Array(sCount * 3);
    for (let i = 0; i < sCount; i++) {
      this.snowPositions[i * 3 + 0] = (Math.random() - 0.5) * 56;
      this.snowPositions[i * 3 + 1] = Math.random() * 28;
      this.snowPositions[i * 3 + 2] = (Math.random() - 0.5) * 56;
    }
    sGeo.setAttribute('position', new THREE.BufferAttribute(this.snowPositions, 3));

    const sMat = new THREE.PointsMaterial({
      map: this.textures.snowflakeTex,
      color: 0xdff2ff,
      size: 0.34,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.snowPoints = new THREE.Points(sGeo, sMat);
    this.snowPoints.frustumCulled = false;
    this.scene.add(this.snowPoints);

    // 2. Rising Xihe Crimson Embers (intensify near Boss Arena & during Phase 2!)
    const eCount = quality.emberCount;
    const eGeo = new THREE.BufferGeometry();
    this.emberPositions = new Float32Array(eCount * 3);
    for (let i = 0; i < eCount; i++) {
      this.emberPositions[i * 3 + 0] = (Math.random() - 0.5) * 54;
      this.emberPositions[i * 3 + 1] = Math.random() * 24;
      this.emberPositions[i * 3 + 2] = (Math.random() - 0.5) * 54;
    }
    eGeo.setAttribute('position', new THREE.BufferAttribute(this.emberPositions, 3));

    const eMat = new THREE.PointsMaterial({
      map: this.textures.softGlowTex,
      color: new THREE.Color(1.9, 0.55, 0.15),
      size: 0.28,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.emberPoints = new THREE.Points(eGeo, eMat);
    this.emberPoints.frustumCulled = false;
    this.scene.add(this.emberPoints);
  }

  public unlockShortcut() {
    if (this.shortcutUnlocked) return;
    this.shortcutUnlocked = true;
    this.shortcutBridgeGroup.visible = true;
    (this.shortcutPedestalGlow.material as THREE.MeshBasicMaterial).color.setRGB(1.8, 1.45, 0.55);
  }

  public setFogGateState(visible: boolean, sealed: boolean) {
    this.fogGateVisible = visible;
    this.fogGateSealed = sealed;
    this.fogGateMesh.visible = visible;
  }

  public setDemonTransition(factor: number) {
    this.demonFactor = THREE.MathUtils.clamp(factor, 0, 1);
    this.skyMat.uniforms.uDemonFactor.value = this.demonFactor;

    // Smoothly shift world lighting & fog from Moonlit Jade to Crimson Eclipse
    const fogCol = new THREE.Color().lerpColors(new THREE.Color(0x132536), new THREE.Color(0x280b0e), this.demonFactor);
    (this.scene.fog as THREE.FogExp2).color.copy(fogCol);

    this.sunLight.color.lerpColors(new THREE.Color(0xd8ecff), new THREE.Color(0xff9b73), this.demonFactor);
    this.hemiLight.color.lerpColors(new THREE.Color(0x8ec5e8), new THREE.Color(0xe86b58), this.demonFactor);
    this.bossArenaLight.color.lerpColors(new THREE.Color(0x6ac8ff), new THREE.Color(0xff4e26), this.demonFactor);
    this.bossArenaLight.intensity = 1.8 + this.demonFactor * 2.2;

    this.taijiMat.emissiveIntensity = 0.72 + this.demonFactor * 1.15;

    for (const sw of this.giantSwords) {
      sw.runeMat.color.lerp(new THREE.Color(1.95, 0.38, 0.12), this.demonFactor * 0.85);
    }
  }

  /**
   * Exact height & walkability query across all decks, stairs, terrace & Boss Arena.
   * Returns null if (x, z) is over the cloud abyss.
   */
  public sampleWalkableHeight(x: number, z: number, currentY = 999): number | null {
    let bestH: number | null = null;

    const consider = (h: number) => {
      if (h <= currentY + 1.45) {
        if (bestH === null || h > bestH) bestH = h;
      }
    };

    // Deck A: Awakening Broken Bridge & Outer Gate (Z: +56..+83.6, X: -7.1..+7.1)
    if (z >= 55.8 && z <= 83.6 && Math.abs(x) <= 7.1) {
      consider(0.0);
    }

    // Ramp B: Frost-Crystal Grand Staircase (Z: +30..+56, X: -6.7..+6.7)
    if (z >= 29.8 && z <= 56.2 && Math.abs(x) <= 6.7) {
      const t = THREE.MathUtils.clamp((56.0 - z) / 26.0, 0, 1);
      consider(t * 4.5);
    }

    // Deck B2: Right-Side Elevated Broken Eaves Terrace (Jump Exploration Path)
    if (x >= 8.2 && x <= 15.8 && z >= 42.8 && z <= 50.0) {
      consider(2.2);
    }
    if (x >= 8.4 && x <= 16.4 && z >= 35.0 && z <= 43.0) {
      consider(4.6);
    }
    if (x >= 8.4 && x <= 16.5 && z >= 27.9 && z <= 35.2) {
      consider(5.6);
    }

    // Deck C: Taiji Seal Courtyard Plaza (Center (0, +12), R = 18.2m)
    const dPlaza = Math.hypot(x, z - 12.0);
    if (dPlaza <= 18.2) {
      consider(4.5);
    }

    // Shortcut Levitating Jade Sword Bridge (when unlocked!)
    if (this.shortcutUnlocked && z >= 13.5 && z <= 64.5) {
      const t = (z - 14.0) / (64.0 - 14.0);
      const centerLineX = THREE.MathUtils.lerp(-13.5, -6.8, t);
      if (Math.abs(x - centerLineX) <= 1.85) {
        consider(THREE.MathUtils.lerp(4.5, 0.0, THREE.MathUtils.clamp(t, 0, 1)));
      }
    }

    // Ramp D: Ascension Floating Stairway (Z: -26..-6, X: -5.4..+5.4)
    if (z >= -26.2 && z <= -5.8 && Math.abs(x) <= 5.4) {
      const t = THREE.MathUtils.clamp((-6.0 - z) / 20.0, 0, 1);
      consider(4.5 + t * 6.0);
    }

    // Deck E: Pre-Boss Spirit Vein Terrace (Z: -39.6..-26, X: -8.9..+8.9)
    if (z >= -39.6 && z <= -25.8 && Math.abs(x) <= 8.9) {
      // Narrow slightly at the Fog Gate throat (-38.5)
      const maxHalfX = z < -37.2 ? 4.4 : 8.9;
      if (Math.abs(x) <= maxHalfX) {
        consider(10.5);
      }
    }

    // Deck F: Juanyun Summit Boss Arena (Center (0, -63), R = 23.4m)
    const dBoss = Math.hypot(x, z - -63.0);
    if (dBoss <= 23.4) {
      consider(10.5);
    }

    return bestH;
  }

  /**
   * Resolves walkable edge clamping, Fog Gate barrier, and circular pillar/prop collisions.
   * Never accepts an invalid abyss position (reverts or slides cleanly along edges).
   */
  public resolveHorizontalMove(
    prevPos: THREE.Vector3,
    desiredX: number,
    desiredZ: number,
    currentY: number,
    radius = 0.48
  ): { x: number; z: number; groundY: number } {
    let x = desiredX;
    let z = desiredZ;

    // Fog Gate solid barrier: blocks walking straight through unless traversed or unsealed
    if (this.fogGateVisible) {
      if (prevPos.z >= -38.0 && z < -38.0) {
        z = -38.0;
      } else if (this.fogGateSealed && prevPos.z <= -39.0 && z > -39.0) {
        z = -39.0;
      }
    }

    // Push out of circular obstacles (pillars, crystal clusters, braziers)
    for (const ob of this.obstacles) {
      if (currentY + 1.8 < ob.minY || currentY > ob.maxY) continue;
      const dx = x - ob.x;
      const dz = z - ob.z;
      const dist = Math.hypot(dx, dz);
      const minDist = ob.r + radius;
      if (dist < minDist && dist > 0.0001) {
        const push = (minDist - dist) / dist;
        x += dx * push;
        z += dz * push;
      }
    }

    // Verify walkability; try axis-sliding before falling back to prevPos
    let h = this.sampleWalkableHeight(x, z, currentY);
    if (h !== null) {
      return { x, z, groundY: h };
    }

    const hx = this.sampleWalkableHeight(x, prevPos.z, currentY);
    if (hx !== null) {
      return { x, z: prevPos.z, groundY: hx };
    }

    const hz = this.sampleWalkableHeight(prevPos.x, z, currentY);
    if (hz !== null) {
      return { x: prevPos.x, z, groundY: hz };
    }

    const hPrev = this.sampleWalkableHeight(prevPos.x, prevPos.z, currentY + 5) ?? currentY;
    return { x: prevPos.x, z: prevPos.z, groundY: hPrev };
  }

  /**
   * Fades tall archways/pillars smoothly when standing directly between camera and player.
   */
  public updateCameraOccluders(cameraPos: THREE.Vector3, focusPos: THREE.Vector3) {
    const seg = new THREE.Vector3().subVectors(focusPos, cameraPos);
    const segLenSq = Math.max(0.001, seg.lengthSq());

    for (const item of this.occluderGroups) {
      const toObj = new THREE.Vector3().subVectors(item.center, cameraPos);
      const t = THREE.MathUtils.clamp(toObj.dot(seg) / segLenSq, 0, 1);
      const closest = new THREE.Vector3().copy(cameraPos).addScaledVector(seg, t);
      const horizDist = Math.hypot(closest.x - item.center.x, closest.z - item.center.z);
      const blocking = t > 0.08 && t < 0.94 && horizDist < item.radius;

      item.obj.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mat = (child as THREE.Mesh).material as THREE.Material;
          if (mat && 'opacity' in mat) {
            const targetOp = blocking ? 0.28 : 1.0;
            if (blocking && !mat.transparent) mat.transparent = true;
            mat.opacity = THREE.MathUtils.lerp(mat.opacity, targetOp, 0.18);
            if (!blocking && mat.opacity > 0.98) {
              mat.opacity = 1.0;
              mat.transparent = false;
            }
          }
        }
      });
    }

    // Also auto-fade the Golden Mist Gate if camera and player straddle Z = -38.5 or camera is right against it!
    if (this.fogGateVisible) {
      const gateZ = -38.5;
      const straddling = (cameraPos.z - gateZ) * (focusPos.z - gateZ) <= 0 && Math.abs(focusPos.x) < 7.0;
      const camTooClose = Math.abs(cameraPos.z - gateZ) < 2.8 && Math.abs(cameraPos.x) < 6.8;
      const targetFogOp = straddling || camTooClose ? 0.06 : 0.92;
      this.fogGateMat.uniforms.uOpacity.value = THREE.MathUtils.lerp(
        this.fogGateMat.uniforms.uOpacity.value,
        targetFogOp,
        0.25
      );
    }
  }

  public update(dt: number, elapsed: number, focusPos: THREE.Vector3) {
    this.skyMat.uniforms.uTime.value = elapsed;
    this.fogGateMat.uniforms.uTime.value = elapsed;

    // Gentle bobbing of anti-gravity boulders & colossal swords
    for (const r of this.floatingRocks) {
      r.mesh.position.y = r.baseY + Math.sin(elapsed * r.speed + r.phase) * 0.45;
      r.mesh.rotation.y += dt * 0.12;
    }
    for (const sw of this.giantSwords) {
      sw.group.position.y = sw.baseY + Math.sin(elapsed * 0.75 + sw.phase) * 0.65;
    }

    // Rotate shortcut pedestal crystal & spirit vein wisps
    this.shortcutPedestalGlow.rotation.y = elapsed * 1.8;
    for (const sv of this.spiritVeins) {
      const wisp = sv.group.children[2];
      if (wisp) {
        wisp.rotation.y = elapsed * 2.2;
        wisp.position.y = 1.35 + Math.sin(elapsed * 2.6) * 0.08;
      }
      const ring = sv.group.children[3];
      if (ring) {
        ring.rotation.z = elapsed * 0.35;
      }
    }

    // Update camera-following Snowflakes & Rising Xihe Embers
    const sArr = this.snowPositions;
    const sCount = sArr.length / 3;
    const windX = Math.sin(elapsed * 0.45) * 1.8 + 1.1;
    for (let i = 0; i < sCount; i++) {
      let sx = sArr[i * 3 + 0] + windX * dt;
      let sy = sArr[i * 3 + 1] - (2.6 + (i % 5) * 0.45) * dt;
      let sz = sArr[i * 3 + 2] + 0.9 * dt;

      if (sx - focusPos.x > 28) sx -= 56;
      if (sx - focusPos.x < -28) sx += 56;
      if (sz - focusPos.z > 28) sz -= 56;
      if (sz - focusPos.z < -28) sz += 56;
      if (sy - focusPos.y < -4) sy = focusPos.y + 24;
      if (sy - focusPos.y > 24) sy = focusPos.y - 3;

      sArr[i * 3 + 0] = sx;
      sArr[i * 3 + 1] = sy;
      sArr[i * 3 + 2] = sz;
    }
    this.snowPoints.geometry.attributes.position.needsUpdate = true;

    const eArr = this.emberPositions;
    const eCount = eArr.length / 3;
    const emberSpeedMul = 1.0 + this.demonFactor * 1.8;
    for (let i = 0; i < eCount; i++) {
      let ex = eArr[i * 3 + 0] + Math.sin(elapsed * 1.5 + i) * 0.9 * dt;
      let ey = eArr[i * 3 + 1] + (1.8 + (i % 4) * 0.65) * emberSpeedMul * dt;
      let ez = eArr[i * 3 + 2] + Math.cos(elapsed * 1.2 + i) * 0.7 * dt;

      if (ex - focusPos.x > 27) ex -= 54;
      if (ex - focusPos.x < -27) ex += 54;
      if (ez - focusPos.z > 27) ez -= 54;
      if (ez - focusPos.z < -27) ez += 54;
      if (ey - focusPos.y > 22) ey = focusPos.y - 2;
      if (ey - focusPos.y < -3) ey = focusPos.y + 20;

      eArr[i * 3 + 0] = ex;
      eArr[i * 3 + 1] = ey;
      eArr[i * 3 + 2] = ez;
    }
    this.emberPoints.geometry.attributes.position.needsUpdate = true;
  }
}
