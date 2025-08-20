// src/app/dashboard/page.tsx  (Server Component)
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const supabase = createServerComponentClient({ cookies });
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    redirect('/?login=1&redirect=/dashboard');
  }

  return <div className="p-6">Welcome, {session.user.email}</div>;
}
