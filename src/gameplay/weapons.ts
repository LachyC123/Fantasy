/**
 * Procedural weapon genome. Every weapon is a pure function of a 32-bit seed
 * (plus optional luck and constraints): class, continuous shape parameters,
 * material, craft condition, rarity, affixes, derived stats, a name and — for
 * legendary and mythic pieces — a proper name and a line of lore.
 *
 * The parameter space is continuous, so the number of distinct weapons is
 * effectively unlimited; the luck model keeps extraordinary finds rare.
 */
import { Rng } from '../core/rng';
import { CONDITION_MULT, rarityIndex, rollCondition, rollRarity, type Condition, type Rarity } from './luck';

export type WeaponClass =
  | 'dagger'
  | 'shortsword'
  | 'longsword'
  | 'greatsword'
  | 'sabre'
  | 'falchion'
  | 'axe'
  | 'greataxe'
  | 'mace'
  | 'warhammer'
  | 'spear'
  | 'glaive';
export type WeaponFamily = 'blade' | 'axe' | 'blunt' | 'polearm';
export type TipShape = 'point' | 'spear' | 'clip' | 'round' | 'leaf';
export type GuardStyle = 'cross' | 'upswept' | 'downswept' | 'disc' | 'ring' | 'winged' | 'none';
export type PommelStyle = 'wheel' | 'sphere' | 'stopper' | 'ring' | 'spike' | 'none';
export type HeadStyle = 'none' | 'bearded' | 'crescent' | 'double' | 'flanged' | 'spiked' | 'hammer' | 'leaf' | 'blade';

interface ClassDef {
  family: WeaponFamily;
  hands: 1 | 2;
  bladeLen: [number, number];
  bladeWidth: [number, number];
  grip: [number, number];
  haft: [number, number];
  curve: [number, number];
  damage: number;
  speed: number;
  reach: number;
  weight: number;
  nouns: string[];
  heads: HeadStyle[];
  tips: TipShape[];
}

