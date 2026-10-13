import { ArrowDown, ArrowUp, Check, CheckCheck, GripVertical, Lock, LockOpen, Plus, Repeat, Trash2 } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { arred, brl, chaveItem, fmtVencimento, hojeISO, lerValor, lerVencimento, numero, statusVencimento, textoVencimento } from '../lib/money'
import type { Grupo, Lancamento, ValoresAnteriores } from '../lib/types'
import { Celula, type Direcao } from './Celula'
import { InfoTipo, TipoCelula, TipoMenu } from './TipoCelula'

export interface AcoesGrade {
  atualizar: (id: number, dados: Partial<Lancamento>) => void
  /** Vários itens de uma vez, como uma só ação no histórico (um único desfazer reverte tudo) */
  /** Muda o tipo/parcelas e pergunta se vale também para os meses seguintes que já existem */
  alterarTipo: (item: Lancamento, dados: Partial<Lancamento>) => void
  /** Aplica o tipo e as parcelas do item aos meses seguintes que já existem */
  propagar: (item: Lancamento) => void
  atualizarVarios: (alteracoes: { id: number; dados: Partial<Lancamento> }[], rotulo: string) => void
  criar: (grupo: Grupo, dados: Partial<Lancamento>) => Promise<Lancamento | undefined>
  remover: (id: number) => void
  reordenar: (grupo: Grupo, ids: number[]) => void
}

interface Props {
  titulo: string
  grupo: Grupo
  itens: Lancamento[]
  acoes: AcoesGrade
  /** Cor do título (classe tailwind de fundo) */
  corTitulo: string
  /** Planilha de orçamento: mostra Valor previsto, Real e Diferença */
  orcamento?: boolean
  /** Mostra a coluna de check (pago / recebido) */
  check?: 'pago' | 'recebido'
  /** Mostra a coluna Tipo (fixo / parcelado / avulso) */
  parcelas?: boolean
  /** Mostra a coluna de data de vencimento (Saídas) */
  vencimento?: boolean
  ano: number
  mes: number
  /** Valores do mês anterior, para indicar o que mudou */
  anterior: ValoresAnteriores
  rotuloFixo?: string
  /** Mostra o cadeado de "essencial" (não dá pra cortar) nos itens fixos */
  essencial?: boolean
  rodape?: ReactNode
  className?: string
  /**
   * Nome da categoria dos itens fixos (ex.: "Assinatura" no cartão, "Fixo" no PIX). Quando informado, a coluna Tipo
   * mostra o badge da categoria (Assinatura / Parcela / Gasto do mês) e o ícone de fixo/parcelado vai para o lado do cadeado.
   */
  categoriaFixos?: string
  /** Abas (ex.: Assinaturas / Parcelas / Gastos do mês), logo abaixo do título */
  abas?: ReactNode
  /** Nome da aba em uso, para identificar a ação no histórico (ex.: "Real = previsto · Cartão · Parcelas") */
  nomeAba?: string
  /** Como uma linha nova nasce (para continuar aparecendo na aba em que foi criada) */
  novoItem?: Partial<Lancamento>
}

const vazio = <span className="text-slate-300">–</span>

