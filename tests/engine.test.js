import { describe, it, expect, beforeEach } from 'vitest';
import { Engine } from '../lib/engine.js';

describe('결제 엔진 (Engine) 테스트', () => {
  // 테스트용 모의 데이터 (Mock DB)
  const mockDB = {
    products: [
      { product_id: 'C_STARBUCKS', product_name: '스타벅스 스페셜 카드', provider: '테스트카드', service_type: '카드' },
      { product_id: 'C_OFFLINE_ONLY', product_name: '오프라인 전용 카드', provider: '테스트카드', service_type: '카드' }
    ],
    benefits: [
      {
        product_id: 'C_STARBUCKS',
        benefit_id: 'B_1',
        benefit_name: '스타벅스 50% 할인',
        category: '외식',
        merchant_scope_type: 'merchant',
        merchants_or_scope: '스타벅스',
        benefit_type: '청구할인',
        benefit_value: 50,
        benefit_unit: '%',
        min_payment: 10000, // 최소 10,000원 결제 시
        per_tx_discount_limit: 5000, // 건당 최대 5,000원 한도
        monthly_discount_limit: null,
      },
      {
        product_id: 'C_OFFLINE_ONLY',
        benefit_id: 'B_2',
        benefit_name: '오프라인 음식점 10% 할인',
        category: '외식',
        merchant_scope_type: 'mixed',
        merchants_or_scope: '외식 업종',
        benefit_type: '청구할인',
        benefit_value: 10,
        benefit_unit: '%',
        payment_channel: '오프라인', // 오프라인 전용
      }
    ],
    sources: [],
    rules: []
  };

  const wallet = ['C_STARBUCKS', 'C_OFFLINE_ONLY'];
  const state = { spend: {}, grade: null };

  beforeEach(() => {
    Engine.init(mockDB);
  });

  it('1. 할인 금액 및 한도 계산 테스트 (50% 할인, 건당 한도 5000원)', () => {
    // 15,000원의 50% = 7,500원이지만, 건당 한도가 5,000원이므로 5,000원만 할인되어야 함.
    const input = { brand: '스타벅스', category: '외식', amount: 15000, channel: 'offline', date: new Date() };
    const combos = Engine.buildCombos(input, state, wallet);
    
    // 스타벅스 카드가 1순위로 와야 함
    expect(combos.length).toBeGreaterThan(0);
    const starbucksCombo = combos.find(c => c.product.product_id === 'C_STARBUCKS');
    expect(starbucksCombo).toBeDefined();
    
    // 최종 할인액이 5000원이어야 함
    expect(starbucksCombo.total).toBe(5000);
    expect(starbucksCombo.status).toBe('eligible');
  });

  it('2. 최소 결제 금액 미달 시 할인 제외 (min_payment)', () => {
    // 9,000원은 최소 10,000원 조건 미달이므로 적용되지 않아야 함.
    const input = { brand: '스타벅스', category: '외식', amount: 9000, channel: 'offline', date: new Date() };
    const combos = Engine.buildCombos(input, state, wallet);
    
    const starbucksCombo = combos.find(c => c.product.product_id === 'C_STARBUCKS');
    // 조건 미달로 인해 제외되었으므로 결과에 없어야 함
    expect(starbucksCombo).toBeUndefined();
  });

  it('3. 오프라인 전용 카드를 온라인에서 결제 시 제외', () => {
    // 오프라인 전용 혜택인데 온라인으로 결제
    const input = { brand: '스타벅스', category: '외식', amount: 20000, channel: 'online', date: new Date() };
    const combos = Engine.buildCombos(input, state, wallet);
    
    const offlineCombo = combos.find(c => c.product.product_id === 'C_OFFLINE_ONLY');
    // 조건 미달로 인해 제외되어야 함
    expect(offlineCombo).toBeUndefined();
  });

  it('4. 오프라인 전용 카드를 정상적으로 오프라인에서 결제 시 적용', () => {
    const input = { brand: '스타벅스', category: '외식', amount: 20000, channel: 'offline', date: new Date() };
    const combos = Engine.buildCombos(input, state, wallet);
    
    const offlineCombo = combos.find(c => c.product.product_id === 'C_OFFLINE_ONLY');
    expect(offlineCombo).toBeDefined();
    // 20000원의 10% = 2000원
    expect(offlineCombo.total).toBe(2000);
  });
});
