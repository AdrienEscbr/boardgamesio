import { createContext, memo, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useMediaQuery } from '@bgio/ui/lib/useMediaQuery.js';
import { haptic, sound } from '@bgio/ui/lib/feedback.js';
import { Avatar } from '@bgio/ui/components/ui.jsx';
import Icon from '@bgio/ui/components/Icon.jsx';
import { DUTCH_LIMIT, FAILED_DUTCH_PENALTY, PEEK_COUNT, cardValue, powerOf, rankOf } from '../engine/index.js';
import OrderBar from './OrderBar.jsx';
import RoundRecap from './RoundRecap.jsx';
import DutchCard from './DutchCard.jsx';
import { POWER_SHORT, cardShort, points } from './i18n.js';
import './table.css';

// The DutchIO table, shared by the game screen and the design review page. It draws the
// state it is given (a player's view), animates what changed (from the view's `log`), and
// turns clicks into actions, with a preview of each action before it is played.
//
// Every place a card can be is a "spot" with a key: `slot:<playerId>:<i>`, `pile`,
// `discard`, `hold:<playerId>` (a drawn card). Flights measure their spots on screen.

const Spots = createContext(null);
function useSpot(key) {
  const reg = useContext(Spots);
  return useCallback((el) => { if (el) reg.set(key, el); else reg.delete(key); }, [reg, key]);
}

const slotKey = (playerId, i) => `slot:${playerId}:${i}`;
const holdKey = (playerId) => `hold:${playerId}`;
/**
 * Grid place of a card: the 2×2 square always; extra (penalty) cards are packed in order in
 * columns on the right, `k` being the card's rank among the extra cards still shown.
 */
const placeOf = (i, k) => (i < 4 ? { gridColumn: (i % 2) + 1, gridRow: Math.floor(i / 2) + 1 } : { gridColumn: 3 + Math.floor(k / 2), gridRow: (k % 2) + 1 });

/** The face a spot shows in a view (null: face down or empty). */
function faceIn(v, key) {
  if (!v) return null;
  if (key === 'discard') return v.discardTop;
  if (key === 'pile') return null;
  const [kind, id, i] = key.split(':');
  if (kind === 'hold') return id === v.me ? v.drawn : null;
  return v.players.find((p) => p.id === id)?.slots[Number(i)]?.card ?? null;
}

/** Time left on a clock, as a draining bar (CSS animation, no re-render). */
function Drain({ clock, now, className }) {
  const [elapsed] = useState(() => (clock?.endsAt ? Math.max(0, clock.durationMs - Math.max(0, clock.endsAt - now())) : 0));
  if (!clock?.endsAt || !clock.durationMs) return null;
  return (
    <span className={className} aria-hidden>
      <span style={{ animationDuration: `${clock.durationMs}ms`, animationDelay: `-${elapsed}ms` }} />
    </span>
  );
}

const RANK_OF_POWER = { 7: 'du 7', 11: 'du Valet', 13: 'de la Dame', 14: 'du Roi' };

// ---------------------------------------------------------------------------
// Effects: flights, lifted cards, wrong burns shown, captions, floating words, banner
// ---------------------------------------------------------------------------

let fxId = 0;

