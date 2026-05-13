# Docker Test Runbook

## Scope

This runbook covers local container validation for the Node WebSocket server and
automated test gates. It is useful before a PR and before real-device LAN
testing, but it does not replace Cocos Creator export, WeChat DevTools import,
or physical-phone testing.

Docker checks are allowed to prove:

- workspace install and scripts work in a clean Linux Node environment;
- server can bind to `0.0.0.0:8787`;
- local WebSocket smoke can create, join, ready, start, and reach Preview;
- automated tests and typechecks pass outside the developer machine's Node
  install.

Docker checks cannot prove:

- WeChat share-card behavior;
- touch controls, safe areas, FPS, memory, or first package size;
- cross-network `wss` reachability;
- Cocos Creator GUI export correctness.

## Prerequisites

From the repository root:

```powershell
docker --version
docker compose version
docker info
```

Expected: Docker, Docker Compose, and Docker daemon info all return
successfully. If `docker info` hangs or reports a missing
`dockerDesktopLinuxEngine` pipe on Windows, start Docker Desktop and wait until
the engine is running. Starting `com.docker.service` may require administrator
rights on some machines.

## Build Image

```powershell
npm.cmd run docker:build
```

This builds `prop-hide-seek-node:dev` from the root `Dockerfile` and installs
workspace dependencies with `npm ci`.

## Run Containerized Verification

```powershell
npm.cmd run docker:test
npm.cmd run docker:typecheck
npm.cmd run docker:smoke
```

Expected results:

- tests pass for client and server workspaces;
- TypeScript typecheck passes for client, server, and shared workspaces;
- smoke prints JSON with `"ok": true` and `"phase": "preview"`.

## Run LAN Server For Phone Testing

Start the server container:

```powershell
npm.cmd run docker:server
```

The container runs the room server with:

```text
HOST=0.0.0.0
PORT=8787
published port: 8787:8787
```

Find the laptop LAN IP from PowerShell:

```powershell
ipconfig
```

Use the active Wi-Fi or Ethernet IPv4 address, then set the client runtime
endpoint:

```js
globalThis.__PROP_HIDE_SEEK_ROOM_SERVER_URL__ = 'ws://<laptop-lan-ip>:8787';
```

For a persistent WeChat test override, use:

```text
storage key: prop_hide_seek_room_server_url
value: ws://<laptop-lan-ip>:8787
```

Both phone and laptop must be on the same network for this `ws` LAN path. For
different networks or hosted WeChat testing, use a reachable `wss` endpoint
instead of the Docker LAN URL.

## Record In Playtest Notes

Record:

```text
Docker version:
Docker Compose version:
Image tag:
Server command:
Container endpoint:
Laptop LAN IP:
Client runtime override:
docker:test result:
docker:typecheck result:
docker:smoke result:
Known firewall or router issues:
```

Stop the container with `Ctrl+C` in the terminal running `docker:server`.
