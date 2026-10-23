const {abrir,w,EV}=require('./lib');
(async()=>{
 for (const who of ['comum','dashadmin']) {
  const o=await abrir(who); const {page}=o;
  const resp=[]; page.on('response',r=>{if(/ia-uso|config\/ia/.test(r.url()))resp.push(r.status()+' '+r.url().split('/api')[1])});
  await page.goto('http://localhost:5191/',{waitUntil:'networkidle2'}); await w(1500); await o.fechaModal(); await w(300);
  const btnsIA=await page.evaluate(()=>[...document.querySelectorAll('button')].filter(b=>/^\s*IA\s*$/.test(b.textContent)).length);
  console.log(who,'botão IA:',btnsIA,'| reqs ia:',resp.join(','),'| texto dash:',(await o.texto()).slice(0,80).replace(/\n/g,' '));
  await o.shot('i6-'+who+'-home-375.png');
  await page.goto('http://localhost:5191/config/ia',{waitUntil:'networkidle2'}); await w(1500); await o.fechaModal();
  console.log(who,'/config/ia ->',(await o.texto()).slice(0,100).replace(/\n/g,' '),'| reqs',resp.join(','));
  await o.browser.close();
 }
 // admin: outras abas
 const o=await abrir('admin',false); const {page}=o;
 const errs=[]; page.on('response',r=>{if(r.status()>=400&&r.url().includes(':3131'))errs.push(r.status()+' '+r.url().split('/api')[1])});
 await page.goto('http://localhost:5191/',{waitUntil:'networkidle2'}); await w(1500); await o.fechaModal(); await w(300);
 const abas=await page.evaluate(()=>[...document.querySelectorAll('button')].filter(b=>b.offsetParent&&b.closest('div')&&/Visão Geral|Vendas & Pedidos|Financeiro|Estoque|Produ|Clientes|Equipe|Indicadores|IA/.test(b.innerText.trim())&&b.innerText.trim().length<30).map(b=>b.innerText.trim()));
 console.log('abas:',[...new Set(abas)].join(' | '));
 for (const a of [...new Set(abas)]) {
   await page.evaluate((a)=>{const b=[...document.querySelectorAll('button')].filter(b=>b.offsetParent&&b.innerText.trim()===a).pop();b&&b.click()},a); await w(2500); await o.fechaModal();
   const t=await o.texto(); console.log('aba',a,'-> len',t.length,'| erro visível?',/Algo deu errado|Não foi possível carregar|Erro/.test(t));
 }
 console.log('respostas >=400:',errs.join(', ')||'nenhuma');
 await o.shot('i6-admin-desktop.png');
 await o.browser.close();
})();
