import { signed, total } from './i18n.js';

/** Points of every round, one row per round, and the totals (lowest is best). */
export default function ScoreTable({ view, names, me }) {
  const nameOf = (id) => (id === me ? 'Vous' : names[id] ?? '—');
  if (!view.history.length) return <div className="ct-recap"><p className="ct-scores__empty">Aucune manche terminée.</p></div>;
  const best = Math.min(...view.players.map((p) => p.total));
  return (
    <div className="ct-recap">
      <div className="ct-scores">
        <table>
          <thead>
            <tr>
              <th scope="col">Manche</th>
              {view.players.map((p) => <th key={p.id} scope="col" className={p.id === me ? 'is-me' : ''}>{nameOf(p.id)}</th>)}
            </tr>
          </thead>
          <tbody>
            {view.history.map((h) => (
              <tr key={h.round}>
                <th scope="row" className="tabular">{h.round}</th>
                {view.players.map((p) => (
                  <td key={p.id} className={`tabular ${h.points[p.id] <= 0 ? 'is-zero' : ''} ${h.cactusBy === p.id ? `is-${h.outcome}` : ''}`}>
                    {signed(h.points[p.id])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              {view.players.map((p) => <td key={p.id} className={`tabular ${p.total === best ? 'is-best' : ''} ${p.red ? 'is-red' : ''}`}>{total(p.total)}</td>)}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="ct-scores__note">Zone rouge au-delà de {view.threshold} points ; le plus petit total gagne. Encadré vert : « Cactus » réussi ; doré : royal ; rouge : raté.</p>
    </div>
  );
}
