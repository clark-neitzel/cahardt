const {abrir,w,EV}=require('./lib');
(async()=>{
 const o=await abrir(); const {page}=o;
 await o.abrirIA(); await o.preset('Período personalizado');
 console.log('inputs date:', await page.evaluate(()=>[...document.querySelectorAll('input[type=date]')].map(i=>i.value+'|'+i.offsetParent)));
 const setv=async(idx,v)=>{ const h=(await page.$$('input[type=date]'))[idx]; await h.focus(); await page.keyboard.type(v); };
 await setv(0,'01082026'); await setv(1,'05082026'); await w(300);
 await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].filter(b=>b.offsetParent&&/Aplicar|OK|Filtrar/.test(b.innerText)).pop(); b&&b.click()}); await w(2500);
 const t=await o.texto();
 console.log('reqs',o.reqs.slice(-2));
 console.log('faixa poucos:',(t.match(/[^\n]*pouco histórico[^\n]*/)||['AUSENTE (esperado)'])[0]);
 console.log('texto vazio:',(t.match(/[^\n]*(Nenhuma|sem uso|Sem uso)[^\n]*/)||['?'])[0]);
 await page.evaluate(()=>window.scrollTo(0,0)); await o.shot('i2-C-periodo-sem-chamadas-375.png');
 await o.browser.close();
})();
