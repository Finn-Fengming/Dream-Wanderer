import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

export interface PbrMaterialMaps {
  color: THREE.Texture;
  normal: THREE.Texture;
  roughness: THREE.Texture;
}

export type VrmCastKey = 'tianhe' | 'xuanxiao' | 'lingsha' | 'mengli' | 'disciple';

export type MixamoClipKey =
  | 'idle'
  | 'walk'
  | 'run'
  | 'sword_run'
  | 'jump'
  | 'big_jump'
  | 'landing'
  | 'slash'
  | 'crouch_slash'
  | 'jump_hit'
  | 'kick'
  | 'floating';

const PLACEHOLDER_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// Intercept baked local disk paths (e.g. C:\Users\... inside Mixamo FBXs) so zero 404s occur!
const BAKED_LOCAL_PATH = /^(?:[a-zA-Z]:[\\/]|\\\\|\/Users\/|\/home\/)/;

function normalizeMatKey(name: string): string {
  return String(name ?? '')
    .replace(/(\.\d{3}|\s*\(\d+\))$/, '')
    .toLowerCase()
    .replace(/^(?:material|mat)|(?:material|mat)$/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export class GameAssetLibrary {
  public envMap!: THREE.Texture;
  public pbr!: {
    jadeMarble: PbrMaterialMaps;
    kunlunSnow: PbrMaterialMaps;
    glazedRoof: PbrMaterialMaps;
    wood: PbrMaterialMaps;
    stone: PbrMaterialMaps;
    rock: PbrMaterialMaps;
    cloth: PbrMaterialMaps;
    moonColor: THREE.Texture;
    moonNormal: THREE.Texture;
  };
  public envModels!: {
    cliffPeak: THREE.Group;
    boulder1: THREE.Group;
    boulder2: THREE.Group;
    chinesePine: THREE.Group;
    mountainTree: THREE.Group;
    palaceLantern: THREE.Group;
    immortalStatue: THREE.Group;
  };
  public weaponModels!: {
    katanaBase: THREE.Group;
    scabbard: THREE.Group;
    potion: THREE.Group;
  };
  public guardianFbxTemplate!: THREE.Group;
  public guardianMaterials = new Map<string, THREE.MeshStandardMaterial>();
  public guardianDefaultMat: THREE.MeshStandardMaterial | null = null;
  public mixamoSources = new Map<MixamoClipKey, THREE.Group>();
  private vrmBuffers = new Map<VrmCastKey, ArrayBuffer>();
  private vrmPool = new Map<VrmCastKey, VRM[]>();

  public async loadAll(
    renderer: THREE.WebGLRenderer,
    onProgress?: (pct: number, label: string) => void
  ): Promise<void> {
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) => {
      if (BAKED_LOCAL_PATH.test(url)) return PLACEHOLDER_DATA_URI;
      return url;
    });

    let totalSteps = 0;
    let doneSteps = 0;
    const track = <T>(p: Promise<T>, label: string): Promise<T> => {
      totalSteps++;
      return p.then((res) => {
        doneSteps++;
        const pct = Math.min(96, Math.round((doneSteps / Math.max(1, totalSteps)) * 92) + 4);
        onProgress?.(pct, label);
        return res;
      });
    };

    const texLoader = new THREE.TextureLoader(manager);
    const gltfLoader = new GLTFLoader(manager);
    gltfLoader.setMeshoptDecoder(MeshoptDecoder);
    const fbxLoader = new FBXLoader(manager);
    const rgbeLoader = new RGBELoader(manager);
    const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    const loadTex = (url: string, isColor: boolean, repeat = 1): Promise<THREE.Texture> =>
      track(
        new Promise<THREE.Texture>((resolve, reject) => {
          texLoader.load(
            url,
            (t) => {
              t.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
              t.wrapS = THREE.RepeatWrapping;
              t.wrapT = THREE.RepeatWrapping;
              if (repeat !== 1) t.repeat.set(repeat, repeat);
              t.anisotropy = maxAniso;
              resolve(t);
            },
            undefined,
            reject
          );
        }),
        '正在织造昆仑玉石与飞雪法线贴图…'
      );

    const loadPbr = async (prefix: string, ext: 'jpg' | 'webp'): Promise<PbrMaterialMaps> => {
      const sep = prefix.startsWith('materials-') ? '-' : '_';
      const [color, normal, roughness] = await Promise.all([
        loadTex(`./assets/textures/pbr/${prefix}${sep}color.${ext}`, true),
        loadTex(`./assets/textures/pbr/${prefix}${sep}normal.${ext}`, false),
        loadTex(`./assets/textures/pbr/${prefix}${sep}roughness.${ext}`, false),
      ]);
      return { color, normal, roughness };
    };

    const loadGlbScene = (url: string, label: string): Promise<THREE.Group> =>
      track(
        new Promise<THREE.Group>((resolve, reject) => {
          gltfLoader.load(
            url,
            (gltf: GLTF) => {
              gltf.scene.traverse((obj) => {
                if ((obj as THREE.Mesh).isMesh) {
                  const m = obj as THREE.Mesh;
                  m.castShadow = true;
                  m.receiveShadow = true;
                  const mats = Array.isArray(m.material) ? m.material : [m.material];
                  for (const mat of mats) {
                    if (mat && (mat as THREE.MeshStandardMaterial).map) {
                      (mat as THREE.MeshStandardMaterial).map!.anisotropy = maxAniso;
                    }
                  }
                }
              });
              resolve(gltf.scene);
            },
            undefined,
            reject
          );
        }),
        label
      );

    const loadFbx = (url: string, label: string): Promise<THREE.Group> =>
      track(
        new Promise<THREE.Group>((resolve, reject) => {
          fbxLoader.load(url, resolve, undefined, reject);
        }),
        label
      );

    const fetchBuffer = (url: string, label: string): Promise<ArrayBuffer> =>
      track(
        fetch(url).then((r) => {
          if (!r.ok) throw new Error(`Failed fetching ${url}: ${r.status}`);
          return r.arrayBuffer();
        }),
        label
      );

    // 1. HDRI Sky Probe -> PMREM Environment Map
    const hdrPromise = track(
      new Promise<THREE.Texture>((resolve, reject) => {
        rgbeLoader.load(
          './assets/hdri/sky_probe.hdr',
          (hdrTex) => {
            const pmrem = new THREE.PMREMGenerator(renderer);
            pmrem.compileEquirectangularShader();
            const envRT = pmrem.fromEquirectangular(hdrTex);
            hdrTex.dispose();
            pmrem.dispose();
            resolve(envRT.texture);
          },
          undefined,
          reject
        );
      }),
      '正在引动九天霞光与云海环境反射…'
    );

    // 2. PBR Textures
    const pbrPromise = Promise.all([
      loadPbr('jade_marble', 'jpg'),
      loadPbr('kunlun_snow', 'jpg'),
      loadPbr('glazed_roof', 'jpg'),
      loadPbr('materials-wood', 'webp'),
      loadPbr('materials-stone', 'webp'),
      loadPbr('materials-rock', 'webp'),
      loadPbr('materials-cloth', 'webp'),
      loadTex('./assets/textures/pbr/moon_color.png', true),
      loadTex('./assets/textures/pbr/moon_normal.png', false),
    ]);

    // 3. Real 3D Environment & Weapon GLBs
    const envModelsPromise = Promise.all([
      loadGlbScene('./assets/models/env/cliff_peak.glb', '正在堆叠昆仑雪崖与悬空仙峰…'),
      loadGlbScene('./assets/models/env/boulder_01.glb', '正在雕琢奇峰怪石…'),
      loadGlbScene('./assets/models/env/boulder_02.glb', '正在凝结御剑浮石…'),
      loadGlbScene('./assets/models/env/chinese_pine.glb', '正在栽植千年迎客古松…'),
      loadGlbScene('./assets/models/env/mountain_tree.glb', '正在点染琼华寒林…'),
      loadGlbScene('./assets/models/env/palace_lantern.glb', '正在点亮宫灯仙火…'),
      loadGlbScene('./assets/models/env/immortal_statue.glb', '正在安放太一仙像…'),
    ]);

    const weaponModelsPromise = Promise.all([
      loadGlbScene('./assets/models/weapons/katana_base.glb', '正在淬炼琼华仙剑…'),
      loadGlbScene('./assets/models/weapons/scabbard.glb', '正在雕饰寒玉剑鞘…'),
      loadGlbScene('./assets/models/weapons/potion.glb', '正在盛满鼠儿果仙露…'),
    ]);

    // 4. Guardian Armored Colossus FBX + PBR Palette GLB
    const guardianPromise = Promise.all([
      loadFbx('./assets/models/characters/armored_guardian.fbx', '正在铸造镇岳剑傀重甲…'),
      loadGlbScene('./assets/models/characters/guardian_palette.glb', '正在铭刻剑傀玄铁灵纹…'),
    ]);

    // 5. VRM Anime Cast Buffers
    const vrmKeys: VrmCastKey[] = ['tianhe', 'xuanxiao', 'lingsha', 'mengli', 'disciple'];
    const vrmPromises = Promise.all(
      vrmKeys.map(async (k) => {
        const buf = await fetchBuffer(`./assets/models/characters/${k}.vrm`, '正在唤醒云天河与玄霄仙魂真身…');
        return [k, buf] as const;
      })
    );

    // 6. 12 Real Mixamo Motion-Captured FBX Animations
    const animKeys: MixamoClipKey[] = [
      'idle',
      'walk',
      'run',
      'sword_run',
      'jump',
      'big_jump',
      'landing',
      'slash',
      'crouch_slash',
      'jump_hit',
      'kick',
      'floating',
    ];
    const animPromises = Promise.all(
      animKeys.map(async (k) => {
        const fbx = await loadFbx(`./assets/animations/${k}.fbx`, '正在推演琼华御剑武学招式…');
        fbx.updateMatrixWorld(true);
        return [k, fbx] as const;
      })
    );

    const [
      envMap,
      [jadeMarble, kunlunSnow, glazedRoof, wood, stone, rock, cloth, moonColor, moonNormal],
      [cliffPeak, boulder1, boulder2, chinesePine, mountainTree, palaceLantern, immortalStatue],
      [katanaBase, scabbard, potion],
      [guardianFbx, guardianPaletteScene],
      vrmEntries,
      animEntries,
    ] = await Promise.all([
      hdrPromise,
      pbrPromise,
      envModelsPromise,
      weaponModelsPromise,
      guardianPromise,
      vrmPromises,
      animPromises,
    ]);

    this.envMap = envMap;
    this.pbr = { jadeMarble, kunlunSnow, glazedRoof, wood, stone, rock, cloth, moonColor, moonNormal };
    this.envModels = {
      cliffPeak,
      boulder1,
      boulder2,
      chinesePine,
      mountainTree,
      palaceLantern,
      immortalStatue,
    };
    this.weaponModels = { katanaBase, scabbard, potion };
    this.guardianFbxTemplate = guardianFbx;

    // Index Guardian PBR materials with FBX V-axis UV flip (repeat.y = -1, offset.y = 1)
    guardianPaletteScene.traverse((node) => {
      if (!(node as THREE.Mesh).isMesh) return;
      const mesh = node as THREE.Mesh;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (!m) continue;
        const std = m.clone() as THREE.MeshStandardMaterial;
        for (const prop of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'] as const) {
          const tex = std[prop];
          if (tex && tex.isTexture) {
            const clonedTex = tex.clone();
            clonedTex.needsUpdate = true;
            clonedTex.repeat.y = -1;
            clonedTex.offset.y = 1;
            clonedTex.anisotropy = maxAniso;
            if (prop === 'map' || prop === 'emissiveMap') {
              clonedTex.colorSpace = THREE.SRGBColorSpace;
            }
            (std as unknown as Record<string, unknown>)[prop] = clonedTex;
          }
        }
        // Infuse subtle Qionghua bronze-jade sheen
        std.envMapIntensity = 1.25;
        if (!this.guardianDefaultMat) this.guardianDefaultMat = std;
        const k1 = normalizeMatKey(m.name);
        const k2 = normalizeMatKey(mesh.name);
        if (k1) this.guardianMaterials.set(k1, std);
        if (k2 && !this.guardianMaterials.has(k2)) this.guardianMaterials.set(k2, std);
      }
      mesh.geometry?.dispose();
    });

    for (const [k, buf] of vrmEntries) {
      this.vrmBuffers.set(k, buf);
    }
    for (const [k, fbx] of animEntries) {
      this.mixamoSources.set(k, fbx);
    }

    // Pre-instantiate independent VRM instances for every character in gameplay + showcase
    onProgress?.(97, '正在凝聚望舒羲和剑灵与人物灵骨…');
    const poolCounts: Record<VrmCastKey, number> = {
      tianhe: 2,
      xuanxiao: 2,
      lingsha: 2,
      mengli: 2,
      disciple: 7,
    };
    for (const [key, count] of Object.entries(poolCounts) as [VrmCastKey, number][]) {
      const list: VRM[] = [];
      for (let i = 0; i < count; i++) {
        list.push(await this.instantiateVrm(key));
      }
      this.vrmPool.set(key, list);
    }
    onProgress?.(100, '回梦仙境已成！');
  }

  public takeVrm(key: VrmCastKey): VRM {
    const list = this.vrmPool.get(key);
    if (!list || list.length === 0) {
      throw new Error(`VRM pool exhausted for ${key}`);
    }
    return list.pop()!;
  }

  /**
   * Parses an independent, full-featured VRM instance (with independent Humanoid, SpringBones,
   * ExpressionManager & MToon materials) directly from pre-fetched memory in ~10ms!
   */
  public async instantiateVrm(key: VrmCastKey): Promise<VRM> {
    const buffer = this.vrmBuffers.get(key);
    if (!buffer) throw new Error(`Missing VRM buffer for ${key}`);

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser, { autoUpdateHumanBones: true }));

    const gltf = await loader.parseAsync(buffer.slice(0), './assets/models/characters/');
    const vrm = gltf.userData.vrm as VRM;

    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.combineSkeletons(gltf.scene);
    if (typeof VRMUtils.combineMorphs === 'function') {
      VRMUtils.combineMorphs(vrm);
    }
    // Rotate VRM 0.x from -Z rest forward to +Z forward so it matches our gameplay rig convention!
    VRMUtils.rotateVRM0(vrm);

    vrm.scene.traverse((obj) => {
      obj.frustumCulled = false;
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    return vrm;
  }
}

export const gameAssets = new GameAssetLibrary();
