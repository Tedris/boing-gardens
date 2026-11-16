// The roster: one rig, four ways to misbehave.
//
// A character is a table row, not a second animator. `look` is a palette remap
// plus a few shape scalars applied to the existing rig (see character.js
// setLook); `apply` patches the fresh run's numbers in the same style as the
// upgrade cards, so cards still stack on top of a character mid-run. The blurb is
// the joke and the numbers have to keep it true: if a character says she falls
// like a rumour, fallDrag has to say so too.
//
// What each knob does in game.js: jumpV takeoff speed, fallDrag gravity while
// falling (as a multiplier), ropeSpeed sweep rate, holdLift/holdMax how hard and
// how long holding lifts, airJumps presses allowed before touching dirt, mult
// points per skip, landEase landing noise and shake, squash how far the body
// pancakes, jig how much the soft parts swing.
import { C } from './toon.js';

export const ROSTER = [
  {
    id: 'boing',
    icon: '\u{1F998}',
    name: 'Boing',
    blurb: 'Standard issue. Two legs, one rope, no notes.',
    look: {},
    apply: () => {},
  },
  {
    id: 'concrete',
    icon: '\u{1F9F1}',
    name: 'Concrete Bunny',
    blurb: 'Heavy. Every landing is an event, and the rope pities her.',
    look: {
      tint: {
        [C.top]: 0x93a0b0, [C.topDk]: 0x76828f,
        [C.shorts]: 0x4d5867, [C.shortsDk]: 0x3a4450,
        [C.hair]: 0x5b6472, [C.hairLt]: 0x737d8c,
        [C.shoe]: 0x31373f, [C.shoeSo]: 0x1c2128, [C.sock]: 0xd6dade,
      },
      w: 1.12, h: 0.95, squash: 1.45, jig: 0.65,
    },
    apply: (u) => {
      u.jumpV *= 0.92;          // she is not getting off the ground easily
      u.fallDrag *= 1.34;       // and once she is off it, gravity remembers her
      u.ropeSpeed *= 0.95;      // the sweep slows down, out of sympathy
      u.holdLift *= 0.45;
      u.holdMax *= 0.75;        // holding does almost nothing: there is a lot of her
      u.mult *= 1.2;            // each skip is worth more, because each one cost
      u.landEase *= 2.2;        // thud
    },
  },
  {
    id: 'dandelion',
    icon: '\u{1F343}',
    name: 'Dandelion',
    blurb: 'Falls like a rumour. The rope has to hurry to keep up.',
    look: {
      tint: {
        [C.top]: 0xf2fbdc, [C.topDk]: 0xd6e9b8,
        [C.shorts]: 0xa8d94f, [C.shortsDk]: 0x87b93a,
        [C.hair]: 0xfff3c8, [C.hairLt]: 0xfff8de,
        [C.skin]: 0xf9d3ad, [C.skinDk]: 0xe6b189,
        [C.shoe]: 0xb6f000, [C.blush]: 0xffc0a8,
      },
      w: 0.94, h: 1.05, squash: 0.7, jig: 1.25,
    },
    apply: (u) => {
      u.jumpV *= 1.08;
      u.fallDrag *= 0.55;       // the long way down takes most of the sweep
      u.ropeSpeed *= 1.2;       // so the rope has no choice but to speed up
      u.holdLift *= 1.3;
      u.holdMax *= 1.35;
      u.airJumps += 1;          // one flap, mostly decorative
      u.mult *= 0.85;           // light: the skips weigh less too
    },
  },
  {
    id: 'prototype',
    icon: '\u{1F579}\uFE0F',
    name: 'The Prototype',
    blurb: 'Straight out of the old build: charge the button, pick a landing site.',
    look: {
      // the rose-on-slate monochrome of the first web version, kept on purpose
      tint: {
        [C.skin]: 0xdd7b90, [C.skinDk]: 0xc0647a,
        [C.hair]: 0xc94f6d, [C.hairLt]: 0xd96d86,
        [C.top]: 0xc94f6d, [C.topDk]: 0xa83f5b,
        [C.shorts]: 0xb4455f, [C.shortsDk]: 0x94374f,
        [C.shoe]: 0x1d2630, [C.shoeSo]: 0x141a22, [C.sock]: 0xe6c2ca,
        [C.blush]: 0xf08fa0, [C.pupil]: 0x2a1f2a,
      },
      squash: 1.7,              // the old 0.6 pancake, spring and all
      jig: 0.9,
    },
    apply: (u) => {
      u.jumpV *= 1.32;          // a tap is already a committed hop
      u.ropeSpeed *= 0.865;     // and the sweep runs on the old 1.3s clock
      u.holdLift *= 2.0;        // hold, and the park leaves
      u.holdMax = 0.55;
      u.airJumps += 1;          // the old double, for the landings that were not
      u.fallDrag *= 1.06;       // comes down with intent
    },
  },
];

export const byId = (id) => ROSTER.find((c) => c.id === id) ?? ROSTER[0];
