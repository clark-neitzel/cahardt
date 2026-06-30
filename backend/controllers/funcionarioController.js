const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const prisma = require('../config/database');
const pontoService = require('../services/pontoService');

const soDigitos = (s) => String(s || '').replace(/\D/g, '');

// Escala padrão sugerida ao ativar (seg–sex 07:30–11:30 / 13:00–17:48, sáb 07:30–11:30)
const jornadaPadrao = () => {
    const linhas = [];
    for (let dia = 0; dia <= 6; dia++) {
        if (dia === 0) {
            linhas.push({ diaSemana: dia, folga: true });
        } else if (dia === 6) {
            linhas.push({ diaSemana: dia, entrada1: '07:30', saida1: '11:30', folga: false });
        } else {
            linhas.push({ diaSemana: dia, entrada1: '07:30', saida1: '11:30', entrada2: '13:00', saida2: '17:48', folga: false });
        }
    }
    return linhas;
};

// Próximo ASO (exame) a vencer
const proximoVencimentoAso = (exames) => {
    const futuros = (exames || [])
        .filter(e => e.validade)
        .map(e => new Date(e.validade))
        .sort((a, b) => a - b);
    return futuros.length ? futuros[futuros.length - 1] : null; // o mais recente cadastrado define validade vigente
};

