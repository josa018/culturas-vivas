-- Ensure canonical visitor_sessions table exists in migration history
CREATE TABLE IF NOT EXISTS visitor_sessions (
    id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    last_ping INTEGER NOT NULL,
    ping_count INTEGER NOT NULL DEFAULT 0
);

-- Align surveys to single-question model (rating 1..5 + optional feedback)
-- linked 1:1 to visitor_sessions(id)
CREATE TABLE IF NOT EXISTS surveys_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_uuid TEXT NOT NULL REFERENCES visitor_sessions(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    feedback TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO surveys_new (id, session_uuid, rating, feedback, created_at)
SELECT s.id, s.session_uuid, s.q1_rating, NULL, s.created_at
FROM surveys s
WHERE EXISTS (SELECT 1 FROM visitor_sessions vs WHERE vs.id = s.session_uuid);

DROP INDEX IF EXISTS idx_surveys_session_uuid;
DROP INDEX IF EXISTS ux_surveys_session_uuid;
DROP TABLE surveys;
ALTER TABLE surveys_new RENAME TO surveys;

CREATE UNIQUE INDEX IF NOT EXISTS ux_surveys_session_uuid ON surveys(session_uuid);
