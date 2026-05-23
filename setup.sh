#!/bin/bash

echo "========================================================"
echo "      LockDoor System - Instalación Automatizada        "
echo "========================================================"
echo ""
echo "Este script configurará los entornos de Python y Node.js."
echo "Asegúrate de tener instalados: Python 3, Node.js y MySQL."
echo ""
read -p "Presiona Enter para continuar..."

echo ""
echo "[1/3] Configurando Backend (Python FastAPI)..."
cd face-api
if [ ! -d "venv" ]; then
    echo "Creando entorno virtual..."
    python3 -m venv venv
fi
echo "Instalando dependencias de Python..."
source venv/bin/activate
pip install "setuptools<70"
pip install fastapi uvicorn face_recognition opencv-python numpy mysql-connector-python requests
cd ..

echo ""
echo "[2/3] Configurando Frontend (React Vite)..."
cd face-recognition-door
echo "Instalando dependencias de Node.js..."
npm install
cd ..

echo ""
echo "========================================================"
echo "               INSTALACIÓN COMPLETADA                   "
echo "========================================================"
echo ""
echo "PASOS FALTANTES QUE DEBES HACER MANUALMENTE:"
echo "1. Base de Datos: Abre MySQL y ejecuta 'source database/init.sql;'"
echo "2. Configura Passwords: Edita 'face-api/main.py' y pon tu password de MySQL."
echo "3. Configura ESP32: Abre 'smart_lock/smart_lock.ino', pon tu WiFi, y súbelo."
echo ""
echo "Para correr el servidor Python: cd face-api && source venv/bin/activate && uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
echo "Para correr el frontend React: cd face-recognition-door && npm run dev"
echo ""
