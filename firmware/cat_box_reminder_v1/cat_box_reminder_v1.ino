#include "secrets.h"
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>

unsigned long lastStatusCheck = 0;
const unsigned long STATUS_INTERVAL = 60UL * 60UL * 1000UL;  // 1 hour

const int RED_LED = 25;
const int YELLOW_LED = 26;
const int GREEN_LED = 27;
const int BUZZER_PIN = 32;
const int BUTTON_PIN = 33;

const long YELLOW_THRESHOLD = 5 * 60 * 60;

bool lastButtonState = HIGH;


// --------------------------------
// Update LEDs from /api/status
// --------------------------------
void updateStatus() {

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient https;
  https.setTimeout(20000);  // 20 seconds


  if (!https.begin(
        client,
        "https://cat-box-reminder.netlify.app/api/status")) {

    Serial.println("Could not connect to status API");
    return;
  }

  int httpCode = https.GET();

  Serial.print("Status HTTP code: ");
  Serial.println(httpCode);

  if (httpCode == 200) {

    String response = https.getString();

    Serial.println(response);

    String key = "\"seconds_until_due\":";
    int start = response.indexOf(key);

    if (start >= 0) {

      start += key.length();

      int end = response.indexOf("}", start);
      int comma = response.indexOf(",", start);

      if (comma >= 0 && comma < end) {
        end = comma;
      }

      long secondsUntilDue =
        response.substring(start, end).toInt();

      Serial.print("Seconds until due: ");
      Serial.println(secondsUntilDue);


      if (secondsUntilDue <= 0) {

        digitalWrite(RED_LED, HIGH);
        digitalWrite(YELLOW_LED, LOW);
        digitalWrite(GREEN_LED, LOW);

        Serial.println("STATUS: RED");
        Serial.println("NOW DUE");

      } else if (secondsUntilDue <= YELLOW_THRESHOLD) {

        digitalWrite(RED_LED, LOW);
        digitalWrite(YELLOW_LED, HIGH);
        digitalWrite(GREEN_LED, LOW);

        Serial.println("STATUS: YELLOW");

      } else {

        digitalWrite(RED_LED, LOW);
        digitalWrite(YELLOW_LED, LOW);
        digitalWrite(GREEN_LED, HIGH);

        Serial.println("STATUS: GREEN");
      }
    }
  }

  https.end();
}


// --------------------------------
// Tell Netlify the box was cleaned
// --------------------------------
void markCleaned() {

  Serial.println();
  Serial.println("BUTTON PRESSED");
  Serial.println("Sending CLEANED request...");

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient https;

  if (!https.begin(
        client,
        "https://cat-box-reminder.netlify.app/api/cleaned-now")) {

    Serial.println("Could not connect to cleaned-now API");
    return;
  }

  https.addHeader("x-household-pin", householdPin);
  https.addHeader("Content-Type", "application/json");

  int httpCode = https.POST("{}");

  Serial.print("Cleaned HTTP code: ");
  Serial.println(httpCode);

  String response = https.getString();

  Serial.println("Cleaned response:");
  Serial.println(response);

  https.end();


  if (httpCode >= 200 && httpCode < 300) {

    Serial.println("CLEANING CONFIRMED");

    tone(BUZZER_PIN, 900);
    delay(120);

    tone(BUZZER_PIN, 1200);
    delay(100);

    tone(BUZZER_PIN, 700);
    delay(180);

    noTone(BUZZER_PIN);

    delay(1000);

    updateStatus();

  } else {

    Serial.println("CLEANING FAILED");
  }
}


void setup() {

  Serial.begin(115200);

  pinMode(RED_LED, OUTPUT);
  pinMode(YELLOW_LED, OUTPUT);
  pinMode(GREEN_LED, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);

  digitalWrite(RED_LED, LOW);
  digitalWrite(YELLOW_LED, LOW);
  digitalWrite(GREEN_LED, LOW);
  digitalWrite(BUZZER_PIN, LOW);

  WiFi.begin(ssid, password);

  Serial.print("Connecting to Wi-Fi");

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.println("Wi-Fi connected");

  updateStatus();
}


void loop() {

  bool buttonState = digitalRead(BUTTON_PIN);

  // Physical button press
  if (buttonState == LOW && lastButtonState == HIGH) {

    delay(50);

    if (digitalRead(BUTTON_PIN) == LOW) {
      markCleaned();
      lastStatusCheck = millis();
    }
  }

  lastButtonState = buttonState;

  // Automatic status refresh every 60 seconds
  if (millis() - lastStatusCheck >= STATUS_INTERVAL) {

    Serial.println();
    Serial.println("Automatic status check...");

    updateStatus();

    lastStatusCheck = millis();
  }

  delay(20);
}