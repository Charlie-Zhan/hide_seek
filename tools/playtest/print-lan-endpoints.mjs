import { printLanWebSocketEndpoints } from './lan-network-info.mjs';

const port = Number.parseInt(process.env.PORT ?? '8787', 10);

printLanWebSocketEndpoints({ port });