const CLASSES: Record<WeaponClass, ClassDef> = {
  dagger: { family: 'blade', hands: 1, bladeLen: [0.22, 0.34], bladeWidth: [0.022, 0.036], grip: [0.09, 0.12], haft: [0, 0], curve: [-0.04, 0.06], damage: 9, speed: 2.4, reach: 1.1, weight: 0.5, nouns: ['Dagger', 'Dirk', 'Knife', 'Stiletto'], heads: ['none'], tips: ['point', 'clip', 'leaf'] },
  shortsword: { family: 'blade', hands: 1, bladeLen: [0.5, 0.66], bladeWidth: [0.032, 0.048], grip: [0.11, 0.14], haft: [0, 0], curve: [-0.03, 0.05], damage: 14, speed: 1.9, reach: 1.6, weight: 1.0, nouns: ['Shortsword', 'Gladius', 'Seax'], heads: ['none'], tips: ['point', 'leaf', 'clip'] },
  longsword: { family: 'blade', hands: 1, bladeLen: [0.78, 0.98], bladeWidth: [0.03, 0.046], grip: [0.15, 0.22], haft: [0, 0], curve: [-0.02, 0.03], damage: 19, speed: 1.5, reach: 2.0, weight: 1.4, nouns: ['Longsword', 'Arming Sword', 'Bastard Sword'], heads: ['none'], tips: ['point', 'spear', 'round'] },
  greatsword: { family: 'blade', hands: 2, bladeLen: [1.1, 1.4], bladeWidth: [0.04, 0.06], grip: [0.26, 0.34], haft: [0, 0], curve: [-0.02, 0.02], damage: 30, speed: 0.95, reach: 2.6, weight: 3.0, nouns: ['Greatsword', 'Claymore', 'Zweihänder'], heads: ['none'], tips: ['point', 'spear', 'round'] },
  sabre: { family: 'blade', hands: 1, bladeLen: [0.72, 0.9], bladeWidth: [0.026, 0.038], grip: [0.13, 0.16], haft: [0, 0], curve: [0.08, 0.18], damage: 17, speed: 1.75, reach: 1.9, weight: 1.1, nouns: ['Sabre', 'Scimitar', 'Cutlass'], heads: ['none'], tips: ['clip', 'point'] },
  falchion: { family: 'blade', hands: 1, bladeLen: [0.62, 0.8], bladeWidth: [0.045, 0.07], grip: [0.13, 0.16], haft: [0, 0], curve: [0.03, 0.1], damage: 21, speed: 1.35, reach: 1.8, weight: 1.6, nouns: ['Falchion', 'Cleaver', 'Messer'], heads: ['none'], tips: ['clip', 'round'] },
  axe: { family: 'axe', hands: 1, bladeLen: [0, 0], bladeWidth: [0, 0], grip: [0.5, 0.7], haft: [0.5, 0.7], curve: [0, 0.08], damage: 20, speed: 1.3, reach: 1.7, weight: 1.6, nouns: ['Axe', 'Hatchet', 'Bearded Axe'], heads: ['bearded', 'crescent'], tips: ['point'] },
  greataxe: { family: 'axe', hands: 2, bladeLen: [0, 0], bladeWidth: [0, 0], grip: [1.0, 1.3], haft: [1.0, 1.3], curve: [0, 0.06], damage: 33, speed: 0.85, reach: 2.4, weight: 3.4, nouns: ['Greataxe', 'Bardiche', 'Headsman’s Axe'], heads: ['double', 'crescent', 'bearded'], tips: ['point'] },
  mace: { family: 'blunt', hands: 1, bladeLen: [0, 0], bladeWidth: [0, 0], grip: [0.45, 0.6], haft: [0.45, 0.6], curve: [0, 0], damage: 18, speed: 1.3, reach: 1.6, weight: 1.9, nouns: ['Mace', 'Morning Star', 'Flanged Mace'], heads: ['flanged', 'spiked'], tips: ['point'] },
  warhammer: { family: 'blunt', hands: 2, bladeLen: [0, 0], bladeWidth: [0, 0], grip: [0.9, 1.2], haft: [0.9, 1.2], curve: [0, 0], damage: 31, speed: 0.8, reach: 2.2, weight: 3.6, nouns: ['Warhammer', 'Maul', 'Bec de Corbin'], heads: ['hammer'], tips: ['point'] },
  spear: { family: 'polearm', hands: 2, bladeLen: [0.22, 0.38], bladeWidth: [0.03, 0.05], grip: [1.5, 1.9], haft: [1.5, 1.9], curve: [0, 0], damage: 17, speed: 1.4, reach: 3.0, weight: 2.0, nouns: ['Spear', 'Boar Spear', 'Partisan'], heads: ['leaf'], tips: ['leaf', 'spear'] },
  glaive: { family: 'polearm', hands: 2, bladeLen: [0.45, 0.65], bladeWidth: [0.045, 0.07], grip: [1.3, 1.6], haft: [1.3, 1.6], curve: [0.05, 0.14], damage: 25, speed: 1.0, reach: 2.9, weight: 2.8, nouns: ['Glaive', 'Voulge', 'Fauchard'], heads: ['blade'], tips: ['clip', 'point'] },
};

export const WEAPON_CLASSES = Object.keys(CLASSES) as WeaponClass[];

export interface WeaponMaterial {
  id: string;
  name: string;
  metal: string;
  edge: string;
  dark: string;
  /** Damage and weight multipliers. */
  damage: number;
  weight: number;
  /** Minimum rarity index required; weight by tier. */
  minRarity: number;
  glow?: string;
}

