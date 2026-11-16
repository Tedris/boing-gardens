# Boing Gardens

A one-button jump-rope toy that climbs forever. Original code, geometry, shading and
sound — nothing in here came from another game.

Run it:

```
python3 -m http.server 8391    # or any static server
# open http://127.0.0.1:8391/index.html
```

`vendor/three.module.js` is three.js r170 (MIT), vendored so the page runs offline.

## Controls

One button does everything: space / up / W / click / tap.

| Input   | Effect                                                  |
| ------- | ------------------------------------------------------- |
| Press   | leave the ground                                         |
| Hold    | stay up longer on the way up; burn rocket fuel in the air |
| Release | let the arc fall                                         |
| 1 / 2 / 3 | pick a card during a level-up (on touch, tap the card)   |
| M       | mute                                                     |

A run ends when a rope reaches the bottom of its sweep while a foot is still on the dirt.

### Phones

Touch mode is decided at load from three signals, because each one lies on its
own: a coarse pointer (the honest one), a touch capability, a mobile browser's
UA. `main.js` also flips it the first time a real finger lands, so a machine
with both keeps the keyboard copy until it is touched. `game.js` writes
`[data-touch]` on the root and `index.html` keys its copy off that, so the same
page says TAP ANYWHERE and TAP A CARD instead of PRESS SPACE and PRESS 1 / 2 / 3.

The pointer listener lives on the *window*, not on `#stage`: the title and draft
overlays cover the canvas, so a tap on them never reached the stage and the game
could not be started by touch at all. `#mute` and `.card` are excluded by target,
or muting would also be a jump. Layout follows `(pointer: coarse), (max-width:
720px)` for stacked cards and `(max-height: 520px)` for landscape, with
`env(safe-area-inset-*)` on every edge element under `viewport-fit=cover`.

## How the look is made

"3D that reads as 2D", the cheap way: a 22° camera on a dead-on axis with no rotation,
a 2–3 step cel ramp (`toon.js:ramp`) so light changes in hard bands, and inverted-hull
outlines on every silhouette (`toon.js:ink`). No post-processing, no render targets.

## How the animation works

There are no animation clips. Every pose is solved per frame from gameplay state, which
is what keeps it readable at any rope count or height:

- `character.js` — rig built from primitives, then driven: damped springs for squash and
  stretch, lean, nod, hair strands, and soft-body bounce; a two-bone IK (`reach`) aims the
  hands at the anchors the rope hangs from, so the arm pose is a *consequence* of the rope
  instead of a keyframed guess that has to match it.
- `rope.js` — each rope is a real arc rotating around the hand axis, beaded so the sweep
  is legible and the stripes read at speed. It turns the way a rope actually turns - down
  the front, under the feet, up the back - so depth enters as `-sin(theta)` and the hand
  target in `character.js` sweeps with it. It clamps to the floor instead of passing
  through it, which is what ropes do. Whether a sweep counts is *not* read off that arc:
  the jump stretch and arm swing lift the hands, so the pass/fail plane follows her feet
  instead: off the floor when the rope comes round is a skip, a foot down is a wipeout.
  The rope hangs from her hands, and matrices only refresh at draw time, so `game.js`
  adds the height gained since the last frame before asking where they are - at 100 m/s
  that is a two-metre error otherwise.
- `world.js` — park at ground level, a cloud band that recycles around the camera, sky
  that fades to space, all altitude-driven.
- `game.js` — one-button physics, the level-up draft, camera. Vertical camera tracking is
  near-rigid so a rocket climb can't walk her out of frame. Every run begins in
  `startRun()`, which clears stats *and* the dead flag: a run that inherits the last one's
  death cannot end, because `trip()` refuses to kill a run already marked dead.
- `audio.js` — synthesised: envelopes on oscillators plus filtered noise. No files.

Soft-body bounce lives in `character.js:J`. Amplitudes are small and clothed; the joke is
the timing (a well-timed skip should make something wobble that was not asked to), not
anatomy.

## Loop

Skips raise a level. Each level offers three randomly drawn cards from ten, and you keep
one. Cards stack: jump height, extra ropes, rope speed, rocket laces, fire, better draws,
slower falls, wider timing, a mid-air hop, and a running multiplier.

Rockets refill on every pick, which is the trick that turns the game from a jump-and-time
loop into a hover-and-dodge loop. There is no meta-progression and no unlock tree: every
run starts from the same numbers.

## Staying clear of anyone's IP

- Name, character design, palette, UI copy and card names are original. She has a teal bob
  and a hair clip, not anyone else's silhouette.
- Geometry, textures, canvas-drawn face atlas and audio are generated in this repo. No
  imported model, texture, audio or font files exist here.
- Mechanics are not owned: one button, a jump rope, three-card drafts and stacking
  upgrades are the vocabulary of the genre. The expression (art, code, text, sound) is
  what has to differ, and it does, because it was written from scratch.
- Only public store/marketplace pages and coverage were read for reference: what the loop
  is, what the HUD shows, how the camera frames her. No asset, file or capture was copied,
  downloaded or traced.

## Knobs worth knowing

| Where | Knob | Effect |
| ----- | ---- | ------ |
| `game.js` | `JUMP_V`, `G` | airtime, and therefore the timing window |
| `game.js` | `BASE_SPEED` | rope revolutions per second |
| `game.js` | `ROPE_A` | rope length; sets how low the sweep passes |
| `game.js` | `ROPE_W` | danger window around the bottom of the sweep |
| `character.js` | `J` | spring stiffness, damping and travel limits |
| `cards.js` | `CARDS` | the ten upgrades and their numbers |

## Checks

No build step and no test suite; behaviour was verified in a browser at 1280x720:
title → run → level-up draft → card pick by key → trip → game over → restart, plus
60 fps at three ropes, multi-hundred-metre altitude frames, and per-frame sampling of the
soft-body springs to confirm they travel asymmetrically instead of sitting at their
clamps. `window.game.debug` exposes live state (`y`, `vy`, `phase`, `skips`, `state`) and
`window.game.script` can drive input and grant cards, which is how those runs were driven.
