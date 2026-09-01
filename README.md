# Cat Box Reminder

A Netlify + Twilio household reminder app. One shared cat-box timer is reset whenever someone presses **Cat Box Cleaned Now** or an opted-in household member replies with `DONE`, `CLEANED`, `YES`, `FINISHED`, or `COMPLETE`.

## Current behavior

- Cleaning starts a shared 36-hour timer.
- A scheduled Netlify Function checks every 15 minutes.
- Reminder SMS messages are sent only to household members whose consent has been recorded in the database and whose status is active.
- Reminder sending is limited to 8:00 AM through 8:45 PM America/Los_Angeles time. Nothing is sent from 9:00 PM through 7:59 AM.
- If nobody confirms cleaning after the first reminder, the escalation schedule is 5:00 PM, 6:00 PM, 7:00 PM, 8:00 PM, 8:15 PM, 8:30 PM, and 8:45 PM, followed by 8:00 AM the next morning and another evening cycle if still unconfirmed.
- Any valid cleaning confirmation from an active household member records the cleaning, stops escalation, and starts a fresh shared 36-hour timer.
- Replying `STOP` deactivates that household member in the app. `HELP` remains available through Twilio's messaging flow.
- The **Cat Box Cleaned Now** web button resets the shared timer and is protected by `HOUSEHOLD_PIN`.
- Twilio webhook signatures are validated against the public inbound webhook URL.
- If an outbound reminder attempt fails for a normal transient reason, the app backs off for one hour. Twilio error `63038` triggers a 24-hour backoff.

## Household member and consent flow

The home page links to `/members.html`, which is protected by the household PIN.

1. Enter a household member's name and mobile number.
2. The app creates a unique private opt-in URL and stores the member as **Pending opt-in**.
3. **Text invite** opens the device's own SMS app with the invitation prefilled. **Copy link** copies the private opt-in URL so it can be shared another way. The Cat Box Reminder Twilio number intentionally does not send this invitation because the recipient has not consented yet.
4. The recipient opens the private link at `/sms-consent.html?t=...`, reviews the SMS disclosure, checks the consent box, and submits it.
5. The database records the consent timestamp, disclosure text, source, and user agent, and marks the member active.
6. Only active, consented members receive reminder SMS messages or can reset the timer by replying with a confirmation word.

Adding another user later uses the same process; phone numbers are no longer hard-coded as a fixed three-person sending list.

## Verified so far

- Twilio inbound SMS reaches the Netlify webhook.
- Cleaning confirmation words reset the shared timer successfully.
- The scheduled reminder function reaches Twilio's Messaging API.
- Earlier trial-account and Toll-Free Verification blockers (`21608` and `30032`) were identified during controlled tests.
- Toll-Free Verification was approved on 2026-09-01.
- Production timing is 36 hours with a 15-minute scheduler.
- A fresh end-to-end outbound test should be run after household members complete the new web opt-in flow.

## Required environment variables

`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, and `HOUSEHOLD_PIN`.

Legacy `USER_PHONE`, `WIFE_PHONE`, and `DAUGHTER_PHONE` environment variables may remain configured, but the live reminder recipient list now comes from opted-in records in the `household_members` database table.

## Twilio inbound webhook

Configure the Twilio phone number's incoming-message webhook to POST to:

`https://cat-box-reminder.netlify.app/sms/incoming`

The live consent page and Toll-Free Verification proof URL is:

`https://cat-box-reminder.netlify.app/sms-consent.html`

## Local development

```bash
npm install
netlify dev
```

Netlify Database is provisioned automatically and applies migrations in `netlify/database/migrations`.
