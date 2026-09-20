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
- After the grill reports `COOL` / `CD` / `OFF` following `power=0`, reset commanded power back to `1`

## Online heuristic

Grill is online if the last POST was less than 15 seconds ago.

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
