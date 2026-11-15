import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useApp, serverNow } from '@bgio/ui/lib/store.js';
import { act as sendAction, call } from '@bgio/ui/lib/socket.js';
import { errorMessage } from '@bgio/ui/lib/i18n.js';
import { haptic, sound } from '@bgio/ui/lib/feedback.js';
import { useMediaQuery } from '@bgio/ui/lib/useMediaQuery.js';
import { Button, IconButton, Sheet } from '@bgio/ui/components/ui.jsx';
import Icon from '@bgio/ui/components/Icon.jsx';
import { toast, useToastPlacement } from '@bgio/ui/components/Toaster.jsx';
import SettingsSheet from '@bgio/ui/components/SettingsSheet.jsx';
import Board from './Board.jsx';
import Disc from './Disc.jsx';
import RulesSheet from './RulesSheet.jsx';
import './p4.css';
import './game.css';

/** Time left for the current move, as a draining brass bar (CSS animation, no re-render). */
function TurnTimer({ turn }) {
  const [elapsed] = useState(() => (turn?.endsAt ? Math.max(0, turn.durationMs - Math.max(0, turn.endsAt - serverNow())) : 0));
  if (!turn?.endsAt || !turn.durationMs) return null;
  return (
    <span className="p4-timer" aria-hidden>
      <span style={{ animationDuration: `${turn.durationMs}ms`, animationDelay: `-${elapsed}ms` }} />
    </span>
  );
}

/** Same timing as the drop animation in Board.jsx: when the disc hits the bottom. */
const landingMs = (rows, row) => (0.32 + Math.sqrt(rows - row) * 0.12) * 0.55 * 1000;

