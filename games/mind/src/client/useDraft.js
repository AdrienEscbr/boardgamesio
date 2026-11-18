import { useEffect, useRef, useState } from 'react';
import { haptic, sound } from '@bgio/ui/lib/feedback.js';

const firstEmpty = (draft, from = 0) => {
  for (let k = 0; k < draft.length; k++) {
    const i = (from + k) % draft.length;
    if (draft[i] == null) return i;
  }
  return null;
};

/**
 * The code being built (a guess or a secret): which bead sits in which hole, and the hole
 * the next bead goes into (the cursor, shown on the board as feedforward).
 * `resetKey` empties the draft whenever it changes (new step, new round).
 */
export function useDraft(pegs, { colors = 8, duplicates = true, resetKey, enabled = true } = {}) {
  const [state, setState] = useState(() => ({ draft: Array(pegs).fill(null), cursor: 0 }));
  const ref = useRef(state);
  ref.current = state;
  const set = (next) => { ref.current = next; setState(next); };

  useEffect(() => { set({ draft: Array(pegs).fill(null), cursor: 0 }); }, [pegs, resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const place = (color, hole) => {
    if (!enabled) return;
    const { draft } = ref.current;
    if (!duplicates && draft.some((c, i) => c === color && i !== hole)) { sound('error'); haptic('error'); return; }
    const next = [...draft];
    next[hole] = color;
    set({ draft: next, cursor: firstEmpty(next, hole + 1) });
    sound('peg');
    haptic('light');
  };

  const pick = (color) => {
    if (!enabled) return;
    const { cursor } = ref.current;
    if (cursor == null) { sound('error'); return; } // full: take a bead back first
    place(color, cursor);
  };

  /** Tap a hole: an empty one becomes the cursor, a filled one gives its bead back. */
  const clickHole = (hole) => {
    if (!enabled) return;
    const { draft } = ref.current;
    if (draft[hole] == null) { set({ draft, cursor: hole }); sound('tick'); return; }
    const next = [...draft];
    next[hole] = null;
    set({ draft: next, cursor: hole });
    sound('back');
  };

  /** Takes the last placed bead back (Backspace / Effacer). */
  const erase = () => {
    if (!enabled) return;
    const { draft } = ref.current;
    const last = draft.findLastIndex((c) => c != null);
    if (last < 0) return;
    const next = [...draft];
    next[last] = null;
    set({ draft: next, cursor: last });
    sound('back');
  };

  const clear = () => set({ draft: Array(pegs).fill(null), cursor: 0 });

  // Keyboard: 1–colors place a colour, Backspace erases.
  const keys = useRef({ pick, erase });
  keys.current = { pick, erase };
  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea, [contenteditable]')) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= colors) { keys.current.pick(n - 1); e.preventDefault(); } else if (e.key === 'Backspace') { keys.current.erase(); e.preventDefault(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, colors]);

  const { draft, cursor } = state;
  const complete = draft.every((c) => c != null);
  const used = draft.filter((c) => c != null);
  return { draft, cursor: complete ? null : cursor, complete, used, place, pick, clickHole, erase, clear };
}
