UPDATE household_members
SET phone = '+1' || '415' || '370' || '6861',
    updated_at = NOW()
WHERE name = 'Joe Murray'
  AND phone = '+14152431663';
