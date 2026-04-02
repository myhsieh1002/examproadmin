-- Feedback table for question issue reporting
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  question_id TEXT REFERENCES questions(id) ON DELETE SET NULL,
  device_id TEXT NOT NULL,
  feedback_type TEXT NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  admin_response TEXT,
  admin_responder_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_feedback_app_status ON feedback(app_id, status);
CREATE INDEX idx_feedback_question ON feedback(question_id);

-- RLS
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Anyone can submit feedback (iOS app, anonymous)
CREATE POLICY "Public insert feedback" ON feedback
  FOR INSERT WITH CHECK (true);

-- Admins can read all feedback
CREATE POLICY "Admin read feedback" ON feedback
  FOR SELECT USING (true);

-- Admins can update feedback (respond, change status)
CREATE POLICY "Admin update feedback" ON feedback
  FOR UPDATE USING (true) WITH CHECK (true);
