# MakGrill

Local, always-on controller for MAK grills with a Wi-Fi Pellet Boss. A dedicated Node bridge speaks the original `GrillService` protocol on port 80. A Next.js App Router UI provides a dark telemetry dashboard, recipes, cook history, and optional ntfy alerts.

This repository is a fork of [bawilson2/mak-controller](https://github.com/bawilson2/mak-controller) (Apache-2.0). See `NOTICE` and `LICENSE`. **Not affiliated with MAK Grills.**

```
[ Pellet Boss ]
      |  POST /GrillService/Service every ~5s, plain HTTP :80
      v
[ Local DNS ]  makgrillsmobile.com → Mac Studio LAN IP
      v
[ MakGrill bridge ]  single-writer setpoint/power + SQLite
      |
      +--> [ Next.js UI ]  dashboard on :3000, also proxied on :80
```

Do **not** point the grill at Vercel or any serverless endpoint. The grill needs an always-on LAN listener on port 80.

## Features

- Live pit / probes / online / cooldown, with a flameout watchdog (pit >35°F below setpoint for 8 minutes while ON)
- Setpoint control 150–500°F in 5° steps; shutdown that respects Pellet Boss cooldown
- Multi-stage recipes (time, probe ≥/≤, hold)
- Cook sessions with CSV export
- Optional [ntfy](https://ntfy.sh/) push (probe done, ATSET, stage advance, flameout)
- Shared-secret dashboard auth (the grill path stays unauthenticated, as upstream)

## Packages

| Package | Role |
| --- | --- |
| `packages/bridge` | Always-on Node service: `POST /GrillService/Service` + `/internal/*` API |
| `packages/web` | Next.js App Router UI |
| `packages/shared` | Protocol helpers and TypeScript types |

## Local development

Requires Node 22+.

```bash
cp .env.example .env
# BRIDGE_PORT=8080 and BRIDGE_URL=http://127.0.0.1:8080 for laptop use
npm install
npm run dev
```

- UI: http://127.0.0.1:3000
- Bridge: http://127.0.0.1:8080
- Grill simulator / health: `POST /GrillService/Service`, `GET /health`

```bash
npm test
npm run smoke
```

The smoke test starts a temporary bridge, POSTs as a grill, changes the setpoint through the internal API, and asserts the **next** GrillService body is:

```
"setPoint=225&potStatus=&cookMode=1&zoneProbe=1&power=1"
```

## Docker on a Mac Studio

1. Copy `.env.example` to `.env` and set `MAKGRILL_SECRET`.
2. `docker compose up -d --build`
3. Point **local DNS** (AdGuard / Pi-hole / router) so `makgrillsmobile.com` resolves to the Studio LAN IP.
4. The grill must hit **port 80**. The UI is at `http://<lan-ip>/` (bridge proxies to Next.js) or `http://<lan-ip>:3000`.

If the host already owns port 80, use `docker-compose.macvlan.yml` and give the stack its own LAN IP (`CONTAINER_IP`, `PARENT_INTERFACE`, `SUBNET`, `GATEWAY`).

### Remote UI via Tailscale

Leave the grill on the LAN DNS path. For phones / laptops away from home, join the Studio via Tailscale and open `http://<tailscale-ip>/` (or `:3000`). Do not expose port 80 to the public internet.

## Protocol

See [`PROTOCOL.md`](./PROTOCOL.md). Summary:

- Grill POST fields: `GrillId`, `Temp`, `Power`, `Probe1`, `Probe2`, `Probe3`, `GrillFlags`
- Response is `text/html` and **must** be a quoted query string
- Online if last POST &lt; 15s; after `power=0` the grill reports `COOL`/`CD`/`OFF` and commanded power resets to `1`

## Safety

This is unofficial software for a live-fire appliance. Never leave a running grill unattended. The authors are not liable for ruined food, property damage, or injury.

## Attribution

Copyright of the original mak-controller belongs to its authors. MakGrill keeps the Apache-2.0 license and credits that work in `NOTICE`.
