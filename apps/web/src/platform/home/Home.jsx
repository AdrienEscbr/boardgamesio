import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useApp } from '@bgio/ui/lib/store.js';
import { call } from '@bgio/ui/lib/socket.js';
import { errorMessage } from '@bgio/ui/lib/i18n.js';
import { sound, haptic } from '@bgio/ui/lib/feedback.js';
import { Avatar, Button, IconButton, Spinner } from '@bgio/ui/components/ui.jsx';
import Icon from '@bgio/ui/components/Icon.jsx';
import { toast } from '@bgio/ui/components/Toaster.jsx';
import SettingsSheet from '@bgio/ui/components/SettingsSheet.jsx';
import NicknameSheet from '@bgio/ui/components/NicknameSheet.jsx';
import { GAMES, UPCOMING, gameById } from '../../games.js';
import OpenGames, { FitCover } from './OpenGames.jsx';
import './home.css';

const Hero3D = lazy(() => import('./Hero3D.jsx'));
const CODE_LENGTH = 5;
const CODE_CHARS = /[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]/;

function extractCode(text) {
  const fromLink = /room\/([a-z0-9]{5})/i.exec(text);
  const raw = (fromLink ? fromLink[1] : text).toUpperCase();
  return [...raw].filter((c) => CODE_CHARS.test(c)).join('').slice(0, CODE_LENGTH);
}

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } } };
const rise = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', bounce: 0, duration: 0.6 } },
};

