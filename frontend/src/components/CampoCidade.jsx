import React, { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import ComboBusca from './ComboBusca';
import ModalNovaCidade from './ModalNovaCidade';
import { listarCidadesCache, invalidarCacheCidades } from '../services/cidadeService';
import { chaveBusca } from '../utils/cidade';

// Campo CIDADE de todos os cadastros — só aceita item do cadastro oficial (tabela `cidades`).
//
// Por que não é texto livre: a mesma cidade vivia no banco em várias grafias ("Itapoá" /
// "ITAPOA" / "itapoa "), e quem casa cidade (meta, comissão, dashboards) faz lookup exato.
// Desde 09/2026 (pedido do dono) NÃO existe mais "Usar 'X'": cidade nova entra só pelo
// passo explícito "Cadastrar nova cidade…" (ModalNovaCidade: nome + UF, aviso de parecidas,
// permissão admin || clientes.edit || rota.edit — igual ao backend).
//
// · lista da tabela, com a UF como subtítulo; busca sem acento ("itapoa" acha "Itapoá");
// · lista falhou (rede) → aviso + "tentar de novo"; NÃO volta a texto livre (o backend
//   recusaria de qualquer jeito, 400 CIDADE_NAO_CADASTRADA);
// · `value` fora da lista (dado antigo ainda não fundido) continua exibido, com borda âmbar e
//   a dica "cidade fora do cadastro — escolha da lista".
//
// API: value (string), onChange(string). Sem e.target — quem usa handler compartilhado
// com e.target.name deve embrulhar: onChange={v => set('End_Cidade', v)}.
// `ufSugerida`: UF pré-selecionada no modal de cadastro (ex.: a UF já escolhida no form).
// `abrirCadastroCom`: string ou { nome, n } — quando muda (e não é vazia) abre o modal já com esse nome
// (usado ao receber 400 CIDADE_NAO_CADASTRADA do backend).

export { invalidarCacheCidades };

const CampoCidade = ({ value, onChange, placeholder = 'Cidade', className = '', invalido = false, extraCidades = [], ufSugerida = 'SC', abrirCadastroCom = '', onCidadeCriada }) => {
    const [cidades, setCidades] = useState([]);
    const [erroLista, setErroLista] = useState(false);
    const [carregando, setCarregando] = useState(true);
    const [tentativa, setTentativa] = useState(0);
    const [modal, setModal] = useState(null); // { nome } quando aberto

    useEffect(() => {
        let vivo = true;
        setCarregando(true); setErroLista(false);
        listarCidadesCache()
            .then(lista => { if (vivo) setCidades(lista); })
            .catch(() => { if (vivo) setErroLista(true); })
            .finally(() => { if (vivo) setCarregando(false); });
        return () => { vivo = false; };
    }, [tentativa]);

    // Pedido externo para abrir o cadastro já com um nome (erro do backend ao salvar).
    // Aceita string ou { nome } — passe um objeto NOVO ({ nome, n: Date.now() }) para
    // reabrir com o mesmo nome (o efeito só dispara quando a referência muda).
    useEffect(() => {
        const nome = typeof abrirCadastroCom === 'string' ? abrirCadastroCom : abrirCadastroCom?.nome;
        if (nome) setModal({ nome });
    }, [abrirCadastroCom]);

    const nomes = cidades.map(c => c.nome);
    const foraDoCadastro = !!value && !carregando && !erroLista && !nomes.some(n => chaveBusca(n) === chaveBusca(value));

    // O valor atual (e as extras) entram na lista para o combobox mostrar o rótulo,
    // mesmo quando ainda não está no cadastro (dado antigo).
    const options = cidades.map(c => ({ value: c.nome, label: c.nome, sub: c.uf || undefined }));
    for (const extra of [...extraCidades, value].filter(Boolean)) {
        if (!options.some(o => o.value === extra)) options.push({ value: extra, label: extra, sub: foraDoCadastro && extra === value ? 'fora do cadastro' : undefined });
    }

    const aoMudar = (v) => {
        if (!v) { onChange(''); return; }
        // Grafia EXATA da lista (a busca é sem acento, o valor gravado é o oficial).
        const daLista = cidades.find(c => c.nome === v) || cidades.find(c => chaveBusca(c.nome) === chaveBusca(v));
        onChange(daLista ? daLista.nome : v);
    };

    const aoCriar = (cidade) => {
        invalidarCacheCidades();
        setCidades(prev => prev.some(c => chaveBusca(c.nome) === chaveBusca(cidade.nome)) ? prev : [...prev, { id: cidade.id, nome: cidade.nome, uf: cidade.uf || null }].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')));
        onChange(cidade.nome);
        onCidadeCriada?.(cidade);
    };

    return (
        <div className={className}>
            <ComboBusca
                value={value || ''}
                options={options}
                onChange={aoMudar}
                placeholder={carregando ? 'Carregando cidades…' : placeholder}
                buscaPlaceholder="Digite a cidade…"
                vazioTexto={erroLista ? 'Não foi possível carregar as cidades.' : 'Nenhuma cidade com esse nome. Use "Cadastrar nova cidade…" abaixo.'}
                extraAction={{ label: 'Cadastrar nova cidade…', onClick: (digitado) => setModal({ nome: digitado || '' }) }}
                invalido={invalido || foraDoCadastro}
            />
            {erroLista && (
                <button type="button" onClick={() => setTentativa(t => t + 1)}
                    className="mt-1 inline-flex items-center gap-1 text-xs text-red-700 hover:underline min-h-[32px]">
                    <RefreshCw className="h-3 w-3" /> Não foi possível carregar as cidades — tentar de novo
                </button>
            )}
            {foraDoCadastro && (
                <p className="mt-1 inline-flex items-center gap-1 text-xs text-amber-700">
                    <AlertTriangle className="h-3 w-3" /> Cidade fora do cadastro — escolha da lista ou cadastre.
                </p>
            )}
            <ModalNovaCidade
                aberto={!!modal}
                nomeInicial={modal?.nome || ''}
                ufInicial={ufSugerida || 'SC'}
                onCriada={aoCriar}
                onFechar={() => setModal(null)}
            />
        </div>
    );
};

export default CampoCidade;
