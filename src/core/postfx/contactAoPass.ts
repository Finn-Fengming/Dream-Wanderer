import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';

/**
 * Half-Resolution Dual-Scale Horizon Screen-Space Contact AO + Depth-Aware Bilateral Blur.
 * Inspired by《Saltline》: uses only the existing scene DepthTexture (ZERO extra geometry passes!)
 * to ground every stair step, pillar base, roof eave, rock crevice, and character boot sole.
 */
export class ContactAOPass extends Pass {
  public rawTarget: THREE.WebGLRenderTarget;
  public blurTarget: THREE.WebGLRenderTarget;
  private rawMat: THREE.ShaderMaterial;
  private blurMat: THREE.ShaderMaterial;
  private rawQuad: FullScreenQuad;
  private blurQuad: FullScreenQuad;
  private camera: THREE.PerspectiveCamera;
  private disposed = false;

  constructor(camera: THREE.PerspectiveCamera, samples = 10) {
    super();
    this.needsSwap = false;
    this.camera = camera;

    const rtOpts: THREE.RenderTargetOptions = {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
    };
    this.rawTarget = new THREE.WebGLRenderTarget(1, 1, rtOpts);
    this.blurTarget = new THREE.WebGLRenderTarget(1, 1, rtOpts);

    this.rawMat = new THREE.ShaderMaterial({
      defines: { AO_TAPS: Math.max(4, Math.floor(samples)) },
      uniforms: {
        tDepth: { value: null },
        uInvProjection: { value: new THREE.Matrix4() },
        uTexel: { value: new THREE.Vector2(1, 1) },
        uProjectionY: { value: 1 },
        uAspect: { value: 1 },
        uMicroRadius: { value: 0.42 },
        uMacroRadius: { value: 1.55 },
        uIntensity: { value: 1.08 },
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
        uniform sampler2D tDepth;
        uniform mat4 uInvProjection;
        uniform vec2 uTexel;
        uniform float uProjectionY;
        uniform float uAspect;
        uniform float uMicroRadius;
        uniform float uMacroRadius;
        uniform float uIntensity;
        varying vec2 vUv;

        vec3 viewPosAt(vec2 uv) {
          float d = texture2D(tDepth, uv).r;
          vec4 clip = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
          vec4 view = uInvProjection * clip;
          return view.xyz / max(view.w, 1e-6);
        }

        void main() {
          float rawD = texture2D(tDepth, vUv).r;
          if (rawD >= 0.9999) {
            gl_FragColor = vec4(1.0, 1000.0, 0.0, 1.0);
            return;
          }

          vec3 p = viewPosAt(vUv);
          float z = -p.z;
          if (z < 0.08 || z > 125.0) {
            gl_FragColor = vec4(1.0, min(z, 1000.0), 0.0, 1.0);
            return;
          }

          // Silhouette-preserving view-space normal reconstruction (no dark edge halos!)
          vec3 pl = viewPosAt(vUv - vec2(uTexel.x, 0.0));
          vec3 pr = viewPosAt(vUv + vec2(uTexel.x, 0.0));
          vec3 pb = viewPosAt(vUv - vec2(0.0, uTexel.y));
          vec3 pt = viewPosAt(vUv + vec2(0.0, uTexel.y));
          vec3 dx = abs(pl.z - p.z) < abs(pr.z - p.z) ? (p - pl) : (pr - p);
          vec3 dy = abs(pb.z - p.z) < abs(pt.z - p.z) ? (p - pb) : (pt - p);
          vec3 n = normalize(cross(dx, dy) + vec3(0.0, 0.0, 1e-5));

          // Interleaved Gradient Noise (Jorge Jimenez)
          float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          float rot = ign * 6.2831853;

          float occMicro = 0.0;
          float occMacro = 0.0;

          float radUvMicro = clamp(uMicroRadius * uProjectionY / (2.0 * z), uTexel.y * 1.5, 0.075);
          float radUvMacro = clamp(uMacroRadius * uProjectionY / (2.0 * z), uTexel.y * 2.5, 0.14);

          for (int i = 0; i < AO_TAPS; i++) {
            float fi = (float(i) + 0.5) / float(AO_TAPS);
            float ang = float(i) * 2.3999632 + rot;
            vec2 dir = vec2(cos(ang) / uAspect, sin(ang)) * sqrt(fi);

            // Micro contact tap (boots, stone mortar joints, stair risers)
            vec2 uv1 = vUv + dir * radUvMicro;
            if (uv1.x > 0.0 && uv1.x < 1.0 && uv1.y > 0.0 && uv1.y < 1.0) {
              vec3 v1 = viewPosAt(uv1) - p;
              float d2 = dot(v1, v1);
              float dist1 = sqrt(max(d2, 1e-5));
              float w1 = max(0.0, 1.0 - d2 / (uMicroRadius * uMicroRadius));
              float h1 = max(0.0, dot(v1, n) / dist1 - (0.04 + 0.0015 * z) / dist1);
              occMicro += h1 * w1 * w1;
            }

            // Macro architectural crevice tap (pillar bases, eaves, cliff hollows)
            vec2 uv2 = vUv + dir * radUvMacro;
            if (uv2.x > 0.0 && uv2.x < 1.0 && uv2.y > 0.0 && uv2.y < 1.0) {
              vec3 v2 = viewPosAt(uv2) - p;
              float d2m = dot(v2, v2);
              float dist2 = sqrt(max(d2m, 1e-5));
              float w2 = max(0.0, 1.0 - d2m / (uMacroRadius * uMacroRadius));
              float h2 = max(0.0, dot(v2, n) / dist2 - (0.07 + 0.002 * z) / dist2);
              occMacro += h2 * w2 * w2;
            }
          }

          float totalOcc = (occMicro * 2.6 + occMacro * 1.85) / float(AO_TAPS);
          float distFade = 1.0 - smoothstep(65.0, 120.0, z);
          float ao = 1.0 - clamp(totalOcc * uIntensity, 0.0, 0.76) * distFade;
          gl_FragColor = vec4(ao, z, 0.0, 1.0);
        }
      `,
    });

    this.blurMat = new THREE.ShaderMaterial({
      uniforms: {
        tAoDepth: { value: null },
        uTexel: { value: new THREE.Vector2(1, 1) },
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
        uniform sampler2D tAoDepth;
        uniform vec2 uTexel;
        varying vec2 vUv;

        void main() {
          vec2 center = texture2D(tAoDepth, vUv).rg;
          float cAo = center.r;
          float cZ = center.g;
          if (cZ >= 999.0) {
            gl_FragColor = vec4(1.0, cZ, 0.0, 1.0);
            return;
          }

          float sumAo = cAo * 2.0;
          float sumW = 2.0;

          // 3x3 bilateral spatial-depth filter eliminates IGN stipple while keeping razor-sharp edges
          for (int x = -1; x <= 1; x++) {
            for (int y = -1; y <= 1; y++) {
              if (x == 0 && y == 0) continue;
              vec2 off = vec2(float(x), float(y)) * uTexel * 1.35;
              vec2 s = texture2D(tAoDepth, vUv + off).rg;
              float dz = abs(s.g - cZ) / max(0.25, cZ * 0.06);
              float w = exp(-dz * dz * 2.5) * (x == 0 || y == 0 ? 1.0 : 0.7);
              sumAo += s.r * w;
              sumW += w;
            }
          }

          gl_FragColor = vec4(sumAo / sumW, cZ, 0.0, 1.0);
        }
      `,
    });

    this.rawQuad = new FullScreenQuad(this.rawMat);
    this.blurQuad = new FullScreenQuad(this.blurMat);
  }

  public setSamples(samples: number) {
    const next = Math.max(4, Math.floor(samples));
    if (this.rawMat.defines.AO_TAPS !== next) {
      this.rawMat.defines.AO_TAPS = next;
      this.rawMat.needsUpdate = true;
    }
  }

  public override setSize(width: number, height: number) {
    const w = Math.max(1, Math.ceil(width * 0.5));
    const h = Math.max(1, Math.ceil(height * 0.5));
    this.rawTarget.setSize(w, h);
    this.blurTarget.setSize(w, h);
    this.rawMat.uniforms.uTexel.value.set(1 / w, 1 / h);
    this.blurMat.uniforms.uTexel.value.set(1 / w, 1 / h);
  }

  public renderAo(renderer: THREE.WebGLRenderer, depthTexture: THREE.Texture) {
    const u = this.rawMat.uniforms;
    u.tDepth.value = depthTexture;
    u.uInvProjection.value.copy(this.camera.projectionMatrixInverse);
    u.uProjectionY.value = this.camera.projectionMatrix.elements[5];
    u.uAspect.value = this.camera.aspect;

    renderer.setRenderTarget(this.rawTarget);
    this.rawQuad.render(renderer);

    this.blurMat.uniforms.tAoDepth.value = this.rawTarget.texture;
    renderer.setRenderTarget(this.blurTarget);
    this.blurQuad.render(renderer);
  }

  public get texture(): THREE.Texture {
    return this.blurTarget.texture;
  }

  public override dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.rawTarget.dispose();
    this.blurTarget.dispose();
    this.rawMat.dispose();
    this.blurMat.dispose();
    this.rawQuad.dispose();
    this.blurQuad.dispose();
  }
}
