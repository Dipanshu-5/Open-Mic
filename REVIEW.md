# Paid session audit — 12 October 2026

## Verdict

**DO NOT SHIP to live customers yet:** this audit confirmed and fixed **one P0 and two P1 defects**, with reproducing regression tests; no confirmed P0/P1 remains open in the audited paths. Production payment/call delivery, hosted database contention, Firefox, and the explicitly unfinished business/legal inputs still require launch acceptance.

Scope follows the approved product: video and browser audio, 30 minutes / ₹299 and 60 minutes / ₹500, one host, no phone calls. The attachment's 20–45 minute plans, phone line, mood tags, free-text sentence, external calendar sync, and rescheduling are **N/A** because they are absent from the approved design. Guest names were tested with Unicode and HTML instead. Existing user changes in `README.md` were preserved.

## Scorecard

Scores describe the current implementation and evidence, not a production certification.

| Area              | Score / 10 | Evidence / limitation                                                                                                     |
| ----------------- | ---------: | ------------------------------------------------------------------------------------------------------------------------- |
| Booking integrity |          8 | Exclusion constraint, transactional holds; SQL and 50-request HTTP race pass; hosted concurrent transactions unverified   |
| Payments          |          7 | Captured-order/amount/currency checks, replay and refund ordering fixed; live provider flow unverified                    |
| Security          |          8 | Handler authorization, origin checks, signed webhooks, server-only credentials, RLS; live Supabase auth unverified        |
| Privacy           |          8 | Random bearer links, encrypted notification material, safe guest/admin views; real audio permissions unverified           |
| Reliability       |          7 | Durable receipts, leases, bounded retries, checkout recovery; live maintenance/provider outages unverified                |
| Performance       |          8 | Local mobile Lighthouse performance 90–98; actual hosting/network and call SDK performance unverified                     |
| Accessibility     |          7 | Five axe views checked; landing step-number contrast fails; physical assistive technology unverified                      |
| UX craft          |          7 | Eight browser booking/refund journeys, narrow layouts and errors work; small input fonts and calendar cancellation remain |
| Maintainability   |          7 | Pinned dependencies, checkJs, migration upgrade; no CI, 1,000-row admin cap, demo RPC discrepancy                         |
| Test coverage     |          6 | 70 tests; JS line coverage 51.70%, branch coverage 45.69%; SQL and browser coverage measured separately                   |

## Architecture and critical paths

Next.js 16.3.8 App Router, React 19.3, JavaScript/JSX with strict checkJs/JSDoc, Tailwind 4, Zod, npm lockfile, Vitest. Hosting configuration targets Vercel Mumbai; persistent production data/auth uses Supabase Mumbai. Razorpay takes payments, 100ms supplies browser media, Resend sends required email, optional WhatsApp sends opt-in messages, Turnstile validates new attempts, and Upstash limits requests. Calendar integration is an ICS download; no analytics or external calendar synchronization was found.

Guest UI → server-owned plan and IST availability → atomic reservation → provider order → captured-payment verification or signed webhook → SQL confirmation/refund → notification outbox → private page/calendar → authorized join. Guest/host cancellation and host-missed outcomes create durable full-refund operations. Cron expires holds, resumes payment receipts, refunds and notifications, reconciles providers, and retires old contact/link material. Admin authentication is checked in protected pages and every handler; proxy refreshes cookies only. Demo adapters use a separate embedded PostgreSQL/PGlite database and simulated providers.

## Top five fixes, in priority order

1. **R01, M — done:** retain unmatched refund receipts and apply full refunds atomically, including refunds received before capture.
2. **R02, M — done:** retain a private checkout retry capability and original request; recover an existing verified attempt without reusing a single-use challenge.
3. **R03, S — done:** recheck current booking status and join time after room-token creation.
4. **Launch acceptance, L — outstanding:** apply migration 0005, then verify Razorpay test UPI/refunds, two-party 100ms permissions, email delivery, hosted contention, cron, and Firefox; provide final host/support/legal inputs.
5. **R04–R08, M — outstanding:** correct contrast/input fonts, scalar demo RPC decoding, admin pagination, and cancelled calendar output. P2 items were deliberately left unchanged under the requested P0/P1-only source scope.

