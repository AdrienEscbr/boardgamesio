import { Sheet } from '@bgio/ui/components/ui.jsx';
import '@bgio/ui/components/shared.css';

export default function RulesSheet({ open, onClose }) {
  return (
    <Sheet open={open} onClose={onClose} title="Les règles de NavalIO" size="lg">
      <div className="rules">
        <section>
          <h3>Le but</h3>
          <p>Couler toutes les flottes adverses. Chacun joue pour soi : le dernier joueur qui a encore un navire à flot gagne.</p>
        </section>
        <section>
          <h3>La flotte</h3>
          <ul>
            <li>Chacun place en secret, sur une grille de 10 × 10, un <strong>porte-avions</strong> (5 cases), un <strong>croiseur</strong> (4), un <strong>contre-torpilleur</strong> (3), un <strong>sous-marin</strong> (3) et un <strong>torpilleur</strong> (2).</li>
            <li>Les navires sont horizontaux ou verticaux et <strong>ne se touchent pas</strong>, même par un coin.</li>
            <li>Glissez un navire pour le déplacer, touchez-le pour le faire pivoter. Tout le monde place sa flotte en même temps ; à la fin du temps, les flottes manquantes sont placées au hasard.</li>
          </ul>
        </section>
        <section>
          <h3>Les tirs</h3>
          <ul>
            <li>À votre tour, choisissez une case chez un adversaire. <strong>Dans l’eau</strong> : un rond blanc. <strong>Touché</strong> : le navire prend feu. Quand toutes ses cases sont touchées, il est <strong>coulé</strong> et révélé à tous.</li>
            <li>Tous les tirs sont visibles par tout le monde : vous pouvez achever un adversaire affaibli.</li>
            <li>Une flotte entièrement coulée est éliminée ; son joueur reste spectateur.</li>
          </ul>
        </section>
        <section>
          <h3>Les règles de tir</h3>
          <ul>
            <li><strong>Classique</strong> : un tir par tour.</li>
            <li><strong>Rejouer si touché</strong> : tant que vous touchez un navire, vous tirez encore.</li>
            <li><strong>Salve</strong> : autant de tirs que de navires encore à flot, tirés ensemble, et répartis comme vous voulez entre les adversaires.</li>
          </ul>
        </section>
        <section>
          <h3>Astuce</h3>
          <p>Deux navires ne se touchent jamais : autour d’un navire coulé, il n’y a que de l’eau. Et un navire touché continue forcément en ligne droite.</p>
        </section>
      </div>
    </Sheet>
  );
}
