#!/usr/bin/env python3
"""Hook UserPromptSubmit do CA-Hardt.

Roda a cada mensagem enviada pelo dono e injeta no contexto a regra do fluxo de
equipe de agentes. É o que garante que a regra valha SEMPRE, em qualquer sessão,
sem depender de o modelo lembrar do CLAUDE.md.

Desenho (14/08/2026): o hook NÃO decide mais se a equipe é dispensada.
Regex não distingue quem PEDE de quem CITA a expressão — "por que voce rodou sem
agentes ontem?" não é um pedido de dispensa, e a versão antiga desligava a equipe
inteira nesses casos, em silêncio. Agora:
  - sem menção  -> injeta a REGRA (caminho normal, saída suprimida);
  - com menção  -> injeta a REGRA + um bloco de desempate mandando o MODELO julgar
                   a intenção (ele entende português), e a decisão fica VISÍVEL
                   para o dono via systemMessage (sem suppressOutput).

Saída: JSON no formato esperado pelo Claude Code (hookSpecificOutput.additionalContext).
Sai SEMPRE com código 0 e SEMPRE imprimindo JSON válido, mesmo com entrada quebrada —
o hook não pode travar o trabalho em hipótese nenhuma.
"""
import json
import re
import sys

REGRA = """REGRA PERMANENTE DESTE PROJETO — equipe de agentes (definida pelo dono, ver secao "Forma de trabalho" no CLAUDE.md).

Toda solicitacao que MUDA o sistema (codigo, tela, rota, config, deploy) e executada pelo fluxo de equipe, nunca sozinho:
- Pequena (texto, cor, campo simples): dev-backend/dev-frontend -> revisor-codigo.
- Media (tela nova, correcao de bug, relatorio): dev -> qa-testador + revisor-codigo (em paralelo) -> gerente-entrega.
- Grande (modulo novo, fiscal/financeiro/WhatsApp/NF-e, migracao): arquiteto -> devs -> qa-testador + revisor-codigo -> gerente-entrega.

Regras do fluxo:
1. Reprovacao do QA ou do revisor volta para o dev; repete ate passar.
2. NADA e entregue ao dono sem o veredito do gerente-entrega.
3. O dono e o cliente: a entrega final e a "nota de entrega" em portugues simples (o que mudou, o que foi testado, o que ele precisa conferir, o que ficou pendente).
4. Voce (thread principal) e o gerente de projeto: coordena, nao faz o trabalho do dev sozinho.

NAO se aplica a: pergunta/consulta/diagnostico que nao altera arquivo, e conversa. Nesses casos responda direto."""

DESEMPATE = """
---
DESEMPATE — uma expressao de dispensa da equipe ("sem agentes", "sem equipe", "nao usar a equipe" ou parecida) apareceu NESTA mensagem do dono. O hook nao decide isso: quem julga a intencao e voce.

Decida assim:
- Se a expressao e o COMANDO da mensagem (o dono esta mandando que VOCE execute esta tarefa sozinho, sem subagentes): trabalhe sozinho, mantendo todos os padroes do projeto (build do frontend antes de commitar, regras criticas do CLAUDE.md), e DIGA ISSO NA PRIMEIRA LINHA DA SUA RESPOSTA (ex.: "Trabalhando sem a equipe de agentes, como voce pediu.").
- Se a expressao esta apenas CITADA — entre aspas, dentro de uma pergunta sobre o proprio mecanismo/hook, referindo-se ao passado, ou dentro de um pedido de mudanca que continua valendo: MANTENHA a equipe e siga a regra acima normalmente.

NA DUVIDA, MANTENHA A EQUIPE. O custo de conferir demais e pequeno; o de entregar sem conferencia ja custou caro a este projeto."""

# Regex AMPLA, so para DETECTAR a mencao — falso positivo aqui e barato (o modelo
# julga em seguida e, na duvida, mantem a equipe). Nao ha mais heuristica de
# comprimento: tamanho de texto nunca separou pedido de citacao.
PADRAO_MENCAO = re.compile(
    r"\b(?:sem|nao|não|dispensa[rn]?|dispense|pula|pule|pular)\s+"
    r"(?:usar\s+|chamar\s+|acionar\s+|precisa(?:r)?\s+de\s+)?"
    r"(?:a\s+|o\s+|os\s+|as\s+)?"
    r"(?:equipe|agentes?|subagentes?|sub-agentes?)\b",
    re.IGNORECASE,
)

# Texto de sistema (notificação de tarefa, lembrete do harness) não é pedido do dono:
# o desempate NUNCA pode ser acionado por palavras que apareçam dentro de um relatório.
MARCAS_DE_SISTEMA = (
    "SYSTEM NOTIFICATION",
    "<task-notification>",
    "<system-reminder>",
    "<local-command-caveat>",
)

AVISO_VISIVEL = (
    "Equipe de agentes: expressao de dispensa detectada — "
    "decidindo pela intencao da mensagem (na duvida, a equipe e mantida)."
)

_EMITIDO = False


def emitir(payload: dict) -> None:
    """Imprime o JSON do hook uma única vez."""
    global _EMITIDO
    if _EMITIDO:
        return
    _EMITIDO = True
    sys.stdout.write(json.dumps(payload))
    sys.stdout.write("\n")
    sys.stdout.flush()


def payload_regra(contexto: str, aviso: str = "") -> dict:
    saida = {
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": contexto,
        },
        # Caminho normal fica silencioso; quando ha mencao, o dono PRECISA enxergar.
        "suppressOutput": not aviso,
    }
    if aviso:
        saida["systemMessage"] = aviso
    return saida


def ler_prompt() -> str:
    """Lê o prompt do stdin sem nunca levantar exceção."""
    try:
        dados = json.load(sys.stdin)
    except Exception:
        return ""
    if not isinstance(dados, dict):  # ex.: array na raiz ([1,2,3]) ou string solta
        return ""
    try:
        return str(dados.get("prompt") or "")
    except Exception:
        return ""


def main() -> None:
    prompt = ler_prompt()

    e_texto_do_sistema = any(marca in prompt for marca in MARCAS_DE_SISTEMA)
    tem_mencao = (not e_texto_do_sistema) and bool(PADRAO_MENCAO.search(prompt))

    if tem_mencao:
        emitir(payload_regra(REGRA + "\n" + DESEMPATE, AVISO_VISIVEL))
    else:
        emitir(payload_regra(REGRA))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        # Rede de seguranca: qualquer falha inesperada ainda entrega a REGRA pura.
        try:
            emitir(payload_regra(REGRA))
        except Exception:
            pass
    sys.exit(0)
