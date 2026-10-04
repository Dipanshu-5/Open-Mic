import Link from 'next/link';

export default function NotFound() {
  return (
    <section className="booking-preview page-width">
      <p className="eyebrow">PAGE NOT FOUND</p>
      <h1>Let’s find our way back.</h1>
      <p>This page isn’t available.</p>
      <Link href="/" className="button">
        Back to home
      </Link>
    </section>
  );
}
