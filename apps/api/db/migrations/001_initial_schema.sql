-- PostgreSQL 16. Apply once with psql -v ON_ERROR_STOP=1.
BEGIN;

CREATE TABLE users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL CHECK (btrim(name) <> ''),
    email TEXT NOT NULL CHECK (btrim(email) <> ''),
    password_hash TEXT NOT NULL CHECK (btrim(password_hash) <> ''),
    role TEXT NOT NULL DEFAULT 'student'
        CHECK (role IN ('student', 'technician', 'admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX users_email_unique ON users (lower(btrim(email)));

CREATE TABLE categories (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL CHECK (btrim(name) <> ''),
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX categories_name_unique ON categories (lower(btrim(name)));

CREATE TABLE incidents (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title TEXT NOT NULL CHECK (btrim(title) <> ''),
    description TEXT NOT NULL CHECK (btrim(description) <> ''),
    location TEXT NOT NULL CHECK (btrim(location) <> ''),
    category_id BIGINT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    reported_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    assigned_to BIGINT REFERENCES users(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    priority TEXT NOT NULL DEFAULT 'medium'
        CHECK (priority IN ('low', 'medium', 'high')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMPTZ
);

CREATE INDEX incidents_category_id_idx ON incidents (category_id);
CREATE INDEX incidents_reported_by_idx ON incidents (reported_by);
CREATE INDEX incidents_assigned_to_idx ON incidents (assigned_to);
CREATE INDEX incidents_status_priority_idx ON incidents (status, priority);
CREATE INDEX incidents_created_at_idx ON incidents (created_at DESC);

CREATE TABLE incident_updates (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    incident_id BIGINT NOT NULL REFERENCES incidents(id) ON DELETE RESTRICT,
    changed_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    previous_status TEXT
        CHECK (previous_status IN ('open', 'in_progress', 'resolved', 'closed')),
    new_status TEXT NOT NULL
        CHECK (new_status IN ('open', 'in_progress', 'resolved', 'closed')),
    previous_assigned_to BIGINT REFERENCES users(id) ON DELETE RESTRICT,
    new_assigned_to BIGINT REFERENCES users(id) ON DELETE RESTRICT,
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX incident_updates_incident_created_idx
    ON incident_updates (incident_id, created_at, id);
CREATE INDEX incident_updates_changed_by_idx ON incident_updates (changed_by);
CREATE INDEX incident_updates_previous_assigned_idx ON incident_updates (previous_assigned_to);
CREATE INDEX incident_updates_new_assigned_idx ON incident_updates (new_assigned_to);

COMMIT;
