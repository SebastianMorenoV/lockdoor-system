# ==============================================================================
# LockDoor System - Backend (FastAPI)
# ==============================================================================
# Este script levanta un servidor web en el puerto 8000.
# Se encarga de:
# 1. Recibir fotos de la cámara web (desde React) y compararlas con las caras conocidas.
# 2. Conectarse a MySQL para validar PINs ingresados en el teclado del ESP32.
# 3. Guardar registros (logs) de quién entró y a qué hora.
# ==============================================================================

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import cv2
import numpy as np  
import base64
import os
import sys
import requests # Usado para enviar señales HTTP al ESP32
import mysql.connector # Conexión a la base de datos
from datetime import datetime
from typing import Optional

# --- TRUCO PARA PYTHON 3.14 ---
# Forzamos a Python a encontrar los modelos antes de importar face_recognition
venv_path = os.path.join(os.getcwd(), "venv", "Lib", "site-packages")
models_path = os.path.join(venv_path, "face_recognition_models", "models")

# Añadimos la ruta al sistema para que la librería la vea
sys.path.append(models_path)
os.environ['FACE_RECOGNITION_MODELS_PATH'] = models_path

# Importamos la librería DESPUÉS de agregar la ruta para que la encuentre
# (Los comentarios "type: ignore" y "noqa" evitan que el IDE marque un falso error)
import face_recognition # type: ignore # noqa: E402
print("¡Logramos burlar al sistema! face_recognition cargado.")
# ------------------------------

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("authorized_faces", exist_ok=True)

# --- MYSQL CONNECTION ---
DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": "YOUR_MYSQL_PASSWORD", # Cambia esto por tu contraseña de MySQL
    "database": "lockdoor_db"
}

def get_db():
    """Get a fresh MySQL connection"""
    return mysql.connector.connect(**DB_CONFIG)


ESP32_IP = "http://YOUR_ESP32_IP" # Cambia esto por la IP del ESP32

# ==============================================================================
# SISTEMA DE MEMORIA (ROSTROS)
# ==============================================================================
# Aquí guardaremos los vectores matemáticos de los rostros conocidos
# para no tener que calcularlos cada vez que alguien intenta abrir.
known_face_encodings = []
known_face_names = []

def load_authorized_faces():
    """Esta función lee la carpeta y memoriza los rostros"""
    global known_face_encodings, known_face_names
    known_face_encodings.clear()
    known_face_names.clear()
    
    print("Cargando rostros autorizados...")
    for filename in os.listdir("authorized_faces"):
        if filename.endswith(".jpg") or filename.endswith(".png"):
            path = os.path.join("authorized_faces", filename)
            # Cargar la imagen y extraer los 128 puntos faciales
            image = face_recognition.load_image_file(path)
            encodings = face_recognition.face_encodings(image)
            
            if len(encodings) > 0:
                known_face_encodings.append(encodings[0])
                # Guardar el nombre quitando el ".jpg"
                known_face_names.append(os.path.splitext(filename)[0])
    print(f"¡Se cargaron {len(known_face_names)} rostros autorizados!")

# Cargar las caras al encender el servidor
load_authorized_faces()

# --- MODELOS DE DATOS ---
class FaceRegistration(BaseModel):
    name: str
    image: str
    pin: Optional[str] = None

class FaceVerification(BaseModel):
    image: str

class AccessLog(BaseModel):
    user_name: str
    method: str
    granted: bool = True

class UserRegistration(BaseModel):
    name: str
    pin: str

# ==============================================================================
# RUTAS DE LA API (ENDPOINTS)
# ==============================================================================

