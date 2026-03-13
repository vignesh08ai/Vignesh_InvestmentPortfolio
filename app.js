/* ═══════════════════════════════════════════════════════
   INVESTMENT PORTFOLIO  app.js  v4  — Dark Premium Edition
   Features: Live data · Add · Edit · Delete · Excel Import/Export
             Total Value + Gain/Loss + Daily Gain/Loss on all pages
             Daily Gain/Loss dashboard tile · Fixed search bar
═══════════════════════════════════════════════════════ */
'use strict';

let PORTFOLIO   = null;
let LIVE        = {};
let activePanel = 'dashboard';
let sortState   = {};
let filterState = {};
let chartStore  = {};
let _editIdx    = null;
let _editType   = null;

/* ═══════════════════════════════════════════════════════
   LIVE DATA CONFIG
   Set PROXY_URL to your deployed Google Apps Script URL
   e.g. 'https://script.google.com/macros/s/YOUR_ID/exec'
═══════════════════════════════════════════════════════ */
const PROXY_URL = 'https://script.google.com/macros/s/AKfycbzxVL_v_0fkptl3khbVYQm7qk4q0YySn2kWm5KGyWkbnxKkEO4dW_93n8qo8Dd7_AKOOA/exec';  // ← PASTE YOUR APPS SCRIPT URL HERE

const AMFI = 'https://www.amfiindia.com/spages/NAVAll.txt';

/* Symbol corrections for Yahoo Finance */
const SYMBOL_FIXES = {
  'ARE&M.NS':   'AMARAJABAT.NS',
  'TMPV.NS':    'TATAMTRDVR.NS',
  'TMCV.NS':    'TATAMOTORS.NS',
  'goldbees.ns':'GOLDBEES.NS',
};
function fixSymbol(sym) {
  const up = sym.toUpperCase();
  return SYMBOL_FIXES[sym] || SYMBOL_FIXES[up] || up;
}

/* ═══════════════════════════════════════════════════════  LIVE DATA  */
async function fetchAllLiveData() {
  if (PROXY_URL) {
    // MFs via mfapi.in directly (open CORS, fast)
    // Stocks via proxy only (Yahoo Finance blocks browsers)
    await Promise.allSettled([fetchMFNavsDirect(), fetchStocksViaProxy()]);
  } else {
    await Promise.allSettled([fetchMFNavsDirect(), fetchStocksDirect()]);
  }
}

async function fetchStocksViaProxy() {
  const rawSyms = [...new Set([
    ...(PORTFOLIO.stocks||[]).map(s => s.symbol),
    ...(PORTFOLIO.gold||[]).map(g => g.symbol),
    'USDINR=X'
  ])];
  const stocks = rawSyms.map(fixSymbol);
  const fixMap = {};
  rawSyms.forEach(s => { fixMap[fixSymbol(s)] = s; });

  function chunk(arr, n) {
    const out = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i+n));
    return out;
  }

  async function proxyBatch(syms) {
    // Encode each symbol separately so & in symbols (e.g. ARE&M.NS) doesn't break the URL
    const url = PROXY_URL + '?action=batch&stocks=' + syms.map(encodeURIComponent).join('%2C');
    const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
    if (!res.ok) throw new Error('Proxy ' + res.status);
    const json = await res.json();
    if (json.status !== 'ok') throw new Error(json.message);
    return json.data || {};
  }

  try {
    const batches = chunk(stocks, 15);
    const results = await Promise.allSettled(batches.map(b => proxyBatch(b)));
    let hits = 0;
    results.forEach(r => {
      if (r.status !== 'fulfilled') return;
      const data = r.value;
      stocks.forEach(sym => {
        if (data[sym]) {
          const orig = fixMap[sym] || sym;
          LIVE[orig] = data[sym];
          if (orig !== sym) LIVE[sym] = data[sym];
          hits++;
        }
      });
    });
    console.log('[PROXY] Stocks loaded:', hits);
  } catch(e) {
    console.error('[PROXY] Failed:', e.message);
  }
}


/* ── DIRECT PATH (no proxy, uses mfapi.in for MFs) ── */
async function fetchMFNavsDirect() {
  const codes = [...new Set(PORTFOLIO.mutualFunds.map(m => m.schemeCode))];
  let hits = 0;
  await Promise.allSettled(codes.map(async code => {
    try {
      const res = await fetch(`https://api.mfapi.in/mf/${code}/latest`, {
        signal: AbortSignal.timeout(10000)
      });
      if (!res.ok) return;
      const json = await res.json();
      const nav = parseFloat(json?.data?.[0]?.nav);
      const prevNav = parseFloat(json?.data?.[1]?.nav);
      if (!isNaN(nav) && nav > 0) {
        const mf = PORTFOLIO.mutualFunds.find(m => m.schemeCode === code);
        const prev = (!isNaN(prevNav) && prevNav > 0) ? prevNav : (mf?.currentNAV || nav);
        LIVE[code] = { price: nav, prev };
        hits++;
      }
    } catch(e) {}
  }));
  console.log(`[MF Direct] ${hits}/${codes.length} NAVs loaded`);
}

async function fetchStocksDirect() {
  // Without a proxy, Yahoo Finance blocks browser requests.
  // Stocks will show as cached until PROXY_URL is configured.
  console.warn('[Stocks] No proxy configured — stocks will show cached prices. Set PROXY_URL in app.js.');
}

function getUsdInr() { return LIVE['USDINR=X']?.price || 84; }

const STORAGE_KEY = 'portfolio_data_v1';
const GITHUB_TOKEN_KEY = 'github_token';
const GITHUB_REPO = 'vignesh08ai/Vignesh_InvestmentPortfolio';
const GITHUB_FILE_PATH = 'portfolio.json';
const COLUMN_VISIBILITY_KEY = 'column_visibility_v1';

/* ═══════════════════════════════════════════════════════  BOOT  */
window.addEventListener('DOMContentLoaded', async () => {
  showSpinner('Loading portfolio…');
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      PORTFOLIO = JSON.parse(saved);
    } else {
      PORTFOLIO = await fetch('./portfolio.json').then(r => r.json());
    }
    buildNav();
    buildSummaryCards();
    showPanel('dashboard');
    try {
      await fetchAllLiveData();
      updateSummaryCards();
      showPanel('dashboard');
      showToast('✓ Live prices loaded', 'success');
      document.getElementById('statusDot').className = 'status-dot live';
    } catch(liveErr) {
      showToast('⚠ Live prices unavailable', 'warning');
    }
  } catch(e) {
    showToast('⚠ Could not load portfolio data', 'error');
  }
  hideSpinner();
  document.getElementById('lastUpdated').textContent = 'Updated: ' + new Date().toLocaleTimeString('en-IN');
});

function saveToStorage() { localStorage.setItem(STORAGE_KEY, JSON.stringify(PORTFOLIO)); }



/* ═══════════════════════════════════════════════════════  CALCULATIONS  */
function calcMF(mf) {
  const live = LIVE[mf.schemeCode];
  const curNAV = live ? live.price : (mf.currentNAV || mf.purchaseNAV);
  const curVal = curNAV * mf.units;
  const gl = curVal - mf.invested;
  // For daily GL: use live prev if available, else fall back to stored currentNAV (last saved NAV),
  // else use curNAV itself (so daily GL = 0 rather than a misleading number)
  const prevNAV = live?.prev || mf.currentNAV || curNAV;
  const prevVal = prevNAV * mf.units;
  const dailyGL = live ? (curVal - prevVal) : 0;
  return { curNAV, curVal, gl, ret:(gl/mf.invested)*100, dailyGL, isLive:!!live };
}
function calcStock(s) {
  const live = LIVE[s.symbol];
  const curPrice = live ? live.price : s.avgPrice;
  const curVal = curPrice * s.units;
  const gl = curVal - s.invested;
  const prevPrice = live?.prev || curPrice;
  const prevVal = prevPrice * s.units;
  const dailyGL = live ? (curVal - prevVal) : 0;
  return { curPrice, curVal, gl, ret:(gl/s.invested)*100, dailyGL, isLive:!!live };
}
function calcGold(g) {
  const live = LIVE[g.symbol];
  const useManual = g.manualCurrentValue !== undefined;
  const curPrice = live ? live.price : g.purchasePrice;
  const curVal = useManual ? g.manualCurrentValue : (curPrice * g.units);
  const gl = curVal - g.invested;
  const prevPrice = live?.prev || curPrice;
  const prevVal = prevPrice * g.units;
  const dailyGL = (useManual || !live) ? 0 : (curVal - prevVal);
  return { curPrice, curVal, gl, ret:(gl/g.invested)*100, dailyGL, isManual:useManual, isLive:!!live };
}
function calcFD(fd) {
  const today   = new Date();
  const start   = new Date(fd.startDate);
  const mat     = new Date(fd.maturityDate);
  const elapsed = Math.max(0, Math.round((today-start)/86400000));
  const daysLeft= Math.max(0, Math.round((mat-today)/86400000));
  const accrued = fd.invested*(fd.rate/100)*(elapsed/365);
  const curVal  = fd.invested + accrued;
  const gl      = curVal - fd.invested;
  const dailyGL = fd.invested * (fd.rate/100) / 365;
  return { curVal, gl, daysLeft, ret:(gl/fd.invested)*100, dailyGL };
}