## Findings

| ID  | Severity | Area            | Title                                                                      | Location                                                               | Status |
| --- | -------- | --------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------ |
| R01 | P0       | Payments        | Early or external full refunds can be lost and refunded payments confirmed | `lib/workers.js:154`; `supabase/migrations/0005_refund_receipts.sql:3` | Fixed  |
| R02 | P1       | Reliability     | Lost checkout responses and order failures prevent recovery                | `components/BookingFlow.jsx:75`; `lib/bookings.js:41`                  | Fixed  |
| R03 | P1       | Security        | Cancellation/expiry during provider work still returns a join credential   | `lib/bookings.js:176`                                                  | Fixed  |
| R04 | P2       | Accessibility   | Landing step numbers fail text contrast                                    | `app/globals.css:473`                                                  | Open   |
| R05 | P2       | Test fidelity   | Demo treats a false order-creation lease as a truthy array                 | `lib/db.js:207`                                                        | Open   |
| R06 | P2       | Admin           | History silently truncates admin search/results after 1,000 rows           | `lib/db.js:159`; `lib/admin.js:6`                                      | Open   |
| R07 | P2       | UX              | Cancelled sessions still download an active calendar event                 | `lib/calendar.js:11`; `components/GuestBooking.jsx:153`                | Open   |
| R08 | P2       | Mobile UX       | Inherited 13px booking input fonts risk iOS focus zoom                     | `app/globals.css:903`                                                  | Open   |
| R09 | P2       | Maintainability | Build-tool advisory and missing CI leave validation manual                 | `package-lock.json`; missing `.github/workflows`                       | Open   |

### R01 — P0 / Payments — fixed

**Where:** Original `lib/workers.js:158–180` searched only `refund_operations`; an empty result still marked the receipt processed. Original `supabase/migrations/0001_init.sql:183` confirmed captures without checking prior refund receipts. Current replacement lives in migration 0005 and `lib/workers.js:154`.

**Problem and impact:** A signed `refund.processed` event arriving before capture association, or a full refund made from the provider dashboard, had no local refund-operation row. The event was acknowledged without changing the booking. A later capture could leave a fully refunded guest with a confirmed session. Separate operation/booking updates also permitted inconsistent state after an interruption.

**Reproduction:** `tests/review/critical.test.js` tests “retains an unmatched refund”, “refund-before-capture”, “provider-dashboard refund”, and “mismatched refund amounts” all failed before the patch. Early-refund replay left status `confirmed`, rather than `refunded`.

**Fix applied:** `apply_processed_refund` associates the payment with its booking, validates the full amount and refund identifier, updates the refund operation and booking in one transaction under the calendar lock, and stops pending confirmation/reminder notifications. Unknown associations and mismatches leave receipts retryable. `confirm_booking` checks durable matching refund receipts before confirmation, so both webhook capture and browser verification are protected. Operation claims cannot submit an already processed refund.

```js
const result = await repo.rpc('apply_processed_refund', {
  p_payment_id: data.paymentId,
  p_refund_id: data.refundId,
  p_amount: data.amount,
});
if (result !== 'refunded') throw new Error('Refund reconciliation required.');
// Mark the receipt processed only after the transactional effect succeeds.
```

Regression coverage includes duplicate events, interruption before receipt acknowledgement, alternate refund identifiers, amount mismatch, and anonymous/authenticated RPC denial. **Deploy migration 0005 before the updated application.** Existing migrations were preserved. Partial dashboard refunds remain unsupported: they stay unprocessed for investigation rather than being mistaken for a full refund.

### R02 — P1 / Reliability — fixed

**Where:** Original `components/BookingFlow.jsx:225–227` sent a request key but no retry token; original `lib/bookings.js:37–38` verified Turnstile and minted a new token on every retry. Current retry capability is at component line 75 and ownership check at server line 41.

