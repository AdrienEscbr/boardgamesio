import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { BOX_COLS, COLS, ROWS, emptyInRow, enclosedHoles, inBox, isEnclosed, neighbours, settleBoard } from '../engine/game.js';
import { blipHTML, cellHTML, crackedHTML, craterHTML, cubeHTML, dieHTML, echoHTML, pieceNode, shellHTML, weakHTML } from './pieces.js';
import RulesSheet from './RulesSheet.jsx';
import { MISS_LABELS, ORDERS, ROW_NAMES, coord, plural } from './i18n.js';
import './fonts.js';
import './dekou.css';
import './overlays.css';

const RADAR_MS = 2600; // one radar sweep
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
    if (step.kind === 'place') return inBox(2, c) && cell === null && (step.reason !== 'red' || r === step.row);
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
      const base = need >= 1 && need <= 6 ? `${at} : un ${need} rentre aussitôt` : `${at} : aucune face ne rentre sur cette ligne`;
      // the red die: its reinforcements can only go on its row
      const isRed = v.players.some((p) => p.hand.some((d) => d.id === step.dieId && d.color === 'red'));
      if (!isRed || v.phase === 'opening') return { row, doomed: new Set(), text: base };
      const free = Math.min(v.reserve, v.board[row].filter((cell, c) => inBox(2, c) && cell === null).length);
      return { row, doomed: new Set(), text: `${base} · renforts : ${free ? `jusqu’à ${plural(free, 'bloc')}` : 'aucun bloc'} sur cette ligne` };
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
        if (e.type === 'remove') n.ghosts[cellKey(e.cell.row, e.cell.col)] = crackedHTML();
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

  /**
   * Flies a piece along an arc; resolves on landing with the node (still on screen).
   * `from` and `to` are screen points, or functions giving one: the flight is steered every
   * frame, so it still comes down on its hole when the layout moves under it.
   */
  function fly(html, from, to, { dur = 680, lift = 90, spin = 0, scale = 1.6, faces = null } = {}) {
    const layer = fxRef.current;
    const pt = (p) => (typeof p === 'function' ? p() : p);
    if (!layer || !pt(from) || !pt(to)) return Promise.resolve(null);
    const node = pieceNode(html);
    const shadow = document.createElement('span');
    shadow.className = 'dk-flyshadow';
    layer.append(shadow, node);
    const d = reduced() ? 1 : dur;
    let last = pt(to);
    const frame = (t) => {
      const a = pt(from) ?? last; const b = pt(to) ?? last;
      last = b;
      const u = 1 - Math.pow(1 - t, 1.8); // quick off the hand, slower on the way down
      // a quadratic arc whose top is `lift` above the higher end
      const top = Math.min(a.y, b.y) - lift;
      const cy = 2 * top - (a.y + b.y) / 2;
      const x = a.x + (b.x - a.x) * u;
      const y = (1 - u) * (1 - u) * a.y + 2 * u * (1 - u) * cy + u * u * b.y;
      const s = 0.85 + 0.15 * u + (scale - 1) * 4 * u * (1 - u);
      node.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${s}) rotate(${spin * u}deg)`;
      const gy = a.y + 8 + (b.y - a.y - 4) * u;
      shadow.style.transform = `translate(${x}px, ${gy}px) translate(-50%, -50%) scale(${0.7 - 0.5 * 4 * u * (1 - u) + 0.3 * u})`;
      shadow.style.opacity = String(0.45 - 0.3 * 4 * u * (1 - u));
    };
    frame(0);
    // a die tumbles: its face changes in the air, the real one shows at the end
    let tumble = null;
    if (faces) {
      tumble = setInterval(() => {
        const n = 1 + Math.floor(Math.random() * 6);
        node.innerHTML = dieHTML(n, faces.color, faces.seat);
      }, 85);
    }
    return new Promise((res) => {
      const t0 = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - t0) / d);
        frame(t);
        if (t < 1 && alive.current) { requestAnimationFrame(step); return; }
        if (tumble) { clearInterval(tumble); node.innerHTML = dieHTML(faces.value, faces.color, faces.seat); }
        shadow.remove();
        res(node);
      };
      requestAnimationFrame(step);
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

  /** A short-lived node of the effects layer at a screen point. */
  function spark(cls, at, frames, opts, clip = '') {
    const layer = fxRef.current;
    if (!layer || !at) return;
    const el = document.createElement('span');
    el.className = cls;
    el.style.left = `${at.x}px`;
    el.style.top = `${at.y}px`;
    if (clip) el.style.clipPath = clip;
    layer.appendChild(el);
    el.animate(frames, { fill: 'both', ...opts }).onfinish = () => el.remove();
  }

  /** The shell goes off: a flash, a shock ring, earth and concrete thrown out, the map shakes. */
  function blast(at) {
    sound('boom');
    haptic('medium');
    if (!at || reduced()) return;
    const c = 'translate(-50%, -50%)';
    spark('dk-boom__flash', at, [{ transform: `${c} scale(.2)`, opacity: 1 }, { transform: `${c} scale(1.3)`, opacity: 0.9, offset: 0.25 }, { transform: `${c} scale(1.6)`, opacity: 0 }], { duration: 520, easing: 'ease-out' });
    spark('dk-boom__ring', at, [{ transform: `${c} scale(.15)`, opacity: 0.9 }, { transform: `${c} scale(2.4)`, opacity: 0 }], { duration: 620, easing: 'cubic-bezier(.2,.7,.3,1)' });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + Math.random() * 0.4;
      const d = 34 + Math.random() * 46;
      const dx = Math.cos(a) * d; const dy = Math.sin(a) * d;
      const cls = i % 3 === 0 ? 'dk-boom__chip is-concrete' : i % 3 === 1 ? 'dk-boom__chip' : 'dk-boom__ember';
      spark(cls, at, [
        { transform: `${c} translate(0, 0) rotate(0deg) scale(1)`, opacity: 1 },
        { transform: `${c} translate(${dx * 0.7}px, ${dy * 0.7 - 16}px) rotate(${180 + i * 30}deg) scale(1)`, opacity: 1, offset: 0.55 },
        { transform: `${c} translate(${dx}px, ${dy + 10}px) rotate(${300 + i * 40}deg) scale(.6)`, opacity: 0 },
      ], { duration: 560 + Math.random() * 260, easing: 'cubic-bezier(.15,.7,.4,1)' });
    }
    puff(at, 1.6);
    document.querySelector('.dk-map')?.animate([
      { transform: 'none' }, { transform: 'translate(-4px, 2px)' }, { transform: 'translate(4px, -2px)' },
      { transform: 'translate(-2px, -1px)' }, { transform: 'translate(1px, 1px)' }, { transform: 'none' },
    ], { duration: 360, easing: 'ease-out' });
  }

  /** A block breaking into four pieces that sink into its hole, and the dust it raises. */
  function collapse(at) {
    if (!at || reduced()) return;
    const cuts = [
      'polygon(0 0, 55% 0, 40% 45%, 0 60%)', 'polygon(55% 0, 100% 0, 100% 50%, 40% 45%)',
      'polygon(0 60%, 40% 45%, 55% 100%, 0 100%)', 'polygon(40% 45%, 100% 50%, 100% 100%, 55% 100%)',
    ];
    const c = 'translate(-50%, -50%)';
    cuts.forEach((clip, i) => {
      const dx = (i % 2 ? 1 : -1) * (2 + Math.random() * 3);
      spark('dk-shard', at, [
        { transform: `${c}`, opacity: 1 },
        { transform: `${c} translate(${dx}px, 4px) rotate(${dx * 3}deg) scale(.92)`, opacity: 1, offset: 0.4 },
        { transform: `${c} translate(${dx * 1.6}px, 10px) rotate(${dx * 5}deg) scale(.55)`, opacity: 0 },
      ], { duration: 700, delay: i * 50, easing: 'cubic-bezier(.5,0,.8,.6)' }, clip);
    });
    spark('dk-dust', at, [{ transform: `${c} scale(.3)`, opacity: 0.9 }, { transform: `${c} scale(1.3)`, opacity: 0 }], { duration: 900, easing: 'ease-out' });
  }

  /** A puff of grey smoke rising from a point. */
  function puff(at, size = 1) {
    if (!at || reduced()) return;
    for (let i = 0; i < 3; i++) {
      const dx = (i - 1) * 12 * size;
      spark('dk-boom__smoke', at, [
        { transform: `translate(-50%, -50%) translate(${dx * 0.3}px, 0) scale(${0.3 * size})`, opacity: 0.75 },
        { transform: `translate(-50%, -50%) translate(${dx}px, ${-30 * size}px) scale(${1.1 * size})`, opacity: 0 },
      ], { duration: 900 + i * 140, delay: i * 70, easing: 'ease-out' });
    }
  }

  const holeCentre = (r, c) => { const rr = rectOf(holeId(r, c)); return rr && centre(rr); };
  const campCentre = (pid) => { const rr = rectOf(`dk-hand-${pid}`) ?? rectOf(`dk-camp-${pid}`); return rr && centre(rr); };
  /**
   * Where a throw comes down on screen, decided before it leaves the hand: the centre of the
   * hole it falls in, or, when it leaves its trench, the spot of the parapet it crosses.
   * `out` is the direction it keeps going after it touches down (for the skid off).
   */
  function landingOf(e) {
    if (e.hole) {
      const dx = e.point.x - e.hole.col; const dy = e.point.y - e.hole.row;
      const len = Math.hypot(dx, dy) || 1;
      return { at: () => holeCentre(e.hole.row, e.hole.col), out: { x: dx / len, y: dy / len } };
    }
    // off the trench: a spot of its parapet, kept relative to the trench while the page moves
    const id = `dk-pits-${e.target.col < BOX_COLS ? 1 : 2}`;
    const spot = parapet(e);
    const r0 = rectOf(id);
    if (!spot || !r0) return { at: () => holeCentre(e.target.row, e.target.col), out: { x: 0, y: 1 } };
    const off = { x: spot.to.x - r0.left, y: spot.to.y - r0.top };
    return { at: () => { const r = rectOf(id); return r && { x: r.left + off.x, y: r.top + off.y }; }, out: spot.out };
  }

  function parapet(e) {
    const base = e.target.col < BOX_COLS ? 0 : BOX_COLS;
    const pits = rectOf(`dk-pits-${base ? 2 : 1}`);
    const t = holeCentre(e.target.row, e.target.col);
    const a = holeCentre(0, base); const b = holeCentre(0, base + 1); const c = holeCentre(1, base);
    if (!pits || !t || !a || !b || !c) return null;
    const p = { x: t.x + (e.point.x - e.target.col) * (b.x - a.x), y: t.y + (e.point.y - e.target.row) * (c.y - a.y) };
    const rim = 6;
    const L = pits.left - rim; const R = pits.right + rim; const T = pits.top - rim; const B = pits.bottom + rim;
    const clampX = Math.min(R, Math.max(L, p.x)); const clampY = Math.min(B, Math.max(T, p.y));
    // the axis on which it left the trench (in hole units) puts it on that side of the parapet
    const gx = e.point.x - (base + 1.5); const gy = e.point.y - 2;
    const overX = Math.abs(gx) - 2; const overY = Math.abs(gy) - 2.5;
    if (overX >= overY) return { to: { x: gx < 0 ? L : R, y: clampY }, out: { x: Math.sign(gx), y: 0 } };
    return { to: { x: clampX, y: gy < 0 ? T : B }, out: { x: 0, y: Math.sign(gy) } };
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
      // the outcome is known when the piece leaves: it flies straight to where it comes down
      const land = landingOf(e);
      // the opponent's aim shows for a moment, so their throw can be followed
      if (e.playerId !== me) {
        setReticle({ row: e.target.row, col: e.target.col });
        await wait(380);
        setReticle(null);
      }
      const isBall = e.item === 'ball';
      const html = e.item === 'die' ? dieHTML(e.value, e.color, e.seat) : e.item === 'cube' ? cubeHTML() : shellHTML();
      if (isBall) sound('whistle');
      const from = campCentre(e.playerId); const aim = land.at();
      const side = aim && from && aim.x < from.x ? -1 : 1;
      // a die or a block tumbles; the shell tips over in the air and comes down nose first
      const spin = isBall ? side * 180 : side * (300 + Math.random() * 300);
      const node = await fly(html, () => campCentre(e.playerId), land.at, { spin, lift: isBall ? 150 : 90, dur: isBall ? 820 : 680, scale: isBall ? 1.9 : 1.6, faces: e.item === 'die' ? { value: e.value, color: e.color, seat: e.seat } : null });
      const to = land.at();
      if (e.hit) {
        node?.remove();
        if (isBall) {
          patch((n) => { n.ball = false; });
          blast(to);
        } else {
          patch((n) => bump(n.cells, cellKey(e.hole.row, e.hole.col), -1));
          sound(e.item === 'die' ? 'thud' : 'concrete');
          flash(e.hole.row, e.hole.col, 'is-landed');
        }
        await wait(isBall ? 420 : 160);
        return;
      }
      // a miss: it touches down where the gauge sent it, then bounces off and fades
      sound('whiff');
      if (node && to) {
        const o = land.out; const k = (x, y, s, r, op) => ({ transform: `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${s}) rotate(${r}deg)`, opacity: op });
        const hop = e.reason === 'out' ? 34 : 28;
        const r0 = isBall ? side * 180 : spin;
        node.animate(e.reason === 'open'
          // a dud: the shell sinks into the open ground and fizzles out
          ? [k(to.x, to.y, 1, r0, 1), k(to.x + 2, to.y, 1, r0 + 8, 1), k(to.x - 2, to.y, 1, r0 - 6, 1), k(to.x, to.y + 4, 0.8, r0, 0)]
          : [k(to.x, to.y, 1, r0, 1), k(to.x + o.x * hop * 0.6, to.y + o.y * hop * 0.6 - 18, 1.15, r0 + side * 50, 1), k(to.x + o.x * hop, to.y + o.y * hop + 6, 0.75, r0 + side * 90, 0)],
        { duration: e.reason === 'open' ? 520 : 460, easing: 'ease-out', fill: 'forwards' }).onfinish = () => node.remove();
        if (e.reason === 'open') puff(to);
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
      // the cracked block shudders, splits and slumps into its hole in a cloud of dust
      const key = cellKey(e.cell.row, e.cell.col);
      sound('rubble');
      haptic('light');
      flash(e.cell.row, e.cell.col, 'is-crumbling');
      await wait(200);
      patch((n) => { delete n.ghosts[key]; });
      collapse(holeCentre(e.cell.row, e.cell.col));
      await wait(320);
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
    if (step.kind === 'place') return step.reason === 'red' ? `Renforts : posez ${plural(step.remaining, 'bloc')} sur la ligne ${ROW_NAMES[step.row]}, à droite.` : `Le bloc de ${opp.nickname} s’est égaré : posez-le où vous voulez.`;
    if (step.kind === 'remove') return 'Touchez les blocs autour du cratère, dans l’ordre de votre choix.';
    if (step.item === 'die') return 'Touchez une position de la tranchée de gauche.';
    if (step.item === 'cube') return `Touchez une position de la tranchée de droite · ${plural(v.reserve, 'bloc')} en réserve.`;
    return 'Visez une position vide encerclée de blocs, ou annulez la frappe.';
  })();

  // the plate keeps the order being played out until its effects end, so it never tells
  // the outcome of a throw before the piece comes down
  const settling = animating || v.events.some((e) => e.n > seen.current);
  const shown = useRef(null);
  if (!settling || !shown.current) {
    shown.current = { order, instruction, mine: myTurn, step, tries: step?.kind === 'throw' && step.tries > 0 ? ` · essai ${step.tries + 1}/3` : '' };
  }
  const plate = shown.current;

  // ---- the phase overlay: each order lays its own sheet on the map ----------------
  // deploy: the unit trench lit, the other one's ground darkened; fort: the engineers'
  // blueprint on the block trench; radar: the strike scope over both; clear: cracked blocks.
  const cqStep = readOnly ? null : plate.step;
  const cq = !cqStep ? null
    : cqStep.kind === 'remove' ? 'clear'
      : cqStep.kind === 'throw' && cqStep.item === 'die' ? 'deploy'
        : cqStep.kind === 'throw' && cqStep.item === 'ball' ? 'radar' : 'fort';
  const cqEnemy = !!cqStep && cqStep.playerId !== me;
  const activeBox = cq === 'deploy' ? 1 : cq === 'fort' || cq === 'clear' ? 2 : 0;
  const redRow = cq === 'fort' && cqStep.kind === 'place' && cqStep.reason === 'red' ? cqStep.row : null;
  const weakPoints = cq === 'radar' ? enclosedHoles(v.board) : [];
  const strikable = new Set(weakPoints.flatMap((h) => neighbours(h.row, h.col).map((n) => cellKey(n.row, n.col))));
  const cracked = new Set(cq === 'clear' && Array.isArray(cqStep.remaining) ? cqStep.remaining.map((h) => cellKey(h.row, h.col)) : []);

  // A phase change dissolves the old overlay into the new one: the board as it was is
  // copied (while the DOM still shows it, during render) and fades out over the new one.
  const cqKey = `${cq}-${cqEnemy}`;
  const lastCq = useRef(cqKey);
  const oldBoard = useRef(null);
  if (lastCq.current !== cqKey) {
    lastCq.current = cqKey;
    const el = typeof document !== 'undefined' ? document.querySelector('.dk-table .dk-board') : null;
    oldBoard.current = el && !reduced() ? { node: el.cloneNode(true), rect: el.getBoundingClientRect() } : null;
  }
  useLayoutEffect(() => {
    const snap = oldBoard.current;
    oldBoard.current = null;
    const layer = fxRef.current;
    if (!snap || !layer) return;
    const { node, rect } = snap;
    node.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    Object.assign(node.style, { position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, margin: '0', pointerEvents: 'none' });
    layer.prepend(node);
    node.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 750, easing: 'ease-in-out', fill: 'forwards' }).onfinish = () => node.remove();
  }, [cqKey]);

  // the radar wave and the blips share one clock, so a blip flares when the wave reaches it
  useLayoutEffect(() => {
    if (cq !== 'radar' || reduced()) return undefined;
    const sync = () => {
      const board = document.querySelector('.dk-board');
      const wave = board?.querySelector('.dk-sonar__wave');
      if (!board || !wave) return;
      const b = board.getBoundingClientRect();
      const p1 = document.getElementById('dk-pits-1')?.getBoundingClientRect();
      const p2 = document.getElementById('dk-pits-2')?.getBoundingClientRect();
      if (!p1 || !p2) return;
      // the emitter sits midway between the two trenches, just below them,
      // so the wave spreads evenly over both
      const o = { x: (p1.left + p2.right) / 2, y: Math.max(p1.bottom, p2.bottom) + 16 };
      const R = Math.max(...[[b.left, b.top], [b.right, b.top], [b.left, b.bottom], [b.right, b.bottom]].map(([x, y]) => Math.hypot(x - o.x, y - o.y)), 1);
      board.style.setProperty('--R', `${R}px`);
      board.style.setProperty('--ox', `${o.x - b.left}px`);
      board.style.setProperty('--oy', `${o.y - b.top}px`);
      const T = RADAR_MS;
      const loop = (el, frames, offset) => {
        el.getAnimations().forEach((a) => a.cancel());
        const a = el.animate(frames, { duration: T, iterations: Infinity });
        a.startTime = offset; // anchored to the page clock: every node keeps the same beat
      };
      loop(wave, [{ transform: 'scale(0)', opacity: 1 }, { transform: 'scale(.85)', opacity: 1, offset: 0.85 }, { transform: 'scale(1)', opacity: 0 }], 0);
      board.querySelectorAll('.dk-blip').forEach((el) => {
        const r = el.getBoundingClientRect();
        const d = Math.hypot(r.left + r.width / 2 - o.x, r.top + r.height / 2 - o.y);
        loop(el, [
          { transform: 'scale(2.6)', opacity: 1, boxShadow: '0 0 8px 4px #7dffb0, 0 0 22px 8px rgba(125,255,176,.6)' },
          { transform: 'scale(1)', opacity: 0.75, boxShadow: '0 0 4px 1px #7dffb0, 0 0 10px 2px rgba(125,255,176,.5)', offset: 0.3 },
          { transform: 'scale(1)', opacity: 0.75, boxShadow: '0 0 4px 1px #7dffb0, 0 0 10px 2px rgba(125,255,176,.5)' },
        ], (d / R) * T);
      });
    };
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  });

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
        const lit = preview?.row === r || (focus && step?.item === 'die' && focus.row === r) || (step?.kind === 'place' && step.reason === 'red' && step.row === r);
        const struck = ballHole && ballHole.row === r && ballHole.col === c;
        let html = struck ? craterHTML() : ghost ?? cellHTML(cell);
        if (cq === 'radar' && !held) {
          if (cell?.kind === 'cube') html = strikable.has(key) ? blipHTML() : echoHTML();
          else if (!cell && weakPoints.some((h) => h.row === r && h.col === c)) html = weakHTML(neighbours(r, c).length);
        }
        if (cq === 'clear' && cell?.kind === 'cube' && cracked.has(key)) html = crackedHTML();
        const closed = redRow != null && b === 2 && r !== redRow;
        holes.push(
          <button
            key={key}
            id={holeId(r, c)}
            type="button"
            className={`dk-hole ${targetable ? 'is-can' : ''} ${isTarget ? 'is-target' : ''} ${enemyAim ? 'is-enemy-aim' : ''} ${doomed ? 'is-doomed' : ''} ${lit ? 'is-lit' : ''} ${ringSet.has(key) ? 'is-ring' : ''} ${step?.kind === 'remove' && targetable ? 'is-removable' : ''} ${struck ? 'is-struck' : ''}`}
            disabled={!targetable}
            aria-label={`${coord(r, c)}${cell ? (cell.kind === 'die' ? `, unité ${cell.value}` : ', bloc') : ', vide'}`}
            onClick={() => onHole(r, c)}
            onPointerEnter={() => setHover({ row: r, col: c })}
            onPointerLeave={() => setHover(null)}
          >
            <span className="dk-hole__pit" />
            <span className="dk-hole__piece" dangerouslySetInnerHTML={{ __html: html }} />
            {closed && <span className="dk-hole__closed" aria-hidden />}
            {(isTarget || enemyAim) && <span className="dk-cross" aria-hidden><i /><i /></span>}
          </button>,
        );
      }
    }
    return (
      <div className={`dk-trench is-box${b}`}>
        {activeBox === b && <span className="dk-tag">{cqEnemy ? 'Zone ennemie' : 'Zone active'}</span>}
        <div className="dk-trench__cols" aria-hidden>{Array.from({ length: BOX_COLS }, (_, i) => <span key={i}>{i + 1 + (b === 2 ? BOX_COLS : 0)}</span>)}</div>
        <div
          className={`dk-trench__pits ${activeBox === b ? 'is-active' : ''} ${activeBox && activeBox !== b && !(cq === 'deploy' && b === 2) ? 'is-quiet' : ''} ${cq === 'fort' && b === 2 ? 'is-bp' : ''} ${cq === 'deploy' && b === 2 ? 'is-bp-dim' : ''}`}
          id={`dk-pits-${b}`}
        >
          {holes}
          {redRow != null && b === 2 && <span className="dk-rowband" aria-hidden style={{ '--row': redRow }} />}
        </div>
      </div>
    );
  };

  return (
    <div className={`dk-table ${cq ? `tq-${cq}` : ''}`}>
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
            key={`${plate.order.eyebrow}-${plate.order.name}`}
            className="dk-order__plate"
            initial={{ scale: 1.25, rotate: -4, opacity: 0 }}
            animate={{ scale: 1, rotate: -1.5, opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            transition={{ type: 'spring', stiffness: 520, damping: 26 }}
          >
            <span className="dk-order__eyebrow">{plate.order.eyebrow}{plate.tries}</span>
            <strong className="dk-order__name">{plate.order.name}</strong>
          </motion.div>
        </AnimatePresence>
        <p className={`dk-order__hint ${plate.mine ? 'is-mine' : ''}`}>{plate.instruction}</p>
      </div>

      <main className="dk-map">
        <div className={`dk-board ${cq ? `cq-${cq}` : ''} ${cqEnemy ? 'cq-enemy' : ''}`}>
          {cq === 'radar' && (
            <>
              <div className="dk-sonar" aria-hidden><span className="dk-sonar__wave" /></div>
              <span className="dk-sonar__emitter" aria-hidden />
              <div className="dk-sonar__readout" aria-hidden>
                <span>Radar · {plural(weakPoints.length, 'point faible', 'points faibles')}</span>
                <span>{cqEnemy ? 'Cible : vous' : plural(strikable.size, 'écho')}</span>
              </div>
            </>
          )}
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
                {step.item === 'die' && nextDie ? <span className="dk-btn__die" dangerouslySetInnerHTML={{ __html: dieHTML(0, nextDie.color, nextDie.seat) }} /> : step.item === 'ball' ? <span className="dk-btn__shell" dangerouslySetInnerHTML={{ __html: shellHTML() }} /> : null}
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
