// Platform copy (French). Games add their own messages with registerErrors().

const messages = {
  OFFLINE: 'Impossible de joindre le serveur. Vérifiez votre connexion.',
  TIMEOUT: 'Le serveur met trop de temps à répondre.',
  INTERNAL: 'Une erreur inattendue est survenue.',
  UNKNOWN_GAME: 'Ce jeu n’existe pas.',
  ROOM_NOT_FOUND: 'Ce salon n’existe pas ou a expiré.',
  ROOM_FULL: 'Ce salon est complet.',
  ROOM_IN_GAME: 'La partie a déjà commencé dans ce salon.',
  NOT_HOST: 'Seul l’hôte peut faire cela.',
  NOT_IN_ROOM: 'Vous n’êtes pas dans ce salon.',
  NOT_ENOUGH_PLAYERS: (d) => (d?.min ? `Il faut au moins ${d.min} joueurs.` : 'Pas assez de joueurs.'),
  TOO_MANY_PLAYERS: (d) => (d?.max ? `${d.max} joueurs au maximum.` : 'Trop de joueurs.'),
  INVALID_SETTINGS: 'Réglage invalide.',
  INVALID_NICKNAME: 'Pseudo invalide : 1 à 16 lettres, chiffres, espaces, - ou _.',
  INVALID_ACTION: 'Action impossible.',
  BOTS_UNSUPPORTED: 'Ce jeu ne propose pas encore de robots.',
  NOT_A_BOT: 'Ce joueur n’est pas un robot.',
  NO_GAME: 'Aucune partie en cours.',
  GAME_OVER: 'La partie est terminée.',
  NOT_IN_GAME: 'Vous ne participez pas à cette partie.',
  NOT_YOUR_TURN: 'Ce n’est pas votre tour.',
};

/** @param {Record<string, string | ((details: any) => string)>} map */
export function registerErrors(map) {
  Object.assign(messages, map);
}

export function errorMessage(code, details) {
  const m = messages[code] ?? messages.INTERNAL;
  return typeof m === 'function' ? m(details) : m;
}

export function formatTurnSeconds(s) {
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} min ${r}` : `${m} min`;
}