**Problem and impact:** If the server reserved time and created an order but its response was lost, submitting again reused the request key with a different access-token hash. The database correctly returned `request_conflict`, but the UI could not recover its own order. Live Turnstile tokens are single-use; even a correctly owned retry consumed the challenge again. Provider failures released the reservation but returned an ambiguous error, so the client kept retrying a terminal attempt. Slot refresh also immediately erased the error message.

**Reproduction:** The local `scripts/review/lost-response.mjs` fetched the first start response on the server side and then aborted delivery to the page. Baseline retry never opened checkout; corrected retry opened the same checkout with one stable token. Regression tests also failed on challenge replay and explicit provider-failure handling before the patch.

**Fix applied:** Generate a cryptographic 256-bit browser retry token before the first attempt, retain the original request in memory, and disable changing that attempt while recovering it. Only an existing request owned by the matching token hash bypasses repeat challenge verification. Known terminal errors reset the request/capability and challenge; ambiguous network failures retain them. Order-provider failure releases the hold and reports `checkout_failed`; background slot success no longer erases checkout errors.

```js
if (!previous || previous.access_token_hash !== hashToken(token))
  await verifyChallenge(input.turnstileToken);
// Client sends the same requestKey and retryToken on an ambiguous retry.
```

Rate limits still apply to retries. Recovery material is intentionally in memory: a full tab reload before receiving a booking link cannot recover an unknown pending attempt and its hold expires normally. Existing signed booking links remain the recovery method once returned.

### R03 — P1 / Security — fixed

**Where:** `lib/bookings.js:176–194`; both host and guest handlers use `joinBooking`.

**Problem and impact:** Authorization was checked against the original booking before asynchronous room/template/token work. A host cancellation or join-window expiry during that work did not prevent the credential from being returned, granting access after authorization had ended.

**Reproduction:** Regression provider mocks cancel the booking during token creation, or advance the clock beyond end + 15 minutes. Both tests originally returned `must-not-be-returned` instead of rejecting with 403.

**Fix applied:** Read the current booking after provider work and enforce confirmed status and the join window again before exposing the credential.

```js
const current = (
  await (await getRepository()).rows('bookings', { id: booking.id })
)[0];
if (!current || !canJoin(current))
  throw new HttpError(403, 'outside_join_window');
return { ...credential /* safe session fields */ };
```

This rejects newly requested credentials after the intervening state change; it does not revoke tokens already issued or terminate an already connected 100ms call. Real provider cancellation/session-lifecycle behavior remains a staging acceptance item.

### R04 — P2 / Accessibility — open

**Where / repro:** Run `node scripts/review/browser.mjs` or Lighthouse on `/`. Axe reports three `.step-number` nodes: foreground `#8a7058`, background `#f0ebe2`, 11px, contrast **3.89:1** versus required 4.5:1.

**Impact:** Low-vision visitors may not read the step numbers. Axe labels the rule “serious”; product severity is P2 because these are supplementary numbers and the adjacent instructions/booking controls remain readable and usable.

**Recommended fix:** Darken `.step-number` text until measured contrast meets 4.5:1, then repeat axe. No style change was made in this P0/P1-only patch.

### R05 — P2 / Test fidelity — open

**Where:** `lib/db.js:207`; `supabase/migrations/0004_order_creation.sql:4` returns a boolean.

**Problem / repro:** `embeddedRepository.rpc` treats every `claim_*` function as a row set. Calling `claim_order_creation` twice yields an array containing `false` on the second call, which passes the server's truthiness test. The real Supabase RPC returns a scalar boolean.

**Impact:** Demo can create duplicate orders when the same attempt is raced; production's boolean lease is unaffected. It weakens confidence in the demo's payment-concurrency fidelity. Existing direct-SQL lease tests do not exercise this decoding boundary.

**Recommended fix:** List `claim_notifications` and `claim_refunds` explicitly as row-set RPCs; decode `claim_order_creation` as a scalar and add an embedded-repository lease test. This confirmed demo-only issue is P2, so source was left unchanged.

### R06 — P2 / Admin — open

**Where:** `lib/db.js:159,217`; `lib/admin.js:6–10`.

