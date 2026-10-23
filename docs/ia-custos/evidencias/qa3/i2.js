const {abrir,w,EV}=require('./lib');
(async()=>{
 const tag=process.argv[2]; const o=await abrir(); const {page}=o;
 await o.abrirIA(); await o.preset('Últimos 30 dias');
 const t=await o.texto();
 console.log('faixa:',(t.match(/[^\n]*pouco histórico[^\n]*/)||['AUSENTE'])[0]);
 console.log('selos POUCOS DADOS na tela:', (t.match(/POUCOS DADOS/g)||[]).length);
 const linhas=await page.evaluate(()=>[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&/POUCOS DADOS/.test(e.textContent)).map(e=>{let p=e;for(let i=0;i<4&&p.parentElement;i++)p=p.parentElement;return p.innerText.replace(/\s+/g,' ').slice(0,120)}));
 console.log(linhas.join('\n'));
 await page.evaluate(()=>window.scrollTo(0,0)); await o.shot('i2-'+tag+'-topo-375.png'); await o.shot('i2-'+tag+'-full-375.png',true);
 // período sem chamadas: personalizado -> setar via storage? usar Hoje depois de zerar não; tenta preset 'Todo' n/a
 await o.browser.close();
})();
