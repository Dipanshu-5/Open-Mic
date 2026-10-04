import { DM_Sans, Lora } from 'next/font/google';
import { SiteHeader, SiteFooter } from '../components/SiteChrome.jsx';
import { publicSiteConfig } from '../lib/env.js';
import './globals.css';

const sans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});
const serif = Lora({
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
});

export function generateMetadata() {
  const site = publicSiteConfig();
  return {
    title: {
      default: `${site.brandName} — Space to talk`,
      template: `%s | ${site.brandName}`,
    },
    description:
      'A little space for a one-to-one conversation. Choose a video or browser audio session, at your own pace.',
    robots: { index: site.mode === 'live', follow: site.mode === 'live' },
    openGraph: {
      title: `${site.brandName} — Space to talk`,
      description:
        'Paid one-to-one video and browser audio conversations. 30 minutes ₹299; 60 minutes ₹500.',
      type: 'website',
    },
  };
}

/** @param {{ children: import('react').ReactNode }} props */
export default function RootLayout({ children }) {
  const site = publicSiteConfig();
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${sans.variable} ${serif.variable}`}
    >
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <div className="preview-banner" role="status">
          {site.mode === 'demo'
            ? 'Demo preview · payments and calls are simulated'
            : 'Private online conversations · Video & browser audio'}
        </div>
        <SiteHeader brandName={site.brandName} />
        <main id="main-content">{children}</main>
        <SiteFooter brandName={site.brandName} />
      </body>
    </html>
  );
}
