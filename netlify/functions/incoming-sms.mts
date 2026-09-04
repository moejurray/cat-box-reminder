import type { Config } from "@netlify/functions";
import twilio from "twilio";
import {
  acceptedConfirmation,
  activeMemberForPhone,
  activeRecipients,
  addHours,
  db,
  normalizePhone,
  PACIFIC_TZ,
  REMINDER_HOURS,
  twilioClient,
  twilioNumber
} from "./_lib.mts";

const PUBLIC_WEBHOOK_URL = "https://cat-box-reminder.netlify.app/sms/incoming";

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

export default async (req: Request) => {
  try {
    console.log("incoming-sms: request received", { method: req.method });

    if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    const authToken = Netlify.env.get("TWILIO_AUTH_TOKEN");
    if (!authToken) {
      console.error("incoming-sms: TWILIO_AUTH_TOKEN missing");
      return new Response("Twilio not configured", { status: 500 });
    }

    const rawBody = await req.text();
    const params = Object.fromEntries(new URLSearchParams(rawBody).entries());
    const signature = req.headers.get("x-twilio-signature") ?? "";
    const valid = twilio.validateRequest(authToken, signature, PUBLIC_WEBHOOK_URL, params);

    if (!valid) {
      console.warn("incoming-sms: invalid Twilio signature");
      return new Response("Forbidden", { status: 403 });
    }

    const from = normalizePhone(params.From ?? "");
    const body = (params.Body ?? "").trim();
    const database = db();

    if (/^stop$/i.test(body)) {
      await database.sql`
        UPDATE household_members
        SET active = FALSE, opted_out_at = NOW(), updated_at = NOW()
        WHERE phone = ${from}
      `;
      console.log("incoming-sms: member opted out");
      return new Response(null, { status: 204 });
    }

    const member = await activeMemberForPhone(from);
    const confirmationAccepted = acceptedConfirmation(body);
    console.log("incoming-sms: validated", {
      recognizedSender: Boolean(member),
      acceptedConfirmation: confirmationAccepted
    });

    if (!member || !confirmationAccepted) return new Response(null, { status: 204 });

    const now = new Date();
    const nextDue = addHours(now, REMINDER_HOURS);

    await database.sql`
      UPDATE cat_box_state
      SET last_cleaned_at = ${now},
          next_due_at = ${nextDue},
          waiting_for_reply = FALSE,
          last_confirmed_by = ${member.name},
          updated_at = NOW()
      WHERE id = 1
    `;

    await database.sql`
      INSERT INTO cleaning_events (cleaned_at, confirmed_by, source)
      VALUES (${now}, ${member.name}, ${"sms"})
    `;

    console.log("incoming-sms: timer reset", { who: member.name });

    try {
      const recipients = await activeRecipients();
      const client = twilioClient();
      const fromNumber = twilioNumber();
      const message = `Cat box done. Next check-in: ${formatPacific(nextDue)}.`;

      for (const to of recipients) {
        await client.messages.create({ from: fromNumber, to, body: message });
      }
      console.log("incoming-sms: confirmation broadcast sent", { recipients: recipients.length });
    } catch (sendError) {
      console.error("incoming-sms: confirmation broadcast failed", sendError);
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("incoming-sms: unhandled error", error);
    return new Response("Internal Server Error", { status: 500 });
  }
};

export const config: Config = { path: "/sms/incoming" };
