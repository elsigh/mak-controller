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

- Live pit / probes / online / cooldown, with a flameout watchdog (pit >35°F below setpoint for 8 minutes while ON) that sends urgent ntfy but does **not** command `power=0` (lid-open false positives)
- Silence watchdog: if last Power was ON (or a cook session is active) and no POST for 30s, urgent ntfy and `power=0`; re-notify every 3 minutes until polls resume
- Danger tokens in `GrillFlags`/`Power` (`FIRE`, `FLAMEOUT`, `TIMEOUT`, …) force `power=0` and urgent ntfy
- After a ≥30s gap, an `OFF` report is not answered with `power=1` unless the user turns power on
- Setpoint control 150–500°F in 5° steps; shutdown that respects Pellet Boss cooldown
- Day-grouped cook history (Studio local date, `America/Los_Angeles`) with full-day CSV export
- Optional [ntfy](https://ntfy.sh/) push (probe done, ATSET, stage advance, flameout, silence, danger)
- Shared-secret dashboard auth (the grill path stays unauthenticated, as upstream)
- Installable home-screen app on iPhone (Safari Add to Home Screen)

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

## Install on iPhone

Safari can pin MakGrill to the Home Screen so you do not retype `http://elsigh-studio/` (or your LAN / Tailscale URL).

1. Open the dashboard in **Safari** — Chrome and other browsers will not offer a real home-screen app.
2. Tap **Share** → **Add to Home Screen**.
3. Keep the name **MakGrill** and add it. The icon opens standalone, like an app.

Local HTTP is fine on the home LAN. iOS does not require HTTPS for this. If you do not see Add to Home Screen, you are not in Safari.

### Remote UI via Tailscale

Leave the grill on the LAN DNS path. For phones / laptops away from home, join the Studio via Tailscale and open `http://<tailscale-ip>/` (or `:3000`). Do not expose port 80 to the public internet.

## History

History is grouped by **local calendar day**, not named cook sessions. Telemetry timestamps are written in the box timezone (`TIMEZONE=America/Los_Angeles` in Docker). `GET /internal/days` lists distinct dates with data; `GET /internal/history?day=YYYY-MM-DD` returns that day's pit / setpoint / probe series.

A full day at ~4s polls is ~20k points. Chart responses downsample to **1 point / 20 seconds** (~4.3k points) and always keep the last sample. `GET /internal/history/export?day=YYYY-MM-DD` (and the History **Download CSV** button) export the native-resolution series. Pass `dense=1` on the JSON endpoint for the same full series.

Unnamed telemetry (`session_id` null) is retained for **at least 14 days** so yesterday stays visible. Named-session start/stop still exists on the bridge API but is not the History UI. Recipes remain on `/internal/recipes` but are hidden from the product nav.

## Protocol

See [`PROTOCOL.md`](./PROTOCOL.md). Summary:

- Grill POST fields: `GrillId`, `Temp`, `Power`, `Probe1`, `Probe2`, `Probe3`, `GrillFlags`
- Response is `text/html` and **must** be a quoted query string
- Online if last POST &lt; 15s; after 30s of silence (ON/session) commanded power is force-zeroed
- After user-initiated `power=0` the grill reports `COOL`/`CD`/`OFF` and commanded power resets to `1`, unless a fail-safe latch or long-gap `OFF` is holding heat off

## Safety

This is unofficial software for a live-fire appliance. Never leave a running grill unattended. The authors are not liable for ruined food, property damage, or injury.

## Attribution

Copyright of the original mak-controller belongs to its authors. MakGrill keeps the Apache-2.0 license and credits that work in `NOTICE`.
