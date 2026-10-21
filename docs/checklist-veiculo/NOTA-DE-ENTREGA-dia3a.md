# Nota de entrega: checklist de veículo, Dia 3 (fatias 3-0 e 3A)

**Data:** 21/10/2026
**Veredito do gerente de entrega:** REPROVADO (leve) em 21/10, por 2 ajustes pequenos listados em "Antes de publicar". Tudo o mais foi conferido e está aprovado: corrigidos os 2 itens e refeita uma captura da Central, a entrega está liberada para commit e deploy sem nova rodada completa.

---

## O que muda para o motorista

- **Fechar o dia agora é com fotos.** Ao tocar em *Finalizar*, em vez de digitar o KM, o app pede **3 fotos**: painel (com o KM), traseira e o baú ou porta-malas (que tem que estar vazio e limpo). Carro particular só tira o painel.
- **O KM final sai do painel.** A IA lê o número na foto e pergunta *"Painel marca X. Confirma?"*. Tocou em *Confirma*, o KM final está pronto e é esse que vale.
- **Aviso se digitar diferente.** Se a pessoa preferir corrigir e digitar um KM que fica mais de 30 km longe do que o painel mostra, o app avisa *"O KM não bate com o painel"* e pede para conferir (dá para seguir, mas fica registrado). Se rodou muito acima da média do carro, pergunta de novo antes de encerrar.
- **Pergunta "Bateu ou raspou em algo hoje?"** Se responder *Sim*, o app pede também as fotos das duas laterais.
- **Nunca trava.** Se a câmera, o sinal ou a IA falharem, o botão *"Não consegui tirar as fotos, digitar o KM"* encerra o dia como antes. Esse dia fica marcado para o escritório como "volta sem foto".
- **Cortina do dia seguinte.** Quem esqueceu de fechar o dia anterior vê a mesma tela de fotos na manhã seguinte (a foto fica marcada como atrasada), ou digita o KM.
- Nada disso impede ninguém de encerrar ou de abrir o dia: o checklist continua em **modo teste**.

## O que muda para o escritório

- **Pendência "Volta sem foto".** Cada dia em que alguém saiu de carro e não mandou as fotos da volta aparece na **Central de Pendências**, no bloco *"Veículos: volta sem foto"*, e na tela `/veiculos/pendencias`. A lista é calculada sozinha, ninguém precisa preencher.
- **OK do responsável.** Quem é administrador ou está na lista *"Quem libera e dá OK"* toca em *Dar OK* e escreve um motivo (mínimo 5 letras). O item sai da lista e fica no histórico dos últimos 30 dias, com nome, hora e motivo. OK repetido não duplica; quem não está na lista não consegue dar OK (o servidor recusa).
- **Aviso das 6h.** Todo dia, entre 6h e 9h, os responsáveis recebem um WhatsApp interno com os dias dos últimos 7 dias ainda sem foto da volta e sem OK. Sem pendência, não sai mensagem. Sai uma vez só por dia.
- **Onde configurar "quem libera".** *Configurações → Checklist de veículos → Quem libera e dá OK*. Se a lista ficar vazia, valem os administradores ativos com telefone cadastrado.
- **A pendência conta a partir do dia do primeiro acesso.** O sistema grava sozinho uma data de início (`checklist_volta_inicio`) na primeira vez em que a lista de pendências é consultada depois do deploy; dias anteriores a essa data não viram pendência (para não despejar o histórico antigo). Para mudar a data: `PUT /api/checklists-veiculo/config/responsaveis` com `{ "voltaInicio": "AAAA-MM-DD" }` (só administrador).
- **Arrumação (3-0):** apagar veículo e ver a lista completa (com inativos) agora exigem a mesma permissão da tela de Veículos; antes qualquer usuário logado conseguia pelo servidor. Se o último KM do carro não carregar, a tela não mostra mais um "Confirma?" vazio.

## O que foi testado e por quem

