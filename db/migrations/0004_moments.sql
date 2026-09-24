CREATE TABLE moments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id uuid NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
  title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 120),
  date date NOT NULL,
  body text NOT NULL DEFAULT '' CHECK(length(body) <= 20000),
  version integer NOT NULL DEFAULT 1 CHECK(version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  CONSTRAINT moments_id_home_key UNIQUE(id,home_id),
  FOREIGN KEY(home_id,created_by) REFERENCES home_members(home_id,user_id),
  FOREIGN KEY(home_id,updated_by) REFERENCES home_members(home_id,user_id)
);

CREATE INDEX moments_timeline_idx ON moments(home_id,date DESC,created_at DESC,id DESC);

CREATE TABLE photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id uuid NOT NULL,
  moment_id uuid NOT NULL,
  storage_name text NOT NULL CONSTRAINT photos_storage_name_key UNIQUE
    CHECK(storage_name ~ '^[0-9a-f]{32}\.(jpg|png|webp)$'),
  original_filename text NOT NULL CHECK(length(original_filename) BETWEEN 1 AND 255),
  mime_type text NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/webp')),
  byte_size bigint NOT NULL CHECK(byte_size > 0),
  sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT photos_id_home_key UNIQUE(id,home_id),
  FOREIGN KEY(moment_id,home_id) REFERENCES moments(id,home_id) ON DELETE CASCADE,
  FOREIGN KEY(home_id,uploaded_by) REFERENCES home_members(home_id,user_id)
);

CREATE INDEX photos_moment_idx ON photos(home_id,moment_id,created_at,id);

CREATE TABLE photo_cleanup_queue (
  storage_name text PRIMARY KEY
    CHECK(storage_name ~ '^[0-9a-f]{32}\.(jpg|png|webp)$'),
  home_id uuid NOT NULL REFERENCES homes(id),
  photo_id uuid NOT NULL,
  sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),
  byte_size bigint NOT NULL CHECK(byte_size > 0),
  enqueued_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  last_error text
);

CREATE INDEX photo_cleanup_queue_enqueued_idx ON photo_cleanup_queue(enqueued_at,storage_name);