@app.post("/register")
async def register_face(data: FaceRegistration):
    """
    Recibe una foto desde React y la guarda en la carpeta 'authorized_faces'.
    Luego inserta al usuario en la base de datos.
    """
    try:
        encoded_data = data.image.split(',')[1] if ',' in data.image else data.image
        img_bytes = base64.b64decode(encoded_data)
        np_arr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        
        file_path = f"authorized_faces/{data.name}.jpg"
        cv2.imwrite(file_path, img)
        
        # Volver a cargar la memoria para que reconozca a la nueva persona inmediatamente
        load_authorized_faces() 
        
        # Save to MySQL database
        try:
            db = get_db()
            cursor = db.cursor()
            cursor.execute(
                "INSERT INTO users (name, pin, face_registered) VALUES (%s, %s, TRUE) "
                "ON DUPLICATE KEY UPDATE face_registered = TRUE, pin = COALESCE(%s, pin)",
                (data.name, data.pin, data.pin)
            )
            db.commit()
            cursor.close()
            db.close()
        except Exception as db_err:
            print(f"DB Error on register: {db_err}")
        
        return {"status": "success", "message": f"{data.name} guardado"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/verify")
def verify_face(data: FaceVerification):
    """
    Compara la foto recibida desde la cámara web (React) contra todas 
    las caras que tenemos en memoria. Si hay coincidencia, le avisa al ESP32 que abra.
    """
    try:
        encoded_data = data.image.split(',')[1] if ',' in data.image else data.image
        img_bytes = base64.b64decode(encoded_data)
        np_arr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        
        rgb_img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        unknown_encodings = face_recognition.face_encodings(rgb_img)
        
        if len(unknown_encodings) == 0:
            return {"status": "error", "message": "No se detectó ningún rostro. Acércate más a la cámara."}
            
        unknown_encoding = unknown_encodings[0]
        matches = face_recognition.compare_faces(known_face_encodings, unknown_encoding, tolerance=0.5)
        
        name = "Desconocido"
        match_found = False
        
        if True in matches:
            first_match_index = matches.index(True)
            name = known_face_names[first_match_index]
            match_found = True
            
            # Log access to MySQL
            try:
                db = get_db()
                cursor = db.cursor()
                cursor.execute(
                    "INSERT INTO access_logs (user_name, method, granted) VALUES (%s, %s, %s)",
                    (name, "face", True)
                )
                db.commit()
                cursor.close()
                db.close()
            except Exception as db_err:
                print(f"DB Error on verify log: {db_err}")
            
            # --- HARDWARE COMMUNICATION BLOCK ---
            hardware_reached = False
            try:
                esp32_url = f"{ESP32_IP}/unlock" 
                print(f">>> Enviando unlock a: {esp32_url}")
                hw_response = requests.get(esp32_url, timeout=5)
                print(f">>> ESP32 respondió: {hw_response.status_code} - {hw_response.text}")
                hardware_reached = (hw_response.status_code == 200)
            except requests.exceptions.RequestException as e:
                print(f">>> ERROR HARDWARE: No se pudo conectar al ESP32 en {ESP32_IP}. Error: {e}")
            # -----------------------------------------
        else:
            # Log failed attempt
            try:
                db = get_db()
                cursor = db.cursor()
                cursor.execute(
                    "INSERT INTO access_logs (user_name, method, granted) VALUES (%s, %s, %s)",
                    ("Desconocido", "face", False)
                )
                db.commit()
                cursor.close()
                db.close()
            except Exception as db_err:
                print(f"DB Error on failed verify log: {db_err}")
            
        return {"status": "success", "match": match_found, "name": name, "hardware_reached": hardware_reached if match_found else False}
        
    except Exception as e:
        return {"status": "error", "message": str(e)}

# --- NUEVAS RUTAS PARA MYSQL Y ESP32 ---

@app.get("/verify_pin")
async def verify_pin(pin: str):
    """ESP32 calls this to check if a PIN exists in the database"""
    try:
        db = get_db()
        cursor = db.cursor(dictionary=True)
        cursor.execute("SELECT name FROM users WHERE pin = %s", (pin,))
        user = cursor.fetchone()
        cursor.close()
        db.close()
        
        if user:
            return {"status": "success", "match": True, "name": user["name"]}
        else:
            return {"status": "success", "match": False, "name": ""}
    except Exception as e:
        return {"status": "error", "match": False, "name": "", "message": str(e)}

@app.post("/log_access")
async def log_access(data: AccessLog):
    """Log a door access event from ESP32 or frontend"""
    try:
        db = get_db()
        cursor = db.cursor()
        cursor.execute(
            "INSERT INTO access_logs (user_name, method, granted) VALUES (%s, %s, %s)",
            (data.user_name, data.method, data.granted)
        )
        db.commit()
        cursor.close()
        db.close()
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/logs")
async def get_logs(limit: int = 50):
    """Get recent access logs for the frontend dashboard"""
    try:
        db = get_db()
        cursor = db.cursor(dictionary=True)
        cursor.execute(
            "SELECT id, user_name, method, granted, timestamp FROM access_logs ORDER BY timestamp DESC LIMIT %s",
            (limit,)
        )
        logs = cursor.fetchall()
        cursor.close()
        db.close()
        
        # Convert datetime to string for JSON serialization
        for log in logs:
            log["timestamp"] = log["timestamp"].strftime("%Y-%m-%d %H:%M:%S")
        
        return {"status": "success", "logs": logs}
    except Exception as e:
        return {"status": "error", "logs": [], "message": str(e)}

@app.post("/register_user")
async def register_user(data: UserRegistration):
    """Register a user with a PIN (no face) from the admin panel"""
    try:
        db = get_db()
        cursor = db.cursor()
        cursor.execute(
            "INSERT INTO users (name, pin) VALUES (%s, %s) "
            "ON DUPLICATE KEY UPDATE pin = %s",
            (data.name, data.pin, data.pin)
        )
        db.commit()
        cursor.close()
        db.close()
        return {"status": "success", "message": f"Usuario {data.name} registrado con PIN"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/users")
async def get_users():
    """Get all registered users for the admin panel"""
    try:
        db = get_db()
        cursor = db.cursor(dictionary=True)
        cursor.execute("SELECT id, name, pin, face_registered, created_at FROM users ORDER BY created_at DESC")
        users = cursor.fetchall()
        cursor.close()
        db.close()
        
        for user in users:
            user["created_at"] = user["created_at"].strftime("%Y-%m-%d %H:%M:%S")
        
        return {"status": "success", "users": users}
    except Exception as e:
        return {"status": "error", "users": [], "message": str(e)}

@app.delete("/users/{user_id}")
async def delete_user(user_id: int):
    """Delete a user by ID"""
    try:
        db = get_db()
        cursor = db.cursor(dictionary=True)
        # Get user name to delete face file
        cursor.execute("SELECT name FROM users WHERE id = %s", (user_id,))
        user = cursor.fetchone()
        if user:
            # Delete face image if exists
            face_path = f"authorized_faces/{user['name']}.jpg"
            if os.path.exists(face_path):
                os.remove(face_path)
            cursor.execute("DELETE FROM users WHERE id = %s", (user_id,))
            db.commit()
            load_authorized_faces()  # Reload faces
        cursor.close()
        db.close()
        return {"status": "success", "message": "Usuario eliminado"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/buzzer_toggle")
def buzzer_toggle(state: str):
    """Proxy to toggle the ESP32 buzzer from the frontend"""
    try:
        response = requests.get(f"{ESP32_IP}/buzzer?state={state}", timeout=2)
        return {"status": "success", "message": response.text}
    except requests.exceptions.RequestException as e:
        return {"status": "error", "message": f"No se pudo conectar al ESP32: {str(e)}"}

@app.get("/esp32_status")
def esp32_status():
    """Get ESP32 status (buzzer state, lock state)"""
    try:
        response = requests.get(f"{ESP32_IP}/status", timeout=2)
        return response.json()
    except:
        return {"locked": True, "buzzer": True, "offline": True}