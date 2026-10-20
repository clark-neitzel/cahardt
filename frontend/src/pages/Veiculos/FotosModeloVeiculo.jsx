import React, { useState, useEffect, useRef } from 'react';
import ImgComFalha from '../../components/Diario/ImgComFalha';
import { Camera, Loader2, ImageOff } from 'lucide-react';
import { toast } from 'react-hot-toast';
import checklistVeiculoService, { urlImagem } from '../../services/checklistVeiculoService';
import { comprimirFoto } from '../../utils/comprimirFoto';

/**
 * Aba "Fotos modelo" da ficha do veículo: um espaço por ângulo (o servidor diz quais,
 * conforme o tipo). Quem pode editar sobe/substitui; os demais só veem.
 * Dia 1: sem remover nem histórico.
 */
const FotosModeloVeiculo = ({ veiculoId, podeEditar }) => {
    const [dados, setDados] = useState(null);
    const [erro, setErro] = useState(false);
    const [enviando, setEnviando] = useState(null); // ângulo em envio
    const inputRef = useRef(null);
    const anguloRef = useRef(null);

    const carregar = async () => {
        try {
            setErro(false);
            setDados(await checklistVeiculoService.fotosModelo(veiculoId));
        } catch {
            setErro(true);
        }
    };
    useEffect(() => { carregar(); }, [veiculoId]); // eslint-disable-line react-hooks/exhaustive-deps

    const escolher = (angulo) => {
        anguloRef.current = angulo;
        inputRef.current?.click();
    };

    const aoEscolher = async (e) => {
        const arquivo = e.target.files?.[0];
        e.target.value = '';
        const angulo = anguloRef.current;
        if (!arquivo || !angulo) return;
        try {
            setEnviando(angulo);
            const comprimida = await comprimirFoto(arquivo);
            await checklistVeiculoService.enviarFotoModelo(veiculoId, angulo, comprimida);
            toast.success('Foto modelo salva.');
            await carregar();
        } catch (err) {
            toast.error(err?.response?.data?.error || 'Não foi possível enviar a foto.');
        } finally {
            setEnviando(null);
        }
    };

    if (erro) {
        return (
            <div className="text-center py-10 text-sm text-gray-600">
                Não consegui carregar as fotos modelo.
                <button type="button" onClick={carregar} className="block mx-auto mt-3 min-h-[44px] px-4 border border-primary text-primary rounded-full font-medium">Tentar de novo</button>
            </div>
        );
    }
    if (!dados) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

    return (
        <div className="space-y-3">
            <p className="text-sm text-gray-600">
                Fotos de referência deste veículo. O motorista vê a foto modelo na tela "Tire assim" antes de abrir a câmera.
                {!podeEditar && ' Você só pode visualizar.'}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {(dados.slots || []).map(slot => {
                    const m = slot.modelo;
                    const ocupado = enviando === slot.angulo;
                    return (
                        <div key={slot.angulo} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                            <div className="relative aspect-square bg-gray-50 flex items-center justify-center">
                                {m ? (
                                    <ImgComFalha src={urlImagem(m.url)} alt={slot.rotulo} className="absolute inset-0 h-full w-full object-cover" />
                                ) : (
                                    <div className="text-center text-gray-500 px-2">
                                        <ImageOff className="h-7 w-7 mx-auto mb-1 text-gray-400" />
                                        <span className="text-[11px]">Sem foto modelo</span>
                                    </div>
                                )}
                                {ocupado && (
                                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                        <Loader2 className="h-7 w-7 text-white animate-spin" />
                                    </div>
                                )}
                            </div>
                            <div className="p-2">
                                <p className="text-xs font-bold text-gray-800 leading-tight">{slot.rotulo}</p>
                                {m?.criadoEm && (
                                    <p className="text-[11px] text-gray-500">{new Date(m.criadoEm).toLocaleDateString('pt-BR')}{m.criadoPorNome ? ` · ${m.criadoPorNome}` : ''}</p>
                                )}
                                {podeEditar && (
                                    <button type="button" disabled={!!enviando} onClick={() => escolher(slot.angulo)}
                                        className="mt-2 w-full min-h-[44px] bg-white border border-primary text-primary hover:bg-mint/40 disabled:opacity-50 rounded-full text-xs font-semibold inline-flex items-center justify-center gap-1.5">
                                        <Camera className="h-4 w-4" /> {m ? 'Substituir' : 'Enviar foto'}
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
            {/* Aqui é cadastro de referência feito no escritório: pode escolher da galeria */}
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={aoEscolher} />
        </div>
    );
};

export default FotosModeloVeiculo;