function useFx(view, names, reg) {
  const [flights, setFlights] = useState([]);
  const [masked, setMasked] = useState({}); // spot key -> flights still heading there
  const [lifts, setLifts] = useState({}); // spot key -> who is looking
  const [flashes, setFlashes] = useState({}); // spot key -> card shown after a wrong burn
  const [captions, setCaptions] = useState({}); // player id -> what they just did
  const [pops, setPops] = useState([]);
  const [banner, setBanner] = useState(null);
  const [burst, setBurst] = useState(0); // the discard flares when a card is burnt
  const [stamp, setStamp] = useState(0); // the caller's ribbon is stamped
  const [discardShown, setDiscardShown] = useState(view.discardTop);
  const prev = useRef(null);
  const toDiscard = useRef(0);
  const timers = useRef([]);
  const last = view.log.at(-1)?.id ?? 0;
  // Joining at the very start of a round: the deal is played too.
  const seen = useRef(view.phase === 'peek' && view.log.at(-1)?.type === 'deal' ? last - 1 : last);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (ms, fn) => timers.current.push(setTimeout(fn, ms));
  const nameOf = (id) => (id === view.me ? 'Vous' : names[id] ?? '—');
  const whose = (id, by) => (id === view.me ? 'votre carte' : id === by ? 'une de ses cartes' : `une carte de ${nameOf(id)}`);

  const mask = (key, d) => setMasked((m) => {
    const n = (m[key] ?? 0) + d;
    const next = { ...m };
    if (n > 0) next[key] = n; else delete next[key];
    return next;
  });

  const pop = (key, text, tone = '', icon = null) => {
    const el = reg.get(key);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const id = ++fxId;
    setPops((list) => [...list, { id, x: r.left + r.width / 2, y: r.top, text, tone, icon }]);
    later(1900, () => setPops((list) => list.filter((p) => p.id !== id)));
  };
  const caption = (playerId, text, icon, tone = '', at = 0) => {
    if (playerId === view.me) return;
    const id = ++fxId;
    later(at, () => setCaptions((c) => ({ ...c, [playerId]: { id, text, icon, tone } })));
    later(at + 3200, () => setCaptions((c) => (c[playerId]?.id === id ? (({ [playerId]: _, ...rest }) => rest)(c) : c)));
  };

  useLayoutEffect(() => {
    const before = prev.current ?? view;
    prev.current = view;
    const fresh = view.log.filter((e) => e.id > seen.current);
    seen.current = last;
    if (!fresh.length) {
      if (!toDiscard.current) setDiscardShown(view.discardTop);
      return;
    }
    const added = [];
    const fly = (from, to, { card = null, delay = 0, dur = 560, kind = 'move', onLand } = {}) => {
      const b = reg.get(to)?.getBoundingClientRect();
      // A spot that just left the screen (my drawn card, replaced by the power panel): the
      // card drops onto its destination from a little above.
      const a = reg.get(from)?.getBoundingClientRect() ?? (b && new DOMRect(b.left, b.top - 70, b.width, b.height));
      if (!a || !b) {
        if (to === 'discard') setDiscardShown(card ?? view.discardTop);
        onLand?.();
        return;
      }
      const toFace = to === 'discard' ? card ?? view.discardTop : faceIn(view, to);
      const fromFace = from === 'discard' ? before.discardTop : faceIn(before, from);
      mask(to, 1);
      if (to === 'discard') toDiscard.current += 1;
      added.push({
        id: ++fxId, from: a, to: b, toKey: to, kind, delay, dur, onLand,
        card: toFace ?? fromFace ?? card, fromUp: !!fromFace, toUp: !!toFace,
      });
    };
    let t = 0;
    for (const e of fresh) {
      const mine = e.playerId === view.me;
      switch (e.type) {
        case 'deal': {
          sound('shuffle');
          setDiscardShown(null);
          setCaptions({});
          const seats = view.players.length;
          view.players.forEach((p, s) => p.slots.forEach((_, i) => {
            const order = i * seats + ((s - view.turnSeat + seats) % seats);
            fly('pile', slotKey(p.id, i), { delay: t + order * 70, dur: 460, onLand: () => sound('place') });
          }));
          t += 4 * seats * 70 + 200;
          fly('pile', 'discard', { card: view.discardTop, delay: t, dur: 480 });
          t += 300;
          break;
        }
        case 'reshuffle':
          sound('shuffle');
          for (let k = 0; k < 4; k++) fly('discard', 'pile', { delay: t + k * 60, dur: 380 });
          t += 300;
          break;
        case 'draw':
          fly('pile', holdKey(e.playerId), { delay: t, dur: 520, onLand: () => mine && sound('flip') });
          caption(e.playerId, 'pioche', 'plus', '', t);
          t += 200;
          break;
        case 'replace':
          fly(slotKey(e.playerId, e.slot), 'discard', { card: e.out, delay: t, onLand: () => sound('place') });
          fly(holdKey(e.playerId), slotKey(e.playerId, e.slot), { card: e.card ?? null, delay: t + 160, dur: 520 });
          caption(e.playerId, `garde sa pioche, jette ${cardShort(e.out)}`, 'swap', '', t);
          t += 260;
          break;
        case 'take':
          setDiscardShown(null);
          fly('discard', slotKey(e.playerId, e.slot), { card: e.card, delay: t, dur: 560 });
          fly(slotKey(e.playerId, e.slot), 'discard', { card: e.out, delay: t + 140, onLand: () => sound('place') });
          caption(e.playerId, `prend ${cardShort(e.card)}, jette ${cardShort(e.out)}`, 'swap', '', t);
          t += 260;
          break;
        case 'discard':
          fly(holdKey(e.playerId), 'discard', { card: e.card, delay: t, onLand: () => sound('place') });
          caption(e.playerId, `défausse ${cardShort(e.card)}${e.power ? ' · pouvoir' : ''}`, 'arrowRight', e.power ? 'eye' : '', t);
          t += 200;
          break;
        case 'look': {
          const key = slotKey(e.target.playerId, e.target.slot);
          later(t, () => {
            sound('flip');
            setLifts((l) => ({ ...l, [key]: e.playerId }));
            if (e.target.playerId === view.me && !mine) pop(key, `${nameOf(e.playerId)} regarde`, 'eye', 'eye');
          });
          caption(e.playerId, `regarde ${whose(e.target.playerId, e.playerId)}`, 'eye', 'eye', t);
          later(t + 2600, () => setLifts((l) => { const n = { ...l }; delete n[key]; return n; }));
          break;
        }
        case 'exchange': {
          const a = slotKey(e.playerId, e.slot);
          const b = slotKey(e.target.playerId, e.target.slot);
          setLifts((l) => { const n = { ...l }; delete n[b]; return n; });
          fly(a, b, { delay: t, dur: 640, kind: 'swap' });
          fly(b, a, { delay: t, dur: 640, kind: 'swap', onLand: () => sound('place') });
          if (e.target.playerId === view.me) later(t + 700, () => pop(b, `${nameOf(e.playerId)} échange`, 'swap', 'swap'));
          caption(e.playerId, `échange avec ${e.target.playerId === view.me ? 'vous' : nameOf(e.target.playerId)}`, 'swap', 'swap', t);
          t += 300;
          break;
        }
        case 'skip':
          caption(e.playerId, 'n’utilise pas son pouvoir', 'skip', '', t);
          break;
        case 'burn': {
          const from = slotKey(e.owner, e.slot);
          fly(from, 'discard', {
            card: e.card, delay: t, dur: 480, kind: 'burn',
            onLand: () => {
              sound('burn');
              haptic(mine ? 'success' : 'light');
              setBurst((b) => b + 1);
              pop('discard', mine ? `Brûlée ! ${cardShort(e.card)}` : `${nameOf(e.playerId)} brûle ${cardShort(e.card)}`, 'burn', 'flame');
            },
          });
          if (e.give != null) fly(slotKey(e.playerId, e.give), from, { delay: t + 380, dur: 560 });
          caption(e.playerId, `brûle ${cardShort(e.card)}${e.owner !== e.playerId ? ` chez ${e.owner === view.me ? 'vous' : nameOf(e.owner)}` : ''}`, 'flame', 'burn', t);
          t += 260;
          break;
        }
        case 'burnFail': {
          const key = slotKey(e.owner, e.slot);
          later(t, () => {
            sound('error');
            if (mine) haptic('error');
            setFlashes((f) => ({ ...f, [key]: e.card }));
            pop(key, mine ? 'Raté ! +1 carte' : `${nameOf(e.playerId)} se trompe`, 'wrong', 'close');
          });
          caption(e.playerId, `se trompe (${cardShort(e.card)}) : +1 carte`, 'close', 'wrong', t);
          later(t + 1500, () => setFlashes((f) => { const n = { ...f }; delete n[key]; return n; }));
          if (e.penaltySlot != null) fly('pile', slotKey(e.playerId, e.penaltySlot), { delay: t + 1100, dur: 520, onLand: () => sound('place') });
          t += 300;
          break;
        }
        case 'dutch':
          later(t, () => {
            sound('dutch');
            haptic('medium');
            setStamp((s) => s + 1);
            setBanner({ id: ++fxId, title: 'Dutch !', sub: mine ? 'Vous annoncez : chacun joue une dernière fois.' : `${nameOf(e.playerId)} annonce : un dernier tour pour tout le monde.` });
          });
          break;
        case 'reveal':
          setCaptions({});
          later(t, () => sound('flip'));
          break;
        default:
      }
    }
    if (added.length) setFlights((list) => [...list, ...added]);
  }, [last]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!banner) return undefined;
    const t = setTimeout(() => setBanner(null), 2200);
    return () => clearTimeout(t);
  }, [banner]);

  const land = (f) => {
    setFlights((list) => list.filter((x) => x.id !== f.id));
    mask(f.toKey, -1);
    if (f.toKey === 'discard') {
      toDiscard.current -= 1;
      setDiscardShown(toDiscard.current ? f.card : prev.current.discardTop);
    }
    f.onLand?.();
  };

  return { flights, masked, lifts, flashes, captions, pops, banner, burst, stamp, discardShown, land };
}

