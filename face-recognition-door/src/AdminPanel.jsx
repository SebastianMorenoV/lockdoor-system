// ==============================================================================
// LockDoor System - Panel de Administración (React)
// ==============================================================================
// Este componente permite al administrador gestionar el sistema:
// - Registrar nuevos rostros (capturando de la cámara) y PINs.
// - Ver, agregar (solo PIN) o eliminar usuarios existentes.
// - Ver el historial (logs) de quién entró y a qué hora.
// - Apagar/Prender la alarma (buzzer) del ESP32.
// ==============================================================================

import React, { useRef, useCallback, useState, useEffect } from "react";
import Webcam from "react-webcam";

const API_URL = "http://127.0.0.1:8000";

const AdminPanel = () => {
  const webcamRef = useRef(null);

  // States for security and form data
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserPin, setNewUserPin] = useState("");
  const [status, setStatus] = useState("");

  // New states for features
  const [buzzerOn, setBuzzerOn] = useState(true);
  const [accessLogs, setAccessLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [activeSection, setActiveSection] = useState("register"); // register, users, logs

  const handleUnlock = () => {
    // Hardcoded for frontend testing. Later, your Python backend should verify this!
    if (passwordInput === "admin123") {
      setIsUnlocked(true);
      setStatus("System unlocked. Ready to register.");
      fetchLogs();
      fetchUsers();
      fetchBuzzerState();
    } else {
      setStatus("❌ Incorrect Password");
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch(`${API_URL}/logs?limit=50`);
      const data = await res.json();
      if (data.status === "success") setAccessLogs(data.logs);
    } catch (err) {
      console.error("Error fetching logs:", err);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_URL}/users`);
      const data = await res.json();
      if (data.status === "success") setUsers(data.users);
    } catch (err) {
      console.error("Error fetching users:", err);
    }
  };

  const fetchBuzzerState = async () => {
    try {
      const res = await fetch(`${API_URL}/esp32_status`);
      const data = await res.json();
      setBuzzerOn(data.buzzer !== false);
    } catch {
      // default to on if can't connect
    }
  };

  const toggleBuzzer = async () => {
    const newState = buzzerOn ? "off" : "on";
    try {
      const res = await fetch(`${API_URL}/buzzer_toggle?state=${newState}`);
      const data = await res.json();
      if (data.status === "success") {
        setBuzzerOn(!buzzerOn);
        setStatus(`🔔 Buzzer ${!buzzerOn ? "Activado" : "Desactivado"}`);
      } else {
        setStatus(`⚠️ ${data.message}`);
      }
    } catch (err) {
      setStatus("❌ Error conectando con ESP32");
    }
    setTimeout(() => setStatus(""), 3000);
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
      const response = await fetch(`${API_URL}/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newUserName,
          image: imageSrc,
          pin: newUserPin || null,
        }),
      });

      // 3. Recibir la respuesta
      const data = await response.json();

      if (data.status === "success") {
        setStatus(`✅ Registrado exitosamente: ${newUserName}`);
        fetchUsers();
      } else {
        setStatus(`❌ Error: ${data.message}`);
      }
    } catch (error) {
      console.error("Error al conectar:", error);
      setStatus("❌ Error de conexión con el servidor");
    }

    setNewUserName(""); // Limpiar el input
    setNewUserPin("");
    setTimeout(() => setStatus("Listo para registrar."), 3000);
  }, [webcamRef, newUserName, newUserPin]);

  const registerPinUser = async () => {
    if (!newUserName.trim() || !newUserPin.trim()) {
      setStatus("⚠️ Nombre y PIN son requeridos");
      return;
    }
    try {
      const res = await fetch(`${API_URL}/register_user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newUserName, pin: newUserPin }),
      });
      const data = await res.json();
      if (data.status === "success") {
        setStatus(`✅ ${data.message}`);
        setNewUserName("");
        setNewUserPin("");
        fetchUsers();
      } else {
        setStatus(`❌ ${data.message}`);
      }
    } catch {
      setStatus("❌ Error de conexión");
    }
    setTimeout(() => setStatus(""), 3000);
  };

  const deleteUser = async (userId, userName) => {
    if (!window.confirm(`¿Eliminar a ${userName}?`)) return;
    try {
      const res = await fetch(`${API_URL}/users/${userId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.status === "success") {
        setStatus(`🗑️ ${userName} eliminado`);
        fetchUsers();
      }
    } catch {
      setStatus("❌ Error eliminando usuario");
    }
    setTimeout(() => setStatus(""), 3000);
  };

  // Auto-refresh logs
  useEffect(() => {
    if (!isUnlocked) return;
    const interval = setInterval(() => {
      fetchLogs();
    }, 10000);
    return () => clearInterval(interval);
  }, [isUnlocked]);

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
          onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
          style={styles.input}
        />
        <button onClick={handleUnlock} style={styles.button}>
          Unlock
        </button>
        <p style={styles.statusText}>{status}</p>
      </div>
    );
  }

  // --- RENDER UNLOCKED ADMIN DASHBOARD ---
  return (
    <div style={styles.dashContainer}>
      {/* Top Bar with Buzzer Toggle */}
      <div style={styles.topBar}>
        <h2 style={styles.dashTitle}>🛡️ Admin Dashboard</h2>
        <button
          onClick={toggleBuzzer}
          style={buzzerOn ? styles.buzzerOnBtn : styles.buzzerOffBtn}
        >
          {buzzerOn ? "🔔 Buzzer ON" : "🔕 Buzzer OFF"}
        </button>
      </div>

      {status && <p style={styles.statusBanner}>{status}</p>}

      {/* Section Tabs */}
      <div style={styles.sectionTabs}>
        <button
          style={activeSection === "register" ? styles.activeSecTab : styles.secTab}
          onClick={() => setActiveSection("register")}
        >
          📷 Registrar Rostro
        </button>
        <button
          style={activeSection === "users" ? styles.activeSecTab : styles.secTab}
          onClick={() => { setActiveSection("users"); fetchUsers(); }}
        >
          👥 Usuarios & PIN
        </button>
        <button
          style={activeSection === "logs" ? styles.activeSecTab : styles.secTab}
          onClick={() => { setActiveSection("logs"); fetchLogs(); }}
        >
          📋 Access Logs
        </button>
      </div>

      {/* === SECTION: Face Registration === */}
      {activeSection === "register" && (
        <div style={styles.sectionContent}>
          <h3 style={styles.sectionTitle}>Registrar Rostro + PIN</h3>
          <div style={styles.formRow}>
            <input
              type="text"
              placeholder="Nombre de la persona"
              value={newUserName}
              onChange={(e) => setNewUserName(e.target.value)}
              style={styles.input}
            />
            <input
              type="text"
              placeholder="PIN (opcional)"
              value={newUserPin}
              onChange={(e) => setNewUserPin(e.target.value)}
              style={{ ...styles.input, width: "150px" }}
            />
          </div>

          <div style={styles.webcamWrapper}>
            <Webcam
              audio={false}
              ref={webcamRef}
              screenshotFormat="image/jpeg"
              width={400}
              videoConstraints={{ facingMode: "user" }}
            />
          </div>

          <button onClick={registerFace} style={styles.registerButton}>
            📸 Capturar & Registrar Rostro
          </button>
        </div>
      )}

      {/* === SECTION: Users & PIN Management === */}
      {activeSection === "users" && (
        <div style={styles.sectionContent}>
          <h3 style={styles.sectionTitle}>Gestión de Usuarios</h3>

          {/* Quick PIN-only Registration */}
          <div style={styles.quickRegister}>
            <h4 style={{ margin: "0 0 10px 0", color: "#555" }}>Registrar Usuario Solo PIN</h4>
            <div style={styles.formRow}>
              <input
                type="text"
                placeholder="Nombre"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                style={styles.input}
              />
              <input
                type="text"
                placeholder="PIN del teclado"
                value={newUserPin}
                onChange={(e) => setNewUserPin(e.target.value)}
                style={{ ...styles.input, width: "150px" }}
              />
              <button onClick={registerPinUser} style={styles.addBtn}>
                ➕ Agregar
              </button>
            </div>
          </div>

          {/* Users Table */}
          <div style={styles.tableContainer}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>ID</th>
                  <th style={styles.th}>Nombre</th>
                  <th style={styles.th}>PIN</th>
                  <th style={styles.th}>Rostro</th>
                  <th style={styles.th}>Registrado</th>
                  <th style={styles.th}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} style={styles.tr}>
                    <td style={styles.td}>{u.id}</td>
                    <td style={styles.td}>{u.name}</td>
                    <td style={styles.td}>
                      <span style={styles.pinBadge}>{u.pin || "—"}</span>
                    </td>
                    <td style={styles.td}>{u.face_registered ? "✅" : "❌"}</td>
                    <td style={styles.td}>{u.created_at}</td>
                    <td style={styles.td}>
                      <button
                        onClick={() => deleteUser(u.id, u.name)}
                        style={styles.deleteBtn}
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan="6" style={{ ...styles.td, textAlign: "center", color: "#999" }}>No hay usuarios registrados</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* === SECTION: Access Logs === */}
      {activeSection === "logs" && (
        <div style={styles.sectionContent}>
          <h3 style={styles.sectionTitle}>Registro de Accesos</h3>
          <button onClick={fetchLogs} style={styles.refreshBtn}>🔄 Refrescar</button>
          <div style={styles.tableContainer}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>#</th>
                  <th style={styles.th}>Usuario</th>
                  <th style={styles.th}>Método</th>
                  <th style={styles.th}>Acceso</th>
                  <th style={styles.th}>Fecha & Hora</th>
                </tr>
              </thead>
              <tbody>
                {accessLogs.map((log) => (
                  <tr key={log.id} style={styles.tr}>
                    <td style={styles.td}>{log.id}</td>
                    <td style={styles.td}>{log.user_name}</td>
                    <td style={styles.td}>
                      <span style={{
                        ...styles.methodBadge,
                        backgroundColor:
                          log.method === "face" ? "#4CAF50" :
                          log.method === "pin" ? "#2196F3" :
                          log.method === "button" ? "#FF9800" :
                          log.method === "remote" ? "#9C27B0" : "#757575"
                      }}>
                        {log.method === "face" ? "👤 Rostro" :
                         log.method === "pin" ? "🔢 PIN" :
                         log.method === "button" ? "🔘 Botón" :
                         log.method === "remote" ? "🌐 Remoto" : log.method}
                      </span>
                    </td>
                    <td style={styles.td}>{log.granted ? "✅" : "❌"}</td>
                    <td style={styles.td}>{log.timestamp}</td>
                  </tr>
                ))}
                {accessLogs.length === 0 && (
                  <tr><td colSpan="5" style={{ ...styles.td, textAlign: "center", color: "#999" }}>No hay registros de acceso</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// Styles (Matching your theme + new dashboard styles)
const styles = {
  container: { display: "flex", flexDirection: "column", alignItems: "center", width: "100%" },
  title: { color: "#333", marginBottom: "20px" },
  input: {
    padding: "10px",
    fontSize: "16px",
    marginBottom: "10px",
    width: "250px",
    borderRadius: "8px",
    border: "1px solid #ddd",
    outline: "none",
  },
  button: {
    padding: "10px 20px",
    fontSize: "16px",
    backgroundColor: "#333",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
  },
  statusText: { marginTop: "15px", fontSize: "16px", fontWeight: "bold", color: "#555" },

  // Dashboard styles
  dashContainer: {
    width: "100%",
    maxWidth: "900px",
    padding: "0 20px",
  },
  topBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "15px",
    flexWrap: "wrap",
    gap: "10px",
  },
  dashTitle: { color: "#333", margin: 0 },
  buzzerOnBtn: {
    padding: "10px 20px",
    fontSize: "14px",
    fontWeight: "bold",
    backgroundColor: "#4CAF50",
    color: "#fff",
    border: "none",
    borderRadius: "25px",
    cursor: "pointer",
    transition: "all 0.3s",
    boxShadow: "0 2px 8px rgba(76,175,80,0.3)",
  },
  buzzerOffBtn: {
    padding: "10px 20px",
    fontSize: "14px",
    fontWeight: "bold",
    backgroundColor: "#f44336",
    color: "#fff",
    border: "none",
    borderRadius: "25px",
    cursor: "pointer",
    transition: "all 0.3s",
    boxShadow: "0 2px 8px rgba(244,67,54,0.3)",
  },
  statusBanner: {
    padding: "10px 15px",
    backgroundColor: "#e3f2fd",
    borderRadius: "8px",
    fontWeight: "bold",
    color: "#333",
    marginBottom: "15px",
    textAlign: "center",
  },
  sectionTabs: {
    display: "flex",
    gap: "5px",
    marginBottom: "15px",
    borderBottom: "2px solid #eee",
    paddingBottom: "10px",
    flexWrap: "wrap",
  },
  secTab: {
    padding: "8px 16px",
    fontSize: "14px",
    cursor: "pointer",
    border: "1px solid #ddd",
    backgroundColor: "#fff",
    borderRadius: "8px 8px 0 0",
    color: "#666",
  },
  activeSecTab: {
    padding: "8px 16px",
    fontSize: "14px",
    cursor: "pointer",
    border: "none",
    backgroundColor: "#0056b3",
    color: "#fff",
    borderRadius: "8px 8px 0 0",
    fontWeight: "bold",
  },
  sectionContent: {
    backgroundColor: "#fff",
    borderRadius: "0 0 12px 12px",
    padding: "20px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  },
  sectionTitle: { color: "#333", marginTop: 0, marginBottom: "15px" },
  formRow: {
    display: "flex",
    gap: "10px",
    alignItems: "flex-start",
    flexWrap: "wrap",
    marginBottom: "15px",
  },
  webcamWrapper: {
    border: "3px solid #ccc",
    borderRadius: "8px",
    overflow: "hidden",
    marginBottom: "15px",
    display: "inline-block",
  },
  registerButton: {
    padding: "12px 24px",
    fontSize: "16px",
    backgroundColor: "#28a745",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
  },
  quickRegister: {
    padding: "15px",
    backgroundColor: "#f8f9fa",
    borderRadius: "8px",
    marginBottom: "20px",
    border: "1px dashed #ccc",
  },
  addBtn: {
    padding: "10px 20px",
    fontSize: "14px",
    backgroundColor: "#0056b3",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontWeight: "bold",
    whiteSpace: "nowrap",
  },
  refreshBtn: {
    padding: "8px 16px",
    fontSize: "13px",
    backgroundColor: "#fff",
    color: "#333",
    border: "1px solid #ddd",
    borderRadius: "8px",
    cursor: "pointer",
    marginBottom: "15px",
  },
  tableContainer: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "14px",
  },
  th: {
    padding: "10px 12px",
    backgroundColor: "#f1f3f5",
    textAlign: "left",
    fontWeight: "bold",
    color: "#555",
    borderBottom: "2px solid #ddd",
    whiteSpace: "nowrap",
  },
  tr: {
    borderBottom: "1px solid #eee",
  },
  td: {
    padding: "10px 12px",
    color: "#333",
  },
  methodBadge: {
    padding: "4px 10px",
    borderRadius: "12px",
    color: "#fff",
    fontSize: "12px",
    fontWeight: "bold",
    whiteSpace: "nowrap",
  },
  pinBadge: {
    padding: "3px 8px",
    backgroundColor: "#e3f2fd",
    borderRadius: "6px",
    fontFamily: "monospace",
    fontSize: "14px",
  },
  deleteBtn: {
    padding: "5px 10px",
    backgroundColor: "transparent",
    border: "1px solid #f44336",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "14px",
  },
};

export default AdminPanel;
