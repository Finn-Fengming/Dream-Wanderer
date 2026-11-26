import * as THREE from 'three';
import { PbrMaterialMaps } from '../assets/assetLoader';

/**
 * Creates a BoxGeometry with physical world-meter UVs (`uvPerMeter`) on all 6 faces
 * AND populates `uv1` for `aoMap` so stone/wood/jade NEVER stretch across wide slabs!
 */
export function boxMeters(
  width: number,
  height: number,
  depth: number,
  uvPerMeter = 0.45
): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(width, height, depth);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  // Three.js BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z
  const faceDims: [number, number][] = [
    [depth, height],
    [depth, height],
    [width, depth],
    [width, depth],
    [width, height],
    [width, height],
  ];
  for (let f = 0; f < 6; f++) {
    const [uSpan, vSpan] = faceDims[f];
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i;
      uv.setXY(idx, uv.getX(idx) * uSpan * uvPerMeter, uv.getY(idx) * vSpan * uvPerMeter);
    }
  }
  uv.needsUpdate = true;
  geo.setAttribute('uv1', uv.clone());
  return geo;
}

/**
 * Scales existing UVs into physical meters and mirrors `uv` into `uv1` so Three.js `aoMap` works!
 */
export function scaleUvMeters<T extends THREE.BufferGeometry>(
  geo: T,
  uScale: number,
  vScale = uScale
): T {
  const uv = geo.attributes.uv as THREE.BufferAttribute | undefined;
  if (uv) {
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) * uScale, uv.getY(i) * vScale);
    }
    uv.needsUpdate = true;
    geo.setAttribute('uv1', uv.clone());
  }
  return geo;
}

/**
 * Synthesizes crisp tangent-space Sobel `normalMap`, `roughnessMap`, and crevice `aoMap`
 * from a high-res single-channel/albedo relief or brocade texture at startup!
 */
export function deriveReliefPbrMaps(
  albedoTex: THREE.Texture,
  normalStrength = 2.6,
  baseRoughness = 0.62,
  metallicHighlights = false
): PbrMaterialMaps {
  const img = albedoTex.image as HTMLImageElement | HTMLCanvasElement | ImageBitmap | undefined;
  const size = 512;
  const cSrc = document.createElement('canvas');
  cSrc.width = cSrc.height = size;
  const sCtx = cSrc.getContext('2d', { willReadFrequently: true })!;
  if (img) {
    sCtx.drawImage(img as CanvasImageSource, 0, 0, size, size);
  } else {
    sCtx.fillStyle = '#808080';
    sCtx.fillRect(0, 0, size, size);
  }

  const srcData = sCtx.getImageData(0, 0, size, size).data;
  const heights = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) {
    const r = srcData[i * 4] / 255;
    const g = srcData[i * 4 + 1] / 255;
    const b = srcData[i * 4 + 2] / 255;
    heights[i] = r * 0.299 + g * 0.587 + b * 0.114;
  }

  const cNor = document.createElement('canvas');
  const cRou = document.createElement('canvas');
  const cAo = document.createElement('canvas');
  cNor.width = cRou.width = cAo.width = size;
  cNor.height = cRou.height = cAo.height = size;

  const nCtx = cNor.getContext('2d')!;
  const rCtx = cRou.getContext('2d')!;
  const aCtx = cAo.getContext('2d')!;

  const nImg = nCtx.createImageData(size, size);
  const rImg = rCtx.createImageData(size, size);
  const aImg = aCtx.createImageData(size, size);

  const at = (x: number, y: number) => heights[((y + size) % size) * size + ((x + size) % size)];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const tl = at(x - 1, y - 1);
      const t = at(x, y - 1);
      const tr = at(x + 1, y - 1);
      const l = at(x - 1, y);
      const c = at(x, y);
      const r = at(x + 1, y);
      const bl = at(x - 1, y + 1);
      const b = at(x, y + 1);
      const br = at(x + 1, y + 1);

      const dx = (tr + 2 * r + br - (tl + 2 * l + bl)) * normalStrength;
      const dy = (bl + 2 * b + br - (tl + 2 * t + tr)) * normalStrength;
      const invLen = 1 / Math.sqrt(dx * dx + dy * dy + 1);

      nImg.data[idx] = Math.round((-dx * invLen * 0.5 + 0.5) * 255);
      nImg.data[idx + 1] = Math.round((dy * invLen * 0.5 + 0.5) * 255);
      nImg.data[idx + 2] = Math.round((invLen * 0.5 + 0.5) * 255);
      nImg.data[idx + 3] = 255;

      const avg = (tl + t + tr + l + r + bl + b + br) * 0.125;
      const cavity = THREE.MathUtils.clamp(0.5 + (c - avg) * 3.2, 0.15, 1.0);
      const aoByte = Math.round(THREE.MathUtils.clamp(0.35 + c * 0.45 + cavity * 0.35, 0.2, 1.0) * 255);
      aImg.data[idx] = aImg.data[idx + 1] = aImg.data[idx + 2] = aoByte;
      aImg.data[idx + 3] = 255;

      // Raised gold threads / polished stone ridges are smoother; recessed crevices are rougher!
      const roughVal = metallicHighlights
        ? THREE.MathUtils.clamp(baseRoughness - (c - 0.45) * 0.55, 0.18, 0.92)
        : THREE.MathUtils.clamp(baseRoughness + (0.5 - c) * 0.32, 0.24, 0.94);
      const rByte = Math.round(roughVal * 255);
      rImg.data[idx] = rImg.data[idx + 1] = rImg.data[idx + 2] = rByte;
      rImg.data[idx + 3] = 255;
    }
  }

  nCtx.putImageData(nImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);
  aCtx.putImageData(aImg, 0, 0);

  const mkTex = (cv: HTMLCanvasElement) => {
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    return tex;
  };

  return {
    color: albedoTex,
    normal: mkTex(cNor),
    roughness: mkTex(cRou),
    ao: mkTex(cAo),
  };
}

