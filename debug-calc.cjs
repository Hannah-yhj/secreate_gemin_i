const fs = require('fs');

let appJsCode = fs.readFileSync('app.js', 'utf8');
let uiJsCode = fs.readFileSync('ui.js', 'utf8');

let evalEnv = `
  const FUEL_PRICE = 1650;
  ${appJsCode}
  
  // Mock DOM functions
  const document = {
    createElement: () => ({ classList: { add:()=>{} }, style:{} })
  };
  const window = {
    supabase: {},
    location: { search: '' }
  };
  function $(sel) { return null; }
  function $$(sel) { return []; }
  
  ${uiJsCode.replace(/window\.addEventListener.*/g, '')}

  const db = JSON.parse(fs.readFileSync('db.json', 'utf8'));
  Engine.init(db);
  
  S.q.category = '외식';
  S.q.brand = '';
  S.q.amount = 30000;
  S.wallet = db.products.map(p => p.product_id); // all cards
  
  try {
    const input = {
      brand: S.q.brand || null,
      category: S.q.brand ? null : S.q.category,
      amount: S.q.amount,
      channel: S.q.channel || null,
      date: new Date(),
      time: S.q.time || null,
    };
    const combos = Engine.buildCombos(input, engineState(), effectiveWallet());
    console.log("Combos count:", combos.length);
    
    // test receiptHtml on first combo
    if(combos.length > 0) {
      const html = receiptHtml(combos[0], 0);
      console.log("receiptHtml generated successfully. Length:", html.length);
    }
  } catch (e) {
    console.error("ERROR IN RENDER:", e.message);
    console.error(e.stack);
  }
`;

eval(evalEnv);
