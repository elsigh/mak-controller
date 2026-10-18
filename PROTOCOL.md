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

- Status `200` (or `503` with no body while the bridge has no setpoint to command; see Setpoint ownership)
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
- There is no power fail-safe or long-gap hold (removed 2026-10-10). After any gap — including the first poll after a bridge restart — the grill is answered with the current commanded power, which is `1` unless the user explicitly requested shutdown, and the current commanded setpoint (unchanged by the reconnect), or no command at all if no setpoint was set in the app this cook.

Online→offline and offline→online transitions are logged with timestamps. Unknown POST form keys are logged once.

## Setpoint ownership

**The grill never reports its own setpoint**, so the bridge cannot know what
was set on the Pellet Boss panel. Any `setPoint=` the bridge sends overwrites
it immediately (2026-10-11: panel 325°F, Web Ctrl turned on, the bridge's
stale in-memory default `setPoint=175` made the grill back off). So:

- The bridge commands a setpoint **only after the user sets one in the
  app/API (or starts a recipe) for the current cook.** Until then
  `command.setPoint` is `null` (UI shows "Set on grill") and the grill keeps
  its panel setpoint.
- Once set, every reply carries it. A reconnect (Wi-Fi drop of seconds to
  minutes, anything under 30 min) never changes it, and it is never derived
  from pit `Temp`.
- **New cook** (`detectNewCook`): the first poll after a bridge start, the
  grill reporting `START` after anything else, the grill running again after
  reporting `OFF` / `COOL*` / `CD`, or a gap of 30 min or more
  (`NEW_COOK_GAP_MS`). A setpoint or recipe set **before** the previous poll
  belongs to the old cook and is dropped back to "not commanding" (never to
  some other temperature, so the grill keeps whatever it was last running).
  One chosen while the grill was away is the user's intent for the new cook and
  is kept. Commanded power is untouched by this.
- Nothing is persisted, so a bridge restart never resurrects an old setpoint.

### Reply while not commanding (`UNCOMMANDED_REPLY`)

| Mode | Reply | Evidence |
| --- | --- | --- |
| `hold` (default) | HTTP `503`, empty body. No command at all. | Indirect: when an exchange fails (routine 30s to 3 min Wi-Fi drops mid-cook, the 2026-09-20 blackout) the grill keeps cooking at its current setpoint, and before Web Ctrl is turned on the panel is in charge. A `503` is an inferred equivalent of a failed exchange, not observed yet. |
| `omit` | HTTP `200`, `"potStatus=&cookMode=1&zoneProbe=1&power=1"` (no `setPoint` key) | **None.** Upstream `bawilson2/mak-controller` always sends all five keys; no capture or doc shows how Pellet Boss firmware parses a missing key (it might keep its value, read `0`, or reject the reply). |
| `legacy` | HTTP `200`, `setPoint=175` placeholder | Known to overwrite the panel setpoint (the bug above). |

An explicit user power-off is always delivered as the full five-key reply
(`setPoint` written as the 175°F placeholder because the grill is shutting
down), whatever the mode.

**Risk of `hold`:** it has not been observed on this grill yet that a `503`
behaves exactly like an unreachable server. If the Wi-Fi module reacted badly
(e.g. stopped posting or reconnect-looped until it got a `200`), telemetry
would gap until a setpoint is set in the app; the alert-only silence watchdog
would report it. It cannot raise or lower the pit. Verify on the next cook:
panel setpoint unchanged, polls continuing every ~4s while the UI shows
"Set on grill".

## Human control

Desired setpoint/power live in bridge memory (single writer) and take effect on the **next** grill poll. Until the user sets a setpoint for the current cook the bridge sends none (see Setpoint ownership).

## Deploy target

Always-on Mac Studio on the home LAN. Local DNS: `makgrillsmobile.com` → Studio LAN IP.
Remote UI access via Tailscale to the Studio. Do **not** point the grill at Vercel.
