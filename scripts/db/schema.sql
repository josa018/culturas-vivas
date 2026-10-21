-- Sessions table for anonymous visitor tracking
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_ping DATETIME DEFAULT CURRENT_TIMESTAMP,
    active INTEGER DEFAULT 1 CHECK (active IN (0, 1))
);

-- Indexes for fast query lookup by visitor session UUID and active filter
CREATE INDEX IF NOT EXISTS idx_sessions_uuid ON sessions(uuid);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(active);
