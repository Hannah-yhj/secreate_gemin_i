-- products/benefits/rules/sources는 로그인 없이도 앱에서 카드 목록을 볼 수 있어야 하는 공개 카탈로그 데이터.
-- RLS는 켜져 있지만 읽기 정책이 없어서 anon 키로는 항상 0건이 조회되고 있었음 (api/benefits.js가 db.json으로 조용히 폴백).
-- 쓰기는 여전히 service_role 전용 RPC 함수(insert_new_card/update_existing_card)를 통해서만 가능하므로 안전함.

alter table products enable row level security;
alter table benefits enable row level security;
alter table rules enable row level security;
alter table sources enable row level security;

drop policy if exists "public read" on products;
drop policy if exists "public read" on benefits;
drop policy if exists "public read" on rules;
drop policy if exists "public read" on sources;

create policy "public read" on products for select using (true);
create policy "public read" on benefits for select using (true);
create policy "public read" on rules for select using (true);
create policy "public read" on sources for select using (true);
