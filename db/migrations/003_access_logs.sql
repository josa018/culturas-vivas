-- Access log: device type and mode (vr or 2d) per anonymous session
CREATE TABLE IF NOT EXISTS access_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_uuid TEXT NOT NULL,
    device_type TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('vr', '2d')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_access_logs_session_uuid ON access_logs(session_uuid);