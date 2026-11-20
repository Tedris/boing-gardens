// Saved runs, and the two boards built from them.
//
// A finished run leaves exactly two numbers behind: the score it banked and the height it
// reached. Those are the two boards the title panel shows, and both are read off the saved rows
// rather than kept in parallel with them, so a record can never disagree with the run it came
// from. Every run writes a row, whether it ended in a wipeout or in space, so a long run is on
// the boards even when it was never good at either number.
//
// What used to be saved was one number: the best skip count, under `boing-gardens-best`. Skips
// are what raise a level, not what a run is remembered by, and once these two boards exist the
// number has nowhere to be shown - so the first time this module touches storage the old key is
// removed, rather than left behind as a number nothing can draw.
const KEY = 'boing-gardens-runs';
const OLD_KEY = 'boing-gardens-best';

export const BOARD = 5;     // rows per board: the panel has room for five
const KEEP = 24;            // rows kept: every one a board still needs, plus history

let runs = null;

function load() {
  if (runs) return runs;
  runs = [];
  let raw = null;
  try { raw = localStorage.getItem(KEY) } catch { return runs }   // no storage: boards live in memory
  if (raw === null) { try { localStorage.removeItem(OLD_KEY) } catch { /* nothing to remove */ } }
  try {
    const store = JSON.parse(raw);
    if (store && Array.isArray(store.runs)) {
      runs = store.runs.filter((r) => r && typeof r.score === 'number' && typeof r.height === 'number');
    }
  } catch { /* a row that will not parse is worse than no rows at all */ }
  return runs;
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify({ v: 1, runs })) } catch { /* the boards still work */ }
}

/** Best first, ties broken by the run that skipped more, then by the newer run. */
const by = (k) => (a, b) => (b[k] - a[k]) || (b.skips - a.skips) || (b.id - a.id);

/**
 * Bank a finished run and hand back its row, whose `id` is what marks it on the panel.
 *
 * Trimming is by rank, not by age: a board must never lose the record it is showing, so the row
 * cut is the one that sits worst on *both* boards rather than simply the oldest.
 */
export function addRun(row) {
  const r = { id: Date.now(), score: 0, height: 0, skips: 0, level: 1, won: false, jumper: '', ...row };
  runs = load();
  runs.push(r);
  if (runs.length > KEEP) {
    const rank = (k) => { const s = runs.slice(); s.sort(by(k)); return (x) => s.indexOf(x) };
    const rs = rank('score'), rh = rank('height');
    const worst = (x) => Math.max(rs(x), rh(x));
    runs.sort((a, b) => worst(a) - worst(b));
    runs.length = KEEP;
  }
  save();
  return r;
}

/** The top rows of one board - `'score'` or `'height'` - best first. */
export function board(kind, n = BOARD) {
  return load().slice().sort(by(kind)).slice(0, n);
}
