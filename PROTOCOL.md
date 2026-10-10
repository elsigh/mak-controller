# MAK Pellet Boss GrillService protocol

Authoritative contract for the always-on grill bridge.
Upstream: https://github.com/bawilson2/mak-controller (Apache-2.0)

## Grill → server (every ~5s)

- Method: `POST`
- URL path: `/GrillService/Service`
- Host the grill resolves: `makgrillsmobile.com` (via **local DNS rewrite** to this machine's LAN IP)
- Scheme: **plain HTTP only, port 80** (no TLS)
- Body: `application/x-www-form-urlencoded` fields:
  - `GrillId`, `Temp`, `Power`, `Probe1`, `Probe2`, `Probe3`, `GrillFlags`
- No auth

## Server → grill response

- Status `200`
- Content-Type: `text/html`
- Body **MUST** be a quoted query string (literal double quotes around the whole string):

```
"setPoint=175&potStatus=&cookMode=1&zoneProbe=1&power=1"
```

- Fields:
  - `setPoint` (°F)
  - `potStatus` (usually empty)
  - `cookMode` (const `1`)
  - `zoneProbe` (const `1`)
  - `power` (`1` = on/allow, `0` = request shutdown/cooldown)
- After a **user-initiated** `power=0`, when the grill reports `COOL` / `CD` / `OFF`, reset commanded power back to `1` (upstream behavior).
- **The bridge never automatically answers `power=0`.** The only source of `power=0` is that explicit user action (UI/API cooldown / power off). Silence, long offline gaps, the first poll after a bridge restart and Pellet Boss danger flags never change commanded power — the grill's own controller decides what to do.

## Online heuristic

Grill is online if the last POST was less than 15 seconds ago.

## Safety alerts (2026-09-20 Web Ctrl blackout; alert-only since 2026-10-10)

Two-stage silence policy and Pellet Boss danger-token alerts. Both are alert-only.
MakGrill does not watch pit temperature against setpoint for a software flameout
(the former 35°F-below-setpoint / 8 minute rule). Lid-open dips false-triggered
that watchdog. Flameout handling is left to the Pellet Boss itself.
A background watchdog (`setInterval` every 5s) watches `lastSeenEpoch` even when
`handleGrillPost` is not running — silence is invisible if we only look inside
the POST handler.

| Stage | Threshold | Action |
| --- | --- | --- |
| 1. UI offline | 15s (`ONLINE_WINDOW_MS`) | `is_online=false`; log online→offline |
| 2. Silence alert | 30s (`SILENCE_THRESHOLD_MS`) | If last Power was **ON**: one urgent ntfy `"MakGrill: grill not reporting"` per silence episode. **Commanded power is never changed for silence** (grill Wi-Fi drops are normal; on 2026-10-10 a routine 31s gap force-zeroed power and put a live cook into COOLDOWN). Skip `COOLDOWN` / `COOL` / `CD` / `OFF`. |

- Only one silence ntfy per episode. When polls resume, a default-priority "grill back online" note is sent and the latch resets. A grill that reconnects reporting `ON` is answered with `power=1` and the current commanded setpoint.
- Every ntfy publish attempt is logged with its HTTP result and retried with backoff (2s, 4s, 8s) on network errors, 429 and 5xx. `/internal/status` exposes `last_alert` (time, title, ok, status, error, attempts) and `ntfy_configured`; the About page shows both. The bridge logs an ERROR at startup when no topic is configured.
- If `GrillFlags` or `Power` contains danger tokens (case-insensitive): `FIRE`, `FLAMEOUT`, `FLAME OUT`, `TIMEOUT`, `TIME OUT` → one urgent ntfy `"MakGrill: danger flag"` per episode (re-arms once the token clears) and a WARN log. **Commanded power is not changed**; the Pellet Boss handles its own faults. A low pit versus setpoint does nothing.
- There is no power fail-safe or long-gap hold (removed 2026-10-10). After any gap — including the first poll after a bridge restart — the grill is answered with the current commanded power, which is `1` unless the user explicitly requested shutdown, and the current commanded setpoint (unchanged by the reconnect).

Online→offline and offline→online transitions are logged with timestamps. Unknown POST form keys are logged once.

## Setpoint ownership

The commanded `setPoint` changes **only** through an explicit UI/API setpoint
or active recipe automation. A reconnect (short gap, long gap, or the first
poll after a bridge restart) never changes it, and it is never derived from
pit `Temp` (the former reconnect pit-temp adoption was removed 2026-10-10).
The commanded setpoint lives in bridge memory and is not persisted, so a
bridge restart resets it to the default (`175°F`) until the user sets one.

## Human control

Desired setpoint/power live in bridge memory (single writer) and take effect on the **next** grill poll.

## Deploy target

Always-on Mac Studio on the home LAN. Local DNS: `makgrillsmobile.com` → Studio LAN IP.
Remote UI access via Tailscale to the Studio. Do **not** point the grill at Vercel.
