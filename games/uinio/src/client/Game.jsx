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
import Card, { CREAM, Mark, cardName } from './Card.jsx';
import RulesSheet from './RulesSheet.jsx';
import { COLOR_HEX, COLOR_LABELS, COLOR_NAMES, KIND_NAMES, plural } from './i18n.js';
import './uinio.css';

const ORDER = [...COLORS, 'w'];
const KINDS = '0123456789SRDWF';
/** My hand, sorted: by colour, then by value; wilds last. */
const sortHand = (hand) => [...hand].sort((a, b) => ORDER.indexOf(colorOf(a)) - ORDER.indexOf(colorOf(b)) || KINDS.indexOf(kindOf(a)) - KINDS.indexOf(kindOf(b)) || a.localeCompare(b));
/** A stable small number from a card id: its tilt on the discard pile. */
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 9973, 7);
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const centre = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
const rectOf = (id) => document.getElementById(id)?.getBoundingClientRect() ?? null;

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
function Discard({ cards, from, animate, asked, stack, ghost, onClick, canDrop }) {
  return (
    <button type="button" id="un-discard" className={`un-discard ${canDrop ? 'is-target' : ''}`} onClick={onClick} disabled={!onClick} aria-label="Défausse" style={{ '--asked': COLOR_HEX[asked] ?? CREAM }}>
      <span className="un-discard__halo" aria-hidden />
      {cards.map((c, i) => (
        <Laid key={c} card={c} top={i === cards.length - 1} from={i === cards.length - 1 && animate ? from : null} />
      ))}
      {ghost && <span className="un-discard__ghost" aria-hidden><Card card={ghost} /></span>}
      {stack && <span key={stack.count} className="un-stack" aria-label={`${stack.count} cartes à piocher`}>+{stack.count}</span>}
    </button>
  );
}

function Laid({ card, top, from }) {
  const ref = useRef(null);
  const h = hash(card);
  useLayoutEffect(() => { if (from) flyIn(ref.current, from, { spin: (h % 2 ? 1 : -1) * 16 }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span className={`un-laid ${top ? 'is-top' : ''}`} style={{ rotate: `${(h % 29) - 14}deg`, translate: `${(h % 7) - 3}px ${(h % 5) - 2}px` }}>
      <span ref={ref} className="un-laid__in"><Card card={card} /></span>
    </span>
  );
}

/** My hand, in a fan that fits the width: playable cards stand up on my turn. */
function Hand({ cards, playable, myTurn, fresh, selected, onPick, onHover, rects, drawn }) {
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
            onHover={onHover}
          />
        );
      })}
    </div>
  );
}

function HandCard({ card, ok, dim, isDrawn, selected, fresh, style, onPick, onHover }) {
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
      onPointerEnter={(e) => e.pointerType === 'mouse' && onHover(ok ? card : null)}
      onPointerLeave={() => onHover(null)}
    >
      <span ref={ref} className="un-hcard__in" data-card={card}><Card card={card} /></span>
    </button>
  );
}

