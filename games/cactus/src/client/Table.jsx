import { createContext, memo, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useMediaQuery } from '@bgio/ui/lib/useMediaQuery.js';
import { haptic, sound } from '@bgio/ui/lib/feedback.js';
import { Avatar } from '@bgio/ui/components/ui.jsx';
import Icon from '@bgio/ui/components/Icon.jsx';
import { CACTUS_LIMIT, PEEK_COUNT, powerOf, rankOf } from '../engine/index.js';
import OrderBar, { CactusGlyph } from './OrderBar.jsx';
import RoundRecap from './RoundRecap.jsx';
import CactusCard from './CactusCard.jsx';
import { POWER_OF_RANK, POWER_SHORT, cardShort, rankName, signed, total } from './i18n.js';
import './table.css';

// The CactusIO table, shared by the game screen and the design review page. It draws the
// state it is given (a player's view), animates what changed (from the view's `log`), and
// turns clicks into actions, with a preview of each action before it is played.
//
// Every place a card can be is a "spot" with a key: `slot:<playerId>:<i>`, `pile`,
// `discard`, `hold:<playerId>` (a drawn card), `seat:<playerId>` (a whole player, for the
// red queen's gift). Flights measure their spots on screen.

const Spots = createContext(null);
function useSpot(key) {
  const reg = useContext(Spots);
  return useCallback((el) => { if (el) reg.set(key, el); else reg.delete(key); }, [reg, key]);
}

