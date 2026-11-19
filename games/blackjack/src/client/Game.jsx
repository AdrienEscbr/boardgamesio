import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useApp, serverNow } from '@bgio/ui/lib/store.js';
import { act as sendAction, call } from '@bgio/ui/lib/socket.js';
import { errorMessage } from '@bgio/ui/lib/i18n.js';
import { haptic, sound } from '@bgio/ui/lib/feedback.js';
import { Button, IconButton, Sheet, Switch } from '@bgio/ui/components/ui.jsx';
import Icon from '@bgio/ui/components/Icon.jsx';
import { toast, useToastPlacement } from '@bgio/ui/components/Toaster.jsx';
import SettingsSheet from '@bgio/ui/components/SettingsSheet.jsx';
import Seat from './Seat.jsx';
import Dealer, { Shoe } from './Dealer.jsx';
import Felt from './Felt.jsx';
import { ActionBar, BetTray } from './Controls.jsx';
import RulesSheet from './RulesSheet.jsx';
import { DECK_LABELS, fmt, signed } from './i18n.js';
import './blackjack.css';

/** Time left, as a draining gold bar (CSS animation, no re-render). */
function TurnTimer({ turn, className = 'bj-timer' }) {
  const [elapsed] = useState(() => (turn?.endsAt ? Math.max(0, turn.durationMs - Math.max(0, turn.endsAt - serverNow())) : 0));
  if (!turn?.endsAt || !turn.durationMs) return null;
  return (
    <span className={className} aria-hidden>
      <span style={{ animationDuration: `${turn.durationMs}ms`, animationDelay: `-${elapsed}ms` }} />
    </span>
  );
}

const ADVICE_KEY = 'bgio:blackjack:advice';
function loadAdvice() {
  try { return localStorage.getItem(ADVICE_KEY) !== '0'; } catch { return true; }
}

// The opening deal: one card every DEAL_STEP ms, player after player, then the dealer.
const DEAL_STEP = 190;

/**
 * Remembers when the cards of a round were dealt, so each card can wait for its turn to fly
 * out of the shoe, and a card drawn while the deal is still running waits for its end.
 */
function useDealClock(v) {
  const deal = useRef({ round: 0, at: 0, order: {}, end: 0 });
  if (v.dealer.cards.length && deal.current.round !== v.roundNumber) {
    const bettors = v.players.filter((p) => p.hands.length);
    const n = bettors.length + 1;
    const order = {};
    bettors.forEach((p, j) => { order[p.id] = [j, n + j]; });
    order.dealer = [n - 1, 2 * n - 1];
    deal.current = { round: v.roundNumber, at: performance.now(), order, end: 2 * n * DEAL_STEP };
  }
  const delayOf = (who, hand, k) => {
    const d = deal.current;
    const since = performance.now() - d.at;
    const slot = hand === 0 && k < 2 ? d.order[who]?.[k] : null;
    return Math.max(0, (slot != null ? slot * DEAL_STEP : d.end) - since);
  };
  return { delayOf, deal };
}

