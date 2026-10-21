# Checklist de veículo, Dia 2, Parte A: frases, perguntas de um toque e menos alarme falso

**Data:** 21/10/2026 · **Veredito do gerente de entrega:** LIBERADO COM PENDÊNCIA (ver "Prova em produção" e "Ressalva antes do commit")

Esta é a primeira fatia do Dia 2. Ela sai hoje para valer amanhã cedo, na saída dos motoristas. As Partes B e C (visualizador de fotos, desenhos, aviso ao escritório, Caixa, desktop) continuam em desenvolvimento e **não** estão neste pacote.

---

## O que muda amanhã para o motorista

1. **A IA fala como gente do pátio.** Acabaram as frases de laudo ("não consigo avaliar os pneus dianteiros", "compartimento do motor exposto", "fotografe sobre papel branco"). Agora é curto, direto e com medida: "Chega 2 passos pra trás: preciso ver as duas rodas da frente", "Afasta uns 30 cm e pega o reservatório inteiro, com as letras MIN e MAX", "Fecha o capô e tira de novo". A orientação escrita de cada foto (antes de tirar) também mudou para o mesmo tom.

2. **Freio de mão, porta aberta e cinto não reprovam mais.** Ontem os dois Bongos foram reprovados por "luz de porta aberta" e "luz vermelha do freio", com o carro parado no pátio, porta aberta e freio de mão puxado, que é o normal. Agora o sistema sabe que o carro está parado: essas luzes viram uma **pergunta**, não um problema. Só reprovam de verdade: óleo, temperatura, bateria, motor/injeção, airbag, ABS e direção.

3. **Perguntas de um toque (Sim / Não).** Quando a IA não consegue confirmar algo sozinha mas o motorista consegue olhando o carro, aparece uma pergunta com dois botões grandes:
   - "O freio de mão está puxado e a porta aberta?" → **Sim** resolve na hora ("Você confirmou: ...") e, se não sobrou mais nada, a tela fica verde "Tudo certo" com o botão **Seguir**.
   - **Não** vira atenção (ou grave, conforme o caso) e o motorista vê o que fazer.
   - Reservatório de água opaco (o Uno) e vareta sem leitura também viram pergunta em vez de "tira de novo". É no máximo **uma pergunta por foto**.
   - Enquanto a pergunta não é respondida, ela não conta como problema. A resposta fica gravada com a hora.

4. **Chega de "tira de novo" sem fim.** No máximo 2 pedidos de refazer por foto. Na 3ª tentativa a IA aproveita o que dá e, se não der, faz a pergunta de um toque.

5. **KM com tolerância.** Erro de digitação de até 30 km passa (antes era 5). De 31 a 1.000 vira atenção "Painel marca X. Confere o KM que você digitou". Acima de 1.000 continua reprovando.

6. **Combustível só quando é certeza.** A IA só aponta "Abastece antes da rota" se a luz da reserva está acesa ou o ponteiro está no E de forma inequívoca. Ontem ela chutou "reserva" em painéis com meio tanque; agora na dúvida não diz nada.

7. **Porta-malas do carro de passeio.** As bolsas pretas são o mostruário e são normais; a IA só olha organização e limpeza. Ontem mandou "organizar as bolsas para ver o mostruário".

8. **Títulos da tela de resultado:** "Dá uma olhada nisso antes de sair" (tem problema) ou "Só confirma uma coisa pra mim" (só tem pergunta).

9. **No escritório** (ficha do veículo, aba Checklists): a pergunta aparece na lista com o selo "Respondeu: Sim" ou "Respondeu: Não", e a miniatura da foto ganha o selo "Respondida" ou "Pergunta".

---

## O que foi provado (e por quem)

**Com as 24 fotos reais de hoje (21/10)** — a IA de verdade, rodando o código deste pacote sobre as fotos dos dois Bongos e do Uno (resultado em `evidencias-qa-parteA/prova-ia-gerente-2026-10-21.txt`; o "antes" está em `fotos-reais-2026-10-21/pareceres-dia1.txt`):

| Foto | Ontem (Dia 1) | Hoje (Parte A) |
|---|---|---|
| Bongo RLJ1I28, painel | REPROVA "luz de porta aberta" | Pergunta "A porta está aberta?" · KM 206.380 lido certo |
| Bongo RLB6E01, painel | REPROVA "luz vermelha do freio... chame a manutenção" | Pergunta "O freio de mão está puxado e a porta está aberta?" · KM 272.767 lido certo |
| Uno RNB0I36, painel | ATENÇÃO "combustível na reserva" + triângulo | Sem alarme de combustível · pergunta sobre o triângulo · KM 159.564 lido certo |
| Uno, porta-malas | ATENÇÃO "não identifico o mostruário nem a caixa térmica" | OK |
| Uno, água do radiador | ATENÇÃO "confira o nível diretamente" | Pergunta "Acende a lanterna atrás ou abre a tampa: a água tá entre MIN e MAX?" |
| Uno, vareta | ATENÇÃO "fotografe sobre papel branco" | OK, nível lido |
| Bongo RLJ1I28, frente | "Confira a pressão dos pneus" | ATENÇÃO "Chega 2 passos pra trás: preciso ver as duas rodas da frente" |

Nenhuma frase com palavra proibida (veículo, compartimento, nítido, avaliar, "não consigo", ponto de exclamação) em nenhuma das 7 respostas.

**QA clicando na tela (375 px, celular):** rodada 1 reprovou 3 coisas (resposta "Sim" sumia no escritório; alarme falso de combustível; "Seguir" depois do "Tudo certo" gravava "seguiu em teste"). Tudo corrigido e a rodada 2 aprovou: pergunta com botões Sim/Não, "Tudo certo" com Seguir, "Não" virando atenção, regra do KM (272.767 × 272.700 = atenção) continuando a valer depois da resposta, selos no escritório. Capturas em `evidencias-qa-parteA/`.

