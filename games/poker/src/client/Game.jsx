import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useApp, serverNow } from '@bgio/ui/lib/store.js';
import { act as sendAction, call } from '@bgio/ui/lib/socket.js';
import { errorMessage } from '@bgio/ui/lib/i18n.js';
import { haptic, sound } from '@bgio/ui/lib/feedback.js';
import { Avatar, Button, IconButton, Sheet } from '@bgio/ui/components/ui.jsx';
import Icon from '@bgio/ui/components/Icon.jsx';
import { toast, useToastPlacement } from '@bgio/ui/components/Toaster.jsx';
import SettingsSheet from '@bgio/ui/components/SettingsSheet.jsx';
import { evaluate } from '../engine/cards.js';
import Card from './Card.jsx';
import RulesSheet from './RulesSheet.jsx';
import { actionLabel, fmt, handName } from './i18n.js';
import './table.css';

/** Time left for the current decision, as a draining bar (CSS animation, no re-render). */
function Timer({ turn, className }) {
  const [elapsed] = useState(() => (turn?.endsAt ? Math.max(0, turn.durationMs - Math.max(0, turn.endsAt - serverNow())) : 0));
  if (!turn?.endsAt || !turn.durationMs) return null;
  return (
    <span className={className} aria-hidden>
      <span style={{ animationDuration: `${turn.durationMs}ms`, animationDelay: `-${elapsed}ms` }} />
    </span>
  );
}

/** A player on the rim of the table: cards, name plate, chips, and what they just did. */
function Seat({ player, style, isMe, active, turn, hand, dealer }) {
  const p = player;
  let tag = null;
  if (p.out) tag = 'Éliminé';
  else if (p.score) tag = `${handName(p.score)}${p.won ? ` · +${fmt(p.won)}` : ''}`;
  else if (p.won) tag = `+${fmt(p.won)}`;
  else if (p.action) tag = actionLabel(p.action);
  const away = p.connected === false && !p.isBot;
  const hasCards = p.inHand || (isMe && p.cards?.length === 2);
  return (
    <div
      className={`pk-seat ${isMe ? 'is-me' : ''} ${active ? 'is-turn' : ''} ${p.folded || p.out ? 'is-folded' : ''} ${p.won ? 'is-winner' : ''} ${away ? 'is-away' : ''}`}
      style={style}
    >
      {/* keyed by hand: the cards are dealt again at every hand */}
      <div className="pk-seat__cards" key={hand}>
        {hasCards && [0, 1].map((i) => <Card key={i} card={p.cards?.[i]} faceDown={!p.cards} />)}
      </div>
      <div className="pk-plate">
        {dealer && <span className="pk-dealer" title="Donneur">D</span>}
        {p.isBot
          ? <span className="pk-bot"><Icon name="bot" size={18} /></span>
          : <Avatar name={p.nickname} index={p.seat} size={32} online={!away} />}
        <span className="pk-plate__who">
          <span className="pk-plate__name">{isMe ? 'Vous' : p.isBot ? p.nickname.replace(/^Robot /, '') : p.nickname}</span>
          <span className="pk-plate__stack tabular">{fmt(p.stack)}</span>
        </span>
        {active && <Timer key={`${turn?.key}-${turn?.endsAt}`} turn={turn} className="pk-timer" />}
      </div>
      {tag && <span className={`pk-tag ${p.won ? 'is-win' : ''}`}>{tag}</span>}
    </div>
  );
}

/** My moves: fold, check or call, and a bet sized with the slider or the shortcuts. */
function Moves({ view, stack, raiseTo, setRaiseTo, busy, send }) {
  const { toCall, minTo, maxTo, canRaise } = view.legal;
  const pot = view.pot + toCall;
  const snap = (x) => Math.max(minTo, Math.min(maxTo, Math.round(x / view.sb) * view.sb));
  const presets = [['Min', minTo], ['½ pot', snap(view.currentBet + pot / 2)], ['Pot', snap(view.currentBet + pot)], ['Tapis', maxTo]];
  const to = Math.max(minTo, Math.min(maxTo, raiseTo));
  return (
    <>
      {canRaise && minTo < maxTo && (
        <div className="pk-raise">
          {presets.map(([label, value]) => (
            <button key={label} type="button" className="pk-preset" onClick={() => { setRaiseTo(value); haptic('light'); }}>{label}</button>
          ))}
          <input
            type="range"
            aria-label="Montant de la mise"
            min={minTo}
            max={maxTo}
            step={view.sb}
            value={to}
            // the last notch of the slider is the whole stack
            onChange={(e) => { const x = Number(e.target.value); setRaiseTo(x + view.sb > maxTo ? maxTo : x); }}
          />
        </div>
      )}
      <div className="pk-moves">
        <Button variant="danger" disabled={busy || !toCall} onClick={() => send({ type: 'fold' })}>Se coucher</Button>
        <Button variant="secondary" disabled={busy} onClick={() => send({ type: 'call' })}>
          {!toCall ? 'Parole' : toCall >= stack ? `Tapis ${fmt(toCall)}` : `Suivre ${fmt(toCall)}`}
        </Button>
        <Button variant="primary" disabled={busy || !canRaise} onClick={() => send({ type: 'raise', to })}>
          {to >= maxTo ? `Tapis ${fmt(to)}` : `${view.currentBet ? 'Relancer à' : 'Miser'} ${fmt(to)}`}
        </Button>
      </div>
    </>
  );
}