function getAssetTotals() {
  const groups = [
    { label:'Fixed Deposits', icon:'🏛', items:PORTFOLIO.fixedDeposits,
      sum:items=>items.reduce((a,i)=>{const c=calcFD(i);return{inv:a.inv+i.invested,cur:a.cur+c.curVal,dgl:a.dgl+c.dailyGL};},{inv:0,cur:0,dgl:0})},
    { label:'MF — Wealthlite', icon:'📈', items:PORTFOLIO.mutualFunds.filter(m=>m.owner==='Mahesh'),
      sum:items=>items.reduce((a,i)=>{const c=calcMF(i);return{inv:a.inv+i.invested,cur:a.cur+c.curVal,dgl:a.dgl+c.dailyGL};},{inv:0,cur:0,dgl:0})},
    { label:'MF — Family', icon:'👨‍👩‍👧', items:PORTFOLIO.mutualFunds.filter(m=>m.owner==='Family'),
      sum:items=>items.reduce((a,i)=>{const c=calcMF(i);return{inv:a.inv+i.invested,cur:a.cur+c.curVal,dgl:a.dgl+c.dailyGL};},{inv:0,cur:0,dgl:0})},
    { label:'Indian Equity', icon:'📊', items:PORTFOLIO.stocks.filter(s=>s.exchange!=='NASDAQ'),
      sum:items=>items.reduce((a,i)=>{const c=calcStock(i);return{inv:a.inv+i.invested,cur:a.cur+c.curVal,dgl:a.dgl+c.dailyGL};},{inv:0,cur:0,dgl:0})},
    { label:'US Equity', icon:'🇺🇸', items:PORTFOLIO.stocks.filter(s=>s.exchange==='NASDAQ'),
      sum:items=>items.reduce((a,i)=>{const c=calcStock(i);return{inv:a.inv+i.invested,cur:a.cur+c.curVal,dgl:a.dgl+c.dailyGL};},{inv:0,cur:0,dgl:0})},
    { label:'Gold / SGB', icon:'🥇', items:PORTFOLIO.gold||[],
      sum:items=>items.reduce((a,i)=>{const c=calcGold(i);return{inv:a.inv+i.invested,cur:a.cur+c.curVal,dgl:a.dgl+c.dailyGL};},{inv:0,cur:0,dgl:0})},
  ].filter(g=>g.items.length>0);
  return groups.map(g=>{
    const {inv,cur,dgl}=g.sum(g.items); const gl=cur-inv; const ret=inv>0?(gl/inv)*100:0;
    return {...g,inv,cur,gl,dgl,ret};
  });
}
function getPortfolioTotal() {
  const at=getAssetTotals();
  const t=at.reduce((a,g)=>({inv:a.inv+g.inv,cur:a.cur+g.cur,gl:a.gl+g.gl,dgl:a.dgl+g.dgl}),{inv:0,cur:0,gl:0,dgl:0});
  return {...t,ret:t.inv>0?(t.gl/t.inv)*100:0};
}

/* ═══════════════════════════════════════════════════════  SUMMARY CARDS  */
function buildSummaryCards() {
  document.getElementById('summaryGrid').innerHTML = `
    <div class="scard scard-accent"><div class="sc-icon">💼</div><div class="sc-label">Total Portfolio</div><div class="sc-value" id="sc-total-val">—</div><div class="sc-sub" id="sc-total-sub">—</div></div>
    <div class="scard scard-red"><div class="sc-icon">📊</div><div class="sc-label">Total Gain / Loss</div><div class="sc-value" id="sc-gl-val">—</div><div class="sc-sub" id="sc-gl-sub">—</div></div>
    <div class="scard scard-green"><div class="sc-icon">⚡</div><div class="sc-label">Daily Gain / Loss</div><div class="sc-value" id="sc-dgl-val">—</div><div class="sc-sub" id="sc-dgl-sub">—</div></div>
    <div class="scard scard-teal"><div class="sc-icon">🏛</div><div class="sc-label">Fixed Deposits</div><div class="sc-value gain" id="sc-fd-val">—</div><div class="sc-sub gain" id="sc-fd-sub">—</div></div>
    <div class="scard scard-accent"><div class="sc-icon">📈</div><div class="sc-label">Mutual Funds</div><div class="sc-value" id="sc-mf-val">—</div><div class="sc-sub" id="sc-mf-sub">—</div></div>
    <div class="scard scard-purple"><div class="sc-icon">📉</div><div class="sc-label">Stocks</div><div class="sc-value" id="sc-stk-val">—</div><div class="sc-sub" id="sc-stk-sub">—</div></div>
    <div class="scard scard-gold"><div class="sc-icon">🥇</div><div class="sc-label">Gold / SGB</div><div class="sc-value gold" id="sc-gld-val">—</div><div class="sc-sub gold" id="sc-gld-sub">—</div></div>`;
}
function updateSummaryCards() {
  const at=getAssetTotals(), tot=getPortfolioTotal();
  setCard('sc-total',fmtINR(tot.cur),'Invested '+fmtINR(tot.inv),'','');
  setCard('sc-gl',(tot.gl>=0?'+':'')+fmtINR(tot.gl),tot.ret.toFixed(2)+'% return',tot.gl>=0?'gain':'loss',tot.gl>=0?'gain':'loss');
  setCard('sc-dgl',(tot.dgl>=0?'+':'')+fmtINR(tot.dgl),'Today\'s movement',tot.dgl>=0?'gain':'loss',tot.dgl>=0?'gain':'loss');
  const fd=at.find(a=>a.label==='Fixed Deposits');
  const mfm=at.find(a=>a.label==='MF — Wealthlite'), mff=at.find(a=>a.label==='MF — Family');
  const nse=at.find(a=>a.label==='Indian Equity'), nas=at.find(a=>a.label==='US Equity');
  const gld=at.find(a=>a.label==='Gold / SGB');
  if(fd) setCard('sc-fd',fmtINR(fd.cur),'+'+fd.ret.toFixed(2)+'% accrued','gain','gain');
  const mfInv=(mfm?.inv||0)+(mff?.inv||0),mfCur=(mfm?.cur||0)+(mff?.cur||0),mfGL=mfCur-mfInv,mfRet=mfInv>0?(mfGL/mfInv)*100:0;
  setCard('sc-mf',fmtINR(mfCur),(mfGL>=0?'+':'')+mfRet.toFixed(2)+'%',mfGL>=0?'gain':'loss',mfGL>=0?'gain':'loss');
  const sInv=(nse?.inv||0)+(nas?.inv||0),sCur=(nse?.cur||0)+(nas?.cur||0),sGL=sCur-sInv,sRet=sInv>0?(sGL/sInv)*100:0;
  setCard('sc-stk',fmtINR(sCur),(sGL>=0?'+':'')+sRet.toFixed(2)+'%',sGL>=0?'gain':'loss',sGL>=0?'gain':'loss');
  if(gld) setCard('sc-gld',fmtINR(gld.cur),'+'+gld.ret.toFixed(2)+'%','gold','gold');
}
function setCard(id,val,sub,vCls,sCls){
  const v=document.getElementById(id+'-val'),s=document.getElementById(id+'-sub');
  if(v){v.textContent=val;v.className='sc-value '+(vCls||'');}
  if(s){s.textContent=sub;s.className='sc-sub '+(sCls||'');}
}

/* ═══════════════════════════════════════════════════════  NAVIGATION  */
function buildNav() {
  const panels=[
    {id:'dashboard',  label:'Dashboard',     icon:'🏠'},
    {id:'fd',         label:'Fixed Deposits',icon:'🏛',  count:PORTFOLIO.fixedDeposits.length},
    {id:'mf-mahesh',  label:'MF — Wealthlite', icon:'📈',  count:PORTFOLIO.mutualFunds.filter(m=>m.owner==='Mahesh').length},
    {id:'mf-family',  label:'MF — Family',   icon:'👨‍👩‍👧', count:PORTFOLIO.mutualFunds.filter(m=>m.owner==='Family').length},
    {id:'stocks-nse', label:'Indian Equity', icon:'📊',  count:PORTFOLIO.stocks.filter(s=>s.exchange!=='NASDAQ').length},
    {id:'stocks-nas', label:'US Equity',     icon:'🇺🇸', count:PORTFOLIO.stocks.filter(s=>s.exchange==='NASDAQ').length},
    {id:'gold',       label:'Gold / SGB',    icon:'🥇',  count:(PORTFOLIO.gold||[]).length},
  ];
  document.getElementById('sideNav').innerHTML=`<div class="nav-section"><div class="nav-label">Navigation</div>
    ${panels.map(p=>`<button class="nav-item" id="nav-${p.id}" onclick="showPanel('${p.id}')">
      <span class="icon">${p.icon}</span>${p.label}${p.count!=null?`<span class="nav-badge" id="badge-${p.id}">${p.count}</span>`:''}</button>`).join('')}
  </div>`;
}
function updateBadges() {
  const counts={'fd':PORTFOLIO.fixedDeposits.length,'mf-mahesh':PORTFOLIO.mutualFunds.filter(m=>m.owner==='Mahesh').length,'mf-family':PORTFOLIO.mutualFunds.filter(m=>m.owner==='Family').length,'stocks-nse':PORTFOLIO.stocks.filter(s=>s.exchange!=='NASDAQ').length,'stocks-nas':PORTFOLIO.stocks.filter(s=>s.exchange==='NASDAQ').length,'gold':(PORTFOLIO.gold||[]).length};
  Object.entries(counts).forEach(([id,n])=>{const b=document.getElementById('badge-'+id);if(b)b.textContent=n;});
}

