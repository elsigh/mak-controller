# @makgrill/web

Next.js App Router dashboard for MakGrill. See the repository root README for local DNS, Docker, and Tailscale setup.

```bash
# from repo root
npm run dev
```

The UI talks to the grill bridge at `BRIDGE_URL` (default `http://127.0.0.1:8080`) through `/api/*` route handlers.
