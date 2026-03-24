-- ============================================
-- ExamPro Question Bank - Supabase Schema
-- 2026-03-24
-- ============================================

-- 1. Apps table
CREATE TABLE apps (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  total_questions INTEGER DEFAULT 0,
  version TEXT DEFAULT '1.0',
  last_updated TIMESTAMPTZ DEFAULT now(),
  min_app_version TEXT DEFAULT '1.0.0'
);

-- Seed initial apps
INSERT INTO apps (id, display_name, total_questions, version) VALUES
  ('npexam', '專科護理師甄審考試', 3224, '1.1'),
  ('nurseexam', '護理師國家考試', 4185, '2.2'),
  ('surgeonexam', '外科專科醫師考試', 2295, '2026.02.22');

-- 2. Categories table
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT,
  sort_order INTEGER DEFAULT 0,
  question_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(app_id, name)
);

-- Seed NPExamPro categories
INSERT INTO categories (app_id, name, icon, sort_order) VALUES
  ('npexam', '專科護理通論', 'book.fill', 1),
  ('npexam', '進階專科護理-內科', 'stethoscope', 2),
  ('npexam', '進階專科護理-外科', 'scissors', 3),
  ('npexam', '進階專科護理-兒科', 'figure.and.child.holdinghands', 4),
  ('npexam', '進階專科護理-精神科', 'brain.head.profile', 5),
  ('npexam', '進階專科護理-婦產科', 'heart.text.square', 6),
  ('npexam', '進階專科護理-麻醉科', 'cross.vial', 7),
  ('npexam', '進階專科護理-家庭科', 'house.and.flag', 8);

-- Seed NurseExamPro categories
INSERT INTO categories (app_id, name, icon, sort_order) VALUES
  ('nurseexam', '基本護理學', 'cross.case.fill', 1),
  ('nurseexam', '內外科護理學', 'stethoscope', 2),
  ('nurseexam', '產科護理學', 'heart.text.square', 3),
  ('nurseexam', '兒科護理學', 'figure.and.child.holdinghands', 4),
  ('nurseexam', '社區護理學', 'building.2', 5),
  ('nurseexam', '精神科護理學', 'brain.head.profile', 6),
  ('nurseexam', '基礎醫學', 'pills.fill', 7),
  ('nurseexam', '護理專業問題研討', 'text.book.closed.fill', 8);

-- Seed SurgeonExamPro categories
INSERT INTO categories (app_id, name, icon, sort_order) VALUES
  ('surgeonexam', '一般外科', 'scissors', 1),
  ('surgeonexam', '大腸直腸外科', 'staroflife.fill', 2),
  ('surgeonexam', '小兒外科', 'figure.and.child.holdinghands', 3),
  ('surgeonexam', '內分泌外科', 'pill.fill', 4),
  ('surgeonexam', '內視鏡外科', 'video.fill', 5),
  ('surgeonexam', '心臟血管外科', 'heart.fill', 6),
  ('surgeonexam', '外科重症', 'cross.circle.fill', 7),
  ('surgeonexam', '外科基礎', 'book.fill', 8),
  ('surgeonexam', '外科營養', 'leaf.fill', 9),
  ('surgeonexam', '外傷學', 'bandage.fill', 10),
  ('surgeonexam', '血管外科', 'waveform.path.ecg', 11),
  ('surgeonexam', '肝膽胰外科', 'liver.fill', 12),
  ('surgeonexam', '乳房外科', 'staroflife', 13),
  ('surgeonexam', '泌尿外科', 'drop.fill', 14),
  ('surgeonexam', '神經外科', 'brain', 15),
  ('surgeonexam', '消化外科', 'stomach', 16),
  ('surgeonexam', '整形外科', 'hand.raised.fill', 17);

-- 3. Questions table (unified schema for all apps)
CREATE TABLE questions (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]',
  answer INTEGER NOT NULL,
  correct_answers JSONB,
  is_multiple_choice BOOLEAN DEFAULT false,
  explanation_encrypted TEXT DEFAULT '',
  category TEXT NOT NULL,
  subcategory TEXT DEFAULT '',
  difficulty INTEGER DEFAULT 2,
  tags JSONB DEFAULT '[]',
  image_name TEXT,
  source TEXT,
  version TEXT DEFAULT '1.0',
  group_id TEXT,
  group_order INTEGER,
  is_published BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_questions_app_id ON questions(app_id);
