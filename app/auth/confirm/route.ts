import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-next";

// Email sign-in links (from the Arabic template in supabase/email-templates) land here.
// Works even when the link is opened on a different device or browser.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const token_hash = searchParams.get("token_hash");
  let type = (searchParams.get("type") || "email") as EmailOtpType;
  if ((type as string) === "magiclink" || (type as string) === "signup") type = "email";
  let next = safeNext(searchParams.get("next"), origin);
  // the email template passes the original redirect (/auth/callback?next=...); unwrap it
  if (next.startsWith("/auth/callback")) next = safeNext(new URL(next, origin).searchParams.get("next"), origin);
  if (token_hash) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }
  return NextResponse.redirect(new URL("/login?error=link", origin));
}
