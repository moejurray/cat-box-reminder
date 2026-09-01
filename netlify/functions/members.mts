import type { Config } from "@netlify/functions";
import { randomUUID } from "node:crypto";
import { db, json, normalizePhone } from "./_lib.mts";

function authorized(req: Request): boolean {
  const expected = Netlify.env.get("HOUSEHOLD_PIN") ?? "";
  const supplied = req.headers.get("x-household-pin") ?? "";
  return Boolean(expected) && supplied === expected;
}

export default async (req: Request) => {
  if (!authorized(req)) return json({ error: "Invalid household PIN." }, { status: 401 });
  const database = db();

  if (req.method === "GET") {
    const rows = await database.sql`
      SELECT id, name, phone, invited_at, consented_at, opted_out_at, active
      FROM household_members
      ORDER BY created_at ASC
    `;
    return json({ members: rows });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed." }, { status: 405 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action ?? "invite");

  if (action === "deactivate") {
    const id = Number(body.id);
    if (!Number.isFinite(id)) return json({ error: "Invalid member." }, { status: 400 });
    await database.sql`
      UPDATE household_members
      SET active = FALSE, opted_out_at = COALESCE(opted_out_at, NOW()), updated_at = NOW()
      WHERE id = ${id}
    `;
    return json({ ok: true });
  }

  const name = String(body.name ?? "").trim();
  const phone = normalizePhone(String(body.phone ?? ""));
  if (!name || !phone) return json({ error: "Name and a valid phone number are required." }, { status: 400 });

  const token = randomUUID();
  const rows = await database.sql`
    INSERT INTO household_members (name, phone, invite_token, invited_at, active, opted_out_at, updated_at)
    VALUES (${name}, ${phone}, ${token}, NOW(), FALSE, NULL, NOW())
    ON CONFLICT (phone) DO UPDATE
      SET name = EXCLUDED.name,
          invite_token = EXCLUDED.invite_token,
          invited_at = NOW(),
          active = FALSE,
          opted_out_at = NULL,
          consented_at = NULL,
          consent_source = NULL,
          consent_text = NULL,
          consent_user_agent = NULL,
          updated_at = NOW()
    RETURNING id, name, phone, invite_token
  `;
  const member = rows[0] as { id: number; name: string; phone: string; invite_token: string };
  const inviteUrl = `https://cat-box-reminder.netlify.app/sms-consent.html?t=${encodeURIComponent(member.invite_token)}`;
  return json({ member: { id: member.id, name: member.name, phone: member.phone }, invite_url: inviteUrl });
};

export const config: Config = { path: "/api/members" };