export const WEAPON_MATERIALS: WeaponMaterial[] = [
  { id: 'iron', name: 'Iron', metal: '#8f9096', edge: '#c4c4c8', dark: '#4e4f55', damage: 0.95, weight: 1.05, minRarity: 0 },
  { id: 'steel', name: 'Steel', metal: '#c9c3bc', edge: '#f4f0ea', dark: '#5e5f66', damage: 1.0, weight: 1.0, minRarity: 0 },
  { id: 'bronze', name: 'Bronze', metal: '#b5854a', edge: '#e2b878', dark: '#6a4a26', damage: 0.92, weight: 1.1, minRarity: 0 },
  { id: 'bone', name: 'Bone', metal: '#d8cfb4', edge: '#efe8d6', dark: '#8c8268', damage: 0.85, weight: 0.8, minRarity: 0 },
  { id: 'blackiron', name: 'Blackened', metal: '#4a4c55', edge: '#9a9caa', dark: '#26272e', damage: 1.08, weight: 1.05, minRarity: 1 },
  { id: 'moonsilver', name: 'Moonsilver', metal: '#c8d8f4', edge: '#ffffff', dark: '#7c88a8', damage: 1.12, weight: 0.85, minRarity: 2, glow: '#bcd4ff' },
  { id: 'starmetal', name: 'Starmetal', metal: '#5e6cd8', edge: '#c8d0ff', dark: '#2c3478', damage: 1.2, weight: 0.9, minRarity: 3, glow: '#8fa0ff' },
  { id: 'bloodsteel', name: 'Bloodsteel', metal: '#9a3040', edge: '#ff8a8a', dark: '#4a1018', damage: 1.28, weight: 1.0, minRarity: 4, glow: '#ff5060' },
  { id: 'dragonglass', name: 'Dragonglass', metal: '#3cc0a0', edge: '#c8fff0', dark: '#145a4c', damage: 1.32, weight: 0.75, minRarity: 4, glow: '#60ffd0' },
  { id: 'voidglass', name: 'Voidglass', metal: '#4a1c88', edge: '#e0b0ff', dark: '#1a0830', damage: 1.45, weight: 0.7, minRarity: 5, glow: '#c070ff' },
];

export interface Affix {
  id: string;
  kind: 'boon' | 'bane';
  prefix: string;
  suffix: string;
  effect: string;
  damage?: number;
  speed?: number;
  weight?: number;
  crit?: number;
  stamina?: number;
  glow?: string;
}

const BOONS: Affix[] = [
  { id: 'ember', kind: 'boon', prefix: 'Ember-Kissed', suffix: 'of Embers', effect: 'Strikes kindle fire (+burn damage).', damage: 1.08, glow: '#ff8a3a' },
  { id: 'frost', kind: 'boon', prefix: 'Rimed', suffix: 'of the Long Frost', effect: 'Strikes chill and slow the struck.', glow: '#9ae6ff' },
  { id: 'storm', kind: 'boon', prefix: 'Storm-Called', suffix: 'of Thunder', effect: 'Every fourth strike arcs lightning to a nearby foe.', glow: '#e8f0ff' },
  { id: 'moon', kind: 'boon', prefix: 'Moon-Touched', suffix: 'of the Pale Moon', effect: 'Bites deep into spectral things.', glow: '#cfe0ff' },
  { id: 'briar', kind: 'boon', prefix: 'Briarheart', suffix: 'of the Briar', effect: 'Stamina returns faster among living woods.', stamina: 0.9 },
  { id: 'bell', kind: 'boon', prefix: 'Bell-Forged', suffix: 'of the Tolling Bell', effect: 'Heavy blows ring out and stagger.', damage: 1.05 },
  { id: 'hunger', kind: 'boon', prefix: 'Hungering', suffix: 'of Thirst', effect: 'Draws a little life from each wound.', glow: '#c0304a' },
  { id: 'feather', kind: 'boon', prefix: 'Featherlight', suffix: 'of the Wren', effect: 'Strangely light in the hand.', weight: 0.65, speed: 1.12 },
  { id: 'keen', kind: 'boon', prefix: 'Keen', suffix: 'of the Hawk', effect: 'Finds the gaps in armour (+critical chance).', crit: 0.08 },
  { id: 'heavy', kind: 'boon', prefix: 'Grave-Heavy', suffix: 'of the Mountain', effect: 'Hits like a falling stone, but slowly.', damage: 1.18, speed: 0.88, weight: 1.25 },
  { id: 'warden', kind: 'boon', prefix: 'Warden’s', suffix: 'of the Wardens', effect: 'Hateful to the Gravebound.' },
  { id: 'sun', kind: 'boon', prefix: 'Sunlit', suffix: 'of High Noon', effect: 'Stronger while the sun is high.', glow: '#ffe28a' },
  { id: 'gloam', kind: 'boon', prefix: 'Gloaming', suffix: 'of Dusk', effect: 'Stronger between dusk and dawn.', glow: '#9a7aff' },
  { id: 'venom', kind: 'boon', prefix: 'Venomed', suffix: 'of the Adder', effect: 'Leaves a lingering poison.', glow: '#8fe06a' },
  { id: 'sunder', kind: 'boon', prefix: 'Sundering', suffix: 'of Broken Shields', effect: 'Ignores part of the target’s armour.', damage: 1.05 },
  { id: 'echo', kind: 'boon', prefix: 'Echoing', suffix: 'of Echoes', effect: 'Hums near hidden things.', glow: '#7fffe0' },
];

