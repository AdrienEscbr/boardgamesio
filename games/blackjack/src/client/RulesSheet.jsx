import { Sheet } from '@bgio/ui/components/ui.jsx';
import '@bgio/ui/components/shared.css';

export default function RulesSheet({ open, onClose }) {
  return (
    <Sheet open={open} onClose={onClose} title="Les règles de BlackjackIO" size="lg">
      <div className="rules">
        <section>
          <h3>Le but</h3>
          <p>Chacun joue contre <strong>la banque</strong>, pas contre les autres : approchez 21 sans le dépasser et faites mieux que le croupier. Tout le monde part avec les mêmes jetons ; après la dernière manche, <strong>le plus gros tapis gagne</strong>.</p>
        </section>
        <section>
          <h3>Les cartes</h3>
          <ul>
            <li>De 2 à 10 : leur valeur. Valet, dame et roi : 10.</li>
            <li>L’as vaut 11, ou 1 si l’on dépasse 21 (le total s’affiche alors « 7 / 17 »).</li>
            <li>Un as et une figure ou un 10 en deux cartes : <strong>blackjack</strong>, payé 3 contre 2.</li>
          </ul>
        </section>
        <section>
          <h3>Une manche</h3>
          <ul>
            <li><strong>Mise</strong> : tout le monde mise en même temps (par 10, à partir de la mise minimum), sans voir les mises des autres. On peut aussi passer la manche.</li>
            <li><strong>Distribution</strong> : deux cartes visibles pour chacun ; la banque en a une visible et une cachée. Sous un as ou un 10, elle vérifie sa carte cachée : avec un blackjack, elle gagne tout de suite (un blackjack du joueur fait égalité).</li>
            <li><strong>Jeu</strong> : chacun à son tour, de gauche à droite.</li>
            <li><strong>La banque</strong> retourne sa carte et tire jusqu’à 17 au moins, puis s’arrête. Au-delà de 21, elle saute : toutes les mains encore en jeu gagnent.</li>
          </ul>
        </section>
        <section>
          <h3>Vos coups</h3>
          <ul>
            <li><strong>Tirer</strong> : une carte de plus. Au-delà de 21, vous sautez et perdez votre mise.</li>
            <li><strong>Rester</strong> : vous gardez votre total.</li>
            <li><strong>Doubler</strong> (sur deux cartes) : vous doublez la mise et recevez une seule carte.</li>
            <li><strong>Séparer</strong> (sur une paire de même valeur) : deux mains, une mise chacune, jouées l’une après l’autre ; jusqu’à quatre mains. On peut doubler après avoir séparé. Des as séparés ne reçoivent qu’une carte chacun, et 21 n’y est pas un blackjack.</li>
            <li>Au clavier : <strong>T</strong> tirer, <strong>R</strong> rester, <strong>D</strong> doubler, <strong>S</strong> séparer ; <strong>Entrée</strong> pour miser.</li>
          </ul>
        </section>
        <section>
          <h3>Les gains</h3>
          <ul>
            <li>Blackjack : 3 contre 2 (une mise de 100 rapporte 150).</li>
            <li>Main gagnante : 1 contre 1. Égalité : la mise est rendue.</li>
            <li>Sous la mise minimum, vous quittez la table et regardez la fin.</li>
            <li>Si le temps s’écoule pendant la mise, les jetons posés sur la table sont joués ; sans jeton, vous passez la manche. Pendant votre main, vous restez.</li>
          </ul>
        </section>
        <section>
          <h3>Astuce</h3>
          <p>Le bouton marqué <strong>conseil</strong> suit la stratégie de base, le meilleur coup sur le long terme (à désactiver dans les réglages). Et avant la dernière manche, regardez les tapis : un retard se rattrape d’une grosse mise.</p>
        </section>
      </div>
    </Sheet>
  );
}
