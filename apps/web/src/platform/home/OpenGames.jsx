import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { call, socket } from '@bgio/ui/lib/socket.js';
import { Button } from '@bgio/ui/components/ui.jsx';
import Tile from '@bgio/ui/components/Tile.jsx';
import { GAMES, gameById } from '../../games.js';

/** A game's home-page thumbnail: its own `Cover`, or letter tiles (ScrabbleIO). */
export function GameCover({ game }) {
  if (game.Cover) return <game.Cover />;
  return (
    <div className="game-card__cover" aria-hidden>
      {game.coverLetters.map((l, i) => (
        <span key={i} className="game-card__tile" style={{ '--i': i }}><Tile letter={l} /></span>
      ))}
    </div>
  );
}

/** The cover scaled down to fit a fixed box, whatever the game's cover size. */
export function FitCover({ game, className = '' }) {
  const box = useRef(null);
  const inner = useRef(null);
  useLayoutEffect(() => {
    const fit = () => {
      const b = box.current;
      const i = inner.current;
      if (!b || !i || !i.offsetWidth) return;
      i.style.scale = Math.min(1, b.clientWidth / i.offsetWidth, b.clientHeight / i.offsetHeight);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box.current);
    ro.observe(inner.current);
    return () => ro.disconnect();
  }, []);
  return (
    <span ref={box} className={`fit-cover ${className}`} aria-hidden>
      <span ref={inner} className="fit-cover__inner"><GameCover game={game} /></span>
    </span>
  );
}

function ago(ms) {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  return `il y a ${Math.floor(min / 60)} h`;
}

/** Public lobbies with a free seat, pushed live by the server (`rooms:open`). */
export default function OpenGames({ connection, busy, onJoin, onCreate }) {
  const [list, setList] = useState(null); // { rooms, offset }
  const [filter, setFilter] = useState(null); // gameId, or null for all
  const [, tick] = useReducer((n) => n + 1, 0);

  useEffect(() => {
    if (connection !== 'online') return undefined;
    const update = ({ rooms, serverNow }) => setList({ rooms, offset: serverNow - Date.now() });
    socket.on('rooms:open', update);
    call('rooms:watch').then(update).catch(() => {});
    return () => {
      socket.off('rooms:open', update);
      if (socket.connected) socket.emit('rooms:unwatch');
    };
  }, [connection]);

  // "il y a 2 min" has to move on by itself.
  useEffect(() => {
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);

  const rooms = (list?.rooms ?? []).filter((r) => gameById(r.gameId) && (!filter || r.gameId === filter));
  const now = Date.now() + (list?.offset ?? 0);

  return (
    <section className="home__panel card open-games" aria-labelledby="open-title">
      <div className="open-games__head">
        <h2 id="open-title" className="games__title">Parties ouvertes</h2>
        {list && <span className="eyebrow tabular">{rooms.length} salon{rooms.length > 1 ? 's' : ''}</span>}
      </div>
      <div className="open-games__filters" role="group" aria-label="Filtrer par jeu">
        {[{ id: null, name: 'Tous' }, ...GAMES].map((g) => (
          <button
            key={g.id ?? 'all'}
            type="button"
            className={`chip ${filter === g.id ? 'chip--accent' : ''}`}
            aria-pressed={filter === g.id}
            onClick={() => setFilter(g.id)}
          >
            {g.name}
          </button>
        ))}
      </div>
      {rooms.length ? (
        <ul className="open-games__list">
          {rooms.map((r) => {
            const g = gameById(r.gameId);
            return (
              <li key={r.id} className="open-game">
                <FitCover game={g} className="open-game__cover" />
                <span className="open-game__text">
                  <strong>{g.name}</strong>
                  <span>{ago(now - r.createdAt)}</span>
                </span>
                <span className="open-game__seats tabular">
                  <strong>{r.players}/{r.maxPlayers}</strong><span className="open-game__seats-label"> joueurs</span>
                </span>
                <Button
                  variant="primary"
                  icon="enter"
                  className="open-game__join"
                  aria-label={`Rejoindre la partie de ${g.name}`}
                  title="Rejoindre"
                  loading={busy === r.id}
                  disabled={!!busy}
                  onClick={() => onJoin(r.id)}
                />
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="open-games__empty">
          <p>Aucune partie ouverte pour l’instant</p>
          <Button variant="ghost" size="sm" icon="plus" onClick={onCreate}>Créer une partie</Button>
        </div>
      )}
    </section>
  );
}
