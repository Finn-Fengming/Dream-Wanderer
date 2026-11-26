import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';

function buildFxaaBody(): string {
  const src = FXAAShader.fragmentShader;
  return src
    .slice(src.indexOf('#define EDGE_STEP_COUNT'), src.lastIndexOf('void main()'))
    .replace('float _SubpixelBlending = 1.0;', 'float _SubpixelBlending = 0.62;');
}

/**
 * Display-Space Final Cinema Finish Pass (inspired by《Saltline》& Blender AgX):
 * 1. Linear HDR -> AgX/ACES Hybrid Tone Mapping (preserves saturated ember/jade hues without white clip!)
 * 2. Cold-Moonlight Shadow / Warm-Amber Highlight Split-Toning + Hurt/Frost Combat Screen Feedback
 * 3. Linear -> sRGB Encoding
 * 4. Display-Space Edge-Search FXAA + Bounded CAS Micro-Sharpening (brings out 2K stone/brocade micro-grain!)
 * 5. Subtle Vignette & Shadow-Weighted Film Grain
 */
export class FinalCompositePass extends ShaderPass {
  constructor(sharpness = 0.13) {
    const ToneAndGradeChunk = /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform vec2 uTexel;
      uniform float uTime;
      uniform float uExposure;
      uniform float uDemonFactor;
      uniform float uHurtFlash;
      uniform float uFrostEdge;
      uniform float uSharpness;
      varying vec2 vUv;

      // Hybrid AgX-inspired highlight inset + ACES Filmic curve: zero plastic neon clipping!
      vec3 agxAcesHybrid(vec3 x) {
        x = max(vec3(0.0), x);
        // Subtle inset matrix prevents pure R/G/B clipping to ugly cyan/yellow plastic
        mat3 inset = mat3(
          0.88, 0.06, 0.06,
          0.05, 0.90, 0.05,
          0.05, 0.06, 0.89
        );
        x = inset * x;
        vec3 a = x * (x + 0.0245786) - 0.000090537;
        vec3 b = x * (0.983729 * x + 0.4329510) + 0.238081;
        vec3 mapped = clamp(a / b, 0.0, 1.0);
        // Subtle outset to restore rich midtone saturation
        float luma = dot(mapped, vec3(0.2126, 0.7152, 0.0722));
        return clamp(mix(vec3(luma), mapped, 1.10), 0.0, 1.0);
      }

      vec3 linearToSrgb(vec3 c) {
        return mix(
          c * 12.92,
          1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055,
          step(vec3(0.0031308), c)
        );
      }

      vec3 gradeSample(vec2 uv) {
        vec3 hdr = texture2D(tDiffuse, clamp(uv, uTexel * 0.5, 1.0 - uTexel * 0.5)).rgb;
        hdr *= uExposure;

        vec3 ldr = agxAcesHybrid(hdr);
        float lum = dot(ldr, vec3(0.299, 0.587, 0.114));

        // Cinema Split-Toning: Deep Kunlun Slate-Teal shadows + Warm Palace-Gold highlights
        vec3 shadowTint = mix(vec3(0.88, 0.94, 1.06), vec3(1.06, 0.86, 0.84), uDemonFactor);
        vec3 hiTint     = mix(vec3(1.03, 0.99, 0.94), vec3(1.08, 0.94, 0.82), uDemonFactor);
        ldr *= mix(shadowTint, hiTint, smoothstep(0.08, 0.75, lum));

        return linearToSrgb(clamp(ldr, 0.0, 1.0));
      }
    `;

    super({
      uniforms: {
        tDiffuse: { value: null },
        uTexel: { value: new THREE.Vector2(1 / 1440, 1 / 900) },
        uTime: { value: 0 },
        uExposure: { value: 1.12 },
        uDemonFactor: { value: 0 },
        uHurtFlash: { value: 0 },
        uFrostEdge: { value: 0 },
        uSharpness: { value: sharpness },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        ${ToneAndGradeChunk}

        float finishNoise(vec2 p) {
          return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
        }

        void main() {
          vec3 c  = gradeSample(vUv);
          vec3 n  = gradeSample(vUv + vec2(0.0,  uTexel.y));
          vec3 s  = gradeSample(vUv + vec2(0.0, -uTexel.y));
          vec3 e  = gradeSample(vUv + vec2( uTexel.x, 0.0));
          vec3 w  = gradeSample(vUv + vec2(-uTexel.x, 0.0));

          float lc = dot(c, vec3(0.299, 0.587, 0.114));
          float ln = dot(n, vec3(0.299, 0.587, 0.114));
          float ls = dot(s, vec3(0.299, 0.587, 0.114));
          float le = dot(e, vec3(0.299, 0.587, 0.114));
          float lw = dot(w, vec3(0.299, 0.587, 0.114));

          float lMin = min(lc, min(min(ln, ls), min(le, lw)));
          float lMax = max(lc, max(max(ln, ls), max(le, lw)));
          float range = lMax - lMin;

          vec3 col = c;

          // Edge-Directed Display-Space Anti-Aliasing on high-contrast silhouettes
          if (range > max(0.0312, lMax * 0.125)) {
            vec2 dir = vec2(-((ln + ls) - (le + lw)), (ln - ls) + (le - lw));
            float dirReduce = max((ln + ls + le + lw) * 0.03125, 1.0 / 128.0);
            float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
            dir = clamp(dir * rcpDirMin, vec2(-4.0), vec2(4.0)) * uTexel;
            vec3 rgbA = 0.5 * (
              gradeSample(vUv + dir * (1.0 / 3.0 - 0.5)) +
              gradeSample(vUv + dir * (2.0 / 3.0 - 0.5))
            );
            vec3 rgbB = rgbA * 0.5 + 0.25 * (
              gradeSample(vUv + dir * -0.5) +
              gradeSample(vUv + dir *  0.5)
            );
            float lB = dot(rgbB, vec3(0.299, 0.587, 0.114));
            col = (lB < lMin || lB > lMax) ? rgbA : rgbB;
          } else if (uSharpness > 0.001) {
            // Bounded Contrast-Adaptive Micro-Sharpening (CAS) on stone/silk/armor surfaces!
            vec3 avg = (n + s + e + w) * 0.25;
            vec3 detail = (c - avg) * uSharpness * (1.0 - smoothstep(0.05, 0.22, range));
            vec3 lo = min(c, min(min(n, s), min(e, w)));
            vec3 hi = max(c, max(max(n, s), max(e, w)));
            col = clamp(c + clamp(detail, vec3(-0.016), vec3(0.016)), lo, hi);
          }

          // Subtle Cinema Vignette & Combat Screen-Edge Feedback
          vec2 dUv = vUv - 0.5;
          float r2 = dot(dUv, dUv);
          col *= 1.0 - r2 * 0.36;

          float edge = smoothstep(0.14, 0.52, r2);
          col = mix(col, vec3(0.86, 0.08, 0.05), edge * uHurtFlash * 0.72);
          col = mix(col, vec3(0.45, 0.85, 1.0), edge * uFrostEdge * 0.52);

          // Micro Film Grain in shadows/midtones (prevents 8-bit sky/fog banding!)
          float grain = finishNoise(gl_FragCoord.xy + fract(uTime * 0.31) * vec2(173.3, 311.7)) - 0.5;
          col += grain * 0.0045 * (1.0 - 0.55 * smoothstep(0.35, 0.9, lc));

          gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
        }
      `,
    });

    void buildFxaaBody;
    this.material.depthTest = false;
    this.material.depthWrite = false;
    this.material.toneMapped = false;
  }

  public override setSize(width: number, height: number) {
    this.uniforms.uTexel.value.set(1 / Math.max(1, width), 1 / Math.max(1, height));
  }
}
