import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useApp, serverNow } from '@bgio/ui/lib/store.js';
import { act as sendAction, call } from '@bgio/ui/lib/socket.js';
import { errorMessage } from '@bgio/ui/lib/i18n.js';
import { haptic, sound } from '@bgio/ui/lib/feedback.js';
import { Avatar, Button, IconButton, Sheet, Spinner } from '@bgio/ui/components/ui.jsx';
import { toast, useToastPlacement } from '@bgio/ui/components/Toaster.jsx';
import SettingsSheet from '@bgio/ui/components/SettingsSheet.jsx';
import RulesSheet from './RulesSheet.jsx';
import { createScene, loadPhysics } from './world.js';
import { MODE_LABELS, REFUSALS, THING } from './i18n.js';
import './game.css';

/** Time left for the current move, as a draining bar (CSS animation, no re-render). */
function TurnTimer({ turn }) {
  const [elapsed] = useState(() => (turn?.endsAt ? Math.max(0, turn.durationMs - Math.max(0, turn.endsAt - serverNow())) : 0));
  if (!turn?.endsAt || !turn.durationMs) return null;
  return (
    <span className="pl-timer" aria-hidden>
      <span style={{ animationDuration: `${turn.durationMs}ms`, animationDelay: `-${elapsed}ms` }} />
    </span>
  );
}

const ORIENTATIONS = ['À plat', 'Sur chant', 'Debout'];
/** Refusals that only mean "the turn moved on while my message was on its way". */
const LATE = ['NOT_YOUR_TURN', 'WRONG_PHASE', 'GAME_OVER', 'NO_GAME', 'GAME_PAUSED'];

