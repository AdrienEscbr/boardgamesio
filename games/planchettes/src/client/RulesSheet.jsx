import { Sheet } from '@bgio/ui/components/ui.jsx';
import '@bgio/ui/components/shared.css';

export default function RulesSheet({ open, onClose }) {
  return (
    <Sheet open={open} onClose={onClose} title="Les règles de PlanchettesIO" size="lg">
      <div className="rules">
        <section>
          <h3>Le but</h3>
          <p>Des pièces en bois, une vraie physique, et un geste chacun son tour. <strong>Celui qui fait tout tomber perd la manche.</strong> À la fin, le joueur qui compte le moins de chutes gagne ; à égalité, celui qui a réussi le plus de coups.</p>
        </section>
        <section>
          <h3>Tour d’équilibre</h3>
          <ul>
            <li>La tour compte 18 étages de 3 blocs, croisés d’un étage à l’autre.</li>
            <li>À votre tour, attrapez un bloc et <strong>tirez-le doucement</strong> hors de la tour. L’étage du haut ne se touche pas.</li>
            <li>Une fois le bloc sorti, <strong>reposez-le au sommet</strong>. <kbd>R</kbd> le fait pivoter d’un quart de tour.</li>
            <li>Si un bloc touche le tapis ou si la tour s’affaisse, la manche est perdue.</li>
          </ul>
        </section>
        <section>
          <h3>Construction</h3>
          <ul>
            <li>Tout le monde bâtit la même construction, à partir d’une petite tour de planchettes.</li>
            <li>À votre tour, posez <strong>une planchette</strong> : à plat, sur chant ou debout (<kbd>Espace</kbd>), tournée comme vous voulez (<kbd>R</kbd>, <kbd>T</kbd>).</li>
            <li>Elle se pose sur la construction, jamais directement sur le tapis.</li>
            <li>Si une planchette tombe sur le tapis ou si la construction s’affaisse, la manche est perdue.</li>
          </ul>
        </section>
        <section>
          <h3>Construction libre</h3>
          <ul>
            <li>Pas de tour, pas de chrono, pas de perdant : tout le monde pose des planchettes <strong>en même temps</strong>, où il veut, même sur le tapis.</li>
            <li><strong>Boule</strong> (<kbd>B</kbd>) : visez la construction et cliquez pour lancer une boule dessus.</li>
            <li><strong>Annuler</strong> (<kbd>Z</kbd>) retire votre dernière planchette, jamais celles des autres.</li>
            <li>L’hôte peut tout effacer, et termine la partie quand il veut depuis les réglages.</li>
          </ul>
        </section>
        <section>
          <h3>La vue</h3>
          <ul>
            <li>Glissez pour tourner autour de la table, pincez ou utilisez la molette pour zoomer.</li>
            <li>Clic droit et glisser (ou deux doigts) pour déplacer la vue.</li>
          </ul>
        </section>
        <section>
          <h3>Le temps</h3>
          <p>Chaque coup est chronométré jusqu’à la pose de la pièce. Passer son tour serait trop confortable : <strong>temps écoulé, manche perdue</strong>. Après une chute, on repart d’une table neuve et le joueur suivant commence.</p>
        </section>
      </div>
    </Sheet>
  );
}
