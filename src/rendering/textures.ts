/**
 * Deterministic procedural pixel-art texture library. Every surface shares
 * the same texel density (≈16–32 px per metre), a restricted palette and
 * nearest-neighbour magnification so the world reads as one painted style.
 */
import * as THREE from 'three';
import { Rng } from '../core/rng';

type RGB = [number, number, number];

const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mixc = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

class Pixmap {
  readonly data: Uint8ClampedArray;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Uint8ClampedArray(w * h * 4);
  }
  set(x: number, y: number, c: RGB, a = 255): void {
    x = ((x % this.w) + this.w) % this.w; // wrap → tileable
    y = ((y % this.h) + this.h) % this.h;
    const i = (y * this.w + x) * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = a;
  }
  get(x: number, y: number): RGB {
    x = ((x % this.w) + this.w) % this.w;
    y = ((y % this.h) + this.h) % this.h;
    const i = (y * this.w + x) * 4;
    return [this.data[i]!, this.data[i + 1]!, this.data[i + 2]!];
  }
  fill(c: RGB): void {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.set(x, y, c);
  }
  /** Shade existing pixel by a factor. */
  shade(x: number, y: number, k: number): void {
    const c = this.get(x, y);
    this.set(x, y, [c[0] * k, c[1] * k, c[2] * k]);
  }
  rect(x0: number, y0: number, w: number, h: number, c: RGB): void {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, c);
  }
  /** Palette-stepped noise speckle over the whole map. */
  speckle(rng: Rng, palette: RGB[], amount: number): void {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) if (rng.next() < amount) this.set(x, y, rng.pick(palette));
  }
  toTexture(repeat = true, alphaTest = false): THREE.DataTexture {
    const tex = new THREE.DataTexture(this.data, this.w, this.h, THREE.RGBAFormat);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.wrapS = tex.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 1;
    tex.flipY = false;
    if (alphaTest) tex.premultiplyAlpha = false;
    tex.needsUpdate = true;
    return tex;
  }
}

/** Irregular stone coursework: rows of blocks of varying length. */
function masonry(
  p: Pixmap,
  rng: Rng,
  opts: { rowH: [number, number]; blockW: [number, number]; tones: RGB[]; mortar: RGB; light: RGB; dark: RGB; moss?: RGB; mossAmt?: number },
): void {
  p.fill(opts.mortar);
  let y = 0;
  while (y < p.h) {
    const rh = Math.min(rng.int(opts.rowH[0], opts.rowH[1]), p.h - y);
    let x = rng.int(0, opts.blockW[1]);
    const startX = x;
    while (x < startX + p.w) {
      const bw = rng.int(opts.blockW[0], opts.blockW[1]);
      const tone = rng.pick(opts.tones);
      for (let yy = 1; yy < rh; yy++) {
        for (let xx = 1; xx < bw; xx++) {
          let c = tone;
          const n = rng.next();
          if (n < 0.12) c = mixc(tone, opts.dark, 0.35);
          else if (n > 0.93) c = mixc(tone, opts.light, 0.4);
          // Top-left edge catches light, bottom-right falls in shade.
          if (yy === 1 || xx === 1) c = mixc(c, opts.light, 0.45);
          if (yy === rh - 1 || xx === bw - 1) c = mixc(c, opts.dark, 0.45);
          p.set(x + xx, y + yy, c);
        }
      }
      x += bw;
    }
    y += rh;
  }
  if (opts.moss) {
    const blobs = opts.mossAmt ?? 4;
    for (let b = 0; b < blobs; b++) {
      const cx = rng.int(0, p.w);
      const cy = rng.int(0, p.h);
      const r = rng.range(2, 6);
      for (let yy = -r; yy <= r; yy++)
        for (let xx = -r; xx <= r; xx++)
          if (xx * xx + yy * yy < r * r && rng.next() < 0.6) p.set(cx + xx, cy + yy, mixc(opts.moss, p.get(cx + xx, cy + yy), rng.range(0, 0.4)));
    }
  }
}

