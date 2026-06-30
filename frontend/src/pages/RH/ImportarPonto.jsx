import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText, Loader2, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import funcionarioService from '../../services/funcionarioService';

// Normaliza data para YYYY-MM-DD (aceita DD/MM/AAAA, AAAA-MM-DD, DD.MM.AAAA)
function normalizarData(s) {
  if (!s) return '';
  const t = String(s).trim().split(' ')[0];
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{2})[\/.](\d{2})[\/.](\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return '';
}
function normalizarHora(s) {
  if (!s) return '';
  const m = String(s).trim().match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
}

function parseCSV(texto) {
  const linhas = texto.split(/\r?\n/).filter(l => l.trim());
  if (!linhas.length) return { header: [], rows: [] };
  const delim = (linhas[0].match(/;/g) || []).length > (linhas[0].match(/,/g) || []).length ? ';' : ',';
  const split = (l) => l.split(delim).map(c => c.trim().replace(/^"|"$/g, ''));
  const header = split(linhas[0]);
  const rows = linhas.slice(1).map(split);
  return { header, rows };
}

export default function ImportarPonto() {
  const navigate = useNavigate();
  const [parsed, setParsed] = useState(null);
  const [nomeArq, setNomeArq] = useState('');
  const [map, setMap] = useState({ identificacao: '', data: '', hora: '', tipo: '' });
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState(null);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNomeArq(file.name);
    const texto = await file.text();
    const p = parseCSV(texto);
    setParsed(p);
    setResultado(null);
    // auto-mapeamento por nome de coluna
    const acha = (...alvos) => p.header.findIndex(h => alvos.some(a => h.toLowerCase().includes(a)));
    setMap({
      identificacao: String(acha('cpf', 'matr', 'pis') >= 0 ? acha('cpf', 'matr', 'pis') : 0),
      data: String(acha('data') >= 0 ? acha('data') : ''),
      hora: String(acha('hora') >= 0 ? acha('hora') : ''),
      tipo: String(acha('tipo', 'sentido', 'e/s') >= 0 ? acha('tipo', 'sentido', 'e/s') : '')
    });
  };

  const linhasPreview = parsed ? parsed.rows.map((r) => ({
    identificacao: map.identificacao !== '' ? r[+map.identificacao] : '',
    data: normalizarData(map.data !== '' ? r[+map.data] : ''),
    hora: normalizarHora(map.hora !== '' ? r[+map.hora] : ''),
    tipo: map.tipo !== '' ? (r[+map.tipo] || '') : ''
  })).filter(l => l.identificacao && l.data && l.hora) : [];

  const importar = async () => {
    if (!linhasPreview.length) { toast.error('Nada válido para importar. Confira o mapeamento.'); return; }
    setImportando(true);
    try {
      const r = await funcionarioService.importarPonto(linhasPreview);
      setResultado(r);
      toast.success(`${r.importadas} batidas importadas!`);
    } catch (e) { toast.error(e?.response?.data?.erro || 'Erro ao importar.'); }
    finally { setImportando(false); }
  };

  const Col = ({ campo, label, obrig }) => (
    <label className="block">
      <span className="text-sm font-medium text-gray-700">{label}{obrig && ' *'}</span>
      <select value={map[campo]} onChange={(e) => setMap(m => ({ ...m, [campo]: e.target.value }))} className="mt-1 w-full border border-gray-300 rounded px-2 py-2 text-sm">
        <option value="">— não usar —</option>
        {parsed.header.map((h, i) => <option key={i} value={i}>{h || `coluna ${i + 1}`}</option>)}
      </select>
    </label>
  );

  return (
    <div className="max-w-3xl mx-auto p-3 md:p-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="bg-sky-100 p-2 rounded-lg"><Upload className="h-5 w-5 text-sky-600" /></div>
        <h1 className="text-lg md:text-2xl font-bold text-gray-900">Importar ponto (CSV)</h1>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        {/* passo 1 */}
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100"><span className="text-xs font-bold uppercase tracking-widest text-gray-600">1 · Enviar a planilha</span></div>
        <div className="p-5">
          <label className="block border-2 border-dashed border-gray-300 rounded-lg text-center py-8 bg-gray-50 cursor-pointer hover:bg-gray-100">
            <FileText className="h-8 w-8 text-gray-400 mx-auto" />
            <p className="text-sm font-semibold text-gray-700 mt-2">{nomeArq || 'Selecione o arquivo .csv'}</p>
            <p className="text-xs text-gray-400">exportado pelo software do relógio (Excel → Salvar como CSV)</p>
            <input type="file" accept=".csv,text/csv,text/plain" hidden onChange={onFile} />
          </label>
          {parsed && <p className="text-xs text-green-700 font-semibold mt-2">✓ {parsed.rows.length} linhas lidas</p>}
        </div>

        {parsed && (
          <>
            {/* passo 2 */}
            <div className="flex items-center gap-2 px-5 py-3.5 border-t border-b border-gray-100"><span className="text-xs font-bold uppercase tracking-widest text-gray-600">2 · Mapear as colunas</span></div>
            <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-3">
              <Col campo="identificacao" label="CPF/Matrícula" obrig />
              <Col campo="data" label="Data" obrig />
              <Col campo="hora" label="Hora" obrig />
              <Col campo="tipo" label="Tipo (opcional)" />
            </div>
            <p className="px-5 -mt-2 pb-3 text-xs text-gray-500">Sem coluna de tipo, o sistema alterna Entrada/Saída pela ordem das batidas do dia.</p>

            {/* passo 3 */}
            <div className="flex items-center gap-2 px-5 py-3.5 border-t border-b border-gray-100"><span className="text-xs font-bold uppercase tracking-widest text-gray-600">3 · Conferir e importar</span></div>
            <div className="p-5">
              <p className="text-sm text-gray-600 mb-3"><b>{linhasPreview.length}</b> linhas válidas (com CPF, data e hora). Duplicadas serão ignoradas automaticamente.</p>
              <div className="overflow-x-auto border border-gray-200 rounded-lg max-h-64">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50"><tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Identificação</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Data</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Hora</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Tipo</th>
                  </tr></thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {linhasPreview.slice(0, 50).map((l, i) => (
                      <tr key={i}><td className="px-3 py-1.5 tabular-nums">{l.identificacao}</td><td className="px-3 py-1.5 tabular-nums">{l.data}</td><td className="px-3 py-1.5 tabular-nums">{l.hora}</td><td className="px-3 py-1.5">{l.tipo || 'auto'}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {resultado ? (
                <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4 text-sm">
                  <p className="font-semibold text-green-800 flex items-center gap-1"><Check className="h-4 w-4" /> Importação concluída</p>
                  <p className="text-green-700 mt-1">{resultado.importadas} importadas · {resultado.duplicadas} já existiam · {resultado.semFuncionario} sem funcionário (CPF não encontrado).</p>
                  <button onClick={() => navigate('/rh/ponto')} className="mt-2 text-primary font-semibold text-sm">Ir para o painel de ponto →</button>
                </div>
              ) : (
                <div className="mt-4 flex justify-end gap-2">
                  <button onClick={() => navigate('/rh/funcionarios')} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md font-medium text-sm">Cancelar</button>
                  <button onClick={importar} disabled={importando} className="px-4 py-2 bg-primary hover:bg-blue-700 text-white rounded-md font-semibold text-sm disabled:opacity-60 inline-flex items-center gap-1">{importando && <Loader2 className="h-4 w-4 animate-spin" />} Importar {linhasPreview.length} batidas</button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
