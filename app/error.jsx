'use client';

/** @param {{ reset: () => void }} props */
export default function ErrorPage({ reset }) {
  return (
    <section className="booking-preview page-width">
      <h1>Something interrupted us.</h1>
      <p>Please try loading this page again.</p>
      <button type="button" className="button" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
