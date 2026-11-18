-- Telemetry query indexes for real-time concurrency, 24h grouping, and access mode lookup
CREATE INDEX IF NOT EXISTS idx_visitor_sessions_created_at ON visitor_sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_visitor_sessions_last_ping ON visitor_sessions(last_ping);
CREATE INDEX IF NOT EXISTS idx_access_logs_session_id ON access_logs(session_uuid, id DESC);
