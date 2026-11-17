// The roster: one rig, five ways to be dressed.
//
// Every row runs the identical numbers - same jump, same sweep, same hold, same gravity.
// There is no `apply` hook here any more, and no physics knob to hang one on: a jumper is a
// palette remap plus a few shape scalars put on the existing rig (character.js setLook), with
// `hair: false` for the one who wears a cap and a scarf where everyone else has a bob. A tint
// entry is keyed by palette value, or by the part name the rig offers (`limb`) when two
// palette entries have to part ways.
//
// Which leaves the bounce to carry the joke, and the bounce is drawn, not simulated: `squash`
// is how far the body pancakes and `jig` how far the soft parts swing on after it. Neither can
// buy a jump, so a row is free to pancake like a dropped pie, or to keep her feet perfectly
// still while everything above them is still arriving. The blurb describes the row, and the
// row is only what you can see.
import { C } from './toon.js';

export const ROSTER = [
  {
    id: 'muffler',
    icon: '\u{1F9E3}',
    name: 'Muffler',
    blurb: 'From the first build: cap, scarf, and the rose-on-slate it shipped with.',
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
      squash: 1.6, jig: 1.1,     // the old build's spring, which overshot on purpose
    },
  },
  {
    id: 'boing',
    icon: '\u{1F998}',
    name: 'Boing',
    blurb: 'Standard issue. Two legs, one rope, no notes.',
    // The baseline every other row is measured against: neither flatter nor wobblier.
    look: { squash: 1, jig: 1 },
  },
  {
    id: 'concrete',
    icon: '\u{1F9F1}',
    name: 'Concrete Bunny',
    blurb: 'Painted like a car park. Lands like a pancake.',
    look: {
      tint: {
        [C.top]: 0x8a94a3, [C.topDk]: 0x6b7583,
        [C.shorts]: 0x454e5c, [C.shortsDk]: 0x343c48,
        [C.hair]: 0x4e5764, [C.hairLt]: 0x66707e,
        [C.shoe]: 0x2a303a, [C.shoeSo]: 0x181d25, [C.sock]: 0xb9bec6,
      },
      // Wide, squat, and all of the landing in the torso: a block of something flattening,
      // with hair that could not be bothered to notice.
      w: 1.12, h: 0.95, squash: 1.5, jig: 0.5,
    },
  },
  {
    id: 'dandelion',
    icon: '\u{1F343}',
    name: 'Dandelion',
    blurb: 'Dyed like the field. Nothing about her lands still.',
    look: {
      tint: {
        [C.top]: 0xc7d4ae, [C.topDk]: 0xa4b389,
        [C.shorts]: 0x86a05a, [C.shortsDk]: 0x6b8447,
        [C.hair]: 0xd8d2ab, [C.hairLt]: 0xe8e3c2,
        [C.skin]: 0xd9c49f, [C.skinDk]: 0xb9a383,
        [C.shoe]: 0x9dbb52, [C.blush]: 0xa8876f,
      },
      // The other half of the same joke: her body barely flattens at all, so every landing
      // is one tall figure standing still while the soft parts finish the argument.
      w: 0.94, h: 1.05, squash: 0.7, jig: 1.5,
    },
  },
  {
    id: 'prototype',
    icon: '\u{1F579}\uFE0F',
    name: 'The Prototype',
    blurb: 'The old build’s own colours, kept: she nearly matches the dark.',
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
      jig: 0.85,
    },
  },
];

export const byId = (id) => ROSTER.find((c) => c.id === id) ?? ROSTER[0];
