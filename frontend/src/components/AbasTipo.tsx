import { useEffect, useState } from 'react'
import { arred, brl, tipoDe, type TipoItem } from '../lib/money'
import type { Grupo, Lancamento } from '../lib/types'

export type Aba = 'todos' | 'fixos' | 'parcelas' | 'avulsos'

// Em "Gastos do mês" ficam os avulsos e os que repetem todo mês com valor variável (gasolina, mercado)
const TIPOS_DA_ABA: Record<Exclude<Aba, 'todos'>, TipoItem[]> = { fixos: ['fixo'], parcelas: ['parcelado'], avulsos: ['avulso', 'variavel'] }

export function filtrarPorAba(itens: Lancamento[], aba: Aba): Lancamento[] {
  return aba === 'todos' ? itens : itens.filter((l) => TIPOS_DA_ABA[aba].includes(tipoDe(l)))
}

/** Como um item novo nasce, para continuar aparecendo na aba em que foi criado */
export function novoItemDaAba(aba: Aba): Partial<Lancamento> {
  switch (aba) {
    case 'fixos':
      return { recorrente: true }
    case 'parcelas':
      // Um parcelado precisa de parcelas; começa em 1/2 e é ajustado pelo menu da coluna Tipo
      return { recorrente: false, parcela_atual: 1, parcela_total: 2 }
    default:
      return {}
  }
}

/** Aba escolhida em cada tabela, lembrada entre visitas */
export function useAba(grupo: Grupo): [Aba, (a: Aba) => void] {
  const chave = `financeiro.aba.${grupo}`
  const [aba, setAba] = useState<Aba>(() => {
    try {
      const salva = localStorage.getItem(chave)
      return salva === 'fixos' || salva === 'parcelas' || salva === 'avulsos' ? salva : 'todos'
    } catch {
      return 'todos'
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(chave, aba)
    } catch {
      /* sem armazenamento: só não lembra a escolha */
    }
  }, [chave, aba])

  return [aba, setAba]
}

interface Props {
  /** Todos os itens do grupo (sem filtro), para contar cada aba */
  itens: Lancamento[]
  aba: Aba
  onChange: (aba: Aba) => void
  /** Nome da aba dos fixos (ex.: "Assinaturas" no cartão) */
  rotuloFixos: string
}

/** Abas que separam a tabela em Assinaturas/Fixos, Parcelas e Gastos do mês, além da visão unificada */
export function AbasTipo({ itens, aba, onChange, rotuloFixos }: Props) {
  const abas: { id: Aba; nome: string; ajuda: string }[] = [
    { id: 'todos', nome: 'Todos', ajuda: 'Tudo junto' },
    { id: 'fixos', nome: rotuloFixos, ajuda: 'Itens fixos, que se repetem todo mês' },
    { id: 'parcelas', nome: 'Parcelas', ajuda: 'Compras parceladas, com prazo para acabar' },
    { id: 'avulsos', nome: 'Gastos do mês', ajuda: 'Gastos do mês: avulsos, ou que repetem todo mês com valor variável (gasolina, mercado)' },
  ]

  return (
    <div role="tablist" className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50 px-2 pt-1.5">
      {abas.map((a) => {
        const lista = filtrarPorAba(itens, a.id)
        const total = arred(lista.reduce((s, l) => s + l.valor, 0))
        const ativa = aba === a.id
        return (
          <button
            key={a.id}
            role="tab"
            aria-selected={ativa}
            onClick={() => onChange(a.id)}
            title={`${a.ajuda} · ${lista.length} ${lista.length === 1 ? 'item' : 'itens'} · ${brl(total)}`}
            className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-lg border border-b-0 px-3 py-1.5 text-xs font-semibold transition ${
              ativa ? '-mb-px border-slate-200 bg-white text-slate-900' : 'border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700'
            }`}
          >
            {a.nome}
            <span className={`num rounded-full px-1.5 text-[10px] ${ativa ? 'bg-slate-100 text-slate-600' : 'bg-slate-200/70 text-slate-500'}`}>{lista.length}</span>
          </button>
        )
      })}
    </div>
  )
}
