const {abrir,w,EV}=require('./lib'); const {execSync}=require('child_process');
const db=()=>execSync(`psql "${process.env.PGURL}" -t -A -c "select value from app_configs where key='ia_precos'"`).toString().trim();
(async()=>{
 const o=await abrir(); const {page}=o;
 page.on('response',r=>{if(r.url().includes('/config/ia')&&r.request().method()==='PUT')r.text().then(t=>console.log('PUT',r.status(),r.request().postData(),'=>',t.slice(0,200)))});
 await page.goto('http://localhost:5191/config/ia',{waitUntil:'networkidle2'}); await w(2000); await o.fechaModal(); await w(400);
 const inputs=async()=>page.evaluate(()=>[...document.querySelectorAll('input')].map(i=>i.value));
 const limpa=async(idx)=>{const h=(await page.$$('input'))[idx]; await h.click(); const n=await page.evaluate(i=>document.querySelectorAll('input')[i].value.length,idx); await page.evaluate(i=>{const e=document.querySelectorAll('input')[i];e.setSelectionRange(e.value.length,e.value.length)},idx); for(let k=0;k<n+2;k++) await page.keyboard.press('Backspace');};
 const salvar=async()=>{ await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(b=>/Salvar/.test(b.innerText)&&b.offsetParent);b.click()}); await w(2000); };
 console.log('ini',JSON.stringify(await inputs()),db());
 await limpa(2); console.log('após limpa2',JSON.stringify(await inputs())); await limpa(3); console.log('após limpa3',JSON.stringify(await inputs())); await salvar();
 console.log('c) ambos limpos -> db',db(),'| tela',JSON.stringify(await inputs()));
 await o.browser.close();
})();
