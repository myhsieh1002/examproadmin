-- ============================================================
-- 修復 admin_users RLS 無限遞迴 (影響所有 3 個 App)
-- 執行位置：Supabase Dashboard → SQL Editor
-- 日期：2026-03-25
-- ============================================================

-- ============ Step 1: 修復 admin_users 表自我引用 ============

-- 移除造成遞迴的 policy
DROP POLICY IF EXISTS "Super admin manage users" ON admin_users;

-- 重建：改用 SECURITY DEFINER function 查詢 admin_users，繞過 RLS 檢查
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin_users
    WHERE id = auth.uid() AND role = 'super_admin'
  );
$$;

-- 用 function 重建 policy（function 以 SECURITY DEFINER 執行，不觸發 RLS）
CREATE POLICY "Super admin manage users" ON admin_users
  FOR ALL USING (is_super_admin());

-- ============ Step 2: 修復其他表的 admin policy ============
-- 這些表的 admin ALL policy 也查詢 admin_users，
-- 現在 admin_users 已修復所以不會遞迴了，
-- 但為了一致性，也改用 helper function。

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin_users
    WHERE id = auth.uid()
  );
$$;

-- apps
DROP POLICY IF EXISTS "Admin write apps" ON apps;
CREATE POLICY "Admin write apps" ON apps
  FOR ALL USING (is_admin());

-- categories
DROP POLICY IF EXISTS "Admin write categories" ON categories;
CREATE POLICY "Admin write categories" ON categories
  FOR ALL USING (is_admin());

-- questions
DROP POLICY IF EXISTS "Admin full access questions" ON questions;
CREATE POLICY "Admin full access questions" ON questions
  FOR ALL USING (is_admin());

-- sync_manifest
DROP POLICY IF EXISTS "Admin write sync_manifest" ON sync_manifest;
CREATE POLICY "Admin write sync_manifest" ON sync_manifest
  FOR ALL USING (is_admin());

-- question_images
DROP POLICY IF EXISTS "Admin write question_images" ON question_images;
CREATE POLICY "Admin write question_images" ON question_images
  FOR ALL USING (is_admin());

-- ============ Step 3: 驗證 ============
-- 以下查詢應正常回傳結果，不再報錯

-- nurseexam
SELECT 'nurseexam' AS app, version, total_questions FROM sync_manifest WHERE app_id = 'nurseexam';

-- npexam
SELECT 'npexam' AS app, version, total_questions FROM sync_manifest WHERE app_id = 'npexam';

-- surgeonexam
SELECT 'surgeonexam' AS app, version, total_questions FROM sync_manifest WHERE app_id = 'surgeonexam';

-- 題目數量確認
SELECT app_id, count(*) AS published_count
FROM questions
WHERE is_published = true
GROUP BY app_id
ORDER BY app_id;
