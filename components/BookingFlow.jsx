'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Script from 'next/script';
import Link from 'next/link';
import { z } from 'zod';
import {
  AudioLines,
  Video,
  ArrowRight,
  LockKeyhole,
  RefreshCw,
} from 'lucide-react';
import { PLANS, getPlan } from '../lib/config.js';
import { formatMoney } from '../lib/money.js';
import { jsonRequest, friendlyError } from '../lib/client-api.js';

const slotsSchema = z.object({
  slots: z.array(z.object({ start_time: z.string(), end_time: z.string() })),
});
const holdSchema = z.object({
  bookingId: z.string(),
  orderId: z.string(),
  amount: z.number(),
  keyId: z.string(),
  holdExpiresAt: z.string(),
  token: z.string(),
  simulated: z.boolean(),
});
/** @param {number} offset */
function dateKey(offset) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = (/** @type {string} */ type) =>
    parts.find((part) => part.type === type)?.value;
  const base = new Date(
    `${value('year')}-${value('month')}-${value('day')}T00:00:00Z`,
  );
  base.setUTCDate(base.getUTCDate() + offset);
  return base.toISOString().slice(0, 10);
}
/** @param {{ initialPlanId: import('../lib/config.js').PlanId,mode:'demo'|'live',turnstileSiteKey:string,whatsappEnabled:boolean }} props */
export function BookingFlow({
  initialPlanId,
  mode,
  turnstileSiteKey,
  whatsappEnabled,
}) {
  const router = useRouter();
  const [planId, setPlanId] = useState(initialPlanId);
  const plan = getPlan(planId) || PLANS[0];
  const [date, setDate] = useState(() => dateKey(1));
  const [slots, setSlots] = useState(
    /** @type {{start_time:string,end_time:string}[]} */ ([]),
  );
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [hold, setHold] = useState(
    /** @type {z.infer<typeof holdSchema>|null} */ (null),
  );
  const [seconds, setSeconds] = useState(0);
  const [demoCheckout, setDemoCheckout] = useState(false);
  const [checkoutReady, setCheckoutReady] = useState(false);
  const [challenge, setChallenge] = useState('');
  const formRef = useRef(/** @type {HTMLFormElement|null} */ (null));
  const keyRef = useRef('');
  useEffect(() => {
    keyRef.current = crypto.randomUUID();
  }, []);
  useEffect(() => {
    Reflect.set(
      window,
      'conversationChallenge',
      (/** @type {string} */ token) => setChallenge(token),
    );
    Reflect.set(window, 'conversationChallengeExpired', () => setChallenge(''));
    return () => {
      Reflect.deleteProperty(window, 'conversationChallenge');
      Reflect.deleteProperty(window, 'conversationChallengeExpired');
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/slots?planId=${planId}&date=${date}`,
          { signal: controller.signal, cache: 'no-store' },
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (active) {
          setSlots(slotsSchema.parse(result).slots);
          setError('');
        }
      } catch (reason) {
        if (active) setError(friendlyError(reason));
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [planId, date, reload]);
  useEffect(() => {
    const refresh = () => setReload((value) => value + 1);
    window.addEventListener('focus', refresh);
    const timer = setInterval(refresh, 30000);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  useEffect(() => {
    if (!hold) return;
    const tick = () =>
      setSeconds(
        Math.max(
          0,
          Math.ceil(
            (new Date(hold.holdExpiresAt).getTime() - Date.now()) / 1000,
          ),
        ),
      );
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [hold]);

  /** @param {z.infer<typeof holdSchema>} checkout @param {Record<string,string>} details */
  function openCheckout(checkout, details) {
    if (mode === 'demo') {
      setDemoCheckout(true);
      return;
    }
    const Razorpay = Reflect.get(window, 'Razorpay');
    if (!Razorpay) {
      setError('Secure checkout is still loading. Please retry shortly.');
      return;
    }
    const widget = new Razorpay({
      key: checkout.keyId,
      order_id: checkout.orderId,
      amount: checkout.amount,
      currency: 'INR',
      name: 'Conversation session',
      timeout: Math.min(
        540,
        Math.max(
          1,
          Math.floor(
            (new Date(checkout.holdExpiresAt).getTime() - Date.now()) / 1000,
          ) - 5,
        ),
      ),
      prefill: { name: details.name, email: details.email },
      config: {
        display: {
          sequence: ['upi', 'card', 'netbanking', 'wallet'],
          preferences: { show_default_blocks: true },
        },
      },
      handler: async (
        /** @type {{razorpay_payment_id:string,razorpay_signature:string}} */ response,
      ) => {
        setBusy(true);
        try {
          await jsonRequest('/api/payments/verify', {
            token: checkout.token,
            orderId: checkout.orderId,
            paymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
          });
          router.push(`/b/${checkout.token}`);
        } catch (reason) {
          setError(friendlyError(reason));
          router.push(`/b/${checkout.token}`);
        } finally {
          setBusy(false);
        }
      },
      modal: {
        ondismiss: () =>
          setError(
            'Payment paused. Retry while your time is held, or release it to choose another session.',
          ),
      },
      theme: { color: '#a54b31' },
    });
    widget.open();
  }
  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  async function submit(event) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const details = {
      name: String(form.get('name') || ''),
      email: String(form.get('email') || ''),
    };
    try {
      let checkout = hold;
      if (!checkout) {
        checkout = holdSchema.parse(
          await jsonRequest('/api/bookings/start', {
            planId,
            startTime: selected,
            ...details,
            phone: String(form.get('phone') || ''),
            whatsappOptIn: form.get('whatsapp') === 'on',
            consent: {
              adult: form.get('adult') === 'on',
              terms: form.get('terms') === 'on',
              privacy: form.get('privacy') === 'on',
            },
            turnstileToken: challenge,
            requestKey: keyRef.current,
          }),
        );
        setHold(checkout);
      }
      openCheckout(checkout, details);
    } catch (reason) {
      setError(friendlyError(reason));
      setReload((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }
  async function confirmDemo() {
    if (!hold) return;
    setBusy(true);
    try {
      await jsonRequest('/api/payments/verify', {
        token: hold.token,
        orderId: hold.orderId,
        paymentId: '',
        signature: '',
      });
      router.push(`/b/${hold.token}`);
    } catch (reason) {
      setError(friendlyError(reason));
    } finally {
      setBusy(false);
    }
  }
  async function release() {
    if (!hold) return;
    setBusy(true);
    try {
      await jsonRequest(`/api/b/${hold.token}/release`, {});
      setHold(null);
      setSelected('');
      setDemoCheckout(false);
      keyRef.current = crypto.randomUUID();
      setReload((value) => value + 1);
      setError('');
    } catch (reason) {
      setError(friendlyError(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="booking-workflow">
      {mode === 'demo' && (
        <p className="info-notice">
          Demo booking: use sample details. Payments and calls are simulated.
        </p>
      )}
      <section className="booking-step">
        <span className="eyebrow">01 · YOUR SESSION</span>
        <h2>Choose how you’d like to talk.</h2>
        <div className="mode-selector" role="group" aria-label="Call mode">
          <button
            disabled={Boolean(hold)}
            type="button"
            aria-pressed={plan.mode === 'video'}
            onClick={() => {
              setPlanId(plan.durationMinutes === 30 ? 'video_30' : 'video_60');
              setSelected('');
            }}
          >
            <Video size={18} aria-hidden="true" />
            Video call
          </button>
          <button
            disabled={Boolean(hold)}
            type="button"
            aria-pressed={plan.mode === 'audio'}
            onClick={() => {
              setPlanId(plan.durationMinutes === 30 ? 'audio_30' : 'audio_60');
              setSelected('');
            }}
          >
            <AudioLines size={18} aria-hidden="true" />
            Browser audio
          </button>
        </div>
        <p className="mode-description">
          {plan.mode === 'audio'
            ? 'A voice conversation in your browser. No camera needed.'
            : 'A face-to-face conversation in your browser.'}
        </p>
        <div
          className="duration-options"
          role="group"
          aria-label="Session duration"
        >
          {PLANS.filter((item) => item.mode === plan.mode).map((item) => (
            <button
              disabled={Boolean(hold)}
              type="button"
              key={item.id}
              aria-pressed={item.id === planId}
              onClick={() => {
                setPlanId(item.id);
                setSelected('');
              }}
            >
              <strong>{item.durationMinutes} minutes</strong>
              <span>{formatMoney(item.amountInPaise)}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="booking-step">
        <span className="eyebrow">02 · YOUR MOMENT</span>
        <h2>Find a time that fits.</h2>
        <p>All dates and times are in IST (India Standard Time).</p>
        <div className="date-strip" role="group" aria-label="Session date">
          {Array.from({ length: 10 }, (_, index) => dateKey(index)).map(
            (day) => (
              <button
                disabled={Boolean(hold)}
                type="button"
                key={day}
                aria-pressed={day === date}
                onClick={() => {
                  setDate(day);
                  setSelected('');
                }}
              >
                {new Intl.DateTimeFormat('en-IN', {
                  timeZone: 'UTC',
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                }).format(new Date(`${day}T00:00:00Z`))}
              </button>
            ),
          )}
        </div>
        <label className="calendar-date-label">
          Or choose a date within the next 30 days
          <input
            type="date"
            value={date}
            min={dateKey(0)}
            max={dateKey(30)}
            disabled={Boolean(hold)}
            onChange={(event) => {
              if (event.target.value) {
                setDate(event.target.value);
                setSelected('');
              }
            }}
          />
        </label>
        <div
          className="time-grid"
          role="group"
          aria-label="Available start times"
          aria-busy={loading}
        >
          {loading ? (
            <p className="loading-state">Finding available times…</p>
          ) : !slots.length ? (
            <p>No sessions are available on this day. Try another date.</p>
          ) : (
            slots.map((slot) => (
              <button
                disabled={Boolean(hold)}
                type="button"
                key={slot.start_time}
                aria-pressed={selected === slot.start_time}
                onClick={() => setSelected(slot.start_time)}
              >
                {new Intl.DateTimeFormat('en-IN', {
                  timeZone: 'Asia/Kolkata',
                  hour: 'numeric',
                  minute: '2-digit',
                }).format(new Date(slot.start_time))}
              </button>
            ))
          )}
        </div>
        <button
          type="button"
          className="text-link"
          onClick={() => setReload((value) => value + 1)}
        >
          <RefreshCw size={15} aria-hidden="true" />
          Refresh times
        </button>
      </section>
      <section className="booking-step">
        <span className="eyebrow">03 · YOUR DETAILS</span>
        <h2>A few details, then you’re set.</h2>
        <form ref={formRef} onSubmit={submit} className="guest-form">
          <fieldset disabled={busy || Boolean(hold)}>
            <label>
              Your name
              <input name="name" autoComplete="name" required maxLength={100} />
            </label>
            <label>
              Email for your booking link
              <input
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                maxLength={254}
              />
            </label>
            {whatsappEnabled && (
              <>
                <label>
                  WhatsApp number{' '}
                  <span className="field-hint">
                    Optional; include country code, e.g. +91
                  </span>
                  <input
                    name="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="+91"
                    pattern="\+[1-9][0-9]{7,14}"
                  />
                </label>
                <label className="checkbox-label">
                  <input type="checkbox" name="whatsapp" />
                  Send booking notifications on WhatsApp. I consent to receiving
                  these messages.
                </label>
              </>
            )}
            <label className="checkbox-label">
              <input type="checkbox" name="adult" required />I am at least 18
              years old.
            </label>
            <label className="checkbox-label">
              <input type="checkbox" name="terms" required />I agree to the{' '}
              <Link href="/terms" target="_blank">
                Terms
              </Link>{' '}
              and{' '}
              <Link href="/refund-policy" target="_blank">
                Refund Policy
              </Link>
              .
            </label>
            <label className="checkbox-label">
              <input type="checkbox" name="privacy" required />I agree to
              processing my booking details as described in the{' '}
              <Link href="/privacy" target="_blank">
                Privacy Policy
              </Link>
              .
            </label>
          </fieldset>
          {mode === 'live' && (
            <>
              <Script
                src="https://challenges.cloudflare.com/turnstile/v0/api.js"
                strategy="afterInteractive"
              />
              <div
                className="cf-turnstile"
                data-sitekey={turnstileSiteKey}
                data-action="booking"
                data-callback="conversationChallenge"
                data-expired-callback="conversationChallengeExpired"
              />
            </>
          )}
          {mode === 'live' && selected && (
            <Script
              src="https://checkout.razorpay.com/v1/checkout.js"
              strategy="afterInteractive"
              onReady={() => setCheckoutReady(true)}
              onError={() =>
                setError(
                  'Secure checkout could not load. Please retry shortly.',
                )
              }
            />
          )}
          {hold && (
            <p className="hold-countdown" role="status">
              {seconds > 0
                ? `Your time is held for ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}.`
                : 'Your time hold has expired. Release it and choose an available time.'}
            </p>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="button"
            type="submit"
            disabled={
              busy ||
              !selected ||
              (Boolean(hold) && seconds === 0) ||
              (mode === 'live' && (!checkoutReady || (!hold && !challenge)))
            }
          >
            {busy
              ? 'Processing…'
              : hold
                ? 'Retry payment'
                : `${mode === 'demo' ? 'Simulate payment' : 'Pay'} ${formatMoney(plan.amountInPaise)}`}
            <ArrowRight size={18} aria-hidden="true" />
          </button>
          {hold && (
            <button
              className="button button-outline"
              type="button"
              disabled={busy}
              onClick={release}
            >
              Release this time
            </button>
          )}
          {!selected && (
            <p className="field-hint">Choose an available time to continue.</p>
          )}
          <p className="payment-note">
            <LockKeyhole size={14} aria-hidden="true" />
            Full refund for guest cancellations at least 24 hours before start.
          </p>
        </form>
      </section>
      {demoCheckout && (
        <div
          className="demo-payment-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="demo-checkout-heading"
        >
          <h2 id="demo-checkout-heading">Simulated checkout</h2>
          <p>No money will be charged. Confirm to test the booking flow.</p>
          <button
            type="button"
            className="button"
            disabled={busy || seconds === 0}
            onClick={confirmDemo}
          >
            Confirm simulated payment
          </button>
          <button
            type="button"
            className="text-link"
            onClick={() => setDemoCheckout(false)}
          >
            Return to booking
          </button>
        </div>
      )}
    </div>
  );
}
