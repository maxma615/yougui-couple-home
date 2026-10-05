ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

ALTER TABLE users
  ADD COLUMN phone text,
  ADD COLUMN role text NOT NULL DEFAULT 'member',
  ADD COLUMN disabled boolean NOT NULL DEFAULT false;

ALTER TABLE users
  ADD CONSTRAINT users_phone_key UNIQUE (phone),
  ADD CONSTRAINT users_phone_check CHECK (phone IS NULL OR phone ~ '^1[3-9][0-9]{9}$'),
  ADD CONSTRAINT users_role_check CHECK (role IN ('member', 'admin')),
  ADD CONSTRAINT users_login_identifier_check CHECK (email IS NOT NULL OR phone IS NOT NULL);
