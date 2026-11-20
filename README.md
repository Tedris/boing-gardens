# Boing Gardens

A one-button jump-rope toy with one goal: 260 metres up, where the air runs out. Original code,
geometry, shading and sound — nothing in here came from another game.

Run it:

```
python3 -m http.server 8391    # or any static server
# open http://127.0.0.1:8391/index.html
```

`vendor/three.module.js` is three.js r170 (MIT), vendored so the page runs offline.

`index.html` asks for `src/main.js?v=022d4b3`, and that query is the whole cache policy. GitHub Pages
serves every file at `max-age=600`, so a returning reader revalidates within ten minutes - but a page
loaded a minute before a deploy would otherwise pair a fresh document with a cached entry module,
which is a new page running old code. Bump the query to the commit you are shipping whenever anything
under `src/` changes; it is one line and nothing automates it. It covers the entry only, so the
modules `main.js` imports still have a ten-minute window of their own at the far end.

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

A run ends one of two ways: a rope reaches the bottom of its sweep while a foot is still on the
dirt, or she gets to 260 m, which ends it as a win (`game.js:WIN_H`, and its own section below).
With more than one rope a trip costs a rope instead of the run: the sweep restarts at
the top and she stumble-hops back in, so the last rope is the one that ends it. A rope that
has just joined the sweep gets one turn of that rule suspended, and the ropes that survive a
loss get half one (`rope.js:JOIN_SETTLE`, `BACK_SETTLE`), because a sweep you were never swept
in should not end the run before you have heard where the rope falls. A settling rope is drawn
faint, so it is obvious which one you are being let off.

The rope count is kept two ways: how many are turning, and the most the run has had. The right-edge
readout shows `3/12` while the run is under its own high-water mark, so a lost rope stays visible
after the toast has gone, and Another Rope never leaves the draft - a run can be back down to one
rope after a bad patch and that card is still the way out. There is no ceiling on the count and the
pool builds a rope the first time a run asks for one; the reference publishes none either, the
store copy saying only that a card adds a rope while a player reported carrying past seventy in one
run. What holds a deep build down is the bundle's own arithmetic, in the next section, rather than
a number anyone typed in.

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
  the sweep hangs overhead where it can be read - 63% of the descent instead of half - and then
  snaps past the feet, which cuts the threat window to 117 ms against the 161 ms an even sweep at
  the same cadence would spend there. The beat is untouched: a pass still lands on the same
  instant, and the hands keep the unwrapped clock, which is what makes the whip read as the rope's
  inertia instead of a stutter.
  All the ropes turn one shared clock and differ only by their offset, which holds the whole group
  inside `BUNDLE` - 0.23 s of real time, one tap's worth of air, spaced against the current turn so
  a faster sweep does not squeeze the stripes together. The spacing stops compressing at one frame
  between neighbours (`GAP_MIN`, about fifteen ropes), and from there the bundle widens instead of
  two ropes landing on one instant: twenty cross inside 300 ms and pay twenty skips for one hop,
  thirty take 450 ms and a tap pays 23 of them, because the hop is a fall and does not stretch
  because the group grew. A rope joining mid-run needs no parking, only the turn of immunity it
  cannot have earned yet. A fresh run also parks the sweep a quarter turn past the top
  (`rope.js:AT_START`) so the first pass lands under the launch arc the opening press doubles as.
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
counting-up curve does. A crit is a roll on the skip itself rather than a property of the hop:
one skip in ten pays double (`cards.js:CRIT_BASE`) and any skip that counts can be the one, so
the label flying off the counter is the only tell that luck just landed. Crit Caliper is the one
card that pays in experience instead of height, speed or survival, and it buys the chance and not
the payout - four of them make it every other skip.
Each level offers three randomly drawn cards from eleven, and you keep one. No card is capped, so
the same one can come round as often as the picks hand it out and a build can go as deep into any
of them as it likes. Cards stack: jump height, extra ropes, rope speed, a propeller braid, live
wires, better draws, slower falls, wider timing, a mid-air hop, a running multiplier, and the crit
chance. Rope speed is on that list and nowhere else: the sweep holds three revolutions every four
seconds for the whole run, so the timing learned on the first jump is still true at minute nine.
A better draw is the one card whose effect the deck bounds - past eight copies of it there is
nothing left to offer - and at that point the draft puts the whole eleven on screen in two rows,
keyed 1 to 9, then 0, then -, because every card on the screen has to have a key of its own.

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

