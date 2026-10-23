const {abrir,w,EV}=require('./lib'); const {execSync}=require('child_process');
const db=()=>execSync(`psql "${process.env.PGURL}" -t -A -c "select value from app_configs where key='ia_precos'"`).toString().trim();
(async()=>{
 const o=await abrir(); const {page}=o;
 page.on('request',r=>{if(r.url().includes('/config/ia')&&r.method()==='PUT')console.log('PUT body',r.postData())});
 await page.goto('http://localhost:5191/config/ia',{waitUntil:'networkidle2'}); await w(2000); await o.fechaModal(); await w(400);
 const inputs=async()=>page.evaluate(()=>[...document.querySelectorAll('input')].map(i=>i.value));
 const limpa=async(idx)=>{await o.fechaModal(); await w(300);const h=(await page.$$('input'))[idx]; await h.click(); const n=await page.evaluate(i=>document.querySelectorAll('input')[i].value.length,idx); await page.evaluate(i=>{const e=document.querySelectorAll('input')[i];e.setSelectionRange(e.value.length,e.value.length)},idx); for(let k=0;k<n+2;k++) await page.keyboard.press('Backspace');};
 const digita=async(idx,v)=>{await limpa(idx); const h=(await page.$$('input'))[idx]; await h.type(v);};
 const salvar=async()=>{ const ok=await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(b=>/Salvar/.test(b.innerText)&&b.offsetParent);if(!b)return 'sem botão';b.click();return 'clicou disabled='+b.disabled}); console.log('salvar:',ok); await w(2500); };
 console.log('ini',JSON.stringify(await inputs()),db());
 await digita(2,'3'); await salvar(); console.log('após b',db(),JSON.stringify(await inputs()));
 await limpa(2); console.log('após limpa2',JSON.stringify(await inputs())); await limpa(3); console.log('após limpa3',JSON.stringify(await inputs())); await salvar();
 console.log('c)',db(),JSON.stringify(await inputs()));
 await o.shot('i4d.png');
 await o.browser.close();
})();
