# Cat Box Reminder

A Netlify + Twilio household reminder system with one shared cat-box timer, SMS notifications, a small web app, and an ESP32-based physical reminder device.

The shared timer is reset whenever someone presses **Cat Box Cleaned Now** in the web app, an opted-in household member replies with a valid confirmation word, or the ESP32 hardware button calls the same reset endpoint.

## Current behavior

- Cleaning starts a shared 36-hour timer.
- A scheduled Netlify Function checks reminder state every 15 minutes.
- Reminder SMS messages are sent only to household members whose consent has been recorded in the database and whose status is active.
- Reminder sending is limited to 8:00 AM through 8:45 PM America/Los_Angeles time. Nothing is sent from 9:00 PM through 7:59 AM.
- If the 36-hour deadline occurs during quiet hours, the cat box is still considered **due** immediately. The SMS reminder is simply deferred until the next allowed reminder time.
- If nobody confirms cleaning after the first reminder, the escalation schedule is 5:00 PM, 6:00 PM, 7:00 PM, 8:00 PM, 8:15 PM, 8:30 PM, and 8:45 PM, followed by 8:00 AM the next morning and another evening cycle if still unconfirmed.
- Any valid cleaning confirmation from an active household member records the cleaning, stops escalation, clears the reminder schedule, and starts a fresh shared 36-hour timer.
- Pressing **Cat Box Cleaned Now** sends each active opted-in household member a confirmation text showing the next true due time in Pacific time.
- Texting a valid cleaning confirmation word also sends that same confirmation text to each active opted-in household member.
- Replying `STOP` deactivates that household member in the app. `HELP` remains available through Twilio's messaging flow.
- The **Cat Box Cleaned Now** web button is protected by `HOUSEHOLD_PIN`.
- Twilio webhook signatures are validated against the public inbound webhook URL.
- If an outbound reminder attempt fails for a normal transient reason, the app backs off for one hour. Twilio error `63038` triggers a 24-hour backoff.

## Due time vs. reminder time

The system deliberately keeps the true cleaning deadline separate from reminder scheduling.

- `next_due_at` = the actual 36-hour deadline after the last cleaning.
- `next_reminder_at` = the next time the reminder system should attempt an SMS escalation.
- `last_cleaned_at` = the most recent confirmed cleaning time.
- `last_reminder_at` = the most recent reminder-send time.
- `waiting_for_reply` = reminder workflow state.

This separation matters because quiet hours must never move the actual due date. For example, if the 36-hour timer expires at 11:48 PM, the box is already overdue the next morning even if the next permitted SMS is 8:00 AM.

Database migrations `004_separate_due_and_reminder` and `005_restore_true_due_time` introduced this behavior and restored the current true deadline from `last_cleaned_at + 36 hours`.

## Status API

The ESP32 and web app use:

`GET /api/status`

The response includes the stored state plus server-derived status fields:

```json
{
  "last_cleaned_at": "...",
  "next_due_at": "...",
  "next_reminder_at": "...",
  "waiting_for_reply": false,
  "last_reminder_at": "...",
  "last_confirmed_by": "...",
  "server_time": "...",
  "is_due": true,
  "seconds_until_due": -1234
}
```

The web UI shows **NOW DUE** after the true deadline instead of displaying a future reminder/escalation time as though it were the due date.

## Cleaning/reset endpoint

The web button and ESP32 hardware button use:

`POST /api/cleaned-now`

If `HOUSEHOLD_PIN` is configured, send it in the `x-household-pin` request header.

A successful reset:

- records `last_cleaned_at`
- sets `next_due_at` to 36 hours later
- clears `next_reminder_at`
- clears the current reminder workflow
- records a cleaning event
- broadcasts the confirmation SMS to active opted-in household members

## ESP32 physical reminder device

The physical device is built around a **30-pin ESP32 DEVKITV1** board with a CP2102 USB-to-UART interface.

### Development setup verified

- Windows laptop
- Arduino IDE 2.x
- `esp32 by Espressif Systems` board package
- Board profile: **DOIT ESP32 DEVKIT V1**
- USB serial port currently observed as `COM3`
- CP210x Windows VCP driver installed
- ArduinoJson library installed
- Serial Monitor tested at `115200` baud
- Wi-Fi connection verified
- HTTPS request to the live Netlify site returned HTTP 200
- HTTPS request to `/api/status` returned HTTP 200 and valid JSON
- `POST /api/cleaned-now` from the physical button returned HTTP 200
- Physical LEDs, pushbutton, and piezo buzzer all verified on the breadboard

