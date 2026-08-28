import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
    X, Save, Shield, Monitor, Search,
    LayoutDashboard, BookOpen, ClipboardList, Map, Target, Users,
    PackageCheck, Truck, Wallet, Receipt,
    Box, UserCog, Car, RefreshCw, FileText,
    Settings, DollarSign, Warehouse, TrendingUp,
    Factory, Package, BookOpen as BookOpenIcon, Play, Calendar, Lightbulb, BarChart3, BarChart2,
    Clock, CalendarOff, ClipboardCheck, Tag, PartyPopper, Inbox, Building2, CalendarCheck, BellRing,
    KeyRound, History, Zap, UsersRound, ChevronRight, ArrowLeft
} from 'lucide-react';
import vendedorService from '../../../services/vendedorService';
import configService from '../../../services/configService';
import tabelaPrecoService from '../../../services/tabelaPrecoService';
import categoriaProdutoService from '../../../services/categoriaProdutoService';
import toast from 'react-hot-toast';
import SelectBusca from '../../../components/SelectBusca';

// ══════════════════════════════════════════════════════════════════════════
// ATENÇÃO: as chaves abaixo são o CONTRATO com o backend — não renomear,
// não remover, não mudar formato. O redesenho de 07/2026 alterou só a
// APRESENTAÇÃO (busca, seções, lote, histórico); a gravação é idêntica.
// ══════════════════════════════════════════════════════════════════════════
const DEFAULT_PERMISSIONS = {
    catalogo: { view: false, edit: false },
    pedidos: { view: false, edit: false, clientes: "vinculados" },
    rota: { view: false, edit: false },
    clientes: { view: false, edit: false },
    produtos: { view: false, edit: false },
    vendedores: { view: false, edit: false },
    relatorioVendas: false,
    sync: { view: false, edit: false },
    configuracoes: { view: false, edit: false },
    // Dashboard
    Pode_Ver_Dashboard_Vendas: false,
    Pode_Ver_Dashboard_Admin: false,
    // Módulo de Expedição e Logística
    Pode_Acessar_Embarque: false,
    Pode_Editar_Embarque: false,
    Pode_Executar_Entregas: false,
    Pode_Ver_Todas_Entregas: false,
    Pode_Ajustar_Entregas: false,
    Pode_Cobrar_Titulo_Rota: false,
    Pode_Editar_GPS: false,
    Pode_Autorizar_Ponto_Gps: false,
    Pode_Liberar_Cliente_Balcao: false,
    // Módulo Caixa Diário e Despesas
    Pode_Acessar_Caixa: false,
    Pode_Editar_Caixa: false,
    Pode_Baixar_Caixa: false,
    Pode_Fechar_Caixa: false,
    Pode_Definir_Adiantamento: false,
    Pode_Alterar_Adiantamento_Alheio: false,
    Pode_Ver_Historico_Caixa: false,
    Pode_Reverter_Caixa: false,
    Pode_Conferir_Devolucao_Caixa: false,
    Pode_Autorizar_Desconsiderar_Devolucao: false,
    Pode_Conferir_Dinheiro_Caixa: false,
    Pode_Autorizar_Diferenca_Caixa: false,
    // Módulo de Veículos
    Pode_Acessar_Veiculos: false,
    Pode_Editar_Veiculos: false,
    // CRM / Leads
    Pode_Editar_Lead: false,
    // Painel de Atendimentos
    Pode_Ver_Atendimentos: false,
    // Análise IA (auditoria de logs)
    Pode_Ver_Analise_IA: false,
    // Orientação IA na Rota
    Pode_Usar_IA_Orientacao: false,
    // Reatribuição de vendedor em pedidos
    Pode_Reatribuir_Vendedor: false,
    // Exclusão de Registros
    Pode_Excluir_Lead: false,
    Pode_Excluir_Pedido: false,
    Pode_Excluir_Especial: false,
    Pode_Excluir_Bonificacao: false,
    Pode_Excluir_Amostra: false,
    // Pedidos Especiais
    Pode_Criar_Especial: false,
    Pode_Aprovar_Especial: false,
    Pode_Reverter_Especial: false,
    categoriasEspeciais: [],
    condicoesEspeciais: [],
    // Categorias Comerciais visíveis em vendas/catálogo (vazio = todas)
    categoriasComerciais: [],
    // Pedidos Bonificação
    Pode_Criar_Bonificacao: false,
    Pode_Aprovar_Bonificacao: false,
    Pode_Reverter_Bonificacao: false,
    // Metas de Vendas
    Pode_Gerenciar_Metas: false,
    // Financeiro
    Pode_Acessar_Contas_Receber: false,
    Pode_Baixar_Contas_Receber: false,
    Pode_Baixar_Contas_Receber_Manual: false,
    Pode_Dar_Desconto_Baixa: false,
    Pode_Vender_Inadimplente: false,
    Pode_Acessar_Contas_Pagar: false,
    Pode_Baixar_Contas_Pagar: false,
    Pode_Acessar_Notas_Recebidas: false,
    Pode_Corrigir_Entrada_Estoque: false,
    Pode_Recusar_Nota_Fiscal: false,
    Pode_Acessar_Fornecedores: false,
    Pode_Acessar_Financeiro_Gerencial: false,
    Pode_Acessar_Cobranca: false,
    Pode_Editar_Cobranca: false,
    Pode_Acessar_Notas_Fiscais: false,
    Pode_Emitir_NF: false,
    Pode_Configurar_NF: false,
    // Devoluções
    Pode_Fazer_Devolucao: false,
    Pode_Reverter_Devolucao: false,
    // Utilitários Admin
    Pode_Resetar_Dados: false,
    Isento_Ponto: false,
    admin: false,
    // Permissões de Estoque
    estoque: [],
    // Permissões PCP
    pcp: {
        itens: false,
        receitas: false,
        ordens: false,
        cancelarOrdens: false,
        agenda: false,
        estoque: false,
        sugestoes: false,
        etiquetas: false,
    },
    // Regras de Horário para Pedidos
    horarioLimiteAmanha: '18:00',
    horarioLimiteHoje: '12:00',
    Pode_Entregar_Fim_Semana: false,
    // Bloqueio de venda além do estoque disponível (restrição, não capacidade)
    Bloqueio_Venda_Sem_Estoque: false,
    // Módulo RH — Currículos
    Pode_Ver_RH: false,
    Pode_Editar_RH: false,
    Pode_Excluir_RH: false,
    // Módulo RH — Ponto & Funcionários
    Pode_Ver_Ponto: false,
    Pode_Editar_Ponto: false,
    // Tela inicial preferida
    telaInicial: '/',
    // Barra de visitantes online (site ao vivo no topo do admin)
    Pode_Ver_Barra_Online: false,
    // Tarefas da Equipe (agenda com alertas)
    Pode_Criar_Tarefas_Para_Outros: false,
    Pode_Ver_Agenda_Colegas: false,
    Pode_Ver_Parecer_Tarefas: false,
};

const TELAS_INICIAIS = [
    { value: '/', label: 'Dashboard', icon: LayoutDashboard },
    { value: '/pedidos', label: 'Pedidos', icon: ClipboardList },
    { value: '/catalogo', label: 'Catálogo', icon: BookOpen },
    { value: '/clientes', label: 'Clientes', icon: Users },
    { value: '/admin/embarques', label: 'Embarque', icon: PackageCheck },
    { value: '/entregas', label: 'Entregas', icon: Truck },
    { value: '/minhas-entregas', label: 'Minhas Entregas (Motorista)', icon: Truck },
    { value: '/caixa', label: 'Caixa Diário', icon: Wallet },
    { value: '/despesas', label: 'Despesas', icon: Receipt },
    { value: '/financeiro/contas-receber', label: 'Contas a Receber', icon: DollarSign },
    { value: '/estoque', label: 'Ajuste de Estoque', icon: Warehouse },
    { value: '/estoque/posicao', label: 'Posição de Estoque', icon: Warehouse },
    { value: '/pcp/dashboard', label: 'Dashboard PCP', icon: BarChart3 },
    { value: '/pcp/painel', label: 'Painel Operacional', icon: Play },
    { value: '/admin/produtos', label: 'Produtos (Admin)', icon: Box },
    { value: '/admin/vendedores', label: 'Vendedores (Admin)', icon: UserCog },
    { value: '/admin/config', label: 'Configurações Gerais', icon: Settings },
];

// ── Toggle switch component ──
const Toggle = ({ checked, onChange, label, sublabel, colorClass = 'bg-indigo-600', icon: Icon, danger }) => (
    <label className={`flex items-start gap-3 text-sm cursor-pointer p-2.5 rounded-lg transition-colors ${danger ? 'hover:bg-red-50' : 'hover:bg-gray-50'}`}>
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${checked ? (danger ? 'bg-red-600' : colorClass) : 'bg-gray-200'}`}
        >
            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
        </button>
        <div className="flex-1 min-w-0">
            {Icon && <Icon className={`inline h-3.5 w-3.5 mr-1.5 ${danger ? 'text-red-500' : 'text-gray-400'}`} />}
            <span className={`font-medium ${danger ? 'text-red-900' : 'text-gray-800'}`}>{label}</span>
            {sublabel && <p className={`text-xs mt-0.5 ${danger ? 'text-red-600' : 'text-gray-500'}`}>{sublabel}</p>}
        </div>
    </label>
);

// ── Menu item row (shows icon + name + on/off toggle) ──
const MenuToggle = ({ icon: Icon, label, checked, onChange }) => (
    <div className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50">
        <div className="flex items-center gap-2 text-sm text-gray-700">
            {Icon && <Icon className="h-4 w-4 text-gray-400" />}
            <span>{label}</span>
        </div>
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${checked ? 'bg-indigo-600' : 'bg-gray-200'}`}
        >
            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
        </button>
    </div>
);

// ══════════════════════════════════════════════════════════════════════════
// SEÇÕES (navegação lateral / chips)
// ══════════════════════════════════════════════════════════════════════════
const SECOES = [
    { id: 'acesso', nome: 'Acesso e Conta', icon: KeyRound },
    { id: 'dashboard', nome: 'Dashboard', icon: LayoutDashboard },
    { id: 'tarefas', nome: 'Tarefas da Equipe', icon: CalendarCheck },
    { id: 'vendas', nome: 'Vendas', icon: ClipboardList },
    { id: 'logistica', nome: 'Logística', icon: Truck },
    { id: 'financeiro', nome: 'Financeiro', icon: DollarSign },
    { id: 'caixa', nome: 'Caixa Diário', icon: Wallet },
    { id: 'admin', nome: 'Administração', icon: UserCog },
    { id: 'estoque', nome: 'Produção / Estoque', icon: Warehouse },
    { id: 'pcp', nome: 'PCP — Produção', icon: Factory },
    { id: 'rh', nome: 'RH', icon: Users },
    { id: 'config', nome: 'Configurações', icon: Settings },
];

