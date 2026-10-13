import { CalendarPlus, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { MESES } from '../lib/money'
import type { ResultadoReplicar } from '../lib/types'
import { Modal } from './Modal'

interface Props {
  ano: number
  mes: number
  fechar: () => void
  concluido: (resultado: ResultadoReplicar) => void
}

const MAX_MESES = 24

// Mês como um número só (ano × 12 + mês) para somar e comparar
const indice = (ano: number, mes: number) => ano * 12 + (mes - 1)
const deIndice = (i: number) => ({ ano: Math.floor(i / 12), mes: (i % 12) + 1 })
const chave = (i: number) => `${deIndice(i).ano}-${String(deIndice(i).mes).padStart(2, '0')}`
const nome = (i: number) => `${MESES[deIndice(i).mes - 1]}/${deIndice(i).ano}`

/** Copia o mês inteiro para os meses seguintes, até o mês escolhido no calendário */
export function ReplicarModal({ ano, mes, fechar, concluido }: Props) {
  const origem = indice(ano, mes)
  const primeiro = origem + 1
  const ultimoPossivel = origem + MAX_MESES

  const [ate, setAte] = useState(primeiro)
  const [anoVisivel, setAnoVisivel] = useState(deIndice(primeiro).ano)
  const [existentes, setExistentes] = useState<Set<string>>(new Set())
  const [atualizar, setAtualizar] = useState(false)
  const [comEstado, setComEstado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    api.get<string[]>('/meses').then(({ data }) => setExistentes(new Set(data)))
  }, [])

  const destinos = useMemo(() => Array.from({ length: ate - primeiro + 1 }, (_, i) => primeiro + i), [ate, primeiro])
  const jaTem = destinos.filter((i) => existentes.has(chave(i))).length

  function escolher(i: number) {
    setAte(Math.min(Math.max(i, primeiro), ultimoPossivel))
    setAnoVisivel(deIndice(Math.min(Math.max(i, primeiro), ultimoPossivel)).ano)
  }

  async function replicar() {
    setErro('')
    setEnviando(true)
    try {
      const { data } = await api.post<ResultadoReplicar>(`/meses/${ano}/${mes}/replicar`, {
        meses: destinos.map(chave),
        modo: 'tudo',
        atualizar,
        estado: comEstado,
      })
      concluido(data)
    } catch (e) {
      setErro((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Não foi possível replicar.')
      setEnviando(false)
    }
  }

  const atalho = 'rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50'
  const qtd = destinos.length

  return (
    <Modal
      titulo="Replicar mês"
      subtitulo={
        <>
          Faz uma cópia de <b className="capitalize">{MESES[mes - 1]}</b> / {ano} (todos os itens) nos meses seguintes
        </>
      }
      fechar={fechar}
    >
      <div className="space-y-4 text-sm">
        <section>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Replicar até qual mês?</span>
            <span className="ml-auto flex flex-wrap gap-1.5">
              <button onClick={() => escolher(primeiro)} className={atalho}>Só o próximo</button>
              <button onClick={() => escolher(origem + 3)} className={atalho}>3 meses</button>
              <button onClick={() => escolher(origem + 6)} className={atalho}>6 meses</button>
              <button onClick={() => escolher(indice(ano, 12) <= origem ? indice(ano + 1, 12) : indice(ano, 12))} className={atalho}>Até dezembro</button>
              <button onClick={() => escolher(origem + 12)} className={atalho}>12 meses</button>
            </span>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <button onClick={() => setAnoVisivel(anoVisivel - 1)} disabled={anoVisivel <= deIndice(primeiro).ano} className="rounded-lg p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-30" title="Ano anterior">
                <ChevronLeft size={18} />
              </button>
              <span className="num font-bold text-slate-800">{anoVisivel}</span>
              <button onClick={() => setAnoVisivel(anoVisivel + 1)} disabled={anoVisivel >= deIndice(ultimoPossivel).ano} className="rounded-lg p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-30" title="Próximo ano">
                <ChevronRight size={18} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
              {MESES.map((_, m) => {
                const i = indice(anoVisivel, m + 1)
                const bloqueado = i < primeiro || i > ultimoPossivel
                const noIntervalo = i >= primeiro && i <= ate
                const fim = i === ate
                const origemDoMes = i === origem
                return (
                  <button
                    key={m}
                    disabled={bloqueado}
                    onClick={() => escolher(i)}
                    title={bloqueado ? (i <= origem ? (origemDoMes ? 'Mês de origem' : 'Só dá para replicar para meses seguintes') : `No máximo ${MAX_MESES} meses à frente`) : `Replicar até ${nome(i)}`}
                    className={`relative rounded-lg px-2 py-2 text-sm capitalize transition ${
                      fim
                        ? 'bg-green-600 font-bold text-white'
                        : noIntervalo
                          ? 'bg-green-100 font-medium text-green-800 hover:bg-green-200'
                          : origemDoMes
                            ? 'bg-slate-100 font-medium text-slate-500 ring-1 ring-slate-300'
                            : bloqueado
                              ? 'cursor-not-allowed text-slate-300'
                              : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {MESES[m].slice(0, 3)}
                    {existentes.has(chave(i)) && !bloqueado && <span className={`absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full ${fim ? 'bg-white' : 'bg-amber-500'}`} title="Já tem itens" />}
                    {origemDoMes && <span className="block text-[10px] font-normal leading-none">origem</span>}
                  </button>
                )
              })}
            </div>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 text-[11px] text-slate-500">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-green-100 ring-1 ring-green-300" /> serão preenchidos</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-green-600" /> último mês</span>
              <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> já tem itens</span>
            </p>
          </div>

          <p className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900">
            <b className="capitalize">{nome(primeiro)}</b>
            {qtd > 1 && (
              <>
                {' '}até <b className="capitalize">{nome(ate)}</b>
              </>
            )}{' '}
            · <b>{qtd}</b> {qtd === 1 ? 'mês' : 'meses'}
            {jaTem > 0 && <span className="text-green-800/80"> ({jaTem} já {jaTem === 1 ? 'tem' : 'têm'} itens: o que já existe lá não é duplicado)</span>}
          </p>
        </section>

        <div className="space-y-1">
          <label className="flex cursor-pointer items-start gap-2 rounded-lg p-2 hover:bg-slate-100/60">
            <input type="checkbox" checked={atualizar} onChange={(e) => setAtualizar(e.target.checked)} className="mt-0.5 accent-green-600" />
            <span>
              <span className="font-medium text-slate-800">Atualizar os valores de itens que já existem nesses meses</span>
              <span className="block text-xs text-slate-500">Sem marcar, o que já está lá fica como está.</span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2 rounded-lg p-2 hover:bg-slate-100/60">
            <input type="checkbox" checked={comEstado} onChange={(e) => setComEstado(e.target.checked)} className="mt-0.5 accent-green-600" />
            <span>
              <span className="font-medium text-slate-800">Copiar também o Real e o "pago"</span>
              <span className="block text-xs text-slate-500">Sem marcar, os meses novos começam sem nada pago e sem Real lançado.</span>
            </span>
          </label>
        </div>

        <ul className="list-disc space-y-0.5 rounded-lg bg-white px-6 py-2 text-xs text-slate-500 ring-1 ring-slate-200">
          <li>Copia todos os itens: entradas, saídas, cartão e PIX, fixos, parcelados e avulsos, com os vencimentos no mesmo dia de cada mês.</li>
          <li>As parcelas avançam sozinhas (3/10 vira 4/10, 5/10…). Parcelado que já tiver terminado antes do mês escolhido não é copiado.</li>
          <li>Fica tudo no histórico como uma só ação, e dá para desfazer de uma vez.</li>
        </ul>

        {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={fechar} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200">
            Cancelar
          </button>
          <button
            onClick={replicar}
            disabled={enviando}
            className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
          >
            {enviando ? <Loader2 size={15} className="animate-spin" /> : <CalendarPlus size={15} />}
            Replicar para {qtd} {qtd === 1 ? 'mês' : 'meses'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
