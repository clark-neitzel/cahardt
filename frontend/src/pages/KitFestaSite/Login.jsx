import React, { useState } from 'react';
import { User, Lock, ArrowRight, Loader2, ChevronLeft } from 'lucide-react';
import publicApi, { setToken } from './api';

// Máscara CPF (11) ou CNPJ (14) conforme a quantidade de dígitos digitada
const maskDoc = (v) => {
  const d = v.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 11) return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  return d.replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2');
};
const cpfValido = (cpf) => {
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let s = 0; for (let i = 0; i < 9; i++) s += +cpf[i] * (10 - i);
  let d1 = (s * 10) % 11; if (d1 === 10) d1 = 0; if (d1 !== +cpf[9]) return false;
  s = 0; for (let i = 0; i < 10; i++) s += +cpf[i] * (11 - i);
  let d2 = (s * 10) % 11; if (d2 === 10) d2 = 0; return d2 === +cpf[10];
};
const cnpjValido = (cnpj) => {
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (base) => { let s = 0, pos = base.length - 7; for (let i = 0; i < base.length; i++) { s += +base[i] * pos--; if (pos < 2) pos = 9; } const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return calc(cnpj.slice(0, 12)) === +cnpj[12] && calc(cnpj.slice(0, 13)) === +cnpj[13];
};
const docValido = (d) => (d.length === 11 && cpfValido(d)) || (d.length === 14 && cnpjValido(d));

// Etapas: cpf -> login | criar | esqueci | reset | visitante
export default function Login({ onLogin, onVisitante, logo }) {
  const [etapa, setEtapa] = useState('cpf');
  const [cpf, setCpf] = useState('');
  const [senha, setSenha] = useState('');
  const [senha2, setSenha2] = useState('');
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [codigo, setCodigo] = useState('');
  const [info, setInfo] = useState(null); // resultado do checkCpf
  const [err, setErr] = useState('');
  const [load, setLoad] = useState(false);

  const cpfDigits = cpf.replace(/\D/g, '');

  const checar = async (e) => {
    e?.preventDefault();
    setErr('');
    if (!docValido(cpfDigits)) return setErr('Digite um CPF ou CNPJ válido.');
    setLoad(true);
    try {
      const r = await publicApi.checkCpf(cpf);
      setInfo(r);
      if (r.nome) setNome(r.nome);
      if (r.situacao === 'TEM_SENHA') setEtapa('login');
      else if (r.situacao === 'CRIAR_SENHA') setEtapa('criar');
      else setEtapa('visitante'); // SEM_CADASTRO
    } catch (e) { setErr(e.response?.data?.error || 'Erro ao verificar CPF/CNPJ.'); }
    finally { setLoad(false); }
  };

  const entrar = async (e) => {
    e?.preventDefault(); setErr(''); setLoad(true);
    try {
      const r = await publicApi.login(cpf, senha);
      setToken(r.token); onLogin(r.cliente);
    } catch (e) { setErr(e.response?.data?.error || 'Erro ao entrar.'); }
    finally { setLoad(false); }
  };

  const criar = async (e) => {
    e?.preventDefault(); setErr('');
    if (senha.length < 4) return setErr('A senha precisa ter ao menos 4 caracteres.');
    if (senha !== senha2) return setErr('As senhas não conferem.');
    setLoad(true);
    try {
      const r = await publicApi.criarSenha({ cpf, senha, nome, telefone });
      setToken(r.token); onLogin(r.cliente);
    } catch (e) { setErr(e.response?.data?.error || 'Erro ao criar senha.'); }
    finally { setLoad(false); }
  };

  const pedirCodigo = async () => {
    setErr(''); setLoad(true);
    try {
      const r = await publicApi.esqueciSenha(cpf);
      setEtapa('reset');
      setErr('');
      alert(`Enviamos um código para recuperar sua senha. (Demo: ${r.codigo})`);
    } catch (e) { setErr(e.response?.data?.error || 'CPF não encontrado.'); }
    finally { setLoad(false); }
  };

  const resetar = async (e) => {
    e?.preventDefault(); setErr('');
    if (senha.length < 4) return setErr('A senha precisa ter ao menos 4 caracteres.');
    setLoad(true);
    try {
      const r = await publicApi.resetSenha({ cpf, codigo, novaSenha: senha });
      setToken(r.token); onLogin(r.cliente);
    } catch (e) { setErr(e.response?.data?.error || 'Código inválido.'); }
    finally { setLoad(false); }
  };

  const voltar = () => { setEtapa('cpf'); setErr(''); setSenha(''); setSenha2(''); setCodigo(''); };

  return (
    <div className="login tex-board">
      <form className="login-card" onSubmit={e => e.preventDefault()}>
        <div className="login-top">
          <div className="sawtooth" style={{ position: 'absolute', top: 0, left: 0, right: 0 }} />
          {logo && <img src={logo} alt="Hardt" />}
          <h1>Área do cliente</h1>
          <p>Acesse para fazer seu pedido de Kit Festa</p>
        </div>
        <div className="login-body">
          {err && <div className="login-err">{err}</div>}

          {/* CPF */}
          {etapa === 'cpf' && (
            <>
              <div className="field">
                <label>CPF ou CNPJ</label>
                <div className="ip"><User size={18} />
                  <input inputMode="numeric" placeholder="CPF ou CNPJ" value={cpf} autoFocus
                    onChange={e => setCpf(maskDoc(e.target.value))} /></div>
              </div>
              <button className="btn btn-green btn-block" onClick={checar} disabled={load}>
                {load ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />} Continuar
              </button>
            </>
          )}

          {/* LOGIN (tem senha) */}
          {etapa === 'login' && (
            <>
              <p className="login-hint" style={{ marginTop: 0, marginBottom: 12 }}>Olá, <b>{nome}</b>! Digite sua senha.</p>
              <div className="field">
                <label>Senha</label>
                <div className="ip"><Lock size={18} />
                  <input type="password" placeholder="sua senha" value={senha} autoFocus
                    onChange={e => setSenha(e.target.value)} /></div>
              </div>
              <button className="btn btn-green btn-block" onClick={entrar} disabled={load}>
                {load ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />} Acessar
              </button>
              <div className="login-alt">
                <button type="button" onClick={pedirCodigo}>Esqueci minha senha</button>
              </div>
            </>
          )}

          {/* CRIAR SENHA (primeiro acesso) */}
          {etapa === 'criar' && (
            <>
              <p className="login-hint" style={{ marginTop: 0, marginBottom: 12 }}>
                {info?.temCadastroApp ? <>Encontramos seu cadastro, <b>{nome}</b>! Crie sua senha de acesso.</> : 'Crie sua senha para acessar.'}
              </p>
              {!info?.temCadastroApp && (
                <>
                  <div className="field"><label>Nome</label>
                    <div className="ip"><User size={18} /><input placeholder="seu nome" value={nome} onChange={e => setNome(e.target.value)} /></div></div>
                  <div className="field"><label>WhatsApp</label>
                    <div className="ip"><input placeholder="(47) 99999-0000" value={telefone} onChange={e => setTelefone(e.target.value)} /></div></div>
                </>
              )}
              <div className="field"><label>Nova senha</label>
                <div className="ip"><Lock size={18} /><input type="password" placeholder="crie uma senha" value={senha} onChange={e => setSenha(e.target.value)} /></div></div>
              <div className="field"><label>Confirmar senha</label>
                <div className="ip"><Lock size={18} /><input type="password" placeholder="repita a senha" value={senha2} onChange={e => setSenha2(e.target.value)} /></div></div>
              <button className="btn btn-green btn-block" onClick={criar} disabled={load}>
                {load ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />} Criar e acessar
              </button>
            </>
          )}

          {/* RESET com código */}
          {etapa === 'reset' && (
            <>
              <p className="login-hint" style={{ marginTop: 0, marginBottom: 12 }}>Digite o código que enviamos e a nova senha.</p>
              <div className="field"><label>Código</label>
                <div className="ip"><input placeholder="código recebido" value={codigo} onChange={e => setCodigo(e.target.value.toUpperCase())} /></div></div>
              <div className="field"><label>Nova senha</label>
                <div className="ip"><Lock size={18} /><input type="password" placeholder="nova senha" value={senha} onChange={e => setSenha(e.target.value)} /></div></div>
              <button className="btn btn-green btn-block" onClick={resetar} disabled={load}>
                {load ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />} Redefinir senha
              </button>
            </>
          )}

          {/* VISITANTE (sem cadastro) */}
          {etapa === 'visitante' && (
            <>
              <p className="login-hint" style={{ marginTop: 0, marginBottom: 12 }}>
                Não encontramos seu CPF/CNPJ no nosso cadastro. Sem problema! Você pode fazer o pedido e nossa equipe entra em contato para finalizar seu cadastro.
              </p>
              <div className="field"><label>Nome</label>
                <div className="ip"><User size={18} /><input placeholder="seu nome" value={nome} onChange={e => setNome(e.target.value)} autoFocus /></div></div>
              <div className="field"><label>WhatsApp</label>
                <div className="ip"><input placeholder="(47) 99999-0000" value={telefone} onChange={e => setTelefone(e.target.value)} /></div></div>
              <button className="btn btn-yellow btn-block" disabled={!nome.trim() || telefone.replace(/\D/g, '').length < 10}
                onClick={() => onVisitante({ cpf: cpfDigits, nome, telefone })}>
                <ArrowRight size={18} /> Fazer pedido sem cadastro
              </button>
            </>
          )}

          {etapa !== 'cpf' && (
            <div className="login-alt"><button type="button" onClick={voltar}><ChevronLeft size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> Trocar CPF/CNPJ</button></div>
          )}
        </div>
      </form>
    </div>
  );
}
