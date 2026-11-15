import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { FLEET, cellName, randomFleet } from '../engine/index.js';
import { useApp, serverNow } from '@bgio/ui/lib/store.js';
import { act as sendAction, call } from '@bgio/ui/lib/socket.js';
import { errorMessage } from '@bgio/ui/lib/i18n.js';
import { haptic, sound } from '@bgio/ui/lib/feedback.js';
import { useMediaQuery } from '@bgio/ui/lib/useMediaQuery.js';
import { Avatar, Button, IconButton, Sheet } from '@bgio/ui/components/ui.jsx';
import Icon from '@bgio/ui/components/Icon.jsx';
import { toast, useToastPlacement } from '@bgio/ui/components/Toaster.jsx';
import SettingsSheet from '@bgio/ui/components/SettingsSheet.jsx';
import Board from './Board.jsx';
import PlacementBoard from './Placement.jsx';
import RulesSheet from './RulesSheet.jsx';
import { MODE_LABELS, SHIP_NAMES, shipWithArticle } from './i18n.js';
import './naval.css';
import './game.css';

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

/** The time left for the current turn, as a draining bar (CSS animation, no re-render). */
function TurnTimer({ turn }) {
  const [elapsed] = useState(() => (turn?.endsAt ? Math.max(0, turn.durationMs - Math.max(0, turn.endsAt - serverNow())) : 0));
  if (!turn?.endsAt || !turn.durationMs) return <div className="nv-timer is-idle" />;
  return (
    <div className="nv-timer" aria-hidden>
      <span style={{ animationDuration: `${turn.durationMs}ms`, animationDelay: `-${elapsed}ms` }} />
    </div>
  );
}

