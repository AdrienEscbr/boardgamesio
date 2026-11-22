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
import { LEVEL_LABELS, plural } from './i18n.js';

/** End of a DekouIO game: who still had units, and how the table stood. */
export default function Results({ room, onViewBoard }) {
  const navigate = useNavigate();
  const me = useApp((s) => s.session?.playerId);
  const [starting, setStarting] = useState(false);
  const v = room.game;
  const results = v.results;
  const nickname = (id) => room.players.find((p) => p.id === id)?.nickname ?? v.players.find((p) => p.id === id)?.nickname ?? '—';
  const iWon = results?.winnerId === me;
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

  const loser = results.players.find((p) => p.id !== results.winnerId);
  const title = !results.winnerId ? 'Armistice' : iWon ? 'Victoire !' : `${nickname(results.winnerId)} l’emporte`;
  const why = !results.winnerId
    ? 'Au bout des tours, les deux camps ont autant d’unités en main.'
    : results.reason === 'limit'
      ? `Au bout des tours, ${iWon ? 'vous aviez' : `${nickname(results.winnerId)} avait`} le plus d’unités en main.`
      : `${loser?.id === me ? 'Vous n’aviez' : `${nickname(loser?.id)} n’avait`} plus aucune unité en main.`;
  // the winner first
  const rows = [...results.players].sort((a, b) => (b.id === results.winnerId) - (a.id === results.winnerId) || b.hand - a.hand);
  const hasBot = v.players.some((p) => p.isBot);

  return (
    <div className="results">
      {iWon && <Confetti />}
      <div className="results__head">
        <motion.div className="results__trophy" initial={{ scale: 0.6, rotate: -12, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', bounce: 0.45, duration: 0.8 }}>
          <Icon name="trophy" size={36} />
        </motion.div>
        <h1>{title}</h1>
        <p>{why} {plural(results.turns, 'tour')}{hasBot ? ` · robots ${LEVEL_LABELS[v.botLevel] ?? ''}` : ''}.</p>
      </div>

      <ol className="ranking">
        {rows.map((r, i) => {
          const p = v.players.find((x) => x.id === r.id);
          const first = r.id === results.winnerId;
          return (
            <motion.li
              key={r.id}
              className={`rank card ${first ? 'is-first' : ''} ${r.id === me ? 'is-me' : ''}`}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', bounce: 0, duration: 0.6, delay: 0.15 + i * 0.08 }}
            >
              <span className="rank__pos tabular">{first ? 1 : 2}</span>
              {p?.isBot
                ? <span className="bot-avatar" aria-hidden><Icon name="bot" size={24} /></span>
                : <Avatar name={nickname(r.id)} index={p?.seat ?? i} size={44} />}
              <div className="rank__who">
                <span className="rank__name">{nickname(r.id)}{r.id === me && <em> · vous</em>}</span>
                <span className="rank__stats">{plural(r.hand, 'unité')} en main · {r.onBoard} sur le terrain · {plural(r.discard, 'perte')}</span>
              </div>
              <div className="rank__score tabular" title="Unités en main">{r.hand}</div>
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
            <Button variant="secondary" size="lg" className="btn--block" onClick={onViewBoard}>Voir le terrain</Button>
            <Button variant="secondary" size="lg" className="btn--block" onClick={() => navigate('/')}>Accueil</Button>
          </div>
        </div>
      </footer>
    </div>
  );
}