**Problem / repro:** Repository reads apply a 1,000-row cap before admin sorting/search. Insert more than 1,000 historical bookings and request admin data; no continuation cursor exists and some bookings cannot appear in search.

**Impact:** At sufficient volume, the host can miss sessions or fail to find a booking for a refund/resend. The deployment guide already documents this limit; current one-host development volume does not establish a P1 outage.

**Recommended fix:** Add bounded, ordered, server-side pagination and search with explicit upcoming-booking queries; show continuation/total status. Avoid merely increasing the cap.

### R07 — P2 / Calendar UX — open

**Where:** `lib/calendar.js:11–35`; `components/GuestBooking.jsx:153`.

**Problem / repro:** Book and cancel a session, then use the still-visible calendar download. The generator receives no status and emits a normal event with DTSTART/DTEND; it has no cancellation marker/update semantics.

**Impact:** A cancelled session can remain in the guest's calendar. It does not recreate a booking or bypass join authorization.

**Recommended fix:** Hide active-event downloads for cancelled/refunded sessions, and define calendar cancellation/update behavior using the same UID. Validate with the calendar clients supported at launch.

### R08 — P2 / Mobile UX — open

**Where:** `.guest-form label` at `app/globals.css:903` supplies 13px text and inputs inherit their font at line 917.

**Problem / impact:** Small form text reduces legibility and risks Safari focus zoom. Lighthouse reports legible-font-size failure on booking/sign-in; the physical iOS focus-zoom effect was **UNVERIFIED**. Simulated 320/375px layouts alone cannot validate that behavior.

**Recommended fix:** Set text-entry input/select font size to at least 16px while retaining smaller explanatory copy; verify focus on an actual iPhone. No source change made.

### R09 — P2 / Maintainability — open

**Where / repro:** `npm audit --json --offline=false` reports five high-severity development entries through Next's ESLint plugin → fast-glob → micromatch → braces (GHSA-vfj7-8cjw-p6xm). `npm audit --omit=dev --json --offline=false` reports zero vulnerabilities. No `.github/workflows` exists.

**Impact:** The advisory concerns build-tool pattern parsing, not a confirmed production request path. Required checks currently depend on manual execution. Audit-only tooling has its own dependency graph and is not added to the application manifest or production lockfile.

**Recommended fix:** Track a compatible upstream fix and add CI for lint, checkJs, tests, build, and secret scanning. Do not apply the audit tool's incompatible Next ESLint downgrade blindly.

## Test report

### Commands and outcomes

Run from the repository root; install review tools with `npm ci --prefix scripts/review --offline=false` and browser engines with `node scripts/review/node_modules/playwright/cli.js install chromium firefox webkit`.