What the braid pays falls off with climb speed and pays nothing above `HOVER_K * jumpV`
(`game.js:hoverA`), so past the point where it beats gravity it holds her up rather than throwing
her up: the climb travels at a speed the jump sets. That tie is what keeps the rest of the deck in
the run. Left flat, four copies of the card were simply a bigger gravity - the arc stopped being an
arc, and every card that edits the arc went quiet with it, the mid-air hop included, whose whole
rule is that it replaces a fall. With the ceiling tied to `jumpV`, Higher Soles is the lever on the
climb again and Second Wind fires the moment she comes down, which is when a hop has something to
replace. A braid that cannot beat gravity - one copy to three - has nothing to taper and stays the
lift assist it always was.

## Winning, and what it leaves behind

There is one goal and it is a height: 260 m (`game.js:WIN_H`). The number is not a threshold picked
for a trophy - it is where the stage stops having anything to say. `world.js:BANDS` runs out at
150 m, the stars tier in above that, and the `space` ramp the fog is solved against is finished at
260. The win is the place the scenery was already built to stop, and the run ends the moment she
crosses it.

Nothing drops her when it happens. The braid stops, the rope stays in her hands, and the way down is
the ending: every skyline tier she climbed goes by in the wrong order, `coming down` on the hint
line, and the panel comes up when she is back on the dirt - or after 4.6 s of descent, whichever
comes first, because Puffy Overalls can stretch 260 m to eight seconds and that is a long time to
make anyone watch. It reads `SPACE REACHED` where a trip reads `WIPEOUT`, over the one sound nothing
else plays, and she is not limp on the way down: `dead` stays false, which is the flag the fall poses
and the airborne pose both read, so a win brings her home upright (`game.js:winRun`).

A finished run leaves two numbers behind, won or wiped out: the score it banked and the height it
reached. Each one writes a row to `localStorage` under `boing-gardens-runs` (`records.js:addRun`),
and the two boards on the title and ending panels are read straight off those rows, so a record can
never disagree with the run it came from. Five rows to a board, twenty-four kept, and kept rows are
trimmed by rank rather than by age - the row that goes is the one sitting worst on *both* boards, so
a board cannot lose the record it is showing. The row this run wrote is marked `NEW`; a row that
ended in a win is marked `SPACE` on the score board, and not on the height board, where the number
already says it.

That is everything that is remembered. The pick of jumper still is not saved - every opening frame is
the roster's first row - and the one number this used to keep, the best skip count, is gone: skips are
what raise a level rather than what a run is remembered by, and once there are two boards the number
has nowhere to be shown, so the first touch of storage removes the key that held it.

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
| `game.js` | `BASE_SPEED` | sweep cadence: three revolutions every four seconds |
| `game.js` | `ROPE_A` | rope length; sets how low the sweep passes |
| `game.js` | `ROPE_W` | danger window around the bottom of the sweep |
| `game.js` | `LEVEL_TIME`, `XP_WINDOW` | the wait a level is solved for, and how many levels the XP bar is drawn across |
| `game.js` | `WIN_H` | the height that ends a run as a win: 260 m, where the `space` ramp the fog reads runs out |
| `game.js` | `CAM_YAW`, `CAM_LIFT` | the three-quarter framing: side angle and tilt |
| `game.js` | `CLEAR`, `DROP` | the vertical band she must stay inside: above for body and rope hump, below for shoes and ground |
| `game.js` | `LOOK_AHEAD`, `CAM_CHASE` | how far the arc is predicted, and how fast a parked frame travels when it moves |
| `game.js` | `VY_MAX`, `ASCEND_DRAG` | the speed a climb tops out at, and how hard the air takes the excess back |
| `game.js` | `HOVER_K` | the braid's ceiling in multiples of the launch speed: how fast a hover climbs, and why jump height raises it |
| `game.js` | `FALL_DRAG_MIN` | how slow a fall may be slowed to, which is what keeps the descent arriving on the beat |
| `rope.js` | `R`, `BOW` | rope thickness, and how far the arc swings wide aloft |
| `rope.js` | `WHIP` | how far the sweep hangs aloft before it snaps past the feet |
| `rope.js` | `BUNDLE` | the span of time the group passes inside: one tap's worth of air |
| `rope.js` | `AT_START` | where the sweep waits between runs, which sets how long the opening arc has to be |
| `rope.js` | `JOIN_SETTLE`, `BACK_SETTLE` | turns a new rope, or a rope that survived a loss, cannot end the run |
| `rope.js` | `GAP_MIN` | the tightest the bundle may pack its ropes: one frame per neighbour, past which the group widens |
| `character.js` | `J` | hair and body springs: stiffness, damping, travel in snap blocks |
| `toon.js` | `PIXEL_H`, `SNAP` | internal rows and the vertex-snap block: the resolution of the whole look |
| `cards.js` | `CARDS` | the eleven upgrades and their numbers |
| `cards.js` | `CRIT_BASE`, `CRIT_STEP` | the luck on any one skip, and what a Crit Caliper adds to it |
| `roster.js` | `ROSTER` | the five jumpers: look and blurb, and no numbers of their own |
| `records.js` | `BOARD`, `KEEP` | rows per board, and rows kept; kept rows are trimmed by rank, never by age |
| `index.html` | `src/main.js?v=` | the entry's cache version: bump it to the commit you ship when anything under `src/` changes |

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
those runs were driven. Pacing and the rope settle were measured the same way, against a scripted
player: picks at 15, 15.6, 15.9 and 16 s over a 75 s run that picked up a rope and a speed card,
33 skips in 40 s against 31 for the held line; and a rope granted mid-sweep surviving its first
turn, where it used to end the run inside a second.

