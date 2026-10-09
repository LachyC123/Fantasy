/** Deterministic place names from small hand-written syllable grammars. */
import type { Rng } from '../core/rng';

const PREFIX = ['Ash', 'Briar', 'Hollow', 'Wren', 'Thorn', 'Elder', 'Moss', 'Bram', 'Grey', 'Oak', 'Fern', 'Rook', 'Stour', 'Wyn', 'Cael', 'Dun', 'Mor', 'Vael'];
const VILLAGE_SUFFIX = ['wick', 'ford', 'stead', 'ley', 'hollow', 'combe', 'thorpe', 'mere', 'by', 'well'];
const CASTLE_ROOT = ['Vaelmoor', 'Hollowmere', 'Caer Dunvelt', 'Morrowgard', 'Aldenspire', 'Greythorne', 'Ravenmoot', 'Sablecrest'];
const CASTLE_FORM = ['Castle', 'the Spires of', 'the Keep of'];
const TOWER_FORM = ['Old Watch', 'Broken Watch', 'Warden’s Tower', 'the Lantern Stump'];

const FAMILY = ['Wren', 'Hale', 'Marlow', 'Thatcher', 'Cobb', 'Fenn', 'Ashby', 'Rook', 'Bramble', 'Penrose', 'Tull', 'Garrow'];

export function villageName(rng: Rng): string {
  const pre = rng.pick(PREFIX);
  let suf = rng.pick(VILLAGE_SUFFIX);
  if (pre.toLowerCase().includes(suf) || suf.includes(pre.toLowerCase())) suf = 'stead';
  return pre + suf;
}

export function familyName(rng: Rng): string {
  return rng.pick(FAMILY);
}

export function castleName(rng: Rng): string {
  const form = rng.pick(CASTLE_FORM);
  return `${form} ${rng.pick(CASTLE_ROOT)}`;
}

export function towerName(rng: Rng): string {
  return rng.pick(TOWER_FORM);
}

export function farmName(rng: Rng): string {
  return `${rng.pick(PREFIX)}field Farm`;
}
