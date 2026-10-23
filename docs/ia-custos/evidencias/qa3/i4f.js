const {abrir,w,EV}=require('./lib');
(async()=>{
 const o=await abrir(); const {page}=o;
 await page.goto('http://localhost:5191/config/ia',{waitUntil:'networkidle2'}); await w(2500); await o.fechaModal(); await w(300);
 const t=await o.texto();
 console.log((t.match(/Gasto estimado[^\n]*\n[^\n]*\n[^\n]*/)||[''])[0]);
 console.log('aviso sem preço:',(t.match(/[^\n]*Não conheço o preço[^\n]*/)||['(nenhum aviso de modelo da config)'])[0]);
 const cards=await page.evaluate(()=>[...document.querySelectorAll('.md\\:hidden .rounded-xl.border')].filter(e=>/QA3|MONTAR|Montar|gpt-6|modelo-xyz/.test(e.innerText)).slice(0,6).map(e=>e.innerText.replace(/\s+/g,' ')));
 console.log(cards.join('\n'));
 console.log('linha desconhecido:', await page.evaluate(()=>[...document.querySelectorAll('div')].filter(e=>e.children.length<6&&/modelo-xyz-desconhecido/.test(e.innerText)).map(e=>e.innerText.replace(/\s+/g,' ')).slice(-1)[0]));
 console.log('scroll',await o.scrollW());
 await page.evaluate(()=>{const e=[...document.querySelectorAll('p')].find(p=>/Histórico de uso/.test(p.innerText)||false); const s=[...document.querySelectorAll('span')].find(p=>/Histórico de uso/.test(p.innerText)); s&&s.scrollIntoView()}); await w(300);
 await o.shot('i4-historico-375.png'); await page.evaluate(()=>window.scrollTo(0,0)); await o.shot('i4-config-topo-375.png');
 await o.browser.close();
})();
