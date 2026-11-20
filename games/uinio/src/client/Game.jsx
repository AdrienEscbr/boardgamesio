import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useApp, serverNow } from '@bgio/ui/lib/store.js';
import { act as sendAction, call } from '@bgio/ui/lib/socket.js';
import { errorMessage } from '@bgio/ui/lib/i18n.js';
import { haptic, sound } from '@bgio/ui/lib/feedback.js';
import { Button, IconButton, Sheet } from '@bgio/ui/components/ui.jsx';
import Icon from '@bgio/ui/components/Icon.jsx';
import { toast, useToastPlacement } from '@bgio/ui/components/Toaster.jsx';
import SettingsSheet from '@bgio/ui/components/SettingsSheet.jsx';
import { COLORS, cardPoints, colorOf, isWild, kindOf } from '../engine/cards.js';
import Card, { CREAM, Mark, Symbol, cardName } from './Card.jsx';
import RulesSheet from './RulesSheet.jsx';
import { COLOR_HEX, COLOR_LABELS, COLOR_NAMES, KIND_NAMES, plural } from './i18n.js';
import './uinio.css';

const ORDER = [...COLORS, 'w'];
const NONE = [];
const KINDS = '0123456789SRDWF';
/** My hand, sorted: by colour, then by value; wilds last. */
const sortHand = (hand) => [...hand].sort((a, b) => ORDER.indexOf(colorOf(a)) - ORDER.indexOf(colorOf(b)) || KINDS.indexOf(kindOf(a)) - KINDS.indexOf(kindOf(b)) || a.localeCompare(b));
/** A stable small number from a card id: its tilt on the discard pile. */
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 9973, 7);
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const centre = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
const rectOf = (id) => document.getElementById(id)?.getBoundingClientRect() ?? null;
/** A short jolt sideways (a seat or my hand taking a hit). */
const shakeEl = (el, px) => {
  if (!el || reduced()) return;
  el.animate([{ transform: 'none' }, { transform: `translateX(${-px}px) rotate(-1deg)` }, { transform: `translateX(${px}px) rotate(1deg)` }, { transform: `translateX(${-px / 2}px)` }, { transform: 'none' }], { duration: 420, easing: 'ease-out' });
};

/** Time left, as a draining bar (CSS animation, no re-render). */
function TurnTimer({ turn, className = 'un-timer' }) {
  const [elapsed] = useState(() => (turn?.endsAt ? Math.max(0, turn.durationMs - Math.max(0, turn.endsAt - serverNow())) : 0));
  if (!turn?.endsAt || !turn.durationMs) return null;
  return (
    <span className={className} aria-hidden>
      <span style={{ animationDuration: `${turn.durationMs}ms`, animationDelay: `-${elapsed}ms` }} />
    </span>
  );
}

/** Slides an element in from `from` (a screen rect), with a small arc and a spin. */
function flyIn(el, from, { delay = 0, duration = 460, spin = 10 } = {}) {
  if (!el || !from || reduced()) return;
  el.getAnimations().forEach((x) => x.cancel());
  const a = centre(from);
  const b = centre(el.getBoundingClientRect());
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const s = Math.min(1.2, Math.max(0.35, from.width / Math.max(1, el.offsetWidth)));
  el.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) rotate(${spin}deg) scale(${s})`, opacity: 0.4 },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 22}px) rotate(${-spin / 2}deg) scale(${(s + 1.1) / 2})`, opacity: 1, offset: 0.55 },
      { transform: 'none', opacity: 1 },
    ],
    { duration, delay, easing: 'cubic-bezier(0.25, 0.8, 0.3, 1)', fill: 'backwards' },
  );
}

/** A card flying from the pile to a seat (another player draws): it lives one animation. */
function Flight({ flight, onDone }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || reduced()) { onDone(flight.id); return; }
    const a = centre(flight.from);
    const b = centre(flight.to);
    const anim = el.animate(
      [
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1.05)', opacity: 1, offset: 0.12 },
        { transform: `translate(calc(-50% + ${b.x - a.x}px), calc(-50% + ${b.y - a.y}px)) rotate(${flight.spin}deg) scale(0.55)`, opacity: 0.2 },
      ],
      { duration: 520, delay: flight.delay, easing: 'cubic-bezier(0.4, 0.1, 0.3, 1)', fill: 'both' },
    );
    anim.onfinish = () => onDone(flight.id);
    return () => anim.cancel();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const a = centre(flight.from);
  return (
    <span ref={ref} className="un-flight" style={{ left: a.x, top: a.y, '--cw': `${flight.from.width}px` }}>
      <Card card={flight.card ?? null} />
    </span>
  );
}

/** The discard pile: the last cards laid, tilted; the top one flies in from whoever played it. */
function Discard({ cards, from, animate, asked, wilds, stack, onClick, canDrop }) {
  return (
    <button type="button" id="un-discard" className={`un-discard ${canDrop ? 'is-target' : ''}`} onClick={onClick} disabled={!onClick} aria-label="Défausse" style={{ '--asked': COLOR_HEX[asked] ?? CREAM }}>
      {cards.length > 0 && <span className="un-discard__halo" aria-hidden />}
      {cards.map((c, i) => (
        <Laid key={c} card={c} asked={wilds[c]} top={i === cards.length - 1} from={i === cards.length - 1 && animate ? from : null} />
      ))}
      {stack && <span key={stack.count} className="un-stack" aria-label={`${stack.count} cartes à piocher`}>+{stack.count}</span>}
    </button>
  );
}