const BANES: Affix[] = [
  { id: 'brittle', kind: 'bane', prefix: 'Brittle', suffix: 'of Splinters', effect: 'May shatter on a hard parry.', damage: 0.95 },
  { id: 'omen', kind: 'bane', prefix: 'Ill-Omened', suffix: 'of Ill Omen', effect: 'Danger seems to find its bearer.' },
  { id: 'thirst', kind: 'bane', prefix: 'Thirsting', suffix: 'of the Leech', effect: 'Drinks from its bearer after each kill.', damage: 1.06 },
  { id: 'wail', kind: 'bane', prefix: 'Wailing', suffix: 'of Lament', effect: 'Moans when drawn, alerting foes.' },
  { id: 'leaden', kind: 'bane', prefix: 'Leaden', suffix: 'of Weariness', effect: 'Every swing costs more stamina.', stamina: 1.3, speed: 0.92 },
  { id: 'dull', kind: 'bane', prefix: 'Dull', suffix: 'of Bluntness', effect: 'The edge will not hold.', damage: 0.85 },
];

export interface WeaponShape {
  bladeLength: number;
  bladeWidth: number;
  taper: number;
  curve: number;
  tip: TipShape;
  fuller: boolean;
  serrated: boolean;
  notches: number;
  guard: GuardStyle;
  guardSpan: number;
  gripLength: number;
  pommel: PommelStyle;
  head: HeadStyle;
  headSize: number;
  flanges: number;
}

export interface WeaponStats {
  damage: number;
  speed: number;
  reach: number;
  weight: number;
  stamina: number;
  crit: number;
}

export interface WeaponGenome {
  id: string;
  seed: number;
  cls: WeaponClass;
  family: WeaponFamily;
  hands: 1 | 2;
  rarity: Rarity;
  condition: Condition;
  material: WeaponMaterial;
  accent: string;
  grip: string;
  shape: WeaponShape;
  affixes: Affix[];
  name: string;
  title: string | null;
  lore: string;
  stats: WeaponStats;
  glow: string | null;
  /** Single comparable number (higher is better). */
  power: number;
}

export interface WeaponOptions {
  id?: string;
  luck?: number;
  cls?: WeaponClass;
  /** Force an exact rarity (e.g. the humble starting weapon). */
  rarity?: Rarity;
  /** Region/culture tint for accents (affects names and ornament). */
  culture?: 'vale' | 'ashen' | 'fen' | 'marches';
  /** Restrict the material (by id). */
  materials?: string[];
}

const ACCENTS = ['#c8963e', '#b8b8c0', '#9a6a3a', '#5a5f6a', '#c05a3a', '#4a6a8a'];
const GRIPS = ['#3e2c23', '#5a3a28', '#2a2a30', '#6a2a2a', '#2a3a2a', '#4a3a5a'];

const TITLE_A = ['Vesper', 'Mourn', 'Ash', 'Thorn', 'Gloam', 'Hollow', 'Wyrm', 'Bell', 'Raven', 'Dusk', 'Ember', 'Grief', 'Star', 'Frost', 'Oath', 'Sorrow', 'Lantern', 'Briar'];
const TITLE_B = ['fang', 'hallow', 'brand', 'song', 'reaver', 'tide', 'bane', 'wake', 'call', 'mourn', 'spire', 'thorn', 'weald', 'light', 'keeper', 'veil'];
const EPITHETS = ['the Last Bell', 'the Unwritten Oath', 'the Drowned Choir', 'the Hollow Crown', 'the Ashen King', 'the Long Dusk', 'the First Warden', 'the Lantern Road', 'the Silent Abbey', 'the Starfallen', 'Nine Winters'];
const LORE_OPEN = ['Forged for', 'Carried by', 'Buried with', 'Lost by', 'Sworn upon by', 'Quenched in the blood of'];
const LORE_WHO = ['the wardens of the vale', 'a nameless knight', 'the last abbess of the hollow', 'the Ashen Crown’s border-guard', 'a king nobody remembers', 'the bell-ringers of the old chapel', 'a smith who would not give her name'];
const LORE_CLOSE = ['before the erasure.', 'on the night the bells fell silent.', 'and never returned.', 'in a war the maps forgot.', 'when the castle still had a name.', 'beneath a sky with one more star.'];