**Revisor de código:** 3 rodadas, última aprovada.

**Gerente de entrega (esta nota):**
- `node --check` nos 5 arquivos do backend: OK.
- Build do frontend numa cópia limpa com **só** o código publicado + os arquivos deste pacote (sem nada das Partes B/C): **passou** ("built in 5.73s"). Prova de que o commit compila sozinho.
- Nenhum arquivo deste pacote importa algo das Partes B/C (grep por `SeloChecklist`, `checklistEscritorioService`, `VisualizadorFotos`, campos novos do schema): nada.
- Caminho de upload inalterado (`backend/uploads/checklists-veiculo`); nenhum campo removido do schema (o schema nem entra); nenhuma transação nova; nenhum segredo no diff nem nos documentos.
- Permissão: a rota nova `POST /checklists-veiculo/:id/responder` só aceita o dono do checklist (mesma trava de `avaliar`); no app, só o próprio motorista vê os botões. Front = back.
- Marcador de deploy: `checklist-parteA-2026-10-21` (`/api/admin-exec/ping`).

---

## Ressalva antes do commit (1 frase no manual)

No manual `backend/manuais/abas/veiculos.md` está escrito "Combustível na reserva **ou abaixo de 1/4** vira atenção". O código só aponta combustível com a **luz da reserva acesa ou o ponteiro no E**; "abaixo de 1/4" não existe na regra. Trocar por: "Combustível só vira atenção ('Abastece antes da rota') quando a luz da reserva está acesa ou o ponteiro está claramente no E; na dúvida a IA não fala nada." Ajuste de texto, sem código.

---

## O que o dono deve observar amanhã (1 minuto por carro)

- **Bongos:** o painel tem que vir com a pergunta do freio/porta, não com "Grave". Se vier "Grave" por freio ou porta, me avise com a placa e a hora.
- **Perguntas:** ver se os motoristas respondem (Sim/Não) ou se pulam direto para "Seguir mesmo assim". Na ficha do veículo, aba Checklists, aparece "Respondeu: Sim/Não".
- **Frases:** se alguma frase vier estranha ou difícil de entender, copiar e mandar. O modelo não é determinístico: a mesma foto pode receber uma resposta diferente em outra rodada; o que é fixo é a regra do sistema (freio/porta/cinto nunca reprovam; combustível só com certeza; KM até 30).
- **Tempo:** foto do painel leva de 15 a 27 segundos para analisar. Se passar de 40 s a análise cai em "IA indisponível" e a foto sobe sem análise (não trava a saída).

---

## O que NÃO entrou ainda (Partes B e C, em desenvolvimento)

- Visualizador de fotos em tela cheia, desenhos/marcações sobre a foto e "Tá certo assim" (aceitar a foto).
- Aviso por WhatsApp ao escritório na hora e os resumos de 7h e 13h.
- Checklist dentro do Caixa e a versão desktop para o escritório (lista "checklists de hoje").
- Cadastro do veículo com tipo de vareta, reservatório opaco, "normal dentro" e avarias conhecidas.
- Página de novidade no app (Clippy): sai junto com as Partes B/C, numa página só (`novidade-checklist-foto-v2.html`, já escrita). Por isso hoje o aviso à equipe é só pelo WhatsApp (texto abaixo).
- 9 mensagens de erro do servidor ainda dizem "veículo" (fora do escopo desta fatia).

Previsão: Partes B e C seguem o plano em `PLANO-dia2.md`; data combinada com o gerente de projeto.

---

## Prova em produção

_(a preencher depois do deploy)_

- [ ] `GET /api/admin-exec/ping` devolve `deployMarker: checklist-parteA-2026-10-21`
- [ ] Checklist real de um Bongo amanhã cedo: painel com pergunta de freio/porta, não "Grave"
- [ ] Resposta Sim/Não gravada e visível na ficha do veículo (aba Checklists)

---

## Texto para o grupo do WhatsApp (sem link)

```
*Checklist do veículo: mudou amanhã cedo* 🚚📸

Ajustamos o que a IA fala e o que ela cobra:

✅ Freio de mão puxado, porta aberta e cinto solto *não dão mais problema* (o carro tá parado no pátio, é normal).
✅ Quando ela não tiver certeza, vai aparecer uma *pergunta com botão Sim / Não*. É só olhar o carro e responder.
✅ As frases ficaram curtas e diretas: "chega 2 passos pra trás", "afasta 30 cm", "fecha o capô e tira de novo".
✅ Errou o KM por até 30 km? Passa.

Se alguma frase vier estranha, manda print aqui no grupo que a gente ajusta. 🙏
```

---

## Arquivos do commit

Backend: `services/checklistVeiculoIaService.js`, `services/checklistVeiculoService.js`, `config/checklistVeiculoAngulos.js`, `routes/checklistsVeiculo.js`, `manuais/abas/veiculos.md`, `routes/adminExec.js` (só o marcador).
Frontend: `components/Diario/ChecklistFotos.jsx`, `components/Diario/ChecklistProblemaTela.jsx`, `components/Diario/FormVeiculoPresencial.jsx`, `pages/Veiculos/ChecklistsVeiculoLista.jsx`, `services/checklistVeiculoService.js`.
Docs: `docs/checklist-veiculo/PLANO-dia2.md`, `docs/propostas/proposta-checklist-dia2.html`, `docs/checklist-veiculo/fotos-reais-2026-10-21/`, `docs/checklist-veiculo/evidencias-qa-parteA/`, esta nota.
