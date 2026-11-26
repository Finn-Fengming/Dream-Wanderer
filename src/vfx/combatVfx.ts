import * as THREE from 'three';

const RibbonTrailShader = {
  uniforms: {
    uColorCore: { value: new THREE.Color(1.4, 2.1, 2.5) },
    uColorEdge: { value: new THREE.Color(0.18, 0.72, 1.35) },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */ `
    attribute float aAge; // 0 = newest head, 1 = oldest tail
    varying vec2 vUv;
    varying float vAge;
    void main() {
      vUv = uv;
      vAge = aAge;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uColorCore;
    uniform vec3 uColorEdge;
    uniform float uTime;
    varying vec2 vUv;
    varying float vAge;

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
      // vUv.y: 0 = blade base (guard), 1 = blade tip (outer bright edge!)
      float outerBright = pow(smoothstep(0.12, 0.98, vUv.y), 1.65);
      float tipTaper = smoothstep(0.0, 0.08, vAge) * smoothstep(1.0, 0.12, vAge);

      // Scrolling noise streaks & erosion as trail ages
      float streak = noise(vec2(vAge * 9.0 - uTime * 8.5, vUv.y * 14.0));
      float erode = smoothstep(vAge * 0.88, vAge * 0.88 + 0.25, streak + outerBright * 0.45);

      // Dual-layer noise-eroded Xianxia sword arc: bright outer frost/solar edge + dark ink-jade wake,
      // strictly capped <= 2.15 HDR peak so Bloom glows vibrantly without clipping to flat white!
      vec3 col = min(mix(uColorEdge, uColorCore, pow(outerBright, 2.0)), vec3(2.15));
      float alpha = outerBright * tipTaper * erode * 0.92;
      if (alpha < 0.02) discard;

      gl_FragColor = vec4(col, alpha);
    }
  `,
};

export class SwordRibbonTrail {
  public mesh: THREE.Mesh;
  private maxSamples: number;
  private historyBase: THREE.Vector3[] = [];
  private historyTip: THREE.Vector3[] = [];
  private historyAge: number[] = [];
  private positions: Float32Array;
  private ages: Float32Array;
  private mat: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene, coreColor: THREE.Color, edgeColor: THREE.Color, maxSamples = 22) {
    this.maxSamples = maxSamples;
    const vertCount = maxSamples * 2;
    this.positions = new Float32Array(vertCount * 3);
    this.ages = new Float32Array(vertCount);
    const uvs = new Float32Array(vertCount * 2);
    const indices: number[] = [];

    for (let i = 0; i < maxSamples; i++) {
      uvs[i * 4 + 0] = i / (maxSamples - 1);
      uvs[i * 4 + 1] = 0;
      uvs[i * 4 + 2] = i / (maxSamples - 1);
      uvs[i * 4 + 3] = 1;

      if (i < maxSamples - 1) {
        const a = i * 2;
        const b = i * 2 + 1;
        const c = (i + 1) * 2;
        const d = (i + 1) * 2 + 1;
        indices.push(a, b, c);
        indices.push(b, d, c);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setAttribute('aAge', new THREE.BufferAttribute(this.ages, 1));
    geo.setIndex(indices);

    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uColorCore: { value: coreColor.clone() },
        uColorEdge: { value: edgeColor.clone() },
        uTime: { value: 0 },
      },
      vertexShader: RibbonTrailShader.vertexShader,
      fragmentShader: RibbonTrailShader.fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  public setColors(coreColor: THREE.Color, edgeColor: THREE.Color) {
    this.mat.uniforms.uColorCore.value.copy(coreColor);
    this.mat.uniforms.uColorEdge.value.copy(edgeColor);
  }

  public update(dt: number, elapsed: number, baseWorld: THREE.Vector3, tipWorld: THREE.Vector3, emitting: boolean) {
    this.mat.uniforms.uTime.value = elapsed;

    // Age existing samples
    const lifetime = 0.21;
    for (let i = this.historyAge.length - 1; i >= 0; i--) {
      this.historyAge[i] += dt / lifetime;
      if (this.historyAge[i] >= 1.0) {
        this.historyBase.splice(i, 1);
        this.historyTip.splice(i, 1);
        this.historyAge.splice(i, 1);
      }
    }

    if (emitting) {
      // Subdivide with Catmull-like midpoint if moving very fast so the slash arc is silky smooth!
      if (this.historyTip.length > 0) {
        const prevB = this.historyBase[0];
        const prevT = this.historyTip[0];
        if (prevT.distanceToSquared(tipWorld) > 0.16) {
          this.historyBase.unshift(new THREE.Vector3().lerpVectors(prevB, baseWorld, 0.5));
          this.historyTip.unshift(new THREE.Vector3().lerpVectors(prevT, tipWorld, 0.5));
          this.historyAge.unshift(0.02);
        }
      }
      this.historyBase.unshift(baseWorld.clone());
      this.historyTip.unshift(tipWorld.clone());
      this.historyAge.unshift(0);

      while (this.historyBase.length > this.maxSamples) {
        this.historyBase.pop();
        this.historyTip.pop();
        this.historyAge.pop();
      }
    }

    if (this.historyBase.length < 2) {
      this.mesh.visible = false;
      return;
    }

    this.mesh.visible = true;
    const n = this.historyBase.length;
    for (let i = 0; i < this.maxSamples; i++) {
      const idx = Math.min(i, n - 1);
      const b = this.historyBase[idx];
      const t = this.historyTip[idx];
      const age = i < n ? this.historyAge[idx] : 1.0;

      this.positions[i * 6 + 0] = b.x;
      this.positions[i * 6 + 1] = b.y;
      this.positions[i * 6 + 2] = b.z;

      this.positions[i * 6 + 3] = t.x;
      this.positions[i * 6 + 4] = t.y;
      this.positions[i * 6 + 5] = t.z;

      this.ages[i * 2 + 0] = age;
      this.ages[i * 2 + 1] = age;
    }

    this.mesh.geometry.attributes.position.needsUpdate = true;
    (this.mesh.geometry.attributes.aAge as THREE.BufferAttribute).needsUpdate = true;
  }

  public clear() {
    this.historyBase.length = 0;
    this.historyTip.length = 0;
    this.historyAge.length = 0;
    this.mesh.visible = false;
  }
}

interface TransientRing {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  age: number;
  duration: number;
  startR: number;
  endR: number;
  isDamageWave?: boolean;
  waveCenter?: THREE.Vector3;
  waveSpeed?: number;
  waveDamage?: number;
  hitPlayerAlready?: boolean;
}

interface SparkParticle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  color: THREE.Color;
  age: number;
  life: number;
}

export interface CombatProjectile {
  id: number;
  fromPlayer: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  damage: number;
  poiseDamage: number;
  radius: number;
  life: number;
  mesh: THREE.Group;
  deflectable: boolean;
}

export class CombatVfxManager {
  public scene: THREE.Scene;
  public rings: TransientRing[] = [];
  public projectiles: CombatProjectile[] = [];
  public delayedBursts: {
    pos: THREE.Vector3;
    timer: number;
    radius: number;
    damage: number;
    poiseDamage: number;
    fromPlayer: boolean;
    isFire: boolean;
    marker: THREE.Mesh;
  }[] = [];

  private sparks: SparkParticle[] = [];
  private sparkPoints: THREE.Points;
  private sparkPositions: Float32Array;
  private sparkColors: Float32Array;
  private maxSparks = 280;
  private nextProjId = 1;
  private runeRingTex: THREE.Texture;

  constructor(scene: THREE.Scene, glowTex: THREE.Texture, runeRingTex: THREE.Texture) {
    this.scene = scene;
    this.runeRingTex = runeRingTex;

    const geo = new THREE.BufferGeometry();
    this.sparkPositions = new Float32Array(this.maxSparks * 3);
    this.sparkColors = new Float32Array(this.maxSparks * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.sparkPositions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.sparkColors, 3));

    const mat = new THREE.PointsMaterial({
      map: glowTex,
      size: 0.26,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.sparkPoints = new THREE.Points(geo, mat);
    this.sparkPoints.frustumCulled = false;
    this.scene.add(this.sparkPoints);
  }

  /** Spawns directional sparks flying along the slash direction (per combat-feel guide!) */
  public spawnHitSparks(origin: THREE.Vector3, dir: THREE.Vector3, count: number, color: THREE.Color) {
    const baseDir = dir.lengthSq() > 0.001 ? dir.clone().normalize() : new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < count; i++) {
      if (this.sparks.length >= this.maxSparks) this.sparks.shift();
      const spread = new THREE.Vector3(
        (Math.random() - 0.5) * 1.1,
        Math.random() * 0.9 + 0.15,
        (Math.random() - 0.5) * 1.1
      );
      const speed = 3.5 + Math.random() * 6.5;
      this.sparks.push({
        pos: origin.clone(),
        vel: baseDir.clone().add(spread).normalize().multiplyScalar(speed),
        color: color.clone(),
        age: 0,
        life: 0.22 + Math.random() * 0.24,
      });
    }
  }

  /** Expanding ground shockwave ring — can be purely visual OR a real Jump-Dodgeable Boss/Elite shockwave! */
  public spawnShockwaveRing(
    center: THREE.Vector3,
    startR: number,
    endR: number,
    duration: number,
    color: THREE.Color,
    damageIfGrounded = 0
  ) {
    const mat = new THREE.MeshBasicMaterial({
      color: color.clone(),
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.84, 1.0, 48), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(center.x, center.y + 0.08, center.z);
    mesh.scale.setScalar(startR);
    this.scene.add(mesh);

    this.rings.push({
      mesh,
      mat,
      age: 0,
      duration,
      startR,
      endR,
      isDamageWave: damageIfGrounded > 0,
      waveCenter: center.clone(),
      waveDamage: damageIfGrounded,
      hitPlayerAlready: false,
    });
  }

  /** Spawns a delayed frost or hellfire ground rune burst (e.g.【狂龙迅影斩】or Xuanxiao Phase 2 trails) */
  public spawnDelayedGroundBurst(
    pos: THREE.Vector3,
    delay: number,
    radius: number,
    damage: number,
    poiseDamage: number,
    fromPlayer: boolean,
    isFire: boolean
  ) {
    const mat = new THREE.MeshBasicMaterial({
      map: this.runeRingTex,
      color: isFire ? new THREE.Color(2.1, 0.52, 0.14) : new THREE.Color(0.45, 1.65, 2.35),
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const marker = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), mat);
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(pos.x, pos.y + 0.06, pos.z);
    this.scene.add(marker);

    this.delayedBursts.push({
      pos: pos.clone(),
      timer: delay,
      radius,
      damage,
      poiseDamage,
      fromPlayer,
      isFire,
      marker,
    });
  }

  /** Spawns Flying Sword Qi, Konghou Spirit Bolt, or Yun Tianhe's【恸天贯日式】Solar Arrow! */
  public spawnProjectile(
    origin: THREE.Vector3,
    vel: THREE.Vector3,
    damage: number,
    poiseDamage: number,
    fromPlayer: boolean,
    style: 'frost_sword' | 'solar_arrow' | 'xihe_sword' | 'spirit_note'
  ) {
    const g = new THREE.Group();
    g.position.copy(origin);

    const col =
      style === 'solar_arrow'
        ? new THREE.Color(2.4, 1.05, 0.22)
        : style === 'xihe_sword'
          ? new THREE.Color(2.15, 0.45, 0.14)
          : style === 'spirit_note'
            ? new THREE.Color(1.45, 1.05, 2.25)
            : new THREE.Color(0.45, 1.65, 2.35);

    const mat = new THREE.MeshBasicMaterial({
      color: col,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
    });

    const len = style === 'solar_arrow' ? 2.4 : 1.35;
    const thickness = style === 'solar_arrow' ? 0.09 : 0.055;
    const shaft = new THREE.Mesh(new THREE.ConeGeometry(thickness, len, 6), mat);
    shaft.rotation.x = Math.PI / 2;
    g.add(shaft);

    if (style === 'solar_arrow') {
      const halo = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.36, 20), mat);
      g.add(halo);
    }

    const targetLook = origin.clone().add(vel);
    g.lookAt(targetLook);
    this.scene.add(g);

    this.projectiles.push({
      id: this.nextProjId++,
      fromPlayer,
      pos: origin.clone(),
      vel: vel.clone(),
      damage,
      poiseDamage,
      radius: style === 'solar_arrow' ? 0.65 : 0.38,
      life: 3.4,
      mesh: g,
      deflectable: !fromPlayer,
    });
  }

  public update(
    dt: number,
    onBurstTrigger?: (b: CombatVfxManager['delayedBursts'][number]) => void
  ) {
    // 1. Update Sparks
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const sp = this.sparks[i];
      sp.age += dt;
      if (sp.age >= sp.life) {
        this.sparks.splice(i, 1);
        continue;
      }
      sp.vel.y -= 12.5 * dt;
      sp.pos.addScaledVector(sp.vel, dt);
    }

    this.sparkPositions.fill(0);
    this.sparkColors.fill(0);
    for (let i = 0; i < this.sparks.length; i++) {
      const sp = this.sparks[i];
      const fade = 1 - sp.age / sp.life;
      this.sparkPositions[i * 3 + 0] = sp.pos.x;
      this.sparkPositions[i * 3 + 1] = sp.pos.y;
      this.sparkPositions[i * 3 + 2] = sp.pos.z;
      this.sparkColors[i * 3 + 0] = sp.color.r * fade;
      this.sparkColors[i * 3 + 1] = sp.color.g * fade;
      this.sparkColors[i * 3 + 2] = sp.color.b * fade;
    }
    this.sparkPoints.geometry.attributes.position.needsUpdate = true;
    this.sparkPoints.geometry.attributes.color.needsUpdate = true;

    // 2. Update Expanding Rings
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.age += dt;
      const u = THREE.MathUtils.clamp(r.age / r.duration, 0, 1);
      const curR = THREE.MathUtils.lerp(r.startR, r.endR, 1 - Math.pow(1 - u, 2));
      r.mesh.scale.setScalar(curR);
      r.mat.opacity = (1 - u) * 0.9;
      if (r.age >= r.duration) {
        this.scene.remove(r.mesh);
        r.mesh.geometry.dispose();
        r.mat.dispose();
        this.rings.splice(i, 1);
      }
    }

    // 3. Update Delayed Ground Rune Bursts
    for (let i = this.delayedBursts.length - 1; i >= 0; i--) {
      const b = this.delayedBursts[i];
      b.timer -= dt;
      b.marker.rotation.z += dt * 3.5;
      const pulse = 1.0 + Math.sin(b.timer * 24) * 0.06;
      b.marker.scale.setScalar(pulse);

      if (b.timer <= 0) {
        // Trigger icy/fiery pillar burst!
        const col = b.isFire ? new THREE.Color(2.2, 0.55, 0.14) : new THREE.Color(0.5, 1.85, 2.45);
        this.spawnHitSparks(b.pos.clone().add(new THREE.Vector3(0, 0.4, 0)), new THREE.Vector3(0, 1, 0), 26, col);
        this.spawnShockwaveRing(b.pos, 0.4, b.radius * 1.15, 0.34, col, 0);
        onBurstTrigger?.(b);

        this.scene.remove(b.marker);
        b.marker.geometry.dispose();
        (b.marker.material as THREE.Material).dispose();
        this.delayedBursts.splice(i, 1);
      }
    }

    // 4. Update Projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      p.pos.addScaledVector(p.vel, dt);
      p.mesh.position.copy(p.pos);
      if (p.life <= 0) {
        this.removeProjectileAt(i);
      }
    }
  }

  public removeProjectileAt(idx: number) {
    const p = this.projectiles[idx];
    if (!p) return;
    this.scene.remove(p.mesh);
    this.projectiles.splice(idx, 1);
  }
}
