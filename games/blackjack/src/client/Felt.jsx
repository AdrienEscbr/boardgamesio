import { useId } from 'react';

/**
 * The table: midnight-blue felt in a lacquered rail, the house rules printed in gold along
 * two arcs, as on a liner's gaming salon. Children are laid out by blackjack.css.
 */
export default function Felt({ top, children }) {
  const uid = useId().replace(/:/g, '');
  return (
    <div className="bj-felt">
      {top}
      <svg className="bj-felt__print" viewBox="0 22 400 98" preserveAspectRatio="xMidYMid meet" aria-hidden>
        <defs>
          <path id={`${uid}-a1`} d="M30 30 Q200 150 370 30" />
          <path id={`${uid}-a2`} d="M60 50 Q200 180 340 50" />
        </defs>
        <text className="bj-felt__big">
          <textPath href={`#${uid}-a1`} startOffset="50%" textAnchor="middle">LE BLACKJACK PAIE 3 CONTRE 2</textPath>
        </text>
        <text className="bj-felt__small">
          <textPath href={`#${uid}-a2`} startOffset="50%" textAnchor="middle">LA BANQUE TIRE À 16 ET RESTE À 17</textPath>
        </text>
      </svg>
      {children}
    </div>
  );
}
