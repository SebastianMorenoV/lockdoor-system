// ==============================================================================
// LockDoor System - Frontend Principal (React)
// ==============================================================================
// Este componente es el contenedor principal de la aplicación web.
// Administra la navegación (pestañas) entre el Escáner de Puerta (DoorAccess)
// y el Panel de Administración (AdminPanel).
// ==============================================================================

import React, { useState } from "react";
import DoorAccess from "./DoorAccess.jsx"; // Componente para escanear el rostro
import AdminPanel from "./AdminPanel"; // Componente para administrar usuarios y ver logs


const App = () => {
  // Estado para controlar qué pestaña estamos viendo actualmente (scanner o admin)
  const [activeTab, setActiveTab] = useState("scanner");

  return (
    <div style={styles.mainLayout}>
      {/* Navigation Bar */}
      <nav style={styles.navBar}>
        <button
          style={activeTab === "scanner" ? styles.activeTabBtn : styles.tabBtn}
          onClick={() => setActiveTab("scanner")}>
          📷 Door Scanner
        </button>
        <button
          style={activeTab === "admin" ? styles.activeTabBtn : styles.tabBtn}
          onClick={() => setActiveTab("admin")}>
          ⚙️ Admin Panel
        </button>
      </nav>

      {/* Área de Contenido: Muestra el componente correspondiente a la pestaña activa */}
      <div style={styles.contentArea}>{activeTab === "scanner" ? <DoorAccess /> : <AdminPanel />}</div>
    </div>
  );
};

const styles = {
  mainLayout: { display: "flex", flexDirection: "column", minHeight: "100vh", backgroundColor: "#f4f7f6" },
  navBar: {
    display: "flex",
    justifyContent: "center",
    gap: "10px",
    padding: "15px",
    backgroundColor: "#fff",
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
  },
  tabBtn: {
    padding: "10px 20px",
    fontSize: "16px",
    cursor: "pointer",
    border: "1px solid #ccc",
    backgroundColor: "#fff",
    borderRadius: "5px",
  },
  activeTabBtn: {
    padding: "10px 20px",
    fontSize: "16px",
    cursor: "pointer",
    border: "none",
    backgroundColor: "#0056b3",
    color: "#fff",
    borderRadius: "5px",
    fontWeight: "bold",
  },
  contentArea: { flex: 1, display: "flex", justifyContent: "center", paddingTop: "20px" },
};

export default App;
