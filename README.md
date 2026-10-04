# Conversation booking platform

JavaScript/JSX Next.js App Router application for one host offering paid video and browser audio sessions. Guests book without accounts. The complete local demo works; production adapters and deployment configuration are implemented. Real provider staging verification is still required.

## Run locally

Requires Node 22.13+ within the Node 22 release line. Dependencies are exactly pinned; use the committed lockfile with `npm ci`.

```powershell
npm.cmd ci
npm.cmd run setup:demo
npm.cmd run dev
```

Open [localhost:3000](http://localhost:3000). `setup:demo` creates an ignored `.env.local` with random demo admin and maintenance credentials, preserving an existing file. Find the local host password in its `DEMO_ADMIN_SECRET` entry; sign in at `/admin/login`. Use sample guest details. Demo payments charge nothing, calls do not request devices, and messages are simulated.

Demo bookings persist in ignored `.demo/postgres` using PGlite, an embedded PostgreSQL connection running the real migrations and exclusion constraints. It seeds fourteen days of 10am–6pm IST availability. Stop the server before removing `.demo` to reset it. Provider simulation memory is disposable. Demo mode is local only and is rejected on Vercel.

## Delivered flows

| Plan ID    | Mode          | Duration   | Price              |
| ---------- | ------------- | ---------- | ------------------ |
| `video_30` | Video         | 30 minutes | ₹299 / 29900 paise |
| `video_60` | Video         | 60 minutes | ₹500 / 50000 paise |
| `audio_30` | Browser audio | 30 minutes | ₹299 / 29900 paise |
| `audio_60` | Browser audio | 60 minutes | ₹500 / 50000 paise |

- Mode → duration → IST availability → guest details/consent → ten-minute hold → UPI-first checkout → private booking page.
- Calendar download, guest cancellation, refunds, protected host access, separate audio/video call templates and no recording.
- Admin availability batch preview/create, search, host joining/cancellation, outcomes, refund status and confirmation resends.
- Durable payment receipt/processing state, late-payment reconciliation, idempotent refund operations, leased notification outbox and maintenance.
- Responsive landing, legal drafts, SEO, security headers, rate limiting, bot protection, environment validation and client-secret scan.

Phone calls are excluded; the optional number is used only for opted-in WhatsApp communication. Email is always queued. Both modes share one host calendar. The server snapshots plan mode, duration, amount and session times; client price manipulation is rejected.

Defaults: two-hour notice, thirty-day horizon, thirty-minute start grid, zero buffer, ten-minute hold and Checkout capped at 540 seconds. The whole session must fit an availability window. Guest cancellation at least twenty-four hours before start receives a full refund; later requests contact the host. Host cancellation or host-missed outcome always queues a full refund. Rebooking replaces rescheduling. Joining opens ten minutes before start and closes fifteen minutes after end. Store UTC, display IST (`Asia/Kolkata`).

## Verification

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run check:secrets
```

`npm.cmd run check` runs these sequentially. Strict `checkJs` and JSDoc check JavaScript; type packages and Prettier are development tools. Tests run all migrations in PostgreSQL/PGlite: fifty concurrently submitted reservations, overlap/adjacency, expired holds, payment mismatches/replays/interrupted events, cancellation/refund intents, database privileges, tokens, join windows and call-template privacy. This is not a multi-connection load test against hosted Supabase.

The client scanner examines `.next/static` for server-only names and configured secret values without printing secrets. It supplements server-only boundaries and review; it cannot prove absence of every possible secret.

Production-only npm audit is clean at implementation time. Five high-severity development dependency entries originate in the Next ESLint plugin's transitive `braces`; no patched release was available. ESLint 9 and TypeScript 6 satisfy plugin peer ranges. Track upstream fixes; do not use the incompatible downgrade proposed by `npm audit fix --force`.

## Live setup and launch inputs

See [deployment and staging guide](docs/deployment.md). `.env.example` lists all settings. Live validation fails closed for missing credentials, invalid admin emails, an HTTP site URL, mismatched Razorpay IDs, short maintenance secret or malformed encryption key. Secret-bearing modules use `server-only`; no server secrets belong in `NEXT_PUBLIC_*`.

Provide final brand, host bio/photo, support/grievance contact, domain, GST status/GSTIN as applicable, service accounts and approved legal copy. Current identity and legal text are labelled development placeholders. No production deployment or real paid session has been performed.

Live payments/refunds, two-participant calls and denied device permissions, email/WhatsApp delivery, hosted Supabase concurrency, production CSP/performance and custom-domain SEO remain staging acceptance items. Automated checks and local simulated browser verification are reported separately.
