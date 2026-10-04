import { AdminLogin } from '../../../components/AdminLogin.jsx';
import { readEnv } from '../../../lib/env.js';
export default function LoginPage() {
  return (
    <section className="booking-preview page-width">
      <p className="eyebrow">FOR THE HOST</p>
      <h1>
        A little space
        <br />
        to manage.
      </h1>
      <AdminLogin mode={readEnv().APP_MODE} />
    </section>
  );
}
