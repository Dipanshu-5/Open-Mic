import { notFound } from 'next/navigation';
import { authorizedBooking } from '../../../../lib/bookings.js';
import { CallLauncher } from '../../../../components/CallLauncher.jsx';
export const metadata = {
  title: 'Your conversation room',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';
/** @param {{params:Promise<{token:string}>}} props */
export default async function JoinPage({ params }) {
  const { token } = await params;
  try {
    await authorizedBooking(token);
  } catch {
    notFound();
  }
  return (
    <section className="call-page page-width">
      <CallLauncher
        endpoint={`/api/b/${token}/join`}
        returnUrl={`/b/${token}`}
      />
    </section>
  );
}