/**
 * Shared 24-Slot Ring Buffer of Interactive Snow Footprints & Dodge/Slam Craters!
 * Every snow-drifted stone trail and mountain slope reads `uFootprints[24]` (xyz = world pos, w = radius/age)
 * so boots and rolls carve real darkened, compressed impressions in the snow!
 */
export class SnowFootprintTracker {
  public readonly maxPrints = 24;
  public readonly uniformArray: THREE.Vector4[] = [];
  private ages: number[] = [];
  private cursor = 0;
  private lastLeft = new THREE.Vector3(999, 999, 999);
  private lastRight = new THREE.Vector3(999, 999, 999);

  constructor() {
    for (let i = 0; i < this.maxPrints; i++) {
      this.uniformArray.push(new THREE.Vector4(0, -999, 0, 0));
      this.ages.push(999);
    }
  }

  public stamp(worldPos: THREE.Vector3, radius = 0.26) {
    this.uniformArray[this.cursor].set(worldPos.x, worldPos.y, worldPos.z, radius);
    this.ages[this.cursor] = 0;
    this.cursor = (this.cursor + 1) % this.maxPrints;
  }

  public recordBootStep(leftFootWorld: THREE.Vector3, rightFootWorld: THREE.Vector3, groundY: number) {
    if (Math.abs(leftFootWorld.y - groundY) < 0.22 && leftFootWorld.distanceToSquared(this.lastLeft) > 0.55 * 0.55) {
      this.lastLeft.copy(leftFootWorld);
      this.stamp(leftFootWorld, 0.22);
    }
    if (Math.abs(rightFootWorld.y - groundY) < 0.22 && rightFootWorld.distanceToSquared(this.lastRight) > 0.55 * 0.55) {
      this.lastRight.copy(rightFootWorld);
      this.stamp(rightFootWorld, 0.22);
    }
  }