export default function Game({ room, readOnly = false, onExitBoard }) {
  const navigate = useNavigate();
  const me = useApp((s) => s.session?.playerId);
  const v = room.game;
  const turn = room.turn;
  const isHost = room.hostId === me;
  const [sheet, setSheet] = useState(null); // 'menu' | 'rules' | 'leave'
  const [busy, setBusy] = useState(false);
  const [raiseTo, setRaiseTo] = useState(0);
  // The bottom of the screen is my seat and my moves: notifications go to the top here.
  useToastPlacement('top');

  const players = v.players.map((p) => {
    const rp = room.players.find((x) => x.id === p.id);
    return { ...p, nickname: rp?.nickname ?? p.nickname ?? '—', connected: rp?.connected };
  });
  const n = players.length;
  const mine = players[v.mySeat] ?? null;
  const nameOf = (id) => (id === me ? 'Vous' : players.find((p) => p.id === id)?.nickname ?? '—');
  const hostPaused = !!turn?.pausedByHost;
  const playing = !readOnly && room.status === 'playing';
  const myTurn = playing && v.phase === 'betting' && v.turn === me && !!v.legal && !hostPaused;

  // Seats: me at the bottom, the others clockwise in playing order.
  const first = Math.max(0, v.mySeat);
  const place = (seat) => {
    const angle = Math.PI / 2 + (((seat - first + n) % n) * 2 * Math.PI) / n;
    return { '--x': Math.cos(angle).toFixed(3), '--y': Math.sin(angle).toFixed(3) };
  };

  // ---- reacting to the table ----------------------------------------------------
  const prev = useRef(v);
  useEffect(() => {
    const before = prev.current;
    prev.current = v;
    if (before === v || readOnly) return;
    if (v.handNumber !== before.handNumber) sound('shuffle');
    else if (v.board.length > before.board.length) sound('place');
    else if (v.phase === 'betting' && v.pot > before.pot) sound('pick');
    if (v.phase === 'showdown' && before.phase !== 'showdown') {
      const seat = v.players[v.mySeat];
      if (seat?.won) { sound('bingo'); haptic('success'); }
      else if (seat?.score) { sound('error'); haptic('error'); } // lost a showdown
      else sound('back');
    }
  }, [v]); // eslint-disable-line react-hooks/exhaustive-deps

  // My turn: a sound, and the bet slider starts at the smallest raise.
  const wasMyTurn = useRef(false);
  useEffect(() => {
    if (myTurn && !wasMyTurn.current) { sound('turn'); haptic('turn'); }
    wasMyTurn.current = myTurn;
    if (v.legal) setRaiseTo(v.legal.minTo);
  }, [myTurn, v.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (action) => {
    if (busy) return;
    setBusy(true);
    try {
      await sendAction(room.id, action);
      haptic('light');
    } catch (e) {
      sound('error');
      haptic('error');
      toast({ title: errorMessage(e.code, e.details), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const togglePause = async () => {
    try {
      await call(hostPaused ? 'room:resume' : 'room:pause', { roomId: room.id });
      haptic('light');
    } catch (e) {
      toast({ title: errorMessage(e.code, e.details), tone: 'error' });
    }
  };

  // ---- what the felt and the dock say ---------------------------------------------
  let message = '';
  if (v.last) {
    const w = v.last.winners;
    message = w.length === 1
      ? `${nameOf(w[0].playerId)} ${w[0].playerId === me ? 'remportez' : 'remporte'} ${fmt(w[0].amount)}`
      : `Pot partagé : ${w.map((x) => nameOf(x.playerId)).join(', ')}`;
  } else if (v.phase === 'runout') message = 'Tapis !';

  const myHand = mine?.cards?.length === 2 && !mine.folded && v.board.length >= 3 ? handName(evaluate([...mine.cards, ...v.board])) : null;
  let status;
  if (readOnly) status = 'Partie terminée.';
  else if (hostPaused) status = 'Partie en pause.';
  else if (v.phase === 'showdown') status = 'Donne suivante dans un instant…';
  else if (v.phase === 'runout') status = 'Plus personne ne peut miser : les cartes sortent.';
  else if (myTurn) status = <><strong>À vous</strong>{myHand ? ` · ${myHand}` : ''}</>;
  else if (mine?.out) status = 'Vous êtes éliminé : vous pouvez suivre la fin de la partie.';
  else status = `${nameOf(v.turn)} réfléchit…${myHand ? ` · Votre main : ${myHand}` : ''}`;

  return (
    <div className="pk-table pk-game">
      <header className="pk-bar">
        <IconButton icon="settings" label="Réglages" onClick={() => setSheet('menu')} className="pk-icon" />
        <div className="pk-bar__title">
          <span className="pk-bar__name">PokerIO</span>
          <span className="pk-bar__chip tabular">Donne {v.handNumber}</span>
          <span className="pk-bar__sub tabular">
            Blindes {fmt(v.sb)}/{fmt(v.bb)}
            {v.handsToRise != null && playing ? ` · ×2 dans ${v.handsToRise} donne${v.handsToRise > 1 ? 's' : ''}` : ''}
          </span>
        </div>
        <div className="pk-bar__side">
          {isHost && playing && (
            <IconButton icon={hostPaused ? 'play' : 'pause'} label={hostPaused ? 'Reprendre la partie' : 'Mettre en pause'} onClick={togglePause} className="pk-icon" />
          )}
          <IconButton icon="book" label="Règles" onClick={() => setSheet('rules')} className="pk-icon" />
        </div>
      </header>

      <main className="pk-stage">
        <div className="pk-ring">
          <div className="pk-felt">
            <span className="pk-pot tabular"><i className="pk-coin" />Pot · {fmt(v.pot)}</span>
            <div className="pk-board" aria-label="Cartes communes">
              {[0, 1, 2, 3, 4].map((i) => (i < v.board.length
                ? <Card key={`${v.handNumber}-${i}`} card={v.board[i]} />
                : <span key={`slot-${i}`} className="pk-slot" />))}
            </div>
            <div className="pk-msg" aria-live="polite">{message}</div>
          </div>

          {players.map((p) => (
            <Seat
              key={p.id}
              player={p}
              style={place(p.seat)}
              isMe={p.id === me}
              active={playing && v.phase === 'betting' && v.turn === p.id && !hostPaused}
              turn={turn}
              hand={v.handNumber}
              dealer={p.seat === v.dealerSeat}
            />
          ))}
          {players.map((p) => p.bet > 0 && (
            <span key={`bet-${p.id}`} className="pk-bet tabular" style={place(p.seat)}><i className="pk-coin" />{fmt(p.bet)}</span>
          ))}
        </div>
      </main>

      <footer className="pk-dock">
        <div className="pk-status" aria-live="polite">{status}</div>
        {readOnly ? (
          <div className="pk-back"><Button variant="primary" icon="back" onClick={onExitBoard}>Retour aux résultats</Button></div>
        ) : myTurn ? (
          <Moves view={v} stack={mine.stack} raiseTo={raiseTo} setRaiseTo={setRaiseTo} busy={busy} send={send} />
        ) : v.phase === 'showdown' && !hostPaused ? (
          <Timer key={`${turn?.key}-${turn?.endsAt}`} turn={turn} className="pk-next" />
        ) : null}
      </footer>

      <AnimatePresence>
        {hostPaused && playing && (
          <motion.div key="pause" className="pk-paused" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="status">
            <motion.div className="pk-paused__card" initial={{ scale: 0.92, y: 10 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', bounce: 0.3, duration: 0.45 }}>
              <strong>Partie en pause</strong>
              <span className="pk-paused__text">{isHost ? 'Les chronos et les robots sont arrêtés.' : `${nameOf(room.hostId)} a mis la partie en pause.`}</span>
              {isHost && <Button variant="primary" icon="play" onClick={togglePause} autoFocus>Reprendre</Button>}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <SettingsSheet open={sheet === 'menu'} onClose={() => setSheet(null)}>
        <div className="settings__group">
          <span className="eyebrow">Partie · salon {room.id}</span>
          <Button variant="secondary" icon="book" onClick={() => setSheet('rules')}>Règles de PokerIO</Button>
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
        <p className="sheet-lead">Votre place est gardée : vous pourrez revenir depuis l’accueil. En votre absence, vous passez quand c’est gratuit et vous vous couchez sinon.</p>
      </Sheet>
    </div>
  );
}
