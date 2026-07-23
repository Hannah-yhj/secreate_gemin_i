const fs = require('fs');

let appJsCode = fs.readFileSync('app.js', 'utf8');
let uiJsCode = fs.readFileSync('ui.js', 'utf8');

let evalEnv = `
  const FUEL_PRICE = 1650;
  ${appJsCode}
  
  const document = { createElement: () => ({ classList: { add:()=>{} }, style:{} }) };
  const window = { supabase: {}, location: { search: '' } };
  ${uiJsCode.replace(/window\.addEventListener.*/g, '')}

  const db = JSON.parse(fs.readFileSync('db.json', 'utf8'));
  console.time('Engine.init');
  Engine.init(db);
  console.timeEnd('Engine.init');
  
  S.q.category = '외식';
  S.q.brand = '';
  S.q.amount = 30000;
  S.wallet = db.products.map(p => p.product_id);
  
  const input = {
    brand: null,
    category: '외식',
    amount: 30000,
    channel: null,
    date: new Date(),
    time: null,
  };
  
  console.time('Engine.buildCombos 100 times');
  for (let i = 0; i < 100; i++) {
    Engine.buildCombos(input, engineState(), effectiveWallet());
  }
  console.timeEnd('Engine.buildCombos 100 times');
  
  const combos = Engine.buildCombos(input, engineState(), effectiveWallet());
  
  console.time('receiptHtml 100 times');
  for (let i = 0; i < 100; i++) {
    receiptHtml(combos[0], 0);
  }
  console.timeEnd('receiptHtml 100 times');
`;

eval(evalEnv);
