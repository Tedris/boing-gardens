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
| Hold    | stay up longer on the way up; wind the braid and climb on the way down |
| Release | let the arc fall                                         |
| 1 / 2 / 3 | pick a card during a level-up (on touch, tap the card)   |
| 1 – 5     | pick a jumper on the roster panel (on touch, tap the card)   |
| M       | mute                                                     |
| P / Esc | pause, or resume                                           |
| C       | swap jumper, but only while nothing is in motion             |

A run ends when a rope reaches the bottom of its sweep while a foot is still on the dirt.
With more than one rope a trip costs a rope instead of the run: the sweep restarts at
the top and she stumble-hops back in, so the last rope is the one that ends it. A rope that
has just joined the sweep gets one turn of that rule suspended, and the ropes that survive a
loss get half one (`rope.js:JOIN_SETTLE`, `BACK_SETTLE`), because a sweep you were never swept
in should not end the run before you have heard where the rope falls. A settling rope is drawn
faint, so it is obvious which one you are being let off.

What a wipeout looks like is drawn on the spot - a crumple, a topple, a sit - so the same
mistake does not look the same twice, and each one ends with her settled where she fell instead
of twitching in place. A live rope skips the draw: a fourth pose, rigid first, then flat. A
wipeout also lets go of the rope — the handles come down to the dirt with her, so it lies along
the ground instead of hanging from whatever position the fall left her arms in.

The title opens the roster before it lets a run start, because the jumper is the first
decision and there is no reason to hide it behind a menu: five of them, one rig, one set of
numbers. `C` or the swap button steps through the list without opening the panel, and both are
refused while a run is live — swapping legs mid-run would be a different run, not a shortcut.
Picking starts the next run there and then (`pickChar`), since a face that only arrives on the
run *after* this one reads as a dead button. The pick is not remembered across loads:
every opening frame is the roster's first row, and a number changes the run in front of you. A
run ends the way it began: the wipeout panel asks for the roster rather than dropping you back
in with the same face, because who you want to watch is a decision worth making again.

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
(`toon.js:createPost`). The camera is aimed, not aligned to the axes: a 17-degree yaw and a
7.6-degree downcast (`game.js:CAM_YAW`, `CAM_LIFT`), so she is a three-quarter figure —
one face of every box lit and one dark, and the rope's arc foreshortens as it turns
instead of sliding down a flat plane. Both are derived from the distance she is seen at, 9 m
down the depth axis, so the pose holds as the camera eases back with height. That distance
and angle are the ones the first browser build of this game used: same lens, same seat, so
the jumper stands where that build taught you to expect her.

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
- `roster.js` — the five jumpers as a table, not five engines: `look` is a palette remap plus
  shape scalars handed to `character.js:setLook` (plus `hair: false`, which puts Muffler in a
  cap and a scarf where everyone else has a bob). A row carries no numbers at all — every
  jumper takes off at the same speed on the same sweep, and only the cards move them — so the
  bounce is where the humour has to live: `squash` is how far the body pancakes on a landing
  and `jig` how far the soft parts swing on after it, both drawn rather than simulated, which
  is what lets one row flatten like a dropped pie and another stand perfectly still while
  everything above her neck is still arriving.
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
  It does not turn evenly: the rope's angle is the hand clock warped by `WHIP*sin(clock)`, so
  the sweep hangs overhead where it can be read - 60% of the descent instead of 50% - and then
  snaps past the feet, which cuts the threat window from 117 ms to 83 ms. The beat is untouched:
  a pass still lands on the same instant, and the hands keep the unwrapped clock, which is what
  makes the whip read as the rope's inertia instead of a stutter.
  All the ropes turn one shared clock and differ only by their offset, which holds the whole
  group inside `BUNDLE` - 0.23 s, one tap's worth of air, so a rope picked up is more skips per
  hop and never a second rhythm to survive. Six ropes cross at 0, 3, 5, 8, 11 and 14 frames into
  the beat and pay six skips for one hop. A rope joining mid-run needs no parking, only the turn
  of immunity it cannot have earned yet.
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

Skips raise a level - XP does, and XP is its own number rather than a mark on the skip count,
so a skip can be worth more than one. XP is never spent and never reset: the threshold moves up
to meet it, which is what lets the bar be drawn across three levels at once
(`game.js:XP_WINDOW`) with a tick at each boundary and the level count sitting above it, where a
level is acknowledged. The next threshold is solved from the live skip rate, one skip per rope
per revolution (`game.js:LEVEL_TIME`, 16 s), so a build with more ropes or a faster sweep earns
it out of more skips and the wait between picks holds still instead of drifting the way a
counting-up curve does. A hop that never left the ground much is a tight one and pays more
(`game.js:CRIT_APEX`): a tap peaks at 0.276 m against 0.49 m for a held hop, so the payout goes
to the play with the least margin, and the number it pays rides on the label so a build can see
it. Crit Caliper is the one card that pays in experience instead of height, speed or survival.
Each level offers three randomly drawn cards from eleven, and you keep one. Cards stack: jump
height, extra ropes, rope speed, a propeller braid, live wires, better draws, slower falls,
wider timing, a mid-air hop, a running multiplier, and the crit payout. Rope speed is on that
list and nowhere else: the
sweep holds one revolution a second for the whole run, so the timing learned on the first jump
is still true at minute nine.

