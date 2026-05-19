import React, { useRef, useCallback, useState } from "react";
import Webcam from "react-webcam";

const AdminPanel = () => {
  const webcamRef = useRef(null);

  // States for security and form data
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [status, setStatus] = useState("");

  const handleUnlock = () => {
    // Hardcoded for frontend testing. Later, your Python backend should verify this!
    if (passwordInput === "admin123") {
      setIsUnlocked(true);
      setStatus("System unlocked. Ready to register.");
    } else {
      setStatus("❌ Incorrect Password");
    }
  };

  const registerFace = useCallback(async () => {
    if (!newUserName.trim()) {
      setStatus("⚠️ Por favor ingresa un nombre primero!");
      return;
    }

    // 1. Tomar la foto
    const imageSrc = webcamRef.current.getScreenshot();
    setStatus("Enviando al servidor...");

    try {
      // 2. Hacer la petición POST al servidor de Python
      const response = await fetch("http://127.0.0.1:8000/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newUserName,
          image: imageSrc,
        }),
      });

      // 3. Recibir la respuesta
      const data = await response.json();

      if (data.status === "success") {
        setStatus(`✅ Registrado exitosamente: ${newUserName}`);
      } else {
        setStatus(`❌ Error: ${data.message}`);
      }
    } catch (error) {
      console.error("Error al conectar:", error);
      setStatus("❌ Error de conexión con el servidor");
    }

    setNewUserName(""); // Limpiar el input
    setTimeout(() => setStatus("Listo para registrar."), 3000);
  }, [webcamRef, newUserName]);

  // --- RENDER LOCKED SCREEN ---
  if (!isUnlocked) {
    return (
      <div style={styles.container}>
        <h2 style={styles.title}>🔒 Admin Access Required</h2>
        <input
          type="password"
          placeholder="Enter Admin Password"
          value={passwordInput}
          onChange={(e) => setPasswordInput(e.target.value)}
          style={styles.input}
        />
        <button onClick={handleUnlock} style={styles.button}>
          Unlock
        </button>
        <p style={styles.statusText}>{status}</p>
      </div>
    );
  }

  // --- RENDER UNLOCKED REGISTRATION SCREEN ---
  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Face Registration Dashboard</h2>

      <input
        type="text"
        placeholder="Enter Person's Name"
        value={newUserName}
        onChange={(e) => setNewUserName(e.target.value)}
        style={styles.input}
      />

      <div style={styles.webcamWrapper}>
        <Webcam
          audio={false}
          ref={webcamRef}
          screenshotFormat="image/jpeg"
          width={400} // Slightly smaller for the admin panel
          videoConstraints={{ facingMode: "user" }}
        />
      </div>

      <button onClick={registerFace} style={styles.registerButton}>
        Capture & Register Face
      </button>

      <p style={styles.statusText}>{status}</p>
    </div>
  );
};

// Styles (Matching your theme)
const styles = {
  container: { display: "flex", flexDirection: "column", alignItems: "center", width: "100%" },
  title: { color: "#333", marginBottom: "20px" },
  input: {
    padding: "10px",
    fontSize: "16px",
    marginBottom: "15px",
    width: "250px",
    borderRadius: "5px",
    border: "1px solid #ccc",
  },
  button: {
    padding: "10px 20px",
    fontSize: "16px",
    backgroundColor: "#333",
    color: "#fff",
    border: "none",
    borderRadius: "5px",
    cursor: "pointer",
  },
  registerButton: {
    padding: "12px 24px",
    fontSize: "16px",
    backgroundColor: "#28a745",
    color: "#fff",
    border: "none",
    borderRadius: "5px",
    cursor: "pointer",
    marginTop: "10px",
  },
  webcamWrapper: { border: "3px solid #ccc", borderRadius: "8px", overflow: "hidden", marginBottom: "15px" },
  statusText: { marginTop: "15px", fontSize: "16px", fontWeight: "bold", color: "#555" },
};

export default AdminPanel;
