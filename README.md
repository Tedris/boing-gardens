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
| Press   | leave the ground; the press that starts a run is its first jump |
| Hold    | stay up longer on the way up; burn rocket fuel in the air |
| Release | let the arc fall                                         |
| 1 / 2 / 3 | pick a card during a level-up (on touch, tap the card)   |
| 1 – 5     | pick a jumper on the roster panel (on touch, tap the card)   |
| M       | mute                                                     |
| P / Esc | pause, or resume                                           |
| C       | swap jumper, but only while nothing is in motion             |

A run ends when a rope reaches the bottom of its sweep while a foot is still on the dirt.
With more than one rope a trip costs a rope instead of the run: the sweep restarts at
the top and she stumble-hops back in, so the last rope is the one that ends it.

The title opens the roster before it lets a run start, because the jumper is the first
decision and there is no reason to hide it behind a menu: five of them, one rig. `C` or
the swap button steps through the list without opening the panel, and both are refused
while a run is live — swapping legs mid-run would be a different run, not a shortcut.
Picking re-seeds the run numbers where it happens (`pickChar`), since numbers that only
arrive on the *next* run read as a dead button.

A run also pauses itself when the tab or window loses focus, so an alt-tab or an
app switch is never a wipeout. On a phone the pause button is the only way in and
a tap anywhere is the way out; the press that lifts a pause never also jumps,
because the sweep freezes wherever it happened to be.

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

Browsers that never fire pointer events (iOS 12, a few in-app webviews) bind the
older `touchstart`/`touchend` pairs instead, and `[data-touch]` is written by an
inline script in `index.html` *before* the modules run, so a phone whose WebGL
boot dies still reads TAP ANYWHERE rather than looking like a phone whose taps
are being ignored. Anything that fails to load or throws on boot is named in a
strip at the foot of the screen (`#boot`) for the same reason: from here, a
phone that shows nothing and a phone that ignores input are the same report.

## How the look is made

A PS1-era software renderer, approximated in two passes. The scene is real 3D - boxes,
flat-shaded Lambert facets, one directional light, one fog - rendered into a 240-row
target and then upscaled by hand: sRGB encode, 4x4 Bayer dither, quantise to 31 levels
(`toon.js:createPost`). The camera is aimed, not aligned to the axes: a fixed 16-degree
yaw and a slight tilt (`game.js:CAM_YAW`, `CAM_LIFT`), so she is a three-quarter figure —
one face of every box lit and one dark, and the rope's arc foreshortens as it turns
instead of sliding down a flat plane. The angle is derived from the camera distance, so
it holds as the camera eases back with height.

Everything else follows from those two decisions:

- vertices snap to a 2-pixel grid in the vertex shader (`toon.js:SNAP`), which is where
  the wobble-as-you-move comes from, for free;
- only a handful of real colours exist (`toon.js:C`), and the dither is trusted to make
  the in-betweens instead of a gradient;
- the fog's clear zone travels with the camera (`game.js`), so she is never inside the
  haze that dissolves the world behind her - a fixed near edge fogs the subject at 8 m
  and erases her above 300 m;
- the rope, the embers and the stars are unlit and fog-exempt: the sweep has to stay the
  brightest thing on screen.

No textures, no shadow maps (the contact shadow is a disc), no imported assets. The canvas
is `image-rendering: pixelated` so the browser cannot smooth the pass away.

## How the animation works

There are no animation clips. Every pose is solved per frame from gameplay state, which
is what keeps it readable at any rope count or height:

- `character.js` - rig built from boxes, then driven: damped springs for squash, stretch,
  lean, nod, the bob and the scarf; a two-bone IK (`reach`) aims the hands at the anchors the rope
  hangs from, so the arm pose is a *consequence* of the rope instead of a keyframed guess
  that has to match it.
- `roster.js` — the five jumpers as a table, not five engines: `look` is a palette remap
  plus shape scalars handed to `character.js:setLook` (plus `hair: false`, which puts Muffler
  in a cap and a scarf where everyone else has a bob), and `apply` patches a fresh run's
  numbers in the same style as a card, so a character is a starting build that cards still
  stack on top of. The blurb is the spec — if she falls like a rumour, `fallDrag` says so.
- `rope.js` — each rope is a real arc rotating around the hand axis, beaded so the sweep is
  legible and the stripes read at speed, and bowing outward aloft so it reads as a rope on
  a pivot rather than a narrow hoop. It turns the way a rope actually turns - down the
  front, under the feet, up the back - so depth enters as `-sin(theta)` and the hand target
  in `character.js` sweeps with it. It clamps to the floor instead of passing
  through it, which is what ropes do. Whether a sweep counts is *not* read off that arc:
  the jump stretch and arm swing lift the hands, so the pass/fail plane follows her feet
  instead: off the floor when the rope comes round is a skip, a foot down is a wipeout.
  The rope hangs from her hands, and matrices only refresh at draw time, so `game.js`
  adds the height gained since the last frame before asking where they are - at 100 m/s
  that is a two-metre error otherwise.
  Extra ropes lag a quarter turn (`LAG`) behind the one before them, so at one revolution a
  second the second rope arrives 0.25 s later - still inside the same hop, which is what makes
  a second rope mean more skips rather than one thicker rope. Past three ropes the step tightens
  so the last pass still lands inside one held hop (`HOP_SPAN`). A rope joining mid-run is
  parked off the live sweep, because its own angle froze at the last reset and would otherwise
  land it at the top of the arc whenever the card happened to be picked.
