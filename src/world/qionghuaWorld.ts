import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { QualityConfig } from '../core/quality';
import { gameAssets } from '../assets/assetLoader';
import { buildProceduralTextures, QionghuaTextureSet } from './proceduralTextures';
import {
  applyWorldSnowShader,
  createJadeBalustradeRun,
  createQionghuaGrandPaifang,
  createSculptedColossalSword,
  createSweepingChineseRoof,
  createTaiyiImmortalPalace,
} from './chineseArchitecture';

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
      for (int i = 0; i < 5; i++) {
        v += a * noise(p);
        p = p * 2.04 + vec2(17.1, 31.7);
        a *= 0.5;
      }
      return v;
    }

    void main() {
      vec3 d = normalize(vWorldDir);
      float h = d.y;

      // Phase 1: Anime-Realistic Luminous Kunlun Sky (Genshin / Ufotable palette:
      // Crystalline Cerulean Zenith -> Opal Cyan Mid -> Golden-Apricot & Rose Sunset/Moonrise Horizon!)
      vec3 p1Zenith  = vec3(0.055, 0.165, 0.365);
      vec3 p1Mid     = vec3(0.185, 0.425, 0.655);
      vec3 p1Horizon = vec3(0.86, 0.68, 0.58);

      // Phase 2 (Demon Xuanxiao): Blazing Crimson Solar Eclipse & Molten Vermilion Sky
      vec3 p2Zenith  = vec3(0.085, 0.018, 0.038);
      vec3 p2Mid     = vec3(0.36, 0.065, 0.075);
      vec3 p2Horizon = vec3(0.92, 0.30, 0.12);

      vec3 zenith  = mix(p1Zenith, p2Zenith, uDemonFactor);
      vec3 midSky  = mix(p1Mid, p2Mid, uDemonFactor);
      vec3 horizon = mix(p1Horizon, p2Horizon, uDemonFactor);

      vec3 col = mix(horizon, midSky, smoothstep(-0.04, 0.28, h));
      col = mix(col, zenith, smoothstep(0.24, 0.86, h));

      // Warm horizon directional glow behind Juanyun Summit (-Z)
      vec3 keyDir = normalize(vec3(0.15, 0.36, -0.92));
      float sunGlow = pow(max(dot(d, keyDir), 0.0), 5.0);
      vec3 glowCol = mix(vec3(0.95, 0.78, 0.62), vec3(1.35, 0.28, 0.10), uDemonFactor);
      col += glowCol * sunGlow * 0.28;

      // Anime Stylized Sunlit Cumulus Clouds (crisp two-tone cel cloud body + golden-silver rim!)
      if (h > -0.08) {
        vec2 cloudUv = d.xz / (abs(d.y) + 0.22) * 1.35 + vec2(uTime * 0.010, uTime * 0.006);
        float c1 = fbm(cloudUv);
        float c2 = fbm(cloudUv * 2.1 + vec2(3.7, -1.9));
        float density = c1 * 0.72 + c2 * 0.28;
        float fadeH = (1.0 - smoothstep(0.48, 0.88, h)) * smoothstep(-0.08, 0.06, h);
        float cloudBody = smoothstep(0.44, 0.62, density) * fadeH;
        float cloudRim  = smoothstep(0.56, 0.74, density) * fadeH;

        vec3 bodyTint = mix(vec3(0.68, 0.79, 0.90), vec3(0.45, 0.11, 0.12), uDemonFactor);
        vec3 rimTint  = mix(vec3(1.02, 0.92, 0.84), vec3(1.32, 0.46, 0.18), uDemonFactor);
        col = mix(col, bodyTint, cloudBody * 0.55);
        col = mix(col, rimTint, cloudRim * 0.62);
      }

      // Luminous Kunlun Cloud-Sea Abyss below horizon
      if (h < 0.08) {
        float seaNoise = fbm(d.xz * 3.4 + vec2(-uTime * 0.018, uTime * 0.012));
        vec3 abyssBase  = mix(vec3(0.16, 0.30, 0.46), vec3(0.18, 0.04, 0.05), uDemonFactor);
        vec3 abyssCrest = mix(vec3(0.76, 0.78, 0.84), vec3(0.88, 0.25, 0.10), uDemonFactor);
        vec3 seaCol = mix(abyssBase, abyssCrest, smoothstep(0.30, 0.74, seaNoise));
        col = mix(col, seaCol, smoothstep(0.08, -0.24, h));
      }

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

const CloudSeaBillowShader = {
  uniforms: {
    uTime: { value: 0 },
    uDemonFactor: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    varying vec3 vWorldPos;
    void main() {
      vUv = uv;
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorldPos = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform float uDemonFactor;
    varying vec2 vUv;
    varying vec3 vWorldPos;

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
    float fbm(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      for (int i = 0; i < 4; i++) {
        v += a * noise(p);
        p = p * 2.02 + vec2(11.3, 23.7);
        a *= 0.5;
      }
      return v;
    }

    void main() {
      vec2 centered = vUv - 0.5;
      float radial = 1.0 - smoothstep(0.18, 0.50, length(centered));
      if (radial <= 0.005) discard;

      vec2 flowUv = vWorldPos.xz * 0.028 + vec2(uTime * 0.022, -uTime * 0.015);
      float n = fbm(flowUv);
      float billow = smoothstep(0.28, 0.78, n);

      vec3 shadowCol = mix(vec3(0.38, 0.56, 0.74), vec3(0.32, 0.07, 0.08), uDemonFactor);
      vec3 crestCol  = mix(vec3(0.96, 0.94, 0.95), vec3(1.12, 0.36, 0.14), uDemonFactor);
      vec3 col = mix(shadowCol, crestCol, billow);

      float alpha = radial * (0.28 + 0.44 * billow);
      gl_FragColor = vec4(col, alpha);
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

      float threads = pow(0.5 + 0.5 * sin(vUv.x * 28.0 + n1 * 3.0), 8.0) * 0.35;

      float edgeFade = smoothstep(0.0, 0.14, vUv.x) * smoothstep(1.0, 0.86, vUv.x)
                     * smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.82, vUv.y);

      vec3 deepGold = vec3(0.75, 0.52, 0.16);
      vec3 brightGold = vec3(1.80, 1.42, 0.60);
      vec3 col = mix(deepGold, brightGold, smoothstep(0.32, 0.82, swirl + threads));

      float alpha = edgeFade * (0.56 + 0.36 * swirl) * uOpacity;
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
  private cloudSeaMat!: THREE.ShaderMaterial;
  private moonMesh!: THREE.Mesh;
  private moonMat!: THREE.MeshStandardMaterial;
  private moonHaloMat!: THREE.MeshBasicMaterial;
  private fogGateMesh!: THREE.Mesh;
  private fogGateMat!: THREE.ShaderMaterial;
  private shortcutBridgeGroup!: THREE.Group;
  private shortcutPedestalGlow!: THREE.Mesh;

  private sharedMarbleMat!: THREE.MeshStandardMaterial;
  private sharedWoodMat!: THREE.MeshStandardMaterial;
  private sharedRoofMat!: THREE.MeshStandardMaterial;
  private sharedGoldMat!: THREE.MeshStandardMaterial;

  private snowPoints!: THREE.Points;
  private snowPositions!: Float32Array;
  private emberPoints!: THREE.Points;
  private emberPositions!: Float32Array;
  private silkBanners: { mesh: THREE.Mesh; baseRotZ: number; phase: number }[] = [];
  private floatingRocks: { mesh: THREE.Object3D; baseY: number; phase: number; speed: number }[] = [];
  private giantSwords: { group: THREE.Group; baseY: number; phase: number; runeMat: THREE.MeshBasicMaterial }[] = [];
  private taijiMat!: THREE.MeshStandardMaterial;
  private iceReflector: Reflector | null = null;
  private sunOffset = new THREE.Vector3(28, 52, 32);

  constructor(scene: THREE.Scene, quality: QualityConfig) {
    this.scene = scene;
    this.textures = buildProceduralTextures();

    // Bind Real HDRI Sky Probe Environment Reflection!
    this.scene.environment = gameAssets.envMap;
    this.scene.environmentIntensity = 0.72;

    // Luminous atmospheric mist (never murky black!)
    this.scene.fog = new THREE.FogExp2(0x6b92b5, 0.0034);

    // Anime-Realistic Sky/Ground Hemisphere + Crisp Directional Sun/Moon Key Light
    this.hemiLight = new THREE.HemisphereLight(0xcbe8ff, 0x4b637d, 1.05);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff2e2, 2.55);
    this.sunLight.position.copy(this.sunOffset);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
    this.sunLight.shadow.camera.near = 6;
    this.sunLight.shadow.camera.far = 155;
    // Tight 36m dynamic player-following shadow frustum -> 5x sharper shadows!
    const d = 36;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.00035;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.bossArenaLight = new THREE.PointLight(0x80d6ff, 2.0, 58, 1.4);
    this.bossArenaLight.position.set(0, 18.5, -63);
    this.scene.add(this.bossArenaLight);

    this.initSharedArchitecturalMaterials();
    this.buildSkyMoonAndCloudSea();
    this.buildLevelGeometry(quality);
    this.buildKunlunCliffsAndPines();
    this.buildLandmarksAndProps();
    this.buildSpiritVeins();
    this.buildFogGate();
    this.buildWeatherParticles(quality);
  }

  private initSharedArchitecturalMaterials() {
    // 1. Carved Kunlun White Jade (`jade_marble` PBR + subtle snow dusting)
    const mCol = gameAssets.pbr.jadeMarble.color.clone();
    const mNor = gameAssets.pbr.jadeMarble.normal.clone();
    const mRou = gameAssets.pbr.jadeMarble.roughness.clone();
    mCol.needsUpdate = mNor.needsUpdate = mRou.needsUpdate = true;
    mCol.repeat.set(2, 2);
    mNor.repeat.set(2, 2);
    mRou.repeat.set(2, 2);

    this.sharedMarbleMat = new THREE.MeshStandardMaterial({
      color: 0xf4f9fd,
      map: mCol,
      normalMap: mNor,
      normalScale: new THREE.Vector2(0.45, 0.45),
      roughnessMap: mRou,
      roughness: 0.36,
      metalness: 0.08,
    });

    // 2. Vermilion-Lacquer Immortal Palace Timber (`materials-wood` PBR)
    const wCol = gameAssets.pbr.wood.color.clone();
    const wNor = gameAssets.pbr.wood.normal.clone();
    const wRou = gameAssets.pbr.wood.roughness.clone();
    wCol.needsUpdate = wNor.needsUpdate = wRou.needsUpdate = true;
    wCol.repeat.set(2, 4);
    wNor.repeat.set(2, 4);
    wRou.repeat.set(2, 4);

    this.sharedWoodMat = new THREE.MeshStandardMaterial({
      color: 0xa82824, // Classic Chinese Palace Vermilion Lacquer (`朱红廊柱`)
      map: wCol,
      normalMap: wNor,
      roughnessMap: wRou,
      roughness: 0.42,
      metalness: 0.14,
    });

    // 3. Azure-Sapphire Glazed Ceramic Roof Tiles (`glazed_roof` PBR + Kunlun Snow Rime!)
    const rCol = gameAssets.pbr.glazedRoof.color.clone();
    const rNor = gameAssets.pbr.glazedRoof.normal.clone();
    const rRou = gameAssets.pbr.glazedRoof.roughness.clone();
    rCol.needsUpdate = rNor.needsUpdate = rRou.needsUpdate = true;
    rCol.repeat.set(4, 4);
    rNor.repeat.set(4, 4);
    rRou.repeat.set(4, 4);

    this.sharedRoofMat = applyWorldSnowShader(
      new THREE.MeshStandardMaterial({
        color: 0x38668e, // Qionghua Azure-Cyan Glazed Tile (`琉璃青瓦`)
        map: rCol,
        normalMap: rNor,
        normalScale: new THREE.Vector2(0.75, 0.75),
        roughnessMap: rRou,
        roughness: 0.28,
        metalness: 0.28,
      }),
      gameAssets.pbr.kunlunSnow,
      0.58,
      0.52
    );

    // 4. Imperial Gilded Bronze-Gold (`鎏金铜饰`)
    this.sharedGoldMat = new THREE.MeshStandardMaterial({
      color: 0xe6be6a,
      emissive: new THREE.Color(0x362205),
      emissiveIntensity: 0.28,
      roughness: 0.24,
      metalness: 0.86,
    });
  }

  private buildSkyMoonAndCloudSea() {
    const skyGeo = new THREE.SphereGeometry(360, 48, 32);
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(SkyDomeShader.uniforms),
      vertexShader: SkyDomeShader.vertexShader,
      fragmentShader: SkyDomeShader.fragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.scene.add(new THREE.Mesh(skyGeo, this.skyMat));

    // Giant 3D PBR Displaced Celestial Moon high behind Juanyun Summit!
    const moonGroup = new THREE.Group();
    moonGroup.position.set(22, 58, -212);

    this.moonMat = new THREE.MeshStandardMaterial({
      map: gameAssets.pbr.moonColor,
      normalMap: gameAssets.pbr.moonNormal,
      normalScale: new THREE.Vector2(1.2, 1.2),
      emissiveMap: gameAssets.pbr.moonColor,
      emissive: new THREE.Color(0xd8eeff),
      emissiveIntensity: 0.92,
      roughness: 0.75,
      fog: false,
    });
    this.moonMesh = new THREE.Mesh(new THREE.SphereGeometry(23, 40, 32), this.moonMat);
    this.moonMesh.rotation.y = -0.6;
    moonGroup.add(this.moonMesh);

    this.moonHaloMat = new THREE.MeshBasicMaterial({
      map: this.textures.softGlowTex,
      color: new THREE.Color(0.82, 0.95, 1.15),
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    const moonHalo = new THREE.Mesh(new THREE.PlaneGeometry(108, 108), this.moonHaloMat);
    moonHalo.position.z = 2.0;
    moonGroup.add(moonHalo);
    this.scene.add(moonGroup);

    // Swirling Multi-Layer Volumetric Cloud-Sea Billows beneath the Floating Sect
    this.cloudSeaMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(CloudSeaBillowShader.uniforms),
      vertexShader: CloudSeaBillowShader.vertexShader,
      fragmentShader: CloudSeaBillowShader.fragmentShader,
      transparent: true,
      depthWrite: false,
      fog: false,
    });

    for (let i = 0; i < 36; i++) {
      const ang = (i / 36) * Math.PI * 2;
      const ring = i % 3;
      const dist = 34 + ring * 34 + ((i * 7) % 13);
      const puff = new THREE.Mesh(new THREE.PlaneGeometry(86, 86), this.cloudSeaMat);
      puff.rotation.x = -Math.PI / 2;
      puff.position.set(
        Math.cos(ang) * dist,
        -7.5 - ring * 5.2,
        10 + Math.sin(ang) * dist * 1.35
      );
      this.scene.add(puff);
    }
  }

  private createJadeDeckMaterial(repX = 4, repY = 4, snowAmt = 0.34): THREE.MeshStandardMaterial {
    const map = gameAssets.pbr.jadeMarble.color.clone();
    const normal = gameAssets.pbr.jadeMarble.normal.clone();
    const rough = gameAssets.pbr.jadeMarble.roughness.clone();
    map.needsUpdate = normal.needsUpdate = rough.needsUpdate = true;
    map.repeat.set(repX, repY);
    normal.repeat.set(repX, repY);
    rough.repeat.set(repX, repY);

    return applyWorldSnowShader(
      new THREE.MeshStandardMaterial({
        color: 0xf0f7fc,
        map,
        normalMap: normal,
        normalScale: new THREE.Vector2(0.55, 0.55),
        roughnessMap: rough,
        roughness: 0.38,
        metalness: 0.1,
      }),
      gameAssets.pbr.kunlunSnow,
      snowAmt,
      0.55
    );
  }

  private buildDeckBlock(
    x: number,
    topY: number,
    z: number,
    w: number,
    len: number,
    thickness = 3.2,
    repX = 4,
    repY = 4,
    withSideBalustrades = true
  ): THREE.Mesh {
    const mat = this.createJadeDeckMaterial(repX, repY, 0.30);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, thickness, len), mat);
    mesh.position.set(x, topY - thickness * 0.5, z);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    this.scene.add(mesh);

    // Carved Sumeru Bronze-Gold Cornice Band along deck sides
    for (const side of [-1, 1]) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.28, len + 0.1), this.sharedGoldMat);
      curb.position.set(x + side * (w * 0.5 - 0.16), topY - 0.12, z);
      this.scene.add(curb);

      if (withSideBalustrades) {
        const posts = Math.max(3, Math.round(len / 3.8));
        const rail = createJadeBalustradeRun(
          new THREE.Vector3(x + side * (w * 0.5 - 0.22), topY, z - len * 0.48),
          new THREE.Vector3(x + side * (w * 0.5 - 0.22), topY, z + len * 0.48),
          posts,
          this.sharedMarbleMat,
          this.sharedGoldMat
        );
        this.scene.add(rail);
      }
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
    const mat = this.createJadeDeckMaterial(4, 1, 0.25);
    const stepLen = (zEnd - zStart) / steps;
    const stepRise = (yEnd - yStart) / steps;

    const group = new THREE.Group();
    for (let i = 0; i < steps; i++) {
      const sy = yStart + (i + 0.5) * stepRise;
      const sz = zStart + (i + 0.5) * stepLen;
      const stepMesh = new THREE.Mesh(
        new THREE.BoxGeometry(width, Math.abs(stepRise) + 1.5, Math.abs(stepLen) + 0.14),
        mat
      );
      stepMesh.position.set(x, sy - 0.75, sz);
      stepMesh.receiveShadow = true;
      stepMesh.castShadow = true;
      group.add(stepMesh);
    }

    // Carved White-Jade Sloped Stairway Balustrades (`汉白玉垂带望柱栏杆`) on both sides!
    const posts = Math.max(4, Math.round(Math.abs(zEnd - zStart) / 4.2));
    for (const side of [-1, 1]) {
      const rx = x + side * (width * 0.5 + 0.18);
      const rail = createJadeBalustradeRun(
        new THREE.Vector3(rx, yStart, zStart),
        new THREE.Vector3(rx, yEnd, zEnd),
        posts,
        this.sharedMarbleMat,
        this.sharedGoldMat
      );
      group.add(rail);
    }
    this.scene.add(group);
  }

  private buildLevelGeometry(quality: QualityConfig) {
    // Zone 0: Awakening Broken Bridge & Outer Gate Deck (Z: +56 -> +84, Y: 0)
    this.buildDeckBlock(0, 0, 70, 15, 28, 4.4, 4, 8, true);

    // Real Sculpted Broken Jade & Boulder Fragments trailing south into the cloud sea (Z: +85..+95)
    const fragConfigs = [
      { x: -2.5, y: -0.5, z: 86.5, s: 2.2, ry: 0.4 },
      { x: 2.8, y: -1.1, z: 88.6, s: 1.9, ry: 1.7 },
      { x: -0.6, y: -2.0, z: 92.4, s: 1.6, ry: 2.8 },
    ];
    for (const f of fragConfigs) {
      const rock = this.cloneSnowModel(gameAssets.envModels.boulder2, 0.72);
      rock.position.set(f.x, f.y, f.z);
      rock.scale.set(f.s, f.s * 0.85, f.s);
      rock.rotation.y = f.ry;
      this.scene.add(rock);
    }

    // Zone 1: Frost-Crystal Grand Staircase (Z: +56 -> +30, Y: 0 -> +4.5)
    // Leave right side open around Z=46..50 so player can jump onto Broken Eaves Terrace!
    this.buildStairFlight(0, 56, 30, 0.0, 4.5, 14, 24);

    // Zone 1B: Right-Side Elevated Broken Eaves Terrace + Viewing Pavilion (`观云仙亭`)
    this.buildDeckBlock(12.2, 2.2, 46.5, 7.6, 7.5, 3.8, 2, 2, false);
    this.buildDeckBlock(12.6, 4.6, 39.0, 8.2, 8.0, 4.4, 2, 2, false);
    this.buildDeckBlock(12.6, 5.6, 31.5, 8.4, 7.4, 5.0, 2, 2, false);

    // Curved-Eave Immortal Pavilion sheltering the【琼浆玉露】on Terrace #3 (12.6, 5.6, 31.5)
    const pavGroup = new THREE.Group();
    pavGroup.position.set(12.6, 5.6, 31.5);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 4.4, 14), this.sharedWoodMat);
        col.position.set(sx * 2.85, 2.2, sz * 2.65);
        col.castShadow = true;
        pavGroup.add(col);
      }
    }
    const pavRoof = createSweepingChineseRoof(
      8.2,
      7.6,
      2.3,
      1.25,
      this.sharedRoofMat,
      this.sharedGoldMat,
      this.sharedWoodMat
    );
    pavRoof.position.y = 4.4;
    pavGroup.add(pavRoof);
    this.scene.add(pavGroup);

    // Zone 2: Taiji Seal Courtyard Plaza (Center (0, 4.5, +12), Circular/Octagonal R=18.8m)
    const stoneSideMat = applyWorldSnowShader(
      new THREE.MeshStandardMaterial({
        map: gameAssets.pbr.stone.color,
        normalMap: gameAssets.pbr.stone.normal,
        roughnessMap: gameAssets.pbr.stone.roughness,
        roughness: 0.55,
      }),
      gameAssets.pbr.kunlunSnow,
      0.35,
      0.55
    );
    const plazaPedestal = new THREE.Mesh(new THREE.CylinderGeometry(18.8, 16.0, 5.2, 32), stoneSideMat);
    plazaPedestal.position.set(0, 4.5 - 2.62, 12);
    plazaPedestal.receiveShadow = true;
    plazaPedestal.castShadow = true;
    this.scene.add(plazaPedestal);

    const plazaTop = new THREE.Mesh(
      new THREE.CircleGeometry(18.75, 64),
      new THREE.MeshStandardMaterial({
        map: this.textures.taijiFloorMap,
        bumpMap: this.textures.taijiFloorBump,
        bumpScale: 0.05,
        emissiveMap: this.textures.taijiEmissiveMap,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 0.48,
        roughness: 0.34,
        metalness: 0.14,
      })
    );
    plazaTop.rotation.x = -Math.PI / 2;
    plazaTop.position.set(0, 4.51, 12);
    plazaTop.receiveShadow = true;
    this.scene.add(plazaTop);

    // Carved White-Jade Perimeter Balustrades framing East & West arcs of Taiji Courtyard
    // (leaving North Z=-6, South Z=+30, and West Shortcut Z=+14 open!)
    const arcSegments = [
      [0.32, 1.25],   // East front-to-back arc
      [1.88, 2.32],   // West north arc
      [2.68, 2.84],   // West south arc
    ];
    for (const [a0, a1] of arcSegments) {
      const steps = 4;
      for (let s = 0; s < steps; s++) {
        const u0 = THREE.MathUtils.lerp(a0, a1, s / steps);
        const u1 = THREE.MathUtils.lerp(a0, a1, (s + 1) / steps);
        const r = 18.2;
        const p0 = new THREE.Vector3(Math.sin(u0) * r, 4.5, 12 + Math.cos(u0) * r);
        const p1 = new THREE.Vector3(Math.sin(u1) * r, 4.5, 12 + Math.cos(u1) * r);
        this.scene.add(createJadeBalustradeRun(p0, p1, 3, this.sharedMarbleMat, this.sharedGoldMat));
      }
    }

    // Shortcut Levitating Jade Sword Bridge (West side: (-13.5, 4.5, +14) -> (-6.8, 0.0, +64))
    this.shortcutBridgeGroup = new THREE.Group();
    const bridgeStart = new THREE.Vector3(-13.5, 4.45, 14);
    const bridgeEnd = new THREE.Vector3(-6.8, 0.05, 64);
    const stepsCount = 14;
    const swordStoneMat = new THREE.MeshStandardMaterial({
      color: 0xbaf0ff,
      emissive: 0x2288b8,
      emissiveIntensity: 0.85,
      roughness: 0.2,
      metalness: 0.5,
    });
    for (let i = 0; i <= stepsCount; i++) {
      const t = i / stepsCount;
      const p = new THREE.Vector3().lerpVectors(bridgeStart, bridgeEnd, t);
      const pad = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.32, 3.4), swordStoneMat);
      pad.position.copy(p);
      pad.lookAt(bridgeEnd.x, p.y, bridgeEnd.z);
      pad.receiveShadow = true;
      this.shortcutBridgeGroup.add(pad);
    }
    this.shortcutBridgeGroup.visible = false;
    this.scene.add(this.shortcutBridgeGroup);

    // Shortcut Activation Pedestal at (-14.8, 4.5, 14)
    const pedGroup = new THREE.Group();
    pedGroup.position.set(-14.8, 4.5, 14);
    const pedBase = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.88, 1.25, 12), this.sharedMarbleMat);
    pedBase.position.y = 0.62;
    pedBase.castShadow = true;
    pedGroup.add(pedBase);
    this.shortcutPedestalGlow = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.4, 0),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 1.55, 2.2) })
    );
    this.shortcutPedestalGlow.position.y = 1.7;
    pedGroup.add(this.shortcutPedestalGlow);
    this.scene.add(pedGroup);

    // Zone 3: Ascension Floating Stairway (Z: -6 -> -26, Y: +4.5 -> +10.5)
    this.buildStairFlight(0, -6, -26, 4.5, 10.5, 11.5, 22);

    // Zone 3B: Pre-Boss Spirit Vein Terrace (Z: -26 -> -39.5, Y: +10.5)
    this.buildDeckBlock(0, 10.5, -32.8, 18.5, 13.8, 4.8, 5, 4, true);

    // Zone 4: Grand Boss Arena — Juanyun Summit【卷云台】(Center (0, 10.5, -63), R=24m)
    this.taijiMat = new THREE.MeshStandardMaterial({
      map: this.textures.taijiFloorMap,
      bumpMap: this.textures.taijiFloorBump,
      bumpScale: 0.06,
      emissiveMap: this.textures.taijiEmissiveMap,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.65,
      roughness: quality.iceReflection ? 0.26 : 0.24,
      metalness: 0.18,
      transparent: quality.iceReflection,
      opacity: quality.iceReflection ? 0.86 : 1.0,
    });

    if (quality.iceReflection) {
      const reflGeo = new THREE.CircleGeometry(23.8, 64);
      this.iceReflector = new Reflector(reflGeo, {
        clipBias: 0.003,
        textureWidth: Math.floor(window.innerWidth * 0.5),
        textureHeight: Math.floor(window.innerHeight * 0.5),
        color: 0x6f94b2,
      });
      this.iceReflector.rotation.x = -Math.PI / 2;
      this.iceReflector.position.set(0, 10.48, -63);
      this.scene.add(this.iceReflector);
    }

    const arenaPedestal = new THREE.Mesh(new THREE.CylinderGeometry(24.3, 19.2, 8.2, 64), stoneSideMat);
    arenaPedestal.position.set(0, 10.5 - 4.12, -63);
    arenaPedestal.receiveShadow = true;
    this.scene.add(arenaPedestal);

    const arenaTopDisc = new THREE.Mesh(new THREE.CircleGeometry(24.0, 64), this.taijiMat);
    arenaTopDisc.rotation.x = -Math.PI / 2;
    arenaTopDisc.position.set(0, 10.51, -63);
    arenaTopDisc.receiveShadow = true;
    this.scene.add(arenaTopDisc);

    // Golden-Inlaid Carved Rim Ring + 16 Perimeter Lotus Finial Posts around Juanyun Summit!
    const rimRing = new THREE.Mesh(new THREE.TorusGeometry(24.05, 0.36, 12, 72), this.sharedGoldMat);
    rimRing.rotation.x = Math.PI / 2;
    rimRing.position.set(0, 10.56, -63);
    this.scene.add(rimRing);

    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      // Leave South entrance throat (near Z = -39) clear!
      if (Math.cos(a) > 0.92) continue;
      const px = Math.sin(a) * 23.9;
      const pz = -63 + Math.cos(a) * 23.9;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 1.35, 10), this.sharedMarbleMat);
      post.position.set(px, 11.15, pz);
      post.castShadow = true;
      this.scene.add(post);

      const cap = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), this.sharedGoldMat);
      cap.position.set(px, 11.98, pz);
      this.scene.add(cap);
    }
  }

  /**
   * Clones a loaded 3D GLB model and applies our world-space Kunlun Snow Accumulation Shader to its meshes!
   */
  private cloneSnowModel(template: THREE.Group, snowAmt = 0.72): THREE.Group {
    const clone = template.clone(true);
    clone.traverse((node) => {
      if ((node as THREE.Mesh).isMesh) {
        const mesh = node as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (snowAmt > 0 && mesh.material) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          const snowMats = mats.map((m) => {
            const std = m.clone() as THREE.MeshStandardMaterial;
            return applyWorldSnowShader(std, gameAssets.pbr.kunlunSnow, snowAmt, 0.38);
          });
          mesh.material = Array.isArray(mesh.material) ? snowMats : snowMats[0];
        }
      }
    });
    return clone;
  }

  /**
   * Populates the surrounding Kunlun chasm with REAL sculpted `.glb` snow cliffs,
   * gnarled Chinese temple pines (`chinese_pine.glb`), and mountain conifers (`mountain_tree.glb`)!
   */
  private buildKunlunCliffsAndPines() {
    // 1. Sculpted Kunlun Snow Cliffs (`cliff_peak.glb`, native 86x11x24m) framing the mountain sanctuary!
    const cliffPlacements = [
      // Central Kunlun Immortal Peak directly cradling Taiyi Immortal Palace (base Y=12.5 at Z=-136)!
      { x: 0, y: -15.5, z: -136, sx: 0.88, sy: 2.95, sz: 1.35, ry: 0 },
      { x: -68, y: -18, z: -125, sx: 0.95, sy: 3.8, sz: 1.2, ry: 0.42 },
      { x: 72, y: -16, z: -122, sx: 0.95, sy: 3.6, sz: 1.2, ry: -0.45 },
      // Flanking cliff walls along the Chasm (West & East vistas)
      { x: -56, y: -22, z: 18, sx: 0.82, sy: 3.1, sz: 1.1, ry: Math.PI * 0.48 },
      { x: 58, y: -20, z: 24, sx: 0.85, sy: 3.2, sz: 1.1, ry: -Math.PI * 0.46 },
      { x: -52, y: -18, z: -55, sx: 0.75, sy: 2.9, sz: 1.0, ry: Math.PI * 0.38 },
      { x: 54, y: -18, z: -58, sx: 0.78, sy: 3.0, sz: 1.0, ry: -Math.PI * 0.38 },
    ];
    for (const c of cliffPlacements) {
      const cliff = this.cloneSnowModel(gameAssets.envModels.cliffPeak, 0.82);
      cliff.position.set(c.x, c.y, c.z);
      cliff.scale.set(c.sx, c.sy, c.sz);
      cliff.rotation.y = c.ry;
      this.scene.add(cliff);
    }

    // 2. Real Sculpted Gnarled Chinese Temple Pines (`chinese_pine.glb`, native 2.64x1.30x0.77m -> scale 4.0..5.0)
    const pinePlacements = [
      // Framing Outer Gate & Broken Bridge Vista cleanly outside the deck balustrades!
      { x: -11.6, y: -0.6, z: 73.5, s: 4.4, ry: 0.25 },
      { x: 11.8, y: -0.5, z: 65.5, s: 4.5, ry: -2.8 },
      // Clinging dramatically outside the Right Broken-Eaves Terrace cliff edge!
      { x: 18.6, y: 4.1, z: 40.5, s: 4.3, ry: -1.5 },
      { x: 18.8, y: 5.0, z: 27.2, s: 4.2, ry: -1.9 },
      // Framing Taiji Courtyard & Pre-Boss Spirit Vein!
      { x: -20.4, y: 3.9, z: 21.0, s: 4.8, ry: 0.8 },
      { x: 20.6, y: 4.0, z: 4.5, s: 4.8, ry: -2.2 },
      { x: -12.2, y: 10.0, z: -30.5, s: 4.2, ry: 0.55 },
      { x: 12.2, y: 10.0, z: -34.0, s: 4.2, ry: -2.5 },
    ];
    for (const p of pinePlacements) {
      const pine = this.cloneSnowModel(gameAssets.envModels.chinesePine, 0.52);
      pine.position.set(p.x, p.y, p.z);
      pine.scale.setScalar(p.s);
      pine.rotation.y = p.ry;
      this.scene.add(pine);
    }

    // 3. Towering Snow-Dusted Mountain Trees (`mountain_tree.glb`, native 16m tall -> scale 0.55..0.80)
    //    Anchored on craggy `boulder_01.glb` rock islands just off the marble decks!
    const treeIslands = [
      { x: -14.5, y: -2.5, z: 58.0, ts: 0.68, bs: 4.2, ry: 0.5 },
      { x: 15.2, y: -2.2, z: 56.0, ts: 0.65, bs: 4.0, ry: 1.9 },
      { x: -22.5, y: 1.8, z: 8.0, ts: 0.75, bs: 4.8, ry: 2.4 },
      { x: 23.0, y: 2.0, z: 19.5, ts: 0.72, bs: 4.6, ry: 0.9 },
      { x: -16.5, y: 7.2, z: -24.0, ts: 0.66, bs: 4.2, ry: 1.3 },
      { x: 16.8, y: 7.5, z: -22.0, ts: 0.68, bs: 4.4, ry: 2.8 },
    ];
    for (const ti of treeIslands) {
      const baseRock = this.cloneSnowModel(gameAssets.envModels.boulder1, 0.78);
      baseRock.position.set(ti.x, ti.y - 1.4, ti.z);
      baseRock.scale.set(ti.bs, ti.bs * 0.9, ti.bs);
      baseRock.rotation.y = ti.ry;
      this.scene.add(baseRock);

      const tree = this.cloneSnowModel(gameAssets.envModels.mountainTree, 0.62);
      tree.position.set(ti.x, ti.y, ti.z);
      tree.scale.setScalar(ti.ts);
      tree.rotation.y = ti.ry;
      this.scene.add(tree);
    }
  }

  private buildFrostCrystalCluster(x: number, y: number, z: number, scale = 1.0, isCrimson = false) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.scale.setScalar(scale);

    // Real rock base under crystal cluster
    const rockBase = this.cloneSnowModel(gameAssets.envModels.boulder2, 0.55);
    rockBase.scale.set(0.75, 0.65, 0.75);
    g.add(rockBase);

    const mat = new THREE.MeshPhysicalMaterial({
      color: isCrimson ? 0xff5a32 : 0x74dcff,
      emissive: isCrimson ? new THREE.Color(1.45, 0.28, 0.08) : new THREE.Color(0.24, 0.92, 1.42),
      roughness: 0.12,
      metalness: 0.15,
      transmission: 0.35,
      transparent: true,
      opacity: 0.92,
    });

    const shards = [
      { ox: 0, oz: 0, h: 2.85, r: 0.46, rx: 0.06, rz: -0.05 },
      { ox: 0.42, oz: 0.24, h: 1.95, r: 0.32, rx: 0.24, rz: -0.28 },
      { ox: -0.38, oz: 0.18, h: 2.15, r: 0.34, rx: 0.18, rz: 0.31 },
      { ox: 0.12, oz: -0.42, h: 1.55, r: 0.26, rx: -0.32, rz: 0.12 },
    ];
    for (const s of shards) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.04, s.r, s.h, 6), mat);
      m.position.set(s.ox, s.h * 0.46, s.oz);
      m.rotation.set(s.rx, 0.4, s.rz);
      m.castShadow = true;
      g.add(m);
    }
    this.scene.add(g);
    this.obstacles.push({ x, z, r: 0.85 * scale, minY: y - 0.5, maxY: y + 3.0 * scale });
  }

  private buildSilkBanner(x: number, y: number, z: number, rotY = 0) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = rotY;

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 5.4, 10), this.sharedWoodMat);
    pole.position.y = 2.7;
    pole.castShadow = true;
    g.add(pole);

    const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.35, 8), this.sharedGoldMat);
    crossbar.rotation.z = Math.PI / 2;
    crossbar.position.y = 5.15;
    g.add(crossbar);

    const finial = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), this.sharedGoldMat);
    finial.position.y = 5.52;
    g.add(finial);

    const clothMat = new THREE.MeshStandardMaterial({
      color: 0xd8f0ff,
      map: gameAssets.pbr.cloth.color,
      normalMap: gameAssets.pbr.cloth.normal,
      roughnessMap: gameAssets.pbr.cloth.roughness,
      emissive: new THREE.Color(0x164566),
      emissiveIntensity: 0.35,
      side: THREE.DoubleSide,
      roughness: 0.65,
    });
    const bannerGeo = new THREE.PlaneGeometry(1.05, 3.4, 4, 12);
    bannerGeo.translate(0, -1.7, 0);
    const bannerMesh = new THREE.Mesh(bannerGeo, clothMat);
    bannerMesh.position.set(0, 5.12, 0.04);
    bannerMesh.castShadow = true;
    g.add(bannerMesh);

    this.silkBanners.push({
      mesh: bannerMesh,
      baseRotZ: 0.08,
      phase: x * 0.37 + z * 0.21,
    });
    this.scene.add(g);
  }

  private buildLandmarksAndProps() {
    // 1. Grand Three-Bay Five-Roof Qionghua Mountain Paifang at Outer Gate (Z = +57)
    const paifang = createQionghuaGrandPaifang(
      this.sharedMarbleMat,
      this.sharedWoodMat,
      this.sharedRoofMat,
      this.sharedGoldMat,
      gameAssets.envModels.palaceLantern
    );
    paifang.position.set(0, 0, 57);
    this.scene.add(paifang);

    for (const px of [-8.2, -4.4, 4.4, 8.2]) {
      this.obstacles.push({ x: px, z: 57, r: 0.82, minY: -1, maxY: 14 });
    }
    this.occluderGroups.push({
      obj: paifang,
      center: new THREE.Vector3(0, 6, 57),
      radius: 4.5,
    });

    // 2. Courtyard Vermilion-and-Jade Dragon Pillars + Immortal Statues in Zone 2 Plaza
    const courtyardPillars = [
      { x: -7.8, z: 20.0, h: 7.4 },
      { x: 7.8, z: 20.0, h: 5.4 },
      { x: -7.8, z: 4.0, h: 7.4 },
      { x: 7.8, z: 4.0, h: 7.4 },
    ];
    for (const cp of courtyardPillars) {
      const colGroup = new THREE.Group();
      colGroup.position.set(cp.x, 4.5, cp.z);

      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 1.08, 0.95, 16), this.sharedMarbleMat);
      base.position.y = 0.47;
      base.castShadow = true;
      base.receiveShadow = true;
      colGroup.add(base);

      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.70, cp.h, 20), this.sharedWoodMat);
      shaft.position.y = cp.h * 0.5 + 0.35;
      shaft.castShadow = true;
      shaft.receiveShadow = true;
      colGroup.add(shaft);

      const goldCap = new THREE.Mesh(new THREE.CylinderGeometry(0.76, 0.66, 0.42, 18), this.sharedGoldMat);
      goldCap.position.y = cp.h + 0.35;
      colGroup.add(goldCap);

      // Hanging palace lantern on tall unbroken columns
      if (cp.h > 6.5) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.14, 0.14), this.sharedGoldMat);
        const dir = cp.x < 0 ? 1 : -1;
        arm.position.set(dir * 0.85, cp.h - 0.6, 0);
        colGroup.add(arm);

        const lantern = gameAssets.envModels.palaceLantern.clone(true);
        lantern.scale.setScalar(3.2);
        lantern.position.set(dir * 1.22, cp.h - 1.55, 0);
        colGroup.add(lantern);
      }

      this.scene.add(colGroup);
      this.obstacles.push({ x: cp.x, z: cp.z, r: 1.05, minY: 4.0, maxY: 4.5 + cp.h });
      this.occluderGroups.push({
        obj: colGroup,
        center: new THREE.Vector3(cp.x, 4.5 + cp.h * 0.5, cp.z),
        radius: 1.6,
      });
    }

    // Real Sculpted Immortal Statues (`immortal_statue.glb`) flanking East & West Courtyard shrines!
    for (const side of [-1, 1]) {
      const shrineX = side * 15.6;
      const shrineZ = 12.0;
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.38, 1.2, 12), this.sharedMarbleMat);
      ped.position.set(shrineX, 4.5 + 0.6, shrineZ);
      ped.castShadow = true;
      ped.receiveShadow = true;
      this.scene.add(ped);

      const statue = this.cloneSnowModel(gameAssets.envModels.immortalStatue, 0.35);
      statue.scale.setScalar(3.6);
      statue.position.set(shrineX, 4.5 + 1.18, shrineZ);
      statue.rotation.y = -side * (Math.PI / 2);
      this.scene.add(statue);
      this.obstacles.push({ x: shrineX, z: shrineZ, r: 1.35, minY: 4.2, maxY: 9.5 });
    }

    // Fluttering Qionghua Sect Silk Banners along Outer Gate & Pre-Boss Terrace!
    this.buildSilkBanner(-6.6, 0, 62.5, 0.2);
    this.buildSilkBanner(6.6, 0, 62.5, -0.2);
    this.buildSilkBanner(-8.2, 10.5, -28.0, 0.15);
    this.buildSilkBanner(8.2, 10.5, -28.0, -0.15);

    // 3. Frost Crystal Clusters & Xihe Crimson Crystal Intrusions
    this.buildFrostCrystalCluster(-6.3, 0.0, 65.5, 0.92, false);
    this.buildFrostCrystalCluster(6.5, 0.0, 74.5, 1.05, false);
    this.buildFrostCrystalCluster(-12.5, 4.5, 19.5, 1.12, false);
    this.buildFrostCrystalCluster(13.2, 4.5, 8.2, 1.08, true);
    this.buildFrostCrystalCluster(7.4, 10.5, -30.5, 1.02, true);
    this.buildFrostCrystalCluster(-7.8, 10.5, -35.2, 0.9, false);

    // 4. Ornate Gilded Lantern & Flame Pillars flanking Stairs & Golden Mist Gate
    const brazierPositions = [
      [-5.8, 0.0, 59.5],
      [5.8, 0.0, 59.5],
      [-5.9, 4.5, 28.5],
      [5.9, 4.5, 28.5],
      [-5.6, 10.5, -36.5],
      [5.6, 10.5, -36.5],
    ];
    for (const [bx, by, bz] of brazierPositions) {
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.58, 1.45, 12), this.sharedMarbleMat);
      stand.position.set(bx, by + 0.72, bz);
      stand.castShadow = true;
      this.scene.add(stand);

      const lantern = gameAssets.envModels.palaceLantern.clone(true);
      lantern.scale.setScalar(3.4);
      lantern.position.set(bx, by + 1.42, bz);
      this.scene.add(lantern);

      const fireOrb = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 10, 8),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(2.1, 1.15, 0.42) })
      );
      fireOrb.position.set(bx, by + 1.92, bz);
      this.scene.add(fireOrb);
      this.obstacles.push({ x: bx, z: bz, r: 0.72, minY: by, maxY: by + 2.4 });
    }

    // 5. Real Sculpted Anti-Gravity Kunlun Crags (`boulder_01.glb` & `boulder_02.glb`)!
    for (let i = 0; i < 24; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const rx = side * (13 + (i % 5) * 5.2);
      const rz = 52 - i * 5.4;
      const ry = 2.0 + (i / 24) * 14.5 + ((i * 7) % 5);
      const template = i % 2 === 0 ? gameAssets.envModels.boulder1 : gameAssets.envModels.boulder2;
      const rock = this.cloneSnowModel(template, 0.75);
      const s = 1.6 + (i % 3) * 0.95;
      rock.position.set(rx, ry, rz);
      rock.rotation.set(0.12 * (i % 3), i * 1.1, 0.08 * (i % 2));
      rock.scale.set(s, s * 1.28, s);
      this.scene.add(rock);
      this.floatingRocks.push({
        mesh: rock,
        baseY: ry,
        phase: i * 0.85,
        speed: 0.62 + (i % 4) * 0.18,
      });
    }

    // 6. NINE SCULPTED COLOSSAL FLOATING RUNE SWORDS (九柄镇派悬空巨剑) crowning Juanyun Summit!
    const stoneBladeMat = new THREE.MeshStandardMaterial({
      color: 0xa8c2d8,
      map: gameAssets.pbr.stone.color,
      normalMap: gameAssets.pbr.stone.normal,
      roughness: 0.28,
      metalness: 0.52,
    });
    for (let i = 0; i < 9; i++) {
      const frac = i / 8;
      const angle = -Math.PI * 0.12 - frac * Math.PI * 0.76;
      const dist = 36.5 + (i % 2) * 4.5;
      const sx = Math.cos(angle) * dist;
      const sz = -63 + Math.sin(angle) * dist;
      const sy = 15.5 + (i === 4 ? 7.8 : (i % 3) * 2.8);

      const { group: swordGroup, runeMat } = createSculptedColossalSword(
        stoneBladeMat,
        this.sharedGoldMat,
        i % 2 === 1
      );
      swordGroup.position.set(sx, sy, sz);
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

    // 7. Monumental Three-Tiered Qionghua Main Immortal Palace (`太一仙宫`) at Z = -136!
    const palaceGroup = createTaiyiImmortalPalace(
      this.sharedMarbleMat,
      this.sharedWoodMat,
      this.sharedRoofMat,
      this.sharedGoldMat
    );
    palaceGroup.position.set(0, 10.5, -136);

    // Sculpted Kunlun Snow-Crag Ledges cradling the Main Hall & Side Pavilions so zero floating box bases!
    for (const [cx, cy, cz, csx, csy, csz] of [
      [0, -1.8, 2.0, 18.5, 11.5, 11.5],
      [-24.5, -1.2, 4.0, 9.2, 9.5, 8.5],
      [24.5, -1.2, 4.0, 9.2, 9.5, 8.5],
    ]) {
      const crag = this.cloneSnowModel(gameAssets.envModels.boulder1, 0.85);
      crag.position.set(cx, cy, cz);
      crag.scale.set(csx, csy, csz);
      palaceGroup.add(crag);
    }

    const haloRing = new THREE.Mesh(
      new THREE.PlaneGeometry(52, 52),
      new THREE.MeshBasicMaterial({
        map: this.textures.runeRingTex,
        color: new THREE.Color(0.65, 1.38, 1.85),
        transparent: true,
        opacity: 0.48,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    haloRing.position.set(0, 22, -6);
    palaceGroup.add(haloRing);
    this.floatingRocks.push({ mesh: haloRing, baseY: 22, phase: 0, speed: 0.22 });

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

      // Carved White-Jade Lotus Altar Base
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1.26, 0.36, 16), this.sharedMarbleMat);
      base.position.y = 0.18;
      base.receiveShadow = true;
      g.add(base);

      // Planted Real 3D Sword (`katana_base.glb`) glowing with Qionghua Spirit Qi!
      const plantedSword = gameAssets.weaponModels.katanaBase.clone(true);
      plantedSword.scale.setScalar(1.55);
      plantedSword.rotation.set(Math.PI / 2, 0, 0.12);
      plantedSword.position.y = 1.15;
      g.add(plantedSword);

      // Floating Golden-Jade Grace Wisp Core (children[2])
      const flameMat = new THREE.MeshBasicMaterial({
        color: cfg.unlocked ? new THREE.Color(0.85, 1.85, 1.55) : new THREE.Color(0.55, 0.95, 1.25),
      });
      const wisp = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 1), flameMat);
      wisp.position.y = 1.42;
      g.add(wisp);

      // Ground Magic Rune Ring (children[3])
      const runeDisc = new THREE.Mesh(
        new THREE.PlaneGeometry(3.5, 3.5),
        new THREE.MeshBasicMaterial({
          map: this.textures.runeRingTex,
          color: 0x6fe8d8,
          transparent: true,
          opacity: 0.62,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      runeDisc.rotation.x = -Math.PI / 2;
      runeDisc.position.y = 0.04;
      g.add(runeDisc);

      const light = new THREE.PointLight(0x6fe8d8, cfg.unlocked ? 2.4 : 0.9, 13, 1.6);
      light.position.y = 1.65;
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
    // Ornate Curved-Eave Golden Sword-Array Mist Gate at Z = -38.5
    const gateFrame = new THREE.Group();
    gateFrame.position.set(0, 10.5, -38.5);

    for (const side of [-1, 1]) {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.0, 0.9, 14), this.sharedMarbleMat);
      base.position.set(side * 5.2, 0.45, 0);
      gateFrame.add(base);

      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.62, 8.2, 16), this.sharedWoodMat);
      col.position.set(side * 5.2, 4.3, 0);
      col.castShadow = true;
      gateFrame.add(col);
      this.obstacles.push({ x: side * 5.2, z: -38.5, r: 0.92, minY: 10, maxY: 19 });
    }

    const archBeam = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.65, 0.75), this.sharedWoodMat);
    archBeam.position.set(0, 8.1, 0);
    gateFrame.add(archBeam);

    const gateRoof = createSweepingChineseRoof(
      13.6,
      3.8,
      1.75,
      1.05,
      this.sharedRoofMat,
      this.sharedGoldMat,
      this.sharedWoodMat
    );
    gateRoof.position.set(0, 8.45, 0);
    gateFrame.add(gateRoof);

    this.fogGateMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(GoldenMistShader.uniforms),
      vertexShader: GoldenMistShader.vertexShader,
      fragmentShader: GoldenMistShader.fragmentShader,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.fogGateMesh = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 7.2), this.fogGateMat);
    this.fogGateMesh.position.set(0, 3.6, 0);
    gateFrame.add(this.fogGateMesh);

    this.scene.add(gateFrame);
  }

  private buildWeatherParticles(quality: QualityConfig) {
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
      color: 0xeef8ff,
      size: 0.21,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.snowPoints = new THREE.Points(sGeo, sMat);
    this.snowPoints.frustumCulled = false;
    this.scene.add(this.snowPoints);

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
      color: new THREE.Color(1.9, 0.58, 0.16),
      size: 0.28,
      transparent: true,
      opacity: 0.82,
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
    (this.shortcutPedestalGlow.material as THREE.MeshBasicMaterial).color.setRGB(1.85, 1.45, 0.55);
  }

  public setFogGateState(visible: boolean, sealed: boolean) {
    this.fogGateVisible = visible;
    this.fogGateSealed = sealed;
    this.fogGateMesh.visible = visible;
  }

  public setDemonTransition(factor: number) {
    this.demonFactor = THREE.MathUtils.clamp(factor, 0, 1);
    this.skyMat.uniforms.uDemonFactor.value = this.demonFactor;
    this.cloudSeaMat.uniforms.uDemonFactor.value = this.demonFactor;

    const fogCol = new THREE.Color().lerpColors(
      new THREE.Color(0x6b92b5),
      new THREE.Color(0x3a1012),
      this.demonFactor
    );
    (this.scene.fog as THREE.FogExp2).color.copy(fogCol);

    this.sunLight.color.lerpColors(new THREE.Color(0xfff2e2), new THREE.Color(0xff8c62), this.demonFactor);
    this.hemiLight.color.lerpColors(new THREE.Color(0xcbe8ff), new THREE.Color(0xf06852), this.demonFactor);
    this.bossArenaLight.color.lerpColors(new THREE.Color(0x80d6ff), new THREE.Color(0xff4e26), this.demonFactor);
    this.bossArenaLight.intensity = 2.0 + this.demonFactor * 2.2;
    this.scene.environmentIntensity = 0.72 - this.demonFactor * 0.22;

    this.moonMat.emissive.lerpColors(new THREE.Color(0xd8eeff), new THREE.Color(0xff2e14), this.demonFactor);
    this.moonHaloMat.color.lerpColors(new THREE.Color(0.82, 0.95, 1.15), new THREE.Color(1.65, 0.26, 0.1), this.demonFactor);
    this.taijiMat.emissiveIntensity = 0.65 + this.demonFactor * 1.15;

    for (const sw of this.giantSwords) {
      sw.runeMat.color.lerp(new THREE.Color(1.95, 0.38, 0.12), this.demonFactor * 0.85);
    }
  }

  public sampleWalkableHeight(x: number, z: number, currentY = 999): number | null {
    let bestH: number | null = null;
    const consider = (h: number) => {
      if (h <= currentY + 1.45) {
        if (bestH === null || h > bestH) bestH = h;
      }
    };

    if (z >= 55.8 && z <= 83.6 && Math.abs(x) <= 7.1) consider(0.0);

    if (z >= 29.8 && z <= 56.2 && Math.abs(x) <= 6.7) {
      const t = THREE.MathUtils.clamp((56.0 - z) / 26.0, 0, 1);
      consider(t * 4.5);
    }

    if (x >= 8.2 && x <= 15.8 && z >= 42.8 && z <= 50.0) consider(2.2);
    if (x >= 8.4 && x <= 16.4 && z >= 35.0 && z <= 43.0) consider(4.6);
    if (x >= 8.4 && x <= 16.5 && z >= 27.9 && z <= 35.2) consider(5.6);

    if (Math.hypot(x, z - 12.0) <= 18.2) consider(4.5);

    if (this.shortcutUnlocked && z >= 13.5 && z <= 64.5) {
      const t = (z - 14.0) / (64.0 - 14.0);
      const centerLineX = THREE.MathUtils.lerp(-13.5, -6.8, t);
      if (Math.abs(x - centerLineX) <= 1.85) {
        consider(THREE.MathUtils.lerp(4.5, 0.0, THREE.MathUtils.clamp(t, 0, 1)));
      }
    }

    if (z >= -26.2 && z <= -5.8 && Math.abs(x) <= 5.4) {
      const t = THREE.MathUtils.clamp((-6.0 - z) / 20.0, 0, 1);
      consider(4.5 + t * 6.0);
    }

    if (z >= -39.6 && z <= -25.8 && Math.abs(x) <= 8.9) {
      const maxHalfX = z < -37.2 ? 4.4 : 8.9;
      if (Math.abs(x) <= maxHalfX) consider(10.5);
    }

    if (Math.hypot(x, z - -63.0) <= 23.4) consider(10.5);

    return bestH;
  }

  public resolveHorizontalMove(
    prevPos: THREE.Vector3,
    desiredX: number,
    desiredZ: number,
    currentY: number,
    radius = 0.48
  ): { x: number; z: number; groundY: number } {
    let x = desiredX;
    let z = desiredZ;

    if (this.fogGateVisible) {
      if (prevPos.z >= -38.0 && z < -38.0) {
        z = -38.0;
      } else if (this.fogGateSealed && prevPos.z <= -39.0 && z > -39.0) {
        z = -39.0;
      }
    }

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

    const h = this.sampleWalkableHeight(x, z, currentY);
    if (h !== null) return { x, z, groundY: h };

    const hx = this.sampleWalkableHeight(x, prevPos.z, currentY);
    if (hx !== null) return { x, z, groundY: hx };

    const hz = this.sampleWalkableHeight(prevPos.x, z, currentY);
    if (hz !== null) return { x: prevPos.x, z, groundY: hz };

    const hPrev = this.sampleWalkableHeight(prevPos.x, prevPos.z, currentY + 5) ?? currentY;
    return { x: prevPos.x, z: prevPos.z, groundY: hPrev };
  }

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
    this.cloudSeaMat.uniforms.uTime.value = elapsed;
    this.fogGateMat.uniforms.uTime.value = elapsed;

    // Dynamically follow player/camera focus with quantized shadow texel steps -> ultra-crisp shadows!
    const snap = 1.0;
    const tx = Math.round(focusPos.x / snap) * snap;
    const ty = Math.round(focusPos.y / snap) * snap;
    const tz = Math.round(focusPos.z / snap) * snap;
    this.sunLight.target.position.set(tx, ty, tz);
    this.sunLight.position.set(tx + this.sunOffset.x, ty + this.sunOffset.y, tz + this.sunOffset.z);

    // Wind flutter on silk sect banners
    for (const b of this.silkBanners) {
      b.mesh.rotation.x = Math.sin(elapsed * 2.8 + b.phase) * 0.12 + 0.06;
      b.mesh.rotation.z = b.baseRotZ + Math.cos(elapsed * 2.1 + b.phase) * 0.08;
    }

    for (const r of this.floatingRocks) {
      r.mesh.position.y = r.baseY + Math.sin(elapsed * r.speed + r.phase) * 0.45;
      r.mesh.rotation.y += dt * 0.12;
    }
    for (const sw of this.giantSwords) {
      sw.group.position.y = sw.baseY + Math.sin(elapsed * 0.75 + sw.phase) * 0.65;
    }

    this.shortcutPedestalGlow.rotation.y = elapsed * 1.8;
    for (const sv of this.spiritVeins) {
      const wisp = sv.group.children[2];
      if (wisp) {
        wisp.rotation.y = elapsed * 2.2;
        wisp.position.y = 1.42 + Math.sin(elapsed * 2.6) * 0.08;
      }
      const ring = sv.group.children[3];
      if (ring) {
        ring.rotation.z = elapsed * 0.35;
      }
    }

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
