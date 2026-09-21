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
- After a **user-initiated** `power=0`, when the grill reports `COOL` / `CD` / `OFF`, reset commanded power back to `1` — except after a fail-safe latch or a ≥30s offline gap that reports `OFF`. Those stay at `power=0` until the user explicitly turns power on via UI/API.

## Online heuristic

Grill is online if the last POST was less than 15 seconds ago.

## Safety fail-safes (2026-09-20 Web Ctrl blackout)

Two-stage silence policy, plus an alert-only software flameout watchdog and danger-token holds.
A background watchdog (`setInterval` every 5s) watches `lastSeenEpoch` even when
`handleGrillPost` is not running — silence is invisible if we only look inside
the POST handler.

| Stage | Threshold | Action |
| --- | --- | --- |
| 1. UI offline | 15s (`ONLINE_WINDOW_MS`) | `is_online=false`; log online→offline |
| 2. Silence fail-safe | 30s (`SILENCE_THRESHOLD_MS`) | If last Power was **ON**: urgent ntfy `"MakGrill: grill silent / Web Ctrl lost"` and `command.power = 0` so the **next** successful poll requests cooldown. Skip `COOLDOWN` / `COOL` / `CD` / `OFF`. |

- If commanded power is already `0`, do not re-notify on an interval while still silent. Reset the notify latch when polls resume.
- Software flameout (pit ≥35°F below setpoint for 8 minutes while ON): urgent ntfy **only**. Do **not** auto-command `power=0` — lid-open dips false-trigger this watchdog.
- If `GrillFlags` or `Power` contains danger tokens (case-insensitive): `FIRE`, `FLAMEOUT`, `FLAME OUT`, `TIMEOUT`, `TIME OUT` → `power=0` + urgent ntfy.
- After a gap ≥30s, if the grill reports `OFF`, do **not** answer with `power=1` unless the user explicitly turns power on via UI/API. Default/latched `power=1` must not restart a firmware-shutdown grill.
- Fail-safe `power=0` is latched until that explicit UI/API power-on. The normal COOL/OFF → reset-to-1 path does not undo a latch.
- Reconnect setpoint adoption (below) is unchanged and can run on the same poll as a power hold.

Online→offline and offline→online transitions are logged with timestamps. Unknown POST form keys are logged once.

## Reconnect setpoint adoption

Grill POSTs do not include the local panel setpoint. After the grill has been
offline (last POST outside the 15s window, including the first poll after
bridge boot), the bridge adopts `clampSetpoint(pit Temp)` so a stale web
command buffer cannot overwrite a panel change when Web Ctrl comes back.

Exceptions:
- Active recipe automation keeps driving setpoint
- A UI/API setpoint set since the last poll (pending, never delivered) is honored
- Missing/invalid pit Temp: keep the command buffer

Power command is unchanged on reconnect. Pit wobble while continuously online
does not rewrite setpoint.

## Human control

Desired setpoint/power live in bridge memory (single writer) and take effect on the **next** grill poll.

## Deploy target

Always-on Mac Studio on the home LAN. Local DNS: `makgrillsmobile.com` → Studio LAN IP.
Remote UI access via Tailscale to the Studio. Do **not** point the grill at Vercel.
