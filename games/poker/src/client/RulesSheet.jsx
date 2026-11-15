import { Sheet } from '@bgio/ui/components/ui.jsx';
import '@bgio/ui/components/shared.css';
import { RISE_EVERY } from '../engine/game.js';

export default function RulesSheet({ open, onClose }) {
  return (
    <Sheet open={open} onClose={onClose} title="Les règles de PokerIO" size="lg">
      <div className="rules">
        <section>
          <h3>Le but</h3>
          <p>PokerIO est un <strong>Texas Hold’em sans limite</strong>. Tout le monde démarre avec le même tapis ; un joueur sans jetons est éliminé, et le dernier en lice gagne la partie.</p>
        </section>
        <section>
          <h3>Une donne</h3>
          <ul>
            <li>Les deux joueurs à gauche du donneur (jeton <kbd>D</kbd>) posent les <strong>blindes</strong>, des mises obligatoires.</li>
            <li>Chacun reçoit <strong>deux cartes</strong> que lui seul voit.</li>
            <li>Cinq cartes communes sortent ensuite au milieu : trois d’un coup (le flop), puis une (le tournant), puis une dernière (la rivière).</li>
            <li>On mise avant le flop, puis après chaque sortie de cartes : quatre tours d’enchères en tout.</li>
            <li>À la fin, la meilleure main de <strong>cinq cartes</strong> parmi vos deux cartes et les cinq communes remporte le pot.</li>
          </ul>
        </section>
        <section>
          <h3>À votre tour</h3>
          <ul>
            <li><strong>Parole</strong> : passer sans miser, tant que personne n’a misé.</li>
            <li><strong>Suivre</strong> : payer la mise en cours pour rester dans le coup.</li>
            <li><strong>Miser ou relancer</strong> : faire monter la mise. Une relance vaut au moins la précédente.</li>
            <li><strong>Tapis</strong> : mettre tous ses jetons. Si vous ne pouvez pas tout payer, vous jouez pour la part du pot que vous avez couverte.</li>
            <li><strong>Se coucher</strong> : abandonner la donne et ce que vous y avez mis.</li>
            <li>Temps écoulé ou joueur absent : parole si c’est gratuit, sinon la main est couchée.</li>
          </ul>
        </section>
        <section>
          <h3>Les mains, de la plus forte à la plus faible</h3>
          <ul>
            <li><strong>Quinte flush</strong> : cinq cartes qui se suivent, de la même couleur.</li>
            <li><strong>Carré</strong> : quatre cartes de même valeur.</li>
            <li><strong>Full</strong> : un brelan et une paire.</li>
            <li><strong>Couleur</strong> : cinq cartes de la même couleur.</li>
            <li><strong>Quinte</strong> : cinq cartes qui se suivent. L’as compte aussi pour 1.</li>
            <li><strong>Brelan</strong> : trois cartes de même valeur.</li>
            <li><strong>Double paire</strong>, puis <strong>paire</strong>, puis <strong>carte haute</strong>.</li>
          </ul>
          <p>À main égale, les cartes restantes départagent ; sinon le pot est partagé.</p>
        </section>
        <section>
          <h3>La partie</h3>
          <ul>
            <li>Avec les blindes croissantes, elles doublent toutes les {RISE_EVERY} donnes.</li>
            <li>La partie s’arrête quand un joueur a tous les jetons, ou quand il ne reste que des robots.</li>
          </ul>
        </section>
      </div>
    </Sheet>
  );
}