CREATE INDEX idx_questions_app_category ON questions(app_id, category);
CREATE INDEX idx_questions_app_updated ON questions(app_id, updated_at);
CREATE INDEX idx_questions_app_published ON questions(app_id, is_published);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER questions_updated_at
  BEFORE UPDATE ON questions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- 4. Sync manifest (replaces manifest.json)
CREATE TABLE sync_manifest (
  app_id TEXT PRIMARY KEY REFERENCES apps(id) ON DELETE CASCADE,
  version TEXT NOT NULL DEFAULT '1.0',
  last_updated TIMESTAMPTZ DEFAULT now(),
  total_questions INTEGER DEFAULT 0
);

INSERT INTO sync_manifest (app_id, version, total_questions) VALUES
  ('npexam', '1.1', 3224),
  ('nurseexam', '2.2', 4185),
  ('surgeonexam', '2026.02.22', 2295);

-- 5. Question images (for SurgeonExamPro)
CREATE TABLE question_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  checksum TEXT NOT NULL,
  size_bytes INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(app_id, file_name)
);

-- 6. Admin users (profile linked to auth.users)
CREATE TABLE admin_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  role TEXT DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Row Level Security (RLS)
-- ============================================

-- Apps: public read, admin write
ALTER TABLE apps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read apps"
  ON apps FOR SELECT
  USING (true);

CREATE POLICY "Admin write apps"
  ON apps FOR ALL
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

-- Categories: public read, admin write
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read categories"
  ON categories FOR SELECT
  USING (true);

CREATE POLICY "Admin write categories"
  ON categories FOR ALL
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

-- Questions: public read published, admin full access
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read published questions"
  ON questions FOR SELECT
  USING (is_published = true);

CREATE POLICY "Admin full access questions"
  ON questions FOR ALL
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

-- Sync manifest: public read, admin write
ALTER TABLE sync_manifest ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read sync_manifest"
  ON sync_manifest FOR SELECT
  USING (true);

CREATE POLICY "Admin write sync_manifest"
  ON sync_manifest FOR ALL
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

-- Question images: public read, admin write
ALTER TABLE question_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read question_images"
  ON question_images FOR SELECT
  USING (true);

CREATE POLICY "Admin write question_images"
  ON question_images FOR ALL
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

-- Admin users: only self-read
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read own profile"
  ON admin_users FOR SELECT
  USING (id = auth.uid());

-- ============================================
-- Helper function: bump sync version after question changes
-- ============================================
CREATE OR REPLACE FUNCTION bump_sync_version()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE sync_manifest
  SET
    version = to_char(now(), 'YYYY.MM.DD.HH24MI'),
    last_updated = now(),
    total_questions = (
      SELECT COUNT(*) FROM questions
      WHERE app_id = COALESCE(NEW.app_id, OLD.app_id)
      AND is_published = true
    )
  WHERE app_id = COALESCE(NEW.app_id, OLD.app_id);

  UPDATE apps
  SET
    total_questions = (
      SELECT COUNT(*) FROM questions
      WHERE app_id = COALESCE(NEW.app_id, OLD.app_id)
      AND is_published = true
    ),
    last_updated = now()
  WHERE id = COALESCE(NEW.app_id, OLD.app_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER questions_sync_bump
  AFTER INSERT OR UPDATE OR DELETE ON questions
  FOR EACH ROW
  EXECUTE FUNCTION bump_sync_version();

-- ============================================
-- Helper function: update category question counts
-- ============================================
CREATE OR REPLACE FUNCTION update_category_count()
RETURNS TRIGGER AS $$
BEGIN
  -- Update for the new category (if INSERT or UPDATE)
  IF NEW IS NOT NULL THEN
    UPDATE categories
    SET question_count = (
      SELECT COUNT(*) FROM questions
      WHERE app_id = NEW.app_id AND category = NEW.category AND is_published = true
    )
    WHERE app_id = NEW.app_id AND name = NEW.category;
  END IF;

  -- Update for the old category (if DELETE or UPDATE changed category)
  IF OLD IS NOT NULL AND (NEW IS NULL OR OLD.category != NEW.category OR OLD.app_id != NEW.app_id) THEN
    UPDATE categories
    SET question_count = (
      SELECT COUNT(*) FROM questions
      WHERE app_id = OLD.app_id AND category = OLD.category AND is_published = true
    )
    WHERE app_id = OLD.app_id AND name = OLD.category;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER questions_category_count
  AFTER INSERT OR UPDATE OR DELETE ON questions
  FOR EACH ROW
  EXECUTE FUNCTION update_category_count();
