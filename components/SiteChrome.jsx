import Link from 'next/link';
import { ArrowUpRight, AudioLines } from 'lucide-react';

/** @param {{ brandName: string }} props */
export function SiteHeader({ brandName }) {
  return (
    <header className="site-header page-width">
      <Link href="/" className="brand" aria-label={`${brandName} home`}>
        <span className="brand-symbol" aria-hidden="true">
          <AudioLines size={23} strokeWidth={1.7} />
        </span>
        <span>{brandName}</span>
      </Link>
      <nav aria-label="Main navigation" className="header-nav">
        <Link href="/#how-it-works" className="quiet-link">
          How it works
        </Link>
        <Link href="/#sessions" className="button button-small">
          Explore sessions <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </nav>
    </header>
  );
}

/** @param {{ brandName: string }} props */
export function SiteFooter({ brandName }) {
  return (
    <footer className="site-footer page-width">
      <div>
        <span className="footer-brand">{brandName}</span>
        <p>A little time. A real conversation.</p>
      </div>
      <div>
        <nav aria-label="Legal and support" className="footer-links">
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/refund-policy">Refund policy</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/admin">Host sign-in</Link>
        </nav>
        <p className="footer-note">Video & browser audio · Times in IST</p>
      </div>
    </footer>
  );
}
