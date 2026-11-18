import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { awaiting, botAction, compose, createGame, guess, nextRound, viewFor } from '../engine/index.js';
import { haptic, sound } from '@bgio/ui/lib/feedback.js';
import Board, { pinsDuration } from './Board.jsx';
import Composer from './Composer.jsx';
import Rack from './Rack.jsx';
import Peg, { COLOR_NAMES, KeyPin } from './Peg.jsx';
import { useDraft } from './useDraft.js';
import './mind.css';

const ME = 'A';
const BOT = 'B';
const NAMES = { [ME]: 'Vous', [BOT]: 'Robot Ada' };
const MODES = [['duel', 'Duel'], ['classic', 'Classique'], ['race', 'Course']];
const BOT_THINK_MS = 900;

/** Design review page for MindIO (/#/dev/mind): a whole game against a robot, on one screen. */
export default function Showcase() {
  const [settings, setSettings] = useState({ mode: 'duel', format: 'classic', duplicates: true, target: 2, botLevel: 'normal' });
  const [game, setGame] = useState(() => createGame({ playerIds: [ME, BOT], botIds: [BOT], settings }));
  const [, rerender] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const refresh = () => rerender((x) => x + 1);

  const restart = (patch = {}) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    setGame(createGame({ playerIds: [ME, BOT], botIds: [BOT], settings: next }));
  };

  const v = viewFor(game, ME);
  const step = `${v.roundNumber}-${v.phase}-${v.step}`;
  const d = useDraft(v.pegs, { colors: v.colors, duplicates: v.duplicates, resetKey: step, enabled: v.myTurn });

  // The robot plays like on the server: alone in classic mode, after you in a simultaneous step.
  useEffect(() => {
    const waiting = awaiting(game);
    if (!waiting.includes(BOT)) return undefined;
    if (game.mode !== 'classic' && waiting.includes(ME)) return undefined;
    const t = setTimeout(() => {
      const action = botAction({ ...viewFor(game, BOT), botLevel: settings.botLevel }, BOT, Math.random);
      (action.type === 'compose' ? compose : guess)(game, BOT, action.code);
      refresh();
    }, BOT_THINK_MS);
    return () => clearTimeout(t);
  });

  // Feedback: key pins tick in one by one, then the round ends with the shield lifting.
  const seen = useRef({ step: v.step, round: v.roundNumber, phase: v.phase });
  useEffect(() => {
    const prev = seen.current;
    seen.current = { step: v.step, round: v.roundNumber, phase: v.phase };
    if (v.roundNumber !== prev.round) return;
    if (v.step > prev.step) {
      const mine = v.boards[ME] ?? v.boards[v.decoders[0]];
      const row = mine[mine.length - 1];
      for (let i = 0; i < row.black + row.white; i++) setTimeout(() => sound('pin'), 250 + i * 180);
    }
    if (v.phase === 'guess' && prev.phase === 'compose') { sound('shield'); haptic('medium'); }
    if (v.phase === 'roundOver' && prev.phase !== 'roundOver') {
      const won = v.roundWinnerId === ME || (v.mode === 'classic' && v.cracked.includes(ME));
      setTimeout(() => { sound('shield'); sound(won ? 'success' : 'back'); haptic(won ? 'success' : 'medium'); }, pinsDuration(v.pegs));
    }
  }, [v.step, v.roundNumber, v.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = () => {
    if (!v.myTurn || !d.complete) return;
    (v.phase === 'compose' ? compose : guess)(game, ME, d.draft);
    sound(v.phase === 'compose' ? 'shield' : 'place');
    haptic('medium');
    refresh();
  };
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Enter' && !e.target.closest?.('button')) submit(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const next = () => {
    nextRound(game);
    if (game.status === 'finished') { restart(); return; }
    refresh();
  };

  const opp = v.players.find((p) => p.id === BOT);
  const oppThinking = awaiting(game).includes(BOT) && (game.mode === 'classic' || !awaiting(game).includes(ME));
  const iDecode = v.decoders.includes(ME);
  const freshFrom = ready ? 0 : Infinity;
  const secretStateFor = (decoder) => (v.phase === 'roundOver' ? 'revealed' : v.secrets[decoder] ? 'known' : 'hidden');

  return (
    <div className="mi-table" data-pegs={v.pegs} data-colors={v.colors}>
      <div className="mi-review">
        <h1>MindIO · maquette</h1>
        <p>Le cabinet du décodeur : pions de verre sur bakélite, indices sur plaque de laiton, code secret sous un cache à charnière. Touchez une couleur (ou les touches 1 à {v.colors}), glissez-la dans un trou, touchez un pion pour le retirer, Entrée pour valider.</p>
        <div className="mi-review__tools">
          {MODES.map(([id, label]) => <button key={id} type="button" className={settings.mode === id ? 'is-on' : ''} onClick={() => restart({ mode: id })}>{label}</button>)}
          <span className="mi-review__sep" />
          <button type="button" className={settings.format === 'classic' ? 'is-on' : ''} onClick={() => restart({ format: 'classic' })}>4 pions · 6 couleurs</button>
          <button type="button" className={settings.format === 'expert' ? 'is-on' : ''} onClick={() => restart({ format: 'expert' })}>5 pions · 8 couleurs</button>
          <button type="button" className={settings.duplicates ? 'is-on' : ''} onClick={() => restart({ duplicates: !settings.duplicates })}>Doublons {settings.duplicates ? 'permis' : 'interdits'}</button>
          <span className="mi-review__sep" />
          {['easy', 'normal', 'hard'].map((l) => <button key={l} type="button" className={settings.botLevel === l ? 'is-on' : ''} onClick={() => setSettings((s) => ({ ...s, botLevel: l }))}>{{ easy: 'Facile', normal: 'Normal', hard: 'Difficile' }[l]}</button>)}
          <button type="button" onClick={() => restart()}>Recommencer</button>
        </div>
      </div>

      <header className="mi-hud">
        <div className="mi-score">
          <span className="mi-score__name">{NAMES[ME]}</span>
          <span className="mi-score__num">{v.players[0].score}</span>
          <span className="mi-score__sep">{v.mode === 'classic' ? 'pts' : '–'}</span>
          <span className="mi-score__num">{opp.score}</span>
          <span className="mi-score__name">{NAMES[BOT]}</span>
        </div>
        <div className="mi-hud__round">
          Manche {v.roundNumber}{v.totalRounds ? ` / ${v.totalRounds}` : ` · ${v.target} gagnante${v.target > 1 ? 's' : ''}`}
          {v.phase === 'guess' && <> · essai {Math.min(v.step + 1, v.maxGuesses)} / {v.maxGuesses}</>}
        </div>
        <Status v={v} oppThinking={oppThinking} iDecode={iDecode} />
      </header>

      <main className={`mi-stage ${v.phase === 'compose' ? 'is-compose' : ''}`}>
        {v.phase === 'compose' && v.mode === 'duel' && (
          <Composer
            pegs={v.pegs}
            draft={d.draft}
            cursor={d.cursor}
            locked={v.secrets[BOT]}
            onHoleClick={d.clickHole}
            title="Composez le code secret"
            subtitle={`${NAMES[BOT]} devra le trouver en ${v.maxGuesses} essais au plus.`}
          />
        )}
        {v.phase === 'compose' && v.mode === 'classic' && v.coderId === ME && (
          <Composer pegs={v.pegs} draft={d.draft} cursor={d.cursor} locked={v.secrets[BOT]} onHoleClick={d.clickHole} title="Vous êtes codeur" subtitle="Chaque essai du robot vous rapporte un point." />
        )}

        {(v.phase !== 'compose' || (v.mode === 'classic' && v.coderId !== ME)) && (
          <div className={`mi-boards ${v.decoders.length === 1 ? 'is-single' : ''}`}>
            {v.decoders.map((id) => {
              const mine = id === ME;
              return (
                <div key={id} className={`mi-boards__slot ${mine ? 'is-mine' : 'is-opp'}`}>
                  <h2 className="mi-boards__title">
                    {mine ? 'Vous cherchez' : `${NAMES[id]} cherche`}
                    <span>{v.mode === 'duel' ? (mine ? `le code de ${NAMES[BOT]}` : 'votre code') : v.mode === 'race' ? 'le code du cabinet' : mine ? `le code de ${NAMES[BOT]}` : 'votre code'}</span>
                  </h2>
                  <Board
                    pegs={v.pegs}
                    maxGuesses={v.maxGuesses}
                    rows={v.boards[id]}
                    draft={mine && v.myTurn ? d.draft : mine && v.mySubmission ? v.mySubmission : null}
                    cursor={mine && v.myTurn ? d.cursor : null}
                    waiting={mine && !!v.mySubmission}
                    secret={v.secrets[id]}
                    secretState={secretStateFor(id)}
                    cracked={v.cracked.includes(id)}
                    freshFrom={freshFrom}
                    compact={!mine && v.decoders.length > 1}
                    label={mine ? 'Votre tableau' : `Tableau de ${NAMES[id]}`}
                    onHoleClick={mine && v.myTurn ? d.clickHole : undefined}
                  />
                  {!mine && v.decoders.length > 1 && (
                    <span className={`mi-chip ${opp.submitted ? 'is-done' : oppThinking ? 'is-busy' : ''}`}>
                      {opp.submitted ? 'a joué' : oppThinking ? 'réfléchit…' : v.phase === 'guess' ? 'cherche…' : ''}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

      </main>

      {/* the dock: the bead tray when it is your move, the verdict at the end of a round */}
      <footer className="mi-dock">
        <AnimatePresence>
          {v.phase === 'roundOver' && (
            <motion.div className="mi-verdict" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1, transition: { delay: pinsDuration(v.pegs) / 1000 } }} exit={{ y: 20, opacity: 0 }}>
              <strong>{verdict(v)}</strong>
              <button type="button" className="mi-btn mi-btn--brass" onClick={next}>{game.players.some((p) => game.scores[p.id] >= game.target) && v.mode !== 'classic' ? 'Nouvelle partie' : 'Manche suivante'}</button>
            </motion.div>
          )}
        </AnimatePresence>
        {v.myTurn && (
          <Rack
            colors={v.colors}
            used={d.used}
            duplicates={v.duplicates}
            onPick={d.pick}
            onPlace={d.place}
            onErase={d.erase}
            canErase={d.used.length > 0}
            onSubmit={submit}
            canSubmit={d.complete}
            submitLabel={v.phase === 'compose' ? 'Verrouiller le code' : 'Valider l’essai'}
            hint={d.complete ? 'Prêt : Entrée pour valider.' : !v.duplicates ? 'Doublons interdits : chaque couleur une seule fois.' : null}
          />
        )}
      </footer>

      <section className="mi-review mi-review--legend">
        <div className="mi-legend">
          {COLOR_NAMES.map((name, i) => <figure key={name}><Peg color={i} /><figcaption>{i + 1} · {name}</figcaption></figure>)}
        </div>
        <div className="mi-legend mi-legend--pins">
          <figure><span className="mi-legend__pin"><KeyPin kind="red" /></span><figcaption>Bien placé</figcaption></figure>
          <figure><span className="mi-legend__pin"><KeyPin kind="white" /></span><figcaption>Mal placé</figcaption></figure>
          <figure><Peg color={null} /><figcaption>Couleur cachée (Course)</figcaption></figure>
        </div>
      </section>
    </div>
  );
}

function Status({ v, oppThinking, iDecode }) {
  let text;
  if (v.phase === 'compose') {
    text = v.myTurn ? 'Composez votre code secret' : v.mode === 'classic' && v.coderId !== ME ? 'Le robot compose son code…' : 'Code verrouillé · le robot compose le sien…';
  } else if (v.phase === 'guess') {
    if (v.myTurn) text = v.mode === 'classic' ? 'À vous : proposez un code' : 'À vous : proposez un code (en même temps que le robot)';
    else if (v.mySubmission) text = 'Essai verrouillé · le robot termine le sien…';
    else if (!iDecode) text = oppThinking ? 'Le robot cherche votre code…' : '';
  } else if (v.phase === 'roundOver') text = 'Fin de manche';
  return <p className="mi-status" aria-live="polite">{text}</p>;
}

function verdict(v) {
  if (v.mode === 'classic') {
    const decoder = v.decoders[0];
    const who = decoder === ME ? 'Vous trouvez' : 'Le robot trouve';
    const n = v.boards[decoder].length;
    return v.cracked.length
      ? `${who} en ${n} essai${n > 1 ? 's' : ''} · ${v.roundPoints} point${v.roundPoints > 1 ? 's' : ''} pour le codeur`
      : `Code introuvable · ${v.roundPoints} points pour le codeur`;
  }
  const n = v.boards[v.decoders[0]].length;
  const essais = `${n} essai${n > 1 ? 's' : ''}`;
  if (v.roundWinnerId === ME) return `Code cassé en ${essais} : manche gagnée !`;
  if (v.roundWinnerId) return v.mode === 'race' ? `Le robot a trouvé le code en ${essais}.` : `Le robot a cassé votre code en ${essais}.`;
  return v.cracked.length ? 'Cassés au même essai : manche nulle.' : 'Personne n’a trouvé : manche nulle.';
}
