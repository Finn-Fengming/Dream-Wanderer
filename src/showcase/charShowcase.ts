import * as THREE from 'three';
import { ActionClipName, ArchetypeId, XianxiaCharacterRig } from '../entities/xianxiaRig';
import { SwordRibbonTrail } from '../vfx/combatVfx';
import { SoulsCamera } from '../camera/soulsCamera';

export class CharacterShowcaseStage {
  public group = new THREE.Group();
  private rigs: { id: ArchetypeId; label: string; rig: XianxiaCharacterRig; trail: SwordRibbonTrail | null; demoClips: ActionClipName[] }[] = [];
  private currentIdx = 0;
  private clipCycleIdx = 0;
  private clipTimer = 0;
  private keyLight: THREE.SpotLight;

  constructor(scene: THREE.Scene, camera: SoulsCamera, showcaseBar: HTMLElement) {
    this.group.position.set(0, 10.52, -63.0);
    scene.add(this.group);

    // Dedicated Rim & Key Portrait Lighting so close-up inspection shows every garment & blade detail
    this.keyLight = new THREE.SpotLight(0xfff2dd, 4.5, 18, Math.PI / 4, 0.45, 1.2);
    this.keyLight.position.set(2.2, 4.2, 3.8);
    this.keyLight.target.position.set(0, 1.2, 0);
    this.group.add(this.keyLight);
    this.group.add(this.keyLight.target);

    const specs: {
      id: ArchetypeId;
      label: string;
      coreCol: THREE.Color;
      edgeCol: THREE.Color;
      clips: ActionClipName[];
      demon?: boolean;
    }[] = [
      {
        id: 'tianhe',
        label: '云天河 (望舒剑+射日弓)',
        coreCol: new THREE.Color(1.2, 2.0, 2.5),
        edgeCol: new THREE.Color(0.2, 0.78, 1.45),
        clips: ['none', 'light1', 'light2', 'light3', 'skill_rush', 'skill_bow'],
      },
      {
        id: 'xuanxiao',
        label: '玄霄·二阶段 (羲和剑+焚天剑翼)',
        coreCol: new THREE.Color(2.4, 1.1, 0.3),
        edgeCol: new THREE.Color(1.6, 0.25, 0.08),
        clips: ['none', 'xx_combo1', 'xx_delaySlam', 'xx_roar', 'xx_dance'],
        demon: true,
      },
      {
        id: 'golem',
        label: '镇岳剑傀 (中庭精英)',
        coreCol: new THREE.Color(0.8, 1.9, 2.3),
        edgeCol: new THREE.Color(0.18, 0.65, 1.1),
        clips: ['none', 'heavy', 'xx_delaySlam'],
      },
      {
        id: 'cultivator',
        label: '琼华御剑修士 & 执剑弟子',
        coreCol: new THREE.Color(0.9, 1.8, 2.2),
        edgeCol: new THREE.Color(0.2, 0.65, 1.15),
        clips: ['none', 'light1', 'parry'],
      },
      {
        id: 'lingsha',
        label: '韩菱纱 & 柳梦璃 (回梦灵契)',
        coreCol: new THREE.Color(2.1, 0.7, 0.9),
        edgeCol: new THREE.Color(1.2, 0.2, 0.4),
        clips: ['none', 'light1', 'light2'],
      },
    ];

    for (const sp of specs) {
      const rig = new XianxiaCharacterRig(sp.id);
      if (sp.demon) {
        rig.setDemonWings(1.0);
      }
      rig.root.visible = false;
      this.group.add(rig.root);

      // Pair companion on stage for dual-character previews!
      if (sp.id === 'cultivator') {
        const partner = new XianxiaCharacterRig('disciple');
        partner.root.position.set(-1.35, 0, -0.35);
        partner.root.rotation.y = 0.28;
        partner.updateAnimation(0.016, 0, true);
        rig.root.add(partner.root);
      } else if (sp.id === 'lingsha') {
        const mengli = new XianxiaCharacterRig('mengli');
        mengli.root.position.set(-1.25, 0, -0.35);
        mengli.root.rotation.y = 0.25;
        mengli.updateAnimation(0.016, 0, true);
        rig.root.add(mengli.root);
      }

      const trail = rig.weapon ? new SwordRibbonTrail(scene, sp.coreCol, sp.edgeCol, 22) : null;
      this.rigs.push({ id: sp.id, label: sp.label, rig, trail, demoClips: sp.clips });
    }

    showcaseBar.classList.add('active');
    showcaseBar.innerHTML = `<span>【角色与神兵检验展台 ?show=chars】</span>`;
    this.rigs.forEach((entry, idx) => {
      const btn = document.createElement('button');
      btn.textContent = entry.label;
      btn.dataset.idx = String(idx);
      btn.onclick = () => this.selectCharacter(idx, camera, showcaseBar);
      showcaseBar.appendChild(btn);
    });

    const params = new URLSearchParams(window.location.search);
    const charParam = params.get('char');
    const foundIdx = charParam ? this.rigs.findIndex((r) => r.id === charParam) : 0;
    this.selectCharacter(Math.max(0, foundIdx), camera, showcaseBar);
  }

  public selectCharacter(idx: number, camera: SoulsCamera, showcaseBar: HTMLElement) {
    this.rigs.forEach((r, i) => {
      r.rig.root.visible = i === idx;
      r.trail?.clear();
    });
    this.currentIdx = idx;
    this.clipCycleIdx = 0;
    this.clipTimer = 0;

    const entry = this.rigs[idx];
    const isTall = entry.id === 'golem';
    const dist = isTall ? 5.2 : 3.45;
    const lookY = isTall ? 12.2 : 11.65;
    camera.setCustomShot(new THREE.Vector3(0.55, lookY + 0.55, -63.0 + dist), new THREE.Vector3(-0.15, lookY, -63.0));

    showcaseBar.querySelectorAll('button[data-idx]').forEach((b) => {
      b.classList.toggle('current', (b as HTMLElement).dataset.idx === String(idx));
    });
  }

  public update(dt: number, elapsed: number) {
    const entry = this.rigs[this.currentIdx];
    if (!entry) return;

    this.clipTimer += dt;
    const dur = entry.demoClips[this.clipCycleIdx] === 'none' ? 1.2 : 1.05;
    if (this.clipTimer >= dur) {
      this.clipTimer = 0;
      this.clipCycleIdx = (this.clipCycleIdx + 1) % entry.demoClips.length;
    }

    const clip = entry.demoClips[this.clipCycleIdx];
    entry.rig.activeClip = clip;
    entry.rig.clipProgress = clip === 'none' ? 0 : this.clipTimer / dur;
    entry.rig.root.rotation.y = Math.sin(elapsed * 0.55) * 0.42;
    entry.rig.updateAnimation(dt, 0, true);

    if (entry.trail && entry.rig.weapon && entry.rig.weapon.group.visible) {
      const bPos = new THREE.Vector3();
      const tPos = new THREE.Vector3();
      entry.rig.weapon.basePoint.getWorldPosition(bPos);
      entry.rig.weapon.tipPoint.getWorldPosition(tPos);
      const emitting = clip !== 'none' && clip !== 'skill_bow' && entry.rig.clipProgress > 0.2 && entry.rig.clipProgress < 0.78;
      entry.trail.update(dt, elapsed, bPos, tPos, emitting);
    }
  }
}