function grain(p: Pixmap, rng: Rng, base: RGB, dark: RGB, light: RGB, vertical: boolean, boardW = 0): void {
  p.fill(base);
  const len = vertical ? p.w : p.h;
  for (let i = 0; i < len; i++) {
    const lineTone = rng.next();
    for (let j = 0; j < (vertical ? p.h : p.w); j++) {
      const x = vertical ? i : j;
      const y = vertical ? j : i;
      let c = base;
      if (lineTone < 0.25) c = mixc(base, dark, 0.35);
      else if (lineTone > 0.85) c = mixc(base, light, 0.3);
      if (rng.next() < 0.05) c = mixc(c, dark, 0.4);
      p.set(x, y, c);
    }
  }
  if (boardW > 0) {
    for (let i = 0; i < len; i += boardW) for (let j = 0; j < (vertical ? p.h : p.w); j++) p.set(vertical ? i : j, vertical ? j : i, dark);
  }
  // Knots.
  for (let k = 0; k < 3; k++) {
    const cx = rng.int(0, p.w);
    const cy = rng.int(0, p.h);
    p.set(cx, cy, dark);
    p.set(cx + 1, cy, mixc(dark, base, 0.4));
    p.set(cx, cy + 1, mixc(dark, base, 0.4));
  }
}

function rooftiles(p: Pixmap, rng: Rng, tones: RGB[], gap: RGB, light: RGB, rowH: number, tileW: number): void {
  p.fill(gap);
  for (let row = 0; row * rowH < p.h; row++) {
    const off = row % 2 ? Math.floor(tileW / 2) : 0;
    for (let x0 = -tileW; x0 < p.w; x0 += tileW) {
      const tone = rng.pick(tones);
      for (let yy = 0; yy < rowH - 1; yy++) {
        for (let xx = 0; xx < tileW - 1; xx++) {
          let c = tone;
          // Each tile is lit at its lower lip and shadowed under the row above.
          if (yy === rowH - 2) c = mixc(tone, light, 0.35);
          if (yy < 2) c = mixc(tone, gap, 0.45);
          if (rng.next() < 0.06) c = mixc(c, gap, 0.3);
          p.set(x0 + off + xx, row * rowH + yy, c);
        }
      }
    }
  }
}

export interface TextureLibrary {
  grass: THREE.DataTexture;
  dirt: THREE.DataTexture;
  cobble: THREE.DataTexture;
  stone: THREE.DataTexture;
  ruinStone: THREE.DataTexture;
  castleStone: THREE.DataTexture;
  plaster: THREE.DataTexture;
  timber: THREE.DataTexture;
  planks: THREE.DataTexture;
  roofTile: THREE.DataTexture;
  slate: THREE.DataTexture;
  thatch: THREE.DataTexture;
  bark: THREE.DataTexture;
  birchBark: THREE.DataTexture;
  leaves: THREE.DataTexture;
  needles: THREE.DataTexture;
  rock: THREE.DataTexture;
  window: THREE.DataTexture;
  hay: THREE.DataTexture;
}

let cached: TextureLibrary | null = null;