// ══════════════════════════════════════════════════════════════════════════
// ÍNDICE DE BUSCA — cada interruptor com nome, descrição e palavras do dia a
// dia ("o que a função faz"). path = chave REAL gravada (contrato intacto).
// noBulk: fora do "Marcar tudo" e dos perfis (só liga individualmente).
// ══════════════════════════════════════════════════════════════════════════
const BOOL_INDEX = [
    // Acesso
    { sec: 'acesso', path: 'admin', nome: 'Administrador Global', desc: 'Acesso irrestrito a tudo; pula trava de ponto/veículo', kw: 'total master mestre tudo liberado irrestrito', danger: true, noBulk: true },
    { sec: 'acesso', path: 'Isento_Ponto', nome: 'Isento de Ponto / Diário', desc: 'Pula a trava de check-in diário (veículo/home office) ao fazer login', kw: 'ponto checkin diario trava bater veiculo' },
    { sec: 'acesso', path: 'Pode_Ver_Barra_Online', nome: 'Barra de Visitantes Online', desc: 'Mostra no topo quantas pessoas estão nos sites públicos (Início, Congelados, Kit Festa)', kw: 'site visitantes online ao vivo topo' },
    // Dashboard
    { sec: 'dashboard', path: 'Pode_Ver_Dashboard_Vendas', nome: 'Ver dados de vendas', desc: "Exibe o card 'Vendas (Hoje)' e outros valores financeiros no painel do admin", kw: 'painel vendas hoje valores card' },
    { sec: 'dashboard', path: 'Pode_Ver_Dashboard_Admin', nome: 'Painel Administrativo (master)', desc: 'Painel completo: vendas/projeção/top10/inadimplência/inativos/ruptura. Dado financeiro sensível.', kw: 'gerencial master projecao top10 inadimplencia ruptura' },
    // Tarefas
    { sec: 'tarefas', path: 'Pode_Criar_Tarefas_Para_Outros', nome: 'Criar tarefas para outros', desc: 'Sem isso, a pessoa só cria tarefa para si mesma', kw: 'agenda delegar tarefa equipe' },
    { sec: 'tarefas', path: 'Pode_Ver_Agenda_Colegas', nome: 'Ver a agenda dos colegas', desc: "Ver as tarefas dos outros (sem editar) e o filtro 'Toda a equipe'", kw: 'agenda equipe tarefas outros colegas' },
    { sec: 'tarefas', path: 'Pode_Ver_Parecer_Tarefas', nome: 'Ver o parecer do dia', desc: 'Relatório por funcionário: concluídas no horário, com atraso, não feitas e adiamentos', kw: 'relatorio atraso concluidas parecer adiamento' },
    // Vendas — menus
    { sec: 'vendas', path: 'catalogo.view', nome: 'Ver Catálogo', desc: 'Menu Catálogo visível, com preços', kw: 'menu precos tabela produtos catalogo' },
    { sec: 'vendas', path: 'pedidos.view', nome: 'Ver Pedidos (+ Relatórios e Rota)', desc: 'Menus Pedidos, Relatórios e Rota visíveis', kw: 'menu vender lista pedidos relatorios rota' },
    { sec: 'vendas', path: 'relatorioVendas', nome: 'Relatório de Vendas', desc: 'Menu Rel. Vendas visível', kw: 'relatorio vendas numeros' },
    { sec: 'vendas', path: 'Pode_Ver_Atendimentos', nome: 'Painel de Atendimentos', desc: 'Menu Atendimentos visível', kw: 'atendimento visita registro painel' },
    { sec: 'vendas', path: 'rota.view', nome: 'Ver Leads', desc: 'Menu Leads visível (prospecção na rota)', kw: 'lead prospeccao rota menu' },
    { sec: 'vendas', path: 'clientes.view', nome: 'Ver Clientes', desc: 'Menu Clientes visível', kw: 'menu cadastro carteira clientes' },
    { sec: 'vendas', path: 'kitFesta', nome: 'Kit Festa', desc: 'Menu do admin do Kit Festa visível', kw: 'kit festa site encomenda festa' },
    // Vendas — edição
    { sec: 'vendas', path: 'catalogo.edit', nome: 'Gerenciar Catálogo', desc: 'Pode editar preços e detalhes no catálogo', kw: 'precos editar catalogo' },
    { sec: 'vendas', path: 'pedidos.edit', nome: 'Criar/Editar Pedidos', desc: 'Pode criar novos pedidos e editar existentes', kw: 'lancar criar editar vender pedido' },
    { sec: 'vendas', path: 'clientes.edit', nome: 'Gerenciar Clientes', desc: 'Pode editar dados dos clientes', kw: 'editar cadastro cliente endereco' },
    { sec: 'vendas', path: 'rota.edit', nome: 'Gerenciar Rota/Leads', desc: 'Pode editar rotas e leads', kw: 'editar rota lead' },
    // Vendas — CRM
    { sec: 'vendas', path: 'Pode_Editar_Lead', nome: 'Pode Editar Leads', desc: 'Editar leads existentes, não apenas criar novos', kw: 'lead editar alterar' },
    { sec: 'vendas', path: 'Pode_Excluir_Lead', nome: 'Pode Excluir Leads', desc: 'Excluir leads permanentemente (irreversível)', kw: 'lead apagar excluir deletar', danger: true },
    { sec: 'vendas', path: 'Pode_Editar_GPS', nome: 'Editar GPS de Clientes', desc: 'Capturar e salvar localização GPS dos clientes na rota', kw: 'gps localizacao capturar mapa coordenada' },
    { sec: 'vendas', path: 'Pode_Ver_Analise_IA', nome: 'Análise IA', desc: 'Painel de auditoria das análises geradas pela IA', kw: 'ia auditoria analise inteligencia' },
    { sec: 'vendas', path: 'Pode_Usar_IA_Orientacao', nome: 'Orientação IA na Rota', desc: 'Botão de análise de orientação comercial com IA nos cards da rota', kw: 'ia orientacao rota botao comercial' },
    // Vendas — ajustes/exclusões
    { sec: 'vendas', path: 'Pode_Reatribuir_Vendedor', nome: 'Reatribuir Vendedor em Pedidos', desc: 'Trocar o vendedor de pedidos existentes (só no app)', kw: 'trocar transferir vendedor dono pedido reatribuir' },
    { sec: 'vendas', path: 'Pode_Excluir_Pedido', nome: 'Excluir Pedidos', desc: 'Pedidos em status ABERTO ou ERRO', kw: 'apagar deletar excluir pedido', danger: true },
    { sec: 'vendas', path: 'Pode_Excluir_Especial', nome: 'Excluir Pedidos Especiais', desc: 'Apagar pedidos especiais', kw: 'apagar excluir especial', danger: true },
    { sec: 'vendas', path: 'Pode_Excluir_Bonificacao', nome: 'Excluir Bonificações', desc: 'Apagar bonificações', kw: 'apagar excluir bonificacao brinde', danger: true },
    { sec: 'vendas', path: 'Pode_Excluir_Amostra', nome: 'Excluir Amostras', desc: 'Apagar amostras', kw: 'apagar excluir amostra', danger: true },
    // Vendas — especiais/bonificação
    { sec: 'vendas', path: 'Pode_Criar_Especial', nome: 'Criar Pedido Especial', desc: "Habilita o toggle 'Especial' (sem nota) ao criar pedido", kw: 'especial sem nota zz criar' },
    { sec: 'vendas', path: 'Pode_Aprovar_Especial', nome: 'Aprovar Pedido Especial', desc: 'Aprovar/faturar pedidos especiais pendentes', kw: 'aprovar liberar faturar especial' },
    { sec: 'vendas', path: 'Pode_Reverter_Especial', nome: 'Reverter Faturamento Especial', desc: 'Reverter especiais aprovados para ABERTO', kw: 'reverter voltar aberto especial', danger: true },
    { sec: 'vendas', path: 'Pode_Criar_Bonificacao', nome: 'Criar Bonificação', desc: "Habilita o botão 'Bonificação' ao criar pedido", kw: 'bonificacao bn brinde criar' },
    { sec: 'vendas', path: 'Pode_Aprovar_Bonificacao', nome: 'Aprovar Bonificação', desc: 'Aprovar bonificações pendentes', kw: 'aprovar bonificacao' },
    { sec: 'vendas', path: 'Pode_Reverter_Bonificacao', nome: 'Reverter Bonificação', desc: 'Desfazer bonificações aprovadas', kw: 'reverter bonificacao', danger: true },
    { sec: 'vendas', path: 'Pode_Entregar_Fim_Semana', nome: 'Pode Entregar no Fim de Semana', desc: 'Criar pedidos com entrega no sábado ou domingo', kw: 'sabado domingo fim de semana entrega' },
    { sec: 'vendas', path: 'Bloqueio_Venda_Sem_Estoque', nome: 'Bloquear Venda Sem Estoque', desc: 'É uma RESTRIÇÃO: ligado, a pessoa não cria/edita pedido com quantidade acima do estoque disponível (vale até para admin)', kw: 'estoque negativo abaixo zero sem estoque bloquear disponivel ruptura restricao', noBulk: true },
    // Logística
    { sec: 'logistica', path: 'Pode_Acessar_Embarque', nome: 'Embarque', desc: 'Montagem de cargas e romaneios', kw: 'carga romaneio embarque caminhao menu' },
    { sec: 'logistica', path: 'Pode_Ver_Todas_Entregas', nome: 'Entregas (Auditor)', desc: 'Vê as entregas de todos os motoristas (+ menu Auditoria Entregas)', kw: 'auditoria entregas todas fiscalizar conferir' },
    { sec: 'logistica', path: 'Pode_Executar_Entregas', nome: 'Minhas Entregas (Motorista)', desc: 'A pessoa aparece como motorista e executa entregas', kw: 'motorista entregar dirigir minhas entregas caminhao' },
    { sec: 'logistica', path: 'Pode_Editar_Embarque', nome: 'Editar Carga', desc: 'Alterar data e motorista de cargas já criadas', kw: 'editar carga data motorista' },
    { sec: 'logistica', path: 'Pode_Ajustar_Entregas', nome: 'Administrador Financeiro de Entrega', desc: 'Desmanchar/alterar devoluções ou pagamentos do motorista', kw: 'desmanchar pagamento motorista corrigir ajustar', danger: true },
    { sec: 'logistica', path: 'Pode_Cobrar_Titulo_Rota', nome: 'Cobrar Títulos em Rota', desc: 'Aba Cobranças no roteiro: cobra títulos em aberto na rua (a baixa sai só no Caixa)', kw: 'cobranca titulo rota rua motorista vendedor cobrar parcela' },
    { sec: 'logistica', path: 'Pode_Autorizar_Ponto_Gps', nome: 'Autorizar Ponto GPS (Logística)', desc: 'Libera ponto perto de outro cliente, aprova mudança de ponto confirmado, desfaz mudanças e liga o bloqueio de pedido sem GPS', kw: 'gps ponto autorizar aprovar logistica pendencia mapa', danger: true },
    { sec: 'logistica', path: 'Pode_Liberar_Cliente_Balcao', nome: 'Liberar Cliente Balcão', desc: 'Marca cliente que compra e retira na empresa (vende sem exigir ponto GPS)', kw: 'balcao retira empresa gps sem ponto cliente' },
    // Financeiro
    { sec: 'financeiro', path: 'Pode_Acessar_Contas_Receber', nome: 'Contas a Receber', desc: 'Parcelas em aberto, boletos, inadimplência', kw: 'receber boleto parcela menu inadimplencia' },
    { sec: 'financeiro', path: 'Pode_Baixar_Contas_Receber', nome: 'Dar Baixa em Parcelas', desc: 'Registrar pagamentos (inclusive parciais) e estornar baixas', kw: 'baixa quitar pagamento estorno receber' },
    { sec: 'financeiro', path: 'Pode_Baixar_Contas_Receber_Manual', nome: 'Baixa Manual no Contas a Receber', desc: 'Quitar título digitando na tela (só dinheiro/cheque, e o valor cai no caixa do dia de quem baixou). Sem isto, o recebimento entra pela Conciliação Bancária ou pelo Caixa', kw: 'baixa manual mao dinheiro cheque caixa conciliacao excecao', danger: true },
    { sec: 'financeiro', path: 'Pode_Dar_Desconto_Baixa', nome: 'Dar Desconto na Baixa', desc: 'Reduz o valor a receber (até 100%) sem confirmação de pagamento', kw: 'desconto abater perdoar reduzir baixa', danger: true },
    { sec: 'financeiro', path: 'Pode_Acessar_Cobranca', nome: 'Régua de Cobrança', desc: 'Cobranças automáticas por WhatsApp/e-mail (desligar aqui desliga o editar junto)', kw: 'regua cobranca whatsapp lembrete automatico menu' },
    { sec: 'financeiro', path: 'Pode_Editar_Cobranca', nome: 'Editar Régua de Cobrança', desc: 'Ligar/desligar a régua, configurar mensagens/canais, executar e cobrar manualmente', kw: 'regua editar configurar executar cobrar' },
    { sec: 'financeiro', path: 'Pode_Acessar_Contas_Pagar', nome: 'Contas a Pagar', desc: 'Despesas e boletos a pagar da empresa', kw: 'pagar despesa boleto fornecedor menu' },
    { sec: 'financeiro', path: 'Pode_Baixar_Contas_Pagar', nome: 'Operar Contas a Pagar', desc: 'Criar/editar despesas, dar baixa e conferir notas recebidas (gerar conta, ignorar)', kw: 'operar baixa despesa conferir nota gerar conta pagar' },
    { sec: 'financeiro', path: 'Pode_Acessar_Notas_Recebidas', nome: 'Notas Recebidas', desc: 'Notas fiscais de entrada (compras)', kw: 'nota recebida entrada xml compra menu' },
    { sec: 'financeiro', path: 'Pode_Corrigir_Entrada_Estoque', nome: 'Corrigir Entrada de Estoque', desc: 'Arruma produto/conversão de uma nota já lançada — mexe no custo e no estoque (a despesa não é alterada)', kw: 'corrigir conversao fator custo estoque nota lancada produto errado', danger: true },
    { sec: 'financeiro', path: 'Pode_Recusar_Nota_Fiscal', nome: 'Recusar Nota na Receita', desc: 'Manifestação do Destinatário: recusar a nota na Receita Federal por "Operação não realizada" (mercadoria não chegou) ou "Desconhecimento" (nota contra o nosso CNPJ sem compra). Ato fiscal IRREVERSÍVEL, com justificativa. Confirmar a operação não precisa desta permissão', kw: 'recusar manifestacao destinatario desconhecimento operacao nao realizada sefaz receita nota entrada irreversivel', danger: true },
    { sec: 'admin', path: 'Pode_Acessar_Contabilidade', nome: 'Contabilidade (consulta)', desc: 'Área Administração → Contabilidade: relatórios para o contador (Receber, Pagar com DRE, Extratos, Notas de Entrada, Pacote do Mês). Somente leitura e exportação — nenhum botão de baixa/edição', kw: 'contabilidade contador relatorio fiscal exportar csv consulta escritorio pacote dre' },
    { sec: 'financeiro', path: 'Pode_Acessar_Notas_Fiscais', nome: 'Notas Fiscais (emissão)', desc: 'Fila de emissão de NF-e dos pedidos', kw: 'nfe emissao fila nota fiscal menu' },
    { sec: 'financeiro', path: 'Pode_Emitir_NF', nome: 'Pode Emitir Notas', desc: "Emitir NF-e dos pedidos da fila (individual ou 'Emitir todas')", kw: 'emitir nota nfe faturar' },
    { sec: 'financeiro', path: 'Pode_Configurar_NF', nome: 'Pode Configurar Emissão', desc: 'Alterar configurações da emissão de NF-e (ambiente, certificado, série)', kw: 'configurar certificado serie ambiente nfe', danger: true },
    { sec: 'financeiro', path: 'Pode_Acessar_Fornecedores', nome: 'Fornecedores', desc: 'Cadastro de fornecedores', kw: 'fornecedor cadastro menu' },
    { sec: 'financeiro', path: 'Pode_Acessar_Financeiro_Gerencial', nome: 'Fluxo de Caixa e DRE (gerencial)', desc: 'Painéis gerenciais do financeiro', kw: 'fluxo caixa dre gerencial menu' },
    { sec: 'financeiro', path: 'Pode_Vender_Inadimplente', nome: 'Vender p/ Cliente com Contas em Aberto', desc: 'Vira responsável; a observação é registrada no pedido', kw: 'inadimplente devendo aberto bloqueio vender', danger: true },
    { sec: 'financeiro', path: 'Pode_Fazer_Devolucao', nome: 'Fazer Devolução', desc: 'Registrar devoluções de pedidos entregues', kw: 'devolucao registrar mercadoria voltar' },
    { sec: 'financeiro', path: 'Pode_Reverter_Devolucao', nome: 'Reverter Devolução', desc: 'Desfazer devoluções já registradas', kw: 'desfazer reverter devolucao', danger: true },
    { sec: 'financeiro', path: 'Pode_Gerenciar_Metas', nome: 'Gerenciar Metas de Vendas', desc: 'Criar, editar e excluir metas mensais', kw: 'meta mensal vendas criar' },
    // Caixa Diário
    { sec: 'caixa', path: 'Pode_Acessar_Caixa', nome: 'Caixa Diário (+ Despesas)', desc: 'Menus Caixa Diário e Despesas visíveis', kw: 'caixa dia despesas dinheiro menu' },
    { sec: 'caixa', path: 'Pode_Editar_Caixa', nome: 'Auditor Financeiro do Caixa', desc: 'Confere caixas de outros usuários, edita despesas alheias', kw: 'auditor conferir caixas outros editar', danger: true },
    { sec: 'caixa', path: 'Pode_Baixar_Caixa', nome: 'Baixar no Caixa (Quitar)', desc: 'Dar baixa de entregas à vista (dinheiro/pix/cartão)', kw: 'quitar baixa vista dinheiro pix cartao' },
    { sec: 'caixa', path: 'Pode_Fechar_Caixa', nome: 'Fechar Caixa', desc: 'Fechar o caixa do dia com snapshot dos totais', kw: 'fechar encerrar dia caixa' },
    { sec: 'caixa', path: 'Pode_Definir_Adiantamento', nome: 'Definir Adiantamento', desc: 'Editar o valor de adiantamento do caixa diário', kw: 'adiantamento valor troco definir' },
    { sec: 'caixa', path: 'Pode_Alterar_Adiantamento_Alheio', nome: 'Alterar Adiantamento de Outros', desc: 'Mudar ou zerar um adiantamento lançado por outra pessoa', kw: 'adiantamento outros zerar alterar', danger: true },
    { sec: 'caixa', path: 'Pode_Ver_Historico_Caixa', nome: 'Ver Caixas de Outros Dias', desc: 'Navegar por datas passadas ou futuras', kw: 'datas passadas navegar historico caixa' },
    { sec: 'caixa', path: 'Pode_Reverter_Caixa', nome: 'Reverter Caixa', desc: 'Reverter conferência e reabrir caixas fechados', kw: 'reabrir reverter conferencia caixa', danger: true },
    { sec: 'caixa', path: 'Pode_Conferir_Devolucao_Caixa', nome: 'Conferir Devoluções no Caixa', desc: 'Recebe a mercadoria que voltou e digita a contagem física', kw: 'contagem conferir devolucao mercadoria fisica' },
    { sec: 'caixa', path: 'Pode_Conferir_Dinheiro_Caixa', nome: 'Conferir Dinheiro do Caixa', desc: 'Recebe o dinheiro, conta na calculadora e assina a conferência que libera o fechamento', kw: 'conferir dinheiro contar cedulas notas caixa prestacao' },
    { sec: 'caixa', path: 'Pode_Autorizar_Diferenca_Caixa', nome: 'Autorizar Diferença no Caixa', desc: 'A senha desta pessoa libera diferença acima da quebra de quem está conferindo', kw: 'autorizar diferenca quebra falta sobra dinheiro senha', danger: true },
    { sec: 'caixa', path: 'Pode_Autorizar_Desconsiderar_Devolucao', nome: 'Autorizar Desconsiderar Devolução', desc: 'A senha desta pessoa libera falta de devolução sem cobrança ao motorista', kw: 'senha autorizar liberar falta perdoar motorista', danger: true },
    // Administração
    { sec: 'admin', path: 'produtos.view', nome: 'Ver Produtos (Admin)', desc: 'Menu Produtos visível', kw: 'menu produtos admin cadastro' },
    { sec: 'admin', path: 'vendedores.view', nome: 'Ver Usuários', desc: 'A tela de equipe/acessos', kw: 'menu usuarios equipe vendedores' },
    { sec: 'admin', path: 'Pode_Acessar_Veiculos', nome: 'Veículos', desc: 'Menu Veículos visível', kw: 'veiculo carro caminhao menu' },
    { sec: 'admin', path: 'sync.view', nome: 'Sincronizar', desc: 'Menu Sincronizar visível', kw: 'sincronizar conta azul sync' },
    { sec: 'admin', path: 'produtos.edit', nome: 'Gerenciar Produtos', desc: 'Editar dados dos produtos', kw: 'editar produto gerenciar' },
    { sec: 'admin', path: 'vendedores.edit', nome: 'Gerenciar Vendedores', desc: 'Editar dados e permissões dos vendedores', kw: 'editar usuarios permissoes dados' },
    { sec: 'admin', path: 'Pode_Editar_Veiculos', nome: 'Editar Veículos', desc: 'Cadastrar/editar/excluir veículos, lançar manutenção', kw: 'cadastrar veiculo manutencao editar', danger: true },
    { sec: 'admin', path: 'Pode_Resetar_Dados', nome: 'Resetar Dados', desc: 'Ferramenta de limpeza de dados (irreversível)', kw: 'resetar limpar apagar zerar perigo', danger: true, noBulk: true },
    // PCP
    { sec: 'pcp', path: 'pcp.itens', nome: 'Subprodutos', desc: 'Tela de subprodutos do PCP', kw: 'subproduto item pcp' },
    { sec: 'pcp', path: 'pcp.receitas', nome: 'Receitas', desc: 'Fichas técnicas / receitas', kw: 'receita ficha tecnica' },
    { sec: 'pcp', path: 'pcp.ordens', nome: 'Ordens de Produção (+ Painel)', desc: 'Ordens e painel operacional', kw: 'ordem producao painel operacional' },
    { sec: 'pcp', path: 'pcp.cancelarOrdens', nome: 'Cancelar Ordens', desc: 'Cancelar ordens de produção', kw: 'cancelar ordem producao' },
    { sec: 'pcp', path: 'pcp.agenda', nome: 'Calendário', desc: 'Calendário de produção', kw: 'calendario agenda producao' },
    { sec: 'pcp', path: 'pcp.estoque', nome: 'Estoque PCP', desc: 'Estoque do PCP', kw: 'estoque pcp posicao' },
    { sec: 'pcp', path: 'pcp.sugestoes', nome: 'Sugestões (+ Dashboard PCP)', desc: 'Sugestões de produção e dashboard', kw: 'sugestao dashboard pcp producao' },
    { sec: 'pcp', path: 'pcp.etiquetas', nome: 'Etiquetas de Produtos', desc: 'Imprimir etiquetas com validade', kw: 'etiqueta validade imprimir' },
    // RH
    { sec: 'rh', path: 'Pode_Ver_RH', nome: 'Ver Currículos', desc: 'Painel /rh/curriculos e detalhe de candidatos', kw: 'curriculo candidato vaga contratar' },
    { sec: 'rh', path: 'Pode_Editar_RH', nome: 'Editar Currículos', desc: 'Alterar status, observações e convidar via WhatsApp', kw: 'status observacao convidar curriculo' },
    { sec: 'rh', path: 'Pode_Excluir_RH', nome: 'Excluir Currículos', desc: 'Excluir permanentemente um currículo e sua foto', kw: 'excluir curriculo apagar', danger: true },
    { sec: 'rh', path: 'Pode_Ver_Ponto', nome: 'Ver Ponto e Funcionários', desc: 'Abas /rh/funcionarios e /rh/ponto e o cartão de ponto', kw: 'ponto funcionario cartao batida' },
    { sec: 'rh', path: 'Pode_Editar_Ponto', nome: 'Editar Ponto e Funcionários', desc: 'Cadastrar funcionário, ajustar batidas, importar CSV, geofence', kw: 'batida ajustar geofence csv cadastrar funcionario' },
    // Configurações
    { sec: 'config', path: 'configuracoes.view', nome: 'Acesso às Configurações', desc: 'Menu Configurações visível', kw: 'configuracoes menu acesso' },
    { sec: 'config', path: 'configuracoes.edit', nome: 'Gerenciar Configurações', desc: 'Editar tabelas de preços, bancos, metas, categorias', kw: 'tabelas precos bancos metas categorias editar' },
];

