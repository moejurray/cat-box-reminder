import { getDatabase } from "@netlify/database";
import twilio from "twilio";

export const PACIFIC_TZ = "America/Los_Angeles";
export const REMINDER_HOURS = 36;

export function db() {
  return getDatabase();
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

export function pacificHour(date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TZ,
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  return Number(parts.find((p) => p.type === "hour")?.value ?? "0");
}

export function insideSendWindow(date = new Date()): boolean {
  const hour = pacificHour(date);
  return hour >= 8 && hour < 21;
}

export function normalizePhone(phone: string | undefined): string {
  if (!phone) return "";
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 10) digits = `1${digits}`;
  return digits ? `+${digits}` : "";
}

export function recipients(): string[] {
  return [
    Netlify.env.get("USER_PHONE"),
    Netlify.env.get("WIFE_PHONE"),
    Netlify.env.get("DAUGHTER_PHONE")
  ]
    .map((v) => normalizePhone(v))
    .filter(Boolean);
}

export function displayNameForPhone(phone: string): string {
  const normalized = normalizePhone(phone);
  if (normalized === normalizePhone(Netlify.env.get("USER_PHONE"))) return "user";
  if (normalized === normalizePhone(Netlify.env.get("WIFE_PHONE"))) return "wife";
  if (normalized === normalizePhone(Netlify.env.get("DAUGHTER_PHONE"))) return "daughter";
  return "unknown";
}

export function twilioClient() {
  const sid = Netlify.env.get("TWILIO_ACCOUNT_SID");
  const token = Netlify.env.get("TWILIO_AUTH_TOKEN");
  if (!sid || !token) throw new Error("Twilio credentials are not configured");
  return twilio(sid, token);
}

export function twilioNumber(): string {
  const value = normalizePhone(Netlify.env.get("TWILIO_PHONE_NUMBER"));
  if (!value) throw new Error("TWILIO_PHONE_NUMBER is not configured");
  return value;
}

export function acceptedConfirmation(body: string): boolean {
  const normalized = body.trim().toLowerCase().replace(/[.!?]/g, "");
  return ["done", "cleaned", "yes", "finished", "complete"].includes(normalized);
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...(init.headers ?? {}) }
  });
}
