import Link from 'next/link';
/** @param {{title:string,children:import('react').ReactNode}} props */
export function LegalPage({ title, children }) {
  return (
    <article className="legal-page page-width">
      <Link href="/" className="text-link">
        Back to home
      </Link>
      <h1>{title}</h1>
      <p className="info-notice">
        Draft policy — TODO: legal review and host/business details before
        launch.
      </p>
      {children}
    </article>
  );
}
