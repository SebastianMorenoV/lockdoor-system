from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import cv2
import numpy as np  
import base64
import os
import face_recognition # <-- ¡La librería mágica!
import os
import sys
import requests # <-- NEW: Import this at the top of your file

# --- TRUCO PARA PYTHON 3.14 ---
# Forzamos a Python a encontrar los modelos antes de importar face_recognition
venv_path = os.path.join(os.getcwd(), "venv", "Lib", "site-packages")
models_path = os.path.join(venv_path, "face_recognition_models", "models")

# Añadimos la ruta al sistema para que la librería la vea
sys.path.append(models_path)
os.environ['FACE_RECOGNITION_MODELS_PATH'] = models_path

try:
    import face_recognition
    print("¡Logramos burlar al sistema! face_recognition cargado.")
except ImportError:
    print("Aún no lo ve, pero vamos a intentar inicializarlo manualmente...")
# ------------------------------

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("authorized_faces", exist_ok=True)

# --- MEMORIA DEL SISTEMA ---
# Aquí guardaremos las "matemáticas" de las caras autorizadas
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

class FaceVerification(BaseModel):
    image: str

# --- RUTAS ---

@app.post("/register")
async def register_face(data: FaceRegistration):
    try:
        encoded_data = data.image.split(',')[1] if ',' in data.image else data.image
        img_bytes = base64.b64decode(encoded_data)
        np_arr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        
        file_path = f"authorized_faces/{data.name}.jpg"
        cv2.imwrite(file_path, img)
        
        # Volver a cargar la memoria para que reconozca a la nueva persona inmediatamente
        load_authorized_faces() 
        
        return {"status": "success", "message": f"{data.name} guardado"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/verify")
async def verify_face(data: FaceVerification):
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
            
            # --- NEW: HARDWARE COMMUNICATION BLOCK ---
            try:
                # Replace this string with the actual IP address from your Arduino Serial Monitor!
                esp32_ip = "http://172.20.10.2/unlock" 
                
                # Send the request to the ESP32 (timeout prevents Python from freezing if ESP is off)
                response = requests.get(esp32_ip, timeout=2)
                print(f"Success: Sent unlock signal for {name} to hardware.")
            except requests.exceptions.RequestException as e:
                print(f"Hardware Error: Could not reach ESP32. Is it powered on? Error: {e}")
            # -----------------------------------------
            
        return {"status": "success", "match": match_found, "name": name}
        
    except Exception as e:
        return {"status": "error", "message": str(e)}