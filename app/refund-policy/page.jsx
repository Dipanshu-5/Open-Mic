import { LegalPage } from '../../components/LegalPage.jsx';
export const metadata = { title: 'Refund and cancellation policy' };
export default function Refunds() {
  return (
    <LegalPage title="Refund & cancellation policy">
      <h2>Guest cancellation</h2>
      <p>
        Cancel through your private booking page at least 24 hours before the
        scheduled start for a full refund. At exactly 24 hours, a full refund is
        available. For later cancellations, contact the host. There is no
        automatic refund for a guest no-show.
      </p>
      <h2>Host cancellation or missed session</h2>
      <p>
        If the host cancels or misses the session, a full refund is requested
        automatically when the cancellation or outcome is recorded.
      </p>
      <h2>Late payment and unavailable times</h2>
      <p>
        If a payment is captured after the time can no longer be secured, the
        booking is not confirmed and a full refund is queued. Duplicate delivery
        of payment notifications does not create duplicate bookings or refunds.
      </p>
      <h2>Refund progress</h2>
      <p>
        Refunds return through the original payment method. Your booking page
        shows whether the refund is queued or processed. Completion and the time
        to credit your account depend on the payment provider and bank. Keep
        your booking and refund references when contacting support.
      </p>
      <h2>Changing your time</h2>
      <p>
        Rescheduling is not available in this version. Cancel according to this
        policy, then make a new booking.
      </p>
      <h2>Support</h2>
      <p>
        TODO: supply the support/grievance contact and review this policy with
        the host’s actual business terms before launch.
      </p>
    </LegalPage>
  );
}
