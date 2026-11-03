-- Anonymous surveys: session uuid plus 3 ratings from 1 to 5
-- No name, email or location is stored
CREATE TABLE IF NOT EXISTS surveys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_uuid TEXT NOT NULL,
    q1_rating INTEGER NOT NULL CHECK (q1_rating BETWEEN 1 AND 5),
    q2_ease INTEGER NOT NULL CHECK (q2_ease BETWEEN 1 AND 5),
    q3_recommend INTEGER NOT NULL CHECK (q3_recommend BETWEEN 1 AND 5),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_surveys_session_uuid ON surveys(session_uuid);