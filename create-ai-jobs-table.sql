-- AI Jobs table for tracking batch generation progress
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS ai_jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'running',
  app_id TEXT NOT NULL,
  category TEXT NOT NULL,
  overwrite BOOLEAN DEFAULT FALSE,
  total INTEGER DEFAULT 0,
  current INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  logs JSONB DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ
);

-- Allow service role full access (no RLS needed, server-only table)
ALTER TABLE ai_jobs ENABLE ROW LEVEL SECURITY;

-- Policy: only service role can access (API routes use service role key)
CREATE POLICY "Service role full access" ON ai_jobs
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Auto-cleanup: delete jobs older than 7 days (optional, run periodically)
-- DELETE FROM ai_jobs WHERE started_at < now() - interval '7 days';
