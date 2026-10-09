/** Deterministic place names from small hand-written syllable grammars. */
import type { Rng } from '../core/rng';

const PREFIX = ['Ash', 'Briar', 'Hollow', 'Wren', 'Thorn', 'Elder', 'Moss', 'Bram', 'Grey', 'Oak', 'Fern', 'Rook', 'Stour', 'Wyn', 'Cael', 'Dun', 'Mor', 'Vael'];
const VILLAGE_SUFFIX = ['wick', 'ford', 'stead', 'ley', 'hollow', 'combe', 'thorpe', 'mere', 'by', 'well'];
const CASTLE_ROOT = ['Vaelmoor', 'Hollowmere', 'Caer Dunvelt', 'Morrowgard', 'Aldenspire', 'Greythorne', 'Ravenmoot', 'Sablecrest'];
const CASTLE_FORM = ['Castle', 'the Spires of', 'the Keep of'];
const TOWER_FORM = ['Old Watch', 'Broken Watch', 'Warden’s Tower', 'the Lantern Stump', 'Beacon Tower', 'the Crow’s Tower', 'the Grey Watch', 'Signal Tower', 'the Hollow Tower', 'Sentinel Stump'];

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

/** Uses exactly one random draw, so callers' streams stay stable. */
export function towerName(rng: Rng): string {
  const v = rng.next() * TOWER_FORM.length;
  const form = TOWER_FORM[Math.floor(v)]!;
  const f = v - Math.floor(v);
  if (f < 0.55) return form;
  const k = Math.floor(((f - 0.55) / 0.45) * PREFIX.length * VILLAGE_SUFFIX.length);
  return `${form.replace(/^the /, 'The ')} of ${PREFIX[k % PREFIX.length]}${VILLAGE_SUFFIX[Math.floor(k / PREFIX.length) % VILLAGE_SUFFIX.length]}`;
}

/** Retry a name generator until it gives a name not already used nearby. */
export function uniqueName(rng: Rng, used: Set<string>, gen: (r: Rng) => string): string {
  let n = gen(rng);
  for (let i = 0; i < 6 && used.has(n); i++) n = gen(rng);
  used.add(n);
  return n;
}

export function farmName(rng: Rng): string {
  return `${rng.pick(PREFIX)}field Farm`;
}

const STONES = ['the Nine Maidens', 'the Whispering Ring', 'the Grey Wethers', 'the Drowned Circle', 'the Hob Stones', 'the Kings’ Ring', 'the Seven Sleepers', 'the Hurlers'];
const SHRINE_OF = ['the Lantern Saint', 'Saint Wenna', 'the Quiet Mother', 'the Pilgrim', 'Saint Aldric', 'the Drowned Bell', 'the Lost Warden', 'Saint Brannoc', 'the Weeping Maid', 'Saint Cuby', 'the Hollow King', 'the Ferryman'];
const CAMP = ['Hunters’ Camp', 'Abandoned Camp', 'Charcoal Burners’ Camp', 'Deserters’ Camp', 'Pilgrims’ Rest', 'Tinkers’ Camp'];
const REGION_ADJ = ['Ashen', 'Hollow', 'Sunken', 'Green', 'Grey', 'Bramble', 'Wind-torn', 'Quiet', 'Barrow', 'Golden', 'Rook', 'Briar', 'Misty', 'Old', 'Weeping', 'Thorn'];
const REGION_NOUN = ['Downs', 'Weald', 'Fells', 'Moor', 'Dales', 'Heath', 'Marches', 'Reach', 'Combe', 'Wolds', 'Holt', 'Meads'];
const HAMLET_FORM = ['Hamlet', 'Village', 'Market Village'];

export function stonesName(rng: Rng): string {
  return rng.pick(STONES);
}

export function shrineName(rng: Rng): string {
  return `Shrine of ${rng.pick(SHRINE_OF)}`;
}

export function campName(rng: Rng): string {
  return rng.pick(CAMP);
}

export function regionName(rng: Rng): string {
  return `the ${rng.pick(REGION_ADJ)} ${rng.pick(REGION_NOUN)}`;
}

/** The opening vale's name (every journey starts in one). */
export function valeName(rng: Rng): string {
  const form = rng.pick(['Vale', 'Vale', 'Dale', 'Glen', 'Hollow', 'Combe']);
  const of = rng.pick(['Unwritten Days', 'Quiet Bells', 'the Last Lantern', 'Folded Maps', 'Morrow', 'Long Shadows', 'the Patient Crown', 'Ash and Clover', 'Lost Hours', 'the Low Sun', 'Ravens Asleep', 'Small Mercies']);
  return `The ${form} of ${of}`;
}

export function keepName(rng: Rng): string {
  return `${rng.pick(['Fort', 'the Keep of', 'Castle', 'the Hold of'])} ${rng.pick(PREFIX)}${rng.pick(['gard', 'mont', 'hold', 'crag', 'helm', 'bury'])}`;
}

export function settlementForm(rng: Rng): string {
  return rng.pick(HAMLET_FORM);
}
