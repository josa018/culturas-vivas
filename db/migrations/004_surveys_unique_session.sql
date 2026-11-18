-- One survey per session (also protects against two simultaneous requests)
CREATE UNIQUE INDEX IF NOT EXISTS ux_surveys_session_uuid ON surveys(session_uuid);