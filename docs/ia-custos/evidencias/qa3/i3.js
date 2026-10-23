const {abrir,w,EV}=require('./lib');
(async()=>{
 const tag=process.argv[2]; const o=await abrir(); const {page}=o;
 await o.abrirIA();
 const t=await o.texto();
 console.log('[dash] moeda:',(t.match(/Valores em[^\n]*/)||['?'])[0]);
 console.log('[dash] "cadastrada"?', /cadastrada/.test(t));
 await o.shot('i3-'+tag+'-dash-375.png');
 await page.goto('http://localhost:5191/config/ia',{waitUntil:'networkidle2'}); await w(2000); await o.fechaModal(); await w(400);
 const ph=await page.evaluate(()=>[...document.querySelectorAll('input')].map(i=>({ph:i.placeholder,v:i.value})));
 console.log('[config] inputs:',JSON.stringify(ph));
 await page.evaluate(()=>{const l=[...document.querySelectorAll('label')].find(l=>/Cotação do dólar/.test(l.innerText));l&&l.scrollIntoView({block:'center'})}); await w(300);
 await o.shot('i3-'+tag+'-config-375.png');
 console.log('scroll',await o.scrollW());
 await o.browser.close();
})();
