@echo off
echo ========================================================
echo       LockDoor System - Instalacion Automatizada
echo ========================================================
echo.
echo Este script configurara los entornos de Python y Node.js.
echo Asegurate de tener instalados: Python, Node.js y MySQL.
echo.
pause

echo.
echo [1/3] Configurando Backend (Python FastAPI)...
cd face-api
if not exist venv (
    echo Creando entorno virtual...
    python -m venv venv
)
echo Instalando dependencias de Python...
call venv\Scripts\activate
pip install "setuptools<70"
pip install fastapi uvicorn face_recognition opencv-python numpy mysql-connector-python requests
cd ..

echo.
echo [2/3] Configurando Frontend (React Vite)...
cd face-recognition-door
echo Instalando dependencias de Node.js...
call npm install
cd ..

echo.
echo ========================================================
echo                INSTALACION COMPLETADA
echo ========================================================
echo.
echo PASOS FALTANTES QUE DEBES HACER MANUALMENTE:
echo 1. Base de Datos: Abre MySQL y ejecuta "source database/init.sql;"
echo 2. Configura Passwords: Edita "face-api/main.py" y pon tu password de MySQL.
echo 3. Configura ESP32: Abre "smart_lock/smart_lock.ino", pon tu WiFi, y subelo.
echo.
echo Para correr el servidor Python: cd face-api ^& venv\Scripts\activate ^& uvicorn main:app --host 0.0.0.0 --port 8000 --reload
echo Para correr el frontend React: cd face-recognition-door ^& npm run dev
echo.
pause
