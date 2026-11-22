// The pieces as HTML strings: the board renders them, and the effects layer clones them
// into flying nodes, so a piece looks the same on the map and in the air.

const PIPS = {
  1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9],
};

/** A die: an army unit. White dice take their camp's colour (by origin seat), red = reinforcements. */
export function dieHTML(value, color = 'white', seat = 0, extra = '') {
  const pips = PIPS[value] ?? [];
  let cells = '';
  for (let i = 1; i <= 9; i++) cells += `<i${pips.includes(i) ? ' class="on"' : ''}></i>`;
  const kind = color === 'red' ? 'is-red' : `is-camp${seat}`;
  return `<span class="dk-die ${kind} ${extra}" data-v="${value}">${cells}</span>`;
}

export const cubeHTML = (extra = '') => `<span class="dk-cube ${extra}"><b></b></span>`;
// The shell: a mortar round, nose up. Olive steel body with the yellow high-explosive band,
// a brass fuze, copper obturator rings, a tail boom and four fins (two seen side on).
// Every copy repeats the same defs, so duplicate ids resolve to identical gradients.
const SHELL_SVG = `<svg viewBox="0 0 40 84" aria-hidden="true">
  <defs>
    <linearGradient id="dk-sh-body" x1="0" x2="1">
      <stop offset="0" stop-color="#262c19"/><stop offset=".22" stop-color="#5c6a3a"/>
      <stop offset=".4" stop-color="#93a165"/><stop offset=".58" stop-color="#5f6c3d"/><stop offset="1" stop-color="#20251a"/>
    </linearGradient>
    <linearGradient id="dk-sh-band" x1="0" x2="1">
      <stop offset="0" stop-color="#6e5410"/><stop offset=".4" stop-color="#f2cc45"/><stop offset=".6" stop-color="#c79a22"/><stop offset="1" stop-color="#4f3c0b"/>
    </linearGradient>
    <linearGradient id="dk-sh-brass" x1="0" x2="1">
      <stop offset="0" stop-color="#6b4f17"/><stop offset=".42" stop-color="#ffe9a3"/><stop offset=".62" stop-color="#d1a542"/><stop offset="1" stop-color="#5a4112"/>
    </linearGradient>
    <linearGradient id="dk-sh-steel" x1="0" x2="1">
      <stop offset="0" stop-color="#3a3d38"/><stop offset=".45" stop-color="#a9aca2"/><stop offset="1" stop-color="#40433c"/>
    </linearGradient>
    <clipPath id="dk-sh-clip"><path d="M20 9C29 11 33.5 24 33 37C32.6 47 27 54.5 22.5 57H17.5C13 54.5 7.4 47 7 37C6.5 24 11 11 20 9Z"/></clipPath>
  </defs>
  <path d="M14 62H26L33 78V83H22V77H18V83H7V78Z" fill="url(#dk-sh-steel)"/>
  <path d="M19 60H21V84H19Z" fill="#2c2f29"/>
  <rect x="16.5" y="55" width="7" height="19" rx="1" fill="url(#dk-sh-steel)"/>
  <rect x="16.5" y="62" width="7" height="1.4" fill="#2a2c26"/><rect x="16.5" y="66" width="7" height="1.4" fill="#2a2c26"/>
  <path d="M20 9C29 11 33.5 24 33 37C32.6 47 27 54.5 22.5 57H17.5C13 54.5 7.4 47 7 37C6.5 24 11 11 20 9Z" fill="url(#dk-sh-body)"/>
  <g clip-path="url(#dk-sh-clip)">
    <rect x="0" y="22" width="40" height="5.5" fill="url(#dk-sh-band)"/>
    <rect x="0" y="40.5" width="40" height="2" fill="#a8622c"/><rect x="0" y="44.5" width="40" height="2" fill="#a8622c"/>
    <rect x="0" y="42.5" width="40" height="2" fill="#2a2416" opacity=".55"/>
    <ellipse cx="14" cy="30" rx="3" ry="14" fill="#fff" opacity=".16"/>
  </g>
  <path d="M20 1.5C23.4 1.5 25.6 5 26.3 10.5H13.7C14.4 5 16.6 1.5 20 1.5Z" fill="url(#dk-sh-brass)"/>
  <rect x="13.2" y="10" width="13.6" height="2.4" rx=".8" fill="#5a4112"/>
  <circle cx="20" cy="2.6" r="1.4" fill="#fff3c4"/>
</svg>`;

export const shellHTML = (extra = '') => `<span class="dk-shell ${extra}">${SHELL_SVG}</span>`;

/** The hole the shell struck: scorched earth, a smouldering ember. */
const SMOKE = '<span class="dk-smoke" aria-hidden="true"><i></i><i></i><i></i></span>';

export const craterHTML = () => `<span class="dk-crater"><i></i><i></i><i></i></span>${SMOKE}`;

// ---- the phase overlays ------------------------------------------------------------

/** Radar: a block a strike can reach (a blip), or one it cannot (a faint echo). */
export const blipHTML = () => '<span class="dk-blip"></span>';
export const echoHTML = () => '<span class="dk-echo"></span>';

/** Radar: an enclosed hole, a weak point, with the number of blocks a strike there blows. */
export const weakHTML = (n) => `<span class="dk-weak"><svg viewBox="0 0 40 40" aria-hidden="true">
  <circle class="dk-weak__pulse" cx="20" cy="20" r="14" fill="none" stroke="#ffc247" stroke-width="1.5"/>
  <path d="M20 4 L36 20 L20 36 L4 20 Z" fill="rgba(255,194,71,.14)" stroke="#ffc247" stroke-width="2"/>
  <path d="M20 9 L18 16 L23 19 L17 24 L21 31" fill="none" stroke="#fff3d0" stroke-width="1.6" stroke-linejoin="round"/>
</svg><b>${n}</b></span>`;

/** Clearing: a block around the crater, cracked and smoking. */
export const crackedHTML = () => `<span class="dk-cube is-cracked"><b></b><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 2 L8 8 L6 12 L10 18 M8 8 L14 6 L18 9 M10 18 L13 13 L17 15" fill="none" stroke="#2b2a24" stroke-width="1.1" stroke-linejoin="round"/><path d="M8.6 8.4 L13.6 6.6" stroke="rgba(255,255,255,.35)" stroke-width=".5"/></svg></span>${SMOKE}`;

export function cellHTML(cell) {
  if (!cell) return '';
  if (cell.kind === 'die') return dieHTML(cell.value, cell.color, cell.seat);
  if (cell.kind === 'cube') return cubeHTML();
  return '';
}

/** A detached node for the effects layer. */
export function pieceNode(html) {
  const wrap = document.createElement('span');
  wrap.className = 'dk-flyer';
  wrap.innerHTML = html;
  return wrap;
}
