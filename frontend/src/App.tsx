import { BarChart3, CalendarDays, ChevronLeft, ChevronRight, LogOut, Table2 } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { AparenciaMenu } from './components/AparenciaMenu'
import { api, auth } from './lib/api'
import { toast } from './lib/alerta'
import { useVerificarVencimentos } from './lib/lembretes'
import { MESES } from './lib/money'
import { Login } from './pages/Login'
import { Planilha } from './pages/Planilha'

// Os gráficos só são baixados quando a visão anual é aberta
const Anual = lazy(() => import('./pages/Anual').then((m) => ({ default: m.Anual })))

type Visao = 'mes' | 'ano'
interface Rota {
  visao: Visao
  ano: number
  mes: number
}

// A rota fica no endereço (#/mes/2024-08 ou #/ano/2024) para sobreviver ao F5
function lerRota(): Rota {
  const hoje = new Date()
  const padrao: Rota = { visao: 'mes', ano: hoje.getFullYear(), mes: hoje.getMonth() + 1 }
  const m = location.hash.match(/^#\/(mes|ano)\/(\d{4})(?:-(\d{1,2}))?/)
  if (!m) return padrao
  const mes = Number(m[3] ?? padrao.mes)
  return { visao: m[1] as Visao, ano: Number(m[2]), mes: mes >= 1 && mes <= 12 ? mes : padrao.mes }
}

function escreverRota(r: Rota) {
  location.hash = r.visao === 'mes' ? `/mes/${r.ano}-${String(r.mes).padStart(2, '0')}` : `/ano/${r.ano}`
}

export default function App() {
  const [logado, setLogado] = useState(!!auth.token())
  const [rota, setRota] = useState(lerRota)

  useEffect(() => {
    const sair = () => setLogado(false)
    const hash = () => setRota(lerRota())
    window.addEventListener('auth:sair', sair)
    window.addEventListener('hashchange', hash)
    return () => {
      window.removeEventListener('auth:sair', sair)
      window.removeEventListener('hashchange', hash)
    }
  }, [])

  useVerificarVencimentos(logado)

  const avisar = useCallback((texto: string, tipo: 'ok' | 'erro' = 'ok') => toast(texto, tipo), [])

  if (!logado) return <Login entrou={() => setLogado(true)} />

  const ir = (r: Partial<Rota>) => escreverRota({ ...rota, ...r })

  function mover(passo: number) {
    if (rota.visao === 'ano') return ir({ ano: rota.ano + passo })
    const d = new Date(rota.ano, rota.mes - 1 + passo, 1)
    ir({ ano: d.getFullYear(), mes: d.getMonth() + 1 })
  }

  async function sair() {
    await api.post('/logout').catch(() => {})
    auth.limpar()
    setLogado(false)
  }

  const hoje = new Date()
  const ehHoje = rota.visao === 'mes' ? rota.ano === hoje.getFullYear() && rota.mes === hoje.getMonth() + 1 : rota.ano === hoje.getFullYear()

  return (
    <div className="flex min-h-screen flex-col lg:h-screen">
      <header className="sticky top-0 z-20 shrink-0 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] md:px-4 md:py-2.5">
          <div className="flex items-center gap-2 font-bold text-slate-900">
            <span className="rounded-lg bg-green-600 p-1.5 text-white">
              <BarChart3 size={18} />
            </span>
            <span className="hidden sm:inline">Financeiro</span>
          </div>

          <nav className="ml-auto flex rounded-lg bg-slate-100 p-0.5 text-sm font-medium md:ml-0">
            {(
              [
                ['mes', 'Mês', <Table2 size={15} key="m" />],
                ['ano', 'Ano', <CalendarDays size={15} key="a" />],
              ] as const
            ).map(([v, nome, icone]) => (
              <button
                key={v}
                onClick={() => ir({ visao: v })}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 ${rota.visao === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                {icone} {nome}
              </button>
            ))}
          </nav>

          <div className="mx-auto flex min-w-0 items-center gap-1 max-md:order-last max-md:w-full max-md:justify-between">
            <button onClick={() => mover(-1)} className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 max-md:p-2.5" title="Anterior" aria-label="Mês anterior">
              <ChevronLeft size={20} />
            </button>
            <label className="relative min-w-44 cursor-pointer rounded-lg px-3 py-1 text-center text-lg font-bold capitalize max-md:min-w-0 max-md:flex-1 text-slate-900 hover:bg-slate-100">
              {rota.visao === 'mes' ? `${MESES[rota.mes - 1]} / ${rota.ano}` : rota.ano}
              {rota.visao === 'mes' && (
                <input
                  type="month"
                  value={`${rota.ano}-${String(rota.mes).padStart(2, '0')}`}
                  onChange={(e) => {
                    const [a, m] = e.target.value.split('-').map(Number)
                    if (a && m) ir({ ano: a, mes: m })
                  }}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  title="Escolher mês"
                />
              )}
            </label>
            <button onClick={() => mover(1)} className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 max-md:p-2.5" title="Próximo" aria-label="Próximo mês">
              <ChevronRight size={20} />
            </button>
            {!ehHoje && (
              <button
                onClick={() => ir({ ano: hoje.getFullYear(), mes: hoje.getMonth() + 1 })}
                className="ml-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Hoje
              </button>
            )}
          </div>

          <AparenciaMenu />

          <button onClick={sair} aria-label="Sair" className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800" title="Sair">
            <LogOut size={16} /> <span className="hidden sm:inline">Sair</span>
          </button>
        </div>
      </header>

      <main className={`w-full flex-1 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:min-h-0 lg:overflow-y-auto ${rota.visao === 'ano' ? 'mx-auto max-w-[1800px]' : ''}`}>
        {rota.visao === 'mes' ? (
          <Planilha key={`${rota.ano}-${rota.mes}`} ano={rota.ano} mes={rota.mes} avisar={avisar} />
        ) : (
          <Suspense>
            <Anual ano={rota.ano} abrirMes={(mes) => ir({ visao: 'mes', mes })} avisar={avisar} />
          </Suspense>
        )}
      </main>

    </div>
  )
}
