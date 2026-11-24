# API de consulta da IA — contrato protegido

> **Fonte ÚNICA deste assunto** (saiu do `CLAUDE.md` em 24/11/2026 — pedido do dono: regras mais
> simples e rápidas para os agentes). Regra nova entra AQUI, **alterando a regra que já trata do
> tema** — nunca empilhar outra por cima, nem copiar para ficha, habilidade ou memória.

---

## API de Consulta para IA Externa (`/api/ia-consulta/v1`) — NUNCA QUEBRAR O CONTRATO

Existe uma IA de atendimento via WhatsApp num projeto separado ("Antigravity", fora deste repo) que consulta dados do Hardt (catálogo/agenda/entrega do Kit Festa; catálogo/condição comercial dos Congelados; reconhecimento de cliente/histórico/criação de lead em `/cliente/*`, geral para qualquer linha) através de `backend/routes/iaConsultaRoutes.js`. Documentação completa: `backend/docs/ia-consulta-api.md`.

**O bot da Antigravity NÃO deve ter acesso direto ao banco de produção (`DATABASE_URL`/SQL cru).** Em 2026-07 descobrimos que ele rodava SQL direto contra `clientes`/`leads` porque essas funções não existiam nesta API ainda — isso ignora toda proteção daqui (telefone batendo, sem CPF sozinho, avisos de mudança) e quebrou quando o bot assumiu nomes de coluna errados. Se o bot precisar de dado novo, a resposta é **criar endpoint aqui**, nunca reintroduzir acesso direto ao banco.

**Por que isso é crítico:** o pior cenário é o cliente mandar mensagem no WhatsApp e a IA não conseguir responder porque uma mudança nossa quebrou o formato que ela espera — igual a derrubar uma tela, mas no atendimento ao cliente.

**Regras ao mexer em `iaConsultaRoutes.js`, nos controllers que ele usa, ou nos serviços por trás:**
1. **Nunca remover ou renomear um campo já existente** na resposta de um endpoint de `/v1`. Só adicionar campo novo é seguro sem aviso.
2. **Para remover/renomear algo:** primeiro registrar um aviso em `backend/config/iaConsultaVersao.js` (array `AVISOS`, com prazo), esperar o prazo, só então remover. Esse aviso aparece automaticamente em `meta.avisos` de toda resposta, para o app consumidor se ajustar antes da mudança valer.
3. **Mudança que quebra o formato de resposta** exige criar `/v2` (novo router paralelo, mantendo `/v1` no ar) — nunca alterar `/v1` de forma incompatível.
4. **Sempre testar com `curl` depois de qualquer mudança, antes de commitar** (exemplos no arquivo de docs) — mesma lógica do build do frontend: não subir sem testar.
5. Ao criar ou mudar qualquer endpoint aqui, **atualizar `backend/docs/ia-consulta-api.md`** no mesmo commit.
6. **Nunca liberar dado pessoal/comercial de um cliente (preço negociado, pedidos, crédito) só com CPF/CNPJ digitado.** CPF e principalmente CNPJ não são segredo (aparecem em nota fiscal, cartão de visita). A identificação válida é: telefone de quem manda a mensagem batendo com o telefone cadastrado (o WhatsApp já autentica o número), OU senha/código de verificação enviado ao telefone JÁ cadastrado (nunca a quem está pedindo). Ver `congeladosService.catalogoPorTelefone`/`criarSenhaPorTelefone` como padrão de referência.