/* ═══════════════════════════════════════════════════════  PANEL ROUTER  */
function showPanel(id) {
  activePanel=id;
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const nb=document.getElementById('nav-'+id); if(nb) nb.classList.add('active');
  const summarySection = document.querySelector('.section-title');
  const summaryGrid = document.getElementById('summaryGrid');
  if (id === 'dashboard') {
    if (summarySection) summarySection.style.display = 'block';
    if (summaryGrid) summaryGrid.style.display = 'grid';
  } else {
    if (summarySection) summarySection.style.display = 'none';
    if (summaryGrid) summaryGrid.style.display = 'none';
  }
  Object.keys(chartStore).forEach(k=>{try{chartStore[k].destroy();}catch(e){}});
  chartStore={};
  const mc=document.getElementById('mainContent');
  mc.innerHTML='';
  const div=document.createElement('div');
  div.className='panel active'; div.id='panel-'+id;
  mc.appendChild(div);
  switch(id){
    case 'dashboard':  buildDashboard(div); break;
    case 'fd':         buildFDPanel(div); break;
    case 'mf-mahesh':  buildMFPanel(div,'Mahesh'); break;
    case 'mf-family':  buildMFPanel(div,'Family'); break;
    case 'stocks-nse': buildStocksPanel(div,'NSE'); break;
    case 'stocks-nas': buildStocksPanel(div,'NASDAQ'); break;
    case 'gold':       buildGoldPanel(div); break;
  }
}

/* ═══════════════════════════════════════════════════════  DASHBOARD  */
function buildDashboard(el) {
  const at=getAssetTotals(), tot=getPortfolioTotal();
  el.innerHTML=`
    <div class="chart-card" style="margin-bottom:14px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div class="chart-card-title" style="margin-bottom:0">🎯 Goal Tracker — ₹1 Crore</div>
        <div style="font-family:'Times New Roman',Times,serif;font-size:11px;color:var(--muted)">
          <span style="color:var(--teal);font-weight:700">${fmtINR(tot.cur)}</span>
          <span style="margin:0 6px">of</span>
          <span style="color:var(--gold);font-weight:700">₹1,00,00,000</span>
          <span style="margin-left:10px;color:${tot.cur>=1e7?'var(--teal)':'var(--accent)'}">
            ${tot.cur>=1e7?'🏆 Goal Achieved!':'₹'+((1e7-tot.cur)/1e5).toFixed(1)+'L remaining'}
          </span>
        </div>
      </div>
      <canvas id="dbGoal" height="100"></canvas>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
      <div class="chart-card">
        <div class="chart-card-title">Asset Class Performance</div>
        ${at.map(a=>`<div class="perf-row">
          <span class="perf-icon">${a.icon}</span>
          <span class="perf-label">${a.label}</span>
          <span class="perf-invested">${fmtINR(a.inv)}</span>
          <div class="perf-bar-track"><div class="perf-bar-fill" style="width:${Math.min(Math.abs(a.ret),100)}%;background:${a.gl>=0?'var(--teal)':'var(--red)'}"></div></div>
          <span class="perf-ret ${a.gl>=0?'gain':'loss'}">${a.gl>=0?'+':''}${a.ret.toFixed(2)}%</span>
        </div>`).join('')}
      </div>
      <div class="chart-card"><div class="chart-card-title">Portfolio Allocation</div><canvas id="dbPie" height="220"></canvas></div>
    </div>
    <div class="chart-grid">
      <div class="chart-card"><div class="chart-card-title">Invested vs Current Value</div><canvas id="dbBar"></canvas></div>
      <div class="chart-card"><div class="chart-card-title">Return % by Asset Class</div><canvas id="dbRet"></canvas></div>
    </div>
    <div class="chart-grid" style="margin-top:14px">
      <div class="chart-card"><div class="chart-card-title">Daily Gain / Loss by Asset Class</div><canvas id="dbDailyGL"></canvas></div>
      <div class="chart-card"><div class="chart-card-title">Portfolio Value Breakdown</div><canvas id="dbDoughnut2"></canvas></div>
    </div>`;
  setTimeout(()=>{
    const labels=at.map(a=>a.label);
    const pal=['#00e676','#1db954','#00c853','#b9f6ca','#ff4d6d','#00c853'];
    const tc='rgba(168,188,208,0.7)';
    const gc='rgba(255,255,255,0.04)';
    const bf={family:"'Space Mono',monospace",size:10};

    const GOAL = 1e7; // ₹1 Crore
    const pct = Math.min((tot.cur / GOAL) * 100, 100);
    const milestones = [0, 2000000, 4000000, 6000000, 8000000, GOAL];
    const milestoneLabels = ['₹0','₹20L','₹40L','₹60L','₹80L','₹1 Cr'];
    newChart('dbGoal','line',{
      labels: milestoneLabels,
      datasets:[
        {
          label:'Goal Path',
          data: milestones,
          borderColor:'rgba(29,185,84,0.5)',
          backgroundColor:'rgba(29,185,84,0.06)',
          borderWidth:1, borderDash:[5,4],
          pointRadius:0, fill:true, tension:0.4
        },
        {
          label:'Invested',
          data: [0, null, null, null, null, tot.inv],
          borderColor:'rgba(0,230,118,0.8)',
          backgroundColor:'rgba(0,230,118,0.12)',
          borderWidth:2, pointRadius:[0,0,0,0,0,5],
          pointBackgroundColor:'rgba(0,230,118,1)',
          fill:true, tension:0.4, spanGaps:true
        },
        {
          label:'Current Value',
          data: milestones.map(m => m <= tot.cur ? m : (m === milestones.find(x => x > tot.cur) ? tot.cur : null)),
          borderColor:'rgba(0,200,83,0.9)',
          backgroundColor:'rgba(0,200,83,0.18)',
          borderWidth:2.5, pointRadius:0, fill:true, tension:0.4, spanGaps:true,
          segment:{borderColor:ctx=>ctx.p1.parsed.y>=tot.cur?'rgba(185,246,202,0.8)':'rgba(0,200,83,0.9)'}
        }
      ]
    },{
      scales:{
        x:{ticks:{color:tc,font:{size:10,family:"'Times New Roman',Times,serif"}},grid:{color:gc}},
        y:{
          ticks:{color:tc,font:{size:9},callback:v=>shortINR(v)},
          grid:{color:gc}, min:0, max:GOAL*1.05
        }
      },
      plugins:{
        legend:{labels:{color:tc,font:{size:10,family:"'Times New Roman',Times,serif"},boxWidth:10,padding:12}},
        tooltip:{callbacks:{
          label:c=>{
            if(c.dataset.label==='Goal Path') return null;
            const v=fmtINR(c.raw);
            if(c.dataset.label==='Current Value') return `Current: ${v} (${pct.toFixed(1)}% of ₹1 Cr)`;
            if(c.dataset.label==='Invested') return `Invested: ${v}`;
            return v;
          }
        }}
      }
    });

    newChart('dbPie','doughnut',{labels,datasets:[{data:at.map(a=>a.inv),backgroundColor:pal,borderWidth:2,borderColor:'rgba(17,24,39,1)'}]},
      {cutout:'60%',plugins:{legend:{position:'right',labels:{color:tc,font:bf,boxWidth:10,padding:10}},tooltip:{callbacks:{label:c=>`${c.label}: ${fmtINR(c.raw)}`}}}});

    newChart('dbBar','bar',{labels,datasets:[
      {label:'Invested',data:at.map(a=>a.inv),backgroundColor:'rgba(0,230,118,0.2)',borderColor:'rgba(0,230,118,0.5)',borderWidth:1,borderRadius:4},
      {label:'Current',data:at.map(a=>a.cur),backgroundColor:at.map(a=>a.gl>=0?'rgba(0,200,83,0.35)':'rgba(255,77,109,0.3)'),borderColor:at.map(a=>a.gl>=0?'var(--teal)':'var(--red)'),borderWidth:1,borderRadius:4}
    ]},{scales:{x:{ticks:{color:tc,font:{size:9}},grid:{color:gc}},y:{ticks:{color:tc,callback:v=>shortINR(v)},grid:{color:gc}}},plugins:{legend:{labels:{color:tc,font:bf}},tooltip:{callbacks:{label:c=>fmtINR(c.raw)}}}});

    newChart('dbRet','bar',{labels,datasets:[{label:'Return %',data:at.map(a=>a.ret),backgroundColor:at.map(a=>a.gl>=0?'rgba(0,200,83,0.35)':'rgba(255,77,109,0.3)'),borderColor:at.map(a=>a.gl>=0?'var(--teal)':'var(--red)'),borderWidth:1,borderRadius:4}]},
      {scales:{x:{ticks:{color:tc,font:{size:9}},grid:{color:gc}},y:{ticks:{color:tc,callback:v=>v.toFixed(1)+'%'},grid:{color:gc}}},plugins:{legend:{labels:{color:tc,font:bf}},tooltip:{callbacks:{label:c=>c.raw.toFixed(2)+'%'}}}});

    newChart('dbDailyGL','bar',{labels,datasets:[{label:'Daily GL',data:at.map(a=>a.dgl),backgroundColor:at.map(a=>a.dgl>=0?'rgba(0,230,118,0.25)':'rgba(255,77,109,0.25)'),borderColor:at.map(a=>a.dgl>=0?'var(--accent3)':'var(--red)'),borderWidth:1,borderRadius:4}]},
      {scales:{x:{ticks:{color:tc,font:{size:9}},grid:{color:gc}},y:{ticks:{color:tc,callback:v=>shortINR(v)},grid:{color:gc}}},plugins:{legend:{labels:{color:tc,font:bf}},tooltip:{callbacks:{label:c=>`Daily: ${fmtINR(c.raw)}`}}}});

    newChart('dbDoughnut2','doughnut',{labels,datasets:[{data:at.map(a=>a.cur),backgroundColor:pal,borderWidth:2,borderColor:'rgba(17,24,39,1)'}]},
      {cutout:'55%',plugins:{legend:{position:'right',labels:{color:tc,font:bf,boxWidth:10,padding:10}},tooltip:{callbacks:{label:c=>`${c.label}: ${fmtINR(c.raw)} (${((c.raw/(at.reduce((s,a)=>s+a.cur,0)))*100).toFixed(1)}%)`}}}});
  },60);
}

