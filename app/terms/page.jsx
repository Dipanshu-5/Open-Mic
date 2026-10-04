import { LegalPage } from '../../components/LegalPage.jsx';
export const metadata = { title: 'Terms of service' };
export default function Terms() {
  return (
    <LegalPage title="Terms of service">
      <h2>The service</h2>
      <p>
        We offer paid, one-to-one conversation sessions online through video or
        browser audio. Sessions are 30 or 60 minutes. The service is for adults
        aged 18 or older. It is not therapy, professional medical, legal, or
        financial advice, or an emergency service.
      </p>
      <h2>Bookings and payment</h2>
      <p>
        A booking is confirmed after payment is captured and the time is
        secured. A checkout hold lasts up to ten minutes and does not itself
        confirm a booking. Prices and duration are shown before payment; all
        displayed times are in India Standard Time (IST).
      </p>
      <h2>Joining and conduct</h2>
      <p>
        Use your private booking link to join from ten minutes before start
        until fifteen minutes after the session ends. Keep the link private. You
        are responsible for a suitable connection and a working microphone, and
        a camera for video calls. Treat the host respectfully; abusive or
        unlawful conduct may end the session.
      </p>
      <h2>Recording</h2>
      <p>
        The platform does not record sessions. Neither participant should record
        a session without a separate explicit agreement and any required
        consent.
      </p>
      <h2>Cancellation and availability</h2>
      <p>
        Guest cancellations at least 24 hours before start receive a full
        refund. Later requests require contacting the host. Host cancellations
        and sessions missed by the host receive a full refund. If a late payment
        arrives after the time has been taken, a full refund is requested
        automatically. Rescheduling is handled by cancelling under this policy
        and making a new booking.
      </p>
      <h2>Contact and remaining review</h2>
      <p>
        TODO: add the legal business identity, support and grievance contact,
        applicable jurisdiction, liability provisions, tax treatment, and
        legally reviewed wording before accepting live bookings.
      </p>
    </LegalPage>
  );
}
