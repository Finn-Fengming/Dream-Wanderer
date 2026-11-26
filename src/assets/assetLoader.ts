import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

export interface PbrMaterialMaps {
  color: THREE.Texture;
  normal: THREE.Texture;
  roughness: THREE.Texture;
  ao?: THREE.Texture;
}

export type VrmCastKey = 'tianhe' | 'xuanxiao' | 'lingsha' | 'mengli' | 'disciple';

export type MixamoClipKey =
  | 'idle'
  | 'walk'
  | 'run'
  | 'sword_run'
  | 'crouch'
  | 'crouch_walk'
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

const BAKED_LOCAL_PATH = /^(?:[a-zA-Z]:[\\/]|\\\\|\/Users\/|\/home\/)/;

function normalizeMatKey(name: string): string {
  return String(name ?? '')
    .replace(/(\.\d{3}|\s*\(\d+\))$/, '')
    .toLowerCase()
    .replace(/^(?:material|mat)|(?:material|mat)$/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Flips V coordinate via texture transform matrix (`repeat.y = -1; offset.y = 1`).
 * Unlike `texture.flipY = true`, this works reliably on `ImageBitmap` textures decoded by GLTFLoader!
 */
function flipTextureMatrixV(tex: THREE.Texture) {
  tex.repeat.y = -Math.abs(tex.repeat.y || 1);
  tex.offset.y = 1;
  tex.needsUpdate = true;
}

/**
 * Merges sibling SkinnedMeshes sharing the exact same parent, material, and skeleton
 * into a SINGLE SkinnedMesh while preserving 100% of bone/SpringBone weights!
 */
export function mergeRedundantVrmSkinnedMeshes(root: THREE.Object3D) {
  const groupsToProcess: THREE.Object3D[] = [];
  root.traverse((obj) => {
    if (obj.children.length > 1) groupsToProcess.push(obj);
  });

  for (const parent of groupsToProcess) {
    const buckets = new Map<string, THREE.SkinnedMesh[]>();
    for (const child of parent.children) {
      if (!(child as THREE.SkinnedMesh).isSkinnedMesh) continue;
      const sm = child as THREE.SkinnedMesh;
      if (Array.isArray(sm.material)) continue;
      if (sm.morphTargetInfluences && sm.morphTargetInfluences.length > 0) continue;
      if (sm.geometry.morphAttributes && Object.keys(sm.geometry.morphAttributes).length > 0) continue;

      const key = `${sm.material.uuid}__${sm.skeleton.bones.length}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(sm);
    }

    for (const list of buckets.values()) {
      if (list.length <= 1) continue;
      const first = list[0];
      const geos = list.map((m) => m.geometry);
      const merged = BufferGeometryUtils.mergeGeometries(geos, false);
      if (!merged) continue;

      const mergedMesh = new THREE.SkinnedMesh(merged, first.material);
      mergedMesh.name = `${first.name}_merged`;
      mergedMesh.frustumCulled = false;
      mergedMesh.castShadow = first.castShadow;
      mergedMesh.receiveShadow = first.receiveShadow;
      mergedMesh.bind(first.skeleton, first.bindMatrix);
      parent.add(mergedMesh);

      for (const old of list) {
        parent.remove(old);
        old.geometry.dispose();
      }
    }
  }
}

/**
 * Upgrades flat unlit cartoon VRM MToon materials on Face/Skin/Hair/Qipao into
 * Stylized-PBR (`MeshPhysicalMaterial` / `MeshStandardMaterial`) so characters receive
 * Contact AO, warm lantern/brazier point lights, subsurface skin warmth, and silk hair sheen!
 */
function upgradeVrmMaterialsToStylizedPbr(vrm: VRM, castKey: VrmCastKey, texCache: Map<string, THREE.Texture>) {
  const matConvertCache = new Map<THREE.Material, THREE.Material>();

  vrm.scene.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;

    // Strip redundant dual-pass MToon outline sub-material
    const rawMat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (Array.isArray(mesh.material)) {
      mesh.geometry.clearGroups();
    }
    if (!rawMat) return;

    const tag = `${mesh.name} ${mesh.parent?.name ?? ''} ${rawMat.name ?? ''}`;
    const isHair = /Hair/i.test(tag);
    const isEyeOrBrow = /Eye|Brow|Lash|Mouth|Teeth|Highlight/i.test(tag) && !isHair;
    const isSkin = /Face|Body|Skin/i.test(tag) && !isEyeOrBrow && !isHair;

    mesh.castShadow = !isHair && !isEyeOrBrow;
    mesh.receiveShadow = !isEyeOrBrow;
    mesh.frustumCulled = false;

    const cached = matConvertCache.get(rawMat);
    if (cached) {
      mesh.material = cached;
      return;
    }

    // Deduplicate underlying texture objects across VRM instances
    const rec = rawMat as unknown as Record<string, unknown>;
    let baseMap = (rec.map as THREE.Texture | undefined) ?? null;
    let normalMap = (rec.normalMap as THREE.Texture | undefined) ?? null;

    if (baseMap && baseMap.isTexture) {
      baseMap.colorSpace = THREE.SRGBColorSpace;
      const ck = `${castKey}__${rawMat.name}__map`;
      const existing = texCache.get(ck);
      if (existing && existing !== baseMap) {
        baseMap.dispose();
        baseMap = existing;
      } else {
        texCache.set(ck, baseMap);
      }
    }
    if (normalMap && normalMap.isTexture) {
      const ck = `${castKey}__${rawMat.name}__nor`;
      const existing = texCache.get(ck);
      if (existing && existing !== normalMap) {
        normalMap.dispose();
        normalMap = existing;
      } else {
        texCache.set(ck, normalMap);
      }
    }

    const isTransparent = Boolean(
      rawMat.transparent || /Highlight|Eyeline|Lash|Brow/i.test(tag)
    );
    const alphaTest = (rawMat.alphaTest && rawMat.alphaTest > 0) ? rawMat.alphaTest : isHair ? 0.35 : 0;

    let nextMat: THREE.Material;
    if (isEyeOrBrow) {
      // Keep crisp luminous anime irises & brows while still responding softly to environment
      nextMat = new THREE.MeshStandardMaterial({
        name: rawMat.name,
        map: baseMap,
        color: 0xffffff,
        emissive: baseMap ? new THREE.Color(0x282828) : new THREE.Color(0x000000),
        emissiveMap: baseMap,
        emissiveIntensity: /Highlight|Iris/i.test(tag) ? 0.55 : 0.12,
        roughness: 0.25,
        metalness: 0.0,
        transparent: isTransparent,
        alphaTest: isTransparent ? 0 : Math.max(0.15, alphaTest),
        depthWrite: !isTransparent,
        side: THREE.DoubleSide,
      });
    } else if (isSkin) {
      // Warm Porcelain Stylized-PBR Skin with subtle peach subsurface sheen (zero plastic or white blowout!)
      const skinMat = new THREE.MeshPhysicalMaterial({
        name: rawMat.name,
        map: baseMap,
        normalMap,
        color: new THREE.Color(0xfff5ee),
        roughness: 0.56,
        metalness: 0.0,
        sheen: 0.38,
        sheenRoughness: 0.62,
        sheenColor: new THREE.Color(0xffb69e),
        clearcoat: 0.06,
        clearcoatRoughness: 0.45,
        side: THREE.FrontSide,
      });
      nextMat = skinMat;
    } else if (isHair) {
      // Silk-Strand Stylized Hair with lustrous anisotropic-like sheen highlight!
      const sheenTint =
        castKey === 'mengli'
          ? new THREE.Color(0x7fa2ff)
          : castKey === 'xuanxiao'
            ? new THREE.Color(0xff6b4a)
            : new THREE.Color(0x5c85b8);
      const useHairAlpha = Boolean(rawMat.transparent || (rawMat.alphaTest && rawMat.alphaTest > 0));
      nextMat = new THREE.MeshPhysicalMaterial({
        name: rawMat.name,
        map: baseMap,
        normalMap,
        color: 0xffffff,
        roughness: 0.42,
        metalness: 0.08,
        sheen: 0.65,
        sheenRoughness: 0.32,
        sheenColor: sheenTint,
        transparent: Boolean(rawMat.transparent),
        alphaTest: useHairAlpha ? Math.max(0.2, rawMat.alphaTest || 0.25) : 0,
        side: THREE.DoubleSide,
      });
    } else {
      // Authored silk garments (e.g. Han Lingsha's crimson brocade qipao)
      nextMat = new THREE.MeshPhysicalMaterial({
        name: rawMat.name,
        map: baseMap,
        normalMap,
        color: 0xffffff,
        roughness: 0.48,
        metalness: 0.12,
        sheen: 0.52,
        sheenRoughness: 0.40,
        sheenColor: new THREE.Color(0xffc8b8),
        alphaTest,
        side: THREE.DoubleSide,
      });
    }

    matConvertCache.set(rawMat, nextMat);
    mesh.material = nextMat;
  });
}

export class GameAssetLibrary {
  public envMap!: THREE.Texture;

  public pbr!: {
    // 2K 4-channel PolyHaven CC0 PBR sets
    slateFlagstone: PbrMaterialMaps;
    ashlarStone: PbrMaterialMaps;
    kunlunCliff: PbrMaterialMaps;
    alpineSnow: PbrMaterialMaps;
    ceramicTile: PbrMaterialMaps;
    palaceWood: PbrMaterialMaps;
    whiteJade: PbrMaterialMaps;
    // Character Armor & Fabric 4-channel PBR sets
    armorBlade: PbrMaterialMaps;
    armorPlate: PbrMaterialMaps;
    armorLeather: PbrMaterialMaps;
    armorBrass: PbrMaterialMaps;
    armorChain: PbrMaterialMaps;
    armorCloth: PbrMaterialMaps;
    // Custom AI-authored 2K Xianxia Relief & Silk Brocade Textures
    yunbrocadeAzure: THREE.Texture;
    yunbrocadeCrimson: THREE.Texture;
    yunbrocadeLavender: THREE.Texture;
    taijiCarvedJade: THREE.Texture;
    dragonRampRelief: THREE.Texture;
    chineseBeamFrieze: THREE.Texture;
    shanwenArmor: THREE.Texture;
    // Celestial Moon maps
    moonColor: THREE.Texture;
    moonNormal: THREE.Texture;
  };

  public envModels!: {
    cliffPeak: THREE.Group;
    rockFace1: THREE.Group;
    alpineRock7: THREE.Group;
    boulder1: THREE.Group;
    boulder2: THREE.Group;
    chinesePine: THREE.Group;
    pineRoots: THREE.Group;
    mountainTree: THREE.Group;
    alpineFern: THREE.Group;
    mountainShrub: THREE.Group;
    palaceLantern: THREE.Group;
    chineseChandelier: THREE.Group;
    woodenLantern: THREE.Group;
    bronzeCenser: THREE.Group;
    ritualUrn: THREE.Group;
    immortalStatue: THREE.Group;
  };

  public weaponModels!: {
    antiqueKatana: THREE.Group;
    forgedSword: THREE.Group;
    katanaBase: THREE.Group;
    scabbard: THREE.Group;
    potion: THREE.Group;
  };

  public guardianFbxTemplate!: THREE.Group;
  public guardianMaterials = new Map<string, THREE.MeshStandardMaterial>();
  public guardianMeshMaterials = new Map<string, THREE.MeshStandardMaterial | null>();
  public guardianDefaultMat: THREE.MeshStandardMaterial | null = null;

  public warlordVharenGlb!: GLTF;
  public ual46Glb!: GLTF;
  public mixamoSources = new Map<MixamoClipKey, THREE.Group>();
  public sfxBuffers = new Map<string, ArrayBuffer>();

  private vrmBuffers = new Map<VrmCastKey, ArrayBuffer>();
  private vrmPool = new Map<VrmCastKey, VRM[]>();
  private sharedVrmTexCache = new Map<string, THREE.Texture>();

  public async loadAll(
    renderer: THREE.WebGLRenderer,
    onProgress?: (pct: number, label: string) => void,
    showMode?: string | null
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
        const pct = Math.min(95, Math.round((doneSteps / Math.max(1, totalSteps)) * 90) + 4);
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
        '正在织造 2K 昆仑石雕与织锦法线贴图…'
      );

    const loadPbr2k = async (prefix: string): Promise<PbrMaterialMaps> => {
      const [color, normal, roughness, ao] = await Promise.all([
        loadTex(`./assets/textures/pbr_2k/${prefix}_color.jpg`, true),
        loadTex(`./assets/textures/pbr_2k/${prefix}_normal.jpg`, false),
        loadTex(`./assets/textures/pbr_2k/${prefix}_roughness.jpg`, false),
        loadTex(`./assets/textures/pbr_2k/${prefix}_ao.jpg`, false),
      ]);
      return { color, normal, roughness, ao };
    };

    const loadArmorPbr = async (folder: string): Promise<PbrMaterialMaps> => {
      const [color, normal, roughness, ao] = await Promise.all([
        loadTex(`./assets/textures/armor/${folder}/color.webp`, true),
        loadTex(`./assets/textures/armor/${folder}/normal.webp`, false),
        loadTex(`./assets/textures/armor/${folder}/roughness.webp`, false),
        loadTex(`./assets/textures/armor/${folder}/ao.webp`, false),
      ]);
      return { color, normal, roughness, ao };
    };

    const loadGltfFull = (url: string, label: string): Promise<GLTF> =>
      track(
        new Promise<GLTF>((resolve, reject) => {
          gltfLoader.load(
            url,
            (gltf: GLTF) => {
              gltf.scene.traverse((obj) => {
                if ((obj as THREE.Mesh).isMesh) {
                  const m = obj as THREE.Mesh;
                  const mats = Array.isArray(m.material) ? m.material : [m.material];
                  for (const mat of mats) {
                    if (!mat) continue;
                    if ((mat as THREE.MeshStandardMaterial).map) {
                      (mat as THREE.MeshStandardMaterial).map!.anisotropy = maxAniso;
                    }
                    // Prevent accidental KHR_materials_transmission (e.g. palace_lantern brass)
                    // from triggering an extra full-scene transmission render pass each frame!
                    if ('transmission' in mat && (mat as THREE.MeshPhysicalMaterial).transmission > 0) {
                      (mat as THREE.MeshPhysicalMaterial).transmission = 0;
                    }
                  }
                }
              });
              resolve(gltf);
            },
            undefined,
            reject
          );
        }),
        label
      );

    const loadGlbScene = (url: string, label: string): Promise<THREE.Group> =>
      loadGltfFull(url, label).then((g) => g.scene);

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

    // 1. 2K Moonlit Alpine HDRI Environment Probe
    const hdrPromise = track(
      new Promise<THREE.Texture>((resolve, reject) => {
        rgbeLoader.load(
          './assets/hdri/kunlun_moonlit_2k.hdr',
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
      '正在引动九天苍月与昆仑寒夜天光…'
    );

    // 2. All 2K PBR World & Armor Texture Sets + Custom Xianxia Brocade/Stone Reliefs
    const pbrPromise = Promise.all([
      loadPbr2k('slate_flagstone'),
      loadPbr2k('ashlar_stone'),
      loadPbr2k('kunlun_cliff'),
      loadPbr2k('alpine_snow'),
      loadPbr2k('ceramic_tile'),
      loadPbr2k('palace_wood'),
      loadPbr2k('white_jade'),
      loadArmorPbr('aco-lamina'),
      loadArmorPbr('aco-placa'),
      loadArmorPbr('couro'),
      loadArmorPbr('latao'),
      loadArmorPbr('malha-ferro'),
      loadArmorPbr('tecido'),
      loadTex('./assets/textures/xianxia/yunbrocade_azure.jpg', true),
      loadTex('./assets/textures/xianxia/yunbrocade_crimson.jpg', true),
      loadTex('./assets/textures/xianxia/yunbrocade_lavender.jpg', true),
      loadTex('./assets/textures/xianxia/taiji_carved_jade.jpg', true),
      loadTex('./assets/textures/xianxia/dragon_ramp_relief.jpg', true),
      loadTex('./assets/textures/xianxia/chinese_beam_frieze.jpg', true),
      loadTex('./assets/textures/xianxia/shanwen_armor.jpg', true),
      loadTex('./assets/textures/pbr/moon_color.png', true, 1),
      loadTex('./assets/textures/pbr/moon_normal.png', false, 1),
    ]);

    // 3. 3D Environment Cliffs, Pines, Roots, Lanterns, Censers & Foliage
    const envModelsPromise = Promise.all([
      loadGlbScene('./assets/models/env/cliff_peak.glb', '正在雕琢昆仑绝壁奇峰…'),
      loadGlbScene('./assets/models/env/rock_face_01.glb', '正在堆叠寒山断崖岩壁…'),
      loadGlbScene('./assets/models/env/alpine_rock_07.glb', '正在布设山道苍石…'),
      loadGlbScene('./assets/models/env/boulder_01.glb', '正在凝聚悬空灵石…'),
      loadGlbScene('./assets/models/env/boulder_02.glb', '正在凝聚剑冢奇石…'),
      loadGlbScene('./assets/models/env/chinese_pine.glb', '正在栽植千年迎客寒松…'),
      loadGlbScene('./assets/models/env/pine_roots.glb', '正在盘结古松苍根…'),
      loadGlbScene('./assets/models/env/mountain_tree.glb', '正在铺陈寒林苍木…'),
      loadGlbScene('./assets/models/env/alpine_fern.glb', '正在播撒寒谷霜蕨…'),
      loadGlbScene('./assets/models/env/mountain_shrub.glb', '正在点缀石隙寒梅灌木…'),
      loadGlbScene('./assets/models/env/palace_lantern.glb', '正在点亮琼华鎏金宫灯…'),
      loadGlbScene('./assets/models/env/chinese_chandelier.glb', '正在悬起回廊八角华灯…'),
      loadGlbScene('./assets/models/env/wooden_lantern.glb', '正在安放山道石木古灯…'),
      loadGlbScene('./assets/models/env/bronze_censer.glb', '正在陈列青铜三足丹炉…'),
      loadGlbScene('./assets/models/env/ritual_urn.glb', '正在安放琼浆宝鼎…'),
      loadGlbScene('./assets/models/env/immortal_statue.glb', '正在树立太一剑仙石像…'),
    ]);

    // 4. Sculpted 3D Weapons & Props
    const weaponModelsPromise = Promise.all([
      loadGlbScene('./assets/models/weapons/antique_katana.glb', '正在淬炼古法精钢剑胎…'),
      loadGlbScene('./assets/models/weapons/forged_sword.glb', '正在锻造琼华玄铁长剑…'),
      loadGlbScene('./assets/models/weapons/katana_base.glb', '正在铸造护山青锋…'),
      loadGlbScene('./assets/models/weapons/scabbard.glb', '正在雕饰吞口剑鞘…'),
      loadGlbScene('./assets/models/weapons/potion.glb', '正在封存鼠儿果仙露…'),
    ]);

    // 5. High-Detail Sculpted Character Rigs, Full 24MB PBR Armor Palette & 46-Clip RPG Animation Suite
    const vrmKeys: VrmCastKey[] = ['tianhe', 'xuanxiao', 'lingsha', 'mengli', 'disciple'];
    const vrmBufPromises = Promise.all(
      vrmKeys.map(async (k) => {
        const buf = await fetchBuffer(`./assets/models/characters/${k}.vrm`, `正在唤醒仙剑人物基底 (${k})…`);
        return [k, buf] as const;
      })
    );

    const guardianPromise = Promise.all([
      loadFbx('./assets/models/characters/armored_guardian.fbx', '正在铸造重甲镇岳剑傀…'),
      loadGlbScene('./assets/models/characters/guardian_palette_full.glb', '正在篆刻剑傀全套鎏金玄甲贴图…'),
      loadGltfFull('./assets/models/characters/warlord_vharen.glb', '正在唤醒焚天魔铠战躯…'),
      loadGltfFull('./assets/models/characters/ual_46_anims.glb', '正在载入 46 式全套剑术与翻滚动作库…'),
    ]);

    const animKeys: MixamoClipKey[] = [
      'idle',
      'walk',
      'run',
      'sword_run',
      'crouch',
      'crouch_walk',
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
        const fbx = await loadFbx(`./assets/animations/${k}.fbx`, `正在演练武学身法 (${k})…`);
        return [k, fbx] as const;
      })
    );

    // 6. Real Multi-Variant Sword Swing & Stinger Audio Samples
    const sfxFiles = [
      'swing-01',
      'swing-02',
      'swing-03',
      'swing-04',
      'swing-05',
      'swing-06',
      'swing-07',
      'swing-08',
      'swing-09',
      'fog-stinger',
      'death-stinger',
      'victory-stinger',
    ];
    const sfxPromises = Promise.all(
      sfxFiles.map(async (name) => {
        const buf = await fetchBuffer(`./assets/audio/sfx/${name}.mp3`, '正在调校金石破空剑鸣…');
        return [name, buf] as const;
      })
    );

    const [
      envMap,
      pbrArr,
      envModelsArr,
      weaponModelsArr,
      vrmEntries,
      [guardianFbx, guardianPalette, warlordGlb, ualGlb],
      animEntries,
      sfxEntries,
    ] = await Promise.all([
      hdrPromise,
      pbrPromise,
      envModelsPromise,
      weaponModelsPromise,
      vrmBufPromises,
      guardianPromise,
      animPromises,
      sfxPromises,
    ]);

    this.envMap = envMap;
    this.pbr = {
      slateFlagstone: pbrArr[0],
      ashlarStone: pbrArr[1],
      kunlunCliff: pbrArr[2],
      alpineSnow: pbrArr[3],
      ceramicTile: pbrArr[4],
      palaceWood: pbrArr[5],
      whiteJade: pbrArr[6],
      armorBlade: pbrArr[7],
      armorPlate: pbrArr[8],
      armorLeather: pbrArr[9],
      armorBrass: pbrArr[10],
      armorChain: pbrArr[11],
      armorCloth: pbrArr[12],
      yunbrocadeAzure: pbrArr[13],
      yunbrocadeCrimson: pbrArr[14],
      yunbrocadeLavender: pbrArr[15],
      taijiCarvedJade: pbrArr[16],
      dragonRampRelief: pbrArr[17],
      chineseBeamFrieze: pbrArr[18],
      shanwenArmor: pbrArr[19],
      moonColor: pbrArr[20],
      moonNormal: pbrArr[21],
    };

    this.envModels = {
      cliffPeak: envModelsArr[0],
      rockFace1: envModelsArr[1],
      alpineRock7: envModelsArr[2],
      boulder1: envModelsArr[3],
      boulder2: envModelsArr[4],
      chinesePine: envModelsArr[5],
      pineRoots: envModelsArr[6],
      mountainTree: envModelsArr[7],
      alpineFern: envModelsArr[8],
      mountainShrub: envModelsArr[9],
      palaceLantern: envModelsArr[10],
      chineseChandelier: envModelsArr[11],
      woodenLantern: envModelsArr[12],
      bronzeCenser: envModelsArr[13],
      ritualUrn: envModelsArr[14],
      immortalStatue: envModelsArr[15],
    };

    this.weaponModels = {
      antiqueKatana: weaponModelsArr[0],
      forgedSword: weaponModelsArr[1],
      katanaBase: weaponModelsArr[2],
      scabbard: weaponModelsArr[3],
      potion: weaponModelsArr[4],
    };

    this.guardianFbxTemplate = guardianFbx;
    this.warlordVharenGlb = warlordGlb;
    this.ual46Glb = ualGlb;

    // Index Full 24.5MB Guardian PBR Palette with exact matrix V-flip (fixes ImageBitmap UV origin!)
    const preparedMats = new Set<THREE.Material>();
    guardianPalette.traverse((node) => {
      if (!(node as THREE.Mesh).isMesh && !(node as THREE.SkinnedMesh).isSkinnedMesh) return;
      const mesh = node as THREE.Mesh;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

      for (const m of mats) {
        if (!m) continue;
        const std = m as THREE.MeshStandardMaterial;
        if (!preparedMats.has(std)) {
          preparedMats.add(std);
          if (std.map) std.map.colorSpace = THREE.SRGBColorSpace;
          if (std.emissiveMap) std.emissiveMap.colorSpace = THREE.SRGBColorSpace;
          for (const slotKey of Object.keys(std)) {
            const val = (std as unknown as Record<string, unknown>)[slotKey] as THREE.Texture | undefined;
            if (val && val.isTexture) {
              val.anisotropy = maxAniso;
              flipTextureMatrixV(val);
            }
          }
          if (!this.guardianDefaultMat) this.guardianDefaultMat = std;
        }

        const exact = String(std.name ?? '').replace(/(\.\d{3}|\s*\(\d+\))$/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const bare = normalizeMatKey(std.name);
        if (exact && !this.guardianMaterials.has(exact)) this.guardianMaterials.set(exact, std);
        if (bare && !this.guardianMaterials.has(bare)) this.guardianMaterials.set(bare, std);
      }

      if (mats.length === 1 && mats[0]) {
        const std = mats[0] as THREE.MeshStandardMaterial;
        for (const k of [
          String(mesh.name ?? '').replace(/(\.\d{3}|\s*\(\d+\))$/, '').toLowerCase().replace(/[^a-z0-9]/g, ''),
          normalizeMatKey(mesh.name),
        ]) {
          if (!k || this.guardianMaterials.has(k)) continue;
          const prev = this.guardianMeshMaterials.get(k);
          if (prev === undefined) this.guardianMeshMaterials.set(k, std);
          else if (prev !== std) this.guardianMeshMaterials.set(k, null);
        }
      }
    });
    // Free unrigged duplicate geometry from palette GLB immediately after indexing materials!
    guardianPalette.traverse((n) => (n as THREE.Mesh).geometry?.dispose());
    guardianPalette.clear();

    for (const [k, buf] of vrmEntries) {
      this.vrmBuffers.set(k, buf);
    }
    for (const [k, fbx] of animEntries) {
      this.mixamoSources.set(k, fbx);
    }
    for (const [k, buf] of sfxEntries) {
      this.sfxBuffers.set(k, buf);
    }

    onProgress?.(97, '正在锻造鎏金仙甲与多骨骼物理披挂…');
    const extraShowcase = showMode === 'chars' ? 1 : 0;
    const poolCounts: Record<VrmCastKey, number> = {
      tianhe: 1 + extraShowcase,
      xuanxiao: 1 + extraShowcase,
      lingsha: 1 + extraShowcase,
      mengli: 1 + extraShowcase,
      disciple: 5 + extraShowcase * 2,
    };
    for (const [key, count] of Object.entries(poolCounts) as [VrmCastKey, number][]) {
      const list: VRM[] = [];
      for (let i = 0; i < count; i++) {
        list.push(await this.instantiateVrm(key));
      }
      this.vrmPool.set(key, list);
    }
    onProgress?.(100, '昆仑琼华仙境已成！');
  }

  public resolveGuardianMaterial(matName: string, meshName: string): THREE.MeshStandardMaterial | null {
    const candidates = [
      String(matName ?? '').replace(/(\.\d{3}|\s*\(\d+\))$/, '').toLowerCase().replace(/[^a-z0-9]/g, ''),
      normalizeMatKey(matName),
      String(meshName ?? '').replace(/(\.\d{3}|\s*\(\d+\))$/, '').toLowerCase().replace(/[^a-z0-9]/g, ''),
      normalizeMatKey(meshName),
    ].filter(Boolean);

    for (const k of candidates) {
      const found = this.guardianMaterials.get(k);
      if (found) return found;
    }
    for (const k of candidates) {
      const found = this.guardianMeshMaterials.get(k);
      if (found) return found;
    }
    return this.guardianDefaultMat;
  }

  public takeVrm(key: VrmCastKey): VRM {
    const list = this.vrmPool.get(key);
    if (!list || list.length === 0) {
      throw new Error(`VRM pool exhausted for ${key}`);
    }
    return list.pop()!;
  }

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
    VRMUtils.rotateVRM0(vrm);

    upgradeVrmMaterialsToStylizedPbr(vrm, key, this.sharedVrmTexCache);
    mergeRedundantVrmSkinnedMeshes(vrm.scene);

    return vrm;
  }
}

export const gameAssets = new GameAssetLibrary();
