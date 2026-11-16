import { useEffect, useMemo, useRef, useState } from 'react';
import { errorMessage } from '@bgio/ui/lib/i18n.js';
import { haptic, sound } from '@bgio/ui/lib/feedback.js';
import { toast, useToastPlacement } from '@bgio/ui/components/Toaster.jsx';
import { createDutchPlugin } from '../server/index.js';
import Table from './Table.jsx';
import { LEVEL_LABELS } from './i18n.js';
import './i18n.js';

const ME = 'me';
const BOTS = ['ada', 'turing', 'hopper', 'lovelace', 'knuth'];
const NAMES = { me: 'Vous', ada: 'Ada', turing: 'Turing', hopper: 'Hopper', lovelace: 'Lovelace', knuth: 'Knuth' };
const TURN_MS = 30_000;
const plugin = createDutchPlugin();
// Same pauses as the server (see server/index.js): robots react, then a last moment for humans.
const BOT_BURN_MS = 1_000;
const BURN_MS = 1_800;

/**
 * Design review page for DutchIO (/#/dev/dutch): a whole game against robots on this
 * device, driven like the platform drives it (pauses, robots, burning windows).
 */
export default function Showcase() {
  const [players, setPlayers] = useState(4);
  const [burnOthers, setBurnOthers] = useState(false);
  const [level, setLevel] = useState('normal');
  const [auto, setAuto] = useState(false);
  const [open, setOpen] = useState(false);
  const [game, setGame] = useState(() => make(4, { burnOthers: false, botLevel: 'normal' }));
  const [gameNo, setGameNo] = useState(0);
  const [, setVersion] = useState(0);
  const [clock, setClock] = useState(null);
  const [windowClock, setWindowClock] = useState(null);
  const [paused, setPaused] = useState(false);
  const [resumes, setResumes] = useState(0);
  const timer = useRef(null);
  useToastPlacement('top');

  function make(n, settings) {
    const bots = BOTS.slice(0, n - 1);
    return plugin.createGame({ playerIds: [ME, ...bots], botIds: bots, settings: { target: 100, ...settings }, rng: Math.random });
  }
  const restart = (patch = {}) => {
    const n = patch.players ?? players;
    setGame(make(n, { burnOthers: patch.burnOthers ?? burnOthers, botLevel: patch.level ?? level }));
    setGameNo((x) => x + 1);
    setClock(null);
    setWindowClock(null);
    setPaused(false);
  };
  const togglePause = () => {
    if (paused) setResumes((r) => r + 1); // like the platform: a full turn again
    setPaused(!paused);
  };
  const bump = () => setVersion((v) => v + 1);

  // The platform's loop: pauses, robots, timeouts.
  const pending = plugin.pending(game);
  const pendingKey = pending?.key ?? 'none';
  useEffect(() => {
    clearTimeout(timer.current);
    if (paused) return undefined;
    if (!pending) { setClock(null); return undefined; }
    const now = Date.now();
    const durationMs = pending.autoMs ?? TURN_MS;
    setClock({ key: pending.key, durationMs, endsAt: now + durationMs });
    const stage = pending.key.match(/-(bots|burn)$/)?.[1];
    if (stage) {
      const base = `${pending.key.replace(/-(bots|burn)$/, '')}#${resumes}`;
      setWindowClock((w) => (w?.base === base ? w : { base, key: base, durationMs: stage === 'bots' ? BOT_BURN_MS + BURN_MS : BURN_MS, endsAt: now + (stage === 'bots' ? BOT_BURN_MS + BURN_MS : BURN_MS) }));
    } else {
      setWindowClock(null);
    }
    const run = (fn) => { try { fn(); } catch (e) { console.error(e); } bump(); };
    if (pending.autoMs != null) {
      timer.current = setTimeout(() => run(() => plugin.advance(game, { rng: Math.random })), pending.autoMs);
    } else if (pending.playerId !== ME || auto) {
      timer.current = setTimeout(() => run(() => {
        const id = pending.playerId;
        const action = id === ME ? plugin.timeoutAction(game, ME) : plugin.bot(plugin.view(game, id, { turn: null, nickname: (x) => NAMES[x] }), id, Math.random);
        plugin.act(game, id, action, { rng: Math.random });
      }), 700 + Math.random() * 700);
    } else {
      timer.current = setTimeout(() => run(() => plugin.act(game, ME, plugin.timeoutAction(game, ME), { rng: Math.random })), TURN_MS);
    }
    return () => clearTimeout(timer.current);
  }, [game, pendingKey, auto, paused, resumes]); // eslint-disable-line react-hooks/exhaustive-deps

  // In automatic mode, I also look at two cards and say I am ready at once.
  useEffect(() => {
    if (!auto || paused || game.players[0].ready || game.phase !== 'peek') return;
    if (game.phase === 'peek') for (const slot of [2, 3]) { try { plugin.act(game, ME, { type: 'peek', slot }, { rng: Math.random }); } catch { /* already seen */ } }
    plugin.act(game, ME, { type: 'ready' }, { rng: Math.random });
    bump();
  });

  const onAct = async (action) => {
    try {
      plugin.act(game, ME, action, { rng: Math.random });
      haptic('light');
    } catch (e) {
      sound('error');
      haptic('error');
      toast({ title: errorMessage(e.code, e.details), tone: 'error' });
    }
    bump();
  };

  let view = plugin.view(game, ME, { turn: clock, nickname: (id) => NAMES[id] });
  if (open) {
    // Review aid: every card face up (never in a real game).
    view = { ...view, players: view.players.map((p, i) => ({ ...p, slots: game.players[i].slots.map((c) => (c ? { card: c } : null)) })) };
  }
  const names = useMemo(() => NAMES, []);

  const tool = (on, label, fn) => <button key={label} type="button" className={on ? 'is-on' : ''} onClick={fn}>{label}</button>;
  return (
    <div className="dt dt-review">
      <div className="dt-review__bar">
        <h1>DutchIO · maquette</h1>
        <span className="dt-review__group">
          {[2, 3, 4, 5, 6].map((n) => tool(players === n, `${n} j.`, () => { setPlayers(n); restart({ players: n }); }))}
        </span>
        <span className="dt-review__group">
          {Object.entries(LEVEL_LABELS).map(([k, label]) => tool(level === k, label, () => { setLevel(k); restart({ level: k }); }))}
        </span>
        <span className="dt-review__group">
          {tool(burnOthers, 'Brûler chez les autres', () => { setBurnOthers(!burnOthers); restart({ burnOthers: !burnOthers }); })}
          {tool(paused, paused ? 'Reprendre' : 'Pause', togglePause)}
          {tool(auto, auto ? 'Robots pour moi : oui' : 'Robots pour moi', () => setAuto((a) => !a))}
          {tool(open, 'Cartes visibles', () => setOpen((o) => !o))}
          {tool(false, 'Nouvelle partie', () => restart())}
        </span>
      </div>
      <Table
        key={gameNo}
        view={view}
        names={names}
        onAct={onAct}
        turnClock={clock}
        windowClock={windowClock}
        paused={paused ? { canResume: true } : null}
        onResume={togglePause}
        finishedAction={<button type="button" className="dt-btn is-gold" onClick={() => restart()}>Nouvelle partie</button>}
      />
    </div>
  );
}
