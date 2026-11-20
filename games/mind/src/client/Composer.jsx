import { AnimatePresence, motion } from 'motion/react';
import Peg, { codeLabel } from './Peg.jsx';

/**
 * The coding desk: the secret is set on a brass plate, then a shield slides over it once
 * it is locked.
 *
 * @param draft   colours being placed (null per empty hole)
 * @param locked  the code played (the shield is closed over it), or null
 */
export default function Composer({ pegs, draft, cursor, locked = null, onHoleClick, title, subtitle }) {
  const code = locked ?? draft;
  return (
    <section className={`mi-composer ${locked ? 'is-locked' : ''}`} style={{ '--pegs': pegs }} aria-label={title}>
      <header className="mi-composer__head">
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </header>
      <div className="mi-composer__plate">
        <span className="mi-holes">
          {Array.from({ length: pegs }, (_, h) => {
            const clickable = !locked && !!onHoleClick;
            const Tag = clickable ? 'button' : 'span';
            return (
              <Tag
                key={h}
                type={clickable ? 'button' : undefined}
                className={`mi-hole ${clickable && cursor === h ? 'is-cursor' : ''}`}
                data-hole={clickable ? h : undefined}
                onClick={clickable ? () => onHoleClick(h) : undefined}
                aria-label={clickable ? `Trou ${h + 1}${code[h] != null ? ' (retirer)' : ''}` : undefined}
              >
                <AnimatePresence>
                  {code[h] != null && (
                    <motion.span
                      key={`${h}-${code[h]}`}
                      className="mi-seat"
                      initial={{ scale: 1.35, y: -10, opacity: 0 }}
                      animate={{ scale: 1, y: 0, opacity: 1 }}
                      exit={{ scale: 1.3, y: -12, opacity: 0, transition: { duration: 0.14 } }}
                      transition={{ type: 'spring', stiffness: 900, damping: 26 }}
                    >
                      <Peg color={code[h]} />
                    </motion.span>
                  )}
                </AnimatePresence>
              </Tag>
            );
          })}
        </span>
        <motion.span
          className="mi-composer__shield"
          initial={false}
          animate={locked ? { x: '0%' } : { x: '-104%' }}
          transition={{ type: 'spring', stiffness: 220, damping: 26 }}
          aria-hidden
        >
          <span>Code verrouillé</span>
        </motion.span>
        {locked && <span className="sr-only">Code verrouillé : {codeLabel(locked)}</span>}
      </div>
    </section>
  );
}
