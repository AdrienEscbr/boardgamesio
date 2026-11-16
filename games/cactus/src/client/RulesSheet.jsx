import { Sheet } from '@bgio/ui/components/ui.jsx';
import '@bgio/ui/components/shared.css';

export default function RulesSheet({ open, onClose }) {
  return (
    <Sheet open={open} onClose={onClose} title="Les règles de CactusIO" size="lg">
      <div className="rules">
        <section>
          <h3>Le but</h3>
          <p>Avoir <strong>le moins de points possible</strong> et rester hors de la <strong>zone rouge</strong> (au-delà de 10 points par joueur). Vos cartes sont face cachée : il faut se souvenir de ce qu’on a vu.</p>
        </section>
        <section>
          <h3>Au début d’une manche</h3>
          <p>Chacun reçoit <strong>4 cartes</strong> face cachée et en regarde <strong>deux, au choix</strong>, une seule fois.</p>
        </section>
        <section>
          <h3>À votre tour</h3>
          <p><strong>Piochez</strong> (vous seul voyez la carte), puis gardez-la à la place d’une de vos cartes, qui part à la défausse, ou défaussez-la directement. La carte défaussée déclenche son pouvoir.</p>
        </section>
        <section>
          <h3>Les pouvoirs (obligatoires)</h3>
          <ul>
            <li><strong>7</strong> : regarder une carte, une des vôtres ou une adverse.</li>
            <li><strong>Valet</strong> : échanger une de vos cartes avec une carte adverse. Vous voyez celle que vous recevez, pas l’adversaire.</li>
            <li><strong>Dame rouge</strong> : un adversaire reçoit une carte de plus, face cachée.</li>
            <li><strong>Dame noire</strong> : vous recevez une carte de plus, face cachée.</li>
          </ul>
          <p>Pendant qu’un pouvoir est utilisé, tout le monde attend.</p>
        </section>
        <section>
          <h3>Jeter ses cartes</h3>
          <p>Tant que la carte du dessus de la défausse n’est pas recouverte, chacun peut y jeter une de ses cartes <strong>du même rang</strong> (un 10 ne va pas sur un valet ; la couleur ne compte pas), même hors de son tour. La carte jetée déclenche aussi son pouvoir. Une erreur montre la carte à tous et coûte <strong>une carte de pénalité</strong>.</p>
        </section>
        <section>
          <h3>Annoncer « Cactus »</h3>
          <p>Pendant votre tour, avant ou après avoir pioché. Les autres jouent encore une fois, puis vous en dernier, et on retourne tout. Vos cartes ne sont pas protégées.</p>
        </section>
        <section>
          <h3>Les points</h3>
          <ul>
            <li>As à 10 : leur valeur. Valet et Dame : 10. <strong>Roi rouge : 0</strong>. Roi noir : 20.</li>
            <li>Chacun marque seulement ce qui <strong>dépasse 5 points</strong> (12 en main : +7).</li>
            <li>« Cactus » réussi, de 1 à 5 points : <strong>−5</strong>. Exactement 0 (ou plus aucune carte) : <strong>Cactus royal, −10</strong>.</li>
            <li>« Cactus » raté : une carte de pénalité s’ajoute à votre main, puis vous marquez ce qui dépasse 5.</li>
            <li>Celui qui a annoncé ouvre la manche suivante.</li>
          </ul>
        </section>
        <section>
          <h3>Fin de la partie</h3>
          <p>Elle s’arrête quand <strong>un seul joueur</strong> (ou aucun) reste hors de la zone rouge. Le plus petit total gagne ; les égalités partagent la victoire.</p>
        </section>
      </div>
    </Sheet>
  );
}
