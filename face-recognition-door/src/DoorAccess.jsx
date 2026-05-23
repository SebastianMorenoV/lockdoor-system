// ==============================================================================
// LockDoor System - Componente de Escáner Facial (React)
// ==============================================================================
// Este componente maneja la cámara web del usuario.
// Captura una foto cuando se presiona el botón y la envía al backend (Python)
// para verificar si el rostro está autorizado.
// ==============================================================================

import React, { useRef, useCallback, useState } from "react";
import Webcam from "react-webcam";

const DoorAccess = () => {
  const webcamRef = useRef(null);
  const [status, setStatus] = useState("Awaiting scan...");

  // Función principal: Captura el frame de la cámara y lo envía a la API
  const captureFrame = useCallback(async () => {
    const imageSrc = webcamRef.current.getScreenshot();
    setStatus("Analizando rostro...");

    try {
      // Enviar la foto al "Cerebro" de Python para verificar
      const response = await fetch("http://127.0.0.1:8000/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: imageSrc }),
      });

      const data = await response.json();

      if (data.status === "success") {
        if (data.match) {
          // ¡HAY MATCH! El backend reconoció la cara
          if (data.hardware_reached) {
            setStatus(`🟢 ¡Acceso Concedido, ${data.name}! Puerta abierta ✅`);
          } else {
            setStatus(`⚠️ Reconocido (${data.name}), pero error al abrir chapa. ¿ESP32 encendido?`);
          }
        } else {
          // NO HAY MATCH
          setStatus("🔴 Acceso Denegado. Rostro no reconocido.");
        }
      } else {
        // ERROR (No se vio la cara, mala iluminación, etc.)
        setStatus(`⚠️ ${data.message}`);
      }
  } catch (error) {
    console.error(error);
    setStatus("❌ Error conectando con el servidor");
  }

  // Resetear el mensaje después de 4 segundos
  setTimeout(() => setStatus("Esperando escaneo..."), 4000);
}, [webcamRef]);

return (
  <div style={styles.container}>
    {/* Your custom door title */}
    <h1 style={styles.title}>Sebastian's Lock Door</h1>

    {/* Webcam Feed Container */}
    <div style={styles.webcamWrapper}>
      <Webcam
        audio={false}
        ref={webcamRef}
        screenshotFormat="image/jpeg"
        width={640}
        height={480}
        videoConstraints={{
          facingMode: "user", // Forces the front-facing camera
        }}
      />
    </div>

    {/* Botón manual para capturar y enviar la foto */}
    <button onClick={captureFrame} style={styles.button}>
      Scan Face
    </button>

    {/* Status feedback for the user */}
    <p style={styles.statusText}>{status}</p>
  </div>
);
};

// Simple inline styles to keep it looking clean out of the box
const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
    fontFamily: "sans-serif",
  },
  title: {
    color: "#0056b3",
    marginBottom: "20px",
    textTransform: "uppercase",
  },
  webcamWrapper: {
    border: "4px solid #333",
    borderRadius: "8px",
    overflow: "hidden",
    marginBottom: "20px",
    boxShadow: "0 4px 8px rgba(0,0,0,0.2)",
  },
  button: {
    padding: "12px 24px",
    fontSize: "18px",
    fontWeight: "bold",
    color: "#fff",
    backgroundColor: "#0056b3",
    border: "none",
    borderRadius: "5px",
    cursor: "pointer",
    boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
  },
  statusText: {
    marginTop: "20px",
    fontSize: "18px",
    fontWeight: "bold",
    color: "#555",
  },
};

export default DoorAccess;