const Flight = memo(function Flight({ f, onLand }) {
  const done = useRef(false);
  return (
    <motion.div
      className={`dt-flight is-${f.kind}`}
      initial={{ x: f.from.left, y: f.from.top, width: f.from.width, height: f.from.height, rotate: 0 }}
      animate={{ x: f.to.left, y: f.to.top, width: f.to.width, height: f.to.height, rotate: f.kind === 'swap' ? [0, 8, 0] : [0, -4, 0], scale: [1, 1.12, 1] }}
      transition={{ duration: f.dur / 1000, delay: f.delay / 1000, ease: [0.3, 0.7, 0.2, 1] }}
      onAnimationComplete={() => { if (!done.current) { done.current = true; onLand(f); } }}
    >
      <DutchCard card={f.card} fromUp={f.fromUp} faceUp={f.toUp} delay={f.delay / 1000 + 0.08} />
    </motion.div>
  );
});

/** Feedforward: a dashed link between two spots (what an exchange will swap). */
function Links({ links, reg }) {
  if (!links.length) return null;
  const centre = (key) => {
    const r = reg.get(key)?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  };
  return (
    <svg className="dt-links" aria-hidden>
      {links.map(([a, b]) => {
        const p = centre(a);
        const q = centre(b);
        if (!p || !q) return null;
        const mx = (p.x + q.x) / 2;
        const my = (p.y + q.y) / 2 - Math.min(80, Math.hypot(q.x - p.x, q.y - p.y) * 0.2);
        return (
          <g key={`${a}-${b}`}>
            <path d={`M${p.x} ${p.y} Q${mx} ${my} ${q.x} ${q.y}`} className="dt-link" />
            <circle cx={p.x} cy={p.y} r="5" className="dt-link__end" />
            <circle cx={q.x} cy={q.y} r="5" className="dt-link__end" />
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Spots
// ---------------------------------------------------------------------------

function Slot({ playerId, index, place, slot, fx, intent, preview, armed, revealDelay, onSpot, onHover, protectedSeat, dim }) {
  const key = slotKey(playerId, index);
  const ref = useSpot(key);
  const flash = fx.flashes[key];
  const hidden = fx.masked[key];
  const lift = fx.lifts[key];
  const card = flash ?? slot?.card ?? null;
  const cls = [
    'dt-slot',
    !slot && 'is-empty',
    intent && `is-target is-${intent.kind}`,
    preview && 'is-preview',
    armed && 'is-armed',
    lift && 'is-lifted',
    flash && 'is-wrong',
    protectedSeat && slot && 'is-protected',
    dim && slot && 'is-dim',
  ].filter(Boolean).join(' ');
  const Tag = intent ? 'button' : 'div';
  return (
    <Tag
      ref={ref}
      type={intent ? 'button' : undefined}
      className={cls}
      style={place}
      onClick={intent ? () => onSpot(key) : undefined}
      onPointerEnter={intent ? () => onHover(key) : undefined}
      onPointerLeave={intent ? () => onHover(null) : undefined}
      aria-label={intent?.label}
    >
      {slot && !hidden && <DutchCard card={card} faceUp={!!card} delay={revealDelay} />}
      {preview?.ghost && <span className="dt-ghost"><DutchCard card={preview.ghost} faceUp /></span>}
      {intent && !hidden && <span className="dt-slot__hint" aria-hidden><Icon name={intent.icon} size={16} strokeWidth={2.4} /></span>}
      {protectedSeat && slot && !hidden && <span className="dt-slot__lock" aria-hidden><Icon name="lock" size={12} strokeWidth={2.6} /></span>}
    </Tag>
  );
}

function Seat({ view, player, isMe, row = false, name, active, turnClock, now, fx, intents, focus, previewKey, armedKey, onSpot, onHover, revealSeat, result }) {
  const p = player;
  const holdRef = useSpot(holdKey(p.id));
  // An extra card that leaves keeps its place while it flies away, then the place goes.
  const [prevSlots, setPrevSlots] = useState(p.slots);
  const [leaving, setLeaving] = useState([]);
  if (prevSlots !== p.slots) {
    const gone = p.slots.map((c, i) => (i >= 4 && !c && prevSlots[i] ? i : -1)).filter((i) => i >= 0);
    setPrevSlots(p.slots);
    if (gone.length) setLeaving((l) => [...l, ...gone]);
  }
  useEffect(() => {
    if (!leaving.length) return undefined;
    const t = setTimeout(() => setLeaving([]), 900);
    return () => clearTimeout(t);
  }, [leaving]);
  const shown = p.slots.map((c, i) => i < 4 || !!c || leaving.includes(i));
  const extras = shown.map((on, i) => (on && i >= 4 ? i : -1)).filter((i) => i >= 0);
  // On a phone my own cards are laid out in one line (less height than the 2×2 square).
  const cols = row ? 4 + extras.length : 2 + Math.ceil(extras.length / 2);
  const phase = view.phase;
  const caller = view.dutchBy === p.id;
  const reveal = phase === 'reveal' || phase === 'over';
  const hasDrawn = !isMe && view.hasDrawn && view.turn === p.id;
  const cap = fx.captions[p.id];
  return (
    <section className={`dt-seat ${isMe ? 'is-me' : 'is-opp'} ${row ? 'is-row' : ''} ${active ? 'is-turn' : ''} ${caller ? 'is-caller' : ''}`} style={row ? { '--cols-n': cols } : undefined} aria-label={name}>
      <div className="dt-plate">
        {caller && (
          // the caller wears a faience ribbon, stamped on when they call
          <motion.span key={fx.stamp} className="dt-ribbon" initial={{ scale: 1.8, rotate: -14, opacity: 0 }} animate={{ scale: 1, rotate: -4, opacity: 1 }} transition={{ type: 'spring', bounce: 0.5, duration: 0.55 }}>
            <Icon name="lock" size={12} strokeWidth={2.8} /> Dutch
          </motion.span>
        )}
        {p.isBot
          ? <span className="dt-bot"><Icon name="bot" size={18} /></span>
          : <Avatar name={p.nickname ?? name} index={p.seat} size={30} online={p.connected !== false} />}
        <span className="dt-plate__who">
          <span className="dt-plate__name">{name}</span>
          <span className="dt-plate__score tabular">{points(p.total)}</span>
        </span>
        {phase === 'peek' && (
          <span className={`dt-chip ${p.ready ? 'is-ok' : ''}`} title={p.ready ? 'Prêt' : `${p.peeked}/${PEEK_COUNT} cartes regardées`}>
            {p.ready ? <Icon name="check" size={14} strokeWidth={3} /> : <><Icon name="eye" size={12} strokeWidth={2.6} />{p.peeked}/{PEEK_COUNT}</>}
          </span>
        )}
        {active && <Drain key={`${turnClock?.key}-${turnClock?.endsAt}`} clock={turnClock} now={now} className="dt-timer" />}
        {reveal && result && (
          <motion.span
            className={`dt-gain ${result.points === 0 ? 'is-zero' : ''}`}
            title={`Cartes : ${points(result.sum)}`}
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', bounce: 0.55, duration: 0.5, delay: 1 + revealSeat * 0.22 }}
          >
            {result.points === 0 ? '0' : `+${result.points}`}
          </motion.span>
        )}
        <AnimatePresence>
          {cap && (
            <motion.span key={cap.id} className={`dt-caption ${cap.tone ? `is-${cap.tone}` : ''}`} initial={{ opacity: 0, y: -6, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4 }} transition={{ type: 'spring', bounce: 0.35, duration: 0.4 }}>
              <Icon name={cap.icon} size={12} strokeWidth={2.6} /> {cap.text}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <div className={`dt-grid ${caller && !reveal ? 'is-protected' : ''}`} style={{ '--cols': cols, '--rows': row ? 1 : 2 }}>
        {p.slots.map((s, i) => {
          if (!shown[i]) return null;
          const key = slotKey(p.id, i);
          const intent = intents.get(key);
          return (
            <Slot
              key={i}
              playerId={p.id}
              index={i}
              place={row ? { gridColumn: i < 4 ? i + 1 : 5 + extras.indexOf(i), gridRow: 1 } : placeOf(i, extras.indexOf(i))}
              slot={s}
              fx={fx}
              intent={intent}
              preview={previewKey === key ? intent?.preview : null}
              armed={armedKey === key}
              revealDelay={reveal ? revealSeat * 0.22 + i * 0.08 : 0}
              onSpot={onSpot}
              onHover={onHover}
              protectedSeat={caller && !reveal}
              dim={focus && !intent}
            />
          );
        })}
        {/* where a drawn card waits, beside the hand */}
        {!isMe && (
          <span ref={holdRef} className="dt-hold">
            {hasDrawn && !fx.masked[holdKey(p.id)] && <DutchCard faceUp={false} />}
          </span>
        )}
      </div>
    </section>
  );
}

function Pile({ view, intent, hot, onSpot, onHover, children }) {
  const ref = useSpot('pile');
  const n = view.pileCount;
  const Tag = intent ? 'button' : 'div';
  return (
    <Tag ref={ref} type={intent ? 'button' : undefined} className={`dt-pile ${intent ? 'is-target is-draw' : ''} ${hot ? 'is-preview' : ''}`} onClick={intent ? () => onSpot('pile') : undefined} onPointerEnter={intent ? () => onHover('pile') : undefined} onPointerLeave={intent ? () => onHover(null) : undefined} aria-label={intent ? intent.label : `Pioche : ${n} cartes`}>
      {n > 2 && <span className="dt-pile__under is-2"><DutchCard /></span>}
      {n > 1 && <span className="dt-pile__under is-1"><DutchCard /></span>}
      {n > 0 && <DutchCard />}
      <span className="dt-count tabular">{n}</span>
    </Tag>
  );
}

function Discard({ view, fx, intent, armed, preview, windowClock, now, onSpot, onHover, power }) {
  const ref = useSpot('discard');
  const top = fx.discardShown;
  const Tag = intent ? 'button' : 'div';
  return (
    <Tag ref={ref} type={intent ? 'button' : undefined} className={`dt-discard ${intent ? `is-target is-${intent.kind}` : ''} ${armed ? 'is-armed' : ''} ${preview ? 'is-preview' : ''}`} onClick={intent ? () => onSpot('discard') : undefined} onPointerEnter={intent ? () => onHover('discard') : undefined} onPointerLeave={intent ? () => onHover(null) : undefined} aria-label={intent ? intent.label : top ? `Défausse : ${cardShort(top)}` : 'Défausse vide'}>
      <span className="dt-discard__well" />
      {top && <DutchCard key={top} card={top} faceUp />}
      {power && top && (
        <motion.span className={`dt-powerbadge is-${power === 'blindSwap' || view.step === 'decide' ? 'swap' : 'eye'}`} initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', bounce: 0.5, duration: 0.5 }} aria-hidden>
          <Icon name={power === 'blindSwap' || view.step === 'decide' ? 'swap' : 'eye'} size={16} strokeWidth={2.6} />
        </motion.span>
      )}
      {view.window && windowClock && (
        // the burning window: a flame running once around the card
        <Ring key={`${windowClock.key}-${windowClock.endsAt}`} clock={windowClock} now={now} />
      )}
      <AnimatePresence>
        {fx.burst > 0 && <motion.span key={fx.burst} className="dt-burst" initial={{ opacity: 1, scale: 0.6 }} animate={{ opacity: 0, scale: 1.7 }} transition={{ duration: 0.7, ease: 'easeOut' }} />}
      </AnimatePresence>
    </Tag>
  );
}

/** The burning window: a flame running once around the discard. The delay is fixed when it
 * appears (recomputing it on every render would make the animation jump ahead). */
function Ring({ clock, now }) {
  const [elapsed] = useState(() => Math.max(0, clock.durationMs - Math.max(0, clock.endsAt - now())));
  return (
    <svg className="dt-ring" viewBox="0 0 262 412" preserveAspectRatio="none" aria-hidden>
      <rect className="dt-ring__track" x="5" y="5" width="252" height="402" rx="28" />
      <rect className="dt-ring__flame" x="5" y="5" width="252" height="402" rx="28" pathLength="100" style={{ animationDuration: `${clock.durationMs}ms`, animationDelay: `-${elapsed}ms` }} />
    </svg>
  );
}

function MyHold({ view, fx }) {
  const ref = useSpot(holdKey(view.me));
  const card = view.drawn;
  return (
    <div className="dt-myhold">
      <span ref={ref} className={`dt-myhold__card ${card ? 'is-full' : ''}`}>
        {card && !fx.masked[holdKey(view.me)] && <DutchCard card={card} faceUp />}
      </span>
    </div>
  );
}

/**
 * My power, explained in the dock (where the message usually is): which power, what to
 * touch, the steps, and a way out. Nothing covers the table.
 */
function PowerGuide({ view, sel, hint, busy, onSkip, onChange }) {
  const power = view.power;
  const decide = view.step === 'decide';
  let title; let text; let steps = null; let tone = 'eye';
  if (decide) {
    tone = 'swap';
    title = 'Échanger la carte regardée ?';
    text = 'Touchez une de vos cartes pour l’échanger, ou gardez votre jeu.';
    steps = ['Regarder', 'Échanger ou garder'];
  } else if (power === 'lookOwn') {
    title = 'Regardez une de vos cartes';
    text = 'Touchez-en une : vous seul la verrez.';
  } else if (power === 'lookOther') {
    title = 'Espionnez un adversaire';
    text = 'Touchez une de ses cartes : vous seul la verrez.';
  } else if (power === 'blindSwap') {
    tone = 'swap';
    title = 'Échange à l’aveugle';
    text = 'Personne ne voit les cartes échangées.';
    steps = ['Une des vôtres', 'Une adverse'];
  } else {
    title = 'Regardez, puis échangez';
    text = 'Touchez une carte adverse pour la regarder.';
    steps = ['Regarder', 'Échanger ou garder'];
  }
  const at = decide ? 1 : power === 'blindSwap' ? (sel?.kind === 'queen' ? 1 : 0) : 0;
  return (
    <motion.div className={`dt-guide is-${tone}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', bounce: 0.3, duration: 0.4 }} role="status" aria-live="polite">
      <span className="dt-guide__eyebrow"><Icon name={tone === 'swap' ? 'swap' : 'eye'} size={13} strokeWidth={2.6} /> Pouvoir {RANK_OF_POWER[rankOf(view.discardTop)] ?? ''}</span>
      <strong className="dt-guide__title">{title}</strong>
      <span className="dt-guide__text">{hint ?? text}</span>
      <div className="dt-guide__row">
        {steps && (
          <ol className="dt-steps">
            {steps.map((st, k) => <li key={st} className={k < at ? 'is-done' : k === at ? 'is-on' : ''}><b>{k < at ? '✓' : k + 1}</b>{st}</li>)}
          </ol>
        )}
        {sel?.kind === 'queen' && <button type="button" className="dt-btn is-ghost is-small" onClick={onChange}>Changer</button>}
        <button type="button" className="dt-btn is-ghost is-small" onClick={onSkip} disabled={busy}>{decide ? 'Garder mon jeu' : 'Ne pas l’utiliser'}</button>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// What I can do, spot by spot (feedforward)
// ---------------------------------------------------------------------------

/**
 * Each interactive spot gets an intent: { kind, icon, label, action | select, preview, instant }.
 * `sel` is a choice in progress (the discard to take, the queen's first card, an opponent's
 * card to burn).
 */
function computeIntents(view, sel, readOnly) {
  const out = new Map();
  if (readOnly) return out;
  const me = view.me;
  const mine = view.players[view.mySeat];
  if (!mine) return out;
  const myCards = mine.slots.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
  if (view.phase === 'peek') {
    if (!mine.ready && mine.peeked < PEEK_COUNT) {
      for (const i of myCards) if (!mine.slots[i].card) out.set(slotKey(me, i), { kind: 'eye', icon: 'eye', label: 'Regarder cette carte', action: { type: 'peek', slot: i }, instant: true });
    }
    return out;
  }
  if (view.phase !== 'play') return out;
  const opponents = view.players.filter((p) => p.id !== me);
  const each = (p, fn) => p.slots.forEach((s, i) => { if (s) fn(i, slotKey(p.id, i)); });

  if (view.window) {
    if (me === view.dutchBy) return out;
    if (sel?.kind === 'burnOther') {
      for (const i of myCards) {
        out.set(slotKey(me, i), { kind: 'give', icon: 'arrowRight', label: 'Donner cette carte', action: { type: 'burn', target: sel.target, give: i }, preview: { links: [[slotKey(me, i), slotKey(sel.target.playerId, sel.target.slot)]] } });
      }
      return out;
    }
    for (const i of myCards) out.set(slotKey(me, i), { kind: 'burn', icon: 'flame', label: 'Brûler cette carte', action: { type: 'burn', slot: i }, instant: true });
    if (view.burnOthers) {
      for (const p of opponents) {
        if (p.id === view.dutchBy) continue;
        each(p, (i, key) => {
          const target = { playerId: p.id, slot: i };
          out.set(key, myCards.length
            ? { kind: 'burn', icon: 'flame', label: 'Brûler cette carte adverse', select: { kind: 'burnOther', target, key } }
            : { kind: 'burn', icon: 'flame', label: 'Brûler cette carte adverse', action: { type: 'burn', target }, instant: true });
        });
      }
    }
    return out;
  }

  if (view.turn !== me) return out;
  switch (view.step) {
    case 'start':
      out.set('pile', { kind: 'draw', icon: 'plus', label: 'Piocher', action: { type: 'draw' }, instant: true });
      if (sel?.kind === 'take') {
        out.set('discard', { kind: 'take', icon: 'close', label: 'Annuler', select: null, cancel: true });
        for (const i of myCards) {
          out.set(slotKey(me, i), { kind: 'take', icon: 'swap', label: `Remplacer par ${cardShort(view.discardTop)}`, action: { type: 'take', slot: i }, preview: { ghost: view.discardTop, links: [[slotKey(me, i), 'discard']] } });
        }
      } else if (myCards.length) {
        out.set('discard', { kind: 'take', icon: 'swap', label: `Prendre ${cardShort(view.discardTop)}`, select: { kind: 'take', key: 'discard' } });
      }
      break;
    case 'drawn':
      out.set('discard', { kind: 'drop', icon: 'arrowRight', label: 'Défausser la carte piochée', action: { type: 'discard' }, instant: true });
      for (const i of myCards) {
        out.set(slotKey(me, i), { kind: 'take', icon: 'swap', label: 'Remplacer par la carte piochée', action: { type: 'replace', slot: i }, preview: { ghost: view.drawn, links: [[slotKey(me, i), 'discard']] } });
      }
      break;
    case 'power': {
      if (view.power === 'lookOwn') {
        for (const i of myCards) out.set(slotKey(me, i), { kind: 'eye', icon: 'eye', label: 'Regarder cette carte', action: { type: 'look', target: { playerId: me, slot: i } } });
      } else if (view.power === 'lookOther' || view.power === 'lookSwap') {
        for (const p of opponents) each(p, (i, key) => out.set(key, { kind: 'eye', icon: 'eye', label: 'Regarder cette carte', action: { type: 'look', target: { playerId: p.id, slot: i } } }));
      } else if (view.power === 'blindSwap') {
        const theirs = sel?.kind === 'queen' ? sel.theirs : null;
        const mineSel = sel?.kind === 'queen' ? sel.mine : null;
        for (const i of myCards) {
          const key = slotKey(me, i);
          out.set(key, theirs
            ? { kind: 'swap', icon: 'swap', label: 'Échanger avec celle-ci', action: { type: 'exchange', slot: i, target: theirs }, preview: { links: [[key, slotKey(theirs.playerId, theirs.slot)]] } }
            : { kind: 'swap', icon: 'swap', label: 'Choisir une de vos cartes', select: { kind: 'queen', mine: i, key } });
        }
        for (const p of opponents) {
          if (p.id === view.dutchBy) continue;
          each(p, (i, key) => out.set(key, mineSel != null
            ? { kind: 'swap', icon: 'swap', label: 'Échanger avec celle-ci', action: { type: 'exchange', slot: mineSel, target: { playerId: p.id, slot: i } }, preview: { links: [[slotKey(me, mineSel), key]] } }
            : { kind: 'swap', icon: 'swap', label: 'Choisir une carte adverse', select: { kind: 'queen', theirs: { playerId: p.id, slot: i }, key } }));
        }
      }
      break;
    }
    case 'decide': {
      let looked = null;
      for (const p of opponents) p.slots.forEach((s, i) => { if (s?.card) looked = slotKey(p.id, i); });
      if (!looked || looked.split(':')[1] === view.dutchBy) break;
      for (const i of myCards) out.set(slotKey(me, i), { kind: 'swap', icon: 'swap', label: 'Échanger avec la carte regardée', action: { type: 'exchange', slot: i }, preview: { links: [[slotKey(me, i), looked]] } });
      break;
    }
    default:
  }
  return out;
}

/**
 * What touching a spot would do, said in the message while it is hovered (or armed on a
 * touch screen): the pile and the discard have no button of their own.
 */
function hintFor(view, key, intent) {
  if (!key || !intent || view.window) return null;
  const power = view.drawn ? powerOf(view.drawn) : null;
  if (key === 'pile') return { text: <><strong>Piocher</strong> : une carte inconnue, que vous seul verrez.</>, tone: 'turn' };
  if (key === 'discard') {
    if (intent.cancel) return { text: <>Touchez la défausse pour <strong>annuler</strong>, ou une de vos cartes pour la remplacer.</>, tone: 'turn' };
    if (view.step === 'start') return { text: <><strong>Prendre {cardShort(view.discardTop)}</strong> ({points(cardValue(view.discardTop))}) : elle remplacera la carte de votre choix.</>, tone: 'turn' };
    if (view.step === 'drawn') {
      return power
        ? { text: <><strong>Défausser</strong> la carte piochée, puis utiliser son pouvoir : {POWER_SHORT[power]}.</>, tone: 'eye' }
        : { text: <><strong>Défausser</strong> la carte piochée (sans pouvoir).</>, tone: 'turn' };
    }
  }
  return intent.label ? { text: <strong>{intent.label}</strong>, tone: intent.kind === 'eye' ? 'eye' : intent.kind === 'swap' ? 'swap' : intent.kind === 'burn' ? 'burn' : 'turn' } : null;
}

/** The line under the table: what is expected of me, or what is going on. */
function statusFor(view, names, sel, hint) {
  const nameOf = (id) => (id === view.me ? 'Vous' : names[id] ?? '—');
  const me = view.me;
  const mine = view.players[view.mySeat];
  if (view.phase === 'peek') {
    if (mine?.ready) return { text: 'Les autres choisissent encore…' };
    const left = PEEK_COUNT - (mine?.peeked ?? 0);
    if (left > 0) return { text: <>Touchez <strong>{left === PEEK_COUNT ? 'deux' : 'encore une'} carte{left > 1 ? 's' : ''}</strong> pour {left === PEEK_COUNT ? 'les' : 'la'} regarder. Vous ne les reverrez plus !</>, tone: 'eye' };
    return { text: <><strong>Mémorisez-les</strong> : elles se retournent quand vous êtes prêt.</>, tone: 'eye' };
  }
  if (view.phase === 'reveal') return { text: mine?.ready ? 'Prêt : en attente des autres joueurs…' : 'Fin de la manche : toutes les cartes se montrent.' };
  if (view.phase === 'over') return { text: 'Partie terminée.' };
  if (view.window) {
    if (me === view.dutchBy) return { text: 'Vos cartes sont protégées jusqu’à la fin de la manche.' };
    if (sel?.kind === 'burnOther') return { text: 'Choisissez la carte que vous lui donnez.', tone: 'burn' };
    return { text: <>Une carte de même valeur ({cardShort(view.discardTop)}) ? <strong>Brûlez-la vite !</strong></>, tone: 'burn' };
  }
  if (view.turn !== me) {
    const who = nameOf(view.turn);
    if (view.step === 'power' || view.step === 'decide') return { text: `${who} utilise un pouvoir…` };
    if (view.hasDrawn) return { text: `${who} a pioché…` };
    return { text: `${who} réfléchit…${view.dutchBy ? ' Dernier tour !' : ''}` };
  }
  const last = view.dutchBy ? ' C’est votre dernier tour.' : '';
  if (hint) return hint;
  switch (view.step) {
    case 'start':
      if (sel?.kind === 'take') return { text: <>Touchez la carte que <strong>{cardShort(view.discardTop)}</strong> remplace.</>, tone: 'turn' };
      return { text: <><strong>À vous.</strong>{last}</>, tone: 'turn' };
    case 'drawn': return { text: <>Touchez une de vos cartes pour <strong>la remplacer</strong>, ou <strong>défaussez</strong> la carte piochée.</>, tone: 'turn' };
    case 'power':
      if (view.power === 'blindSwap') return { text: sel?.kind === 'queen' ? 'Choisissez maintenant l’autre carte.' : 'Choisissez une de vos cartes et une carte adverse.', tone: 'swap' };
      return { text: view.power === 'lookOwn' ? 'Touchez une de vos cartes.' : 'Touchez une carte adverse.', tone: 'eye' };
    case 'decide': return { text: 'Échangez-la, ou gardez votre jeu.', tone: 'swap' };
    default: return { text: '' };
  }
}

// ---------------------------------------------------------------------------
// Dock: my moves as big tiles, the "Dutch" call with its confirmation
// ---------------------------------------------------------------------------

function DutchConfirm({ onConfirm, onCancel, busy }) {
  useEffect(() => {
    const on = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [onCancel]);
  return (
    <motion.div className="dt-confirm" role="dialog" aria-label="Annoncer Dutch" initial={{ opacity: 0, y: 14, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.96 }} transition={{ type: 'spring', bounce: 0.3, duration: 0.4 }}>
      <strong>Annoncer « Dutch » ?</strong>
      <ul>
        <li>Chacun rejoue <b>une dernière fois</b>, puis on retourne tout.</li>
        <li>Réussi avec <b>{DUTCH_LIMIT} points ou moins</b> et le plus petit total : vous ne marquez rien.</li>
        <li>Sinon : vos points <b>+ {FAILED_DUTCH_PENALTY}</b>.</li>
        <li>D’ici là, vos cartes sont protégées.</li>
      </ul>
      <div className="dt-confirm__actions">
        <button type="button" className="dt-btn is-ghost" onClick={onCancel}>Pas encore</button>
        <button type="button" className="dt-btn is-cobalt" onClick={onConfirm} disabled={busy} autoFocus>Oui, Dutch !</button>
      </div>
    </motion.div>
  );
}

function Tile({ kind, icon, title, sub, card, onClick, onHover, disabled, armed }) {
  return (
    <button
      type="button"
      className={`dt-tile is-${kind} ${armed ? 'is-armed' : ''}`}
      onClick={onClick}
      onPointerEnter={onHover ? () => onHover(true) : undefined}
      onPointerLeave={onHover ? () => onHover(false) : undefined}
      disabled={disabled}
    >
      {card ? <span className="dt-tile__card"><DutchCard card={card} faceUp /></span> : icon && <span className="dt-tile__icon"><Icon name={icon} size={20} strokeWidth={2.4} /></span>}
      <span className="dt-tile__text"><b>{title}</b>{sub && <small>{sub}</small>}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------

/**
 * @param {{ view: object, names: Record<string,string>, onAct: (action: object) => Promise<any>,
 *   turnClock?: object, windowClock?: object, now?: () => number, readOnly?: boolean,
 *   paused?: { by?: string, canResume?: boolean } | null, onResume?: () => void, finishedAction?: any }} props
 */
export default function Table({ view, names, onAct, turnClock, windowClock, now = Date.now, readOnly = false, paused = null, onResume, finishedAction = null }) {
  const [reg] = useState(() => new Map());
  const fx = useFx(view, names, reg);
  const fine = useMediaQuery('(pointer: fine)');
  // Wide screens: opponents around the table; tall ones: in a row above it.
  const wide = useMediaQuery('(min-aspect-ratio: 5/4) and (min-width: 700px)');
  const [sel, setSel] = useState(null);
  const [hover, setHover] = useState(null);
  const [armed, setArmed] = useState(null); // touch: a first tap arms, a second one plays
  const [busy, setBusy] = useState(false);
  const [confirmDutch, setConfirmDutch] = useState(false);
  const [recap, setRecap] = useState(false);
  const [recapSeen, setRecapSeen] = useState(false);
  const [, setTick] = useState(0);
  // The recap opens once the cards have turned over; it can be closed to look at the table.
  const revealRound = view.phase === 'reveal' || view.phase === 'over' ? view.roundResult?.round : null;
  useEffect(() => {
    if (revealRound == null) { setRecap(false); setRecapSeen(false); return undefined; }
    const t = setTimeout(() => { setRecap(true); setRecapSeen(true); }, 1600);
    return () => clearTimeout(t);
  }, [revealRound]);

  // A new step, a new window: choices in progress are dropped.
  const stepKey = `${view.phase}-${view.turn}-${view.step}-${!!view.window}-${view.round}`;
  useEffect(() => { setSel(null); setArmed(null); setHover(null); setConfirmDutch(false); }, [stepKey]);
  // Links follow the cards when the window is resized.
  useEffect(() => {
    const on = () => setTick((x) => x + 1);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  const intents = computeIntents(view, sel, readOnly || busy || !!paused);
  const send = async (action) => {
    setBusy(true);
    setArmed(null);
    setSel(null);
    if (action.type === 'peek') sound('flip');
    try { await onAct(action); } finally { setBusy(false); }
  };
  const onSpot = (key) => {
    const it = intents.get(key);
    if (!it) return;
    if (it.cancel) { setSel(null); sound('back'); return; }
    if (it.select) { setSel(it.select); setArmed(null); sound('pick'); haptic('light'); return; }
    if (it.instant || fine || armed === key) { send(it.action); return; }
    setArmed(key);
    sound('pick');
    haptic('light');
  };

  const previewKey = fine ? hover : armed;
  const previewIntent = previewKey ? intents.get(previewKey) : null;
  const links = previewIntent?.preview?.links ?? [];
  const armedKey = armed ?? sel?.key ?? null;

  const me = view.me;
  const meP = view.players[view.mySeat];
  const n = view.players.length;
  const others = view.players.filter((p) => p.id !== me);
  // Opponents in playing order, starting after me.
  const order = [...others].sort((a, b) => ((a.seat - view.mySeat + n) % n) - ((b.seat - view.mySeat + n) % n));
  const nameOf = (id) => (id === me ? 'Vous' : names[id] ?? '—');
  const myTurn = !readOnly && view.phase === 'play' && view.turn === me && !view.window;
  const reveal = view.phase === 'reveal' || view.phase === 'over';
  const revealIndex = (seat) => (seat - view.turnSeat + n) % n;
  const rr = reveal ? view.roundResult : null;
  const resultOf = (id) => (rr ? { points: rr.points[id], sum: rr.sums[id] } : null);
  const status = statusFor(view, names, sel, hintFor(view, previewKey, previewIntent));
  // While I choose, everything I cannot touch steps back.
  const focus = !view.window && [...intents.keys()].some((k) => k.startsWith('slot:'));
  const sides = wide && order.length >= 3;
  const left = sides ? order[0] : null;
  const right = sides ? order[order.length - 1] : null;
  const top = sides ? order.slice(1, -1) : order;
  const seat = (p, isMe = false) => (
    <Seat
      key={p.id}
      view={view}
      player={p}
      name={nameOf(p.id)}
      isMe={isMe}
      row={isMe && !wide}
      active={view.phase === 'play' && view.turn === p.id && !view.window}
      turnClock={turnClock}
      now={now}
      fx={fx}
      intents={intents}
      focus={focus}
      previewKey={previewKey}
      armedKey={armedKey}
      onSpot={onSpot}
      onHover={setHover}
      revealSeat={revealIndex(p.seat)}
      result={resultOf(p.id)}
    />
  );
  const showPower = myTurn && (view.step === 'power' || view.step === 'decide');
  const power = view.drawn ? powerOf(view.drawn) : null;
  return (
    <Spots.Provider value={reg}>
      <div className={`dt-stage ${wide ? 'is-wide' : 'is-tall'} ${view.window ? 'is-window' : ''} ${myTurn ? 'is-myturn' : ''} ${paused ? 'is-paused' : ''}`} style={{ '--top': Math.max(1, top.length) }}>
        <div className="dt-rail">{(view.phase === 'play' || view.phase === 'peek') && <OrderBar view={view} nameOf={nameOf} />}</div>
        <div className="dt-top">{top.map((p) => seat(p))}</div>
        {left && <div className="dt-side is-left">{seat(left)}</div>}
        {right && <div className="dt-side is-right">{seat(right)}</div>}

        <div className="dt-centre">
          <Pile view={view} intent={intents.get('pile')} hot={previewKey === 'pile'} onSpot={onSpot} onHover={setHover} />
          <MyHold view={view} fx={fx} />
          <Discard view={view} fx={fx} intent={intents.get('discard')} armed={armedKey === 'discard'} preview={previewKey === 'discard'} windowClock={windowClock} now={now} onSpot={onSpot} onHover={setHover} power={view.step === 'power' || view.step === 'decide' ? view.power : null} />
        </div>

        <div className="dt-mine">{meP && seat(meP, true)}</div>

        <div className="dt-dock">
          {showPower
            ? <PowerGuide view={view} sel={sel} hint={hintFor(view, previewKey, previewIntent)?.text ?? null} busy={busy} onSkip={() => send({ type: 'skip' })} onChange={() => setSel(null)} />
            : <div className={`dt-status ${status.tone ? `is-${status.tone}` : ''}`} aria-live="polite"><span>{status.text}</span></div>}
          <div className="dt-actions">
            {view.phase === 'peek' && (
              // the button and the time left, as one block: the bar sits centred under it
              <div className="dt-mainwrap">
                {meP && !meP.ready && !readOnly && meP.peeked >= PEEK_COUNT && (
                  <button type="button" className="dt-btn is-gold is-main" onClick={() => send({ type: 'ready' })} disabled={busy}>
                    <Icon name="check" size={18} strokeWidth={2.6} /> C’est mémorisé
                  </button>
                )}
                <Drain key={`${turnClock?.key}-${turnClock?.endsAt}`} clock={turnClock} now={now} className="dt-bar" />
              </div>
            )}
            {rr && recapSeen && !recap && (
              <motion.button type="button" className="dt-btn is-gold is-main" onClick={() => setRecap(true)} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <Icon name="trophy" size={18} strokeWidth={2.4} /> Voir les scores
              </motion.button>
            )}
            {myTurn && view.step === 'start' && !view.dutchBy && (
              <Tile kind="dutch" title="Dutch !" sub="finir la manche" onClick={() => { setConfirmDutch(true); sound('pick'); haptic('light'); }} disabled={busy} armed={confirmDutch} />
            )}
            {!fine && armed && intents.get(armed)?.action && (
              <button type="button" className="dt-btn is-gold" onClick={() => send(intents.get(armed).action)} disabled={busy}>{intents.get(armed).label}</button>
            )}
            {sel?.kind === 'burnOther' && <button type="button" className="dt-btn is-ghost" onClick={() => setSel(null)}>Annuler</button>}
          </div>
          <AnimatePresence>
            {confirmDutch && myTurn && <DutchConfirm busy={busy} onCancel={() => setConfirmDutch(false)} onConfirm={() => { setConfirmDutch(false); send({ type: 'dutch' }); }} />}
          </AnimatePresence>
        </div>


      </div>

      {rr && <RoundRecap open={recap} onClose={() => setRecap(false)} view={view} nameOf={nameOf} busy={busy} onReady={() => send({ type: 'ready' })} finishedAction={finishedAction} />}

      {/* effects, above everything */}
      <Links links={links} reg={reg} />
      <div className="dt-fx" aria-hidden>
        {fx.flights.map((f) => <Flight key={f.id} f={f} onLand={fx.land} />)}
        <AnimatePresence>
          {fx.pops.map((p) => (
            <motion.span key={p.id} className={`dt-pop is-${p.tone}`} style={{ left: p.x, top: p.y }} initial={{ opacity: 0, y: 8, scale: 0.7 }} animate={{ opacity: 1, y: -30, scale: 1 }} exit={{ opacity: 0, y: -46, scale: 0.95 }} transition={{ type: 'spring', bounce: 0.45, duration: 0.55 }}>
              {p.icon && <Icon name={p.icon} size={14} strokeWidth={2.6} />}{p.text}
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {fx.banner && (
          <motion.div key={fx.banner.id} className="dt-banner" role="status" initial={{ opacity: 0, scale: 0.6, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.2 } }} transition={{ type: 'spring', bounce: 0.5, duration: 0.6 }}>
            <strong>{fx.banner.title}</strong>
            <span>{fx.banner.sub}</span>
          </motion.div>
        )}
        {paused && (
          <motion.div key="pause" className="dt-paused" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="status">
            <motion.div className="dt-paused__card" initial={{ scale: 0.92, y: 10 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', bounce: 0.3, duration: 0.45 }}>
              <span className="dt-paused__icon"><Icon name="pause" size={22} strokeWidth={2.6} /></span>
              <strong>Partie en pause</strong>
              <span className="dt-paused__text">{paused.by ? `${paused.by} a mis la partie en pause.` : 'Les chronos et les robots sont arrêtés.'}</span>
              {paused.canResume && <button type="button" className="dt-btn is-gold" onClick={onResume} autoFocus><Icon name="play" size={16} strokeWidth={2.6} /> Reprendre</button>}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Spots.Provider>
  );
}
