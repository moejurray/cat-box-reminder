import type { Config } from "@netlify/functions";
import { db, json } from "./_lib.mts";

const CONSENT_TEXT = "I agree to receive recurring automated SMS reminders from the Cat Box Reminder system at the mobile number I provide. These messages relate only to cleaning our household cat box. Message frequency varies based on when the task is completed. Message and data rates may apply. I understand that I can reply STOP at any time to opt out and HELP for help. Consent is not a condition of any purchase.";

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 4 ? `••• ••• ${digits.slice(-4)}` : phone;
}

export default async (req: Request) => {
  const database = db();

  if (req.method === "GET") {
    const url = new URL(req.url);
    const token = url.searchParams.get("token") ?? "";
    if (!token) return json({ error: "Missing invitation token." }, { status: 400 });
    const rows = await database.sql`
      SELECT name, phone, consented_at, active
      FROM household_members
      WHERE invite_token = ${token}
      LIMIT 1
    `;
    if (!rows[0]) return json({ error: "This invitation is invalid or expired." }, { status: 404 });
    const member = rows[0] as { name: string; phone: string; consented_at?: string | Date | null; active: boolean };
    return json({ name: member.name, phone_masked: maskPhone(member.phone), consented_at: member.consented_at, active: member.active });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed." }, { status: 405 });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const token = String(body.token ?? "");
  const agreed = body.agreed === true;
  if (!token || !agreed) return json({ error: "You must agree to receive SMS reminders." }, { status: 400 });

  const rows = await database.sql`
    UPDATE household_members
    SET consented_at = NOW(),
        opted_out_at = NULL,
        active = TRUE,
        consent_source = 'web_form',
        consent_text = ${CONSENT_TEXT},
        consent_user_agent = ${req.headers.get("user-agent") ?? ""},
        updated_at = NOW()
    WHERE invite_token = ${token}
    RETURNING name, phone, consented_at
  `;
  if (!rows[0]) return json({ error: "This invitation is invalid or expired." }, { status: 404 });
  return json({ ok: true, consented_at: (rows[0] as any).consented_at });
};

export const config: Config = { path: "/api/consent" };
