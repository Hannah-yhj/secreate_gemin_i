-- sources 테이블에 product_id를 직접 연결 (업로드 이력이 남아도 어떤 카드였는지 항상 추적 가능하게)
-- 0001_card_upload_pipeline.sql 실행 이후에 적용하세요.

alter table sources
  add column if not exists product_id text references products (product_id);

-- insert_new_card / update_existing_card 가 sources INSERT 시 product_id도 함께 채우도록 재정의
create or replace function insert_new_card(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_id text;
begin
  v_product_id := payload->'product'->>'product_id';

  insert into sources (
    source_id, source_type, title, file_name, source_url,
    published_or_reviewed_date, note, document_hash, product_id
  ) values (
    payload->'source'->>'source_id',
    payload->'source'->>'source_type',
    payload->'source'->>'title',
    payload->'source'->>'file_name',
    payload->'source'->>'source_url',
    (payload->'source'->>'published_or_reviewed_date')::date,
    payload->'source'->>'note',
    payload->'source'->>'document_hash',
    v_product_id
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
    published_or_reviewed_date, note, document_hash, product_id
  ) values (
    payload->'source'->>'source_id',
    payload->'source'->>'source_type',
    payload->'source'->>'title',
    payload->'source'->>'file_name',
    payload->'source'->>'source_url',
    (payload->'source'->>'published_or_reviewed_date')::date,
    payload->'source'->>'note',
    payload->'source'->>'document_hash',
    v_product_id
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
