// ==============================================================================
// LockDoor System - Firmware ESP32
// ==============================================================================
// Este código corre en el microcontrolador ESP32. 
// Funciones principales:
// 1. Manejar el hardware físico: Relé (Cerradura), Teclado 4x4, Pantalla OLED, Sensor IR.
// 2. Levantar un servidor web interno (puerto 80) para que Python pueda enviarle 
//    una orden de "abrir" cuando detecte una cara correcta.
// 3. Comunicarse con el servidor de Python para validar un PIN ingresado en el teclado.
// ==============================================================================

#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>
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
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

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

// --- BUZZER TOGGLE ---
bool buzzerActivo = true;

// --- PYTHON SERVER ---
const String pythonServerIP = "http://YOUR_PYTHON_SERVER_IP:8000";

void setDisplayMessage(String msg) {
  displayMessage = msg;
  messageTimer = millis();
}

void actualizarEstadoOLED() {
  struct tm timeinfo;
  // Añadimos un timeout de 10 milisegundos para que no se congele buscando la hora
  bool timeValid = getLocalTime(&timeinfo, 10);

  char horaActual[10] = "--:--";
  char fechaActual[20] = "--/--/----";
  String saludo = "BIENVENIDO";

  if (timeValid) {
    strftime(horaActual, sizeof(horaActual), "%H:%M", &timeinfo);
    strftime(fechaActual, sizeof(fechaActual), "%d/%m/%Y", &timeinfo);

    int hora = timeinfo.tm_hour;
    if (hora >= 6 && hora < 12) saludo = "BUENOS DIAS";
    else if (hora >= 12 && hora < 19) saludo = "BUENAS TARDES";
    else saludo = "BUENAS NOCHES";
  }

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

// ==============================================================================
// SETUP: Configuración Inicial del Sistema
// ==============================================================================
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
    // Se eliminó logAccess("remote", "Web"); para no duplicar el log de la base de datos
    server.send(200, "text/plain", "Abierto"); 
  });

  server.on("/buzzer", HTTP_GET, []() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    if (server.hasArg("state")) {
      String state = server.arg("state");
      buzzerActivo = (state == "on");
      // Mantenemos apagado el buzzer siempre si lo desactivan
      digitalWrite(buzzerPin, HIGH); 
      server.send(200, "text/plain", buzzerActivo ? "Buzzer ON" : "Buzzer OFF");
    } else {
      server.send(200, "text/plain", buzzerActivo ? "on" : "off");
    }
  });

  server.on("/status", HTTP_GET, []() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    String json = "{\"locked\":" + String(!isUnlocked ? "true" : "false") + ",\"buzzer\":" + String(buzzerActivo ? "true" : "false") + "}";
    server.send(200, "application/json", json);
  });

  server.begin();
}

// ==============================================================================
// LOGICA DE APERTURA
// ==============================================================================
void abrirPuerta() {
  if (!isUnlocked) {
    digitalWrite(relayPin, RELAY_DESBLOQUEADO); 
    digitalWrite(ledPin, HIGH);    
    digitalWrite(redLedPin, LOW);  
    
    // Se eliminó el sonido de apertura a petición del usuario.
    
    unlockTime = millis();
    isUnlocked = true;
    setDisplayMessage("Acceso Concedido");
  }
}

void beepBuzzer(int duration) {
  if (!buzzerActivo) return;
  digitalWrite(buzzerPin, LOW);
  delay(duration);
  digitalWrite(buzzerPin, HIGH);
}

void logAccess(String method, String userName) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(pythonServerIP + "/log_access");
    http.addHeader("Content-Type", "application/json");
    String body = "{\"user_name\":\"" + userName + "\",\"method\":\"" + method + "\",\"granted\":true}";
    http.POST(body);
    http.end();
  }
}

bool verifyPinOnline(String pin) {
  if (WiFi.status() != WL_CONNECTED) return false;
  HTTPClient http;
  http.begin(pythonServerIP + "/verify_pin?pin=" + pin);
  int httpCode = http.GET();
  if (httpCode == 200) {
    String response = http.getString();
    http.end();
    return response.indexOf("\"match\":true") >= 0;
  }
  http.end();
  return false;
}

// ==============================================================================
// CICLO PRINCIPAL (LOOP)
// ==============================================================================
void loop() {
  // 1. Atender peticiones HTTP entrantes (ej. Python mandando /unlock)
  server.handleClient(); 

  // 2. Lógica del Teclado Matricial
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
        // Try online verification first, fallback to local
        bool accessGranted = false;
        String userName = "PIN-User";
        
        // Check against Python/MySQL server
        if (WiFi.status() == WL_CONNECTED) {
          HTTPClient http;
          http.begin(pythonServerIP + "/verify_pin?pin=" + inputBuffer);
          int httpCode = http.GET();
          if (httpCode == 200) {
            String response = http.getString();
            if (response.indexOf("\"match\":true") >= 0) {
              // Extract user name from response
              int nameStart = response.indexOf("\"name\":\"") + 8;
              int nameEnd = response.indexOf("\"", nameStart);
              if (nameStart > 7 && nameEnd > nameStart) {
                userName = response.substring(nameStart, nameEnd);
              }
              accessGranted = true;
            }
          }
          http.end();
        }
        
        // Fallback to local password
        if (!accessGranted && inputBuffer == currentPassword) {
          accessGranted = true;
          userName = "Local";
        }
        
        if (accessGranted) {
          abrirPuerta();
          logAccess("pin", userName);
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
  
  // Physical door alarm logic (INVERTED: LOW = door open = alarm)
  if (digitalRead(irSensorPin) == LOW && !isUnlocked) {
    if (buzzerActivo) digitalWrite(buzzerPin, LOW);  // alarm ON
  } else if (digitalRead(irSensorPin) == HIGH && !isUnlocked) {
    digitalWrite(buzzerPin, HIGH); // alarm OFF
  }
  
  // Manual button
  if (digitalRead(buttonPin) == LOW && !isUnlocked) {
    abrirPuerta();
    logAccess("button", "Fisico");
    delay(200); 
  }
  
  // Auto-lock timer
  if (isUnlocked && (millis() - unlockTime >= unlockDuration)) {
    digitalWrite(relayPin, RELAY_BLOQUEADO); 
    digitalWrite(ledPin, LOW);               
    digitalWrite(redLedPin, HIGH);
    digitalWrite(buzzerPin, HIGH); // Ensure buzzer is OFF before re-locking
    isUnlocked = false;
    delay(500); // Debounce: let relay and IR sensor stabilize
  }
}