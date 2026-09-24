CREATE TABLE anniversaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id uuid NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
  title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 120),
  date date NOT NULL,
  note text NOT NULL DEFAULT '',
  yearly boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  FOREIGN KEY(home_id,created_by) REFERENCES home_members(home_id,user_id),
  FOREIGN KEY(home_id,updated_by) REFERENCES home_members(home_id,user_id)
);
CREATE INDEX anniversaries_home_idx ON anniversaries(home_id,date,id);
CREATE TABLE todos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id uuid NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
  title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '',
  assignee_id uuid,
  due_date date,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  FOREIGN KEY(home_id,assignee_id) REFERENCES home_members(home_id,user_id),
  FOREIGN KEY(home_id,created_by) REFERENCES home_members(home_id,user_id),
  FOREIGN KEY(home_id,updated_by) REFERENCES home_members(home_id,user_id),
  CHECK((completed AND completed_at IS NOT NULL) OR (NOT completed AND completed_at IS NULL))
);
CREATE INDEX todos_home_idx ON todos(home_id,completed,due_date);
