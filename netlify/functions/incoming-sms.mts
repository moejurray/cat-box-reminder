import type { Config } from "@netlify/functions";
import twilio from "twilio";
import {
  acceptedConfirmation,
  addHours,
  db,
  displayNameForPhone,
  recipients,
  REMINDER_HOURS
} from "./_lib.mts";

export default async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const authToken = Netlify.env.get("TWILIO_AUTH_TOKEN");
  if (!authToken) return new Response("Twilio not configured", { status: 500 });

  const rawBody = await req.text();
  const params = Object.fromEntries(new URLSearchParams(rawBody).entries());
  const signature = req.headers.get("x-twilio-signature") ?? "";

  const valid = twilio.validateRequest(authToken, signature, req.url, params);
  if (!valid) return new Response("Forbidden", { status: 403 });

  const from = params.From ?? "";
  const body = params.Body ?? "";
  if (!recipients().includes(from)) return new Response("", { status: 204 });
  if (!acceptedConfirmation(body)) return new Response("", { status: 204 });

  const now = new Date();
  const nextDue = addHours(now, REMINDER_HOURS);
  const who = displayNameForPhone(from);
  const database = db();

  await database.sql`
    UPDATE cat_box_state
    SET last_cleaned_at = ${now},
        next_due_at = ${nextDue},
        waiting_for_reply = FALSE,
        last_confirmed_by = ${who},
        updated_at = NOW()
    WHERE id = 1
  `;

  await database.sql`
    INSERT INTO cleaning_events (cleaned_at, confirmed_by, source)
    VALUES (${now}, ${who}, ${"sms"})
  `;

  return new Response("", { status: 204 });
};

export const config: Config = { path: "/sms/incoming" };
