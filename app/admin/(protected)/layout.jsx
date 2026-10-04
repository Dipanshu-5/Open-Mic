import { redirect } from 'next/navigation';
import { requireAdmin } from '../../../lib/auth.js';
export const dynamic = 'force-dynamic';
/** @param {{children:import('react').ReactNode}} props */
export default async function ProtectedLayout({ children }) {
  try {
    await requireAdmin();
  } catch {
    redirect('/admin/login');
  }
  return children;
}
