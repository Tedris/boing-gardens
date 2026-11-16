// The roster: one rig, five ways to misbehave.
//
// A character is a table row, not a second animator. `look` is a palette remap plus a
// few shape scalars applied to the existing rig (see character.js setLook), with
// `hair: false` for the one jumper who wears a cap and a scarf where everyone else has
// a bob. A tint entry is keyed by palette value, or by the part name the rig offers
// (`limb`) when two palette entries have to part ways. `apply` patches the fresh run's
// numbers in the same style as the upgrade cards, so cards still stack on top of a
// character mid-run. The blurb is the joke and the numbers have to keep it true: if a
// character says she falls like a rumour, fallDrag has to say so too.
//
// What each knob does in game.js: jumpV takeoff speed, fallDrag gravity while
// falling (as a multiplier), ropeSpeed sweep rate, holdLift/holdMax how hard and
// how long holding lifts, airJumps presses allowed before touching dirt, mult
// points per skip, landEase landing noise and shake, squash how far the body
// pancakes, jig how much the soft parts swing.
import { C } from './toon.js';

export const ROSTER = [
  {
    id: 'muffler',
    icon: '\u{1F9E3}',
    name: 'Muffler',
    blurb: 'From the first build: a slow rope, no hair, and a button you hold to charge.',
    look: {
      // The old build's palette kept: rose head and body, its dark for the cap and the
      // shoes, and its own dusty green on the arms and legs alone. `limb` is a part name
      // rather than a palette value, which is how the face stays rose when the arms do
      // not. No bob: the rig gives her the cap and the scarf instead (setLook).
      hair: false,
      tint: {
        limb: 0x3a4a42,          // by part name: arms and legs only, not the face
        [C.skin]: 0xc94f6d, [C.skinDk]: 0xa8455f, [C.blush]: 0x8e3f56,
        [C.hair]: 0x1d2630, [C.hairLt]: 0x2a3540,
        [C.shorts]: 0xb04460, [C.shortsDk]: 0x8e3f56,
        [C.shoe]: 0x1d2630, [C.shoeSo]: 0x141a22, [C.sock]: 0x2f3d46,
      },
      squash: 1.6, jig: 1.1,
    },
    apply: (u) => {
      u.ropeSpeed *= 0.77;    // 1.3s a turn: the old period, kept on purpose
      u.holdLift *= 1.14;     // the charge is her whole kit: hold and she is gone
      u.holdMax = 0.5;        // for the old half second of holding, no longer
      u.airJumps += 1;        // the old air jump, for the landings that were not
    },
  },
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
        [C.top]: 0x8a94a3, [C.topDk]: 0x6b7583,
        [C.shorts]: 0x454e5c, [C.shortsDk]: 0x343c48,
        [C.hair]: 0x4e5764, [C.hairLt]: 0x66707e,
        [C.shoe]: 0x2a303a, [C.shoeSo]: 0x181d25, [C.sock]: 0xb9bec6,
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
        [C.top]: 0xc7d4ae, [C.topDk]: 0xa4b389,
        [C.shorts]: 0x86a05a, [C.shortsDk]: 0x6b8447,
        [C.hair]: 0xd8d2ab, [C.hairLt]: 0xe8e3c2,
        [C.skin]: 0xd9c49f, [C.skinDk]: 0xb9a383,
        [C.shoe]: 0x9dbb52, [C.blush]: 0xa8876f,
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
      // the rose-on-slate monochrome of the first web version, kept on purpose:
      // on this stage she is nearly the same colour as the dark, which is the joke
      tint: {
        [C.skin]: 0xb9768a, [C.skinDk]: 0x9a5f72,
        [C.hair]: 0x8e3f56, [C.hairLt]: 0xa8506a,
        [C.top]: 0xa8455f, [C.topDk]: 0x7f3349,
        [C.shorts]: 0x4a3a4a, [C.shortsDk]: 0x362c38,
        [C.shoe]: 0x191e28, [C.shoeSo]: 0x11151c, [C.sock]: 0x9a878e,
        [C.blush]: 0x8e5a68, [C.pupil]: 0x121722,
      },
      squash: 1.7,              // the old 0.6 pancake, spring and all
      jig: 0.9,
    },
    apply: (u) => {
      u.jumpV *= 1.32;          // a tap is already a committed hop
      u.ropeSpeed *= 0.865;     // and her sweep runs a beat slow: 1.16s a turn
      u.holdLift *= 2.0;        // hold, and the stage leaves
      u.holdMax = 0.55;
      u.airJumps += 1;          // the old double, for the landings that were not
      u.fallDrag *= 1.06;       // comes down with intent
    },
  },
];

export const byId = (id) => ROSTER.find((c) => c.id === id) ?? ROSTER[0];
