import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { QualityConfig } from '../core/quality';
import { gameAssets, PbrMaterialMaps } from '../assets/assetLoader';
import { buildProceduralTextures, QionghuaTextureSet } from './proceduralTextures';
import { CollisionWorld } from './collisionWorld';
import { KunlunLightingRig } from './lightingRig';
import {
  applyKunlunSurfaceShader,
  boxMeters,
  deriveReliefPbrMaps,
  scaleUvMeters,
  snowFootprints,
} from './surfaceMaterials';
import {
  createChineseCoveredCloister,
  createJadeBalustradeRun,
  createQionghuaGrandPaifang,
  createSculptedColossalSword,
  createSweepingChineseRoof,
  createTaiyiImmortalPalace,
} from './chineseArchitecture';

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
  light: { intensity: number };
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

      // Phase 1: High-Contrast Kunlun Moonlit Twilight (苍月寒夜·昆仑琼华)
      // Deep obsidian-sapphire zenith -> cold slate-cerulean mid -> silver-amber twilight horizon!
      vec3 p1Zenith  = vec3(0.018, 0.042, 0.095);
      vec3 p1Mid     = vec3(0.068, 0.155, 0.285);
      vec3 p1Horizon = vec3(0.28, 0.36, 0.48);

      // Phase 2 (Demon Xuanxiao): Blazing Crimson Solar Eclipse & Molten Vermilion Sky
      vec3 p2Zenith  = vec3(0.055, 0.010, 0.022);
      vec3 p2Mid     = vec3(0.26, 0.042, 0.048);
      vec3 p2Horizon = vec3(0.78, 0.22, 0.08);

      vec3 zenith  = mix(p1Zenith, p2Zenith, uDemonFactor);
      vec3 midSky  = mix(p1Mid, p2Mid, uDemonFactor);
      vec3 horizon = mix(p1Horizon, p2Horizon, uDemonFactor);

      vec3 col = mix(horizon, midSky, smoothstep(-0.04, 0.28, h));
      col = mix(col, zenith, smoothstep(0.24, 0.88, h));

      // Crisp Alpine Stars in upper sky dome
      if (h > 0.12) {
        vec2 starGrid = floor(d.xz / (h + 0.35) * 260.0);
        float starVal = hash(starGrid);
        if (starVal > 0.9945) {
          float twinkle = 0.55 + 0.45 * sin(uTime * 2.8 + starVal * 97.0);
          col += vec3(0.75, 0.88, 1.0) * twinkle * smoothstep(0.12, 0.45, h) * (1.0 - uDemonFactor * 0.7);
        }
      }

      // Moonlit / Eclipse directional corona behind Juanyun Summit (-Z)
      vec3 keyDir = normalize(vec3(0.10, 0.26, -0.96));
      float moonGlow = pow(max(dot(d, keyDir), 0.0), 6.0);
      vec3 glowCol = mix(vec3(0.45, 0.65, 0.92), vec3(1.25, 0.26, 0.08), uDemonFactor);
      col += glowCol * moonGlow * 0.36;

      // Moon-rimmed Alpine Night Clouds
      if (h > -0.06) {
        vec2 cloudUv = d.xz / (abs(d.y) + 0.24) * 1.35 + vec2(uTime * 0.008, uTime * 0.005);
        float c1 = fbm(cloudUv);
        float c2 = fbm(cloudUv * 2.1 + vec2(3.7, -1.9));
        float density = c1 * 0.72 + c2 * 0.28;
        float fadeH = (1.0 - smoothstep(0.45, 0.86, h)) * smoothstep(-0.06, 0.06, h);
        float cloudBody = smoothstep(0.46, 0.65, density) * fadeH;
        float cloudRim  = smoothstep(0.60, 0.78, density) * fadeH;

        vec3 bodyTint = mix(vec3(0.10, 0.18, 0.30), vec3(0.28, 0.06, 0.07), uDemonFactor);
        vec3 rimTint  = mix(vec3(0.56, 0.74, 0.95), vec3(1.18, 0.38, 0.14), uDemonFactor);
        col = mix(col, bodyTint, cloudBody * 0.62);
        col = mix(col, rimTint, cloudRim * 0.48);
      }

      // Deep Kunlun Cloud-Sea Chasm below horizon
      if (h < 0.06) {
        float seaNoise = fbm(d.xz * 3.2 + vec2(-uTime * 0.015, uTime * 0.010));
        vec3 abyssBase  = mix(vec3(0.04, 0.09, 0.17), vec3(0.12, 0.02, 0.03), uDemonFactor);
        vec3 abyssCrest = mix(vec3(0.26, 0.38, 0.54), vec3(0.68, 0.18, 0.07), uDemonFactor);
        vec3 seaCol = mix(abyssBase, abyssCrest, smoothstep(0.32, 0.76, seaNoise));
        col = mix(col, seaCol, smoothstep(0.06, -0.22, h));
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
      float radial = 1.0 - smoothstep(0.16, 0.50, length(centered));
      if (radial <= 0.005) discard;

      vec2 flowUv = vWorldPos.xz * 0.026 + vec2(uTime * 0.018, -uTime * 0.012);
      float n = fbm(flowUv);
      float billow = smoothstep(0.30, 0.78, n);

      vec3 shadowCol = mix(vec3(0.07, 0.14, 0.25), vec3(0.22, 0.04, 0.05), uDemonFactor);
      vec3 crestCol  = mix(vec3(0.42, 0.58, 0.76), vec3(0.88, 0.26, 0.10), uDemonFactor);
      vec3 col = mix(shadowCol, crestCol, billow);

      float alpha = radial * (0.24 + 0.42 * billow);
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

      vec3 deepGold = vec3(0.68, 0.44, 0.12);
      vec3 brightGold = vec3(1.58, 1.18, 0.45);
      vec3 col = mix(deepGold, brightGold, smoothstep(0.32, 0.82, swirl + threads));

      float alpha = edgeFade * (0.52 + 0.36 * swirl) * uOpacity;
      gl_FragColor = vec4(col, alpha);
    }
  `,
};

export class QionghuaWorld {
  public scene: THREE.Scene;
  public textures: QionghuaTextureSet;
  public collision: CollisionWorld;
  public lightingRig: KunlunLightingRig;
  public sunLight: THREE.DirectionalLight;
  public hemiLight: THREE.HemisphereLight;

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
  private sharedFlagstoneMat!: THREE.MeshStandardMaterial;
  private sharedAshlarMat!: THREE.MeshStandardMaterial;
  private sharedCliffMat!: THREE.MeshStandardMaterial;
  private sharedWoodMat!: THREE.MeshStandardMaterial;
  private sharedRoofMat!: THREE.MeshStandardMaterial;
  private sharedGoldMat!: THREE.MeshStandardMaterial;
  private sharedFriezeMat!: THREE.MeshStandardMaterial;
  private sharedDragonRampMat!: THREE.MeshStandardMaterial;
  private taijiMat!: THREE.MeshStandardMaterial;

  private taijiReliefMaps!: PbrMaterialMaps;
  private dragonReliefMaps!: PbrMaterialMaps;
  private friezeReliefMaps!: PbrMaterialMaps;

  private grassMesh: THREE.InstancedMesh | null = null;
  private grassUniforms = {
    uTime: { value: 0 },
    uPlayerPos: { value: new THREE.Vector3(0, 0, 76) },
    uDemonFactor: { value: 0 },
  };

  private snowPoints!: THREE.Points;
  private snowPositions!: Float32Array;
  private emberPoints!: THREE.Points;
  private emberPositions!: Float32Array;
  private incenseSmokeWisps: { mesh: THREE.Mesh; basePos: THREE.Vector3; phase: number }[] = [];
  private silkBanners: { mesh: THREE.Mesh; baseRotZ: number; phase: number }[] = [];
  private floatingRocks: { mesh: THREE.Object3D; baseY: number; phase: number; speed: number }[] = [];
  private instancedBoulders: THREE.InstancedMesh | null = null;
  private boulderInstances: {
    pos: THREE.Vector3;
    rot: THREE.Euler;
    scale: THREE.Vector3;
    baseY: number;
    phase: number;
    speed: number;
  }[] = [];
  private snowMatCache = new Map<string, THREE.MeshStandardMaterial>();
  private giantSwords: {
    group: THREE.Group;
    baseY: number;
    phase: number;
    runeMat: THREE.MeshBasicMaterial;
  }[] = [];
  private iceReflector: Reflector | null = null;

  constructor(scene: THREE.Scene, quality: QualityConfig) {
    this.scene = scene;
    this.textures = buildProceduralTextures();
    this.collision = new CollisionWorld();

    // 1. Bind Real 2K Moonlit Alpine HDRI Environment Reflection (subtle intensity -> zero plastic washout!)
    this.scene.environment = gameAssets.envMap;
    this.scene.environmentIntensity = 0.40;
    this.scene.fog = new THREE.FogExp2(0x162840, 0.0042);

    // 2. High-Contrast Kunlun Moonlit Key + Rim + Fixed Warm PointLight Pool
    this.lightingRig = new KunlunLightingRig(scene, quality.shadowMapSize, quality.dynamicLights);
    this.sunLight = this.lightingRig.sunLight;
    this.hemiLight = this.lightingRig.hemiLight;

    // 3. Build 2K Multi-Layer Weathered PBR Material Library
    this.initSharedArchitecturalMaterials();

    // 4. Construct Continuous Kunlun Sanctuary, 4 Detailed Zones, 14k Wind-Grass & Exact CollisionWorld
    this.buildSkyMoonAndCloudSea();
    this.buildContinuousKunlunTerrain();
    this.buildLevelGeometry(quality);
    this.buildKunlunCliffsPinesAndSwordGraveyard();
    this.buildLandmarksCloistersAndChains();
    this.buildInstancedWindGrass(quality.grassCount);
    this.buildSpiritVeins();
    this.buildFogGate();
    this.buildWeatherParticles(quality);

    // 5. Merge Static Architectural Draw Calls (preserving uv + uv1 for 2K PBR & aoMap!)
    this.batchStaticWorldGeometry();
  }

  private initSharedArchitecturalMaterials() {
    // Synthesize Sobel Normal / Roughness / Cavity-AO maps from custom 2K Xianxia Reliefs!
    this.taijiReliefMaps = deriveReliefPbrMaps(gameAssets.pbr.taijiCarvedJade, 3.0, 0.46, true);
    this.dragonReliefMaps = deriveReliefPbrMaps(gameAssets.pbr.dragonRampRelief, 3.4, 0.54, false);
    this.friezeReliefMaps = deriveReliefPbrMaps(gameAssets.pbr.chineseBeamFrieze, 2.2, 0.48, true);

    // 1. Weathered 2K Slate Flagstone Pavements (`slate_flagstone` + Snow Footprints + Ice Glaze!)
    this.sharedFlagstoneMat = applyKunlunSurfaceShader(
      new THREE.MeshStandardMaterial({
        color: 0xbac8d6,
        map: gameAssets.pbr.slateFlagstone.color,
        normalMap: gameAssets.pbr.slateFlagstone.normal,
        normalScale: new THREE.Vector2(1.15, 1.15),
        roughnessMap: gameAssets.pbr.slateFlagstone.roughness,
        aoMap: gameAssets.pbr.slateFlagstone.ao,
        aoMapIntensity: 0.85,
        roughness: 0.72,
        metalness: 0.06,
      }),
      gameAssets.pbr.alpineSnow,
      {
        snowCoverage: 0.42,
        iceGlaze: 0.34,
        stoneMacroBreakup: 0.42,
        enableFootprints: true,
      }
    );

    // 2. Dressed Ashlar Retaining Walls & Podium Foundations (`ashlar_stone` 2K 4-ch PBR)
    this.sharedAshlarMat = applyKunlunSurfaceShader(
      new THREE.MeshStandardMaterial({
        color: 0xaab8c7,
        map: gameAssets.pbr.ashlarStone.color,
        normalMap: gameAssets.pbr.ashlarStone.normal,
        normalScale: new THREE.Vector2(1.25, 1.25),
        roughnessMap: gameAssets.pbr.ashlarStone.roughness,
        aoMap: gameAssets.pbr.ashlarStone.ao,
        aoMapIntensity: 0.92,
        roughness: 0.78,
        metalness: 0.05,
      }),
      gameAssets.pbr.alpineSnow,
      {
        snowCoverage: 0.34,
        iceGlaze: 0.14,
        stoneMacroBreakup: 0.45,
      }
    );

    // 3. Carved Kunlun White Jade Balustrades & Stair Treads (`white_jade` 2K 4-ch PBR)
    this.sharedMarbleMat = applyKunlunSurfaceShader(
      new THREE.MeshStandardMaterial({
        color: 0xdce7f2,
        map: gameAssets.pbr.whiteJade.color,
        normalMap: gameAssets.pbr.whiteJade.normal,
        normalScale: new THREE.Vector2(0.75, 0.75),
        roughnessMap: gameAssets.pbr.whiteJade.roughness,
        aoMap: gameAssets.pbr.whiteJade.ao,
        aoMapIntensity: 0.78,
        roughness: 0.46,
        metalness: 0.08,
      }),
      gameAssets.pbr.alpineSnow,
      {
        snowCoverage: 0.30,
        iceGlaze: 0.24,
        stoneMacroBreakup: 0.28,
        enableFootprints: true,
      }
    );

    // 4. Sculpted Kunlun Alpine Cliff Rock (`kunlun_cliff` 2K 4-ch PBR + Heavy Snow Drifts)
    this.sharedCliffMat = applyKunlunSurfaceShader(
      new THREE.MeshStandardMaterial({
        color: 0x9aa9ba,
        map: gameAssets.pbr.kunlunCliff.color,
        normalMap: gameAssets.pbr.kunlunCliff.normal,
        normalScale: new THREE.Vector2(1.35, 1.35),
        roughnessMap: gameAssets.pbr.kunlunCliff.roughness,
        aoMap: gameAssets.pbr.kunlunCliff.ao,
        aoMapIntensity: 0.95,
        roughness: 0.84,
        metalness: 0.04,
      }),
      gameAssets.pbr.alpineSnow,
      {
        snowCoverage: 0.68,
        iceGlaze: 0.18,
        stoneMacroBreakup: 0.48,
        enableFootprints: true,
      }
    );

    // 5. Imperial Vermilion Lacquer Palace Timber (`朱红宫墙廊柱`, 2K wood normal + roughness + AO!)
    this.sharedWoodMat = new THREE.MeshStandardMaterial({
      color: 0xb82c24,
      emissive: new THREE.Color(0x160302),
      normalMap: gameAssets.pbr.palaceWood.normal,
      normalScale: new THREE.Vector2(0.92, 0.92),
      roughnessMap: gameAssets.pbr.palaceWood.roughness,
      aoMap: gameAssets.pbr.palaceWood.ao,
      aoMapIntensity: 0.85,
      roughness: 0.44,
      metalness: 0.12,
    });

    // 6. Painted Imperial Xuanzi Dragon-Cloud Architrave Frieze (`旋子彩画额枋`)
    this.sharedFriezeMat = new THREE.MeshStandardMaterial({
      color: 0xe8eef5,
      map: this.friezeReliefMaps.color,
      normalMap: this.friezeReliefMaps.normal,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughnessMap: this.friezeReliefMaps.roughness,
      aoMap: this.friezeReliefMaps.ao,
      aoMapIntensity: 0.75,
      roughness: 0.46,
      metalness: 0.28,
    });

    // 7. Carved Imperial Cloud-Dragon Danbi Stone Relief (`承天丹陛云龙御路石雕`)
    this.sharedDragonRampMat = applyKunlunSurfaceShader(
      new THREE.MeshStandardMaterial({
        color: 0xd5e2ee,
        map: this.dragonReliefMaps.color,
        normalMap: this.dragonReliefMaps.normal,
        normalScale: new THREE.Vector2(1.45, 1.45),
        roughnessMap: this.dragonReliefMaps.roughness,
        aoMap: this.dragonReliefMaps.ao,
        aoMapIntensity: 0.92,
        roughness: 0.56,
        metalness: 0.08,
      }),
      gameAssets.pbr.alpineSnow,
      {
        snowCoverage: 0.28,
        iceGlaze: 0.22,
        stoneMacroBreakup: 0.22,
      }
    );

    // 8. Glazed Qionghua Sapphire Roof Tiles (`ceramic_tile` 2K 4-ch PBR + Kunlun Frost Rime)
    this.sharedRoofMat = applyKunlunSurfaceShader(
      new THREE.MeshStandardMaterial({
        color: 0x365f86,
        map: gameAssets.pbr.ceramicTile.color,
        normalMap: gameAssets.pbr.ceramicTile.normal,
        normalScale: new THREE.Vector2(1.05, 1.05),
        roughnessMap: gameAssets.pbr.ceramicTile.roughness,
        aoMap: gameAssets.pbr.ceramicTile.ao,
        aoMapIntensity: 0.88,
        roughness: 0.34,
        metalness: 0.24,
      }),
      gameAssets.pbr.alpineSnow,
      {
        snowCoverage: 0.56,
        iceGlaze: 0.20,
        stoneMacroBreakup: 0.30,
      }
    );

    // 9. Forged Imperial Gilded Bronze (`latao` 4-ch PBR)
    this.sharedGoldMat = new THREE.MeshStandardMaterial({
      color: 0xe6be6c,
      map: gameAssets.pbr.armorBrass.color,
      normalMap: gameAssets.pbr.armorBrass.normal,
      roughnessMap: gameAssets.pbr.armorBrass.roughness,
      aoMap: gameAssets.pbr.armorBrass.ao,
      roughness: 0.28,
      metalness: 0.88,
    });
  }

  private buildSkyMoonAndCloudSea() {
    const skyGeo = new THREE.SphereGeometry(380, 48, 32);
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(SkyDomeShader.uniforms),
      vertexShader: SkyDomeShader.vertexShader,
      fragmentShader: SkyDomeShader.fragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.scene.add(new THREE.Mesh(skyGeo, this.skyMat));

    // Giant 3D PBR Displaced Celestial Moon framing Juanyun Summit & Taiyi Palace
    const moonGroup = new THREE.Group();
    moonGroup.position.set(20, 56, -218);

    this.moonMat = new THREE.MeshStandardMaterial({
      map: gameAssets.pbr.moonColor,
      normalMap: gameAssets.pbr.moonNormal,
      normalScale: new THREE.Vector2(1.25, 1.25),
      emissiveMap: gameAssets.pbr.moonColor,
      emissive: new THREE.Color(0xcce6ff),
      emissiveIntensity: 0.82,
      roughness: 0.78,
      fog: false,
    });
    this.moonMesh = new THREE.Mesh(new THREE.SphereGeometry(24, 40, 32), this.moonMat);
    this.moonMesh.rotation.y = -0.6;
    moonGroup.add(this.moonMesh);

    this.moonHaloMat = new THREE.MeshBasicMaterial({
      map: this.textures.softGlowTex,
      color: new THREE.Color(0.68, 0.85, 1.08),
      transparent: true,
      opacity: 0.48,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    const moonHalo = new THREE.Mesh(new THREE.PlaneGeometry(112, 112), this.moonHaloMat);
    moonHalo.position.z = 2.0;
    moonGroup.add(moonHalo);
    this.scene.add(moonGroup);

    // Swirling Multi-Layer Volumetric Cloud-Sea Billows in the Chasm
    this.cloudSeaMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(CloudSeaBillowShader.uniforms),
      vertexShader: CloudSeaBillowShader.vertexShader,
      fragmentShader: CloudSeaBillowShader.fragmentShader,
      transparent: true,
      depthWrite: false,
      fog: false,
    });

    const puffGeos: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 40; i++) {
      const ang = (i / 40) * Math.PI * 2;
      const ring = i % 3;
      const dist = 36 + ring * 34 + ((i * 7) % 13);
      const g = new THREE.PlaneGeometry(92, 92);
      g.rotateX(-Math.PI / 2);
      g.translate(
        Math.cos(ang) * dist,
        -8.5 - ring * 5.2,
        6 + Math.sin(ang) * dist * 1.35
      );
      puffGeos.push(g);
    }
    const mergedPuffs = BufferGeometryUtils.mergeGeometries(puffGeos, false);
    puffGeos.forEach((g) => g.dispose());
    if (mergedPuffs) {
      const cloudSeaMesh = new THREE.Mesh(mergedPuffs, this.cloudSeaMat);
      cloudSeaMesh.frustumCulled = false;
      this.scene.add(cloudSeaMesh);
    }
  }

  /**
   * Evaluates procedural Kunlun mountain ridge height at `(x, z)` so all stone trails, stairs,
   * courtyards, and palaces sit organically inside a continuous snow-clad mountain sanctuary!
   */
  public evalMountainRidgeHeight(x: number, z: number): number {
    const n1 = Math.sin(x * 0.085 + 1.2) * Math.cos(z * 0.072 - 0.6);
    const n2 = Math.sin(x * 0.21 - z * 0.16) * 0.45 + Math.cos(x * 0.37 + z * 0.29) * 0.22;
    const crag = (n1 * 0.65 + n2 * 0.35);

    // Base spine elevation profile along Z: +98 -> -168
    let spineY = 0.0;
    if (z >= 56) {
      spineY = 0.0 - Math.max(0, z - 85) * 0.35;
    } else if (z >= 30) {
      spineY = THREE.MathUtils.lerp(0.0, 4.5, (56 - z) / 26);
    } else if (z >= -6) {
      spineY = 4.5;
    } else if (z >= -26) {
      // Dramatic sword-chain chasm ravine beneath the Upper Suspension Stairway!
      const chasmDip = Math.sin(THREE.MathUtils.clamp((-6 - z) / 20, 0, 1) * Math.PI) * 14.5;
      spineY = THREE.MathUtils.lerp(4.5, 10.5, (-6 - z) / 20) - chasmDip;
    } else if (z >= -92) {
      spineY = 10.5;
    } else {
      // Towering Kunlun Immortal Peak rising behind Juanyun Summit to cradle Taiyi Palace!
      spineY = 10.5 + THREE.MathUtils.smoothstep(-z, 92, 152) * 16.5;
    }

    const ax = Math.abs(x);

    // Zone 1 (`Z: 53..88`): Sunken Mountain Pass flanked by snowy rock embankments & Sword-Graveyard slopes!
    if (z >= 52 && z <= 90) {
      if (ax <= 7.4) {
        return spineY - 0.42;
      }
      const bank = THREE.MathUtils.smoothstep(ax, 7.4, 24.0);
      const abyssDrop = THREE.MathUtils.smoothstep(ax, 30.0, 68.0) * 26.0;
      return spineY - 0.35 + bank * (5.2 + crag * 2.8) - abyssDrop;
    }

    // Zone 2 (`Z: 28..52`): Stepped Mountain Ridge & East Alchemy Courtyard Shelf
    if (z >= 28 && z < 52) {
      if (x >= 7.2 && x <= 17.8 && z >= 27.5 && z <= 50.5) {
        // Keep terrain safely underneath East Courtyard stone decks
        return 1.2;
      }
      if (ax <= 7.8) return spineY - 0.55;
      const shoulder = THREE.MathUtils.smoothstep(ax, 8.0, 22.0) * (3.2 + crag * 2.4);
      const drop = THREE.MathUtils.smoothstep(ax, 24.0, 62.0) * 24.0;
      return spineY - 0.6 + shoulder - drop;
    }

    // Zone 3 (`Z: -6..28`): Taiji Courtyard & Cloister Saddle
    if (z >= -6 && z < 28) {
      const rPlaza = Math.hypot(x, z - 12);
      if (rPlaza <= 22.5) return 3.65;
      const drop = THREE.MathUtils.smoothstep(rPlaza, 22.5, 62.0) * 25.0;
      return 3.8 + crag * 2.6 - drop;
    }

    // Zone 4 (`Z < -6`): Upper Chasm, Pre-Boss Terrace, Juanyun Summit & Northern Kunlun Peak
    if (z >= -26) {
      const drop = THREE.MathUtils.smoothstep(ax, 8.0, 56.0) * 22.0;
      return spineY - 1.2 + crag * 2.5 - drop;
    }

    if (z >= -92) {
      const rArena = Math.hypot(x, z - -63);
      if (z >= -40 && ax <= 10.5) return 9.6;
      if (rArena <= 25.0) return 9.4;
      const drop = THREE.MathUtils.smoothstep(rArena, 25.0, 68.0) * 26.0;
      return 9.2 + crag * 3.2 - drop;
    }

    // Northern Palace Peak (`Z < -92`): keep podium & dragon ramp at Z=-112..-148 fully exposed,
    // rising into towering Kunlun crags behind Z < -150 and on outer flanks |x| > 28!
    if (z >= -148 && ax <= 26.0) {
      return 9.6 + crag * 0.8;
    }
    const backRise = THREE.MathUtils.smoothstep(-z, 145, 168) * 18.0;
    const flankRise = THREE.MathUtils.smoothstep(ax, 26.0, 44.0) * 8.5;
    const peakDrop = THREE.MathUtils.smoothstep(ax, 48.0, 84.0) * 28.0;
    return 9.8 + backRise + flankRise + crag * 3.4 - peakDrop;
  }

  private buildContinuousKunlunTerrain() {
    const width = 168;
    const length = 264; // Z from +96 to -168 (centered at Z = -36)
    const segX = 96;
    const segZ = 148;

    const geo = new THREE.PlaneGeometry(width, length, segX, segZ);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, -36);

    const pos = geo.attributes.position as THREE.BufferAttribute;
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);
      const vy = this.evalMountainRidgeHeight(vx, vz);
      pos.setY(i, vy);
      // Physical world-meter UVs (~3.2m per 2K rock texture tile)
      uv.setXY(i, vx * 0.31, vz * 0.31);
    }
    pos.needsUpdate = true;
    uv.needsUpdate = true;
    geo.setAttribute('uv1', uv.clone());
    geo.computeVertexNormals();

    const terrainMesh = new THREE.Mesh(geo, this.sharedCliffMat);
    terrainMesh.receiveShadow = true;
    terrainMesh.castShadow = true;
    this.scene.add(terrainMesh);
  }

  /**
   * Builds a Stone Deck Terrace with Ashlar Retaining Walls, Carved Sumeru Cornice,
   * Flagstone Walkable Top (`walkGrid` + `footGrid`), and Capsule-Collided Jade Balustrades!
   */
  private buildPavedTerrace(
    x: number,
    topY: number,
    z: number,
    w: number,
    len: number,
    thickness = 3.6,
    withSideBalustrades = true,
    registerWalkable = true
  ): THREE.Mesh {
    // 1. Walkable 2K Slate Flagstone Top Slab (18cm thick)
    const topThick = 0.24;
    const topSlab = new THREE.Mesh(boxMeters(w, topThick, len, 0.42), this.sharedFlagstoneMat);
    topSlab.position.set(x, topY - topThick * 0.5, z);
    topSlab.receiveShadow = true;
    topSlab.castShadow = true;
    this.scene.add(topSlab);

    if (registerWalkable) {
      this.collision.registerWalkableMesh(topSlab, true);
    }

    // 2. Dressed Ashlar Masonry Foundation Core underneath
    const coreH = Math.max(0.4, thickness - topThick);
    const core = new THREE.Mesh(boxMeters(w - 0.28, coreH, len - 0.28, 0.38), this.sharedAshlarMat);
    core.position.set(x, topY - topThick - coreH * 0.5, z);
    core.receiveShadow = true;
    core.castShadow = true;
    this.scene.add(core);

    // 3. Carved White-Jade Sumeru Coping Curbs & Optional Side Balustrades
    for (const side of [-1, 1]) {
      const curbX = x + side * (w * 0.5 - 0.18);
      const curb = new THREE.Mesh(boxMeters(0.42, 0.32, len + 0.08, 0.55), this.sharedMarbleMat);
      curb.position.set(curbX, topY - 0.12, z);
      curb.receiveShadow = true;
      curb.castShadow = true;
      this.scene.add(curb);

      if (withSideBalustrades) {
        const z0 = z - len * 0.48;
        const z1 = z + len * 0.48;
        const rx = x + side * (w * 0.5 - 0.24);
        const posts = Math.max(3, Math.round(len / 3.6));
        this.scene.add(
          createJadeBalustradeRun(
            new THREE.Vector3(rx, topY, z0),
            new THREE.Vector3(rx, topY, z1),
            posts,
            this.sharedMarbleMat,
            this.sharedGoldMat
          )
        );
        this.collision.addCapsule(rx, z0, rx, z1, 0.26, topY - 0.5, topY + 2.2);
      }
    }

    return topSlab;
  }

  /**
   * Builds a Zero-Clip Monumental Chinese Stone Staircase:
   * - Individual beveled white-jade/granite treads registered into `footGrid` for exact 2-Bone Leg IK!
   * - Flush invisible nosing-envelope ramp registered into `walkGrid` for zero-snag locomotion!
   * - Optional central carved `承天云龙丹陛御路` relief slab!
   */
  private buildStairFlight(
    x: number,
    zStart: number,
    zEnd: number,
    yStart: number,
    yEnd: number,
    width: number,
    steps: number,
    opts: {
      withDragonDanbi?: boolean;
      leaveEastMidOpen?: boolean;
    } = {}
  ) {
    const stepLen = (zEnd - zStart) / steps;
    const stepRise = (yEnd - yStart) / steps;
    const totalHoriz = Math.abs(zEnd - zStart);
    const totalRise = yEnd - yStart;

    const group = new THREE.Group();

    // 1. Individual Beveled Stone Steps (top face centered on exact ramp slope -> zero ankle burial!)
    const treadThick = Math.abs(stepRise) + 0.95;
    for (let i = 0; i < steps; i++) {
      const u = (i + 0.5) / steps;
      const stepTopY = THREE.MathUtils.lerp(yStart, yEnd, u);
      const sz = THREE.MathUtils.lerp(zStart, zEnd, u);

      const stepMesh = new THREE.Mesh(
        boxMeters(width, treadThick, Math.abs(stepLen) + 0.10, 0.48),
        i % 3 === 0 ? this.sharedMarbleMat : this.sharedFlagstoneMat
      );
      stepMesh.position.set(x, stepTopY - treadThick * 0.5, sz);
      stepMesh.receiveShadow = true;
      stepMesh.castShadow = true;
      group.add(stepMesh);
    }

    // 2. Central Carved Imperial Cloud-Dragon Danbi Slab (`承天云龙御路陛石`)
    if (opts.withDragonDanbi) {
      const slopeAngle = Math.atan2(totalRise, totalHoriz);
      const diagLen = Math.hypot(totalHoriz, totalRise);
      const danbiW = 2.65;
      const danbiGeo = new THREE.BoxGeometry(danbiW, 0.24, diagLen - 0.4);
      scaleUvMeters(danbiGeo, 1.0, diagLen / 5.2);

      const danbiMesh = new THREE.Mesh(danbiGeo, this.sharedDragonRampMat);
      danbiMesh.position.set(x, (yStart + yEnd) * 0.5 + 0.04, (zStart + zEnd) * 0.5);
      // Since zEnd < zStart (ascending North toward -Z), positive X rotation tilts -Z end UP!
      danbiMesh.rotation.x = zEnd < zStart ? slopeAngle : -slopeAngle;
      danbiMesh.castShadow = true;
      danbiMesh.receiveShadow = true;
      group.add(danbiMesh);

      // Carved Marble Cheek Curbs (`垂带石`) framing the Dragon Danbi
      for (const side of [-1, 1]) {
        const cheek = new THREE.Mesh(
          boxMeters(0.26, 0.34, diagLen - 0.2, 0.55),
          this.sharedMarbleMat
        );
        cheek.position.set(
          x + side * (danbiW * 0.5 + 0.14),
          (yStart + yEnd) * 0.5 + 0.08,
          (zStart + zEnd) * 0.5
        );
        cheek.rotation.x = danbiMesh.rotation.x;
        cheek.castShadow = true;
        cheek.receiveShadow = true;
        group.add(cheek);
      }
    }

    // 3. Side Sloped Jade Balustrades + Snag-Free Capsule Colliders
    const posts = Math.max(4, Math.round(totalHoriz / 4.0));
    for (const side of [-1, 1]) {
      const rx = x + side * (width * 0.5 + 0.18);
      if (side === 1 && opts.leaveEastMidOpen) {
        // Leave clean East archway opening around Z = 48.5..43.5 & Z = 35.5..30.5 for the Side Courtyard!
        const segments: [number, number][] = [
          [0.0, 0.26],
          [0.48, 0.76],
        ];
        for (const [t0, t1] of segments) {
          const p0 = new THREE.Vector3(
            rx,
            THREE.MathUtils.lerp(yStart, yEnd, t0),
            THREE.MathUtils.lerp(zStart, zEnd, t0)
          );
          const p1 = new THREE.Vector3(
            rx,
            THREE.MathUtils.lerp(yStart, yEnd, t1),
            THREE.MathUtils.lerp(zStart, zEnd, t1)
          );
          group.add(createJadeBalustradeRun(p0, p1, 3, this.sharedMarbleMat, this.sharedGoldMat));
          this.collision.addCapsule(p0.x, p0.z, p1.x, p1.z, 0.26, Math.min(p0.y, p1.y) - 0.5, Math.max(p0.y, p1.y) + 2.4);
        }
      } else {
        group.add(
          createJadeBalustradeRun(
            new THREE.Vector3(rx, yStart, zStart),
            new THREE.Vector3(rx, yEnd, zEnd),
            posts,
            this.sharedMarbleMat,
            this.sharedGoldMat
          )
        );
        this.collision.addCapsule(
          rx,
          zStart,
          rx,
          zEnd,
          0.26,
          Math.min(yStart, yEnd) - 0.5,
          Math.max(yStart, yEnd) + 2.4
        );
      }
    }

    this.scene.add(group);
    group.updateMatrixWorld(true);

    // Register every individual stone step tread into `footGrid` so 2-Bone Foot IK plants boots on real steps!
    group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh && ((obj as THREE.Mesh).material === this.sharedFlagstoneMat || (obj as THREE.Mesh).material === this.sharedMarbleMat)) {
        this.collision.registerFootIkOnlyMesh(obj as THREE.Mesh);
      }
    });

    // Build exact flush nosing-envelope walkable ramp mesh (`visible = false`) for silky locomotion!
    const rampSegs = steps * 2;
    const rPos: number[] = [];
    const rIdx: number[] = [];
    const halfW = width * 0.5 + 0.12;
    for (let j = 0; j <= rampSegs; j++) {
      const t = j / rampSegs;
      const rz = THREE.MathUtils.lerp(zStart, zEnd, t);
      // Smoothly flush at t=0 and t=1, lifted by +0.5*stepRise across middle treads so soles NEVER dip below step nosings!
      const nosingLift = Math.sin(Math.min(1, t * 8) * Math.PI * 0.5) * Math.sin(Math.min(1, (1 - t) * 8) * Math.PI * 0.5) * Math.abs(stepRise) * 0.52;
      const ry = THREE.MathUtils.lerp(yStart, yEnd, t) + nosingLift;
      rPos.push(x - halfW, ry, rz, x + halfW, ry, rz);
      if (j < rampSegs) {
        const a = j * 2;
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        if (zEnd < zStart) {
          rIdx.push(a, b, c, b, d, c);
        } else {
          rIdx.push(a, c, b, b, c, d);
        }
      }
    }
    const rampGeo = new THREE.BufferGeometry();
    rampGeo.setAttribute('position', new THREE.Float32BufferAttribute(rPos, 3));
    rampGeo.setIndex(rIdx);
    rampGeo.computeVertexNormals();
    const rampMesh = new THREE.Mesh(rampGeo, new THREE.MeshBasicMaterial());
    rampMesh.visible = false;
    this.scene.add(rampMesh);
    this.collision.registerWalkableMesh(rampMesh, false);
  }

  private buildLevelGeometry(quality: QualityConfig) {
    // =========================================================================
    // ZONE 1: Duanyun Ancient Trail & Sword-Graveyard (`断云古道 · 剑冢寒林`, Z: +85 -> +56, Y: 0)
    // =========================================================================
    this.buildPavedTerrace(0, 0, 70.5, 15.4, 29.5, 3.2, false, true);

    // Individual Beveled Flagstone Accent Slabs along the center trail for rich geometric relief!
    for (let i = 0; i < 11; i++) {
      const sz = 82.5 - i * 2.45;
      const sx = Math.sin(i * 1.3) * 0.45;
      const slab = new THREE.Mesh(
        boxMeters(4.6 + (i % 3) * 0.5, 0.05, 2.05, 0.52),
        i % 4 === 0 ? this.sharedMarbleMat : this.sharedFlagstoneMat
      );
      slab.position.set(sx, 0.018, sz);
      slab.rotation.y = Math.sin(i * 2.7) * 0.035;
      slab.receiveShadow = true;
      this.scene.add(slab);
      this.collision.registerFootIkOnlyMesh(slab);
    }

    // Soft snowbank / boulder boundary along Zone 1 trail edges (keeps player on pass without box walls!)
    for (const side of [-1, 1]) {
      this.collision.addCapsule(side * 7.8, 56.5, side * 7.8, 84.5, 0.45, -1.0, 4.0);
    }
    this.collision.addCapsule(-7.8, 84.6, 7.8, 84.6, 0.5, -1.0, 4.0);

    // Craggy Broken Stone Trail Fragments trailing South into the Kunlun Cloud-Sea (`Z: +86..+94`)
    for (const f of [
      { x: -2.6, y: -0.45, z: 86.8, s: 2.3, ry: 0.4 },
      { x: 2.9, y: -1.05, z: 89.2, s: 2.0, ry: 1.7 },
      { x: -0.5, y: -1.95, z: 93.0, s: 1.7, ry: 2.8 },
    ]) {
      const rock = this.cloneSnowModel(gameAssets.envModels.alpineRock7, 0.72);
      rock.position.set(f.x, f.y, f.z);
      rock.scale.setScalar(f.s);
      rock.rotation.y = f.ry;
      this.scene.add(rock);
    }

    // =========================================================================
    // ZONE 2: Grand Imperial Danbi Stairway (`承天雕龙丹陛`, Z: +56 -> +30, Y: 0.0 -> +4.5)
    //         & East Cloud-Viewing Alchemy Courtyard (`观云丹房偏院`)
    // =========================================================================
    this.buildStairFlight(0, 56, 30, 0.0, 4.5, 14.4, 26, {
      withDragonDanbi: true,
      leaveEastMidOpen: true,
    });

    // East Courtyard Connecting Stone Bridge & Stepped Terraces (100% continuous walkable stairs!)
    this.buildStairFlight(8.6, 46.2, 46.2 - 0.01, 1.7, 2.2, 3.2, 3);
    this.buildPavedTerrace(9.2, 2.2, 46.2, 4.4, 4.6, 3.4, false, true);
    this.buildPavedTerrace(12.8, 2.2, 46.5, 7.6, 7.4, 3.8, false, true);
    this.buildStairFlight(12.6, 43.2, 41.2, 2.2, 4.6, 4.6, 8);
    this.buildPavedTerrace(12.8, 4.6, 38.2, 8.2, 6.8, 4.4, false, true);
    // Upper West bridge linking Terrace #2 cleanly back to top of Grand Staircase (`Z = 32.5`)!
    this.buildPavedTerrace(9.0, 4.55, 33.2, 4.2, 4.2, 4.2, false, true);
    this.buildStairFlight(12.8, 35.0, 33.6, 4.6, 5.6, 4.6, 5);
    this.buildPavedTerrace(12.8, 5.6, 30.8, 8.4, 6.6, 5.0, false, true);

    // East Courtyard Perimeter Jade Balustrades + Capsule Guards
    this.scene.add(
      createJadeBalustradeRun(
        new THREE.Vector3(16.6, 2.2, 50.0),
        new THREE.Vector3(16.6, 2.2, 43.0),
        3,
        this.sharedMarbleMat,
        this.sharedGoldMat
      )
    );
    this.collision.addCapsule(16.6, 50.0, 16.6, 43.0, 0.28, 1.5, 4.5);
    this.scene.add(
      createJadeBalustradeRun(
        new THREE.Vector3(16.8, 5.6, 34.0),
        new THREE.Vector3(16.8, 5.6, 27.6),
        3,
        this.sharedMarbleMat,
        this.sharedGoldMat
      )
    );
    this.collision.addCapsule(16.8, 34.0, 16.8, 27.6, 0.28, 5.0, 8.2);
    this.collision.addCapsule(8.8, 27.6, 16.8, 27.6, 0.28, 5.0, 8.2);

    // Curved-Eave Immortal Pavilion (`观云丹亭`) sheltering【琼浆玉露】& Ritual Alchemy Urn!
    const pavGroup = new THREE.Group();
    pavGroup.position.set(12.8, 5.6, 30.8);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.28, 12), this.sharedMarbleMat);
        plinth.position.set(sx * 2.85, 0.14, sz * 2.55);
        pavGroup.add(plinth);

        const col = new THREE.Mesh(
          scaleUvMeters(new THREE.CylinderGeometry(0.24, 0.28, 4.4, 14), 1.4, 2.8),
          this.sharedWoodMat
        );
        col.position.set(sx * 2.85, 2.2, sz * 2.55);
        col.castShadow = true;
        pavGroup.add(col);
        this.collision.addCircle(12.8 + sx * 2.85, 30.8 + sz * 2.55, 0.36, 5.4, 10.2);
      }
    }
    const pavRoof = createSweepingChineseRoof(
      8.4,
      7.6,
      2.35,
      1.28,
      this.sharedRoofMat,
      this.sharedGoldMat,
      this.sharedWoodMat,
      this.sharedFriezeMat
    );
    pavRoof.position.y = 4.4;
    pavGroup.add(pavRoof);

    // Ornate 3D Ritual Urn (`ritual_urn.glb`) inside Pavilion
    const urn = gameAssets.envModels.ritualUrn.clone(true);
    urn.scale.setScalar(1.35);
    urn.position.set(1.85, 0.02, -1.45);
    pavGroup.add(urn);
    this.lightingRig.addEmitter(new THREE.Vector3(12.8, 8.6, 30.8), 0xffa448, 3.2, 15, 0.14);
    this.scene.add(pavGroup);

    // =========================================================================
    // ZONE 3: Taiji Martial Courtyard (`太极演武坛`, Center (0, 4.5, +12), R = 19.2m)
    // =========================================================================
    const plazaPedestal = new THREE.Mesh(
      scaleUvMeters(new THREE.CylinderGeometry(19.2, 16.8, 5.0, 40), 18, 2.2),
      this.sharedAshlarMat
    );
    plazaPedestal.position.set(0, 4.5 - 2.52, 12);
    plazaPedestal.receiveShadow = true;
    plazaPedestal.castShadow = true;
    this.scene.add(plazaPedestal);

    // Outer Flagstone Walkable Ring + Carved Central 2K Taiji Jade Relief Seal!
    const plazaWalkDisc = new THREE.Mesh(
      scaleUvMeters(new THREE.CylinderGeometry(19.1, 19.1, 0.24, 48), 8.5, 8.5),
      this.sharedFlagstoneMat
    );
    plazaWalkDisc.position.set(0, 4.5 - 0.12, 12);
    plazaWalkDisc.receiveShadow = true;
    this.scene.add(plazaWalkDisc);
    this.collision.registerWalkableMesh(plazaWalkDisc, true);

    const courtyardTaijiMat = applyKunlunSurfaceShader(
      new THREE.MeshStandardMaterial({
        color: 0xdcebf8,
        map: this.taijiReliefMaps.color,
        normalMap: this.taijiReliefMaps.normal,
        normalScale: new THREE.Vector2(1.35, 1.35),
        roughnessMap: this.taijiReliefMaps.roughness,
        aoMap: this.taijiReliefMaps.ao,
        aoMapIntensity: 0.90,
        roughness: 0.38,
        metalness: 0.14,
      }),
      gameAssets.pbr.alpineSnow,
      {
        snowCoverage: 0.22,
        iceGlaze: 0.38,
        stoneMacroBreakup: 0.18,
        enableFootprints: true,
      }
    );
    const innerTaiji = new THREE.Mesh(new THREE.CircleGeometry(11.6, 64), courtyardTaijiMat);
    innerTaiji.geometry.setAttribute('uv1', innerTaiji.geometry.attributes.uv.clone());
    innerTaiji.rotation.x = -Math.PI / 2;
    innerTaiji.position.set(0, 4.512, 12);
    innerTaiji.receiveShadow = true;
    this.scene.add(innerTaiji);

    const taijiBronzeRim = new THREE.Mesh(new THREE.TorusGeometry(11.65, 0.16, 8, 64), this.sharedGoldMat);
    taijiBronzeRim.rotation.x = Math.PI / 2;
    taijiBronzeRim.position.set(0, 4.52, 12);
    this.scene.add(taijiBronzeRim);

    // Shortcut Levitating Jade Sword Bridge (West side: (-13.5, 4.5, +14) -> (-6.8, 0.0, +64))
    this.shortcutBridgeGroup = new THREE.Group();
    const bridgeStart = new THREE.Vector3(-13.5, 4.48, 14);
    const bridgeEnd = new THREE.Vector3(-6.8, 0.02, 64);
    const stepsCount = 16;
    const swordStoneMat = new THREE.MeshStandardMaterial({
      color: 0xaee8ff,
      map: gameAssets.pbr.whiteJade.color,
      normalMap: gameAssets.pbr.whiteJade.normal,
      emissive: new THREE.Color(0x165e85),
      emissiveIntensity: 0.65,
      roughness: 0.24,
      metalness: 0.45,
    });
    for (let i = 0; i <= stepsCount; i++) {
      const t = i / stepsCount;
      const p = new THREE.Vector3().lerpVectors(bridgeStart, bridgeEnd, t);
      const pad = new THREE.Mesh(boxMeters(3.9, 0.32, 3.6, 0.5), swordStoneMat);
      pad.position.set(p.x, p.y - 0.16, p.z);
      pad.lookAt(bridgeEnd.x, p.y - 0.16, bridgeEnd.z);
      pad.receiveShadow = true;
      this.shortcutBridgeGroup.add(pad);
    }
    this.shortcutBridgeGroup.visible = false;
    this.scene.add(this.shortcutBridgeGroup);
    this.shortcutBridgeGroup.updateMatrixWorld(true);
    this.shortcutBridgeGroup.traverse((n) => {
      if ((n as THREE.Mesh).isMesh) {
        this.collision.registerWalkableMesh(n as THREE.Mesh, true, () => this.shortcutUnlocked);
      }
    });

    // Shortcut Activation Pedestal at (-14.8, 4.5, 14)
    const pedGroup = new THREE.Group();
    pedGroup.position.set(-14.8, 4.5, 14);
    const pedBase = new THREE.Mesh(
      scaleUvMeters(new THREE.CylinderGeometry(0.65, 0.88, 1.25, 12), 1.5, 0.8),
      this.sharedMarbleMat
    );
    pedBase.position.y = 0.62;
    pedBase.castShadow = true;
    pedGroup.add(pedBase);
    this.shortcutPedestalGlow = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.38, 0),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0.45, 1.35, 1.85) })
    );
    this.shortcutPedestalGlow.position.y = 1.68;
    pedGroup.add(this.shortcutPedestalGlow);
    this.scene.add(pedGroup);
    this.collision.addCircle(-14.8, 14, 0.75, 4.2, 6.8);

    // =========================================================================
    // ZONE 4: Iron-Chain Chasm Stairway (`锁妖铁索剑桥`, Z: -6 -> -26, Y: 4.5 -> 10.5),
    //         Pre-Boss Spirit Vein Terrace & Juanyun Summit (`卷云台`, Center (0, 10.5, -63))
    // =========================================================================
    this.buildStairFlight(0, -6, -26, 4.5, 10.5, 11.8, 22, { withDragonDanbi: true });

    // Pre-Boss Spirit Vein Terrace (`Z: -26 -> -39.6, Y: +10.5`)
    this.buildPavedTerrace(0, 10.5, -32.8, 18.6, 13.8, 4.8, true, true);

    // Throat bridge connecting Fog Gate (`Z = -38.5`) smoothly onto Juanyun Summit (`Z = -40..-44`)!
    this.buildPavedTerrace(0, 10.5, -40.8, 9.6, 5.2, 4.2, false, true);

    // Grand Boss Arena — Juanyun Summit【卷云台】(Center (0, 10.5, -63), R = 24.0m)
    this.taijiMat = new THREE.MeshStandardMaterial({
      color: 0xd8eaf8,
      map: this.taijiReliefMaps.color,
      normalMap: this.taijiReliefMaps.normal,
      normalScale: new THREE.Vector2(1.45, 1.45),
      roughnessMap: this.taijiReliefMaps.roughness,
      aoMap: this.taijiReliefMaps.ao,
      aoMapIntensity: 0.88,
      emissiveMap: this.textures.taijiEmissiveMap,
      emissive: new THREE.Color(0x5bb8e8),
      emissiveIntensity: 0.38,
      roughness: quality.iceReflection ? 0.24 : 0.28,
      metalness: 0.16,
      transparent: quality.iceReflection,
      opacity: quality.iceReflection ? 0.88 : 1.0,
    });

    if (quality.iceReflection) {
      const reflGeo = new THREE.CircleGeometry(23.8, 48);
      this.iceReflector = new Reflector(reflGeo, {
        clipBias: 0.003,
        textureWidth: Math.max(256, Math.floor(window.innerWidth * 0.35)),
        textureHeight: Math.max(256, Math.floor(window.innerHeight * 0.35)),
        color: 0x4b6e8c,
      });
      this.iceReflector.rotation.x = -Math.PI / 2;
      this.iceReflector.position.set(0, 10.48, -63);
      this.iceReflector.visible = false;
      this.scene.add(this.iceReflector);
    }

    const arenaPedestal = new THREE.Mesh(
      scaleUvMeters(new THREE.CylinderGeometry(24.4, 19.6, 8.4, 64), 22, 3.0),
      this.sharedAshlarMat
    );
    arenaPedestal.position.set(0, 10.5 - 4.22, -63);
    arenaPedestal.receiveShadow = true;
    this.scene.add(arenaPedestal);

    // Solid walkable disc registered into CollisionWorld (`R = 23.8m` at `Y = 10.5`)
    const arenaWalkDisc = new THREE.Mesh(
      scaleUvMeters(new THREE.CylinderGeometry(23.9, 23.9, 0.24, 64), 10, 10),
      this.sharedFlagstoneMat
    );
    arenaWalkDisc.position.set(0, 10.5 - 0.125, -63);
    arenaWalkDisc.receiveShadow = true;
    this.scene.add(arenaWalkDisc);
    this.collision.registerWalkableMesh(arenaWalkDisc, true);

    const arenaTopDisc = new THREE.Mesh(new THREE.CircleGeometry(22.4, 64), this.taijiMat);
    arenaTopDisc.geometry.setAttribute('uv1', arenaTopDisc.geometry.attributes.uv.clone());
    arenaTopDisc.rotation.x = -Math.PI / 2;
    arenaTopDisc.position.set(0, 10.512, -63);
    arenaTopDisc.receiveShadow = true;
    this.scene.add(arenaTopDisc);

    // Gilded Bronze Rim + 16 Carved Jade Perimeter Posts & Warm Flame Braziers!
    const rimRing = new THREE.Mesh(new THREE.TorusGeometry(24.05, 0.34, 12, 72), this.sharedGoldMat);
    rimRing.rotation.x = Math.PI / 2;
    rimRing.position.set(0, 10.55, -63);
    this.scene.add(rimRing);

    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const nextA = ((i + 1) / 16) * Math.PI * 2;
      // Keep South entrance throat (`Z ~ -39`) open!
      if (Math.cos(a) > 0.90) continue;

      const px = Math.sin(a) * 23.8;
      const pz = -63 + Math.cos(a) * 23.8;
      const post = new THREE.Mesh(
        scaleUvMeters(new THREE.CylinderGeometry(0.30, 0.36, 1.45, 12), 1.2, 0.8),
        this.sharedMarbleMat
      );
      post.position.set(px, 11.22, pz);
      post.castShadow = true;
      this.scene.add(post);

      const cap = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), this.sharedGoldMat);
      cap.position.set(px, 12.08, pz);
      this.scene.add(cap);

      // Every 4th post holds a glowing bronze brazier casting warm light onto Juanyun jade!
      if (i % 4 === 2) {
        const censer = gameAssets.envModels.bronzeCenser.clone(true);
        censer.scale.setScalar(1.45);
        censer.position.set(px * 0.96, 10.52, -63 + Math.cos(a) * 22.9);
        this.scene.add(censer);
        this.lightingRig.addEmitter(new THREE.Vector3(px * 0.96, 11.8, -63 + Math.cos(a) * 22.9), 0xff9234, 3.6, 18, 0.18);
      }

      if (Math.cos(nextA) <= 0.90) {
        const nx = Math.sin(nextA) * 23.6;
        const nz = -63 + Math.cos(nextA) * 23.6;
        this.collision.addCapsule(px, pz, nx, nz, 0.35, 10.0, 14.0);
      }
    }
  }

  private getSharedSnowMaterial(srcMat: THREE.Material, snowAmt: number): THREE.Material {
    if (snowAmt <= 0) return srcMat;
    const key = `${srcMat.uuid}_${snowAmt.toFixed(2)}`;
    const cached = this.snowMatCache.get(key);
    if (cached) return cached;
    const std = srcMat.clone() as THREE.MeshStandardMaterial;
    if (std.transparent && std.map) {
      // Convert alpha-blend foliage cards to crisp depth-writing cutout -> Contact AO & static batching!
      std.alphaTest = 0.42;
      std.transparent = false;
      std.depthWrite = true;
    }
    applyKunlunSurfaceShader(std, gameAssets.pbr.alpineSnow, {
      snowCoverage: snowAmt,
      iceGlaze: 0.12,
      stoneMacroBreakup: 0.30,
    });
    this.snowMatCache.set(key, std);
    return std;
  }

  private cloneSnowModel(
    template: THREE.Group,
    snowAmt = 0.68,
    castShadow = false,
    receiveShadow = true
  ): THREE.Group {
    const clone = template.clone(true);
    clone.traverse((node) => {
      if ((node as THREE.Mesh).isMesh) {
        const mesh = node as THREE.Mesh;
        mesh.castShadow = castShadow;
        mesh.receiveShadow = receiveShadow;
        if (snowAmt > 0 && mesh.material) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          const snowMats = mats.map((m) => this.getSharedSnowMaterial(m, snowAmt));
          mesh.material = Array.isArray(mesh.material) ? snowMats : snowMats[0];
        }
      }
    });
    return clone;
  }

  /**
   * Builds Kunlun Cliffs (`cliff_peak.glb`, `rock_face_01.glb`), Gnarled Pines + Pine Roots,
   * Alpine Ferns & Shrubs, and the Zone 1 Sword-Graveyard (`剑冢残碑古剑林`)!
   */
  private buildKunlunCliffsPinesAndSwordGraveyard() {
    // 1. Monumental Surrounding Kunlun Peaks (`cliff_peak.glb` & `rock_face_01.glb`)
    const cliffPlacements = [
      { x: 0, y: -14.0, z: -138, sx: 0.92, sy: 3.1, sz: 1.4, ry: 0 },
      { x: -66, y: -18, z: -124, sx: 0.95, sy: 3.8, sz: 1.2, ry: 0.42 },
      { x: 70, y: -16, z: -120, sx: 0.95, sy: 3.6, sz: 1.2, ry: -0.45 },
      { x: -52, y: -20, z: 22, sx: 0.82, sy: 3.1, sz: 1.1, ry: Math.PI * 0.48 },
      { x: 56, y: -18, z: 26, sx: 0.85, sy: 3.2, sz: 1.1, ry: -Math.PI * 0.46 },
      { x: -50, y: -18, z: -55, sx: 0.78, sy: 3.0, sz: 1.05, ry: Math.PI * 0.38 },
      { x: 52, y: -18, z: -58, sx: 0.78, sy: 3.0, sz: 1.05, ry: -Math.PI * 0.38 },
    ];
    for (const c of cliffPlacements) {
      const cliff = this.cloneSnowModel(gameAssets.envModels.cliffPeak, 0.78);
      cliff.position.set(c.x, c.y, c.z);
      cliff.scale.set(c.sx, c.sy, c.sz);
      cliff.rotation.y = c.ry;
      this.scene.add(cliff);
    }

    // Photogrammetry `rock_face_01.glb` outcrops flanking Zone 1 Sword-Graveyard Pass!
    for (const rf of [
      { x: -13.5, y: 1.8, z: 76.0, s: 2.8, ry: 1.35 },
      { x: 14.2, y: 2.1, z: 71.5, s: 3.0, ry: -1.45 },
      { x: -14.0, y: 2.4, z: 61.5, s: 2.6, ry: 1.15 },
      { x: 13.8, y: 1.9, z: 81.5, s: 2.5, ry: -1.75 },
    ]) {
      const outcrop = this.cloneSnowModel(gameAssets.envModels.rockFace1, 0.72, true, true);
      outcrop.position.set(rf.x, rf.y, rf.z);
      outcrop.scale.setScalar(rf.s);
      outcrop.rotation.y = rf.ry;
      this.scene.add(outcrop);
    }

    // 2. Gnarled Chinese Temple Pines (`chinese_pine.glb`) + Exposed Roots (`pine_roots.glb`)
    const pinePlacements = [
      { x: -9.8, y: 0.3, z: 78.5, s: 4.5, ry: 0.35 },
      { x: 10.2, y: 0.4, z: 66.8, s: 4.6, ry: -2.75 },
      { x: -10.5, y: 0.5, z: 60.2, s: 4.2, ry: 0.85 },
      { x: 18.4, y: 4.2, z: 40.2, s: 4.4, ry: -1.5 },
      { x: 18.6, y: 5.2, z: 27.5, s: 4.2, ry: -1.9 },
      { x: -21.2, y: 4.1, z: 22.0, s: 4.9, ry: 0.8 },
      { x: 21.4, y: 4.1, z: 3.5, s: 4.9, ry: -2.2 },
      { x: -11.8, y: 10.2, z: -30.5, s: 4.3, ry: 0.55 },
      { x: 11.8, y: 10.2, z: -34.2, s: 4.3, ry: -2.5 },
    ];
    for (const p of pinePlacements) {
      const pine = this.cloneSnowModel(gameAssets.envModels.chinesePine, 0.52, true, true);
      pine.position.set(p.x, p.y, p.z);
      pine.scale.setScalar(p.s);
      pine.rotation.y = p.ry;
      this.scene.add(pine);

      const roots = this.cloneSnowModel(gameAssets.envModels.pineRoots, 0.48, false, true);
      roots.position.set(p.x, p.y + 0.05, p.z);
      roots.scale.setScalar(p.s * 0.42);
      roots.rotation.y = p.ry * 1.3;
      this.scene.add(roots);
    }

    // 3. Zone 1 Kunlun Sword-Graveyard (`剑冢残碑 & 古剑林`) + Trail Wooden Lanterns (`wooden_lantern.glb`)!
    const trailLanternSpots = [
      [-6.4, 0.0, 80.5],
      [6.4, 0.0, 75.0],
      [-6.4, 0.0, 65.5],
      [6.4, 0.0, 61.0],
    ];
    for (const [lx, ly, lz] of trailLanternSpots) {
      const plinth = new THREE.Mesh(boxMeters(0.75, 0.42, 0.75, 0.8), this.sharedAshlarMat);
      plinth.position.set(lx, ly + 0.21, lz);
      plinth.castShadow = true;
      plinth.receiveShadow = true;
      this.scene.add(plinth);

      const wLantern = gameAssets.envModels.woodenLantern.clone(true);
      wLantern.scale.setScalar(2.65);
      wLantern.position.set(lx, ly + 0.42, lz);
      wLantern.traverse((n) => {
        if ((n as THREE.Mesh).isMesh) (n as THREE.Mesh).castShadow = true;
      });
      this.scene.add(wLantern);

      const flameCore = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 8, 8),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(2.1, 1.18, 0.38) })
      );
      flameCore.position.set(lx, ly + 1.55, lz);
      this.scene.add(flameCore);

      this.lightingRig.addEmitter(new THREE.Vector3(lx, ly + 1.75, lz), 0xff9636, 3.6, 15.5, 0.18);
      this.collision.addCircle(lx, lz, 0.55, ly - 0.5, ly + 2.5);
    }

    // Ancient Carved Stone Steles (`剑冢残碑`) & Tilted Fallen Immortal Swords along Zone 1 shoulders!
    const steleConfigs = [
      { x: -8.3, z: 74.2, h: 2.6, rx: 0.08, rz: -0.11, ry: 0.4 },
      { x: 8.5, z: 78.6, h: 2.2, rx: -0.06, rz: 0.14, ry: -0.5 },
      { x: -8.6, z: 63.4, h: 2.9, rx: 0.05, rz: 0.08, ry: 0.25 },
      { x: 8.4, z: 69.2, h: 2.4, rx: -0.09, rz: -0.07, ry: -0.35 },
    ];
    for (const st of steleConfigs) {
      const sy = this.evalMountainRidgeHeight(st.x, st.z) + 0.35;
      const stele = new THREE.Mesh(boxMeters(0.95, st.h, 0.32, 0.65), this.sharedDragonRampMat);
      stele.position.set(st.x, sy + st.h * 0.45, st.z);
      stele.rotation.set(st.rx, st.ry, st.rz);
      stele.castShadow = true;
      stele.receiveShadow = true;
      this.scene.add(stele);
    }

    // 14 Planted Ancient Swords (`forged_sword.glb` & `antique_katana.glb`) in snow mounds
    const swordTemplates = [
      gameAssets.weaponModels.forgedSword,
      gameAssets.weaponModels.antiqueKatana,
      gameAssets.weaponModels.katanaBase,
    ];
    for (let i = 0; i < 14; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const sx = side * (7.2 + ((i * 1.7) % 2.8));
      const sz = 60.5 + i * 1.72;
      const sy = Math.max(0.0, this.evalMountainRidgeHeight(sx, sz) + 0.32);
      const tmpl = swordTemplates[i % swordTemplates.length];
      const sw = tmpl.clone(true);
      sw.scale.setScalar(1.45 + (i % 3) * 0.25);
      sw.position.set(sx, sy + 0.55, sz);
      sw.rotation.set(Math.PI * 0.52 + (i % 3 - 1) * 0.18, i * 0.9, side * 0.22);
      this.scene.add(sw);
    }

    // Scatter Photogrammetry Rocks (`alpine_rock_07`), Frost Ferns (`alpine_fern`) & Shrubs (`mountain_shrub`)
    const foliageSpots = [
      [-8.5, 0.0, 82.0], [8.5, 0.0, 79.5], [-8.6, 0.0, 71.0], [8.6, 0.0, 64.0],
      [-8.4, 0.0, 58.8], [15.5, 2.2, 48.0], [15.8, 4.6, 36.2], [-17.2, 4.5, 22.5],
      [17.4, 4.5, 2.5], [-8.8, 10.5, -28.5], [8.8, 10.5, -35.8],
    ];
    for (let i = 0; i < foliageSpots.length; i++) {
      const [fx, fy, fz] = foliageSpots[i];
      const rock = this.cloneSnowModel(gameAssets.envModels.alpineRock7, 0.65, true, true);
      rock.position.set(fx, fy - 0.1, fz);
      rock.scale.setScalar(0.85 + (i % 3) * 0.35);
      rock.rotation.y = i * 1.4;
      this.scene.add(rock);

      const shrub = this.cloneSnowModel(
        i % 2 === 0 ? gameAssets.envModels.mountainShrub : gameAssets.envModels.alpineFern,
        0.38,
        false,
        true
      );
      shrub.position.set(fx + (fx > 0 ? -0.45 : 0.45), fy + 0.02, fz + 0.35);
      shrub.scale.setScalar(i % 2 === 0 ? 1.45 : 1.85);
      shrub.rotation.y = i * 2.1;
      this.scene.add(shrub);
    }

    // Towering Snow-Dusted Conifers (`mountain_tree.glb`) on flanking crags
    for (const ti of [
      { x: -16.5, y: 1.5, z: 58.0, ts: 0.72, ry: 0.5 },
      { x: 17.2, y: 1.6, z: 55.5, ts: 0.68, ry: 1.9 },
      { x: -24.5, y: 2.2, z: 8.0, ts: 0.78, ry: 2.4 },
      { x: 24.8, y: 2.4, z: 19.5, ts: 0.75, ry: 0.9 },
      { x: -17.5, y: 7.4, z: -23.0, ts: 0.68, ry: 1.3 },
      { x: 17.8, y: 7.6, z: -21.5, ts: 0.70, ry: 2.8 },
    ]) {
      const tree = this.cloneSnowModel(gameAssets.envModels.mountainTree, 0.58);
      tree.position.set(ti.x, ti.y, ti.z);
      tree.scale.setScalar(ti.ts);
      tree.rotation.y = ti.ry;
      this.scene.add(tree);
    }
  }

  /**
   * Builds GPU-Instanced 14,000+ Wind-Rippling Alpine Snow-Grass Blades (`THREE.InstancedMesh` -> 1 Draw Call!)
   * with vertex-shader wind waves AND dynamic parting around Yun Tianhe (`uPlayerPos`)!
   */
  private buildInstancedWindGrass(targetCount: number) {
    const count = Math.max(0, Math.floor(targetCount));
    if (count <= 0) return;

    // 3-segment tapered curved blade (7 vertices, 5 triangles -> super crisp silhouette & fast!)
    const bladeVerts = new Float32Array([
      -0.036, 0.0, 0.0,
       0.036, 0.0, 0.0,
      -0.028, 0.22, 0.015,
       0.028, 0.22, 0.015,
      -0.016, 0.46, 0.045,
       0.016, 0.46, 0.045,
       0.0,   0.68, 0.085,
    ]);
    const bladeUvs = new Float32Array([
      0, 0,  1, 0,
      0, 0.33, 1, 0.33,
      0, 0.68, 1, 0.68,
      0.5, 1.0,
    ]);
    const bladeIndices = [
      0, 1, 2,  1, 3, 2,
      2, 3, 4,  3, 5, 4,
      4, 5, 6,
    ];
    const bladeGeo = new THREE.BufferGeometry();
    bladeGeo.setAttribute('position', new THREE.BufferAttribute(bladeVerts, 3));
    bladeGeo.setAttribute('uv', new THREE.BufferAttribute(bladeUvs, 2));
    bladeGeo.setIndex(bladeIndices);
    bladeGeo.computeVertexNormals();

    const grassMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: this.grassUniforms.uTime,
        uPlayerPos: this.grassUniforms.uPlayerPos,
        uDemonFactor: this.grassUniforms.uDemonFactor,
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uPlayerPos;
        varying float vH;
        varying float vShade;

        void main() {
          vH = uv.y;
          vec4 worldRoot = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          vec3 localPos = position;

          // Multi-frequency alpine wind ripple across Kunlun mountain pass!
          float windWave = sin(uTime * 2.35 + worldRoot.x * 0.42 + worldRoot.z * 0.31)
                         + 0.45 * cos(uTime * 4.1 - worldRoot.z * 0.65);
          float bend = pow(vH, 1.75);
          vec4 wp = modelMatrix * instanceMatrix * vec4(localPos, 1.0);
          wp.x += windWave * 0.14 * bend;
          wp.z += windWave * 0.08 * bend;

          // Interactive character trample/parting around player boots!
          vec2 toGrass = wp.xz - uPlayerPos.xz;
          float dPlayer = length(toGrass);
          if (dPlayer < 1.35 && abs(worldRoot.y - uPlayerPos.y) < 1.5) {
            float push = (1.0 - dPlayer / 1.35) * bend * 0.42;
            vec2 pushDir = dPlayer > 0.01 ? normalize(toGrass) : vec2(1.0, 0.0);
            wp.xz += pushDir * push;
            wp.y -= push * 0.35;
          }

          vShade = 0.55 + 0.45 * sin(worldRoot.x * 1.7 + worldRoot.z * 2.3);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uDemonFactor;
        varying float vH;
        varying float vShade;

        void main() {
          // Dark winter pine-sage root -> frosted silver-ice tip catching moonlight!
          vec3 rootCol = mix(vec3(0.07, 0.12, 0.14), vec3(0.14, 0.06, 0.05), uDemonFactor) * vShade;
          vec3 midCol  = mix(vec3(0.18, 0.27, 0.28), vec3(0.36, 0.14, 0.10), uDemonFactor);
          vec3 frostTip = mix(vec3(0.72, 0.84, 0.96), vec3(0.95, 0.42, 0.18), uDemonFactor);

          vec3 col = mix(rootCol, midCol, smoothstep(0.0, 0.55, vH));
          col = mix(col, frostTip, smoothstep(0.52, 0.98, vH));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      side: THREE.DoubleSide,
    });

    this.grassMesh = new THREE.InstancedMesh(bladeGeo, grassMat, count);
    this.grassMesh.frustumCulled = false;
    this.grassMesh.castShadow = false;
    this.grassMesh.receiveShadow = false;

    const dummy = new THREE.Object3D();
    let placed = 0;
    let seed = 1337;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    while (placed < count) {
      const zonePick = rand();
      let gx = 0;
      let gy = 0;
      let gz = 0;

      if (zonePick < 0.68) {
        // Zone 1 Mountain Trail shoulders, flagstone cracks & Sword-Graveyard snowbanks!
        const side = rand() < 0.5 ? -1 : 1;
        gz = 55.5 + rand() * 30.5;
        const onEdgeCrack = rand() < 0.22;
        gx = onEdgeCrack ? side * (4.8 + rand() * 2.5) : side * (7.2 + rand() * 11.5);
        gy = onEdgeCrack ? 0.0 : Math.max(-0.2, this.evalMountainRidgeHeight(gx, gz));
      } else if (zonePick < 0.88) {
        // Zone 2 East Alchemy Courtyard & Staircase flanks
        if (rand() < 0.55) {
          gx = 9.2 + rand() * 7.2;
          gz = 28.0 + rand() * 21.5;
          gy = gz > 43 ? 2.2 : gz > 34.5 ? 4.6 : 5.6;
          if (Math.hypot(gx - 12.8, gz - 30.8) < 3.4) continue;
        } else {
          const side = rand() < 0.5 ? -1 : 1;
          gz = 30.0 + rand() * 25.0;
          gx = side * (7.8 + rand() * 6.5);
          gy = this.evalMountainRidgeHeight(gx, gz);
        }
      } else {
        // Zone 3 Courtyard Cloister borders & Pre-Boss Terrace edges
        const ang = rand() * Math.PI * 2;
        const rad = 16.5 + rand() * 2.4;
        gx = Math.sin(ang) * rad;
        gz = 12.0 + Math.cos(ang) * rad;
        if (Math.abs(gx) < 6.0 && (gz > 26 || gz < -2)) continue;
        gy = 4.5;
      }

      dummy.position.set(gx, gy - 0.03, gz);
      dummy.rotation.set((rand() - 0.5) * 0.22, rand() * Math.PI * 2, (rand() - 0.5) * 0.22);
      const s = 0.65 + rand() * 0.85;
      dummy.scale.set(s, s * (0.75 + rand() * 0.65), s);
      dummy.updateMatrix();
      this.grassMesh.setMatrixAt(placed, dummy.matrix);
      placed++;
    }

    this.grassMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.grassMesh);
  }

  private buildFrostCrystalCluster(x: number, y: number, z: number, scale = 1.0, isCrimson = false) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.scale.setScalar(scale);

    const rockBase = this.cloneSnowModel(gameAssets.envModels.alpineRock7, 0.55);
    rockBase.scale.set(0.85, 0.68, 0.85);
    g.add(rockBase);

    const mat = new THREE.MeshPhysicalMaterial({
      color: isCrimson ? 0xd9381e : 0x4ca8d8,
      emissive: isCrimson ? new THREE.Color(0.85, 0.16, 0.04) : new THREE.Color(0.08, 0.36, 0.62),
      normalMap: gameAssets.pbr.kunlunCliff.normal,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughness: 0.12,
      metalness: 0.22,
      clearcoat: 1.0,
      clearcoatRoughness: 0.10,
      flatShading: true,
    });

    for (const s of [
      { ox: 0, oz: 0, h: 2.35, r: 0.36, rx: 0.08, rz: -0.06 },
      { ox: 0.38, oz: 0.22, h: 1.65, r: 0.26, rx: 0.26, rz: -0.28 },
      { ox: -0.34, oz: 0.16, h: 1.82, r: 0.28, rx: 0.18, rz: 0.32 },
      { ox: 0.12, oz: -0.36, h: 1.32, r: 0.22, rx: -0.32, rz: 0.14 },
    ]) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(1.0, 0), mat);
      m.scale.set(s.r, s.h * 0.62, s.r * 0.82);
      m.position.set(s.ox, s.h * 0.42, s.oz);
      m.rotation.set(s.rx, 0.45, s.rz);
      m.castShadow = true;
      g.add(m);
    }
    this.scene.add(g);
    this.collision.addCircle(x, z, 0.82 * scale, y - 0.5, y + 3.0 * scale);
  }

  private buildSilkBanner(x: number, y: number, z: number, rotY = 0) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = rotY;

    const pole = new THREE.Mesh(
      scaleUvMeters(new THREE.CylinderGeometry(0.07, 0.09, 5.4, 10), 1.0, 3.0),
      this.sharedWoodMat
    );
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
      color: 0xdcf0ff,
      map: gameAssets.pbr.yunbrocadeAzure,
      normalMap: gameAssets.pbr.armorCloth.normal,
      roughnessMap: gameAssets.pbr.armorCloth.roughness,
      emissive: new THREE.Color(0x0c2c44),
      emissiveIntensity: 0.28,
      side: THREE.DoubleSide,
      roughness: 0.62,
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

  private addBronzeCenserWithSmoke(x: number, y: number, z: number, scale = 1.65) {
    const stand = new THREE.Mesh(boxMeters(1.15, 0.36, 1.15, 0.7), this.sharedMarbleMat);
    stand.position.set(x, y + 0.18, z);
    stand.castShadow = true;
    stand.receiveShadow = true;
    this.scene.add(stand);

    const censer = gameAssets.envModels.bronzeCenser.clone(true);
    censer.scale.setScalar(scale);
    censer.position.set(x, y + 0.36, z);
    censer.traverse((n) => {
      if ((n as THREE.Mesh).isMesh) {
        (n as THREE.Mesh).castShadow = true;
        (n as THREE.Mesh).receiveShadow = true;
      }
    });
    this.scene.add(censer);

    // Rising Incense Smoke Wisps (`青铜三足鼎袅袅香烟`)
    for (let i = 0; i < 3; i++) {
      const wispMat = new THREE.MeshBasicMaterial({
        map: this.textures.softGlowTex,
        color: new THREE.Color(0.68, 0.80, 0.94),
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      });
      const wisp = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.45), wispMat);
      const basePos = new THREE.Vector3(x, y + 1.55 + i * 0.65, z);
      wisp.position.copy(basePos);
      this.scene.add(wisp);
      this.incenseSmokeWisps.push({ mesh: wisp, basePos, phase: i * 2.1 + x * 0.4 });
    }

    this.lightingRig.addEmitter(new THREE.Vector3(x, y + 1.4, z), 0xff9838, 2.8, 12.0, 0.15);
    this.collision.addCircle(x, z, 0.72, y - 0.5, y + 2.4);
  }

  /**
   * Builds the Grand Mountain Paifang, Zone 3 Covered Vermilion Cloisters (`抄手游廊`),
   * Zone 4 Forged Iron Suspension Chains (`锁妖玄铁悬索`), Colossal Rune Swords & Taiyi Immortal Palace!
   */
  private buildLandmarksCloistersAndChains() {
    // 1. Grand Three-Bay Five-Roof Qionghua Mountain Paifang at Outer Gate (Z = +56.8)
    const paifang = createQionghuaGrandPaifang(
      this.sharedMarbleMat,
      this.sharedWoodMat,
      this.sharedRoofMat,
      this.sharedGoldMat,
      gameAssets.envModels.palaceLantern,
      this.sharedFriezeMat
    );
    paifang.position.set(0, 0, 56.8);
    this.scene.add(paifang);

    for (const px of [-8.2, -4.4, 4.4, 8.2]) {
      this.collision.addCircle(px, 56.8, 0.82, -1, 14);
    }
    for (const side of [-1, 1]) {
      this.lightingRig.addEmitter(new THREE.Vector3(side * 3.35, 7.2, 56.8), 0xff9c3c, 4.2, 18.0, 0.14);
    }
    this.occluderGroups.push({
      obj: paifang,
      center: new THREE.Vector3(0, 6, 56.8),
      radius: 4.5,
    });
    this.compactOccluderGroup(paifang);

    // Flanking Bronze Tripod Incense Censers in front of the Mountain Paifang!
    this.addBronzeCenserWithSmoke(-5.4, 0, 60.2, 2.45);
    this.addBronzeCenserWithSmoke(5.4, 0, 60.2, 2.45);

    // 2. ZONE 3 COVERED PILLARED VERMILION CLOISTERS (`朱红雕花抄手游廊` flanking East & West Plaza!)
    //    West Cloister splits cleanly around Z=+14 so the Shortcut Sword Bridge remains 100% open!
    const cloisterConfigs = [
      { x: 19.8, z: 12.0, len: 22.0, bays: 6, rotY: 0 }, // East Full Covered Cloister
      { x: -19.8, z: 21.2, len: 9.2, bays: 2, rotY: Math.PI }, // West South Wing Cloister
      { x: -19.8, z: 3.2, len: 10.4, bays: 3, rotY: Math.PI }, // West North Wing Cloister
    ];
    for (const cc of cloisterConfigs) {
      const { group: clGroup, lanternLocalPositions } = createChineseCoveredCloister(
        cc.len,
        cc.bays,
        this.sharedMarbleMat,
        this.sharedWoodMat,
        this.sharedRoofMat,
        this.sharedGoldMat,
        this.sharedFriezeMat,
        gameAssets.envModels.chineseChandelier
      );
      clGroup.position.set(cc.x, 4.5, cc.z);
      clGroup.rotation.y = cc.rotY;
      this.scene.add(clGroup);

      // Register capsule barrier along inner cloister balustrade & warm chandelier lights!
      this.collision.addCapsule(
        cc.x - Math.sign(cc.x) * 1.65,
        cc.z - cc.len * 0.48,
        cc.x - Math.sign(cc.x) * 1.65,
        cc.z + cc.len * 0.48,
        0.35,
        4.0,
        10.5
      );

      clGroup.updateMatrixWorld(true);
      for (const lp of lanternLocalPositions) {
        const wp = lp.clone().applyMatrix4(clGroup.matrixWorld);
        this.lightingRig.addEmitter(wp, 0xff9a38, 3.8, 17.5, 0.14);
      }
    }

    // Courtyard Vermilion Dragon Pillars + Immortal Statues inside Taiji Courtyard
    for (const cp of [
      { x: -8.2, z: 20.2, h: 7.4 },
      { x: 8.2, z: 20.2, h: 4.8 }, // Shattered tactical pillar!
      { x: -8.2, z: 3.8, h: 7.4 },
      { x: 8.2, z: 3.8, h: 7.4 },
    ]) {
      const colGroup = new THREE.Group();
      colGroup.position.set(cp.x, 4.5, cp.z);

      const base = new THREE.Mesh(
        scaleUvMeters(new THREE.CylinderGeometry(0.92, 1.08, 0.95, 16), 2.0, 0.8),
        this.sharedMarbleMat
      );
      base.position.y = 0.47;
      base.castShadow = true;
      base.receiveShadow = true;
      colGroup.add(base);

      const shaft = new THREE.Mesh(
        scaleUvMeters(new THREE.CylinderGeometry(0.58, 0.66, cp.h, 20), 1.6, 3.5),
        this.sharedWoodMat
      );
      shaft.position.y = cp.h * 0.5 + 0.35;
      shaft.castShadow = true;
      shaft.receiveShadow = true;
      colGroup.add(shaft);

      const goldCap = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.64, 0.38, 18), this.sharedGoldMat);
      goldCap.position.y = cp.h + 0.35;
      colGroup.add(goldCap);

      if (cp.h > 6.5) {
        const dir = cp.x < 0 ? 1 : -1;
        const arm = new THREE.Mesh(boxMeters(0.95, 0.14, 0.14, 1.0), this.sharedGoldMat);
        arm.position.set(dir * 0.85, cp.h - 0.6, 0);
        colGroup.add(arm);

        const lantern = gameAssets.envModels.palaceLantern.clone(true);
        lantern.scale.setScalar(3.2);
        lantern.position.set(dir * 1.22, cp.h - 1.55, 0);
        colGroup.add(lantern);

        this.lightingRig.addEmitter(
          new THREE.Vector3(cp.x + dir * 1.22, 4.5 + cp.h - 1.2, cp.z),
          0xff9838,
          3.5,
          16.5,
          0.16
        );
      }

      this.scene.add(colGroup);
      this.compactOccluderGroup(colGroup);
      this.collision.addCircle(cp.x, cp.z, 1.02, 4.0, 4.5 + cp.h);
      this.occluderGroups.push({
        obj: colGroup,
        center: new THREE.Vector3(cp.x, 4.5 + cp.h * 0.5, cp.z),
        radius: 1.6,
      });
    }

    // Immortal Statues (`immortal_statue.glb`) guarding North Stairway Throat (`Z = -2.5`)
    for (const side of [-1, 1]) {
      const sx = side * 8.4;
      const sz = -2.2;
      const ped = new THREE.Mesh(boxMeters(2.2, 1.25, 2.2, 0.6), this.sharedMarbleMat);
      ped.position.set(sx, 4.5 + 0.625, sz);
      ped.castShadow = true;
      ped.receiveShadow = true;
      this.scene.add(ped);

      const statue = this.cloneSnowModel(gameAssets.envModels.immortalStatue, 0.34, true, true);
      statue.scale.setScalar(3.5);
      statue.position.set(sx, 4.5 + 1.25, sz);
      statue.rotation.y = -side * 0.35;
      this.scene.add(statue);
      this.collision.addCircle(sx, sz, 1.35, 4.2, 10.0);
    }

    // 3. ZONE 4 FORGED IRON SUSPENSION CHAINS (`锁妖玄铁悬索`) spanning the Chasm!
    const chainIronMat = new THREE.MeshStandardMaterial({
      color: 0x46525e,
      map: gameAssets.pbr.armorPlate.color,
      normalMap: gameAssets.pbr.armorPlate.normal,
      roughnessMap: gameAssets.pbr.armorPlate.roughness,
      roughness: 0.42,
      metalness: 0.85,
    });
    for (const side of [-1, 1]) {
      for (const tier of [0, 1]) {
        const pStart = new THREE.Vector3(side * (6.6 + tier * 2.2), 5.8 + tier * 2.4, -5.5);
        const pMid = new THREE.Vector3(side * (7.2 + tier * 2.6), 6.2 + tier * 2.0, -16.2);
        const pEnd = new THREE.Vector3(side * (6.8 + tier * 2.2), 12.0 + tier * 2.4, -26.5);
        const curve = new THREE.CatmullRomCurve3([pStart, pMid, pEnd]);
        const chainTube = new THREE.Mesh(
          scaleUvMeters(new THREE.TubeGeometry(curve, 24, 0.14, 8, false), 12.0, 1.0),
          chainIronMat
        );
        chainTube.castShadow = true;
        this.scene.add(chainTube);
      }
    }

    // Silk Banners & Frost/Crimson Crystal Intrusions
    this.buildSilkBanner(-6.8, 0, 63.0, 0.2);
    this.buildSilkBanner(6.8, 0, 63.0, -0.2);
    this.buildSilkBanner(-8.4, 10.5, -28.0, 0.15);
    this.buildSilkBanner(8.4, 10.5, -28.0, -0.15);

    this.buildFrostCrystalCluster(-6.5, 0.0, 68.5, 0.90, false);
    this.buildFrostCrystalCluster(6.6, 0.0, 77.5, 1.02, false);
    this.buildFrostCrystalCluster(-13.2, 4.5, 19.5, 1.08, false);
    this.buildFrostCrystalCluster(13.8, 4.5, 8.2, 1.05, true);
    this.buildFrostCrystalCluster(7.6, 10.5, -30.5, 1.00, true);
    this.buildFrostCrystalCluster(-7.8, 10.5, -35.2, 0.92, false);

    // Ornate Gilded Lantern Pillars flanking Stairs & Golden Mist Gate
    for (const [bx, by, bz] of [
      [-6.2, 4.5, 28.8],
      [6.2, 4.5, 28.8],
      [-5.8, 10.5, -36.2],
      [5.8, 10.5, -36.2],
    ]) {
      const stand = new THREE.Mesh(
        scaleUvMeters(new THREE.CylinderGeometry(0.45, 0.58, 1.45, 12), 1.4, 0.8),
        this.sharedMarbleMat
      );
      stand.position.set(bx, by + 0.72, bz);
      stand.castShadow = true;
      this.scene.add(stand);

      const lantern = gameAssets.envModels.palaceLantern.clone(true);
      lantern.scale.setScalar(3.4);
      lantern.position.set(bx, by + 1.42, bz);
      this.scene.add(lantern);

      const fireOrb = new THREE.Mesh(
        new THREE.SphereGeometry(0.20, 10, 8),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 1.15, 0.40) })
      );
      fireOrb.position.set(bx, by + 1.92, bz);
      this.scene.add(fireOrb);

      this.lightingRig.addEmitter(new THREE.Vector3(bx, by + 2.0, bz), 0xff9838, 3.8, 17.0, 0.15);
      this.collision.addCircle(bx, bz, 0.72, by - 0.3, by + 2.6);
    }

    // GPU-Instanced Anti-Gravity Kunlun Crags (`THREE.InstancedMesh` -> 24 rocks in 1 Draw Call!)
    let boulderGeo: THREE.BufferGeometry | null = null;
    let boulderMat: THREE.Material | null = null;
    gameAssets.envModels.boulder2.traverse((n) => {
      if (!boulderGeo && (n as THREE.Mesh).isMesh) {
        boulderGeo = (n as THREE.Mesh).geometry;
        const rawMat = (n as THREE.Mesh).material;
        const m = Array.isArray(rawMat) ? rawMat[0] : rawMat;
        boulderMat = this.getSharedSnowMaterial(m, 0.72);
      }
    });
    if (boulderGeo && boulderMat) {
      const count = 24;
      this.instancedBoulders = new THREE.InstancedMesh(boulderGeo, boulderMat, count);
      this.instancedBoulders.frustumCulled = false;
      const dummy = new THREE.Object3D();
      for (let i = 0; i < count; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const rx = side * (16 + (i % 5) * 5.5);
        const rz = 52 - i * 5.6;
        const ry = 3.0 + (i / count) * 14.5 + ((i * 7) % 5);
        const s = 1.6 + (i % 3) * 0.95;
        const pos = new THREE.Vector3(rx, ry, rz);
        const rot = new THREE.Euler(0.12 * (i % 3), i * 1.1, 0.08 * (i % 2));
        const scl = new THREE.Vector3(s, s * 1.28, s);
        dummy.position.copy(pos);
        dummy.rotation.copy(rot);
        dummy.scale.copy(scl);
        dummy.updateMatrix();
        this.instancedBoulders.setMatrixAt(i, dummy.matrix);
        this.boulderInstances.push({
          pos,
          rot,
          scale: scl,
          baseY: ry,
          phase: i * 0.85,
          speed: 0.62 + (i % 4) * 0.18,
        });
      }
      this.instancedBoulders.instanceMatrix.needsUpdate = true;
      this.scene.add(this.instancedBoulders);
    }

    // 11 Sculpted Colossal Floating Rune Greatswords crowning Juanyun Summit!
    const stoneBladeMat = new THREE.MeshStandardMaterial({
      color: 0x9cb6cc,
      map: gameAssets.pbr.armorBlade.color,
      normalMap: gameAssets.pbr.armorBlade.normal,
      roughnessMap: gameAssets.pbr.armorBlade.roughness,
      roughness: 0.28,
      metalness: 0.68,
    });
    for (let i = 0; i < 11; i++) {
      const frac = i / 10;
      const angle = -Math.PI * 0.10 - frac * Math.PI * 0.80;
      const dist = 37.5 + (i % 2) * 4.5;
      const sx = Math.cos(angle) * dist;
      const sz = -63 + Math.sin(angle) * dist;
      const sy = 15.5 + (i === 5 ? 8.2 : (i % 3) * 2.8);

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
        phase: i * 0.65,
        runeMat,
      });
    }

    // Monumental Three-Tiered Qionghua Main Immortal Palace (`太一仙宫`) nestled in the Kunlun Peak!
    const palaceGroup = createTaiyiImmortalPalace(
      this.sharedMarbleMat,
      this.sharedAshlarMat,
      this.sharedWoodMat,
      this.sharedRoofMat,
      this.sharedGoldMat,
      this.sharedFriezeMat,
      this.sharedDragonRampMat
    );
    palaceGroup.position.set(0, 10.5, -134);

    for (const [cx, cy, cz, csx, csy, csz] of [
      [0, -1.8, 2.0, 19.5, 11.5, 12.0],
      [-25.5, -1.2, 4.0, 9.5, 9.5, 8.8],
      [25.5, -1.2, 4.0, 9.5, 9.5, 8.8],
    ]) {
      const crag = this.cloneSnowModel(gameAssets.envModels.boulder1, 0.82);
      crag.position.set(cx, cy, cz);
      crag.scale.set(csx, csy, csz);
      palaceGroup.add(crag);
    }

    const haloRing = new THREE.Mesh(
      new THREE.PlaneGeometry(54, 54),
      new THREE.MeshBasicMaterial({
        map: this.textures.runeRingTex,
        color: new THREE.Color(0.55, 1.18, 1.65),
        transparent: true,
        opacity: 0.42,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    haloRing.position.set(0, 23, -6);
    palaceGroup.add(haloRing);
    this.floatingRocks.push({ mesh: haloRing, baseY: 23, phase: 0, speed: 0.20 });

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

      const base = new THREE.Mesh(
        scaleUvMeters(new THREE.CylinderGeometry(1.02, 1.26, 0.36, 16), 2.0, 0.5),
        this.sharedMarbleMat
      );
      base.position.y = 0.18;
      base.receiveShadow = true;
      g.add(base);

      // Planted Forged Ancient Sword (`antique_katana.glb`) glowing with Qionghua Spirit Qi
      const plantedSword = gameAssets.weaponModels.antiqueKatana.clone(true);
      plantedSword.scale.setScalar(1.55);
      plantedSword.rotation.set(Math.PI / 2, 0, 0.12);
      plantedSword.position.y = 1.15;
      g.add(plantedSword);

      // Floating Golden-Jade Grace Wisp Core (children[2])
      const flameMat = new THREE.MeshBasicMaterial({
        color: cfg.unlocked ? new THREE.Color(0.75, 1.65, 1.40) : new THREE.Color(0.45, 0.85, 1.15),
      });
      const wisp = new THREE.Mesh(new THREE.OctahedronGeometry(0.25, 1), flameMat);
      wisp.position.y = 1.42;
      g.add(wisp);

      // Ground Magic Rune Ring (children[3])
      const runeDisc = new THREE.Mesh(
        new THREE.PlaneGeometry(3.5, 3.5),
        new THREE.MeshBasicMaterial({
          map: this.textures.runeRingTex,
          color: 0x64d8c8,
          transparent: true,
          opacity: 0.58,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      runeDisc.rotation.x = -Math.PI / 2;
      runeDisc.position.y = 0.04;
      g.add(runeDisc);

      const emitter = this.lightingRig.addEmitter(
        cfg.pos.clone().add(new THREE.Vector3(0, 1.6, 0)),
        0x64e6d2,
        cfg.unlocked ? 2.8 : 1.1,
        13.5,
        0.10
      );

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
        light: emitter,
      });
    }
  }

  private buildFogGate() {
    const gateFrame = new THREE.Group();
    gateFrame.position.set(0, 10.5, -38.5);

    for (const side of [-1, 1]) {
      const base = new THREE.Mesh(
        scaleUvMeters(new THREE.CylinderGeometry(0.85, 1.0, 0.9, 14), 1.8, 0.6),
        this.sharedMarbleMat
      );
      base.position.set(side * 5.2, 0.45, 0);
      gateFrame.add(base);

      const col = new THREE.Mesh(
        scaleUvMeters(new THREE.CylinderGeometry(0.54, 0.62, 8.2, 16), 1.6, 3.5),
        this.sharedWoodMat
      );
      col.position.set(side * 5.2, 4.3, 0);
      col.castShadow = true;
      gateFrame.add(col);
      this.collision.addCircle(side * 5.2, -38.5, 0.92, 10, 19);
    }

    const archBeam = new THREE.Mesh(boxMeters(11.6, 0.68, 0.78, 0.35), this.sharedFriezeMat);
    archBeam.position.set(0, 8.1, 0);
    gateFrame.add(archBeam);

    const gateRoof = createSweepingChineseRoof(
      13.8,
      4.0,
      1.80,
      1.08,
      this.sharedRoofMat,
      this.sharedGoldMat,
      this.sharedWoodMat,
      this.sharedFriezeMat
    );
    gateRoof.position.set(0, 8.48, 0);
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
      color: 0xdceeff,
      size: 0.19,
      transparent: true,
      opacity: 0.68,
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
      color: new THREE.Color(1.75, 0.55, 0.16),
      size: 0.25,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.emberPoints = new THREE.Points(eGeo, eMat);
    this.emberPoints.frustumCulled = false;
    this.scene.add(this.emberPoints);
  }

  /**
   * Dequantizes `KHR_mesh_quantization` `Int16Array`/`Uint16Array` attributes into standard `Float32Array`
   * BEFORE `applyMatrix4` so world-space coordinates NEVER overflow 16-bit integer buffers!
   */
  private toFloat32Geometry(src: THREE.BufferGeometry, hasUv: boolean): THREE.BufferGeometry {
    let g = new THREE.BufferGeometry();
    if (src.index) g.setIndex(src.index.clone());
    for (const name of ['position', 'normal', 'uv', 'uv1'] as const) {
      if (!hasUv && (name === 'uv' || name === 'uv1')) continue;
      const attr = src.attributes[name];
      if (!attr) continue;
      const itemSize = attr.itemSize;
      const out = new Float32Array(attr.count * itemSize);
      for (let i = 0; i < attr.count; i++) {
        out[i * itemSize] = attr.getX(i);
        if (itemSize >= 2) out[i * itemSize + 1] = attr.getY(i);
        if (itemSize >= 3) out[i * itemSize + 2] = attr.getZ(i);
      }
      g.setAttribute(name, new THREE.BufferAttribute(out, itemSize));
    }
    if (g.index) g = g.toNonIndexed();
    if (!g.attributes.normal) g.computeVertexNormals();
    if (hasUv && g.attributes.uv && !g.attributes.uv1) {
      g.setAttribute('uv1', g.attributes.uv.clone());
    }
    return g;
  }

  /**
   * Merges sub-meshes inside a camera-occluder group (e.g. Grand Paifang's ~220 brackets/ridges)
   * down to 4–5 material-grouped meshes with isolated materials so fading never leaks to the world!
   */
  private compactOccluderGroup(group: THREE.Group) {
    group.updateMatrixWorld(true);
    const invRoot = group.matrixWorld.clone().invert();
    const buckets = new Map<
      string,
      { mat: THREE.Material; cast: boolean; receive: boolean; geos: THREE.BufferGeometry[]; old: THREE.Mesh[] }
    >();

    group.traverse((n) => {
      if (!(n as THREE.Mesh).isMesh || Array.isArray((n as THREE.Mesh).material)) return;
      const m = n as THREE.Mesh;
      const mat = m.material as THREE.Material;
      if (!mat || mat.transparent || !m.geometry?.attributes.position) return;
      const hasUv = Boolean(m.geometry.attributes.uv);
      const key = `${mat.uuid}_${hasUv ? 1 : 0}`;
      const g = this.toFloat32Geometry(m.geometry, hasUv);
      g.applyMatrix4(invRoot.clone().multiply(m.matrixWorld));
      let b = buckets.get(key);
      if (!b) {
        b = { mat: mat.clone(), cast: m.castShadow, receive: m.receiveShadow, geos: [], old: [] };
        buckets.set(key, b);
      }
      b.geos.push(g);
      b.old.push(m);
    });

    for (const b of buckets.values()) {
      const merged = BufferGeometryUtils.mergeGeometries(b.geos, false);
      b.geos.forEach((g) => g.dispose());
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, b.mat);
      mesh.castShadow = b.cast;
      mesh.receiveShadow = b.receive;
      group.add(mesh);
      for (const o of b.old) o.parent?.remove(o);
    }
  }

  /**
   * Batches static world meshes by `(material, zSector, shadowFlags, hasUv)` while preserving BOTH
   * `uv` and `uv1` so 2K `aoMap` + `normalMap` + `roughnessMap` render with 100% fidelity!
   */
  private batchStaticWorldGeometry() {
    const dynamicSet = new Set<THREE.Object3D>();
    const markSubtree = (root?: THREE.Object3D | null) => {
      if (!root) return;
      root.traverse((n) => dynamicSet.add(n));
    };

    for (const o of this.occluderGroups) markSubtree(o.obj);
    for (const b of this.silkBanners) markSubtree(b.mesh);
    for (const r of this.floatingRocks) markSubtree(r.mesh);
    for (const sw of this.giantSwords) markSubtree(sw.group);
    for (const sv of this.spiritVeins) markSubtree(sv.group);
    for (const sm of this.incenseSmokeWisps) markSubtree(sm.mesh);
    markSubtree(this.shortcutBridgeGroup);
    markSubtree(this.shortcutPedestalGlow);
    markSubtree(this.fogGateMesh);
    markSubtree(this.moonMesh);
    markSubtree(this.iceReflector);

    this.scene.updateMatrixWorld(true);

    interface BatchBucket {
      mat: THREE.Material;
      castShadow: boolean;
      receiveShadow: boolean;
      geos: THREE.BufferGeometry[];
      meshes: THREE.Mesh[];
    }
    const buckets = new Map<string, BatchBucket>();
    const worldPos = new THREE.Vector3();

    this.scene.traverse((obj) => {
      if (dynamicSet.has(obj)) return;
      if (!(obj as THREE.Mesh).isMesh) return;
      if ((obj as THREE.InstancedMesh).isInstancedMesh) return;
      if ((obj as THREE.SkinnedMesh).isSkinnedMesh) return;

      const mesh = obj as THREE.Mesh;
      if (!mesh.visible || Array.isArray(mesh.material) || !mesh.material) return;
      const mat = mesh.material as THREE.Material;
      if ((mat as THREE.ShaderMaterial).isShaderMaterial) return;
      if (mat.transparent || mat === this.taijiMat) return;
      if (!mesh.geometry || !mesh.geometry.attributes.position) return;

      mesh.getWorldPosition(worldPos);
      const zZone = worldPos.z < -25 ? 0 : worldPos.z < 35 ? 1 : 2;
      const hasUv = Boolean(mesh.geometry.attributes.uv);
      const key = `${mat.uuid}__z${zZone}__cs${mesh.castShadow ? 1 : 0}__rs${mesh.receiveShadow ? 1 : 0}__uv${hasUv ? 1 : 0}`;

      const g = this.toFloat32Geometry(mesh.geometry, hasUv);
      g.applyMatrix4(mesh.matrixWorld);

      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { mat, castShadow: mesh.castShadow, receiveShadow: mesh.receiveShadow, geos: [], meshes: [] };
        buckets.set(key, bucket);
      }
      bucket.geos.push(g);
      bucket.meshes.push(mesh);
    });

    for (const bucket of buckets.values()) {
      if (bucket.geos.length <= 1) {
        bucket.geos.forEach((g) => g.dispose());
        continue;
      }
      const merged = BufferGeometryUtils.mergeGeometries(bucket.geos, false);
      bucket.geos.forEach((g) => g.dispose());
      if (!merged) continue;

      merged.computeBoundingSphere();
      const batchedMesh = new THREE.Mesh(merged, bucket.mat);
      batchedMesh.castShadow = bucket.castShadow;
      batchedMesh.receiveShadow = bucket.receiveShadow;
      this.scene.add(batchedMesh);

      for (const old of bucket.meshes) {
        old.parent?.remove(old);
      }
    }
  }

  public unlockShortcut() {
    if (this.shortcutUnlocked) return;
    this.shortcutUnlocked = true;
    this.shortcutBridgeGroup.visible = true;
    (this.shortcutPedestalGlow.material as THREE.MeshBasicMaterial).color.setRGB(1.65, 1.28, 0.45);
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
    this.grassUniforms.uDemonFactor.value = this.demonFactor;
    this.lightingRig.setDemonFactor(this.demonFactor);

    const fogCol = new THREE.Color().lerpColors(
      new THREE.Color(0x162840),
      new THREE.Color(0x2a080a),
      this.demonFactor
    );
    (this.scene.fog as THREE.FogExp2).color.copy(fogCol);
    this.scene.environmentIntensity = 0.40 - this.demonFactor * 0.12;

    this.moonMat.emissive.lerpColors(new THREE.Color(0xcce6ff), new THREE.Color(0xff2c12), this.demonFactor);
    this.moonHaloMat.color.lerpColors(
      new THREE.Color(0.68, 0.85, 1.08),
      new THREE.Color(1.55, 0.24, 0.08),
      this.demonFactor
    );
    this.taijiMat.emissive.lerpColors(new THREE.Color(0x5bb8e8), new THREE.Color(0xff4a1c), this.demonFactor);
    this.taijiMat.emissiveIntensity = 0.38 + this.demonFactor * 0.95;

    for (const sw of this.giantSwords) {
      sw.runeMat.color.lerp(new THREE.Color(1.85, 0.36, 0.12), this.demonFactor * 0.85);
    }
  }

  public sampleWalkableHeight(x: number, z: number, currentY = 999): number | null {
    return this.collision.sampleWalkableHeight(x, z, currentY, 1.48);
  }

  /**
   * Exact per-step surface height for 2-Bone Analytical Leg IK (`footGrid` includes individual stair treads!).
   */
  public sampleFootHeight(x: number, z: number, refY: number): number {
    return this.collision.sampleFootSurfaceHeight(x, z, refY);
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

    const pushed = this.collision.pushOutObstacles(x, z, currentY, radius);
    x = pushed.x;
    z = pushed.z;

    const h = this.sampleWalkableHeight(x, z, currentY);
    if (h !== null) return { x, z, groundY: h };

    const hx = this.sampleWalkableHeight(x, prevPos.z, currentY);
    if (hx !== null) return { x, z: prevPos.z, groundY: hx };

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

  public update(dt: number, elapsed: number, focusPos: THREE.Vector3, activePointLights?: number) {
    this.skyMat.uniforms.uTime.value = elapsed;
    this.cloudSeaMat.uniforms.uTime.value = elapsed;
    this.fogGateMat.uniforms.uTime.value = elapsed;
    this.grassUniforms.uTime.value = elapsed;
    this.grassUniforms.uPlayerPos.value.copy(focusPos);

    snowFootprints.update(dt);
    this.lightingRig.update(elapsed, focusPos, activePointLights);

    for (const b of this.silkBanners) {
      b.mesh.rotation.x = Math.sin(elapsed * 2.8 + b.phase) * 0.12 + 0.06;
      b.mesh.rotation.z = b.baseRotZ + Math.cos(elapsed * 2.1 + b.phase) * 0.08;
    }

    for (const sm of this.incenseSmokeWisps) {
      const cycle = (elapsed * 0.38 + sm.phase) % 1.0;
      sm.mesh.position.set(
        sm.basePos.x + Math.sin(elapsed * 1.4 + sm.phase) * 0.22 * cycle,
        sm.basePos.y + cycle * 1.8,
        sm.basePos.z + Math.cos(elapsed * 1.1 + sm.phase) * 0.16 * cycle
      );
      sm.mesh.scale.setScalar(0.65 + cycle * 0.95);
      (sm.mesh.material as THREE.MeshBasicMaterial).opacity = Math.sin(cycle * Math.PI) * 0.22;
    }

    if (this.iceReflector) {
      const nearArena = focusPos.z < -20.0;
      this.iceReflector.visible = nearArena;
      this.taijiMat.transparent = nearArena;
      this.taijiMat.opacity = nearArena ? 0.88 : 1.0;
    }

    if (this.instancedBoulders) {
      const dummy = new THREE.Object3D();
      for (let i = 0; i < this.boulderInstances.length; i++) {
        const b = this.boulderInstances[i];
        b.pos.y = b.baseY + Math.sin(elapsed * b.speed + b.phase) * 0.45;
        b.rot.y += dt * 0.12;
        dummy.position.copy(b.pos);
        dummy.rotation.copy(b.rot);
        dummy.scale.copy(b.scale);
        dummy.updateMatrix();
        this.instancedBoulders.setMatrixAt(i, dummy.matrix);
      }
      this.instancedBoulders.instanceMatrix.needsUpdate = true;
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
