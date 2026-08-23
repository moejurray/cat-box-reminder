# Cat Box Reminder

A Netlify + Twilio household reminder app. One shared cat-box timer is reset whenever someone presses **Cat Box Cleaned Now** or an approved household member replies with `DONE`, `CLEANED`, `YES`, `FINISHED`, or `COMPLETE`.

## Current behavior

- Cleaning starts a shared 36-hour timer.
- A scheduled Netlify Function checks every 15 minutes.
- If the timer is due, separate SMS reminders are sent to all three configured recipients.
- SMS reminders are sent only between 8:00 AM and 8:00 PM America/Los_Angeles time.
- Once reminders are successfully sent, no duplicate reminder is sent while waiting for confirmation.
- A valid reply from any configured recipient records the cleaning and starts a new shared 36-hour timer for everyone.
- The **Cat Box Cleaned Now** web button can also reset the timer and is protected by `HOUSEHOLD_PIN`.
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
