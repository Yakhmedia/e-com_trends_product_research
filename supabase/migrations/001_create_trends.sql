-- Run this in your Supabase SQL editor to create the trends table
CREATE TABLE IF NOT EXISTS trends (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword text NOT NULL,
  fetched_at timestamptz DEFAULT now(),
  interest_over_time jsonb DEFAULT '[]',
  interest_by_region jsonb DEFAULT '[]',
  related_queries_top jsonb DEFAULT '[]',
  related_queries_rising jsonb DEFAULT '[]',
  related_topics_top jsonb DEFAULT '[]',
  related_topics_rising jsonb DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS trends_keyword_idx ON trends (keyword, fetched_at DESC);

-- Allow anon reads and inserts (adjust RLS as needed for production)
ALTER TABLE trends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read" ON trends FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON trends FOR INSERT WITH CHECK (true);
