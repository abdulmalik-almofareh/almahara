import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Platform from "@/components/Platform";
import type { Role } from "@/lib/roles";

export default async function Home({ searchParams }: { searchParams: Promise<{ school?: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data: rows } = await supabase
    .from("memberships")
    .select("school_id, role, schools(name)")
    .eq("user_id", auth.user.id)
    .order("created_at");
  const schools = (rows ?? []).map((r) => ({
    id: r.school_id as string,
    role: r.role as Role,
    name: ((r.schools as unknown as { name: string } | null)?.name ?? "") as string,
  }));
  if (!schools.length) redirect("/onboarding");

  const { school } = await searchParams;
  const current = schools.find((s) => s.id === school) ?? schools[0];
  const meta = auth.user.user_metadata ?? {};
  return (
    <Platform
      key={current.id}
      school={current}
      schools={schools}
      me={{ id: auth.user.id, email: auth.user.email ?? "", name: (meta.full_name as string) || (meta.name as string) || "" }}
    />
  );
}
