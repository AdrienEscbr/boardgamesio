import { useEffect, useRef } from 'react';
import { animate, motion } from 'motion/react';

// Effects drawn on a tilted board. "Standing" effects (flames, water column…) are wrapped
// in .nv-up, which cancels the board tilt so they rise towards the viewer.

const spread = (i, n, amp) => Math.cos((i / n) * Math.PI * 2) * amp;
const lift = (i, n, amp) => Math.sin((i / n) * Math.PI * 2) * amp;

/** Shot in the water: a column of spray and rings spreading on the surface. */
export function Splash() {
  const drops = Array.from({ length: 9 }, (_, i) => i);
  return (
    <>
      {[0, 0.18, 0.36].map((d) => (
        <motion.span key={d} className="nv-ring" initial={{ scale: 0.15, opacity: 0.9 }} animate={{ scale: 2.4, opacity: 0 }} transition={{ duration: 1.1, delay: d, ease: 'easeOut' }} />
      ))}
      <span className="nv-up">
        <motion.span className="nv-column" initial={{ scaleY: 0, opacity: 1 }} animate={{ scaleY: [0, 1, 0.2], opacity: [1, 1, 0] }} transition={{ duration: 0.9, times: [0, 0.35, 1], ease: 'easeOut' }} />
        {drops.map((i) => (
          <motion.span
            key={i}
            className="nv-drop"
            initial={{ x: 0, y: 0, opacity: 1 }}
            animate={{ x: [0, spread(i, drops.length, 26)], y: [0, -38 - (i % 3) * 14, 6], opacity: [1, 1, 0] }}
            transition={{ duration: 0.85, ease: 'easeOut', times: [0, 0.45, 1] }}
          />
        ))}
      </span>
    </>
  );
}

/** Shot on a ship: flash, fireball and flying debris. */
export function Explosion({ big = false }) {
  const bits = Array.from({ length: big ? 14 : 9 }, (_, i) => i);
  const k = big ? 1.5 : 1;
  return (
    <>
      <motion.span className="nv-scorch-flash" initial={{ scale: 0.2, opacity: 1 }} animate={{ scale: 2.2 * k, opacity: 0 }} transition={{ duration: 0.5, ease: 'easeOut' }} />
      <span className="nv-up">
        <motion.span className="nv-flash" initial={{ scale: 0, opacity: 1 }} animate={{ scale: [0, 1.6 * k, 2 * k], opacity: [1, 0.9, 0] }} transition={{ duration: 0.55, times: [0, 0.3, 1] }} />
        <motion.span className="nv-fireball" initial={{ scale: 0.2, y: 0, opacity: 1 }} animate={{ scale: [0.2, 1.2 * k, 1.5 * k], y: [0, -10, -26], opacity: [1, 1, 0] }} transition={{ duration: 0.9, times: [0, 0.3, 1], ease: 'easeOut' }} />
        {bits.map((i) => (
          <motion.span
            key={i}
            className="nv-debris"
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
            animate={{ x: spread(i, bits.length, 34 * k), y: [0, -24 - lift(i, bits.length, 18) * k - 20, 10], opacity: [1, 1, 0], rotate: 260 }}
            transition={{ duration: 0.9, ease: 'easeOut', times: [0, 0.4, 1] }}
          />
        ))}
      </span>
    </>
  );
}

/** A fire that keeps burning on a hit ship, with smoke. `smoulder` = embers only (sunk ship). */
export function Fire({ seed = 0, smoulder = false }) {
  const d = (seed * 0.37) % 1; // de-synchronise neighbouring fires
  return (
    <span className="nv-up" style={{ '--d': `${-d * 2}s` }}>
      {[0, 1, 2].map((i) => <span key={i} className={`nv-smoke ${smoulder ? 'is-dark' : ''}`} style={{ '--i': i }} />)}
      {!smoulder && (
        <svg className="nv-flame" viewBox="0 0 40 60" aria-hidden>
          <path className="nv-flame__outer" d="M20 58 C6 54 2 42 8 30 C10 38 14 40 15 36 C12 24 18 12 22 2 C26 14 36 22 34 36 C33 30 30 28 29 30 C36 40 34 54 20 58 Z" />
          <path className="nv-flame__inner" d="M20 57 C12 54 10 46 14 38 C16 42 18 42 18 40 C17 32 20 26 22 20 C25 30 31 36 28 46 C27 43 25 42 25 44 C27 50 25 56 20 57 Z" />
        </svg>
      )}
    </span>
  );
}

/** Bubbles rising from a sinking ship. */
export function Bubbles() {
  return (
    <span className="nv-up">
      {[0, 1, 2, 3, 4].map((i) => <span key={i} className="nv-bubble" style={{ '--i': i }} />)}
    </span>
  );
}

/**
 * A shell flying in screen space from `from` to `to` ({ x, y } in the overlay's pixels),
 * along an arc. Calls onLand at impact.
 */
export function Shell({ from, to, duration = 0.7, onLand }) {
  const ref = useRef(null);
  const trail = useRef(null);
  useEffect(() => {
    const h = Math.max(90, Math.abs(to.y - from.y) * 0.6);
    const mid = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - h };
    const at = (t) => ({
      x: (1 - t) ** 2 * from.x + 2 * (1 - t) * t * mid.x + t ** 2 * to.x,
      y: (1 - t) ** 2 * from.y + 2 * (1 - t) * t * mid.y + t ** 2 * to.y,
    });
    const controls = animate(0, 1, {
      duration,
      ease: [0.35, 0, 0.65, 1],
      onUpdate: (t) => {
        const p = at(t);
        const q = at(Math.max(0, t - 0.06));
        const angle = Math.atan2(p.y - q.y, p.x - q.x);
        const s = 1 + Math.sin(t * Math.PI) * 0.6; // closer to the eye at the top of the arc
        if (ref.current) ref.current.style.transform = `translate(${p.x}px, ${p.y}px) scale(${s})`;
        if (trail.current) trail.current.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${angle}rad) scale(${s})`;
      },
      onComplete: () => onLand?.(),
    });
    return () => controls.stop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <span ref={trail} className="nv-shell-trail" />
      <span ref={ref} className="nv-shell" />
    </>
  );
}
