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
  } else if (e.code === 'KeyP' || e.code === 'Escape') {
    togglePause();
  } else if (e.code === 'KeyC') {
    game.cycleCharacter();
  }
});
addEventListener('keyup', (e) => {
  if (PRESS.has(e.code)) { pressed = false; game.release(); }
});

// One button, two hands: a key on a desk, a tap anywhere on a phone. These live
// on the window because #screen and #draft cover the canvas, so a tap on the
// title or on the backdrop never reached #stage - with the listener on the
// stage, a touch-only machine could not start a run at all.
const isControl = (t) => !!(t && t.closest && t.closest('#mute, #pause, #swap, .card'));
const down = (e) => {
  if (e.pointerType === 'touch') game.setTouchUI(true);
  if (e.button !== undefined && e.button > 0) return;
  if (isControl(e.target)) return;
  game.press();
};
const up = () => game.release();
// iOS 12 and a few in-app webviews never fire pointer events, which otherwise
// leaves a fully rendered game wired to nothing at all: the taps simply have no
// listener. Bind the older touch/mouse pairs there.
if (window.PointerEvent) {
  addEventListener('pointerdown', down);
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);
} else {
  addEventListener('touchstart', (e) => {
    game.setTouchUI(true);
    if (!isControl(e.target)) game.press();
  }, { passive: true });
  addEventListener('touchend', up);
  addEventListener('touchcancel', up);
  addEventListener('mousedown', down);
  addEventListener('mouseup', up);
}
// Losing the window is not a wipeout: the run waits instead of sweeping on
// without a player, which is the difference between alt-tabbing and dying.
addEventListener('blur', () => { pressed = false; game.release(); game.setPause(true); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { game.setPause(true); }
});
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

const pauseBtn = document.getElementById('pause');
function togglePause() {
  game.togglePause();
  paintPause();
}
/** The glyph says what the button will do next, because on a phone it is the only
    way into a pause - a frozen two-bar icon would just look broken. */
function paintPause() {
  const p = game.debug.paused ? '1' : '0';
  if (pauseBtn.dataset.p === p) return;
  pauseBtn.dataset.p = p;
  pauseBtn.innerHTML = p === '1' ? '&#9654;' : '&#10073;&#10073;';
}
pauseBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  togglePause();
});
paintPause();

document.getElementById('swap').addEventListener('click', (e) => {
  e.stopPropagation();
  game.cycleCharacter();
});

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.step(dt);
  paintPause();          // the panel can also be lifted by a tap anywhere
  game.render();          // the pixel buffer and the one post pass, in game.js
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// small surface for automated checks
window.game = game;