export function Grade({ titulo, grupo, itens, acoes, corTitulo, orcamento, check, parcelas, essencial, vencimento, ano, mes, anterior, className = '', abas, nomeAba, novoItem, categoriaFixos, rotuloFixo = 'Fixo: repete todo mês', rodape }: Props) {
  const tabela = useRef<HTMLDivElement>(null)
  // Menu do tipo/categoria: aberto pela célula da coluna Tipo ou pelo ícone ao lado do cadeado
  const [tipoAberto, setTipoAberto] = useState<{ id: number; r: number; ancora: HTMLElement } | null>(null)
  const modoTipo = categoriaFixos ? 'categoria' : 'tipo'
  const [arrastando, setArrastando] = useState<number | null>(null)
  const [alvo, setAlvo] = useState<number | null>(null)
  const [pegador, setPegador] = useState<number | null>(null)

  const colunas = ['nome', 'valor', ...(vencimento ? ['venc'] : []), ...(orcamento ? ['real'] : []), ...(parcelas ? ['tipo'] : [])]
  const linhaNova = itens.length
  const temAnterior = Object.keys(anterior).length > 0

  function focar(r: number, c: string) {
    const el =
      tabela.current?.querySelector<HTMLElement>(`[data-r="${r}"][data-c="${c}"]`) ??
      tabela.current?.querySelector<HTMLElement>(`[data-r="${r}"][data-c="nome"]`)
    el?.focus()
  }

  function navegar(r: number, c: string, d: Direcao) {
    const i = colunas.indexOf(c)
    if (d === 'cima') focar(Math.max(0, r - 1), c)
    if (d === 'baixo') focar(Math.min(linhaNova, r + 1), c)
    if (d === 'esquerda') i > 0 ? focar(r, colunas[i - 1]) : r > 0 && focar(r - 1, colunas.at(-1)!)
    if (d === 'direita') i < colunas.length - 1 ? focar(r, colunas[i + 1]) : focar(Math.min(linhaNova, r + 1), 'nome')
  }

  function fecharTipo() {
    const linha = tipoAberto?.r
    setTipoAberto(null)
    if (linha !== undefined) requestAnimationFrame(() => focar(linha, 'tipo'))
  }

  async function criarLinha(nome: string) {
    if (!nome.trim()) return
    const novo = await acoes.criar(grupo, { ...novoItem, nome: nome.trim() })
    // Depois de criar, já posiciona no valor da nova linha
    if (novo) requestAnimationFrame(() => focar(linhaNova, 'valor'))
  }

  function soltar(destinoId: number) {
    const origem = arrastando
    setArrastando(null)
    setAlvo(null)
    if (origem == null || origem === destinoId) return
    const ids = itens.map((i) => i.id).filter((id) => id !== origem)
    ids.splice(ids.indexOf(destinoId) + (itens.findIndex((i) => i.id === origem) < itens.findIndex((i) => i.id === destinoId) ? 1 : 0), 0, origem)
    acoes.reordenar(grupo, ids)
  }

  const hoje = hojeISO()
  const atrasadas = vencimento ? itens.filter((i) => statusVencimento(i, hoje)?.status === 'atrasado').length : 0
  const totalValor = arred(itens.reduce((s, i) => s + i.valor, 0))
  const totalReal = arred(itens.reduce((s, i) => s + (i.real ?? 0), 0))

  // grid: [arrastar][check?][nome][valor][real?][dif?][parc?][ações]
  const template = [
    '16px',
    check ? '28px' : '',
    'minmax(110px,1fr)',
    '88px',
    vencimento ? '62px' : '',
    orcamento ? '88px 84px' : '',
    parcelas ? (categoriaFixos ? '112px' : '74px') : '',
    essencial ? (categoriaFixos ? '122px' : '70px') : '48px',
  ]
    .filter(Boolean)
    .join(' ')

  const th = 'flex h-8 items-center whitespace-nowrap px-2 text-xs font-semibold uppercase tracking-wide text-white'

  return (
    <section className={`flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:h-full lg:min-h-0 ${className}`}>
      <header className={`flex shrink-0 items-center justify-between gap-2 px-3 py-2 text-white ${corTitulo}`}>
        <h2 className="truncate text-sm font-bold uppercase tracking-wide" title={titulo}>{titulo}</h2>
        <div className="flex shrink-0 items-center gap-2">
          {orcamento && itens.some((i) => i.real == null) && (
            <button
              onClick={() =>
                acoes.atualizarVarios(
                  itens.filter((i) => i.real == null).map((i) => ({ id: i.id, dados: { real: i.valor } })),
                  `Real = previsto · ${titulo.replace('Recorrentes ', '')}${nomeAba ? ` · ${nomeAba}` : ''}`,
                )
              }
              className="flex items-center gap-1 whitespace-nowrap rounded-md bg-white/20 px-2 py-0.5 text-xs font-medium hover:bg-white/30"
              title="Preenche o Real dos itens em amarelo com o valor previsto"
            >
              <CheckCheck size={14} /> Real = prev.
            </button>
          )}
          {/* Mesma regra da planilha: Total Cartão = previsto, Total PIX = real */}
          {atrasadas > 0 && (
            <span className="rounded bg-white px-1.5 py-0.5 text-[11px] font-bold text-red-600" title="Pagamentos com vencimento passado e ainda não marcados como pagos">
              {atrasadas} {atrasadas === 1 ? 'vencida' : 'vencidas'}
            </span>
          )}
          <span className="num text-sm font-bold">{brl(grupo === 'pix' ? totalReal : totalValor)}</span>
        </div>
      </header>

      {abas}

      <div ref={tabela} className="min-h-0 flex-1 overflow-auto text-sm">
        <div className="flex min-h-full min-w-fit flex-col">
          {/* Cabeçalho das colunas (fica fixo ao rolar) */}
          <div className="sticky top-0 z-10 grid bg-blue-700" style={{ gridTemplateColumns: template }}>
            <div />
            {check && <div className={`${th} justify-center px-0`} title={check === 'pago' ? 'Pago' : 'Recebido'}>
              <Check size={14} />
            </div>}
            <div className={th}>Nome</div>
            <div className={`${th} justify-end`}>{orcamento ? 'Valor R$' : grupo === 'entrada' ? 'Entrada R$' : 'Saída R$'}</div>
            {vencimento && (
              <div className={`${th} justify-center`} title="Data de vencimento">
                Venc.
              </div>
            )}
            {orcamento && (
              <>
                <div className={`${th} justify-end bg-red-500`}>Real</div>
                <div className={`${th} justify-end bg-red-500`}>Diferença</div>
              </>
            )}
            {parcelas && <div className={`${th} justify-center`} title="Fixo, parcelado (com prazo) ou avulso">Tipo</div>}
            <div />
          </div>

          {itens.map((item, r) => {
            const dif = arred(item.valor - (item.real ?? 0))
            const pendente = orcamento && item.real == null
            const marcado = check && item.pago
            return (
              <div
                key={item.id}
                draggable={pegador === item.id}
                onDragStart={(e) => {
                  setArrastando(item.id)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onDragEnd={() => {
                  setPegador(null)
                  setArrastando(null)
                  setAlvo(null)
                }}
                onDragOver={(e) => {
                  if (arrastando == null) return
                  e.preventDefault()
                  setAlvo(item.id)
                }}
                onDrop={() => soltar(item.id)}
                className={`group grid border-b border-slate-100 transition-colors hover:bg-slate-50
                  ${marcado ? 'bg-green-50/70' : ''} ${arrastando === item.id ? 'opacity-40' : ''}
                  ${alvo === item.id && arrastando !== item.id ? 'border-t-2 border-t-green-600' : ''}`}
                style={{ gridTemplateColumns: template }}
              >
                <div
                  onMouseDown={() => setPegador(item.id)}
                  onMouseUp={() => setPegador(null)}
                  className="flex cursor-grab items-center justify-center text-slate-300 opacity-0 group-hover:opacity-100"
                  title="Arraste para reordenar"
                >
                  <GripVertical size={13} />
                </div>

                {check && (
                  <label className="flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={item.pago}
                      onChange={(e) => acoes.atualizar(item.id, { pago: e.target.checked })}
                      className="h-4 w-4 cursor-pointer accent-green-600"
                      title={check === 'pago' ? 'Marcar como pago' : 'Marcar como recebido'}
                    />
                  </label>
                )}

                <Celula
                  r={r}
                  c="nome"
                  textoEdicao={item.nome}
                  onSalvar={(t) => (t.trim() ? acoes.atualizar(item.id, { nome: t.trim() }) : false)}
                  onNavegar={navegar}
                  className={marcado ? 'text-slate-500' : ''}
                  titulo={item.nome}
                >
                  <span className="truncate">{item.nome}</span>
                </Celula>

                <Celula
                  r={r}
                  c="valor"
                  alinhar="direita"
                  textoEdicao={numero(item.valor)}
                  placeholder="0,00 ou 540+60"
                  onSalvar={(t) => {
                    const v = t.trim() ? lerValor(t) : 0
                    if (v == null) return false
                    acoes.atualizar(item.id, { valor: v })
                  }}
                  onNavegar={navegar}
                  className="num"
                >
                  <Variacao atual={item.valor} antes={anterior[chaveItem(item)]} temAnterior={temAnterior} entrada={grupo === 'entrada'} />
                  {item.valor ? numero(item.valor) : vazio}
                </Celula>

                {vencimento && (
                  <Celula
                    r={r}
                    c="venc"
                    alinhar="centro"
                    textoEdicao={textoVencimento(item.vencimento)}
                    placeholder="dd/mm"
                    titulo="Vencimento. Digite o dia (10), dia/mês (10/11) ou a data completa. Vazio limpa."
                    onSalvar={(t) => {
                      const v = lerVencimento(t, ano, mes)
                      if (v === undefined) return false
                      acoes.atualizar(item.id, { vencimento: v })
                    }}
                    onNavegar={navegar}
                    className="num text-xs"
                  >
                    <Vencimento item={item} hoje={hoje} ano={ano} />
                  </Celula>
                )}

                {orcamento && (
                  <>
                    <Celula
                      r={r}
                      c="real"
                      alinhar="direita"
                      textoEdicao={numero(item.real)}
                      placeholder="0,00"
                      titulo={pendente ? 'Ainda não lançado. Digite o valor real ou clique em ✓ para usar o previsto' : undefined}
                      onSalvar={(t) => {
                        const v = t.trim() ? lerValor(t) : null
                        if (t.trim() && v == null) return false
                        acoes.atualizar(item.id, { real: v })
                      }}
                      onNavegar={navegar}
                      className={`num ${pendente ? 'bg-yellow-200/80' : ''}`}
                    >
                      {pendente ? (
                        <span className="flex w-full items-center justify-between">
                          <button
                            tabIndex={-1}
                            onClick={(e) => {
                              e.stopPropagation()
                              acoes.atualizar(item.id, { real: item.valor })
                            }}
                            className="rounded p-0.5 text-yellow-700 opacity-0 hover:bg-yellow-300 group-hover:opacity-100"
                            title="Usar o valor previsto"
                          >
                            <Check size={13} />
                          </button>
                          <span className="text-yellow-800/70">0,00</span>
                        </span>
                      ) : (
                        numero(item.real)
                      )}
                    </Celula>
                    <div
                      className={`num flex h-8 items-center justify-end px-2 ${
                        dif < 0 ? 'font-semibold text-red-600' : dif > 0 ? 'text-green-700' : 'text-slate-400'
                      }`}
                      title={dif < 0 ? 'Gastou mais que o previsto' : dif > 0 ? 'Gastou menos que o previsto' : undefined}
                    >
                      {numero(dif)}
                    </div>
                  </>
                )}

                {parcelas && (
                  <TipoCelula r={r} item={item} ano={ano} mes={mes} modo={modoTipo} rotuloFixos={categoriaFixos ?? 'Fixo'} onAbrir={(ancora) => setTipoAberto({ id: item.id, r, ancora })} onNavegar={navegar} />
                )}

                <div className="flex items-center justify-end gap-0.5 pr-1">
                  {categoriaFixos && <InfoTipo item={item} ano={ano} mes={mes} onAbrir={(ancora) => setTipoAberto({ id: item.id, r, ancora })} />}
                  {essencial && item.recorrente && !item.variavel && (
                    <button
                      tabIndex={-1}
                      onClick={() => acoes.atualizar(item.id, { essencial: !item.essencial })}
                      className={`rounded p-1 ${item.essencial ? 'text-amber-600 hover:bg-amber-50' : 'text-slate-300 opacity-0 hover:bg-slate-100 group-hover:opacity-100'}`}
                      title={item.essencial ? 'Essencial: não dá pra cortar (entra no mínimo possível). Clique para marcar como cortável' : 'Cortável. Clique para marcar como essencial (não dá pra cortar)'}
                    >
                      {item.essencial ? <Lock size={14} /> : <LockOpen size={14} />}
                    </button>
                  )}
                  {!parcelas && <button
                    tabIndex={-1}
                    onClick={() => acoes.atualizar(item.id, item.recorrente ? { recorrente: false, essencial: false } : { recorrente: true })}
                    className={`rounded p-1 ${item.recorrente ? 'text-blue-600 hover:bg-blue-50' : 'text-slate-300 opacity-0 hover:bg-slate-100 group-hover:opacity-100'}`}
                    title={item.recorrente ? `${rotuloFixo} (clique para desmarcar)` : `Marcar como fixo (${rotuloFixo.toLowerCase()})`}
                  >
                    <Repeat size={14} />
                  </button>}
                  <button
                    tabIndex={-1}
                    onClick={() => acoes.remover(item.id)}
                    className="rounded p-1 text-slate-300 opacity-0 hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                    title="Excluir linha"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })}

          {/* Linha em branco para adicionar, como numa planilha */}
          <div className="grid border-b border-slate-100" style={{ gridTemplateColumns: template }}>
            <div className="flex items-center justify-center text-slate-300">
              <Plus size={13} />
            </div>
            {check && <div />}
            <Celula
              r={linhaNova}
              c="nome"
              textoEdicao=""
              placeholder="Nome do item…"
              onSalvar={(t) => void criarLinha(t)}
              onNavegar={navegar}
              className="text-slate-400"
            >
              <span className="italic">Adicionar…</span>
            </Celula>
          </div>

          {/* Total (fica fixo no rodapé ao rolar) */}
          <div className="sticky bottom-0 z-10 mt-auto grid border-t border-slate-200 bg-slate-50 font-semibold" style={{ gridTemplateColumns: template }}>
            <div />
            {check && <div />}
            <div className="flex h-8 items-center px-2 text-slate-600">Total</div>
            <div className="num flex h-8 items-center justify-end px-2">{numero(totalValor)}</div>
            {orcamento && (
              <>
                <div className="num flex h-8 items-center justify-end px-2">{numero(totalReal)}</div>
                <div className={`num flex h-8 items-center justify-end px-2 ${totalValor - totalReal < 0 ? 'text-red-600' : ''}`}>
                  {numero(arred(totalValor - totalReal))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      {rodape && <footer className="shrink-0 border-t border-slate-200 px-3 py-2 text-sm">{rodape}</footer>}

      {tipoAberto && itens.some((i) => i.id === tipoAberto.id) && (
        <TipoMenu
          ancora={tipoAberto.ancora}
          item={itens.find((i) => i.id === tipoAberto.id)!}
          ano={ano}
          mes={mes}
          modo={modoTipo}
          rotuloFixos={categoriaFixos ?? 'Fixo'}
          fechar={fecharTipo}
          salvar={(dados) => {
            acoes.alterarTipo(itens.find((i) => i.id === tipoAberto.id)!, dados)
            fecharTipo()
          }}
          propagar={() => {
            acoes.propagar(itens.find((i) => i.id === tipoAberto.id)!)
            fecharTipo()
          }}
        />
      )}
    </section>
  )
}

/** Setinha quando o valor mudou em relação ao mês anterior (ou ponto quando o item é novo) */
function Variacao({ atual, antes, temAnterior, entrada }: { atual: number; antes?: number; temAnterior: boolean; entrada: boolean }) {
  if (!temAnterior) return null
  if (antes === undefined) {
    return <span className="mr-auto h-1.5 w-1.5 rounded-full bg-blue-500" title="Novo: não existia no mês anterior" />
  }
  const dif = arred(atual - antes)
  if (Math.abs(dif) < 0.005) return null
  // Para gastos, subir é ruim (vermelho); para entradas, subir é bom (verde)
  const ruim = entrada ? dif < 0 : dif > 0
  const Icone = dif > 0 ? ArrowUp : ArrowDown
  return (
    <span
      className={`mr-auto flex items-center text-[10px] font-semibold ${ruim ? 'text-red-600' : 'text-green-700'}`}
      title={`Mês anterior: ${brl(antes)} (${dif > 0 ? '+' : ''}${brl(dif)})`}
    >
      <Icone size={12} />
    </span>
  )
}

const ROTULO_STATUS = { atrasado: 'Atrasado', hoje: 'Vence hoje', breve: 'Vence em breve', ok: 'No prazo', pago: 'Pago' }

/** Data de vencimento com cor pela urgência: atrasado (vermelho), até 3 dias (âmbar), pago (apagado) */
function Vencimento({ item, hoje, ano }: { item: Lancamento; hoje: string; ano: number }) {
  const situacao = statusVencimento(item, hoje)
  if (!situacao) return <span className="mx-auto text-slate-300">–</span>

  const { status, dias } = situacao
  const estilo = {
    atrasado: 'bg-red-100 font-bold text-red-700',
    hoje: 'bg-amber-200 font-bold text-amber-900',
    breve: 'bg-amber-100 font-semibold text-amber-800',
    ok: 'text-slate-600',
    pago: 'text-slate-400 line-through decoration-slate-300',
  }[status]
  const detalhe = status === 'atrasado' ? `há ${-dias} ${dias === -1 ? 'dia' : 'dias'}` : status === 'breve' || status === 'ok' ? `em ${dias} ${dias === 1 ? 'dia' : 'dias'}` : ''

  return (
    <span className={`mx-auto rounded px-1.5 py-0.5 ${estilo}`} title={`${ROTULO_STATUS[status]}${detalhe ? ` (${detalhe})` : ''} · ${item.vencimento!.split('-').reverse().join('/')}`}>
      {fmtVencimento(item.vencimento, ano)}
    </span>
  )
}
