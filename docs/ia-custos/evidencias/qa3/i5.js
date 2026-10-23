const {abrir,w,EV}=require('./lib');
(async()=>{
 const o=await abrir(); const {page}=o;
 await o.abrirIA(); await o.preset('Hoje'); await o.fechaModal();
 let t=await o.texto();
 console.log('linhas com "<":',JSON.stringify([...t.matchAll(/[^\n]*< R\$ 0,01[^\n]*/g)].map(m=>m[0])));
 console.log('scroll',await o.scrollW());
 const kp=await page.evaluate(()=>[...document.querySelectorAll('p,div')].filter(e=>e.children.length===0&&/< R\$ 0,01/.test(e.textContent)).map(e=>{const r=e.getBoundingClientRect(),p=e.parentElement.getBoundingClientRect();return {t:e.textContent,w:Math.round(r.width),right:Math.round(r.right),pw:Math.round(p.width),pright:Math.round(p.right),sw:e.scrollWidth,cw:e.clientWidth}}));
 console.log('KPI geometria',JSON.stringify(kp));
 await page.evaluate(()=>window.scrollTo(0,0)); await o.shot('i5-kpi-menor-centavo-375.png');
 await o.preset('Últimos 30 dias');
 // gráfico: tocar no dia
 const box=await page.evaluate(()=>{const g=document.querySelector('[aria-label="Custo por dia"]'); g.scrollIntoView({block:'center'}); const r=g.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}});
 await w(300);
 const b2=await page.evaluate(()=>{const r=document.querySelector('[aria-label="Custo por dia"]').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}});
 await page.touchscreen.tap(b2.x+b2.w*0.9,b2.y+b2.h/2); await w(400);
 const det=()=>page.$eval('[data-testid=detalhe-dia]',e=>e.innerText.replace(/\s+/g,' '));
 const d1=await det(); console.log('toque no gráfico ->',d1);
 // re-clicar IA (tick), voltar ao app (visibilitychange) e botão refresh
 await page.evaluate(()=>window.scrollTo(0,0)); await w(200); await o.clicarIA(); await w(2500); await o.fechaModal();
 console.log('após re-clicar IA ->',await det());
 await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});document.dispatchEvent(new Event('visibilitychange'));Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'))}); await w(2500);
 console.log('após voltar ao app ->',await det());
 console.log('reqs:',o.reqs.slice(-3));
 await o.shot('i5-dia-selecionado-375.png');
 // recarrega a página inteira (F5)
 await page.reload({waitUntil:'networkidle2'}); await w(1500); await o.fechaModal();
 console.log('após F5, existe detalhe-dia?', await page.$('[data-testid=detalhe-dia]')!==null, 'aba:', (await o.texto()).includes('Uso e custo da IA')?'IA':'outra');
 await o.browser.close();
})();
