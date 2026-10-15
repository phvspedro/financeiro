import { ArrowRightLeft, Check, ChevronDown, ChevronUp, Lock, LockOpen, Plus, Repeat, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { alertaAberto } from '../lib/alerta'
import { arred, brl, chaveItem, lerValor, lerVencimento, numero, textoVencimento } from '../lib/money'
import type { Grupo, Lancamento, ValoresAnteriores } from '../lib/types'
import type { AcoesGrade } from './Grade'
import { Variacao, Vencimento } from './Indicadores'
import { BadgeTipo } from './TipoCelula'

interface Props {
  itens: Lancamento[]
  grupo: Grupo
  acoes: AcoesGrade
  ano: number
  mes: number
  anterior: ValoresAnteriores
  hoje: string
  check?: 'pago' | 'recebido'
  orcamento?: boolean
  parcelas?: boolean
  vencimento?: boolean
  essencial?: boolean
  categoriaFixos?: string
  rotuloFixo: string
  novoItem?: Partial<Lancamento>
  totalValor: number
  totalReal: number
  /** Abre o menu de tipo/parcelas (folha) para o item */
  abrirTipo: (item: Lancamento, ancora: HTMLElement) => void
  /** Há ordenação ativa: subir/descer fica desligado (a ordem salva não muda) */
  ordenado?: boolean
  /** Há filtro ativo: a lista pode estar mostrando só parte dos itens */
  filtrando?: boolean
  /** Mostra o botão flutuante "+" para lançar rápido */
  fab?: boolean
}

/**
 * Versão de celular das tabelas: um cartão por item (toque para editar numa folha),
 * check de pago/recebido direto no cartão e botão grande para adicionar.
 */
export function ListaMovel({
  itens, grupo, acoes, ano, mes, anterior, hoje, check, orcamento, parcelas, vencimento, essencial, categoriaFixos, rotuloFixo, novoItem,
  totalValor, totalReal, abrirTipo, ordenado, filtrando, fab,
}: Props) {
  const [editando, setEditando] = useState<number | null>(null)
  const [novo, setNovo] = useState(false)
  const temAnterior = Object.keys(anterior).length > 0
  const item = itens.find((i) => i.id === editando)

  return (
    <div className={`text-sm ${fab ? 'pb-20' : ''}`}>
      {itens.length === 0 && (
        <p className="px-4 py-8 text-center text-slate-400">
          {filtrando ? 'Nenhum item com esses filtros.' : 'Nenhum item. Toque em “Adicionar” para começar.'}
        </p>
      )}

      <ul>
        {itens.map((i) => {
          const pendente = orcamento && i.real == null
          const dif = arred(i.valor - (i.real ?? 0))
          const marcado = check && i.pago
          return (
            <li key={i.id} className="border-b border-slate-100">
              <Deslizar
                aoDireita={
                  check
                    ? { rotulo: i.pago ? 'Desmarcar' : check === 'pago' ? 'Pago' : 'Recebido', acao: () => acoes.atualizar(i.id, { pago: !i.pago }) }
                    : orcamento && pendente
                      ? { rotulo: 'Real = previsto', acao: () => acoes.atualizar(i.id, { real: i.valor }) }
                      : undefined
                }
                aoEsquerda={{ rotulo: 'Excluir', acao: () => acoes.remover(i.id) }}
                className={`flex items-stretch ${marcado ? 'bg-green-50/70' : 'bg-white'}`}
              >
              {check && (
                <label className="flex w-12 shrink-0 cursor-pointer items-center justify-center" title={check === 'pago' ? 'Marcar como pago' : 'Marcar como recebido'}>
                  <input
                    type="checkbox"
                    checked={i.pago}
                    onChange={(e) => acoes.atualizar(i.id, { pago: e.target.checked })}
                    className="h-5 w-5 accent-green-600"
                  />
                </label>
              )}

              <button
                onClick={() => setEditando(i.id)}
                className={`flex min-w-0 flex-1 flex-col gap-1 py-2.5 pr-3 text-left active:bg-slate-100 ${check ? '' : 'pl-3'}`}
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className={`truncate text-[15px] font-medium ${marcado ? 'text-slate-500' : 'text-slate-900'}`}>{i.nome}</span>
                  <span className="num flex shrink-0 items-center gap-1 text-[15px] font-semibold text-slate-900">
                    <Variacao atual={i.valor} antes={anterior[chaveItem(i)]} temAnterior={temAnterior} entrada={grupo === 'entrada'} />
                    {i.valor ? numero(i.valor) : <span className="text-slate-300">–</span>}
                  </span>
                </span>

                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  {vencimento && i.vencimento && (
                    <span className="flex">
                      <Vencimento item={i} hoje={hoje} ano={ano} />
                    </span>
                  )}
                  {parcelas && <BadgeTipo item={i} modo={categoriaFixos ? 'categoria' : 'tipo'} rotuloFixos={categoriaFixos ?? 'Fixo'} />}
                  {!parcelas && i.recorrente && (
                    <span className="flex items-center gap-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-[11px] font-semibold text-blue-700">
                      <Repeat size={11} /> Fixo
                    </span>
                  )}
                  {essencial && i.recorrente && !i.variavel && i.essencial && <Lock size={12} className="text-amber-600" aria-label="Essencial" />}

                  {orcamento && (
                    <span className="num ml-auto flex items-center gap-2 text-xs">
                      <span className={`rounded px-1.5 py-0.5 ${pendente ? 'bg-yellow-200/80 text-yellow-800' : 'bg-slate-100 text-slate-700'}`}>
                        Real {pendente ? '0,00' : numero(i.real)}
                      </span>
                      <span className={dif < 0 ? 'font-semibold text-red-600' : dif > 0 ? 'text-green-700' : 'text-slate-400'}>{numero(dif)}</span>
                    </span>
                  )}
                </span>
              </button>

              {orcamento && pendente && (
                <button
                  onClick={() => acoes.atualizar(i.id, { real: i.valor })}
                  className="flex w-11 shrink-0 items-center justify-center border-l border-yellow-200 bg-yellow-100 text-yellow-800 active:bg-yellow-200"
                  title="Usar o valor previsto como real"
                  aria-label="Usar o valor previsto como real"
                >
                  <Check size={18} />
                </button>
              )}
              </Deslizar>
            </li>
          )
        })}
      </ul>

      <button onClick={() => setNovo(true)} className="flex w-full items-center justify-center gap-2 border-b border-slate-100 py-3.5 font-medium text-green-700 active:bg-green-50">
        <Plus size={18} /> Adicionar
      </button>

      {fab && (
        <button
          onClick={() => setNovo(true)}
          className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-green-600 text-white shadow-lg shadow-black/25 active:scale-95 active:bg-green-700"
          aria-label="Adicionar item"
        >
          <Plus size={28} />
        </button>
      )}

      <div className="num flex items-center justify-between bg-slate-50 px-4 py-2.5 font-semibold">
        <span className="text-slate-600">Total</span>
        {orcamento ? (
          <span className="flex gap-4">
            <span>
              <span className="mr-1 text-xs font-normal text-slate-500">Prev.</span>
              {numero(totalValor)}
            </span>
            <span>
              <span className="mr-1 text-xs font-normal text-slate-500">Real</span>
              {numero(totalReal)}
            </span>
          </span>
        ) : (
          <span>{brl(totalValor)}</span>
        )}
      </div>

      {item && (
        <FolhaItem
          key={item.id}
          item={item}
          posicao={itens.indexOf(item)}
          total={itens.length}
          ordenado={ordenado}
          moverGrupo={grupo === 'cartao' || grupo === 'pix' ? () => { setEditando(null); acoes.mover(item, grupo === 'cartao' ? 'pix' : 'cartao') } : undefined}
          {...{ ano, mes, check, orcamento, parcelas, vencimento, essencial, categoriaFixos, rotuloFixo }}
          fechar={() => setEditando(null)}
          salvar={(dados) => acoes.atualizar(item.id, dados)}
          remover={() => {
            setEditando(null)
            acoes.remover(item.id)
          }}
          mover={(delta) => {
            const ids = itens.map((x) => x.id)
            const de = ids.indexOf(item.id)
            const para = de + delta
            if (para < 0 || para >= ids.length) return
            ids.splice(para, 0, ids.splice(de, 1)[0])
            acoes.reordenar(grupo, ids)
          }}
          abrirTipo={(ancora) => abrirTipo(item, ancora)}
        />
      )}

      {novo && (
        <FolhaNovo
          fechar={() => setNovo(false)}
          criar={async (nome, valor) => {
            await acoes.criar(grupo, { ...novoItem, nome, valor })
          }}
        />
      )}
    </div>
  )
}

interface AcaoDeslize {
  rotulo: string
  acao: () => void
}

/**
 * Item que acompanha o dedo: deslizar para a direita marca (pago / real = previsto),
 * para a esquerda exclui. A ação só dispara depois de passar do limite ao soltar.
 */
function Deslizar({ children, aoDireita, aoEsquerda, className = '' }: { children: ReactNode; aoDireita?: AcaoDeslize; aoEsquerda?: AcaoDeslize; className?: string }) {
  const LIMITE = 88
  const [dx, setDx] = useState(0)
  const [solto, setSolto] = useState(true)
  const inicio = useRef<{ x: number; y: number } | null>(null)
  const horizontal = useRef<boolean | null>(null)

  const limitar = (v: number) => Math.max(aoEsquerda ? -140 : 0, Math.min(aoDireita ? 140 : 0, v))

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-between text-sm font-semibold text-white" aria-hidden>
        <span className={`flex h-full items-center gap-1.5 overflow-hidden whitespace-nowrap bg-green-600 pl-4 ${dx > 0 ? '' : 'invisible'}`} style={{ width: Math.max(dx, 0) }}>
          <Check size={18} /> {dx >= LIMITE ? aoDireita?.rotulo : ''}
        </span>
        <span className={`flex h-full items-center justify-end gap-1.5 overflow-hidden whitespace-nowrap bg-red-600 pr-4 ${dx < 0 ? '' : 'invisible'}`} style={{ width: Math.max(-dx, 0) }}>
          {dx <= -LIMITE ? aoEsquerda?.rotulo : ''} <Trash2 size={18} />
        </span>
      </div>
      <div
        className={className}
        style={{ transform: `translateX(${dx}px)`, transition: solto ? 'transform 0.2s ease' : 'none', touchAction: 'pan-y' }}
        onTouchStart={(e) => {
          inicio.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
          horizontal.current = null
        }}
        onTouchMove={(e) => {
          if (!inicio.current) return
          const mx = e.touches[0].clientX - inicio.current.x
          const my = e.touches[0].clientY - inicio.current.y
          if (horizontal.current === null && (Math.abs(mx) > 10 || Math.abs(my) > 10)) horizontal.current = Math.abs(mx) > Math.abs(my) * 1.5
          if (!horizontal.current) return
          setSolto(false)
          setDx(limitar(mx))
        }}
        onTouchEnd={() => {
          const final = dx
          inicio.current = null
          setSolto(true)
          setDx(0)
          if (horizontal.current && final >= LIMITE) aoDireita?.acao()
          else if (horizontal.current && final <= -LIMITE) aoEsquerda?.acao()
          horizontal.current = null
        }}
        onTouchCancel={() => {
          inicio.current = null
          horizontal.current = null
          setSolto(true)
          setDx(0)
        }}
      >
        {children}
      </div>
    </div>
  )
}