  public update(dt: number) {
    for (let i = 0; i < this.maxPrints; i++) {
      if (this.ages[i] < 16.0) {
        this.ages[i] += dt;
        if (this.ages[i] >= 16.0) {
          this.uniformArray[i].set(0, -999, 0, 0);
        } else {
          const baseR = Math.abs(this.uniformArray[i].w);
          const fade = 1.0 - THREE.MathUtils.smoothstep(this.ages[i], 10.0, 16.0);
          this.uniformArray[i].w = Math.max(0.01, baseR * fade);
        }
      }
    }
  }
}

export const snowFootprints = new SnowFootprintTracker();

export interface KunlunSurfaceOptions {
  snowCoverage?: number;   // 0..1 snow accumulation on upward faces
  iceGlaze?: number;       // 0..1 wet/frozen specular patches on stone
  stoneMacroBreakup?: number; // 0..1 macro FBM color/roughness variation (kills repetition!)
  triplanarCliff?: boolean;   // World-space triplanar blending on steep rock/terrain
  enableFootprints?: boolean; // Depress & darken snow under character footsteps!
}

/**
 * Upgrades any MeshStandardMaterial into a《Saltline》×《雾锁山门》Multi-Layer Kunlun Surface Shader:
 * - Macro FBM weathering & lichen/frost variation (zero tiling look!)
 * - Wind-swept granular 2K snow accumulation on upward normals (`vWorldNormal.y`)
 * - Specular frozen ice glaze patches (`roughness -> 0.11`) + `dFdx/dFdy` specular AA
 * - Real-time interactive snow footprint impressions (`uFootprints[24]`)!
 */
