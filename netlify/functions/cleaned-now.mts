import type { Config, Context } from "@netlify/functions";
import { activeRecipients, addHours, db, json, PACIFIC_TZ, REMINDER_HOURS, twilioClient, twilioNumber } from "./_lib.mts";

function formatPacific(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(date);
}

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

  try {
    const recipients = await activeRecipients();
    if (recipients.length > 0) {
      const client = twilioClient();
      const from = twilioNumber();
      const body = `Cat box done. Next check-in: ${formatPacific(nextDue)}.`;
      const results = await Promise.allSettled(
        recipients.map((to) => client.messages.create({ from, to, body }))
      );
      const failed = results.filter((result) => result.status === "rejected");
      if (failed.length > 0) {
        console.error("cleaned-now: confirmation SMS failed for one or more recipients", { failed: failed.length });
      }
    }
  } catch (err) {
    console.error("cleaned-now: confirmation SMS send failed", err);
  }

  return json({ ok: true, cleanedAt: now.toISOString(), nextDueAt: nextDue.toISOString() });
};

export const config: Config = { path: "/api/cleaned-now" };
