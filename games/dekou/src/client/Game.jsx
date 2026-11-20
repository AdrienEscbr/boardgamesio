import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useApp, serverNow } from '@bgio/ui/lib/store.js';
import { act as sendAction, call } from '@bgio/ui/lib/socket.js';
import { errorMessage } from '@bgio/ui/lib/i18n.js';
import { haptic, sound } from '@bgio/ui/lib/feedback.js';
import { Avatar, Button, IconButton, Sheet } from '@bgio/ui/components/ui.jsx';
import Icon from '@bgio/ui/components/Icon.jsx';
import { toast, useToastPlacement } from '@bgio/ui/components/Toaster.jsx';
import SettingsSheet from '@bgio/ui/components/SettingsSheet.jsx';
import { BOX_COLS, COLS, ROWS, emptyInRow, inBox, isEnclosed, neighbours, settleBoard } from '../engine/game.js';
import { cellHTML, cubeHTML, dieHTML, pieceNode, shellHTML } from './pieces.js';
import RulesSheet from './RulesSheet.jsx';
import { MISS_LABELS, ORDERS, ROW_NAMES, coord, plural } from './i18n.js';
import './fonts.js';
import './dekou.css';

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const centre = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
const rectOf = (id) => document.getElementById(id)?.getBoundingClientRect() ?? null;
const holeId = (r, c) => `dk-h-${r}-${c}`;
const cellKey = (r, c) => `${r}-${c}`;
const wait = (ms) => new Promise((res) => { setTimeout(res, reduced() ? Math.min(ms, 60) : ms); });
const GAUGE_PERIOD = 1100;

/** Time left, as a draining bar (CSS animation, no re-render). */
function TurnTimer({ turn }) {
  const [elapsed] = useState(() => (turn?.endsAt ? Math.max(0, turn.durationMs - Math.max(0, turn.endsAt - serverNow())) : 0));
  if (!turn?.endsAt || !turn.durationMs) return null;
  return (
    <span className="dk-timer" aria-hidden>
      <span style={{ animationDuration: `${turn.durationMs}ms`, animationDelay: `-${elapsed}ms` }} />
    </span>
  );
}

/** A copy of the board where dice keep their id, and their faces. */
function simulate(board) {
  const values = {};
  const b = board.map((row) => row.map((cell) => {
    if (cell?.kind === 'die') { values[cell.id] = cell.value; return { kind: 'die', id: cell.id }; }
    return cell ? { kind: cell.kind } : null;
  }));
  return { b, value: (id) => values[id] };
}

/** Dice a change would bring back (ids), the board being changed by `edit`. */
function doomedBy(board, edit) {
  const { b, value } = simulate(board);
  edit(b);
  return new Set(settleBoard(b, value).flat().map((d) => d.id));
}

/**
 * The staff table. `local` (design review page) replaces the server:
 * `{ me, act(action), togglePause?, onFinished? }`.
 */
