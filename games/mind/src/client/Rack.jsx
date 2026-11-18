import { motion } from 'motion/react';
import Peg, { COLOR_NAMES } from './Peg.jsx';

/** The hole under a point of the screen (a draft hole carries data-hole). */
function holeAt(point) {
  const x = point.x - window.scrollX;
  const y = point.y - window.scrollY;
  for (const el of document.elementsFromPoint(x, y)) {
    const h = el.closest?.('[data-hole]');
    if (h) return Number(h.dataset.hole);
  }
  return null;
}

/**
 * The bead tray. Tap a bead: it goes into the highlighted hole. Drag it: it goes where it
 * is dropped. Keys 1–8 do the same as a tap, Backspace takes the last bead back.
 *
 * @param used     colours already in the draft (greyed when duplicates are not allowed)
 * @param onPick   (color) => void
 * @param onPlace  (color, hole) => void, after a drag
 */
export default function Rack({ colors, used = [], duplicates = true, disabled = false, onPick, onPlace, onErase, onSubmit, canSubmit, canErase, submitLabel = 'Valider', hint }) {
  const taken = new Set(duplicates ? [] : used);
  return (
    <div className={`mi-rack ${disabled ? 'is-disabled' : ''}`}>
      <div className="mi-rack__tray" role="group" aria-label="Couleurs">
        {Array.from({ length: colors }, (_, c) => {
          const off = disabled || taken.has(c);
          return (
            <motion.button
              key={c}
              type="button"
              className="mi-rack__bead"
              disabled={off}
              onClick={() => onPick(c)}
              drag={!off}
              dragSnapToOrigin
              dragElastic={1}
              whileDrag={{ scale: 1.25, zIndex: 5 }}
              whileTap={{ scale: 0.9 }}
              onDragEnd={(_, info) => { const h = holeAt(info.point); if (h != null) onPlace(c, h); }}
              aria-label={`${COLOR_NAMES[c]} (touche ${c + 1})`}
              title={`${COLOR_NAMES[c]} · ${c + 1}`}
            >
              <Peg color={c} />
              <span className="mi-rack__key" aria-hidden>{c + 1}</span>
            </motion.button>
          );
        })}
      </div>
      <div className="mi-rack__actions">
        <button type="button" className="mi-btn mi-btn--ghost" onClick={onErase} disabled={disabled || !canErase}>Effacer</button>
        <button type="button" className="mi-btn mi-btn--brass" onClick={onSubmit} disabled={disabled || !canSubmit}>{submitLabel}</button>
      </div>
      {hint && <p className="mi-rack__hint" aria-live="polite">{hint}</p>}
    </div>
  );
}
