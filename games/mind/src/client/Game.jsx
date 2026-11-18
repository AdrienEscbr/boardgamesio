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
import Board, { pinsDuration } from './Board.jsx';
import Composer from './Composer.jsx';
import Rack from './Rack.jsx';
import RulesSheet from './RulesSheet.jsx';
import { useDraft } from './useDraft.js';
import { MODE_LABELS } from './i18n.js';
import './mind.css';
import './game.css';

/** Time left, as a draining brass bar (CSS animation, no re-render). */
function TurnTimer({ turn, className = 'mi-timer' }) {
  const [elapsed] = useState(() => (turn?.endsAt ? Math.max(0, turn.durationMs - Math.max(0, turn.endsAt - serverNow())) : 0));
  if (!turn?.endsAt || !turn.durationMs) return null;
  return (
    <span className={className} aria-hidden>
      <span style={{ animationDuration: `${turn.durationMs}ms`, animationDelay: `-${elapsed}ms` }} />
    </span>
  );
}

/** Board width in holes (number, holes, key plate, paddings), for the sizing below. */
const boardUnits = (pegs) => 0.64 + 0.28 + 0.62 + pegs + (pegs - 1) * 0.12 + 0.44 + (pegs === 5 ? 1.22 : 0.84);
const COMPACT = 0.55;

