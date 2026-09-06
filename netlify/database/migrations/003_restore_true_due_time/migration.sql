UPDATE cat_box_state
SET next_due_at = last_cleaned_at + INTERVAL '36 hours',
    next_reminder_at = NULL
WHERE id = 1
  AND last_cleaned_at IS NOT NULL;
