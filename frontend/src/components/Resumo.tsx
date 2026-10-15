import { ArrowDownCircle, ArrowUpCircle, BarChart3, CalendarClock, ChevronDown, ChevronUp, Clock, Lock, Pencil, Wallet } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { arred, brl, chaveItem, numero, pagoNoMes, restante, terminaEm, tipoDe, type Totais } from '../lib/money'
import type { Grupo, Lancamento, ValoresAnteriores } from '../lib/types'
import { useMovel } from '../lib/useMovel'

/** Barra "para onde vai o dinheiro": quanto da entrada vai para cartão, PIX e quanto sobra */
function Composicao({ t }: { t: Totais }) {
  const base = Math.max(t.entradas, t.custo, 1)
  const partes = [
    { nome: 'Cartão', valor: t.cartao, cor: '#2a78d6' },
    { nome: 'PIX', valor: t.pix, cor: '#1baf7a' },
    { nome: t.sobra >= 0 ? 'Sobra' : 'Faltando', valor: Math.abs(t.sobra), cor: t.sobra >= 0 ? '#cbd5e1' : '#e34948' },
  ].filter((p) => p.valor > 0)

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Para onde vai a entrada</span>
        <span className="num text-xs text-slate-500">
          {t.entradas > 0 ? `${Math.round((t.custo / t.entradas) * 100)}% comprometido` : 'sem entradas'}
        </span>
      </div>
      <div className="flex h-4 gap-0.5 overflow-hidden rounded">
        {partes.map((p) => (
          <div
            key={p.nome}
            style={{ width: `${(p.valor / base) * 100}%`, background: p.cor }}
            className="rounded-[4px] transition-all hover:opacity-80"
            title={`${p.nome}: ${brl(p.valor)} (${Math.round((p.valor / base) * 100)}%)`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        {partes.map((p) => (
          <span key={p.nome} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.cor }} />
            {p.nome} <b className="num text-slate-800">{brl(p.valor)}</b>
          </span>
        ))}
      </div>
    </div>
  )
}

/** Gastos fixos: total, quanto dá pra cortar e o mínimo possível (só os essenciais) */
function Fixos({ t }: { t: Totais }) {
  const base = Math.max(t.totalFixo, 1)
  const folga = Math.round((t.salarioFixo - t.minimo) * 100) / 100

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Gastos fixos do mês</span>
        <span className="text-xs text-slate-500" title="Marque com o cadeado os fixos que não dá pra cortar">
          <Lock size={11} className="inline -mt-0.5" /> = essencial
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div title="Soma de todos os itens fixos (🔁) dos recorrentes do cartão e PIX">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total fixo</div>
          <div className="num text-base font-bold text-slate-800 sm:text-lg">{brl(t.totalFixo)}</div>
        </div>
        <div title="Fixos que podem ser retirados (sem cadeado), ex.: streaming">
          <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500"><span className="h-2 w-2 rounded-sm" style={{ background: '#86b6ef' }} />Dá pra cortar</div>
          <div className="num text-base font-bold text-slate-800 sm:text-lg">{brl(t.cortavel)}</div>
        </div>
        <div title="Fixos essenciais (com cadeado), que não podem ser retirados, ex.: condomínio">
          <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500"><span className="h-2 w-2 rounded-sm" style={{ background: '#2a78d6' }} />Mínimo possível</div>
          <div className="num text-base font-bold text-slate-800 sm:text-lg">{brl(t.minimo)}</div>
        </div>
      </div>
      <div className="mt-2 flex h-2.5 gap-0.5 overflow-hidden rounded">
        {t.minimo > 0 && <div style={{ width: `${(t.minimo / base) * 100}%`, background: '#2a78d6' }} className="rounded-[4px]" title={`Mínimo possível: ${brl(t.minimo)}`} />}
        {t.cortavel > 0 && <div style={{ width: `${(t.cortavel / base) * 100}%`, background: '#86b6ef' }} className="rounded-[4px]" title={`Dá pra cortar: ${brl(t.cortavel)}`} />}
      </div>
      <div className="mt-2 text-xs text-slate-500">
        {t.salarioFixo > 0 &&
          (folga >= 0 ? (
            <>O salário fixo cobre o mínimo com folga de <b className="num text-slate-800">{brl(folga)}</b></>
          ) : (
            <span className="text-red-600">
              O mínimo passa o salário fixo em <b className="num">{brl(-folga)}</b>
            </span>
          ))}
      </div>
      {t.variaveis > 0 && (
        <div className="mt-1 text-xs text-slate-500" title="Gastos que repetem todo mês, mas o valor muda (gasolina, mercado, lanches). Não entram no total fixo.">
          Gastos variáveis previstos: <b className="num text-slate-800">{brl(t.variaveis)}</b>
        </div>
      )}
    </div>
  )
}

