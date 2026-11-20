import { Sheet } from '@bgio/ui/components/ui.jsx';
import '@bgio/ui/components/shared.css';

export default function RulesSheet({ open, onClose }) {
  return (
    <Sheet open={open} onClose={onClose} title="Les règles de MindIO" size="lg">
      <div className="rules">
        <section>
          <h3>Le but</h3>
          <p>Trouver un <strong>code secret</strong> de 4 pions (6 couleurs) ou de 5 pions (8 couleurs) en un minimum d’essais : 10 essais en 4 pions, 12 en 5 pions.</p>
        </section>
        <section>
          <h3>Les indices</h3>
          <ul>
            <li>Après chaque essai, la plaque de laiton répond :</li>
            <li>un <strong>pion rouge</strong> par couleur juste et <strong>bien placée</strong> ;</li>
            <li>un <strong>pion blanc</strong> par couleur juste mais <strong>mal placée</strong>.</li>
            <li>Les indices ne disent pas quels pions sont concernés : c’est à vous de le déduire. Une couleur répétée dans l’essai ne compte pas plus de fois qu’elle n’apparaît dans le code.</li>
          </ul>
        </section>
        <section>
          <h3>Les modes</h3>
          <ul>
            <li><strong>Duel</strong> : chacun compose un code pour l’autre, puis vous cherchez en même temps. Les indices tombent quand vous avez joué tous les deux. Le premier qui trouve gagne la manche ; trouvés au même essai, ou personne au bout des essais : manche nulle.</li>
            <li><strong>Classique</strong> : un codeur compose, l’autre cherche, et les rôles s’inversent à chaque manche. Le codeur marque un point par essai, plus un si le code n’est pas trouvé. Le plus de points gagne.</li>
            <li><strong>Course</strong> : le cabinet tire un seul code, vous le cherchez tous les deux en même temps. Vous voyez les indices de l’adversaire, pas ses couleurs.</li>
          </ul>
        </section>
        <section>
          <h3>Jouer</h3>
          <ul>
            <li>Touchez une couleur : elle se pose dans le trou en surbrillance. Vous pouvez aussi la glisser dans le trou de votre choix.</li>
            <li>Touchez un pion posé pour le retirer, ou un trou vide pour le choisir.</li>
            <li>Au clavier : touches 1 à 8 pour les couleurs, Retour arrière pour effacer, Entrée pour valider.</li>
            <li>Si le temps s’écoule, un essai est tiré au hasard : ne laissez pas filer le chrono !</li>
          </ul>
        </section>
        <section>
          <h3>Astuce</h3>
          <p>Commencez par deux couleurs en double (par exemple rouge rouge orange orange) : la réponse élimine beaucoup de codes d’un coup. Ensuite, ne jouez que des codes compatibles avec tous les indices reçus.</p>
        </section>
      </div>
    </Sheet>
  );
}
