#include <WiFi.h>
#include <WebServer.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include "time.h"
#include <Keypad.h>
#include <Preferences.h>

// --- OLED CONFIGURATION ---
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

// --- CREDENTIALS ---
const char* ssid = "iPhone de Sebastian";
const char* password = "morita12";

// --- TIME CONFIGURATION (NTP) ---
const char* ntpServer = "pool.ntp.org";
const long  gmtOffset_sec = -25200; // GMT-7 (Sonora)
const int   daylightOffset_sec = 0; // No daylight saving

WebServer server(80);

// --- PINS ---
const int relayPin = 4;   
const int buttonPin = 14; 
const int ledPin = 2;     // Green LED
const int redLedPin = 13; // Red LED
const int buzzerPin = 15; // Active Buzzer (Active Low)
const int irSensorPin = 27; // IR Proximity Sensor

// --- KEYPAD CONFIGURATION ---
#define ROW_NUM     4 
#define COLUMN_NUM  4 

char keys[ROW_NUM][COLUMN_NUM] = {
  {'1','2','3','A'},
  {'4','5','6','B'},
  {'7','8','9','C'},
  {'*','0','#','D'}
};

byte pin_rows[ROW_NUM] = {32, 33, 25, 26}; 
byte pin_column[COLUMN_NUM] = {23, 19, 18, 5}; 

Keypad keypad = Keypad(makeKeymap(keys), pin_rows, pin_column, ROW_NUM, COLUMN_NUM);

// --- LOCK LOGIC & PREFERENCES ---
Preferences preferences;
String currentPassword = "";
String inputBuffer = "";
enum KeypadMode { NORMAL, ENTER_OLD_PW, ENTER_NEW_PW };
KeypadMode currentMode = NORMAL;

String displayMessage = "";
unsigned long messageTimer = 0;

const int RELAY_BLOQUEADO = LOW;       
const int RELAY_DESBLOQUEADO = HIGH;   

unsigned long unlockTime = 0;
bool isUnlocked = false;
const unsigned long unlockDuration = 5000; // 5 seconds open
unsigned long lastDisplayUpdate = 0;

void setDisplayMessage(String msg) {
  displayMessage = msg;
  messageTimer = millis();
}

void actualizarEstadoOLED() {
  struct tm timeinfo;
  if(!getLocalTime(&timeinfo)){
    return;
  }

  char horaActual[10];
  strftime(horaActual, sizeof(horaActual), "%H:%M", &timeinfo);
  char fechaActual[20];
  strftime(fechaActual, sizeof(fechaActual), "%d/%m/%Y", &timeinfo);

  int hora = timeinfo.tm_hour;
  String saludo;
  if (hora >= 6 && hora < 12) saludo = "BUENOS DIAS";
  else if (hora >= 12 && hora < 19) saludo = "BUENAS TARDES";
  else saludo = "BUENAS NOCHES";

  bool isPhysicallyOpen = (digitalRead(irSensorPin) == HIGH);

  display.clearDisplay();
  display.setTextColor(WHITE);
  
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println(saludo);

  display.setTextSize(2);
  display.setCursor(0, 15);
  
  if (isPhysicallyOpen) {
    display.println("ABIERTA!!"); 
  } else if (isUnlocked) {
    display.println("DESBLOQUEA"); 
  } else {
    display.println("CERRADO");    
  }

  // Keypad Feedback Messages
  display.setTextSize(1);
  display.setCursor(0, 35);
  if (displayMessage != "") {
    display.println(displayMessage);
    if (millis() - messageTimer > 3000) displayMessage = ""; // Clear after 3s
  } else if (inputBuffer.length() > 0) {
    String asterisks = "";
    for(int i=0; i<inputBuffer.length(); i++) asterisks += "*";
    display.println("Pw: " + asterisks);
  } else {
    display.println(horaActual);
  }

  display.setCursor(0, 55);
  display.print(fechaActual);
  display.print(" | ");
  display.print(WiFi.localIP().toString().substring(WiFi.localIP().toString().lastIndexOf('.') + 1)); 
  
  display.display();
}

