// BoardGamesIO server: one process hosting every game.
import { createPlatformServer } from '@bgio/core-server';
import { scrabble } from '@bgio/scrabble/server';

const server = createPlatformServer({ games: [scrabble] });
server.preload();
const port = await server.listen(process.env.PORT || 3001);
console.log(`BoardGamesIO server listening on port ${port}`);