const pickRange = (rng: Rng, r: [number, number]): number => rng.range(r[0], r[1]);

export function generateWeapon(seed: number, opts: WeaponOptions = {}): WeaponGenome {
  const rng = new Rng(seed);
  const luck = opts.luck ?? 0;
  const rarity = opts.rarity ?? rollRarity(rng.fork(1), luck);
  const ri = rarityIndex(rarity);
  const condition = opts.rarity === 'common' && opts.cls ? 'worn' : rollCondition(rng.fork(2), luck + ri * 0.25);
  const cls = opts.cls ?? rng.weighted(WEAPON_CLASSES, [0.8, 1.1, 1.4, 0.6, 0.8, 0.7, 0.9, 0.5, 0.8, 0.5, 0.8, 0.5]);
  const def = CLASSES[cls];
  const shapeRng = rng.fork(3);

  // Material: allowed tiers weighted towards the rarity's own band.
  const allowed = WEAPON_MATERIALS.filter((m) => m.minRarity <= ri && (m.id !== 'bone' || cls === 'dagger' || cls === 'axe' || cls === 'spear' || cls === 'shortsword') && (!opts.materials || opts.materials.includes(m.id)));
  const matWeights = allowed.map((m) => (m.minRarity === ri ? 3 : 1) * (m.id === 'steel' || m.id === 'iron' ? 2 : 1));
  const material = rng.fork(4).weighted(allowed, matWeights);

  const tipList = def.tips;
  const shape: WeaponShape = {
    bladeLength: pickRange(shapeRng, def.bladeLen),
    bladeWidth: pickRange(shapeRng, def.bladeWidth),
    taper: shapeRng.range(0.25, 0.75),
    curve: pickRange(shapeRng, def.curve),
    tip: shapeRng.pick(tipList),
    fuller: def.family === 'blade' && shapeRng.chance(0.7),
    serrated: shapeRng.chance(def.family === 'blade' ? 0.06 + ri * 0.02 : 0.02),
    notches: condition === 'ruined' ? shapeRng.int(3, 6) : condition === 'rusted' ? shapeRng.int(1, 3) : condition === 'worn' ? shapeRng.int(0, 1) : 0,
    guard: def.family === 'blade' ? shapeRng.weighted<GuardStyle>(['cross', 'upswept', 'downswept', 'disc', 'ring', 'winged', 'none'], [4, 3, 2, 1, 1, ri >= 3 ? 2 : 0.3, cls === 'dagger' ? 2 : 0.3]) : 'none',
    guardSpan: shapeRng.range(0.12, 0.24) * (cls === 'greatsword' ? 1.4 : cls === 'dagger' ? 0.6 : 1),
    gripLength: pickRange(shapeRng, def.grip),
    pommel: def.family === 'blade' ? shapeRng.weighted<PommelStyle>(['wheel', 'sphere', 'stopper', 'ring', 'spike', 'none'], [4, 3, 2, 1, ri >= 2 ? 1 : 0.2, 0.3]) : shapeRng.pick<PommelStyle>(['sphere', 'none', 'spike']),
    head: shapeRng.pick(def.heads),
    headSize: shapeRng.range(0.85, 1.25),
    flanges: shapeRng.int(5, 8),
  };

  // Affixes: count grows with rarity; poor condition invites banes.
  const affixRng = rng.fork(5);
  const boonCount = [0, 1, 2, affixRng.int(2, 3), 3, 4][ri]!;
  const baneChance = condition === 'ruined' ? 0.85 : condition === 'rusted' ? 0.45 : condition === 'worn' ? 0.12 : 0.03;
  const affixes: Affix[] = [];
  const boonPool = BOONS.slice();
  for (let i = 0; i < boonCount && boonPool.length; i++) affixes.push(boonPool.splice(affixRng.int(0, boonPool.length - 1), 1)[0]!);
  // A rare twist of fate: a powerful piece that carries a curse.
  const cursed = ri >= 2 && affixRng.chance(0.08);
  if (affixRng.chance(baneChance) || cursed) affixes.push(affixRng.pick(BANES));

  // Stats.
  const lenRatio = def.bladeLen[1] > 0 ? shape.bladeLength / ((def.bladeLen[0] + def.bladeLen[1]) / 2) : shape.gripLength / ((def.grip[0] + def.grip[1]) / 2);
  const widthRatio = def.bladeWidth[1] > 0 ? shape.bladeWidth / ((def.bladeWidth[0] + def.bladeWidth[1]) / 2) : shape.headSize;
  const rarityMult = [1, 1.12, 1.26, 1.42, 1.62, 1.9][ri]!;
  let damage = def.damage * Math.pow(lenRatio, 0.4) * Math.pow(widthRatio, 0.5) * material.damage * CONDITION_MULT[condition] * rarityMult;
  let speed = def.speed / Math.pow(lenRatio, 0.35) / Math.pow(widthRatio, 0.25);
  let weight = def.weight * lenRatio * widthRatio * material.weight;
  let stamina = 8 + weight * 4;
  let crit = 0.04 + (shape.serrated ? 0.03 : 0) + (shape.tip === 'point' || shape.tip === 'spear' ? 0.02 : 0);
  const reach = def.reach * (0.85 + 0.15 * lenRatio);
  for (const a of affixes) {
    damage *= a.damage ?? 1;
    speed *= a.speed ?? 1;
    weight *= a.weight ?? 1;
    stamina *= a.stamina ?? 1;
    crit += a.crit ?? 0;
  }
  const stats: WeaponStats = {
    damage: round1(damage),
    speed: round2(speed),
    reach: round2(reach),
    weight: round1(weight),
    stamina: round1(stamina),
    crit: round2(crit),
  };

  // Names.
  const nameRng = rng.fork(6);
  const noun = nameRng.pick(def.nouns);
  const organic = material.id === 'bone' || material.id === 'dragonglass' || material.id === 'voidglass';
  const condWord: Record<Condition, string> = { ruined: nameRng.pick(['Broken', 'Shattered', 'Ruined']), rusted: organic ? 'Cracked' : 'Rusted', worn: 'Worn', sound: '', fine: 'Fine', masterwork: 'Masterwork', flawless: 'Flawless' };
  const boons = affixes.filter((a) => a.kind === 'boon');
  const banes = affixes.filter((a) => a.kind === 'bane');
  // Prefix: a bane colours the whole name; otherwise the first boon does.
  // Suffix: the last boon, unless it already supplied the prefix.
  const prefix = banes[0]?.prefix ?? boons[0]?.prefix ?? '';
  const suffixSource = banes.length ? boons[boons.length - 1] : boons.length > 1 ? boons[boons.length - 1] : undefined;
  const base = [condWord[condition], prefix, material.name, noun].filter(Boolean).join(' ');
  const plain = suffixSource ? `${base} ${suffixSource.suffix}` : base;
  let title: string | null = null;
  let lore = '';
  if (ri >= 4) {
    const tr = rng.fork(7);
    title = `${tr.pick(TITLE_A)}${tr.pick(TITLE_B)}`;
    if (ri === 5) title = `${title}, ${noun} of ${tr.pick(EPITHETS)}`;
    lore = `${tr.pick(LORE_OPEN)} ${tr.pick(LORE_WHO)} ${tr.pick(LORE_CLOSE)}`;
  } else if (ri >= 2) {
    const tr = rng.fork(7);
    lore = `${tr.pick(LORE_OPEN)} ${tr.pick(LORE_WHO)}.`;
  } else {
    lore = condition === 'ruined' || condition === 'rusted' ? 'It has seen better centuries.' : 'Plain, honest work.';
  }

  const glow = affixes.find((a) => a.glow)?.glow ?? material.glow ?? null;
  const power = Math.round(stats.damage * stats.speed * 10 * (1 + stats.crit) * (affixes.filter((a) => a.kind === 'boon').length * 0.08 + 1)) / 10;
  return {
    id: opts.id ?? `weapon/${seed >>> 0}`,
    seed: seed >>> 0,
    cls,
    family: def.family,
    hands: def.hands,
    rarity,
    condition,
    material,
    accent: rng.fork(8).pick(ACCENTS),
    grip: rng.fork(9).pick(GRIPS),
    shape,
    affixes,
    name: plain,
    title,
    lore,
    stats,
    glow,
    power,
  };
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
