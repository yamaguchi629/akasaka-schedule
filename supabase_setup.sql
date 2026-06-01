-- Supabase でこのSQLを実行してください（SQL Editor）

CREATE TABLE reservations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_name TEXT NOT NULL,
  line_user_id TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス（日時検索を高速化）
CREATE INDEX idx_reservations_start_time ON reservations (start_time);

-- Row Level Security（RLS）
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

-- 誰でも読める（カレンダー表示用）
CREATE POLICY "Public read" ON reservations
  FOR SELECT USING (true);

-- サービスロールキーのみ書き込み可（Netlify Functions経由）
-- ※ service_role はRLSをバイパスするため追加ポリシー不要
