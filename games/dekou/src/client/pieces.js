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
export const shellHTML = (extra = '') => `<span class="dk-shell ${extra}"><b></b></span>`;

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
