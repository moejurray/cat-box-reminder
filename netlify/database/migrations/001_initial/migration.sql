CREATE TABLE IF NOT EXISTS cat_box_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_cleaned_at TIMESTAMPTZ,
  next_due_at TIMESTAMPTZ,
  waiting_for_reply BOOLEAN NOT NULL DEFAULT FALSE,
  last_reminder_at TIMESTAMPTZ,
  last_confirmed_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO cat_box_state (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS cleaning_events (
  id BIGSERIAL PRIMARY KEY,
  cleaned_at TIMESTAMPTZ NOT NULL,
  confirmed_by TEXT,
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reminder_events (
  id BIGSERIAL PRIMARY KEY,
  sent_at TIMESTAMPTZ NOT NULL,
  recipient TEXT NOT NULL,
  twilio_sid TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
