import { z } from 'zod';
import { requireAdmin } from '../../../../../lib/auth.js';
import { CallLauncher } from '../../../../../components/CallLauncher.jsx';
/** @param {{params:Promise<{id:string}>}} props */
export default async function HostJoinPage({ params }) {
  await requireAdmin();
  const id = z.uuid().parse((await params).id);
  return (
    <section className="call-page page-width">
      <CallLauncher
        endpoint={`/api/admin/bookings/${id}`}
        returnUrl="/admin"
        requestBody={{ action: 'join' }}
      />
    </section>
  );
}
