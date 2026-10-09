/**
 * Low-poly villager figure with separately pivoting legs, arms and head, so
 * walking, idling and gesturing can be animated procedurally. Proportions,
 * colours, hats, aprons and beards come from the villager's look.
 */
import * as THREE from 'three';
import { MeshBuilder, col } from './geo';
import type { VillagerLook } from '../gameplay/villagers';
import type { MaterialLibrary } from '../rendering/materials';

export interface VillagerRig {
  root: THREE.Group;
  body: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  head: THREE.Group;
  hipY: number;
}

function part(builder: (b: MeshBuilder) => void, material: THREE.Material): THREE.Group {
  const b = new MeshBuilder();
  builder(b);
  const g = new THREE.Group();
  for (const [, geo] of b.build()) {
    const m = new THREE.Mesh(geo, material);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  return g;
}

/** Built facing local +Z, feet at y = 0. */
export function buildVillager(look: VillagerLook, materials: MaterialLibrary): VillagerRig {
  const mat = materials.get('plain');
  const I = new THREE.Matrix4();
  const H = look.height;
  const g = look.girth;
  const hipY = H * 0.48;
  const shoulderY = H * 0.82;
  const skin = new THREE.Color(look.skin);
  const hair = new THREE.Color(look.hair);
  const tunic = new THREE.Color(look.tunic);
  const trousers = new THREE.Color(look.trousers);
  const boot = col('#3a2a20');

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const torso = part((b) => {
    b.box('plain', I, 0, (hipY + shoulderY) / 2, 0, 0.4 * g, shoulderY - hipY, 0.24 * g, { color: tunic });
    // Tunic skirt over the hips.
    b.box('plain', I, 0, hipY - 0.05, 0, 0.44 * g, 0.2, 0.28 * g, { color: tunic.clone().multiplyScalar(0.92) });
    b.box('plain', I, 0, hipY + 0.06, 0, 0.42 * g, 0.06, 0.26 * g, { color: col('#3a2a1e') });
    if (look.apron) b.box('plain', I, 0, hipY + 0.05, 0.13 * g, 0.32 * g, 0.42, 0.03, { color: col('#d8ccb0') });
  }, mat);
  body.add(torso);

  const leg = (sx: number): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.1 * g, hipY, 0);
    pivot.add(
      part((b) => {
        b.box('plain', I, 0, -hipY / 2 + 0.05, 0, 0.15 * g, hipY - 0.1, 0.17, { color: trousers });
        b.box('plain', I, 0, -hipY + 0.06, 0.03, 0.16 * g, 0.12, 0.24, { color: boot });
      }, mat),
    );
    body.add(pivot);
    return pivot;
  };
  const legL = leg(-1);
  const legR = leg(1);

  const arm = (sx: number): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.position.set(sx * (0.24 * g + 0.04), shoulderY - 0.04, 0);
    const len = H * 0.36;
    pivot.add(
      part((b) => {
        b.box('plain', I, 0, -len / 2, 0, 0.1, len, 0.11, { color: tunic.clone().multiplyScalar(0.95) });
        b.box('plain', I, 0, -len - 0.04, 0, 0.09, 0.09, 0.1, { color: skin });
      }, mat),
    );
    body.add(pivot);
    return pivot;
  };
  const armL = arm(-1);
  const armR = arm(1);

  const head = new THREE.Group();
  head.position.set(0, shoulderY + 0.02, 0);
  head.add(
    part((b) => {
      const hh = H * 0.13;
      b.box('plain', I, 0, 0.05, 0, 0.08, 0.1, 0.08, { color: skin });
      b.box('plain', I, 0, 0.1 + hh / 2, 0.01, 0.2, hh, 0.22, { color: skin });
      // Eyes and a hint of a nose catch the pixels.
      for (const sx of [-0.05, 0.05]) b.box('plain', I, sx, 0.1 + hh * 0.58, 0.115, 0.03, 0.025, 0.01, { color: col('#1a1410') });
      b.box('plain', I, 0, 0.1 + hh * 0.42, 0.125, 0.03, 0.05, 0.03, { color: skin.clone().multiplyScalar(0.92) });
      // Hair.
      b.box('plain', I, 0, 0.1 + hh + 0.02, -0.01, 0.22, 0.06, 0.24, { color: hair });
      b.box('plain', I, 0, 0.1 + hh * 0.55, -0.11, 0.22, hh * 0.85, 0.04, { color: hair });
      if (look.beard) b.box('plain', I, 0, 0.1 + hh * 0.12, 0.1, 0.18, hh * 0.35, 0.06, { color: hair });
      const top = 0.1 + hh + 0.05;
      if (look.hat === 'hood') {
        b.box('plain', I, 0, top - 0.04, -0.02, 0.26, 0.14, 0.28, { color: tunic.clone().multiplyScalar(0.85) });
        b.box('plain', I, 0, 0.1 + hh * 0.5, -0.12, 0.26, hh * 1.1, 0.06, { color: tunic.clone().multiplyScalar(0.85) });
      } else if (look.hat === 'cap') {
        b.box('plain', I, 0, top, 0, 0.23, 0.07, 0.25, { color: col('#5a4a3a') });
      } else if (look.hat === 'straw') {
        b.box('plain', I, 0, top - 0.01, 0, 0.44, 0.03, 0.44, { color: col('#d8c070') });
        b.box('plain', I, 0, top + 0.05, 0, 0.22, 0.1, 0.22, { color: col('#d0b868') });
      }
    }, mat),
  );
  body.add(head);
  return { root, body, legL, legR, armL, armR, head, hipY };
}