export default function Game({ room, readOnly = false, onExitBoard }) {
  const navigate = useNavigate();
  const me = useApp((s) => s.session?.playerId);
  const v = room.game;
  const turn = room.turn;
  const isHost = room.hostId === me;
  const [sheet, setSheet] = useState(null);
  const [busy, setBusy] = useState(false);
  useToastPlacement('top');

  const players = v.players.map((p) => {
    const rp = room.players.find((x) => x.id === p.id);
    return { ...p, nickname: rp?.nickname ?? p.nickname ?? '—', connected: rp?.connected ?? true };
  });
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  const opp = players.find((p) => p.id !== me) ?? players[1];
  const meP = byId[me];
  const nameOf = (id) => (id === me ? 'Vous' : byId[id]?.nickname ?? '—');
  const hostPaused = !!turn?.pausedByHost;
  const playing = !readOnly && room.status === 'playing';
  const myTurn = playing && v.myTurn && !hostPaused;
  const over = v.phase === 'roundOver' || v.phase === 'over';
  const simultaneous = v.mode !== 'classic';

  const stepKey = `${v.roundNumber}-${v.phase}-${v.step}`;
  const d = useDraft(v.pegs, { colors: v.colors, duplicates: v.duplicates, resetKey: stepKey, enabled: myTurn && !busy });

  // ---- reacting to the table ----------------------------------------------------
  const prev = useRef(v);
  useEffect(() => {
    const before = prev.current;
    prev.current = v;
    if (before === v || before.roundNumber !== v.roundNumber) return undefined;
    const timers = [];
    // A step was resolved: my key pins tick in one by one.
    if (v.step > before.step) {
      const mine = v.boards[me] ?? v.boards[v.decoders[0]];
      const row = mine?.[mine.length - 1];
      if (row) for (let i = 0; i < row.black + row.white; i++) timers.push(setTimeout(() => sound('pin'), 250 + i * 180));
    }
    // The opponent locked a guess or a code while I am still thinking.
    const oppBefore = before.players.find((p) => p.id === opp.id);
    const oppNow = v.players.find((p) => p.id === opp.id);
    if (oppNow?.submitted && !oppBefore?.submitted && v.myTurn) sound('tick');
    // Every code is set: the shields close.
    if (v.phase === 'guess' && before.phase === 'compose') { sound('shield'); haptic('medium'); }
    // End of the round: the shields lift.
    if (v.phase === 'roundOver' && before.phase !== 'roundOver') {
      // Classic: the decoder is pleased to crack it, the coder that it held.
      const won = v.mode === 'classic' ? (v.coderId === me ? !v.cracked.length : v.cracked.includes(me)) : v.roundWinnerId === me;
      const lost = v.mode !== 'classic' && !!v.roundWinnerId && !won;
      timers.push(setTimeout(() => {
        sound('shield');
        sound(won ? 'success' : lost ? 'error' : 'back');
        haptic(won ? 'success' : lost ? 'error' : 'light');
      }, pinsDuration(v.pegs)));
    }
    return () => timers.forEach(clearTimeout);
  }, [v]); // eslint-disable-line react-hooks/exhaustive-deps

  // My move after a wait (classic mode, or a new round): a call.
  const wasMyTurn = useRef(myTurn);
  useEffect(() => {
    if (myTurn && !wasMyTurn.current && (v.mode === 'classic' || v.phase === 'compose')) { sound('turn'); haptic('turn'); }
    wasMyTurn.current = myTurn;
  }, [myTurn]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!myTurn || busy || !d.complete) return;
    setBusy(true);
    const type = v.phase === 'compose' ? 'compose' : 'guess';
    sound(type === 'compose' ? 'shield' : 'place');
    haptic('medium');
    try {
      await sendAction(room.id, { type, code: d.draft });
    } catch (e) {
      sound('error');
      toast({ title: errorMessage(e.code, e.details), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const submitRef = useRef(submit);
  submitRef.current = submit;
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Enter' && !e.target.closest?.('button, input, textarea')) submitRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const togglePause = async () => {
    try {
      await call(hostPaused ? 'room:resume' : 'room:pause', { roomId: room.id });
      haptic('light');
    } catch (e) {
      toast({ title: errorMessage(e.code, e.details), tone: 'error' });
    }
  };

  // ---- what to show ---------------------------------------------------------------
  const composing = v.phase === 'compose' && (v.mode === 'duel' || v.coderId === me);
  const secretStateFor = (decoder) => (over ? 'revealed' : v.secrets[decoder] ? 'known' : 'hidden');
  const oppState = (() => {
    if (!playing || over) return null;
    if (v.mode === 'classic') {
      if (v.awaiting.includes(opp.id)) return v.phase === 'compose' ? 'compose son code…' : 'cherche…';
      return v.coderId === opp.id ? 'codeur' : null;
    }
    if (opp.submitted) return 'a joué';
    return v.awaiting.includes(opp.id) ? (v.phase === 'compose' ? 'compose…' : 'cherche…') : null;
  })();
  const clock = turn?.endsAt && turn.durationMs >= 2000 && !over ? turn : null;

  let status;
  if (readOnly) status = 'Partie terminée.';
  else if (hostPaused) status = 'Partie en pause.';
  else if (over) status = roundVerdict(v, me, nameOf);
  else if (v.phase === 'compose') {
    if (myTurn) status = v.mode === 'duel' ? `Composez le code que ${opp.nickname} devra trouver.` : `Vous êtes codeur : composez le code de ${opp.nickname}.`;
    else if (v.mode === 'duel') status = `Code verrouillé · ${opp.nickname} compose le sien…`;
    else status = `${opp.nickname} compose le code que vous allez chercher…`;
  } else if (myTurn) status = simultaneous ? 'À vous : proposez un code (en même temps que votre adversaire).' : 'À vous : proposez un code.';
  else if (v.mySubmission) status = `Essai verrouillé · ${opp.nickname} termine le sien…`;
  else if (v.coderId === me) status = `${opp.nickname} cherche votre code…`;

  const units = boardUnits(v.pegs);
  const twoBoards = v.decoders.length > 1 && v.phase !== 'compose';
  const stageVars = {
    '--units-w': twoBoards ? units * (1 + COMPACT) + 1.2 : units,
    '--units-h': (v.maxGuesses + 1) * 1.22 + 1.1,
  };

  return (
    <div className="mi-table mi-game" data-colors={v.colors}>
      <header className="mi-bar">
        <IconButton icon="settings" label="Réglages" onClick={() => setSheet('menu')} className="mi-icon" />
        <div className="mi-bar__title">
          <span className="mi-bar__name">MindIO</span>
          <span className="mi-bar__chip">{MODE_LABELS[v.mode]}</span>
          <span className="mi-bar__sub">
            Manche {v.roundNumber}{v.totalRounds ? ` / ${v.totalRounds}` : ''}
            {v.phase === 'guess' && ` · essai ${Math.min(v.step + 1, v.maxGuesses)}/${v.maxGuesses}`}
          </span>
        </div>
        <div className="mi-bar__side">
          {isHost && playing && (
            <IconButton icon={hostPaused ? 'play' : 'pause'} label={hostPaused ? 'Reprendre la partie' : 'Mettre en pause'} onClick={togglePause} className="mi-icon" />
          )}
          <IconButton icon="book" label="Règles" onClick={() => setSheet('rules')} className="mi-icon" />
        </div>
      </header>

      {/* the two players and the score; the clock drains under them */}
      <div className="mi-duel">
        {[meP ?? players[0], opp].map((p, i) => (
          <div key={p.id} className={`mi-player ${i ? 'is-opp' : 'is-me'} ${p.connected === false && !p.isBot ? 'is-away' : ''} ${v.awaiting.includes(p.id) && !over ? 'is-active' : ''}`}>
            <Avatar name={p.nickname} index={p.seat} size={28} online={p.connected !== false} />
            <span className="mi-player__name">{p.id === me ? 'Vous' : p.nickname}</span>
          </div>
        ))}
        <div className="mi-duel__score" aria-label={`Score : vous ${meP?.score ?? 0}, ${opp.nickname} ${opp.score}`}>
          {v.mode === 'classic' ? (
            <><b>{meP?.score ?? 0}</b><small>pts</small><b>{opp.score}</b></>
          ) : (
            <>
              <Pips n={v.target} won={meP?.score ?? 0} />
              <small>–</small>
              <Pips n={v.target} won={opp.score} />
            </>
          )}
        </div>
        {clock && playing && !hostPaused && <TurnTimer key={`${clock.key}-${clock.endsAt}`} turn={clock} />}
      </div>

      <main className={`mi-stage ${composing ? 'is-compose' : ''}`} style={stageVars}>
        {composing ? (
          <Composer
            pegs={v.pegs}
            draft={d.draft}
            cursor={myTurn ? d.cursor : null}
            locked={myTurn ? null : v.secrets[opp.id]}
            onHoleClick={myTurn ? d.clickHole : undefined}
            title={v.mode === 'duel' ? 'Composez le code secret' : 'Vous êtes codeur'}
            subtitle={v.mode === 'duel'
              ? `${opp.nickname} devra le trouver en ${v.maxGuesses} essais au plus.`
              : `Chaque essai de ${opp.nickname} vous rapporte un point, plus un s’il ne trouve pas.`}
          />
        ) : (
          <div className={`mi-boards ${twoBoards ? '' : 'is-single'}`}>
            {orderDecoders(v.decoders, me).map((id) => {
              const mine = id === me;
              const compact = !mine && twoBoards;
              return (
                <div key={id} className={`mi-boards__slot ${mine ? 'is-mine' : 'is-opp'}`}>
                  <h2 className="mi-boards__title">
                    {mine ? 'Vous cherchez' : `${nameOf(id)} cherche`}
                    <span>{v.mode === 'race' ? 'le code du cabinet' : mine ? `le code de ${opp.nickname}` : 'votre code'}</span>
                  </h2>
                  <Board
                    pegs={v.pegs}
                    maxGuesses={v.maxGuesses}
                    rows={v.boards[id]}
                    draft={mine && myTurn ? d.draft : mine && v.mySubmission ? v.mySubmission : null}
                    cursor={mine && myTurn ? d.cursor : null}
                    waiting={mine && !!v.mySubmission}
                    secret={v.secrets[id]}
                    secretState={secretStateFor(id)}
                    cracked={v.cracked.includes(id)}
                    freshFrom={0}
                    compact={compact}
                    label={mine ? 'Votre tableau' : `Tableau de ${nameOf(id)}`}
                    onHoleClick={mine && myTurn ? d.clickHole : undefined}
                  />
                  {!mine && <OppChip state={oppState} />}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* the dock: the bead tray on my move, otherwise what is going on */}
      <footer className="mi-dock">
        {myTurn ? (
          <Rack
            colors={v.colors}
            used={d.used}
            duplicates={v.duplicates}
            disabled={busy}
            onPick={d.pick}
            onPlace={d.place}
            onErase={d.erase}
            canErase={d.used.length > 0}
            onSubmit={submit}
            canSubmit={d.complete}
            submitLabel={v.phase === 'compose' ? 'Verrouiller le code' : 'Valider l’essai'}
            hint={d.complete ? 'Prêt : validez (Entrée).' : !v.duplicates ? 'Doublons interdits : chaque couleur une seule fois.' : null}
          />
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={over ? `over-${v.roundNumber}` : status}
              className={`mi-verdict ${over ? 'is-over' : 'is-quiet'}`}
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1, transition: { delay: over ? pinsDuration(v.pegs) / 1000 : 0 } }}
              exit={{ y: 8, opacity: 0, transition: { duration: 0.12 } }}
              role="status"
              aria-live="polite"
            >
              <strong>{status}</strong>
              {over && playing && v.phase === 'roundOver' && <span className="mi-verdict__next">{matchEnds(v) ? 'Fin de partie…' : 'Manche suivante…'}</span>}
              {over && playing && turn?.endsAt && <TurnTimer key={`next-${turn.key}`} turn={turn} className="mi-timer mi-timer--verdict" />}
            </motion.div>
          </AnimatePresence>
        )}
      </footer>

      <AnimatePresence>
        {hostPaused && playing && (
          <motion.div key="pause" className="mi-paused" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="status">
            <motion.div className="mi-paused__card" initial={{ scale: 0.92, y: 10 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', bounce: 0.3, duration: 0.45 }}>
              <strong>Partie en pause</strong>
              <span className="mi-paused__text">{isHost ? 'Les chronos et les robots sont arrêtés.' : `${nameOf(room.hostId)} a mis la partie en pause.`}</span>
              {isHost && (
                <button type="button" className="mi-btn mi-btn--brass" onClick={togglePause} autoFocus>
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
          <Button variant="secondary" icon="book" onClick={() => setSheet('rules')}>Règles de MindIO</Button>
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
        <p className="sheet-lead">Votre place est gardée : vous pourrez revenir depuis l’accueil. En votre absence, vos essais seront tirés au hasard.</p>
      </Sheet>
    </div>
  );
}

/** What the opponent is doing, under their board. */
function OppChip({ state }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={state ?? 'none'}
        className={`mi-chip ${state === 'a joué' ? 'is-done' : state && state !== 'codeur' ? 'is-busy' : ''}`}
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0, transition: { duration: 0.12 } }}
        transition={{ type: 'spring', stiffness: 600, damping: 24 }}
      >
        {state ?? ''}
      </motion.span>
    </AnimatePresence>
  );
}

/** Round wins as brass pips. */
function Pips({ n, won }) {
  return (
    <span className="mi-pips">
      {Array.from({ length: n }, (_, i) => <i key={i} className={i < won ? 'is-won' : ''} />)}
    </span>
  );
}

/** The round just played is the last one. */
const matchEnds = (v) => (v.mode === 'classic' ? v.roundNumber >= v.totalRounds : v.players.some((p) => p.score >= v.target));

/** My board first. */
const orderDecoders = (decoders, me) => [...decoders].sort((a, b) => (a === me ? -1 : b === me ? 1 : 0));

export function roundVerdict(v, me, nameOf) {
  const n = (id) => v.boards[id]?.length ?? 0;
  const essais = (k) => `${k} essai${k > 1 ? 's' : ''}`;
  if (v.mode === 'classic') {
    const decoder = v.decoders[0];
    const pts = `${v.roundPoints} point${v.roundPoints > 1 ? 's' : ''} pour ${v.coderId === me ? 'vous' : nameOf(v.coderId)}`;
    if (!v.cracked.length) return `Code introuvable · ${pts}.`;
    return `${decoder === me ? 'Vous trouvez' : `${nameOf(decoder)} trouve`} en ${essais(n(decoder))} · ${pts}.`;
  }
  if (v.roundWinnerId === me) return `Code cassé en ${essais(n(me))} : manche gagnée !`;
  if (v.roundWinnerId) {
    const who = nameOf(v.roundWinnerId);
    return v.mode === 'race' ? `${who} trouve le code en ${essais(n(v.roundWinnerId))}.` : `${who} a cassé votre code en ${essais(n(v.roundWinnerId))}.`;
  }
  return v.cracked.length ? 'Trouvés au même essai : manche nulle.' : 'Personne n’a trouvé : manche nulle.';
}
