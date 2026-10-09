/**
 * Procedural creature genome. A creature is a pure function of a seed (plus
 * optional luck, biome and body-plan constraints): a body plan with continuous
 * proportions, head features, covering, mutations, a move set, temperament,
 * derived stats, a generated name and lore — and, for armed body plans, a
 * procedurally generated weapon it can drop.
 *
 * Threat tiers come from the shared luck model: most encounters are ordinary;
 * champions are rare; a mythic horror is a one-in-two-thousand misfortune.
 */
import { Rng } from '../core/rng';
import { rollRarity } from './luck';
import { generateWeapon, type WeaponGenome } from './weapons';

export type BodyPlan = 'biped' | 'quadruped' | 'brute' | 'crawler' | 'serpent' | 'wisp' | 'thornling' | 'construct';
export const BODY_PLANS: readonly BodyPlan[] = ['biped', 'quadruped', 'brute', 'crawler', 'serpent', 'wisp', 'thornling', 'construct'];
export type Covering = 'fur' | 'hide' | 'scales' | 'bark' | 'bone' | 'armour' | 'stone' | 'ethereal' | 'moss' | 'chitin';
export type Tier = 'common' | 'elite' | 'champion' | 'mythic';
export const TIER_COLOURS: Record<Tier, string> = { common: '#d9d2c2', elite: '#6fa8ff', champion: '#ffb347', mythic: '#ff6f8e' };
export type Temperament = 'skittish' | 'territorial' | 'predatory' | 'guardian' | 'ambusher' | 'wandering';
export type Biome = 'weald' | 'fen' | 'marches' | 'highlands' | 'cinder' | 'hollows';

export interface Mutation {
  id: string;
  prefix: string;
  effect: string;
  hp?: number;
  damage?: number;
  speed?: number;
  armour?: number;
  size?: number;
  glow?: string;
  /** Visual flags the mesh builder understands. */
  visual?: 'twinHead' | 'manyEyes' | 'thorns' | 'bells' | 'hollow' | 'ember' | 'frost' | 'fungal' | 'crystal' | 'shadow';
}

const MUTATIONS: Mutation[] = [
  { id: 'twin', prefix: 'Twin-Headed', effect: 'Two heads: it sees almost everything.', hp: 1.25, visual: 'twinHead' },
  { id: 'iron', prefix: 'Ironhide', effect: 'Shrugs off glancing blows.', armour: 1.6, speed: 0.92 },
  { id: 'ember', prefix: 'Ember-Blooded', effect: 'Burns those who strike it.', damage: 1.15, glow: '#ff8a3a', visual: 'ember' },
  { id: 'hollow', prefix: 'Hollow', effect: 'Half-there; ordinary steel passes through it.', armour: 1.3, glow: '#bcd4ff', visual: 'hollow' },
  { id: 'ancient', prefix: 'Ancient', effect: 'Grown vast over centuries.', size: 1.7, hp: 2.4, damage: 1.5, speed: 0.85 },
  { id: 'eyes', prefix: 'Many-Eyed', effect: 'Nearly impossible to sneak past.', visual: 'manyEyes' },
  { id: 'thorn', prefix: 'Thorn-Backed', effect: 'Spines wound attackers.', damage: 1.05, visual: 'thorns' },
  { id: 'bell', prefix: 'Bell-Hung', effect: 'Bells ring as it moves — you will hear it coming.', hp: 1.15, visual: 'bells' },
  { id: 'frost', prefix: 'Rime-Touched', effect: 'Its strikes slow the blood.', glow: '#9ae6ff', visual: 'frost' },
  { id: 'swift', prefix: 'Swift', effect: 'Startlingly fast.', speed: 1.35, hp: 0.85 },
  { id: 'lumber', prefix: 'Lumbering', effect: 'Slow, but each blow lands like a falling tree.', speed: 0.75, damage: 1.35 },
  { id: 'fungal', prefix: 'Fungal', effect: 'Releases choking spores when hurt.', visual: 'fungal' },
  { id: 'crystal', prefix: 'Crystal-Grown', effect: 'Shards jut from its body; brittle but sharp.', armour: 1.3, hp: 0.9, glow: '#8fe0ff', visual: 'crystal' },
  { id: 'shadow', prefix: 'Gloam-Cloaked', effect: 'All but invisible in shadow.', visual: 'shadow' },
  { id: 'venom', prefix: 'Venomous', effect: 'Wounds keep bleeding poison.', damage: 1.1, glow: '#8fe06a' },
  { id: 'regal', prefix: 'Crowned', effect: 'Others of its kind follow it.', hp: 1.3, damage: 1.1 },
];

