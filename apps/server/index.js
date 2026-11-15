// BoardGamesIO server: one process hosting every game.
import { createPlatformServer } from '@bgio/core-server';
import { scrabble } from '@bgio/scrabble/server';
import { tarot } from '@bgio/tarot/server';
import { naval } from '@bgio/naval/server';
import { p4 } from '@bgio/p4/server';
import { poker } from '@bgio/poker/server';

const server = createPlatformServer({ games: [scrabble, tarot, naval, p4, poker] });
server.preload();
const port = await server.listen(process.env.PORT || 3001);
console.log(`BoardGamesIO server listening on port ${port}`);
