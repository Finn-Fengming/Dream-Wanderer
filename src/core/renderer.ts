import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { QualityConfig } from './quality';

const QionghuaGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uDemonFactor: { value: 0 }, // 0 = Luminous Kunlun Jade & Golden-Rose Dawn/Dusk, 1 = Crimson Solar Eclipse
    uHurtFlash: { value: 0 },
    uFrostEdge: { value: 0 },
    uVignette: { value: 0.24 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uDemonFactor;
    uniform float uHurtFlash;
    uniform float uFrostEdge;
    uniform float uVignette;
    varying vec2 vUv;

    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 col = tex.rgb;

      // Anime-Realistic Vibrance Boost (lifts muted mid-saturation colors while protecting skin & highlights)
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      float maxC = max(col.r, max(col.g, col.b));
      float minC = min(col.r, min(col.g, col.b));
      float sat = maxC - minC;
      col = mix(vec3(luma), col, 1.0 + (1.0 - sat) * 0.18);

      // Split-toning: Luminous cerulean-jade shadows & warm golden-peach sky/sun highlights
      vec3 coldShadow = mix(vec3(0.94, 0.99, 1.06), vec3(1.08, 0.89, 0.91), uDemonFactor);
      vec3 warmHigh   = mix(vec3(1.04, 1.01, 0.96), vec3(1.12, 0.95, 0.86), uDemonFactor);
      col *= mix(coldShadow, warmHigh, smoothstep(0.14, 0.82, luma));

      // Crisp anime cinema S-curve contrast without crushing shadow detail
      col = mix(col, smoothstep(0.0, 1.0, col), 0.08);

      // Gentle framing vignette
      vec2 centered = vUv - 0.5;
      float distSq = dot(centered, centered) * 2.1;
      col *= 1.0 - distSq * uVignette;

      // Hurt crimson pulse & Wangshu frost aura on screen edges
      float edgeMask = smoothstep(0.22, 0.85, distSq);
      col = mix(col, vec3(0.82, 0.08, 0.06), edgeMask * uHurtFlash * 0.65);
      col = mix(col, vec3(0.45, 0.85, 1.0), edgeMask * uFrostEdge * 0.35);

      // Subtle dithering grain to eliminate sky/cloud-sea gradient banding
      float grain = (hash12(vUv * 1024.0 + fract(uTime * 7.13)) - 0.5) * 0.008;
      col = clamp(col + grain, 0.0, 1.0);

      gl_FragColor = vec4(col, tex.a);
    }
  `,
};

export class GameRenderer {
  public renderer: THREE.WebGLRenderer;
  public composer: EffectComposer;
  public renderPass: RenderPass;
  public bloomPass: UnrealBloomPass;
  public smaaPass: SMAAPass;
  public gradePass: ShaderPass;
  public quality: QualityConfig;

  constructor(container: HTMLElement, scene: THREE.Scene, camera: THREE.PerspectiveCamera, quality: QualityConfig) {
    this.quality = quality;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(quality.pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    container.appendChild(this.renderer.domElement);

    const rt = new THREE.WebGLRenderTarget(
      Math.max(1, Math.floor(window.innerWidth * quality.pixelRatio)),
      Math.max(1, Math.floor(window.innerHeight * quality.pixelRatio)),
      {
        type: THREE.HalfFloatType,
        samples: quality.tier === 'low' ? 0 : 4,
      }
    );

    this.composer = new EffectComposer(this.renderer, rt);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    // Controlled HDR Bloom: threshold 1.08 keeps marble/snow/skin crisp while sword auras, lanterns & runes glow!
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      quality.bloomStrength * 0.88,
      0.52,
      1.08
    );
    this.bloomPass.enabled = quality.bloomEnabled;
    this.composer.addPass(this.bloomPass);

    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);

    this.gradePass = new ShaderPass(QionghuaGradeShader);
    this.composer.addPass(this.gradePass);

    this.smaaPass = new SMAAPass(
      Math.max(1, Math.floor(window.innerWidth * quality.pixelRatio)),
      Math.max(1, Math.floor(window.innerHeight * quality.pixelRatio))
    );
    this.smaaPass.enabled = quality.tier === 'high' || quality.tier === 'ultra';
    this.composer.addPass(this.smaaPass);

    window.addEventListener('resize', () => this.onResize(camera));
  }

  public applyQuality(q: QualityConfig, sunLight?: THREE.DirectionalLight) {
    this.quality = q;
    localStorage.setItem('huimeng.quality.v1', q.tier);
    this.renderer.setPixelRatio(q.pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setPixelRatio(q.pixelRatio);
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.bloomPass.enabled = q.bloomEnabled;
    this.bloomPass.strength = q.bloomStrength * 0.88;
    this.smaaPass.enabled = q.tier === 'high' || q.tier === 'ultra';

    if (sunLight && sunLight.shadow.mapSize.x !== q.shadowMapSize) {
      sunLight.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
      sunLight.shadow.map?.dispose();
      sunLight.shadow.map = null;
    }
  }

  public onResize(camera: THREE.PerspectiveCamera) {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }

  public render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, elapsed: number) {
    this.gradePass.uniforms.uTime.value = elapsed;
    this.gradePass.uniforms.uHurtFlash.value *= 0.9;
    this.gradePass.uniforms.uFrostEdge.value *= 0.94;

    if (this.quality.bloomEnabled) {
      this.renderPass.scene = scene;
      this.renderPass.camera = camera;
      this.composer.render();
    } else {
      this.renderer.render(scene, camera);
    }
  }

  public flashHurt(intensity = 0.85) {
    this.gradePass.uniforms.uHurtFlash.value = Math.max(this.gradePass.uniforms.uHurtFlash.value, intensity);
  }

  public flashFrost(intensity = 0.7) {
    this.gradePass.uniforms.uFrostEdge.value = Math.max(this.gradePass.uniforms.uFrostEdge.value, intensity);
  }

  public setDemonFactor(factor: number) {
    this.gradePass.uniforms.uDemonFactor.value = THREE.MathUtils.clamp(factor, 0, 1);
  }
}
