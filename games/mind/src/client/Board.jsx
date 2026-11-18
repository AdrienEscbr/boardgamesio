import { AnimatePresence, motion } from 'motion/react';
import Peg, { KeyPin, codeLabel, feedbackLabel } from './Peg.jsx';

const PIN_DELAY = 0.18; // between two key pins, in seconds
export const pinsDuration = (pegs) => (0.25 + pegs * PIN_DELAY) * 1000;

/** Brass key plate: black pins first, then white ones, then empty holes. */
function KeyPlate({ pegs, row, waiting, animate }) {
  const kinds = row
    ? [...Array(row.black).fill('black'), ...Array(row.white).fill('white'), ...Array(pegs - row.black - row.white).fill(null)]
    : Array(pegs).fill(null);
  return (
    <span className={`mi-keys mi-keys--${pegs} ${waiting ? 'is-waiting' : ''}`} aria-hidden>
      {kinds.map((k, i) => (
        <span key={i} className="mi-keys__hole">
          {k && (
            <motion.span
              initial={animate ? { scale: 0, y: -6, opacity: 0 } : false}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 700, damping: 22, delay: animate ? 0.25 + i * PIN_DELAY : 0 }}
              style={{ display: 'block', width: '100%', height: '100%' }}
            >
              <KeyPin kind={k} />
            </motion.span>
          )}
        </span>
      ))}
    </span>
  );
}

/** One peg in its hole, pressed in with a small spring when it appears. */
function Seated({ color, animate = true }) {
  return (
    <motion.span
      className="mi-seat"
      initial={animate ? { scale: 1.35, y: -10, opacity: 0 } : false}
      animate={{ scale: 1, y: 0, opacity: 1 }}
      exit={{ scale: 1.3, y: -12, opacity: 0, transition: { duration: 0.14 } }}
      transition={{ type: 'spring', stiffness: 900, damping: 26 }}
    >
      <Peg color={color} />
    </motion.span>
  );
}

/**
 * A decoding board: the guesses from the bottom up, the secret at the top under a brass
 * shield.
 *
 * @param rows        played guesses [{ code | null, black, white }] (code null: colours hidden)
 * @param draft       the guess being built on the active row (colour or null per hole), or null
 * @param cursor      hole of the draft the next colour goes into (feedforward)
 * @param waiting     the guess is played, the opponent has not: the row is locked
 * @param secret      the code at the top, or null when unknown
 * @param secretState 'hidden' (shield closed), 'known' (the viewer composed it), 'revealed'
 * @param freshFrom   rows from this index on just arrived: their pins are animated
 */
export default function Board({
  pegs, maxGuesses, rows = [], draft = null, cursor = null, waiting = false, secret = null, secretState = 'hidden',
  cracked = false, freshFrom = Infinity, compact = false, label, onHoleClick, className = '', style,
}) {
  const active = rows.length < maxGuesses && !cracked && (draft != null || waiting);
  return (
    <section className={`mi-board ${compact ? 'is-compact' : ''} ${className}`} style={{ '--pegs': pegs, ...style }} aria-label={label}>
      {/* the secret, under its hinged shield */}
      <div className={`mi-secret is-${secretState}`}>
        <span className="mi-row__num" aria-hidden>?</span>
        <span className="mi-holes">
          {Array.from({ length: pegs }, (_, i) => (
            <span key={i} className="mi-hole">{secret && secretState !== 'hidden' && <Peg color={secret[i]} />}</span>
          ))}
        </span>
        <span className="mi-secret__tag">{secretState === 'known' ? 'Votre code' : secretState === 'revealed' ? 'Code' : 'Secret'}</span>
        <motion.span
          className="mi-shield"
          initial={false}
          animate={secretState === 'hidden' ? { rotateX: 0, opacity: 1 } : { rotateX: -100, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 160, damping: 18, opacity: { delay: secretState === 'hidden' ? 0 : 0.25 } }}
          aria-hidden
        >
          <span className="mi-shield__plate" />
        </motion.span>
        <span className="sr-only">{secret && secretState !== 'hidden' ? `Code : ${codeLabel(secret)}` : 'Code secret caché'}</span>
      </div>

      <ol className="mi-rows">
        {Array.from({ length: maxGuesses }, (_, i) => {
          const row = rows[i];
          const isActive = active && i === rows.length;
          const win = cracked && i === rows.length - 1;
          const code = row ? row.code : isActive ? draft ?? Array(pegs).fill(null) : null;
          return (
            <li key={i} className={`mi-row ${isActive ? 'is-active' : ''} ${win ? 'is-win' : ''} ${row ? 'is-played' : ''}`}>
              <span className="mi-row__num" aria-hidden>{i + 1}</span>
              <span className="mi-holes">
                {Array.from({ length: pegs }, (_, h) => {
                  const color = code ? code[h] : null;
                  const filled = row ? true : isActive && color != null;
                  const clickable = isActive && !waiting && !!onHoleClick;
                  const Tag = clickable ? 'button' : 'span';
                  return (
                    <Tag
                      key={h}
                      type={clickable ? 'button' : undefined}
                      className={`mi-hole ${clickable && cursor === h ? 'is-cursor' : ''}`}
                      data-hole={clickable ? h : undefined}
                      onClick={clickable ? () => onHoleClick(h) : undefined}
                      aria-label={clickable ? `Trou ${h + 1}${color != null ? ' (retirer)' : ''}` : undefined}
                    >
                      <AnimatePresence>
                        {/* same key when the draft becomes a played row: the peg stays put */}
                        {filled && <Seated key={`${i}-${h}-${color}`} color={color} animate={!row || i >= freshFrom} />}
                      </AnimatePresence>
                    </Tag>
                  );
                })}
              </span>
              <KeyPlate pegs={pegs} row={row} waiting={isActive && waiting} animate={i >= freshFrom} />
              {row && <span className="sr-only">Essai {i + 1}{row.code ? ` : ${codeLabel(row.code)}` : ''}, {feedbackLabel(row)}</span>}
            </li>
          );
        })}
      </ol>
      {['tl', 'tr', 'bl', 'br'].map((k) => <span key={k} className={`mi-rivet mi-rivet--${k}`} aria-hidden />)}
    </section>
  );
}
