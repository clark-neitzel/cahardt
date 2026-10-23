const {abrir,w,EV}=require('./lib');
(async()=>{
 const o=await abrir(); const {page}=o;
 await o.abrirIA();
 for (const [n,f] of [['Todo o período','todo'],['Este ano','ano'],['Últimos 30 dias','30d'],['Últimos 7 dias','7d'],['Este mês','mes'],['Hoje','hoje']]) {
   const ok=await o.preset(n); const t=await o.texto();
   const faixa=(t.match(/[^\n]*Mostrando os últimos 90 dias[^\n]*/)||[])[0]||'SEM FAIXA';
   const poucos=(t.match(/[^\n]*pouco histórico[^\n]*/)||[])[0]||'sem faixa poucos';
   const btn=await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.offsetParent&&b.innerText.includes('·'));return b&&b.innerText.replace(/\s+/g,' ')});
   console.log(`[${n}] clicou=${ok} botão="${btn}"\n   faixa90: ${faixa}\n   poucos: ${poucos}\n   scroll ${await o.scrollW()} reqs=${o.reqs.slice(-1)}`);
   await page.evaluate(()=>window.scrollTo(0,0)); await page.screenshot({path:EV+'i1-'+f+'-375.png'});
 }
 await o.browser.close();
})();
