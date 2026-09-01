CREATE TABLE IF NOT EXISTS household_members (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  invite_token TEXT UNIQUE,
  invited_at TIMESTAMPTZ,
  consented_at TIMESTAMPTZ,
  opted_out_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT FALSE,
  consent_source TEXT,
  consent_text TEXT,
  consent_user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS household_members_active_idx
  ON household_members (active, consented_at, opted_out_at);