export default function Home() {
  const navigate = useNavigate();
  const session = useApp((s) => s.session);
  const connection = useApp((s) => s.connection);
  const [activeGames, setActiveGames] = useState([]);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(null); // gameId being created, or id of the room being joined
  const [sheet, setSheet] = useState(null); // 'settings' | 'nickname'
  const [slowServer, setSlowServer] = useState(false);
  const codeRef = useRef(null);

  useEffect(() => {
    useApp.getState().setRoom(null);
    let alive = true;
    call('session:get').then(({ session: s }) => alive && setActiveGames(s.activeGames || [])).catch(() => {});
    return () => { alive = false; };
  }, [connection]);

  // Render's free tier sleeps: explain the wait instead of looking broken.
  useEffect(() => {
    if (connection === 'online') { setSlowServer(false); return undefined; }
    const t = setTimeout(() => setSlowServer(true), 2500);
    return () => clearTimeout(t);
  }, [connection]);

  const create = async (gameId) => {
    setBusy(gameId);
    try {
      const { room } = await call('room:create', { gameId });
      sound('join');
      navigate(`/room/${room.id}`);
    } catch (e) {
      toast({ title: errorMessage(e.code, e.details), tone: 'error' });
      setBusy(null);
    }
  };

  const joinRoom = async (roomId) => {
    setBusy(roomId);
    try {
      await call('room:join', { roomId });
      sound('join');
      navigate(`/room/${roomId}`);
    } catch (err) {
      // The room filled up or started meanwhile: the open list corrects itself through its own push.
      sound('error');
      haptic('error');
      toast({ title: errorMessage(err.code, err.details), tone: 'error' });
      setBusy(null);
    }
  };

  const join = (e) => {
    e?.preventDefault();
    if (code.length !== CODE_LENGTH) { codeRef.current?.focus(); return; }
    joinRoom(code);
  };

  const resume = activeGames[0];

  return (
    <main className="home">
      <div className="home__hero" aria-hidden>
        <Suspense fallback={null}>
          <Hero3D />
        </Suspense>
      </div>

      <header className="home__topbar">
        <IconButton icon="settings" label="Réglages" onClick={() => setSheet('settings')} />
      </header>

      <motion.div className="home__content" variants={stagger} initial="hidden" animate="show">
        <motion.div variants={rise} className="home__brand">
          <h1 className="home__title">BoardGames<span>IO</span></h1>
          <p className="home__tagline">Des jeux de société, entre amis, partout.</p>
        </motion.div>

        <AnimatePresence>
          {resume && (
            <motion.button
              type="button"
              className="resume material"
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              onClick={() => navigate(`/room/${resume.id}`)}
            >
              <span className="resume__pulse" aria-hidden />
              <span className="resume__text">
                <strong>Partie en cours · {gameById(resume.gameId)?.name ?? 'Jeu'}</strong>
                <span>Salon {resume.id} · reprendre où vous en étiez</span>
              </span>
              <Icon name="play" size={18} />
            </motion.button>
          )}
        </AnimatePresence>

        <div className="home__grid">
          <motion.section variants={rise} className="home__panel card home__panel--identity">
            <button type="button" className="identity" onClick={() => setSheet('nickname')} disabled={!session}>
              <Avatar name={session?.nickname} size={44} />
              <span className="identity__text">
                <span className="eyebrow">Votre pseudo</span>
                <span className="identity__name">{session?.nickname ?? '…'}</span>
              </span>
              <Icon name="edit" size={18} className="identity__edit" />
            </button>

          </motion.section>

          <motion.div variants={rise} className="home__open">
            <OpenGames
              connection={connection}
              busy={busy}
              onJoin={joinRoom}
            />
          </motion.div>

          <motion.section variants={rise} className="games" aria-labelledby="games-title">
            <h2 id="games-title" className="games__title">Créer une partie</h2>
            <div className="games__grid">
              {[...GAMES, ...UPCOMING].map((g) => {
                const upcoming = !g.players;
                return (
                  <article key={g.id} className={`game-card card ${upcoming ? 'is-upcoming' : ''}`} aria-disabled={upcoming || undefined}>
                    <header className="game-card__head">
                      <div>
                        <h3 className="game-card__name">{g.name} {upcoming && <span className="chip chip--accent">Bientôt</span>}</h3>
                        {g.author && <p className="game-card__author">par {g.author}</p>}
                      </div>
                      <FitCover game={g} className="game-card__thumb" />
                    </header>
                    <p className="game-card__tagline">{g.tagline}</p>
                    {!upcoming && (
                      <>
                        <p className="game-card__meta"><Icon name="cards" size={14} /> {g.players.min === g.players.max ? g.players.min : `${g.players.min} à ${g.players.max}`} joueurs{g.supportsBots ? ' · robots' : ''}</p>
                        <Button variant="primary" className="btn--block" icon="plus" onClick={() => create(g.id)} loading={busy === g.id} disabled={!!busy}>
                          Créer une partie
                        </Button>
                      </>
                    )}
                  </article>
                );
              })}
            </div>
          </motion.section>

          <motion.section variants={rise} className="home__panel card home__join" aria-labelledby="join-title">
            <h2 id="join-title" className="games__title">Rejoindre avec un code</h2>

            <form className="join" onSubmit={join}>
              <label className="code-input" onClick={() => codeRef.current?.focus()}>
                <span className="sr-only">Code du salon</span>
                <input
                  ref={codeRef}
                  className="code-input__field"
                  value={code}
                  onChange={(e) => setCode(extractCode(e.target.value))}
                  inputMode="text"
                  autoCapitalize="characters"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="go"
                  maxLength={64}
                  aria-label="Code du salon (5 caractères)"
                />
                {Array.from({ length: CODE_LENGTH }, (_, i) => (
                  <span key={i} className={`code-input__slot ${i === code.length ? 'is-caret' : ''} ${code[i] ? 'is-filled' : ''}`} aria-hidden>
                    {code[i] ?? ''}
                  </span>
                ))}
              </label>
              <Button
                type="submit"
                variant="secondary"
                size="lg"
                icon="enter"
                className="join__submit"
                aria-label="Rejoindre le salon"
                title="Rejoindre"
                loading={busy === code}
                disabled={!!busy || code.length !== CODE_LENGTH}
              />
            </form>
          </motion.section>
        </div>


        <AnimatePresence>
          {slowServer && connection !== 'online' && (
            <motion.p className="home__status" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Spinner size={14} /> Le serveur se réveille, cela peut prendre jusqu’à une minute…
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>

      <SettingsSheet open={sheet === 'settings'} onClose={() => setSheet(null)} />
      <NicknameSheet open={sheet === 'nickname'} onClose={() => setSheet(null)} />
    </main>
  );
}
