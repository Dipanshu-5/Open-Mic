import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getPlan } from '../../lib/config.js';
import { readEnv } from '../../lib/env.js';
import { BookingFlow } from '../../components/BookingFlow.jsx';

export const metadata = {
  title: 'Your session',
  robots: { index: false, follow: false },
};

/** @param {{ searchParams: Promise<Record<string, string | string[] | undefined>> }} props */
export default async function BookingPage({ searchParams }) {
  const query = await searchParams;
  const plan = getPlan(query.planId);
  const env = readEnv();
  return (
    <section className="booking-preview page-width">
      <Link href="/#sessions" className="text-link">
        <ArrowLeft size={17} aria-hidden="true" /> Back to sessions
      </Link>
      <p className="eyebrow">MAKE A LITTLE TIME</p>
      <h1>
        Your conversation
        <br />
        starts here.
      </h1>
      <BookingFlow
        initialPlanId={plan?.id || 'video_30'}
        mode={env.APP_MODE}
        whatsappEnabled={env.WHATSAPP_ENABLED || env.APP_MODE === 'demo'}
        turnstileSiteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ''}
      />
    </section>
  );
}