function useSecondsLeft(endsAt) {
  const [left, setLeft] = useState(null);
  useEffect(() => {
    if (!endsAt) { setLeft(null); return undefined; }
    const tick = () => setLeft(Math.max(0, Math.ceil((endsAt - serverNow()) / 1000)));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [endsAt]);
  return left;
}

/** One mark per ship of the fleet, long or short like the ship; struck through once sunk. */
function FleetPips({ sunk }) {
  return (
    <span className="nv-pips" aria-label={`${FLEET.length - sunk.length} navires à flot`}>
      {FLEET.map(({ type, len }) => (
        <span key={type} className={`nv-pip ${sunk.includes(type) ? 'is-sunk' : ''}`} style={{ '--len': len }} title={SHIP_NAMES[type]} />
      ))}
    </span>
  );
}

function Who({ player, me, size = 26 }) {
  return player.isBot
    ? <span className="nv-bot" style={{ width: size, height: size }}><Icon name="bot" size={Math.round(size * 0.62)} /></span>
    : <Avatar name={player.nickname} index={player.index} size={size} />;
}

// ---------------------------------------------------------------------------
// Frame: top bar, menu, rules, leave, host pause
// ---------------------------------------------------------------------------

function Frame({ room, readOnly, onExitBoard, title, children }) {
  const navigate = useNavigate();
  const me = useApp((s) => s.session?.playerId);
  const [sheet, setSheet] = useState(null);
  const isHost = room.hostId === me;
  const playing = !readOnly && room.status === 'playing';
  const hostPaused = !!room.turn?.pausedByHost;
  const hostName = room.players.find((p) => p.id === room.hostId)?.nickname ?? 'L’hôte';

  const togglePause = async () => {
    try {
      await call(hostPaused ? 'room:resume' : 'room:pause', { roomId: room.id });
      haptic('light');
    } catch (e) {
      toast({ title: errorMessage(e.code, e.details), tone: 'error' });
    }
  };

  return (
    <div className="nv-ocean nv-game">
      <header className="nv-bar">
        <IconButton icon="settings" label="Réglages" onClick={() => setSheet('menu')} className="nv-icon" />
        <div className="nv-bar__title">{title}</div>
        <div className="nv-bar__side">
          {isHost && playing && (
            <IconButton icon={hostPaused ? 'play' : 'pause'} label={hostPaused ? 'Reprendre la partie' : 'Mettre en pause'} onClick={togglePause} className="nv-icon" />
          )}
          <IconButton icon="book" label="Règles" onClick={() => setSheet('rules')} className="nv-icon" />
        </div>
      </header>

      {children}

      <AnimatePresence>
        {hostPaused && playing && (
          <motion.div className="nv-paused" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="status">
            <motion.div className="nv-paused__card" initial={{ scale: 0.92, y: 10 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', bounce: 0.3, duration: 0.45 }}>
              <strong>Partie en pause</strong>
              <span className="nv-paused__text">{isHost ? 'Les chronos et les robots sont arrêtés.' : `${hostName} a mis la partie en pause.`}</span>
              {isHost && (
                <button type="button" className="nv-gold-btn" onClick={togglePause} autoFocus>
                  <Icon name="play" size={18} strokeWidth={2.4} /> Reprendre
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <SettingsSheet open={sheet === 'menu'} onClose={() => setSheet(null)}>
        <div className="settings__group">
          <span className="eyebrow">Partie · salon {room.id}</span>
          <Button variant="secondary" icon="book" onClick={() => setSheet('rules')}>Règles de NavalIO</Button>
          {isHost && playing && (
            <Button variant="secondary" icon={hostPaused ? 'play' : 'pause'} onClick={() => { setSheet(null); togglePause(); }}>
              {hostPaused ? 'Reprendre la partie' : 'Mettre la partie en pause'}
            </Button>
          )}
          {readOnly
            ? <Button variant="secondary" icon="back" onClick={() => { setSheet(null); onExitBoard?.(); }}>Retour aux résultats</Button>
            : <Button variant="danger" icon="logout" onClick={() => setSheet('leave')}>Quitter la partie</Button>}
        </div>
      </SettingsSheet>
      <RulesSheet open={sheet === 'rules'} onClose={() => setSheet(null)} />
      <Sheet
        open={sheet === 'leave'}
        onClose={() => setSheet(null)}
        title="Quitter la partie ?"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setSheet(null)}>Annuler</Button>
            <Button variant="danger" onClick={() => navigate('/')}>Quitter</Button>
          </>
        )}
      >
        <p className="sheet-lead">Votre place est gardée : vous pourrez revenir depuis l’accueil. En votre absence, vos tirs seront joués automatiquement.</p>
      </Sheet>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

function PlacementScreen({ room, me, readOnly }) {
  const v = room.game;
  const [layout, setLayout] = useState(() => randomFleet());
  const [busy, setBusy] = useState(false);
  const meReady = v.players.find((p) => p.id === me)?.ready;
  const left = useSecondsLeft(room.turn?.pausedByHost ? null : room.turn?.endsAt);
  const players = v.players.map((p, i) => ({ ...p, ...room.players.find((rp) => rp.id === p.id), index: i }));
  const waiting = players.filter((p) => !p.ready).length;

  const ready = async () => {
    setBusy(true);
    try {
      await sendAction(room.id, { type: 'place', fleet: layout });
      sound('success');
      haptic('success');
    } catch (e) {
      sound('error');
      toast({ title: errorMessage(e.code, e.details), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  // Once ready, the fleet shown is the one the server has.
  const shown = meReady && v.myFleet ? v.myFleet.map(({ type, cell, dir }) => ({ type, cell, dir })) : layout;

  return (
    <div className="nv-place">
      <div className="nv-place__head">
        <h1>{meReady ? 'Flotte en position' : 'Placez votre flotte'}</h1>
        <p>{meReady
          ? (waiting ? `En attente de ${waiting} joueur${waiting > 1 ? 's' : ''}…` : 'La bataille commence !')
          : 'Glissez un navire pour le déplacer, touchez-le pour le faire pivoter. Les navires ne se touchent pas, même par un coin.'}
        </p>
      </div>

      <PlacementBoard layout={shown} onChange={setLayout} disabled={meReady || readOnly || busy} />

      {!meReady && !readOnly && (
        <div className="nv-place__actions">
          <Button variant="secondary" icon="shuffle" onClick={() => { setLayout(randomFleet()); sound('shuffle'); haptic('light'); }} disabled={busy}>Aléatoire</Button>
          <Button variant="primary" icon="check" onClick={ready} loading={busy}>Prêt</Button>
        </div>
      )}

      <div className="nv-place__players">
        {players.map((p) => (
          <span key={p.id} className={`nv-ready ${p.ready ? 'is-ready' : ''}`}>
            <Who player={p} me={me} size={22} />
            <span>{p.id === me ? 'Vous' : p.nickname}</span>
            {p.ready ? <Icon name="check" size={14} strokeWidth={3} /> : <span className="nv-dots" aria-label="en train de placer"><i /><i /><i /></span>}
          </span>
        ))}
      </div>
      {left != null && (
        <p className="nv-place__clock tabular">
          {meReady ? 'La bataille commence au plus tard dans' : 'Placement automatique dans'} {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Battle
// ---------------------------------------------------------------------------

function Battle({ room, me, readOnly }) {
  const v = room.game;
  const turn = room.turn;
  const finePointer = useMediaQuery('(pointer: fine)');
  const wide = useMediaQuery('(min-width: 900px)');
  const players = v.players.map((p, i) => ({ ...p, ...room.players.find((rp) => rp.id === p.id), nickname: room.players.find((rp) => rp.id === p.id)?.nickname ?? p.nickname, index: i }));
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  const nameOf = (id) => (id === me ? 'Vous' : byId[id]?.nickname ?? '—');
  const mine = byId[me];
  const opponents = players.filter((p) => p.id !== me);
  const salvo = v.mode === 'salvo';
  const paused = !!turn?.pausedByHost || turn?.endsAt == null;
  const myTurn = !readOnly && v.phase === 'battle' && v.turn === me && !turn?.pausedByHost;

  // ---- shells in flight, impacts, sinking ships --------------------------------
  // The server already knows every result; the table shows it when the shell lands.
  const [flights, setFlights] = useState([]);
  const [fx, setFx] = useState([]);
  const [fresh, setFresh] = useState([]);
  const [moment, setMoment] = useState(null);
  const [aims, setAims] = useState([]); // { targetId, cell } chosen, not fired yet
  const [sending, setSending] = useState([]); // fired, waiting for the server
  const [active, setActive] = useState(opponents[0]?.id); // phone: the board on screen
  const ids = useRef(1);
  const lastTurn = useRef(v.lastVolley?.turn ?? 0);
  const flightsRef = useRef(flights);
  flightsRef.current = flights;
  const vRef = useRef(v);
  vRef.current = v;
  const slides = useRef({});

  const show = (id, smooth = true) => {
    if (!id || id === me) return;
    setActive(id);
    slides.current[id]?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', inline: 'center', block: 'nearest' });
  };

  useLayoutEffect(() => {
    const vol = v.lastVolley;
    if (!vol || vol.turn <= lastTurn.current) return;
    lastTurn.current = vol.turn;
    setSending([]);
    const from = vol.shooterId === me ? 'near' : 'far';
    setFlights((f) => [...f, ...vol.shots.map((s, i) => ({ id: ids.current++, ...s, from, delay: i * 0.14 }))]);
    sound('cannon');
    // Phone: follow the action when someone else shoots at another fleet.
    const target = vol.shots[0]?.targetId;
    if (!wide && vol.shooterId !== me && target !== me) show(target);
  }, [v.lastVolley?.turn]); // eslint-disable-line react-hooks/exhaustive-deps

  const land = (id) => {
    const f = flightsRef.current.find((x) => x.id === id);
    if (!f) return;
    setFlights((list) => list.filter((x) => x.id !== id));
    const kind = f.sunk ? 'sunk' : f.result === 'hit' ? 'boom' : 'splash';
    const fxId = ids.current++;
    setFx((list) => [...list, { id: fxId, targetId: f.targetId, cell: f.cell, kind }]);
    setTimeout(() => setFx((list) => list.filter((x) => x.id !== fxId)), kind === 'sunk' ? 1800 : 1300);
    sound(kind === 'splash' ? 'splash' : 'boom');
    if (f.targetId === me && f.result === 'hit') haptic('error');
    if (!f.sunk) return;
    const key = `${f.targetId}:${f.sunk}`;
    setFresh((list) => [...list, key]);
    setTimeout(() => setFresh((list) => list.filter((k) => k !== key)), 2400);
    setTimeout(() => sound('sink'), 250);
    const now = vRef.current;
    const gone = now.boards[f.targetId].sunk.length === FLEET.length;
    const mineHit = f.targetId === me;
    if (f.shooterId === me) haptic('success');
    setMoment({
      id: fxId,
      tone: mineHit ? 'bad' : f.shooterId === me ? 'good' : 'neutral',
      title: gone ? (mineHit ? 'Votre flotte est coulée' : 'Flotte anéantie !') : 'Coulé !',
      subtitle: gone
        ? (mineHit ? 'Vous suivez la fin de la bataille.' : `${nameOf(f.targetId)} est éliminé${f.shooterId === me ? ' par vous' : ''}.`)
        : mineHit
          ? `${nameOf(f.shooterId)} a coulé ${shipWithArticle(f.sunk, true)}`
          : `${f.shooterId === me ? 'Vous avez' : `${nameOf(f.shooterId)} a`} coulé ${shipWithArticle(f.sunk)} de ${nameOf(f.targetId)}`,
    });
  };
  useEffect(() => {
    if (!moment) return undefined;
    const t = setTimeout(() => setMoment(null), 2200);
    return () => clearTimeout(t);
  }, [moment]);

  // My turn starts: a sound, and no stale aims.
  const wasMyTurn = useRef(myTurn);
  useEffect(() => {
    if (myTurn && !wasMyTurn.current) { sound('turn'); haptic('turn'); }
    if (!myTurn) setAims([]);
    wasMyTurn.current = myTurn;
  }, [myTurn]);

  // ---- firing -------------------------------------------------------------------
  const fire = async (shots) => {
    setSending(shots);
    setAims([]);
    haptic('medium');
    try {
      await sendAction(room.id, { type: 'fire', shots });
    } catch (e) {
      setSending([]);
      sound('error');
      toast({ title: errorMessage(e.code, e.details), tone: 'error' });
    }
  };
  const same = (a, b) => a.targetId === b.targetId && a.cell === b.cell;
  const onCell = (targetId) => (cell) => {
    if (!myTurn || sending.length) return;
    const shot = { targetId, cell };
    if (salvo) {
      if (aims.some((a) => same(a, shot))) { setAims(aims.filter((a) => !same(a, shot))); sound('back'); return; }
      if (aims.length >= v.shotsDue) { toast({ title: `${v.shotsDue} tirs au maximum : retirez une cible d’abord.` }); haptic('error'); return; }
      setAims([...aims, shot]);
      sound('pick');
      haptic('light');
      return;
    }
    // One shot: a click fires; on a touch screen, a first tap aims and a second one fires.
    if (finePointer || (aims[0] && same(aims[0], shot))) fire([shot]);
    else { setAims([shot]); sound('pick'); haptic('light'); }
  };

  // ---- what each board shows -----------------------------------------------------
  const boardProps = (p) => {
    const b = v.boards[p.id];
    const flying = flights.filter((f) => f.targetId === p.id);
    const hidden = new Set(flying.map((f) => f.cell));
    const sinking = new Set(flying.filter((f) => f.sunk).map((f) => f.sunk));
    const received = Object.fromEntries(Object.entries(b.received).filter(([c]) => !hidden.has(Number(c))));
    const wrecks = b.sunk.filter((s) => !sinking.has(s.type)).map((s) => ({ ...s, fresh: fresh.includes(`${p.id}:${s.type}`) }));
    const wrecked = new Set(wrecks.map((w) => w.type));
    const ships = p.id === me
      ? (v.myFleet ?? []).filter((s) => !wrecked.has(s.type))
      : (b.fleet ?? []).filter((s) => !wrecked.has(s.type)); // fleets are revealed at the end
    return {
      received,
      wrecks,
      ships,
      fx: fx.filter((f) => f.targetId === p.id),
      shells: flying,
      onLand: land,
      aims: aims.filter((a) => a.targetId === p.id).map((a) => a.cell),
      locked: sending.filter((a) => a.targetId === p.id).map((a) => a.cell),
    };
  };

  const shooter = byId[v.turn];
  const sunkTypes = (id) => v.boards[id].sunk.map((s) => s.type);
  const log = v.history
    .filter((h) => !flights.some((f) => f.targetId === h.targetId && f.cell === h.cell))
    .slice(-8)
    .reverse();

  const header = (p) => (
    <div className={`nv-who ${v.turn === p.id ? 'is-turn' : ''} ${p.alive ? '' : 'is-out'}`}>
      <Who player={p} me={me} />
      <span className="nv-who__name">{p.id === me ? 'Votre flotte' : p.nickname}</span>
      {p.alive ? <FleetPips sunk={sunkTypes(p.id)} /> : <span className="nv-who__out">Coulée</span>}
      {p.connected === false && !p.isBot && p.alive && <span className="nv-who__away" title="Absent : ses tirs sont joués automatiquement">absent</span>}
    </div>
  );

  // ---- the action panel ------------------------------------------------------------
  let panel;
  if (readOnly) {
    panel = <p className="nv-panel__line">Partie terminée : toutes les flottes sont révélées.</p>;
  } else if (v.phase === 'final') {
    panel = <p className="nv-panel__line">La bataille est terminée…</p>;
  } else if (mine && !mine.alive) {
    panel = <p className="nv-panel__line">Votre flotte est coulée : vous suivez la fin de la bataille.</p>;
  } else if (myTurn) {
    const n = v.shotsDue;
    panel = (
      <>
        <p className="nv-panel__line">
          <strong>À vous de tirer</strong>
          <span>
            {salvo ? `Choisissez ${n} cible${n > 1 ? 's' : ''} (${aims.length}/${n})${wide ? ', même chez plusieurs adversaires' : ''}.`
              : finePointer ? 'Cliquez une case chez un adversaire.' : 'Touchez une case pour viser, puis encore pour tirer.'}
          </span>
        </p>
        {(salvo || (!finePointer && aims.length > 0)) && (
          <button type="button" className="nv-gold-btn nv-fire" disabled={aims.length !== (salvo ? n : 1) || sending.length > 0} onClick={() => fire(aims)}>
            <Icon name="target" size={18} strokeWidth={2.4} /> Feu{salvo ? ` (${aims.length}/${n})` : ''}
          </button>
        )}
      </>
    );
  } else {
    panel = (
      <p className="nv-panel__line">
        <strong>{shooter ? `${shooter.nickname} vise…` : '…'}</strong>
        <span>{paused ? 'Partie en pause.' : MODE_LABELS[v.mode]}</span>
      </p>
    );
  }

  const myBoard = mine && (
    <div className="nv-mine">
      {header(mine)}
      <Board className="nv-board--mine" tilt={28} {...boardProps(mine)} />
    </div>
  );

  const logList = (
    <ol className="nv-log" aria-label="Derniers tirs">
      {log.map((h, i) => (
        <li key={`${h.turn}-${h.targetId}-${h.cell}-${i}`} className={`is-${h.sunk ? 'sunk' : h.result}`}>
          <span className="nv-log__who">{nameOf(h.shooterId)}</span>
          <Icon name="arrowRight" size={12} />
          <span className="nv-log__who">{nameOf(h.targetId)}</span>
          <span className="nv-log__cell tabular">{cellName(h.cell)}</span>
          <span className="nv-log__res">{h.sunk ? `coulé (${SHIP_NAMES[h.sunk].toLowerCase()})` : h.result === 'hit' ? 'touché' : 'à l’eau'}</span>
        </li>
      ))}
    </ol>
  );

  return (
    <div className={`nv-battle nv-battle--${opponents.length}`}>
      {/* Phone: one adversary at a time, swipe or tap a tab. */}
      {!wide && opponents.length > 1 && (
        <div className="nv-tabs" role="tablist">
          {opponents.map((p) => (
            <button key={p.id} type="button" role="tab" aria-selected={active === p.id} className={`nv-tab ${active === p.id ? 'is-active' : ''} ${v.turn === p.id ? 'is-turn' : ''} ${p.alive ? '' : 'is-out'}`} onClick={() => show(p.id)}>
              <Who player={p} me={me} size={20} />
              <span>{p.nickname}</span>
              <span className="nv-tab__n tabular">{p.alive ? p.afloat : '✕'}</span>
              {aims.some((a) => a.targetId === p.id) && <span className="nv-tab__aim" aria-label="cible choisie" />}
            </button>
          ))}
        </div>
      )}

      <section
        className="nv-targets"
        onScroll={(e) => {
          if (wide) return;
          const el = e.currentTarget;
          const i = Math.round(el.scrollLeft / el.clientWidth);
          if (opponents[i] && opponents[i].id !== active) setActive(opponents[i].id);
        }}
      >
        {opponents.map((p) => (
          <div key={p.id} className={`nv-slide ${p.alive ? '' : 'is-out'}`} ref={(el) => { slides.current[p.id] = el; }}>
            {header(p)}
            <Board
              className="nv-board--target"
              tilt={30}
              {...boardProps(p)}
              onCell={myTurn && p.alive && !sending.length ? onCell(p.id) : undefined}
            />
          </div>
        ))}
      </section>

      <footer className="nv-dock">
        {myBoard}
        <div className="nv-panel">
          {v.phase === 'battle' && !readOnly && <TurnTimer key={`${turn?.key}-${turn?.endsAt}`} turn={turn} />}
          <div className="nv-panel__body">{panel}</div>
          {wide && logList}
        </div>
      </footer>

      <AnimatePresence>
        {moment && (
          <motion.div
            key={moment.id}
            className={`nv-banner is-${moment.tone}`}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
            transition={{ type: 'spring', bounce: 0.45, duration: 0.5 }}
            role="status"
          >
            <strong>{moment.title}</strong>
            <span>{moment.subtitle}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------

export default function Game({ room, readOnly = false, onExitBoard }) {
  const me = useApp((s) => s.session?.playerId);
  const v = room.game;
  // The bottom of the screen is my fleet and the action panel: notifications go to the top.
  useToastPlacement('top');
  const placing = v.phase === 'placement';
  const title = (
    <>
      <span className="nv-bar__name">NavalIO</span>
      <span className="nv-bar__chip">{placing ? 'Placement' : `Tour ${v.turnNumber}`}</span>
      <span className="nv-bar__mode">{MODE_LABELS[v.mode]}</span>
    </>
  );
  return (
    <Frame room={room} readOnly={readOnly} onExitBoard={onExitBoard} title={title}>
      {placing
        ? <PlacementScreen room={room} me={me} readOnly={readOnly} />
        : <Battle room={room} me={me} readOnly={readOnly} />}
    </Frame>
  );
}
