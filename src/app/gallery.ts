/**
 * Developer gallery (`?gallery`): browse an unlimited sequence of generated
 * creatures and weapons on a stage in the live vale, with a luck control.
 * Creatures are not yet placed in the world — combat and AI arrive in
 * Milestone 5 — so this is where their generator can be seen and judged.
 */
import * as THREE from 'three';
import { hashInts } from '../core/rng';
import { MeshBuilder } from '../assets/geo';
import { buildCreature } from '../assets/creatureMesh';
import { buildWeapon } from '../assets/weaponMesh';
import { generateCreature, TIER_COLOURS, type CreatureGenome } from '../gameplay/creatures';
import { generateWeapon, type WeaponGenome } from '../gameplay/weapons';
import { RARITY_COLOURS } from '../gameplay/luck';
import type { MaterialLibrary } from '../rendering/materials';
import { patchMaterial } from '../rendering/atmosphere';
import type { WorldRuntime } from './worldRuntime';

export type GalleryMode = 'creatures' | 'weapons';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export class Gallery {
  readonly group = new THREE.Group();
  mode: GalleryMode = 'creatures';
  index = 0;
  luck = 0;
  current: CreatureGenome | WeaponGenome | null = null;
  readonly stage = new THREE.Vector3();
  private height = 2;
  private angle = 0;
  private readonly glow = new THREE.MeshBasicMaterial({ vertexColors: true });
  private readonly ghost = patchMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.58, depthWrite: false, emissive: new THREE.Color('#304060') }));
  private readonly panel = document.getElementById('gallery') as HTMLElement;

  constructor(
    private readonly world: WorldRuntime,
    private readonly materials: MaterialLibrary,
  ) {
    this.group.name = 'gallery';
    // Stage: an open, level patch of meadow beside the Vale Road.
    const road = world.plan.roads[0]!;
    const i = Math.floor(road.points.length * 0.3);
    const a = road.points[i]!;
    const b = road.points[i + 3]!;
    const nx = -(b.z - a.z);
    const nz = b.x - a.x;
    const l = Math.hypot(nx, nz) || 1;
    let best = { x: a.x + (nx / l) * 22, z: a.z + (nz / l) * 22, s: Infinity };
    for (const side of [1, -1]) {
      for (const d of [18, 24, 30, 36]) {
        const x = a.x + (nx / l) * d * side;
        const z = a.z + (nz / l) * d * side;
        const s = world.terrain.slope(x, z) + (world.ecology.blocked(x, z, 6) ? 10 : 0) + world.ecology.forestDensity(x, z) * 5;
        if (s < best.s) best = { x, z, s };
      }
    }
    this.stage.set(best.x, world.terrain.height(best.x, best.z), best.z);
    this.panel.hidden = false;
    this.panel.querySelectorAll<HTMLButtonElement>('[data-gallery]').forEach((btn) =>
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.action(btn.dataset.gallery!);
      }),
    );
    const luck = this.panel.querySelector<HTMLInputElement>('#gallery-luck')!;
    luck.addEventListener('input', () => {
      this.luck = Number(luck.value);
      this.show();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'ArrowRight') this.action('next');
      else if (e.code === 'ArrowLeft') this.action('prev');
      else if (e.code === 'KeyR') this.action('random');
      else if (e.code === 'Tab') {
        e.preventDefault();
        this.action(this.mode === 'creatures' ? 'weapons' : 'creatures');
      }
    });
    this.show();
  }

  action(a: string): void {
    if (a === 'next') this.index++;
    else if (a === 'prev') this.index--;
    // Picking *which* specimen to view may be random; each specimen itself is deterministic.
    else if (a === 'random') this.index = Math.floor(Math.random() * 1_000_000);
    else if (a === 'creatures' || a === 'weapons') this.mode = a;
    this.show();
  }

  /** Seed for the current index: browsing is unbounded in both directions. */
  private seed(): number {
    return hashInts(this.mode === 'creatures' ? 0xc2ea7 : 0x3ea90, this.index);
  }

  show(): void {
    for (const c of [...this.group.children]) {
      (c as THREE.Mesh).geometry?.dispose();
      this.group.remove(c);
    }
    const b = new MeshBuilder();
    if (this.mode === 'creatures') {
      const g = generateCreature(this.seed(), { luck: this.luck, id: `gallery/creature/${this.index}` });
      this.current = g;
      this.height = buildCreature(b, g).height;
    } else {
      const w = generateWeapon(this.seed(), { luck: this.luck, id: `gallery/weapon/${this.index}` });
      this.current = w;
      buildWeapon(b, w);
      this.height = 1.4;
    }
    for (const [key, geo] of b.build()) {
      const mat = key === 'glow' ? this.glow : key === 'ghost' ? this.ghost : key === 'metal' || key === 'steel' ? this.materials.get('metal') : this.materials.get('plain');
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = key !== 'ghost' && key !== 'glow';
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    this.group.position.copy(this.stage);
    if (this.mode === 'weapons') {
      // Present the weapon upright on the stage, slowly turning.
      this.group.position.y += 0.35 + (this.current as WeaponGenome).shape.gripLength * 0.2;
    }
    this.renderCard();
  }

  /** Orbiting camera position and target for the current specimen. */
  camera(dt: number): { pos: THREE.Vector3; target: THREE.Vector3 } {
    this.angle += dt * 0.25;
    const h = this.height;
    const r = this.mode === 'weapons' ? 1.9 : Math.max(2.4, h * 1.45);
    const centre = this.stage.clone().add(new THREE.Vector3(0, this.mode === 'weapons' ? 0.9 : h * 0.5, 0));
    const pos = centre.clone().add(new THREE.Vector3(Math.sin(this.angle) * r, h * 0.2 + 0.3, Math.cos(this.angle) * r));
    // Aim a little to the right of the specimen so it sits left of the info panel.
    const right = new THREE.Vector3(Math.cos(this.angle), 0, -Math.sin(this.angle));
    const target = centre.clone().addScaledVector(right, r * 0.32);
    const ground = this.world.terrain.height(pos.x, pos.z) + 0.6;
    if (pos.y < ground) pos.y = ground;
    if (this.mode === 'weapons') this.group.rotation.y = -this.angle * 0.6;
    return { pos, target };
  }

  private renderCard(): void {
    const el = this.panel.querySelector('.gallery-card')!;
    const idx = `#${this.index}`;
    this.panel.querySelectorAll<HTMLButtonElement>('[data-gallery="creatures"],[data-gallery="weapons"]').forEach((btn) => btn.classList.toggle('active', btn.dataset.gallery === this.mode));
    this.panel.querySelector('#gallery-luck-out')!.textContent = `${this.luck > 0 ? '+' : ''}${this.luck.toFixed(1)}`;
    if (this.mode === 'creatures') {
      const g = this.current as CreatureGenome;
      const colour = TIER_COLOURS[g.tier];
      const st = g.stats;
      el.innerHTML = `
        <p class="gc-kicker">Specimen ${idx} · seed ${g.seed}</p>
        <h3 style="color:${colour}">${esc(g.title ?? g.name)}</h3>
        ${g.title ? `<p class="gc-sub">${esc(g.name)}</p>` : ''}
        <p class="gc-meta">${g.tier} · ${g.plan} · ${g.covering} · ${g.size.toFixed(1)} m · ${g.temperament} · ${g.activity === 'always' ? 'any hour' : g.activity}</p>
        <dl>
          <dt>Health</dt><dd>${st.hp}</dd><dt>Damage</dt><dd>${st.damage}</dd>
          <dt>Speed</dt><dd>${st.speed} m/s</dd><dt>Armour</dt><dd>${Math.round(st.armour * 100)}%</dd>
          <dt>Senses</dt><dd>${Math.round(st.perception * 100)}%</dd><dt>Threat</dt><dd>${g.threat}</dd>
        </dl>
        ${g.mutations.length ? `<ul>${g.mutations.map((m) => `<li><b>${esc(m.prefix)}</b> — ${esc(m.effect)}</li>`).join('')}</ul>` : ''}
        <p class="gc-moves">Moves: ${g.moves.map(esc).join(', ')} · packs of ${g.packSize[0]}–${g.packSize[1]}</p>
        ${g.weapon ? `<p class="gc-weapon">Carries: <span style="color:${RARITY_COLOURS[g.weapon.rarity]}">${esc(g.weapon.title ?? g.weapon.name)}</span></p>` : ''}
        <p class="gc-lore">${esc(g.lore)}</p>`;
    } else {
      const w = this.current as WeaponGenome;
      const colour = RARITY_COLOURS[w.rarity];
      const st = w.stats;
      el.innerHTML = `
        <p class="gc-kicker">Weapon ${idx} · seed ${w.seed}</p>
        <h3 style="color:${colour}">${esc(w.title ?? w.name)}</h3>
        ${w.title ? `<p class="gc-sub">${esc(w.name)}</p>` : ''}
        <p class="gc-meta">${w.rarity} · ${w.condition} · ${w.material.name.toLowerCase()} ${w.cls} · ${w.hands === 2 ? 'two-handed' : 'one-handed'}</p>
        <dl>
          <dt>Damage</dt><dd>${st.damage}</dd><dt>Speed</dt><dd>${st.speed}</dd>
          <dt>Reach</dt><dd>${st.reach} m</dd><dt>Weight</dt><dd>${st.weight} kg</dd>
          <dt>Stamina</dt><dd>${st.stamina}</dd><dt>Critical</dt><dd>${Math.round(st.crit * 100)}%</dd>
        </dl>
        ${w.affixes.length ? `<ul>${w.affixes.map((a) => `<li class="${a.kind}"><b>${esc(a.prefix)}</b> — ${esc(a.effect)}</li>`).join('')}</ul>` : ''}
        <p class="gc-lore">${esc(w.lore)}</p>`;
    }
  }

  dispose(): void {
    this.panel.hidden = true;
    this.group.clear();
  }
}
