import { Sheet } from '@bgio/ui/components/ui.jsx';
import '@bgio/ui/components/shared.css';

export default function RulesSheet({ open, onClose }) {
  return (
    <Sheet open={open} onClose={onClose} title="Les règles du Tarot" size="lg">
      <div className="rules">
        <section>
          <h3>Le but</h3>
          <p>Un joueur, le <strong>preneur</strong>, joue contre les autres : il doit marquer assez de points dans ses plis. Le nombre de points nécessaires dépend des <strong>bouts</strong> qu’il remporte (le 1 d’atout ou Petit, le 21 et l’Excuse) : 56 sans bout, 51 avec un, 41 avec deux, 36 avec les trois.</p>
        </section>
        <section>
          <h3>Les enchères</h3>
          <ul>
            <li>Chacun parle une fois : <strong>Petite</strong> (×1), <strong>Garde</strong> (×2), <strong>Garde sans</strong> (×4, le chien compte pour le preneur sans être vu), <strong>Garde contre</strong> (×6, le chien va à la défense), ou Passe.</li>
            <li>En Petite et en Garde, le chien est montré à tous ; le preneur le prend et fait son <strong>écart</strong> : ni roi, ni bout, et un atout seulement s’il n’a pas le choix.</li>
            <li>À 5 joueurs, le preneur <strong>appelle un roi</strong> : celui qui l’a devient son partenaire, en secret jusqu’à ce que le roi tombe.</li>
          </ul>
        </section>
        <section>
          <h3>Le jeu de la carte</h3>
          <ul>
            <li>On doit <strong>fournir</strong> la couleur demandée. Sinon, on doit <strong>couper</strong> avec un atout, et <strong>monter</strong> au-dessus des atouts déjà joués si possible.</li>
            <li>L’<strong>Excuse</strong> se joue à tout moment ; elle reste à son camp (contre une carte basse donnée en échange).</li>
            <li>Les cartes que vous pouvez jouer sont lumineuses ; touchez une carte éteinte pour savoir pourquoi.</li>
          </ul>
        </section>
        <section>
          <h3>Les primes</h3>
          <ul>
            <li><strong>Petit au bout</strong> : le camp qui remporte le dernier pli avec le Petit dedans gagne 10 × le coefficient.</li>
            <li><strong>Poignée</strong> : montrer ses atouts avec sa première carte (10, 13 ou 15 à 4 joueurs) rapporte 20, 30 ou 40 au camp qui gagne la donne.</li>
            <li><strong>Chelem</strong> : remporter tous les plis. Annoncé : +400 (−200 s’il échoue) ; non annoncé : +200.</li>
          </ul>
        </section>
        <section>
          <h3>Le décompte</h3>
          <p>Valeur de la donne : (25 + l’écart de points) × le coefficient, plus les primes. Chaque défenseur paie (ou reçoit) cette valeur ; la feuille de score détaille chaque calcul.</p>
        </section>
      </div>
    </Sheet>
  );
}
