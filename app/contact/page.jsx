import { LegalPage } from '../../components/LegalPage.jsx';
import { readEnv } from '../../lib/env.js';
export const metadata = { title: 'Contact' };
export default function Contact() {
  const env = readEnv();
  return (
    <LegalPage title="Contact the host">
      <h2>Booking support</h2>
      <p>
        For booking questions, later cancellations, privacy requests, or refund
        queries, include your booking reference. Do not send card details, UPI
        PINs, passwords, or your private booking link in a public message.
      </p>
      {env.SUPPORT_EMAIL ? (
        <a href={`mailto:${env.SUPPORT_EMAIL}`} className="text-link">
          {env.SUPPORT_EMAIL}
        </a>
      ) : (
        <p>Support email is awaiting configuration.</p>
      )}
      <h2>Business and grievance details</h2>
      <p>
        TODO: add legal business name, address where required, grievance contact
        and response process before launch.
      </p>
      <h2>Emergencies</h2>
      <p>
        This conversation service is not for emergencies. If you need urgent
        help, contact local emergency services or an appropriate qualified
        service.
      </p>
    </LegalPage>
  );
}
