-- ============================================================
-- 食卓帖 写真の複数枚対応
-- Supabase の SQL Editor に貼り付けて Run
-- ============================================================

-- 写真を配列で持つ列を追加（{"src":"data:image...","pos":"50% 50%"} の並び）
alter table meals add column if not exists photos jsonb not null default '[]'::jsonb;
alter table shops add column if not exists photos jsonb not null default '[]'::jsonb;

-- これまでの1枚を新しい列へ移す
update meals
set photos = jsonb_build_array(jsonb_build_object('src', photo, 'pos', '50% 50%'))
where photo is not null and photos = '[]'::jsonb;

update shops
set photos = jsonb_build_array(jsonb_build_object('src', photo, 'pos', '50% 50%'))
where photo is not null and photos = '[]'::jsonb;
