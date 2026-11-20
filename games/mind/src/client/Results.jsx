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
import Peg, { codeLabel } from './Peg.jsx';
import { FORMAT_LABELS, MODE_LABELS } from './i18n.js';
import './mind.css';
import './game.css';

function Code({ code }) {
  return (
    <span className="mi-history__code" role="img" aria-label={codeLabel(code)}>
      {code.map((c, i) => <Peg key={i} color={c} />)}
    </span>
  );
}

export default function Results({ room, onViewBoard }) {
  const navigate = useNavigate();
  const me = useApp((s) => s.session?.playerId);
  const [starting, setStarting] = useState(false);
  const v = room.game;
  const results = v.results;
  const nickname = (id) => room.players.find((p) => p.id === id)?.nickname ?? v.players.find((p) => p.id === id)?.nickname ?? '—';
  const nameOf = (id) => (id === me ? 'Vous' : nickname(id));
  const iWon = results?.winnerId === me;
  const tie = results && !results.winnerId;
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
  const classic = v.mode === 'classic';
  const essais = (k) => `${k} essai${k > 1 ? 's' : ''}`;

  return (
    <div className="results">
      {iWon && <Confetti />}
      <div className="results__head">
        <motion.div className="results__trophy" initial={{ scale: 0.6, rotate: -12, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', bounce: 0.45, duration: 0.8 }}>
          <Icon name="trophy" size={36} />
        </motion.div>
        <h1>{tie ? 'Égalité !' : iWon ? 'Victoire !' : `${nickname(results.winnerId)} gagne`}</h1>
        <p>
          {MODE_LABELS[v.mode]} · {FORMAT_LABELS[v.format]}{v.duplicates ? '' : ', sans doublons'} · {v.history.length} manche{v.history.length > 1 ? 's' : ''}
          {results.draws ? `, dont ${results.draws} nulle${results.draws > 1 ? 's' : ''}` : ''}.
        </p>
      </div>

      <ol className="ranking mi-ranking">
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
                <span className="rank__stats">{p?.isBot ? 'Robot' : 'Joueur'}</span>
              </div>
              <div className="rank__score tabular" title={classic ? 'Points' : 'Manches gagnées'}>{r.score}</div>
            </motion.li>
          );
        })}
      </ol>

      <section className="mi-rounds">
      <h2 className="mi-results-title">Les manches</h2>
      <ol className="mi-history">
        {v.history.map((h) => {
          let text;
          if (classic) {
            const decoder = Object.keys(h.guesses)[0];
            text = `${nameOf(h.coderId)} code · ${h.cracked.length ? `${nameOf(decoder)} trouve en ${essais(h.guesses[decoder])}` : 'code introuvable'} · ${h.points} pt${h.points > 1 ? 's' : ''}`;
          } else {
            const tries = Object.entries(h.guesses).map(([id, k]) => `${nameOf(id)} ${h.cracked.includes(id) ? `en ${k}` : '✗'}`).join(' · ');
            text = `${h.winnerId ? `${nameOf(h.winnerId)} ${h.winnerId === me ? 'gagnez' : 'gagne'}` : 'Nulle'} · ${tries}`;
          }
          const codes = v.mode === 'race' ? [Object.values(h.codes)[0]] : Object.values(h.codes);
          return (
            <li key={h.round}>
              <span className="mi-history__round">Manche {h.round}</span>
              <span className="mi-history__text">{text}</span>
              {codes.map((c, i) => <Code key={i} code={c} />)}
            </li>
          );
        })}
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
            <Button variant="secondary" size="lg" className="btn--block" onClick={onViewBoard}>Voir les plateaux</Button>
            <Button variant="secondary" size="lg" className="btn--block" onClick={() => navigate('/')}>Accueil</Button>
          </div>
        </div>
      </footer>
    </div>
  );
}
