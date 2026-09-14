#include "secrets.h"
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <WebServer.h>

unsigned long lastStatusCheck = 0;
const unsigned long STATUS_INTERVAL = 60UL * 60UL * 1000UL;  // 1 hour

const int RED_LED = 25;
const int YELLOW_LED = 26;
const int GREEN_LED = 27;
const int BUZZER_PIN = 32;
const int BUTTON_PIN = 33;

WebServer server(80);

String currentStatus = "UNKNOWN";
int lastStatusHttpCode = 0;
long lastSecondsUntilDue = 0;
unsigned long lastSuccessfulStatusCheck = 0;
String lastButtonResult = "NONE";

const long YELLOW_THRESHOLD = 12 * 60 * 60;  // 12 hours remaining = 36-hour nudge point

bool lastButtonState = HIGH;

// --------------------------------
// Update LEDs from /api/status
// --------------------------------
void updateStatus() {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient https;
  https.setTimeout(20000);

  if (!https.begin(client, "https://cat-box-reminder.netlify.app/api/status")) {
    Serial.println("Could not connect to status API");
    lastStatusHttpCode = -1;
    currentStatus = "API ERROR";
    return;
  }

  int httpCode = https.GET();
  lastStatusHttpCode = httpCode;
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
      if (comma >= 0 && comma < end) end = comma;

      long secondsUntilDue = response.substring(start, end).toInt();
      lastSecondsUntilDue = secondsUntilDue;
      lastSuccessfulStatusCheck = millis();
      Serial.print("Seconds until due: ");
      Serial.println(secondsUntilDue);

      if (secondsUntilDue <= 0) {
        digitalWrite(RED_LED, HIGH);
        digitalWrite(YELLOW_LED, LOW);
        digitalWrite(GREEN_LED, LOW);
        currentStatus = "RED - NOW DUE";
        Serial.println("STATUS: RED");
        Serial.println("NOW DUE");
      } else if (secondsUntilDue <= YELLOW_THRESHOLD) {
        digitalWrite(RED_LED, LOW);
        digitalWrite(YELLOW_LED, HIGH);
        digitalWrite(GREEN_LED, LOW);
        currentStatus = "YELLOW";
        Serial.println("STATUS: YELLOW");
      } else {
        digitalWrite(RED_LED, LOW);
        digitalWrite(YELLOW_LED, LOW);
        digitalWrite(GREEN_LED, HIGH);
        currentStatus = "GREEN";
        Serial.println("STATUS: GREEN");
      }
    } else {
      currentStatus = "PARSE ERROR";
      Serial.println("Could not find seconds_until_due");
    }
  } else {
    currentStatus = "API ERROR";
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
  lastButtonResult = "SENDING";

  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient https;
  https.setTimeout(20000);

  if (!https.begin(client, "https://cat-box-reminder.netlify.app/api/cleaned-now")) {
    Serial.println("Could not connect to cleaned-now API");
    lastButtonResult = "CONNECTION FAILED";
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
    lastButtonResult = "SUCCESS";
    tone(BUZZER_PIN, 900); delay(120);
    tone(BUZZER_PIN, 1200); delay(100);
    tone(BUZZER_PIN, 700); delay(180);
    noTone(BUZZER_PIN);
    delay(1000);
    updateStatus();
  } else {
    Serial.println("CLEANING FAILED");
    lastButtonResult = "FAILED HTTP " + String(httpCode);
  }
}

// --------------------------------
// Local diagnostics web page
// --------------------------------
void handleDiagnostics() {
  String page;
  page += "<!DOCTYPE html>";
  page += "<html><head>";
  page += "<meta name='viewport' content='width=device-width, initial-scale=1'>";
  page += "<meta http-equiv='refresh' content='10'>";
  page += "<title>Right Meow Status</title>";
  page += "</head><body>";
  page += "<h1>Right Meow Cat Box Reminder</h1>";
  page += "<p><strong>Wi-Fi:</strong> ";
  page += (WiFi.status() == WL_CONNECTED ? "CONNECTED" : "DISCONNECTED");
  page += "</p>";
  page += "<p><strong>IP address:</strong> ";
  page += WiFi.localIP().toString();
  page += "</p>";
  page += "<p><strong>Status:</strong> ";
  page += currentStatus;
  page += "</p>";
  page += "<p><strong>Last HTTP code:</strong> ";
  page += String(lastStatusHttpCode);
  page += "</p>";
  page += "<p><strong>Seconds until due:</strong> ";
  page += String(lastSecondsUntilDue);
  page += "</p>";
  page += "<p><strong>Hours until due:</strong> ";
  page += String(lastSecondsUntilDue / 3600.0, 1);
  page += "</p>";
  page += "<p><strong>Last button result:</strong> ";
  page += lastButtonResult;
  page += "</p>";
  page += "<p><strong>Last successful status check:</strong> ";
  page += String(lastSuccessfulStatusCheck / 1000);
  page += " seconds after boot</p>";
  page += "<p><strong>Uptime:</strong> ";
  page += String(millis() / 1000);
  page += " seconds</p>";
  page += "</body></html>";
  server.send(200, "text/html", page);
}

// --------------------------------
// Setup
// --------------------------------
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
  server.on("/", handleDiagnostics);
  server.begin();
  Serial.print("Diagnostics page: http://");
  Serial.println(WiFi.localIP());
  updateStatus();
  lastStatusCheck = millis();
}

// --------------------------------
// Main loop
// --------------------------------
void loop() {
  server.handleClient();
  bool buttonState = digitalRead(BUTTON_PIN);

  if (buttonState == LOW && lastButtonState == HIGH) {
    delay(50);
    if (digitalRead(BUTTON_PIN) == LOW) {
      markCleaned();
      lastStatusCheck = millis();
    }
  }
  lastButtonState = buttonState;

  if (millis() - lastStatusCheck >= STATUS_INTERVAL) {
    Serial.println();
    Serial.println("Automatic status check...");
    updateStatus();
    lastStatusCheck = millis();
  }
  delay(1);
}
