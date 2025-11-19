-- Migration: Add meta_logs table for Dilovod API logging
CREATE TABLE IF NOT EXISTS meta_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  datetime DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  category VARCHAR(32) NOT NULL,
  status VARCHAR(16) NOT NULL,
  message TEXT,
  data JSON,
  metadata JSON
);
