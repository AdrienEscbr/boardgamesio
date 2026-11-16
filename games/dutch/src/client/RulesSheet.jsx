import { Sheet } from '@bgio/ui/components/ui.jsx';
import '@bgio/ui/components/shared.css';
import { DUTCH_LIMIT, FAILED_DUTCH_PENALTY } from '../engine/index.js';

export default function RulesSheet({ open, onClose }) {
  return (
    <Sheet open={open} onClose={onClose} title="Les règles de DutchIO" size="lg">
      <div className="rules">
        <section>
          <h3>Le but</h3>
          <p>Finir chaque manche avec <strong>le moins de points possible</strong>. Vos cartes sont face cachée : il faut se souvenir de ce qu’on a vu.</p>
        </section>
        <section>
          <h3>Au début d’une manche</h3>
          <p>Chacun reçoit <strong>4 cartes</strong> face cachée et en regarde <strong>deux, au choix</strong>, une seule fois.</p>
        </section>
        <section>
          <h3>À votre tour</h3>
          <ul>
            <li><strong>Piocher</strong> : vous seul voyez la carte. Gardez-la à la place d’une des vôtres (qui part à la défausse), ou défaussez-la.</li>
            <li><strong>Prendre la défausse</strong> : la carte du dessus remplace une des vôtres.</li>
            <li><strong>Annoncer « Dutch »</strong> : chacun rejoue une dernière fois, puis on retourne tout.</li>
          </ul>
        </section>
        <section>
          <h3>Les pouvoirs</h3>
          <p>Une carte piochée et défaussée aussitôt donne son pouvoir :</p>
          <ul>
            <li><strong>7</strong> : regarder une de vos cartes.</li>
            <li><strong>Valet</strong> : regarder une carte adverse.</li>
            <li><strong>Dame</strong> : échanger une de vos cartes avec une carte adverse, sans les voir.</li>
            <li><strong>Roi noir</strong> : regarder une carte adverse, puis l’échanger avec une des vôtres ou non.</li>
          </ul>
        </section>
        <section>
          <h3>Brûler</h3>
          <p>Dès qu’une carte arrive sur la défausse, tout le monde peut y jeter une carte <strong>de même valeur</strong> : une carte de moins ! Attention : une erreur montre la carte à tous et coûte <strong>une carte de pénalité</strong>.</p>
        </section>
        <section>
          <h3>Les points</h3>
          <ul>
            <li>As à 10 : leur valeur. Valet et Dame : 10. Roi noir : 15. <strong>Roi rouge : 0</strong>.</li>
            <li>« Dutch » réussi (<strong>{DUTCH_LIMIT} points ou moins</strong> et le plus petit total) : l’annonceur ne marque rien, les autres marquent leurs cartes.</li>
            <li>« Dutch » raté : l’annonceur marque ses cartes <strong>+ {FAILED_DUTCH_PENALTY}</strong>, et le plus bas des autres ne marque rien. Une égalité fait perdre l’annonceur.</li>
            <li>Après l’annonce, les cartes de l’annonceur sont protégées.</li>
          </ul>
        </section>
      </div>
    </Sheet>
  );
}
