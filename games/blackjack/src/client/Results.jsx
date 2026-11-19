import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { useApp } from '@bgio/ui/lib/store.js';
import { call } from '@bgio/ui/lib/socket.js';
import { errorMessage } from '@bgio/ui/lib/i18n.js';
import { haptic, sound } from '@bgio/ui/lib/feedback.js';
import { Avatar, Button } from '@bgio/ui/components/ui.jsx';
import Icon from '@bgio/ui/components/Icon.jsx';
import { toast } from '@bgio/ui/components/Toaster.jsx';
import Confetti from '@bgio/ui/components/Confetti.jsx';
import { DECK_LABELS, fmt, signed } from './i18n.js';
import './blackjack.css';

export default function Results({ room, onViewBoard }) {
  const navigate = useNavigate();
  const me = useApp((s) => s.session?.playerId);
  const [starting, setStarting] = useState(false);
  const v = room.game;
  const results = v.results;
  const nickname = (id) => room.players.find((p) => p.id === id)?.nickname ?? v.players.find((p) => p.id === id)?.nickname ?? '—';
  const nameOf = (id) => (id === me ? 'Vous' : nickname(id));
  const iWon = results?.winnerId === me;
  const solo = v.players.length === 1;
  const isHost = room.hostId === me;
  const present = room.players.filter((p) => p.connected).length;
  const mine = results?.ranking.find((r) => r.playerId === me);

  useEffect(() => {
    if (iWon && (!solo || mine?.net > 0)) { sound('bingo'); haptic('success'); } else sound('success');
  }, [iWon]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!results) return null;
  const rematch = async () => {
    setStarting(true);
    try { await call('room:start', { roomId: room.id }); } catch (e) {
      toast({ title: errorMessage(e.code, e.details), tone: 'error' });
      setStarting(false);
    }
  };

  let title;
  if (solo) title = mine?.net > 0 ? `Vous sortez gagnant : ${signed(mine.net)}` : mine?.net < 0 ? `La banque gagne : ${signed(mine.net)}` : 'Ni gagné, ni perdu';
  else if (!results.winnerId) title = 'Égalité !';
  else title = iWon ? 'Victoire !' : `${nickname(results.winnerId)} gagne`;
  const celebrate = solo ? mine?.net > 0 : iWon;

  return (
    <div className="results">
      {celebrate && <Confetti />}
      <div className="results__head">
        <motion.div className="results__trophy" initial={{ scale: 0.6, rotate: -12, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', bounce: 0.45, duration: 0.8 }}>
          <Icon name="trophy" size={36} />
        </motion.div>
        <h1>{title}</h1>
        <p>
          {results.rounds} manche{results.rounds > 1 ? 's' : ''} · {fmt(v.startStack)} jetons au départ · mise min. {fmt(v.minBet)} · {DECK_LABELS[v.decks]}.
        </p>
      </div>

      <ol className="ranking bj-ranking">
        {results.ranking.map((r, i) => {
          const p = v.players.find((x) => x.id === r.playerId);
          return (
            <motion.li
              key={r.playerId}
              className={`rank card ${r.rank === 1 ? 'is-first' : ''} ${r.playerId === me ? 'is-me' : ''}`}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', bounce: 0, duration: 0.6, delay: 0.15 + i * 0.08 }}
            >
              <span className="rank__pos tabular">{r.rank}</span>
              <Avatar name={nickname(r.playerId)} index={p?.seat ?? i} size={44} />
              <div className="rank__who">
                <span className="rank__name">{nickname(r.playerId)}{r.playerId === me && <em> · vous</em>}</span>
                <span className="rank__stats">{p?.isBot ? 'Robot' : 'Joueur'} · {signed(r.net)}</span>
              </div>
              <div className="rank__score tabular" title="Jetons">{fmt(r.stack)}</div>
            </motion.li>
          );
        })}
      </ol>

      <section className="bj-rounds">
        <h2 className="bj-results-title">Les manches</h2>
        <ol className="bj-history">
          {v.history.map((h) => (
            <li key={h.round}>
              <span className="bj-history__round">Manche {h.round}</span>
              <span className="bj-history__dealer">
                {!h.dealer ? 'Personne n’a misé' : h.dealer.blackjack ? 'Banque : blackjack' : h.dealer.bust ? `Banque sautée (${h.dealer.total})` : `Banque : ${h.dealer.total}`}
              </span>
              <span className="bj-history__nets">
                {Object.entries(h.net).map(([id, n]) => (
                  <span key={id} className={n > 0 ? 'is-up' : n < 0 ? 'is-down' : ''}>{nameOf(id)} {signed(n)}</span>
                ))}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <footer className="results__cta">
        <div className="results__actions">
          {isHost ? (
            <Button variant="primary" size="lg" className="btn--block" icon="play" onClick={rematch} loading={starting} disabled={present < 1}>Revanche</Button>
          ) : (
            <div className="waiting-host"><span className="dots" aria-hidden><i /><i /><i /></span>L’hôte peut lancer une revanche</div>
          )}
          <div className="results__secondary">
            <Button variant="secondary" size="lg" className="btn--block" onClick={onViewBoard}>Voir la table</Button>
            <Button variant="secondary" size="lg" className="btn--block" onClick={() => navigate('/')}>Accueil</Button>
          </div>
        </div>
      </footer>
    </div>
  );
}