The two gauges were read off the same scripted player: the ladder measured 2.08%, 8.33% and
27.08% at 1, 4 and 13 XP against a 16-skip level - the whole bar is three levels wide - and
33.33% at the moment a level landed, which is the first tick, where the next level's threshold
sits. Picking a card at 16 XP left XP at 16 and moved the threshold to 32, so nothing earned at
the top of a level is thrown away. The fuel column read empty with no braid owned and full the
moment one was, in cyan against the rose ladder, and the ladder fades out on the roster and the
card screen, where the same strip of screen belongs to the hint line.

Sweep timing was measured the same way, off the rope angles the collision code itself reads. With
the sweep at the top of its turn, one hop at a known frame clears a whole group and the crossings
land at 40 (one rope), 27 and 40 (two), 26, 33, 40 (three), and 26, 29, 32, 34, 37, 40 (six):
217-233 ms of spread whatever the count, and skips equal to the number of ropes for that one hop.
Before the shared clock the same test put the second rope a quarter turn behind the first - after
the hop had landed - and could not get three ropes across at all, because each rope kept the lag it
was parked with while the offsets shrank under it. The hang measures 63% of the descent spent above
the hand line, and a rope's threat window measures 117 ms, against 161 for an even sweep.

The crit roll was read with the chance pinned at each end: 25 skips paid 25 XP at a chance of 0 and
50 at a chance of 1, so a crit pays exactly double and nothing else moves. At the shipped 0.10 the
same player banked 216 XP over 200 skips, 1.08 a skip against the 1.10 expected. Taking Crit
Caliper off the draft took the run parameter from 0.10 to 0.20, and the card's own label reads the
chance it hands over - 20% CRIT on the first copy, 50% on the fourth, and a certain 100% from the
ninth, because a probability cannot be stacked past certain.

The slower cadence was checked against the hop rather than against itself: the opening press leaves
her airborne from frame 2 to 39, and the first pass now lands on frame 29, so the launch arc clears
it - parked at the top of the turn it landed on frame 40, a frame after she was standing again, and
tripped the run at 0.63 s. Turns measure 80 frames exactly, the beat is one skip per rope per turn,
and a level still costs 12 skips, which the scripted player reached at 14 s against the 16 s the
pacing is solved for. Six ropes still clear in one hop with the span unchanged, because `BUNDLE`
spaced in seconds does not care what a turn costs.

Rope accounting was read through an actual trip rather than a scripted number: six ropes bought one
pick at a time, then left alone until the sweep took three of them, which the readout reported as
`3/6` and the run carried on with three turning. The next Another Rope made it four and left the
high-water mark at six. With ten copies already owned and four ropes turning, the draft still
handed the card over - labelled 5 ROPES, the count it hands over rather than the copies spent - and
taking it restored one.

With ten ropes turning, 400 draws filled three cards every time and offered Another Rope among
them, since nothing gates it any more.

