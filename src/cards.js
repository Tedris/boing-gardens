// Eleven upgrade cards. Each one edits the same run parameters the physics loop
// reads, so stacking is just multiplication on shared state - no per-card hooks
// scattered through the engine.

/** What every counted skip rolls for double XP with no Crit Caliper owned. The roll itself is in
    the skip path (game.js), and the card below only ever moves this number. */
export const CRIT_BASE = 0.10;
const CRIT_STEP = 0.10;    // what one Crit Caliper adds: four of them makes a crit every other skip
export const CARDS = [
  {
    id: 'soles', icon: '\u{1F45F}', name: 'Higher Soles', tier: 0,
    blurb: 'Sprung soles. Every jump leaves the ground faster.',
    apply: (u) => { u.jumpV *= 1.16; },
    level: (n) => `JUMP +${Math.round((Math.pow(1.16, n) - 1) * 100)}%`,
  },
  {
    id: 'rope', icon: '\u{1FAA2}', name: 'Another Rope', tier: 2,
    blurb: 'One more rope, offset from the others. More skips per sweep; a trip costs one.',
    max: 5,
    apply: (u) => { u.ropes = Math.min(6, u.ropes + 1); },
    level: (n) => `${n + 1} ROPES`,
  },
  {
    id: 'whip', icon: '\u26A1', name: 'Whip Faster', tier: 1,
    blurb: 'Tighter sweep. Smaller window, faster score.',
    apply: (u) => { u.ropeSpeed *= 1.14; },
    level: (n) => `SPEED +${Math.round((Math.pow(1.14, n) - 1) * 100)}%`,
  },
  {
    id: 'braid', icon: '\u{1F300}', name: 'Propeller Braid', tier: 3,
    blurb: 'Wind the braid overhead and hold to climb. It spins back up the moment she lands.',
    max: 4,
    apply: (u) => { u.thrust += 6.5; u.fuelMax += 0.7; u.fuel = u.fuelMax; },
    level: (n) => `LIFT ${n}`,
  },
  {
    id: 'live', icon: '\u{1F50C}', name: 'Live Wire', tier: 3,
    blurb: 'The ropes turn live. Everything they touch scores double, and a trip is a shock.',
    max: 3,
    apply: (u) => { u.live = Math.min(3, u.live + 1); u.mult *= 2; },
    level: (n) => `\u00D7${Math.pow(2, n)} SCORE`,
  },
  {
    id: 'sneaker', icon: '\u{1F340}', name: 'Four-Leaf Sneaker', tier: 2,
    blurb: 'Better draws. One more card to choose from at each level.',
    max: 2,
    apply: (u) => { u.offer = Math.min(5, u.offer + 1); },
    level: (n) => `${3 + n} CHOICES`,
  },
  {
    id: 'chute', icon: '\u{1FA82}', name: 'Puffy Overalls', tier: 1,
    blurb: 'Catch air on the way down. Slower falls, softer landings.',
    apply: (u) => { u.fallDrag *= 0.86; u.landEase *= 0.9; },
    level: (n) => `FALL -${Math.round((1 - Math.pow(0.86, n)) * 100)}%`,
  },
  {
    id: 'grace', icon: '\u{1FA9B}', name: 'Sticky Soles', tier: 1,
    blurb: 'Grippy shoes. The rope brushes past instead of tripping you.',
    max: 3,
    apply: (u) => { u.grace += 0.12; },
    level: (n) => `WINDOW +${Math.round(n * 12)}%`,
  },
  {
    id: 'wind', icon: '\u{1F98B}', name: 'Second Wind', tier: 2,
    blurb: 'Press again in mid-air for one extra hop.',
    max: 3,
    apply: (u) => { u.airJumps += 1; },
    level: (n) => `${n} MID-AIR HOPS`,
  },
  {
    id: 'crown', icon: '\u{1F451}', name: 'Combo Crown', tier: 2,
    blurb: 'A long run pays. The multiplier climbs with every skip you survive.',
    max: 4,
    apply: (u) => { u.combo += 1; },
    level: (n) => `+${(n * 0.35).toFixed(2)} / SKIP`,
  },
  {
    // The one card that pays in experience instead of height, speed or survival. Every other
    // card raises the skip rate, which raises the threshold with it (see levelGap); this one
    // moves picks closer without touching the physics the rope reads.
    id: 'crit', icon: '\u{1F3AF}', name: 'Crit Caliper', tier: 1,
    blurb: 'Any skip can catch: a lucky one pays double experience. This widens the chance it '
      + 'lands on a given skip.',
    max: 4,
    apply: (u) => { u.critChance += CRIT_STEP; },
    level: (n) => `${Math.round((CRIT_BASE + CRIT_STEP * n) * 100)}% CRIT`,
    tags: ['xp'],
  },
];

/** Draw `n` distinct cards, weighted so a build trends instead of stalling. */
export function drawCards(u, n, rng = Math.random) {
  const pool = CARDS.filter((c) => !c.max || (u.levels[c.id] ?? 0) < c.max);
  const out = [];
  const weight = (c) => {
    const lvl = u.levels[c.id] ?? 0;
    // cheap staples early, rare payoffs once a run has length
    let w = 1 + (lvl === 0 ? 0.6 : 0);
    if (c.tier === 3) w *= lvl === 0 ? 0.55 : 0.35;
    if (c.id === 'whip') w *= 0.75;
    if (u.skips > 60) w *= c.tier >= 2 ? 1.5 : 0.85;
    return w;
  };
  const bag = pool.slice();
  while (out.length < n && bag.length) {
    let total = 0;
    for (const c of bag) total += weight(c);
    let r = rng() * total;
    let pick = bag[bag.length - 1];
    for (const c of bag) {
      r -= weight(c);
      if (r <= 0) { pick = c; break; }
    }
    out.push(pick);
    bag.splice(bag.indexOf(pick), 1);
  }
  return out;
}
