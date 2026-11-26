/**
 * Regra de nome do cadastro de cliente/fornecedor (nov/2026) — espelha o backend,
 * com as MESMAS mensagens:
 *  - CPF (11 dígitos): Nome precisa de pelo menos 2 palavras (nome e sobrenome).
 *  - CNPJ (14 posições): razão social (Nome) E Nome Fantasia obrigatórios.
 * Documento incompleto/vazio: não valida nome aqui (o erro do documento já aparece).
 */
import { normalizarDoc } from './documento';

export const MSG_CPF_NOME = 'CPF exige nome e sobrenome (ex.: Maria Silva)';
export const MSG_CNPJ_NOME = 'CNPJ exige razão social e nome fantasia';

/** 'CPF' | 'CNPJ' | null conforme o tamanho do documento digitado. */
export function tipoDoc(documento) {
  const n = normalizarDoc(documento).length;
  if (n === 11) return 'CPF';
  if (n === 14) return 'CNPJ';
  return null;
}

/** Rótulos dos campos conforme o documento digitado. */
export function rotulosNome(documento) {
  const t = tipoDoc(documento);
  if (t === 'CPF') return { nome: 'Nome e sobrenome *', fantasia: 'Nome Fantasia', fantasiaObrigatoria: false, dicaNome: 'Digite nome e sobrenome (ex.: Maria Silva).', dicaFantasia: '' };
  if (t === 'CNPJ') return { nome: 'Razão social *', fantasia: 'Nome fantasia *', fantasiaObrigatoria: true, dicaNome: '', dicaFantasia: 'Obrigatório para CNPJ.' };
  return { nome: 'Razão Social / Nome *', fantasia: 'Nome Fantasia', fantasiaObrigatoria: false, dicaNome: '', dicaFantasia: '' };
}

/**
 * Devolve a mensagem de erro (string) ou '' se estiver ok.
 * Campo vazio genérico ("informe o nome") continua a cargo de cada tela.
 */
export function validarNomeCadastro({ documento, nome, nomeFantasia }) {
  const t = tipoDoc(documento);
  const n = String(nome == null ? '' : nome).trim();
  const f = String(nomeFantasia == null ? '' : nomeFantasia).trim();
  if (t === 'CPF') {
    if (n.split(/\s+/).filter(Boolean).length < 2) return MSG_CPF_NOME;
  } else if (t === 'CNPJ') {
    if (!n || !f) return MSG_CNPJ_NOME;
  }
  return '';
}