export function getTextures(): TextureLibrary {
  if (cached) return cached;
  const rng = new Rng(0x7a11a5);

  // Terrain detail maps are near-white luminance patterns multiplied over vertex colour.
  const grass = new Pixmap(64, 64);
  grass.fill([206, 206, 206]);
  for (let i = 0; i < 900; i++) {
    const x = rng.int(0, 63);
    const y = rng.int(0, 63);
    const t = rng.next();
    const c: RGB = t < 0.35 ? [150, 150, 150] : t < 0.7 ? [236, 236, 228] : t < 0.92 ? [178, 182, 170] : [255, 250, 225];
    grass.set(x, y, c);
    if (t < 0.5) grass.set(x, y - 1, mixc(c, [206, 206, 206], 0.5)); // little blade strokes
  }

  const dirt = new Pixmap(64, 64);
  dirt.fill(hex('#b49a6e'));
  dirt.speckle(rng, [hex('#a48a60'), hex('#c4ab7f'), hex('#9a7f58'), hex('#cbb68c')], 0.45);
  for (let i = 0; i < 70; i++) {
    const x = rng.int(0, 63);
    const y = rng.int(0, 63);
    const c = rng.pick([hex('#d8c9a8'), hex('#cfc0a0'), hex('#8f8a80')]);
    dirt.rect(x, y, rng.int(1, 2), rng.int(1, 2), c);
    dirt.set(x, y + 2, hex('#7d6648'));
  }

  const cobble = new Pixmap(64, 64);
  masonry(cobble, rng, {
    rowH: [6, 8],
    blockW: [6, 10],
    tones: [hex('#a39a8a'), hex('#958c7e'), hex('#b2a996'), hex('#8a8478')],
    mortar: hex('#4c4538'),
    light: hex('#d7cdb6'),
    dark: hex('#5e574a'),
    moss: hex('#5d6e3a'),
    mossAmt: 3,
  });

  const stone = new Pixmap(64, 64);
  masonry(stone, rng, {
    rowH: [7, 10],
    blockW: [8, 16],
    tones: [hex('#8e8a82'), hex('#a09a8c'), hex('#7f7c78'), hex('#988f7f'), hex('#b0a792')],
    mortar: hex('#4a463f'),
    light: hex('#cfc6b2'),
    dark: hex('#56524c'),
    moss: hex('#4f6233'),
    mossAmt: 5,
  });

  const ruinStone = new Pixmap(64, 64);
  masonry(ruinStone, rng, {
    rowH: [8, 11],
    blockW: [10, 18],
    tones: [hex('#8a877b'), hex('#7d7a70'), hex('#94907f'), hex('#6f6c64')],
    mortar: hex('#3e3c35'),
    light: hex('#bdb6a2'),
    dark: hex('#4a4842'),
    moss: hex('#4a6030'),
    mossAmt: 12,
  });

  const castleStone = new Pixmap(64, 64);
  masonry(castleStone, rng, {
    rowH: [6, 7],
    blockW: [10, 14],
    tones: [hex('#b9b2a2'), hex('#aaa393'), hex('#c4bca9'), hex('#a09a8d')],
    mortar: hex('#6f6a60'),
    light: hex('#e2dac6'),
    dark: hex('#7c766b'),
  });

  const plaster = new Pixmap(64, 64);
  plaster.fill(hex('#e2d4b4'));
  plaster.speckle(rng, [hex('#d8c9a8'), hex('#eadcbe'), hex('#cfbf9c'), hex('#e6d9bd')], 0.5);
  for (let c = 0; c < 4; c++) {
    let x = rng.int(0, 63);
    let y = rng.int(0, 63);
    for (let s = 0; s < 10; s++) {
      plaster.set(x, y, hex('#a99a7c'));
      x += rng.int(-1, 1);
      y += 1;
    }
  }
  for (let b = 0; b < 3; b++) {
    // Patches where plaster has fallen to show stone.
    const x = rng.int(0, 60);
    const y = rng.int(0, 60);
    plaster.rect(x, y, rng.int(3, 6), rng.int(2, 4), hex('#9a9282'));
  }

  const timber = new Pixmap(32, 32);
  grain(timber, rng, hex('#5a3d26'), hex('#3b2617'), hex('#7a5536'), false);

  const planks = new Pixmap(64, 64);
  grain(planks, rng, hex('#7a5a3a'), hex('#4c3522'), hex('#9a7550'), true, 8);

  const roofTile = new Pixmap(64, 64);
  rooftiles(roofTile, rng, [hex('#a8492f'), hex('#b5553a'), hex('#9a4129'), hex('#bf6343'), hex('#8f3c27')], hex('#4e2218'), hex('#d98a62'), 8, 8);

  const slate = new Pixmap(64, 64);
  rooftiles(slate, rng, [hex('#4c5466'), hex('#555e70'), hex('#454c5c'), hex('#5d6577'), hex('#3f4554')], hex('#22252e'), hex('#7d879b'), 6, 9);

  const thatch = new Pixmap(64, 64);
  thatch.fill(hex('#b08b4c'));
  for (let x = 0; x < 64; x++) {
    let tone = rng.pick([hex('#b08b4c'), hex('#c39d5a'), hex('#9b773f'), hex('#d0ad6b'), hex('#8a6a38')]);
    for (let y = 0; y < 64; y++) {
      if (rng.next() < 0.12) tone = rng.pick([hex('#b08b4c'), hex('#c39d5a'), hex('#9b773f'), hex('#d0ad6b')]);
      thatch.set(x, y, y % 12 === 0 ? hex('#6e5430') : tone);
    }
  }

  const bark = new Pixmap(32, 64);
  bark.fill(hex('#5b4a3b'));
  for (let x = 0; x < 32; x++) {
    const t = rng.next();
    const c = t < 0.3 ? hex('#3d3128') : t < 0.6 ? hex('#6a5745') : t < 0.8 ? hex('#4f4033') : hex('#7b6a55');
    let len = 0;
    for (let y = 0; y < 64; y++) {
      if (len <= 0) len = rng.int(4, 14);
      len--;
      bark.set(x, y, len < 2 ? hex('#33291f') : c);
    }
  }
  for (let m = 0; m < 6; m++) bark.rect(rng.int(0, 31), rng.int(0, 63), 2, 3, hex('#5a6b35'));

  const birchBark = new Pixmap(32, 64);
  birchBark.fill(hex('#e3dfd2'));
  birchBark.speckle(rng, [hex('#d6d1c2'), hex('#ece8dc')], 0.4);
  for (let i = 0; i < 26; i++) {
    const y = rng.int(0, 63);
    const x = rng.int(0, 31);
    birchBark.rect(x, y, rng.int(3, 8), 1, hex('#2e2a26'));
  }

  // Leaves: clustered palette steps with dark interior masses (tinted by vertex colour).
  // Larger dabs than real leaves so they survive the low internal resolution.
  const leaves = new Pixmap(64, 64);
  leaves.fill([110, 110, 110]);
  for (let i = 0; i < 150; i++) {
    const cx = rng.int(0, 63);
    const cy = rng.int(0, 63);
    const t = rng.next();
    const c: RGB = t < 0.28 ? [52, 52, 56] : t < 0.6 ? [150, 150, 140] : t < 0.86 ? [205, 205, 185] : [252, 246, 210];
    const r = rng.range(1.2, 2.6);
    for (let y = -3; y <= 3; y++)
      for (let x = -3; x <= 3; x++) {
        const d = Math.hypot(x, y * 1.3);
        if (d > r) continue;
        // Each dab is lit on top and shaded beneath, like a painted leaf cluster.
        const k = y < 0 ? 1.12 : y > 1 ? 0.7 : 1;
        leaves.set(cx + x, cy + y, [c[0] * k, c[1] * k, c[2] * k]);
      }
  }
  const needles = new Pixmap(32, 32);
  needles.fill([100, 100, 100]);
  for (let i = 0; i < 260; i++) {
    const x = rng.int(0, 31);
    const y = rng.int(0, 31);
    const c: RGB = rng.chance(0.5) ? [150, 150, 150] : rng.chance(0.5) ? [60, 60, 60] : [200, 200, 185];
    needles.set(x, y, c);
    needles.set(x + 1, y + 1, c);
  }

  const rock = new Pixmap(64, 64);
  rock.fill(hex('#8a867c'));
  for (let i = 0; i < 40; i++) {
    const x = rng.int(0, 63);
    const y = rng.int(0, 63);
    const w = rng.int(4, 12);
    const h = rng.int(2, 5);
    const c = rng.pick([hex('#7b776e'), hex('#999488'), hex('#6c695f'), hex('#a7a193')]);
    rock.rect(x, y, w, h, c);
    for (let k = 0; k < w; k++) rock.set(x + k, y + h, hex('#57544c'));
    for (let k = 0; k < w; k++) rock.set(x + k, y - 1, hex('#b8b2a2'));
  }
  rock.speckle(rng, [hex('#5d6e3a'), hex('#6b7c44')], 0.04);

  const window = new Pixmap(16, 16);
  window.fill(hex('#1d1a22'));
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if ((x + y) % 7 === 0) window.set(x, y, hex('#3a3646'));
  window.rect(7, 0, 2, 16, hex('#3b2a1c'));
  window.rect(0, 7, 16, 2, hex('#3b2a1c'));

  const hay = new Pixmap(32, 32);
  hay.fill(hex('#c9a659'));
  hay.speckle(rng, [hex('#b5913f'), hex('#dcbc72'), hex('#a5843a'), hex('#e7cd88')], 0.6);

  cached = {
    grass: grass.toTexture(),
    dirt: dirt.toTexture(),
    cobble: cobble.toTexture(),
    stone: stone.toTexture(),
    ruinStone: ruinStone.toTexture(),
    castleStone: castleStone.toTexture(),
    plaster: plaster.toTexture(),
    timber: timber.toTexture(),
    planks: planks.toTexture(),
    roofTile: roofTile.toTexture(),
    slate: slate.toTexture(),
    thatch: thatch.toTexture(),
    bark: bark.toTexture(),
    birchBark: birchBark.toTexture(),
    leaves: leaves.toTexture(),
    needles: needles.toTexture(),
    rock: rock.toTexture(),
    window: window.toTexture(),
    hay: hay.toTexture(),
  };
  // Detail maps are linear multipliers, not colours.
  for (const t of [cached.grass, cached.leaves, cached.needles]) t.colorSpace = THREE.NoColorSpace;
  return cached;
}
