CREATE TABLE calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id uuid NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
  title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 120),
  location text NOT NULL DEFAULT '' CHECK(length(location)<=500),
  description text NOT NULL DEFAULT '' CHECK(length(description)<=20000),
  all_day boolean NOT NULL,
  start_date date,
  end_date date,
  start_at timestamptz,
  end_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  FOREIGN KEY(home_id,created_by) REFERENCES home_members(home_id,user_id),
  FOREIGN KEY(home_id,updated_by) REFERENCES home_members(home_id,user_id),
  CHECK (
    (all_day AND start_date IS NOT NULL AND end_date IS NOT NULL AND end_date>=start_date AND start_at IS NULL AND end_at IS NULL)
    OR
    (NOT all_day AND start_at IS NOT NULL AND end_at IS NOT NULL AND end_at>=start_at AND start_date IS NULL AND end_date IS NULL)
  )
);
CREATE INDEX calendar_events_home_dates_idx ON calendar_events(home_id,start_date,end_date);
CREATE INDEX calendar_events_home_instants_idx ON calendar_events(home_id,start_at,end_at);
