# Remoção dos avisos do Conta Azul (textos) — 29/10/2026

Pedido do dono: "fica dizendo que veio do CA, não usamos mais CA, quero que tire tudo isso do app
referente avisos do CA, não temos mais importação do CA".

## Escopo
- SÓ texto visível ao usuário: rótulos, títulos, tooltips (`title=`), toasts, textos de ajuda,
  placeholders, labels de badge/option, `confirm()`, mensagens de erro/sucesso devolvidas pela API,
  manuais do Clippy (`backend/manuais/abas/*.md`).
- NÃO renomear nada de código/dado: variáveis, campos do Prisma, valores de status/enum
  (`situacaoCA`, `FATURADO_CA`, `IMPORTADO_CA`, `CONTA_AZUL`, `idVendaContaAzul`,
  `contaFinanceiraCaId`, `origem: 'CA'`, `tipo: 'CA'`…), rotas, nomes de função, chaves de API.
  `situacaoCA` é o status de faturamento do sistema inteiro; `contaFinanceiraCaId` é a FK real de banco.
- "CA-Hardt" é o NOME DO APP — nunca mexer. `toLocaleDateString('en-CA')` é locale — nunca mexer.
- NÃO mexer em `backend/routes/iaConsultaRoutes.js` nem nos campos de resposta da API `/v1`.
- Área protegida (`ModalDevolucao.jsx`, `focusNfeEmissaoService.js`): só trocar o conteúdo
  das strings; não mudar lógica, exceto o item "wizard" abaixo.

## Vocabulário (de → para)
| Antes | Depois |
|---|---|
| faturado no CA / no Conta Azul | faturado |
| Situação CA | Faturamento |
| `CA: {situacaoCA}` | `{situacaoCA}` (sem prefixo) |
| Faturado CA (origem) | Faturado |
| Importada do CA / importada do CA (baixa fica só no app) | Importada (antiga) — tirar o parêntese inteiro |
| NF-e CA / Emitida no CA / NF-e do Conta Azul | NF-e antiga (importada) |
| Nota CA: X | Nota de devolução antiga: X |
| Baixa CA / Quitar CA / Baixar no Caixa (Quitar CA) | Baixa / Quitar / Baixar no Caixa |
| Quitar N entrega(s) no Conta Azul (caixinha)? | Quitar N entrega(s) no caixa? |
| vai para o Conta Azul / enviado ao Conta Azul / e envia ao Conta Azul / aqui e no Conta Azul / não altera no Conta Azul / não vai ao CA | REMOVER a oração inteira (nada é enviado a lugar nenhum) |
| Cadastre no Conta Azul, sincronize… | Cadastre o cliente em Clientes → Novo e vincule |
| Tarifa do boleto CA | Tarifa do boleto (antigo) |
| Conta do CA (nome de banco desconhecido) | Conta antiga |
| Ped CA: / Nome ou número CA | Pedido: / Nome ou número do pedido |
| CA — Normal (tipo de pedido) | Normal |
| ORIGEM CA_SYNC 'Conta Azul' / CA_FORNECEDOR 'CA · fornecedor' | 'Importação antiga' / 'Fornecedor' |
| Regras por Categoria CA | Regras por Categoria |
| Pedidos com erro de envio ao Conta Azul | Pedidos com erro de faturamento |
| Despesa já enviada ao Conta Azul… (trava de parcela) | Despesa antiga (importada): dá para ajustar vencimento e valor das parcelas em aberto |
| notas antigas do Conta Azul | notas antigas (anteriores ao app) |

## Elementos de tela 100% do CA que devem SUMIR (o token do CA está morto desde 09/2026; só dão erro)
Remover o botão/pílula/coluna/seção da tela. Backend (rotas) fica como está, salvo a mensagem.
- `ListaPedidos.jsx`: botão "Sync CA"; pílula "CA" de boleto + popover "Cobranças CA" (desktop e mobile); ícone SVG "CA" se só servir a isso.
- `ContasReceberTabela.jsx`: botão "Baixar parcelas do CA"; botões "Sync CA" (3 lugares); modal "Sync CA — progresso"; ação "Verificar baixas no Conta Azul"; campo "ID CA" no detalhe; `observacao.startsWith('CA:')` bloco → manter dado mas sem rótulo CA.
- `ConciliacaoBancariaPage.jsx`: botão "Identificar débitos no CA"; "(app + CA)" sai do botão Corrigir; texto de ajuda do rodapé reescrito sem CA (importar OFX ou PDF do extrato para banco que não gera OFX).
- `ContasPagarPage.jsx`: coluna "Conta Azul" (status de envio) e ícones de fila/erro de envio; ação "Reenviar à Conta Azul"; bloco "Erro no envio à Conta Azul".
- `ImprimirLoteModal.jsx`: sinal "CA" por pedido; aviso "Não consegui consultar o Conta Azul em N pedidos"; textos → "Conferindo boletos (Asaas)".
- `NotasCertificadoConfig.jsx`: seção "Conexão Conta Azul (informativo)".
- `SecaoAsaas.jsx`: StatusItem "Conta no Conta Azul".
- `HistoricoEstoque.jsx`: linha "Erro CA:".
- `BoletosAsaasModal.jsx`: "· baixa no CA OK/pendente".
- `ListaDevolucoes.jsx`: "Processado no CA"; badge de tipo `CONTA_AZUL` → "NORMAL".
- **Wizard de devolução no CA** (`ModalDevolucao.jsx` → `WizardProcessarCA.jsx`): o wizard chama a API do CA (morta) e a devolução já cancela boleto/PIX do Asaas sozinha. Fazer `isBoleto` ser sempre `false` (comentário explicando), tirar o texto "um assistente guiado ajudará a processar no Conta Azul", botão vira "Registrar devolução · R$ X". NÃO mexer na chamada automática de NF-e nem no resto do `handleSalvar`. Apagar `WizardProcessarCA.jsx` se ninguém mais importar.

## Verificação
- Frontend: `cd frontend && npm run build` obrigatório. Depois `grep -rnE "Conta Azul|\bCA\b" frontend/src | grep -v en-CA | grep -v CA-Hardt` só pode sobrar em comentário ou identificador de código.
- Backend: `node --check` em cada arquivo tocado; subir backend local e dar curl numa rota tocada.
- Manuais: `grep -rnE "Conta Azul|\bCA\b" backend/manuais | grep -v CA-Hardt` → zero.
