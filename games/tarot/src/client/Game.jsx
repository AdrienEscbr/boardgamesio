import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { EXCUSE, isBout, isKing, isTrump, playError } from '../engine/index.js';
import { useApp } from '@bgio/ui/lib/store.js';
import { act as sendAction, call } from '@bgio/ui/lib/socket.js';
import { errorMessage } from '@bgio/ui/lib/i18n.js';
import { haptic, sound } from '@bgio/ui/lib/feedback.js';
import { useMediaQuery } from '@bgio/ui/lib/useMediaQuery.js';
import { Button, IconButton, Sheet } from '@bgio/ui/components/ui.jsx';
import Icon from '@bgio/ui/components/Icon.jsx';
import { toast } from '@bgio/ui/components/Toaster.jsx';
import SettingsSheet from '@bgio/ui/components/SettingsSheet.jsx';
import { useToastPlacement } from '@bgio/ui/components/Toaster.jsx';
import Card from './Card.jsx';
import Seat from './Seat.jsx';
import OrderBar from './OrderBar.jsx';
import { trickMoment } from './moments.js';
import Confetti from '@bgio/ui/components/Confetti.jsx';
import Hand from './Hand.jsx';
import TrickArea, { ChienReveal } from './TrickArea.jsx';
import { BidPanel, CallPanel, ChelemPanel, DiscardPanel, PoigneeOffer, poigneeCards } from './Panels.jsx';
import { DealBreakdown, ScoreTable } from './ScoreSheet.jsx';
import RoundSummary, { RoundSummaryActions } from './RoundSummary.jsx';
import Direction from './Direction.jsx';
import RulesSheet from './RulesSheet.jsx';
import { CONTRACT_LABELS, POIGNEE_LABELS, REDEAL_REASONS, cardLabel, playErrorText } from './i18n.js';
import './table.css';

// Other players around the table, in play order, starting on my right (play goes counter-clockwise).
const SEAT_LAYOUT = {
  3: [{ x: 86, y: 30 }, { x: 14, y: 30 }],
  4: [{ x: 89, y: 46 }, { x: 50, y: 16 }, { x: 11, y: 46 }],
  5: [{ x: 89, y: 52 }, { x: 70, y: 16 }, { x: 30, y: 16 }, { x: 11, y: 52 }],
};

const fmtPts = (half) => (half % 2 ? `${(half - 1) / 2},5` : String(half / 2));

