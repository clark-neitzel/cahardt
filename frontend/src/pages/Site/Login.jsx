import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import publicApi, { setToken } from './api';

const soDigitos = (s) => String(s || '').replace(/\D/g, '');
// Máscara leve CPF/CNPJ conforme o tamanho
function mascara(v) {
  const d = soDigitos(v).slice(0, 14);
  if (d.length <= 11) {
    return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return d.replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

export default function Login({ logo, whatsapp, titulo, sub, onLogin, onVisitante }) {
  const [etapa, setEtapa] = useState('doc'); // doc | senha | criar | visitante | reset
  const [doc, setDoc] = useState('');
  const [nome, setNome] = useState('');
  const [senha, setSenha] = useState('');
  const [telefone, setTelefone] = useState('');
  const [origem, setOrigem] = useState(null); // 'kitfesta' = usa senha do Kit Festa
  const [codigo, setCodigo] = useState('');
  const [telMasc, setTelMasc] = useState('');
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState(false);

  const docDigits = soDigitos(doc);
  const docOk = docDigits.length === 11 || docDigits.length === 14;

  const handleErro = (e) => setErro(e?.response?.data?.error || e.message || 'Algo deu errado.');

  async function continuarDoc(e) {
    e.preventDefault();
    if (!docOk) { setErro('Informe um CPF ou CNPJ válido.'); return; }
    setErro(''); setBusy(true);
    try {
      const r = await publicApi.checkDoc(docDigits);
      if (r.nome) setNome(r.nome);
      setOrigem(r.origem || null);
      if (r.situacao === 'TEM_SENHA') setEtapa('senha');
      else if (r.situacao === 'CRIAR_SENHA') setEtapa('criar');
      else setEtapa('visitante');
    } catch (e) { handleErro(e); }
    finally { setBusy(false); }
  }

  async function enviarCodigo() {
    setErro(''); setBusy(true);
    try {
      const r = await publicApi.esqueciSenha(docDigits);
      setTelMasc(r.telefone || '');
      setEtapa('reset');
    } catch (e) { handleErro(e); }
    finally { setBusy(false); }
  }

  async function redefinir(e) {
    e.preventDefault();
    setErro(''); setBusy(true);
    try {
      const r = await publicApi.resetSenha({ documento: docDigits, codigo, novaSenha: senha });
      setToken(r.token);
      onLogin(r.cliente);
    } catch (e) { handleErro(e); }
    finally { setBusy(false); }
  }

  async function entrar(e) {
    e.preventDefault();
    setErro(''); setBusy(true);
    try {
      const r = await publicApi.login(docDigits, senha);
      setToken(r.token);
      onLogin(r.cliente);
    } catch (e) { handleErro(e); }
    finally { setBusy(false); }
  }

  async function criar(e) {
    e.preventDefault();
    setErro(''); setBusy(true);
    try {
      const r = await publicApi.criarSenha({ documento: docDigits, senha, nome, telefone });
      setToken(r.token);
      onLogin(r.cliente);
    } catch (e) { handleErro(e); }
    finally { setBusy(false); }
  }

  function entrarVisitante(e) {
    e.preventDefault();
    if (!nome.trim()) { setErro('Informe seu nome / nome da empresa.'); return; }
    onVisitante({ nome: nome.trim(), documento: docDigits, telefone: soDigitos(telefone) });
  }

  const waLink = `https://wa.me/${whatsapp || '5547988548476'}?text=${encodeURIComponent('Olá! Quero me cadastrar para comprar congelados Hardt.')}`;

  return (
    <div className="cg-login tex-board">
      <div className="cg-login-card">
        <div className="sawtooth"></div>
        <div className="cg-login-in">
          <img className="logo" src={logo} alt="Hardt" />
          <h1>{titulo || 'Área do cliente'}</h1>
          <p className="sub">{sub || 'Entre para ver seus produtos, preços e condições e fazer seu pedido de congelados.'}</p>

          {erro && <div className="cg-login-err">{erro}</div>}

          {etapa === 'doc' && (
            <form onSubmit={continuarDoc}>
              <div className="cg-field">
                <label>CPF / CNPJ ou código</label>
                <input className="cg-input" inputMode="numeric" value={doc} onChange={e => setDoc(mascara(e.target.value))} placeholder="000.000.000-00" autoFocus />
              </div>
              <button type="submit" className="btn btn-yellow btn-block" disabled={busy || !docOk} style={{ marginTop: 8 }}>
                {busy ? 'Aguarde…' : 'Continuar'}
              </button>
              <p className="cg-login-note">Ainda não é cliente cadastrado?<br /><a href={waLink} target="_blank" rel="noopener noreferrer">Fale com a gente no WhatsApp</a></p>
            </form>
          )}

          {etapa === 'senha' && (
            <form onSubmit={entrar}>
              <p className="sub" style={{ marginBottom: 16 }}>Olá, <b style={{ color: 'var(--green-dd)' }}>{nome}</b>! Digite sua senha.</p>
              {origem === 'kitfesta' && <p className="cg-login-note" style={{ marginTop: 0, marginBottom: 12 }}>Use a <b style={{ color: 'var(--green-dd)' }}>mesma senha do seu Kit Festa</b>.</p>}
              <div className="cg-field">
                <label>Senha</label>
                <input className="cg-input" type="password" value={senha} onChange={e => setSenha(e.target.value)} placeholder="••••••••" autoFocus />
              </div>
              <button type="submit" className="btn btn-yellow btn-block" disabled={busy} style={{ marginTop: 8 }}>{busy ? 'Entrando…' : 'Entrar'}</button>
              <p className="cg-login-note" style={{ marginTop: 12 }}>
                <a onClick={!busy ? enviarCodigo : undefined}>Esqueci minha senha</a>
              </p>
              <button type="button" className="cg-back" onClick={() => { setEtapa('doc'); setSenha(''); setErro(''); }}>← usar outro documento</button>
            </form>
          )}

          {etapa === 'criar' && (
            <form onSubmit={criar}>
              <p className="sub" style={{ marginBottom: 16 }}>Primeiro acesso — crie uma senha pra sua conta.</p>
              <div className="cg-field">
                <label>Nome / Empresa</label>
                <input className="cg-input" value={nome} onChange={e => setNome(e.target.value)} placeholder="Seu nome ou da empresa" />
              </div>
              <div className="cg-field">
                <label>Crie uma senha</label>
                <input className="cg-input" type="password" value={senha} onChange={e => setSenha(e.target.value)} placeholder="ao menos 4 caracteres" autoFocus />
              </div>
              <button type="submit" className="btn btn-yellow btn-block" disabled={busy} style={{ marginTop: 8 }}>{busy ? 'Criando…' : 'Criar conta e entrar'}</button>
              <button type="button" className="cg-back" onClick={() => { setEtapa('doc'); setSenha(''); setErro(''); }}>← voltar</button>
            </form>
          )}

          {etapa === 'reset' && (
            <form onSubmit={redefinir}>
              <p className="sub" style={{ marginBottom: 16 }}>Enviamos um código para o seu WhatsApp{telMasc ? <> <b style={{ color: 'var(--ink)' }}>{telMasc}</b></> : ''}. Informe abaixo e crie uma nova senha.</p>
              <div className="cg-field">
                <label>Código recebido</label>
                <input className="cg-input" value={codigo} onChange={e => setCodigo(e.target.value.toUpperCase())} placeholder="ex: A1B2C3" autoFocus />
              </div>
              <div className="cg-field">
                <label>Nova senha</label>
                <input className="cg-input" type="password" value={senha} onChange={e => setSenha(e.target.value)} placeholder="ao menos 4 caracteres" />
              </div>
              <button type="submit" className="btn btn-yellow btn-block" disabled={busy} style={{ marginTop: 8 }}>{busy ? 'Salvando…' : 'Salvar e entrar'}</button>
              <p className="cg-login-note" style={{ marginTop: 12 }}><a onClick={!busy ? enviarCodigo : undefined}>Reenviar código</a></p>
              <button type="button" className="cg-back" onClick={() => { setEtapa('senha'); setErro(''); }}>← voltar</button>
            </form>
          )}

          {etapa === 'visitante' && (
            <form onSubmit={entrarVisitante}>
              <p className="sub" style={{ marginBottom: 16 }}>Não encontramos seu cadastro. Você pode <b style={{ color: 'var(--chalk)' }}>fazer o pedido mesmo assim</b> — nossa equipe finaliza seu cadastro depois.</p>
              <div className="cg-field">
                <label>Nome / Empresa</label>
                <input className="cg-input" value={nome} onChange={e => setNome(e.target.value)} placeholder="Seu nome ou da empresa" autoFocus />
              </div>
              <div className="cg-field">
                <label>Telefone (WhatsApp)</label>
                <input className="cg-input" inputMode="numeric" value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(47) 9 9999-9999" />
              </div>
              <button type="submit" className="btn btn-yellow btn-block" style={{ marginTop: 8 }}>Ver catálogo e pedir</button>
              <p className="cg-login-note">Prefere falar com a gente? <a href={waLink} target="_blank" rel="noopener noreferrer">Cadastro pelo WhatsApp</a></p>
              <button type="button" className="cg-back" onClick={() => { setEtapa('doc'); setErro(''); }}>← voltar</button>
            </form>
          )}

          <p className="cg-login-note" style={{ marginTop: 18 }}>
            <Link to="/inicio" style={{ color: 'var(--chalk-dim)' }}>← voltar ao site</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