/* ═══════════════════════════════════════════════════════  PAGE HEADER HELPER  */
function mkPageHeader(title, subtitle, rows, calcFn) {
  let totalVal = 0, totalInvested = 0, totalGL = 0, totalDGL = 0;
  rows.forEach(r => {
    const c = calcFn(r);
    totalVal += c.curVal || 0;
    totalInvested += r.invested || 0;
    totalGL += c.gl || 0;
    totalDGL += c.dailyGL || 0;
  });
  const glCls = totalGL >= 0 ? 'gain' : 'loss';
  const dglCls = totalDGL >= 0 ? 'gain' : 'loss';
  return `
  <div class="panel-header">
    <div>
      <div class="panel-title">${title}</div>
      <div class="panel-subtitle">${subtitle}</div>
    </div>
    <div class="panel-summary">
      <div class="ps-item">
        <div class="ps-label">Total Value</div>
        <div class="ps-value">${fmtINR(totalVal)}</div>
      </div>
      <div class="ps-item">
        <div class="ps-label">Total Gain/Loss</div>
        <div class="ps-value ${glCls}">${totalGL>=0?'+':''}${fmtINR(totalGL)}</div>
      </div>
      <div class="ps-item">
        <div class="ps-label">Daily G/L</div>
        <div class="ps-value ${dglCls}">${totalDGL>=0?'+':''}${fmtINR(totalDGL)}</div>
      </div>
    </div>
  </div>`;
}

/* ═══════════════════════════════════════════════════════  FIXED DEPOSITS  */
function buildFDPanel(el) {
  const id='fd';
  if(!sortState[id])  sortState[id]={col:'maturityDate',asc:true};
  if(!filterState[id]) filterState[id]={q:''};
  const rows = PORTFOLIO.fixedDeposits;
  const cols=[
    {key:'bank',        label:'Bank',         fn:v=>`<span class="mono">${v}</span>`},
    {key:'fdNumber',    label:'FD No.',        fn:v=>`<span class="mono">${v}</span>`},
    {key:'invested',    label:'Invested',      fn:v=>fmtINR(v)},
    {key:'rate',        label:'Rate',          fn:v=>`<span class="chip blue">${v.toFixed(1)}%</span>`},
    {key:'startDate',   label:'Start',         fn:v=>`<span class="mono">${v}</span>`},
    {key:'maturityDate',label:'Maturity',      fn:v=>`<span class="mono">${v}</span>`},
    {key:'_daysLeft',   label:'Days Left',     fn:(_,r)=>`<span class="mono">${calcFD(r).daysLeft}d</span>`},
    {key:'maturityValue',label:'Maturity Val', fn:(_,r)=>fmtINR(r.maturityValue)},
    {key:'_curVal',     label:'Total Value',   fn:(_,r)=>fmtINR(calcFD(r).curVal)},
    {key:'_gl',         label:'Total Gain',    fn:(_,r)=>chipGL(calcFD(r).gl)},
    {key:'_ret',        label:'Return',        fn:(_,r)=>chipRet(calcFD(r).ret)},
    {key:'_dgl',        label:'Daily Gain',    fn:(_,r)=>chipGL(calcFD(r).dailyGL)},
    {key:'status',      label:'Status',        fn:v=>`<span class="chip active">${v}</span>`},
    {key:'_actions',    label:'Actions',       fn:(_,r,i)=>rowActions('fd',i)},
  ];
  const visibleCols = filterVisibleColumns(id, cols);
  el.innerHTML=mkPageHeader('Fixed Deposits', rows.length+' deposits', rows, calcFD)
    +mkControls(id,false,'fd','',cols,'fd')
    +mkTable(id,visibleCols);
  renderTable(id,visibleCols,rows);
}

/* ═══════════════════════════════════════════════════════  MUTUAL FUNDS  */
function buildMFPanel(el,owner) {
  const id='mf-'+owner.toLowerCase();
  if(!sortState[id])  sortState[id]={col:'invested',asc:false};
  if(!filterState[id]) filterState[id]={q:'',filter:'all'};
  const cols=[
    {key:'name',       label:'Fund Name',     fn:v=>`<div class="fund-name-cell"><span class="name" title="${v}">${v}</span></div>`},
    {key:'schemeCode', label:'Scheme',        fn:v=>`<span class="mono">${v}</span>`},
    {key:'units',      label:'Units',         fn:v=>`<span class="mono">${v.toFixed(3)}</span>`},
    {key:'purchaseNAV',label:'Buy NAV',       fn:v=>fmtINR(v)},
    {key:'invested',   label:'Invested',      fn:v=>fmtINR(v)},
    {key:'_curNAV',    label:'Live NAV',      fn:(_,r)=>{const c=calcMF(r);return liveCell(c.curNAV,c.isLive);}},
    {key:'_curVal',    label:'Total Value',   fn:(_,r)=>fmtINR(calcMF(r).curVal)},
    {key:'_gl',        label:'Total Gain/Loss',fn:(_,r)=>chipGL(calcMF(r).gl)},
    {key:'_ret',       label:'Return %',      fn:(_,r)=>chipRet(calcMF(r).ret)},
    {key:'_dgl',       label:'Daily Gain/Loss',fn:(_,r)=>chipGL(calcMF(r).dailyGL)},
    {key:'_actions',   label:'Actions',       fn:(_,r,i)=>rowActions('mf',PORTFOLIO.mutualFunds.indexOf(r))},
  ];
  const rows=PORTFOLIO.mutualFunds.filter(m=>m.owner===owner);
  const visibleCols = filterVisibleColumns(id, cols);
  el.innerHTML=mkPageHeader('MF — Wealthlite', rows.length+' funds', rows, calcMF)
    +mkControls(id,true,'mf',owner,cols,'mf')
    +mkTable(id,visibleCols);
  renderTable(id,visibleCols,rows);
}

/* ═══════════════════════════════════════════════════════  STOCKS  */
function buildStocksPanel(el,exchange) {
  const id=exchange==='NASDAQ'?'stocks-nas':'stocks-nse';
  if(!sortState[id])  sortState[id]={col:'invested',asc:false};
  if(!filterState[id]) filterState[id]={q:'',filter:'all'};
  const isUS = exchange === 'NASDAQ';
  const usdInr = getUsdInr();
  const rows = PORTFOLIO.stocks.filter(s=>isUS ? s.exchange==='NASDAQ' : s.exchange!=='NASDAQ');

  const baseCols = [
    {key:'name',     label:'Company',       fn:v=>`<span style="font-weight:600;color:var(--text)">${v}</span>`},
    {key:'symbol',   label:'Symbol',        fn:v=>`<span class="chip blue mono">${v}</span>`},
    {key:'units',    label:'Qty',           fn:v=>`<span class="mono">${v}</span>`},
    {key:'avgPrice', label:`Avg Buy${isUS?' (USD)':''}`,  fn:v=>isUS?`<span class="mono">$${v.toFixed(2)}</span>`:fmtINR(v)},
    {key:'invested', label:`Invested${isUS?' (USD)':''}`, fn:v=>isUS?`<span class="mono">$${v.toFixed(2)}</span>`:fmtINR(v)},
  ];
  const usdInrCol = isUS ? [{key:'_inr',label:'Invested (INR)',fn:(_,r)=>`<span class="mono">${fmtINR(r.invested*usdInr)}</span>`}] : [];
  const liveCols = [
    {key:'_liveP',   label:`Live Price${isUS?' (USD)':''}`, fn:(_,r)=>{const c=calcStock(r);return isUS?`<div class="live-val"><span class="price">$${c.curPrice.toFixed(2)}</span><span style="color:${c.isLive?'var(--teal)':'var(--muted)'};font-size:9px;font-family:var(--fm)">${c.isLive?'● LIVE':'cached'}</span></div>`:liveCell(c.curPrice,c.isLive);}},
    ...(isUS ? [{key:'_liveINR',label:'Live Value (INR)',fn:(_,r)=>{const c=calcStock(r);return fmtINR(c.curPrice*r.units*usdInr);}}] : []),
    {key:'_curVal',  label:`Total Value${isUS?' (USD)':''}`, fn:(_,r)=>{const c=calcStock(r);return isUS?`<span class="mono">$${c.curVal.toFixed(2)}</span>`:fmtINR(c.curVal);}},
    {key:'_gl',      label:'Total Gain/Loss', fn:(_,r)=>{const c=calcStock(r);return chipGL(isUS?c.gl*usdInr:c.gl);}},
    {key:'_ret',     label:'Return %',        fn:(_,r)=>chipRet(calcStock(r).ret)},
    {key:'_dgl',     label:'Daily Gain/Loss', fn:(_,r)=>{const c=calcStock(r);return chipGL(isUS?c.dailyGL*usdInr:c.dailyGL);}},
    {key:'_actions', label:'Actions',         fn:(_,r)=>rowActions('stock',PORTFOLIO.stocks.indexOf(r))},
  ];
  const cols = [...baseCols, ...usdInrCol, ...liveCols];
  const visibleCols = filterVisibleColumns(id, cols);
  el.innerHTML = mkPageHeader(isUS?'US Equity (NASDAQ)':'Indian Equity (NSE/BSE)', rows.length+' stocks', rows, calcStock)
    + mkControls(id,true,'stock',exchange,cols,'stock')
    + mkTable(id,visibleCols);
  renderTable(id,visibleCols,rows);
}

