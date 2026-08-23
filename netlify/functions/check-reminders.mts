import type { Config } from "@netlify/functions";
import { addHours, db, insideSendWindow, recipients, twilioClient, twilioNumber } from "./_lib.mts";

export default async () => {
  const now = new Date();
  if (!insideSendWindow(now)) return;

  const database = db();
  const rows = await database.sql`
    SELECT next_due_at, waiting_for_reply
    FROM cat_box_state
    WHERE id = 1
  `;
  const state = rows[0] as { next_due_at?: Date | string | null; waiting_for_reply?: boolean } | undefined;
  if (!state?.next_due_at || state.waiting_for_reply) return;

  const due = new Date(state.next_due_at);
  if (due.getTime() > now.getTime()) return;

  const claimed = await database.sql`
    UPDATE cat_box_state
    SET waiting_for_reply = TRUE,
        last_reminder_at = ${now},
        updated_at = NOW()
    WHERE id = 1
      AND waiting_for_reply = FALSE
      AND next_due_at <= ${now}
    RETURNING id
  `;
  if (claimed.length === 0) return;

  const client = twilioClient();
  const from = twilioNumber();
  const people = recipients();
  if (people.length !== 3) {
    const retryAt = addHours(now, 1);
    await database.sql`
      UPDATE cat_box_state
      SET waiting_for_reply = FALSE,
          next_due_at = ${retryAt},
          updated_at = NOW()
      WHERE id = 1
    `;
    throw new Error("All three recipient phone numbers must be configured");
  }

  try {
    for (const to of people) {
      const msg = await client.messages.create({
        from,
        to,
        body: "Cat box reminder: it’s time to clean the cat box. Reply DONE after it has been cleaned."
      });
      await database.sql`
        INSERT INTO reminder_events (sent_at, recipient, twilio_sid)
        VALUES (${now}, ${to}, ${msg.sid})
      `;
    }
  } catch (err) {
    const retryAt = addHours(now, 1);
    await database.sql`
      UPDATE cat_box_state
      SET waiting_for_reply = FALSE,
          next_due_at = ${retryAt},
          updated_at = NOW()
      WHERE id = 1
    `;
    throw err;
  }
};

export const config: Config = { schedule: "*/5 * * * *" };
