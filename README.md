# Cat Box Reminder

A Netlify + Twilio household reminder system with one shared cat-box timer, SMS notifications, a small web app, and an ESP32-based physical reminder device.

The shared timer is reset whenever someone presses **Cat Box Cleaned Now** in the web app, an opted-in household member replies with a valid confirmation word, or the ESP32 hardware button calls the same reset endpoint.

## Current behavior

- Cleaning starts a shared **48-hour due timer**.
- At **36 hours after cleaning**, the system sends a one-time advance nudge SMS to all active opted-in household members.
- The cat box becomes actually **due at 48 hours** after cleaning.
- A scheduled Netlify Function checks reminder state every 15 minutes.
- Reminder SMS messages are sent only to household members whose consent has been recorded in the database and whose status is active.
- Reminder sending is limited to 8:00 AM through 8:45 PM America/Los_Angeles time. Nothing is sent from 9:00 PM through 7:59 AM.
- If the 36-hour nudge or 48-hour deadline occurs during quiet hours, SMS sending is deferred until the next allowed reminder time. Quiet hours do not move the true 48-hour due date.
- Once due, if nobody confirms cleaning after the first reminder, the escalation schedule is 5:00 PM, 6:00 PM, 7:00 PM, 8:00 PM, 8:15 PM, 8:30 PM, and 8:45 PM, followed by 8:00 AM the next morning and another evening cycle if still unconfirmed.
- Any valid cleaning confirmation from an active household member records the cleaning, stops escalation, clears the reminder schedule, and starts a fresh shared 48-hour timer.
- Pressing **Cat Box Cleaned Now** sends each active opted-in household member a confirmation text showing the next true due time in Pacific time.
- Texting a valid cleaning confirmation word also sends that same confirmation text to each active opted-in household member.
- Replying `STOP` deactivates that household member in the app. `HELP` remains available through Twilio's messaging flow.
- The **Cat Box Cleaned Now** web button is protected by `HOUSEHOLD_PIN`.
- Twilio webhook signatures are validated against the public inbound webhook URL.
- If an outbound reminder attempt fails for a normal transient reason, the app backs off for one hour. Twilio error `63038` triggers a 24-hour backoff.

## Due time vs. reminder time

The system deliberately keeps the true cleaning deadline separate from reminder scheduling.

- `next_due_at` = the actual **48-hour deadline** after the last cleaning.
- `next_reminder_at` = the next time the reminder system should attempt an SMS escalation.
- `last_cleaned_at` = the most recent confirmed cleaning time.
- `last_reminder_at` = the most recent reminder-send time.
- `waiting_for_reply` = reminder workflow state.

The 36-hour advance nudge is an early opportunity to clean the box; it does **not** mean the box is overdue. The true due point remains 48 hours after the last cleaning.

Quiet hours must never move the actual due date. If the 48-hour timer expires during quiet hours, the box is already overdue even though the next permitted SMS may not be sent until 8:00 AM.

Database migrations `004_separate_due_and_reminder` and `005_restore_true_due_time` originally introduced separation between the due deadline and reminder scheduling.

## Status API

The ESP32 and web app use:

`GET /api/status`

The response includes the stored state plus server-derived status fields, including `is_due` and `seconds_until_due`.

The web UI shows **NOW DUE** after the true deadline instead of displaying a future reminder/escalation time as though it were the due date.

## Cleaning/reset endpoint

The web button and ESP32 hardware button use:

`POST /api/cleaned-now`

If `HOUSEHOLD_PIN` is configured, send it in the `x-household-pin` request header.

A successful reset:

- records `last_cleaned_at`
- sets `next_due_at` to **48 hours later**
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

Current status logic for the 48-hour cycle:

- **More than 12 hours remaining:** GREEN
- **0 to 12 hours remaining:** YELLOW — corresponds to the 36-to-48-hour portion of the cleaning cycle
- **Due or overdue:** RED / NOW DUE

The device checks `/api/status` immediately at startup, once per hour during normal operation, and immediately after a successful physical-button reset.

The physical button calls `POST /api/cleaned-now` with the household PIN in the `x-household-pin` header. The device only signals success after the server returns a successful HTTP response.

A successful physical reset records the cleaning in the shared Netlify app, starts a fresh **48-hour timer**, updates shared status, sends the configured household confirmation SMS, sounds a short piezo confirmation chirp, and refreshes the LEDs immediately.

### Firmware

Current firmware:

`firmware/cat_box_reminder_v1/cat_box_reminder_v1.ino`

The current firmware uses:

`YELLOW_THRESHOLD = 12 * 60 * 60`

so the yellow LED begins when 12 hours remain before the 48-hour due point.

Firmware secrets are kept outside the committed sketch in `secrets.h`. That file is excluded from Git with `.gitignore`. Use `secrets.example.h` as the template for local configuration.

**Do not commit the real Wi-Fi password or household PIN.**

## Household member and consent flow

The home page links to `/members.html`, which is protected by the household PIN.

1. Enter a household member's name and mobile number.
2. The app creates a unique private opt-in URL and stores the member as **Pending opt-in**.
3. **Text invite** opens the device's own SMS app with the invitation prefilled. **Copy link** copies the private opt-in URL so it can be shared another way.
4. The recipient opens the private link at `/sms-consent.html?t=...`, reviews the SMS disclosure, checks the consent box, and submits it.
5. The database records the consent timestamp, disclosure text, source, and user agent, and marks the member active.
6. Only active, consented members receive reminder SMS messages or can reset the timer by replying with a confirmation word.

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
- Toll-Free Verification was approved on 2026-09-01.
- End-to-end outbound testing succeeded on 2026-09-02 with all three opted-in household members.
- True due time and reminder/escalation timing are stored separately.
- ESP32 successfully reads live production status.
- ESP32 red, yellow, and green LED states were individually tested.
- ESP32 physical pushbutton successfully resets the live shared timer through `/api/cleaned-now`.
- ESP32 firmware is committed under `firmware/cat_box_reminder_v1/` with secrets excluded from Git.
- Current production timing is **36-hour advance nudge / 48-hour true due time**.
- Current ESP32 LED timing is **green until 12 hours remain, yellow for the final 12 hours, and red when due/overdue**.

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

Continue real-world testing of the new **36-hour nudge / 48-hour due** cycle and verify that SMS timing and ESP32 LED transitions remain synchronized.
