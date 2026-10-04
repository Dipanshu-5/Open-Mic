'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { jsonRequest } from '../lib/client-api.js';
/** @param {{mode:'demo'|'live'}} props */
export function AdminLogin({ mode }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  async function login(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      await jsonRequest('/api/admin/login', {
        email: String(form.get('email') || ''),
        password: String(form.get('password') || ''),
      });
      router.push('/admin');
      router.refresh();
    } catch {
      setError(
        'Sign-in failed. Check your credentials and the admin configuration.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p>
        {mode === 'demo'
          ? 'Demo host access requires a configured local admin password.'
          : 'Sign in with your approved host account.'}
      </p>
      <form className="guest-form" onSubmit={login}>
        {mode === 'live' && (
          <label>
            Email
            <input name="email" type="email" autoComplete="username" required />
          </label>
        )}
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="button" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </>
  );
}
