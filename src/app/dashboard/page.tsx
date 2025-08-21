// app/dashboard/page.tsx
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabaseServer";

export default async function DashboardPage() {
  const supabase = await createServerSupabase(); // ⬅️ now awaited
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect(`/?login=1&redirect=/dashboard`);

  return <div>Welcome, {user.email}</div>;
}
