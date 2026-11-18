import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useApp } from '@bgio/ui/lib/store.js';
import { call } from '@bgio/ui/lib/socket.js';
import { errorMessage, formatTurnSeconds } from '@bgio/ui/lib/i18n.js';
import { haptic, sound } from '@bgio/ui/lib/feedback.js';
import { Avatar, Button, IconButton, Segmented, Switch } from '@bgio/ui/components/ui.jsx';
import Icon from '@bgio/ui/components/Icon.jsx';
import Tile from '@bgio/ui/components/Tile.jsx';
import { toast } from '@bgio/ui/components/Toaster.jsx';
import NicknameSheet from '@bgio/ui/components/NicknameSheet.jsx';

/**
 * Game-agnostic lobby: invite code, seats (humans and bots), settings.
 * The game contributes its own settings through `client.LobbySettings`.
 */
export default function Lobby({ room, client }) {
  const navigate = useNavigate();
  const me = useApp((s) => s.session?.playerId);
  const [editingName, setEditingName] = useState(false);
  const [starting, setStarting] = useState(false);
  const [rules, setRules] = useState(false);
  const isHost = room.hostId === me;
  const { min, max } = client.players;
  const slots = Array.from({ length: room.settings.maxPlayers }, (_, i) => room.players[i] ?? null);
  const enough = room.players.length >= min;
  const missing = min - room.players.length;
  const link = `${location.origin}${location.pathname}#/room/${room.id}`;
  const RulesSheet = client.RulesSheet;

  // Chime when someone joins.
  const count = useRef(room.players.length);
  useEffect(() => {
    if (room.players.length > count.current) { sound('join'); haptic('light'); }
    count.current = room.players.length;
  }, [room.players.length]);

  const run = async (event, payload = {}) => {
    try {
      return await call(event, { roomId: room.id, ...payload });
    } catch (e) {
      toast({ title: errorMessage(e.code, e.details), tone: 'error' });
      return null;
    }
  };
  const update = (settings) => run('room:updateSettings', { settings });

  const start = async () => {
    setStarting(true);
    if (!(await run('room:start'))) setStarting(false);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      haptic('light');
      toast({ title: 'Lien d’invitation copié', tone: 'success' });
    } catch {
      toast({ title: `Code : ${room.id}` });
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title: client.name, text: `Rejoins ma partie de ${client.name} ! Code : ${room.id}`, url: link });
    } catch { /* dismissed */ }
  };

  const playerCountOptions = [];
  for (let n = Math.max(min, 2); n <= max; n++) playerCountOptions.push({ value: n, label: String(n) });

  return (
    <div className="lobby">
      <header className="room-header">
        <IconButton icon="back" label="Quitter le salon" onClick={() => navigate('/')} />
        <h1 className="room-header__title">{client.name}</h1>
        {RulesSheet ? <IconButton icon="book" label="Règles du jeu" onClick={() => setRules(true)} /> : <span className="room-header__spacer" />}
      </header>

      <div className="lobby__body">
        <section className="invite card">
          <span className="eyebrow">Code du salon</span>
          <div className="invite__code" aria-label={`Code ${room.id.split('').join(' ')}`}>
            {room.id.split('').map((ch, i) => (
              <motion.div
                key={ch + i}
                className="invite__tile"
                initial={{ opacity: 0, y: -16, rotate: -8 }}
                animate={{ opacity: 1, y: 0, rotate: 0 }}
                transition={{ type: 'spring', bounce: 0.35, duration: 0.6, delay: 0.05 * i }}
              >
                <Tile letter={ch} />
              </motion.div>
            ))}
          </div>
          <div className="invite__actions">
            <Button icon="copy" onClick={copy}>Copier le lien</Button>
            {typeof navigator.share === 'function' && <Button icon="share" onClick={share}>Partager</Button>}
          </div>
        </section>

        <section className="players-section">
          <div className="section-title">
            <h2>Joueurs</h2>
            <span className="tabular">{room.players.length}/{room.settings.maxPlayers}</span>
          </div>
          <ul className={`slots ${slots.length > 4 ? 'slots--many' : ''}`}>
            <AnimatePresence initial={false}>
              {slots.map((p, i) => (
                <motion.li
                  key={p ? p.id : `empty-${i}`}
                  layout
                  className={`slot ${p ? 'is-filled' : ''} ${p?.id === me ? 'is-me' : ''} ${p?.isBot ? 'is-bot' : ''}`}
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.94 }}
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.45 }}
                >
                  {p ? (
                    <div className="slot__wrap">
                      <button
                        type="button"
                        className="slot__inner"
                        onClick={() => p.id === me && setEditingName(true)}
                        disabled={p.id !== me}
                        aria-label={p.id === me ? `${p.nickname} (vous) — modifier le pseudo` : p.nickname}
                      >
                        {p.isBot
                          ? <span className="bot-avatar" aria-hidden><Icon name="bot" size={26} /></span>
                          : <Avatar name={p.nickname} index={i} size={48} online={p.connected} />}
                        <span className="slot__name">{p.nickname}</span>
                        <span className="slot__meta">
                          {p.isHost && <span className="chip chip--accent"><Icon name="crown" size={12} /> Hôte</span>}
                          {p.id === me && <span className="chip">Vous <Icon name="edit" size={11} /></span>}
                          {p.isBot && <span className="chip">Robot</span>}
                          {!p.connected && <span className="chip">Hors ligne</span>}
                        </span>
                      </button>
                      {isHost && p.id !== me && (
                        <IconButton
                          icon="close"
                          size={16}
                          className="slot__remove"
                          label={`${p.isBot ? 'Retirer' : 'Expulser'} ${p.nickname}`}
                          onClick={() => (p.isBot ? run('room:removeBot', { botId: p.id }) : run('room:kick', { playerId: p.id }))}
                        />
                      )}
                    </div>
                  ) : (
                    <div className="slot__inner slot__inner--empty">
                      {isHost && client.supportsBots ? (
                        <button type="button" className="add-bot" onClick={() => run('room:addBot')}>
                          <span className="add-bot__icon"><Icon name="plus" size={20} /></span>
                          <span>Ajouter un robot</span>
                        </button>
                      ) : (
                        <>
                          <span className="slot__ghost" aria-hidden />
                          <span className="slot__name">En attente…</span>
                        </>
                      )}
                    </div>
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </section>

        <section className="lobby-settings card">
          <div className="section-title">
            <h2>Réglages</h2>
            {!isHost && <span className="hint">Choisis par l’hôte</span>}
          </div>
          <Switch
            label="Salon public, visible depuis l’accueil"
            checked={room.public !== false}
            disabled={!isHost}
            onChange={(isPublic) => run('room:setVisibility', { public: isPublic })}
          />
          {client.LobbySettings && <client.LobbySettings settings={room.settings} disabled={!isHost} update={update} />}
          <div className="setting">
            <span className="setting__label">{client.turnLabel ?? 'Temps par tour'}</span>
            <Segmented
              label={client.turnLabel ?? 'Temps par tour'}
              value={room.settings.turnSeconds}
              disabled={!isHost}
              onChange={(turnSeconds) => update({ turnSeconds })}
              options={client.turnOptions.map((s) => ({ value: s, label: formatTurnSeconds(s) }))}
            />
          </div>
          {playerCountOptions.length > 1 && (
            <div className="setting">
              <span className="setting__label">Joueurs max.</span>
              <Segmented
                label="Nombre de joueurs maximum"
                value={room.settings.maxPlayers}
                disabled={!isHost}
                onChange={(maxPlayers) => update({ maxPlayers })}
                options={playerCountOptions}
              />
            </div>
          )}
        </section>
      </div>

      <footer className="lobby__cta">
        {isHost ? (
          <Button variant="primary" size="lg" className="btn--block" icon="play" onClick={start} disabled={!enough} loading={starting}>
            {enough ? 'Lancer la partie' : `En attente de ${missing} joueur${missing > 1 ? 's' : ''}…`}
          </Button>
        ) : (
          <div className="waiting-host">
            <span className="dots" aria-hidden><i /><i /><i /></span>
            L’hôte va lancer la partie
          </div>
        )}
      </footer>

      <NicknameSheet open={editingName} onClose={() => setEditingName(false)} />
      {RulesSheet && <RulesSheet open={rules} onClose={() => setRules(false)} />}
    </div>
  );
}
