-- LockDoor System Database Setup
CREATE DATABASE IF NOT EXISTS lockdoor_db;
USE lockdoor_db;

-- Tabla de usuarios autorizados (nombre + PIN del teclado)
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    pin VARCHAR(20) DEFAULT NULL,
    face_registered BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de registro de accesos
CREATE TABLE IF NOT EXISTS access_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_name VARCHAR(100) NOT NULL,
    method VARCHAR(50) NOT NULL COMMENT 'face, pin, button, remote',
    granted BOOLEAN DEFAULT TRUE,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
