CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL CONSTRAINT users_email_key UNIQUE,
  display_name text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE homes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  start_date date NOT NULL,
  version integer NOT NULL DEFAULT 1 CONSTRAINT homes_version_check CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE home_members (
  home_id uuid NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot integer NOT NULL CONSTRAINT home_members_slot_check CHECK (slot BETWEEN 1 AND 2),
  CONSTRAINT home_members_pkey PRIMARY KEY (home_id, user_id),
  CONSTRAINT home_members_user_id_key UNIQUE (user_id),
  CONSTRAINT home_members_home_id_slot_key UNIQUE (home_id, slot)
);

CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sessions_user_id_idx ON sessions(user_id);
CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);