const slotKey = (playerId, i) => `slot:${playerId}:${i}`;
const holdKey = (playerId) => `hold:${playerId}`;
const seatKey = (playerId) => `seat:${playerId}`;
/**
 * Grid place of a card: the 2×2 square always; extra cards are packed in order in columns
 * on the right, `k` being the card's rank among the extra cards still shown.
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

const TONE_OF_POWER = { look: 'eye', swap: 'swap', giveOther: 'gift', giveSelf: 'gift' };
const ICON_OF_POWER = { look: 'eye', swap: 'swap', giveOther: 'plus', giveSelf: 'plus' };

// ---------------------------------------------------------------------------
// Effects: flights, lifted cards, wrong throws shown, captions, floating words, banner
// ---------------------------------------------------------------------------

let fxId = 0;

function useFx(view, names, reg) {
  const [flights, setFlights] = useState([]);
  const [masked, setMasked] = useState({}); // spot key -> flights still heading there
  const [lifts, setLifts] = useState({}); // spot key -> who is looking
  const [flashes, setFlashes] = useState({}); // spot key -> card shown after a wrong throw
  const [captions, setCaptions] = useState({}); // player id -> what they just did
  const [pops, setPops] = useState([]);
  const [banner, setBanner] = useState(null);
  const [burst, setBurst] = useState(0); // the discard flares when a card is thrown on it
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
      // A spot that just left the screen (my drawn card): the card drops onto its
      // destination from a little above.
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
          caption(e.playerId, `garde sa pioche, jette ${cardShort(e.out)}${e.power ? ' · pouvoir' : ''}`, 'swap', e.power ? TONE_OF_POWER[e.power] : '', t);
          t += 260;
          break;
        case 'discard':
          fly(holdKey(e.playerId), 'discard', { card: e.card, delay: t, onLand: () => sound('place') });
          caption(e.playerId, `défausse ${cardShort(e.card)}${e.power ? ' · pouvoir' : ''}`, 'arrowRight', e.power ? TONE_OF_POWER[e.power] : '', t);
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
        case 'swap': {
          const a = slotKey(e.playerId, e.slot);
          const b = slotKey(e.target.playerId, e.target.slot);
          fly(a, b, { delay: t, dur: 640, kind: 'swap' });
          fly(b, a, { delay: t, dur: 640, kind: 'swap', onLand: () => sound('place') });
          if (e.target.playerId === view.me) later(t + 700, () => { pop(b, `${nameOf(e.playerId)} échange`, 'swap', 'swap'); haptic('medium'); });
          caption(e.playerId, `échange avec ${e.target.playerId === view.me ? 'vous' : nameOf(e.target.playerId)}`, 'swap', 'swap', t);
          t += 300;
          break;
        }
        case 'give': {
          const to = slotKey(e.owner, e.slot);
          const self = e.owner === e.playerId;
          fly('pile', to, {
            delay: t + 150, dur: 620, kind: 'gift',
            onLand: () => {
              sound('place');
              if (e.owner === view.me) { haptic('error'); pop(to, self ? '+1 carte (Dame noire)' : `+1 carte de ${nameOf(e.playerId)}`, 'gift', 'plus'); }
            },
          });
          caption(e.playerId, self ? 'Dame noire : +1 carte' : `donne +1 carte à ${e.owner === view.me ? 'vous' : nameOf(e.owner)}`, 'plus', 'gift', t);
          t += 320;
          break;
        }
        case 'powerSkip':
          caption(e.playerId, 'pouvoir impossible', 'skip', '', t);
          break;
        case 'burn': {
          const from = slotKey(e.playerId, e.slot);
          fly(from, 'discard', {
            card: e.card, delay: t, dur: 480, kind: 'burn',
            onLand: () => {
              sound('burn');
              haptic(mine ? 'success' : 'light');
              setBurst((b) => b + 1);
              pop('discard', mine ? `Jetée ! ${cardShort(e.card)}` : `${nameOf(e.playerId)} jette ${cardShort(e.card)}`, 'burn', 'check');
            },
          });
          caption(e.playerId, `jette ${cardShort(e.card)}${e.power ? ' · pouvoir' : ''}`, 'check', 'burn', t);
          t += 260;
          break;
        }
        case 'burnFail': {
          const key = slotKey(e.playerId, e.slot);
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
        case 'cactus':
          later(t, () => {
            sound('cactus');
            haptic('medium');
            setStamp((s) => s + 1);
            setBanner({ id: ++fxId, title: 'Cactus !', sub: mine ? 'Les autres jouent une dernière fois, vous en dernier.' : `${nameOf(e.playerId)} annonce : un dernier tour, ${nameOf(e.playerId)} en dernier.` });
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
      className={`ct-flight is-${f.kind}`}
      initial={{ x: f.from.left, y: f.from.top, width: f.from.width, height: f.from.height, rotate: 0 }}
      animate={{ x: f.to.left, y: f.to.top, width: f.to.width, height: f.to.height, rotate: f.kind === 'swap' ? [0, 8, 0] : [0, -4, 0], scale: [1, 1.12, 1] }}
      transition={{ duration: f.dur / 1000, delay: f.delay / 1000, ease: [0.3, 0.7, 0.2, 1] }}
      onAnimationComplete={() => { if (!done.current) { done.current = true; onLand(f); } }}
    >
      <CactusCard card={f.card} fromUp={f.fromUp} faceUp={f.toUp} delay={f.delay / 1000 + 0.08} />
    </motion.div>
  );
});

/** Feedforward: a dashed link between two spots (what a swap will exchange). */
function Links({ links, reg }) {
  if (!links.length) return null;
  const centre = (key) => {
    const r = reg.get(key)?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  };
  return (
    <svg className="ct-links" aria-hidden>
      {links.map(([a, b]) => {
        const p = centre(a);
        const q = centre(b);
        if (!p || !q) return null;
        const mx = (p.x + q.x) / 2;
        const my = (p.y + q.y) / 2 - Math.min(80, Math.hypot(q.x - p.x, q.y - p.y) * 0.2);
        return (
          <g key={`${a}-${b}`}>
            <path d={`M${p.x} ${p.y} Q${mx} ${my} ${q.x} ${q.y}`} className="ct-link" />
            <circle cx={p.x} cy={p.y} r="5" className="ct-link__end" />
            <circle cx={q.x} cy={q.y} r="5" className="ct-link__end" />
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Spots
// ---------------------------------------------------------------------------

function Slot({ playerId, index, place, slot, fx, intent, preview, armed, revealDelay, onSpot, onHover, dim, penalty }) {
  const key = slotKey(playerId, index);
  const ref = useSpot(key);
  const flash = fx.flashes[key];
  const hidden = fx.masked[key];
  const lift = fx.lifts[key];
  const card = flash ?? slot?.card ?? null;
  const cls = [
    'ct-slot',
    !slot && 'is-empty',
    intent && `is-target is-${intent.kind}`,
    preview && 'is-preview',
    armed && 'is-armed',
    lift && 'is-lifted',
    flash && 'is-wrong',
    dim && slot && 'is-dim',
    penalty && 'is-penalty',
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
      {slot && !hidden && <CactusCard card={card} faceUp={!!card} delay={revealDelay} />}
      {preview?.ghost && <span className="ct-ghost"><CactusCard card={preview.ghost} faceUp /></span>}
      {intent && !hidden && <span className="ct-slot__hint" aria-hidden><Icon name={intent.icon} size={16} strokeWidth={2.4} /></span>}
    </Tag>
  );
}

/** The red zone, as a short gauge under the score: the mark is the threshold. */
function Gauge({ total, threshold }) {
  const max = threshold * 1.25;
  return (
    <span className={`ct-gauge is-mini ${total > threshold ? 'is-red' : ''}`} style={{ '--r': Math.min(1, Math.max(0, total) / max), '--t': threshold / max }} aria-hidden>
      <span /><i />
    </span>
  );
}

function Seat({ view, player, isMe, row = false, name, active, clockOn, turnClock, now, fx, intents, focus, previewKey, armedKey, onSpot, onHover, revealSeat, result }) {
  const p = player;
  const holdRef = useSpot(holdKey(p.id));
  const seatRef = useSpot(seatKey(p.id));
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
  const caller = view.cactusBy === p.id;
  const reveal = phase === 'reveal' || phase === 'over';
  const hasDrawn = !isMe && view.hasDrawn && view.turn === p.id;
  const cap = fx.captions[p.id];
  const seatIntent = intents.get(seatKey(p.id));
  const penaltySlot = reveal && view.roundResult?.penalty && caller ? view.roundResult.penalty.slot : -1;
  const powerTone = view.power?.playerId === p.id ? TONE_OF_POWER[view.power.kind] : null;
  const PlateTag = seatIntent ? 'button' : 'div';
  return (
    <section className={`ct-seat ${isMe ? 'is-me' : 'is-opp'} ${row ? 'is-row' : ''} ${active ? 'is-turn' : ''} ${caller ? 'is-caller' : ''} ${p.red ? 'is-red' : ''} ${powerTone ? `is-power is-${powerTone}` : ''}`} style={row ? { '--cols-n': cols } : undefined} aria-label={name}>
      <PlateTag
        ref={seatRef}
        type={seatIntent ? 'button' : undefined}
        className={`ct-plate ${seatIntent ? 'is-target is-gift' : ''} ${previewKey === seatKey(p.id) ? 'is-preview' : ''}`}
        onClick={seatIntent ? () => onSpot(seatKey(p.id)) : undefined}
        onPointerEnter={seatIntent ? () => onHover(seatKey(p.id)) : undefined}
        onPointerLeave={seatIntent ? () => onHover(null) : undefined}
        aria-label={seatIntent?.label}
      >
        {caller && (
          // the caller wears a cactus ribbon, stamped on when they call
          <motion.span key={fx.stamp} className="ct-ribbon" initial={{ scale: 1.8, rotate: -14, opacity: 0 }} animate={{ scale: 1, rotate: -4, opacity: 1 }} transition={{ type: 'spring', bounce: 0.5, duration: 0.55 }}>
            <CactusGlyph size={12} /> Cactus
          </motion.span>
        )}
        {p.isBot
          ? <span className="ct-bot"><Icon name="bot" size={18} /></span>
          : <Avatar name={p.nickname ?? name} index={p.seat} size={30} online={p.connected !== false} />}
        <span className="ct-plate__who">
          <span className="ct-plate__name">{name}</span>
          <span className="ct-plate__score tabular">
            {total(p.total)} <small>/ {view.threshold}</small>
            <Gauge total={p.total} threshold={view.threshold} />
          </span>
        </span>
        {phase === 'peek' && (
          <span className={`ct-chip ${p.ready ? 'is-ok' : ''}`} title={p.ready ? 'Prêt' : `${p.peeked}/${PEEK_COUNT} cartes regardées`}>
            {p.ready ? <Icon name="check" size={14} strokeWidth={3} /> : <><Icon name="eye" size={12} strokeWidth={2.6} />{p.peeked}/{PEEK_COUNT}</>}
          </span>
        )}
        {seatIntent && <span className="ct-plate__gift" aria-hidden><Icon name="plus" size={14} strokeWidth={3} /></span>}
        {clockOn && <Drain key={`${turnClock?.key}-${turnClock?.endsAt}`} clock={turnClock} now={now} className="ct-timer" />}
        {reveal && result && (
          <motion.span
            className={`ct-gain ${result.points < 0 ? 'is-bonus' : result.points === 0 ? 'is-zero' : ''}`}
            title={`Cartes : ${result.sum}`}
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', bounce: 0.55, duration: 0.5, delay: 1 + revealSeat * 0.22 }}
          >
            {signed(result.points)}
          </motion.span>
        )}
        <AnimatePresence>
          {cap && (
            <motion.span key={cap.id} className={`ct-caption ${cap.tone ? `is-${cap.tone}` : ''}`} initial={{ opacity: 0, y: -6, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4 }} transition={{ type: 'spring', bounce: 0.35, duration: 0.4 }}>
              <Icon name={cap.icon} size={12} strokeWidth={2.6} /> {cap.text}
            </motion.span>
          )}
        </AnimatePresence>
      </PlateTag>
      <div className="ct-grid" style={{ '--cols': cols, '--rows': row ? 1 : 2 }}>
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
              dim={focus && !intent}
              penalty={i === penaltySlot}
            />
          );
        })}
        {!p.slots.some(Boolean) && !reveal && <span className="ct-nocard">Plus aucune carte</span>}
        {/* where a drawn card waits, beside the hand */}
        {!isMe && (
          <span ref={holdRef} className="ct-hold">
            {hasDrawn && !fx.masked[holdKey(p.id)] && <CactusCard faceUp={false} />}
          </span>
        )}
      </div>
    </section>
  );
}

function Pile({ view, intent, hot, onSpot, onHover }) {
  const ref = useSpot('pile');
  const n = view.pileCount;
  const Tag = intent ? 'button' : 'div';
  return (
    <Tag ref={ref} type={intent ? 'button' : undefined} className={`ct-pile ${intent ? 'is-target is-draw' : ''} ${hot ? 'is-preview' : ''}`} onClick={intent ? () => onSpot('pile') : undefined} onPointerEnter={intent ? () => onHover('pile') : undefined} onPointerLeave={intent ? () => onHover(null) : undefined} aria-label={intent ? intent.label : `Pioche : ${n} cartes`}>
      {n > 2 && <span className="ct-pile__under is-2"><CactusCard /></span>}
      {n > 1 && <span className="ct-pile__under is-1"><CactusCard /></span>}
      {n > 0 && <CactusCard />}
      <span className="ct-count tabular">{n}</span>
    </Tag>
  );
}

function Discard({ view, fx, intent, armed, preview, onSpot, onHover }) {
  const ref = useSpot('discard');
  const top = fx.discardShown;
  const Tag = intent ? 'button' : 'div';
  const power = view.power;
  return (
    <Tag ref={ref} type={intent ? 'button' : undefined} className={`ct-discard ${intent ? `is-target is-${intent.kind}` : ''} ${armed ? 'is-armed' : ''} ${preview ? 'is-preview' : ''} ${view.react && top ? 'is-fresh' : ''}`} onClick={intent ? () => onSpot('discard') : undefined} onPointerEnter={intent ? () => onHover('discard') : undefined} onPointerLeave={intent ? () => onHover(null) : undefined} aria-label={intent ? intent.label : top ? `Défausse : ${cardShort(top)}` : 'Défausse vide'}>
      <span className="ct-discard__well">{!top && <span>Défausse</span>}</span>
      {top && <CactusCard key={top} card={top} faceUp />}
      {power && top && (
        <motion.span className={`ct-powerbadge is-${TONE_OF_POWER[power.kind]}`} initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', bounce: 0.5, duration: 0.5 }} aria-hidden>
          <Icon name={ICON_OF_POWER[power.kind]} size={16} strokeWidth={2.6} />
        </motion.span>
      )}
      <AnimatePresence>
        {fx.burst > 0 && <motion.span key={fx.burst} className="ct-burst" initial={{ opacity: 1, scale: 0.6 }} animate={{ opacity: 0, scale: 1.7 }} transition={{ duration: 0.7, ease: 'easeOut' }} />}
      </AnimatePresence>
    </Tag>
  );
}

function MyHold({ view, fx }) {
  const ref = useSpot(holdKey(view.me));
  const card = view.drawn;
  const power = card ? powerOf(card) : null;
  return (
    <div className="ct-myhold">
      <span ref={ref} className={`ct-myhold__card ${card ? 'is-full' : ''}`}>
        {card && !fx.masked[holdKey(view.me)] && <CactusCard card={card} faceUp />}
      </span>
      {card && power && <span className={`ct-power is-${TONE_OF_POWER[power]}`}><Icon name={ICON_OF_POWER[power]} size={11} strokeWidth={2.8} />{POWER_SHORT[power]}</span>}
    </div>
  );
}

/**
 * My power, explained in the dock (where the message usually is): which power, what to
 * touch, the steps. Every power is compulsory: there is no way out.
 */
function PowerGuide({ view, sel, hint, onChange }) {
  const { kind, card } = view.power;
  const tone = TONE_OF_POWER[kind];
  let title; let text; let steps = null;
  if (kind === 'look') {
    title = 'Regardez une carte';
    text = 'Une des vôtres ou une adverse : vous seul la verrez.';
  } else if (kind === 'swap') {
    title = 'Échangez deux cartes';
    text = 'Vous verrez celle que vous recevez ; l’adversaire, non.';
    steps = ['Une des vôtres', 'Une adverse'];
  } else {
    title = 'Donnez une carte';
    text = 'Touchez un adversaire : il reçoit une carte de la pioche, face cachée.';
  }
  const at = kind === 'swap' && sel?.kind === 'jack' ? 1 : 0;
  return (
    <motion.div className={`ct-guide is-${tone}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', bounce: 0.3, duration: 0.4 }} role="status" aria-live="polite">
      <span className="ct-guide__eyebrow"><Icon name={ICON_OF_POWER[kind]} size={13} strokeWidth={2.6} /> Pouvoir {POWER_OF_RANK[rankOf(card)] ?? ''} · obligatoire</span>
      <strong className="ct-guide__title">{title}</strong>
      <span className="ct-guide__text">{hint ?? text}</span>
      {(steps || sel?.kind === 'jack') && (
        <div className="ct-guide__row">
          {steps && (
            <ol className="ct-steps">
              {steps.map((st, k) => <li key={st} className={k < at ? 'is-done' : k === at ? 'is-on' : ''}><b>{k < at ? '✓' : k + 1}</b>{st}</li>)}
            </ol>
          )}
          {sel?.kind === 'jack' && <button type="button" className="ct-btn is-ghost is-small" onClick={onChange}>Changer</button>}
        </div>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// What I can do, spot by spot (feedforward)
// ---------------------------------------------------------------------------

/**
 * Each interactive spot gets an intent: { kind, icon, label, action | select, preview, instant }.
 * `sel` is a choice in progress (the jack's first card).
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

  // A power stops the table: only its holder acts.
  if (view.power) {
    if (view.power.playerId !== me) return out;
    if (view.power.kind === 'look') {
      for (const p of view.players) each(p, (i, key) => out.set(key, { kind: 'eye', icon: 'eye', label: p.id === me ? 'Regarder cette carte' : 'Regarder cette carte adverse', action: { type: 'look', target: { playerId: p.id, slot: i } } }));
    } else if (view.power.kind === 'swap') {
      const theirs = sel?.kind === 'jack' ? sel.theirs : null;
      const mineSel = sel?.kind === 'jack' ? sel.mine : null;
      for (const i of myCards) {
        const key = slotKey(me, i);
        out.set(key, theirs
          ? { kind: 'swap', icon: 'swap', label: 'Échanger avec celle-ci', action: { type: 'swap', slot: i, target: theirs }, preview: { links: [[key, slotKey(theirs.playerId, theirs.slot)]] } }
          : { kind: 'swap', icon: 'swap', label: 'Choisir une de vos cartes', select: { kind: 'jack', mine: i, key } });
      }
      for (const p of opponents) {
        each(p, (i, key) => out.set(key, mineSel != null
          ? { kind: 'swap', icon: 'swap', label: 'Échanger avec celle-ci', action: { type: 'swap', slot: mineSel, target: { playerId: p.id, slot: i } }, preview: { links: [[slotKey(me, mineSel), key]] } }
          : { kind: 'swap', icon: 'swap', label: 'Choisir une carte adverse', select: { kind: 'jack', theirs: { playerId: p.id, slot: i }, key } }));
      }
    } else if (view.power.kind === 'giveOther') {
      for (const p of opponents) {
        const it = { kind: 'gift', icon: 'plus', label: `Donner une carte à ${p.nickname ?? 'cet adversaire'}`, action: { type: 'give', playerId: p.id }, preview: { links: [['pile', seatKey(p.id)]] } };
        out.set(seatKey(p.id), it);
        each(p, (i, key) => out.set(key, it));
      }
    }
    return out;
  }

  const myTurn = view.turn === me && !view.react && !view.closing;
  if (myTurn && view.step === 'drawn') {
    out.set('discard', { kind: 'drop', icon: 'arrowRight', label: 'Défausser la carte piochée', action: { type: 'discard' }, instant: true });
    for (const i of myCards) {
      out.set(slotKey(me, i), { kind: 'take', icon: 'swap', label: 'Remplacer par la carte piochée', action: { type: 'replace', slot: i }, preview: { ghost: view.drawn, links: [[slotKey(me, i), 'discard']] } });
    }
    return out;
  }
  if (myTurn && view.step === 'start') out.set('pile', { kind: 'draw', icon: 'plus', label: 'Piocher', action: { type: 'draw' }, instant: true });
  // At any other moment, my cards may be thrown on the discard's top card.
  if (view.canBurn) {
    const rank = rankName(view.discardTop);
    for (const i of myCards) out.set(slotKey(me, i), { kind: 'burn', icon: 'check', label: `Jeter cette carte (${rank} ?)`, action: { type: 'burn', slot: i }, instant: true });
  }
  return out;
}

/**
 * What touching a spot would do, said in the message while it is hovered (or armed on a
 * touch screen): the pile and the discard have no button of their own.
 */
function hintFor(view, key, intent) {
  if (!key || !intent) return null;
  if (key === 'pile') return { text: <><strong>Piocher</strong> : une carte inconnue, que vous seul verrez.</>, tone: 'turn' };
  if (key === 'discard' && view.step === 'drawn') {
    const power = view.drawn ? powerOf(view.drawn) : null;
    return power
      ? { text: <><strong>Défausser</strong> la carte piochée : son pouvoir s’applique ({POWER_SHORT[power]}).</>, tone: TONE_OF_POWER[power] }
      : { text: <><strong>Défausser</strong> la carte piochée (sans pouvoir).</>, tone: 'turn' };
  }
  if (intent.kind === 'burn') return { text: <><strong>Jeter</strong> cette carte sur {cardShort(view.discardTop)} : si ce n’est pas un {rankName(view.discardTop)}, +1 carte.</>, tone: 'burn' };
  const tone = { eye: 'eye', swap: 'swap', gift: 'gift', take: 'turn' }[intent.kind] ?? 'turn';
  return intent.label ? { text: <strong>{intent.label}</strong>, tone } : null;
}

/** The line under the table: what is expected of me, or what is going on. */
function statusFor(view, names, hint) {
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
  if (hint) return hint;
  if (view.power) {
    const who = nameOf(view.power.playerId);
    return { text: `${who} utilise le pouvoir ${POWER_OF_RANK[rankOf(view.power.card)] ?? ''}… tout le monde attend.`, tone: TONE_OF_POWER[view.power.kind] };
  }
  const throwIt = view.canBurn && mine?.count ? <> Un <strong>{rankName(view.discardTop)}</strong> ? Jetez-le !</> : null;
  if (view.closing) return { text: <>Dernière chance…{throwIt}</>, tone: 'burn' };
  if (view.turn === me && !view.react) {
    const last = view.cactusBy && view.turnNumber !== view.cactusTurn ? ' C’est votre dernier tour.' : '';
    if (view.step === 'drawn') return { text: <>Touchez une de vos cartes pour <strong>la remplacer</strong>, ou <strong>défaussez</strong> la carte piochée.</>, tone: 'turn' };
    return { text: <><strong>À vous :</strong> piochez.{last}</>, tone: 'turn' };
  }
  if (!view.turn) return { text: throwIt ? <>{throwIt}</> : 'Au suivant…', tone: throwIt ? 'burn' : '' };
  const who = nameOf(view.turn);
  const doing = view.hasDrawn ? `${who} a pioché…` : `${who} réfléchit…`;
  return { text: <>{doing}{throwIt}</>, tone: throwIt ? 'burn' : '' };
}

// ---------------------------------------------------------------------------
// Dock: the "Cactus" call with its confirmation
// ---------------------------------------------------------------------------

function CactusConfirm({ onConfirm, onCancel, busy }) {
  useEffect(() => {
    const on = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [onCancel]);
  return (
    <motion.div className="ct-confirm" role="dialog" aria-label="Annoncer Cactus" initial={{ opacity: 0, y: 14, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.96 }} transition={{ type: 'spring', bounce: 0.3, duration: 0.4 }}>
      <strong><CactusGlyph size={22} /> Annoncer « Cactus » ?</strong>
      <ul>
        <li>Vous finissez ce tour, les autres rejouent <b>une fois</b>, puis vous <b>en dernier</b>.</li>
        <li>De 1 à {CACTUS_LIMIT} points : <b>−5</b>. Exactement 0 : <b>Cactus royal, −10</b>.</li>
        <li>Plus de {CACTUS_LIMIT} : une <b>carte de pénalité</b>, puis ce qui dépasse {CACTUS_LIMIT}.</li>
        <li>Vos cartes restent exposées aux pouvoirs des autres.</li>
      </ul>
      <div className="ct-confirm__actions">
        <button type="button" className="ct-btn is-ghost" onClick={onCancel}>Pas encore</button>
        <button type="button" className="ct-btn is-cactus" onClick={onConfirm} disabled={busy} autoFocus>Oui, Cactus !</button>
      </div>
    </motion.div>
  );
}

function Tile({ kind, icon, title, sub, onClick, disabled, armed }) {
  return (
    <button type="button" className={`ct-tile is-${kind} ${armed ? 'is-armed' : ''}`} onClick={onClick} disabled={disabled}>
      {icon && <span className="ct-tile__icon">{icon}</span>}
      <span className="ct-tile__text"><b>{title}</b>{sub && <small>{sub}</small>}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------

/**
 * @param {{ view: object, names: Record<string,string>, onAct: (action: object) => Promise<any>,
 *   turnClock?: object, now?: () => number, readOnly?: boolean,
 *   paused?: { by?: string, canResume?: boolean } | null, onResume?: () => void, finishedAction?: any }} props
 */
export default function Table({ view, names, onAct, turnClock, now = Date.now, readOnly = false, paused = null, onResume, finishedAction = null }) {
  const [reg] = useState(() => new Map());
  const fx = useFx(view, names, reg);
  const fine = useMediaQuery('(pointer: fine)');
  // Wide screens: opponents around the table; tall ones: in a row above it.
  const wide = useMediaQuery('(min-aspect-ratio: 5/4) and (min-width: 700px)');
  const [sel, setSel] = useState(null);
  const [hover, setHover] = useState(null);
  const [armed, setArmed] = useState(null); // touch: a first tap arms, a second one plays
  const [busy, setBusy] = useState(false);
  const [confirmCactus, setConfirmCactus] = useState(false);
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

  // A new step, a new power: choices in progress are dropped.
  const stepKey = `${view.phase}-${view.turn}-${view.step}-${view.power?.playerId}-${view.power?.kind}-${view.round}`;
  useEffect(() => { setSel(null); setArmed(null); setHover(null); setConfirmCactus(false); }, [stepKey]);
  // Links follow the cards when the window is resized.
  useEffect(() => {
    const on = () => setTick((x) => x + 1);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  // My turn starts, or a power falls to me: a chime.
  const myPower = view.power?.playerId === view.me;
  const cue = view.phase === 'play' && ((view.turn === view.me && view.step === 'start' && !view.react) || myPower) ? stepKey : null;
  useEffect(() => { if (cue && !readOnly) { sound('turn'); haptic('turn'); } }, [cue]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const myTurn = !readOnly && view.phase === 'play' && view.turn === me && !view.react && !view.power && !view.closing;
  const reveal = view.phase === 'reveal' || view.phase === 'over';
  const revealIndex = (seat) => (seat - view.turnSeat + n) % n;
  const rr = reveal ? view.roundResult : null;
  const resultOf = (id) => (rr ? { points: rr.points[id], sum: rr.sums[id] } : null);
  const status = statusFor(view, names, hintFor(view, previewKey, previewIntent));
  // While I choose (a power, or the card to replace), everything I cannot touch steps back.
  const focus = (myPower && !readOnly) || (myTurn && view.step === 'drawn');
  // Who the clock is for: the power's holder, else the player whose turn it is.
  const clockFor = view.phase !== 'play' ? null : view.power ? view.power.playerId : view.react || view.closing ? null : view.turn;
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
      active={view.phase === 'play' && view.turn === p.id}
      clockOn={clockFor === p.id}
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
  const canCall = myTurn && (view.step === 'start' || view.step === 'drawn') && !view.cactusBy;
  return (
    <Spots.Provider value={reg}>
      <div className={`ct-stage ${wide ? 'is-wide' : 'is-tall'} ${view.react ? 'is-fresh' : ''} ${myTurn ? 'is-myturn' : ''} ${paused ? 'is-paused' : ''}`} style={{ '--top': Math.max(1, top.length) }}>
        <div className="ct-rail">{(view.phase === 'play' || view.phase === 'peek') && <OrderBar view={view} nameOf={nameOf} />}</div>
        <div className="ct-top">{top.map((p) => seat(p))}</div>
        {left && <div className="ct-side is-left">{seat(left)}</div>}
        {right && <div className="ct-side is-right">{seat(right)}</div>}

        <div className="ct-centre">
          <Pile view={view} intent={intents.get('pile')} hot={previewKey === 'pile'} onSpot={onSpot} onHover={setHover} />
          <MyHold view={view} fx={fx} />
          <Discard view={view} fx={fx} intent={intents.get('discard')} armed={armedKey === 'discard'} preview={previewKey === 'discard'} onSpot={onSpot} onHover={setHover} />
        </div>

        <div className="ct-mine">{meP && seat(meP, true)}</div>

        <div className="ct-dock">
          {myPower && !readOnly
            ? <PowerGuide view={view} sel={sel} hint={hintFor(view, previewKey, previewIntent)?.text ?? null} onChange={() => setSel(null)} />
            : <div className={`ct-status ${status.tone ? `is-${status.tone}` : ''}`} aria-live="polite"><span>{status.text}</span></div>}
          <div className="ct-actions">
            {view.phase === 'peek' && (
              // the button and the time left, as one block: the bar sits centred under it
              <div className="ct-mainwrap">
                {meP && !meP.ready && !readOnly && meP.peeked >= PEEK_COUNT && (
                  <button type="button" className="ct-btn is-gold is-main" onClick={() => send({ type: 'ready' })} disabled={busy}>
                    <Icon name="check" size={18} strokeWidth={2.6} /> C’est mémorisé
                  </button>
                )}
                <Drain key={`${turnClock?.key}-${turnClock?.endsAt}`} clock={turnClock} now={now} className="ct-bar" />
              </div>
            )}
            {rr && recapSeen && !recap && (
              <motion.button type="button" className="ct-btn is-gold is-main" onClick={() => setRecap(true)} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <Icon name="trophy" size={18} strokeWidth={2.4} /> Voir les scores
              </motion.button>
            )}
            {canCall && (
              <Tile kind="cactus" icon={<CactusGlyph size={22} />} title="Cactus !" sub={`${CACTUS_LIMIT} points ou moins`} onClick={() => { setConfirmCactus(true); sound('pick'); haptic('light'); }} disabled={busy} armed={confirmCactus} />
            )}
            {!fine && armed && intents.get(armed)?.action && (
              <button type="button" className="ct-btn is-gold" onClick={() => send(intents.get(armed).action)} disabled={busy}>{intents.get(armed).label}</button>
            )}
          </div>
          <AnimatePresence>
            {confirmCactus && canCall && <CactusConfirm busy={busy} onCancel={() => setConfirmCactus(false)} onConfirm={() => { setConfirmCactus(false); send({ type: 'cactus' }); }} />}
          </AnimatePresence>
        </div>
      </div>

      {rr && <RoundRecap open={recap} onClose={() => setRecap(false)} view={view} nameOf={nameOf} busy={busy} onReady={() => send({ type: 'ready' })} finishedAction={finishedAction} />}

      {/* effects, above everything */}
      <Links links={links} reg={reg} />
      <div className="ct-fx" aria-hidden>
        {fx.flights.map((f) => <Flight key={f.id} f={f} onLand={fx.land} />)}
        <AnimatePresence>
          {fx.pops.map((p) => (
            <motion.span key={p.id} className={`ct-pop is-${p.tone}`} style={{ left: p.x, top: p.y }} initial={{ opacity: 0, y: 8, scale: 0.7 }} animate={{ opacity: 1, y: -30, scale: 1 }} exit={{ opacity: 0, y: -46, scale: 0.95 }} transition={{ type: 'spring', bounce: 0.45, duration: 0.55 }}>
              {p.icon && <Icon name={p.icon} size={14} strokeWidth={2.6} />}{p.text}
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {fx.banner && (
          <motion.div key={fx.banner.id} className="ct-banner" role="status" initial={{ opacity: 0, scale: 0.6, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.2 } }} transition={{ type: 'spring', bounce: 0.5, duration: 0.6 }}>
            <span className="ct-banner__glyph"><CactusGlyph size={34} /></span>
            <strong>{fx.banner.title}</strong>
            <span>{fx.banner.sub}</span>
          </motion.div>
        )}
        {paused && (
          <motion.div key="pause" className="ct-paused" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="status">
            <motion.div className="ct-paused__card" initial={{ scale: 0.92, y: 10 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', bounce: 0.3, duration: 0.45 }}>
              <span className="ct-paused__icon"><Icon name="pause" size={22} strokeWidth={2.6} /></span>
              <strong>Partie en pause</strong>
              <span className="ct-paused__text">{paused.by ? `${paused.by} a mis la partie en pause.` : 'Les chronos et les robots sont arrêtés.'}</span>
              {paused.canResume && <button type="button" className="ct-btn is-gold" onClick={onResume} autoFocus><Icon name="play" size={16} strokeWidth={2.6} /> Reprendre</button>}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Spots.Provider>
  );
}
