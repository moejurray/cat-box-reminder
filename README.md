# Cat Box Reminder

A Netlify + Twilio household reminder app. One shared cat-box timer is reset whenever someone presses **Cat Box Cleaned Now** or an approved household member replies to a reminder with `DONE`, `CLEANED`, `YES`, `FINISHED`, or `COMPLETE`.

## Behavior

- Cleaning starts a 36-hour timer.
- A scheduled Netlify Function checks every 5 minutes.
- If the timer is due, texts are sent to all three recipients only between 8:00 AM and 8:00 PM America/Los_Angeles time.
- Once reminders are sent, no duplicate reminder is sent while waiting for confirmation.
- A valid reply from any configured recipient records a cleaning and starts a new shared 36-hour timer.
- Twilio webhook signatures are validated.

## Required environment variables

`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `USER_PHONE`, `WIFE_PHONE`, `DAUGHTER_PHONE`, and `HOUSEHOLD_PIN`.

All phone numbers should be in E.164 format, for example `+14155551212`.

## Twilio inbound webhook

Configure the Twilio phone number's incoming-message webhook to POST to:

`https://YOUR-SITE.netlify.app/sms/incoming`

## Local development

```bash
npm install
netlify dev
```

Netlify Database is provisioned automatically and applies the migration in `netlify/database/migrations`.
