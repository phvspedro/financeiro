import { CalendarClock, Repeat, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { terminaEm, tipoDe, type TipoItem } from '../lib/money'
import type { Lancamento } from '../lib/types'
import type { Direcao } from './Celula'

/**
 * 'tipo': mostra o tipo do item (Fixo, parcela 3/10, Avulso).
 * 'categoria': mostra o badge da categoria (Assinatura, Parcela, Gasto do mês), a mesma separação das abas.
 */
export type ModoTipo = 'tipo' | 'categoria'

const parcelaDe = (item: Lancamento) => (item.parcela_total ? `${item.parcela_atual ?? 1}/${item.parcela_total}` : '')

/** Nome, cor e explicação de cada categoria; "fixos" muda de nome conforme a tabela (Assinatura no cartão, Fixo no PIX) */
function categorias(rotuloFixos: string): Record<TipoItem, { nome: string; classe: string; ajuda: string }> {
  return {
    fixo: { nome: rotuloFixos, classe: 'bg-blue-100 text-blue-700', ajuda: 'Se repete todo mês (ex.: Netflix, condomínio, seguro do carro)' },
    parcelado: { nome: 'Parcela', classe: 'bg-violet-100 text-violet-700', ajuda: 'Compra parcelada, com prazo para acabar (ex.: TV em 10x)' },
    avulso: { nome: 'Gasto do mês', classe: 'bg-teal-100 text-teal-700', ajuda: 'Gasto avulso, só neste mês' },
    variavel: { nome: 'Gasto do mês', classe: 'bg-teal-100 text-teal-700', ajuda: 'Gasto que se repete todo mês, mas o valor muda (ex.: gasolina, mercado, lanches)' },
  }
}

function descricao(item: Lancamento, ano: number, mes: number) {
  const tipo = tipoDe(item)
  const parcela = parcelaDe(item)
  if (tipo === 'parcelado') return `Parcelado ${parcela}: termina em ${terminaEm(item, ano, mes).texto}`
  if (tipo === 'fixo') return `Fixo: repete todo mês${parcela ? ` (parcela ${parcela}, recomeça ao renovar)` : ''}`
  if (tipo === 'variavel') return 'Variável: repete todo mês, mas o valor muda (o valor é uma estimativa)'
  return 'Avulso: só neste mês'
}

interface CelulaProps {
  r: number
  item: Lancamento
  ano: number
  mes: number
  modo: ModoTipo
  rotuloFixos: string
  /** Abre o menu para trocar o tipo/categoria e as parcelas */
  onAbrir: (ancora: HTMLElement) => void
  onNavegar: (r: number, c: string, d: Direcao) => void
}

/** Célula da coluna Tipo. Clique ou Enter abre o menu. */
export function TipoCelula({ r, item, ano, mes, modo, rotuloFixos, onAbrir, onNavegar }: CelulaProps) {
  const tipo = tipoDe(item)
  const celula = useRef<HTMLDivElement>(null)
  const categoria = categorias(rotuloFixos)[tipo]
  const parcela = parcelaDe(item)

  function teclas(e: KeyboardEvent<HTMLDivElement>) {
    const mapa: Record<string, Direcao> = { ArrowUp: 'cima', ArrowDown: 'baixo', ArrowLeft: 'esquerda', ArrowRight: 'direita' }
    if (mapa[e.key]) {
      e.preventDefault()
      onNavegar(r, 'tipo', mapa[e.key])
    } else if (e.key === 'Tab') {
      e.preventDefault()
      onNavegar(r, 'tipo', e.shiftKey ? 'esquerda' : 'direita')
    } else if (e.key === 'Enter' || e.key === ' ' || e.key === 'F2' || /^\d$/.test(e.key)) {
      e.preventDefault()
      onAbrir(celula.current!)
    }
  }

  return (
    <div
      ref={celula}
      tabIndex={0}
      data-r={r}
      data-c="tipo"
      onKeyDown={teclas}
      onClick={() => onAbrir(celula.current!)}
      className="cell flex h-8 cursor-pointer items-center justify-center px-1"
      title={modo === 'categoria' ? `${categoria.nome}: ${categoria.ajuda}. Clique para alterar.` : descricao(item, ano, mes)}
    >
      {modo === 'categoria' ? (
        <span className={`flex items-center gap-1 truncate rounded-full px-2 py-0.5 text-[11px] font-semibold ${categoria.classe}`}>
          {categoria.nome}
          {tipo === 'variavel' && <Repeat size={10} aria-label="repete todo mês" />}
        </span>
      ) : (
        <>
          {tipo === 'fixo' && (
            <span className="num flex items-center gap-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-[11px] font-semibold text-blue-700">
              <Repeat size={11} />
              {parcela || 'Fixo'}
            </span>
          )}
          {tipo === 'parcelado' && (
            <span className="num flex items-center gap-1 rounded-full bg-violet-100 px-1.5 py-0.5 text-[11px] font-semibold text-violet-700">
              <CalendarClock size={11} />
              {parcela}
            </span>
          )}
          {tipo === 'variavel' && (
            <span className="flex items-center gap-1 rounded-full bg-teal-100 px-1.5 py-0.5 text-[11px] font-semibold text-teal-700">
              <Repeat size={11} />
              Variável
            </span>
          )}
          {tipo === 'avulso' && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">Avulso</span>}
        </>
      )}
    </div>
  )
}

/** Ícone de fixo/parcelado (com a parcela, ex.: 3/10) que fica ao lado do cadeado. Clique abre o mesmo menu. */
export function InfoTipo({ item, ano, mes, onAbrir }: { item: Lancamento; ano: number; mes: number; onAbrir: (ancora: HTMLElement) => void }) {
  const tipo = tipoDe(item)
  const parcela = parcelaDe(item)

  // Avulso: ícone discreto, só ao passar o mouse, para repetir o gasto todo mês
  if (tipo === 'avulso') {
    return (
      <button
        tabIndex={-1}
        onClick={(e) => onAbrir(e.currentTarget)}
        title="Avulso: só neste mês. Clique para fazer repetir todo mês (valor variável, parcelas ou fixo)."
        className="rounded p-1 text-slate-300 opacity-0 hover:bg-slate-100 hover:text-teal-600 group-hover:opacity-100"
      >
        <Repeat size={13} />
      </button>
    )
  }

  const cor = tipo === 'fixo' ? 'text-blue-600' : tipo === 'variavel' ? 'text-teal-600' : 'text-violet-700'

  return (
    <button
      tabIndex={-1}
      onClick={(e) => onAbrir(e.currentTarget)}
      title={`${descricao(item, ano, mes)}. Clique para alterar.`}
      className={`num flex items-center gap-0.5 rounded px-1 py-0.5 text-[11px] font-semibold hover:bg-slate-100 ${cor}`}
    >
      {tipo === 'parcelado' ? <CalendarClock size={13} /> : <Repeat size={13} />}
      {parcela}
    </button>
  )
}

interface MenuProps {
  ancora: HTMLElement
  item: Lancamento
  ano: number
  mes: number
  modo: ModoTipo
  rotuloFixos: string
  fechar: () => void
  salvar: (d: Partial<Lancamento>) => void
  /** Aplica o tipo e as parcelas deste item aos meses seguintes */
  propagar: () => void
}

type Escolha = 'fixo' | 'parcelado' | 'avulso'

/** Menu para escolher o tipo/categoria do item e as parcelas */
export function TipoMenu({ ancora, item, ano, mes, modo, rotuloFixos, fechar, salvar, propagar }: MenuProps) {
  const cat = categorias(rotuloFixos)
  const opcoes: { tipo: Escolha; nome: string; ajuda: string }[] =
    modo === 'categoria'
      ? [
          { tipo: 'fixo', nome: cat.fixo.nome, ajuda: cat.fixo.ajuda },
          { tipo: 'parcelado', nome: cat.parcelado.nome, ajuda: cat.parcelado.ajuda },
          { tipo: 'avulso', nome: cat.avulso.nome, ajuda: 'Gasto do mês: só neste mês, ou que se repete todo mês com valor variável (gasolina, mercado, lanches)' },
        ]
      : [
          { tipo: 'fixo', nome: 'Fixo', ajuda: 'Sempre se repete (ex.: condomínio, seguro do carro)' },
          { tipo: 'parcelado', nome: 'Parcelado', ajuda: 'Compra com prazo para acabar (ex.: TV em 10x)' },
          { tipo: 'avulso', nome: 'Avulso', ajuda: 'Só neste mês' },
        ]

  // "variável" é um avulso que repete todo mês: no menu aparece como Gasto do mês + caixa "repete"
  const inicial = tipoDe(item)
  const [tipo, setTipo] = useState<Escolha>(inicial === 'variavel' ? 'avulso' : inicial)
  const [repete, setRepete] = useState(inicial === 'variavel')
  const [atual, setAtual] = useState(String(item.parcela_atual ?? 1))
  const [total, setTotal] = useState(item.parcela_total ? String(item.parcela_total) : '')
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const caixa = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const r = ancora.getBoundingClientRect()
    const largura = 272
    const altura = caixa.current?.offsetHeight ?? 220
    const top = r.bottom + 4 + altura > window.innerHeight ? Math.max(8, r.top - altura - 4) : r.bottom + 4
    setPos({ top, left: Math.max(8, Math.min(window.innerWidth - largura - 8, r.right - largura)) })
  }, [ancora])

  useEffect(() => {
    const fora = (e: MouseEvent) => !caixa.current?.contains(e.target as Node) && !ancora.contains(e.target as Node) && fechar()
    const rolou = (e: Event) => !caixa.current?.contains(e.target as Node) && fechar()
    document.addEventListener('mousedown', fora)
    window.addEventListener('scroll', rolou, true)
    return () => {
      document.removeEventListener('mousedown', fora)
      window.removeEventListener('scroll', rolou, true)
    }
  }, [ancora, fechar])

  const nAtual = Number(atual)
  const nTotal = Number(total)
  const temParcela = total.trim() !== ''
  const parcelaValida = !temParcela || (Number.isInteger(nAtual) && Number.isInteger(nTotal) && nAtual >= 1 && nTotal >= 1 && nAtual <= nTotal)
  const erro =
    tipo === 'parcelado' && !temParcela ? 'Informe o total de parcelas' : !parcelaValida ? 'Parcela inválida' : ''
  const previa = { ...item, parcela_atual: nAtual || 1, parcela_total: nTotal || 1 }

  function confirmar() {
    if (erro) return
    const usaParcela = tipo !== 'avulso' && temParcela
    const variavel = tipo === 'avulso' && repete
    salvar({
      recorrente: tipo === 'fixo' || variavel,
      variavel,
      essencial: tipo === 'fixo' ? item.essencial : false,
      parcela_atual: usaParcela ? nAtual : null,
      parcela_total: usaParcela ? nTotal : null,
    })
  }

  function teclas(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      fechar()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      confirmar()
    }
  }

  const campo = 'num w-14 rounded-md border border-slate-300 px-2 py-1 text-center text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/20'

  return createPortal(
    <div
      ref={caixa}
      onKeyDown={teclas}
      style={{ top: pos.top, left: pos.left }}
      className="fixed z-50 w-[272px] rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-xl"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="truncate font-semibold text-slate-800">{item.nome}</span>
        <button onClick={fechar} className="rounded p-0.5 text-slate-400 hover:bg-slate-100">
          <X size={14} />
        </button>
      </div>

      <div className="space-y-1">
        {opcoes.map((o, i) => (
          <label key={o.tipo} className={`flex cursor-pointer items-start gap-2 rounded-lg p-1.5 ${tipo === o.tipo ? 'bg-slate-100' : 'hover:bg-slate-50'}`}>
            <input
              type="radio"
              name="tipo"
              autoFocus={tipo === o.tipo || (i === 0 && !opcoes.some((x) => x.tipo === tipo))}
              checked={tipo === o.tipo}
              onChange={() => setTipo(o.tipo)}
              className="mt-0.5 accent-green-600"
            />
            <span>
              <span className="font-medium text-slate-800">{o.nome}</span>
              <span className="block text-xs text-slate-500">{o.ajuda}</span>
            </span>
          </label>
        ))}
      </div>

      {tipo === 'avulso' && (
        <label className="mt-2 flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
          <input type="checkbox" checked={repete} onChange={(e) => setRepete(e.target.checked)} className="mt-0.5 accent-green-600" />
          <span>
            <span className="font-medium text-slate-800">Repete todo mês (o valor varia)</span>
            <span className="block text-xs text-slate-500">
              Ex.: gasolina, mercado, lanches. Vem para os meses seguintes com o valor como estimativa e não entra no Total fixo.
            </span>
          </span>
        </label>
      )}

      {tipo !== 'avulso' && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <div className="flex items-center gap-2 text-slate-600">
            Parcela
            <input value={atual} onChange={(e) => setAtual(e.target.value.replace(/\D/g, ''))} className={campo} inputMode="numeric" />
            de
            <input
              value={total}
              onChange={(e) => setTotal(e.target.value.replace(/\D/g, ''))}
              className={campo}
              inputMode="numeric"
              placeholder={tipo === 'fixo' ? '–' : '10'}
              autoFocus={tipo === 'parcelado' && !item.parcela_total}
            />
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            {tipo === 'fixo'
              ? temParcela
                ? 'Na última parcela, volta para 1 no mês seguinte (renovação).'
                : 'Opcional: preencha se o fixo for pago em parcelas.'
              : temParcela && parcelaValida
                ? <>Termina em <b className="text-violet-700">{terminaEm(previa, ano, mes).texto}</b> e depois some sozinho. Ao salvar, os meses seguintes são ajustados (e criados, se faltarem).</>
                : 'Passa para o mês seguinte até a última parcela.'}
          </p>
        </div>
      )}

      {erro && <p className="mt-2 text-xs font-medium text-red-600">{erro}</p>}

      <button
        onClick={propagar}
        className="mt-3 w-full rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-green-500 hover:bg-green-50 hover:text-green-700"
        title="Ajusta este item nos meses seguintes (e cria os meses que faltarem até a última parcela), do jeito que ele está salvo agora"
      >
        Aplicar aos próximos meses…
      </button>

      <div className="mt-3 flex justify-end gap-2">
        <button onClick={fechar} className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100">
          Cancelar
        </button>
        <button onClick={confirmar} disabled={!!erro} className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50">
          Salvar
        </button>
      </div>
    </div>,
    document.body,
  )
}
