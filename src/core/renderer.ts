import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { QualityConfig } from './quality';
import { ContactAOPass } from './postfx/contactAoPass';
import { VolumetricAtmospherePass } from './postfx/volumetricAtmospherePass';
import { FinalCompositePass } from './postfx/finalCompositePass';

export class GameRenderer {
  public renderer: THREE.WebGLRenderer;
  public sceneRT: THREE.WebGLRenderTarget;
  public aoPass: ContactAOPass;
  public volPass: VolumetricAtmospherePass;
  public composer: EffectComposer;
  public bloomPass: UnrealBloomPass;
  public finalPass: FinalCompositePass;
  public quality: QualityConfig;

  constructor(
    container: HTMLElement,
    _scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    quality: QualityConfig
  ) {
    this.quality = quality;

    this.renderer = new THREE.WebGLRenderer({
      antialias: false, // Handled cleanly in display space by FinalCompositePass FXAA + CAS!
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(quality.pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Linear HDR pipeline: FinalCompositePass executes AgX/ACES hybrid tone mapping + sRGB encode!
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.info.autoReset = false;

    container.appendChild(this.renderer.domElement);

    const bufW = Math.max(1, Math.floor(window.innerWidth * quality.pixelRatio));
    const bufH = Math.max(1, Math.floor(window.innerHeight * quality.pixelRatio));

    const depthTexture = new THREE.DepthTexture(bufW, bufH);
    depthTexture.type = THREE.UnsignedIntType;
    depthTexture.minFilter = THREE.NearestFilter;
    depthTexture.magFilter = THREE.NearestFilter;

    this.sceneRT = new THREE.WebGLRenderTarget(bufW, bufH, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      depthTexture,
    });

    this.aoPass = new ContactAOPass(camera, quality.aoSamples || 8);
    this.aoPass.setSize(bufW, bufH);

    this.volPass = new VolumetricAtmospherePass(camera, quality.volumetricSteps);

    const compRT = new THREE.WebGLRenderTarget(bufW, bufH, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
    });
    this.composer = new EffectComposer(this.renderer, compRT);
    this.composer.setPixelRatio(quality.pixelRatio);
    this.composer.setSize(window.innerWidth, window.innerHeight);

    this.composer.addPass(this.volPass);

    // Controlled HDR Bloom: threshold 1.05 ensures snow/stone never wash out while lanterns/blades glow!
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(Math.max(1, Math.floor(bufW * 0.5)), Math.max(1, Math.floor(bufH * 0.5))),
      quality.bloomStrength,
      0.56,
      1.05
    );
    this.bloomPass.enabled = quality.bloomEnabled;
    this.composer.addPass(this.bloomPass);

    this.finalPass = new FinalCompositePass(quality.sharpness);
    this.finalPass.setSize(bufW, bufH);
    this.composer.addPass(this.finalPass);

    window.addEventListener('resize', () => this.onResize(camera));
  }

  public bindSunLight(sun: THREE.DirectionalLight) {
    this.volPass.setSunLight(sun);
  }

  public applyQuality(q: QualityConfig, sunLight?: THREE.DirectionalLight) {
    this.quality = q;
    localStorage.setItem('huimeng.quality.v4', q.tier);

    this.renderer.setPixelRatio(q.pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    const bufW = Math.max(1, Math.floor(window.innerWidth * q.pixelRatio));
    const bufH = Math.max(1, Math.floor(window.innerHeight * q.pixelRatio));

    this.sceneRT.setSize(bufW, bufH);
    this.aoPass.setSamples(q.aoSamples || 6);
    this.aoPass.setSize(bufW, bufH);
    this.volPass.setSteps(q.volumetricSteps);

    this.composer.setPixelRatio(q.pixelRatio);
    this.composer.setSize(window.innerWidth, window.innerHeight);

    this.bloomPass.enabled = q.bloomEnabled;
    this.bloomPass.strength = q.bloomStrength;
    this.finalPass.uniforms.uSharpness.value = q.sharpness;
    this.finalPass.setSize(bufW, bufH);

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
    const bufW = Math.max(1, Math.floor(w * this.quality.pixelRatio));
    const bufH = Math.max(1, Math.floor(h * this.quality.pixelRatio));

    this.sceneRT.setSize(bufW, bufH);
    this.aoPass.setSize(bufW, bufH);
    this.composer.setSize(w, h);
    this.finalPass.setSize(bufW, bufH);
  }

  public render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, elapsed: number) {
    this.renderer.info.reset();

    // 1. Render scene once into HalfFloat RT + DepthTexture
    this.renderer.setRenderTarget(this.sceneRT);
    this.renderer.clear();
    this.renderer.render(scene, camera);

    // 2. Compute half-resolution Horizon Contact AO from scene DepthTexture
    const depthTex = this.sceneRT.depthTexture!;
    if (this.quality.aoEnabled) {
      this.aoPass.renderAo(this.renderer, depthTex);
    }

    // 3. Feed scene HDR + Depth + ContactAO into VolumetricAtmospherePass -> Bloom -> FinalCompositePass
    this.volPass.sceneTexture = this.sceneRT.texture;
    const vu = this.volPass.material.uniforms;
    vu.tDepth.value = depthTex;
    vu.tAo.value = this.aoPass.texture;
    vu.uAoEnabled.value = this.quality.aoEnabled ? 1 : 0;
    vu.uVolEnabled.value = this.quality.volumetricFog ? 1 : 0;
    vu.uTime.value = elapsed;

    const fu = this.finalPass.uniforms;
    fu.uTime.value = elapsed;
    fu.uHurtFlash.value *= 0.90;
    fu.uFrostEdge.value *= 0.94;

    this.composer.render();
  }

  public flashHurt(intensity = 0.85) {
    this.finalPass.uniforms.uHurtFlash.value = Math.max(
      this.finalPass.uniforms.uHurtFlash.value,
      intensity
    );
  }

  public flashFrost(intensity = 0.7) {
    this.finalPass.uniforms.uFrostEdge.value = Math.max(
      this.finalPass.uniforms.uFrostEdge.value,
      intensity
    );
  }

  public setDemonFactor(factor: number) {
    const f = THREE.MathUtils.clamp(factor, 0, 1);
    this.volPass.material.uniforms.uDemonFactor.value = f;
    this.finalPass.uniforms.uDemonFactor.value = f;
  }
}
