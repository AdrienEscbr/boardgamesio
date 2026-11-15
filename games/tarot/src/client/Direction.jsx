// Direction of play around the table. Seats are laid out so that the next player
// sits on your right: on screen, play goes from the bottom (you) to the right, the
// top, the left — counter-clockwise. Arcs and arrow heads are computed, not drawn by hand.

const R = 80;
const HEAD = 11;
const rad = (deg) => (deg * Math.PI) / 180;
// Screen angles (y points down): 90° = bottom, 0° = right, -90° = top, 180° = left.
const point = (deg) => [R * Math.cos(rad(deg)), R * Math.sin(rad(deg))];

function arc(from, to) {
  const [x1, y1] = point(from);
  const [x2, y2] = point(to);
  // Decreasing angle = counter-clockwise on screen = SVG sweep-flag 0.
  const d = `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${R} ${R} 0 0 0 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  // Tangent when the angle decreases: (sin θ, −cos θ). The head opens backwards from the tip.
  const t = rad(to);
  const dir = [Math.sin(t), -Math.cos(t)];
  const back = (a) => {
    const c = Math.cos(a);
    const s = Math.sin(a);
    const bx = -dir[0] * c + dir[1] * s;
    const by = -dir[0] * s - dir[1] * c;
    return `${(x2 + bx * HEAD).toFixed(1)} ${(y2 + by * HEAD).toFixed(1)}`;
  };
  const head = `M ${back(rad(28))} L ${x2.toFixed(1)} ${y2.toFixed(1)} L ${back(rad(-28))}`;
  return { d, head };
}

// Four quarter arcs with a gap at each seat direction.
const ARCS = [arc(78, 12), arc(-12, -78), arc(-102, -168), arc(168, 102)];

export default function Direction() {
  return (
    <svg className="t-direction" viewBox="-100 -100 200 200" aria-hidden>
      {ARCS.map((a, i) => (
        <g key={i}>
          <path className="t-direction__arc" d={a.d} />
          <path className="t-direction__head" d={a.head} />
        </g>
      ))}
    </svg>
  );
}