/* ═══════════════════════════════════════════════════════  GOLD  */
function buildGoldPanel(el) {
  const id='gold';
  if(!sortState[id])  sortState[id]={col:'invested',asc:false};
  if(!filterState[id]) filterState[id]={q:''};
  const rows=PORTFOLIO.gold||[];
  const cols=[
    {key:'name',         label:'Instrument',  fn:v=>`<span style="font-weight:600;color:var(--text)">${v}</span>`},
    {key:'type',         label:'Type',        fn:v=>`<span class="chip gold">${v}</span>`},
    {key:'units',        label:'Units',       fn:v=>`<span class="mono">${v}</span>`},
    {key:'purchasePrice',label:'Buy Price',   fn:v=>fmtINR(v)},
    {key:'invested',     label:'Invested',    fn:v=>fmtINR(v)},
    {key:'_liveP',       label:'Live Price',  fn:(_,r)=>{const c=calcGold(r);return liveCell(c.curPrice,c.isLive);}},
    {key:'_manualVal',   label:'Current Value (Manual)',fn:(_,r,idx)=>{
      const val=r.manualCurrentValue!==undefined?r.manualCurrentValue:'';
      return `<input type="number" class="gold-manual-input" data-idx="${idx}" value="${val}" placeholder="Enter value" onchange="updateGoldManualValue(${idx},this.value)">`;
    }},
    {key:'_curVal',      label:'Total Value', fn:(_,r)=>{const c=calcGold(r);return `<span style="font-weight:700;color:${c.isManual?'var(--teal)':'var(--text2)'}">${fmtINR(c.curVal)}</span>`;}},
    {key:'_gl',          label:'Total Gain/Loss',fn:(_,r)=>chipGL(calcGold(r).gl)},
    {key:'_ret',         label:'Return %',    fn:(_,r)=>chipRet(calcGold(r).ret)},
    {key:'_dgl',         label:'Daily Gain/Loss',fn:(_,r)=>chipGL(calcGold(r).dailyGL)},
    {key:'_actions',     label:'Actions',     fn:(_,r,i)=>rowActions('gold',PORTFOLIO.gold.indexOf(r))},
  ];
  const visibleCols = filterVisibleColumns(id, cols);
  el.innerHTML=mkPageHeader('Gold / SGB', rows.length+' holdings', rows, calcGold)
    +mkControls(id,false,'gold','',cols,'gold')
    +mkTable(id,visibleCols);
  renderTable(id,visibleCols,rows);
}

/* ═══════════════════════════════════════════════════════  UPDATE GOLD MANUAL  */
function updateGoldManualValue(idx, value) {
  const gold = PORTFOLIO.gold[idx];
  if (!gold) return;
  if (value===''||value===null) delete gold.manualCurrentValue;
  else gold.manualCurrentValue = parseFloat(value);
  saveToStorage();
  updateSummaryCards();
  showToast('✓ Gold value updated', 'success');
}

/* ═══════════════════════════════════════════════════════  COLUMN VISIBILITY  */
function getColumnVisibility(panelId) {
  const stored = localStorage.getItem(COLUMN_VISIBILITY_KEY);
  const all = stored ? JSON.parse(stored) : {};
  return all[panelId] || {};
}
function setColumnVisibility(panelId, colKey, visible) {
  const stored = localStorage.getItem(COLUMN_VISIBILITY_KEY);
  const all = stored ? JSON.parse(stored) : {};
  if (!all[panelId]) all[panelId] = {};
  all[panelId][colKey] = visible;
  localStorage.setItem(COLUMN_VISIBILITY_KEY, JSON.stringify(all));
  showPanel(activePanel);
}
function filterVisibleColumns(panelId, cols) {
  const visibility = getColumnVisibility(panelId);
  return cols.filter(col => {
    if (col.key === '_actions') return true;
    if (visibility[col.key] === undefined) return true;
    return visibility[col.key];
  });
}
function buildColumnToggle(panelId, cols) {
  const visibility = getColumnVisibility(panelId);
  return `
    <div class="column-toggle">
      <button class="toggle-btn" onclick="toggleColumnMenu('${panelId}')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>
        </svg>Columns
      </button>
      <div class="column-menu" id="colMenu-${panelId}" style="display:none">
        <div class="column-menu-title">Visible Columns</div>
        ${cols.filter(c=>c.key!=='_actions').map(col=>{
          const isVisible=visibility[col.key]===undefined?true:visibility[col.key];
          return `<label class="column-checkbox"><input type="checkbox" ${isVisible?'checked':''} onchange="setColumnVisibility('${panelId}','${col.key}',this.checked)"><span>${col.label}</span></label>`;
        }).join('')}
      </div>
    </div>`;
}
function toggleColumnMenu(panelId) {
  const menu=document.getElementById('colMenu-'+panelId);
  if(menu) menu.style.display=menu.style.display==='none'?'block':'none';
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('.column-toggle')) {
    document.querySelectorAll('.column-menu').forEach(m=>m.style.display='none');
  }
});

/* ═══════════════════════════════════════════════════════  TABLE HELPERS  */
function rowActions(type,idx) {
  return `<div class="row-actions">
    <button class="btn-edit" onclick="openEditModal('${type}',${idx})">✏ Edit</button>
    <button class="btn-del"  onclick="deleteRow('${type}',${idx})">🗑</button>
  </div>`;
}

function mkControls(id,hasFilter,addType,addMeta,cols,excelType) {
  const addLabel = addType==='mf'?'Fund':addType==='fd'?'FD':addType==='stock'?'Stock':'Gold';
  return `
  <div class="export-bar">
    <span>⚠ Changes saved in browser.</span>
    <button onclick="syncToGitHub()" style="padding:6px 14px;background:transparent;color:var(--teal);border:1px solid rgba(0,200,83,0.4);border-radius:6px;font-size:10px;font-weight:700;cursor:pointer;font-family:var(--fm);text-transform:uppercase;letter-spacing:0.5px">SYNC GITHUB</button>
    <button onclick="exportJSON()" style="padding:6px 14px;background:transparent;color:var(--muted);border:1px solid var(--border);border-radius:6px;font-size:10px;font-weight:700;cursor:pointer;font-family:var(--fm);text-transform:uppercase;letter-spacing:0.5px">DL JSON</button>
  </div>
  <div class="ctrl-bar">
    <div class="ctrl-bar-left">
      <div class="search-wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" class="search-input" id="search-${id}" placeholder="Search…" value="${(filterState[id]?.q)||''}" oninput="onSearch('${id}',this.value)"/>
      </div>
      ${hasFilter?`<select class="filter-sel" onchange="onFilter('${id}',this.value)">
        <option value="all" ${(filterState[id]?.filter||'all')==='all'?'selected':''}>All</option>
        <option value="gain" ${(filterState[id]?.filter)==='gain'?'selected':''}>Gains</option>
        <option value="loss" ${(filterState[id]?.filter)==='loss'?'selected':''}>Losses</option>
      </select>`:''}
      <div class="row-count" id="rc-${id}">—</div>
    </div>
    <div class="ctrl-bar-right">
      <button class="btn-excel-import" onclick="openExcelImport('${excelType}')">📥 Import Excel</button>
      <button class="btn-excel-export" onclick="exportExcel('${excelType}','${id}')">📤 Export Excel</button>
      <button class="btn-add" onclick="openAddModal('${addType}','${addMeta||''}')">＋ ${addLabel}</button>
      ${cols ? buildColumnToggle(id, cols) : ''}
    </div>
  </div>`;
}

function mkTable(id,cols) {
  return `<div class="tbl-card"><table>
    <thead><tr id="th-${id}">${cols.map(c=>`<th data-col="${c.key}" onclick="onSort('${id}','${c.key}')">${c.label}<span class="sort-icon">⇅</span></th>`).join('')}</tr></thead>
    <tbody id="tb-${id}"></tbody>
  </table></div>`;
}

/* FIXED SEARCH - preserves query across panel refresh */
function onSearch(id,val){
  if(!filterState[id]) filterState[id]={q:'',filter:'all'};
  filterState[id].q=val;
  // Re-render table without full panel rebuild to preserve search input focus
  const panel = document.querySelector('.panel.active');
  if (!panel) return;
  const rows = getRowsForPanel(id);
  const cols = getColsForPanel(id);
  if (rows && cols) {
    renderTable(id, cols, rows);
  } else {
    showPanel(activePanel);
  }
}

