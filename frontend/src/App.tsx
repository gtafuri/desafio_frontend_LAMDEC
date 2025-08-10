import React, { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts'

const API_BASE = '' // proxied by Vite to http://localhost:8000

// ---------------------- UI Helpers ---------------------- //

const formatPct = (v: number) => `${v.toFixed(2)}%`
const formatInt = (v: number) => v.toLocaleString('pt-BR')
const formatCurrency = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
const formatCurrencyMagnitude = (v: number) => {
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  const nf = (n: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 0 }).format(n)
  if (abs >= 1_000_000_000_000) return `${sign}R$ ${nf(abs / 1_000_000_000_000)} trilhões`
  if (abs >= 1_000_000_000) return `${sign}R$ ${nf(abs / 1_000_000_000)} bilhões`
  if (abs >= 1_000_000) {
    const q = abs / 1_000_000
    const word = q >= 2 ? 'milhões' : 'milhão'
    return `${sign}R$ ${nf(q)} ${word}`
  }
  if (abs >= 1_000) return `${sign}R$ ${nf(abs / 1_000)} mil`
  return formatCurrency(v)
}
const formatNumberMagnitude = (v: number) => {
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  const nf = (n: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 0 }).format(n)
  if (abs >= 1_000_000_000_000) return `${sign}${nf(abs / 1_000_000_000_000)} trilhões`
  if (abs >= 1_000_000_000) return `${sign}${nf(abs / 1_000_000_000)} bilhões`
  if (abs >= 1_000_000) {
    const q = abs / 1_000_000
    const word = q >= 2 ? 'milhões' : 'milhão'
    return `${sign}${nf(q)} ${word}`
  }
  if (abs >= 1_000) return `${sign}${nf(abs / 1_000)} mil`
  return new Intl.NumberFormat('pt-BR').format(v)
}

function Section(props: { title: string; actions?: React.ReactNode; children: React.ReactNode; onBodyClick?: () => void }) {
  return (
    <section className="card">
      <div className="card-header">
        <h2>{props.title}</h2>
        <div className="card-actions">{props.actions}</div>
      </div>
      <div className="card-body" onClick={props.onBodyClick}>{props.children}</div>
    </section>
  )
}

