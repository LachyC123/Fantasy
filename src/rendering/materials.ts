/**
 * One shared material per surface family. Geometry UVs are in metres; each
 * texture's repeat converts metres to tiles so texel density stays uniform.
 */
import * as THREE from 'three';
import { getTextures } from './textures';
import { patchMaterial, windDepthMaterial } from './atmosphere';

export type MaterialName =
  | 'stone'
  | 'ruinStone'
  | 'castleStone'
  | 'castleRoof'
  | 'plaster'
  | 'timber'
  | 'planks'
  | 'roofTile'
  | 'slate'
  | 'thatch'
  | 'window'
  | 'glowWindow'
  | 'metal'
  | 'bark'
  | 'birchBark'
  | 'leaves'
  | 'needles'
  | 'rock'
  | 'hay'
  | 'dirt'
  | 'cobble'
  | 'plain'
  | 'grass'
  | 'foliagePlain';

export class MaterialLibrary {
  private readonly mats = new Map<MaterialName, THREE.Material>();
  private readonly depthMats = new Map<MaterialName, THREE.Material>();

  constructor() {
    const t = getTextures();
    const rep = (tex: THREE.Texture, metresU: number, metresV = metresU): THREE.Texture => {
      tex.repeat.set(1 / metresU, 1 / metresV);
      return tex;
    };
    const lambert = (map: THREE.Texture | null, opts: THREE.MeshLambertMaterialParameters = {}): THREE.MeshLambertMaterial =>
      new THREE.MeshLambertMaterial({ map, vertexColors: true, ...opts });

    this.mats.set('stone', patchMaterial(lambert(rep(t.stone, 3))));
    this.mats.set('ruinStone', patchMaterial(lambert(rep(t.ruinStone, 3.5))));
    this.mats.set('castleStone', patchMaterial(lambert(rep(t.castleStone, 5))));
    this.mats.set('castleRoof', patchMaterial(lambert(rep(t.slate.clone(), 4))));
    this.mats.set('plaster', patchMaterial(lambert(rep(t.plaster, 3))));
    this.mats.set('timber', patchMaterial(lambert(rep(t.timber, 0.8))));
    this.mats.set('planks', patchMaterial(lambert(rep(t.planks, 2.4))));
    this.mats.set('roofTile', patchMaterial(lambert(rep(t.roofTile, 2.4))));
    this.mats.set('slate', patchMaterial(lambert(rep(t.slate, 2.4))));
    this.mats.set('thatch', patchMaterial(lambert(rep(t.thatch, 3))));
    this.mats.set('window', patchMaterial(lambert(rep(t.window, 1))));
    this.mats.set('glowWindow', patchMaterial(lambert(rep(t.window.clone(), 1), { emissive: new THREE.Color('#ffb257'), emissiveIntensity: 0.55 })));
    this.mats.set('metal', patchMaterial(lambert(null)));
    this.mats.set('bark', patchMaterial(lambert(rep(t.bark, 1.2, 2.4)), { wind: 'trunk' }));
    this.mats.set('birchBark', patchMaterial(lambert(rep(t.birchBark, 1.0, 2.0)), { wind: 'trunk' }));
    this.mats.set('leaves', patchMaterial(lambert(rep(t.leaves, 3.2)), { wind: 'foliage', translucency: 0.45 }));
    this.mats.set('needles', patchMaterial(lambert(rep(t.needles, 1.2)), { wind: 'foliage', translucency: 0.25 }));
    this.mats.set('foliagePlain', patchMaterial(lambert(null), { wind: 'foliage', translucency: 0.35 }));
    this.mats.set('grass', patchMaterial(lambert(null, { side: THREE.DoubleSide }), { wind: 'grass', translucency: 0.5 }));
    this.mats.set('rock', patchMaterial(lambert(rep(t.rock, 3))));
    this.mats.set('hay', patchMaterial(lambert(rep(t.hay, 1.5))));
    this.mats.set('dirt', patchMaterial(lambert(rep(t.dirt, 4))));
    this.mats.set('cobble', patchMaterial(lambert(rep(t.cobble, 2.6))));
    this.mats.set('plain', patchMaterial(lambert(null)));
    // The castle roof slate is bluer and larger in scale.
    (this.mats.get('castleRoof') as THREE.MeshLambertMaterial).color.set('#c9d0e6');

    this.depthMats.set('leaves', windDepthMaterial('foliage'));
    this.depthMats.set('needles', windDepthMaterial('foliage'));
    this.depthMats.set('foliagePlain', windDepthMaterial('foliage'));
    this.depthMats.set('grass', windDepthMaterial('grass'));
    this.depthMats.set('bark', windDepthMaterial('trunk'));
    this.depthMats.set('birchBark', windDepthMaterial('trunk'));
  }

  get(name: MaterialName): THREE.Material {
    const m = this.mats.get(name);
    if (!m) throw new Error(`Unknown material ${name}`);
    return m;
  }

  /** Custom depth material for shadow casting with wind, if any. */
  depth(name: MaterialName): THREE.Material | undefined {
    return this.depthMats.get(name);
  }

  has(name: string): name is MaterialName {
    return this.mats.has(name as MaterialName);
  }
}
