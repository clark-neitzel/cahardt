import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Monitor, Plus, KeyRound, Ban, RefreshCw, Download, Copy, Loader2 } from 'lucide-react';
import impressaoService from '../../../services/impressaoService';
import { Card, Modal, EstadoAgente, haQuanto, btnPrim, btnSec, btnPerigo, btnGhost, inputCls, labelCls, erroDe } from './comuns';

// Nome do arquivo sem caracteres estranhos
const nomeArquivo = (nome) => `instalar-agente-${String(nome || 'cozinha').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cozinha'}.bat`;

function baixarBat(texto, nome) {
    if (!texto) return toast.error('O arquivo não veio do servidor. Use "Trocar senha" para gerar de novo.');
    // \r\n para o bloco de notas/cmd do Windows ler certo
    const conteudo = String(texto || '').replace(/\r?\n/g, '\r\n');
    const url = URL.createObjectURL(new Blob([conteudo], { type: 'application/octet-stream' }));
    const a = document.createElement('a');
    a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Modal "copie agora, não aparece de novo": o token fica só na memória deste modal.
const ModalToken = ({ dados, onFechar }) => {
    const [copiado, setCopiado] = useState(false);
    const copiar = async () => {
        try { await navigator.clipboard.writeText(dados.token); setCopiado(true); toast.success('Senha copiada'); }
        catch { toast.error('Não consegui copiar. Selecione a senha e copie à mão.'); }
    };
    return (
        <Modal titulo={`Instalar no computador da cozinha — ${dados.agente?.nome || ''}`} onFechar={onFechar} largura="md:max-w-xl"
            rodape={<button type="button" className={btnPrim} onClick={onFechar}>Já copiei, fechar</button>}>
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg p-3 font-medium">
                Copie agora. Esta senha não aparece de novo — se perder, é só usar "Trocar senha".
            </div>
            <div>
                <p className={labelCls}>Senha do computador (token)</p>
                <div className="flex gap-2">
                    <input readOnly value={dados.token} onFocus={e => e.target.select()} className={`${inputCls} font-mono text-xs`} />
                    <button type="button" className={btnSec} onClick={copiar}><Copy className="h-4 w-4" />{copiado ? 'Copiado' : 'Copiar'}</button>
                </div>
            </div>
            <button type="button" className={`${btnPrim} w-full`} onClick={() => baixarBat(dados.instaladorBat, nomeArquivo(dados.agente?.nome))}>
                <Download className="h-4 w-4" /> Baixar instalador (.bat)
            </button>
            {dados.desinstaladorBat && (
                <button type="button" className="text-xs text-gray-500 underline min-h-[44px] md:min-h-0"
                    onClick={() => baixarBat(dados.desinstaladorBat, 'desinstalar-agente-impressao.bat')}>
                    Baixar desinstalador (só se for remover o agente do computador)
                </button>
            )}
            <div>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-2">Como instalar (no computador da cozinha)</p>
                <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700">
                    <li>Abra este mesmo endereço do sistema no computador da cozinha e clique em <b>Baixar instalador</b>.</li>
                    <li>Abra a pasta <b>Downloads</b> e ache o arquivo <b>{nomeArquivo(dados.agente?.nome)}</b>.</li>
                    <li>Clique nele com o <b>botão direito</b> do mouse e escolha <b>Executar como administrador</b>.</li>
                    <li>Se o Windows perguntar se confia no arquivo, clique em <b>Mais informações</b> e depois em <b>Executar assim mesmo</b>.</li>
                    <li>Espere a janela preta terminar e fechar sozinha.</li>
                    <li>Volte para esta tela: em até 10 segundos a bolinha do computador fica <b>verde</b>.</li>
                </ol>
            </div>
        </Modal>
    );
};

const ModalNovoAgente = ({ onFechar, onCriado }) => {
    const [nome, setNome] = useState('PC da cozinha');
    const [salvando, setSalvando] = useState(false);
    const criar = async () => {
        if (!nome.trim()) return toast.error('Dê um nome ao computador.');
        setSalvando(true);
        try { onCriado(await impressaoService.criarAgente(nome.trim())); }
        catch (e) { toast.error(erroDe(e, 'Não foi possível criar o agente.')); setSalvando(false); }
    };
    return (
        <Modal titulo="Novo agente de impressão" onFechar={onFechar}
            rodape={<><button type="button" className={btnGhost} onClick={onFechar}>Cancelar</button>
                <button type="button" className={btnPrim} disabled={salvando} onClick={criar}>{salvando && <Loader2 className="h-4 w-4 animate-spin" />}Criar</button></>}>
            <p className="text-sm text-gray-600">O agente é um programinha que fica ligado no computador onde as impressoras de etiqueta estão conectadas.</p>
            <div><label className={labelCls}>Nome do computador</label>
                <input className={inputCls} value={nome} onChange={e => setNome(e.target.value)} maxLength={60} /></div>
        </Modal>
    );
};

const AgenteCard = ({ agentes, onRecarregar }) => {
    const [modalNovo, setModalNovo] = useState(false);
    const [tokenDados, setTokenDados] = useState(null);
    const [ocupado, setOcupado] = useState(null);

    const acao = async (id, fn, ok) => {
        setOcupado(id);
        try { const r = await fn(); if (ok) toast.success(ok); return r; }
        catch (e) { toast.error(erroDe(e, 'Não deu certo. Tente de novo.')); }
        finally { setOcupado(null); onRecarregar(); }
    };
    const rotacionar = async (a) => {
        if (!window.confirm(`Trocar a senha de "${a.nome}"? A senha antiga para de funcionar na hora e o computador precisa ser reinstalado com o novo instalador.`)) return;
        const r = await acao(a.id, () => impressaoService.rotacionarToken(a.id));
        if (r?.token) setTokenDados(r);
    };
    const revogar = (a) => {
        if (!window.confirm(`Revogar "${a.nome}"? Ele deixa de imprimir imediatamente.`)) return;
        acao(a.id, () => impressaoService.revogarAgente(a.id), 'Agente revogado.');
    };

    return (
        <Card icone={Monitor} titulo="Computador da cozinha (agente)"
            acoes={<button type="button" className={btnPrim} onClick={() => setModalNovo(true)}><Plus className="h-4 w-4" />Novo agente</button>}>
            {agentes.length === 0 ? (
                <p className="text-sm text-gray-600">Nenhum computador cadastrado ainda. Clique em <b>Novo agente</b> para instalar no computador da cozinha — é ele que manda a etiqueta para a impressora, sem janela de impressão.</p>
            ) : (
                <div className="space-y-3">
                    {agentes.map(a => {
                        const lista = Array.isArray(a.impressorasWindows) ? a.impressorasWindows : [];
                        return (
                            <div key={a.id} className={`border rounded-xl p-3 md:p-4 ${a.ativo === false ? 'border-gray-200 bg-gray-50 opacity-80' : 'border-gray-200'}`}>
                                <div className="flex flex-wrap items-center gap-2 justify-between">
                                    <div className="min-w-0">
                                        <p className="font-semibold text-gray-900 truncate">{a.nome}</p>
                                        <p className="text-xs text-gray-500">
                                            {a.hostname ? `Computador: ${a.hostname}` : 'Ainda não se conectou'}
                                            {a.versaoAgente ? ` · versão ${a.versaoAgente}` : ''}
                                            {a.tokenPrefixo ? ` · senha ${a.tokenPrefixo}…` : ''}
                                        </p>
                                    </div>
                                    {a.ativo === false
                                        ? <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-700">Revogado</span>
                                        : <EstadoAgente estado={a.estado} />}
                                </div>
                                <p className="text-sm text-gray-600 mt-2">Último contato: <b>{haQuanto(a.ultimoContato)}</b> · {lista.length} impressora(s) vista(s) pelo Windows</p>
                                {a.ativo !== false && (
                                    <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 mt-3">
                                        <button type="button" className={btnSec} disabled={ocupado === a.id}
                                            onClick={() => acao(a.id, () => impressaoService.atualizarImpressorasWindows(a.id), 'Pedido enviado. A lista chega em até 5 segundos.')}>
                                            <RefreshCw className="h-4 w-4" />Atualizar lista de impressoras</button>
                                        <button type="button" className={btnSec} disabled={ocupado === a.id} onClick={() => rotacionar(a)}>
                                            <KeyRound className="h-4 w-4" />Trocar senha</button>
                                        <button type="button" className={btnPerigo} disabled={ocupado === a.id} onClick={() => revogar(a)}>
                                            <Ban className="h-4 w-4" />Revogar</button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
            {modalNovo && <ModalNovoAgente onFechar={() => setModalNovo(false)} onCriado={(r) => { setModalNovo(false); setTokenDados(r); onRecarregar(); }} />}
            {tokenDados && <ModalToken dados={tokenDados} onFechar={() => setTokenDados(null)} />}
        </Card>
    );
};

export default AgenteCard;
