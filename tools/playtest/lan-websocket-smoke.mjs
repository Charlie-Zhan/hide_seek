process.env.HOST ??= '0.0.0.0';
process.env.PORT ??= '8787';
process.env.WS_SMOKE_HOST ??= '0.0.0.0';
process.env.WS_SMOKE_PORT ??= '8787';
process.env.WS_SMOKE_CONNECT_HOST ??= '127.0.0.1';

await import('./local-websocket-smoke.mjs');