interface PlanDef {
  nouns: string[];
  coverings: Covering[];
  hp: number;
  damage: number;
  speed: number;
  size: [number, number];
  moves: string[];
  armed: boolean;
  temperaments: Temperament[];
  biomes: Biome[];
}

const PLANS: Record<BodyPlan, PlanDef> = {
  biped: { nouns: ['Gravebound', 'Reaver', 'Wight', 'Pilgrim', 'Revenant', 'Hollowman', 'Knight'], coverings: ['armour', 'bone', 'hide', 'bark'], hp: 60, damage: 12, speed: 3.6, size: [1.6, 2.1], moves: ['Overhead Strike', 'Feint', 'Shield Bash', 'Lunging Thrust', 'Sweeping Cut', 'War Cry'], armed: true, temperaments: ['guardian', 'territorial', 'wandering'], biomes: ['weald', 'highlands', 'cinder', 'marches'] },
  quadruped: { nouns: ['Wolf', 'Hound', 'Stag', 'Boar', 'Lynx', 'Strider', 'Ram'], coverings: ['fur', 'hide', 'moss', 'scales', 'bone'], hp: 45, damage: 10, speed: 7.5, size: [1.1, 1.8], moves: ['Bite', 'Pounce', 'Charge', 'Flank', 'Howl', 'Gore'], armed: false, temperaments: ['predatory', 'skittish', 'territorial'], biomes: ['weald', 'highlands', 'marches', 'fen'] },
  brute: { nouns: ['Ogre', 'Troll', 'Hulk', 'Mossback', 'Giant', 'Gristlemaw'], coverings: ['hide', 'moss', 'stone', 'bark'], hp: 180, damage: 26, speed: 3.0, size: [2.6, 3.8], moves: ['Ground Slam', 'Wide Sweep', 'Stomp', 'Hurl Boulder', 'Grab'], armed: true, temperaments: ['territorial', 'guardian', 'wandering'], biomes: ['highlands', 'weald', 'fen'] },
  crawler: { nouns: ['Crawler', 'Widow', 'Skitter', 'Mandible', 'Creeper'], coverings: ['chitin', 'bone', 'moss'], hp: 40, damage: 11, speed: 6, size: [0.9, 1.7], moves: ['Lunge', 'Spit Venom', 'Web Snare', 'Burrow Ambush', 'Leg Sweep'], armed: false, temperaments: ['ambusher', 'predatory'], biomes: ['fen', 'hollows', 'weald'] },
  serpent: { nouns: ['Serpent', 'Wyrm', 'Lurker', 'Coil', 'Eel'], coverings: ['scales', 'hide', 'chitin'], hp: 70, damage: 14, speed: 5, size: [1.0, 1.6], moves: ['Strike', 'Coil', 'Spit', 'Tail Lash', 'Submerge'], armed: false, temperaments: ['ambusher', 'territorial'], biomes: ['fen', 'hollows', 'marches'] },
  wisp: { nouns: ['Wraith', 'Wisp', 'Shade', 'Lantern', 'Candle-Ghost'], coverings: ['ethereal'], hp: 30, damage: 13, speed: 5.5, size: [1.0, 1.8], moves: ['Spectral Bolt', 'Blink', 'Life Drain', 'Wail', 'Possess'], armed: false, temperaments: ['wandering', 'guardian', 'ambusher'], biomes: ['marches', 'hollows', 'fen', 'cinder'] },
  thornling: { nouns: ['Briarling', 'Thornling', 'Bramble', 'Rootkin', 'Nettlewight'], coverings: ['bark', 'moss'], hp: 35, damage: 9, speed: 4.5, size: [0.9, 1.6], moves: ['Thorn Lash', 'Root Snare', 'Thorn Volley', 'Burrow', 'Pollen Burst'], armed: false, temperaments: ['ambusher', 'territorial'], biomes: ['weald', 'marches'] },
  construct: { nouns: ['Warden', 'Colossus', 'Sentinel', 'Idol', 'Golem'], coverings: ['stone'], hp: 220, damage: 24, speed: 2.4, size: [2.4, 4.2], moves: ['Slam', 'Shockwave', 'Stone Hurl', 'Guard Stance', 'Rune Pulse'], armed: false, temperaments: ['guardian'], biomes: ['highlands', 'hollows', 'cinder'] },
};

