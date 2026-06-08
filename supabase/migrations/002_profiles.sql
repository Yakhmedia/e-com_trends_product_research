-- Run in Supabase SQL Editor after 001_create_trends.sql

CREATE TABLE IF NOT EXISTS profiles (
  id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'admin',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Only the authenticated user can read their own profile
CREATE POLICY "Users read own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- Only the user themselves can insert their profile (on first login)
CREATE POLICY "Users insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Restrict trends reads to authenticated users only (update existing policy)
DROP POLICY IF EXISTS "Allow public read" ON trends;
CREATE POLICY "Authenticated read trends" ON trends
  FOR SELECT USING (auth.role() = 'authenticated');
