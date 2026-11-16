import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp, serverNow } from '@bgio/ui/lib/store.js';
import { act as sendAction, call } from '@bgio/ui/lib/socket.js';
import { errorMessage } from '@bgio/ui/lib/i18n.js';
import { haptic, sound } from '@bgio/ui/lib/feedback.js';
import { Button, IconButton, Sheet } from '@bgio/ui/components/ui.jsx';
import { toast, useToastPlacement } from '@bgio/ui/components/Toaster.jsx';
import SettingsSheet from '@bgio/ui/components/SettingsSheet.jsx';
import { BOT_BURN_MS, BURN_MS } from '../server/index.js';
import Table from './Table.jsx';
import RulesSheet from './RulesSheet.jsx';
import ScoreTable from './ScoreTable.jsx';
import './i18n.js';

/**
 * The burning window, as one clock: the platform runs it in two pauses (robots react, then
 * a last moment for humans), the ring shows it as one, restarted by every burn.
 */
function useWindowClock(turn) {
  const last = useRef(null);
  const stage = turn?.key?.match(/-(bots|burn)$/)?.[1];
  if (!stage || !turn.endsAt) { last.current = null; return null; }
  const base = turn.key.replace(/-(bots|burn)$/, '');
  if (last.current?.base !== base) {
    const durationMs = stage === 'bots' ? BOT_BURN_MS + BURN_MS : BURN_MS;
    last.current = { base, key: base, durationMs, endsAt: stage === 'bots' ? turn.endsAt + BURN_MS : turn.endsAt };
  }
  return last.current;
}

export default function Game({ room, readOnly = false, onExitBoard }) {
  const navigate = useNavigate();
  const me = useApp((s) => s.session?.playerId);
  const v = room.game;
  const turn = room.turn;
  const isHost = room.hostId === me;
  const [sheet, setSheet] = useState(null); // 'menu' | 'rules' | 'scores' | 'leave'
  useToastPlacement('top');

  // Robots are named without their « Robot » prefix: the bot icon already says it.
  const names = useMemo(() => Object.fromEntries(room.players.map((p) => [p.id, p.isBot ? p.nickname.replace(/^Robot /, '') : p.nickname])), [room.players]);
  const view = useMemo(() => ({
    ...v,
    players: v.players.map((p) => ({ ...p, nickname: names[p.id] ?? p.nickname, connected: room.players.find((x) => x.id === p.id)?.connected })),
  }), [v, names, room.players]);
  const hostPaused = !!turn?.pausedByHost;
  const playing = !readOnly && room.status === 'playing';
  const windowClock = useWindowClock(turn);

  const onAct = async (action) => {
    try {
      await sendAction(room.id, action);
      haptic('light');
    } catch (e) {
      sound('error');
      haptic('error');
      toast({ title: errorMessage(e.code, e.details), tone: 'error' });
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

  return (
    <div className="dt dt-game">
      <header className="dt-head">
        <IconButton icon="settings" label="Réglages" onClick={() => setSheet('menu')} className="dt-head__icon" />
        <div className="dt-head__title">
          <span className="dt-head__name">DutchIO</span>
          <span className="dt-head__chip tabular">Manche {v.round}</span>
          <span className="dt-head__sub">Partie en {v.target} pts</span>
        </div>
        <div className="dt-head__side">
          {isHost && playing && (
            <IconButton icon={hostPaused ? 'play' : 'pause'} label={hostPaused ? 'Reprendre la partie' : 'Mettre en pause'} onClick={togglePause} className="dt-head__icon" />
          )}
          <IconButton icon="history" label="Scores" onClick={() => setSheet('scores')} className="dt-head__icon" />
          <IconButton icon="book" label="Règles" onClick={() => setSheet('rules')} className="dt-head__icon" />
        </div>
      </header>

      <Table
        view={view}
        names={names}
        onAct={onAct}
        turnClock={turn}
        windowClock={windowClock}
        now={serverNow}
        readOnly={!playing}
        paused={hostPaused && playing ? { by: isHost ? null : names[room.hostId], canResume: isHost } : null}
        onResume={togglePause}
        finishedAction={readOnly ? <button type="button" className="dt-btn is-gold" onClick={onExitBoard}>Retour aux résultats</button> : null}
      />

      <SettingsSheet open={sheet === 'menu'} onClose={() => setSheet(null)}>
        <div className="settings__group">
          <span className="eyebrow">Partie · salon {room.id}</span>
          <Button variant="secondary" icon="book" onClick={() => setSheet('rules')}>Règles de DutchIO</Button>
          <Button variant="secondary" icon="history" onClick={() => setSheet('scores')}>Scores des manches</Button>
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
      <Sheet open={sheet === 'scores'} onClose={() => setSheet(null)} title="Scores des manches" size="lg">
        <ScoreTable view={view} names={names} me={me} />
      </Sheet>
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
        <p className="sheet-lead">Votre place est gardée : vous pourrez revenir depuis l’accueil. En votre absence, un robot joue pour vous avec ce que vous aviez vu.</p>
      </Sheet>
    </div>
  );
}
