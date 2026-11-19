import { useEffect, useRef, useState } from 'react';
import { GameError } from '../engine/index.js';
import { createBlackjackPlugin } from '../server/index.js';
import Game from './Game.jsx';
import './i18n.js';

const ME = 'me';
const BOTS = ['ada', 'turing', 'hopper', 'lovelace', 'knuth'];
const NAMES = { me: 'Vous', ada: 'Ada', turing: 'Turing', hopper: 'Hopper', lovelace: 'Lovelace', knuth: 'Knuth' };
const BOT_MS = 900;
const plugin = createBlackjackPlugin();
// /#/dev/blackjack?auto: I am played by a robot too (screenshots, long runs).
const AUTO = typeof location !== 'undefined' && location.hash.includes('auto');
const START = Number(typeof location !== 'undefined' && location.hash.match(/n=(\d)/)?.[1]) || 4;

/**
 * Design review page for BlackjackIO (/#/dev/blackjack): a whole game against robots on this
 * device, driven like the platform drives it (simultaneous bets, pauses, robots, clocks).
 */
export default function Showcase() {
  const [players, setPlayers] = useState(START);
  const [decks, setDecks] = useState(6);
  const [game, setGame] = useState(() => make(START, 6));
  const [, setVersion] = useState(0);
  const [turn, setTurn] = useState(null);
  const [paused, setPaused] = useState(false);
  const timer = useRef(null);
  const bump = () => setVersion((v) => v + 1);

  function make(n, d) {
    const bots = BOTS.slice(0, n - 1);
    const g = plugin.createGame({ playerIds: [ME, ...bots], botIds: bots, settings: { ...plugin.defaultSettings, decks: d, rounds: 10 }, rng: Math.random });
    // ?bj: I am dealt a blackjack in the first round (ace of spades, king of hearts).
    if (typeof location !== 'undefined' && /[?&]bj/.test(location.hash)) {
      const rig = [48, 45];
      g.shoe = g.shoe.filter((c) => !rig.includes(c));
      g.shoe.splice(g.shoe.length - n, 0, rig[1]);
      g.shoe.push(rig[0]);
    }
    return g;
  }
  const restart = (n = players, d = decks) => { setGame(make(n, d)); setTurn(null); setPaused(false); };

  // The platform's loop: pauses, robots, timeouts.
  const pending = plugin.pending(game);
  const key = pending?.key ?? 'none';
  useEffect(() => {
    clearTimeout(timer.current);
    if (!pending || paused) return undefined;
    const isBot = pending.playerId && (pending.playerId !== ME || AUTO);
    const ms = AUTO && game.phase === 'bet' && !game.players[0].betPlaced ? BOT_MS : pending.autoMs ?? (isBot ? BOT_MS : game.turnMs);
    const now = Date.now();
    setTurn({ key, playerId: pending.playerId ?? null, durationMs: ms, endsAt: now + ms, startedAt: now });
    timer.current = setTimeout(() => {
      const rng = Math.random;
      if (AUTO && game.phase === 'bet' && !game.players[0].betPlaced) plugin.act(game, ME, plugin.bot(plugin.view(game, ME, { turn: null, nickname: (id) => NAMES[id] }), ME, rng), { rng });
      else if (pending.autoMs != null) plugin.advance(game, { rng });
      else if (isBot) {
        const view = plugin.view(game, pending.playerId, { turn: null, nickname: (id) => NAMES[id] });
        try { plugin.act(game, pending.playerId, plugin.bot(view, pending.playerId, rng), { rng }); } catch { plugin.act(game, pending.playerId, plugin.timeoutAction(game), { rng }); }
      } else plugin.act(game, ME, plugin.timeoutAction(game), { rng });
      bump();
    }, ms);
    return () => clearTimeout(timer.current);
  }, [game, key, paused]); // eslint-disable-line react-hooks/exhaustive-deps

  const local = {
    me: ME,
    async act(action) {
      try {
        plugin.act(game, ME, action, { rng: Math.random });
      } catch (e) {
        throw e instanceof GameError ? { code: e.code, details: e.details } : e;
      }
      bump();
    },
    togglePause: () => setPaused((p) => !p),
  };
  const finished = plugin.isFinished(game);
  const room = {
    id: 'DEV',
    hostId: ME,
    status: finished ? 'finished' : 'playing',
    players: game.players.map((p) => ({ id: p.id, nickname: NAMES[p.id], connected: true })),
    turn: turn && { ...turn, pausedByHost: paused },
    game: plugin.view(game, ME, { turn, nickname: (id) => NAMES[id] }),
  };

  return (
    <>
      <Game room={room} local={local} readOnly={finished} />
      <div className="bj-devbar">
        <label>Joueurs <select value={players} onChange={(e) => { const n = Number(e.target.value); setPlayers(n); restart(n); }}>{[1, 2, 3, 4, 5, 6].map((n) => <option key={n}>{n}</option>)}</select></label>
        <label>Sabot <select value={decks} onChange={(e) => { const d = Number(e.target.value); setDecks(d); restart(players, d); }}>{[1, 2, 6].map((n) => <option key={n}>{n}</option>)}</select></label>
        <button type="button" onClick={() => restart()}>Nouvelle partie</button>
      </div>
      <style>{`
        .bj-devbar { position: fixed; right: 8px; top: calc(var(--safe-top, 0px) + 46px); z-index: 200; display: flex; gap: 8px; align-items: center; padding: 4px 8px; border-radius: 10px; background: rgba(0,0,0,.6); color: #fff; font-size: 11px; opacity: .55; }
        .bj-devbar:hover { opacity: 1; }
        .bj-devbar select, .bj-devbar button { font: inherit; }
      `}</style>
    </>
  );
}