/**
 * The table. `local` (design review page) replaces the server: `{ me, act(action) }`.
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
  const [advice, setAdvice] = useState(loadAdvice);
  useToastPlacement('top');

  const players = v.players.map((p) => {
    const rp = room.players.find((x) => x.id === p.id);
    return { ...p, nickname: rp?.nickname ?? p.nickname ?? '—', connected: rp?.connected ?? true };
  });
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  const meP = byId[me];
  const others = players.filter((p) => p.id !== me);
  const nameOf = (id) => (id === me ? 'Vous' : byId[id]?.nickname ?? '—');
  const hostPaused = !!turn?.pausedByHost;
  const playing = !readOnly && room.status === 'playing';
  const settled = v.phase === 'settle' || v.phase === 'over';
  const myBetTurn = playing && !hostPaused && v.phase === 'bet' && meP && !meP.betPlaced && !meP.out;
  const myTurn = playing && !hostPaused && !!v.legal;
  const myHand = myTurn ? meP.hands[v.turn.hand] : null;

  const { delayOf, deal } = useDealClock(v);

  // ---- my bet being composed ------------------------------------------------------
  const lastBet = useRef(null);
  const [draft, setDraft] = useState(0);
  useEffect(() => {
    if (meP?.bet > 0 && v.phase !== 'bet') lastBet.current = meP.bet;
  }, [meP?.bet, v.phase]);
  useEffect(() => {
    // A new round: the previous bet is offered again (if it is still affordable).
    if (v.phase !== 'bet' || !meP) return;
    const max = meP.stack - (meP.stack % v.betStep);
    const again = lastBet.current;
    setDraft(again && again <= max && again >= v.minBet ? again : Math.min(v.minBet, max));
  }, [v.roundNumber]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const addChip = (value) => { setDraft((d) => d + value); sound('chip'); haptic('light'); };
  const setBet = (amount) => { setDraft(amount); sound('chip'); haptic('light'); };
  const confirmBet = () => { if (myBetTurn && draft >= v.minBet) { sound('chip'); haptic('medium'); send({ type: 'bet', amount: draft }); } };
  const pass = () => { if (myBetTurn) { sound('back'); send({ type: 'pass' }); } };
  const play = (type) => {
    if (!myTurn || !v.legal[type]) return;
    sound(type === 'stand' ? 'tick' : type === 'hit' ? 'pick' : 'chip');
    haptic(type === 'stand' ? 'light' : 'medium');
    send({ type });
  };

  // Keyboard: T R D S on my hand, Enter to bet.
  const keys = useRef({});
  keys.current = { myTurn, myBetTurn, play, confirmBet };
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = keys.current;
      const type = { t: 'hit', r: 'stand', d: 'double', s: 'split' }[e.key.toLowerCase()];
      if (k.myTurn && type) { e.preventDefault(); k.play(type); }
      if (k.myBetTurn && e.key === 'Enter' && !e.target.closest?.('button')) k.confirmBet();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---- reacting to the table ----------------------------------------------------
  const [banner, setBanner] = useState(null);
  useEffect(() => {
    if (!banner) return undefined;
    const t = setTimeout(() => setBanner(null), 1700);
    return () => clearTimeout(t);
  }, [banner]);
  const prev = useRef(v);
  useEffect(() => {
    const before = prev.current;
    prev.current = v;
    if (before === v) return undefined;
    const timers = [];
    const later = (ms, fn) => timers.push(setTimeout(fn, ms));
    const newRound = before.roundNumber !== v.roundNumber;
    if (newRound && !readOnly) setBanner({ round: v.roundNumber, last: v.roundNumber >= v.totalRounds, shuffled: v.reshuffled });
    if (newRound) later(250, () => sound(v.reshuffled ? 'shuffle' : 'back'));
    // Cards out of the shoe: a flick for each, on its beat during the deal.
    const count = (x) => x.dealer.cards.length + x.players.reduce((s, p) => s + p.hands.reduce((t, h) => t + h.cards.length, 0), 0);
    const fresh = newRound ? count(v) : count(v) - count(before);
    if (fresh > 0) {
      const since = performance.now() - deal.current.at;
      const opening = !before.dealer.cards.length || newRound;
      for (let i = 0; i < fresh; i++) later(opening ? Math.max(0, i * DEAL_STEP + 380 - since) : 300, () => sound('flip'));
    }
    // The hole card turns over.
    if (v.dealer.revealed && !before.dealer.revealed && !newRound) sound('flip');
    // A robot or a player bet.
    if (v.phase === 'bet' && !newRound && v.players.filter((p) => p.betPlaced).length > before.players.filter((p) => p.betPlaced).length) sound('chip');
    // Paid: my result.
    if (settled && before.phase !== 'settle' && before.phase !== 'over' && meP?.hands.length) {
      const bj = meP.hands.some((h) => h.outcome === 'blackjack');
      const left = Math.max(0, deal.current.end - (performance.now() - deal.current.at));
      const wait = !v.dealer.cards.length ? 0 : left > 0 ? left + 900 : 500;
      later(wait, () => {
        if (bj) { sound('success'); } else if (meP.net > 0) { sound('success'); haptic('success'); } else if (meP.net < 0) { sound('error'); haptic('error'); } else sound('back');
      });
    }
    // A hand busts: the stamp (and a buzz when it is mine). A blackjack: a fanfare.
    const hands = (x, pred) => x.players.flatMap((p) => p.hands.filter(pred).map(() => p.id));
    const busts = (x) => hands(x, (h) => h.total > 21);
    const bjs = (x) => hands(x, (h) => h.blackjack);
    if (!newRound && busts(v).length > busts(before).length) {
      const mine = busts(v).filter((id) => id === me).length > busts(before).filter((id) => id === me).length;
      later(650, () => { sound('error'); if (mine) haptic('error'); });
    }
    if (bjs(v).length > (newRound ? 0 : bjs(before).length)) {
      const mine = bjs(v).includes(me) && !(newRound ? [] : bjs(before)).includes(me);
      const wait = Math.max(0, deal.current.end - (performance.now() - deal.current.at)) + 850;
      later(wait, () => { sound(mine ? 'bingo' : 'success'); if (mine) haptic('success'); });
    }
    if (v.dealer.total > 21 && !(before.dealer.total > 21) && !newRound) later(650, () => sound('burn'));
    if (v.dealer.blackjack && !before.dealer.blackjack) later(Math.max(0, deal.current.end - (performance.now() - deal.current.at)) + 850, () => sound('cactus'));
    return () => timers.forEach(clearTimeout);
  }, [v]); // eslint-disable-line react-hooks/exhaustive-deps

  // My move after a wait: a call.
  const wasMine = useRef(false);
  useEffect(() => {
    const mine = myTurn || myBetTurn;
    if (mine && !wasMine.current && myTurn) { sound('turn'); haptic('turn'); }
    wasMine.current = mine;
  }, [myTurn, myBetTurn]);

  const togglePause = async () => {
    if (local) { local.togglePause?.(); return; }
    try {
      await call(hostPaused ? 'room:resume' : 'room:pause', { roomId: room.id });
      haptic('light');
    } catch (e) {
      toast({ title: errorMessage(e.code, e.details), tone: 'error' });
    }
  };
  const toggleAdvice = (on) => {
    setAdvice(on);
    try { localStorage.setItem(ADVICE_KEY, on ? '1' : '0'); } catch { /* private mode */ }
  };

  // ---- what to say ----------------------------------------------------------------
  const seatState = (p) => {
    if (!playing || p.out) return null;
    if (v.phase === 'bet') return p.betPlaced ? null : p.id === me ? null : 'mise…';
    if (v.phase === 'play' && v.turn?.playerId === p.id && p.id !== me) return p.hands.length > 1 ? `main ${v.turn.hand + 1}…` : 'joue…';
    return null;
  };
  const d = v.dealer;
  // A round settled straight from the deal (the dealer's blackjack): results wait for the
  // last card to land and turn over; otherwise for the dealer's last card to turn.
  const dealLeft = Math.max(0, deal.current.end - (performance.now() - deal.current.at));
  const revealMs = dealLeft > 0 ? dealLeft + 900 : 500;
  let dealerVerdict = null;
  if (settled && d.cards.length) dealerVerdict = d.blackjack ? 'Blackjack de la banque' : d.total > 21 ? `La banque saute à ${d.total} !` : `La banque fait ${d.total}`;

  let status;
  if (readOnly) status = 'Partie terminée.';
  else if (hostPaused) status = 'Partie en pause.';
  else if (v.phase === 'bet') {
    if (!meP) status = 'Les joueurs misent…';
    else if (meP.out) status = 'Plus assez de jetons : vous regardez la fin de la partie.';
    else {
      const waiting = v.awaiting.filter((id) => id !== me).map(nameOf);
      status = `${meP.bet ? `Mise posée : ${fmt(meP.bet)}` : 'Vous passez cette manche'} · ${waiting.length ? `on attend ${waiting.join(', ')}` : 'distribution…'}`;
    }
  } else if (v.phase === 'play') {
    const who = v.turn?.playerId;
    status = `${nameOf(who)} ${who === me ? 'jouez' : 'joue'}${byId[who]?.hands.length > 1 ? ` (main ${v.turn.hand + 1})` : ''}…`;
  } else if (v.phase === 'dealer') status = d.revealed ? 'La banque tire jusqu’à 17…' : 'La banque retourne sa carte…';
  else status = roundVerdict(meP);

  const clock = turn?.endsAt && turn.durationMs >= 2000 ? turn : null;
  const arc = arcPositions(players, me);
  const lastRound = v.roundNumber >= v.totalRounds;

  return (
    <div className="bj-table bj-game">
      <header className="bj-bar">
        <IconButton icon="settings" label="Réglages" onClick={() => setSheet('menu')} className="bj-icon" />
        <div className="bj-bar__title">
          <span className="bj-bar__name">BlackjackIO</span>
          <span className="bj-bar__chip">{lastRound ? 'Dernière manche' : `Manche ${v.roundNumber} / ${v.totalRounds}`}</span>
          <span className="bj-bar__sub">mise min. {fmt(v.minBet)} · {DECK_LABELS[v.decks]}</span>
        </div>
        <div className="bj-bar__side">
          {isHost && playing && (
            <IconButton icon={hostPaused ? 'play' : 'pause'} label={hostPaused ? 'Reprendre la partie' : 'Mettre en pause'} onClick={togglePause} className="bj-icon" />
          )}
          <IconButton icon="book" label="Règles" onClick={() => setSheet('rules')} className="bj-icon" />
        </div>
      </header>

      <main className="bj-stage">
        {/* A new round: the banner lives 1.7 s, its whole life is one CSS animation. */}
        {banner && (
          <div key={`banner-${banner.round}`} className="bj-banner" aria-hidden>
            <span className="bj-banner__rule" />
            <strong>{banner.last ? 'Dernière manche' : `Manche ${banner.round}`}</strong>
            <small>{banner.shuffled && banner.round > 1 ? 'Nouveau sabot · cartes mélangées' : `sur ${v.totalRounds}`}</small>
            <span className="bj-banner__rule" />
          </div>
        )}
        <Felt
          top={(
            <>
              <Shoe left={v.shoeLeft} size={v.shoeSize} />
              <Dealer dealer={d} round={v.roundNumber} delayOf={(k) => delayOf('dealer', 0, k)} verdict={dealerVerdict} thinking={v.phase === 'dealer'} revealMs={revealMs} />
            </>
          )}
        >
          {others.length > 0 && (
            <div className={`bj-others is-${others.length}`}>
              {others.map((p) => (
                <Seat key={p.id} p={p} v={v} isMe={false} compact delayOf={delayOf} state={seatState(p)} pos={arc[p.id]} revealMs={revealMs} />
              ))}
            </div>
          )}
          {meP && (
            <div className="bj-mine">
              <Seat p={meP} v={v} isMe draft={myBetTurn ? draft : 0} delayOf={delayOf} state={seatState(meP)} pos={arc[meP.id]} revealMs={revealMs} />
            </div>
          )}
        </Felt>
      </main>

      <footer className="bj-dock">
        {clock && playing && !hostPaused && (myTurn || myBetTurn) && <TurnTimer key={`${clock.key}-${clock.endsAt}`} turn={clock} />}
        {/* The content swaps at once and fades in (CSS): nothing waits on an exit animation. */}
        {myBetTurn ? (
            <div key={`bet-${v.roundNumber}`} className="bj-dock__panel bj-dock__in">
              <BetTray
                draft={draft}
                stack={meP.stack}
                minBet={v.minBet}
                step={v.betStep}
                lastBet={lastBet.current}
                busy={busy}
                onAdd={addChip}
                onSet={setBet}
                onClear={() => { setDraft(0); sound('back'); }}
                onConfirm={confirmBet}
                onPass={pass}
              />
            </div>
          ) : myTurn && myHand ? (
            <div key="play" className="bj-dock__panel bj-dock__in">
              <ActionBar hand={myHand} upCard={d.cards[0]} legal={v.legal} stack={meP.stack} advice={advice} busy={busy} onAct={play} />
            </div>
          ) : (
            <div
              key={settled ? `over-${v.roundNumber}` : status}
              className={`bj-verdict bj-dock__in ${settled ? 'is-over' : 'is-quiet'}`}
              style={{ '--d': `${settled && d.cards.length ? revealMs : 0}ms` }}
              role="status"
              aria-live="polite"
            >
              <strong>{status}</strong>
              {settled && playing && <span className="bj-verdict__next">{lastRound ? 'Fin de partie…' : 'Manche suivante…'}</span>}
              {settled && playing && turn?.endsAt && <TurnTimer key={`next-${turn.key}`} turn={turn} className="bj-timer bj-timer--verdict" />}
            </div>
          )}
      </footer>

      <AnimatePresence>
        {hostPaused && playing && (
          <motion.div key="pause" className="bj-paused" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="status">
            <motion.div className="bj-paused__card" initial={{ scale: 0.92, y: 10 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', bounce: 0.3, duration: 0.45 }}>
              <strong>Partie en pause</strong>
              <span className="bj-paused__text">{isHost ? 'Les chronos et les robots sont arrêtés.' : `${nameOf(room.hostId)} a mis la partie en pause.`}</span>
              {isHost && (
                <button type="button" className="bj-btn bj-btn--gold" onClick={togglePause} autoFocus>
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
          <Switch icon="target" label="Conseils de jeu (stratégie de base)" checked={advice} onChange={toggleAdvice} />
          <Button variant="secondary" icon="book" onClick={() => setSheet('rules')}>Règles de BlackjackIO</Button>
          {isHost && playing && (
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
        <p className="sheet-lead">Votre place est gardée : vous pourrez revenir depuis l’accueil. En votre absence, vous passez les mises et restez sur vos mains.</p>
      </Sheet>
    </div>
  );
}

/**
 * Seats along the rounded rim of the table (used on wide screens): me at the bottom, the
 * others on both sides, in table order. Play goes from the dealer's left (my right) to his
 * right, so the player after me sits on my left. Positions in % of the felt: the bottom of
 * each seat's name plate.
 */
export function arcPositions(players, me) {
  const pos = {};
  const n = players.length;
  const at = (id, deg) => {
    const t = (deg * Math.PI) / 180;
    pos[id] = { x: 50 + 45 * Math.sin(t), y: 16 + 79 * Math.cos(t) };
  };
  const mine = players.findIndex((p) => p.id === me);
  if (mine < 0) {
    // A spectator: everyone spread evenly along the rim.
    const step = n > 1 ? Math.min(30, 140 / (n - 1)) : 0;
    players.forEach((p, i) => at(p.id, -(i - (n - 1) / 2) * step));
    return pos;
  }
  at(me, 0);
  const after = Array.from({ length: n - 1 }, (_, k) => players[(mine + 1 + k) % n].id);
  const left = after.slice(0, Math.ceil(after.length / 2));
  const right = after.slice(left.length).reverse();
  // The nearest seats keep clear of my cards; the farthest reach the side of the table.
  const angles = (k) => ({ 1: [42], 2: [40, 62], 3: [38, 56, 74] }[k] ?? []);
  angles(left.length).forEach((a, i) => left[i] && at(left[i], -a));
  angles(right.length).forEach((a, i) => right[i] && at(right[i], a));
  return pos;
}

/** My result for the round just paid. */
export function roundVerdict(meP) {
  if (!meP || meP.out) return 'Manche terminée.';
  if (!meP.hands.length) return 'Vous passiez cette manche.';
  if (meP.hands.some((h) => h.outcome === 'blackjack')) return `Blackjack ! ${signed(meP.net)}`;
  if (meP.net > 0) return `Gagné : ${signed(meP.net)}`;
  if (meP.net < 0) return meP.hands.every((h) => h.outcome === 'bust') ? `Sauté : ${signed(meP.net)}` : `Perdu : ${signed(meP.net)}`;
  return meP.hands.some((h) => h.outcome === 'win') ? 'Une main gagnée, une perdue : rien de joué.' : 'Égalité : mise rendue.';
}
