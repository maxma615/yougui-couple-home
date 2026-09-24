CREATE TABLE home_events (
  id bigserial PRIMARY KEY,
  home_id uuid NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
  resource_type text NOT NULL CHECK (resource_type IN ('home','anniversary','todo','moment','calendar')),
  resource_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('created','updated','deleted')),
  version integer NOT NULL CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX home_events_cursor_idx ON home_events(home_id,id);
