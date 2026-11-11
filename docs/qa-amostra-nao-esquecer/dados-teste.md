# Dados de teste - Amostra que ninguem esquece (banco LOCAL hardt_local)

Criados em 11/11/2026 (hoje = 2026-11-11). Para voltar ao estado inicial: `cd backend && node ../docs/qa-amostra-nao-esquecer/reset-dados.js`
(reseta status/carga das A1-A8; nao recria nada).

Backend local: `cd backend && JWT_SECRET=teste-local-claude node index.js` (porta 3000). Token: `jwt.sign({ id, nome }, 'teste-local-claude')`.

## Cargas
| Carga | id | data |
|---|---|---|
| #2771 (C1) | 4eec8dc1-a306-433a-812f-ae725d6cab33 | hoje, motorista Josiane |
| #2772 (C2) | 425397da-43d1-411c-a490-67409ecd81a7 | hoje, motorista Junior |
| #2773 (C3) | a7edbde5-ac41-4788-9c02-2bec66d63b48 | amanha, motorista Josiane |

## Amostras
| # | AM# | id | destino | dataEntrega | status inicial | carga | solicitante |
|---|---|---|---|---|---|---|---|
| A1 | 50 | ea4ea57a-db7c-43a6-b8bb-c2ca7e808e83 | BAR DO NEGAO (Guaramirim) | hoje | SOLICITADA | - | Jociel (vendedor comum) |
| A2 | 51 | 758592b0-a410-4850-88db-ab0ccdfcb0dd | C&K Borracharia (Joinville) | amanha 12/11 | PREPARACAO | - | Josiane |
| A3 | 52 | 77305aca-3d4e-486b-b262-1a167dcf8f09 | LEAD Padaria ART pao (Balneario Picarras) | 14/11 | LIBERADO | - | Josiane |
| A4 | 53 | 3a1f7b01-6085-4fc4-936c-122c33c9bb11 | KELI TRAILER (Joinville) | sem data | SOLICITADA | - | Josiane |
| A5 | 54 | 99a8dd06-b295-4d23-aed7-1a415b7262a9 | JOCIEL ALONSIO (Joinville) | ontem 10/11 | SOLICITADA | - | Josiane |
| A6 | 55 | 4d062d52-3821-4166-b846-92c02021f152 | GOMED CLINICA | hoje | LIBERADO | C1 | Josiane |
| A7 | 56 | 53762924-fd31-4aeb-96b8-3be8d0738b8e | PATOLA ACAI | hoje | ENTREGUE | C1 | Josiane |
| A8 | 57 | edecee1f-13cd-4621-ac34-852560c7b3af | POSTO DE MAIOCHI | hoje | CANCELADA | - | Josiane |

Ja existia no banco: AM#777777 (LIBERADO, sem carga, sem data, solicitante Atendimento ADMIN) - aparece na faixa como cinza; AM#29/30/31 em cargas antigas.
Todas as 8 criadas tem 1 item e observacao "QA amostra-nao-esquecer Ax".

## Usuarios (ids em `vendedores`)
| Perfil | nome | id |
|---|---|---|
| Admin | Clarkson Neitzel | cd3dff75-91e1-4284-8d20-f933b7ae31e3 |
| So Pode_Acessar_Embarque (pedidos.clientes=todos) | Josiane | 8818c4b9-d832-4bc0-8b64-ebec1ad43be5 |
| So Pode_Acessar_Embarque (vinculados) | Junior | 1c8621d7-77ac-45db-84da-25ef1e67435e |
| Vendedor comum (so Pedidos, vinculados; criou A1) | Jociel | 2eebf9f2-6dda-49be-aa9f-8b853476c4cd |
| Sem nenhuma das permissoes (403) | Edilson | d7e38053-fee1-441f-932b-4756bc53f0dc |
Nenhum usuario local tem apenas `Pode_Ver_Pendencias`; para esse teste, dar a permissao a um usuario de teste no banco local.
