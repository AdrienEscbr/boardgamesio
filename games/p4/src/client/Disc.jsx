/**
 * A glass disc. Colours are told apart by brightness as well as hue (honey, ink blue,
 * pearl), and each carries a small engraved mark, so they never rely on colour alone.
 */
export const SEAT_NAMES = ['Miel', 'Encre', 'Nacre'];

export default function Disc({ seat, className = '', style }) {
  return (
    <span className={`p4-disc p4-disc--${seat} ${className}`} style={style} aria-hidden>
      <span className={`p4-disc__mark p4-disc__mark--${seat}`} />
    </span>
  );
}
