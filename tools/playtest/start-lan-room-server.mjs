import { printLanWebSocketEndpoints } from './lan-network-info.mjs';

process.env.HOST ??= '0.0.0.0';
process.env.PORT ??= '8787';

const port = Number.parseInt(process.env.PORT, 10);

console.log(`Starting Prop Hide & Seek room server on ${process.env.HOST}:${process.env.PORT}`);
printLanWebSocketEndpoints({
  port,
  heading: 'Use one of these endpoints on same-Wi-Fi phones:'
});
console.log('Stop the server with Ctrl+C.');

await import('../../server/src/index.ts');
