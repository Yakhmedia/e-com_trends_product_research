-- Run in Supabase SQL Editor after 002_profiles.sql

ALTER TABLE trends ADD COLUMN IF NOT EXISTS date_range text NOT NULL DEFAULT 'today 12-m';

-- Update existing rows to have the default value (they were all fetched with 12-month range)
UPDATE trends SET date_range = 'today 12-m' WHERE date_range IS NULL;

-- Drop old index, recreate with date_range included
DROP INDEX IF EXISTS trends_keyword_idx;
CREATE INDEX IF NOT EXISTS trends_keyword_date_idx ON trends (keyword, date_range, fetched_at DESC);