export function applyKunlunSurfaceShader(
  mat: THREE.MeshStandardMaterial,
  snowPbr: PbrMaterialMaps,
  opts: KunlunSurfaceOptions = {}
): THREE.MeshStandardMaterial {
  const snowCov = opts.snowCoverage ?? 0.45;
  const iceGlaze = opts.iceGlaze ?? 0.28;
  const macroVar = opts.stoneMacroBreakup ?? 0.35;
  const usePrints = opts.enableFootprints ?? false;

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.tSnowCol = { value: snowPbr.color };
    shader.uniforms.tSnowNor = { value: snowPbr.normal };
    shader.uniforms.tSnowRou = { value: snowPbr.roughness };
    shader.uniforms.uSnowCoverage = { value: snowCov };
    shader.uniforms.uIceGlaze = { value: iceGlaze };
    shader.uniforms.uMacroVar = { value: macroVar };
    if (usePrints) {
      shader.uniforms.uFootprints = { value: snowFootprints.uniformArray };
    }

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying vec3 vKunlunWPos;
        varying vec3 vKunlunWNorm;
        `
      )
      .replace(
        '#include <worldpos_vertex>',
        /* glsl */ `
        #include <worldpos_vertex>
        vKunlunWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vKunlunWNorm = normalize(mat3(modelMatrix) * objectNormal);
        `
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        uniform sampler2D tSnowCol;
        uniform sampler2D tSnowNor;
        uniform sampler2D tSnowRou;
        uniform float uSnowCoverage;
        uniform float uIceGlaze;
        uniform float uMacroVar;
        ${usePrints ? 'uniform vec4 uFootprints[24];' : ''}
        varying vec3 vKunlunWPos;
        varying vec3 vKunlunWNorm;

        float klHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float klNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(klHash(i), klHash(i + vec2(1.0, 0.0)), f.x),
            mix(klHash(i + vec2(0.0, 1.0)), klHash(i + vec2(1.0, 1.0)), f.x),
            f.y
          );
        }
        float klFbm(vec2 p) {
          return klNoise(p) * 0.55 + klNoise(p * 2.3 + 5.7) * 0.30 + klNoise(p * 5.4 + 13.1) * 0.15;
        }
        `
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `
        #include <color_fragment>
        float klMacro = klFbm(vKunlunWPos.xz * 0.14 + vKunlunWPos.y * 0.08);
        float klDetail = klNoise(vKunlunWPos.xz * 1.35);

        // Macro weathering variation eliminates flat uniform repetition across stone slabs & cliffs!
        diffuseColor.rgb *= mix(1.0, 0.74 + 0.44 * klMacro, uMacroVar);

        // Natural wind-drifted snow mask on upward surfaces
        float upDot = clamp(vKunlunWNorm.y, 0.0, 1.0);
        float driftField = upDot * (0.68 + 0.55 * klMacro) - (1.0 - uSnowCoverage) * 0.85;
        float klSnowMask = smoothstep(0.08, 0.42, driftField) * step(0.01, uSnowCoverage);

        float klPrintCompress = 0.0;
        ${
          usePrints
            ? /* glsl */ `
        if (klSnowMask > 0.05) {
          for (int i = 0; i < 24; i++) {
            vec4 fp = uFootprints[i];
            if (fp.w > 0.02 && abs(vKunlunWPos.y - fp.y) < 0.45) {
              float d = length(vKunlunWPos.xz - fp.xz);
              float hit = 1.0 - smoothstep(fp.w * 0.45, fp.w, d);
              klPrintCompress = max(klPrintCompress, hit);
            }
          }
          klSnowMask *= (1.0 - klPrintCompress * 0.65);
        }
        `
            : ''
        }

        vec2 snowUv = vKunlunWPos.xz * 0.38;
        vec3 snowAlbedo = texture2D(tSnowCol, snowUv).rgb * vec3(0.92, 0.96, 1.04);
        // Darken damp stone slightly around snow melt-edges & compressed footprints!
        float meltRim = smoothstep(0.02, 0.22, klSnowMask) * (1.0 - smoothstep(0.22, 0.55, klSnowMask));
        diffuseColor.rgb *= (1.0 - meltRim * 0.20 - klPrintCompress * 0.24);
        diffuseColor.rgb = mix(diffuseColor.rgb, snowAlbedo, klSnowMask);

        float klIcePatch = smoothstep(0.56, 0.74, klFbm(vKunlunWPos.xz * 0.26 + 11.3)) * upDot * uIceGlaze * (1.0 - klSnowMask);
        diffuseColor.rgb *= (1.0 - klIcePatch * 0.16);
        `
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `
        #include <roughnessmap_fragment>
        float snowRough = texture2D(tSnowRou, vKunlunWPos.xz * 0.38).r;
        // Subtle diamond-frost sparkle on snow crystals
        float sparkle = step(0.965, klHash(floor(vKunlunWPos.xz * 48.0)));
        roughnessFactor = mix(roughnessFactor, clamp(snowRough * 0.88 - sparkle * 0.45, 0.14, 0.92), klSnowMask);
        // Frozen wet-ice patches catch razor-sharp reflections of warm palace lanterns & moon!
        roughnessFactor = mix(roughnessFactor, 0.11, klIcePatch);
        `
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `
        #include <normal_fragment_maps>
        if (klSnowMask > 0.02) {
          vec3 sNor = texture2D(tSnowNor, vKunlunWPos.xz * 0.38).xyz * 2.0 - 1.0;
          vec3 worldSnowN = normalize(vec3(sNor.x * 0.55, 1.0, sNor.y * 0.55));
          vec3 viewSnowN = normalize((viewMatrix * vec4(worldSnowN, 0.0)).xyz);
          normal = normalize(mix(normal, viewSnowN, klSnowMask * 0.68));
        }
        if (klIcePatch > 0.05) {
          vec3 flatUpView = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
          normal = normalize(mix(normal, flatUpView, klIcePatch * 0.72));
        }
        // Normal-variance specular anti-aliasing (eliminates shimmering subpixel highlights!)
        float nVar = max(dot(dFdx(normal), dFdx(normal)), dot(dFdy(normal), dFdy(normal)));
        roughnessFactor = min(1.0, sqrt(roughnessFactor * roughnessFactor + min(0.14, nVar * 0.38)));
        `
      );
  };

  mat.customProgramCacheKey = () =>
    `kunlun_surf_v4_${snowCov.toFixed(2)}_${iceGlaze.toFixed(2)}_${macroVar.toFixed(2)}_${usePrints ? 1 : 0}`;
  return mat;
}