/** Folha que sobe da parte de baixo da tela */
function Folha({ titulo, fechar, children }: { titulo: ReactNode; fechar: () => void; children: ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !alertaAberto() && fechar()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [fechar])

  return createPortal(
    <div className="fixed inset-0 z-[45] flex items-end bg-black/40" onMouseDown={(e) => e.target === e.currentTarget && fechar()}>
      <div role="dialog" aria-modal="true" className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3">
          <h3 className="truncate text-base font-bold text-slate-900">{titulo}</h3>
          <button onClick={fechar} className="rounded-lg p-1.5 text-slate-500 active:bg-slate-100" aria-label="Fechar">
            <X size={20} />
          </button>
        </header>
        <div className="space-y-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

const entrada =
  'num w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/20'

function Campo({ rotulo, ajuda, children }: { rotulo: string; ajuda?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{rotulo}</span>
      {children}
      {ajuda && <span className="mt-1 block text-xs text-slate-400">{ajuda}</span>}
    </label>
  )
}

/** Campo de valor com atalho "+" (o teclado numérico do celular não tem o sinal) */
function CampoValor({ valor, onChange, placeholder }: { valor: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="flex gap-2">
      <input value={valor} onChange={(e) => onChange(e.target.value)} inputMode="decimal" placeholder={placeholder} className={entrada} />
      <button type="button" onClick={() => onChange(valor + '+')} className="w-12 shrink-0 rounded-lg border border-slate-300 bg-slate-50 text-lg font-semibold text-slate-600 active:bg-slate-200" aria-label="Somar">
        +
      </button>
    </div>
  )
}

interface FolhaItemProps {
  item: Lancamento
  posicao: number
  total: number
  ordenado?: boolean
  /** Presente nos itens de Cartão/PIX: passa o item para o outro grupo */
  moverGrupo?: () => void
  ano: number
  mes: number
  check?: 'pago' | 'recebido'
  orcamento?: boolean
  parcelas?: boolean
  vencimento?: boolean
  essencial?: boolean
  categoriaFixos?: string
  rotuloFixo: string
  fechar: () => void
  salvar: (dados: Partial<Lancamento>) => void
  remover: () => void
  mover: (delta: number) => void
  abrirTipo: (ancora: HTMLElement) => void
}

function FolhaItem({ item, posicao, total, ordenado, moverGrupo, ano, mes, check, orcamento, parcelas, vencimento, essencial, categoriaFixos, rotuloFixo, fechar, salvar, remover, mover, abrirTipo }: FolhaItemProps) {
  const [nome, setNome] = useState(item.nome)
  const [valor, setValor] = useState(numero(item.valor))
  const [real, setReal] = useState(item.real == null ? '' : numero(item.real))
  const [venc, setVenc] = useState(textoVencimento(item.vencimento))
  const [erro, setErro] = useState('')

  function confirmar() {
    const dados: Partial<Lancamento> = {}
    if (!nome.trim()) return setErro('Informe o nome.')
    if (nome.trim() !== item.nome) dados.nome = nome.trim()

    const v = valor.trim() ? lerValor(valor) : 0
    if (v == null) return setErro('Valor inválido. Ex.: 540,50 ou 540+60.')
    if (v !== item.valor) dados.valor = v

    if (orcamento) {
      const r = real.trim() ? lerValor(real) : null
      if (real.trim() && r == null) return setErro('Real inválido.')
      if (r !== item.real) dados.real = r
    }

    if (vencimento) {
      const d = lerVencimento(venc, ano, mes)
      if (d === undefined) return setErro('Vencimento inválido. Use 10, 10/11 ou 10/11/2026.')
      if (d !== item.vencimento) dados.vencimento = d
    }

    if (Object.keys(dados).length) salvar(dados)
    fechar()
  }

  const chave = (ativo: boolean) => `flex w-full items-center justify-between rounded-lg border px-3 py-3 text-left text-base ${ativo ? 'border-green-600 bg-green-50' : 'border-slate-200 bg-white'}`

  return (
    <Folha titulo={item.nome} fechar={fechar}>
      <Campo rotulo="Nome">
        <input value={nome} onChange={(e) => setNome(e.target.value)} className={entrada} />
      </Campo>

      <div className={orcamento ? 'grid grid-cols-2 gap-3' : ''}>
        <Campo rotulo={orcamento ? 'Valor previsto' : 'Valor'}>
          <CampoValor valor={valor} onChange={setValor} placeholder="0,00 ou 540+60" />
        </Campo>
        {orcamento && (
          <Campo rotulo="Real" ajuda={item.real == null ? 'Ainda não lançado' : undefined}>
            <CampoValor valor={real} onChange={setReal} placeholder="0,00" />
          </Campo>
        )}
      </div>

      {vencimento && (
        <Campo rotulo="Vencimento" ajuda="Dia (10), dia/mês (10/11) ou data completa. Vazio limpa.">
          <input value={venc} onChange={(e) => setVenc(e.target.value)} inputMode="numeric" placeholder="dd/mm" className={entrada} />
        </Campo>
      )}

      {erro && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

      <button onClick={confirmar} className="w-full rounded-lg bg-green-600 py-3 text-base font-semibold text-white active:bg-green-700">
        Salvar
      </button>

      <div className="space-y-2 border-t border-slate-100 pt-3">
        {check && (
          <button onClick={() => salvar({ pago: !item.pago })} className={chave(item.pago)}>
            {check === 'pago' ? 'Pago' : 'Recebido'}
            <span className={`flex h-6 w-6 items-center justify-center rounded-md ${item.pago ? 'bg-green-600 text-white' : 'border border-slate-300'}`}>{item.pago && <Check size={16} />}</span>
          </button>
        )}

        {parcelas && (
          <button onClick={(e) => abrirTipo(e.currentTarget)} className={chave(false)}>
            <span>
              Tipo
              <span className="ml-2 inline-flex align-middle">
                <BadgeTipo item={item} modo={categoriaFixos ? 'categoria' : 'tipo'} rotuloFixos={categoriaFixos ?? 'Fixo'} />
              </span>
            </span>
            <span className="text-sm text-slate-400">Alterar…</span>
          </button>
        )}

        {!parcelas && (
          <button onClick={() => salvar(item.recorrente ? { recorrente: false, essencial: false } : { recorrente: true })} className={chave(item.recorrente)}>
            <span className="flex items-center gap-2">
              <Repeat size={18} /> {rotuloFixo}
            </span>
            <span className={`flex h-6 w-6 items-center justify-center rounded-md ${item.recorrente ? 'bg-green-600 text-white' : 'border border-slate-300'}`}>{item.recorrente && <Check size={16} />}</span>
          </button>
        )}

        {essencial && item.recorrente && !item.variavel && (
          <button onClick={() => salvar({ essencial: !item.essencial })} className={chave(item.essencial)}>
            <span className="flex items-center gap-2">
              {item.essencial ? <Lock size={18} /> : <LockOpen size={18} />} Essencial (não dá pra cortar)
            </span>
            <span className={`flex h-6 w-6 items-center justify-center rounded-md ${item.essencial ? 'bg-green-600 text-white' : 'border border-slate-300'}`}>{item.essencial && <Check size={16} />}</span>
          </button>
        )}

        {moverGrupo && (
          <button onClick={moverGrupo} className={chave(false)}>
            <span className="flex items-center gap-2">
              <ArrowRightLeft size={18} /> Mover para {item.grupo === 'cartao' ? 'PIX' : 'Cartão'}
            </span>
          </button>
        )}

        <div className="flex gap-2">
          <button onClick={() => mover(-1)} disabled={ordenado || posicao === 0} className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 py-2.5 text-sm text-slate-600 disabled:opacity-40">
            <ChevronUp size={16} /> Subir
          </button>
          <button onClick={() => mover(1)} disabled={ordenado || posicao === total - 1} className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 py-2.5 text-sm text-slate-600 disabled:opacity-40">
            <ChevronDown size={16} /> Descer
          </button>
          <button onClick={remover} className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-red-200 py-2.5 text-sm font-medium text-red-600 active:bg-red-50">
            <Trash2 size={16} /> Excluir
          </button>
        </div>
      </div>
    </Folha>
  )
}

function FolhaNovo({ fechar, criar }: { fechar: () => void; criar: (nome: string, valor: number) => Promise<void> }) {
  const [nome, setNome] = useState('')
  const [valor, setValor] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function confirmar() {
    if (!nome.trim()) return setErro('Informe o nome.')
    const v = valor.trim() ? lerValor(valor) : 0
    if (v == null) return setErro('Valor inválido. Ex.: 540,50 ou 540+60.')
    setSalvando(true)
    await criar(nome.trim(), v)
    fechar()
  }

  return (
    <Folha titulo="Novo item" fechar={fechar}>
      <Campo rotulo="Nome">
        <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do item…" className={entrada} />
      </Campo>
      <Campo rotulo="Valor">
        <CampoValor valor={valor} onChange={setValor} placeholder="0,00 ou 540+60" />
      </Campo>
      {erro && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
      <button disabled={salvando} onClick={() => void confirmar()} className="w-full rounded-lg bg-green-600 py-3 text-base font-semibold text-white active:bg-green-700 disabled:opacity-60">
        Adicionar
      </button>
    </Folha>
  )
}