export default function Game({ room, readOnly = false, onExitBoard, local }) {
  const navigate = useNavigate();
  const sessionId = useApp((s) => s.session?.playerId);
  const me = local?.me ?? sessionId;
  const v = room.game;
  const turn = room.turn;
  const isHost = room.hostId === me;
  const [sheet, setSheet] = useState(null);
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState(null);
  const [hover, setHover] = useState(null);
  const [animating, setAnimating] = useState(false);
  // What the effects still owe the board: cells shown empty until a piece lands, pieces
  // shown although they left (until they fly away), dice not yet back in a hand.
  const [hold, setHold] = useState({ cells: {}, ghosts: {}, hands: {}, ball: false });
  const [reticle, setReticle] = useState(null);
  useToastPlacement('top');

  const players = v.players.map((p) => {
    const rp = room.players.find((x) => x.id === p.id);
    return { ...p, nickname: rp?.nickname ?? p.nickname ?? '—', connected: rp?.connected ?? true };
  });
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  const meP = byId[me] ?? players[0];
  const opp = players.find((p) => p.id !== meP.id) ?? players[1];
  const nameOf = (id) => (id === me ? 'Vous' : byId[id]?.nickname ?? '—');
  const hostPaused = !!turn?.pausedByHost;
  const playing = !readOnly && room.status === 'playing' && v.status === 'playing';
  const step = v.step;
  const myTurn = playing && v.myTurn && !hostPaused;
  const canAct = myTurn && !busy && !animating;
  const stepKey = step ? `${step.kind}-${step.item}-${step.playerId}-${v.turnNumber}-${v.phase}` : 'over';

  // A new order: forget the aim (kept between the tries of the same order).
  useEffect(() => { setTarget(null); setHover(null); }, [stepKey]);

  // ---- what each hole may do (feedforward) ---------------------------------------
  const can = (r, c) => {
    if (!canAct || !step) return false;
    const cell = v.board[r][c];
    if (step.kind === 'remove') return step.remaining.some((h) => h.row === r && h.col === c);
    if (step.kind === 'place') return inBox(2, c) && cell === null;
    if (step.item === 'die') return inBox(1, c) && cell === null;
    if (step.item === 'cube') return inBox(2, c) && cell === null;
    return isEnclosed(v.board, r, c);
  };

  const focus = (hover && can(hover.row, hover.col) ? hover : null) ?? target;
  const preview = useMemo(() => {
    if (!focus || !step) return null;
    const { row, col } = focus;
    const empty = emptyInRow(v.board, row);
    const at = coord(row, col);
    if (step.kind === 'throw' && step.item === 'die') {
      const need = empty - 1;
      return { row, doomed: new Set(), text: need >= 1 && need <= 6 ? `${at} : un ${need} rentre aussitôt` : `${at} : aucune face ne rentre sur cette ligne` };
    }
    if (step.kind === 'remove') {
      const doomed = doomedBy(v.board, (b) => { b[row][col] = null; });
      return { row, doomed, text: doomed.size ? `Retirer ${at} rapatrie ${plural(doomed.size, 'unité')}` : `Retirer ${at} : rien ne rentre encore` };
    }
    if (step.kind === 'throw' && step.item === 'ball') {
      const around = neighbours(row, col);
      const doomed = doomedBy(v.board, (b) => { for (const h of around) b[h.row][h.col] = null; });
      return { row: null, ring: around, doomed, text: `Frappe en ${at} : ${plural(around.length, 'bloc')} ${around.length > 1 ? 'sautent' : 'saute'}${doomed.size ? ` · jusqu’à ${plural(doomed.size, 'unité')}` : ''}` };
    }
    // a cube, thrown or placed
    const doomed = doomedBy(v.board, (b) => { b[row][col] = { kind: 'cube' }; });
    return { row, doomed, text: doomed.size ? `Un bloc en ${at} rapatrie ${plural(doomed.size, 'unité')}` : `${at} : ligne ${ROW_NAMES[row]} à ${empty - 1} trous vides` };
  }, [focus?.row, focus?.col, stepKey, v.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- sending -------------------------------------------------------------------
  const send = async (action) => {
    setBusy(true);
    try {
      await (local ? local.act(action) : sendAction(room.id, action));
    } catch (e) {
      sound('error');
      toast({ title: errorMessage(e.code, e.details), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const gaugeRef = useRef(0.5);
  const fire = () => {
    if (!canAct || !target || step?.kind !== 'throw') return;
    const precision = Math.max(0, 1 - Math.abs(gaugeRef.current - 0.5) * 2);
    haptic('medium');
    send({ type: 'throw', target, precision });
  };
  const fireRef = useRef(fire);
  fireRef.current = fire;
  useEffect(() => {
    const onKey = (e) => {
      if ((e.key === ' ' || e.key === 'Enter') && !e.target.closest?.('button, input, textarea, select')) { e.preventDefault(); fireRef.current(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onHole = (r, c) => {
    if (!can(r, c)) return;
    if (step.kind === 'remove') { sound('rubble'); send({ type: 'remove', cell: { row: r, col: c } }); return; }
    if (step.kind === 'place') { send({ type: 'place', cell: { row: r, col: c } }); return; }
    sound('pick');
    haptic('light');
    setTarget({ row: r, col: c });
  };

  // ---- effects: play the table's events in order ------------------------------------
  const seen = useRef(v.events.reduce((m, e) => Math.max(m, e.n), -1));
  const queue = useRef([]);
  const running = useRef(false);
  const alive = useRef(true);
  const fxRef = useRef(null);
  useEffect(() => {
    alive.current = true;
    if (queue.current.length) run();
    return () => { alive.current = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (fn) => setHold((h) => {
    const n = { cells: { ...h.cells }, ghosts: { ...h.ghosts }, hands: { ...h.hands }, ball: h.ball };
    fn(n);
    return n;
  });
  const bump = (obj, k, d) => { obj[k] = (obj[k] ?? 0) + d; if (obj[k] <= 0) delete obj[k]; };

  useEffect(() => {
    const fresh = v.events.filter((e) => e.n > seen.current);
    if (!fresh.length) return;
    seen.current = Math.max(...fresh.map((e) => e.n));
    if (readOnly) return;
    patch((n) => {
      for (const e of fresh) {
        if (e.type === 'throw' && e.hit && e.item !== 'ball') bump(n.cells, cellKey(e.hole.row, e.hole.col), 1);
        if (e.type === 'throw' && e.hit && e.item === 'ball') n.ball = true;
        if (e.type === 'place') bump(n.cells, cellKey(e.cell.row, e.cell.col), 1);
        if (e.type === 'recover') {
          for (const d of e.dice) n.ghosts[cellKey(d.row, d.col)] = dieHTML(d.value, d.color, d.seat);
          bump(n.hands, e.playerId, e.dice.length);
        }
        if (e.type === 'reclaim') bump(n.hands, e.playerId, e.dice.length);
        if (e.type === 'remove') n.ghosts[cellKey(e.cell.row, e.cell.col)] = cubeHTML();
      }
    });
    queue.current.push(...fresh);
    run();
  }, [v.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run() {
    if (running.current) return;
    running.current = true;
    setAnimating(true);
    while (queue.current.length && alive.current) {
      const e = queue.current.shift();
      try { await play(e); } catch { /* an effect must never block the table */ }
    }
    running.current = false;
    if (alive.current) setAnimating(false);
  }

  /** Flies a piece along an arc; resolves on landing with the node (still on screen). */
  function fly(html, from, to, { dur = 680, lift = 90, spin = 0, scale = 1.6, faces = null } = {}) {
    const layer = fxRef.current;
    if (!layer || !from || !to) return Promise.resolve(null);
    const node = pieceNode(html);
    const shadow = document.createElement('span');
    shadow.className = 'dk-flyshadow';
    layer.append(shadow, node);
    const d = reduced() ? 1 : dur;
    const mid = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - lift };
    const k = (p, s, r) => ({ transform: `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) scale(${s}) rotate(${r}deg)` });
    node.animate([k(from, 0.85, 0), k(mid, scale, spin / 2), k(to, 1, spin)], { duration: d, easing: 'cubic-bezier(.33,.1,.4,1)', fill: 'forwards' });
    shadow.animate([
      { transform: `translate(${from.x}px, ${from.y + 8}px) translate(-50%, -50%) scale(.7)`, opacity: 0.45 },
      { transform: `translate(${mid.x}px, ${(from.y + to.y) / 2 + 26}px) translate(-50%, -50%) scale(.45)`, opacity: 0.18 },
      { transform: `translate(${to.x}px, ${to.y + 4}px) translate(-50%, -50%) scale(1)`, opacity: 0.5 },
    ], { duration: d, easing: 'cubic-bezier(.33,.1,.4,1)', fill: 'forwards' });
    // a die tumbles: its face changes in the air, the real one shows at the end
    let tumble = null;
    if (faces) {
      tumble = setInterval(() => {
        const n = 1 + Math.floor(Math.random() * 6);
        node.innerHTML = dieHTML(n, faces.color, faces.seat);
      }, 85);
    }
    return new Promise((res) => {
      setTimeout(() => {
        if (tumble) { clearInterval(tumble); node.innerHTML = dieHTML(faces.value, faces.color, faces.seat); }
        shadow.remove();
        res(node);
      }, d);
    });
  }

  function stamp(text, at, tone = '') {
    const layer = fxRef.current;
    if (!layer || !at) return;
    const el = document.createElement('span');
    el.className = `dk-stamp ${tone}`;
    el.textContent = text;
    el.style.left = `${at.x}px`;
    el.style.top = `${at.y}px`;
    layer.appendChild(el);
    el.animate([
      { transform: 'translate(-50%, -50%) scale(1.8) rotate(-8deg)', opacity: 0 },
      { transform: 'translate(-50%, -50%) scale(1) rotate(-4deg)', opacity: 1, offset: 0.15 },
      { transform: 'translate(-50%, -50%) scale(1) rotate(-4deg)', opacity: 1, offset: 0.75 },
      { transform: 'translate(-50%, -80%) scale(.96) rotate(-4deg)', opacity: 0 },
    ], { duration: reduced() ? 900 : 1400, easing: 'ease-out' }).onfinish = () => el.remove();
  }

  const holeCentre = (r, c) => { const rr = rectOf(holeId(r, c)); return rr && centre(rr); };
  const campCentre = (pid) => { const rr = rectOf(`dk-hand-${pid}`) ?? rectOf(`dk-camp-${pid}`); return rr && centre(rr); };
  /** Screen point of a landing given in hole units, around the aimed hole. */
  function pointOf(e) {
    const base = e.target.col < BOX_COLS ? 0 : BOX_COLS;
    const a = holeCentre(0, base); const b = holeCentre(0, base + 1); const c = holeCentre(1, base);
    const t = holeCentre(e.target.row, e.target.col);
    if (!a || !b || !c || !t) return t;
    return { x: t.x + (e.point.x - e.target.col) * (b.x - a.x), y: t.y + (e.point.y - e.target.row) * (c.y - a.y) };
  }
  const flash = (r, c, cls) => {
    const el = document.getElementById(holeId(r, c));
    if (!el || reduced()) return;
    el.classList.remove(cls);
    void el.offsetWidth; // restart the animation
    el.classList.add(cls);
  };

  async function play(e) {
    if (e.type === 'throw') {
      const from = campCentre(e.playerId);
      const to = pointOf(e);
      // the opponent's aim shows for a moment, so their throw can be followed
      if (e.playerId !== me) {
        setReticle({ row: e.target.row, col: e.target.col });
        await wait(380);
        setReticle(null);
      }
      const html = e.item === 'die' ? dieHTML(e.value, e.color, e.seat) : e.item === 'cube' ? cubeHTML() : shellHTML();
      if (e.item === 'ball') sound('whistle');
      const spin = e.item === 'ball' ? 0 : (e.point.x > e.target.col ? 1 : -1) * (300 + Math.random() * 300);
      const node = await fly(html, from, to, { spin, lift: e.item === 'ball' ? 140 : 90, faces: e.item === 'die' ? { value: e.value, color: e.color, seat: e.seat } : null });
      if (e.hit) {
        node?.remove();
        if (e.item === 'ball') {
          patch((n) => { n.ball = false; });
          sound('boom');
          haptic('medium');
          flash(e.hole.row, e.hole.col, 'is-blast');
        } else {
          patch((n) => bump(n.cells, cellKey(e.hole.row, e.hole.col), -1));
          sound(e.item === 'die' ? 'thud' : 'concrete');
          flash(e.hole.row, e.hole.col, 'is-landed');
        }
        await wait(160);
        return;
      }
      // a miss: the piece skids off and fades; the reason is stamped where it fell
      sound('whiff');
      if (node) {
        const dx = (to.x - from.x) * 0.18;
        node.animate([{ opacity: 1 }, { opacity: 0, transform: `translate(${to.x + dx}px, ${to.y + 26}px) translate(-50%, -50%) scale(.7)` }], { duration: 420, easing: 'ease-in', fill: 'forwards' }).onfinish = () => node.remove();
      }
      const last = e.tries >= 3;
      stamp(last && e.item === 'die' ? 'Unité perdue' : MISS_LABELS[e.reason] ?? 'Raté', to, 'is-bad');
      await wait(last ? 520 : 420);
      return;
    }
    if (e.type === 'recover') {
      for (const d of e.dice) flash(d.row, d.col, 'is-rallying');
      const at = holeCentre(e.dice[0].row, e.dice[0].col);
      sound('rally');
      haptic(e.playerId === me ? 'success' : 'light');
      stamp(e.dice.length > 1 ? `${e.dice.length} unités rapatriées` : 'Unité rapatriée', at && { x: at.x, y: at.y - 30 }, e.playerId === me ? 'is-good' : '');
      await wait(720);
      const to = campCentre(e.playerId);
      const flights = e.dice.map((d) => {
        const from = holeCentre(d.row, d.col);
        patch((n) => { delete n.ghosts[cellKey(d.row, d.col)]; });
        return fly(dieHTML(d.value, d.color, d.seat), from, to, { dur: 520, lift: 40, scale: 1.2 }).then((node) => node?.remove());
      });
      await Promise.all(flights);
      patch((n) => bump(n.hands, e.playerId, -e.dice.length));
      sound('pick');
      return;
    }
    if (e.type === 'reclaim') {
      const from = (() => { const rr = rectOf(`dk-disc-${e.playerId}`); return rr && centre(rr); })();
      const to = campCentre(e.playerId);
      stamp(`${plural(e.dice.length, 'unité rappelée', 'unités rappelées')}`, from, 'is-good');
      await Promise.all(e.dice.map((d, i) => wait(i * 90).then(() => fly(dieHTML(d.value, d.color, d.seat), from, to, { dur: 480, lift: 30, scale: 1.15 })).then((node) => node?.remove())));
      patch((n) => bump(n.hands, e.playerId, -e.dice.length));
      return;
    }
    if (e.type === 'place') {
      const to = holeCentre(e.cell.row, e.cell.col);
      const node = await fly(cubeHTML(), to && { x: to.x, y: to.y - 70 }, to, { dur: 320, lift: 0, scale: 1.25 });
      node?.remove();
      patch((n) => bump(n.cells, cellKey(e.cell.row, e.cell.col), -1));
      sound('concrete');
      flash(e.cell.row, e.cell.col, 'is-landed');
      await wait(120);
      return;
    }
    if (e.type === 'remove') {
      const key = cellKey(e.cell.row, e.cell.col);
      if (e.playerId !== me) sound('rubble');
      flash(e.cell.row, e.cell.col, 'is-cleared');
      await wait(380);
      patch((n) => { delete n.ghosts[key]; });
      return;
    }
    if (e.type === 'discard') {
      const rr = rectOf(`dk-disc-${e.playerId}`);
      if (rr) document.getElementById(`dk-disc-${e.playerId}`)?.animate([{ transform: 'scale(1.25)' }, { transform: 'none' }], { duration: 380 });
      return;
    }
    if (e.type === 'skip') {
      stamp('Frappe annulée', campCentre(e.playerId));
      await wait(300);
      return;
    }
    if (e.type === 'openingTie') {
      stamp('Égalité : on relance', holeCentre(2, 1));
      await wait(700);
      return;
    }
    if (e.type === 'openingWon') {
      sound('turn');
      stamp(e.playerId === me ? 'Vous engagez' : `${nameOf(e.playerId)} engage`, holeCentre(2, 3));
      await wait(800);
    }
  }

  // My order after a wait: a call.
  const wasMyTurn = useRef(myTurn);
  useEffect(() => {
    if (myTurn && !wasMyTurn.current) { sound('turn'); haptic('turn'); }
    wasMyTurn.current = myTurn;
  }, [myTurn]);

  const togglePause = async () => {
    if (local) { local.togglePause?.(); return; }
    try {
      await call(hostPaused ? 'room:resume' : 'room:pause', { roomId: room.id });
      haptic('light');
    } catch (e) {
      toast({ title: errorMessage(e.code, e.details), tone: 'error' });
    }
  };

  // ---- words ----------------------------------------------------------------------
  const order = (() => {
    if (!step) return { eyebrow: 'Fin des opérations', name: v.winnerId === me ? 'Victoire' : v.winnerId ? 'Défaite' : 'Armistice' };
    if (v.phase === 'opening') return { eyebrow: `Ouverture${v.opening?.round > 1 ? ` · relance ${v.opening.round - 1}` : ''}`, name: 'Prise d’initiative' };
    if (step.kind === 'place') {
      return step.reason === 'red'
        ? { eyebrow: 'Renforts', name: `Poser ${plural(step.remaining, 'bloc')}` }
        : { eyebrow: 'Bloc égaré', name: 'Poser le bloc' };
    }
    const o = ORDERS[step.kind === 'remove' ? 'remove' : step.item];
    return { eyebrow: `Ordre ${o.n} / 3`, name: o.name };
  })();

  const instruction = (() => {
    if (readOnly) return 'Partie terminée.';
    if (hostPaused) return 'Partie en pause.';
    if (!step) {
      if (!v.winnerId) return 'Au bout des tours, les deux camps ont autant d’unités.';
      if (v.results?.reason === 'limit') return `Au bout des tours, ${v.winnerId === me ? 'vous avez' : `${nameOf(v.winnerId)} a`} le plus d’unités en main.`;
      return v.winnerId === me ? `${opp.nickname} n’a plus aucune unité en main.` : 'Vous n’avez plus aucune unité en main.';
    }
    if (!myTurn) {
      if (step.kind === 'place' && step.reason === 'missed') return `${nameOf(step.playerId)} pose votre bloc égaré…`;
      if (v.phase === 'opening') return `${nameOf(step.playerId)} lance son dé d’ouverture…`;
      if (step.kind === 'place') return `${nameOf(step.playerId)} pose ses renforts…`;
      return `${nameOf(step.playerId)} ${ORDERS[step.kind === 'remove' ? 'remove' : step.item].verb}…`;
    }
    if (preview) return preview.text;
    if (v.phase === 'opening') return 'Visez la tranchée de gauche : la plus forte face engage.';
    if (step.kind === 'place') return step.reason === 'red' ? `Touchez ${step.remaining > 1 ? 'les positions' : 'la position'} de droite où poser vos blocs.` : `Le bloc de ${opp.nickname} s’est égaré : posez-le où vous voulez.`;
    if (step.kind === 'remove') return 'Touchez les blocs autour de l’obus, dans l’ordre de votre choix.';
    if (step.item === 'die') return 'Touchez une position de la tranchée de gauche.';
    if (step.item === 'cube') return `Touchez une position de la tranchée de droite · ${plural(v.reserve, 'bloc')} en réserve.`;
    return 'Visez une position vide encerclée de blocs, ou annulez la frappe.';
  })();

  const clock = turn?.endsAt && turn.durationMs >= 2000 && playing ? turn : null;
  const aiming = canAct && step?.kind === 'throw' && !!target;
  const nextDie = step?.dieId && v.players.find((p) => p.id === step.playerId)?.hand.find((d) => d.id === step.dieId);

  // ---- render -----------------------------------------------------------------------
  const camp = (p, side) => {
    const heldBack = hold.hands[p.id] ?? 0;
    const hand = p.hand.slice(0, Math.max(0, p.hand.length - heldBack));
    const active = playing && step?.playerId === p.id;
    return (
      <section id={`dk-camp-${p.id}`} className={`dk-camp is-${side} ${active ? 'is-active' : ''} ${p.connected === false && !p.isBot ? 'is-away' : ''}`} aria-label={p.id === me ? 'Votre camp' : `Camp de ${p.nickname}`}>
        <div className="dk-camp__who">
          <Avatar name={p.nickname} index={p.seat} size={26} online={p.connected !== false} />
          <span className="dk-camp__name">{p.id === me ? 'Vous' : p.nickname}</span>
          {active && <span className="dk-camp__flag">{v.phase === 'opening' ? 'ouverture' : 'aux ordres'}</span>}
        </div>
        <div id={`dk-hand-${p.id}`} className="dk-camp__hand" aria-label={`${plural(p.hand.length, 'unité')} en main`}>
          {hand.map((d, i) => (
            // in hand a unit has no face yet: it is rolled when thrown
            <span key={d.id} className={`dk-mini ${active && d.id === step?.dieId && step?.item === 'die' ? 'is-next' : ''}`} dangerouslySetInnerHTML={{ __html: dieHTML(0, d.color, d.seat) }} />
          ))}
          {!hand.length && <span className="dk-camp__empty">aucune unité</span>}
        </div>
        <div id={`dk-disc-${p.id}`} className="dk-camp__disc" title="Pertes : une unité qui atterrit avec la même face les rappelle">
          <span className="dk-camp__label">pertes</span>
          {p.discard.length ? p.discard.map((d) => <span key={d.id} className="dk-mini is-lost" dangerouslySetInnerHTML={{ __html: dieHTML(d.value, d.color, d.seat) }} />) : <span className="dk-camp__none">—</span>}
        </div>
      </section>
    );
  };

  const ballHole = step?.kind === 'remove' && !hold.ball ? step.hole : null;
  const ringSet = new Set((preview?.ring ?? []).map((h) => cellKey(h.row, h.col)));
  const box = (b) => {
    const holes = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = b === 1 ? 0 : BOX_COLS; c < (b === 1 ? BOX_COLS : COLS); c++) {
        const key = cellKey(r, c);
        const held = !!hold.cells[key];
        const cell = held ? null : v.board[r][c];
        const ghost = !cell && !held ? hold.ghosts[key] : null;
        const isTarget = target && target.row === r && target.col === c && step?.kind === 'throw';
        const enemyAim = reticle && reticle.row === r && reticle.col === c;
        const targetable = can(r, c);
        const doomed = cell?.kind === 'die' && preview?.doomed.has(cell.id);
        const lit = preview?.row === r || (focus && step?.item === 'die' && focus.row === r);
        const html = ballHole && ballHole.row === r && ballHole.col === c ? shellHTML() : ghost ?? cellHTML(cell);
        holes.push(
          <button
            key={key}
            id={holeId(r, c)}
            type="button"
            className={`dk-hole ${targetable ? 'is-can' : ''} ${isTarget ? 'is-target' : ''} ${enemyAim ? 'is-enemy-aim' : ''} ${doomed ? 'is-doomed' : ''} ${lit ? 'is-lit' : ''} ${ringSet.has(key) ? 'is-ring' : ''} ${step?.kind === 'remove' && targetable ? 'is-removable' : ''}`}
            disabled={!targetable}
            aria-label={`${coord(r, c)}${cell ? (cell.kind === 'die' ? `, unité ${cell.value}` : ', bloc') : ', vide'}`}
            onClick={() => onHole(r, c)}
            onPointerEnter={() => setHover({ row: r, col: c })}
            onPointerLeave={() => setHover(null)}
          >
            <span className="dk-hole__pit" />
            <span className="dk-hole__piece" dangerouslySetInnerHTML={{ __html: html }} />
            {(isTarget || enemyAim) && <span className="dk-cross" aria-hidden><i /><i /></span>}
          </button>,
        );
      }
    }
    return (
      <div className={`dk-trench is-box${b}`}>
        <div className="dk-trench__cols" aria-hidden>{Array.from({ length: BOX_COLS }, (_, i) => <span key={i}>{i + 1 + (b === 2 ? BOX_COLS : 0)}</span>)}</div>
        <div className="dk-trench__pits">{holes}</div>
      </div>
    );
  };

  return (
    <div className="dk-table">
      <header className="dk-bar">
        <IconButton icon="settings" label="Réglages" onClick={() => setSheet('menu')} className="dk-icon" />
        <div className="dk-bar__title">
          <span className="dk-bar__name">DekouIO</span>
          <span className="dk-bar__sub">{v.phase === 'opening' ? 'Ouverture' : `Tour ${v.turnNumber}`} · {plural(v.reserve, 'bloc')}</span>
        </div>
        <div className="dk-bar__side">
          {isHost && playing && <IconButton icon={hostPaused ? 'play' : 'pause'} label={hostPaused ? 'Reprendre la partie' : 'Mettre en pause'} onClick={togglePause} className="dk-icon" />}
          <IconButton icon="book" label="Règles" onClick={() => setSheet('rules')} className="dk-icon" />
        </div>
      </header>

      {camp(opp, 'opp')}
      <div className="dk-clock">{clock && !hostPaused && <TurnTimer key={`${clock.key}-${clock.endsAt}`} turn={clock} />}</div>

      <div className="dk-order" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${order.eyebrow}-${order.name}`}
            className="dk-order__plate"
            initial={{ scale: 1.25, rotate: -4, opacity: 0 }}
            animate={{ scale: 1, rotate: -1.5, opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            transition={{ type: 'spring', stiffness: 520, damping: 26 }}
          >
            <span className="dk-order__eyebrow">{order.eyebrow}{step?.kind === 'throw' && step.tries > 0 ? ` · essai ${step.tries + 1}/3` : ''}</span>
            <strong className="dk-order__name">{order.name}</strong>
          </motion.div>
        </AnimatePresence>
        <p className={`dk-order__hint ${myTurn ? 'is-mine' : ''}`}>{instruction}</p>
      </div>

      <main className="dk-map">
        <div className="dk-board">
          <div className="dk-rows" aria-hidden>{Array.from({ length: ROWS }, (_, r) => <span key={r} className={preview?.row === r ? 'is-lit' : ''}>{ROW_NAMES[r]}</span>)}</div>
          {box(1)}
          {box(2)}
          <div className="dk-counts" aria-label="Positions vides par ligne">
            {Array.from({ length: ROWS }, (_, r) => {
              const n = emptyInRow(v.board, r);
              return <span key={`${r}-${n}`} className={`dk-count ${preview?.row === r ? 'is-lit' : ''}`} title={`Ligne ${ROW_NAMES[r]} : ${n} vides`}>{n}</span>;
            })}
          </div>
        </div>
      </main>

      <footer className="dk-dock">
        {camp(meP, 'me')}
        <div className="dk-controls">
          {aiming && <Gauge valueRef={gaugeRef} />}
          <div className="dk-controls__btns">
            {canAct && step?.kind === 'throw' && (
              <button type="button" className="dk-btn dk-btn--fire" onClick={fire} disabled={!target}>
                {step.item === 'die' && nextDie ? <span className="dk-btn__die" dangerouslySetInnerHTML={{ __html: dieHTML(0, nextDie.color, nextDie.seat) }} /> : null}
                {target ? `Feu sur ${coord(target.row, target.col)}` : 'Choisir une cible'}
              </button>
            )}
            {canAct && step?.kind === 'throw' && step.item === 'ball' && (
              <button type="button" className="dk-btn dk-btn--ghost" onClick={() => send({ type: 'skip' })}>Annuler la frappe</button>
            )}
            {!playing && local?.onFinished && v.status === 'finished' && (
              <button type="button" className="dk-btn dk-btn--fire" onClick={local.onFinished}>Nouvelle campagne</button>
            )}
          </div>
        </div>
      </footer>

      <div className="dk-fx" ref={fxRef} aria-hidden />

      <AnimatePresence>
        {hostPaused && playing && (
          <motion.div key="pause" className="dk-paused" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="status">
            <motion.div className="dk-paused__card" initial={{ scale: 0.92, y: 10 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', bounce: 0.3, duration: 0.45 }}>
              <strong>Cessez-le-feu</strong>
              <span>{isHost ? 'Les chronos et les robots sont arrêtés.' : `${nameOf(room.hostId)} a mis la partie en pause.`}</span>
              {isHost && <button type="button" className="dk-btn dk-btn--fire" onClick={togglePause} autoFocus><Icon name="play" size={18} strokeWidth={2.4} /> Reprendre</button>}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <SettingsSheet open={sheet === 'menu'} onClose={() => setSheet(null)}>
        <div className="settings__group">
          <span className="eyebrow">Partie · salon {room.id}</span>
          <Button variant="secondary" icon="book" onClick={() => setSheet('rules')}>Règles de DekouIO</Button>
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
        <p className="sheet-lead">Votre place est gardée : vous pourrez revenir depuis l’accueil. En votre absence, vos lancers seront joués d’une main tremblante.</p>
      </Sheet>
    </div>
  );
}

/**
 * The aiming gauge: a needle sweeps a range-finder scale, the centre is a dead-on shot.
 * The needle is moved outside React (no re-render per frame).
 */
function Gauge({ valueRef }) {
  const needle = useRef(null);
  const readout = useRef(null);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = (t) => {
      const ph = ((t - t0) % (2 * GAUGE_PERIOD)) / GAUGE_PERIOD;
      // eased sweep: slower at the ends, fastest across the centre
      const lin = ph < 1 ? ph : 2 - ph;
      const pos = 0.5 - Math.cos(lin * Math.PI) / 2;
      valueRef.current = pos;
      if (needle.current) needle.current.style.left = `${pos * 100}%`;
      if (readout.current) readout.current.textContent = `${Math.round(Math.max(0, 1 - Math.abs(pos - 0.5) * 2) * 100)} %`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [valueRef]);
  return (
    <motion.div className="dk-gauge" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} role="img" aria-label="Jauge de précision : tirez quand l’aiguille est au centre">
      <div className="dk-gauge__scale">
        <span className="dk-gauge__zone" />
        <span className="dk-gauge__ticks" />
        <span className="dk-gauge__needle" ref={needle} />
      </div>
      <span className="dk-gauge__readout"><small>précision</small><b ref={readout}>—</b></span>
    </motion.div>
  );
}
