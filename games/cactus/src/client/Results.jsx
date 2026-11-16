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
import { total } from './i18n.js';

/** "Hors zone rouge · 2 Cactus réussis · 1 royal · 1 raté". */
function statsOf(r) {
  const { success, royal, failed } = r.stats;
  const parts = [r.red ? 'Zone rouge' : 'Hors zone rouge'];
  if (success) parts.push(`${success} Cactus réussi${success > 1 ? 's' : ''}`);
  if (royal) parts.push(`${royal} royal${royal > 1 ? 'aux' : ''}`);
  if (failed) parts.push(`${failed} raté${failed > 1 ? 's' : ''}`);
  return parts.join(' · ');
}

export default function Results({ room, onViewBoard }) {
  const navigate = useNavigate();
  const me = useApp((s) => s.session?.playerId);
  const [starting, setStarting] = useState(false);
  const v = room.game;
  const results = v.results;
  const nickname = (id) => room.players.find((p) => p.id === id)?.nickname ?? v.players.find((p) => p.id === id)?.nickname ?? '—';
  const winners = results?.winnerIds ?? [];
  const iWon = winners.includes(me);
  const isHost = room.hostId === me;
  const present = room.players.filter((p) => p.connected).length;

  useEffect(() => {
    if (iWon) { sound('bingo'); haptic('success'); } else sound('success');
  }, [iWon]);

  if (!results) return null;
  const rematch = async () => {
    setStarting(true);
    try { await call('room:start', { roomId: room.id }); } catch (e) {
      toast({ title: errorMessage(e.code, e.details), tone: 'error' });
      setStarting(false);
    }
  };
  const title = iWon
    ? (winners.length > 1 ? 'Victoire partagée !' : 'Victoire !')
    : `${winners.map(nickname).join(' et ')} ${winners.length > 1 ? 'gagnent' : 'gagne'}`;

  return (
    <div className="results">
      {iWon && <Confetti />}
      <div className="results__head">
        <motion.div className="results__trophy" initial={{ scale: 0.6, rotate: -12, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', bounce: 0.45, duration: 0.8 }}>
          <Icon name="trophy" size={36} />
        </motion.div>
        <h1>{title}</h1>
        <p>
          {results.rounds} manche{results.rounds > 1 ? 's' : ''} jouée{results.rounds > 1 ? 's' : ''} · zone rouge au-delà de {results.threshold} points.
        </p>
      </div>

      <ol className="ranking">
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
              {p?.isBot
                ? <span className="bot-avatar" aria-hidden><Icon name="bot" size={24} /></span>
                : <Avatar name={nickname(r.playerId)} index={p?.seat ?? i} size={44} />}
              <div className="rank__who">
                <span className="rank__name">{nickname(r.playerId)}{r.playerId === me && <em> · vous</em>}</span>
                <span className="rank__stats">{statsOf(r)}</span>
              </div>
              <div className="rank__score tabular" title="Score final (le plus petit gagne)" style={r.red ? { color: '#e5484d' } : undefined}>{total(r.total)}</div>
            </motion.li>
          );
        })}
      </ol>

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
