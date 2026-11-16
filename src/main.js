// Boot: canvas, fixed-step loop, one-button input.
import { createGame } from './game.js';
import { sfx } from './audio.js';

const stage = document.getElementById('stage');
const game = createGame(stage);

function fit() {
  game.resize(innerWidth, innerHeight);
}
addEventListener('resize', fit);
fit();

const PRESS = new Set(['Space', 'ArrowUp', 'KeyW', 'Enter', 'NumpadEnter']);
let pressed = false;

addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (PRESS.has(e.code)) {
    e.preventDefault();
    if (!pressed) { pressed = true; game.press(); }
  } else if (/^Digit[1-5]$/.test(e.code)) {
    game.pick(+e.code.slice(5) - 1);
  } else if (e.code === 'KeyM') {
    toggleMute();
  }
});
addEventListener('keyup', (e) => {
  if (PRESS.has(e.code)) { pressed = false; game.release(); }
});

const down = (e) => {
  if (e.button !== undefined && e.button !== 0) return;
  game.press();
};
const up = () => game.release();
stage.addEventListener('pointerdown', down);
addEventListener('pointerup', up);
addEventListener('pointercancel', up);
addEventListener('blur', () => { pressed = false; game.release(); });
// stop the page from scrolling / long-press selecting on touch
addEventListener('contextmenu', (e) => e.preventDefault());

const muteBtn = document.getElementById('mute');
function toggleMute() {
  const m = muteBtn.dataset.m === '1';
  muteBtn.dataset.m = m ? '0' : '1';
  muteBtn.innerHTML = m ? '&#9835;' : '&#9835;&#822;';
  sfx.mute(!m);
}
muteBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleMute();
});

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.step(dt);
  game.renderer.render(game.scene, game.camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// small surface for automated checks
window.game = game;
