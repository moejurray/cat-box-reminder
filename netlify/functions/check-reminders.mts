import type { Config } from "@netlify/functions";
import { addHours, db, insideSendWindow, PACIFIC_TZ, recipients, twilioClient, twilioNumber } from "./_lib.mts";

type PacificParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function pacificParts(date: Date): PacificParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute")
  };
}

function pacificLocalDate(year: number, month: number, day: number, hour: number, minute: number): Date {
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let guess = targetAsUtc;

  for (let i = 0; i < 3; i++) {
    const p = pacificParts(new Date(guess));
    const representedAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0, 0);
    guess += targetAsUtc - representedAsUtc;
  }

  return new Date(guess);
}

function addPacificDays(parts: PacificParts, days: number): PacificParts {
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12, 0, 0));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: parts.hour,
    minute: parts.minute
  };
}

function nextEscalationAt(now: Date): Date {
  const p = pacificParts(now);

  if (p.hour < 8) {
    return pacificLocalDate(p.year, p.month, p.day, 8, 0);
  }

  if (p.hour < 17) {
    return pacificLocalDate(p.year, p.month, p.day, 17, 0);
  }

  if (p.hour < 20) {
    return pacificLocalDate(p.year, p.month, p.day, p.hour + 1, 0);
  }

  if (p.hour === 20) {
    const nextQuarter = (Math.floor(p.minute / 15) + 1) * 15;
    if (nextQuarter < 60) {
      return pacificLocalDate(p.year, p.month, p.day, 20, nextQuarter);
    }
  }

  const tomorrow = addPacificDays(p, 1);
  return pacificLocalDate(tomorrow.year, tomorrow.month, tomorrow.day, 8, 0);
}

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

    const nextReminderAt = nextEscalationAt(now);
    await database.sql`
      UPDATE cat_box_state
      SET waiting_for_reply = FALSE,
          next_due_at = ${nextReminderAt},
          updated_at = NOW()
      WHERE id = 1
    `;
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

// TEMPORARY TEST MODE: check every minute. Restore to */15 after validation.
export const config: Config = { schedule: "* * * * *" };