/** Compras parceladas (com prazo): quanto pesa no mês, quanto falta e quando cada uma acaba */
function Parcelados({ itens, ano, mes, total }: { itens: Lancamento[]; ano: number; mes: number; total: number }) {
  const [todos, setTodos] = useState(false)
  const lista = itens
    .filter((l) => l.grupo !== 'entrada' && tipoDe(l) === 'parcelado')
    .map((l) => ({ l, fim: terminaEm(l, ano, mes), falta: restante(l) }))
    .sort((a, b) => a.fim.ano - b.fim.ano || a.fim.mes - b.fim.mes)
  const faltaTotal = arred(lista.reduce((s, p) => s + p.falta, 0))
  const visiveis = todos ? lista : lista.slice(0, 4)

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <CalendarClock size={13} className="text-violet-600" /> Parcelados (com prazo)
        </span>
        <span className="num text-xs text-slate-500">{lista.length} compra(s)</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div title="Soma das parcelas deste mês">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Neste mês</div>
          <div className="num text-base font-bold text-slate-800 sm:text-lg">{brl(total)}</div>
        </div>
        <div title="Quanto ainda falta pagar das compras parceladas: as parcelas seguintes, mais a deste mês se ainda não foi paga">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Falta pagar</div>
          <div className="num text-base font-bold text-slate-800 sm:text-lg">{brl(faltaTotal)}</div>
        </div>
      </div>
      {lista.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">Nenhuma compra parcelada. Na coluna <b>Tipo</b>, escolha "Parcelado" para acompanhar TV, remédio etc.</p>
      ) : (
        <ul className="mt-2 space-y-1 text-xs">
          {visiveis.map(({ l, fim, falta }) => (
            <li key={l.id} className="flex items-center gap-2">
              <span className="num rounded-full bg-violet-100 px-1.5 font-semibold text-violet-700">
                {l.parcela_atual ?? 1}/{l.parcela_total}
              </span>
              <span className="min-w-0 flex-1 truncate text-slate-700" title={l.nome}>{l.nome}</span>
              <span className="whitespace-nowrap text-slate-500">
                {l.parcela_atual === l.parcela_total ? (
                  <b className="text-green-700">{pagoNoMes(l) ? 'quitado' : 'última!'}</b>
                ) : (
                  <>
                    até <b className="text-slate-700">{fim.texto}</b>
                  </>
                )}
              </span>
              <span className="num w-20 text-right text-slate-600" title={pagoNoMes(l) ? 'Falta pagar (a parcela deste mês já está paga)' : 'Falta pagar (inclui a parcela deste mês)'}>
                {brl(falta)}
              </span>
            </li>
          ))}
          {lista.length > 4 && (
            <li>
              <button onClick={() => setTodos(!todos)} className="text-violet-700 hover:underline">
                {todos ? 'ver menos' : `ver todos (${lista.length})`}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

interface Causa {
  nome: string
  dif: number
  /** 'novo': não existia no mês anterior · 'saiu': não existe mais */
  situacao: 'novo' | 'saiu' | null
}

interface Comparacao {
  grupo: Grupo
  rotulo: string
  /** Para entradas, subir é bom; para o resto, subir é gasto a mais */
  subirEhBom: boolean
  antes: number
  agora: number
  dif: number
  pct: number | null
  causas: Causa[]
}

const GRUPOS_COMPARADOS: { grupo: Grupo; rotulo: string; subirEhBom: boolean }[] = [
  { grupo: 'saida', rotulo: 'Saídas', subirEhBom: false },
  { grupo: 'cartao', rotulo: 'Cartão', subirEhBom: false },
  { grupo: 'pix', rotulo: 'PIX', subirEhBom: false },
  { grupo: 'entrada', rotulo: 'Entradas', subirEhBom: true },
]

const inicial = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

/** Compara o valor lançado de cada item com o do mês anterior (a chave do mapa é "grupo|nome em minúsculas") */
function compararComAnterior(itens: Lancamento[], anterior: ValoresAnteriores): Comparacao[] {
  return GRUPOS_COMPARADOS.map(({ grupo, rotulo, subirEhBom }) => {
    const antes = new Map<string, number>()
    for (const [chave, valor] of Object.entries(anterior)) {
      if (chave.startsWith(`${grupo}|`)) antes.set(chave, (antes.get(chave) ?? 0) + valor)
    }
    const agora = new Map<string, { nome: string; valor: number }>()
    for (const l of itens.filter((i) => i.grupo === grupo)) {
      const c = chaveItem(l)
      agora.set(c, { nome: l.nome, valor: (agora.get(c)?.valor ?? 0) + l.valor })
    }

    const totalAntes = arred([...antes.values()].reduce((s, v) => s + v, 0))
    const totalAgora = arred([...agora.values()].reduce((s, v) => s + v.valor, 0))
    const causas: Causa[] = [...new Set([...antes.keys(), ...agora.keys()])]
      .map((c) => {
        const a = antes.get(c)
        const n = agora.get(c)
        return {
          nome: n?.nome ?? inicial(c.split('|')[1]),
          dif: arred((n?.valor ?? 0) - (a ?? 0)),
          situacao: a === undefined ? 'novo' : n === undefined ? 'saiu' : null,
        } satisfies Causa
      })
      .filter((c) => Math.abs(c.dif) >= 0.01)
      // Primeiro o que mais pesou no sentido do mês: quem gastou mais, as altas; quem gastou menos, as quedas
      .sort((x, y) => Math.abs(y.dif) - Math.abs(x.dif))

    const dif = arred(totalAgora - totalAntes)
    return {
      grupo,
      rotulo,
      subirEhBom,
      antes: totalAntes,
      agora: totalAgora,
      dif,
      pct: totalAntes > 0 ? (dif / totalAntes) * 100 : null,
      causas: causas.filter((c) => Math.sign(c.dif) === Math.sign(dif) || dif === 0).slice(0, 3),
    }
  })
}

const sinal = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '')
const pctTexto = (c: Comparacao) => (c.pct === null ? '' : `${sinal(c.dif)}${Math.abs(Math.round(c.pct))}%`)
/** Verde para o que melhora a situação (entrada sobe, gasto desce), vermelho para o contrário */
const corDif = (c: Comparacao) => (c.dif === 0 ? 'text-slate-500' : c.dif > 0 === c.subirEhBom ? 'text-green-700' : 'text-red-600')

function textoCausas(c: Comparacao) {
  return c.causas.map((x) => `${x.nome} ${sinal(x.dif)}${brl(Math.abs(x.dif))}${x.situacao === 'novo' ? ' (novo)' : x.situacao === 'saiu' ? ' (saiu)' : ''}`).join(' · ')
}

/** Uma linha sempre visível: o que mudou nas saídas em relação ao mês anterior e por quê */
function ResumoComparativo({ comparacoes, abrir }: { comparacoes: Comparacao[]; abrir: () => void }) {
  const saidas = comparacoes[0]
  if (saidas.antes === 0 && saidas.agora === 0) return null

  return (
    <button onClick={abrir} className="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg bg-white px-3 py-1.5 text-left text-xs ring-1 ring-slate-200 hover:ring-green-500" title="Ver o comparativo completo com o mês anterior">
      <span className="font-semibold uppercase tracking-wide text-slate-500">vs mês anterior</span>
      {saidas.dif === 0 ? (
        <span className="text-slate-600">Saídas iguais ({brl(saidas.agora)})</span>
      ) : (
        <span className="text-slate-700">
          Saídas <b className={`num ${corDif(saidas)}`}>{pctTexto(saidas)} ({sinal(saidas.dif)}{brl(Math.abs(saidas.dif))})</b>
        </span>
      )}
      {saidas.causas.length > 0 && saidas.dif !== 0 && <span className="min-w-0 flex-1 truncate text-slate-500">principais causas: {textoCausas(saidas)}</span>}
    </button>
  )
}

/** Cartão no painel de detalhes: todos os grupos, com total anterior, variação e principais causas */
function Comparativo({ comparacoes }: { comparacoes: Comparacao[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Comparado ao mês anterior</div>
      <ul className="space-y-2.5 text-sm">
        {comparacoes.map((c) => (
          <li key={c.grupo}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium text-slate-700">{c.rotulo}</span>
              <span className="num text-xs text-slate-500">
                {brl(c.antes)} → <b className="text-slate-800">{brl(c.agora)}</b>
              </span>
            </div>
            {c.dif === 0 ? (
              <div className="text-xs text-slate-400">{c.antes === 0 ? 'Sem lançamentos' : 'Sem mudança'}</div>
            ) : (
              <>
                <div className={`num text-xs font-semibold ${corDif(c)}`}>
                  {pctTexto(c)} {c.pct !== null && '·'} {sinal(c.dif)}{brl(Math.abs(c.dif))}
                </div>
                {c.causas.length > 0 && <div className="text-xs text-slate-500">Principais causas: {textoCausas(c)}</div>}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

const CHAVE_DETALHES = 'financeiro.resumoDetalhes'

function Tile({ titulo, valor, ajuda, cor, icone, children, onClick }: { titulo: string; valor: number; ajuda: string; cor?: string; icone?: ReactNode; children?: ReactNode; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      className={`group min-w-0 rounded-lg bg-white px-2.5 py-1.5 text-left ring-1 ring-slate-200 ${onClick ? 'cursor-pointer transition hover:ring-2 hover:ring-green-500' : ''}`}
      title={ajuda}
    >
      <div className="flex items-center gap-1 truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {icone && <span className={cor}>{icone}</span>}
        {titulo}
        {onClick && <Pencil size={11} className="ml-auto shrink-0 text-slate-400 group-hover:text-green-600" />}
      </div>
      <div className={`num truncate text-[15px] font-bold min-[112rem]:text-lg ${valor < 0 ? 'text-red-600' : 'text-slate-900'}`}>{brl(valor)}</div>
      {children}
    </Tag>
  )
}

export function Resumo({ t, itens, ano, mes, anterior, abrirEntradas }: { t: Totais; itens: Lancamento[]; ano: number; mes: number; anterior: ValoresAnteriores; abrirEntradas: () => void }) {
  const movel = useMovel()
  // No celular os totais secundários ficam recolhidos para as tabelas aparecerem logo
  const [mais, setMais] = useState(false)
  const pctPago = t.saidas > 0 ? Math.round((t.pagas / t.saidas) * 100) : 0
  const [detalhes, setDetalhes] = useState(() => {
    try {
      return localStorage.getItem(CHAVE_DETALHES) === '1'
    } catch {
      return false
    }
  })

  const temAnterior = Object.keys(anterior).length > 0
  const comparacoes = temAnterior ? compararComAnterior(itens, anterior) : null

  function abrirDetalhes() {
    setDetalhes(true)
    try {
      localStorage.setItem(CHAVE_DETALHES, '1')
    } catch {
      /* sem armazenamento: só não lembra a escolha */
    }
  }

  function alternar() {
    setDetalhes(!detalhes)
    try {
      localStorage.setItem(CHAVE_DETALHES, detalhes ? '0' : '1')
    } catch {
      /* sem armazenamento: só não lembra a escolha */
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-6 min-[93.75rem]:grid-cols-[repeat(10,minmax(0,1fr))_auto]">
        <Tile titulo="Entrada" valor={t.entradas} ajuda="Clique para ver, adicionar e editar as entradas" cor="text-green-600" icone={<ArrowUpCircle size={12} />} onClick={abrirEntradas}>
          <div className="num truncate text-[10px] text-slate-500">
            fixo {numero(t.salarioFixo)} · extra {numero(arred(t.entradas - t.salarioFixo))}
          </div>
        </Tile>
        <Tile titulo="Saída" valor={t.saidas} ajuda="Soma das saídas do mês" cor="text-red-600" icone={<ArrowDownCircle size={12} />} />
        <Tile titulo="Final" valor={t.final} ajuda="Entrada − Saída" cor="text-blue-600" icone={<Wallet size={12} />} />
        <Tile titulo="Falta pagar" valor={t.faltaPagar} ajuda={`${pctPago}% das saídas pagas (${brl(t.pagas)})`} cor="text-amber-600" icone={<Clock size={12} />}>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-green-600 transition-all" style={{ width: `${pctPago}%` }} />
          </div>
        </Tile>
        {movel && (
          <button
            onClick={() => setMais(!mais)}
            className="col-span-2 flex items-center justify-center gap-1 rounded-lg bg-white px-3 py-2 text-xs font-medium text-slate-600 ring-1 ring-slate-200 active:bg-slate-50"
          >
            {mais ? 'Menos totais' : 'Mais totais (cartão, PIX, sobra, mínimo)'} {mais ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
        {(!movel || mais) && (
          <>
        <Tile titulo="Total Cartão" valor={t.cartao} ajuda="Soma do valor previsto dos recorrentes do cartão" />
        <Tile titulo="Total PIX" valor={t.pix} ajuda="Soma do valor real dos recorrentes PIX" />
        <Tile titulo="Cartão + PIX" valor={t.custo} ajuda="Custo total do mês (cartão + PIX)" />
        <Tile titulo="Salário − Custo" valor={t.salarioMenosCusto} ajuda={`Salário fixo (${brl(t.salarioFixo)}) menos (cartão + PIX)`} />
        <Tile titulo="Sobra" valor={t.sobra} ajuda="Sobra (fixo + flex): todas as entradas menos (cartão + PIX)" />
        <Tile titulo="Mínimo" valor={t.minimo} ajuda={`Mínimo possível: só os fixos essenciais. Total fixo ${brl(t.totalFixo)}, dá pra cortar ${brl(t.cortavel)}`} cor="text-amber-600" icone={<Lock size={11} />} />
          </>
        )}
        <button
          onClick={alternar}
          className="col-span-2 flex items-center justify-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 sm:col-span-1"
          title={detalhes ? 'Esconder gráficos e detalhes' : 'Mostrar gráficos: para onde vai a entrada, gastos fixos e parcelados'}
        >
          <BarChart3 size={14} /> Detalhes {detalhes ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {comparacoes && !detalhes && <ResumoComparativo comparacoes={comparacoes} abrir={abrirDetalhes} />}

      {detalhes && (
        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {comparacoes && <Comparativo comparacoes={comparacoes} />}
          <Composicao t={t} />
          <Fixos t={t} />
          <Parcelados itens={itens} ano={ano} mes={mes} total={t.parcelados} />
        </div>
      )}
    </div>
  )
}