// Itens que NÃO são interruptor (aparecem na busca como atalho para a seção)
const LINK_INDEX = [
    { sec: 'acesso', nome: 'Login e senha', desc: 'Trocar o login ou definir nova senha de acesso', kw: 'senha login trocar password usuario' },
    { sec: 'acesso', nome: 'Tela inicial', desc: 'Qual página abre primeiro ao fazer login', kw: 'tela inicial abrir primeira home pagina' },
    { sec: 'acesso', nome: 'Copiar permissões de outro usuário', desc: "Use o botão 'Copiar de outro usuário' na barra do topo", kw: 'copiar clonar perfil igual outro usuario' },
    { sec: 'vendas', nome: 'Regra de clientes para pedidos', desc: 'Todos os clientes ou apenas vinculados', kw: 'vinculados todos carteira clientes regra' },
    { sec: 'vendas', nome: 'Categorias Comerciais visíveis', desc: 'Quais produtos aparecem em pedidos e catálogo', kw: 'categorias produtos visiveis comercial' },
    { sec: 'vendas', nome: 'Categorias e condições do Especial', desc: 'Categorias extras e condições de pagamento do pedido especial', kw: 'categoria condicao pagamento especial extra' },
    { sec: 'vendas', nome: 'Horários-limite de pedidos', desc: 'Depois desses horários não cria pedido para amanhã/hoje', kw: 'horario limite prazo amanha hoje 18 12' },
    { sec: 'caixa', nome: 'Tabela p/ cobrança de faltas de devolução', desc: 'Tabela de preço usada para cobrar falta deste motorista', kw: 'tabela preco falta cobrar motorista devolucao' },
    { sec: 'estoque', nome: 'Regras de estoque por categoria', desc: 'O que pode adicionar/diminuir no painel de estoque', kw: 'estoque categoria adicionar diminuir regra ajuste' },
];

// Perfis rápidos: substituem os interruptores comuns pelo conjunto típico da
// função. NUNCA mexem em admin/zona de risco (noBulk/danger ficam desligados),
// nem em listas, horários e tela inicial.
const PERFIS = {
    vendedor: {
        rotulo: '🧑‍💼 Vendedor de campo', hint: 'Catálogo, pedidos, rota, clientes, caixa e devolução',
        chaves: ['catalogo.view', 'pedidos.view', 'pedidos.edit', 'clientes.view', 'clientes.edit', 'rota.view', 'rota.edit', 'Pode_Editar_Lead', 'Pode_Editar_GPS', 'Pode_Criar_Especial', 'Pode_Criar_Bonificacao', 'Pode_Acessar_Caixa', 'Pode_Fazer_Devolucao', 'Pode_Ver_Atendimentos'],
    },
    motorista: {
        rotulo: '🚚 Motorista', hint: 'Minhas entregas, caixa do dia e devolução',
        chaves: ['Pode_Executar_Entregas', 'Pode_Acessar_Caixa', 'Pode_Fazer_Devolucao'],
    },
    escritorio: {
        rotulo: '🏢 Escritório / Financeiro', hint: 'Contas, notas, cobrança, caixa e fornecedores',
        chaves: ['clientes.view', 'Pode_Ver_Atendimentos', 'Pode_Acessar_Contas_Receber', 'Pode_Baixar_Contas_Receber', 'Pode_Baixar_Contas_Receber_Manual', 'Pode_Acessar_Contas_Pagar', 'Pode_Baixar_Contas_Pagar', 'Pode_Acessar_Notas_Recebidas', 'Pode_Acessar_Fornecedores', 'Pode_Acessar_Cobranca', 'Pode_Acessar_Notas_Fiscais', 'Pode_Emitir_NF', 'Pode_Acessar_Caixa', 'Pode_Baixar_Caixa', 'Pode_Fechar_Caixa', 'Pode_Conferir_Devolucao_Caixa', 'Pode_Ver_Historico_Caixa'],
    },
    producao: {
        rotulo: '🏭 Produção / PCP', hint: 'Telas do PCP (sem cancelar ordens)',
        chaves: ['pcp.itens', 'pcp.receitas', 'pcp.ordens', 'pcp.agenda', 'pcp.estoque', 'pcp.sugestoes', 'pcp.etiquetas'],
    },
};

// helpers de caminho ('a.b' → permissoes.a.b)
const lerPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