const COVER_WORDS: Record<Covering, string[]> = {
  fur: ['Shaggy', 'Grey-Furred', 'Russet'],
  hide: ['Scarred', 'Leathern', 'Pale'],
  scales: ['Scaled', 'Green-Scaled', 'Copper-Scaled'],
  bark: ['Bark-Skinned', 'Gnarled'],
  bone: ['Bone-Plated', 'Rattling', 'Ossified'],
  armour: ['Rust-Armoured', 'Mail-Clad', 'Black-Plated'],
  stone: ['Granite', 'Moss-Stone', 'Runed'],
  ethereal: ['Pale', 'Flickering', 'Weeping'],
  moss: ['Moss-Backed', 'Lichened'],
  chitin: ['Chitinous', 'Black-Shelled', 'Glossy'],
};

const PALETTES: Record<Covering, [string, string, string][]> = {
  fur: [['#6e6a66', '#a8a29a', '#3a3632'], ['#8a5a36', '#c8a078', '#4a2e1a'], ['#3a3a3e', '#6e6e74', '#1e1e22']],
  hide: [['#8a7a66', '#b8a88e', '#4a3e30'], ['#6a5a5e', '#9a8a8a', '#3a2e30']],
  scales: [['#3e6a46', '#8ab878', '#1e3a24'], ['#8a5a2a', '#d8a050', '#4a2a10'], ['#3a4e6a', '#7a9ab8', '#1a2a3e']],
  bark: [['#5a4632', '#8a7458', '#2e2218'], ['#4a5a32', '#7a8a50', '#26301a']],
  bone: [['#d8cfb4', '#efe8d6', '#8c8268']],
  armour: [['#5e5f66', '#9a9ca6', '#2e2f36'], ['#7a4a30', '#a87050', '#3a2418']],
  stone: [['#8a867c', '#b0aa9c', '#4e4c46'], ['#6a7078', '#9aa0a8', '#3a3e44']],
  ethereal: [['#a8c0e8', '#e8f0ff', '#5a6a98'], ['#c0a8e8', '#f0e8ff', '#6a5a98']],
  moss: [['#4a6a32', '#7a9a50', '#26361a']],
  chitin: [['#2a2a34', '#5a5a6a', '#0e0e14'], ['#4a2a3a', '#7a4a5a', '#220e18']],
};

const EYE_COLOURS = ['#ffd84a', '#ff4a3a', '#9ae6ff', '#8fe06a', '#ffffff', '#c070ff'];
const OLD_NAMES_A = ['Old', 'Grey', 'Mother', 'Blind', 'Long', 'Black', 'Bell', 'Hollow', 'Red'];
const OLD_NAMES_B = ['Gristlemaw', 'Thornmother', 'Ashgut', 'Hoarfang', 'Mournhide', 'Gallowstep', 'Wretchroot', 'Cinderjaw', 'Dunmarrow'];
const EPITHET = ['the Unburied', 'of the Drowned Bell', 'Who Walks the Roads', 'the Last Warden', 'the Tithe-Taker', 'of the Erased Kingdom', 'the Patient'];

export interface CreatureGenome {
  id: string;
  seed: number;
  plan: BodyPlan;
  tier: Tier;
  covering: Covering;
  name: string;
  title: string | null;
  lore: string;
  size: number;
  body: {
    torsoLength: number;
    torsoWidth: number;
    neck: number;
    head: number;
    legs: number;
    legLength: number;
    arms: number;
    armLength: number;
    tail: number;
    hunch: number;
    eyes: number;
    horns: 'none' | 'curved' | 'straight' | 'antlers';
    hornCount: number;
    jaw: 'maw' | 'beak' | 'mandibles' | 'tusks' | 'none';
    crest: boolean;
  };
  palette: { body: string; belly: string; dark: string; eye: string };
  mutations: Mutation[];
  moves: string[];
  temperament: Temperament;
  activity: 'day' | 'dusk' | 'night' | 'always';
  packSize: [number, number];
  biomes: Biome[];
  stats: { hp: number; damage: number; speed: number; armour: number; perception: number };
  weapon: WeaponGenome | null;
  glow: string | null;
  threat: number;
}

export interface CreatureOptions {
  id?: string;
  luck?: number;
  plan?: BodyPlan;
  biome?: Biome;
  /** Force a tier (e.g. a placed boss). */
  tier?: Tier;
}