- **QA (clicando, app local + navegador automatizado, 375 px e 1440 px):** fechar o dia com as 3 fotos e confirmar o KM do painel; "Sim" para bateu/raspou abrindo as laterais; perguntas da IA (Sim/Não) antes de encerrar; KM digitado diferente do painel (aviso); KM acima da média (confirmação); clique duplo sem encerrar duas vezes; fallback "não consegui tirar as fotos"; cortina do dia seguinte com fotos; `/ultimo-km` com erro 500 sem o cartão "Confirma?"; checklist desligado; Central de Pendências com o bloco novo; tela de pendências com OK, motivo obrigatório, OK repetido e usuário sem permissão (403); card de Configurações salvando "quem libera". 49 capturas em `docs/checklist-veiculo/evidencias-qa-dia3a/`.
- **Revisor de código:** 2 rodadas (backend e frontend), achados corrigidos (aviso de divergência, KM excessivo após as perguntas, data/typo da cortina, chaves de lista, `bateuOuRaspou` gravado no servidor).
- **Gerente de entrega:** compilou a entrega isolada do resto do que está em andamento (worktree limpo só com estes arquivos): build do frontend OK (`✓ built in 5.76s`, chunk `ChecklistPendencias` gerado), `node --check` nos 15 arquivos do backend OK, `prisma validate` OK, `require` de todos os serviços e rotas OK. Conferido: transação de `encerrarDia` com `timeout: 20000`; fotos gravadas em `backend/uploads/checklists-veiculo` (volume persistente); WhatsApp só no worker, `tipo: 'interno'`, referência fixa por dia e destinatário (`chk-pend-<dia>-<id>`), texto cortado em 1990 caracteres, janela 06:00–09:00 em horário de Brasília, um envio por dia; schema só com campos novos (nada removido); app antigo em cache continua funcionando (o envio só com `kmFinal` segue o caminho de sempre); permissões do servidor iguais às da tela; página de novidade sem `og:image`, sem botão "Abrir o app", accordions abertos; `deployMarker` = `checklist-dia3a-2026-10-22`.

## Antes de publicar (os 2 ajustes do veredito)

1. **Manual de Veículos (`backend/manuais/abas/veiculos.md`)** afirma: *"Depois dá para mandar as fotos e a pendência some"*. Hoje não existe tela para isso: quem encerrou digitando o KM só sai da pendência pelo OK do responsável (o envio tardio das fotos existe apenas na API). Trocar a frase por algo como: *"Quem encerrou digitando o KM fica na lista até o responsável dar OK; mandar as fotos depois, pela tela, vem numa próxima entrega."* O Clippy lê esse manual e responderia errado ao motorista.
2. **Central de Pendências, bloco "Veículos: volta sem foto":** a linha mostra a data certa no título (`20/10 · motorista · placa`) e a data **errada no rodapé** (`19/10/2026`), porque `dataRef` vai como `AAAA-MM-DD` e a Central converte com `new Date(...)` em UTC. Captura: `evidencias-qa-dia3a/central-bloco.png`. Dois jeitos de resolver (o dono decide): (a) só o nosso bloco, no backend (`pendenciasService.js`, `blocoVeiculosPendencias`): mandar `dataRef: \`${p.dataReferencia}T12:00:00-03:00\``; ou (b) corrigir `fmtData` em `PainelPendencias.jsx` para tratar `AAAA-MM-DD` como data local, o que arruma também o bloco *Caixas para conferir*, que tem o mesmo defeito (`2026-05-12` aparece como `11/05/2026`). A opção (b) mexe em arquivo fora desta entrega: avisar o dono antes.

## O que o dono precisa fazer

