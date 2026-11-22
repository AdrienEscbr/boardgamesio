import { useEffect, useRef, useState } from 'react';
import { GameError } from '../engine/index.js';
import { createDekouPlugin } from '../server/index.js';
import Game from './Game.jsx';
import './fonts.js';
import './i18n.js';

const ME = 'me';
const BOT = 'ada';
const NAMES = { me: 'Vous', ada: 'Ada' };
const BOT_MS = 1300;
const TURN_MS = 45_000;
const plugin = createDekouPlugin();
const hash = () => (typeof location !== 'undefined' ? location.hash : '');
// /#/dev/dekou?auto: I am played by a robot too (screenshots, long runs).
const AUTO = hash().includes('auto');

/**
 * Design review page for DekouIO (/#/dev/dekou): a whole game against a robot on this
 * device, driven like the platform drives it (robot think time, my clock).
 */
export default function Showcase() {
  const [opts, setOpts] = useState({ botLevel: 'normal' });
  const [game, setGame] = useState(() => make(opts));
  const [, setVersion] = useState(0);
  const [turn, setTurn] = useState(null);
  const [paused, setPaused] = useState(false);
  const [round, setRound] = useState(0);
  const timer = useRef(null);
  const bump = () => setVersion((x) => x + 1);

  function make(o) {
    return plugin.createGame({ playerIds: [ME, BOT], botIds: [BOT], settings: { ...plugin.defaultSettings, ...o }, rng: Math.random });
  }
  const restart = (patch = {}) => {
    const next = { ...opts, ...patch };
    setOpts(next);
    setGame(make(next));
    setRound((r) => r + 1);
    setTurn(null);
    setPaused(false);
  };

  const pending = plugin.pending(game);
  const key = pending?.key ?? 'none';
  useEffect(() => {
    clearTimeout(timer.current);
    if (!pending || paused) return undefined;
    const isBot = pending.playerId !== ME || AUTO;
    const ms = isBot ? BOT_MS : TURN_MS;
    const now = Date.now();
    setTurn({ key, playerId: pending.playerId, durationMs: ms, endsAt: now + ms, startedAt: now });
    timer.current = setTimeout(() => {
      const rng = Math.random;
      if (isBot) {
        const view = plugin.view(game, pending.playerId, { turn: null, nickname: (id) => NAMES[id] });
        try { plugin.act(game, pending.playerId, plugin.bot(view, pending.playerId, rng), { rng }); } catch { plugin.act(game, pending.playerId, plugin.timeoutAction(game, pending.playerId), { rng }); }
      } else plugin.act(game, ME, plugin.timeoutAction(game, ME), { rng });
      bump();
    }, ms);
    return () => clearTimeout(timer.current);
  }, [game, key, paused]); // eslint-disable-line react-hooks/exhaustive-deps

  // Development only: review scripts set up positions through this handle.
  useEffect(() => {
    if (import.meta.env?.DEV) window.__dekou = { game, refresh: bump, setPaused };
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
      <Game key={round} room={room} local={local} />
      <details className="dk-devbar"><summary>revue</summary>
        <label>Robot <select value={opts.botLevel} onChange={(e) => restart({ botLevel: e.target.value })}>{['easy', 'normal', 'hard'].map((l) => <option key={l}>{l}</option>)}</select></label>
        <button type="button" onClick={() => restart()}>Nouvelle partie</button>
      </details>
      <style>{`
        .dk-devbar { position: fixed; left: 8px; bottom: calc(var(--safe-bottom, 0px) + 8px); z-index: 200; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 4px 8px; border-radius: 6px; background: rgba(0,0,0,.6); color: #fff; font-size: 11px; opacity: .45; }
        .dk-devbar:hover, .dk-devbar[open] { opacity: 1; }
        .dk-devbar summary { cursor: pointer; }
        .dk-devbar select, .dk-devbar button { font: inherit; }
      `}</style>
    </>
  );
}