function getRowsForPanel(id) {
  if(id==='fd') return PORTFOLIO.fixedDeposits;
  if(id==='mf-mahesh') return PORTFOLIO.mutualFunds.filter(m=>m.owner==='Mahesh');
  if(id==='mf-family') return PORTFOLIO.mutualFunds.filter(m=>m.owner==='Family');
  if(id==='stocks-nse') return PORTFOLIO.stocks.filter(s=>s.exchange!=='NASDAQ');
  if(id==='stocks-nas') return PORTFOLIO.stocks.filter(s=>s.exchange==='NASDAQ');
  if(id==='gold') return PORTFOLIO.gold||[];
  return null;
}

function getColsForPanel(id) {
  // Check if the table exists in DOM
  const tb = document.getElementById('tb-'+id);
  if (!tb) return null;
  // Get columns from existing table headers
  const th = document.getElementById('th-'+id);
  if (!th) return null;
  // We need to rebuild columns — get stored cols from the panel builder
  return _cachedCols[id] || null;
}

const _cachedCols = {};

function onFilter(id,val){
  if(!filterState[id]) filterState[id]={q:'',filter:'all'};
  filterState[id].filter=val;
  showPanel(activePanel);
}
function onSort(id,col){
  if(!sortState[id]) sortState[id]={col:null,asc:true};
  sortState[id].asc=sortState[id].col===col?!sortState[id].asc:true;
  sortState[id].col=col;
  showPanel(activePanel);
}

function renderTable(id,cols,allRows) {
  _cachedCols[id] = cols;
  const fs=filterState[id]||{q:'',filter:'all'};
  let rows=[...allRows];
  // FIXED SEARCH: properly filter on all string fields
  if(fs.q) {
    const q = fs.q.toLowerCase().trim();
    rows = rows.filter(r => {
      return Object.values(r).some(v => {
        if (v == null) return false;
        return String(v).toLowerCase().includes(q);
      });
    });
  }
  if(fs.filter==='gain') rows=rows.filter(r=>{
    try{if(r.schemeCode)return calcMF(r).gl>=0;if(r.symbol&&r.avgPrice)return calcStock(r).gl>=0;if(r.symbol)return calcGold(r).gl>=0;return calcFD(r).gl>=0;}catch{return true;}
  });
  if(fs.filter==='loss') rows=rows.filter(r=>{
    try{if(r.schemeCode)return calcMF(r).gl<0;if(r.symbol&&r.avgPrice)return calcStock(r).gl<0;if(r.symbol)return calcGold(r).gl<0;return calcFD(r).gl<0;}catch{return true;}
  });
  const ss=sortState[id];
  if(ss?.col) {
    rows.sort((a,b)=>{
      let va, vb;
      if(ss.col.startsWith('_')) {
        const getCalcValue=(row,col)=>{
          try {
            if(row.schemeCode){const c=calcMF(row);if(col==='_curNAV')return c.curNAV;if(col==='_curVal')return c.curVal;if(col==='_gl')return c.gl;if(col==='_ret')return c.ret;if(col==='_dgl')return c.dailyGL;}
            else if(row.symbol&&row.avgPrice){const c=calcStock(row);if(col==='_liveP')return c.curPrice;if(col==='_curVal')return c.curVal;if(col==='_gl')return c.gl;if(col==='_ret')return c.ret;if(col==='_dgl')return c.dailyGL;}
            else if(row.symbol){const c=calcGold(row);if(col==='_liveP')return c.curPrice;if(col==='_curVal')return c.curVal;if(col==='_gl')return c.gl;if(col==='_ret')return c.ret;if(col==='_dgl')return c.dailyGL;}
            else if(row.maturityDate){const c=calcFD(row);if(col==='_daysLeft')return c.daysLeft;if(col==='_curVal')return c.curVal;if(col==='_gl')return c.gl;if(col==='_ret')return c.ret;if(col==='_dgl')return c.dailyGL;}
          } catch(e){return 0;}
          return 0;
        };
        va=getCalcValue(a,ss.col); vb=getCalcValue(b,ss.col);
      } else { va=a[ss.col]; vb=b[ss.col]; }
      const numA=parseFloat(va), numB=parseFloat(vb);
      const isNumeric=!isNaN(numA)&&!isNaN(numB);
      if(isNumeric) return ss.asc?numA-numB:numB-numA;
      if(typeof va==='string'&&typeof vb==='string') return ss.asc?va.localeCompare(vb):vb.localeCompare(va);
      return ss.asc?(va||0)-(vb||0):(vb||0)-(va||0);
    });
  }
  document.querySelectorAll(`#th-${id} th`).forEach(th=>{
    th.classList.remove('sorted');const si=th.querySelector('.sort-icon');if(si)si.textContent='⇅';
    if(ss?.col&&th.dataset.col===ss.col){th.classList.add('sorted');if(si)si.textContent=ss.asc?'▲':'▼';}
  });
  const rc=document.getElementById('rc-'+id);
  if(rc) rc.textContent=`${rows.length} / ${allRows.length}`;
  const tb=document.getElementById('tb-'+id);
  if(!tb) return;
  if(!rows.length){tb.innerHTML=`<tr><td colspan="${cols.length}" class="no-results"><div class="nr-icon">🔍</div><div class="nr-text">No results found</div></td></tr>`;return;}
  tb.innerHTML=rows.map((row,i)=>`<tr>${cols.map(c=>`<td>${c.fn(row[c.key],row,i)}</td>`).join('')}</tr>`).join('');
}

/* ═══════════════════════════════════════════════════════  EXCEL IMPORT  */
function openExcelImport(type) {
  const typeLabels = {fd:'Fixed Deposits',mf:'Mutual Funds',stock:'Stocks',gold:'Gold / SGB'};
  const colDefs = getExcelColumns(type);
  document.getElementById('modalTitle').textContent = `Import ${typeLabels[type]||type} from Excel`;
  document.getElementById('modalBody').innerHTML = `
    <div class="excel-drop-zone" id="excelDropZone" onclick="document.getElementById('excelFileInput').click()" 
      ondragover="event.preventDefault();this.classList.add('drag-over')"
      ondragleave="this.classList.remove('drag-over')"
      ondrop="handleExcelDrop(event,'${type}')">
      <div class="drop-icon">📊</div>
      <div class="drop-text">Drop Excel file here or click to browse</div>
      <div class="drop-hint">Supports .xlsx, .xls, .csv files</div>
    </div>
    <input type="file" id="excelFileInput" accept=".xlsx,.xls,.csv" style="display:none" onchange="handleExcelFile(this.files[0],'${type}')">
    <div class="excel-template-note">
      📋 Expected columns: <strong>${colDefs.join(', ')}</strong><br>
      <span style="opacity:0.7">First row should be headers. Dates in YYYY-MM-DD format.</span>
    </div>
    <div id="importPreview" style="margin-top:12px"></div>`;
  document.getElementById('modalFooter').innerHTML = `
    <button onclick="downloadTemplate('${type}')" class="btn-excel-import" style="margin-right:auto">⬇ Download Template</button>
    <button class="btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn-primary" id="confirmImportBtn" onclick="confirmImport('${type}')" style="display:none">Import Data</button>`;
  document.getElementById('modalBackdrop').classList.add('show');
  window._importData = null;
}

function getExcelColumns(type) {
  if(type==='fd') return ['bank','fdNumber','invested','rate','startDate','maturityDate','maturityValue','status'];
  if(type==='mf') return ['name','schemeCode','owner','units','purchaseNAV','invested'];
  if(type==='stock') return ['name','symbol','exchange','units','avgPrice','invested'];
  if(type==='gold') return ['name','type','symbol','units','purchasePrice','invested'];
  return [];
}

function handleExcelDrop(event, type) {
  event.preventDefault();
  document.getElementById('excelDropZone').classList.remove('drag-over');
  const file = event.dataTransfer.files[0];
  if(file) handleExcelFile(file, type);
}

function handleExcelFile(file, type) {
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      let rows = [];
      if(file.name.endsWith('.csv')) {
        rows = parseCSV(e.target.result);
      } else {
        showToast('⚠ For .xlsx files, please save as CSV first or use the CSV format', 'warning');
        // Try to parse as CSV anyway
        rows = parseCSV(e.target.result);
      }
      if(rows.length === 0) { showToast('No data found in file', 'error'); return; }
      const cols = getExcelColumns(type);
      const headers = rows[0].map(h => h.toString().toLowerCase().trim());
      const colMap = {};
      cols.forEach(col => {
        const idx = headers.findIndex(h => h === col.toLowerCase() || h.includes(col.toLowerCase()));
        if(idx >= 0) colMap[col] = idx;
      });
      const parsed = rows.slice(1).filter(r=>r.some(c=>c!=null&&c!=='')).map(row => {
        const obj = {};
        cols.forEach(col => {
          const idx = colMap[col];
          if(idx !== undefined) {
            const val = row[idx];
            const numFields = ['invested','rate','units','purchaseNAV','avgPrice','purchasePrice','maturityValue'];
            obj[col] = numFields.includes(col) ? (parseFloat(val)||0) : (val||'');
          }
        });
        return obj;
      }).filter(obj => Object.values(obj).some(v => v !== '' && v !== 0));

      window._importData = parsed;
      const preview = document.getElementById('importPreview');
      if(parsed.length > 0) {
        preview.innerHTML = `
          <div style="font-size:11px;color:var(--teal);font-family:var(--fm);margin-bottom:8px">✓ Found ${parsed.length} valid rows</div>
          <div style="background:var(--surface3);border-radius:8px;padding:10px;max-height:150px;overflow-y:auto;font-family:var(--fm);font-size:10px;color:var(--text2)">
            ${parsed.slice(0,5).map(r=>`<div style="border-bottom:1px solid var(--border);padding:3px 0">${Object.entries(r).map(([k,v])=>`<span style="color:var(--muted)">${k}:</span> ${v}`).join(' · ')}</div>`).join('')}
            ${parsed.length > 5 ? `<div style="color:var(--dim);padding-top:4px">... and ${parsed.length-5} more rows</div>` : ''}
          </div>`;
        document.getElementById('confirmImportBtn').style.display = 'inline-flex';
      } else {
        preview.innerHTML = `<div style="font-size:11px;color:var(--red);font-family:var(--fm)">⚠ No valid data rows found. Check column headers match expected format.</div>`;
      }
    } catch(err) {
      showToast('Error parsing file: '+err.message, 'error');
    }
  };
  reader.readAsText(file);
}

