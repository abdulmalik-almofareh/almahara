import { ROLE_LABEL, ROLE_DESC, type Role } from "./roles";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function inviteEmailHtml(opts: { schoolName: string; role: Role; url: string; inviterName?: string | null }) {
  const { schoolName, role, url, inviterName } = opts;
  return `<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;background:#EEF2F0;font-family:Tahoma,Arial,sans-serif;color:#14201C">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF2F0;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #D5DEDA;border-radius:14px">
<tr><td style="padding:26px 26px 6px;text-align:center;font-size:26px;font-weight:bold;color:#17675A">المهرة</td></tr>
<tr><td style="padding:6px 26px 0;text-align:right;font-size:16px;line-height:1.9">
<p style="margin:0 0 10px">السلام عليكم ورحمة الله،</p>
<p style="margin:0 0 10px">${inviterName ? esc(inviterName) + " يدعوك" : "تمت دعوتك"} للانضمام إلى <b>${esc(schoolName)}</b> على منصة المهرة بصفة <b>${ROLE_LABEL[role]}</b>.</p>
<p style="margin:0 0 18px;color:#5A6A64;font-size:14px">${ROLE_DESC[role]}.</p>
</td></tr>
<tr><td align="center" style="padding:4px 26px 18px">
<a href="${url}" style="display:inline-block;background:#17675A;color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;padding:12px 28px;border-radius:8px">قبول الدعوة</a>
</td></tr>
<tr><td style="padding:0 26px 24px;text-align:right;font-size:13px;color:#5A6A64;line-height:1.8">
<p style="margin:0">ستسجّل الدخول بحساب Google أو برمز يصل إلى بريدك، ولا تحتاج كلمة مرور. الدعوة صالحة لمدة ١٤ يوماً.</p>
<p style="margin:8px 0 0;direction:ltr;text-align:left;word-break:break-all;font-size:12px">${url}</p>
</td></tr></table>
<p style="font-size:12px;color:#5A6A64;margin:14px 0 0">إذا لم تكن تتوقع هذه الدعوة فتجاهل الرسالة.</p>
</td></tr></table></body></html>`;
}

/** Sends through Resend's HTTP API. Returns false when email is not configured or fails. */
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    if (!res.ok) console.error("Resend error", res.status, await res.text());
    return res.ok;
  } catch (e) {
    console.error("Resend request failed", e);
    return false;
  }
}
