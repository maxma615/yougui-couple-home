CREATE TABLE invitations (
  token_hash text PRIMARY KEY,
  home_id uuid NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
  inviter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  consumed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invitations_consumption_check CHECK (
    (consumed_at IS NULL AND consumed_by IS NULL)
    OR (consumed_at IS NOT NULL AND consumed_by IS NOT NULL)
  )
);

CREATE INDEX invitations_home_id_idx ON invitations(home_id);
CREATE INDEX invitations_expires_at_idx ON invitations(expires_at);