const funcionarioController = {
    // ─── Lista de funcionários (com status do dia) ────────────────────────────
    listar: async (req, res) => {
        try {
            const { busca, status } = req.query;
            const where = {};
            if (status === 'inativos') where.ativo = false;
            else where.ativo = true;
            if (busca) {
                where.OR = [
                    { nome: { contains: busca, mode: 'insensitive' } },
                    { cargo: { contains: busca, mode: 'insensitive' } },
                    { cpf: { contains: soDigitos(busca) } }
                ];
            }

            const funcionarios = await prisma.funcionario.findMany({
                where,
                orderBy: { nome: 'asc' },
                include: { exames: true }
            });

            const hoje = pontoService.getDataReferencia();
            const ids = funcionarios.map(f => f.id);
            const batidasHoje = ids.length
                ? await prisma.pontoRegistro.findMany({
                    where: { funcionarioId: { in: ids }, dataReferencia: hoje },
                    orderBy: { hora: 'asc' }
                })
                : [];
            const porFunc = {};
            for (const b of batidasHoje) (porFunc[b.funcionarioId] = porFunc[b.funcionarioId] || []).push(b);

            const lista = funcionarios.map(f => {
                const bts = porFunc[f.id] || [];
                const trabalhando = bts.length % 2 === 1;
                const venc = proximoVencimentoAso(f.exames);
                let alertaAso = null;
                if (venc) {
                    const dias = Math.ceil((venc - new Date()) / 86400000);
                    if (dias < 0) alertaAso = { texto: 'ASO vencido', dias };
                    else if (dias <= 30) alertaAso = { texto: `ASO vence ${dias}d`, dias };
                }
                return {
                    id: f.id,
                    nome: f.nome,
                    cargo: f.cargo,
                    foto: f.foto,
                    ativo: f.ativo,
                    pontoToken: f.pontoToken,
                    trabalhando,
                    desde: trabalhando ? pontoService.horaLocalHM(bts[bts.length - 1].hora) : null,
                    alertaAso
                };
            });

            res.json(lista);
        } catch (error) {
            console.error('[RH] listar funcionários:', error);
            res.status(500).json({ erro: 'Erro ao listar funcionários.' });
        }
    },

    // ─── Detalhe completo ─────────────────────────────────────────────────────
    detalhe: async (req, res) => {
        try {
            const f = await prisma.funcionario.findUnique({
                where: { id: req.params.id },
                include: {
                    jornadas: { orderBy: { diaSemana: 'asc' } },
                    documentos: { orderBy: { createdAt: 'desc' } },
                    exames: { orderBy: { data: 'desc' } },
                    atestados: { orderBy: { dataInicio: 'desc' } },
                    avaliacoes: { orderBy: { data: 'desc' } }
                }
            });
            if (!f) return res.status(404).json({ erro: 'Funcionário não encontrado.' });
            const estado = await pontoService.statusDoDia(f.id);
            const { senhaHash, ...semHash } = f; // nunca expor o hash
            res.json({ ...semHash, temSenha: !!senhaHash, estado });
        } catch (error) {
            console.error('[RH] detalhe funcionário:', error);
            res.status(500).json({ erro: 'Erro ao carregar funcionário.' });
        }
    },

    // ─── Definir/resetar a senha de acesso ao ponto ───────────────────────────
    definirSenha: async (req, res) => {
        try {
            const { senha } = req.body || {};
            if (!senha || String(senha).length < 4) {
                return res.status(400).json({ erro: 'A senha deve ter ao menos 4 caracteres.' });
            }
            const senhaHash = await bcrypt.hash(String(senha), 10);
            await prisma.funcionario.update({ where: { id: req.params.id }, data: { senhaHash } });
            res.json({ ok: true, temSenha: true });
        } catch (error) {
            console.error('[RH] definir senha:', error);
            res.status(500).json({ erro: 'Erro ao definir a senha.' });
        }
    },

    // ─── Ativar como funcionário (a partir de cliente ou manual) ──────────────
    criar: async (req, res) => {
        try {
            const { clienteUuid, nome, cpf, telefone, email, endereco, cargo, dataAdmissao, salario, tipoHoraExtra } = req.body || {};
            if (!nome) return res.status(400).json({ erro: 'Informe o nome.' });

            if (clienteUuid) {
                const jaExiste = await prisma.funcionario.findUnique({ where: { clienteUuid } });
                if (jaExiste) return res.status(400).json({ erro: 'Este cliente já está ativado como funcionário.', funcionarioId: jaExiste.id });
            }

            const funcionario = await prisma.funcionario.create({
                data: {
                    clienteUuid: clienteUuid || null,
                    nome,
                    cpf: cpf ? soDigitos(cpf) : null,
                    telefone: telefone || null,
                    email: email || null,
                    endereco: endereco || null,
                    cargo: cargo || null,
                    dataAdmissao: dataAdmissao ? new Date(dataAdmissao) : null,
                    salario: salario != null && salario !== '' ? Number(String(salario).replace(/\./g, '').replace(',', '.')) : 0,
                    tipoHoraExtra: tipoHoraExtra === 'PAGA' ? 'PAGA' : 'BANCO',
                    jornadas: { create: jornadaPadrao() }
                },
                include: { jornadas: true }
            });

            res.status(201).json(funcionario);
        } catch (error) {
            if (error.code === 'P2002') return res.status(400).json({ erro: 'CPF já cadastrado em outro funcionário.' });
            console.error('[RH] criar funcionário:', error);
            res.status(500).json({ erro: 'Erro ao criar funcionário.' });
        }
    },

    // ─── Atualizar dados ──────────────────────────────────────────────────────
    atualizar: async (req, res) => {
        try {
            const { nome, cpf, telefone, email, endereco, cargo, dataAdmissao, dataDemissao, salario, tipoHoraExtra, jornadaMovel, ativo, observacao } = req.body || {};
            const data = {};
            if (nome !== undefined) data.nome = nome;
            if (cpf !== undefined) data.cpf = cpf ? soDigitos(cpf) : null;
            if (telefone !== undefined) data.telefone = telefone;
            if (email !== undefined) data.email = email;
            if (endereco !== undefined) data.endereco = endereco;
            if (cargo !== undefined) data.cargo = cargo;
            if (dataAdmissao !== undefined) data.dataAdmissao = dataAdmissao ? new Date(dataAdmissao) : null;
            if (dataDemissao !== undefined) data.dataDemissao = dataDemissao ? new Date(dataDemissao) : null;
            if (salario !== undefined) data.salario = salario === '' ? 0 : Number(String(salario).replace(/\./g, '').replace(',', '.'));
            if (tipoHoraExtra !== undefined) data.tipoHoraExtra = tipoHoraExtra === 'PAGA' ? 'PAGA' : 'BANCO';
            if (jornadaMovel !== undefined) data.jornadaMovel = !!jornadaMovel;
            if (ativo !== undefined) data.ativo = !!ativo;
            if (observacao !== undefined) data.observacao = observacao;

            const f = await prisma.funcionario.update({ where: { id: req.params.id }, data });
            res.json(f);
        } catch (error) {
            if (error.code === 'P2002') return res.status(400).json({ erro: 'CPF já cadastrado em outro funcionário.' });
            console.error('[RH] atualizar funcionário:', error);
            res.status(500).json({ erro: 'Erro ao atualizar funcionário.' });
        }
    },

    // ─── Gerar/regerar link de ponto ──────────────────────────────────────────
    gerarLink: async (req, res) => {
        try {
            const token = crypto.randomBytes(12).toString('hex');
            const f = await prisma.funcionario.update({
                where: { id: req.params.id },
                data: { pontoToken: token }
            });
            res.json({ pontoToken: f.pontoToken });
        } catch (error) {
            console.error('[RH] gerar link:', error);
            res.status(500).json({ erro: 'Erro ao gerar link.' });
        }
    },

    // ─── Salvar escala/jornada ────────────────────────────────────────────────
    salvarJornada: async (req, res) => {
        try {
            const { jornadas, jornadaMovel } = req.body || {};
            const id = req.params.id;
            if (jornadaMovel !== undefined) {
                await prisma.funcionario.update({ where: { id }, data: { jornadaMovel: !!jornadaMovel } });
            }
            if (Array.isArray(jornadas)) {
                for (const j of jornadas) {
                    const dia = Number(j.diaSemana);
                    if (isNaN(dia) || dia < 0 || dia > 6) continue;
                    const dados = {
                        entrada1: j.folga ? null : (j.entrada1 || null),
                        saida1: j.folga ? null : (j.saida1 || null),
                        entrada2: j.folga ? null : (j.entrada2 || null),
                        saida2: j.folga ? null : (j.saida2 || null),
                        folga: !!j.folga
                    };
                    await prisma.funcionarioJornada.upsert({
                        where: { funcionarioId_diaSemana: { funcionarioId: id, diaSemana: dia } },
                        update: dados,
                        create: { funcionarioId: id, diaSemana: dia, ...dados }
                    });
                }
            }
            const jornadasAtt = await prisma.funcionarioJornada.findMany({ where: { funcionarioId: id }, orderBy: { diaSemana: 'asc' } });
            res.json(jornadasAtt);
        } catch (error) {
            console.error('[RH] salvar jornada:', error);
            res.status(500).json({ erro: 'Erro ao salvar a escala.' });
        }
    },

    // ─── Documentos ───────────────────────────────────────────────────────────
    addDocumento: async (req, res) => {
        try {
            if (!req.file) return res.status(400).json({ erro: 'Envie um arquivo.' });
            const doc = await prisma.funcionarioDocumento.create({
                data: {
                    funcionarioId: req.params.id,
                    categoria: req.body.categoria || 'OUTRO',
                    nome: req.body.nome || req.file.originalname,
                    arquivo: `funcionarios/${req.params.id}/${req.file.filename}`
                }
            });
            res.status(201).json(doc);
        } catch (error) {
            console.error('[RH] add documento:', error);
            res.status(500).json({ erro: 'Erro ao anexar documento.' });
        }
    },
    delDocumento: async (req, res) => {
        try {
            await prisma.funcionarioDocumento.delete({ where: { id: req.params.docId } });
            res.json({ ok: true });
        } catch (error) {
            console.error('[RH] del documento:', error);
            res.status(500).json({ erro: 'Erro ao excluir documento.' });
        }
    },

    // ─── Exames (ASO) ─────────────────────────────────────────────────────────
    addExame: async (req, res) => {
        try {
            const { tipo, data, validade, resultado, obs } = req.body || {};
            const exame = await prisma.funcionarioExame.create({
                data: {
                    funcionarioId: req.params.id,
                    tipo: tipo || 'PERIODICO',
                    data: data ? new Date(data) : new Date(),
                    validade: validade ? new Date(validade) : null,
                    resultado: resultado || null,
                    obs: obs || null,
                    arquivo: req.file ? `funcionarios/${req.params.id}/${req.file.filename}` : null
                }
            });
            res.status(201).json(exame);
        } catch (error) {
            console.error('[RH] add exame:', error);
            res.status(500).json({ erro: 'Erro ao salvar exame.' });
        }
    },
    delExame: async (req, res) => {
        try {
            await prisma.funcionarioExame.delete({ where: { id: req.params.exameId } });
            res.json({ ok: true });
        } catch (error) {
            console.error('[RH] del exame:', error);
            res.status(500).json({ erro: 'Erro ao excluir exame.' });
        }
    },

    // ─── Atestados ────────────────────────────────────────────────────────────
    addAtestado: async (req, res) => {
        try {
            const { dataInicio, dias, cid, obs } = req.body || {};
            const at = await prisma.funcionarioAtestado.create({
                data: {
                    funcionarioId: req.params.id,
                    dataInicio: dataInicio ? new Date(dataInicio) : new Date(),
                    dias: dias ? parseInt(dias) : 1,
                    cid: cid || null,
                    obs: obs || null,
                    arquivo: req.file ? `funcionarios/${req.params.id}/${req.file.filename}` : null
                }
            });
            res.status(201).json(at);
        } catch (error) {
            console.error('[RH] add atestado:', error);
            res.status(500).json({ erro: 'Erro ao salvar atestado.' });
        }
    },
    delAtestado: async (req, res) => {
        try {
            await prisma.funcionarioAtestado.delete({ where: { id: req.params.atestadoId } });
            res.json({ ok: true });
        } catch (error) {
            console.error('[RH] del atestado:', error);
            res.status(500).json({ erro: 'Erro ao excluir atestado.' });
        }
    },

    // ─── Avaliações de desempenho ─────────────────────────────────────────────
    addAvaliacao: async (req, res) => {
        try {
            const { periodo, nota, criterios, obs } = req.body || {};
            const av = await prisma.funcionarioAvaliacao.create({
                data: {
                    funcionarioId: req.params.id,
                    periodo: periodo || pontoService.getDataReferencia().slice(0, 7),
                    nota: nota != null ? Number(nota) : 0,
                    criterios: criterios || null,
                    obs: obs || null,
                    avaliadorId: req.user?.id || null
                }
            });
            res.status(201).json(av);
        } catch (error) {
            console.error('[RH] add avaliação:', error);
            res.status(500).json({ erro: 'Erro ao salvar avaliação.' });
        }
    },

    // ─── Cartão de ponto / espelho ────────────────────────────────────────────
    cartao: async (req, res) => {
        try {
            const cartao = await pontoService.montarCartao(req.params.id, req.query.mes);
            res.json(cartao);
        } catch (error) {
            if (error.status) return res.status(error.status).json({ erro: error.message });
            console.error('[RH] cartão:', error);
            res.status(500).json({ erro: 'Erro ao montar o cartão de ponto.' });
        }
    },

    // ─── Painel: ponto de hoje (todos) ────────────────────────────────────────
    pontoHoje: async (req, res) => {
        try {
            const hoje = pontoService.getDataReferencia();
            const funcionarios = await prisma.funcionario.findMany({ where: { ativo: true }, orderBy: { nome: 'asc' } });
            const ids = funcionarios.map(f => f.id);
            const batidas = ids.length
                ? await prisma.pontoRegistro.findMany({ where: { funcionarioId: { in: ids }, dataReferencia: hoje }, orderBy: { hora: 'asc' } })
                : [];
            const porFunc = {};
            for (const b of batidas) (porFunc[b.funcionarioId] = porFunc[b.funcionarioId] || []).push(b);

            let trabalhando = 0;
            const linhas = funcionarios.map(f => {
                const bts = (porFunc[f.id] || []);
                const dentro = bts.length % 2 === 1;
                if (dentro) trabalhando++;
                return {
                    id: f.id, nome: f.nome, cargo: f.cargo,
                    trabalhando: dentro,
                    batidas: bts.map(pontoService.mapBatida)
                };
            });
            res.json({ data: hoje, totalAtivos: funcionarios.length, trabalhando, linhas });
        } catch (error) {
            console.error('[RH] ponto hoje:', error);
            res.status(500).json({ erro: 'Erro ao carregar o painel de ponto.' });
        }
    },

    // ─── Ajuste manual de batida ──────────────────────────────────────────────
    addBatidaManual: async (req, res) => {
        try {
            const { funcionarioId, data, hora, tipo, obs } = req.body || {};
            if (!funcionarioId || !data || !hora) return res.status(400).json({ erro: 'Informe funcionário, data e hora.' });
            const dataRef = String(data).slice(0, 10);
            const dt = new Date(`${dataRef}T${hora}:00`);
            const batida = await prisma.pontoRegistro.create({
                data: {
                    funcionarioId,
                    dataReferencia: dataRef,
                    tipo: tipo === 'SAIDA' ? 'SAIDA' : 'ENTRADA',
                    hora: dt,
                    origem: 'MANUAL',
                    ajustadoPor: req.user?.id || null,
                    obs: obs || 'Ajuste manual'
                }
            });
            res.status(201).json(batida);
        } catch (error) {
            console.error('[RH] add batida manual:', error);
            res.status(500).json({ erro: 'Erro ao adicionar batida.' });
        }
    },
    updateBatida: async (req, res) => {
        try {
            const { hora, tipo, obs } = req.body || {};
            const atual = await prisma.pontoRegistro.findUnique({ where: { id: req.params.id } });
            if (!atual) return res.status(404).json({ erro: 'Batida não encontrada.' });
            const data = { ajustadoPor: req.user?.id || null };
            if (tipo) data.tipo = tipo === 'SAIDA' ? 'SAIDA' : 'ENTRADA';
            if (obs !== undefined) data.obs = obs;
            if (hora) data.hora = new Date(`${atual.dataReferencia}T${hora}:00`);
            const batida = await prisma.pontoRegistro.update({ where: { id: req.params.id }, data });
            res.json(batida);
        } catch (error) {
            console.error('[RH] update batida:', error);
            res.status(500).json({ erro: 'Erro ao editar batida.' });
        }
    },
    delBatida: async (req, res) => {
        try {
            await prisma.pontoRegistro.delete({ where: { id: req.params.id } });
            res.json({ ok: true });
        } catch (error) {
            console.error('[RH] del batida:', error);
            res.status(500).json({ erro: 'Erro ao excluir batida.' });
        }
    },

    // ─── Importar ponto (CSV do relógio) ──────────────────────────────────────
    // Recebe { linhas: [{ identificacao, data:'YYYY-MM-DD', hora:'HH:MM', tipo? }] }
    // Casa por CPF/matrícula, ignora duplicadas, alterna E/S quando sem tipo.
    importar: async (req, res) => {
        try {
            const { linhas } = req.body || {};
            if (!Array.isArray(linhas) || !linhas.length) return res.status(400).json({ erro: 'Nada para importar.' });

            const funcionarios = await prisma.funcionario.findMany({ where: { ativo: true } });
            const porCpf = {};
            for (const f of funcionarios) if (f.cpf) porCpf[f.cpf] = f;

            let importadas = 0, duplicadas = 0, semFuncionario = 0;
            // contador de paridade por funcionário+dia para alternar quando não há tipo
            const contador = {};

            for (const ln of linhas) {
                const cpf = soDigitos(ln.identificacao);
                const f = porCpf[cpf];
                if (!f) { semFuncionario++; continue; }
                const dataRef = String(ln.data || '').slice(0, 10);
                const hora = String(ln.hora || '').slice(0, 5);
                if (!dataRef || !hora) { semFuncionario++; continue; }
                const dt = new Date(`${dataRef}T${hora}:00`);

                // duplicada? (mesmo funcionário + dia + minuto)
                const existe = await prisma.pontoRegistro.findFirst({
                    where: { funcionarioId: f.id, dataReferencia: dataRef, hora: dt }
                });
                if (existe) { duplicadas++; continue; }

                let tipo = (ln.tipo || '').toUpperCase();
                if (tipo !== 'ENTRADA' && tipo !== 'SAIDA') {
                    const chave = `${f.id}|${dataRef}`;
                    if (contador[chave] == null) {
                        contador[chave] = await prisma.pontoRegistro.count({ where: { funcionarioId: f.id, dataReferencia: dataRef } });
                    }
                    tipo = contador[chave] % 2 === 0 ? 'ENTRADA' : 'SAIDA';
                    contador[chave]++;
                }

                await prisma.pontoRegistro.create({
                    data: { funcionarioId: f.id, dataReferencia: dataRef, tipo, hora: dt, origem: 'CSV', ajustadoPor: req.user?.id || null }
                });
                importadas++;
            }

            res.json({ ok: true, importadas, duplicadas, semFuncionario });
        } catch (error) {
            console.error('[RH] importar ponto:', error);
            res.status(500).json({ erro: 'Erro ao importar o ponto.' });
        }
    }
};

module.exports = funcionarioController;
