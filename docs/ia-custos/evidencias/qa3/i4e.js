const {abrir,w,EV}=require('./lib'); const {execSync}=require('child_process');
const db=()=>execSync(`psql "${process.env.PGURL}" -t -A -c "select value from app_configs where key='ia_precos'"`).toString().trim();
(async()=>{
 const o=await abrir(); const {page}=o;
 await page.goto('http://localhost:5191/config/ia',{waitUntil:'networkidle2'}); await w(2000); await o.fechaModal(); await w(400);
 const inputs=async()=>page.evaluate(()=>[...document.querySelectorAll('input')].map(i=>i.value));
 const limpa=async(idx)=>{await o.fechaModal(); const h=(await page.$$('input'))[idx]; await h.click(); const n=await page.evaluate(i=>document.querySelectorAll('input')[i].value.length,idx); await page.evaluate(i=>{const e=document.querySelectorAll('input')[i];e.setSelectionRange(e.value.length,e.value.length)},idx); for(let k=0;k<n+2;k++) await page.keyboard.press('Backspace');};
 const digita=async(idx,v)=>{await limpa(idx); const h=(await page.$$('input'))[idx]; await h.type(v);};
 // clique real no Salvar (blur do campo)
 const salvarReal=async()=>{ await page.evaluate(()=>window.scrollTo(0,0)); const btn=await page.evaluateHandle(()=>[...document.querySelectorAll('button')].find(b=>/Salvar/.test(b.innerText)&&b.offsetParent)); await btn.asElement().click(); await w(2500); };
 await digita(2,'0'); await digita(3,'0'); console.log('digitado',JSON.stringify(await inputs()));
 await salvarReal(); console.log('após salvar (clique real) tela',JSON.stringify(await inputs()),'db',db());
 await o.shot('i4-zero-descartado-375.png');
 // 0 só na entrada com saída válida
 await digita(2,'0'); await digita(3,'7'); await salvarReal(); console.log('entrada 0/saida 7 -> tela',JSON.stringify(await inputs()),'db',db());
 await o.browser.close();
})();
