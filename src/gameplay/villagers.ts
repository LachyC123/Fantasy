/**
 * Residents of the world's villages, hamlets and farms. Each is planned
 * deterministically from the settlement: a name, a trade, a look, and where
 * they spend their day (a stretch of street to stroll, or a post such as the
 * inn's counter or the church porch). They greet you and pass on rumours of
 * real places nearby that you have not found yet.
 */
import { deriveSeed, Rng } from '../core/rng';
import { localToWorld } from '../world/castle';
import { innKeeperLocal } from '../assets/buildings';
import type { P2, SiteKind, SitePlan, WorldContent } from '../world/types';

export type Trade = 'innkeeper' | 'priest' | 'farmer' | 'smith' | 'weaver' | 'miller' | 'shepherd' | 'carter' | 'herbalist' | 'cooper';

export interface VillagerLook {
  height: number;
  girth: number;
  skin: number;
  hair: number;
  tunic: number;
  trousers: number;
  hat: 'none' | 'hood' | 'cap' | 'straw';
  beard: boolean;
  apron: boolean;
}

export interface VillagerPlan {
  id: string;
  name: string;
  trade: Trade;
  /** Settlement name, for greetings. */
  home: string;
  look: VillagerLook;
  /** A polyline to stroll back and forth along (outdoors), or … */
  route?: P2[];
  /** … a post where they stand (indoors at an absolute height when `y` is set). */
  post?: { x: number; z: number; yaw: number; y?: number };
}

const GIVEN = ['Alys', 'Bran', 'Cora', 'Dunstan', 'Edda', 'Fen', 'Gwen', 'Hob', 'Isolde', 'Jory', 'Kit', 'Lowen', 'Maud', 'Nye', 'Osric', 'Pell', 'Rhosyn', 'Sabine', 'Tam', 'Ulla', 'Wat', 'Yestin', 'Merryn', 'Elowen', 'Godric', 'Tamsin'];
const FAMILY = ['Wren', 'Hale', 'Marlow', 'Thatcher', 'Cobb', 'Fenn', 'Ashby', 'Rook', 'Bramble', 'Penrose', 'Tull', 'Garrow', 'Pengelly', 'Treloar', 'Hosking', 'Merrow'];
const SKIN = [0xf1c8a8, 0xe0b090, 0xc89470, 0xa87452, 0x8a5a3c, 0x6a4430];
const HAIR = [0x2a1e16, 0x4a3020, 0x7a5030, 0xb08040, 0xd8c090, 0x8a8a88, 0xe8e4dc, 0x9a3a20];
const CLOTH = [0x7a4a3a, 0x4a5a7a, 0x5a6a3a, 0x8a7a5a, 0x6a3a4a, 0x3a4a3a, 0x9a8a6a, 0x5a4a6a, 0xa86a3a, 0x4a6a6a];

function look(rng: Rng, trade: Trade): VillagerLook {
  return {
    height: rng.range(1.62, 1.86),
    girth: rng.range(0.9, 1.25),
    skin: rng.pick(SKIN),
    hair: rng.pick(HAIR),
    tunic: trade === 'priest' ? 0x3a3438 : rng.pick(CLOTH),
    trousers: rng.pick(CLOTH),
    hat: trade === 'priest' ? 'hood' : trade === 'farmer' || trade === 'shepherd' ? rng.pick(['straw', 'cap', 'none'] as const) : rng.weighted(['none', 'hood', 'cap', 'straw'] as const, [5, 2, 2, 1]),
    beard: rng.chance(0.35),
    apron: trade === 'innkeeper' || trade === 'smith' || trade === 'cooper' || (trade === 'weaver' && rng.chance(0.5)),
  };
}

function person(rng: Rng, trade: Trade): string {
  const given = rng.pick(GIVEN);
  if (trade === 'priest') return `${rng.pick(['Brother', 'Sister', 'Mother', 'Father'])} ${given}`;
  return `${given} ${rng.pick(FAMILY)}`;
}

