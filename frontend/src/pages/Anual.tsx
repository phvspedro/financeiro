import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../lib/api'
import { useEscuro } from '../lib/aparencia'
import { arred, brl, MESES } from '../lib/money'
import type { TotaisAno } from '../lib/types'

interface Props {
  ano: number
  abrirMes: (mes: number) => void
  avisar: (texto: string, tipo?: 'ok' | 'erro') => void
}

const CORES = { entradas: '#1baf7a', saidas: '#e34948', sobra: '#2a78d6' }

/** Cores dos elementos dos gráficos (o SVG não usa as classes do tema) */
const eixos = (escuro: boolean) => ({
  grade: escuro ? '#334155' : '#e2e8f0',
  linha: escuro ? '#475569' : '#cbd5e1',
  texto: escuro ? '#94a3b8' : '#64748b',
  cursor: escuro ? '#334155' : '#f1f5f9',
  dica: { borderRadius: 8, fontSize: 12, border: `1px solid ${escuro ? '#475569' : '#e2e8f0'}`, background: escuro ? '#1e293b' : '#fff', color: escuro ? '#e2e8f0' : '#1e293b' },
})

const linhas: { chave: keyof TotaisAno; nome: string; forte?: boolean }[] = [
  { chave: 'entradas', nome: 'Entrada' },
  { chave: 'saidas', nome: 'Saída' },
  { chave: 'final', nome: 'Final', forte: true },
  { chave: 'cartao', nome: 'Total Cartão' },
  { chave: 'pix', nome: 'Total PIX' },
  { chave: 'custo', nome: 'Cartão + PIX' },
  { chave: 'salario_menos_custo', nome: 'Salário − Custo' },
  { chave: 'sobra', nome: 'Sobra (fixo + flex)', forte: true },
  { chave: 'total_fixo', nome: 'Total fixo mês' },
  { chave: 'cortavel', nome: 'Dá pra cortar' },
  { chave: 'minimo', nome: 'Mínimo possível', forte: true },
  { chave: 'parcelados', nome: 'Parcelados (com prazo)' },
  { chave: 'variaveis', nome: 'Gastos variáveis (previsto)' },
]

const curto = (n: number) => MESES[n - 1].slice(0, 3)
const compacto = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })

export function Anual({ ano, abrirMes, avisar }: Props) {
  const [meses, setMeses] = useState<TotaisAno[] | null>(null)
  const escuro = useEscuro()
  const c = eixos(escuro)

  useEffect(() => {
    let ativo = true
    setMeses(null)
    api
      .get(`/anual/${ano}`)
      .then(({ data }) => ativo && setMeses(data.meses))
      .catch(() => avisar('Não foi possível carregar o ano.', 'erro'))
    return () => {
      ativo = false
    }
  }, [ano, avisar])

  if (!meses) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-400">
        <Loader2 className="animate-spin" />
      </div>
    )
  }

  const usados = meses.filter((m) => !m.vazio)
  const soma = (k: keyof TotaisAno) => arred(usados.reduce((s, m) => s + ((m[k] as number) ?? 0), 0))
  const dados = meses.map((m) => ({ nome: curto(m.mes), mes: m.mes, entradas: m.entradas ?? 0, saidas: m.saidas ?? 0, final: m.final ?? 0 }))
  // Nas linhas, mês sem lançamentos fica vazio (em vez de despencar para zero)
  const linhasDados = meses.map((m) => ({
    nome: curto(m.mes),
    mes: m.mes,
    entradas: m.vazio ? null : (m.entradas ?? 0),
    saidas: m.vazio ? null : (m.saidas ?? 0),
    sobra: m.vazio ? null : (m.sobra ?? 0),
  }))

  // Mês mais caro e mais barato (pelas saídas), só faz sentido com pelo menos dois meses
  const comSaida = usados.filter((m) => m.saidas !== undefined)
  const caro = comSaida.length > 1 ? comSaida.reduce((a, b) => ((b.saidas ?? 0) > (a.saidas ?? 0) ? b : a)) : null
  const barato = comSaida.length > 1 ? comSaida.reduce((a, b) => ((b.saidas ?? 0) < (a.saidas ?? 0) ? b : a)) : null

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {(
          [
            { t: `Entradas ${ano}`, v: soma('entradas') },
            { t: `Saídas ${ano}`, v: soma('saidas') },
            { t: 'Saldo acumulado', v: soma('final') },
            { t: 'Média final / mês', v: usados.length ? arred(soma('final') / usados.length) : 0 },
            ...(caro ? [{ t: 'Mês mais caro', v: caro.saidas ?? 0, mes: caro.mes, cor: 'text-red-600' }] : []),
            ...(barato ? [{ t: 'Mês mais barato', v: barato.saidas ?? 0, mes: barato.mes, cor: 'text-green-700' }] : []),
          ] as { t: string; v: number; mes?: number; cor?: string }[]
        ).map((card) => {
          const Tag = card.mes ? 'button' : 'div'
          return (
            <Tag
              key={card.t}
              onClick={card.mes ? () => abrirMes(card.mes!) : undefined}
              className={`rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm ${card.mes ? 'transition hover:border-green-500 hover:ring-1 hover:ring-green-500' : ''}`}
              title={card.mes ? `Abrir ${MESES[card.mes - 1]}` : undefined}
            >
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {card.t}
                {card.mes && <span className={`ml-1 capitalize ${card.cor}`}>· {curto(card.mes)}</span>}
              </div>
              <div className={`num mt-1 text-lg font-bold sm:text-2xl ${card.v < 0 ? 'text-red-600' : 'text-slate-900'}`}>{brl(card.v)}</div>
            </Tag>
          )
        })}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-1 text-sm font-bold text-slate-700">Entradas x Saídas por mês</h2>
        <p className="mb-3 text-xs text-slate-500">Clique numa barra para abrir o mês.</p>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dados} barGap={2} margin={{ left: 8, right: 8 }}>
              <CartesianGrid vertical={false} stroke={c.grade} />
              <XAxis dataKey="nome" tickLine={false} axisLine={{ stroke: c.linha }} tick={{ fill: c.texto, fontSize: 12 }} />
              <YAxis tickFormatter={(v) => compacto.format(v)} tickLine={false} axisLine={false} tick={{ fill: c.texto, fontSize: 12 }} width={48} />
              <Tooltip
                cursor={{ fill: c.cursor }}
                formatter={(v, nome) => [brl(Number(v)), nome]}
                labelFormatter={(l, p) => {
                  const final = p?.[0]?.payload?.final ?? 0
                  return `${l} · Final ${brl(final)}`
                }}
                contentStyle={c.dica}
              />
              <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine y={0} stroke={c.texto} />
              <Bar dataKey="entradas" name="Entradas" fill={CORES.entradas} radius={[4, 4, 0, 0]} maxBarSize={28} className="cursor-pointer" onClick={(d) => abrirMes((d.payload as { mes: number }).mes)} />
              <Bar dataKey="saidas" name="Saídas" fill={CORES.saidas} radius={[4, 4, 0, 0]} maxBarSize={28} className="cursor-pointer" onClick={(d) => abrirMes((d.payload as { mes: number }).mes)} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-1 text-sm font-bold text-slate-700">Entradas × Saídas × Sobra</h2>
        <p className="mb-3 text-xs text-slate-500">Como o ano evolui mês a mês. Clique num ponto para abrir o mês.</p>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={linhasDados}
              margin={{ left: 8, right: 8, top: 4 }}
              onClick={(e) => {
                const i = Number((e as { activeIndex?: string | number | null } | undefined)?.activeIndex)
                if (Number.isInteger(i) && linhasDados[i] && linhasDados[i].entradas !== null) abrirMes(linhasDados[i].mes)
              }}
              className="cursor-pointer"
            >
              <CartesianGrid vertical={false} stroke={c.grade} />
              <XAxis dataKey="nome" tickLine={false} axisLine={{ stroke: c.linha }} tick={{ fill: c.texto, fontSize: 12 }} />
              <YAxis tickFormatter={(v) => compacto.format(v)} tickLine={false} axisLine={false} tick={{ fill: c.texto, fontSize: 12 }} width={48} />
              <Tooltip cursor={{ stroke: c.linha }} formatter={(v, nome) => [brl(Number(v)), nome]} contentStyle={c.dica} />
              <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine y={0} stroke={c.texto} />
              <Line type="monotone" dataKey="entradas" name="Entradas" stroke={CORES.entradas} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              <Line type="monotone" dataKey="saidas" name="Saídas" stroke={CORES.saidas} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              <Line type="monotone" dataKey="sobra" name="Sobra" stroke={CORES.sobra} strokeWidth={2.5} strokeDasharray="5 3" dot={{ r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="num w-full min-w-[900px] text-sm">
          <thead>
            <tr className="bg-blue-700 text-xs uppercase tracking-wide text-white">
              <th className="sticky left-0 bg-blue-700 px-3 py-2 text-left">{ano}</th>
              {meses.map((m) => (
                <th key={m.mes} className="px-2 py-2 text-right">
                  <button onClick={() => abrirMes(m.mes)} className="uppercase hover:underline" title={`Abrir ${MESES[m.mes - 1]}`}>
                    {curto(m.mes)}
                  </button>
                  {caro?.mes === m.mes && <span className="ml-1 rounded bg-red-500 px-1 text-[10px] font-bold" title="Mês mais caro (maior saída)">▲</span>}
                  {barato?.mes === m.mes && <span className="ml-1 rounded bg-green-500 px-1 text-[10px] font-bold" title="Mês mais barato (menor saída)">▼</span>}
                </th>
              ))}
              <th className="bg-blue-800 px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.chave} className={`border-b border-slate-100 ${l.forte ? 'bg-slate-50 font-semibold' : ''}`}>
                <td className="sticky left-0 bg-inherit whitespace-nowrap px-3 py-1.5 text-slate-700">{l.nome}</td>
                {meses.map((m) => {
                  const v = m[l.chave] as number | undefined
                  return (
                    <td
                      key={m.mes}
                      onClick={m.vazio ? undefined : () => abrirMes(m.mes)}
                      className={`whitespace-nowrap px-2 py-1.5 text-right ${m.vazio ? 'text-slate-300' : `cursor-pointer hover:bg-slate-100 ${v! < 0 ? 'text-red-600' : ''}`} ${caro?.mes === m.mes ? 'bg-red-50' : barato?.mes === m.mes ? 'bg-green-50' : ''}`}
                    >
                      {m.vazio ? '–' : brl(v)}
                    </td>
                  )
                })}
                <td className={`whitespace-nowrap bg-slate-100 px-3 py-1.5 text-right font-semibold ${soma(l.chave) < 0 ? 'text-red-600' : ''}`}>{brl(soma(l.chave))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