1. **Definir quem libera e dá OK:** *Configurações → Checklist de veículos → Quem libera e dá OK*, escolher as pessoas e tocar em *Salvar quem libera*. Elas precisam ter telefone no cadastro para receber o aviso das 6h. (Leva 1 minuto.)
2. **Testar a volta no celular de verdade:** com um dia presencial aberto, tocar em *Finalizar*, tirar as 3 fotos, confirmar o KM do painel e entregar. Depois, no computador, abrir o Caixa do dia e conferir que o KM final gravado é o do painel.
3. **Conferir o aviso das 6h amanhã:** entre 6h e 9h, os responsáveis devem receber o WhatsApp *"Veículos · pendências de volta"* se houver algum dia sem foto; se não houver pendência, não chega nada (e isso está certo). Em *Configurações → Notificação WhatsApp* dá para ver se a mensagem saiu.

## Pendências e o que ficou de fora

- **Rascunhos duplicados** (D3): se o app disparar duas criações de rascunho no mesmo instante, podem nascer dois rascunhos da volta. Comportamento já existia na saída; risco baixo (um deles fica sem uso). Fica para a próxima fatia.
- **Selo da volta no card do Caixa:** o dado já vai na resposta da API, mas o selo ao lado do da saída ainda não aparece na tela.
- **Mandar as fotos depois, pela tela**, para quem encerrou digitando o KM (hoje só pelo OK do responsável).
- **3B** liberação pelo escritório (reprovado com resposta do responsável), **3C/F2** despesas com cupom, **trava** (modo TRAVA) e **3D** comparação com foto modelo: próximas fatias do plano.
- **Clippy:** a tela `/veiculos/pendencias` está descrita dentro dos manuais de Veículos e da Central de Pendências, não como aba própria na tabela do Clippy.
- **`backend/tok.json`** está na pasta do projeto, fora do `.gitignore`, com 5 tokens de acesso (JWT) usados nos testes. **Não commitar**; apagar ou acrescentar ao `.gitignore`.
- **Novidade no Clippy:** a entrada `checklist-volta` ainda precisa ser registrada no topo de `frontend/public/novidades.json` junto com o commit (texto pronto abaixo).

Entrada para `novidades.json`:

```json
{
  "slug": "checklist-volta",
  "titulo": "Ao entregar o carro, agora são fotos",
  "resumo": "No fim do dia o motorista tira 3 fotos do veículo e o app lê o KM do painel. Se a câmera falhar, digita o KM como antes e o escritório dá o OK na Central de Pendências.",
  "data": "2026-10-22"
}
```

## Texto para o grupo do WhatsApp

```
📸 *Novidade no app: fotos ao entregar o carro*

A partir de amanhã, ao tocar em *Finalizar* no fim do dia, o app pede 3 fotos do veículo: *painel, traseira e baú/porta-malas* (vazio e limpo).

✅ O app lê o KM no painel e só pergunta "Confirma?". Não precisa mais digitar.
🚗 Se bateu ou raspou em algo, responda *Sim* e tire também as laterais.
📵 Câmera sem sinal? Toque em *"Não consegui tirar as fotos"* e digite o KM como antes.

Para o escritório: quem fechou o dia sem foto aparece na *Central de Pendências*, e quem está na lista dá o OK com motivo.

Ainda é fase de teste: nada trava ninguém.

Veja as telas: https://cahardt-github.xrqvlq.easypanel.host/novidade-checklist-volta.html
```

## Prova em produção (preenchida pelo gerente de projeto em 21/10, 17:25)

- [x] Backend: `GET /api/admin-exec/ping` devolveu `deployMarker: checklist-dia3a-2026-10-22` (commit ec054a3b, ~80 s após o push).
- [x] Frontend: o bundle de produção `/assets/index-lrBQG6-y.js` contém "Não consegui tirar as fotos".
- [x] Rotas novas existem (sem token respondem 401, não 404): `GET /api/checklists-veiculo/pendencias` e `GET /api/checklists-veiculo/config/responsaveis`. Página `novidade-checklist-volta.html` responde 200.
- [ ] Uma volta real no celular do dono (fotos, KM do painel confirmado, encerrar o dia): só com login e aparelho.
- [ ] Aviso das 6h de amanhã no WhatsApp interno e criação da tabela `pendencias_veiculo_ok`/data `checklist_volta_inicio` na primeira abertura da Central: amanhã cedo.
