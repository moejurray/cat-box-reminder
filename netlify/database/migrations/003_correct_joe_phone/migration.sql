-- Migration 003 was previously applied to production and then accidentally removed.
-- Retain this versioned migration so Netlify can reconcile migration history.
-- The original operation was a one-time household phone correction containing
-- personal contact information. Do not replay or store that number in source.
-- Existing household_members records are intentionally left unchanged.
SELECT 1;
