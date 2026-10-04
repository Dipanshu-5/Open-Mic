# Deployment and staging guide

## Configure providers

Set `APP_MODE=live` and every required `.env.example` value separately for staging and production. Never copy the local demo password into production.

1. **Supabase Mumbai:** create a Mumbai project. Apply all `supabase/migrations/*.sql` in filename order using the linked Supabase CLI (`supabase db push`) or SQL editor. Do not seed production; create real availability through admin. RLS is enabled everywhere. Anon/authenticated roles have no table/RPC access; trusted Node routes use the service-role key. Create the host Auth user, disable public sign-ups, and set exact comma-separated `ADMIN_EMAILS`. Every protected handler/page repeats `getUser` and the email check; proxy only refreshes cookies.
2. **Razorpay:** start with test keys; public and server key IDs must match. Configure `/api/webhooks/razorpay` for `payment.captured`, `order.paid`, `refund.processed`, using an independent webhook secret. Confirmation requires captured payment, stored order ID, amount and INR currency. Raw webhook HMAC and receipt IDs are checked before persistence. Interrupted processing resumes. Refunds persist a stable `X-Refund-Idempotency` key. [Refund idempotency documentation](https://github.com/razorpay/markdown-docs/blob/master/api/refunds/normal-refunds-idempotent.md).
3. **100ms:** create India-region video and audio templates with exactly `host` and `guest` roles, each `maxPeerCount=1`. Audio permits publishing only `audio`; video permits `audio` and `video`. Disable browser recording, RTMP/HLS, role changes, template recording settings and destinations. Server retrieval validates these permissions before room/token creation and fails closed if unsafe. Room names are deterministic per booking and recording is disabled. JWT expiry cannot exceed the join deadline. The custom call interface uses `hms-video-store`; RoomKit available at implementation did not support React 19. [Template API](https://www.100ms.live/docs/server-side/v2/api-reference/policy/retrieve-a-template).
4. **Resend:** verify sender domain; set API key and `EMAIL_FROM`. Outbox retries reuse the same message/generation idempotency key; intentional admin resend increments generation. Notifications never run synchronously inside booking confirmation.
5. **Turnstile/Upstash:** configure site hostname and Turnstile action `booking` (both verified by server), plus Upstash REST URL/token. Live rate limits use hashed identities and Vercel's forwarded-IP header. Other hosting uses a shared IP bucket unless a trusted proxy integration is added.
6. **Optional WhatsApp:** enable only with configured credentials, current Graph version and approved English templates named `booking_confirmed`, `reminder_24h`, `reminder_1h`, `booking_cancelled_refund`, `slot_lost_refund`. Body variables: guest name, IST time, mode, private link. Sending requires opt-in; email remains required. An interruption after Meta accepts a message can duplicate a WhatsApp notification; Meta does not provide the email provider's idempotency guarantee.

Generate independent strong `CRON_SECRET` and `BOOKING_LINK_ENCRYPTION_KEY` (32 random bytes encoded as 64 hex). Private bearer links use random 256-bit tokens, SHA-256 lookup hashes and AES-256-GCM encrypted outbox material. Back up the encryption key securely; rotation needs migration of existing encrypted tokens. Keep URLs out of logs/analytics. Client data uses safe field allowlists; logs omit contact/token material.

## Vercel and maintenance

Use Node 22, `npm ci`, `npm run build`; `vercel.json` selects Mumbai (`bom1`). Pair with Supabase Mumbai. Configure HTTPS domain, host/support/brand values, test/live webhook URLs and credentials. `GET /api/health` checks the database. Demo mode cannot be deployed on Vercel because its embedded persistence is local only.

Schedule authenticated `POST /api/cron/tick` every minute with `docs/cron-setup.sql`. Add `site_url` and `cron_secret` in Supabase Vault, matching app `CRON_SECRET`. The SQL contains no credentials. Supabase Cron calls through `pg_net`; do not substitute a Vercel plan limited to daily cron. [Supabase pg_net](https://supabase.com/docs/guides/database/extensions/pg_net).

Maintenance expires holds, resumes payment events, handles refunds/messages, reconciles missed captures and submitted refunds, and retires guest contact/link material after ninety days. Work is batched, time-budgeted and leased; interrupted claims resume after expiry. Notification outages cannot roll back confirmation. Monitor cron HTTP responses, unprocessed events, pending refunds and failed notifications. Admin data is currently capped at 1,000 rows; add server search/pagination before that scale.

## Staging acceptance

- Make fifty independent concurrent requests against staging Supabase: one winner, cross-mode and 30/60-minute overlap conflicts, adjacent sessions bookable.
- Complete test UPI checkout and verify duplicate/late/mismatched captured payments, interrupted webhooks and refund timeout/retry. Confirm outages do not block booking; restore providers and check retries.
- Test admin allowlist bypass, anonymous DB/RPC access, invalid/retired private links, cancellation at the 24h boundary, host-missed refund, maintenance authentication and retention.
- Join two real participants in both modes. Deny microphone/camera, check error recovery, audio cannot publish video, recording stays disabled, join boundaries and browser permission headers.
- Verify full 360px flow, keyboard/screen-reader access, real checkout/call CSP domains, production performance and custom-domain SEO. Current CSP permits inline bootstrap/scripts for Next and checkout; tighter nonce enforcement needs integration testing.
- Replace brand/host/support/GST/domain placeholders, review legal copy and confirm tax/price presentation before accepting money.

No live integration or deployment success should be inferred from local demo, lint, SQL tests or production build success.