- `world.js` - a dark stage that reads as one: a dusty floor slab, skyline silhouettes that
  swap as she climbs, a cloud band that recycles around the camera, sky that fades to space
  with stars tiering in above it. All altitude-driven, and the sky colour it returns *is*
  the fog colour, so the two can never disagree about what height this is.
- `game.js` — one-button physics, the level-up draft, camera. The camera is *parked*: it sits
  over a height, and nothing about a hop moves it. What moves it is the arc, guessed ahead of
  time — the frame holds the range of heights that keep both the predicted apex and the
  predicted landing inside the band her body, bob and rope hump need, and slides only when that
  range stops containing it. An arc longer than the band, which is a long fall, leaves the range
  empty: then the frame follows her outright rather than getting somewhere first. Prediction and
  framing both read the same numbers the integrator does (`arcY`), so they cannot disagree about
  where she is going. Every run begins in `startRun()`, which clears stats *and* the dead flag:
  a run that inherits the last one's death cannot end, because `trip()` refuses to kill a run
  already marked dead.
- `audio.js` — synthesised: envelopes on oscillators plus filtered noise. No files.

The only soft parts left are the bob strands, one scarf and one body spring
(`character.js:J`): blocks do not jiggle, so the acting is silhouette - squash, tuck, lean, hair.

## Loop

Skips raise a level. Each level offers three randomly drawn cards from ten, and you keep
one. Cards stack: jump height, extra ropes, rope speed, rocket laces, fire, better draws,
slower falls, wider timing, a mid-air hop, and a running multiplier. Rope speed is on that
list and nowhere else: the sweep holds one revolution a second for the whole run, so the
timing learned on the first jump is still true at minute nine.

Rockets refill on every pick, which is the trick that turns the game from a jump-and-time
loop into a hover-and-dodge loop. There is no meta-progression and no unlock tree: every
run starts from the same numbers, other than the ones the jumper you picked brought with
her. Nothing you earn carries between runs.

## Staying clear of anyone's IP

- Name, character design, palette, UI copy and card names are original. She has a teal bob
  and a hair clip, not anyone else's silhouette, and the other four jumpers are that one
  rig recoloured and re-tuned rather than five borrowed designs — Muffler's cap and scarf
  included, since that silhouette comes from this project's own earlier browser build.
  Everyone in here is a
  rectangle, which settles the suggestive-content question at the source.
- Geometry, the face, the palette and audio are generated in this repo. No imported model,
  texture, audio or font file exists here; `vendor/three.module.js` is MIT three.js.
- Mechanics are not owned: one button, a jump rope, three-card drafts and stacking
  upgrades are the vocabulary of the genre. The expression (art, code, text, sound) is
  what has to differ, and it does, because it was written from scratch.
- Only public store/marketplace pages and coverage were read for reference: what the loop
  is, what the HUD shows, how the camera frames her. No asset, file or capture was copied,
  downloaded or traced.

## Knobs worth knowing

| Where | Knob | Effect |
| ----- | ---- | ------ |
| `game.js` | `JUMP_V`, `HOLD_LIFT`, `HOLD_MAX` | tap height, what a held press adds to it, and when that apex arrives |
| `game.js` | `BASE_SPEED` | sweep cadence: one revolution a second |
| `game.js` | `ROPE_A` | rope length; sets how low the sweep passes |
| `game.js` | `ROPE_W` | danger window around the bottom of the sweep |
| `game.js` | `CAM_YAW`, `CAM_LIFT` | the three-quarter framing: side angle and tilt |
| `game.js` | `CLEAR`, `DROP` | the vertical band she must stay inside: above for body and rope hump, below for shoes and ground |
| `game.js` | `LOOK_AHEAD`, `CAM_CHASE` | how far the arc is predicted, and how fast a parked frame travels when it moves |
| `rope.js` | `R`, `BOW` | rope thickness, and how far the arc swings wide aloft |
| `rope.js` | `LAG`, `HOP_SPAN` | rope spacing: a quarter turn apart, tightened so every pass fits inside one held hop |
| `character.js` | `J` | hair and body springs: stiffness, damping, travel in snap blocks |
| `toon.js` | `PIXEL_H`, `SNAP` | internal rows and the vertex-snap block: the resolution of the whole look |
| `cards.js` | `CARDS` | the ten upgrades and their numbers |
| `roster.js` | `ROSTER` | the five jumpers: look, blurb and starting numbers |

## Checks

No build step and no test suite; behaviour was verified in a browser at 1024x707: title →
roster → pick by key → run → level-up draft → card pick by key → trip → game over → restart,
five jumpers, three ropes with fire, and 700 m frames driven through
`window.game.script.fly()`. Framing was measured the same way, as her feet against the frame
centre: eight plain hops with no cards moved the frame 1 cm in total, and a six-metre jump, a
rocket climb and a 350 m fall each kept her inside the band the camera is parked for (-2.7 to
+0.85 m). `window.game.debug` exposes live state (`y`, `vy`, `phase`, `skips`, `state`, `char`)
and `debug.cam` the frame's own decisions (`lo`, `hi`, `up`, `down`, `follow`, `a`);
`window.game.script` drives input, grants cards and teleports, which is how those runs were
driven.
