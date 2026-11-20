import { memo, useId } from 'react';
import { colorOf, isWild, kindOf } from '../engine/cards.js';
import { COLOR_HEX, COLOR_NAMES, KIND_NAMES } from './i18n.js';

// UINIO cards: enamelled ceramic plaques. A cream glazed rim, a field of coloured enamel,
// and in the middle a quatrefoil cartouche, the azulejo's motif. Every colour also carries
// its own small mark (diamond, disc, triangle, square) so it never relies on hue alone.

const W = 200;
const H = 300;
export const CREAM = '#f5ecd9';
const INK = '#1b2130';

/** A quatrefoil of lobes of radius `r`, their centres `d` from the middle. */
function quatrefoil(d, r) {
  const t = (d + Math.sqrt(2 * r * r - d * d)) / 2; // where two lobes meet
  const a = `A${r} ${r} 0 1 1`;
  return `M${-t} ${-t} ${a} ${t} ${-t} ${a} ${t} ${t} ${a} ${-t} ${t} ${a} ${-t} ${-t} Z`;
}
const FOIL = quatrefoil(30, 32);
const SMALL_FOIL = quatrefoil(13, 14);

/** The mark of a colour, centred on 0,0, about `s` wide. */
export function Mark({ color, s = 12, fill = CREAM }) {
  const h = s / 2;
  if (color === 'r') return <path d={`M0 ${-h * 1.15} L${h} 0 L0 ${h * 1.15} L${-h} 0 Z`} fill={fill} />;
  if (color === 'y') return <circle r={h * 0.92} fill={fill} />;
  if (color === 'g') return <path d={`M0 ${-h * 1.05} L${h * 1.1} ${h * 0.85} L${-h * 1.1} ${h * 0.85} Z`} fill={fill} />;
  if (color === 'b') return <rect x={-h * 0.85} y={-h * 0.85} width={h * 1.7} height={h * 1.7} rx={s * 0.08} fill={fill} />;
  return null;
}

/** The symbol of an action card, drawn in `fill`, centred on 0,0 (about 70 wide). */
function Symbol({ kind, fill, small = false }) {
  const k = small ? 0.32 : 1;
  if (kind === 'S') {
    return (
      <g transform={`scale(${k})`}>
        <circle r="30" fill="none" stroke={fill} strokeWidth="11" />
        <path d="M-20 20 L20 -20" stroke={fill} strokeWidth="11" strokeLinecap="round" />
      </g>
    );
  }
  if (kind === 'R') {
    const arrow = 'M-26 -6 A26 26 0 0 1 20 -18 L26 -28 L30 -2 L6 -6 L13 -13 A17 17 0 0 0 -17 -4 Z';
    return (
      <g transform={`scale(${k})`}>
        <path d={arrow} fill={fill} />
        <path d={arrow} fill={fill} transform="rotate(180)" />
      </g>
    );
  }
  return null;
}

function Label({ text, size, fill, stroke, y = 0 }) {
  return (
    <text
      y={y}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={size}
      fontWeight="800"
      fill={fill}
      stroke={stroke}
      strokeWidth={stroke ? size * 0.06 : 0}
      paintOrder="stroke"
      style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.04em' }}
    >
      {text}
    </text>
  );
}

const cornerText = (card) => {
  const kind = kindOf(card);
  if (kind === 'D') return '+2';
  if (kind === 'F') return '+4';
  return /[0-9]/.test(kind) ? kind : null;
};

/** The four lobes in the four enamels: the wild's cartouche. */
function WildFoil({ uid, scale = 1 }) {
  return (
    <g transform={`scale(${scale})`}>
      <clipPath id={`${uid}-foil`}><path d={FOIL} /></clipPath>
      <g clipPath={`url(#${uid}-foil)`}>
        <rect x="-70" y="-70" width="70" height="70" fill={COLOR_HEX.r} />
        <rect x="0" y="-70" width="70" height="70" fill={COLOR_HEX.b} />
        <rect x="0" y="0" width="70" height="70" fill={COLOR_HEX.g} />
        <rect x="-70" y="0" width="70" height="70" fill={COLOR_HEX.y} />
        <g transform="translate(-32 -32)"><Mark color="r" s={14} /></g>
        <g transform="translate(32 -32)"><Mark color="b" s={14} /></g>
        <g transform="translate(32 32)"><Mark color="g" s={14} /></g>
        <g transform="translate(-32 32)"><Mark color="y" s={14} /></g>
      </g>
      <path d={FOIL} fill="none" stroke={CREAM} strokeWidth="5" />
    </g>
  );
}

