# Cat Box Reminder

A Netlify + Twilio household reminder app. One shared cat-box timer is reset whenever someone presses **Cat Box Cleaned Now** or an approved household member replies with `DONE`, `CLEANED`, `YES`, `FINISHED`, or `COMPLETE`.

## Current behavior

- Cleaning starts a shared 36-hour timer.
- A scheduled Netlify Function checks every 15 minutes.
- When the 36-hour timer first becomes due, separate SMS reminders are sent to all three configured recipients.
- Reminder sending is limited to 8:00 AM through 8:45 PM America/Los_Angeles time. Nothing is sent from 9:00 PM through 7:59 AM.
- If nobody confirms cleaning after the first reminder, the escalation schedule is:
  - one reminder at 5:00 PM,
  - one reminder at 6:00 PM,
  - one reminder at 7:00 PM,
  - one reminder at 8:00 PM,
  - then reminders at 8:15 PM, 8:30 PM, and 8:45 PM,
  - then stop for the night,
  - resume with one reminder at 8:00 AM the next morning,
  - then wait until 5:00 PM and repeat the evening escalation if still unconfirmed.
- Any valid reply from any configured recipient records the cleaning, stops the escalation immediately, and starts a new shared 36-hour timer for everyone.
- The **Cat Box Cleaned Now** web button does the same reset and is protected by `HOUSEHOLD_PIN`.
- Twilio webhook signatures are validated against the public inbound webhook URL.
- Phone numbers are normalized before comparison so common formatting differences do not break sender recognition.
- If an outbound reminder attempt fails, the app clears the waiting state and backs off for one hour before another attempt.

## Verified so far

- Twilio inbound SMS reaches the Netlify webhook.
- Configured household sender recognition works.
- Confirmation words such as `DONE` reset the shared timer successfully.
- The scheduled reminder function reaches Twilio's Messaging API.
- Full outbound delivery to all three recipients is still pending a clean test after the Twilio account daily-message limit resets.

## Required environment variables

`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `USER_PHONE`, `WIFE_PHONE`, `DAUGHTER_PHONE`, and `HOUSEHOLD_PIN`.

All phone numbers should be entered in E.164 format, for example `+14155551212`. For inbound sender matching, use the actual carrier number Twilio receives in the `From` field.

## Twilio inbound webhook

Configure the Twilio phone number's incoming-message webhook to POST to:

`https://cat-box-reminder.netlify.app/sms/incoming`

The live consent/opt-in explanation page used for the household Twilio setup is:

`https://cat-box-reminder.netlify.app/sms-consent.html`

## Local development

```bash
npm install
netlify dev
```

Netlify Database is provisioned automatically and applies the migration in `netlify/database/migrations`.
