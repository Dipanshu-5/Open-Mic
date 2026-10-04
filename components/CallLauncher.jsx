'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useState } from 'react';
import { jsonRequest, friendlyError } from '../lib/client-api.js';
const CallRoom = dynamic(() => import('./CallRoom.jsx'), {
  ssr: false,
  loading: () => <p>Preparing your conversation room…</p>,
});
/** @param {{endpoint:string,returnUrl:string,requestBody?:{action:'join'}}} props */
export function CallLauncher({ endpoint, returnUrl, requestBody }) {
  const [session, setSession] = useState(
    /** @type {{token:string,simulated:boolean,name:string,mode:'video'|'audio'}|null} */ (
      null
    ),
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function join() {
    setBusy(true);
    setError('');
    try {
      setSession(await jsonRequest(endpoint, requestBody || {}));
    } catch (reason) {
      setError(friendlyError(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p className="eyebrow">YOUR CONVERSATION ROOM</p>
      <h1>A moment, just for you.</h1>
      {session ? (
        session.simulated ? (
          <div className="info-notice">
            <h2>
              Simulated {session.mode === 'audio' ? 'audio' : 'video'} room
            </h2>
            <p>
              This preview does not request device permissions or connect a real
              call.
            </p>
            <button
              type="button"
              className="button"
              onClick={() => setSession(null)}
            >
              Leave simulated room
            </button>
          </div>
        ) : (
          <CallRoom session={session} onLeave={() => setSession(null)} />
        )
      ) : (
        <>
          <p>
            Settle in somewhere comfortable. Your browser may ask for microphone
            access, and camera access for a video session.
          </p>
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={join}
          >
            {busy ? 'Preparing…' : 'Enter conversation'}
          </button>
        </>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <Link href={returnUrl} className="text-link">
        Back to booking
      </Link>
    </>
  );
}