export default function Game({ room, readOnly = false, onExitBoard }) {
  const navigate = useNavigate();
  const me = useApp((s) => s.session?.playerId);
  const v = room.game;
  const turn = room.turn;
  const finePointer = useMediaQuery('(pointer: fine)');
  const isHost = room.hostId === me;
  const [sheet, setSheet] = useState(null);
  const [armed, setArmed] = useState(null);
  const [busy, setBusy] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [banner, setBanner] = useState(null);
  useToastPlacement('top');

  const players = v.players.map((p) => ({ ...p, ...room.players.find((rp) => rp.id === p.id), nickname: room.players.find((rp) => rp.id === p.id)?.nickname ?? p.nickname }));
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  const nameOf = (id) => (id === me ? 'Vous' : byId[id]?.nickname ?? '—');
  const hostPaused = !!turn?.pausedByHost;
  const playing = !readOnly && room.status === 'playing';
  const myTurn = playing && v.phase === 'playing' && v.turn === me && !hostPaused;
  const mover = byId[v.turn];

  // ---- reacting to the table ----------------------------------------------------
  const prev = useRef(v);
  useEffect(() => {
    const before = prev.current;
    prev.current = v;
    if (before === v) return undefined;
    const timers = [];
    // A disc was dropped: it knocks on the wood when it lands.
    if (v.roundNumber === before.roundNumber && v.moveCount > before.moveCount && v.lastMove) {
      const row = Math.floor(v.lastMove.cell / v.cols);
      timers.push(setTimeout(() => { sound('place'); if (v.lastMove.playerId === me) haptic('light'); }, landingMs(v.rows, row)));
    }
    // The round ends: the line shines, a banner, then the discs drop out.
    if (v.phase === 'roundOver' && before.phase !== 'roundOver') {
      const won = v.roundWinnerId === me;
      const lost = v.roundWinnerId && !won;
      timers.push(setTimeout(() => {
        sound(won ? 'bingo' : lost ? 'error' : 'back');
        haptic(won ? 'success' : lost ? 'error' : 'light');
        setBanner({
          key: v.roundNumber,
          seat: v.roundWinnerId ? byId[v.roundWinnerId]?.seat : null,
          title: v.draw ? 'Manche nulle' : won ? 'Vous gagnez la manche !' : `${nameOf(v.roundWinnerId)} gagne la manche`,
          subtitle: v.draw ? 'Le plateau est plein.' : players.map((p) => `${p.id === me ? 'Vous' : p.nickname} ${v.players.find((x) => x.id === p.id).score}`).join(' · '),
        });
      }, 450));
      timers.push(setTimeout(() => setClearing(true), 2300));
    }
    if (v.roundNumber !== before.roundNumber) { setClearing(false); setBanner(null); }
    return () => timers.forEach(clearTimeout);
  }, [v]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!banner) return undefined;
    const t = setTimeout(() => setBanner(null), 1800);
    return () => clearTimeout(t);
  }, [banner]);

  // My turn: a sound; the armed column is only valid during my turn.
  const wasMyTurn = useRef(myTurn);
  useEffect(() => {
    if (myTurn && !wasMyTurn.current) { sound('turn'); haptic('turn'); }
    if (!myTurn) setArmed(null);
    wasMyTurn.current = myTurn;
  }, [myTurn]);

  const dropDisc = async (col) => {
    if (!myTurn || busy) return;
    // Touch: a first tap chooses the column, a second one drops the disc.
    if (!finePointer && armed !== col) { setArmed(col); sound('pick'); haptic('light'); return; }
    setArmed(null);
    setBusy(true);
    try {
      await sendAction(room.id, { type: 'drop', col });
    } catch (e) {
      sound('error');
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

  // ---- status line under the board ------------------------------------------------
  let status;
  if (readOnly) status = 'Partie terminée.';
  else if (v.phase === 'roundOver') status = v.draw ? 'Manche nulle.' : `${nameOf(v.roundWinnerId)} ${v.roundWinnerId === me ? 'gagnez' : 'gagne'} la manche.`;
  else if (hostPaused) status = 'Partie en pause.';
  else if (myTurn) status = finePointer ? 'À vous : choisissez une colonne.' : armed != null ? 'Touchez encore la colonne pour lâcher le jeton.' : 'À vous : touchez une colonne.';
  else status = mover ? `${mover.nickname} réfléchit…` : '';

  return (
    <div className="p4-table p4-game">
      <header className="p4-bar">
        <IconButton icon="settings" label="Réglages" onClick={() => setSheet('menu')} className="p4-icon" />
        <div className="p4-bar__title">
          <span className="p4-bar__name">P4IO</span>
          <span className="p4-bar__chip">Manche {v.roundNumber}</span>
          <span className="p4-bar__sub">{v.target > 1 ? `${v.target} manches gagnantes` : 'Manche unique'}</span>
        </div>
        <div className="p4-bar__side">
          {isHost && playing && (
            <IconButton icon={hostPaused ? 'play' : 'pause'} label={hostPaused ? 'Reprendre la partie' : 'Mettre en pause'} onClick={togglePause} className="p4-icon" />
          )}
          <IconButton icon="book" label="Règles" onClick={() => setSheet('rules')} className="p4-icon" />
        </div>
      </header>

      {/* players: disc, name, rounds won; the one to move is set in brass */}
      <ol className="p4-players">
        {players.map((p) => {
          const active = v.phase === 'playing' && v.turn === p.id;
          return (
            <li key={p.id} className={`p4-player ${active ? 'is-turn' : ''} ${p.id === me ? 'is-me' : ''} ${p.connected === false && !p.isBot ? 'is-away' : ''}`}>
              <Disc seat={p.seat} />
              <span className="p4-player__name">{p.id === me ? 'Vous' : p.nickname}</span>
              <span className="p4-player__wins" aria-label={`${p.score} manche${p.score > 1 ? 's' : ''} gagnée${p.score > 1 ? 's' : ''}`}>
                {v.target > 1
                  ? Array.from({ length: v.target }, (_, i) => <i key={i} className={i < p.score ? 'is-won' : ''} />)
                  : <b className="tabular">{p.score}</b>}
              </span>
              {active && playing && <TurnTimer key={`${turn?.key}-${turn?.endsAt}`} turn={turn} />}
            </li>
          );
        })}
      </ol>

      <main className="p4-stage">
        <Board
          cols={v.cols}
          rows={v.rows}
          board={v.board}
          line={v.line}
          clearing={clearing}
          ghostSeat={myTurn ? v.mySeat : null}
          playable={myTurn ? v.legal : []}
          armed={finePointer ? null : armed}
          onDrop={myTurn ? dropDisc : undefined}
        />
      </main>

      <footer className="p4-status" aria-live="polite">
        <span>{status}</span>
        {!finePointer && myTurn && armed != null && (
          <button type="button" className="p4-drop-btn" onClick={() => dropDisc(armed)} disabled={busy}>Lâcher</button>
        )}
      </footer>

      <AnimatePresence>
        {banner && (
          <motion.div
            key={banner.key}
            className="p4-banner"
            initial={{ opacity: 0, scale: 0.7, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.2 } }}
            transition={{ type: 'spring', bounce: 0.45, duration: 0.55 }}
            role="status"
          >
            {banner.seat != null && <Disc seat={banner.seat} />}
            <strong>{banner.title}</strong>
            <span>{banner.subtitle}</span>
          </motion.div>
        )}
        {hostPaused && playing && (
          <motion.div key="pause" className="p4-paused" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="status">
            <motion.div className="p4-paused__card" initial={{ scale: 0.92, y: 10 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', bounce: 0.3, duration: 0.45 }}>
              <strong>Partie en pause</strong>
              <span className="p4-paused__text">{isHost ? 'Les chronos et les robots sont arrêtés.' : `${nameOf(room.hostId)} a mis la partie en pause.`}</span>
              {isHost && (
                <button type="button" className="p4-brass-btn" onClick={togglePause} autoFocus>
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
          <Button variant="secondary" icon="book" onClick={() => setSheet('rules')}>Règles de P4IO</Button>
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
        <p className="sheet-lead">Votre place est gardée : vous pourrez revenir depuis l’accueil. En votre absence, vos coups seront joués automatiquement.</p>
      </Sheet>
    </div>
  );
}
