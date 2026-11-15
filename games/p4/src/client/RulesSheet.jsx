import { Sheet } from '@bgio/ui/components/ui.jsx';
import '@bgio/ui/components/shared.css';

export default function RulesSheet({ open, onClose }) {
  return (
    <Sheet open={open} onClose={onClose} title="Les règles de P4IO" size="lg">
      <div className="rules">
        <section>
          <h3>Le but</h3>
          <p>Aligner <strong>quatre jetons</strong> de sa couleur : à l’horizontale, à la verticale ou en diagonale.</p>
        </section>
        <section>
          <h3>Le jeu</h3>
          <ul>
            <li>À votre tour, choisissez une colonne : le jeton tombe tout en bas, sur le dernier jeton posé.</li>
            <li>Sur ordinateur, cliquez la colonne. Sur téléphone, touchez-la pour la choisir, puis touchez-la encore pour lâcher le jeton.</li>
            <li>Si le plateau est plein sans alignement, la manche est nulle.</li>
          </ul>
        </section>
        <section>
          <h3>La partie</h3>
          <ul>
            <li>Elle se joue en 1, 3 ou 5 manches gagnantes. Celui qui commence change à chaque manche.</li>
            <li>À trois joueurs, le plateau est plus grand (9 × 7 ou 11 × 8) et le premier qui aligne quatre jetons gagne la manche.</li>
          </ul>
        </section>
        <section>
          <h3>Astuce</h3>
          <p>Les colonnes du centre font partie du plus grand nombre d’alignements. Et cherchez à créer deux menaces à la fois : l’adversaire ne peut en bloquer qu’une.</p>
        </section>
      </div>
    </Sheet>
  );
}
