-- 카드 약관 자동 등록 파이프라인 — Supabase SQL 마이그레이션
-- Supabase 대시보드 > SQL Editor 에서 전체를 그대로 실행하세요.
-- 실행 후 "1단계 검증" 섹션(파일 하단 주석)을 따라 반드시 확인해주세요.

-- ============================================================
-- 1. sources 테이블에 document_hash / created_at 컬럼 추가
-- ============================================================
alter table sources
  add column if not exists document_hash text,
  add column if not exists created_at timestamptz not null default now();

-- 동일 document_hash 중복 저장 방지 (기존 row는 해시가 없으므로 partial index)
create unique index if not exists sources_document_hash_uq
  on sources (document_hash)
  where document_hash is not null;

-- ============================================================
-- 2. product_aliases 신규 테이블
-- ============================================================
create table if not exists product_aliases (
  alias_id text primary key,
  product_id text not null references products (product_id) on delete cascade,
  provider text not null,
  alias text not null,
  match_type text not null check (match_type in ('official', 'manual', 'AI', 'user')),
  created_at timestamptz not null default now(),
  unique (product_id, alias)
);

-- ============================================================
-- 3. insert_new_card(payload jsonb) — 신규 카드 원자적 등록
--    sources -> products -> benefits[] -> rules[] -> product_aliases[]
-- ============================================================
create or replace function insert_new_card(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_id text;
begin
  insert into sources (
    source_id, source_type, title, file_name, source_url,
    published_or_reviewed_date, note, document_hash
  ) values (
    payload->'source'->>'source_id',
    payload->'source'->>'source_type',
    payload->'source'->>'title',
    payload->'source'->>'file_name',
    payload->'source'->>'source_url',
    (payload->'source'->>'published_or_reviewed_date')::date,
    payload->'source'->>'note',
    payload->'source'->>'document_hash'
  );

  insert into products (
    product_id, product_type, product_name, provider, service_type,
    supported_funding, eligibility, data_status, source_id
  ) values (
    payload->'product'->>'product_id',
    payload->'product'->>'product_type',
    payload->'product'->>'product_name',
    payload->'product'->>'provider',
    payload->'product'->>'service_type',
    payload->'product'->>'supported_funding',
    payload->'product'->>'eligibility',
    payload->'product'->>'data_status',
    payload->'product'->>'source_id'
  )
  returning product_id into v_product_id;

  insert into benefits (
    benefit_id, product_id, benefit_name, category, merchant_scope_type, merchants_or_scope,
    benefit_type, benefit_value, benefit_unit, min_payment, per_tx_discount_limit,
    monthly_discount_limit, annual_discount_limit, limit_group_id, spend_min, spend_max,
    frequency_period, frequency_count, eligible_days, time_start, time_end, payment_channel,
    required_funding_method, requires_coupon, user_segment, option_group_id, option_value,
    stackable, application_order, start_date, end_date, exclusions_summary, raw_condition_note,
    source_id, confidence
  )
  select
    x->>'benefit_id', x->>'product_id', x->>'benefit_name', x->>'category', x->>'merchant_scope_type', x->>'merchants_or_scope',
    x->>'benefit_type', (x->>'benefit_value')::numeric, x->>'benefit_unit', (x->>'min_payment')::numeric, (x->>'per_tx_discount_limit')::numeric,
    (x->>'monthly_discount_limit')::numeric, (x->>'annual_discount_limit')::numeric, x->>'limit_group_id', (x->>'spend_min')::numeric, (x->>'spend_max')::numeric,
    x->>'frequency_period', (x->>'frequency_count')::int, x->>'eligible_days', x->>'time_start', x->>'time_end', x->>'payment_channel',
    x->>'required_funding_method', coalesce((x->>'requires_coupon')::boolean, false), x->>'user_segment', x->>'option_group_id', x->>'option_value',
    coalesce((x->>'stackable')::boolean, true), (x->>'application_order')::int, (x->>'start_date')::date, (x->>'end_date')::date, x->>'exclusions_summary', x->>'raw_condition_note',
    x->>'source_id', x->>'confidence'
  from jsonb_array_elements(payload->'benefits') as x;

  insert into rules (
    rule_id, product_id, rule_type, scope_id, rule_expression, ui_message, source_id, priority
  )
  select
    x->>'rule_id', x->>'product_id', x->>'rule_type', x->>'scope_id', x->>'rule_expression', x->>'ui_message', x->>'source_id', x->>'priority'
  from jsonb_array_elements(payload->'rules') as x;

  insert into product_aliases (alias_id, product_id, provider, alias, match_type)
  select
    x->>'alias_id', x->>'product_id', x->>'provider', x->>'alias', x->>'match_type'
  from jsonb_array_elements(payload->'aliases') as x
  on conflict (product_id, alias) do nothing;

  return jsonb_build_object('product_id', v_product_id, 'status', 'new');
end;
$$;

-- ============================================================
-- 4. update_existing_card(payload jsonb) — 기존 카드 최신 약관 갱신
--    sources INSERT -> products UPDATE -> benefits/rules 교체
-- ============================================================
create or replace function update_existing_card(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_id text := payload->'product'->>'product_id';
begin
  if v_product_id is null then
    raise exception 'update_existing_card: payload.product.product_id is required';
  end if;

  insert into sources (
    source_id, source_type, title, file_name, source_url,
    published_or_reviewed_date, note, document_hash
  ) values (
    payload->'source'->>'source_id',
    payload->'source'->>'source_type',
    payload->'source'->>'title',
    payload->'source'->>'file_name',
    payload->'source'->>'source_url',
    (payload->'source'->>'published_or_reviewed_date')::date,
    payload->'source'->>'note',
    payload->'source'->>'document_hash'
  );

  update products set
    product_type = payload->'product'->>'product_type',
    product_name = payload->'product'->>'product_name',
    provider = payload->'product'->>'provider',
    service_type = payload->'product'->>'service_type',
    supported_funding = payload->'product'->>'supported_funding',
    eligibility = payload->'product'->>'eligibility',
    data_status = payload->'product'->>'data_status',
    source_id = payload->'product'->>'source_id'
  where product_id = v_product_id;

  if not found then
    raise exception 'update_existing_card: no product found for product_id %', v_product_id;
  end if;

  delete from benefits where product_id = v_product_id;
  delete from rules where product_id = v_product_id;

  insert into benefits (
    benefit_id, product_id, benefit_name, category, merchant_scope_type, merchants_or_scope,
    benefit_type, benefit_value, benefit_unit, min_payment, per_tx_discount_limit,
    monthly_discount_limit, annual_discount_limit, limit_group_id, spend_min, spend_max,
    frequency_period, frequency_count, eligible_days, time_start, time_end, payment_channel,
    required_funding_method, requires_coupon, user_segment, option_group_id, option_value,
    stackable, application_order, start_date, end_date, exclusions_summary, raw_condition_note,
    source_id, confidence
  )
  select
    x->>'benefit_id', x->>'product_id', x->>'benefit_name', x->>'category', x->>'merchant_scope_type', x->>'merchants_or_scope',
    x->>'benefit_type', (x->>'benefit_value')::numeric, x->>'benefit_unit', (x->>'min_payment')::numeric, (x->>'per_tx_discount_limit')::numeric,
    (x->>'monthly_discount_limit')::numeric, (x->>'annual_discount_limit')::numeric, x->>'limit_group_id', (x->>'spend_min')::numeric, (x->>'spend_max')::numeric,
    x->>'frequency_period', (x->>'frequency_count')::int, x->>'eligible_days', x->>'time_start', x->>'time_end', x->>'payment_channel',
    x->>'required_funding_method', coalesce((x->>'requires_coupon')::boolean, false), x->>'user_segment', x->>'option_group_id', x->>'option_value',
    coalesce((x->>'stackable')::boolean, true), (x->>'application_order')::int, (x->>'start_date')::date, (x->>'end_date')::date, x->>'exclusions_summary', x->>'raw_condition_note',
    x->>'source_id', x->>'confidence'
  from jsonb_array_elements(payload->'benefits') as x;

  insert into rules (
    rule_id, product_id, rule_type, scope_id, rule_expression, ui_message, source_id, priority
  )
  select
    x->>'rule_id', x->>'product_id', x->>'rule_type', x->>'scope_id', x->>'rule_expression', x->>'ui_message', x->>'source_id', x->>'priority'
  from jsonb_array_elements(payload->'rules') as x;

  insert into product_aliases (alias_id, product_id, provider, alias, match_type)
  select
    x->>'alias_id', x->>'product_id', x->>'provider', x->>'alias', x->>'match_type'
  from jsonb_array_elements(coalesce(payload->'aliases', '[]'::jsonb)) as x
  on conflict (product_id, alias) do nothing;

  return jsonb_build_object('product_id', v_product_id, 'status', 'updated');
end;
$$;

-- ============================================================
-- 5. 권한: service_role만 호출 가능 (anon/authenticated 차단)
-- ============================================================
revoke all on function insert_new_card(jsonb) from public;
revoke all on function update_existing_card(jsonb) from public;
grant execute on function insert_new_card(jsonb) to service_role;
grant execute on function update_existing_card(jsonb) to service_role;

-- ============================================================
-- 1단계 검증 (SQL Editor에서 순서대로 실행, 확인 후 정리)
-- ============================================================
-- (a) 신규 카드 삽입 테스트:
-- select insert_new_card('{
--   "source": {"source_id":"SRC_TEST_001","source_type":"PDF","title":"테스트","file_name":"t.pdf","source_url":null,"published_or_reviewed_date":"2026-07-17","note":"test","document_hash":"deadbeef"},
--   "product": {"product_id":"P_TEST_001","product_type":"신용카드","product_name":"테스트카드","provider":"테스트카드사","service_type":"카드","supported_funding":"Local","eligibility":"본인회원","data_status":"활성","source_id":"SRC_TEST_001"},
--   "benefits": [{"benefit_id":"B_TEST_001","product_id":"P_TEST_001","benefit_name":"테스트혜택","category":"외식","benefit_type":"청구할인","benefit_value":10,"benefit_unit":"%","source_id":"SRC_TEST_001","confidence":"high"}],
--   "rules": [],
--   "aliases": [{"alias_id":"AL_TEST_001","product_id":"P_TEST_001","provider":"테스트카드사","alias":"테스트카드","match_type":"AI"}]
-- }'::jsonb);
-- -> {"status": "new", "product_id": "P_TEST_001"} 확인, products/benefits/product_aliases/sources에 row 확인

-- (b) 롤백 확인: product_id를 이미 있는 값(P_TEST_001)으로 다시 insert_new_card 호출
--     -> products PK 충돌로 에러 발생해야 하고, 이때 새로 추가하려던 sources row도 남아있으면 안 됨(전부 롤백)
--     select count(*) from sources where document_hash = 'deadbeef'; -- 반드시 1 (재시도 실패분은 없어야 함)

-- (c) 정리:
-- delete from benefits where product_id = 'P_TEST_001';
-- delete from product_aliases where product_id = 'P_TEST_001';
-- delete from products where product_id = 'P_TEST_001';
-- delete from sources where source_id = 'SRC_TEST_001';
