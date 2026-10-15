import { Bell, BellOff, Monitor, Moon, Palette, Sun } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { definirAparencia, useAparencia, type Aparencia } from '../lib/aparencia'
import { toast } from '../lib/alerta'
import { alternarLembretes, useLembretes, verificarVencimentos } from '../lib/lembretes'

function Opcoes<T extends string>({ valor, opcoes, onChange }: { valor: T; opcoes: [T, ReactNode, string?][]; onChange: (v: T) => void }) {
  return (
    <div className="grid auto-cols-fr grid-flow-col gap-0.5 rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
      {opcoes.map(([v, rotulo, titulo]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          title={titulo}
          aria-pressed={valor === v}
          className={`flex items-center justify-center gap-1 rounded-md px-2 py-1.5 ${valor === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
        >
          {rotulo}
        </button>
      ))}
    </div>
  )
}

/** Botão do topo com tema, tamanho da letra, densidade das tabelas e lembretes de vencimento */
export function AparenciaMenu() {
  const [aberto, setAberto] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)
  const a = useAparencia()
  const lembretes = useLembretes()

  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => !caixa.current?.contains(e.target as Node) && setAberto(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false)
    document.addEventListener('mousedown', fora)
    window.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fora)
      window.removeEventListener('keydown', esc)
    }
  }, [aberto])

  async function lembrar() {
    const ligando = lembretes !== 'ligado'
    const depois = await alternarLembretes()
    if (depois === 'ligado') {
      const n = await verificarVencimentos(true)
      toast(n ? `Lembretes ligados: ${n} pagamento(s) vencem hoje ou amanhã.` : 'Lembretes ligados. Nada vence hoje nem amanhã.')
    } else if (ligando) {
      toast('O navegador não deixou mostrar notificações. Libere nas permissões do site.', 'erro')
    } else {
      toast('Lembretes desligados.')
    }
  }

  const campo = (rotulo: string, children: ReactNode) => (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{rotulo}</div>
      {children}
    </div>
  )

  return (
    <div ref={caixa} className="relative">
      <button
        onClick={() => setAberto(!aberto)}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        title="Aparência e lembretes"
        aria-label="Aparência e lembretes"
        aria-expanded={aberto}
      >
        <Palette size={16} />
      </button>

      {aberto && (
        <div className="absolute right-0 top-full z-40 mt-1 w-72 max-w-[calc(100vw-1.5rem)] space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
          {campo(
            'Tema',
            <Opcoes<Aparencia['tema']>
              valor={a.tema}
              onChange={(tema) => definirAparencia({ tema })}
              opcoes={[
                ['auto', <span key="a" className="flex items-center gap-1"><Monitor size={13} /> Auto</span>, 'Segue o tema do aparelho'],
                ['claro', <span key="c" className="flex items-center gap-1"><Sun size={13} /> Claro</span>],
                ['escuro', <span key="e" className="flex items-center gap-1"><Moon size={13} /> Escuro</span>],
              ]}
            />,
          )}
          {campo(
            'Tamanho da letra',
            <Opcoes<Aparencia['fonte']>
              valor={a.fonte}
              onChange={(fonte) => definirAparencia({ fonte })}
              opcoes={[
                ['pequena', <span className="text-[11px]">A</span>, 'Pequena'],
                ['media', <span className="text-sm">A</span>, 'Média'],
                ['grande', <span className="text-base font-semibold">A</span>, 'Grande'],
              ]}
            />,
          )}
          {campo(
            'Linhas das tabelas',
            <Opcoes<Aparencia['densidade']>
              valor={a.densidade}
              onChange={(densidade) => definirAparencia({ densidade })}
              opcoes={[
                ['compacta', 'Compacta'],
                ['normal', 'Normal'],
                ['confortavel', 'Confortável'],
              ]}
            />,
          )}

          <div className="border-t border-slate-100 pt-3">
            <button
              onClick={() => void lembrar()}
              disabled={lembretes === 'indisponivel'}
              className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left text-sm disabled:opacity-50"
            >
              <span className="flex items-center gap-2 text-slate-700">
                {lembretes === 'ligado' ? <Bell size={15} className="text-green-600" /> : <BellOff size={15} />}
                Lembrar dos vencimentos
              </span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${lembretes === 'ligado' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                {lembretes === 'ligado' ? 'Ligado' : lembretes === 'bloqueado' ? 'Bloqueado' : lembretes === 'indisponivel' ? 'Sem suporte' : 'Desligado'}
              </span>
            </button>
            <p className="mt-1.5 text-xs text-slate-400">
              Avisa dos pagamentos que vencem hoje ou amanhã e ainda não foram pagos. A conferência acontece quando o app está aberto.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