| Command                                                        | Result                                                                                                                                                                    |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci --offline=false`                                       | Installed locked application dependencies; five high dev advisory entries                                                                                                 |
| `npm run check` — baseline                                     | Lint, strict checkJs, **47 tests / 8 files**, production build, client-secret scan passed                                                                                 |
| `npx vitest run tests/review/critical.test.js` — before fixes  | **8 failures**, reproducing R01–R03                                                                                                                                       |
| `npx vitest run tests/review/critical.test.js` — initial fixes | Same eight tests passed                                                                                                                                                   |
| `npm run check` — patched application                          | All checks passed, then **67 tests / 10 files**; later additions increased suite to 70                                                                                    |
| `node scripts/review/baseline-coverage.mjs`                    | Original Git snapshot: 47 tests passed; isolated source copy, no checkout reset                                                                                           |
| `node scripts/review/coverage.mjs` — final                     | **70 tests / 10 files passed**, V8 coverage below                                                                                                                         |
| `npm run lint` and `npm run typecheck` — final tests/tools     | Passed; application build unchanged since successful patched build                                                                                                        |
| `npm audit --omit=dev --offline=false --json`                  | Zero production vulnerabilities                                                                                                                                           |
| `git diff --check`                                             | Passed; existing README modification preserved                                                                                                                            |
| `node scripts/review/server.mjs`                               | Production build on 127.0.0.1:3001, separate fixture database, demo mode/fake local admin and cron secrets                                                                |
| `node scripts/review/browser.mjs`                              | Eight successful journeys: four plans each in Chromium/WebKit; **26** layout checks; six unauthenticated admin API checks; exit 1 solely because Firefox failed to launch |
| `node scripts/review/lost-response.mjs`                        | Baseline failed; patched build passed lost-response recovery                                                                                                              |
| `node scripts/review/resilience.mjs`                           | API 500 preserved input/error, abandon/retry, confirmation reload in New York timezone, offline cancellation error, and real 404 status passed                            |
| `node scripts/review/http-race.mjs`                            | 50 simultaneous HTTP starts: **one reservation / 49 conflicts**, across video_60/audio_30; winning hold released                                                          |
| `node scripts/review/lighthouse.mjs`                           | Local mobile audits completed with Chromium headless shell                                                                                                                |

The original full Chrome launcher failed with `spawn UNKNOWN`; using the supported headless shell completed Lighthouse. An initial custom coverage-module configuration failed dependency lookup; the reproducible coverage helper links only the scratch provider into ignored node_modules and completed normally. Initial browser checks were corrected for hydration/date-response timing and selecting Next's route-announcer instead of the form error; these were test-harness errors, not application findings. WebKit reports a demo cookie's SameSite as `None` through its inspection API, while the actual HTTP header says `HttpOnly; SameSite=strict`; the final check uses the header and verifies HttpOnly separately.

### Coverage

Coverage includes imported JavaScript under `lib/**`; it excludes JSX/UI, SQL functions, and browser-executed code. SQL assertions and browser results supplement it; the percentages do not represent full system coverage.

| Metric                  | Baseline original snapshot |  Final |
| ----------------------- | -------------------------: | -----: |
| Statements              |                     37.70% | 49.41% |
| Branches                |                     34.07% | 45.69% |
| Functions               |                     53.91% | 59.13% |
| Lines                   |                     39.20% | 51.70% |
| `lib/bookings.js` lines |                      4.83% | 55.88% |
| `lib/workers.js` lines  |                      8.65% | 39.39% |

New tests are in `tests/review/critical.test.js` and `tests/review/boundaries.test.js`: refund ordering/dashboard association/mismatches/replay/interruption, private-capability ownership, single-use challenge recovery, provider order failure, cancellation/expiry during join, RPC permissions, matching email/calendar links, email outage, past/zero-length scheduling, supported-plan rejection controls, UTC/IST midnight and 23:30 UTC, foreign DST transitions, Unicode/emoji/RTL/HTML/oversized/empty names, price/duration manipulation, and calendar injection. Existing tests cover overlap/adjacency, expired holds, money mismatch, late paid-but-slot-lost compensation, cancellation boundaries, worker leases and refund idempotency keys.

Mutation thinking: acknowledging empty refund matches, confirming before checking refund receipts, re-verifying a retry challenge, rotating the retry token, returning a token from a stale booking, changing a server plan's price, and removing the database exclusion guard are realistic regressions. The added refund/retry/join tests and existing price/race tests assert their externally visible consequences; eight tests actually failed on the original implementation. No automated mutation-testing score is claimed.

Both SQL and HTTP races use one embedded PGlite instance; they **do not establish multi-connection hosted PostgreSQL correctness under load**. The browser suite blocks external origins and uses sample details. No real card, production provider API, email delivery or deployment was used.

### Browser and accessibility evidence

All four plan amounts, durations and modes matched API confirmation in Chromium and WebKit; Unicode/HTML guest names rendered as text, calendars downloaded, early joining returned 403, and cancellation plus maintenance produced simulated `refunded` state. Confirmation email body/time/mode/private/calendar links and notification outages were verified in the local mocked worker tests, not in an actual inbox.

Each available engine checked landing, booking and sign-in at 320, 375, 768, and 1440 pixels, plus 200% text sizing: no horizontal overflow in those checks. Journeys also used dark-preference/reduced-motion contexts; the approved visual design remains light. A headless text-size change is not full physical-browser zoom or a screen-reader test.

Axe WCAG 2 A/AA and 2.1 AA: landing fails R04; booking, private booking, host sign-in, and admin dashboard have no detected violations. Join/call views and real checkout widgets remain unverified. No browser page errors appeared in successful journey runs. The server logged unauthorized rejections during deliberate protected-route probes/prefetch; no credential or contact material appeared in those errors.

| Local mobile Lighthouse page | Performance | Accessibility | Best practices | SEO |
| ---------------------------- | ----------: | ------------: | -------------: | --: |
| `/`                          |          95 |            95 |            100 |  63 |
| `/book`                      |          90 |           100 |             96 |  63 |
| `/admin/login`               |          98 |           100 |             96 |  63 |

SEO indexing failures are expected in demo/private flows, not a reason to expose them. Reported opportunities include render-blocking resources, about 28–29 KiB unused JS, about 13 KiB legacy JS, and small fonts on booking/sign-in. These are local synthetic results; production traffic/media performance is unverified. Favicon/social-image finishing is a launch polish item, not an audited P0/P1.

Machine-readable evidence and screenshots are in `scripts/review/artifacts/`; V8 summaries are in `scripts/review/coverage/` and `coverage-before/`. These generated directories and fixture databases are ignored; reproducible scratch scripts and their separate lockfile are retained.

### UNVERIFIED launch gates

- Firefox: browser files downloaded, but repeated launch attempts fail with `spawn UNKNOWN` before reaching the app; no Firefox pass claimed.
- Actual iOS Safari, assistive technology and physical 200% zoom; WebKit headless is not a device certification.
- 100ms two-participant calls, audio-only never requesting camera, denied microphone/camera, autoplay, device switching/reconnection, and cancellation of an active call. Template fail-closed tests pass, but simulated rooms intentionally do not request devices; that cannot prove live SDK behavior.
- Razorpay sandbox UPI success/pending/decline/authentication, callback and webhook delivery, provider refund idempotency, and network timeouts. Local/mocked capture/refund tests are not provider acceptance.
- Live Supabase allowlisted authentication, deployed RLS and independent concurrent transactions, Mumbai deployment/CSP/HTTPS, and Vault/pg_net cron execution.
- Resend inbox/calendar delivery and optional WhatsApp template delivery; actual opt-in and provider retention review.
- Long sustained worker backlog/fairness and production reconciliation beyond seven days; partial provider-dashboard refunds need an operational policy.
- Final business/host/support/GST/domain and reviewed legal pages are intentionally missing. The repository labels them TODO; this audit did not invent those inputs.

## Verified strengths

- Prices/durations are server-owned snapshots and strict request schemas reject client monetary fields.
- Reservations, cancellation and capture share transactional calendar exclusion/locking; adjacent intervals remain possible.
- Receipt persistence is separate from processing acknowledgement, enabling interrupted replay.
- Notifications cannot roll back payment confirmation; leases, retry bounds, and stable refund intent keys have tests.
- Guest links use random 256-bit capabilities, hash lookup and encrypted outbox material; authorization is repeated in handlers.

## Pre-launch checklist

- [ ] Apply `supabase/migrations/0005_refund_receipts.sql` before releasing the patched server; verify function permissions and upgrade on staging.
- [ ] Run all provider acceptance gates above with dedicated sandbox accounts and staging credentials.
- [ ] Demonstrate 50 independent hosted concurrent requests, overlap/adjacency, expiration and late-payment refund behavior.
- [ ] Verify Firefox on a working machine and physical mobile/accessibility/media behavior.
- [ ] Replace labelled identity/support/tax/legal/domain placeholders and approve final business policies.
- [ ] Verify every-minute Vault-authenticated cron and monitoring of unprocessed receipts, failed email and refunds.
- [ ] Resolve P2 contrast, small fonts, demo lease decoding and calendar cancellation; add admin pagination before 1,000-row scale.
- [ ] Add CI, track compatible build-tool security updates, confirm backups/key recovery and secret-free client output on staging.

