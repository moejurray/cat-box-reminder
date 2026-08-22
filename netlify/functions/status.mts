import type { Config } from "@netlify/functions";
import { db, json } from "./_lib.mts";

export default async () => {
  const database = db();
  const rows = await database.sql`
    SELECT last_cleaned_at, next_due_at, waiting_for_reply, last_reminder_at, last_confirmed_by
    FROM cat_box_state
    WHERE id = 1
  `;
  return json(rows[0] ?? {});
};

export const config: Config = { path: "/api/status" };
