import '@fontsource/im-fell-english/400.css';
import '@fontsource/im-fell-english/400-italic.css';
import './ui/styles.css';
import { Game } from './app/game';

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

const params = new URLSearchParams(window.location.search);
const canvas = document.getElementById('game') as HTMLCanvasElement;

if (!webglAvailable()) {
  const el = document.getElementById('error')!;
  el.hidden = false;
  el.textContent = 'Hollow Atlas needs WebGL 2. Please use a current version of Chrome, Edge, Firefox or Safari (desktop or mobile) with hardware acceleration enabled.';
} else {
  const game = new Game(canvas, {
    autotest: params.has('autotest'),
    seed: params.get('seed'),
    debug: params.has('debug'),
    gallery: params.has('gallery'),
  });
  (window as unknown as { __hollowAtlas: unknown }).__hollowAtlas = game.testApi;
  window.addEventListener('error', (e) => game.errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => game.errors.push(String(e.reason)));
  game.start();
}
