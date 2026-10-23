const {abrir,w,EV}=require('./lib'); const {execSync}=require('child_process');
const db=()=>execSync(`psql "${process.env.PGURL}" -t -A -c "select value from app_configs where key='ia_precos'"`).toString().trim();
(async()=>{
 const o=await abrir(); const {page}=o;
 await page.goto('http://localhost:5191/config/ia',{waitUntil:'networkidle2'}); await w(2000); await o.fechaModal(); await w(400);
 const inputs=async()=>page.evaluate(()=>[...document.querySelectorAll('input')].map(i=>i.value));
 const limpa=async(idx)=>{await o.fechaModal(); await w(300);const h=(await page.$$('input'))[idx]; await h.click(); const n=await page.evaluate(i=>document.querySelectorAll('input')[i].value.length,idx); await page.evaluate(i=>{const e=document.querySelectorAll('input')[i];e.setSelectionRange(e.value.length,e.value.length)},idx); for(let k=0;k<n+2;k++) await page.keyboard.press('Backspace');};
 const digita=async(idx,v)=>{await limpa(idx); const h=(await page.$$('input'))[idx]; await h.type(v);};
 const salvar=async()=>{ await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(b=>/Salvar/.test(b.innerText)&&b.offsetParent);b.click()}); await w(2000); };
 console.log('inicial',JSON.stringify(await inputs()),'| db',db());
 // a) apagar só ENTRADA com Backspace e salvar
 await limpa(2); console.log('após backspace entrada',JSON.stringify(await inputs())); await salvar();
 console.log('a) salvo (só entrada apagada) -> db',db(),'| tela',JSON.stringify(await inputs()));
 // b) preço válido
 await digita(2,'2,5'); await digita(3,'9'); await salvar();
 console.log('b) válido -> db',db(),'| tela',JSON.stringify(await inputs()));
 // c) limpar ambos
 await limpa(2); await limpa(3); await salvar();
 console.log('c) ambos limpos -> db',db(),'| tela',JSON.stringify(await inputs()));
 // d) cotação manual e limpar
 await digita(4,'5,7'); await salvar(); console.log('d1) cotação 5,7 -> db',db());
 await limpa(4); await salvar(); console.log('d2) cotação limpa -> db',db());
 // e) digitar 0
 await digita(2,'0'); await digita(3,'0'); await salvar(); console.log('e) 0 e 0 -> db',db(),'| tela',JSON.stringify(await inputs()));
 await o.shot('i4-config-final-375.png');
 await o.browser.close();
})();
