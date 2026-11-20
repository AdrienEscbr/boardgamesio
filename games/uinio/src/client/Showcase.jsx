import { useEffect, useRef, useState } from 'react';
import { GameError } from '../engine/index.js';
import { createUinioPlugin } from '../server/index.js';
import Game from './Game.jsx';
import './i18n.js';

const ME = 'me';
const BOTS = ['ada', 'turing', 'hopper', 'lovelace', 'knuth', 'curie', 'noether'];
const NAMES = { me: 'Vous', ada: 'Ada', turing: 'Turing', hopper: 'Hopper', lovelace: 'Lovelace', knuth: 'Knuth', curie: 'Curie', noether: 'Noether' };
const BOT_MS = 1100;
const TURN_MS = 20_000;
const plugin = createUinioPlugin({ revealMs: 600_000 });
const hash = () => (typeof location !== 'undefined' ? location.hash : '');
// /#/dev/uinio?auto: I am played by a robot too (screenshots, long runs). &n=2..8 players.
const AUTO = hash().includes('auto');
const START = Number(hash().match(/n=(\d)/)?.[1]) || 4;

/**
 * Design review page for UINIO (/#/dev/uinio): a whole game against robots on this device,
 * driven like the platform drives it (robots, clocks, the end of a round).
 */
export default function Showcase() {
  const [opts, setOpts] = useState({ n: START, stacking: false, drawUntil: false, doubles: false, botLevel: 'normal', target: 300 });
  const [game, setGame] = useState(() => make(opts));
  const [, setVersion] = useState(0);
  const [turn, setTurn] = useState(null);
  const [paused, setPaused] = useState(false);
  const timer = useRef(null);
  const bump = () => setVersion((x) => x + 1);

  function make(o) {
    const bots = BOTS.slice(0, o.n - 1);
    return plugin.createGame({ playerIds: [ME, ...bots], botIds: bots, settings: { ...plugin.defaultSettings, ...o }, rng: Math.random });
  }
  const restart = (patch = {}) => {
    const next = { ...opts, ...patch };
    setOpts(next);
    setGame(make(next));
    setTurn(null);
    setPaused(false);
  };

  // The platform's loop: robots after a short think, my clock, the end of a round.
  const pending = plugin.pending(game);
  const key = pending?.key ?? 'none';
  useEffect(() => {
    clearTimeout(timer.current);
    if (!pending || paused) return undefined;
    const isBot = pending.playerId && (pending.playerId !== ME || AUTO);
    // At the end of a round the robots are ready: the next one waits for me (or `auto`).
    // The end of a round waits for me (or 2.5 s with `auto`); the deal pause runs as on the server.
    const ms = pending.autoMs != null ? (AUTO && pending.key.endsWith('reveal') ? 2500 : pending.autoMs) : isBot ? BOT_MS : TURN_MS;
    const now = Date.now();
    setTurn({ key, playerId: pending.playerId ?? null, durationMs: ms, endsAt: now + ms, startedAt: now });
    timer.current = setTimeout(() => {
      const rng = Math.random;
      if (pending.autoMs != null) plugin.advance(game, { rng });
      else if (isBot) {
        const view = plugin.view(game, pending.playerId, { turn: null, nickname: (id) => NAMES[id] });
        try { plugin.act(game, pending.playerId, plugin.bot(view, pending.playerId, rng), { rng }); } catch { plugin.act(game, pending.playerId, plugin.timeoutAction(game, pending.playerId), { rng }); }
      } else plugin.act(game, ME, plugin.timeoutAction(game, ME), { rng });
      bump();
    }, ms);
    return () => clearTimeout(timer.current);
  }, [game, key, paused]); // eslint-disable-line react-hooks/exhaustive-deps

  // Development only: the review scripts set up positions through this handle.
  useEffect(() => {
    if (import.meta.env?.DEV) window.__uinio = { game, refresh: bump, setPaused };
  });

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
    onFinished: () => restart(),
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
      <Game key={game.firstDealer + String(game.players.length) + opts.stacking + opts.drawUntil + opts.doubles} room={room} local={local} />
      <details className="un-devbar"><summary>revue</summary>
        <label>Joueurs <select value={opts.n} onChange={(e) => restart({ n: Number(e.target.value) })}>{[2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n}>{n}</option>)}</select></label>
        <label><input type="checkbox" checked={opts.stacking} onChange={(e) => restart({ stacking: e.target.checked })} /> cumul</label>
        <label><input type="checkbox" checked={opts.doubles} onChange={(e) => restart({ doubles: e.target.checked })} /> doublons</label>
        <label><input type="checkbox" checked={opts.drawUntil} onChange={(e) => restart({ drawUntil: e.target.checked })} /> pioche jusqu’à jouer</label>
        <label>Robots <select value={opts.botLevel} onChange={(e) => restart({ botLevel: e.target.value })}>{['easy', 'normal', 'hard'].map((l) => <option key={l}>{l}</option>)}</select></label>
        <button type="button" onClick={() => restart()}>Nouvelle partie</button>
      </details>
      <style>{`
        .un-devbar { position: fixed; left: 8px; bottom: calc(var(--safe-bottom, 0px) + 70px); z-index: 200; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; max-width: calc(100vw - 16px); padding: 4px 8px; border-radius: 10px; background: rgba(0,0,0,.6); color: #fff; font-size: 11px; opacity: .5; }
        .un-devbar:hover, .un-devbar[open] { opacity: 1; }
        .un-devbar summary { cursor: pointer; }
        .un-devbar select, .un-devbar button { font: inherit; }
      `}</style>
    </>
  );
}
