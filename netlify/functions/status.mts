import type { Config } from "@netlify/functions";
import { db, json } from "./_lib.mts";

export default async () => {
  const database = db();
  const rows = await database.sql`
    SELECT last_cleaned_at, next_due_at, next_reminder_at, waiting_for_reply, last_reminder_at, last_confirmed_by
    FROM cat_box_state
    WHERE id = 1
  `;

  const state = (rows[0] ?? {}) as Record<string, unknown>;
  const now = new Date();
  const nextDueRaw = state.next_due_at as Date | string | null | undefined;
  const nextDue = nextDueRaw ? new Date(nextDueRaw) : null;
  const isDue = Boolean(nextDue && nextDue.getTime() <= now.getTime());
  const secondsUntilDue = nextDue ? Math.floor((nextDue.getTime() - now.getTime()) / 1000) : null;

  return json({
    ...state,
    server_time: now.toISOString(),
    is_due: isDue,
    seconds_until_due: secondsUntilDue
  });
};

export const config: Config = { path: "/api/status" };
