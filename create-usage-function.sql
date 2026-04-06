-- Function to get database usage stats
-- Run this in Supabase SQL Editor

CREATE OR REPLACE FUNCTION get_db_usage()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'database_size_bytes', pg_database_size(current_database()),
    'tables', (
      SELECT json_agg(json_build_object(
        'table_name', t.table_name,
        'size_bytes', pg_total_relation_size(quote_ident(t.table_name)),
        'row_count', (
          SELECT reltuples::bigint
          FROM pg_class
          WHERE relname = t.table_name
        )
      ))
      FROM (
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        ORDER BY pg_total_relation_size(quote_ident(table_name)) DESC
      ) t
    )
  ) INTO result;
  RETURN result;
END;
$$;
