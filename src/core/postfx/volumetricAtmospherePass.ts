import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';

/**
 * Scene HDR Composite Pass BEFORE Bloom:
 * 1. Applies Depth-Aware Screen-Space Contact AO (stronger in ambient shadows, lighter in direct light).
 * 2. Raymarches Height-Layered Kunlun Valley Mist + Shadow-Map-Sampled Volumetric Tyndall God-Rays!
 * 3. Renders soft atmospheric Mie scattering halos around the Moon/Sun & Demon Crimson Transition.
 */
export class VolumetricAtmospherePass extends Pass {
  public material: THREE.ShaderMaterial;
  public sceneTexture: THREE.Texture | null = null;
  private quad: FullScreenQuad;
  private camera: THREE.PerspectiveCamera;
  private sunLight: THREE.DirectionalLight | null = null;
  private _invViewProj = new THREE.Matrix4();
  private _viewProj = new THREE.Matrix4();

  constructor(camera: THREE.PerspectiveCamera, steps = 10) {
    super();
    this.needsSwap = true;
    this.camera = camera;

    this.material = new THREE.ShaderMaterial({
      defines: {
        VOL_STEPS: Math.max(0, Math.floor(steps)),
      },
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: null },
        tAo: { value: null },
        tShadow: { value: null },
        uHasShadow: { value: 0 },
        uAoEnabled: { value: 1 },
        uVolEnabled: { value: 1 },
        uInvViewProj: { value: new THREE.Matrix4() },
        uInvProjection: { value: new THREE.Matrix4() },
        uShadowMatrix: { value: new THREE.Matrix4() },
        uCameraPos: { value: new THREE.Vector3() },
        uSunDir: { value: new THREE.Vector3(0.4, 0.55, 0.6).normalize() },
        uTime: { value: 0 },
        uDemonFactor: { value: 0 },
        uAoStrength: { value: 0.88 },
      },
      depthTest: false,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform sampler2D tDepth;
        uniform sampler2D tAo;
        uniform sampler2D tShadow;
        uniform float uHasShadow;
        uniform float uAoEnabled;
        uniform float uVolEnabled;
        uniform mat4 uInvViewProj;
        uniform mat4 uInvProjection;
        uniform mat4 uShadowMatrix;
        uniform vec3 uCameraPos;
        uniform vec3 uSunDir;
        uniform float uTime;
        uniform float uDemonFactor;
        uniform float uAoStrength;
        varying vec2 vUv;

        float hash12(vec2 p) {
          return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
        }

        float hash31(vec3 p) {
          p = fract(p * 0.1031);
          p += dot(p, p.yzx + 33.33);
          return fract((p.x + p.y) * p.z);
        }

        float noise3(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(
              mix(hash31(i), hash31(i + vec3(1,0,0)), f.x),
              mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x),
              f.y
            ),
            mix(
              mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
              mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x),
              f.y
            ),
            f.z
          );
        }

        vec3 worldPosFromDepth(vec2 uv, float depth) {
          vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
          vec4 world = uInvViewProj * clip;
          return world.xyz / max(world.w, 1e-6);
        }

        float viewLinearZ(vec2 uv, float depth) {
          vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
          vec4 view = uInvProjection * clip;
          return -(view.z / max(view.w, 1e-6));
        }

        float sampleSunShadow(vec3 worldPos) {
          if (uHasShadow < 0.5) return 1.0;
          vec4 sc = uShadowMatrix * vec4(worldPos, 1.0);
          vec3 proj = sc.xyz / max(sc.w, 1e-6);
          // Note: Three.js directional shadow matrix already maps into [0..1] UVZ!
          if (proj.x <= 0.01 || proj.x >= 0.99 || proj.y <= 0.01 || proj.y >= 0.99 || proj.z >= 0.999) {
            return 1.0;
          }
          float shadowDepth = texture2D(tShadow, proj.xy).r;
          return (proj.z - 0.0018 <= shadowDepth) ? 1.0 : 0.0;
        }

        void main() {
          vec4 base = texture2D(tDiffuse, vUv);
          vec3 col = base.rgb;
          float rawDepth = texture2D(tDepth, vUv).r;
          bool isSky = rawDepth >= 0.9999;

          // 1. Bilateral Depth-Matched Contact AO Application
          if (!isSky && uAoEnabled > 0.5) {
            float z = viewLinearZ(vUv, rawDepth);
            vec2 aoSample = texture2D(tAo, vUv).rg;
            float ao = aoSample.r;
            // Attenuate AO slightly on bright directly-lit specular peaks so highlights sparkle
            float lum = dot(col, vec3(0.299, 0.587, 0.114));
            float directMask = smoothstep(0.55, 1.65, lum);
            float effAo = mix(1.0, ao, uAoStrength * (1.0 - directMask * 0.45));
            // Tint occluded crevices slightly cold Kunlun slate-indigo (eliminates grey muddiness!)
            vec3 creviceTint = mix(vec3(0.62, 0.72, 0.92), vec3(1.0), effAo);
            col *= effAo * creviceTint;
          }

          // 2. Volumetric Shadow-Sampled Mist & Mie Sun/Moon Shafts
          #if VOL_STEPS > 0
          if (uVolEnabled > 0.5) {
            vec3 targetW = worldPosFromDepth(vUv, min(rawDepth, 0.9994));
            vec3 toPix = targetW - uCameraPos;
            float fullDist = length(toPix);
            vec3 rayDir = toPix / max(fullDist, 1e-4);
            float marchDist = min(fullDist, isSky ? 135.0 : 125.0);

            float ign = hash12(gl_FragCoord.xy + fract(uTime * 0.37) * 91.7);
            float stepLen = marchDist / float(VOL_STEPS);

            // Forward Mie phase toward Moon/Twilight Key Light
            float cosTheta = max(0.0, dot(rayDir, uSunDir));
            float mie = pow(cosTheta, 5.0) * 0.65 + pow(cosTheta, 16.0) * 0.55;

            vec3 coldShadowFog = mix(vec3(0.08, 0.14, 0.24), vec3(0.16, 0.04, 0.05), uDemonFactor);
            vec3 litShaftCol   = mix(vec3(0.62, 0.82, 1.10), vec3(1.35, 0.42, 0.14), uDemonFactor);
            vec3 mieCoronaCol  = mix(vec3(0.95, 0.88, 0.78), vec3(1.75, 0.55, 0.18), uDemonFactor);

            vec3 accumInscatter = vec3(0.0);
            float transmittance = 1.0;

            for (int i = 0; i < VOL_STEPS; i++) {
              float t = (float(i) + ign) * stepLen;
              vec3 pos = uCameraPos + rayDir * t;

              // Layered Kunlun altitude mist: dense sea of clouds in the abyss (y < -1),
              // drifting mountain-pass wisps near ground, crystal-clear alpine air high above!
              float abyssDensity = exp(-max(0.0, pos.y + 3.5) * 0.22) * 0.022;
              float wisp = noise3(pos * vec3(0.055, 0.10, 0.055) + vec3(uTime * 0.16, 0.0, -uTime * 0.11));
              float trailHaze = (0.0016 + smoothstep(0.45, 0.85, wisp) * 0.0032) * exp(-max(0.0, pos.y - 2.0) * 0.055);
              float density = abyssDensity + trailHaze;

              if (density > 0.0001) {
                float lit = sampleSunShadow(pos);
                vec3 sampleLight = mix(coldShadowFog, litShaftCol + mieCoronaCol * mie, lit);
                float stepExt = density * stepLen;
                float stepTrans = exp(-stepExt);
                accumInscatter += transmittance * (1.0 - stepTrans) * sampleLight;
                transmittance *= stepTrans;
              }
            }

            // Preserve crisp sky/moon silhouette while bathing foreground architecture in light shafts
            float skyKeep = isSky ? 0.42 : 1.0;
            col = col * mix(1.0, transmittance, skyKeep) + accumInscatter * skyKeep;
          }
          #endif

          gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
        }
      `,
    });

    this.quad = new FullScreenQuad(this.material);
  }

  public setSteps(steps: number) {
    const next = Math.max(0, Math.floor(steps));
    if (this.material.defines.VOL_STEPS !== next) {
      this.material.defines.VOL_STEPS = next;
      this.material.needsUpdate = true;
    }
  }

  public setSunLight(sun: THREE.DirectionalLight) {
    this.sunLight = sun;
  }

  public override render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget
  ) {
    const u = this.material.uniforms;
    u.tDiffuse.value = this.sceneTexture ?? readBuffer.texture;

    this._viewProj.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this._invViewProj.copy(this._viewProj).invert();
    u.uInvViewProj.value.copy(this._invViewProj);
    u.uInvProjection.value.copy(this.camera.projectionMatrixInverse);
    u.uCameraPos.value.copy(this.camera.position);

    if (this.sunLight) {
      u.uSunDir.value
        .subVectors(this.sunLight.position, this.sunLight.target.position)
        .normalize();
      if (this.sunLight.shadow.map) {
        u.tShadow.value = this.sunLight.shadow.map.texture;
        u.uShadowMatrix.value.copy(this.sunLight.shadow.matrix);
        u.uHasShadow.value = 1;
      } else {
        u.uHasShadow.value = 0;
      }
    }

    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) renderer.clear();
    }
    this.quad.render(renderer);
  }

  public override dispose() {
    this.material.dispose();
    this.quad.dispose();
  }
}