/** Another player, round the table: a coaster, a fan of backs, the score, what they just did. */
function Seat({ p, isTurn, isNext, bubble, exposed, onCatch, turn, playing }) {
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
      <div className="un-seat__fan" aria-label={plural(p.count, 'carte')}>
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
      <AnimatePresence>
        {bubble && (
          <motion.span key={bubble.key} className={`un-bubble is-${bubble.tone ?? 'info'}`} initial={{ opacity: 0, y: 6, scale: 0.8 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} transition={{ type: 'spring', bounce: 0.45, duration: 0.4 }}>
            {bubble.text}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Choosing the colour of a wild: the four enamels, with how many of each I hold. */
function ColorPicker({ card, hand, onPick, onCancel }) {
  const counts = Object.fromEntries(COLORS.map((c) => [c, hand.filter((x) => x !== card && colorOf(x) === c).length]));
  const best = COLORS.reduce((a, b) => (counts[b] > counts[a] ? b : a));
  return (
    <div className="un-picker un-dock__in" role="dialog" aria-label="Choisir la couleur">
      <span className="un-picker__title">{KIND_NAMES[kindOf(card)]} : quelle couleur demander ?</span>
      <div className="un-picker__row">
        {COLORS.map((c, i) => (
          <button key={c} type="button" className={`un-swatch ${c === best && counts[c] ? 'is-best' : ''}`} style={{ '--c': COLOR_HEX[c] }} onClick={() => onPick(c)} autoFocus={i === 0}>
            <svg viewBox="-12 -12 24 24" aria-hidden><Mark color={c} s={13} /></svg>
            <span>{COLOR_LABELS[c]}</span>
            <small>{counts[c] ? `×${counts[c]}` : '—'}</small>
          </button>
        ))}
      </div>
      <button type="button" className="un-link" onClick={onCancel}>Annuler</button>
    </div>
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
  const [hover, setHover] = useState(null);
  const [bubbles, setBubbles] = useState({});
  const [flights, setFlights] = useState([]);
  const [banner, setBanner] = useState(null);
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
  const playing = !readOnly && room.status === 'playing' && v.phase === 'play';
  const myTurn = playing && !hostPaused && v.turn === me;
  const playable = useMemo(() => new Set(myTurn ? v.playable : []), [myTurn, v.playable]);
  const hand = useMemo(() => sortHand(v.hand), [v.hand]);
  const mySeat = v.mySeat;
  const order = mySeat >= 0
    ? Array.from({ length: players.length - 1 }, (_, k) => players[(mySeat + 1 + k) % players.length])
    : players;
  const nextSeat = (((v.turnSeat + v.direction) % players.length) + players.length) % players.length;
  const canCall = !!meP && !readOnly && v.phase === 'play' && !hostPaused
    && ((myTurn && v.step === 'play' && hand.length === 2 && !meP.called) || v.exposed === me);
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
          : `Il faut du ${COLOR_NAMES[v.color]}, ${symbolHint(v.top)} ou un Joker.`;
      toast({ title: hint, tone: 'info' });
      return;
    }
    if (isWild(card)) { setChoosing(card); sound('pick'); return; }
    playCard(card);
  };
  const playCard = (card, color) => {
    setChoosing(null);
    setHover(null);
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
  const keep = () => { if (myTurn && v.step === 'drawn') { sound('back'); send({ type: 'pass' }); } };
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
      if (key === 'g') k.keep();
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
      for (const c of v.hand) if (!before.includes(c)) out.set(c, { delay: k++ * 110 });
    }
    return out;
  }, [v.hand]);
  useEffect(() => { prevHand.current = v.hand; }, [v.hand]);

  // ---- reacting to the table: sounds, bubbles, flights -----------------------------------
  const lastEvent = useRef(v.log.at(-1)?.id ?? 0);
  const say = (id, text, tone) => setBubbles((b) => ({ ...b, [id]: { text, tone, key: `${Date.now()}-${Math.random()}` } }));
  useEffect(() => {
    const fresh = v.log.filter((e) => e.id > lastEvent.current);
    lastEvent.current = v.log.at(-1)?.id ?? lastEvent.current;
    if (!fresh.length) return undefined;
    const timers = [];
    const later = (ms, fn) => timers.push(setTimeout(fn, ms));
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
        if (!readOnly) setBanner({ round: e.round, key: e.id });
        sound('shuffle');
        for (const p of players) if (p.id !== me) fly(`un-seat-${p.id}`, 4);
      } else if (e.type === 'play') {
        if (!mine) later(380, () => sound('clink'));
        const kind = kindOf(e.card);
        if (e.call) { say(e.playerId, 'UINIO !', 'call'); later(420, () => sound('uinio')); }
        else if (kind === 'R' && players.length > 2) say(e.playerId, 'Inversion', 'info');
        else if (isWild(e.card)) say(e.playerId, `${COLOR_LABELS[e.color]} !`, e.color);
      } else if (e.type === 'skip') {
        say(e.playerId, 'Passe son tour', 'warn');
        if (e.playerId === me) haptic('medium');
      } else if (e.type === 'draw' || e.type === 'penalty' || (e.type === 'catch')) {
        const victim = e.type === 'catch' ? e.target : e.playerId;
        if (e.type === 'penalty') say(victim, `+${e.count}`, 'warn');
        if (e.type === 'catch') { say(victim, `Contré ! +${e.count}`, 'warn'); say(e.playerId, 'Contre !', 'call'); }
        if (e.type === 'draw' && e.count > 1) say(victim, `pioche ${e.count}`, 'info');
        if (victim !== me) fly(`un-seat-${victim}`, e.count);
        for (let i = 0; i < Math.min(e.count, 6); i++) later(i * 110, () => sound('flip'));
        if (victim === me && e.type !== 'draw') { haptic('error'); later(200, () => sound('error')); }
      } else if (e.type === 'call') {
        say(e.playerId, 'UINIO !', 'call');
        sound('uinio');
      } else if (e.type === 'keep') {
        say(e.playerId, 'garde', 'info');
      } else if (e.type === 'reshuffle') {
        later(100, () => sound('shuffle'));
      } else if (e.type === 'roundEnd') {
        later(500, () => { sound(mine ? 'bingo' : 'success'); if (mine) haptic('success'); });
      }
    }
    return () => timers.forEach(clearTimeout);
  }, [v.log]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = Object.keys(bubbles).length ? setTimeout(() => setBubbles({}), 1700) : null;
    return () => clearTimeout(t);
  }, [bubbles]);
  useEffect(() => {
    if (!banner) return undefined;
    const t = setTimeout(() => setBanner(null), 1600);
    return () => clearTimeout(t);
  }, [banner]);

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
  else if (hostPaused) status = 'Partie en pause.';
  else if (v.phase === 'reveal') status = 'Fin de manche.';
  else if (myTurn) {
    if (v.stack) status = playable.size ? `+${v.stack.count} pour vous : contrez avec un ${KIND_NAMES[v.stack.kind]}, ou piochez.` : `+${v.stack.count} pour vous : piochez.`;
    else if (v.step === 'drawn') status = `Vous piochez ${cardName(v.drawn)} : la poser ?`;
    else status = playable.size ? 'À vous : posez une carte.' : 'Rien à poser : piochez.';
  } else status = `${nameOf(v.turn)} joue…`;

  const clock = turn?.endsAt && turn.durationMs >= 2000 ? turn : null;
  const ghost = myTurn && hover && playable.has(hover) ? hover : null;
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

      <div className={`un-seats is-${order.length}`}>
        {order.map((p) => (
          <Seat
            key={p.id}
            p={p}
            isTurn={v.phase === 'play' && v.turn === p.id}
            isNext={v.phase === 'play' && players[nextSeat]?.id === p.id}
            bubble={bubbles[p.id]}
            exposed={v.exposed === p.id}
            onCatch={catchable === p.id ? () => catchIt(p.id) : null}
            turn={clock}
            playing={!hostPaused && room.status === 'playing'}
          />
        ))}
      </div>

      <main className="un-stage">
        {banner && (
          <div key={banner.key} className="un-banner" aria-hidden>
            <strong>Manche {banner.round}</strong>
            <small>{plural(7, 'carte')} chacun</small>
          </div>
        )}
        <div className="un-tray" style={{ '--asked': COLOR_HEX[v.color] ?? CREAM }}>
          <svg className={`un-tray__ring ${v.direction < 0 ? 'is-ccw' : ''}`} viewBox="-100 -100 200 200" aria-label={v.direction > 0 ? 'Sens des aiguilles d’une montre' : 'Sens inverse'}>
            {[0, 120, 240].map((a) => (
              <g key={a} transform={`rotate(${a})`}>
                <path d="M -40 -86 A 94 94 0 0 1 40 -86" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                <path d={v.direction > 0 ? 'M 40 -86 l -10 -6 l 2 11 z' : 'M -40 -86 l 10 -6 l -2 11 z'} fill="currentColor" />
              </g>
            ))}
          </svg>
          <button type="button" id="un-pile" className={`un-pile ${pileHint ? 'is-hint' : ''}`} onClick={draw} disabled={!myTurn || v.step !== 'play'} aria-label={`Pioche, ${plural(v.pileCount, 'carte')}${myTurn ? ' : piocher' : ''}`}>
            {[2, 1, 0].map((i) => <span key={i} className="un-pile__card" style={{ '--i': i }}><Card card={null} /></span>)}
            <span className="un-pile__count">{v.pileCount}</span>
          </button>
          <Discard
            cards={discard.current.cards}
            from={topFrom.current}
            animate={mounted.current}
            asked={v.color}
            stack={v.stack}
            ghost={ghost}
          />
          <span className="un-asked" style={{ '--c': COLOR_HEX[v.color] }}>
            <svg viewBox="-12 -12 24 24" aria-hidden><Mark color={v.color} s={12} /></svg>
            {COLOR_LABELS[v.color]}
          </span>
        </div>
      </main>

      <section id="un-hand" className={`un-me ${myTurn ? 'is-turn' : ''}`}>
        {meP && (
          <div className="un-me__plate">
            <span className="un-me__name">Vous</span>
            <span className="un-me__pts">{meP.total} pts</span>
            {meP.called && hand.length === 1 && <span className="un-tag">UINIO !</span>}
            <AnimatePresence>
              {bubbles[me] && (
                <motion.span key={bubbles[me].key} className={`un-bubble un-bubble--me is-${bubbles[me].tone ?? 'info'}`} initial={{ opacity: 0, y: 6, scale: 0.8 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }}>
                  {bubbles[me].text}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        )}
        <div key={shake} className={shake ? 'un-shake' : ''}>
          <Hand cards={hand} playable={playable} myTurn={myTurn} fresh={fresh} selected={choosing} onPick={pick} onHover={setHover} rects={rects} drawn={myTurn && v.step === 'drawn' ? v.drawn : null} />
        </div>
      </section>

      <footer className="un-dock">
        {clock && myTurn && <TurnTimer key={`${clock.key}-${clock.endsAt}`} turn={clock} />}
        {catchable && (
          <button type="button" className="un-btn un-btn--catch un-dock__float" onClick={() => catchIt(catchable)}>
            Contrer {nameOf(catchable)} <small>+2 pour lui</small>
          </button>
        )}
        {choosing ? (
          <ColorPicker key="pick" card={choosing} hand={hand} onPick={(c) => playCard(choosing, c)} onCancel={() => setChoosing(null)} />
        ) : (
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
              {myTurn && v.step === 'play' && (
                <button type="button" className={`un-btn ${!playable.size ? 'un-btn--enamel' : ''}`} onClick={draw} disabled={busy}>
                  {v.stack ? `Piocher ${v.stack.count}` : 'Piocher'}
                </button>
              )}
            </div>
          </div>
        )}
      </footer>

      {flights.map((f) => <Flight key={f.id} flight={f} onDone={(id) => setFlights((all) => all.filter((x) => x.id !== id))} />)}

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
