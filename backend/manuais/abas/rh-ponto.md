# Ponto

**Rota:** `/rh/ponto` · **Permissão:** `Pode_Ver_RH` (ver) / `Pode_Editar_RH` (ajustar/importar)

Controle de ponto eletrônico da equipe. O funcionário bate o ponto por um **link pessoal** (sem login) e o RH acompanha tudo aqui. Trabalha junto com a aba **Funcionários** (cadastro, escala e cartão de ponto).

## Como o funcionário bate o ponto (link público)
- Cada funcionário tem um **link fixo** (`/ponto/<token>`), gerado na ficha dele em Funcionários → aba Dados.
- O acesso exige **senha** (definida pelo RH na ficha → aba Dados → "Senha de acesso ao ponto"). Sem senha definida, o link mostra "acesso ainda não liberado". A sessão fica salva no aparelho por alguns dias para não pedir a senha toda vez.
- **Bloquear acesso:** na ficha → aba Dados, desmarque **"Acesso liberado"** (campo `ativo`) quando a pessoa deixar de ser funcionário/prestador — o link recusa o login na hora.
- Ao entrar, o funcionário vê o relógio ao vivo, o status (Fora / Trabalhando) e um **botão único que alterna**: 1º toque = Entrada, 2º = Saída, 3º = Entrada… (modelo livre).
- Cada batida registra a **localização (GPS)**. Tocando no horário de uma batida, abre o **mapa** do local.
- **Geofence:** se houver ponto da empresa configurado, o ponto só pode ser batido dentro do **raio** definido (ex.: 10 m). Fora da área, o registro é bloqueado com aviso da distância.

## Configurar a área da empresa (geofence) e o link
- No Painel de Ponto → **Configurar** (`/rh/ponto/config`): define a **latitude/longitude** da empresa e o **raio em metros**. Há o botão **Usar minha localização atual** (captura o GPS do aparelho) e um **mapa** de prévia.
- **Domínio do link de ponto:** define o início do link enviado ao funcionário (ex.: domínio da hardtsalgados). Em branco, usa o domínio em que o app está aberto.
- A opção **Bloquear batida fora da área** liga/desliga o bloqueio. Sem localização configurada, o ponto é registrado sem checagem de área.

## Painel de Ponto (admin)
- KPIs do dia: **trabalhando agora**, total de ativos e fora.
- Tabela com as **batidas de hoje** de cada funcionário, com link do mapa em cada horário e status (Trabalhando / Fora).
- Botão **Ajustar** leva à ficha do funcionário (aba Cartão de ponto) para corrigir/adicionar batidas.

## Ajustar / adicionar batida
- Na ficha do funcionário → **Cartão de ponto** → **Adicionar batida**: informa data, hora, tipo (Entrada/Saída) e motivo. Fica marcada como **ajuste manual** (registra quem ajustou). Útil quando o funcionário esqueceu de bater.

## Importar ponto do relógio (CSV)
- Em **Funcionários → Importar** (ou no Painel de Ponto → Importar): sobe a planilha **CSV** exportada pelo relógio de ponto físico.
- Passos: **enviar o arquivo** → **mapear as colunas** (CPF/matrícula, data, hora e, opcionalmente, tipo) → **conferir a prévia** → **importar**.
- O sistema casa cada batida pelo **CPF/matrícula** com o funcionário cadastrado, **ignora duplicadas** (mesma pessoa, dia e hora) e alterna Entrada/Saída quando não há coluna de tipo.
- Batidas importadas entram **sem GPS** e marcadas como origem **CSV** (diferente das batidas pelo link, que têm localização).

## Cartão de ponto / regras
- A **carga diária** vem da escala do funcionário. Com **janela móvel**, se entrar antes, a saída esperada desloca mantendo a mesma carga; só o que passar disso vira **banco de horas** ou **hora extra paga** (conforme o tipo configurado por funcionário).
- O espelho mostra, por dia: batidas, previsto, trabalhado e saldo; e no resumo do mês: total trabalhado, saldo do banco, hora extra e faltas/atrasos. Dias com atestado entram como **abonados**.