const PermissoesModal = ({ vendedor, onClose, onUpdated }) => {
    const [login, setLogin] = useState('');
    const [senha, setSenha] = useState('');
    const [permissoes, setPermissoes] = useState(DEFAULT_PERMISSIONS);
    const [saving, setSaving] = useState(false);
    const [todosVendedores, setTodosVendedores] = useState([]);
    const [vendedorOrigemId, setVendedorOrigemId] = useState('');
    const [clonando, setClonando] = useState(false);
    const [todasCategorias, setTodasCategorias] = useState([]);
    const [todasCondicoes, setTodasCondicoes] = useState([]);
    const [todasCategoriasComerciais, setTodasCategoriasComerciais] = useState([]);
    // Caixa: tabela de preço usada para cobrar faltas na conferência de devoluções
    const [tabelaCobrancaFaltaId, setTabelaCobrancaFaltaId] = useState('');
    // Caixa: quebra de caixa desta pessoa — diferença que ela fecha sozinha ao
    // conferir o dinheiro. Acima disso, exige senha de quem autoriza.
    const [quebraCaixa, setQuebraCaixa] = useState('0');

    // ── UX nova (só apresentação) ──
    const [secAtiva, setSecAtiva] = useState('acesso');
    const [busca, setBusca] = useState('');
    const [soAtivas, setSoAtivas] = useState(false);
    const [soRisco, setSoRisco] = useState(false);
    const [popover, setPopover] = useState(null); // null | 'perfil' | 'copiar'
    const [historico, setHistorico] = useState(null); // null = não carregado
    const [histExpandido, setHistExpandido] = useState({});
    const inicialRef = useRef('');
    const buscaRef = useRef(null);

    useEffect(() => {
        if (vendedor) {
            setLogin(vendedor.login || '');
            let parsedPermissoes = DEFAULT_PERMISSIONS;
            if (vendedor.permissoes) {
                try {
                    const parsed = typeof vendedor.permissoes === 'string'
                        ? JSON.parse(vendedor.permissoes)
                        : vendedor.permissoes;
                    parsedPermissoes = { ...DEFAULT_PERMISSIONS, ...parsed };
                } catch (e) {
                    console.error("Erro parse json permissões");
                }
            }
            setPermissoes(parsedPermissoes);
            setTabelaCobrancaFaltaId(vendedor.tabelaCobrancaFaltaId || '');
            setQuebraCaixa(String(vendedor.quebraCaixa ?? 0));
            inicialRef.current = JSON.stringify({ p: parsedPermissoes, l: vendedor.login || '', t: vendedor.tabelaCobrancaFaltaId || '', q: String(vendedor.quebraCaixa ?? 0) });
        }
        configService.getCategorias().then(cats => setTodasCategorias(cats || [])).catch(() => {});
        tabelaPrecoService.listar(true).then(conds => setTodasCondicoes(conds || [])).catch(() => {});
        categoriaProdutoService.listar().then(cats => setTodasCategoriasComerciais((cats || []).filter(c => c.ativo !== false))).catch(() => {});
        // listarTodos: aqui a lista é de administração (copiar permissões / aplicar em lote),
        // então inclui quem tem acesso externo — não é um seletor de vendedor.
        vendedorService.listarTodos().then(data => {
            const list = Array.isArray(data) ? data : (data?.vendedores || []);
            setTodosVendedores(list.filter(v => v.id !== vendedor?.id && v.ativo !== false));
        }).catch(() => {});
    }, [vendedor]);

    // atalho "/" foca a busca (sem roubar o foco de quem está digitando)
    useEffect(() => {
        const handler = (e) => {
            const tag = (e.target?.tagName || '').toLowerCase();
            if (e.key === '/' && tag !== 'input' && tag !== 'textarea' && tag !== 'select') {
                e.preventDefault();
                buscaRef.current?.focus();
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, []);

    const handleClonar = async () => {
        if (!vendedorOrigemId) { toast.error('Selecione um usuário para clonar.'); return; }
        try {
            setClonando(true);
            const source = await vendedorService.obter(vendedorOrigemId);
            if (source && source.id) {
                let sourcePerms = source.permissoes || {};
                if (typeof sourcePerms === 'string') {
                    try { sourcePerms = JSON.parse(sourcePerms); } catch (e) { sourcePerms = {}; }
                }
                setPermissoes({ ...DEFAULT_PERMISSIONS, ...sourcePerms });
                toast.success(`Permissões copiadas de ${source.nome}! Revise e clique em Salvar.`);
                setVendedorOrigemId('');
                setPopover(null);
            }
        } catch (error) {
            console.error('Erro ao clonar permissões:', error);
            toast.error('Erro ao buscar dados do usuário de origem.');
        } finally {
            setClonando(false);
        }
    };

    // Helpers for tab-based permissions (view/edit objects)
    const toggleView = (tab) => {
        setPermissoes(prev => ({ ...prev, [tab]: { ...prev[tab], view: !prev[tab]?.view } }));
    };
    const toggleEdit = (tab) => {
        setPermissoes(prev => ({ ...prev, [tab]: { ...prev[tab], edit: !prev[tab]?.edit } }));
    };
    const toggleBool = (key) => {
        setPermissoes(prev => ({ ...prev, [key]: !prev[key] }));
    };
    // Desligar o acesso à Régua de Cobrança também desliga o editar (editar pressupõe ver)
    const toggleAcessoCobranca = () => {
        setPermissoes(prev => {
            const ver = !prev.Pode_Acessar_Cobranca;
            return { ...prev, Pode_Acessar_Cobranca: ver, Pode_Editar_Cobranca: ver ? prev.Pode_Editar_Cobranca : false };
        });
    };
    const togglePcp = (key) => {
        setPermissoes(prev => ({
            ...prev,
            pcp: { ...(prev.pcp || {}), [key]: !(prev.pcp || {})[key] }
        }));
    };
    const togglePcpAll = (val) => {
        setPermissoes(prev => ({
            ...prev,
            pcp: { itens: val, receitas: val, ordens: val, cancelarOrdens: val, agenda: val, estoque: val, sugestoes: val, etiquetas: val }
        }));
    };
    const changeClientesScope = (val) => {
        setPermissoes(prev => ({ ...prev, pedidos: { ...prev.pedidos, clientes: val } }));
    };

    // Escrever por path do índice — reusa os toggles existentes p/ manter o
    // comportamento (ex.: Régua desliga o editar junto)
    const setBoolPath = (path, val) => {
        if (path === 'Pode_Acessar_Cobranca') {
            if (!!permissoes.Pode_Acessar_Cobranca !== val) toggleAcessoCobranca();
            return;
        }
        setPermissoes(prev => {
            const partes = path.split('.');
            if (partes.length === 1) return { ...prev, [path]: val };
            const [a, b] = partes;
            return { ...prev, [a]: { ...(prev[a] || {}), [b]: val } };
        });
    };
    const getBoolPath = (path, obj = permissoes) => !!lerPath(obj, path);

    // Perfis rápidos: substitui os interruptores comuns (admin e zona de risco
    // ficam DESLIGADOS de propósito — só se ligam individualmente)
    const aplicarPerfil = (idPerfil) => {
        const perfil = PERFIS[idPerfil];
        const set = new Set(perfil.chaves);
        setPermissoes(prev => {
            let novo = { ...prev };
            BOOL_INDEX.forEach(e => {
                if (e.noBulk) return; // admin/reset nunca são tocados por perfil
                const val = e.danger ? false : set.has(e.path);
                const partes = e.path.split('.');
                if (partes.length === 1) novo = { ...novo, [e.path]: val };
                else novo = { ...novo, [partes[0]]: { ...(novo[partes[0]] || {}), [partes[1]]: val } };
            });
            // coerência da régua: sem acesso, sem editar
            if (!novo.Pode_Acessar_Cobranca) novo.Pode_Editar_Cobranca = false;
            return novo;
        });
        setPopover(null);
        toast.success(`Perfil "${perfil.rotulo.replace(/^\S+\s/, '')}" aplicado — revise e clique em Salvar.`);
    };

    // Marcar/limpar em lote os interruptores de uma seção
    // (Marcar tudo pula a zona de risco e o admin; Limpar desliga tudo da seção)
    const loteSecao = (sec, val) => {
        setPermissoes(prev => {
            let novo = { ...prev };
            BOOL_INDEX.filter(e => e.sec === sec).forEach(e => {
                if (e.noBulk) return;
                if (val && e.danger) return;
                const partes = e.path.split('.');
                if (partes.length === 1) novo = { ...novo, [e.path]: val };
                else novo = { ...novo, [partes[0]]: { ...(novo[partes[0]] || {}), [partes[1]]: val } };
            });
            if (!novo.Pode_Acessar_Cobranca) novo.Pode_Editar_Cobranca = false;
            return novo;
        });
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            const data = {
                login, permissoes,
                tabelaCobrancaFaltaId: tabelaCobrancaFaltaId || null,
                quebraCaixa: Number(String(quebraCaixa).replace(',', '.')) || 0,
            };
            if (senha && senha.trim() !== '') data.senha = senha;
            await vendedorService.atualizar(vendedor.id, data);
            toast.success('Permissões e acessos salvos!');
            onUpdated();
        } catch (error) {
            toast.error('Erro ao salvar acessos.');
            console.error(error);
        } finally {
            setSaving(false);
        }
    };

    // ── alterações pendentes ──
    const atualJson = JSON.stringify({ p: permissoes, l: login, t: tabelaCobrancaFaltaId || '', q: String(quebraCaixa) });
    const dirty = (inicialRef.current && atualJson !== inicialRef.current) || (senha && senha.trim() !== '');
    const numBoolAlterados = useMemo(() => {
        if (!inicialRef.current) return 0;
        try {
            const inicial = JSON.parse(inicialRef.current).p;
            return BOOL_INDEX.filter(e => getBoolPath(e.path, inicial) !== getBoolPath(e.path, permissoes)).length;
        } catch { return 0; }
    }, [atualJson]); // eslint-disable-line react-hooks/exhaustive-deps

    const fecharComAviso = () => {
        if (dirty && !window.confirm('Há alterações não salvas. Fechar mesmo assim?')) return;
        onClose();
    };

    // ── histórico ──
    const abrirHistorico = async () => {
        setSecAtiva('__hist');
        setBusca('');
        if (historico === null) {
            try {
                const rows = await vendedorService.historicoPermissoes(vendedor.id);
                setHistorico(rows || []);
            } catch (e) {
                setHistorico([]);
                toast.error(e.response?.data?.error || 'Erro ao carregar o histórico');
            }
        }
    };
    const diffHistorico = (row) => {
        const antes = { ...DEFAULT_PERMISSIONS, ...(row.permissoesAntes || {}) };
        const depois = { ...DEFAULT_PERMISSIONS, ...(row.permissoesDepois || {}) };
        const ligadas = BOOL_INDEX.filter(e => !getBoolPath(e.path, antes) && getBoolPath(e.path, depois));
        const desligadas = BOOL_INDEX.filter(e => getBoolPath(e.path, antes) && !getBoolPath(e.path, depois));
        return { ligadas, desligadas };
    };
    const restaurarVersao = (row) => {
        setPermissoes({ ...DEFAULT_PERMISSIONS, ...(row.permissoesAntes || {}) });
        toast.success('Versão restaurada (como estava antes daquela mudança) — revise e clique em Salvar.');
    };
    const fmtData = (iso) => {
        try {
            return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
        } catch { return iso; }
    };

    if (!vendedor) return null;

    const pcpPerms = permissoes.pcp || {};

    // contagem de ativas por seção (menu lateral)
    const contagemSecao = (sec) => {
        let n = BOOL_INDEX.filter(e => e.sec === sec && getBoolPath(e.path)).length;
        if (sec === 'estoque') n += (permissoes.estoque || []).length;
        return n;
    };
    const totalAtivas = BOOL_INDEX.filter(e => getBoolPath(e.path)).length + (permissoes.estoque || []).length;

    // busca: nome + descrição + palavras do dia a dia
    const q = busca.trim().toLowerCase();
    const resultadosBusca = q ? {
        toggles: BOOL_INDEX.filter(e => `${e.nome} ${e.desc} ${e.kw}`.toLowerCase().includes(q)),
        links: LINK_INDEX.filter(e => `${e.nome} ${e.desc} ${e.kw}`.toLowerCase().includes(q)),
    } : null;

    // filtros "só ativas"/"zona de risco" → lista plana da seção atual
    const filtrosAtivos = soAtivas || soRisco;
    const listaFiltrada = (entries) => entries
        .filter(e => !soAtivas || getBoolPath(e.path))
        .filter(e => !soRisco || e.danger);

    const nomeSecao = (sec) => SECOES.find(s => s.id === sec)?.nome || sec;

    // linha de toggle vinda do índice (busca/filtros) — mesma gravação de sempre
    const ToggleIndex = ({ entry, comSecao }) => (
        <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
                <Toggle
                    checked={getBoolPath(entry.path)}
                    onChange={(v) => setBoolPath(entry.path, v)}
                    label={entry.nome}
                    sublabel={entry.desc}
                    danger={entry.danger}
                />
            </div>
            {comSecao && (
                <button
                    onClick={() => { setBusca(''); setSecAtiva(entry.sec); }}
                    className="mt-3 flex-shrink-0 text-[10px] font-bold uppercase tracking-wide text-gray-400 hover:text-primary bg-gray-100 hover:bg-mint px-2 py-1 rounded-full"
                    title="Abrir a seção"
                >{nomeSecao(entry.sec)}</button>
            )}
        </div>
    );

    const CabecalhoSecao = ({ sec, children }) => (
        <div className="flex items-end justify-between gap-3 mb-3 flex-wrap">
            <div>
                <h4 className="text-base font-bold text-gray-900">{nomeSecao(sec)}</h4>
                <p className="text-xs text-gray-500 mt-0.5">{contagemSecao(sec)} ativa{contagemSecao(sec) === 1 ? '' : 's'} nesta seção</p>
            </div>
            <div className="flex gap-2">
                {children}
                <button onClick={() => loteSecao(sec, true)} className="px-3 py-1 text-[11px] font-bold text-gray-500 hover:text-primary border border-gray-200 hover:border-primary rounded-full" title="Liga os interruptores comuns desta seção (a zona de risco fica de fora)">Marcar tudo</button>
                <button onClick={() => loteSecao(sec, false)} className="px-3 py-1 text-[11px] font-bold text-gray-500 hover:text-red-600 border border-gray-200 hover:border-red-300 rounded-full" title="Desliga todos os interruptores desta seção">Limpar</button>
            </div>
        </div>
    );

    // ════════════════ CONTEÚDO DAS SEÇÕES (JSX original preservado) ════════════════

    const secaoAcesso = (
        <div className="space-y-4">
            <div className="flex items-end justify-between gap-3 flex-wrap">
                <div>
                    <h4 className="text-base font-bold text-gray-900">Acesso e Conta</h4>
                    <p className="text-xs text-gray-500 mt-0.5">Login, senha, nível de acesso e tela inicial</p>
                </div>
            </div>

            {/* ── Login / Senha ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700">Login</label>
                    <input type="text" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                        value={login} onChange={e => setLogin(e.target.value)} placeholder="Ex: Clark" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Nova Senha</label>
                    <input type="text" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                        value={senha} onChange={e => setSenha(e.target.value)} placeholder="Deixe vazio para manter" />
                </div>
            </div>

            {/* ── Admin Global ── */}
            <div className="flex items-center justify-between bg-indigo-50 p-4 rounded-lg border border-indigo-200">
                <div>
                    <h4 className="font-bold text-indigo-900 text-sm">Administrador Global</h4>
                    <p className="text-xs text-indigo-700 mt-0.5">Acesso irrestrito, pula trava de ponto/veículo</p>
                </div>
                <button
                    type="button" role="switch" aria-checked={!!permissoes.admin}
                    onClick={() => toggleBool('admin')}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${permissoes.admin ? 'bg-indigo-600' : 'bg-gray-200'}`}
                >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${permissoes.admin ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
            </div>

            {/* ── Isento de Ponto ── */}
            {!permissoes.admin && (
                <div className="flex items-center justify-between bg-amber-50 p-4 rounded-lg border border-amber-200">
                    <div>
                        <h4 className="font-bold text-amber-900 text-sm">Isento de Ponto / Diário</h4>
                        <p className="text-xs text-amber-700 mt-0.5">Pula a trava de check-in diário (veículo/home office) ao fazer login</p>
                    </div>
                    <button
                        type="button" role="switch" aria-checked={!!permissoes.Isento_Ponto}
                        onClick={() => toggleBool('Isento_Ponto')}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${permissoes.Isento_Ponto ? 'bg-amber-600' : 'bg-gray-200'}`}
                    >
                        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${permissoes.Isento_Ponto ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                </div>
            )}

            {/* ── Tela Inicial ── */}
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <div className="flex items-center gap-2 mb-2">
                    <Monitor className="h-4 w-4 text-blue-700" />
                    <h4 className="font-bold text-blue-900 text-sm">Tela Inicial</h4>
                </div>
                <p className="text-xs text-blue-700 mb-2">Qual página abre primeiro ao fazer login (após telas obrigatórias como Diário).</p>
                <SelectBusca
                    className="w-full"
                    value={permissoes.telaInicial || '/'}
                    onChange={e => setPermissoes(prev => ({ ...prev, telaInicial: e.target.value }))}
                >
                    {TELAS_INICIAIS.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                </SelectBusca>
            </div>

            {/* ── Barra de visitantes online ── */}
            <div className="flex items-center justify-between bg-teal-50 p-4 rounded-lg border border-teal-200">
                <div>
                    <h4 className="font-bold text-teal-900 text-sm">Barra de Visitantes Online</h4>
                    <p className="text-xs text-teal-700 mt-0.5">Mostra no topo quantas pessoas estão nos sites públicos (Início, Congelados, Kit Festa)</p>
                </div>
                <button
                    type="button" role="switch" aria-checked={!!permissoes.admin || !!permissoes.Pode_Ver_Barra_Online}
                    onClick={() => !permissoes.admin && toggleBool('Pode_Ver_Barra_Online')}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${(permissoes.admin || permissoes.Pode_Ver_Barra_Online) ? 'bg-teal-600' : 'bg-gray-200'} ${permissoes.admin ? 'opacity-60 cursor-not-allowed' : ''}`}
                    title={permissoes.admin ? 'Administrador vê tudo automaticamente' : ''}
                >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${(permissoes.admin || permissoes.Pode_Ver_Barra_Online) ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
            </div>
        </div>
    );

    const secaoDashboard = (
        <div>
            <CabecalhoSecao sec="dashboard" />
            <Toggle
                checked={!!permissoes.Pode_Ver_Dashboard_Vendas}
                onChange={() => toggleBool('Pode_Ver_Dashboard_Vendas')}
                label="Ver dados de vendas"
                sublabel="Exibe o card 'Vendas (Hoje)' e outros valores financeiros no painel do admin"
                colorClass="bg-blue-600"
            />
            <Toggle
                checked={!!permissoes.Pode_Ver_Dashboard_Admin}
                onChange={() => toggleBool('Pode_Ver_Dashboard_Admin')}
                label="Ver Painel Administrativo (master)"
                sublabel="Libera o painel completo: vendas/projeção/top10/inadimplência/inativos/ruptura. Dado financeiro sensível."
                colorClass="bg-blue-600"
            />
        </div>
    );

    const secaoTarefas = (
        <div>
            <CabecalhoSecao sec="tarefas" />
            <p className="text-xs text-gray-500 px-2 mb-1.5">A aba Tarefas é visível para todos. Estas chaves liberam funções extras:</p>
            <Toggle
                checked={!!permissoes.Pode_Criar_Tarefas_Para_Outros}
                onChange={() => toggleBool('Pode_Criar_Tarefas_Para_Outros')}
                label="Pode criar tarefas para outros"
                sublabel="Sem isso, a pessoa só cria tarefa para si mesma"
                colorClass="bg-emerald-600"
            />
            <Toggle
                checked={!!permissoes.Pode_Ver_Agenda_Colegas}
                onChange={() => toggleBool('Pode_Ver_Agenda_Colegas')}
                label="Pode ver a agenda dos colegas"
                sublabel="Ver as tarefas dos outros (sem editar) e o filtro 'Toda a equipe'"
                colorClass="bg-emerald-600"
            />
            <Toggle
                checked={!!permissoes.Pode_Ver_Parecer_Tarefas}
                onChange={() => toggleBool('Pode_Ver_Parecer_Tarefas')}
                label="Pode ver o parecer do dia"
                sublabel="Relatório por funcionário: concluídas no horário, com atraso, não feitas e adiamentos"
                colorClass="bg-emerald-600"
            />
        </div>
    );

    const secaoVendas = (
        <div>
            <CabecalhoSecao sec="vendas" />
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">Menus visíveis</p>
            <MenuToggle icon={BookOpen} label="Catálogo" checked={!!permissoes.catalogo?.view} onChange={() => toggleView('catalogo')} />
            <MenuToggle icon={ClipboardList} label="Pedidos" checked={!!permissoes.pedidos?.view} onChange={() => toggleView('pedidos')} />
            <MenuToggle icon={FileText} label="Relatórios" checked={!!permissoes.pedidos?.view} onChange={() => toggleView('pedidos')} />
            <MenuToggle icon={BarChart2} label="Rel. Vendas" checked={!!permissoes.relatorioVendas} onChange={() => toggleBool('relatorioVendas')} />
            <MenuToggle icon={Map} label="Rota" checked={!!permissoes.pedidos?.view} onChange={() => toggleView('pedidos')} />
            <MenuToggle icon={ClipboardCheck} label="Atendimentos" checked={!!permissoes.Pode_Ver_Atendimentos} onChange={() => toggleBool('Pode_Ver_Atendimentos')} />
            <MenuToggle icon={Target} label="Leads" checked={!!permissoes.rota?.view} onChange={() => toggleView('rota')} />
            <MenuToggle icon={Users} label="Clientes" checked={!!permissoes.clientes?.view} onChange={() => toggleView('clientes')} />
            <MenuToggle icon={PartyPopper} label="Kit Festa" checked={!!permissoes.kitFesta} onChange={() => toggleBool('kitFesta')} />

            {/* Sub-permissões de edição */}
            {(permissoes.catalogo?.view || permissoes.pedidos?.view || permissoes.clientes?.view) && (
                <>
                    <div className="border-t mt-3 pt-3">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">Permissões de edição</p>
                    </div>
                    {permissoes.catalogo?.view && (
                        <Toggle checked={!!permissoes.catalogo?.edit} onChange={() => toggleEdit('catalogo')} label="Gerenciar Catálogo" sublabel="Pode editar preços e detalhes no catálogo" />
                    )}
                    {permissoes.pedidos?.view && (
                        <Toggle checked={!!permissoes.pedidos?.edit} onChange={() => toggleEdit('pedidos')} label="Criar/Editar Pedidos" sublabel="Pode criar novos pedidos e editar existentes" />
                    )}
                    {permissoes.clientes?.view && (
                        <Toggle checked={!!permissoes.clientes?.edit} onChange={() => toggleEdit('clientes')} label="Gerenciar Clientes" sublabel="Pode editar dados dos clientes" />
                    )}
                    {permissoes.rota?.view && (
                        <Toggle checked={!!permissoes.rota?.edit} onChange={() => toggleEdit('rota')} label="Gerenciar Rota/Leads" sublabel="Pode editar rotas e leads" />
                    )}
                </>
            )}

            {/* Regra de Clientes */}
            {permissoes.pedidos?.view && (
                <div className="border-t mt-3 pt-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">Regra de clientes para pedidos</p>
                    <div className="flex gap-4 px-2">
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <input type="radio" name="clientes" value="todos"
                                checked={permissoes.pedidos?.clientes === 'todos'}
                                onChange={e => changeClientesScope(e.target.value)} />
                            <span>Todos os Clientes</span>
                        </label>
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <input type="radio" name="clientes" value="vinculados"
                                checked={permissoes.pedidos?.clientes !== 'todos'}
                                onChange={e => changeClientesScope(e.target.value)} />
                            <span>Apenas Vinculados</span>
                        </label>
                    </div>
                </div>
            )}

            {/* Categorias Comerciais — filtro de produtos visíveis em pedidos e catálogo */}
            {(permissoes.pedidos?.view || permissoes.catalogo?.view) && todasCategoriasComerciais.length > 0 && (
                <div className="border-t mt-3 pt-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">Categorias Comerciais</p>
                    <div className="bg-blue-50 p-3 rounded-md border border-blue-200">
                        <h5 className="text-xs font-bold text-blue-900 mb-1">Produtos visíveis em pedidos e catálogo</h5>
                        <p className="text-[10px] text-blue-700 mb-2">Se nenhuma for selecionada, todas ficam disponíveis. Devoluções não são afetadas.</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto">
                            {todasCategoriasComerciais.map(cat => (
                                <label key={cat.id} className="flex items-center gap-1.5 text-xs cursor-pointer p-1 hover:bg-blue-100 rounded">
                                    <input type="checkbox" className="rounded border-blue-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                                        checked={(permissoes.categoriasComerciais || []).includes(cat.id)}
                                        onChange={(e) => {
                                            const current = permissoes.categoriasComerciais || [];
                                            const updated = e.target.checked ? [...current, cat.id] : current.filter(c => c !== cat.id);
                                            setPermissoes(prev => ({ ...prev, categoriasComerciais: updated }));
                                        }} />
                                    <span className="text-blue-800">{cat.nome}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* CRM / Leads */}
            {permissoes.rota?.view && (
                <div className="border-t mt-3 pt-3">
                    <Toggle checked={!!permissoes.Pode_Editar_Lead} onChange={() => toggleBool('Pode_Editar_Lead')}
                        label="Pode Editar Leads" sublabel="Permite editar leads existentes, não apenas criar novos" />
                    <Toggle checked={!!permissoes.Pode_Excluir_Lead} onChange={() => toggleBool('Pode_Excluir_Lead')}
                        label="Pode Excluir Leads" sublabel="Permite excluir leads permanentemente (ação irreversível)" />
                    <Toggle checked={!!permissoes.Pode_Editar_GPS} onChange={() => toggleBool('Pode_Editar_GPS')}
                        label="Editar GPS de Clientes" sublabel="Capturar e salvar localização GPS dos clientes na rota" />
                    <Toggle checked={!!permissoes.Pode_Ver_Analise_IA} onChange={() => toggleBool('Pode_Ver_Analise_IA')}
                        label="Análise IA" sublabel="Acesso ao painel de auditoria das análises geradas pela IA" icon={Lightbulb} colorClass="bg-violet-600" />
                    <Toggle checked={!!permissoes.Pode_Usar_IA_Orientacao} onChange={() => toggleBool('Pode_Usar_IA_Orientacao')}
                        label="Orientação IA na Rota" sublabel="Exibe botão para gerar análise de orientação comercial com IA nos cards da rota" icon={Lightbulb} colorClass="bg-violet-600" />
                </div>
            )}

            {/* Ajustes de pedidos */}
            <div className="border-t mt-3 pt-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">Ajustes em Pedidos</p>
                <Toggle checked={!!permissoes.Pode_Reatribuir_Vendedor} onChange={() => toggleBool('Pode_Reatribuir_Vendedor')}
                    label="Reatribuir Vendedor em Pedidos" sublabel="Trocar o vendedor de pedidos existentes (ajuste apenas no app, não afeta o Conta Azul)" />
            </div>

            {/* Exclusão de pedidos */}
            {permissoes.pedidos?.view && (
                <div className="border-t mt-3 pt-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">Exclusão de registros</p>
                    <Toggle checked={!!permissoes.Pode_Excluir_Pedido} onChange={() => toggleBool('Pode_Excluir_Pedido')}
                        label="Excluir Pedidos" sublabel="Pedidos em status ABERTO ou ERRO" danger />
                    <Toggle checked={!!permissoes.Pode_Excluir_Especial} onChange={() => toggleBool('Pode_Excluir_Especial')}
                        label="Excluir Pedidos Especiais" danger />
                    <Toggle checked={!!permissoes.Pode_Excluir_Bonificacao} onChange={() => toggleBool('Pode_Excluir_Bonificacao')}
                        label="Excluir Bonificações" danger />
                    <Toggle checked={!!permissoes.Pode_Excluir_Amostra} onChange={() => toggleBool('Pode_Excluir_Amostra')}
                        label="Excluir Amostras" danger />
                </div>
            )}

            {/* Especiais */}
            {permissoes.pedidos?.view && (
                <div className="border-t mt-3 pt-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">Pedidos Especiais (Sem Nota)</p>
                    <Toggle checked={!!permissoes.Pode_Criar_Especial} onChange={() => toggleBool('Pode_Criar_Especial')}
                        label="Criar Pedido Especial" sublabel="Habilita o toggle 'Especial' ao criar pedido" />
                    <Toggle checked={!!permissoes.Pode_Aprovar_Especial} onChange={() => toggleBool('Pode_Aprovar_Especial')}
                        label="Aprovar Pedido Especial" sublabel="Aprovar/faturar pedidos especiais pendentes" />
                    <Toggle checked={!!permissoes.Pode_Reverter_Especial} onChange={() => toggleBool('Pode_Reverter_Especial')}
                        label="Reverter Faturamento Especial" sublabel="Reverter pedidos especiais aprovados para ABERTO" danger />

                    {/* Categorias Extras para Especiais */}
                    {!!permissoes.Pode_Criar_Especial && todasCategorias.length > 0 && (
                        <div className="mt-3 bg-purple-50 p-3 rounded-md border border-purple-200">
                            <h5 className="text-xs font-bold text-purple-900 mb-2">Categorias Extras (Especial)</h5>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-36 overflow-y-auto">
                                {todasCategorias.map(cat => (
                                    <label key={cat} className="flex items-center gap-1.5 text-xs cursor-pointer p-1 hover:bg-purple-100 rounded">
                                        <input type="checkbox" className="rounded border-purple-300 text-purple-600 focus:ring-purple-500 h-3.5 w-3.5"
                                            checked={(permissoes.categoriasEspeciais || []).includes(cat)}
                                            onChange={(e) => {
                                                const current = permissoes.categoriasEspeciais || [];
                                                const updated = e.target.checked ? [...current, cat] : current.filter(c => c !== cat);
                                                setPermissoes(prev => ({ ...prev, categoriasEspeciais: updated }));
                                            }} />
                                        <span className="text-purple-800">{cat}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Condições de Pagamento para Especiais */}
                    {!!permissoes.Pode_Criar_Especial && todasCondicoes.length > 0 && (
                        <div className="mt-3 bg-purple-50 p-3 rounded-md border border-purple-200">
                            <h5 className="text-xs font-bold text-purple-900 mb-2">Condições de Pagamento (Especial)</h5>
                            <p className="text-[10px] text-purple-700 mb-2">Se nenhuma for selecionada, todas ficam disponíveis.</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-36 overflow-y-auto">
                                {todasCondicoes.map(cond => (
                                    <label key={cond.idCondicao || cond.id} className="flex items-center gap-1.5 text-xs cursor-pointer p-1 hover:bg-purple-100 rounded">
                                        <input type="checkbox" className="rounded border-purple-300 text-purple-600 focus:ring-purple-500 h-3.5 w-3.5"
                                            checked={(permissoes.condicoesEspeciais || []).includes(cond.idCondicao || cond.id)}
                                            onChange={(e) => {
                                                const condId = cond.idCondicao || cond.id;
                                                const current = permissoes.condicoesEspeciais || [];
                                                const updated = e.target.checked ? [...current, condId] : current.filter(c => c !== condId);
                                                setPermissoes(prev => ({ ...prev, condicoesEspeciais: updated }));
                                            }} />
                                        <span className="text-purple-800">{cond.nome || cond.descricao || cond.idCondicao}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Bonificação */}
            {permissoes.pedidos?.view && (
                <div className="border-t mt-3 pt-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">Pedidos Bonificação</p>
                    <Toggle checked={!!permissoes.Pode_Criar_Bonificacao} onChange={() => toggleBool('Pode_Criar_Bonificacao')}
                        label="Criar Bonificação" sublabel="Habilita o botão 'Bonificação' ao criar pedido" />
                    <Toggle checked={!!permissoes.Pode_Aprovar_Bonificacao} onChange={() => toggleBool('Pode_Aprovar_Bonificacao')}
                        label="Aprovar Bonificação" />
                    <Toggle checked={!!permissoes.Pode_Reverter_Bonificacao} onChange={() => toggleBool('Pode_Reverter_Bonificacao')}
                        label="Reverter Bonificação" danger />
                </div>
            )}

            {/* Regras de Horário para Pedidos */}
            {permissoes.pedidos?.view && (
                <div className="border-t mt-3 pt-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">Regras de Horário para Pedidos</p>
                    <div className="bg-orange-50 p-3 rounded-md border border-orange-200 space-y-3">
                        <div className="flex items-center gap-2 mb-1">
                            <Clock className="h-4 w-4 text-orange-600" />
                            <span className="text-xs font-bold text-orange-800">Limites de Horário</span>
                        </div>
                        <p className="text-[10px] text-orange-600">
                            Após estes horários, o vendedor não poderá criar pedidos para a data correspondente. Pedidos criados no sábado/domingo para segunda-feira não têm restrição de horário.
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[11px] font-bold text-orange-800 mb-1">Limite p/ Entrega Amanhã</label>
                                <input
                                    type="time"
                                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary text-sm border p-2 bg-white text-gray-900"
                                    value={permissoes.horarioLimiteAmanha || '18:00'}
                                    onChange={e => setPermissoes(prev => ({ ...prev, horarioLimiteAmanha: e.target.value }))}
                                />
                                <p className="text-[9px] text-orange-500 mt-0.5">Ex: 18:00 — após esse horário, não cria pedido para amanhã</p>
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-orange-800 mb-1">Limite p/ Entrega Hoje</label>
                                <input
                                    type="time"
                                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary text-sm border p-2 bg-white text-gray-900"
                                    value={permissoes.horarioLimiteHoje || '12:00'}
                                    onChange={e => setPermissoes(prev => ({ ...prev, horarioLimiteHoje: e.target.value }))}
                                />
                                <p className="text-[9px] text-orange-500 mt-0.5">Ex: 12:00 — após esse horário, não cria pedido para hoje</p>
                            </div>
                        </div>
                        <Toggle
                            checked={!!permissoes.Pode_Entregar_Fim_Semana}
                            onChange={() => toggleBool('Pode_Entregar_Fim_Semana')}
                            label="Pode Entregar no Fim de Semana"
                            sublabel="Permite criar pedidos com data de entrega no sábado ou domingo. Sem esta permissão, entregas só podem ser agendadas para dias úteis (seg–sex)."
                            icon={CalendarOff}
                            colorClass="bg-orange-600"
                        />
                    </div>
                </div>
            )}

            {/* Restrições de venda */}
            {permissoes.pedidos?.view && (
                <div className="border-t mt-3 pt-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">Restrições de Venda</p>
                    <Toggle checked={!!permissoes.Bloqueio_Venda_Sem_Estoque} onChange={() => toggleBool('Bloqueio_Venda_Sem_Estoque')}
                        label="Bloquear Venda Sem Estoque"
                        sublabel="RESTRIÇÃO: ligado, este usuário não cria nem edita pedido com quantidade acima do estoque disponível (vale até para admin). O erro mostra o disponível de cada produto. Fica fora do 'Marcar tudo' e dos perfis." />
                </div>
            )}
        </div>
    );

    const secaoLogistica = (
        <div>
            <CabecalhoSecao sec="logistica" />
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">Menus visíveis</p>
            <MenuToggle icon={PackageCheck} label="Embarque" checked={!!permissoes.Pode_Acessar_Embarque} onChange={() => toggleBool('Pode_Acessar_Embarque')} />
            <MenuToggle icon={Truck} label="Entregas (Auditor)" checked={!!permissoes.Pode_Ver_Todas_Entregas} onChange={() => toggleBool('Pode_Ver_Todas_Entregas')} />
            <MenuToggle icon={Truck} label="Minhas Entregas (Motorista)" checked={!!permissoes.Pode_Executar_Entregas} onChange={() => toggleBool('Pode_Executar_Entregas')} />

            <div className="border-t mt-3 pt-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">Permissões avançadas</p>
                <Toggle checked={!!permissoes.Pode_Editar_Embarque} onChange={() => toggleBool('Pode_Editar_Embarque')}
                    label="Editar Carga" sublabel="Alterar data e motorista de cargas já criadas" />
                <Toggle checked={!!permissoes.Pode_Ajustar_Entregas} onChange={() => toggleBool('Pode_Ajustar_Entregas')}
                    label="Administrador Financeiro de Entrega" sublabel="Desmanchar/alterar devoluções ou pagamentos do motorista" danger />
                <Toggle checked={!!permissoes.Pode_Cobrar_Titulo_Rota} onChange={() => toggleBool('Pode_Cobrar_Titulo_Rota')}
                    label="Cobrar Títulos em Rota" sublabel="Aba Cobranças no roteiro: cobra títulos em aberto na rua (a baixa sai só no Caixa)" />
            </div>
        </div>
    );

    const secaoFinanceiro = (
        <div>
            <CabecalhoSecao sec="financeiro" />
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">Menus visíveis</p>
            <MenuToggle icon={Search} label="Auditoria Entregas" checked={!!permissoes.Pode_Ver_Todas_Entregas} onChange={() => toggleBool('Pode_Ver_Todas_Entregas')} />
            <MenuToggle icon={DollarSign} label="Contas a Receber" checked={!!permissoes.Pode_Acessar_Contas_Receber} onChange={() => toggleBool('Pode_Acessar_Contas_Receber')} />
            <MenuToggle icon={BellRing} label="Régua de Cobrança" checked={!!permissoes.Pode_Acessar_Cobranca} onChange={toggleAcessoCobranca} />
            <MenuToggle icon={Wallet} label="Contas a Pagar" checked={!!permissoes.Pode_Acessar_Contas_Pagar} onChange={() => toggleBool('Pode_Acessar_Contas_Pagar')} />
            <MenuToggle icon={Inbox} label="Notas Recebidas" checked={!!permissoes.Pode_Acessar_Notas_Recebidas} onChange={() => toggleBool('Pode_Acessar_Notas_Recebidas')} />
            <MenuToggle icon={FileText} label="Notas Fiscais (emissão)" checked={!!permissoes.Pode_Acessar_Notas_Fiscais} onChange={() => toggleBool('Pode_Acessar_Notas_Fiscais')} />
            <MenuToggle icon={Building2} label="Fornecedores" checked={!!permissoes.Pode_Acessar_Fornecedores} onChange={() => toggleBool('Pode_Acessar_Fornecedores')} />
            <MenuToggle icon={BarChart3} label="Fluxo de Caixa e DRE (gerencial)" checked={!!permissoes.Pode_Acessar_Financeiro_Gerencial} onChange={() => toggleBool('Pode_Acessar_Financeiro_Gerencial')} />

            {permissoes.Pode_Acessar_Cobranca && (
                <div className="border-t mt-3 pt-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">Permissões da Régua de Cobrança</p>
                    <Toggle checked={!!permissoes.Pode_Editar_Cobranca} onChange={() => toggleBool('Pode_Editar_Cobranca')}
                        label="Editar Régua de Cobrança" sublabel="Ligar/desligar a régua, configurar mensagens e canais, executar e cobrar manualmente. Desligado = só visualiza." />
                </div>
            )}

            {permissoes.Pode_Acessar_Notas_Fiscais && (
                <div className="border-t mt-3 pt-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">Permissões de Notas Fiscais</p>
                    <Toggle checked={!!permissoes.Pode_Emitir_NF} onChange={() => toggleBool('Pode_Emitir_NF')}
                        label="Pode emitir notas" sublabel="Emitir NF-e dos pedidos da fila (individual ou 'Emitir todas'). Desligado = só visualiza a fila." />
                    <Toggle checked={!!permissoes.Pode_Configurar_NF} onChange={() => toggleBool('Pode_Configurar_NF')}
                        label="Pode configurar emissão" sublabel="Alterar as configurações da emissão de NF-e (ambiente, certificado, série)" danger />
                </div>
            )}

            {permissoes.Pode_Acessar_Contas_Receber && (
                <div className="border-t mt-3 pt-3">
                    <Toggle checked={!!permissoes.Pode_Baixar_Contas_Receber} onChange={() => toggleBool('Pode_Baixar_Contas_Receber')}
                        label="Dar Baixa em Parcelas" sublabel="Registrar pagamentos (inclusive parciais) e estornar baixas" />
                    {permissoes.Pode_Baixar_Contas_Receber && (
                        <Toggle checked={!!permissoes.Pode_Baixar_Contas_Receber_Manual} onChange={() => toggleBool('Pode_Baixar_Contas_Receber_Manual')}
                            label="Baixa Manual no Contas a Receber" sublabel="Quitar título digitando na tela — só dinheiro/cheque, e o valor cai no caixa do dia de quem baixou. Desligado: o recebimento entra pela Conciliação Bancária ou pelo Caixa" danger />
                    )}
                    {permissoes.Pode_Baixar_Contas_Receber && (
                        <Toggle checked={!!permissoes.Pode_Dar_Desconto_Baixa} onChange={() => toggleBool('Pode_Dar_Desconto_Baixa')}
                            label="Dar Desconto na Baixa" sublabel="Reduz o valor a receber (até 100%) sem confirmação de pagamento — use com critério" danger />
                    )}
                </div>
            )}

            {(permissoes.Pode_Acessar_Contas_Pagar || permissoes.Pode_Acessar_Notas_Recebidas) && (
                <div className="border-t mt-3 pt-3">
                    <Toggle checked={!!permissoes.Pode_Baixar_Contas_Pagar} onChange={() => toggleBool('Pode_Baixar_Contas_Pagar')}
                        label="Operar Contas a Pagar" sublabel="Criar/editar despesas, dar baixa e conferir notas recebidas (gerar conta, ignorar)" />
                    {permissoes.Pode_Acessar_Notas_Recebidas && (
                        <Toggle checked={!!permissoes.Pode_Corrigir_Entrada_Estoque} onChange={() => toggleBool('Pode_Corrigir_Entrada_Estoque')}
                            label="Corrigir Entrada de Estoque" sublabel="Arruma produto/conversão de nota já lançada — altera custo e estoque (a despesa e os pagamentos ficam intactos)" danger />
                    )}
                    {permissoes.Pode_Acessar_Notas_Recebidas && (
                        <Toggle checked={!!permissoes.Pode_Recusar_Nota_Fiscal} onChange={() => toggleBool('Pode_Recusar_Nota_Fiscal')}
                            label="Recusar Nota na Receita" sublabel='Manifestação do Destinatário: recusar a nota por "Operação não realizada" ou "Desconhecimento". Vai para a Receita Federal e NÃO dá para desfazer pelo app (confirmar a operação não precisa desta permissão)' danger />
                    )}
                </div>
            )}

            <div className="border-t mt-3 pt-3">
                <Toggle checked={!!permissoes.Pode_Vender_Inadimplente} onChange={() => toggleBool('Pode_Vender_Inadimplente')}
                    label="Pode vender para clientes com contas em aberto" sublabel="Se ativado, o vendedor se torna responsável e a observação é registrada no pedido" danger />
            </div>

            {/* Devoluções */}
            <div className="border-t mt-3 pt-3">
                <Toggle checked={!!permissoes.Pode_Fazer_Devolucao} onChange={() => toggleBool('Pode_Fazer_Devolucao')}
                    label="Fazer Devolução" sublabel="Registrar devoluções de pedidos entregues" />
                {permissoes.Pode_Fazer_Devolucao && (
                    <Toggle checked={!!permissoes.Pode_Reverter_Devolucao} onChange={() => toggleBool('Pode_Reverter_Devolucao')}
                        label="Reverter Devolução" sublabel="Desfazer devoluções já registradas" danger />
                )}
            </div>

            {/* Metas */}
            <div className="border-t mt-3 pt-3">
                <Toggle checked={!!permissoes.Pode_Gerenciar_Metas} onChange={() => toggleBool('Pode_Gerenciar_Metas')}
                    label="Gerenciar Metas de Vendas" sublabel="Criar, editar e excluir metas mensais" icon={TrendingUp} />
            </div>
        </div>
    );

    const secaoCaixa = (
        <div>
            <CabecalhoSecao sec="caixa" />
            <MenuToggle icon={Wallet} label="Caixa Diário" checked={!!permissoes.Pode_Acessar_Caixa} onChange={() => toggleBool('Pode_Acessar_Caixa')} />
            <MenuToggle icon={Receipt} label="Despesas" checked={!!permissoes.Pode_Acessar_Caixa} onChange={() => toggleBool('Pode_Acessar_Caixa')} />

            {permissoes.Pode_Acessar_Caixa && (
                <div className="border-t mt-3 pt-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">Permissões do Caixa</p>
                    <Toggle checked={!!permissoes.Pode_Editar_Caixa} onChange={() => toggleBool('Pode_Editar_Caixa')}
                        label="Auditor Financeiro do Caixa" sublabel="Confere caixas de outros usuários, edita despesas alheias" danger />
                    <Toggle checked={!!permissoes.Pode_Baixar_Caixa} onChange={() => toggleBool('Pode_Baixar_Caixa')}
                        label="Baixar no Caixa (Quitar CA)" sublabel="Dar baixa de entregas à vista (dinheiro/pix/cartão) no Conta Azul" />
                    <Toggle checked={!!permissoes.Pode_Fechar_Caixa} onChange={() => toggleBool('Pode_Fechar_Caixa')}
                        label="Fechar Caixa" sublabel="Fechar o caixa do dia com snapshot dos totais" />
                    <Toggle checked={!!permissoes.Pode_Definir_Adiantamento} onChange={() => toggleBool('Pode_Definir_Adiantamento')}
                        label="Definir Adiantamento" sublabel="Editar o valor de adiantamento do caixa diário" />
                    <Toggle checked={!!permissoes.Pode_Alterar_Adiantamento_Alheio} onChange={() => toggleBool('Pode_Alterar_Adiantamento_Alheio')}
                        label="Alterar Adiantamento de Outros" sublabel="Pode mudar ou zerar um adiantamento lançado por outra pessoa" danger />
                    <Toggle checked={!!permissoes.Pode_Ver_Historico_Caixa} onChange={() => toggleBool('Pode_Ver_Historico_Caixa')}
                        label="Ver Caixas de Outros Dias" sublabel="Navegar por datas passadas ou futuras" />
                    <Toggle checked={!!permissoes.Pode_Reverter_Caixa} onChange={() => toggleBool('Pode_Reverter_Caixa')}
                        label="Reverter Caixa" sublabel="Reverter conferência e reabrir caixas fechados" danger />
                    <Toggle checked={!!permissoes.Pode_Conferir_Devolucao_Caixa} onChange={() => toggleBool('Pode_Conferir_Devolucao_Caixa')}
                        label="Conferir Devoluções no Caixa" sublabel="Recebe a mercadoria que voltou e digita a contagem física na conferência" />
                    <Toggle checked={!!permissoes.Pode_Autorizar_Desconsiderar_Devolucao} onChange={() => toggleBool('Pode_Autorizar_Desconsiderar_Devolucao')}
                        label="Autorizar Desconsiderar Devolução" sublabel="A senha desta pessoa libera falta de devolução sem cobrança ao motorista" danger />
                    <Toggle checked={!!permissoes.Pode_Conferir_Dinheiro_Caixa} onChange={() => toggleBool('Pode_Conferir_Dinheiro_Caixa')}
                        label="Conferir Dinheiro do Caixa" sublabel="Recebe o dinheiro, conta na calculadora e assina a conferência que libera o fechamento" />

                    {/* Quebra de caixa: só faz sentido para quem conta o dinheiro */}
                    {!!permissoes.Pode_Conferir_Dinheiro_Caixa && (
                        <div className="px-2 mt-2 mb-1">
                            <label className="text-sm font-medium text-gray-700 block mb-1">Quebra de caixa desta pessoa</label>
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-500">R$</span>
                                <input
                                    type="number" min="0" step="0.01" inputMode="decimal"
                                    value={quebraCaixa}
                                    onChange={(e) => setQuebraCaixa(e.target.value)}
                                    className="w-32 border border-gray-300 rounded px-3 py-2 text-sm text-right font-semibold focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                />
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                                Diferença (falta ou sobra) que esta pessoa pode fechar sozinha ao conferir o dinheiro, sempre com motivo.
                                Acima disso, exige a senha de quem tem “Autorizar Diferença no Caixa”. Zero = qualquer diferença pede senha.
                            </p>
                        </div>
                    )}

                    <Toggle checked={!!permissoes.Pode_Autorizar_Diferenca_Caixa} onChange={() => toggleBool('Pode_Autorizar_Diferenca_Caixa')}
                        label="Autorizar Diferença no Caixa" sublabel="A senha desta pessoa libera diferença acima da quebra de quem está conferindo" danger />

                    {/* Tabela usada para cobrar faltas de devolução deste motorista */}
                    <div className="px-2 mt-2">
                        <label className="text-sm font-medium text-gray-700 block mb-1">Tabela para cobrança de faltas de devolução</label>
                        <SelectBusca value={tabelaCobrancaFaltaId} onChange={(e) => setTabelaCobrancaFaltaId(e.target.value)} className="w-full">
                            <option value="">Padrão (À vista - Funcionário, automático)</option>
                            {todasCondicoes.map(c => (
                                <option key={c.id} value={c.id}>{c.nomeCondicao}</option>
                            ))}
                        </SelectBusca>
                        <p className="text-xs text-gray-500 mt-1">
                            Quando falta mercadoria na conferência de devoluções, o valor cobrado deste motorista é calculado por esta tabela.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );

    const secaoAdmin = (
        <div>
            <CabecalhoSecao sec="admin" />
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">Menus visíveis</p>
            <MenuToggle icon={Box} label="Produtos" checked={!!permissoes.produtos?.view} onChange={() => toggleView('produtos')} />
            <MenuToggle icon={UserCog} label="Vendedores" checked={!!permissoes.vendedores?.view} onChange={() => toggleView('vendedores')} />
            <MenuToggle icon={Car} label="Veículos" checked={!!permissoes.Pode_Acessar_Veiculos} onChange={() => toggleBool('Pode_Acessar_Veiculos')} />
            <MenuToggle icon={RefreshCw} label="Sincronizar" checked={!!permissoes.sync?.view} onChange={() => toggleView('sync')} />

            <div className="border-t mt-3 pt-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">Permissões avançadas</p>
                {permissoes.produtos?.view && (
                    <Toggle checked={!!permissoes.produtos?.edit} onChange={() => toggleEdit('produtos')}
                        label="Gerenciar Produtos" sublabel="Editar dados dos produtos" />
                )}
                {permissoes.vendedores?.view && (
                    <Toggle checked={!!permissoes.vendedores?.edit} onChange={() => toggleEdit('vendedores')}
                        label="Gerenciar Vendedores" sublabel="Editar dados e permissões dos vendedores" />
                )}
                <Toggle checked={!!permissoes.Pode_Editar_Veiculos} onChange={() => toggleBool('Pode_Editar_Veiculos')}
                    label="Editar Veículos" sublabel="Cadastrar/editar/excluir veículos, lançar manutenção" danger />
                <Toggle checked={!!permissoes.Pode_Resetar_Dados} onChange={() => toggleBool('Pode_Resetar_Dados')}
                    label="Resetar Dados" sublabel="Ferramenta de limpeza de dados (ação irreversível)" danger />
            </div>
        </div>
    );

    const secaoEstoque = (
        <div>
            <CabecalhoSecao sec="estoque" />
            <p className="text-xs text-gray-500 mb-3 px-2">Define o que este usuário pode fazer no painel de estoque por categoria. Sem regras = sem acesso (exceto admin).</p>
            <div className="space-y-2">
                {(permissoes.estoque || []).map((regra, idx) => (
                    <div key={idx} className="flex items-center gap-2 flex-wrap bg-gray-50 p-2 rounded-md">
                        <SelectBusca
                            value={regra.categoria || ''}
                            onChange={e => {
                                const nova = [...(permissoes.estoque || [])];
                                nova[idx] = { ...nova[idx], categoria: e.target.value };
                                setPermissoes(prev => ({ ...prev, estoque: nova }));
                            }}
                            className="flex-1 min-w-[120px]"
                        >
                            <option value="">Todas as categorias</option>
                            {todasCategorias.map(c => {
                                const nome = typeof c === 'string' ? c : (c.descricao || c.nome || c.id);
                                return <option key={nome} value={nome}>{nome}</option>;
                            })}
                        </SelectBusca>
                        <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                            <input type="checkbox" className="rounded border-teal-300 text-teal-600 focus:ring-teal-500"
                                checked={regra.pode?.includes('adicionar')}
                                onChange={e => {
                                    const nova = [...(permissoes.estoque || [])];
                                    const pode = new Set(nova[idx].pode || []);
                                    e.target.checked ? pode.add('adicionar') : pode.delete('adicionar');
                                    nova[idx] = { ...nova[idx], pode: [...pode] };
                                    setPermissoes(prev => ({ ...prev, estoque: nova }));
                                }} />
                            Adicionar
                        </label>
                        <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                            <input type="checkbox" className="rounded border-teal-300 text-teal-600 focus:ring-teal-500"
                                checked={regra.pode?.includes('diminuir')}
                                onChange={e => {
                                    const nova = [...(permissoes.estoque || [])];
                                    const pode = new Set(nova[idx].pode || []);
                                    e.target.checked ? pode.add('diminuir') : pode.delete('diminuir');
                                    nova[idx] = { ...nova[idx], pode: [...pode] };
                                    setPermissoes(prev => ({ ...prev, estoque: nova }));
                                }} />
                            Diminuir
                        </label>
                        <button
                            onClick={() => {
                                const nova = (permissoes.estoque || []).filter((_, i) => i !== idx);
                                setPermissoes(prev => ({ ...prev, estoque: nova }));
                            }}
                            className="text-red-400 hover:text-red-600 text-lg font-light leading-none" title="Remover">×</button>
                    </div>
                ))}
                <button
                    onClick={() => setPermissoes(prev => ({ ...prev, estoque: [...(prev.estoque || []), { categoria: '', pode: [] }] }))}
                    className="text-sm text-teal-700 font-medium hover:text-teal-900 flex items-center gap-1 px-2"
                >+ Adicionar regra de categoria</button>
            </div>
        </div>
    );

    const secaoPcp = (
        <div>
            <CabecalhoSecao sec="pcp">
                <button type="button" onClick={() => togglePcpAll(true)} className="px-3 py-1 text-[11px] font-bold text-amber-700 border border-amber-200 hover:border-amber-400 rounded-full">Marcar todas</button>
                <button type="button" onClick={() => togglePcpAll(false)} className="px-3 py-1 text-[11px] font-bold text-gray-500 border border-gray-200 rounded-full">Desmarcar</button>
            </CabecalhoSecao>
            <p className="text-xs text-gray-500 mb-2 px-2">Selecione as telas do PCP que este usuario pode acessar.</p>
            <MenuToggle icon={Package} label="Subprodutos" checked={!!pcpPerms.itens} onChange={() => togglePcp('itens')} />
            <MenuToggle icon={BookOpenIcon} label="Receitas" checked={!!pcpPerms.receitas} onChange={() => togglePcp('receitas')} />
            <MenuToggle icon={ClipboardList} label="Ordens de Producao" checked={!!pcpPerms.ordens} onChange={() => togglePcp('ordens')} />
            <MenuToggle icon={ClipboardList} label="Cancelar Ordens" checked={!!pcpPerms.cancelarOrdens} onChange={() => togglePcp('cancelarOrdens')} />
            <MenuToggle icon={Play} label="Painel Operacional" checked={!!pcpPerms.ordens} onChange={() => togglePcp('ordens')} />
            <MenuToggle icon={Calendar} label="Calendario" checked={!!pcpPerms.agenda} onChange={() => togglePcp('agenda')} />
            <MenuToggle icon={Warehouse} label="Estoque PCP" checked={!!pcpPerms.estoque} onChange={() => togglePcp('estoque')} />
            <MenuToggle icon={Lightbulb} label="Sugestoes de Producao" checked={!!pcpPerms.sugestoes} onChange={() => togglePcp('sugestoes')} />
            <MenuToggle icon={BarChart3} label="Dashboard PCP" checked={!!pcpPerms.sugestoes} onChange={() => togglePcp('sugestoes')} />
            <MenuToggle icon={Tag} label="Etiquetas de Produtos" checked={!!pcpPerms.etiquetas} onChange={() => togglePcp('etiquetas')} />
        </div>
    );

    const secaoRh = (
        <div>
            <CabecalhoSecao sec="rh" />
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">Currículos</p>
            <Toggle
                checked={!!permissoes.Pode_Ver_RH}
                onChange={v => setPermissoes(p => ({ ...p, Pode_Ver_RH: v }))}
                label="Ver Currículos"
                sublabel="Acessa o painel /rh/curriculos e detalhe de candidatos"
                icon={Users}
            />
            {permissoes.Pode_Ver_RH && (
                <Toggle
                    checked={!!permissoes.Pode_Editar_RH}
                    onChange={v => setPermissoes(p => ({ ...p, Pode_Editar_RH: v }))}
                    label="Editar Currículos"
                    sublabel="Pode alterar status, adicionar observações e convidar via WhatsApp"
                    icon={Users}
                />
            )}
            {permissoes.Pode_Editar_RH && (
                <Toggle
                    checked={!!permissoes.Pode_Excluir_RH}
                    onChange={v => setPermissoes(p => ({ ...p, Pode_Excluir_RH: v }))}
                    label="Excluir Currículos"
                    sublabel="Pode excluir permanentemente um currículo e sua foto"
                    icon={Users}
                />
            )}

            <div className="border-t mt-3 pt-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">Ponto &amp; Funcionários</p>
                <Toggle
                    checked={!!permissoes.Pode_Ver_Ponto}
                    onChange={v => setPermissoes(p => ({ ...p, Pode_Ver_Ponto: v }))}
                    label="Ver Ponto e Funcionários"
                    sublabel="Acessa as abas /rh/funcionarios e /rh/ponto e o cartão de ponto"
                    icon={Clock}
                />
                {permissoes.Pode_Ver_Ponto && (
                    <Toggle
                        checked={!!permissoes.Pode_Editar_Ponto}
                        onChange={v => setPermissoes(p => ({ ...p, Pode_Editar_Ponto: v }))}
                        label="Editar Ponto e Funcionários"
                        sublabel="Cadastrar funcionário, documentos/exames, gerar link, ajustar batidas, importar CSV e configurar o geofence"
                        icon={Clock}
                    />
                )}
            </div>
        </div>
    );

    const secaoConfig = (
        <div>
            <CabecalhoSecao sec="config" />
            <MenuToggle icon={Settings} label="Acesso às Configurações" checked={!!permissoes.configuracoes?.view} onChange={() => toggleView('configuracoes')} />
            {permissoes.configuracoes?.view && (
                <Toggle checked={!!permissoes.configuracoes?.edit} onChange={() => toggleEdit('configuracoes')}
                    label="Gerenciar Configurações" sublabel="Pode editar tabelas de preços, bancos, metas, categorias" />
            )}
        </div>
    );

    const SECAO_RENDER = {
        acesso: secaoAcesso, dashboard: secaoDashboard, tarefas: secaoTarefas, vendas: secaoVendas,
        logistica: secaoLogistica, financeiro: secaoFinanceiro, caixa: secaoCaixa, admin: secaoAdmin,
        estoque: secaoEstoque, pcp: secaoPcp, rh: secaoRh, config: secaoConfig,
    };

    // ── vistas especiais: busca / filtros planos / histórico ──
    const vistaBusca = resultadosBusca && (
        <div>
            <p className="text-xs text-gray-500 mb-2">
                <b className="text-gray-800">{resultadosBusca.toggles.length + resultadosBusca.links.length}</b> resultado{resultadosBusca.toggles.length + resultadosBusca.links.length === 1 ? '' : 's'} para
                “<b className="text-gray-800">{busca.trim()}</b>” — o interruptor funciona aqui mesmo.
            </p>
            {listaFiltrada(resultadosBusca.toggles).map(e => <ToggleIndex key={e.path} entry={e} comSecao />)}
            {resultadosBusca.links.map((e, i) => (
                <button key={i} onClick={() => { setBusca(''); setSecAtiva(e.sec); }}
                    className="w-full flex items-center gap-3 text-left p-2.5 rounded-lg hover:bg-gray-50 border border-transparent">
                    <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-gray-800">{e.nome}</span>
                        <p className="text-xs text-gray-500 mt-0.5">{e.desc}</p>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 bg-gray-100 px-2 py-1 rounded-full flex-shrink-0">{nomeSecao(e.sec)}</span>
                </button>
            ))}
            {resultadosBusca.toggles.length + resultadosBusca.links.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">Nada encontrado — tente outra palavra (ex.: "quitar", "senha", "motorista").</p>
            )}
        </div>
    );

    const vistaFiltros = filtrosAtivos && !q && secAtiva !== '__hist' && (
        <div>
            <CabecalhoSecao sec={secAtiva} />
            <p className="text-xs text-gray-500 mb-2">
                Mostrando {soAtivas ? 'só as ativas' : ''}{soAtivas && soRisco ? ' e ' : ''}{soRisco ? 'só a zona de risco' : ''} desta seção.
                Desligue os filtros no topo para ver a seção completa (listas, horários e campos especiais aparecem lá).
            </p>
            {listaFiltrada(BOOL_INDEX.filter(e => e.sec === secAtiva)).map(e => <ToggleIndex key={e.path} entry={e} />)}
            {listaFiltrada(BOOL_INDEX.filter(e => e.sec === secAtiva)).length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">Nada nesta seção com esses filtros.</p>
            )}
        </div>
    );

    const vistaHistorico = secAtiva === '__hist' && !q && (
        <div>
            <div className="mb-3">
                <h4 className="text-base font-bold text-gray-900 flex items-center gap-2"><History className="h-4 w-4 text-primary" /> Histórico de permissões</h4>
                <p className="text-xs text-gray-500 mt-0.5">Cada save que mudou permissões vira uma entrada: quem, quando e o quê. Restaurar re-aplica o estado anterior — nada é apagado (a restauração também entra no histórico ao salvar).</p>
            </div>
            {historico === null ? (
                <p className="text-sm text-gray-400 text-center py-8">Carregando histórico…</p>
            ) : historico.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">Ainda não há mudanças registradas — o histórico começa a contar a partir de agora, a cada save.</p>
            ) : (
                <div className="border-l-2 border-gray-200 ml-2 pl-5 space-y-4">
                    {historico.map((row, i) => {
                        const d = diffHistorico(row);
                        const exp = !!histExpandido[row.id];
                        return (
                            <div key={row.id} className="relative">
                                <span className={`absolute -left-[27px] top-1.5 w-3 h-3 rounded-full border-2 ${i === 0 ? 'bg-primary border-primary' : 'bg-white border-gray-300'}`}></span>
                                <div className={`rounded-xl border p-3.5 ${i === 0 ? 'border-primary/30 bg-mint/20' : 'border-gray-200 bg-white'}`}>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-sm font-bold text-gray-900">{fmtData(row.criadoEm)}</span>
                                        <span className="text-xs text-gray-500">por {row.alteradoPorNome || '—'}</span>
                                        {i === 0 && <span className="text-[9px] font-bold bg-mint text-primaryDark px-2 py-0.5 rounded-full">MAIS RECENTE</span>}
                                    </div>
                                    <div className="flex gap-1.5 flex-wrap mt-2">
                                        {d.ligadas.length > 0 && <span className="text-[11px] font-bold bg-green-100 text-green-800 px-2.5 py-0.5 rounded-full">＋ {d.ligadas.length} ligada{d.ligadas.length > 1 ? 's' : ''}</span>}
                                        {d.desligadas.length > 0 && <span className="text-[11px] font-bold bg-red-100 text-red-700 px-2.5 py-0.5 rounded-full">－ {d.desligadas.length} desligada{d.desligadas.length > 1 ? 's' : ''}</span>}
                                        {d.ligadas.length === 0 && d.desligadas.length === 0 && <span className="text-[11px] font-semibold bg-gray-100 text-gray-500 px-2.5 py-0.5 rounded-full">ajustes em listas/horários/tela</span>}
                                    </div>
                                    {exp && (
                                        <div className="text-xs text-gray-600 mt-2 leading-relaxed">
                                            {d.ligadas.map(e => <span key={e.path} className="inline-block mr-2 text-green-700 font-semibold">＋ {e.nome}</span>)}
                                            {d.desligadas.map(e => <span key={e.path} className="inline-block mr-2 text-red-600 font-semibold">－ {e.nome}</span>)}
                                            {d.ligadas.length === 0 && d.desligadas.length === 0 && <span>Mudanças em campos que não são interruptor (categorias, horários, tela inicial…).</span>}
                                        </div>
                                    )}
                                    <div className="flex gap-2 mt-2.5">
                                        <button onClick={() => setHistExpandido(p => ({ ...p, [row.id]: !exp }))}
                                            className="px-3 py-1 text-[11px] font-bold text-gray-500 hover:text-gray-800 border border-gray-200 rounded-full">
                                            {exp ? 'Esconder' : 'Ver o que mudou'}
                                        </button>
                                        <button onClick={() => restaurarVersao(row)}
                                            className="px-3 py-1 text-[11px] font-bold text-primary border border-primary rounded-full hover:bg-mint/40">
                                            ↩ Voltar como estava antes desta mudança
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );

    const conteudo = q ? vistaBusca : (secAtiva === '__hist' ? vistaHistorico : (filtrosAtivos ? vistaFiltros : SECAO_RENDER[secAtiva]));

    return (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 md:flex md:items-center md:justify-center md:p-4">
            <div className="bg-white w-full h-full md:h-[92vh] md:max-w-5xl md:rounded-2xl shadow-xl flex flex-col overflow-hidden">

                {/* ══ Cabeçalho: usuário + busca ══ */}
                <div className="px-4 md:px-6 py-3 border-b border-gray-200 flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <Shield className="h-5 w-5 text-indigo-600 flex-shrink-0" />
                        <div className="min-w-0">
                            <h3 className="text-base font-bold text-gray-900 truncate">Acessos de {vendedor.nome}</h3>
                            <p className="text-[11px] text-gray-500">{totalAtivas} permissões ativas</p>
                        </div>
                    </div>
                    <div className="relative flex-1 min-w-[200px] order-last md:order-none w-full md:w-auto md:max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            ref={buscaRef}
                            type="text"
                            value={busca}
                            onChange={e => setBusca(e.target.value)}
                            placeholder="Buscar permissão ou o que ela faz… (ex.: quitar, senha, motorista)"
                            className="w-full border border-gray-200 rounded-full pl-9 pr-3 py-2 text-sm bg-gray-50 focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                        />
                    </div>
                    <button onClick={fecharComAviso} className="ml-auto p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 flex-shrink-0">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* ══ Ferramentas: perfis, copiar, filtros, histórico ══ */}
                <div className="px-4 md:px-6 py-2 border-b border-gray-100 bg-gray-50/60 flex items-center gap-2 overflow-x-auto flex-nowrap md:flex-wrap [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <div className="relative flex-shrink-0">
                        <button onClick={() => setPopover(popover === 'perfil' ? null : 'perfil')}
                            className="px-3 py-1.5 text-xs font-bold text-gray-600 hover:text-primary border border-gray-200 hover:border-primary rounded-full bg-white flex items-center gap-1.5 whitespace-nowrap">
                            <Zap className="h-3.5 w-3.5" /> Aplicar perfil rápido
                        </button>
                        {popover === 'perfil' && (
                            <div className="absolute top-full left-0 mt-1.5 z-30 bg-white border border-gray-200 rounded-xl shadow-lg w-72 overflow-hidden">
                                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 px-4 pt-3 pb-1">Marca o conjunto típico da função</p>
                                <p className="text-[10px] text-gray-400 px-4 pb-2">Admin e zona de risco nunca são ligados por perfil. Nada é salvo até clicar em Salvar.</p>
                                {Object.entries(PERFIS).map(([id, p]) => (
                                    <button key={id} onClick={() => aplicarPerfil(id)} className="w-full text-left px-4 py-2.5 hover:bg-mint/30">
                                        <span className="text-sm font-semibold text-gray-800">{p.rotulo}</span>
                                        <p className="text-[11px] text-gray-500">{p.hint}</p>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="relative flex-shrink-0">
                        <button onClick={() => setPopover(popover === 'copiar' ? null : 'copiar')}
                            className="px-3 py-1.5 text-xs font-bold text-primary border border-primary rounded-full bg-white hover:bg-mint/40 flex items-center gap-1.5 whitespace-nowrap">
                            <UsersRound className="h-3.5 w-3.5" /> Copiar de outro usuário
                        </button>
                        {popover === 'copiar' && (
                            <div className="absolute top-full left-0 mt-1.5 z-30 bg-white border border-gray-200 rounded-xl shadow-lg w-80 p-3">
                                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-2">Copiar todas as permissões de…</p>
                                <div className="flex gap-2">
                                    <SelectBusca
                                        className="flex-1"
                                        value={vendedorOrigemId}
                                        onChange={e => setVendedorOrigemId(e.target.value)}
                                    >
                                        <option value="">Selecione um usuário...</option>
                                        {todosVendedores.map(v => (
                                            <option key={v.id} value={v.id}>{v.nome}</option>
                                        ))}
                                    </SelectBusca>
                                    <button
                                        onClick={handleClonar}
                                        disabled={!vendedorOrigemId || clonando}
                                        className="px-3.5 py-2 text-xs font-bold text-white bg-primary hover:bg-primaryDark rounded-full disabled:opacity-50 whitespace-nowrap"
                                    >
                                        {clonando ? 'Copiando...' : 'Copiar'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                    <span className="w-px h-5 bg-gray-200 flex-shrink-0 hidden md:block"></span>
                    <button onClick={() => setSoAtivas(v => !v)}
                        className={`px-3 py-1.5 text-xs font-bold rounded-full border whitespace-nowrap flex-shrink-0 ${soAtivas ? 'bg-house text-white border-house' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}>
                        ✓ Só ativas
                    </button>
                    <button onClick={() => setSoRisco(v => !v)}
                        className={`px-3 py-1.5 text-xs font-bold rounded-full border whitespace-nowrap flex-shrink-0 ${soRisco ? 'bg-house text-white border-house' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}>
                        ⚠ Zona de risco
                    </button>
                    <span className="w-px h-5 bg-gray-200 flex-shrink-0 hidden md:block"></span>
                    <button onClick={abrirHistorico}
                        className={`px-3 py-1.5 text-xs font-bold rounded-full border whitespace-nowrap flex-shrink-0 flex items-center gap-1.5 ${secAtiva === '__hist' ? 'bg-house text-white border-house' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}>
                        <History className="h-3.5 w-3.5" /> Histórico
                    </button>
                </div>

                {/* ══ Navegação mobile: chips ══ */}
                <div className="md:hidden px-3 py-2 border-b border-gray-100 flex gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {SECOES.map(s => (
                        <button key={s.id} onClick={() => { setSecAtiva(s.id); setBusca(''); }}
                            className={`px-3 py-1.5 text-xs font-bold rounded-full whitespace-nowrap flex-shrink-0 border ${secAtiva === s.id ? 'bg-mint text-primaryDark border-primary/30' : 'bg-white text-gray-500 border-gray-200'}`}>
                            {s.nome} · {contagemSecao(s.id)}
                        </button>
                    ))}
                </div>

                {/* ══ Corpo: rail + conteúdo ══ */}
                <div className="flex flex-1 min-h-0">
                    <nav className="hidden md:block w-56 flex-shrink-0 border-r border-gray-100 bg-gray-50/60 overflow-y-auto py-3 px-2.5">
                        {SECOES.map(s => {
                            const Icon = s.icon;
                            const n = contagemSecao(s.id);
                            const ativo = secAtiva === s.id && !q;
                            return (
                                <button key={s.id} onClick={() => { setSecAtiva(s.id); setBusca(''); }}
                                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-[13px] transition-colors ${ativo ? 'bg-mint text-primaryDark font-bold' : 'text-gray-600 font-medium hover:bg-gray-100'}`}>
                                    <Icon className={`h-4 w-4 flex-shrink-0 ${ativo ? 'text-primaryDark' : 'text-gray-400'}`} />
                                    <span className="flex-1 truncate">{s.nome}</span>
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${ativo ? 'bg-white border-primary/20 text-primaryDark' : n > 0 ? 'bg-white border-gray-200 text-gray-500' : 'bg-transparent border-transparent text-gray-300'}`}>{n}</span>
                                </button>
                            );
                        })}
                    </nav>
                    <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4">
                        {conteudo}
                    </div>
                </div>

                {/* ══ Rodapé ══ */}
                <div className="px-4 md:px-6 py-3 border-t border-gray-200 flex items-center gap-3 bg-gray-50">
                    <span className="text-xs text-gray-500 min-w-0 truncate">
                        {dirty
                            ? <b className="text-amber-600">● {numBoolAlterados > 0 ? `${numBoolAlterados} interruptor${numBoolAlterados > 1 ? 'es' : ''} alterado${numBoolAlterados > 1 ? 's' : ''}` : 'alterações pendentes'} — não salvas</b>
                            : 'Nenhuma alteração pendente'}
                    </span>
                    <div className="flex-1"></div>
                    <button onClick={fecharComAviso}
                        className="px-4 py-2 border border-gray-300 rounded-full shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
                        Cancelar
                    </button>
                    <button onClick={handleSave} disabled={saving}
                        className="inline-flex items-center px-5 py-2 rounded-full shadow-sm text-sm font-semibold text-white bg-primary hover:bg-primaryDark disabled:opacity-50">
                        <Save className="h-4 w-4 mr-2" />
                        {saving ? 'Salvando…' : 'Salvar'}
                    </button>
                </div>
            </div>

            {/* fecha popovers ao clicar fora */}
            {popover && <div className="fixed inset-0 z-20" onClick={() => setPopover(null)}></div>}
        </div>
    );
};

export default PermissoesModal;
