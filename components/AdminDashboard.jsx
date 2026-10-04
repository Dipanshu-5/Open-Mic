'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { jsonRequest, friendlyError } from '../lib/client-api.js';
import { formatSessionTime } from '../lib/time.js';
import { formatMoney } from '../lib/money.js';

/** @param {{initialData:Awaited<ReturnType<typeof import('../lib/admin.js').adminData>>}} props */
export function AdminDashboard({ initialData }) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [batch, setBatch] = useState(
    /** @type {{start_time:string,end_time:string}[]} */ ([]),
  );
  const [preview, setPreview] = useState(
    /** @type {{created:number,skipped:number}|null} */ (null),
  );
  const [cancelId, setCancelId] = useState('');
  const [now, setNow] = useState(initialData.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const upcoming = data.bookings
    .filter(
      (row) =>
        row.status === 'confirmed' &&
        new Date(String(row.end_time)).getTime() >= now,
    )
    .slice(0, 8);
  const filtered = data.bookings.filter((row) =>
    `${row.caller_name} ${row.caller_email} ${row.id}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  async function refresh() {
    setData(await jsonRequest('/api/admin/data'));
  }
  /** @param {string} id @param {string} action */
  async function act(id, action) {
    setBusy(true);
    setError('');
    try {
      const result = await jsonRequest(`/api/admin/bookings/${id}`, { action });
      setMessage(
        `Request recorded: ${String(result.status).replaceAll('_', ' ')}.`,
      );
      setCancelId('');
      await refresh();
    } catch (reason) {
      setError(friendlyError(reason));
    } finally {
      setBusy(false);
    }
  }
  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  async function previewBatch(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setPreview(null);
    const form = new FormData(event.currentTarget);
    try {
      const first = String(form.get('first'));
      const last = String(form.get('last'));
      const from = String(form.get('from'));
      const to = String(form.get('to'));
      const weekdays = form.getAll('weekdays').map(Number);
      if (!first || !last || first > last || !weekdays.length || from >= to)
        throw new Error('invalid_input');
      const windows = [];
      for (
        let day = new Date(`${first}T00:00:00Z`);
        day <= new Date(`${last}T00:00:00Z`);
        day.setUTCDate(day.getUTCDate() + 1)
      ) {
        if (windows.length >= 500) throw new Error('invalid_input');
        if (!weekdays.includes(day.getUTCDay())) continue;
        const date = day.toISOString().slice(0, 10);
        windows.push({
          start_time: new Date(`${date}T${from}:00+05:30`).toISOString(),
          end_time: new Date(`${date}T${to}:00+05:30`).toISOString(),
        });
      }
      if (!windows.length) throw new Error('invalid_input');
      setBatch(windows);
      setPreview(
        await jsonRequest('/api/admin/windows', { windows, preview: true }),
      );
    } catch (reason) {
      setError(friendlyError(reason));
    } finally {
      setBusy(false);
    }
  }
  async function createBatch() {
    setBusy(true);
    try {
      const result = await jsonRequest('/api/admin/windows', {
        windows: batch,
        preview: false,
      });
      setMessage(
        `${result.created} windows created; ${result.skipped} conflicts skipped.`,
      );
      setPreview(null);
      setBatch([]);
      await refresh();
    } catch (reason) {
      setError(friendlyError(reason));
    } finally {
      setBusy(false);
    }
  }
  /** @param {string} id */
  async function removeWindow(id) {
    setBusy(true);
    try {
      const response = await fetch('/api/admin/windows', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setMessage(
        result.deleted
          ? 'Availability removed.'
          : 'This window has a held or booked session and cannot be removed.',
      );
      await refresh();
    } catch (reason) {
      setError(friendlyError(reason));
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    await jsonRequest('/api/admin/logout', {});
    router.push('/admin/login');
    router.refresh();
  }
  return (
    <>
      <div className="admin-heading">
        <div>
          <p className="eyebrow">HOST DASHBOARD · IST</p>
          <h1>Your conversations.</h1>
        </div>
        <button
          type="button"
          className="button button-outline"
          onClick={logout}
        >
          Sign out
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="info-notice" role="status">
          {message}
        </p>
      )}
      <section className="admin-section">
        <h2>Today & upcoming</h2>
        {!upcoming.length ? (
          <p>No upcoming confirmed sessions.</p>
        ) : (
          upcoming.map((row) => (
            <article key={String(row.id)} className="admin-booking">
              <strong>{String(row.caller_name)}</strong>
              <p>
                {formatSessionTime(String(row.start_time))} ·{' '}
                {row.call_mode === 'video' ? 'Video' : 'Audio'}
              </p>
              <Link href={`/admin/join/${row.id}`} className="text-link">
                Join as host
              </Link>
            </article>
          ))
        )}
      </section>
      <section className="admin-section">
        <h2>Availability</h2>
        <p>
          Create daily windows in IST. Guests can choose 30 or 60 minutes within
          a window; existing reservations share the same host calendar.
        </p>
        <form onSubmit={previewBatch} className="batch-form">
          <div className="form-columns">
            <label>
              First date
              <input
                type="date"
                name="first"
                required
                onChange={() => setPreview(null)}
              />
            </label>
            <label>
              Last date
              <input
                type="date"
                name="last"
                required
                onChange={() => setPreview(null)}
              />
            </label>
            <label>
              Daily start (IST)
              <input
                type="time"
                name="from"
                defaultValue="10:00"
                step="1800"
                required
                onChange={() => setPreview(null)}
              />
            </label>
            <label>
              Daily end (IST)
              <input
                type="time"
                name="to"
                defaultValue="18:00"
                step="1800"
                required
                onChange={() => setPreview(null)}
              />
            </label>
          </div>
          <fieldset>
            <legend>Weekdays</legend>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(
              (day, index) => (
                <label key={day}>
                  <input
                    name="weekdays"
                    value={index}
                    type="checkbox"
                    defaultChecked={index > 0 && index < 6}
                    onChange={() => setPreview(null)}
                  />
                  {day}
                </label>
              ),
            )}
          </fieldset>
          <button
            type="submit"
            className="button button-outline"
            disabled={busy}
          >
            Preview availability
          </button>
        </form>
        {preview && (
          <div className="info-notice">
            <p>
              {preview.created} windows available to create; {preview.skipped}{' '}
              overlapping windows will be skipped.
            </p>
            <button
              type="button"
              className="button"
              disabled={busy || preview.created === 0}
              onClick={createBatch}
            >
              Create previewed availability
            </button>
          </div>
        )}
        <details>
          <summary>
            Manage existing availability ({data.windows.length})
          </summary>
          {data.windows.map((row) => (
            <div key={String(row.id)} className="window-row">
              <span>
                {formatSessionTime(String(row.start_time))} →{' '}
                {formatSessionTime(String(row.end_time))}
              </span>
              <button
                type="button"
                className="text-link"
                disabled={busy}
                onClick={() => removeWindow(String(row.id))}
              >
                Remove if unreserved
              </button>
            </div>
          ))}
        </details>
      </section>
      <section className="admin-section">
        <h2>Bookings</h2>
        <label className="search-label">
          Search by guest, email, or booking ID
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        {!filtered.length ? (
          <p>No matching bookings.</p>
        ) : (
          filtered.map((row) => (
            <article className="admin-booking" key={String(row.id)}>
              <div className="admin-booking-heading">
                <strong>{String(row.caller_name)}</strong>
                <span className="status-chip">
                  {String(row.status).replaceAll('_', ' ')}
                </span>
              </div>
              <p>{String(row.caller_email)}</p>
              <p>
                {formatSessionTime(String(row.start_time))} ·{' '}
                {row.call_mode === 'video' ? 'Video' : 'Browser audio'} ·{' '}
                {formatMoney(Number(row.amount_in_paise))}
              </p>
              <p className="field-hint">
                Booking {String(row.id)}
                {row.session_outcome
                  ? ` · ${String(row.session_outcome).replaceAll('_', ' ')}`
                  : ''}
              </p>
              {Boolean(row.razorpay_refund_id) && (
                <p className="field-hint">
                  Refund reference: {String(row.razorpay_refund_id)}
                </p>
              )}
              {row.status === 'confirmed' && (
                <div className="admin-action-row">
                  <button
                    type="button"
                    disabled={busy}
                    className="text-link"
                    onClick={() => setCancelId(String(row.id))}
                  >
                    Cancel with full refund
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="text-link"
                    onClick={() => act(String(row.id), 'resend')}
                  >
                    Resend confirmation
                  </button>
                  {new Date(String(row.start_time)).getTime() <= now &&
                    !row.session_outcome && (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          className="text-link"
                          onClick={() => act(String(row.id), 'completed')}
                        >
                          Completed
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          className="text-link"
                          onClick={() => act(String(row.id), 'guest_no_show')}
                        >
                          Guest no-show
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          className="text-link"
                          onClick={() => act(String(row.id), 'host_missed')}
                        >
                          I missed it · refund
                        </button>
                      </>
                    )}
                </div>
              )}
              {cancelId === row.id && (
                <div className="info-notice">
                  <p>Cancel this session and issue a full refund?</p>
                  <button
                    type="button"
                    className="button"
                    disabled={busy}
                    onClick={() => act(String(row.id), 'cancel')}
                  >
                    Confirm cancellation
                  </button>
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => setCancelId('')}
                  >
                    Keep session
                  </button>
                </div>
              )}
            </article>
          ))
        )}
      </section>
      <section className="admin-section">
        <h2>Refund operations</h2>
        {!data.refunds.length ? (
          <p>No refunds queued.</p>
        ) : (
          data.refunds.map((row) => (
            <p key={String(row.booking_id)}>
              {String(row.booking_id)} · {String(row.status)} ·{' '}
              {String(row.attempts)} attempts
            </p>
          ))
        )}
      </section>
    </>
  );
}
