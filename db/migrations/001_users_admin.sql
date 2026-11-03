-- Admin users for the /admin dashboard
-- password_hash always stores a hash (bcrypt), never the plain password
CREATE TABLE IF NOT EXISTS users_admin (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'librarian' CHECK (role IN ('admin', 'librarian')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);