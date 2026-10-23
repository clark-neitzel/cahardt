const {abrir,w}=require('./lib');
(async()=>{ const o=await abrir(); const {page}=o; await o.abrirIA();
 const b=await page.evaluate(()=>{const g=document.querySelector('[aria-label="Custo por dia"]');g.scrollIntoView({block:'center'});const r=g.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}}); await w(300);
 const b2=await page.evaluate(()=>{const r=document.querySelector('[aria-label="Custo por dia"]').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}});
 await page.touchscreen.tap(b2.x+b2.w*0.5,b2.y+b2.h/2); await w(300);
 console.log('antes F5:',await page.$eval('[data-testid=detalhe-dia]',e=>e.innerText.replace(/\s+/g,' ')));
 await page.reload({waitUntil:'networkidle2'}); await w(2000); await o.fechaModal(); await page.evaluate(()=>{document.querySelector('[aria-label="Custo por dia"]').scrollIntoView({block:'center'})});
 console.log('depois F5:',await page.$eval('[data-testid=detalhe-dia]',e=>e.innerText.replace(/\s+/g,' ')));
 await o.browser.close(); })();
