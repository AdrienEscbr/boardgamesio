// PlanchettesIO scene: three.js draws it, Rapier simulates it. No React in here.
//
// In the turn-based games only one browser simulates at a time (see engine/game.js); in free
// building every browser does. A scene is in one of five roles:
//   'actor'   my turn: I simulate, I act, and I report what moves and what happens
//   'watch'   someone else's turn: no physics, the pieces glide towards the poses received
//   'free'    the round is over: everybody lets their own copy fall, nothing is reported
//   'idle'    frozen (game paused)
//   'shared'  free building: I simulate and act whenever I like; see merge() for how copies stay alike

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BLOCK, CM_PER_UNIT, PLANK, halfSize } from '../engine/blocks.js';

const V3 = THREE.Vector3;
const Quat = THREE.Quaternion;
const COLORS = { fog: '#10282b', mat: '#2f6f73', pine: '#e3bb7a', alarm: '#e2553d' };
const AX = [new V3(1, 0, 0), new V3(0, 1, 0), new V3(0, 0, 1)];
/** Flat, on its long edge, standing on its end. */
const ORIENT = [new Quat(), new Quat().setFromAxisAngle(AX[0], Math.PI / 2), new Quat().setFromAxisAngle(AX[2], Math.PI / 2)];
// Rapier tunes its contacts for earth gravity: g stays at 9.81 and time runs faster (SPEED),
// otherwise tall towers crush under their own weight. 2.5 gives lively falls at the scale of small pieces.
const STEP = 1 / 120;
const SPEED = 2.5;
const MAX_STEPS = 8;
// Pulling: the speed aimed at follows the pointer, capped. A sharp pull drags the neighbours along;
// the blocks at the bottom carry more weight and resist more.
const PULL = { gain: 8, max: 3, friction: 0.4 };
const BUILD_VIEW = { from: [9, 6.5, 11], at: [0, 2, 0] };
const CAMERA = { tower: { from: [12, 15, 14], at: [0, 5.5, 0] }, build: BUILD_VIEW, free: BUILD_VIEW };
const LIVE_MS = 150; // how often the acting player reports the pieces that move

/**
 * Rapier is a WebAssembly module: loaded on demand, with the game screen. It must be
 * initialised exactly once: a second init() swaps the module under the objects already
 * created (and they crash), so the promise is shared by every game screen.
 */
let physics = null;
export function loadPhysics() {
  physics ??= import('@dimforge/rapier3d-compat').then(async ({ default: RAPIER }) => {
    await RAPIER.init();
    return RAPIER;
  });
  return physics;
}

function woodTexture() { // wood grain, drawn once
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 70; i++) {
    const y = Math.random() * 64;
    const w = () => y + (Math.random() - 0.5) * 7;
    g.strokeStyle = `rgba(120, 70, 25, ${0.03 + Math.random() * 0.09})`;
    g.lineWidth = 0.4 + Math.random() * 1.1;
    g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(85, w(), 170, w(), 256, y); g.stroke();
  }
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {object} RAPIER  from loadPhysics()
 * @param {'tower' | 'build' | 'free'} mode
 * @param {object} on  callbacks: live(rows), take(id), placed(row), settled(rows), fell(rows),
 *                     hint('idle' | 'pull' | 'hand' | 'settle'), stats(heightCm, count), refuse(reason),
 *                     and for free building: ball(origin, direction), state(rows)
 */