function Glaze({ uid }) {
  return (
    <defs>
      <linearGradient id={`${uid}-field`} x1="0" y1="0" x2="0.7" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity="0.22" />
        <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity="0.28" />
      </linearGradient>
      <radialGradient id={`${uid}-shine`} cx="0.22" cy="0.08" r="0.7">
        <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
        <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
      </radialGradient>
      <linearGradient id={`${uid}-rim`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#fffaf0" />
        <stop offset="1" stopColor="#e2d4b8" />
      </linearGradient>
    </defs>
  );
}

/** The glazed plaque around a field of `fill`: rim, field, pooling, and the gloss on top. */
function Plaque({ uid, fill, children }) {
  return (
    <>
      <rect x="1.5" y="1.5" width={W - 3} height={H - 3} rx="22" fill={`url(#${uid}-rim)`} />
      <rect x="11" y="11" width={W - 22} height={H - 22} rx="15" fill={fill} />
      <rect x="11" y="11" width={W - 22} height={H - 22} rx="15" fill={`url(#${uid}-field)`} />
      {/* the enamel pools a little darker against the rim */}
      <rect x="12.5" y="12.5" width={W - 25} height={H - 25} rx="14" fill="none" stroke="#000" strokeOpacity="0.18" strokeWidth="3" />
      {children}
      <rect x="1.5" y="1.5" width={W - 3} height={H - 3} rx="22" fill={`url(#${uid}-shine)`} />
      <path d="M26 20 Q 60 12 120 14" stroke="#fff" strokeOpacity="0.55" strokeWidth="3" strokeLinecap="round" fill="none" />
      <rect x="1.5" y="1.5" width={W - 3} height={H - 3} rx="22" fill="none" stroke="rgba(40,30,15,0.28)" strokeWidth="2.5" />
    </>
  );
}

function Face({ card }) {
  const uid = useId().replace(/:/g, '');
  const color = colorOf(card);
  const kind = kindOf(card);
  const wild = isWild(card);
  const field = wild ? INK : COLOR_HEX[color];
  const corner = cornerText(card);
  const underline = kind === '6' || kind === '9';
  const Corner = ({ flip }) => (
    <g transform={flip ? `rotate(180 ${W / 2} ${H / 2})` : undefined}>
      <g transform="translate(36 42)">
        {corner ? <Label text={corner} size={34} fill={CREAM} /> : wild ? <path d={SMALL_FOIL} fill={CREAM} transform="scale(0.85)" /> : <Symbol kind={kind} fill={CREAM} small />}
        {underline && <rect x="-9" y="17" width="18" height="3.5" rx="1.5" fill={CREAM} />}
      </g>
      {!wild && <g transform="translate(36 78)"><Mark color={color} s={11} /></g>}
    </g>
  );
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="un-svg" aria-hidden>
      <Glaze uid={uid} />
      <Plaque uid={uid} fill={field}>
        <Corner />
        <Corner flip />
        <g transform={`translate(${W / 2} ${H / 2})`}>
          {wild ? (
            <>
              <WildFoil uid={uid} scale={kind === 'F' ? 1.05 : 1.12} />
              {kind === 'F' && <Label text="+4" size={46} fill={CREAM} stroke={INK} />}
            </>
          ) : (
            <>
              <path d={FOIL} fill={CREAM} transform="scale(1.06)" />
              <path d={FOIL} fill="none" stroke={field} strokeOpacity="0.35" strokeWidth="2" transform="scale(0.94)" />
              {/[0-9]/.test(kind) && <Label text={kind} size={92} fill={field} stroke="#00000022" y={2} />}
              {underline && <rect x="-20" y="42" width="40" height="7" rx="3" fill={field} />}
              {kind === 'D' && <Label text="+2" size={70} fill={field} y={2} />}
              <Symbol kind={kind} fill={field} />
            </>
          )}
        </g>
      </Plaque>
    </svg>
  );
}

function Back() {
  const uid = useId().replace(/:/g, '');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="un-svg" aria-hidden>
      <Glaze uid={uid} />
      <Plaque uid={uid} fill={INK}>
        {/* a band of small cream quatrefoils, like a tile frieze */}
        {[40, 260].map((y) => (
          <g key={y}>
            {[46, 82, 118, 154].map((x) => <path key={x} d={SMALL_FOIL} fill="none" stroke={CREAM} strokeOpacity="0.4" strokeWidth="2" transform={`translate(${x} ${y}) scale(0.7)`} />)}
          </g>
        ))}
        <g transform={`translate(${W / 2} ${H / 2})`}>
          <g transform="translate(0 -26)"><WildFoil uid={uid} scale={0.62} /></g>
          <rect x="-66" y="22" width="132" height="40" rx="20" fill={CREAM} />
          <Label text="UINIO" size={30} fill={INK} y={43} />
        </g>
      </Plaque>
    </svg>
  );
}

export const CardFace = memo(Face);
export const CardBack = memo(Back);

export function cardName(card) {
  const kind = kindOf(card);
  if (isWild(card)) return KIND_NAMES[kind];
  return `${KIND_NAMES[kind] ?? kind} ${COLOR_NAMES[colorOf(card)]}`;
}

/** A card, face up (`card`) or its back (`card` null). Sized by `--cw` on a parent. */
function Card({ card, className = '', ...rest }) {
  return (
    <span className={`un-card ${className}`} role={card ? 'img' : undefined} aria-label={card ? cardName(card) : undefined} {...rest}>
      {card ? <CardFace card={card} /> : <CardBack />}
    </span>
  );
}

export default memo(Card);
