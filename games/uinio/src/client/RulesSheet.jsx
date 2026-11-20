import { Sheet } from '@bgio/ui/components/ui.jsx';
import '@bgio/ui/components/shared.css';

/** `settings` (optional): the table's options, to tell which variants are on. */
export default function RulesSheet({ open, onClose, settings }) {
  const on = (x) => (settings ? (x ? ' (activé à cette table)' : ' (pas à cette table)') : '');
  return (
    <Sheet open={open} onClose={onClose} title="Les règles de UINIO" size="lg">
      <div className="rules">
        <section>
          <h3>Le but</h3>
          <p>Être le premier à <strong>vider sa main</strong>. Le gagnant de la manche marque les points des cartes restées chez les autres ; le premier à atteindre <strong>l’objectif</strong> (150, 300 ou 500 points) gagne la partie.</p>
        </section>
        <section>
          <h3>Les plaques</h3>
          <ul>
            <li>Quatre émaux : <strong>brique</strong> ◆, <strong>safran</strong> ●, <strong>bouteille</strong> ▲ et <strong>cobalt</strong> ■ (le motif est rappelé dans le coin de chaque plaque).</li>
            <li>Dans chaque couleur : un 0, deux de chaque chiffre de 1 à 9, deux <strong>Passe</strong>, deux <strong>Inversion</strong>, deux <strong>+2</strong>.</li>
            <li>Et quatre <strong>Jokers</strong>, quatre <strong>Jokers +4</strong> : 108 plaques en tout. Chacun en reçoit 7.</li>
          </ul>
        </section>
        <section>
          <h3>À votre tour</h3>
          <ul>
            <li>Posez une plaque de <strong>la même couleur</strong>, du <strong>même chiffre</strong> ou du <strong>même symbole</strong> que celle du dessus, ou un Joker. Les plaques jouables se lèvent dans votre main.</li>
            <li>Ou <strong>piochez</strong> (même si vous pouviez jouer). Si la plaque piochée peut être posée, vous la posez tout de suite ou vous la gardez ; sinon le tour passe.</li>
            <li>Variante <strong>pioche jusqu’à pouvoir jouer</strong>{on(settings?.drawUntil)} : on pioche jusqu’à tomber sur une plaque jouable.</li>
            <li>Variante <strong>doublons</strong>{on(settings?.doubles)} : après avoir posé un chiffre, vous pouvez poser aussi le <strong>même chiffre dans d’autres couleurs</strong>, une carte après l’autre, puis terminer votre tour. La dernière posée donne la couleur.</li>
            <li>Au clavier : <strong>P</strong> piocher, <strong>G</strong> garder ou terminer, <strong>U</strong> annoncer, <strong>C</strong> contrer, <strong>1 à 4</strong> pour la couleur d’un Joker.</li>
          </ul>
        </section>
        <section>
          <h3>Les plaques spéciales</h3>
          <ul>
            <li><strong>Passe</strong> : le joueur suivant passe son tour.</li>
            <li><strong>Inversion</strong> : le sens du jeu change (à deux joueurs, elle agit comme une Passe : on rejoue).</li>
            <li><strong>+2</strong> : le suivant pioche deux plaques et passe son tour.</li>
            <li><strong>Joker</strong> : vous choisissez la couleur demandée.</li>
            <li><strong>Joker +4</strong> : vous choisissez la couleur, le suivant pioche quatre plaques et passe son tour. Il n’est permis que si vous n’avez <strong>aucune plaque de la couleur demandée</strong>.</li>
            <li>Variante <strong>cumul</strong>{on(settings?.stacking)} : on peut répondre à un +2 par un +2, à un +4 par un +4. Le premier qui ne le fait pas pioche le total.</li>
          </ul>
        </section>
        <section>
          <h3>« UINIO ! »</h3>
          <p>En posant votre avant-dernière plaque, <strong>annoncez-le</strong> avec le bouton UINIO ! (ou juste après, tant que personne ne vous a contré). Un joueur resté sur une plaque sans l’annoncer peut être <strong>contré</strong> par n’importe qui jusqu’à ce que le joueur suivant joue : il pioche alors deux plaques.</p>
        </section>
        <section>
          <h3>Les points</h3>
          <ul>
            <li>Chiffres : leur valeur. Passe, Inversion, +2 : 20. Jokers : 50.</li>
            <li>Une manche finie sur un +2 ou un +4 fait encore piocher le suivant : ces plaques comptent.</li>
            <li>Si le temps s’écoule, ou si vous êtes absent, un robot joue votre tour.</li>
          </ul>
        </section>
      </div>
    </Sheet>
  );
}