function parseCSV(text) {
  const lines = text.split('\n').filter(l=>l.trim());
  return lines.map(line => {
    const result = []; let current = ''; let inQuotes = false;
    for(let i=0;i<line.length;i++){
      const ch=line[i];
      if(ch==='"'){inQuotes=!inQuotes;}
      else if(ch===','&&!inQuotes){result.push(current.trim());current='';}
      else{current+=ch;}
    }
    result.push(current.trim());
    return result;
  });
}

function confirmImport(type) {
  if(!window._importData || window._importData.length === 0) return;
  const store = getDataStore(type);
  let added = 0;
  window._importData.forEach(obj => {
    if(Object.keys(obj).length > 0) { store.push(obj); added++; }
  });
  saveToStorage();
  updateBadges();
  updateSummaryCards();
  closeModal();
  showToast(`✓ Imported ${added} records successfully`, 'success');
  showPanel(activePanel);
  window._importData = null;
}

function downloadTemplate(type) {
  const cols = getExcelColumns(type);
  let sampleRow = [];
  if(type==='fd') sampleRow=['HDFC Bank','FD-001','100000','7.5','2024-01-01','2025-01-01','107500','Active'];
  if(type==='mf') sampleRow=['HDFC Flexi Cap Fund','100179','Mahesh','500.000','45.23','22615'];
  if(type==='stock') sampleRow=['Reliance Industries','RELIANCE.NS','NSE','10','2450','24500'];
  if(type==='gold') sampleRow=['SGB 2023-24','SGB','GOLDBEES.NS','8','4500','36000'];
  const csv = [cols.join(','), sampleRow.join(',')].join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=`template_${type}.csv`; a.click();
  showToast('📄 Template downloaded', 'info');
}

/* ═══════════════════════════════════════════════════════  EXCEL EXPORT  */
function exportExcel(type, panelId) {
  const rows = getRowsForPanel(panelId);
  if(!rows || rows.length === 0) { showToast('No data to export', 'warning'); return; }
  const cols = getExcelColumns(type);
  const calcRows = rows.map(row => {
    const base = cols.reduce((obj, col) => { obj[col] = row[col] ?? ''; return obj; }, {});
    // Add calculated columns
    try {
      if(type==='fd') {
        const c = calcFD(row);
        return {...base, totalValue:c.curVal.toFixed(2), totalGainLoss:c.gl.toFixed(2), dailyGainLoss:c.dailyGL.toFixed(2), returnPct:c.ret.toFixed(2)};
      } else if(type==='mf') {
        const c = calcMF(row);
        return {...base, currentNAV:c.curNAV.toFixed(4), totalValue:c.curVal.toFixed(2), totalGainLoss:c.gl.toFixed(2), returnPct:c.ret.toFixed(2), dailyGainLoss:c.dailyGL.toFixed(2)};
      } else if(type==='stock') {
        const c = calcStock(row);
        return {...base, currentPrice:c.curPrice.toFixed(2), totalValue:c.curVal.toFixed(2), totalGainLoss:c.gl.toFixed(2), returnPct:c.ret.toFixed(2), dailyGainLoss:c.dailyGL.toFixed(2)};
      } else if(type==='gold') {
        const c = calcGold(row);
        return {...base, currentPrice:c.curPrice.toFixed(2), totalValue:c.curVal.toFixed(2), totalGainLoss:c.gl.toFixed(2), returnPct:c.ret.toFixed(2), dailyGainLoss:c.dailyGL.toFixed(2)};
      }
    } catch(e) {}
    return base;
  });
  const headers = Object.keys(calcRows[0]);
  const csv = [headers.join(','), ...calcRows.map(r=>headers.map(h=>JSON.stringify(r[h]??'')).join(','))].join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=`portfolio_${type}_${new Date().toISOString().slice(0,10)}.csv`; a.click();
  showToast('📤 Exported to CSV', 'success');
}

/* ═══════════════════════════════════════════════════════  ADD / EDIT MODALS  */
function openAddModal(type,meta) {
  _editIdx=null; _editType=type;
  const titles={fd:'Add Fixed Deposit',mf:'Add Mutual Fund',stock:'Add Stock',gold:'Add Gold / SGB'};
  openModal(titles[type]||'Add', buildForm(type,null,meta));
}
function openEditModal(type,idx) {
  _editIdx=idx; _editType=type;
  const data=getDataStore(type)[idx];
  const titles={fd:'Edit Fixed Deposit',mf:'Edit Mutual Fund',stock:'Edit Stock',gold:'Edit Gold / SGB'};
  openModal(titles[type]||'Edit', buildForm(type,data,''));
}
function buildForm(type,data,meta) {
  const v=(field,def='')=>data?data[field]??def:def;
  if(type==='fd') return `<div class="form-grid">
    <div class="form-group"><label class="form-label">Bank / Institution</label><input class="form-input" id="f-bank" value="${v('bank')}" placeholder="e.g. HDFC"/></div>
    <div class="form-group"><label class="form-label">FD Number</label><input class="form-input" id="f-fdNumber" value="${v('fdNumber')}" placeholder="e.g. 12345"/></div>
    <div class="form-group"><label class="form-label">Investment Amount (₹)</label><input class="form-input" type="number" id="f-invested" value="${v('invested',0)}"/></div>
    <div class="form-group"><label class="form-label">Interest Rate (%)</label><input class="form-input" type="number" step="0.1" id="f-rate" value="${v('rate',7)}"/></div>
    <div class="form-group"><label class="form-label">Start Date</label><input class="form-input" type="date" id="f-startDate" value="${v('startDate')}"/></div>
    <div class="form-group"><label class="form-label">Maturity Date</label><input class="form-input" type="date" id="f-maturityDate" value="${v('maturityDate')}"/></div>
    <div class="form-group"><label class="form-label">Maturity Value (₹)</label><input class="form-input" type="number" id="f-maturityValue" value="${v('maturityValue',0)}"/></div>
    <div class="form-group"><label class="form-label">Status</label>
      <select class="form-select" id="f-status">
        <option ${v('status')==='Active'?'selected':''}>Active</option>
        <option ${v('status')==='Matured'?'selected':''}>Matured</option>
        <option ${v('status')==='Closed'?'selected':''}>Closed</option>
      </select>
    </div></div>`;
  if(type==='mf') return `<div class="form-grid">
    <div class="form-group full"><label class="form-label">Fund Name</label><input class="form-input" id="f-name" value="${v('name')}" placeholder="e.g. HDFC Flexi Cap Fund"/></div>
    <div class="form-group"><label class="form-label">Scheme Code (AMFI)</label><input class="form-input" id="f-schemeCode" value="${v('schemeCode')}" placeholder="e.g. 100179"/>
      <div class="form-hint">Find at <a href="https://mfapi.in" target="_blank">mfapi.in</a></div></div>
    <div class="form-group"><label class="form-label">Owner</label>
      <select class="form-select" id="f-owner">
        <option ${(v('owner',meta)==='Mahesh')?'selected':''}>Mahesh</option>
        <option ${(v('owner',meta)==='Family')?'selected':''}>Family</option>
      </select>
    </div>
    <div class="form-group"><label class="form-label">Units</label><input class="form-input" type="number" step="0.001" id="f-units" value="${v('units',0)}"/></div>
    <div class="form-group"><label class="form-label">Purchase NAV (₹)</label><input class="form-input" type="number" step="0.01" id="f-purchaseNAV" value="${v('purchaseNAV',0)}"/></div>
    <div class="form-group"><label class="form-label">Investment Amount (₹)</label><input class="form-input" type="number" id="f-invested" value="${v('invested',0)}"/></div>
  </div>`;
  if(type==='stock') return `<div class="form-grid">
    <div class="form-group full"><label class="form-label">Company Name</label><input class="form-input" id="f-name" value="${v('name')}" placeholder="e.g. Reliance Industries"/></div>
    <div class="form-group"><label class="form-label">Symbol</label><input class="form-input" id="f-symbol" value="${v('symbol')}" placeholder="RELIANCE.NS"/>
      <div class="form-hint">NSE: add .NS · BSE: add .BO · NASDAQ: plain e.g. AAPL</div></div>
    <div class="form-group"><label class="form-label">Exchange</label>
      <select class="form-select" id="f-exchange">
        <option ${v('exchange')==='NSE'?'selected':''}>NSE</option>
        <option ${v('exchange')==='BSE'?'selected':''}>BSE</option>
        <option ${v('exchange')==='NASDAQ'?'selected':''}>NASDAQ</option>
      </select>
    </div>
    <div class="form-group"><label class="form-label">Quantity</label><input class="form-input" type="number" id="f-units" value="${v('units',0)}"/></div>
    <div class="form-group"><label class="form-label">Avg Buy Price (₹)</label><input class="form-input" type="number" step="0.01" id="f-avgPrice" value="${v('avgPrice',0)}"/></div>
    <div class="form-group"><label class="form-label">Investment Amount (₹)</label><input class="form-input" type="number" id="f-invested" value="${v('invested',0)}"/></div>
  </div>`;
  if(type==='gold') return `<div class="form-grid">
    <div class="form-group full"><label class="form-label">Instrument Name</label><input class="form-input" id="f-name" value="${v('name')}" placeholder="e.g. SGB Series X"/></div>
    <div class="form-group"><label class="form-label">Type</label>
      <select class="form-select" id="f-type">
        <option ${v('type')==='SGB'?'selected':''}>SGB</option>
        <option ${v('type')==='ETF'?'selected':''}>ETF</option>
        <option ${v('type')==='Physical'?'selected':''}>Physical</option>
      </select>
    </div>
    <div class="form-group"><label class="form-label">Symbol (Yahoo Finance)</label><input class="form-input" id="f-symbol" value="${v('symbol')}" placeholder="GOLDBEES.NS"/></div>
    <div class="form-group"><label class="form-label">Units / Grams</label><input class="form-input" type="number" step="0.001" id="f-units" value="${v('units',0)}"/></div>
    <div class="form-group"><label class="form-label">Purchase Price (₹)</label><input class="form-input" type="number" step="0.01" id="f-purchasePrice" value="${v('purchasePrice',0)}"/></div>
    <div class="form-group"><label class="form-label">Investment Amount (₹)</label><input class="form-input" type="number" id="f-invested" value="${v('invested',0)}"/></div>
  </div>`;
  return '<p>Unknown type</p>';
}

