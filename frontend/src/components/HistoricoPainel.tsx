import { ArrowRight, CalendarPlus, CalendarRange, ChevronDown, ChevronRight, CopyPlus, Loader2, Pencil, Plus, Redo2, RotateCcw, Search, Trash2, Undo2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { alertaAberto, confirmar } from '../lib/alerta'
import { api } from '../lib/api'
import { brl, fmtVencimento, MESES } from '../lib/money'
import type { Grupo, Historico } from '../lib/types'

interface Props {
  ano: number
  mes: number
  fechar: () => void
  /** Chamado depois de desfazer/refazer, para a planilha recarregar */
  aoMudar: () => Promise<void> | void
}

const GRUPOS: Record<Grupo, string> = { entrada: 'Entradas', saida: 'Saídas', cartao: 'Cartão', pix: 'PIX' }
const CAMPOS: Record<string, string> = { valor: 'Valor', real: 'Real', nome: 'Nome', parcela: 'Parcela', vencimento: 'Vencimento' }
const ACIONAVEIS = ['criou', 'alterou', 'excluiu']

const dinheiro = (v: string | null) => (v == null ? 'vazio' : brl(Number(v)))

function Texto({ h }: { h: Historico }) {
  const nome = <b className="font-semibold text-slate-900">{h.nome}</b>
  const onde = h.grupo && <span className="text-slate-400"> · {GRUPOS[h.grupo]}</span>
  const de = (a: ReactNode, b: ReactNode) => (
    <span className="num inline-flex flex-wrap items-center gap-1">
      <span className="text-slate-500 line-through decoration-slate-300">{a}</span>
      <ArrowRight size={12} className="text-slate-400" />
      <span className="font-semibold text-slate-900">{b}</span>
    </span>
  )

  if (h.acao === 'importou') return <>Mês criado com <b>{h.depois}</b> item(ns) fixo(s)/parcelado(s) trazidos do mês anterior</>
  if (h.acao === 'replicou') {
    const d = h.dados
    return (
      <>
        Replicou para <b>{Array.isArray(d?.meses) ? d.meses.join(', ') : d?.meses}</b>: {d?.criados ?? 0} item(ns) adicionado(s)
        {d?.atualizados ? `, ${d.atualizados} atualizado(s)` : ''}
      </>
    )
  }
  if (h.acao === 'propagou') {
    const d = h.dados
    const partes = [d?.atualizados && `${d.atualizados} ajustado(s)`, d?.criados && `${d.criados} adicionado(s)`, d?.removidos && `${d.removidos} removido(s)`].filter(Boolean)
    return (
      <>
        {nome}{onde}: aplicado a <b>{d?.meses}</b> {d?.meses === 1 ? 'mês seguinte' : 'meses seguintes'}
        {partes.length ? ` (${partes.join(', ')})` : ''}
      </>
    )
  }
  if (h.acao === 'criou') return <>Adicionou {nome} ({dinheiro(h.depois)}){onde}</>
  if (h.acao === 'excluiu') return <>Excluiu {nome} (era {dinheiro(h.antes)}){onde}</>

  switch (h.campo) {
    case 'valor':
    case 'real': {
      const dif = Number(h.depois ?? 0) - Number(h.antes ?? 0)
      return (
        <>
          {nome}{onde}: {CAMPOS[h.campo]} {de(dinheiro(h.antes), dinheiro(h.depois))}{' '}
          {h.antes != null && h.depois != null && (
            <span className={`num text-xs font-semibold ${dif > 0 ? 'text-red-600' : 'text-green-700'}`}>
              ({dif > 0 ? '+' : ''}
              {brl(dif)})
            </span>
          )}
        </>
      )
    }
    case 'vencimento': {
      const data = (v: string | null) => (v ? fmtVencimento(v) + '/' + v.slice(2, 4) : 'sem data')
      return <>{nome}{onde}: vencimento {de(data(h.antes), data(h.depois))}</>
    }
    case 'nome':
      return <>Renomeou {de(h.antes, h.depois)}{onde}</>
    case 'pago':
      return <>{h.depois === '1' ? 'Marcou' : 'Desmarcou'} {nome} como {h.grupo === 'entrada' ? 'recebido' : 'pago'}</>
    case 'recorrente':
      return <>{nome} {h.depois === '1' ? 'virou fixo' : 'deixou de ser fixo'}{onde}</>
    case 'variavel':
      return <>{nome}: {h.depois === '1' ? 'passou a repetir todo mês com valor variável' : 'deixou de ser variável'}{onde}</>
    case 'essencial':
      return <>{nome} marcado como {h.depois === '1' ? 'essencial (não dá pra cortar)' : 'cortável'}</>
    case 'parcela':
      return <>{nome}: parcela {de(h.antes ?? 'sem', h.depois ?? 'sem')}{onde}</>
    default:
      return <>{nome} alterado</>
  }
}

const ICONES: Record<Historico['acao'], ReactNode> = {
  criou: <Plus size={13} />,
  alterou: <Pencil size={12} />,
  excluiu: <Trash2 size={12} />,
  importou: <CopyPlus size={12} />,
  replicou: <CalendarPlus size={12} />,
  propagou: <CalendarRange size={12} />,
}
const CORES: Record<Historico['acao'], string> = {
  criou: 'bg-green-100 text-green-700',
  alterou: 'bg-blue-100 text-blue-700',
  excluiu: 'bg-red-100 text-red-600',
  importou: 'bg-slate-100 text-slate-600',
  replicou: 'bg-violet-100 text-violet-700',
  propagou: 'bg-violet-100 text-violet-700',
}

/** Todas as linhas geradas por uma mesma ação do usuário */
interface Acao {
  chave: string
  lote: string | null
  linhas: Historico[]
  topo: Historico
  /** É o registro de um "desfazer" (ou "refazer") */
  inverso: boolean
}

function agrupar(linhas: Historico[]): Acao[] {
  const mapa = new Map<string, Acao>()
  for (const h of linhas) {
    const chave = h.lote ?? `antigo-${h.id}`
    const atual = mapa.get(chave)
    if (atual) atual.linhas.push(h)
    else mapa.set(chave, { chave, lote: h.lote, linhas: [h], topo: h, inverso: !!h.reverte_lote })
  }
  return [...mapa.values()]
}

type Aviso = { tipo: 'ok' | 'erro'; texto: string }

/** Painel lateral com todas as alterações feitas no mês, com desfazer e refazer */
export function HistoricoPainel({ ano, mes, fechar, aoMudar }: Props) {
  const [lista, setLista] = useState<Historico[] | null>(null)
  const [busca, setBusca] = useState('')
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [invertidos, setInvertidos] = useState<Set<string>>(new Set())

  const carregar = useCallback(
    () => api.get<{ linhas: Historico[] }>(`/meses/${ano}/${mes}/historico`).then(({ data }) => setLista(data.linhas)),
    [ano, mes],
  )

  useEffect(() => {
    carregar().catch(() => setAviso({ tipo: 'erro', texto: 'Não foi possível carregar o histórico.' }))
  }, [carregar])

  useEffect(() => {
    // Esc fecha uma pergunta aberta (SweetAlert), não o painel por baixo
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !alertaAberto() && fechar()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [fechar])

  const acoes = useMemo(() => agrupar(lista ?? []), [lista])

  // Ações originais ainda valendo, da mais nova para a mais antiga: só nelas dá para "voltar até aqui"
  const ativas = useMemo(() => acoes.filter((a) => a.lote && !a.inverso && !a.topo.desfeito_por), [acoes])

  const dias = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const filtradas = acoes.filter((a) => !termo || a.linhas.some((h) => `${h.nome ?? ''} ${h.rotulo ?? ''} ${h.antes ?? ''} ${h.depois ?? ''}`.toLowerCase().includes(termo)))
    const porDia = new Map<string, Acao[]>()
    for (const a of filtradas) {
      const dia = new Date(a.topo.created_at).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
      porDia.set(dia, [...(porDia.get(dia) ?? []), a])
    }
    return [...porDia]
  }, [acoes, busca])

  async function executar(chamada: () => Promise<{ data: Record<string, unknown> }>, sucesso: (d: Record<string, unknown>) => string) {
    setAviso(null)
    setOcupado(true)
    try {
      const { data } = await chamada()
      setAviso({ tipo: 'ok', texto: sucesso(data) })
      await carregar()
      await aoMudar()
    } catch (e) {
      setAviso({ tipo: 'erro', texto: (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Não foi possível concluir.' })
      carregar().catch(() => undefined)
    } finally {
      setOcupado(false)
    }
  }

  const confirmarMeses = async (a: Acao, verbo: string) =>
    a.topo.lote_meses <= 1 ||
    confirmar({ titulo: `${verbo} em ${a.topo.lote_meses} meses?`, texto: `Esta ação mexeu em ${a.topo.lote_meses} meses. ${verbo} em todos eles?`, confirmar: verbo })

  async function desfazer(a: Acao) {
    if (!(await confirmarMeses(a, 'Desfazer'))) return
    executar(() => api.post(`/historico/${a.lote}/desfazer`), (d) => `Desfeito: ${d.descricao}`)
  }

  async function refazer(a: Acao) {
    const desfazedor = a.topo.desfeito_por
    if (!desfazedor || !(await confirmarMeses(a, 'Refazer'))) return
    executar(() => api.post(`/historico/${desfazedor}/desfazer`), (d) => `Refeito: ${String(d.descricao).replace(/^Desfez: /, '')}`)
  }

  async function voltarAte(a: Acao) {
    const quantas = ativas.findIndex((x) => x.chave === a.chave)
    const ok = await confirmar({
      titulo: 'Voltar o mês até este ponto?',
      texto: `Isso desfaz as ${quantas} ${quantas === 1 ? 'ação feita' : 'ações feitas'} depois dele.`,
      confirmar: 'Voltar até aqui',
      perigo: true,
    })
    if (!ok) return
    executar(() => api.post(`/meses/${ano}/${mes}/voltar-ate`, { lote: a.lote }), (d) => `Mês restaurado: ${d.desfeitas} ${d.desfeitas === 1 ? 'ação desfeita' : 'ações desfeitas'}.`)
  }

  const botao = 'flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50'

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30" onMouseDown={(e) => e.target === e.currentTarget && fechar()}>
      <aside className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="font-bold text-slate-900">Histórico de alterações</h2>
            <p className="text-xs capitalize text-slate-500">
              {MESES[mes - 1]} / {ano}
            </p>
          </div>
          <button onClick={fechar} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="Fechar (Esc)">
            <X size={18} />
          </button>
        </header>

        <div className="space-y-2 border-b border-slate-100 px-4 py-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Filtrar por item…"
              className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/20"
            />
          </div>
          {aviso && (
            <p role="status" className={`rounded-lg px-3 py-2 text-xs font-medium ${aviso.tipo === 'ok' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
              {aviso.texto}
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 text-sm">
          {!lista && (
            <div className="flex justify-center py-10 text-slate-400">
              <Loader2 className="animate-spin" />
            </div>
          )}
          {lista && dias.length === 0 && <p className="py-10 text-center text-slate-400">{busca ? 'Nada encontrado.' : 'Nenhuma alteração neste mês ainda.'}</p>}
          {dias.map(([dia, itens]) => (
            <section key={dia} className="mb-4">
              <h3 className="sticky top-0 mb-1 bg-white py-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{dia}</h3>
              <ol className="space-y-1">
                {itens.map((a) => {
                  const { topo } = a
                  const feitas = a.linhas.filter((h) => ACIONAVEIS.includes(h.acao))
                  const comTitulo = !!topo.rotulo || a.linhas.length > 3
                  const aberto = comTitulo ? invertidos.has(a.chave) : true
                  const desfeita = !!topo.desfeito_por && !a.inverso
                  const vigente = !!a.lote && !a.inverso && !topo.desfeito_por
                  const podeVoltar = vigente && ativas.findIndex((x) => x.chave === a.chave) > 0
                  const hora = new Date(topo.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

                  return (
                    <li key={a.chave} className={`flex gap-2.5 rounded-lg px-1 py-1.5 hover:bg-slate-50 ${a.inverso ? 'opacity-70' : ''}`}>
                      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${a.inverso ? 'bg-slate-100 text-slate-500' : CORES[topo.acao]}`}>
                        {a.inverso ? <Undo2 size={12} /> : ICONES[topo.acao]}
                      </span>
                      <div className="min-w-0 flex-1 leading-snug text-slate-700">
                        {comTitulo ? (
                          <>
                            <button
                              onClick={() => setInvertidos((s) => (s.has(a.chave) ? new Set([...s].filter((c) => c !== a.chave)) : new Set(s).add(a.chave)))}
                              className="flex w-full items-start gap-1 text-left"
                              title={aberto ? 'Esconder detalhes' : 'Ver detalhes'}
                            >
                              {aberto ? <ChevronDown size={14} className="mt-0.5 shrink-0 text-slate-400" /> : <ChevronRight size={14} className="mt-0.5 shrink-0 text-slate-400" />}
                              <span className={desfeita ? 'text-slate-500 line-through decoration-slate-300' : ''}>
                                <b className="font-semibold text-slate-900">{topo.rotulo ?? `${feitas.length} alterações`}</b>
                                {feitas.length > 1 && <span className="text-slate-400"> · {feitas.length} itens</span>}
                              </span>
                            </button>
                            {aberto && (
                              <ul className="ml-5 mt-1 space-y-1 border-l border-slate-200 pl-2 text-[13px]">
                                {a.linhas.slice(0, 60).map((h) => (
                                  <li key={h.id}>
                                    <Texto h={h} />
                                  </li>
                                ))}
                                {a.linhas.length > 60 && <li className="text-slate-400">e mais {a.linhas.length - 60}…</li>}
                              </ul>
                            )}
                          </>
                        ) : (
                          <div className={desfeita ? 'text-slate-500 line-through decoration-slate-300' : ''}>
                            {a.linhas.map((h) => (
                              <div key={h.id}>
                                <Texto h={h} />
                              </div>
                            ))}
                          </div>
                        )}

                        {(vigente || desfeita) && (
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            {vigente && (
                              <button disabled={ocupado} onClick={() => desfazer(a)} className={botao} title="Desfaz só esta ação, se o item não tiver mudado depois dela">
                                <Undo2 size={11} /> Desfazer
                              </button>
                            )}
                            {podeVoltar && (
                              <button disabled={ocupado} onClick={() => voltarAte(a)} className={botao} title="Desfaz tudo o que foi feito depois desta ação">
                                <RotateCcw size={11} /> Voltar até aqui
                              </button>
                            )}
                            {desfeita && (
                              <>
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">desfeito</span>
                                <button disabled={ocupado} onClick={() => refazer(a)} className={botao} title="Aplica esta ação de novo">
                                  <Redo2 size={11} /> Refazer
                                </button>
                              </>
                            )}
                            {topo.lote_meses > 1 && <span className="text-[11px] text-slate-400">afeta {topo.lote_meses} meses</span>}
                          </div>
                        )}
                      </div>
                      <time className="num shrink-0 text-xs text-slate-400">{hora}</time>
                    </li>
                  )
                })}
              </ol>
            </section>
          ))}
        </div>
      </aside>
    </div>
  )
}