### Verified GPIO assignments

- Red LED: GPIO 25
- Yellow LED: GPIO 26
- Green LED: GPIO 27
- Piezo buzzer: GPIO 32
- Pushbutton: GPIO 33
- LEDs and buzzer use the breadboard common ground rail

Each LED uses its own current-limiting resistor.

### Device behavior

The ESP32 reads the shared Netlify status and drives the LEDs from `seconds_until_due`.

Current status logic:

- more than 5 hours remaining: **GREEN**
- 0 to 5 hours remaining: **YELLOW**
- due or overdue: **RED / NOW DUE**

The device checks `/api/status`:

- immediately at startup
- once per hour during normal operation
- immediately after a successful physical-button reset

The physical button calls:

`POST /api/cleaned-now`

The request includes the household PIN in the `x-household-pin` header. The device only signals success after the server returns a successful HTTP response.

A successful physical reset:

- records the cleaning in the shared Netlify app
- starts a fresh 36-hour timer
- updates the shared status
- sends the configured household confirmation SMS
- sounds a short piezo confirmation chirp
- refreshes the LEDs immediately

End-to-end physical testing confirmed that a button press resets the shared timer and the returned status shows `last_confirmed_by` as `button`.

### Firmware

Current breadboard firmware:

`firmware/cat_box_reminder_v1/cat_box_reminder_v1.ino`

Firmware secrets are kept outside the committed sketch in:

`secrets.h`

That file is excluded from Git with `.gitignore`.

Use:

`secrets.example.h`

as the template for local configuration.

**Do not commit the real Wi-Fi password or household PIN.**

## Household member and consent flow

The home page links to `/members.html`, which is protected by the household PIN.

1. Enter a household member's name and mobile number.
2. The app creates a unique private opt-in URL and stores the member as **Pending opt-in**.
3. **Text invite** opens the device's own SMS app with the invitation prefilled. **Copy link** copies the private opt-in URL so it can be shared another way. The Cat Box Reminder Twilio number intentionally does not send this invitation because the recipient has not consented yet.
4. The recipient opens the private link at `/sms-consent.html?t=...`, reviews the SMS disclosure, checks the consent box, and submits it.
5. The database records the consent timestamp, disclosure text, source, and user agent, and marks the member active.
6. Only active, consented members receive reminder SMS messages or can reset the timer by replying with a confirmation word.

Adding another user later uses the same process; phone numbers are not hard-coded as a fixed sending list.

## Valid SMS cleaning confirmations

The following words reset the shared timer when sent by an active opted-in household member:

- `DONE`
- `CLEANED`
- `YES`
- `FINISHED`
- `COMPLETE`

## Verified end-to-end

- Twilio inbound SMS reaches the Netlify webhook.
- Cleaning confirmation words reset the shared timer successfully.
- The scheduled reminder function reaches Twilio's Messaging API.
- Earlier trial-account and Toll-Free Verification blockers (`21608` and `30032`) were identified during controlled tests.
- A household-member phone mismatch that triggered trial error `21608` was corrected.
- Toll-Free Verification was approved on 2026-09-01.
- End-to-end outbound testing succeeded on 2026-09-02: all three opted-in household members received the reminder SMS, and a cleaning confirmation was sent afterward.
- Production timing is a 36-hour timer with a 15-minute reminder scheduler.
- True due time and reminder/escalation timing are stored separately.
- Production database migrations for that separation were successfully applied on 2026-09-06.
- ESP32 successfully reads live production status and correctly reports overdue state as `RED` / `NOW DUE`.
- ESP32 red, yellow, and green LED states were individually tested.
- ESP32 physical pushbutton successfully reset the live shared timer through `/api/cleaned-now`.
- Successful physical reset returned HTTP 200, produced a confirmation chirp, refreshed status immediately, and returned `last_confirmed_by: "button"`.
- ESP32 firmware is committed under `firmware/cat_box_reminder_v1/` with secrets excluded from Git.

## Required environment variables

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`
- `HOUSEHOLD_PIN`

Legacy `USER_PHONE`, `WIFE_PHONE`, and `DAUGHTER_PHONE` environment variables may remain configured, but the live reminder recipient list comes from opted-in records in the `household_members` database table.

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

## Current next step

The first stable breadboard firmware is complete and committed.

Next development tasks:

1. Continue real-world testing of hourly status polling.
2. Improve Wi-Fi/API failure handling and automatic recovery.
3. Decide on final buzzer/status tone behavior.
4. Choose the permanent power arrangement.
5. Move the prototype from breadboard toward a permanent enclosure and final wiring.
