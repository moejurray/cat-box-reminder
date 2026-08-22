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

const PUBLIC_WEBHOOK_URL = "https://cat-box-reminder.netlify.app/sms/incoming";

export default async (req: Request) => {
  try {
    console.log("incoming-sms: request received", { method: req.method });

    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const authToken = Netlify.env.get("TWILIO_AUTH_TOKEN");
    if (!authToken) {
      console.error("incoming-sms: TWILIO_AUTH_TOKEN missing");
      return new Response("Twilio not configured", { status: 500 });
    }

    const rawBody = await req.text();
    const params = Object.fromEntries(new URLSearchParams(rawBody).entries());
    const signature = req.headers.get("x-twilio-signature") ?? "";

    const valid = twilio.validateRequest(
      authToken,
      signature,
      PUBLIC_WEBHOOK_URL,
      params
    );

    if (!valid) {
      console.warn("incoming-sms: invalid Twilio signature");
      return new Response("Forbidden", { status: 403 });
    }

    const from = params.From ?? "";
    const body = params.Body ?? "";

    console.log("incoming-sms: validated", {
      recognizedSender: recipients().includes(from),
      acceptedConfirmation: acceptedConfirmation(body)
    });

    if (!recipients().includes(from)) {
      return new Response("", { status: 204 });
    }

    if (!acceptedConfirmation(body)) {
      return new Response("", { status: 204 });
    }

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

    console.log("incoming-sms: timer reset", { who });
    return new Response("", { status: 204 });
  } catch (error) {
    console.error("incoming-sms: unhandled error", error);
    return new Response("Internal Server Error", { status: 500 });
  }
};

export const config: Config = { path: "/sms/incoming" };