export default function Game({ room, readOnly = false, onExitBoard }) {
  const navigate = useNavigate();
  const me = useApp((s) => s.session?.playerId);
  const v = room.game;
  const turn = room.turn;
  const finePointer = useMediaQuery('(pointer: fine)');
  const isHost = room.hostId === me;
  const [sheet, setSheet] = useState(null); // 'menu' | 'rules' | 'scores' | 'leave' | 'lastTrick'
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState([]);
  const [chelem, setChelem] = useState(false);
  const [poignee, setPoignee] = useState(null);
  const [scoringOpen, setScoringOpen] = useState(false);
  const [moment, setMoment] = useState(null); // remarkable move banner
  const [spotlight, setSpotlight] = useState(null); // player whose trick card is hovered
  // The bottom-left corner is my seat and my hand: notifications go to the top here.
  useToastPlacement('top');

  const nickname = (id) => room.players.find((p) => p.id === id)?.nickname ?? v.players.find((p) => p.id === id)?.nickname ?? '—';
  const nameOf = (id) => (id === me ? 'Vous' : nickname(id));
  const players = v.players.map((p, i) => ({ ...p, ...room.players.find((rp) => rp.id === p.id), score: p.score, index: i }));

  // Seats: me at the bottom, then the others in play order.
  const myIndex = Math.max(0, players.findIndex((p) => p.id === me));
  const order = players.map((_, i) => players[(myIndex + i) % players.length]);
  const others = order.slice(1);
  const layout = SEAT_LAYOUT[v.n];
  const vectors = useMemo(() => {
    const out = { [order[0].id]: { x: 0, y: 1 } };
    others.forEach((p, i) => {
      const pos = layout[i];
      const dx = (pos.x - 50) / 50;
      const dy = (pos.y - 50) / 50;
      const len = Math.max(Math.abs(dx), Math.abs(dy)) || 1;
      out[p.id] = { x: dx / len, y: dy / len };
    });
    return out;
  }, [v.n, order[0].id]); // eslint-disable-line react-hooks/exhaustive-deps

  const myTurn = !readOnly && turn?.playerId === me && !turn?.paused;

  // Camps as far as I can know them: at 5 players the partner stays unknown until the called card falls.
  const teamOf = (id) => {
    if (!v.takerId) return null;
    if (id === v.takerId || (v.partnerId && id === v.partnerId)) return 'attack';
    if (v.n < 5 || v.partnerId) return 'defense';
    if (v.iAmPartner) return id === me ? 'attack' : 'defense';
    if (id === me) return 'defense';
    return 'unknown';
  };
  const myTeam = teamOf(me);
  const playersById = Object.fromEntries(players.map((p) => [p.id, p]));
  const hand = v.myHand ?? [];
  const isTaker = v.takerId === me;
  const trickCards = v.trick?.cards.map((c) => c.card) ?? [];

  // ---- actions ----------------------------------------------------------------
  const act = async (action) => {
    setBusy(true);
    try {
      await sendAction(room.id, action);
      return true;
    } catch (e) {
      sound('error');
      haptic('error');
      toast({ title: errorMessage(e.code, e.details), tone: 'error' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const hostPaused = !!turn?.pausedByHost;
  const togglePause = async () => {
    try {
      await call(hostPaused ? 'room:resume' : 'room:pause', { roomId: room.id });
      haptic('light');
    } catch (e) {
      toast({ title: errorMessage(e.code, e.details), tone: 'error' });
    }
  };

  const play = (card) => {
    const level = poignee && v.poigneeOptions.includes(poignee) ? poignee : null;
    sound('place');
    haptic('light');
    act({ type: 'play', card, ...(level ? { poignee: { level, cards: poigneeCards(hand, v.n, level) } } : {}) });
    setPoignee(null);
  };

  const refuse = (card) => {
    haptic('error');
    if (v.phase === 'discard') {
      toast({ title: isKing(card) ? 'Un roi ne va pas à l’écart.' : isBout(card) ? 'Un bout ne va pas à l’écart.' : 'Un atout ne va à l’écart que si vous n’avez pas d’autre choix.', tone: 'error' });
      return;
    }
    if (!myTurn) { toast({ title: 'Ce n’est pas encore à vous de jouer.' }); return; }
    const err = playError(hand, trickCards, card, { calledCard: v.calledCard, firstTrick: v.trickNumber === 1 });
    toast({ title: playErrorText(err), tone: 'error' });
  };

  // Discard: kings and bouts are locked; trumps too unless the hand forces them.
  const discarding = v.phase === 'discard' && isTaker && !readOnly;
  const plainCount = hand.filter((c) => !isTrump(c) && !isKing(c) && c !== EXCUSE).length;
  const locked = discarding ? hand.filter((c) => isKing(c) || isBout(c) || (isTrump(c) && plainCount >= v.chienSize)) : [];
  useEffect(() => { setSelected([]); setChelem(false); }, [v.phase, v.donneNumber]);
  useEffect(() => { if (!v.poigneeOptions?.length) setPoignee(null); }, [v.poigneeOptions?.length]);

  // ---- reacting to the table -----------------------------------------------------
  const prev = useRef(v);
  useEffect(() => {
    const before = prev.current;
    prev.current = v;
    if (!before || before === v) return;
    if (v.notice && v.notice.seq !== before.notice?.seq) toast({ title: REDEAL_REASONS[v.notice.reason] ?? 'Nouvelle donne.' });
    // Cards played by the others make a sound as they land.
    const was = before.trick?.cards.length ?? 0;
    const now = v.trick?.cards.length ?? 0;
    if (now > was && v.trick.cards[now - 1].playerId !== me) sound('place');
    if (v.tricks.length > before.tricks.length) {
      const t = v.tricks[v.tricks.length - 1];
      if (t.winnerId === me) sound('pick');
      const m = trickMoment(t, { teamOf, nameOf, last: v.phase === 'scoring', calledCard: before.partnerId ? null : v.calledCard, takerId: v.takerId });
      if (m) {
        setMoment({ ...m, key: `${v.donneNumber}-${v.tricks.length}` });
        sound(m.big ? 'bingo' : 'success');
        haptic('success');
      }
    }
    if (v.phase === 'scoring' && before.phase !== 'scoring' && v.result?.slamBy) {
      setMoment({ id: 'chelem', title: 'Chelem !', subtitle: v.result.slamBy === 'attack' ? 'L’attaque remporte tous les plis' : 'La défense remporte tous les plis', big: true, key: `slam-${v.donneNumber}` });
    }
    if (v.contract && !before.contract) toast({ title: `${nameOf(v.takerId)} ${v.takerId === me ? 'prenez' : 'prend'} : ${CONTRACT_LABELS[v.contract]}` });
    if (v.calledCard && !before.calledCard) toast({ title: `${nameOf(v.takerId)} ${v.takerId === me ? 'appelez' : 'appelle'} ${cardLabel(v.calledCard)}`, description: v.iAmPartner ? 'C’est vous ! Gardez le secret.' : undefined });
    if (v.poignees.length > before.poignees.length) {
      const p = v.poignees[v.poignees.length - 1];
      if (p.playerId !== me) toast({ title: `${nameOf(p.playerId)} annonce une ${POIGNEE_LABELS[p.level].toLowerCase()}`, description: p.cards.map((c) => (c === EXCUSE ? 'Excuse' : c.slice(1))).join(' · ') });
    }
    if (v.shownDiscard.length && !before.shownDiscard.length && !isTaker) toast({ title: 'Atouts mis à l’écart', description: v.shownDiscard.map((c) => c.slice(1)).join(' · ') });
    if (v.phase === 'scoring' && before.phase !== 'scoring') {
      const mine = v.result.deltas[me] ?? 0;
      sound(mine >= 0 ? 'success' : 'error');
    }
  }, [v]); // eslint-disable-line react-hooks/exhaustive-deps

  const prevTurn = useRef(turn?.playerId);
  useEffect(() => {
    if (turn?.playerId === me && prevTurn.current !== me && !readOnly) { sound('turn'); haptic('turn'); }
    prevTurn.current = turn?.playerId;
  }, [turn?.playerId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!moment) return undefined;
    const t = setTimeout(() => setMoment(null), moment.big ? 2600 : 1900);
    return () => clearTimeout(t);
  }, [moment]);

  // The score sheet opens once the last trick has been seen.
  // (a little later when a banner is celebrating the last trick)
  useEffect(() => {
    if (v.phase !== 'scoring') { setScoringOpen(false); return undefined; }
    const t = setTimeout(() => setScoringOpen(true), 2400);
    return () => clearTimeout(t);
  }, [v.phase, v.donneNumber]);

  // ---- what is on the table -------------------------------------------------------
  const trickDisplay = v.trick?.cards.length
    ? { key: `t${v.trickNumber}`, cards: v.trick.cards }
    : v.lastTrick && (v.trickPause || v.phase === 'scoring')
      ? { key: `t${v.tricks.length}`, cards: v.lastTrick.cards, winnerId: v.lastTrick.winnerId }
      : null;
  const showChien = ['bidding', 'calling', 'discard'].includes(v.phase) || (v.phase === 'chelem');
  const chienFaceUp = v.phase === 'discard' && !!v.chien;

  const turnName = turn?.playerId ? nameOf(turn.playerId) : null;

  // Speaking / playing order for the round in progress.
  const seq = (startId) => {
    const s = players.findIndex((p) => p.id === startId);
    return players.map((_, i) => players[(s + i) % players.length].id);
  };
  let order2 = null;
  if (v.phase === 'bidding') {
    const first = players[(players.findIndex((p) => p.id === v.dealerId) + 1) % players.length].id;
    order2 = { label: 'Enchères', sequence: seq(first), doneIds: v.bids.map((b) => b.playerId), currentId: turn?.playerId };
  } else if (v.phase === 'playing' && v.trick) {
    const showing = v.trick.cards.length ? v.trick : (v.trickPause ? v.lastTrick : v.trick);
    order2 = { label: `Pli ${v.trickPause ? v.tricks.length : v.trickNumber}`, sequence: seq(showing.leaderId), doneIds: showing.cards.map((c) => c.playerId), currentId: turn?.playerId };
  }

  let headline = null;
  if (v.phase === 'bidding') headline = 'Enchères';
  else if (v.contract) headline = `${CONTRACT_LABELS[v.contract]} · ${nameOf(v.takerId)}`;

  return (
    <div className="tarot">
      <header className="tarot__bar">
        <div className="tarot__bar-side">
          <IconButton icon="settings" label="Réglages" onClick={() => setSheet('menu')} className="tarot__icon" />
          {/* Deal info as a compact pill, not a full line: the table gets the room. */}
          <div className="t-deal" title={v.calledCard ? `Appel : ${cardLabel(v.calledCard)}` : undefined}>
            <span className="t-deal__n tabular">{v.donneNumber}{v.settings.donnes ? `/${v.settings.donnes}` : ''}</span>
            {headline && <span className="t-deal__what">{headline}</span>}
            {v.calledCard && <span className="t-deal__called">{cardLabel(v.calledCard).replace(/^Roi/, 'R').replace(/^Dame/, 'D')}</span>}
            {v.chelemAnnounced && <span className="t-deal__called">Chelem</span>}
          </div>
        </div>
        <div className="tarot__bar-centre">
          {order2 && <OrderBar {...order2} me={me} playersById={playersById} />}
        </div>
        <div className="tarot__bar-side is-right">
          {v.counting && (
            <span className="tarot__count tabular" title="Points remportés par l’attaque dans cette donne / points nécessaires">
              <span className="tarot__count-label">Att.</span> {fmtPts(v.counting.attackHalfPoints)}/{v.counting.needed}
            </span>
          )}
          {v.phase === 'playing' && v.chien && (
            <IconButton icon="cards" label="Revoir le chien" onClick={() => setSheet('chien')} className="tarot__icon" />
          )}
          {isHost && !readOnly && v.status === 'playing' && (
            <IconButton icon={hostPaused ? 'play' : 'pause'} label={hostPaused ? 'Reprendre la partie' : 'Mettre en pause'} onClick={togglePause} className="tarot__icon" />
          )}
          <IconButton icon="history" label="Feuille de score" onClick={() => setSheet('scores')} className="tarot__icon tarot__icon--wide" />
        </div>
      </header>

      <div className={`tarot__table seats-${v.n}`}>
        {others.map((p, i) => (
          <Seat
            key={p.id}
            player={p}
            view={v}
            turn={turn}
            index={p.index}
            team={teamOf(p.id)}
            inward={layout[i].y < 30
              ? { x: layout[i].x > 55 ? -1 : 1, y: 0, side: true }
              : { x: -vectors[p.id].x, y: -vectors[p.id].y }}
            style={{ left: `clamp(var(--seat-half), ${layout[i].x}%, calc(100% - var(--seat-half)))`, top: `max(var(--seat-half-h), ${layout[i].y}%)` }}
            bubbleBelow={layout[i].y < 25}
            spotlight={spotlight === p.id}
            compact
          />
        ))}

        <div className="tarot__center">
          <Direction />
          {showChien && <ChienReveal cards={v.chien} size={v.chienSize} faceUp={chienFaceUp} />}
          {(v.phase === 'playing' || v.phase === 'scoring') && <TrickArea trick={trickDisplay} vectors={vectors} nameOf={nameOf} onSpotlight={setSpotlight} />}
        </div>

        {v.lastTrick && v.phase === 'playing' && (
          <button type="button" className="tarot__last" onClick={() => setSheet('lastTrick')}>Dernier pli</button>
        )}
      </div>

      <div className="tarot__dock">
        <div className="tarot__me">
          <Seat player={order[0]} view={v} turn={turn} index={order[0].index} isMe={order[0].id === me} team={myTeam} spotlight={spotlight === me} compact />
          {myTeam && (
            <span className={`t-camp team-${myTeam}`}>{myTeam === 'attack' ? 'Vous attaquez' : 'Vous défendez'}</span>
          )}
        </div>

        <div className="tarot__action">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`${v.phase}-${myTurn}-${v.donneNumber}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
              transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            >
              {readOnly ? (
                <div className="t-wait"><Button variant="primary" icon="back" onClick={onExitBoard}>Retour aux résultats</Button></div>
              ) : v.phase === 'bidding' && myTurn ? (
                <BidPanel highestBid={v.highestBid} onBid={(bid) => act({ type: 'bid', bid })} busy={busy} />
              ) : v.phase === 'calling' && myTurn ? (
                <CallPanel callable={v.callable} hand={hand} onCall={(card) => act({ type: 'call', card })} busy={busy} />
              ) : discarding ? (
                <DiscardPanel hand={hand} selected={selected} count={v.chienSize} chelem={chelem} onChelem={setChelem} busy={busy} onConfirm={() => act({ type: 'discard', cards: selected, chelem })} />
              ) : v.phase === 'chelem' && myTurn ? (
                <ChelemPanel onDecide={(announce) => act({ type: 'chelem', announce })} busy={busy} />
              ) : v.phase === 'scoring' ? (
                <div className="t-wait">
                  <Button variant="primary" onClick={() => setScoringOpen(true)}>{v.ready.includes(me) ? 'Résumé de la donne' : 'Voir le résumé et continuer'}</Button>
                </div>
              ) : v.phase === 'playing' && myTurn ? (
                <div className="t-your-turn">
                  <p className="t-your-turn__line">
                    <strong>À vous</strong>
                    <span>{finePointer ? 'Cliquez une carte lumineuse' : 'Touchez 2 fois une carte, ou glissez-la ↑'}</span>
                  </p>
                  {v.poigneeOptions.length > 0 && <PoigneeOffer options={v.poigneeOptions} n={v.n} value={poignee} onChange={setPoignee} />}
                </div>
              ) : (
                <div className="t-wait">
                  <span className="t-dots" aria-hidden><i /><i /><i /></span>
                  {v.chienPause ? `Le chien est retourné : ${nameOf(v.takerId)} va faire son écart…` : turnName ? `${turnName} ${v.phase === 'bidding' ? 'réfléchit à son enchère' : v.phase === 'calling' ? 'appelle un roi' : v.phase === 'discard' ? 'fait son écart' : v.phase === 'chelem' ? 'réfléchit' : 'joue'}…` : 'Le pli se termine…'}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <Hand
          cards={hand}
          mode={discarding ? 'discard' : v.phase === 'playing' && !readOnly ? 'play' : 'view'}
          playable={myTurn ? (v.legal ?? []) : []}
          selected={selected}
          fresh={discarding ? (v.chien ?? []) : []}
          locked={locked}
          finePointer={finePointer}
          onPlay={play}
          onRefuse={refuse}
          onToggle={(card) => {
            sound('pick');
            setSelected((s) => (s.includes(card) ? s.filter((c) => c !== card) : s.length < v.chienSize ? [...s, card] : s));
          }}
        />
      </div>

      <AnimatePresence>
        {hostPaused && (
          <motion.div className="t-paused" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="status">
            <motion.div className="t-paused__card" initial={{ scale: 0.92, y: 10 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', bounce: 0.3, duration: 0.45 }}>
              <strong>Partie en pause</strong>
              <span className="t-paused__text">{isHost ? 'Les chronos et les robots sont arrêtés.' : `${nickname(room.hostId)} a mis la partie en pause.`}</span>
              {isHost && (
                <button type="button" className="t-paused__resume" onClick={togglePause} autoFocus>
                  <Icon name="play" size={18} strokeWidth={2.4} />
                  Reprendre
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {moment && (
          <motion.div
            key={moment.key}
            className={`t-moment ${moment.big ? 'is-big' : ''}`}
            initial={{ opacity: 0, scale: 0.7, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.2 } }}
            transition={{ type: 'spring', bounce: 0.45, duration: 0.55 }}
            role="status"
          >
            {moment.big && <Confetti duration={2200} count={80} />}
            <strong>{moment.title}</strong>
            {moment.subtitle && <span>{moment.subtitle}</span>}
          </motion.div>
        )}
      </AnimatePresence>

      <Sheet open={sheet === 'chien'} onClose={() => setSheet(null)} title="Le chien">
        <div className="t-lasttrick">
          {(v.chien ?? []).map((card) => <div key={card} className="t-lasttrick__card"><Card card={card} /></div>)}
        </div>
        {v.shownDiscard.length > 0 && (
          <>
            <p className="sheet-lead" style={{ marginTop: 16 }}>Atouts mis à l’écart par le preneur :</p>
            <div className="t-lasttrick">
              {v.shownDiscard.map((card) => <div key={card} className="t-lasttrick__card"><Card card={card} /></div>)}
            </div>
          </>
        )}
      </Sheet>

      {/* ---- sheets ---- */}
      <Sheet
        open={scoringOpen && v.phase === 'scoring' && !readOnly}
        onClose={() => setScoringOpen(false)}
        title={v.lastDeal ? `Dernière donne · ${v.donneNumber}` : `Fin de la donne ${v.donneNumber}`}
        size="lg"
        footer={(
          <RoundSummaryActions
            view={v}
            me={me}
            busy={busy}
            canStop={isHost && v.settings.donnes === 0}
            onStop={() => act({ type: 'stop' })}
            onReady={() => act({ type: 'ready' })}
          />
        )}
      >
        {v.history.length > 0 && (
          <RoundSummary view={v} entry={v.history[v.history.length - 1]} me={me} nameOf={nameOf} playersById={playersById} />
        )}
      </Sheet>

      <Sheet open={sheet === 'scores'} onClose={() => setSheet(null)} title="Feuille de score" size="lg">
        <ScoreTable history={v.history} players={players} nameOf={nameOf} />
        {v.history.length > 0 && (
          <details className="t-details">
            <summary>Détail de la dernière donne</summary>
            <DealBreakdown entry={v.history[v.history.length - 1]} nameOf={nameOf} />
          </details>
        )}
      </Sheet>

      <Sheet open={sheet === 'lastTrick'} onClose={() => setSheet(null)} title="Dernier pli">
        {v.lastTrick && (
          <div className="t-lasttrick">
            {v.lastTrick.cards.map(({ playerId, card }) => (
              <figure key={card} className={v.lastTrick.winnerId === playerId ? 'is-winner' : ''}>
                <div className="t-lasttrick__card"><Card card={card} /></div>
                <figcaption>{nameOf(playerId)}</figcaption>
              </figure>
            ))}
          </div>
        )}
      </Sheet>

      <SettingsSheet open={sheet === 'menu'} onClose={() => setSheet(null)}>
        <div className="settings__group">
          <span className="eyebrow">Partie · salon {room.id}</span>
          <Button variant="secondary" icon="book" onClick={() => setSheet('rules')}>Règles du Tarot</Button>
          <Button variant="secondary" icon="history" onClick={() => setSheet('scores')}>Feuille de score</Button>
          {isHost && !readOnly && v.status === 'playing' && (
            <Button variant="secondary" icon={hostPaused ? 'play' : 'pause'} onClick={() => { setSheet(null); togglePause(); }}>
              {hostPaused ? 'Reprendre la partie' : 'Mettre la partie en pause'}
            </Button>
          )}
          {readOnly
            ? <Button variant="secondary" icon="back" onClick={() => { setSheet(null); onExitBoard?.(); }}>Retour aux résultats</Button>
            : <Button variant="danger" icon="logout" onClick={() => setSheet('leave')}>Quitter la partie</Button>}
        </div>
      </SettingsSheet>
      <RulesSheet open={sheet === 'rules'} onClose={() => setSheet('menu')} />
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
        <p className="sheet-lead">Votre place est gardée : vous pourrez revenir depuis l’accueil. En votre absence, vos décisions seront prises automatiquement.</p>
      </Sheet>
    </div>
  );
}