function tierFromRoll(rng: Rng, luck: number): Tier {
  // Bad luck for the traveller means a dangerous creature: luck here is the creature's.
  const r = rollRarity(rng, luck);
  return r === 'common' || r === 'uncommon' ? 'common' : r === 'rare' ? 'elite' : r === 'mythic' ? 'mythic' : 'champion';
}

export function generateCreature(seed: number, opts: CreatureOptions = {}): CreatureGenome {
  const rng = new Rng(seed);
  const tier = opts.tier ?? tierFromRoll(rng.fork(1), opts.luck ?? 0);
  const ti = ['common', 'elite', 'champion', 'mythic'].indexOf(tier);
  const biomeOk = (p: BodyPlan): boolean => !opts.biome || PLANS[p].biomes.includes(opts.biome);
  const candidates = BODY_PLANS.filter(biomeOk);
  const plan = opts.plan ?? rng.fork(2).weighted(candidates, candidates.map((p) => (p === 'construct' || p === 'brute' ? 0.6 : 1)));
  const def = PLANS[plan];
  const br = rng.fork(3);
  const covering = br.pick(def.coverings);
  const [body, belly, dark] = br.pick(PALETTES[covering]);

  // Mutations: more and stranger with tier.
  const mr = rng.fork(4);
  const count = [mr.chance(0.25) ? 1 : 0, mr.int(1, 2), mr.int(2, 3), mr.int(3, 4)][ti]!;
  const pool = MUTATIONS.filter((m) => !(m.id === 'hollow' && plan === 'construct'));
  const mutations: Mutation[] = [];
  for (let i = 0; i < count && pool.length; i++) mutations.push(pool.splice(mr.int(0, pool.length - 1), 1)[0]!);
  if (plan === 'wisp' && !mutations.some((m) => m.visual === 'hollow')) mutations.unshift(MUTATIONS.find((m) => m.id === 'hollow')!);

  let size = br.range(def.size[0], def.size[1]) * (1 + ti * 0.12);
  for (const m of mutations) size *= m.size ?? 1;

  const legsFor: Record<BodyPlan, () => number> = {
    biped: () => 2,
    brute: () => 2,
    quadruped: () => (br.chance(0.08) ? 6 : 4),
    crawler: () => br.pick([6, 8, 8, 10]),
    serpent: () => 0,
    wisp: () => 0,
    thornling: () => br.pick([0, 2, 3, 4]),
    construct: () => br.pick([2, 2, 4]),
  };
  const bodyParams: CreatureGenome['body'] = {
    torsoLength: br.range(0.8, 1.3),
    torsoWidth: br.range(0.75, 1.3),
    neck: br.range(0.2, 1),
    head: br.range(0.8, 1.3),
    legs: legsFor[plan](),
    legLength: br.range(0.75, 1.3),
    arms: plan === 'biped' || plan === 'brute' ? 2 : plan === 'construct' ? 2 : plan === 'thornling' ? br.int(2, 5) : plan === 'wisp' ? br.int(0, 2) : 0,
    armLength: br.range(0.8, 1.35),
    tail: plan === 'quadruped' || plan === 'crawler' ? br.range(0, 1) : plan === 'serpent' ? 1 : br.chance(0.15) ? br.range(0.3, 1) : 0,
    hunch: br.range(0, 0.6),
    eyes: mutations.some((m) => m.visual === 'manyEyes') ? br.int(4, 9) : plan === 'crawler' ? br.pick([4, 6, 8]) : plan === 'construct' ? br.pick([1, 2]) : br.pick([2, 2, 2, 1, 3]),
    horns: br.weighted(['none', 'curved', 'straight', 'antlers'], [3, 2, 1.5, plan === 'quadruped' ? 2 : 0.4]),
    hornCount: br.pick([2, 2, 2, 4, 1]),
    jaw: plan === 'crawler' ? 'mandibles' : plan === 'construct' ? 'none' : br.weighted(['maw', 'beak', 'tusks', 'none'], [3, plan === 'quadruped' ? 0.3 : 1, plan === 'brute' || plan === 'quadruped' ? 1.5 : 0.4, plan === 'wisp' ? 3 : 0.5]),
    crest: br.chance(0.3),
  };

  // Stats scale with size, tier and mutations.
  const tierMult = [1, 1.6, 2.6, 4.5][ti]!;
  const sizeRatio = size / ((def.size[0] + def.size[1]) / 2);
  let hp = def.hp * Math.pow(sizeRatio, 2) * tierMult;
  let damage = def.damage * sizeRatio * (1 + ti * 0.35);
  let speed = def.speed * (bodyParams.legs > 0 ? Math.pow(bodyParams.legLength, 0.5) : 1) / Math.pow(sizeRatio, 0.25);
  let armour = (covering === 'armour' || covering === 'stone' || covering === 'chitin' ? 0.35 : covering === 'bone' || covering === 'scales' || covering === 'bark' ? 0.2 : 0.05) + ti * 0.05;
  for (const m of mutations) {
    hp *= m.hp ?? 1;
    damage *= m.damage ?? 1;
    speed *= m.speed ?? 1;
    armour *= m.armour ?? 1;
  }
  const perception = Math.min(1, 0.4 + bodyParams.eyes * 0.06 + (mutations.some((m) => m.id === 'eyes' || m.id === 'twin') ? 0.25 : 0));

  // Moves: 2–5 from the plan's library.
  const moveRng = rng.fork(5);
  const lib = def.moves.slice();
  const moves: string[] = [];
  for (let i = 0; i < 2 + Math.min(3, ti + moveRng.int(0, 1)) && lib.length; i++) moves.push(lib.splice(moveRng.int(0, lib.length - 1), 1)[0]!);

  // Armed creatures carry a generated weapon (better tiers, better arms — and loot).
  const weapon = def.armed ? generateWeapon(rng.fork(6).int(0, 2 ** 31), { luck: ti * 0.8 - 0.6, id: `${opts.id ?? `creature/${seed >>> 0}`}/weapon` }) : null;

  // Names.
  const nr = rng.fork(7);
  const noun = nr.pick(def.nouns);
  const coverWord = nr.chance(0.6) ? nr.pick(COVER_WORDS[covering]) : '';
  const prefix = mutations[0]?.prefix ?? '';
  const name = [prefix, coverWord, noun].filter(Boolean).join(' ');
  const title = ti >= 2 ? `${nr.pick(OLD_NAMES_A)} ${nr.pick(OLD_NAMES_B)}${ti === 3 ? `, ${nr.pick(EPITHET)}` : ''}` : null;
  const temperament = nr.pick(def.temperaments);
  const activity = nr.pick<CreatureGenome['activity']>(plan === 'wisp' ? ['night', 'dusk'] : ['day', 'dusk', 'night', 'always']);
  const packSize: [number, number] = plan === 'quadruped' && temperament === 'predatory' ? [2, 5] : plan === 'thornling' || plan === 'crawler' ? [1, 4] : [1, ti >= 2 ? 1 : 2];
  const biomes = def.biomes.slice();
  const where = nr.pick(['old roads', 'ruined chapels', 'deep woods', 'reed-choked fens', 'high passes', 'forgotten barrows', 'abandoned farms']);
  const habit: Record<Temperament, string> = {
    skittish: 'It flees at the first sign of a blade.',
    territorial: 'It will not tolerate trespass on its ground.',
    predatory: 'It hunts, patiently, from cover.',
    guardian: 'It guards something, though it no longer remembers what.',
    ambusher: 'It waits, very still, for something to come close.',
    wandering: 'It roams without rest, as if searching.',
  };
  const lore = `Found near ${where}${activity === 'night' ? ' after dark' : activity === 'dusk' ? ' at dusk' : ''}. ${habit[temperament]}`;

  const glow = mutations.find((m) => m.glow)?.glow ?? (plan === 'wisp' || plan === 'construct' ? br.pick(EYE_COLOURS) : null);
  const threat = Math.round((hp / 10) * damage * (1 + armour) * Math.sqrt(speed) / 10);
  return {
    id: opts.id ?? `creature/${seed >>> 0}`,
    seed: seed >>> 0,
    plan,
    tier,
    covering,
    name,
    title,
    lore,
    size: Math.round(size * 100) / 100,
    body: bodyParams,
    palette: { body, belly, dark, eye: glow ?? br.pick(EYE_COLOURS) },
    mutations,
    moves,
    temperament,
    activity,
    packSize,
    biomes,
    stats: { hp: Math.round(hp), damage: Math.round(damage * 10) / 10, speed: Math.round(speed * 10) / 10, armour: Math.round(Math.min(0.85, armour) * 100) / 100, perception: Math.round(perception * 100) / 100 },
    weapon,
    glow,
    threat,
  };
}