export function createScene(canvas, RAPIER, mode, on) {
  const HALF = halfSize(mode);
  const size = mode === 'tower' ? BLOCK : PLANK;
  const L = size.length;
  const tmp = new V3();
  const axes = (q) => AX.map((a) => a.clone().applyQuaternion(q));

  // ---------- picture ----------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.fog);
  scene.fog = new THREE.Fog(COLORS.fog, 45, 110);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 300);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2 - 0.03;
  controls.minDistance = 3;
  controls.maxDistance = 60;
  function resetCamera() {
    camera.position.set(...CAMERA[mode].from);
    controls.target.set(...CAMERA[mode].at);
  }
  resetCamera();

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8fa5a3, 2.1));
  const sun = new THREE.DirectionalLight(0xfff2dd, 1.7);
  sun.position.set(8, 20, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, far: 70 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  const disc = (r, material, y) => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 64), material);
    m.rotation.x = -Math.PI / 2;
    m.position.y = y;
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  // The floor is unlit and has the colour of the room: the mat seems to float in the dark, and the
  // canvas has no visible edge against the page.
  const floor = disc(120, new THREE.MeshBasicMaterial({ color: COLORS.fog }), 0);
  disc(9, new THREE.MeshStandardMaterial({ color: COLORS.mat, roughness: 1 }), 0.004); // the play mat, only for the eye

  const grain = woodTexture();
  const woods = [-2, -1, 0, 1, 2].map((i) => new THREE.MeshStandardMaterial({
    map: grain, roughness: 0.75, color: new THREE.Color(COLORS.pine).offsetHSL(0, 0, i * 0.03),
  }));
  const geometry = new THREE.BoxGeometry(size.length, size.thickness, size.width);
  const ghost = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: COLORS.pine, transparent: true, opacity: 0.55, depthWrite: false }));
  ghost.visible = false;
  scene.add(ghost);

  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < h ? 58 : 45; // upright phones: a wider angle, or the tower fills the screen
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  // ---------- physics ----------
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = STEP;
  world.createCollider(RAPIER.ColliderDesc.cuboid(300, 0.5, 300).setTranslation(0, -0.5, 0).setFriction(0.6));
  const ghostShape = new RAPIER.Cuboid(...HALF);

  const planks = [];
  const byId = new Map();
  const rid = () => Math.random().toString(36).slice(2, 10).padEnd(4, '0');
  const poseOf = (m) => [...m.position.toArray(), ...m.quaternion.toArray()].map((n) => +n.toFixed(4));
  const row = (p) => [p.id, ...poseOf(p.mesh)];
  const snapshot = () => planks.map(row);

  function addPlank(position, rotation, id) {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w }));
    world.createCollider(RAPIER.ColliderDesc.cuboid(...HALF).setFriction(0.6).setRestitution(0), body);
    const mesh = new THREE.Mesh(geometry, woods[Math.floor(Math.random() * woods.length)]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.copy(position);
    mesh.quaternion.copy(rotation);
    scene.add(mesh);
    const plank = { id, body, mesh, target: null };
    mesh.userData.plank = plank;
    planks.push(plank);
    byId.set(id, plank);
    return plank;
  }
  function setPose(p, a) {
    const q = new Quat(a[3], a[4], a[5], a[6]).normalize();
    const zero = { x: 0, y: 0, z: 0 };
    p.body.setTranslation({ x: a[0], y: a[1], z: a[2] }, true);
    p.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    p.body.setLinvel(zero, true);
    p.body.setAngvel(zero, true);
    p.mesh.position.set(a[0], a[1], a[2]);
    p.mesh.quaternion.copy(q);
  }
  function drop(p) {
    world.removeRigidBody(p.body);
    scene.remove(p.mesh);
    planks.splice(planks.indexOf(p), 1);
    byId.delete(p.id);
  }
  const wake = (near, r = Infinity) => planks.forEach((p) => {
    if (!near || p.mesh.position.distanceToSquared(near) < r * r) p.body.wakeUp();
  });

  // Is a piece far from the pose a? (beyond what two simulations of the same thing differ by)
  const differs = (m, a) => Math.hypot(m.position.x - a[0], m.position.y - a[1], m.position.z - a[2]) > 0.02
    || Math.abs(m.quaternion.x * a[3] + m.quaternion.y * a[4] + m.quaternion.z * a[5] + m.quaternion.w * a[6]) < 0.9998;

  // Balls to throw at the construction (free building). They live six seconds.
  const ballGeometry = new THREE.SphereGeometry(0.45, 24, 16);
  const ballMaterial = new THREE.MeshStandardMaterial({ color: COLORS.alarm, roughness: 0.4 });
  const balls = [];
  function spawnBall(o, d) {
    if (balls.length >= 20) return;
    const speed = 20;
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(o[0], o[1], o[2]).setLinvel(d[0] * speed, d[1] * speed, d[2] * speed).setCcdEnabled(true));
    world.createCollider(RAPIER.ColliderDesc.ball(0.45).setDensity(8).setRestitution(0.2), body);
    const mesh = new THREE.Mesh(ballGeometry, ballMaterial);
    mesh.castShadow = true;
    mesh.position.set(o[0], o[1], o[2]);
    scene.add(mesh);
    balls.push({ body, mesh, born: performance.now() });
  }

  // Do two oriented boxes overlap? (separating axes)
  function overlaps(cA, axA, cB, axB, shrink = 0.012) { // shrink > 0 tolerates mere contact, < 0 detects it
    const t = cB.clone().sub(cA);
    const free = (dir) => {
      if (dir.lengthSq() < 1e-8) return false;
      let r = 0;
      for (let i = 0; i < 3; i++) r += (HALF[i] - shrink) * Math.abs(axA[i].dot(dir)) + HALF[i] * Math.abs(axB[i].dot(dir));
      return Math.abs(t.dot(dir)) > r;
    };
    for (const a of axA) if (free(a)) return false;
    for (const b of axB) if (free(b)) return false;
    for (const a of axA) for (const b of axB) if (free(a.clone().cross(b))) return false;
    return true;
  }

  const topOf = (m) => m.position.y + AX.reduce((t, a, i) => t + Math.abs(tmp.copy(a).applyQuaternion(m.quaternion).y) * HALF[i], 0);
  const towerTop = () => planks.reduce((t, p) => Math.max(t, topOf(p.mesh)), 0);
  const grounded = (p) => 2 * p.mesh.position.y - topOf(p.mesh) < 0.05; // its lowest point touches the mat

  // ---------- my turn ----------
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let role = 'watch';
  let canAct = false; // actor, and my piece is not placed yet
  let orient = 0;
  let yaw = 0;
  let hovering = false;
  let hold = null; // the block being pulled
  let hand = false; // tower: the block is out, to be put back on top
  let awaiting = false; // my piece is placed: waiting for everything to rest
  let reported = false; // the outcome of my turn has been sent
  let lastHeld = null;
  let placedAt = 0;
  let ghostOk = true;
  let ballMode = false; // free building: a tap throws a ball instead of placing a piece
  let dirty = false; // free building: I set something in motion and have not reported where it ended
  let grounded0 = new Set(); // pieces already on the mat when my turn started
  let top0 = 0;
  let lastHint = '';
  function hint() {
    const h = awaiting ? 'settle' : hold ? 'pull' : hand ? 'hand' : 'idle';
    if (h !== lastHint) { lastHint = h; on.hint(h); }
  }

  function updateGhost() {
    ghost.visible = false;
    raycaster.setFromCamera(mouse, camera);
    const hit = raycaster.intersectObjects([floor, ...planks.map((p) => p.mesh)])[0];
    if (!hit) return;
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    ghost.quaternion.setFromAxisAngle(AX[1], yaw).multiply(ORIENT[mode === 'tower' ? 0 : orient]);
    const ax = axes(ghost.quaternion);
    const reach = (dir) => ax.reduce((s, a, i) => s + Math.abs(a.dot(dir)) * HALF[i], 0);
    ghost.position.copy(hit.point).addScaledVector(n, reach(n) + 0.003); // laid against the face aimed at
    ghost.position.y = Math.max(ghost.position.y, reach(AX[1]) + 0.003); // never below the mat
    // ponytail: tested against every nearby piece, O(n); a spatial grid if scenes ever pass ~1000 pieces
    // In the balance tower the block always comes from above, wherever one aims.
    const taken = mode === 'tower' || planks.some((p) => p.mesh.position.distanceToSquared(ghost.position) < L * L
      && overlaps(ghost.position, ax, p.mesh.position, axes(p.mesh.quaternion)));
    if (taken) { // the spot is taken: the piece lands on whatever is below
      const under = world.castShape({ x: ghost.position.x, y: 200, z: ghost.position.z }, ghost.quaternion, { x: 0, y: -1, z: 0 }, ghostShape, 0, 400, true);
      if (!under) return;
      ghost.position.y = 200 - under.time_of_impact + 0.003;
    }
    const bottom = ghost.position.y - reach(AX[1]);
    // Tower: back on the top, nowhere else. Construction: on the structure, never straight on the mat.
    // Free building: anywhere.
    ghostOk = mode === 'tower' ? bottom > towerTop() - 0.7 : mode === 'build' ? bottom > 0.05 : true;
    ghost.material.color.set(ghostOk ? COLORS.pine : COLORS.alarm);
    ghost.visible = true;
  }

  function place() {
    if (!canAct || awaiting || (mode === 'tower' && !hand)) return;
    updateGhost();
    if (!ghost.visible) return;
    if (!ghostOk) { on.refuse(mode === 'tower' ? 'notTop' : 'onMat'); return; }
    const p = addPlank(ghost.position, ghost.quaternion, rid());
    wake(ghost.position, L * 1.5); // the neighbours must feel the new weight
    ghost.visible = false;
    if (mode === 'free') { // no turn to end: the others are told, and get my poses once it rests
      p.local = true;
      dirty = true;
    } else {
      hand = false;
      awaiting = true;
      placedAt = performance.now();
    }
    on.placed(row(p));
    hint();
  }

  function throwBall() {
    raycaster.setFromCamera(mouse, camera);
    const o = camera.position.toArray().map((n) => +n.toFixed(3));
    const d = raycaster.ray.direction.toArray().map((n) => +n.toFixed(4));
    spawnBall(o, d);
    dirty = true;
    on.ball(o, d);
  }

  function grab(p, point) {
    p.body.collider(0).setFriction(PULL.friction);
    const c = p.mesh.position;
    hold = { p, y: point.y, y0: c.y, off: new V3(c.x - point.x, 0, c.z - point.z), start: c.clone(), target: c.clone() };
    p.body.setGravityScale(0, true); // held by hand: it neither falls nor turns
    p.body.lockRotations(true, true);
    controls.enabled = false;
    lastHeld = p.id;
    hint();
  }
  function pull() { // the held block follows the pointer horizontally, at a limited speed
    if (!byId.has(hold.p.id)) { hold = null; controls.enabled = true; return; }
    raycaster.setFromCamera(mouse, camera);
    const { origin, direction } = raycaster.ray;
    const t = (hold.y - origin.y) / direction.y;
    if (Math.abs(direction.y) > 0.05 && t > 0 && t < 200) {
      hold.target.copy(origin).addScaledVector(direction, t).add(hold.off).sub(hold.start).clampLength(0, 5).add(hold.start);
    }
    const pos = hold.p.body.translation();
    tmp.set(hold.target.x - pos.x, 0, hold.target.z - pos.z).multiplyScalar(PULL.gain).clampLength(0, PULL.max);
    hold.p.body.setLinvel({ x: tmp.x, y: (hold.y0 - pos.y) * 8, z: tmp.z }, true);
  }
  function letGo(take = true) {
    if (!hold) return;
    const p = hold.p;
    hold = null;
    controls.enabled = true;
    if (byId.has(p.id)) {
      p.body.collider(0).setFriction(0.6);
      p.body.setGravityScale(1, true);
      p.body.lockRotations(false, true);
      const ax = axes(p.mesh.quaternion);
      const touching = planks.some((o) => o !== p && o.mesh.position.distanceToSquared(p.mesh.position) < (L + 0.2) ** 2
        && overlaps(p.mesh.position, ax, o.mesh.position, axes(o.mesh.quaternion), -0.04));
      if (take && !touching) { // out of the tower: in hand, to be put back on top
        drop(p);
        wake();
        hand = true;
        on.take(p.id);
      } // still caught in the tower: it stays there and can be grabbed again
    }
    hint();
  }

  // ---------- pointer ----------
  const setMouse = (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  };
  let tap = null;
  let fingers = 0;
  const onDown = (e) => {
    fingers += 1;
    tap = fingers === 1 && e.button === 0 ? { x: e.clientX, y: e.clientY } : null; // a pinch is not a tap
    setMouse(e);
    if (tap && mode === 'tower' && canAct && !hand && !awaiting) {
      raycaster.setFromCamera(mouse, camera);
      const hit = raycaster.intersectObjects(planks.map((p) => p.mesh))[0];
      if (!hit) return;
      const p = hit.object.userData.plank;
      if (topOf(p.mesh) > towerTop() - 0.05) { on.refuse('topLevel'); return; }
      grab(p, hit.point);
      tap = null;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* keeps the gesture even outside the canvas, when supported */ }
    }
  };
  const onMove = (e) => { setMouse(e); hovering = e.pointerType === 'mouse'; };
  const onLeave = () => { hovering = false; };
  const onUp = (e) => {
    fingers = Math.max(0, fingers - 1);
    if (hold) { letGo(); tap = null; return; }
    const ok = tap && e.type === 'pointerup' && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 6;
    tap = null;
    if (!ok) return; // it was a drag: the view was turning
    setMouse(e);
    if (ballMode && role === 'shared') throwBall(); else place();
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  // ---------- loop ----------
  let tick = 0;
  let acc = 0;
  let last = performance.now();
  let lastLive = 0;
  let lastStats = '';
  let raf = 0;

  /** My turn: did it fall? is everything at rest? */
  function judge(now) {
    if (reported) return;
    const fell = towerTop() < top0 - 0.5 || planks.some((p) => grounded(p) && !grounded0.has(p.id) && p.id !== lastHeld);
    if (fell) {
      reported = true;
      canAct = false;
      awaiting = false;
      letGo(false);
      on.fell(snapshot());
    } else if (awaiting && now - placedAt > 400 && planks.every((p) => p.body.isSleeping())) {
      reported = true;
      on.settled(snapshot());
    }
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.max(0, Math.min((now - last) / 1000, 0.05));
    last = now;
    if (role === 'actor' || role === 'free' || role === 'shared') {
      if (hold) pull();
      acc = Math.min(acc + dt * SPEED, MAX_STEPS * STEP);
      for (; acc >= STEP; acc -= STEP) world.step();
      for (const p of planks) {
        if (p.body.isSleeping()) continue;
        p.mesh.position.copy(p.body.translation());
        p.mesh.quaternion.copy(p.body.rotation());
      }
      for (const b of [...balls]) {
        b.mesh.position.copy(b.body.translation());
        if (now - b.born > 6000) { world.removeRigidBody(b.body); scene.remove(b.mesh); balls.splice(balls.indexOf(b), 1); }
      }
    } else if (role === 'watch') {
      const k = 1 - Math.exp(-dt * 16);
      for (const p of planks) {
        if (!p.target) continue;
        p.mesh.position.lerp(p.target.p, k);
        p.mesh.quaternion.slerp(p.target.q, k);
      }
    }
    if (role === 'actor') {
      if (!reported && now - lastLive > LIVE_MS) {
        const moving = planks.filter((p) => (hold && hold.p === p) || !p.body.isSleeping());
        if (moving.length) { lastLive = now; on.live(moving.map(row)); }
      }
      if (tick % 6 === 0) judge(now);
    }
    // Free building: once what I set in motion has come to rest, the others align on my copy.
    if (role === 'shared' && dirty && tick % 10 === 0 && !balls.length && planks.every((p) => p.body.isSleeping())) {
      dirty = false;
      on.state(snapshot());
    }
    controls.update();
    if (hovering && canAct && !awaiting && !ballMode && (mode !== 'tower' || hand)) updateGhost(); else ghost.visible = false;
    if (tick++ % 10 === 0) {
      const cm = Math.round(towerTop() * CM_PER_UNIT * 10) / 10;
      const key = `${cm}/${planks.length}`;
      if (key !== lastStats) { lastStats = key; on.stats(cm, planks.length); }
    }
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  // ---------- what the game screen drives ----------
  return {
    /** Takes the scene exactly as given (start of a round, start of my turn, page reload). */
    adopt(rows, { inHand = false, settling = false } = {}) {
      letGo(false);
      const seen = new Set();
      for (const [id, ...a] of rows) {
        seen.add(id);
        const p = byId.get(id);
        if (p) setPose(p, a);
        else addPlank(new V3(a[0], a[1], a[2]), new Quat(a[3], a[4], a[5], a[6]).normalize(), id);
      }
      for (const p of [...planks]) if (!seen.has(p.id)) drop(p);
      // The pieces are left awake: they settle on each other (they start a hair apart) and fall
      // asleep by themselves. Forced asleep, the whole tower would only drop into place at the first
      // touch, and that jolt drags the neighbours of the block being pulled.
      for (const p of planks) p.target = null;
      hand = inHand;
      awaiting = settling;
      placedAt = 0;
      reported = false;
      lastHeld = null;
      grounded0 = new Set(planks.filter(grounded).map((p) => p.id));
      top0 = towerTop();
      hint();
    },
    /** Someone else is playing: glide towards the poses they report. */
    follow(rows) {
      const seen = new Set();
      for (const [id, ...a] of rows) {
        seen.add(id);
        const p = byId.get(id);
        if (!p) { addPlank(new V3(a[0], a[1], a[2]), new Quat(a[3], a[4], a[5], a[6]).normalize(), id).body.sleep(); continue; }
        p.target ??= { p: new V3(), q: new Quat() };
        p.target.p.set(a[0], a[1], a[2]);
        p.target.q.set(a[3], a[4], a[5], a[6]).normalize();
      }
      for (const p of [...planks]) if (!seen.has(p.id)) drop(p);
    },
    setRole(next, act = false) {
      if (next !== role) {
        letGo(false);
        if (next === 'free') {
          // A watcher starts its own simulation from what it sees; the actor's is already running.
          if (role !== 'actor') for (const p of planks) { setPose(p, poseOf(p.mesh)); p.target = null; }
          wake();
        }
        role = next;
      }
      canAct = role === 'shared' || (role === 'actor' && act && !reported);
      if (!canAct) ghost.visible = false;
    },
    /**
     * Free building: the scene as the server knows it. Pieces added or removed by the others always
     * apply. A pose only applies when someone just reported a new one (a repeated pose is old news,
     * and my own simulation knows better), and never while I am in the middle of something myself.
     */
    merge(rows) {
      const seen = new Set();
      for (const [id, ...a] of rows) {
        seen.add(id);
        const key = a.join(',');
        const p = byId.get(id);
        if (!p) {
          const added = addPlank(new V3(a[0], a[1], a[2]), new Quat(a[3], a[4], a[5], a[6]).normalize(), id);
          added.server = key;
          wake(added.mesh.position, L * 1.5);
          continue;
        }
        p.local = false; // the server has it now
        if (p.server === key) continue;
        p.server = key;
        if (!dirty && !hold && differs(p.mesh, a)) setPose(p, a);
      }
      // A piece I just placed may not have reached the server yet: it is not "removed".
      const gone = planks.filter((p) => !seen.has(p.id) && !p.local);
      for (const p of gone) drop(p);
      if (gone.length) wake();
    },
    /** Free building: my piece was refused by the server. */
    remove(id) {
      const p = byId.get(id);
      if (p) { drop(p); wake(); }
    },
    setBall(value) { ballMode = value; if (value) ghost.visible = false; },
    /** A ball thrown by someone else. */
    throwBall: spawnBall,
    setOrient(i) { orient = i; },
    rotate(angle) { yaw += angle; },
    resetCamera,
    dispose() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      controls.dispose();
      geometry.dispose();
      ballGeometry.dispose();
      grain.dispose();
      renderer.dispose();
      world.free();
    },
  };
}
