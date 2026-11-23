CREATE TABLE IF NOT EXISTS room_audio_tracks (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  title TEXT NOT NULL,
  artist_credit TEXT NOT NULL DEFAULT '',
  license_note TEXT NOT NULL DEFAULT '',
  storage_provider TEXT NOT NULL DEFAULT 'r2',
  media_key TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('audio/mpeg', 'audio/mp4')),
  file_size_bytes INTEGER NOT NULL CHECK (file_size_bytes > 0),
  duration_ms INTEGER DEFAULT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_room_audio_room_order
  ON room_audio_tracks(room_id, sort_order, created_at);

CREATE TABLE IF NOT EXISTS room_playlist_settings (
  room_id TEXT PRIMARY KEY,
  playback_mode TEXT NOT NULL DEFAULT 'SEQUENTIAL'
    CHECK (playback_mode IN ('SEQUENTIAL', 'SHUFFLE')),
  updated_at INTEGER NOT NULL
);
