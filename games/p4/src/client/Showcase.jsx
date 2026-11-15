import { useEffect, useRef, useState } from 'react';
import { chooseColumn, createGame, drop, nextRound, viewFor } from '../engine/index.js';
import { sound } from '@bgio/ui/lib/feedback.js';
import Board from './Board.jsx';
import Disc, { SEAT_NAMES } from './Disc.jsx';
import './p4.css';

const IDS = ['A', 'B', 'C'];

/** Design review page for P4IO (/#/dev/p4): play on one screen, or let robots play. */
export default function Showcase() {
  const [players, setPlayers] = useState(2);
  const [size, setSize] = useState('classic');
  const [auto, setAuto] = useState(false);
  const [game, setGame] = useState(() => createGame({ playerIds: IDS.slice(0, 2), settings: { size: 'classic', target: 5 } }));
  const [, rerender] = useState(0);
  const [clearing, setClearing] = useState(false);
  const busy = useRef(false);

  const restart = (n = players, s = size) => {
    setClearing(false);
    setGame(createGame({ playerIds: IDS.slice(0, n), settings: { size: s, target: 5 } }));
  };

  const play = (col) => {
    if (game.phase !== 'playing' || busy.current) return;
    const row = game.round.heights[col];
    drop(game, game.round.turn, col);
    rerender((x) => x + 1);
    // The wood knocks when the disc lands (same timing as the drop animation).
    const ms = (0.32 + Math.sqrt(game.rows - row) * 0.12) * 0.55 * 1000;
    setTimeout(() => sound('place'), ms);
  };

  // End of a round: the line shines, then the discs drop out and a new round starts.
  useEffect(() => {
    if (game.phase !== 'roundOver') return undefined;
    sound(game.round.winnerId ? 'success' : 'back');
    const t1 = setTimeout(() => setClearing(true), 2200);
    const t2 = setTimeout(() => {
      if (game.phase === 'roundOver') nextRound(game);
      if (game.status === 'finished') { restart(); return; }
      setClearing(false);
      rerender((x) => x + 1);
    }, 3300);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [game, game.phase, game.roundNumber]); // eslint-disable-line react-hooks/exhaustive-deps

  // Robots play every seat.
  useEffect(() => {
    if (!auto || game.phase !== 'playing') return undefined;
    const t = setTimeout(() => {
      const v = viewFor(game, game.round.turn);
      play(chooseColumn(v, Math.random, 'normal'));
    }, 650);
    return () => clearTimeout(t);
  });

  const v = viewFor(game, game.round.turn ?? IDS[0]);
  const seatOf = (id) => IDS.indexOf(id);
  const turnSeat = game.round.turn ? seatOf(game.round.turn) : null;

  return (
    <div className="p4-table">
      <div className="p4-review">
        <h1>P4IO · maquette</h1>
        <p>Cliquez une colonne pour y lâcher un jeton (les joueurs se relaient sur cet écran), ou laissez les robots jouer. Les jetons passent derrière la façade en bois ; l’alignement gagnant s’illumine, puis le plateau se vide.</p>
        <div className="p4-review__tools">
          <button type="button" className={players === 2 ? 'is-on' : ''} onClick={() => { setPlayers(2); restart(2, size); }}>2 joueurs</button>
          <button type="button" className={players === 3 ? 'is-on' : ''} onClick={() => { setPlayers(3); restart(3, size); }}>3 joueurs</button>
          <button type="button" className={size === 'classic' ? 'is-on' : ''} onClick={() => { setSize('classic'); restart(players, 'classic'); }}>Classique</button>
          <button type="button" className={size === 'large' ? 'is-on' : ''} onClick={() => { setSize('large'); restart(players, 'large'); }}>Grand</button>
          <button type="button" className={auto ? 'is-on' : ''} onClick={() => setAuto((a) => !a)}>{auto ? 'Arrêter les robots' : 'Partie automatique'}</button>
          <button type="button" onClick={() => restart()}>Recommencer</button>
        </div>

        <div className="p4-review__status" aria-live="polite">
          {game.phase === 'playing'
            ? <><Disc seat={turnSeat} /> Au tour de {SEAT_NAMES[turnSeat]}</>
            : game.round.winnerId
              ? <><Disc seat={seatOf(game.round.winnerId)} /> {SEAT_NAMES[seatOf(game.round.winnerId)]} gagne la manche !</>
              : <>Manche nulle : le plateau est plein</>}
        </div>
        <div className="p4-review__score">
          {game.players.map((p, i) => <span key={p.id}><Disc seat={i} /> {SEAT_NAMES[i]} : {game.scores[p.id]}</span>)}
        </div>

        <div className="p4-review__board">
          <Board
            cols={game.cols}
            rows={game.rows}
            board={v.board}
            line={game.round.line}
            clearing={clearing}
            ghostSeat={game.phase === 'playing' && !auto ? turnSeat : null}
            playable={game.phase === 'playing' ? v.legal.length ? v.legal : [] : []}
            onDrop={play}
          />
        </div>

        <div className="p4-review__swatches">
          {SEAT_NAMES.map((name, i) => <figure key={name}><Disc seat={i} /><figcaption>{name}</figcaption></figure>)}
        </div>
      </div>
    </div>
  );
}