void setup() {
  Serial.begin(115200);
  
  // Load saved password from flash memory (default is 1234)
  preferences.begin("doorlock", false);
  currentPassword = preferences.getString("password", "1234");
  
  pinMode(buttonPin, INPUT_PULLUP);
  pinMode(irSensorPin, INPUT); 
  
  pinMode(ledPin, OUTPUT);
  pinMode(redLedPin, OUTPUT);
  pinMode(buzzerPin, OUTPUT);
  
  digitalWrite(ledPin, LOW); 
  digitalWrite(redLedPin, HIGH);
  digitalWrite(buzzerPin, HIGH); 
  digitalWrite(relayPin, RELAY_BLOQUEADO); 
  pinMode(relayPin, OUTPUT);

  if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println(F("SSD1306 failed"));
    for(;;);
  }
  
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(WHITE);
  display.setCursor(0, 10);
  display.println("Iniciando...");
  display.display();

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
  }

  configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);

  server.on("/unlock", HTTP_GET, []() {
    abrirPuerta();
    server.send(200, "text/plain", "Abierto"); 
  });

  server.begin();
}

void abrirPuerta() {
  if (!isUnlocked) {
    digitalWrite(relayPin, RELAY_DESBLOQUEADO); 
    digitalWrite(ledPin, HIGH);    
    digitalWrite(redLedPin, LOW);  
    
    digitalWrite(buzzerPin, LOW);  
    delay(1000); 
    digitalWrite(buzzerPin, HIGH); 
    
    unlockTime = millis();
    isUnlocked = true;
    setDisplayMessage("Acceso Concedido");
  }
}

void beepBuzzer(int duration) {
  digitalWrite(buzzerPin, LOW);
  delay(duration);
  digitalWrite(buzzerPin, HIGH);
}

void loop() {
  server.handleClient(); 

  // Keypad Logic
  char key = keypad.getKey();
  if (key) {
    beepBuzzer(50); // Feedback beep
    
    if (key == '*') {
      inputBuffer = "";
      currentMode = NORMAL;
      setDisplayMessage("Cancelado");
    } 
    else if (key == 'A') {
      inputBuffer = "";
      currentMode = ENTER_OLD_PW;
      setDisplayMessage("Cambiar Pw: Viejo?");
    } 
    else if (key == '#') {
      if (currentMode == NORMAL) {
        if (inputBuffer == currentPassword) {
          abrirPuerta();
        } else {
          setDisplayMessage("Error: Pw Falsa");
          beepBuzzer(500); // Long beep for error
        }
        inputBuffer = "";
      } 
      else if (currentMode == ENTER_OLD_PW) {
        if (inputBuffer == currentPassword) {
          currentMode = ENTER_NEW_PW;
          setDisplayMessage("Nuevo Pw?");
        } else {
          currentMode = NORMAL;
          setDisplayMessage("Error: Pw Falsa");
        }
        inputBuffer = "";
      } 
      else if (currentMode == ENTER_NEW_PW) {
        if (inputBuffer.length() > 0) {
          currentPassword = inputBuffer;
          preferences.putString("password", currentPassword);
          currentMode = NORMAL;
          setDisplayMessage("Pw Guardada!");
        }
        inputBuffer = "";
      }
    } 
    else {
      // Append number/letter to buffer
      inputBuffer += key;
    }
    
    actualizarEstadoOLED(); // Instantly update OLED to show asterisks
  }

  // Update screen every second
  if (millis() - lastDisplayUpdate >= 1000) {
    actualizarEstadoOLED();
    lastDisplayUpdate = millis();
  }
  
  // Physical door alarm logic
  if (digitalRead(irSensorPin) == HIGH && !isUnlocked) {
    digitalWrite(buzzerPin, LOW);  
  } else if (digitalRead(irSensorPin) == LOW && !isUnlocked) {
    digitalWrite(buzzerPin, HIGH); 
  }
  
  // Manual button
  if (digitalRead(buttonPin) == LOW && !isUnlocked) {
    abrirPuerta();
    delay(200); 
  }
  
  // Auto-lock timer
  if (isUnlocked && (millis() - unlockTime >= unlockDuration)) {
    digitalWrite(relayPin, RELAY_BLOQUEADO); 
    digitalWrite(ledPin, LOW);               
    digitalWrite(redLedPin, HIGH);              
    isUnlocked = false;          
  }
}