function Laid({ card, asked, top, from }) {
  const ref = useRef(null);
  const h = hash(card);
  useLayoutEffect(() => { if (from) flyIn(ref.current, from, { spin: (h % 2 ? 1 : -1) * 16 }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span className={`un-laid ${top ? 'is-top' : ''}`} style={{ rotate: `${(h % 29) - 14}deg`, translate: `${(h % 7) - 3}px ${(h % 5) - 2}px` }}>
      <span ref={ref} className="un-laid__in"><Card card={card} asked={asked} /></span>
    </span>
  );
}

/** My hand, in a fan that fits the width: playable cards stand up on my turn. */
function Hand({ cards, playable, myTurn, fresh, selected, onPick, rects, drawn }) {
  const box = useRef(null);
  const [width, setWidth] = useState(360);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  // Every card's place on screen, for its flight to the discard pile once played.
  useLayoutEffect(() => {
    for (const el of box.current?.querySelectorAll('[data-card]') ?? []) rects.current.set(el.dataset.card, el.getBoundingClientRect());
  });
  const n = cards.length;
  const cw = Math.round(Math.min(104, Math.max(54, width / 4.9)));
  const tilt = Math.min(3, 20 / Math.max(n, 1));
  // The fan turns the outer cards outwards: keep room for them at both ends.
  const spread = n > 1 ? cw * 0.3 : 0;
  const step = n > 1 ? Math.min(cw * 0.7, (width - cw - 2 * spread) / (n - 1)) : 0;
  const start = (width - (cw + step * (n - 1))) / 2;
  const mid = (n - 1) / 2;
  return (
    <div ref={box} className={`un-hand ${myTurn ? 'is-turn' : ''}`} style={{ '--cw': `${cw}px` }} role="group" aria-label={`Votre main : ${plural(n, 'carte')}`}>
      {cards.map((c, i) => {
        const ok = playable.has(c);
        const off = i - mid;
        return (
          <HandCard
            key={c}
            card={c}
            ok={ok}
            dim={myTurn && !ok}
            isDrawn={drawn === c}
            selected={selected === c}
            fresh={fresh.get(c)}
            style={{ left: start + i * step, rotate: `${off * tilt}deg`, translate: `0 ${Math.abs(off) ** 2 * (tilt * 0.45)}px`, zIndex: i + 1 }}
            onPick={onPick}
          />
        );
      })}
    </div>
  );
}

function HandCard({ card, ok, dim, isDrawn, selected, fresh, style, onPick }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    if (fresh) flyIn(ref.current, rectOf('un-pile'), { delay: fresh.delay, duration: 520, spin: -12 });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <button
      type="button"
      className={`un-hcard ${ok ? 'is-ok' : ''} ${dim ? 'is-dim' : ''} ${isDrawn ? 'is-drawn' : ''} ${selected ? 'is-selected' : ''}`}
      style={style}
      aria-label={`${cardName(card)}${ok ? '' : dim ? ' (ne peut pas être posée)' : ''}`}
      aria-disabled={!ok || undefined}
      onClick={(e) => onPick(card, e.currentTarget)}
    >
      <span ref={ref} className="un-hcard__in" data-card={card}><Card card={card} /></span>
    </button>
  );
}

/** Another player, round the table: a coaster, a fan of backs, the score, what they just did. */
function Seat({ p, isTurn, isNext, exposed, onCatch, turn, playing, dealing }) {
  const shown = Math.min(p.count, 9);
  return (
    <div id={`un-seat-${p.id}`} className={`un-seat ${isTurn ? 'is-turn' : ''} ${p.connected === false ? 'is-away' : ''}`}>
      <div className="un-seat__top">
        <span className="un-coaster" aria-hidden>{p.isBot ? <Icon name="bot" size={16} strokeWidth={2.2} /> : (p.nickname?.[0] ?? '?').toUpperCase()}</span>
        <span className="un-seat__who">
          <span className="un-seat__name">{p.nickname}</span>
          <span className="un-seat__pts">{p.total} pts</span>
        </span>
      </div>
      <div className="un-seat__fan" aria-label={plural(p.count, 'carte')} style={dealing ? { visibility: 'hidden' } : undefined}>
        <span className="un-seat__backs" style={{ '--n': shown }}>
          {Array.from({ length: shown }, (_, i) => <span key={i} style={{ '--i': i }} className="un-mini"><Card card={null} /></span>)}
        </span>
        <span className="un-seat__count">{p.count}</span>
      </div>
      {p.count === 1 && p.called && <span className="un-tag">UINIO !</span>}
      {exposed && (onCatch
        ? <button type="button" className="un-catch" onClick={onCatch}>Contrer</button>
        : <span className="un-tag is-exposed">sans annonce</span>)}
      {isTurn && playing && <TurnTimer key={`${turn?.key}-${turn?.endsAt}`} turn={turn} className="un-timer un-timer--seat" />}
      {isNext && !isTurn && <span className="un-seat__next" aria-hidden />}
    </div>
  );
}

/**
 * What a player just did, in a bubble hung under their seat (never over it). It lives
 * outside the scrolling row of seats, so nothing clips it.
 */
function SeatBubble({ id, bubble, low }) {
  const [at] = useState(() => {
    const r = rectOf(`un-seat-${id}`);
    if (!r) return null;
    const x = centre(r).x;
    const left = Math.min(Math.max(x, 70), window.innerWidth - 70);
    return { left, top: r.bottom + (low ? 26 : 8), tail: x - left };
  });
  if (!at) return null;
  return (
    <motion.span
      className={`un-sbubble is-${bubble.tone ?? 'info'}`}
      style={{ left: at.left, top: at.top, '--tail': `${at.tail}px` }}
      initial={{ opacity: 0, y: -8, scale: 0.7 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.9 }}
      transition={{ type: 'spring', bounce: 0.45, duration: 0.4 }}
    >
      {bubble.text}
    </motion.span>
  );
}

/**
 * What hits me (a lost turn, cards to draw, a catch): a small enamelled plaque that rises
 * from my hand. Only I see it; the others see my seat react.
 */
function Notice({ n }) {
  const r = reduced();
  return (
    <motion.span
      className="un-notice"
      role="status"
      initial={r ? { opacity: 0 } : { opacity: 0, y: 26, rotate: -4, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
      exit={r ? { opacity: 0 } : { opacity: 0, y: -8, transition: { duration: 0.2 } }}
      transition={{ type: 'spring', bounce: 0.45, duration: 0.5 }}
    >
      <span className="un-notice__seal" aria-hidden>
        {n.symbol ? <svg viewBox="-50 -50 100 100"><Symbol kind={n.symbol} fill={CREAM} /></svg> : <b>{n.mark}</b>}
      </span>
      <span className="un-notice__text">
        <strong>{n.title}</strong>
        {n.caption && <small>{n.caption}</small>}
      </span>
    </motion.span>
  );
}

/** A call or a catch at a seat: rings of enamel spread from the coaster. */
function Burst({ id, tone, onDone }) {
  const [at] = useState(() => {
    const el = document.querySelector(`#un-seat-${CSS.escape(id)} .un-coaster`) ?? document.getElementById(`un-seat-${id}`);
    return el ? centre(el.getBoundingClientRect()) : null;
  });
  useEffect(() => {
    const t = setTimeout(onDone, 1000);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!at || reduced()) return null;
  return (
    <span className={`un-burst is-${tone}`} style={{ left: at.x, top: at.y }} aria-hidden>
      <i /><i />
    </span>
  );
}

/** A colour asked: a wave of that enamel spreads over the counter from the discard. */
function Ripple({ color }) {
  const [at] = useState(() => {
    const r = rectOf('un-discard');
    return r ? centre(r) : null;
  });
  if (!at || reduced()) return null;
  return <span className="un-ripple" style={{ left: at.x, top: at.y, '--c': COLOR_HEX[color] }} aria-hidden />;
}

/** The ring of arrows round the tray: one stroke each that fades in, ending in an open chevron. */
const RING = (() => {
  const r = 91;
  const span = (25 * Math.PI) / 180;
  const pt = (a) => [r * Math.sin(a), -r * Math.cos(a)];
  const [x0, y0] = pt(-span);
  const [x1, y1] = pt(span);
  // The chevron's arms go back along the arc's tangent at its end, turned ±36°.
  const tx = Math.cos(span);
  const ty = Math.sin(span);
  const arm = (deg) => {
    const a = (deg * Math.PI) / 180;
    const bx = -tx * Math.cos(a) + ty * Math.sin(a);
    const by = -tx * Math.sin(a) - ty * Math.cos(a);
    return [x1 + bx * 9, y1 + by * 9];
  };
  const [ax, ay] = arm(36);
  const [bx, by] = arm(-36);
  const f = (n) => n.toFixed(2);
  return {
    arc: `M ${f(x0)} ${f(y0)} A ${r} ${r} 0 0 1 ${f(x1)} ${f(y1)}`,
    head: `M ${f(ax)} ${f(ay)} L ${f(x1)} ${f(y1)} L ${f(bx)} ${f(by)}`,
    from: x0,
    to: x1,
  };
})();

function Ring({ direction, spinRef }) {
  return (
    <svg ref={spinRef} className={`un-tray__ring ${direction < 0 ? 'is-ccw' : ''}`} viewBox="-100 -100 200 200" aria-label={direction > 0 ? 'Sens des aiguilles d’une montre' : 'Sens inverse'}>
      <g transform={direction < 0 ? 'scale(-1 1)' : undefined}>
        <defs>
          <linearGradient id="un-ring-fade" gradientUnits="userSpaceOnUse" x1={RING.from} y1="0" x2={RING.to} y2="0">
            <stop offset="0" stopColor="currentColor" stopOpacity="0" />
            <stop offset="0.6" stopColor="currentColor" stopOpacity="0.8" />
            <stop offset="1" stopColor="currentColor" stopOpacity="1" />
          </linearGradient>
        </defs>
        {[0, 120, 240].map((a) => (
          <g key={a} transform={`rotate(${a})`}>
            <path d={RING.arc} fill="none" stroke="url(#un-ring-fade)" strokeWidth="3" strokeLinecap="round" />
            <path d={RING.head} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        ))}
      </g>
    </svg>
  );
}

/**
 * Choosing the colour of a wild, on the tray itself: four enamel lobes rise from under the
 * pile where the wild's own lobes are (brique, cobalt / safran, bouteille). Tapping beside
 * them, or Escape, puts the wild back.
 */
const QUARTERS = { r: [-1, -1], b: [1, -1], y: [-1, 1], g: [1, 1] };
function ColorLobes({ card, hand, onPick, onCancel }) {
  const counts = Object.fromEntries(COLORS.map((c) => [c, hand.filter((x) => x !== card && colorOf(x) === c).length]));
  const best = COLORS.reduce((a, b) => (counts[b] > counts[a] ? b : a));
  const r = reduced();
  return (
    <>
      <button type="button" className="un-lobes__away" aria-label="Annuler le Joker" onClick={onCancel} />
      <div className="un-lobes" role="group" aria-label={`${KIND_NAMES[kindOf(card)]} : choisir la couleur demandée`}>
        {COLORS.map((c, i) => {
          const [qx, qy] = QUARTERS[c];
          return (
            <motion.button
              key={c}
              type="button"
              className={`un-lobe ${c === best && counts[c] ? 'is-best' : ''}`}
              style={{ '--c': COLOR_HEX[c], '--qx': qx, '--qy': qy }}
              initial={r ? { opacity: 0 } : { opacity: 0, scale: 0.2, x: `${-qx * 60}%`, y: `${-qy * 60}%`, rotate: qx * qy * -40 }}
              animate={{ opacity: 1, scale: 1, x: 0, y: 0, rotate: 0 }}
              exit={r ? { opacity: 0 } : { opacity: 0, scale: 0.4, x: `${-qx * 50}%`, y: `${-qy * 50}%`, transition: { duration: 0.18 } }}
              transition={{ type: 'spring', bounce: 0.38, duration: 0.5, delay: 0.035 * i }}
              onClick={() => onPick(c)}
              autoFocus={c === best}
              aria-label={`${COLOR_LABELS[c]} (${plural(counts[c], 'carte')} en main), touche ${i + 1}`}
            >
              <svg viewBox="-12 -12 24 24" aria-hidden><Mark color={c} s={12} /></svg>
              <span className="un-lobe__name">{COLOR_LABELS[c]}</span>
              <span className="un-lobe__count">{counts[c] ? `×${counts[c]}` : '—'}</span>
            </motion.button>
          );
        })}
      </div>
    </>
  );
}

/** The end of a round: who won, everyone's cards and points, the race to the target. */
function Recap({ v, nameOf, me, onReady, readyDisabled, finished, onNext }) {
  const r = v.roundResult;
  const winner = r.winnerId;
  const others = v.players.filter((p) => p.id !== winner).map((p) => ({ ...p, hand: r.hands[p.id] ?? [] }))
    .sort((a, b) => b.hand.reduce((s, c) => s + cardPoints(c), 0) - a.hand.reduce((s, c) => s + cardPoints(c), 0));
  const meP = v.players.find((p) => p.id === me);
  const won = winner === me;
  return (
    <motion.div className="un-recap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-label="Fin de manche">
      <motion.div className="un-recap__card" initial={{ y: 40, scale: 0.94 }} animate={{ y: 0, scale: 1 }} transition={{ type: 'spring', bounce: 0.3, duration: 0.55, delay: 0.5 }}>
        <span className="eyebrow">Manche {r.round}{r.blocked ? ' · bloquée' : ''}</span>
        <h2 className="un-recap__title">{won ? 'Vous remportez la manche' : `${nameOf(winner)} remporte la manche`}</h2>
        <p className="un-recap__gain">+{r.points[winner]} <small>pts</small></p>
        {r.blocked && <p className="un-recap__note">Plus personne ne pouvait jouer ni piocher : la main la plus légère gagne.</p>}
        <ul className="un-recap__hands">
          {others.map((p) => (
            <li key={p.id}>
              <span className="un-recap__name">{p.id === me ? 'Vous' : nameOf(p.id)}</span>
              <span className="un-recap__cards" style={{ '--cw': '30px' }}>
                {p.hand.map((c, i) => <motion.span key={c} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 + i * 0.04 }}><Card card={c} /></motion.span>)}
              </span>
              <span className="un-recap__pts">{p.hand.reduce((s, c) => s + cardPoints(c), 0)}</span>
            </li>
          ))}
        </ul>
        <div className="un-recap__race">
          {[...v.players].sort((a, b) => b.total - a.total).map((p) => (
            <div key={p.id} className={`un-race ${p.id === winner ? 'is-winner' : ''}`}>
              <span className="un-race__name">{p.id === me ? 'Vous' : nameOf(p.id)}</span>
              <span className="un-race__bar"><motion.span initial={{ width: `${Math.min(100, ((p.total - (r.points[p.id] ?? 0)) / v.target) * 100)}%` }} animate={{ width: `${Math.min(100, (p.total / v.target) * 100)}%` }} transition={{ delay: 1.1, duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }} /></span>
              <span className="un-race__pts">{p.total}</span>
              {!finished && <span className={`un-race__ready ${p.ready ? 'is-on' : ''}`} aria-label={p.ready ? 'prêt' : 'pas encore prêt'}><Icon name="check" size={12} strokeWidth={3} /></span>}
            </div>
          ))}
          <span className="un-recap__target">objectif {v.target} pts</span>
        </div>
        {finished ? (
          onNext && <button type="button" className="un-btn un-btn--enamel" onClick={onNext}>Voir les résultats</button>
        ) : meP && (
          <button type="button" className="un-btn un-btn--enamel" onClick={onReady} disabled={readyDisabled || meP.ready}>
            {meP.ready ? 'Prêt · on attend les autres' : 'Manche suivante'}
          </button>
        )}
      </motion.div>
    </motion.div>
  );
}

/**
 * The table. `local` (design review page) replaces the server: `{ me, act(action), togglePause?, onFinished? }`.
 */
export default function Game({ room, readOnly = false, onExitBoard, local }) {
  const navigate = useNavigate();
  const sessionId = useApp((s) => s.session?.playerId);
  const me = local?.me ?? sessionId;
  const v = room.game;
  const turn = room.turn;
  const isHost = room.hostId === me;
  const [sheet, setSheet] = useState(null);
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState(null); // a wild waiting for its colour
  const [bubbles, setBubbles] = useState({});
  const [notice, setNotice] = useState(null);
  const [ripple, setRipple] = useState(null);
  const [bursts, setBursts] = useState([]);
  const [hurt, setHurt] = useState(null);
  const ring = useRef(null);
  const [flights, setFlights] = useState([]);
  const [shake, setShake] = useState(0);
  useToastPlacement('top');

  const players = v.players.map((p) => {
    const rp = room.players.find((x) => x.id === p.id);
    return { ...p, nickname: rp?.nickname ?? p.nickname ?? '—', connected: rp?.connected ?? true };
  });
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  const meP = byId[me];
  const nameOf = (id) => (id === me ? 'Vous' : byId[id]?.nickname ?? '—');
  const hostPaused = !!turn?.pausedByHost;
  // A new round: announced over a dimmed table, then dealt (the server waits meanwhile).
  const dealing = v.phase === 'play' && !!v.dealing;
  const playing = !readOnly && room.status === 'playing' && v.phase === 'play' && !dealing;
  const myTurn = playing && !hostPaused && v.turn === me;
  const playable = useMemo(() => new Set(myTurn ? v.playable : []), [myTurn, v.playable]);
  const shownHand = dealing ? NONE : v.hand;
  const hand = useMemo(() => sortHand(shownHand), [shownHand]);
  const mySeat = v.mySeat;
  const order = mySeat >= 0
    ? Array.from({ length: players.length - 1 }, (_, k) => players[(mySeat + 1 + k) % players.length])
    : players;
  const nextSeat = (((v.turnSeat + v.direction) % players.length) + players.length) % players.length;
  const canCall = !!meP && !readOnly && v.phase === 'play' && !hostPaused
    && ((myTurn && (v.step === 'play' || v.step === 'more') && hand.length === 2 && !meP.called) || v.exposed === me);
  const catchable = meP && !readOnly && v.phase === 'play' && v.exposed && v.exposed !== me ? v.exposed : null;

  // ---- talking to the server --------------------------------------------------------
  const send = async (action) => {
    if (busy) return false;
    setBusy(true);
    try {
      await (local ? local.act(action) : sendAction(room.id, action));
      return true;
    } catch (e) {
      sound('error');
      toast({ title: errorMessage(e.code, e.details), tone: 'error' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const rects = useRef(new Map());
  const pick = (card) => {
    if (!myTurn || busy) return;
    if (!playable.has(card)) {
      sound('error');
      haptic('error');
      setShake((x) => x + 1);
      const hint = v.stack ? `Contrez avec un ${KIND_NAMES[v.stack.kind]} ou piochez ${v.stack.count}.`
        : v.step === 'drawn' ? 'Posez la carte piochée, ou gardez-la.'
          : v.step === 'more' ? `Seulement un autre ${v.chain}, ou terminez votre tour.`
          : kindOf(card) === 'F' ? `Le Joker +4 n’est permis que sans carte ${COLOR_NAMES[v.color]} en main.`
          : `Il faut une carte ${COLOR_NAMES[v.color]}, ${symbolHint(v.top)} ou un Joker.`;
      toast({ title: hint, tone: 'info' });
      return;
    }
    if (isWild(card)) { setChoosing(card); sound('pick'); return; }
    playCard(card);
  };
  const playCard = (card, color) => {
    setChoosing(null);
    sound('clink');
    haptic('medium');
    send({ type: 'play', card, ...(color ? { color } : {}) });
  };
  const draw = () => {
    if (!myTurn || v.step !== 'play' || busy) return;
    sound('flip');
    haptic('light');
    send({ type: 'draw' });
  };
  // Keep the card just drawn, or end a turn of doubles.
  const keep = () => { if (myTurn && (v.step === 'drawn' || v.step === 'more')) { sound('back'); send({ type: 'pass' }); } };
  const callIt = () => { if (canCall) { sound('uinio'); haptic('success'); send({ type: 'call' }); } };
  const catchIt = (id) => { sound('pick'); haptic('medium'); send({ type: 'catch', playerId: id }); };
  const ready = () => { sound('pick'); send({ type: 'ready' }); };

  // A colour still being chosen when the turn moves on is dropped.
  useEffect(() => { if (!myTurn) setChoosing(null); }, [myTurn]);

  // Keyboard: P draw, G keep, U call, 1-4 a colour, Escape cancels.
  const keys = useRef({});
  keys.current = { myTurn, choosing, draw, keep, callIt, playCard, catchable, catchIt };
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = keys.current;
      const key = e.key.toLowerCase();
      if (k.choosing) {
        const c = COLORS[Number(e.key) - 1];
        if (c) { e.preventDefault(); k.playCard(k.choosing, c); }
        if (key === 'escape') setChoosing(null);
        return;
      }
      if (key === 'p') k.draw();
      if (key === 'g' || key === 't') k.keep();
      if (key === 'u') k.callIt();
      if (key === 'c' && k.catchable) k.catchIt(k.catchable);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---- the discard pile, as remembered by this page ------------------------------------
  const discard = useRef({ round: v.round, cards: v.top ? [v.top] : [] });
  if (discard.current.round !== v.round) discard.current = { round: v.round, cards: v.top ? [v.top] : [] };
  else if (v.top && discard.current.cards.at(-1) !== v.top) discard.current.cards = [...discard.current.cards.filter((c) => c !== v.top), v.top].slice(-5);
  // A wild keeps, on the pile, the colour it asked for.
  const wilds = useRef({});
  if (v.top && isWild(v.top)) wilds.current[v.top] = v.color;
  const lastPlay = [...v.log].reverse().find((e) => e.type === 'play' && e.card === v.top);
  const topFrom = useRef(null);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; }, []);
  topFrom.current = !lastPlay ? rectOf('un-pile')
    : lastPlay.playerId === me ? rects.current.get(v.top) ?? rectOf('un-hand')
      : rectOf(`un-seat-${lastPlay.playerId}`);

  // ---- my hand: which cards just arrived (they fly in from the pile) --------------------
  const prevHand = useRef(null);
  const fresh = useMemo(() => {
    const out = new Map();
    const before = prevHand.current;
    if (before) {
      let k = 0;
      for (const c of shownHand) if (!before.includes(c)) out.set(c, { delay: k++ * 110 });
    }
    return out;
  }, [shownHand]);
  useEffect(() => { prevHand.current = shownHand; }, [shownHand]);

  // ---- reacting to the table: sounds, bubbles, flights -----------------------------------
  const lastEvent = useRef(v.log.at(-1)?.id ?? 0);
  const say = (id, text, tone) => setBubbles((b) => ({ ...b, [id]: { text, tone, key: `${Date.now()}-${Math.random()}` } }));
  useEffect(() => {
    const fresh = v.log.filter((e) => e.id > lastEvent.current);
    lastEvent.current = v.log.at(-1)?.id ?? lastEvent.current;
    if (!fresh.length) return undefined;
    const timers = [];
    const later = (ms, fn) => timers.push(setTimeout(fn, ms));
    // What hits me: a plaque over my hand (only I see it), the edges flush, my hand jolts.
    let note = null;
    const tell = (rank, n) => { if (!note || rank >= note.rank) note = { rank, ...n }; };
    const hurtMe = () => { setHurt(Date.now()); haptic('error'); shakeEl(document.getElementById('un-hand'), 6); };
    // What everyone sees happens where it happens: on a seat, round the tray, on the pile.
    const jolt = (id) => shakeEl(document.getElementById(`un-seat-${id}`), 5);
    const burst = (id, tone) => setBursts((b) => [...b, { key: `${Date.now()}-${Math.random()}`, id, tone }]);
    const called = (id) => { if (id !== me) burst(id, 'call'); };
    const fly = (to, count, card) => {
      const from = rectOf('un-pile');
      const target = rectOf(to);
      if (!from || !target || !count) return;
      const add = Array.from({ length: Math.min(count, 8) }, (_, i) => ({ id: `${Date.now()}-${Math.random()}`, from, to: target, delay: i * 110, spin: 12 - i * 5, card }));
      setFlights((f) => [...f, ...add]);
    };
    for (const e of fresh) {
      const mine = e.playerId === me;
      if (e.type === 'deal') {
        sound('shuffle');
      } else if (e.type === 'play') {
        if (!mine) later(380, () => sound('clink'));
        const kind = kindOf(e.card);
        if (e.call) { say(e.playerId, 'UINIO !', 'call'); later(420, () => sound('uinio')); called(e.playerId); }
        if (kind === 'R' && players.length > 2) {
          if (!e.call) say(e.playerId, 'Inversion', 'info');
          later(60, () => {
            if (reduced()) return;
            ring.current?.animate?.(
              [{ transform: 'rotate(0deg) scale(1)', color: 'rgba(251, 231, 181, 0.55)' }, { transform: `rotate(${v.direction * 300}deg) scale(1.06)`, color: 'rgba(255, 246, 220, 1)', offset: 0.6 }, { transform: `rotate(${v.direction * 360}deg) scale(1)`, color: 'rgba(251, 231, 181, 0.55)' }],
              { duration: 1200, easing: 'cubic-bezier(0.3, 0.7, 0.2, 1)' },
            );
          });
        } else if (isWild(e.card)) {
          if (!e.call) say(e.playerId, `${COLOR_LABELS[e.color]} !`, e.color);
          setRipple({ key: e.id, color: e.color });
        }
        // Stacking: a +2 / +4 now waits on me.
        if (v.stack && v.turn === me && !mine && e.id === v.log.at(-1)?.id) {
          tell(4, { mark: `+${v.stack.count}`, title: `+${v.stack.count} pour vous`, caption: v.playable.length ? `Contrez avec un ${KIND_NAMES[v.stack.kind]}, ou piochez` : 'Il faut piocher' });
          haptic('medium');
        }
      } else if (e.type === 'skip') {
        if (e.playerId === me) {
          tell(5, { symbol: 'S', title: 'Vous passez votre tour', caption: `${nameOf(lastPlayer(v.log, e.id))} vous fait passer` });
          hurtMe();
        } else {
          say(e.playerId, 'Passe son tour', 'warn');
          jolt(e.playerId);
        }
      } else if (e.type === 'draw' || e.type === 'penalty' || (e.type === 'catch')) {
        const victim = e.type === 'catch' ? e.target : e.playerId;
        if (e.type === 'penalty') {
          if (victim === me) tell(5, { mark: `+${e.count}`, title: `Vous piochez ${plural(e.count, 'carte')}`, caption: 'Et vous passez votre tour' });
          else say(victim, `+${e.count}`, 'warn');
        }
        if (e.type === 'catch') {
          if (victim === me) tell(5, { mark: '!', title: 'Contré !', caption: `${nameOf(e.playerId)} vous prend sans annonce : +${e.count}` });
          else { say(victim, `Contré ! +${e.count}`, 'warn'); burst(victim, 'catch'); }
          if (mine) say(me, `Bien vu : ${nameOf(victim)} pioche ${e.count}`, 'call');
          else say(e.playerId, 'Contre !', 'call');
        }
        if (e.type !== 'draw') { if (victim === me) hurtMe(); else jolt(victim); }
        if (e.type === 'draw' && e.count > 1) say(victim, `pioche ${e.count}`, 'info');
        if (victim !== me) fly(`un-seat-${victim}`, e.count);
        for (let i = 0; i < Math.min(e.count, 6); i++) later(i * 110, () => sound('flip'));
        if (victim === me && e.type !== 'draw') later(200, () => sound('error'));
      } else if (e.type === 'call') {
        say(e.playerId, 'UINIO !', 'call');
        sound('uinio');
        called(e.playerId);
      } else if (e.type === 'keep') {
        say(e.playerId, 'garde', 'info');
      } else if (e.type === 'reshuffle') {
        later(100, () => sound('shuffle'));
      } else if (e.type === 'roundEnd') {
        later(500, () => { sound(mine ? 'bingo' : 'success'); if (mine) haptic('success'); });
      }
    }
    if (note && !readOnly) setNotice({ ...note, key: `${Date.now()}-${note.rank}` });
    return () => timers.forEach(clearTimeout);
  }, [v.log]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(null), 2200);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    if (!ripple) return undefined;
    const t = setTimeout(() => setRipple(null), 1300);
    return () => clearTimeout(t);
  }, [ripple]);
  useEffect(() => {
    if (!hurt) return undefined;
    const t = setTimeout(() => setHurt(null), 900);
    return () => clearTimeout(t);
  }, [hurt]);

  useEffect(() => {
    const t = Object.keys(bubbles).length ? setTimeout(() => setBubbles({}), 1700) : null;
    return () => clearTimeout(t);
  }, [bubbles]);
  // The announcement over: the cards leave the pile for every seat (mine fly into my hand).
  const wasDealing = useRef(dealing);
  useEffect(() => {
    if (wasDealing.current && !dealing) {
      const from = rectOf('un-pile');
      const add = [];
      players.forEach((p, k) => {
        const to = p.id !== me && rectOf(`un-seat-${p.id}`);
        if (!from || !to) return;
        for (let i = 0; i < 4; i++) add.push({ id: `${Date.now()}-${p.id}-${i}`, from, to, delay: i * 180 + k * 45, spin: 12 - i * 6 });
      });
      setFlights((f) => [...f, ...add]);
      for (let i = 0; i < 7; i++) setTimeout(() => sound('flip'), i * 110);
    }
    wasDealing.current = dealing;
  }, [dealing]); // eslint-disable-line react-hooks/exhaustive-deps

  // My turn after a wait: a call.
  const wasMine = useRef(false);
  useEffect(() => {
    if (myTurn && !wasMine.current) { sound('turn'); haptic('turn'); }
    wasMine.current = myTurn;
  }, [myTurn]);

  const togglePause = async () => {
    if (local) { local.togglePause?.(); return; }
    try {
      await call(hostPaused ? 'room:resume' : 'room:pause', { roomId: room.id });
      haptic('light');
    } catch (e) {
      toast({ title: errorMessage(e.code, e.details), tone: 'error' });
    }
  };

  // ---- what to say ---------------------------------------------------------------------
  let status;
  if (readOnly) status = 'Partie terminée.';
  else if (dealing) status = 'Distribution des cartes…';
  else if (hostPaused) status = 'Partie en pause.';
  else if (v.phase === 'reveal') status = 'Fin de manche.';
  else if (myTurn) {
    if (v.stack) status = playable.size ? `+${v.stack.count} pour vous : contrez avec un ${KIND_NAMES[v.stack.kind]}, ou piochez.` : `+${v.stack.count} pour vous : piochez.`;
    else if (choosing) status = 'Choisissez la couleur demandée.';
    else if (v.step === 'drawn') status = `Vous piochez ${cardName(v.drawn)} : la poser ?`;
    else if (v.step === 'more') status = `Encore un ${v.chain} ? Posez-le, ou terminez votre tour.`;
    else status = playable.size ? 'À vous : posez une carte.' : 'Rien à poser : piochez.';
  } else status = `${nameOf(v.turn)} joue…`;

  const clock = turn?.endsAt && turn.durationMs >= 2000 ? turn : null;
  const pileHint = myTurn && v.step === 'play' && !playable.size;

  return (
    <div className="un-table">
      <header className="un-bar">
        <IconButton icon="settings" label="Réglages" onClick={() => setSheet('menu')} className="un-icon" />
        <div className="un-bar__title">
          <span className="un-bar__name">UINIO</span>
          <span className="un-bar__chip">Manche {v.round} · objectif {v.target}</span>
        </div>
        <div className="un-bar__side">
          {isHost && !readOnly && room.status === 'playing' && (
            <IconButton icon={hostPaused ? 'play' : 'pause'} label={hostPaused ? 'Reprendre la partie' : 'Mettre en pause'} onClick={togglePause} className="un-icon" />
          )}
          <IconButton icon="book" label="Règles" onClick={() => setSheet('rules')} className="un-icon" />
        </div>
      </header>

      <div className={`un-seats is-${order.length}`} style={{ '--n': order.length }}>
        {order.map((p) => (
          <Seat
            key={p.id}
            p={dealing ? { ...p, count: 0, called: false } : p}
            dealing={dealing}
            isTurn={playing && v.turn === p.id}
            isNext={playing && players[nextSeat]?.id === p.id}
            exposed={v.exposed === p.id}
            onCatch={catchable === p.id ? () => catchIt(p.id) : null}
            turn={clock}
            playing={!hostPaused && room.status === 'playing'}
          />
        ))}
      </div>

      <main className="un-stage">
        <div className={`un-tray ${choosing ? 'is-choosing' : ''}`} style={{ '--asked': COLOR_HEX[v.color] ?? CREAM }}>
          <Ring direction={v.direction} spinRef={ring} />
          <button type="button" id="un-pile" className={`un-pile ${pileHint ? 'is-hint' : ''}`} onClick={draw} disabled={!myTurn || v.step !== 'play'} aria-label={`Pioche, ${plural(v.pileCount, 'carte')}${myTurn ? ' : piocher' : ''}`}>
            {[2, 1, 0].map((i) => <span key={i} className="un-pile__card" style={{ '--i': i }}><Card card={null} /></span>)}
            <span className="un-pile__count">{v.pileCount}</span>
          </button>
          <Discard
            cards={dealing ? NONE : discard.current.cards}
            from={topFrom.current}
            animate={mounted.current}
            asked={v.color}
            wilds={wilds.current}
            stack={v.stack}
          />
          <AnimatePresence>
            {choosing && <ColorLobes key="lobes" card={choosing} hand={hand} onPick={(c) => playCard(choosing, c)} onCancel={() => setChoosing(null)} />}
          </AnimatePresence>
        </div>
      </main>

      <section id="un-hand" className={`un-me ${myTurn ? 'is-turn' : ''}`}>
        {meP && (
          <div className="un-me__plate">
            <span className="un-me__name">Vous</span>
            <span className="un-me__pts">{meP.total} pts</span>
            {meP.called && hand.length === 1 && <span className="un-tag">UINIO !</span>}
            <AnimatePresence>
              {notice && <Notice key={notice.key} n={notice} />}
            </AnimatePresence>
            <AnimatePresence>
              {bubbles[me] && !notice && (
                <motion.span key={bubbles[me].key} className={`un-bubble un-bubble--me is-${bubbles[me].tone ?? 'info'}`} initial={{ opacity: 0, y: 6, scale: 0.8 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }}>
                  {bubbles[me].text}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        )}
        <div key={shake} className={shake ? 'un-shake' : ''}>
          <Hand cards={hand} playable={playable} myTurn={myTurn} fresh={fresh} selected={choosing} onPick={pick} rects={rects} drawn={myTurn && v.step === 'drawn' ? v.drawn : null} />
        </div>
      </section>

      <footer className="un-dock">
        {clock && myTurn && <TurnTimer key={`${clock.key}-${clock.endsAt}`} turn={clock} />}
        {catchable && (
          <button type="button" className="un-btn un-btn--catch un-dock__float" onClick={() => catchIt(catchable)}>
            Contrer {nameOf(catchable)} <small>+2 pour lui</small>
          </button>
        )}
        <div key={`${v.turn}-${v.step}`} className="un-dock__row un-dock__in">
          <p className="un-status" role="status" aria-live="polite">{status}</p>
          <div className="un-dock__actions">
            {canCall && (
              <button type="button" className={`un-btn un-btn--call ${v.exposed === me ? 'is-urgent' : ''}`} onClick={callIt} disabled={busy}>
                UINIO !
              </button>
            )}
            {myTurn && v.step === 'drawn' && (
              <>
                <button type="button" className="un-btn" onClick={keep} disabled={busy}>Garder</button>
                <button type="button" className="un-btn un-btn--enamel" onClick={() => pick(v.drawn)} disabled={busy}>Poser</button>
              </>
            )}
            {myTurn && v.step === 'more' && (
              <button type="button" className="un-btn un-btn--enamel" onClick={keep} disabled={busy}>Terminer</button>
            )}
            {myTurn && v.step === 'play' && !choosing && (
              <button type="button" className={`un-btn ${!playable.size ? 'un-btn--enamel' : ''}`} onClick={draw} disabled={busy}>
                {v.stack ? `Piocher ${v.stack.count}` : 'Piocher'}
              </button>
            )}
          </div>
        </div>
      </footer>

      <AnimatePresence>
        {dealing && !readOnly && (
          <motion.div key={`deal-${v.round}`} className="un-deal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.4 } }} aria-live="polite">
            <motion.div
              className="un-deal__title"
              initial={{ opacity: 0, y: 18, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 1.04, transition: { duration: 0.3 } }}
              transition={{ type: 'spring', bounce: 0.35, duration: 0.6, delay: 0.15 }}
            >
              <span className="un-deal__rule" aria-hidden />
              <strong>Manche {v.round}</strong>
              <small>{nameOf(players[v.dealer]?.id)} {players[v.dealer]?.id === me ? 'distribuez' : 'distribue'} · {plural(7, 'carte')} chacun</small>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {flights.map((f) => <Flight key={f.id} flight={f} onDone={(id) => setFlights((all) => all.filter((x) => x.id !== id))} />)}
      <AnimatePresence>
        {order.map((p) => bubbles[p.id] && <SeatBubble key={bubbles[p.id].key} id={p.id} bubble={bubbles[p.id]} low={v.exposed === p.id} />)}
      </AnimatePresence>
      {ripple && <Ripple key={ripple.key} color={ripple.color} />}
      {bursts.map((b) => <Burst key={b.key} id={b.id} tone={b.tone} onDone={() => setBursts((all) => all.filter((x) => x.key !== b.key))} />)}
      {hurt && <span key={hurt} className="un-hurt" aria-hidden />}

      <AnimatePresence>
        {v.roundResult && (v.phase === 'reveal' || v.phase === 'over') && (
          <Recap
            key={`recap-${v.roundResult.round}`}
            v={{ ...v, players }}
            me={me}
            nameOf={nameOf}
            onReady={ready}
            readyDisabled={busy || readOnly || hostPaused}
            finished={v.phase === 'over' || readOnly}
            onNext={local?.onFinished ?? onExitBoard}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {hostPaused && room.status === 'playing' && (
          <motion.div key="pause" className="un-paused" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="status">
            <motion.div className="un-paused__card" initial={{ scale: 0.92, y: 10 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', bounce: 0.3, duration: 0.45 }}>
              <strong>Partie en pause</strong>
              <span>{isHost ? 'Les chronos et les robots sont arrêtés.' : `${nameOf(room.hostId)} a mis la partie en pause.`}</span>
              {isHost && (
                <button type="button" className="un-btn un-btn--enamel" onClick={togglePause} autoFocus>
                  <Icon name="play" size={18} strokeWidth={2.4} /> Reprendre
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <SettingsSheet open={sheet === 'menu'} onClose={() => setSheet(null)}>
        <div className="settings__group">
          <span className="eyebrow">Partie · salon {room.id}</span>
          <Button variant="secondary" icon="book" onClick={() => setSheet('rules')}>Règles de UINIO</Button>
          {isHost && room.status === 'playing' && !readOnly && (
            <Button variant="secondary" icon={hostPaused ? 'play' : 'pause'} onClick={() => { setSheet(null); togglePause(); }}>
              {hostPaused ? 'Reprendre la partie' : 'Mettre la partie en pause'}
            </Button>
          )}
          {readOnly
            ? <Button variant="secondary" icon="back" onClick={() => { setSheet(null); onExitBoard?.(); }}>Retour aux résultats</Button>
            : <Button variant="danger" icon="logout" onClick={() => setSheet('leave')}>Quitter la partie</Button>}
        </div>
      </SettingsSheet>
      <RulesSheet open={sheet === 'rules'} onClose={() => setSheet(null)} />
      <Sheet
        open={sheet === 'leave'}
        onClose={() => setSheet(null)}
        title="Quitter la partie ?"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setSheet(null)}>Annuler</Button>
            <Button variant="danger" onClick={() => navigate('/')}>Quitter</Button>
          </>
        )}
      >
        <p className="sheet-lead">Votre place est gardée : vous pourrez revenir depuis l’accueil. En votre absence, un robot joue vos tours.</p>
      </Sheet>
    </div>
  );
}

/** "un 7", "une Passe"…: what else matches the top card. */
function symbolHint(top) {
  const kind = kindOf(top);
  if (/[0-9]/.test(kind)) return `un ${kind}`;
  return { S: 'une Passe', R: 'une Inversion', D: 'un +2' }[kind] ?? 'la même carte';
}

/** Who played the card that led to event `id` (a skip names its victim, not its author). */
function lastPlayer(log, id) {
  return [...log].reverse().find((e) => e.id < id && e.type === 'play')?.playerId;
}
