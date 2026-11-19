CREATE TABLE IF NOT EXISTS room_media_items (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  stand_id TEXT NOT NULL,
  media_kind TEXT NOT NULL CHECK (
    media_kind IN ('IMAGE_2D', 'IMAGE_STEREO_SBS', 'VIDEO_2D', 'VIDEO_STEREO_SBS')
  ),
  title TEXT NOT NULL,
  creator_name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  storage_provider TEXT NOT NULL DEFAULT 'r2',
  media_key TEXT NOT NULL,
  poster_key TEXT DEFAULT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL CHECK (file_size_bytes > 0),
  width INTEGER DEFAULT NULL,
  height INTEGER DEFAULT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_room_media_room_stand_order
  ON room_media_items(room_id, stand_id, sort_order, created_at);
