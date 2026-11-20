import { Sheet } from '@bgio/ui/components/ui.jsx';
import '@bgio/ui/components/shared.css';

export default function RulesSheet({ open, onClose }) {
  return (
    <Sheet open={open} onClose={onClose} title="Les règles de DekouIO" size="lg">
      <div className="rules">
        <section>
          <h3>Le terrain</h3>
          <p>Deux tranchées de 5 lignes sur 4 colonnes, côte à côte : chaque <strong>ligne</strong> du terrain compte donc <strong>8 positions</strong>. La tranchée de gauche reçoit les <strong>unités</strong> (les dés), celle de droite les <strong>blocs</strong> (les cubes) et l’<strong>obus</strong> (la balle). Chaque camp a 5 unités blanches et 1 unité rouge ; la réserve compte 19 blocs.</p>
        </section>
        <section>
          <h3>Le but</h3>
          <p>Le camp qui n’a <strong>plus aucune unité en main</strong> au début de son tour perd la partie.</p>
        </section>
        <section>
          <h3>Un tour, trois ordres</h3>
          <ul>
            <li><strong>Déploiement</strong> : lancez une unité dans la tranchée de gauche.</li>
            <li><strong>Fortification</strong> : lancez un bloc dans la tranchée de droite (tant que la réserve en a).</li>
            <li><strong>Frappe tactique</strong> : si une position vide est <strong>encerclée</strong> de blocs (4 voisins, 3 sur un bord, 2 dans un coin ; l’autre tranchée compte comme un bord), vous pouvez y lancer l’obus. Il fait sauter ces blocs, un par un, dans l’ordre de votre choix. La frappe est facultative.</li>
          </ul>
        </section>
        <section>
          <h3>Rapatrier des unités</h3>
          <ul>
            <li>Une unité dont la face est égale au <strong>nombre de positions vides de sa ligne</strong> (les 8, unités et blocs comptés) quitte le terrain.</li>
            <li>On vérifie <strong>toutes</strong> les unités, des deux camps, <strong>à chaque changement</strong> : une unité qui part libère une position et peut en faire partir une autre.</li>
            <li>L’unité revient dans la main de <strong>celui qui a provoqué</strong> le départ, même si elle appartenait à l’adversaire.</li>
          </ul>
        </section>
        <section>
          <h3>Viser</h3>
          <ul>
            <li>Touchez une position : la ligne s’éclaire, le compteur de droite donne ses positions vides et l’ordre annonce ce qui se passera (la face qui rentre aussitôt, les unités qu’un bloc rapatrie).</li>
            <li>Une aiguille balaie la jauge : <strong>tirez</strong> (bouton, Espace ou Entrée) quand elle passe au centre. Plus vous en êtes loin, plus le lancer dévie.</li>
            <li>Un lancer qui sort de sa tranchée, ou qui tombe sur une position occupée, est raté. On a <strong>trois essais</strong> par ordre.</li>
          </ul>
        </section>
        <section>
          <h3>Ratés et pertes</h3>
          <ul>
            <li>Une unité ratée trois fois part dans <strong>vos pertes</strong> avec la face qu’elle montrait.</li>
            <li>Quand une de vos unités atterrit, vous rappelez de vos pertes toutes celles qui montrent <strong>la même face</strong>.</li>
            <li>Un bloc raté trois fois est posé par <strong>l’adversaire</strong>, où il veut.</li>
            <li>L’obus raté trois fois : la frappe est perdue.</li>
          </ul>
        </section>
        <section>
          <h3>L’unité rouge : les renforts</h3>
          <p>Elle se lance quand vous n’avez plus d’unité blanche. Elle agit comme une autre unité, et sa face donne le nombre de <strong>blocs que vous posez</strong> vous-même dans la tranchée de droite, avant la fortification. Elle se rapatrie comme les autres ; la perdre ne fait pas perdre la partie.</p>
        </section>
        <section>
          <h3>Ouverture</h3>
          <p>Chaque camp lance une unité, qui reste sur le terrain. La plus forte face engage la partie ; en cas d’égalité, on relance.</p>
        </section>
      </div>
    </Sheet>
  );
}
