import { Suspense, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useApp } from '@bgio/ui/lib/store.js';
import { call, socket } from '@bgio/ui/lib/socket.js';
import { errorMessage } from '@bgio/ui/lib/i18n.js';
import { Button, Spinner } from '@bgio/ui/components/ui.jsx';
import Icon from '@bgio/ui/components/Icon.jsx';
import { toast } from '@bgio/ui/components/Toaster.jsx';
import { gameById } from '../../games.js';
import Lobby from './Lobby.jsx';
import './room.css';

// Leaving is deferred so that an immediate remount of the same room
// (React StrictMode, fast back/forward) does not drop us from it.
let pendingLeave = null;
function scheduleLeave(roomId) {
  clearTimeout(pendingLeave?.timer);
  pendingLeave = {
    roomId,
    timer: setTimeout(() => {
      pendingLeave = null;
      call('room:leave', { roomId }, { connectTimeoutMs: 2000 }).catch(() => {});
    }, 150),
  };
}
function cancelLeave(roomId) {
  if (pendingLeave?.roomId === roomId) { clearTimeout(pendingLeave.timer); pendingLeave = null; }
}

export default function RoomScreen() {
  const { code } = useParams();
  const roomId = code.toUpperCase();
  const navigate = useNavigate();
  const room = useApp((s) => (s.room?.id === roomId ? s.room : null));
  const connection = useApp((s) => s.connection);
  const [error, setError] = useState(null);
  const [viewBoard, setViewBoard] = useState(false);

  useEffect(() => {
    let alive = true;
    cancelLeave(roomId);
    setError(null);
    useApp.getState().setRoom(null);
    const join = () => call('room:join', { roomId })
      .then(({ room: r }) => { if (alive) { setError(null); useApp.getState().setRoom(r); } })
      .catch((e) => alive && setError(e.code));
    join();
    // After a reconnection the server may have restarted: rejoin to find out.
    socket.on('connect', join);
    const kicked = ({ roomId: id }) => {
      if (id !== roomId) return;
      toast({ title: errorMessage('KICKED'), tone: 'error' });
      navigate('/');
    };
    socket.on('room:kicked', kicked);
    return () => {
      alive = false;
      socket.off('connect', join);
      socket.off('room:kicked', kicked);
      // Leaving the page keeps a running game's seat: the server only marks us away.
      scheduleLeave(roomId);
      useApp.getState().setRoom(null);
    };
  }, [roomId, navigate]);

  useEffect(() => { if (room?.status !== 'finished') setViewBoard(false); }, [room?.status]);

  const client = room ? gameById(room.gameId) : null;
  const { Game, Results } = client ?? {};

  let view;
  if (error) view = 'error';
  else if (room && !client) view = 'unsupported';
  else if (!room) view = 'loading';
  else if (room.status === 'lobby') view = 'lobby';
  else if (room.status === 'playing' || viewBoard) view = 'game';
  else view = 'results';

  return (
    <div className="room-screen">
      <AnimatePresence>
        {room && connection !== 'online' && (
          <motion.div
            className="conn-banner material"
            role="status"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <Icon name="wifiOff" size={16} /> Connexion perdue, reconnexion…
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={view}
          className="room-screen__view"
          initial={{ opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.985, transition: { duration: 0.15 } }}
          transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
        >
          {view === 'error' && (
            <div className="state-screen">
              <div className="state-screen__icon"><Icon name="close" size={28} /></div>
              <h1>Oups</h1>
              <p>{errorMessage(error)}</p>
              <Button variant="primary" size="lg" onClick={() => navigate('/')}>Retour à l’accueil</Button>
            </div>
          )}
          {view === 'unsupported' && (
            <div className="state-screen">
              <h1>Jeu indisponible</h1>
              <p>Ce salon utilise un jeu que cette version du site ne connaît pas encore. Rechargez la page.</p>
              <Button variant="primary" size="lg" onClick={() => navigate('/')}>Retour à l’accueil</Button>
            </div>
          )}
          {view === 'loading' && <Loading />}
          {view === 'lobby' && <Lobby room={room} client={client} />}
          {view === 'game' && (
            <Suspense fallback={<Loading />}>
              <Game room={room} readOnly={room.status !== 'playing'} onExitBoard={() => setViewBoard(false)} />
            </Suspense>
          )}
          {view === 'results' && (
            <Suspense fallback={<Loading />}>
              <Results room={room} onViewBoard={() => setViewBoard(true)} />
            </Suspense>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function Loading() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 2500);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="state-screen">
      <Spinner size={28} />
      <p>{slow ? 'Le serveur se réveille, cela peut prendre jusqu’à une minute…' : 'Connexion au salon…'}</p>
    </div>
  );
}