function saveModal() {
  const type=_editType;
  const get=(id)=>{const el=document.getElementById(id);return el?el.value:null;};
  const num=(id)=>parseFloat(get(id))||0;
  let obj;
  if(type==='fd') obj={bank:get('f-bank'),fdNumber:get('f-fdNumber'),invested:num('f-invested'),rate:num('f-rate'),startDate:get('f-startDate'),maturityDate:get('f-maturityDate'),maturityValue:num('f-maturityValue'),status:get('f-status')};
  else if(type==='mf') obj={name:get('f-name'),schemeCode:get('f-schemeCode'),owner:get('f-owner'),units:num('f-units'),purchaseNAV:num('f-purchaseNAV'),invested:num('f-invested')};
  else if(type==='stock') obj={name:get('f-name'),symbol:get('f-symbol'),exchange:get('f-exchange'),units:num('f-units'),avgPrice:num('f-avgPrice'),invested:num('f-invested')};
  else if(type==='gold') obj={name:get('f-name'),type:get('f-type'),symbol:get('f-symbol'),units:num('f-units'),purchasePrice:num('f-purchasePrice'),invested:num('f-invested')};
  const store=getDataStore(type);
  if(_editIdx===null){store.push(obj);showToast('✓ Entry added','success');}
  else{store[_editIdx]=obj;showToast('✓ Entry updated','success');}
  saveToStorage(); closeModal(); updateBadges(); updateSummaryCards(); showPanel(activePanel);
}
function deleteRow(type,idx) {
  if(!confirm('Delete this entry?')) return;
  getDataStore(type).splice(idx,1);
  saveToStorage(); updateBadges(); updateSummaryCards();
  showToast('🗑 Entry deleted','info'); showPanel(activePanel);
}
function getDataStore(type) {
  if(type==='fd')    return PORTFOLIO.fixedDeposits;
  if(type==='mf')    return PORTFOLIO.mutualFunds;
  if(type==='stock') return PORTFOLIO.stocks;
  if(type==='gold')  return PORTFOLIO.gold;
  return [];
}

/* ═══════════════════════════════════════════════════════  EXPORT JSON  */
function exportJSON() {
  const blob=new Blob([JSON.stringify(PORTFOLIO,null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='portfolio.json'; a.click();
  showToast('📥 portfolio.json downloaded','info');
}

/* ═══════════════════════════════════════════════════════  SYNC TO GITHUB  */
async function syncToGitHub() {
  let token = localStorage.getItem(GITHUB_TOKEN_KEY);
  if (!token) {
    token = prompt("GitHub Personal Access Token:\n\nGenerate at: https://github.com/settings/tokens\nScope: repo");
    if (!token) { showToast("❌ Cancelled", "error"); return; }
    localStorage.setItem(GITHUB_TOKEN_KEY, token);
  }
  showSpinner("Syncing to GitHub…");
  try {
    const getUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_FILE_PATH}`;
    const getResp = await fetch(getUrl, {headers:{"Authorization":`token ${token}`,"Accept":"application/vnd.github.v3+json"}});
    if (!getResp.ok) throw new Error(`API error: ${getResp.status}`);
    const fileData = await getResp.json();
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(PORTFOLIO,null,2))));
    const updateResp = await fetch(getUrl, {
      method:"PUT",
      headers:{"Authorization":`token ${token}`,"Accept":"application/vnd.github.v3+json","Content-Type":"application/json"},
      body:JSON.stringify({message:`Update ${new Date().toISOString()}`,content,sha:fileData.sha})
    });
    if (!updateResp.ok) throw new Error("Update failed");
    hideSpinner(); showToast("✅ Synced to GitHub!", "success");
  } catch (e) {
    hideSpinner(); showToast(`❌ ${e.message}`, "error");
    if (e.message.includes("401")) localStorage.removeItem(GITHUB_TOKEN_KEY);
  }
}

/* ═══════════════════════════════════════════════════════  MODAL HELPERS  */
function openModal(title,bodyHTML) {
  document.getElementById('modalTitle').textContent=title;
  document.getElementById('modalBody').innerHTML=bodyHTML;
  document.getElementById('modalFooter').innerHTML=`
    ${_editIdx!==null?`<button class="btn-danger" onclick="deleteRow('${_editType}',${_editIdx})">🗑 Delete</button>`:''}
    <button class="btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn-primary" onclick="saveModal()">💾 Save</button>`;
  document.getElementById('modalBackdrop').classList.add('show');
}
function closeModal() { document.getElementById('modalBackdrop').classList.remove('show'); }
function closeModalOnBackdrop(e) { if(e.target===document.getElementById('modalBackdrop')) closeModal(); }

/* ═══════════════════════════════════════════════════════  CHART + UI HELPERS  */
function newChart(id,type,data,options={}) {
  if(chartStore[id]){try{chartStore[id].destroy();}catch(e){}delete chartStore[id];}
  const canvas=document.getElementById(id); if(!canvas) return;
  chartStore[id]=new Chart(canvas,{type,data,options:{responsive:true,maintainAspectRatio:true,...options}});
}
function chipGL(gl){return `<span class="chip ${gl>=0?'gain':'loss'}">${gl>=0?'▲ +':'▼ '}${fmtINR(Math.abs(gl))}</span>`;}
function chipRet(ret){return `<span class="chip ${ret>=0?'gain':'loss'}">${ret>=0?'+':''}${ret.toFixed(2)}%</span>`;}
function liveCell(price,isLive){
  return `<div class="live-val"><span class="price">${fmtINR(price)}</span>
  <span style="color:${isLive?'var(--teal)':'var(--muted)'};font-size:9px;font-family:var(--fm)">${isLive?'● LIVE':'cached'}</span></div>`;
}
function fmtINR(n){if(n==null||isNaN(n))return '—';return(n<0?'-₹':'₹')+Math.abs(n).toLocaleString('en-IN',{maximumFractionDigits:2});}
function shortINR(n){const a=Math.abs(n);if(a>=1e7)return '₹'+(n/1e7).toFixed(1)+'Cr';if(a>=1e5)return '₹'+(n/1e5).toFixed(1)+'L';if(a>=1e3)return '₹'+(n/1e3).toFixed(0)+'K';return '₹'+n.toFixed(0);}
function showSpinner(msg){document.getElementById('spinnerOverlay').classList.add('show');document.getElementById('spinnerText').textContent=msg||'Loading…';}
function hideSpinner(){document.getElementById('spinnerOverlay').classList.remove('show');}
let _tt;
function showToast(msg,type='info'){const t=document.getElementById('toast');t.textContent=msg;t.className=`toast show ${type}`;clearTimeout(_tt);_tt=setTimeout(()=>t.classList.remove('show'),4000);}
async function handleRefresh(){
  const btn=document.getElementById('refreshBtn');
  btn.classList.add('loading');btn.querySelector('span').textContent='Refreshing…';
  showSpinner('Fetching live prices…');
  await fetchAllLiveData();
  updateSummaryCards();showPanel(activePanel);
  hideSpinner();btn.classList.remove('loading');btn.querySelector('span').textContent='Refresh Prices';
  document.getElementById('lastUpdated').textContent='Updated: '+new Date().toLocaleTimeString('en-IN');
  showToast('✓ Prices refreshed','success');
}