function Modal(props: { open: boolean; title?: string; onClose: () => void; children: React.ReactNode }) {
  if (!props.open) return null
  return (
    <div className="modal-overlay" onClick={props.onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{props.title}</h3>
          <button className="modal-close" onClick={props.onClose}>×</button>
        </div>
        <div className="modal-body">{props.children}</div>
      </div>
    </div>
  )
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#aa66cc', '#ff4d4f']

function trimLeadingZerosByKey<T extends Record<string, any>>(arr: T[], numericKey: string): T[] {
  const idx = arr.findIndex(item => Number(item?.[numericKey] ?? 0) > 0)
  return idx > 0 ? arr.slice(idx) : arr
}

// ---------------------- Resumo Dashboard ---------------------- //

function Resumos() {
  const [inscricoes, setInscricoes] = useState<any[]>([])
  const [inscricoesCanceladas, setInscricoesCanceladas] = useState<any[]>([])
  const [inscricoesQuitadas, setInscricoesQuitadas] = useState<any[]>([])
  const [montanteAcumulado, setMontanteAcumulado] = useState<any[]>([])
  const [quantidadeCdas, setQuantidadeCdas] = useState<any[]>([])
  const [saldoCdas, setSaldoCdas] = useState<any[]>([])
  const [distribuicaoCdas, setDistribuicaoCdas] = useState<any[]>([])
  const [qtdEmCobrancaTotal, setQtdEmCobrancaTotal] = useState<number | null>(null)

  // UI toggles
  const [qtdModo, setQtdModo] = useState<'percentual' | 'absoluto'>('percentual')
  const [saldoModo, setSaldoModo] = useState<'percentual' | 'absoluto'>('percentual')
  const [serieInscricao, setSerieInscricao] = useState<'Inscritas' | 'Canceladas' | 'Quitadas'>('Inscritas')

  // Modal
  const [modalOpen, setModalOpen] = useState(false)
  const [modalTitle, setModalTitle] = useState<string>('')
  const [modalKey, setModalKey] = useState<null | 'pareto' | 'qtd' | 'saldo' | 'dist' | 'serie'>(null)

  useEffect(() => {
    function onEsc(e: KeyboardEvent){ if(e.key === 'Escape') setModalOpen(false) }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [])

  useEffect(() => {
    async function fetchAll() {
      const [i, ic, iq, ma, qc, sc, dc] = await Promise.all([
        axios.get(`${API_BASE}/resumo/inscricoes`),
        axios.get(`${API_BASE}/resumo/inscricoes_canceladas`),
        axios.get(`${API_BASE}/resumo/inscricoes_quitadas`),
        axios.get(`${API_BASE}/resumo/montante_acumulado`),
        axios.get(`${API_BASE}/resumo/quantidade_cdas`),
        axios.get(`${API_BASE}/resumo/saldo_cdas`),
        axios.get(`${API_BASE}/resumo/distribuicao_cdas`),
      ])
      setInscricoes(i.data)
      setInscricoesCanceladas(ic.data)
      setInscricoesQuitadas(iq.data)
      setMontanteAcumulado(ma.data)
      setQuantidadeCdas(qc.data)
      setSaldoCdas(sc.data)
      setDistribuicaoCdas(dc.data)

      // fetch total of CDAs em cobrança directly from API (accurate)
      try {
        const totalRes = await axios.get(`${API_BASE}/kpis/volume_em_cobranca`)
        setQtdEmCobrancaTotal(totalRes.data.total)
      } catch (e) {
        // ignore and keep fallback
      }
    }
    fetchAll()
  }, [])

  const montanteKeys = useMemo(() => {
    if (!montanteAcumulado.length) return [] as string[]
    return Object.keys(montanteAcumulado[0]).filter((k) => k !== 'Percentual')
  }, [montanteAcumulado])

  const inscricoesTrim = useMemo(() => trimLeadingZerosByKey(inscricoes, 'Quantidade'), [inscricoes])
  const canceladasTrim = useMemo(() => trimLeadingZerosByKey(inscricoesCanceladas, 'Quantidade'), [inscricoesCanceladas])
  const quitadasTrim = useMemo(() => trimLeadingZerosByKey(inscricoesQuitadas, 'Quantidade'), [inscricoesQuitadas])

  const pieQuantidadePercent = useMemo(() => {
    const total = quantidadeCdas.reduce((s, x) => s + Number(x.Quantidade || 0), 0)
    return quantidadeCdas.map((x) => ({ ...x, pct: total ? (x.Quantidade / total) * 100 : 0 }))
  }, [quantidadeCdas])

  const pieSaldoPercent = useMemo(() => {
    const total = saldoCdas.reduce((s, x) => s + Number(x.Saldo || 0), 0)
    return saldoCdas.map((x) => ({ ...x, pct: total ? (x.Saldo / total) * 100 : 0 }))
  }, [saldoCdas])

  const saldoTotal = useMemo(() => saldoCdas.reduce((s, x) => s + Number(x.Saldo || 0), 0), [saldoCdas])
  const qtdTotal = useMemo(() => quantidadeCdas.reduce((s, x) => s + Number(x.Quantidade || 0), 0), [quantidadeCdas])

  const serieAtual = useMemo(() => {
    if (serieInscricao === 'Canceladas') return canceladasTrim
    if (serieInscricao === 'Quitadas') return quitadasTrim
    return inscricoesTrim
  }, [serieInscricao, inscricoesTrim, canceladasTrim, quitadasTrim])

  // Chart components (reusable in modal)
  const ParetoChart = ({height=260}:{height?:number|string}) => (
    <div style={{width:'100%', height: height}}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={montanteAcumulado} margin={{ left: 8, right: 8, top: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="Percentual" tickFormatter={(v) => `${v}%`} />
          <YAxis unit="%" />
          <Tooltip />
          <Legend />
          {montanteKeys.map((key, i) => (
            <Line key={key} type="monotone" dataKey={key} stroke={COLORS[i % COLORS.length]} dot={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )

  const QuantidadePie = ({height=260}:{height?:number|string}) => (
    <div style={{width:'100%', height: height}}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          {qtdModo === 'percentual' ? (
            <>
              <Pie data={pieQuantidadePercent} dataKey="pct" nameKey="name" outerRadius={'70%'} label={(p:any)=>formatPct(p.value)} labelLine={false}>
                {pieQuantidadePercent.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v:any, n:any)=>[formatPct(Number(v)), n]} />
            </>
          ) : (
            <>
              <Pie data={quantidadeCdas} dataKey="Quantidade" nameKey="name" outerRadius={'70%'} label={(p:any)=>formatInt(p.value)} labelLine={false}>
                {quantidadeCdas.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v:any, n:any)=>[formatInt(Number(v)), n]} />
            </>
          )}
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )

  const SaldoPie = ({height=260}:{height?:number|string}) => (
    <div style={{width:'100%', height: height}}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          {saldoModo === 'percentual' ? (
            <>
              <Pie data={pieSaldoPercent} dataKey="pct" nameKey="name" outerRadius={'70%'} label={(p:any)=>formatPct(p.value)} labelLine={false}>
                {pieSaldoPercent.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v:any, n:any)=>[formatPct(Number(v)), n]} />
            </>
          ) : (
            <>
              <Pie data={saldoCdas} dataKey="Saldo" nameKey="name" outerRadius={'70%'} label={(p:any)=>formatCurrency(p.value)} labelLine={false}>
                {saldoCdas.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v:any, n:any)=>[formatCurrency(Number(v)), n]} />
            </>
          )}
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )

  const DistribuicaoBar = ({height=260}:{height?:number|string}) => (
    <div style={{width:'100%', height: height}}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={distribuicaoCdas}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis unit="%" />
          <Tooltip />
          <Legend />
          <Bar dataKey="Em cobrança" stackId="a" fill="#0088FE" />
          <Bar dataKey="Cancelada" stackId="a" fill="#ff4d4f" />
          <Bar dataKey="Quitada" stackId="a" fill="#00C49F" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )

  const SerieLine = ({height=260}:{height?:number|string}) => (
    <div style={{width:'100%', height: height}}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={serieAtual} margin={{ left: 8, right: 8, top: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="ano" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="Quantidade" stroke="#16a34a" dot={{ r: 2 }} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )

  const SerieModal = () => (
    <div style={{width:'100%', height:'100%', display:'flex', flexDirection:'column'}}>
      <div className="tabs" style={{marginBottom:'0.5rem', alignSelf:'flex-start'}}>
        {(['Inscritas', 'Canceladas', 'Quitadas'] as const).map(t => (
          <button key={t} className={serieInscricao === t ? 'active' : ''} onClick={() => setSerieInscricao(t)}>{t}</button>
        ))}
      </div>
      <div style={{flex:'1 1 0%', minHeight:0, minWidth:0}}>
        <SerieLine height={'100%'} />
      </div>
    </div>
  )

  // Click handlers to open modal
  const openModal = (title: string, key: 'pareto' | 'qtd' | 'saldo' | 'dist' | 'serie') => {
    setModalTitle(title)
    setModalKey(key)
    setModalOpen(true)
  }

  return (
    <>
      <div className="grid grid-3">
        <Section title="Diagrama de Pareto do saldo de CDAs" onBodyClick={() => openModal('Diagrama de Pareto do saldo de CDAs', 'pareto')}>
          <div className="chart-clickable">
            <ParetoChart />
          </div>
        </Section>

        <Section
          title="Quantidade de CDAs em cobrança"
          actions={(
            <div className="tabs" onClick={(e) => e.stopPropagation()}>
              <button className={qtdModo === 'percentual' ? 'active' : ''} onClick={() => setQtdModo('percentual')}>Percentual</button>
              <button className={qtdModo === 'absoluto' ? 'active' : ''} onClick={() => setQtdModo('absoluto')}>Absoluto</button>
            </div>
          )}
          onBodyClick={() => openModal('Quantidade de CDAs em cobrança', 'qtd')}
        >
          <div className="chart-clickable">
            <QuantidadePie />
          </div>
        </Section>

        <Section
          title="Saldo atualizado de CDAs em cobrança"
          actions={(
            <div className="tabs" onClick={(e) => e.stopPropagation()}>
              <button className={saldoModo === 'percentual' ? 'active' : ''} onClick={() => setSaldoModo('percentual')}>Percentual</button>
              <button className={saldoModo === 'absoluto' ? 'active' : ''} onClick={() => setSaldoModo('absoluto')}>Absoluto</button>
            </div>
          )}
          onBodyClick={() => openModal('Saldo atualizado de CDAs em cobrança', 'saldo')}
        >
          <div className="chart-clickable">
            <SaldoPie />
          </div>
        </Section>

        <Section title="Percentual de CDAs por situação" onBodyClick={() => openModal('Percentual de CDAs por situação', 'dist')}>
          <div className="chart-clickable">
            <DistribuicaoBar />
          </div>
        </Section>

        <section className="kpis">
          <div className="kpi">
            <div className="kpi-icon">$</div>
            <div className="kpi-value">{formatCurrencyMagnitude(saldoTotal)}</div>
            <div className="kpi-label">Saldo atualizado em cobrança</div>
          </div>
          <div className="kpi">
            <div className="kpi-icon">𐄷</div>
            <div className="kpi-value">{formatNumberMagnitude((qtdEmCobrancaTotal ?? qtdTotal))}</div>
            <div className="kpi-label">Volume de CDAs em cobrança</div>
          </div>
        </section>

        <Section
          title="Inscrições na dívida ativa por ano"
          actions={(
            <div className="tabs" onClick={(e) => e.stopPropagation()}>
              {(['Inscritas', 'Canceladas', 'Quitadas'] as const).map(t => (
                <button key={t} className={serieInscricao === t ? 'active' : ''} onClick={() => setSerieInscricao(t)}>{t}</button>
              ))}
            </div>
          )}
          onBodyClick={() => openModal('Inscrições na dívida ativa por ano', 'serie')}
        >
          <div className="chart-clickable">
            <SerieLine />
          </div>
        </Section>
      </div>

      <Modal open={modalOpen} title={modalTitle} onClose={() => { setModalOpen(false); setModalKey(null) }}>
        <div className="modal-content-wrapper">
          {modalKey === 'pareto' && <ParetoChart height={'100%'} />}
          {modalKey === 'qtd' && <QuantidadePie height={'100%'} />}
          {modalKey === 'saldo' && <SaldoPie height={'100%'} />}
          {modalKey === 'dist' && <DistribuicaoBar height={'100%'} />}
          {modalKey === 'serie' && <SerieModal />}
        </div>
      </Modal>
    </>
  )
}

// ---------------------- Busca CDA ---------------------- //

export type SortField = 'saldo' | 'ano' | 'score'
export type Direction = 'asc' | 'desc'

function BuscaCDA() {
  const [q, setQ] = useState('')
  const [natureza, setNatureza] = useState<string[]>([])
  const [situacao, setSituacao] = useState<string[]>([])
  const [minAno, setMinAno] = useState<number | ''>('')
  const [maxAno, setMaxAno] = useState<number | ''>('')
  const [minSaldo, setMinSaldo] = useState<number | ''>('')
  const [maxSaldo, setMaxSaldo] = useState<number | ''>('')
  const [minScore, setMinScore] = useState<number | ''>('')
  const [maxScore, setMaxScore] = useState<number | ''>('')
  const [sortBy, setSortBy] = useState<SortField>('saldo')
  const [sortDir, setSortDir] = useState<Direction>('desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const [items, setItems] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)

  const naturezas = ['IPTU', 'ISS', 'ITBI', 'Taxas', 'Multas', 'Outras']
  const situacoes = ['Cancelada', 'Em cobrança', 'Quitada']

  async function buscar() {
    setLoading(true)
    const params: Record<string, any> = {
      q: q || undefined,
      natureza: natureza.length ? natureza : undefined,
      situacao: situacao.length ? situacao : undefined,
      min_ano: minAno === '' ? undefined : minAno,
      max_ano: maxAno === '' ? undefined : maxAno,
      min_saldo: minSaldo === '' ? undefined : minSaldo,
      max_saldo: maxSaldo === '' ? undefined : maxSaldo,
      min_score: minScore === '' ? undefined : minScore,
      max_score: maxScore === '' ? undefined : maxScore,
      sort_by: sortBy,
      sort_dir: sortDir,
      page,
      page_size: pageSize,
    }
    const res = await axios.get(`${API_BASE}/cda/search`, { params })
    setItems(res.data.items)
    setTotal(res.data.total)
    setLoading(false)
  }

  useEffect(() => {
    buscar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy, sortDir, page, pageSize])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div>
      <div className="filters">
        <input placeholder="Buscar por numCDA" value={q} onChange={(e) => setQ(e.target.value)} />

        <select multiple value={natureza} onChange={(e) => setNatureza(Array.from(e.target.selectedOptions).map(o => o.value))}>
          {naturezas.map(n => <option key={n} value={n}>{n}</option>)}
        </select>

        <select multiple value={situacao} onChange={(e) => setSituacao(Array.from(e.target.selectedOptions).map(o => o.value))}>
          {situacoes.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <input type="number" placeholder="Min ano" value={minAno} onChange={e => setMinAno(e.target.value === '' ? '' : Number(e.target.value))} />
        <input type="number" placeholder="Max ano" value={maxAno} onChange={e => setMaxAno(e.target.value === '' ? '' : Number(e.target.value))} />
        <input type="number" placeholder="Min saldo" value={minSaldo} onChange={e => setMinSaldo(e.target.value === '' ? '' : Number(e.target.value))} />
        <input type="number" placeholder="Max saldo" value={maxSaldo} onChange={e => setMaxSaldo(e.target.value === '' ? '' : Number(e.target.value))} />
        <input type="number" step="0.01" placeholder="Min score" value={minScore} onChange={e => setMinScore(e.target.value === '' ? '' : Number(e.target.value))} />
        <input type="number" step="0.01" placeholder="Max score" value={maxScore} onChange={e => setMaxScore(e.target.value === '' ? '' : Number(e.target.value))} />

        <select value={sortBy} onChange={e => setSortBy(e.target.value as SortField)}>
          <option value="saldo">Saldo</option>
          <option value="ano">Ano</option>
          <option value="score">Score</option>
        </select>
        <select value={sortDir} onChange={e => setSortDir(e.target.value as Direction)}>
          <option value="asc">Asc</option>
          <option value="desc">Desc</option>
        </select>

        <button onClick={() => { setPage(1); buscar() }}>Buscar</button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>numCDA</th>
              <th>Natureza</th>
              <th>Situação</th>
              <th>Idade (anos)</th>
              <th>Saldo</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6}>Carregando...</td></tr>
            ) : items.map(row => (
              <tr key={row.numCDA}>
                <td>{row.numCDA}</td>
                <td>{row.natureza}</td>
                <td>{row.agrupamento_situacao === -1 ? 'Cancelada' : row.agrupamento_situacao === 0 ? 'Em cobrança' : 'Quitada'}</td>
                <td>{row.qtde_anos_idade_cda}</td>
                <td>{formatCurrency(row.valor_saldo_atualizado)}</td>
                <td>{row.score.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Anterior</button>
        <span>{page} / {totalPages}</span>
        <button disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Próxima</button>

        <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}>
          {[10, 20, 50, 100, 200].map(s => <option key={s} value={s}>{s}/página</option>)}
        </select>
      </div>
    </div>
  )
}

// ---------------------- App ---------------------- //

export function App() {
  const [tab, setTab] = useState<'resumos' | 'busca'>('resumos')
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (localStorage.getItem('theme') as any) || 'dark')
  const [themeIconOk, setThemeIconOk] = useState(true)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  return (
    <div className="container">
      <header>
        <h1>Dashboard LAMDEC</h1>
        <nav>
          <button className={tab === 'resumos' ? 'active' : ''} onClick={() => setTab('resumos')}>Resumos</button>
          <button className={tab === 'busca' ? 'active' : ''} onClick={() => setTab('busca')}>Busca CDA</button>
        </nav>
        <div className="theme-toggle">
          <button aria-label="Alternar tema" title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'} onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}>
            {themeIconOk ? (
              <img src="/icons/theme.png" alt="Tema" onError={() => setThemeIconOk(false)} />
            ) : (
              <span>{theme === 'dark' ? '☀️' : '🌙'}</span>
            )}
          </button>
        </div>
      </header>
      {tab === 'resumos' ? <Resumos /> : <BuscaCDA />}
      <footer>
        <small>Feito com React + Recharts</small>
      </footer>
    </div>
  )
} 