Two gauges, deliberately unlike each other, because they answer different questions. The
experience ladder runs along the bottom in rose and only exists while she is jumping: it is the
one thing that tells you how far the next pick is. The braid's fuel is the blocked cyan column
on the right edge, under the rope count, and it carries nothing else - it used to stand in for
XP whenever no braid had been bought, which made one bar mean two different things depending on
the last card taken.

The braid is what turns the game from a jump-and-time loop into a climb-and-land loop, and it
spins back up every time she touches the ground - not only on a pick, which left it with well
under a second of climb per upgrade and nothing to say for itself. Buying it is the choice to
spend height instead of luck: the climb is free until she has to come down, and coming down is
the one moment the rope can take a rope off her. A live wire doubles what the rope pays and
changes how a wipeout looks, which is the whole cost.

## Staying clear of anyone's IP

- Name, character design, palette, UI copy and card names are original. She has a teal bob
  and a hair clip, not anyone else's silhouette, and the other four jumpers are that one
  rig recoloured and re-proportioned rather than five borrowed designs — Muffler's cap and scarf
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
| `game.js` | `LEVEL_TIME`, `CRIT_APEX`, `XP_WINDOW` | the wait a level is solved for, the hop height a tight skip has to stay under, and how many levels the XP bar is drawn across |
| `game.js` | `CAM_YAW`, `CAM_LIFT` | the three-quarter framing: side angle and tilt |
| `game.js` | `CLEAR`, `DROP` | the vertical band she must stay inside: above for body and rope hump, below for shoes and ground |
| `game.js` | `LOOK_AHEAD`, `CAM_CHASE` | how far the arc is predicted, and how fast a parked frame travels when it moves |
| `rope.js` | `R`, `BOW` | rope thickness, and how far the arc swings wide aloft |
| `rope.js` | `WHIP` | how far the sweep hangs aloft before it snaps past the feet |
| `rope.js` | `BUNDLE` | the span of time the group passes inside: one tap's worth of air |
| `rope.js` | `JOIN_SETTLE`, `BACK_SETTLE` | turns a new rope, or a rope that survived a loss, cannot end the run |
| `character.js` | `J` | hair and body springs: stiffness, damping, travel in snap blocks |
| `toon.js` | `PIXEL_H`, `SNAP` | internal rows and the vertex-snap block: the resolution of the whole look |
| `cards.js` | `CARDS` | the eleven upgrades and their numbers |
| `roster.js` | `ROSTER` | the five jumpers: look and blurb, and no numbers of their own |

## Checks

No build step and no test suite; behaviour was verified in a browser at 1024x707: title →
roster → pick by key → run → level-up draft → card pick by key → trip → game over → roster again,
five jumpers, three ropes turned live, and 700 m frames driven through
`window.game.script.fly()`. Framing was measured the same way, as her feet against the frame
centre: eight plain hops with no cards moved the frame 1 cm in total, and a six-metre jump, a
braid climb and a 350 m fall each kept her inside the band the camera is parked for (-2.7 to
+0.85 m). `window.game.debug` exposes live state (`y`, `vy`, `phase`, `phases`, `settle`, `xp`,
`skips`, `state`, `char`) and `debug.cam` the frame's own decisions (`lo`, `hi`, `up`, `down`,
`follow`, `a`); `window.game.script` drives input, grants cards and teleports, which is how
those runs were driven. Pacing, the tight-skip payout and the rope settle were measured the
same way, against a scripted player: picks at 15, 15.6, 15.9 and 16 s over a 75 s run that
picked up a rope and a speed card; 33 skips in 40 s with 97% of them tight, which is a pick
every 8 s, against 31 skips and no tight ones at all for the held line; and a rope granted
mid-sweep surviving its first turn, where it used to end the run inside a second.

The two gauges were read off the same scripted player: the ladder measured 2.08%, 8.33% and
27.08% at 1, 4 and 13 XP against a 16-skip level - the whole bar is three levels wide - and
33.33% at the moment a level landed, which is the first tick, where the next level's threshold
sits. Picking a card at 16 XP left XP at 16 and moved the threshold to 32, so nothing earned at
the top of a level is thrown away. The fuel column read empty with no braid owned and full the
moment one was, in cyan against the rose ladder, and the ladder fades out on the roster and the
card screen, where the same strip of screen belongs to the hint line.

Sweep timing was measured the same way, off the rope angles the collision code itself reads. With
the sweep parked at the top by `reset`, one hop at a known frame clears a whole group and the
crossings land at 30 (one rope), 17 and 30 (two), 16, 23, 30 (three), and 16, 19, 21, 24, 27, 30
(six): 233 ms of spread whatever the count, and skips equal to the number of ropes for that one
hop. Before the shared clock the same test put the second rope at 45 - after the hop had landed -
and could not get three ropes across at all, because each rope kept the lag it was parked with
while the offsets shrank under it. The hang measures 18 of the 30 frames of the descent spent
above the hand line, against 15 before, and a rope's threat window measures 83 ms against 117.
