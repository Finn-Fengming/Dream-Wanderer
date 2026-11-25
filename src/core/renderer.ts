import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { QualityConfig } from './quality';

const QionghuaGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uDemonFactor: { value: 0 },
    uHurtFlash: { value: 0 },
    uFrostEdge: { value: 0 },
    uVignette: { value: 0.22 },
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

    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 col = tex.rgb;

      // Anime-Realistic Vibrance Boost (lifts mid-saturation colors while protecting skin & highlights)
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      float sat = max(col.r, max(col.g, col.b)) - min(col.r, min(col.g, col.b));
      col = mix(vec3(luma), col, 1.0 + (1.0 - sat) * 0.20);

      // Split-toning: Cerulean-jade shadows & warm golden-peach highlights
      vec3 coldShadow = mix(vec3(0.93, 0.98, 1.06), vec3(1.08, 0.89, 0.91), uDemonFactor);
      vec3 warmHigh   = mix(vec3(1.03, 1.00, 0.96), vec3(1.10, 0.95, 0.86), uDemonFactor);
      col *= mix(coldShadow, warmHigh, smoothstep(0.14, 0.82, luma));

      // Gentle framing vignette & combat feedback
      vec2 centered = vUv - 0.5;
      float distSq = dot(centered, centered) * 2.1;
      col *= 1.0 - distSq * uVignette;

      float edgeMask = smoothstep(0.22, 0.85, distSq);
      col = mix(col, vec3(0.82, 0.08, 0.06), edgeMask * uHurtFlash * 0.65);
      col = mix(col, vec3(0.45, 0.85, 1.0), edgeMask * uFrostEdge * 0.35);

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), tex.a);
    }
  `,
};

export class GameRenderer {
  public renderer: THREE.WebGLRenderer;
  public composer: EffectComposer;
  public renderPass: RenderPass;
  public bloomPass: UnrealBloomPass;
  public gradePass: ShaderPass;
  public quality: QualityConfig;

  constructor(container: HTMLElement, scene: THREE.Scene, camera: THREE.PerspectiveCamera, quality: QualityConfig) {
    this.quality = quality;

    this.renderer = new THREE.WebGLRenderer({
      antialias: !quality.bloomEnabled,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(quality.pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // Balanced 1.02 exposure prevents white blowout on anime faces, snow, and marble!
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.info.autoReset = false;

    container.appendChild(this.renderer.domElement);

    // Hardware 4x MSAA directly on RenderTarget (eliminates 3-pass SMAAPass fill-rate overhead!)
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

    // Half-res Bloom with higher 1.15 threshold so only true HDR runes/blades/lanterns glow
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(Math.floor(window.innerWidth * 0.5), Math.floor(window.innerHeight * 0.5)),
      quality.bloomStrength * 0.85,
      0.48,
      1.15
    );
    this.bloomPass.enabled = quality.bloomEnabled;
    this.composer.addPass(this.bloomPass);

    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);

    this.gradePass = new ShaderPass(QionghuaGradeShader);
    this.composer.addPass(this.gradePass);

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
    this.bloomPass.strength = q.bloomStrength * 0.85;

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
    this.renderer.info.reset();
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
