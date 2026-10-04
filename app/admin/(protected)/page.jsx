import { requireAdmin } from '../../../lib/auth.js';
import { adminData } from '../../../lib/admin.js';
import { AdminDashboard } from '../../../components/AdminDashboard.jsx';
export default async function AdminPage() {
  await requireAdmin();
  return (
    <section className="admin-panel page-width">
      <AdminDashboard initialData={await adminData()} />
    </section>
  );
}
