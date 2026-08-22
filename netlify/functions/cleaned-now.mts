import type { Config, Context } from "@netlify/functions";
import { addHours, db, json, REMINDER_HOURS } from "./_lib.mts";

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const configuredPin = Netlify.env.get("HOUSEHOLD_PIN");
  if (configuredPin) {
    const suppliedPin = req.headers.get("x-household-pin") ?? "";
    if (suppliedPin !== configuredPin) return json({ error: "Invalid PIN" }, { status: 401 });
  }

  const now = new Date();
  const nextDue = addHours(now, REMINDER_HOURS);
  const database = db();

  await database.sql`
    UPDATE cat_box_state
    SET last_cleaned_at = ${now},
        next_due_at = ${nextDue},
        waiting_for_reply = FALSE,
        last_reminder_at = NULL,
        last_confirmed_by = 'button',
        updated_at = NOW()
    WHERE id = 1
  `;

  await database.sql`
    INSERT INTO cleaning_events (cleaned_at, confirmed_by, source)
    VALUES (${now}, ${"button"}, ${"web"})
  `;

  return json({ ok: true, cleanedAt: now.toISOString(), nextDueAt: nextDue.toISOString() });
};

export const config: Config = { path: "/api/cleaned-now" };
