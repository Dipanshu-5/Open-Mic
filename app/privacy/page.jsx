import { LegalPage } from '../../components/LegalPage.jsx';
export const metadata = { title: 'Privacy policy' };
export default function Privacy() {
  return (
    <LegalPage title="Privacy policy">
      <h2>What we collect</h2>
      <p>
        Booking details include your name, email, selected session, time,
        payment references, and consent flags with timestamps. A phone number is
        optional and used for WhatsApp notifications if you opt in. The host can
        access booking contact information to manage sessions. We do not offer
        normal phone calls.
      </p>
      <h2>Why and with whom</h2>
      <p>
        We use these details to reserve your session, verify payment, send
        confirmations and reminders, manage cancellation/refunds, protect
        against abuse, and provide the call. Relevant providers include
        Supabase, Razorpay, 100ms, Resend, optional Meta WhatsApp, Cloudflare,
        Upstash, and Vercel. Payment details entered in checkout are handled by
        the payment provider, rather than stored as card or UPI credentials by
        this application.
      </p>
      <h2>Session privacy</h2>
      <p>
        Recording is disabled. Your private booking link gives access to booking
        information and permitted actions; do not share it publicly.
        Administrative sign-in uses session cookies. Security checks and call
        providers may use their own technical identifiers necessary to operate.
      </p>
      <h2>Retention and requests</h2>
      <p>
        The default maintenance policy removes completed payment-event logs
        after 90 days and anonymizes contact details more than 90 days after the
        session ends. Payment/refund references and financial snapshots may
        remain for accounting, dispute, or legal needs. Contact the host to
        request correction, erasure where applicable, or withdrawal of WhatsApp
        consent. Provider retention and legal requirements must be reviewed
        before launch.
      </p>
      <h2>Contact</h2>
      <p>
        TODO: insert the business/data contact, grievance process, response
        timelines, international processing disclosures, and legally reviewed
        retention terms before launch.
      </p>
    </LegalPage>
  );
}
