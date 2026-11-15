import { CONTRACT_LABELS, POIGNEE_LABELS, cardLabel } from './i18n.js';

const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','));
const signed = (n) => `${n > 0 ? '+' : ''}${fmt(n)}`;

/** How a deal was scored, step by step: the rules made visible. */
export function DealBreakdown({ entry, nameOf }) {
  const r = entry.result;
  const team = entry.partnerId ? `${nameOf(entry.takerId)} et ${nameOf(entry.partnerId)}` : nameOf(entry.takerId);
  const lines = [
    ['Points réalisés', `${fmt(r.realized)} pour ${r.needed} nécessaires (${r.bouts} bout${r.bouts > 1 ? 's' : ''})`],
    [r.won ? 'Contrat réussi de' : 'Contrat chuté de', `${fmt(Math.abs(r.diff))} point${Math.abs(r.diff) >= 2 ? 's' : ''}`],
    ['Valeur du contrat', `(25 + ${r.base - 25}) × ${r.mult} = ${signed(r.contractPoints)}`],
  ];
  if (r.petitAuBoutPoints) lines.push(['Petit au bout', `${r.petitAuBout === 'attack' ? 'attaque' : 'défense'} : ${signed(r.petitAuBoutPoints)}`]);
  if (entry.poignees.length) lines.push(['Poignées', `${entry.poignees.map((p) => `${POIGNEE_LABELS[p.level].toLowerCase()} (${nameOf(p.playerId)})`).join(', ')} : ${signed(r.poigneePoints)}`]);
  if (r.chelemPoints) lines.push(['Chelem', signed(r.chelemPoints)]);
  return (
    <div className="t-break">
      <p className="t-break__head">
        <strong>{CONTRACT_LABELS[entry.contract]}</strong> de {team}
        {entry.calledCard && <> · appel : {cardLabel(entry.calledCard)}</>}
      </p>
      <p className={`t-break__verdict ${r.won ? 'is-won' : 'is-lost'}`}>{r.won ? 'Contrat réussi' : 'Contrat chuté'}</p>
      <dl className="t-break__lines">
        {lines.map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd className="tabular">{v}</dd></div>
        ))}
        <div className="is-total"><dt>Par défenseur</dt><dd className="tabular">{signed(r.value)}</dd></div>
      </dl>
      <ul className="t-break__deltas">
        {Object.entries(r.deltas).sort((a, b) => b[1] - a[1]).map(([id, d]) => (
          <li key={id}>
            <span className="t-break__name">{nameOf(id)}</span>
            <strong className={`tabular ${d >= 0 ? 'is-plus' : 'is-minus'}`}>{signed(d)}</strong>
            {entry.totals && <span className="t-break__total tabular">Total {signed(entry.totals[id])}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Running score table, one row per deal. */
export function ScoreTable({ history, players, nameOf }) {
  if (!history.length) return <p className="t-break__empty">Aucune donne terminée.</p>;
  return (
    <div className="t-table-wrap">
      <table className="t-scores">
        <thead>
          <tr>
            <th>Donne</th>
            {players.map((p) => <th key={p.id}>{nameOf(p.id)}</th>)}
          </tr>
        </thead>
        <tbody>
          {history.map((h) => (
            <tr key={h.donne}>
              <td>
                <span className="t-scores__n">{h.donne}</span>
                <span className="t-scores__c">{CONTRACT_LABELS[h.contract]} {h.result.won ? '✓' : '✗'}</span>
              </td>
              {players.map((p) => (
                <td key={p.id} className="tabular">
                  <span className="t-scores__total">{h.totals[p.id]}</span>
                  <span className={`t-scores__delta ${h.result.deltas[p.id] >= 0 ? 'is-plus' : 'is-minus'}`}>{signed(h.result.deltas[p.id])}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
