import './cover.css';

/** Home-page thumbnail: a little balance tower seen from the side, one block pulled out. */
const LEVELS = ['side', 'ends', 'side', 'gap'];

export default function Cover() {
  return (
    <div className="pl-cover" aria-hidden>
      {LEVELS.map((kind, i) => (
        <span key={i} className={`pl-cover__level is-${kind}`}>
          {kind === 'side' ? <i /> : <><i /><i /><i /></>}
        </span>
      ))}
    </div>
  );
}