export default function Game({ room, readOnly = false, onExitBoard }) {
  const navigate = useNavigate();
  const me = useApp((s) => s.session?.playerId);
  const v = room.game;
  const turn = room.turn;
  const free = v.mode === 'free'; // free building: no turns, everybody simulates and acts at once
  const isHost = room.hostId === me;
  const [sheet, setSheet] = useState(null); // 'menu' | 'rules' | 'leave'
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [hint, setHint] = useState('idle'); // what my hands are doing: 'idle' | 'pull' | 'hand' | 'settle'
  const [stats, setStats] = useState({ height: 0, count: 0 });
  const [orient, setOrient] = useState(0);
  const [banner, setBanner] = useState(null);
  const [ball, setBall] = useState(false); // free building: a tap throws a ball
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  useToastPlacement('top');

  const players = v.players.map((p) => {
    const rp = room.players.find((x) => x.id === p.id);
    return { ...p, nickname: rp?.nickname ?? p.nickname ?? '—', connected: rp?.connected };
  });
  const nameOf = (id) => (id === me ? 'Vous' : players.find((p) => p.id === id)?.nickname ?? '—');
  const hostPaused = !!turn?.pausedByHost;
  const playing = !readOnly && room.status === 'playing';
  const acting = v.phase === 'move' || v.phase === 'settle';
  const myTurn = playing && acting && v.turn === me;
  // See world.js: who simulates the physics right now.
  const role = !playing ? 'watch' : free ? 'shared' : hostPaused ? 'idle' : myTurn ? 'actor' : v.phase === 'roundOver' ? 'free' : 'watch';

  // ---- talking to the server (always through refs: the scene keeps its callbacks for its whole life) ----
  const send = useRef(null);
  send.current = (action) => sendAction(room.id, action).catch((e) => {
    if (!LATE.includes(e.code)) toast({ title: errorMessage(e.code, e.details), tone: 'error' });
  });
  // Moving pieces are reported several times a second: never queue two reports.
  const reporting = useRef(false);
  const live = useRef(null);
  live.current = (rows) => {
    if (reporting.current) return;
    reporting.current = true;
    sendAction(room.id, { type: 'live', rows }).catch(() => {}).finally(() => { reporting.current = false; });
  };

  // ---- the 3D scene, created once ----
  useEffect(() => {
    let alive = true;
    let scene = null;
    loadPhysics().then((RAPIER) => {
      if (!alive) return;
      scene = createScene(canvasRef.current, RAPIER, v.mode, {
        live: (rows) => live.current(rows),
        take: (id) => { sound('pick'); haptic('light'); send.current({ type: 'live', removed: id }); },
        placed: (row) => {
          sound('place');
          haptic('light');
          if (v.mode !== 'free') { send.current({ type: 'placed', row }); return; }
          sendAction(room.id, { type: 'add', row }).catch((e) => {
            sceneRef.current?.remove(row[0]); // refused: it comes back off my table
            toast({ title: errorMessage(e.code, e.details), tone: 'error' });
          });
        },
        ball: (o, d) => { sound('pick'); send.current({ type: 'ball', o, d }); },
        state: (rows) => send.current({ type: 'state', rows }),
        settled: (rows) => send.current({ type: 'settled', rows }),
        fell: (rows) => send.current({ type: 'fell', rows }),
        hint: setHint,
        stats: (height, count) => setStats({ height, count }),
        refuse: (reason) => { haptic('error'); toast({ title: REFUSALS[reason] ?? 'Impossible ici.' }); },
      });
      sceneRef.current = scene;
      setLoaded(true);
    }).catch((e) => {
      console.error(e);
      if (alive) setFailed(true);
    });
    return () => { alive = false; scene?.dispose(); sceneRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- the scene follows the game ----
  const adopted = useRef(null); // the turn whose scene I took over as the actor
  const seenRound = useRef(null);
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (role === 'shared') {
      if (seenRound.current !== v.round) scene.adopt(v.blocks);
      else scene.merge(v.blocks);
      scene.setRole('shared');
      seenRound.current = v.round;
      return;
    }
    const turnKey = `${v.round}-${v.turnSeq}`;
    if (role === 'actor') {
      // My turn starts: my copy becomes the reference. After that I ignore the echoes of my own reports.
      if (adopted.current !== turnKey) {
        scene.adopt(v.blocks, { inHand: v.hand, settling: v.phase === 'settle' });
        adopted.current = turnKey;
      }
      scene.setRole('actor', v.phase === 'move');
    } else {
      if (role !== 'idle') adopted.current = null;
      if (seenRound.current !== v.round) scene.adopt(v.blocks); // a new table: no gliding
      else if (role === 'watch') scene.follow(v.blocks);
      scene.setRole(role);
    }
    seenRound.current = v.round;
  }, [loaded, role, v.rev, v.turnSeq, v.round, v.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { sceneRef.current?.setOrient(orient); }, [orient, loaded]);
  useEffect(() => { sceneRef.current?.setBall(ball); }, [ball, loaded]);

  // Free building: the balls thrown by the others (mine is already flying).
  const newestBall = v.balls?.at(-1)?.n ?? 0;
  const lastBall = useRef(newestBall);
  useEffect(() => {
    for (const b of v.balls ?? []) {
      if (b.n > lastBall.current && b.by !== me) sceneRef.current?.throwBall(b.o, b.d);
    }
    lastBall.current = newestBall;
  }, [newestBall]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- reacting to the table ----
  const wasMyTurn = useRef(false);
  useEffect(() => {
    if (myTurn && !wasMyTurn.current && !hostPaused) { sound('turn'); haptic('turn'); }
    wasMyTurn.current = myTurn;
  }, [myTurn, hostPaused]);

  const fallKey = v.lastFall ? `${v.lastFall.round}-${v.lastFall.playerId}` : null;
  useEffect(() => {
    if (!v.lastFall || readOnly) { setBanner(null); return undefined; }
    const mine = v.lastFall.playerId === me;
    sound(mine ? 'error' : 'success');
    haptic(mine ? 'error' : 'success');
    const who = nameOf(v.lastFall.playerId);
    setBanner({
      key: fallKey,
      title: v.lastFall.reason === 'timeout'
        ? `Temps écoulé pour ${mine ? 'vous' : who}`
        : `${who} ${mine ? 'avez' : 'a'} fait tomber ${THING[v.mode]}`,
      subtitle: v.round >= v.rounds ? 'C’était la dernière manche.' : 'Nouvelle manche dans un instant…',
    });
    const t = setTimeout(() => setBanner(null), 3200);
    return () => clearTimeout(t);
  }, [fallKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard: Space changes the orientation, R and T turn the piece; free building: B for the ball, Z to undo.
  const canPlace = free ? playing && loaded : myTurn && !hostPaused && v.phase === 'move' && (v.mode === 'build' || hint === 'hand');
  useEffect(() => {
    if (!canPlace || sheet) return undefined;
    const onKey = (e) => {
      if (e.target.closest?.('input, button, [role="dialog"]')) return;
      const k = e.key.toLowerCase();
      if (k === ' ' && v.mode !== 'tower') { e.preventDefault(); setOrient((o) => (o + 1) % 3); }
      else if (k === 'r') sceneRef.current?.rotate(Math.PI / 2);
      else if (k === 't') sceneRef.current?.rotate(Math.PI / 12);
      else if (k === 'b' && free) setBall((on) => !on);
      else if (k === 'z' && free) send.current({ type: 'undo' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canPlace, sheet, v.mode, free]);

  const togglePause = async () => {
    try {
      await call(hostPaused ? 'room:resume' : 'room:pause', { roomId: room.id });
      haptic('light');
    } catch (e) {
      toast({ title: errorMessage(e.code, e.details), tone: 'error' });
    }
  };

  // ---- status line under the table ----
  let status;
  if (failed) status = 'Le moteur physique n’a pas pu démarrer sur cet appareil.';
  else if (!loaded) status = 'Préparation de la table…';
  else if (readOnly) status = 'Partie terminée.';
  else if (hostPaused) status = 'Partie en pause.';
  else if (free) status = ball ? 'Boule : cliquez pour viser la construction.' : <><strong>Construction libre</strong> : cliquez pour poser une planchette.</>;
  else if (v.phase === 'roundOver') status = v.lastFall?.reason === 'timeout' ? 'Temps écoulé.' : 'Tout s’écroule…';
  else if (v.phase === 'settle') status = myTurn ? 'Pièce posée : on retient son souffle…' : `${nameOf(v.turn)} a posé sa pièce…`;
  else if (!myTurn) status = `${nameOf(v.turn)} joue…${v.hand ? ' Le bloc est sorti.' : ''}`;
  else if (v.mode === 'build') status = <><strong>À vous</strong> : posez une planchette sur la construction.</>;
  else if (hint === 'hand') status = <><strong>À vous</strong> : reposez le bloc au sommet de la tour.</>;
  else if (hint === 'pull') status = 'Tirez doucement…';
  else status = <><strong>À vous</strong> : attrapez un bloc et tirez-le hors de la tour.</>;

  return (
    <div className="pl-table pl-game">
      <header className="pl-bar">
        <IconButton icon="settings" label="Réglages" onClick={() => setSheet('menu')} className="pl-icon" />
        <div className="pl-bar__title">
          <span className="pl-bar__name">PlanchettesIO</span>
          <span className="pl-bar__chip tabular">{free ? `${stats.count} pièce${stats.count > 1 ? 's' : ''}` : `Manche ${v.round}/${v.rounds}`}</span>
          <span className="pl-bar__sub tabular">{MODE_LABELS[v.mode]} · {stats.height.toLocaleString('fr-FR')} cm</span>
        </div>
        <div className="pl-bar__side">
          {isHost && playing && !free && (
            <IconButton icon={hostPaused ? 'play' : 'pause'} label={hostPaused ? 'Reprendre la partie' : 'Mettre en pause'} onClick={togglePause} className="pl-icon" />
          )}
          <IconButton icon="book" label="Règles" onClick={() => setSheet('rules')} className="pl-icon" />
        </div>
      </header>

      {/* players: name, successful moves, one mark per round lost; the one to move is set in pine */}
      <ol className="pl-players">
        {players.map((p) => {
          const active = playing && acting && v.turn === p.id;
          return (
            <li key={p.id} className={`pl-player ${active ? 'is-turn' : ''} ${p.connected === false ? 'is-away' : ''}`}>
              <Avatar name={p.nickname} index={p.seat} size={26} online={p.connected !== false} />
              <span className="pl-player__name">{p.id === me ? 'Vous' : p.nickname}</span>
              <span className="pl-player__moves tabular" title={free ? 'Planchettes posées' : 'Coups réussis'}>{p.moves}</span>
              {!free && (
                <span className="pl-player__falls" aria-label={`${p.falls} chute${p.falls > 1 ? 's' : ''}`}>
                  {Array.from({ length: v.rounds }, (_, i) => <i key={i} className={i < p.falls ? 'is-fall' : ''} />)}
                </span>
              )}
              {active && v.phase === 'move' && !hostPaused && <TurnTimer key={`${turn?.key}-${turn?.endsAt}`} turn={turn} />}
            </li>
          );
        })}
      </ol>

      <main className="pl-stage">
        <canvas ref={canvasRef} className={`pl-canvas ${canPlace ? 'is-placing' : ''}`} aria-label={`Table de jeu : ${stats.count} pièces, ${stats.height.toLocaleString('fr-FR')} centimètres de haut`} />
        {!loaded && !failed && <div className="pl-loading"><Spinner size={28} /></div>}
      </main>

      <footer className="pl-dock">
        <div className="pl-status" aria-live="polite">{status}</div>
        {readOnly ? (
          <Button variant="primary" icon="back" onClick={onExitBoard}>Retour aux résultats</Button>
        ) : canPlace && (
          <div className="pl-tools">
            {v.mode !== 'tower' && ORIENTATIONS.map((label, i) => (
              <button key={label} type="button" className="pl-tool" aria-pressed={orient === i} onClick={() => setOrient(i)}>{label}</button>
            ))}
            {v.mode !== 'tower' && <span className="pl-tools__sep" aria-hidden />}
            <button type="button" className="pl-tool" onClick={() => sceneRef.current?.rotate(Math.PI / 2)}>Pivoter 90° <kbd>R</kbd></button>
            <button type="button" className="pl-tool" onClick={() => sceneRef.current?.rotate(Math.PI / 12)}>15° <kbd>T</kbd></button>
            {free && (
              <>
                <span className="pl-tools__sep" aria-hidden />
                <button type="button" className="pl-tool" aria-pressed={ball} onClick={() => setBall((on) => !on)}>Boule <kbd>B</kbd></button>
                <button type="button" className="pl-tool" disabled={!v.canUndo} onClick={() => send.current({ type: 'undo' })}>Annuler <kbd>Z</kbd></button>
              </>
            )}
          </div>
        )}
      </footer>

      <AnimatePresence>
        {banner && (
          <motion.div
            key={banner.key}
            className="pl-banner"
            initial={{ opacity: 0, scale: 0.7, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.2 } }}
            transition={{ type: 'spring', bounce: 0.45, duration: 0.55 }}
            role="status"
          >
            <strong>{banner.title}</strong>
            <span>{banner.subtitle}</span>
          </motion.div>
        )}
        {hostPaused && playing && (
          <motion.div key="pause" className="pl-paused" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="status">
            <motion.div className="pl-paused__card" initial={{ scale: 0.92, y: 10 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', bounce: 0.3, duration: 0.45 }}>
              <strong>Partie en pause</strong>
              <span className="pl-paused__text">{isHost ? 'Le chrono est arrêté et la table est figée.' : `${nameOf(room.hostId)} a mis la partie en pause.`}</span>
              {isHost && <Button variant="primary" icon="play" onClick={togglePause} autoFocus>Reprendre</Button>}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <SettingsSheet open={sheet === 'menu'} onClose={() => setSheet(null)}>
        <div className="settings__group">
          <span className="eyebrow">Partie · salon {room.id}</span>
          <Button variant="secondary" icon="book" onClick={() => setSheet('rules')}>Règles de PlanchettesIO</Button>
          <Button variant="secondary" icon="target" onClick={() => { setSheet(null); sceneRef.current?.resetCamera(); }}>Recentrer la vue</Button>
          {isHost && playing && free && (
            <>
              <Button variant="secondary" icon="recall" onClick={() => setSheet('clear')}>Tout effacer</Button>
              <Button variant="secondary" icon="trophy" onClick={() => setSheet('stop')}>Terminer la construction</Button>
            </>
          )}
          {isHost && playing && !free && (
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
        <p className="sheet-lead">Votre place est gardée : vous pourrez revenir depuis l’accueil. {free ? 'La construction continue sans vous.' : 'En votre absence, vos tours sont perdus au chrono.'}</p>
      </Sheet>
      <Sheet
        open={sheet === 'clear'}
        onClose={() => setSheet(null)}
        title="Tout effacer ?"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setSheet(null)}>Annuler</Button>
            <Button variant="danger" onClick={() => { setSheet(null); send.current({ type: 'clear' }); }}>Tout effacer</Button>
          </>
        )}
      >
        <p className="sheet-lead">Toutes les planchettes disparaissent de la table, pour tout le monde.</p>
      </Sheet>
      <Sheet
        open={sheet === 'stop'}
        onClose={() => setSheet(null)}
        title="Terminer la construction ?"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setSheet(null)}>Annuler</Button>
            <Button variant="primary" onClick={() => { setSheet(null); send.current({ type: 'stop' }); }}>Terminer</Button>
          </>
        )}
      >
        <p className="sheet-lead">La partie s’arrête pour tout le monde et le tableau des bâtisseurs s’affiche. Vous pourrez encore regarder la table.</p>
      </Sheet>
    </div>
  );
}