/** Plan the residents of every settlement in an area. */
export function planVillagers(content: WorldContent): VillagerPlan[] {
  const out: VillagerPlan[] = [];
  for (const s of content.settlements) {
    const rng = new Rng(deriveSeed(s.id, 'villagers/v1'));
    const homes = content.buildings.filter((b) => b.settlementId === s.id || s.buildingIds.includes(b.id));
    if (s.kind === 'village' || s.kind === 'hamlet') {
      const inn = homes.find((b) => b.kind === 'inn' && b.enterable);
      if (inn) {
        const k = innKeeperLocal(inn);
        const w = localToWorld(k.x, k.z, inn.yaw, inn.x, inn.z);
        out.push({ id: `${s.id}/innkeeper`, name: person(rng, 'innkeeper'), trade: 'innkeeper', home: s.name, look: look(rng, 'innkeeper'), post: { x: w.x, z: w.z, yaw: inn.yaw, y: inn.padHeight + 0.06 } });
      }
      const church = homes.find((b) => b.kind === 'church');
      if (church) {
        const w = localToWorld(rng.range(-2, 2), church.depth / 2 + 3.2, church.yaw, church.x, church.z);
        out.push({ id: `${s.id}/priest`, name: person(rng, 'priest'), trade: 'priest', home: s.name, look: look(rng, 'priest'), post: { x: w.x, z: w.z, yaw: church.yaw } });
      }
      // Strollers along the street through the settlement.
      const streets = content.roads.filter((r) => r.kind === 'trade-road' && r.points.some((p) => Math.hypot(p.x - s.x, p.z - s.z) < 60));
      const count = s.kind === 'village' ? rng.int(2, 4) : rng.int(2, 3);
      for (let i = 0; i < count && streets.length; i++) {
        const road = streets[i % streets.length]!;
        // The stretch of this road within the settlement.
        const idx = road.points.map((p, j) => [j, Math.hypot(p.x - s.x, p.z - s.z)] as const).filter(([, d]) => d < 75).map(([j]) => j);
        if (idx.length < 10) continue;
        const a = idx[0]!;
        const b = idx[idx.length - 1]!;
        const from = a + rng.int(0, Math.floor((b - a) * 0.3));
        const to = b - rng.int(0, Math.floor((b - a) * 0.3));
        const side = rng.chance(0.5) ? 1 : -1;
        const off = road.halfWidth - 0.7;
        const route: P2[] = [];
        for (let j = from; j <= to; j += 2) {
          const p = road.points[j]!;
          const q = road.points[Math.min(j + 1, road.points.length - 1)]!;
          const o = road.points[Math.max(j - 1, 0)]!;
          const tx = q.x - o.x;
          const tz = q.z - o.z;
          const tl = Math.hypot(tx, tz) || 1;
          route.push({ x: p.x - (tz / tl) * off * side, z: p.z + (tx / tl) * off * side });
        }
        const trade = rng.pick<Trade>(['smith', 'weaver', 'miller', 'carter', 'herbalist', 'cooper', 'shepherd']);
        out.push({ id: `${s.id}/r${i}`, name: person(rng, trade), trade, home: s.name, look: look(rng, trade), route });
      }
    } else if (s.kind === 'farmstead') {
      const house = homes.find((b) => b.kind === 'farmhouse' || b.kind === 'cottage');
      if (!house || !rng.chance(0.75)) continue;
      const door = localToWorld(0, house.depth / 2 + 2.2, house.yaw, house.x, house.z);
      const yard = localToWorld(rng.range(-4, 4), house.depth / 2 + rng.range(7, 11), house.yaw, house.x, house.z);
      out.push({ id: `${s.id}/farmer`, name: person(rng, 'farmer'), trade: 'farmer', home: s.name, look: look(rng, 'farmer'), route: [door, yard] });
    }
  }
  return out;
}

const DIST = (d: number): string => (d < 700 ? 'a short walk' : d < 1600 ? 'an hour’s walk' : d < 3000 ? 'half a day’s walk' : 'a long day’s walk');

const GREETING: Record<Trade, string[]> = {
  innkeeper: ['Welcome, traveller. Ale’s cheap, beds are cheaper.', 'Sit by the fire and dry out.', 'You look like someone who’s walked a long way.'],
  priest: ['Peace on your road, wanderer.', 'The bells have been quiet. You noticed too?', 'Light a candle before you go on.'],
  farmer: ['Mind the barley.', 'Good weather for walking, bad for the hay.', 'You’re not from round here.'],
  smith: ['Blade could use an edge, that.', 'Iron doesn’t lie, people do.', 'Hot work today.'],
  weaver: ['Wool from the downs, dye from the marsh.', 'Lovely day for it.', 'Don’t mind me, I talk to everyone.'],
  miller: ['The wheel turns, the world turns.', 'Flour on everything, as ever.', 'Mornin’.'],
  shepherd: ['Lost three ewes on the fells this week.', 'Wind’s turning.', 'Watch the bog past the ridge.'],
  carter: ['Roads are bad past the gate.', 'Carry anything for a coin.', 'Axle’s cracked again.'],
  herbalist: ['Foxglove for the heart, yarrow for the blood.', 'Mind where you step, that’s comfrey.', 'Fine day for gathering.'],
  cooper: ['Barrels for the inn, barrels for the boats.', 'Good oak’s hard to find now.', 'Mind the hoops.'],
};

/** What a resident says about a place: where it is, how far, and a little of what they have heard. */
export function rumourLine(v: VillagerPlan, site: Pick<SitePlan, 'kind' | 'name'>, distance: number, direction: string, fortune: number): string {
  const rng = new Rng(deriveSeed(v.id, `rumour/${site.name}`));
  const greet = rng.pick(GREETING[v.trade]);
  const d = DIST(distance);
  const lines: Partial<Record<SiteKind, string>> = {
    stones: `There’s a ring of standing stones ${d} ${direction} of here. ${site.name}, the old folk call it. Leave something, and something’s left for you. Or so they say.`,
    castle: `${site.name} stands on a hill ${d} ${direction}. Gate’s been shut as long as anyone remembers.`,
    watchtower: `There’s an old watchtower ${d} ${direction}. ${site.name}. Climb what’s left of it and you’ll see half the country.`,
    shrine: `Head ${direction}, ${d} or so, and you’ll find the ${site.name}. Pilgrims leave offerings there.`,
    camp: `Someone was camping in the woods ${d} ${direction}. ${site.name}. Left in a hurry, I heard, and left things behind.`,
    village: `Folk from ${site.name}, ${d} ${direction}, come through for market. Decent inn there.`,
    farmstead: `${site.name} is ${d} ${direction}. They’ll give you water if you ask nicely.`,
    cottage: `Old ${site.name.replace(/’s Cottage$/, '')} lives alone ${d} ${direction}. Keeps an axe by the door.`,
  };
  let line = lines[site.kind] ?? `There’s a place called ${site.name} ${d} ${direction}.`;
  if (fortune > 1.1) line += ' Luck runs strong out that way.';
  else if (fortune < -1.1) line += ' Unlucky country, mind.';
  return `${greet} “${line}”`;
}

export function idleLine(v: VillagerPlan): string {
  const rng = new Rng(deriveSeed(v.id, 'idle'));
  return `${rng.pick(GREETING[v.trade])} “I’ve told you all I know. Go and see for yourself.”`;
}
