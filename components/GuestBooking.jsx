'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { CalendarDays, Video, AudioLines, CheckCircle2 } from 'lucide-react';
import { jsonRequest, friendlyError } from '../lib/client-api.js';
import { formatMoney } from '../lib/money.js';
import { formatSessionTime } from '../lib/time.js';

/** @param {{token:string,initialBooking:ReturnType<typeof import('../lib/bookings.js').guestView>,supportEmail:string}} props */
export function GuestBooking({ token, initialBooking, supportEmail }) {
  const [booking, setBooking] = useState(initialBooking);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [remaining, setRemaining] = useState('');
  useEffect(() => {
    const tick = () => {
      const minutes = Math.max(
        0,
        Math.ceil((new Date(booking.startTime).getTime() - Date.now()) / 60000),
      );
      setRemaining(
        minutes >= 60
          ? `${Math.floor(minutes / 60)}h ${minutes % 60}m until your session`
          : `${minutes} minutes until your session`,
      );
    };
    const interval = setInterval(tick, 1000);
    tick();
    return () => clearInterval(interval);
  }, [booking.startTime]);
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const result = await jsonRequest(`/api/b/${token}`);
        if (active) setBooking(result);
      } catch {
        if (active)
          setError('We couldn’t refresh the booking. Please retry shortly.');
      }
    };
    const timer = setInterval(poll, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [token]);
  async function cancel() {
    setBusy(true);
    try {
      const result = await jsonRequest(`/api/b/${token}/cancel`, {});
      if (result.status === 'contact_host')
        setError(friendlyError(new Error('contact_host')));
      else setBooking(await jsonRequest(`/api/b/${token}`));
      setConfirmCancel(false);
    } catch (reason) {
      setError(friendlyError(reason));
    } finally {
      setBusy(false);
    }
  }
  const confirmed = booking.status === 'confirmed';
  const labels = /** @type {Record<string,string>} */ ({
    pending: 'Payment processing',
    confirmed: 'Your time is reserved',
    expired: 'This time hold expired',
    cancelled: 'Session cancelled',
    refund_pending: 'Your refund is being processed',
    refunded: 'Your refund is processed',
  });
  return (
    <>
      <p className="eyebrow">YOUR PRIVATE BOOKING</p>
      <h1>{labels[booking.status] || 'Your conversation'}</h1>
      {confirmed && (
        <p className="booking-success">
          <CheckCircle2 aria-hidden="true" size={20} />
          You’re booked, {booking.name}. Keep this private link safe.
        </p>
      )}
      {booking.status === 'pending' && (
        <p className="info-notice">
          We’re checking your payment. Please keep this page open. If you paid,
          confirmation may arrive shortly.
        </p>
      )}
      {booking.status === 'refund_pending' && (
        <p className="info-notice">
          A full refund is queued. Your booking could not be kept or was
          cancelled. The refund will return through your original payment
          method; completion depends on the payment provider.
        </p>
      )}
      <div className="booking-summary">
        <span>
          {booking.mode === 'video' ? (
            <Video aria-hidden="true" />
          ) : (
            <AudioLines aria-hidden="true" />
          )}
          {booking.mode === 'video' ? 'Video call' : 'Browser audio'}
        </span>
        <strong>{formatSessionTime(booking.startTime)}</strong>
        <p>
          {booking.durationMinutes} minutes ·{' '}
          {formatMoney(booking.amountInPaise)}
        </p>
        {confirmed && (
          <p className="countdown" aria-live="off">
            {remaining}
          </p>
        )}
      </div>
      {confirmed && (
        <>
          <Link
            href={`/b/${token}/join`}
            className={`button ${booking.canJoin ? '' : 'button-disabled'}`}
            aria-disabled={!booking.canJoin}
            tabIndex={booking.canJoin ? 0 : -1}
            onClick={(event) => {
              if (!booking.canJoin) event.preventDefault();
            }}
          >
            Join your {booking.mode === 'video' ? 'video' : 'audio'} session
          </Link>
          <p className="field-hint">
            Joining opens 10 minutes before start and closes 15 minutes after
            the session ends.
          </p>
        </>
      )}
      <div className="booking-actions">
        <a href={`/api/b/${token}/calendar`} className="text-link">
          <CalendarDays size={17} aria-hidden="true" />
          Add to calendar
        </a>
        {confirmed && booking.canCancel && (
          <button
            type="button"
            className="text-link"
            onClick={() => setConfirmCancel(true)}
          >
            Cancel with full refund
          </button>
        )}
      </div>
      {confirmed && (
        <p className="payment-note">
          Full guest refunds are available at least 24 hours before start. For
          later requests, contact the host.
        </p>
      )}
      {confirmCancel && (
        <div
          className="info-notice"
          role="group"
          aria-label="Confirm cancellation"
        >
          <p>Cancel this session and request a full refund?</p>
          <button
            className="button"
            type="button"
            disabled={busy}
            onClick={cancel}
          >
            Yes, cancel and refund
          </button>
          <button
            className="text-link"
            type="button"
            onClick={() => setConfirmCancel(false)}
          >
            Keep my session
          </button>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {supportEmail && (
        <a href={`mailto:${supportEmail}`} className="text-link">
          Contact the host
        </a>
      )}
    </>
  );
}
