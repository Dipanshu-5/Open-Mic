import { notFound } from 'next/navigation';
import { authorizedBooking, guestView } from '../../../lib/bookings.js';
import { GuestBooking } from '../../../components/GuestBooking.jsx';
import { readEnv } from '../../../lib/env.js';
export const metadata = {
  title: 'Your private booking',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';
/** @param {{params:Promise<{token:string}>}} props */
export default async function BookingPage({ params }) {
  const { token } = await params;
  let booking;
  try {
    booking = await authorizedBooking(token);
  } catch {
    notFound();
  }
  return (
    <section className="booking-preview page-width">
      <GuestBooking
        token={token}
        initialBooking={guestView(booking)}
        supportEmail={readEnv().SUPPORT_EMAIL || ''}
      />
    </section>
  );
}