Caps came off every card, which moved the limits from the cards to the arithmetic. Twenty copies of
each one were stacked on a fresh run and the button was mashed - a press edge on every frame, five
seconds of it - and nothing produced a NaN or an error, or a run the player could not finish. What
that took was two numbers, not two ceilings on cards. Ascent stops paying above 26 m/s (`VY_MAX`,
handed straight back as drag by `ASCEND_DRAG`, and stated once so the integrator and the camera's
arc prediction cannot disagree about it), and the braid's lift stops paying at `HOVER_K * jumpV`,
because thrust and fuel both grow with every Propeller Braid and their product is the speed a climb
ends at: twenty of everything, mashed for five seconds, peaked at 174 m and was back on the dirt
12.5 s after the button was let go, and twelve of everything peaked at 151 m and came down in 7.2 s.
And a mid-air hop replaces the fall instead of adding to it - summed, twenty Second Winds left the
ground at 74 m/s, which is tens of thousands of metres in a run and a descent that outlasts it.
Ordinary play never reaches either term: a mid-run tap still peaks at 0.311 m and is off the ground
for 0.317 s, and turns still measure 80 frames.

The braid's ceiling was read against the cards it used to silence, each of them one held press from
a standing start with the level timer pinned so no draft broke the arc. A plain hop peaks at 0.7 m
and Higher Soles x5 at 2.6 m; one braid lifts those to 1.3 m and 3.9 m, so both cards are still
readable on the arc. Four braids then climb 54.7 m in six seconds at 9.3 m/s against an 8.4 m/s
ceiling, and the same build with five Higher Soles in it covers 87.7 m at 15.8 m/s against 17.6 -
the jump sets the climb now, which is the stacking the flat version destroyed. Second Wind was read
where it had been dead: pressed at 9.2 s of a four-braid climb, once the fuel had run out, `vy` went
from -22.0 to +1.9 with the gate at 3.04, so the hop took. A press while she is still rising takes
nothing and spends nothing, which is the same rule that keeps twenty Second Winds from becoming a
rocket, and the card says so on its face. And the goal is still at the end of the climb: eight
braids held through one press reach 260 m in 24.4 s, the same eight with five Higher Soles in 15 s.

What the deck does bound is the draw. With Four-Leaf Sneaker taken past eight copies the draft has
nothing left to add, so it shows all eleven cards in two wrapped rows keyed 1 to 9, then 0, then -;
each of those keys was pressed against a draft and took the card drawn in its own slot, and pressing
a key past the cards on screen takes nothing. Two footers had been naming their keys by hand and
said `1 / 2 / 3` next to four cards, and `1 / 2 / 3 / 4` under a roster of five jumpers: both now
point at the number on the card.

Deep bundles were measured rather than assumed, by handing a run ropes past the old ceiling and
hopping on the beat. The pool took all of them - 20, 30, 40 turning, none dropped or duplicated -
and the frame cost did not move: 17 ms median, 18 at the 95th percentile with thirty ropes, the
same as with one, because a rope is one instanced draw call. What bends is the spacing. Six ropes
still cross inside 233 ms end to end; twenty need 300 ms, thirty 450 ms, forty 533 ms, because
`GAP_MIN` refuses to land two of them on the same frame and the bundle widens instead. A tap stays
0.32 s as it grows, so past about twenty a tap stops covering the group: measured with thirty ropes
turning, one hop paid 23 of the 30 skips and the rest arrived under her feet and cost ropes, which
is the pressure the removed ceiling used to supply and why a deep build is a build that has to hold
its hops. Readability goes the same way in the picture rather than in the numbers - at six the
sweep reads as nested stripes, at ten and past it is a solid shell around her, and the count on the
right is what says how many are in it.

Both endings and the boards were read the same way. A run left alone trips and banks its row: the
panel came up with SKIPS 1 / HEIGHT 0m / SCORE 1, both boards carrying that row marked `NEW`, and the
same two rows were on the title panel after a reload, which is the persistence claim tested. Crossing
`WIN_H` ended the run as a win instead: the state went to `over` with `won` set and the panel held
off through the descent, a 285 m fall that kept her framed and centred in the star band at every
sample, and the panel arrived on touchdown about 3.2 s later over `SPACE REACHED`, with the height
board reading 285 m and the score board marking the row `SPACE`. Six Puffy Overalls on the same run
held the fall to two fifths of gravity and the panel came up at the 4.6 s ceiling with her still
10 m off the ground, which is the one case that ceiling exists for. Storage read back as
`{v:1,runs:[…]}` after every case; a machine holding only the old `boing-gardens-best` key came up
with that key gone and no boards drawn at all; and forty synthetic runs left twenty-four with the top
of both boards still in them.
