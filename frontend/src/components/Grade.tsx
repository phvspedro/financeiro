import { ArrowDown, ArrowRightLeft, ArrowUp, Check, CheckCheck, GripVertical, Lock, LockOpen, Plus, Repeat, Search, Trash2, X } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { arred, brl, chaveItem, hojeISO, lerValor, lerVencimento, numero, statusVencimento, textoVencimento } from '../lib/money'
import { usePersistido } from '../lib/preferencias'
import { useMovel } from '../lib/useMovel'
import type { Grupo, Lancamento, ValoresAnteriores } from '../lib/types'
import { Celula, type Direcao } from './Celula'
import { Variacao, Vencimento } from './Indicadores'
import { ListaMovel } from './ListaMovel'
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
  /** Passa um item de Cartão para PIX (ou o contrário) */
  mover: (item: Lancamento, destino: Grupo) => void
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

type ColunaOrdem = 'pago' | 'nome' | 'valor' | 'venc' | 'real' | 'dif' | 'tipo'
type EstadoFiltro = 'todos' | 'pendentes' | 'vencidas'

/** O que cada tabela lembra entre uma visita e outra (por grupo) */
interface Visao {
  ordem: { col: ColunaOrdem; dir: 1 | -1 } | null
  texto: string
  estado: EstadoFiltro
}

const VISAO_PADRAO: Visao = { ordem: null, texto: '', estado: 'todos' }

/** Minúsculas e sem acento, para a busca por nome */
const simples = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

const GRUPO_NOME: Partial<Record<Grupo, string>> = { cartao: 'Cartão', pix: 'PIX' }

/** Chave de ordenação de cada coluna. null vai sempre para o fim (sem vencimento, sem real). */
const chaveOrdem: Record<ColunaOrdem, (i: Lancamento) => string | number | null> = {
  pago: (i) => (i.pago ? 1 : 0),
  nome: (i) => i.nome,
  valor: (i) => i.valor,
  venc: (i) => i.vencimento,
  real: (i) => i.real,
  dif: (i) => (i.real == null ? null : arred(i.valor - i.real)),
  // fixo, parcelado, avulso (o gasto variável conta como fixo)
  tipo: (i) => (i.parcela_total ? 1 : i.recorrente ? 0 : 2),
}

export function Grade({ titulo, grupo, itens, acoes, corTitulo, orcamento, check, parcelas, essencial, vencimento, ano, mes, anterior, className = '', abas, nomeAba, novoItem, categoriaFixos, rotuloFixo = 'Fixo: repete todo mês', rodape }: Props) {
  const movel = useMovel()
  const tabela = useRef<HTMLDivElement>(null)
  // Menu do tipo/categoria: aberto pela célula da coluna Tipo ou pelo ícone ao lado do cadeado
  const [tipoAberto, setTipoAberto] = useState<{ id: number; r: number; ancora: HTMLElement } | null>(null)
  const modoTipo = categoriaFixos ? 'categoria' : 'tipo'
  const [arrastando, setArrastando] = useState<number | null>(null)
  const [alvo, setAlvo] = useState<number | null>(null)
  const [pegador, setPegador] = useState<number | null>(null)
  // Ordenação e filtros só de visualização: não mexem na ordem salva (arrastar fica desligado enquanto ordena)
  const [visao, setVisao] = usePersistido<Visao>(`financeiro.tabela.${grupo}`, VISAO_PADRAO)
  const { ordem, texto: busca, estado } = visao
  const filtrando = busca.trim() !== '' || estado !== 'todos'

  const colunas = ['nome', 'valor', ...(vencimento ? ['venc'] : []), ...(orcamento ? ['real'] : []), ...(parcelas ? ['tipo'] : [])]
  const hoje = hojeISO()
  const termo = simples(busca.trim())
  const pendente = (i: Lancamento) => (check ? !i.pago : orcamento ? i.real == null : false)
  const filtrados = !filtrando
    ? itens
    : itens.filter(
        (i) =>
          (!termo || simples(i.nome).includes(termo)) &&
          (estado === 'todos' || (estado === 'pendentes' ? pendente(i) : statusVencimento(i, hoje)?.status === 'atrasado')),
      )
  const lista = ordem ? ordenar(filtrados, ordem.col, ordem.dir) : filtrados
  const linhaNova = lista.length
  const temAnterior = Object.keys(anterior).length > 0

  function alternarOrdem(col: ColunaOrdem) {
    setVisao((v) => ({ ...v, ordem: v.ordem?.col !== col ? { col, dir: 1 } : v.ordem.dir === 1 ? { col, dir: -1 } : null }))
  }

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
    // (ordenada ou filtrada a nova linha pode cair em outro lugar: aí não força o foco)
    if (novo && !ordem && !filtrando) requestAnimationFrame(() => focar(linhaNova, 'valor'))
  }

  function soltar(destinoId: number) {
    const origem = arrastando
    setArrastando(null)
    setAlvo(null)
    if (origem == null || origem === destinoId) return
    const ids = lista.map((i) => i.id).filter((id) => id !== origem)
    ids.splice(ids.indexOf(destinoId) + (lista.findIndex((i) => i.id === origem) < lista.findIndex((i) => i.id === destinoId) ? 1 : 0), 0, origem)
    acoes.reordenar(grupo, ids)
  }

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
    essencial ? (categoriaFixos ? '148px' : '70px') : '48px',
  ]
    .filter(Boolean)
    .join(' ')

  const th = 'flex h-linha items-center whitespace-nowrap px-2 text-xs font-semibold uppercase tracking-wide text-white'

  /** Cabeçalho clicável: asc → desc → ordem manual */
  const cabecalho = (col: ColunaOrdem, conteudo: ReactNode, extra = '', titulo?: string) => (
    <button
      type="button"
      onClick={() => alternarOrdem(col)}
      className={`${th} gap-1 hover:bg-white/10 ${extra}`}
      title={titulo ? `${titulo} · clique para ordenar` : 'Clique para ordenar'}
      aria-sort={ordem?.col === col ? (ordem.dir === 1 ? 'ascending' : 'descending') : undefined}
    >
      {conteudo}
      {ordem?.col === col && (ordem.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
    </button>
  )

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

      <Barra
        visao={visao}
        setVisao={setVisao}
        movel={movel}
        total={itens.length}
        mostrando={lista.length}
        filtros={[...(check || orcamento ? ([['pendentes', 'Pendentes']] as const) : []), ...(vencimento ? ([['vencidas', 'Vencidas']] as const) : [])]}
        colunas={[
          ...(check ? ([['pago', check === 'pago' ? 'Pago' : 'Recebido']] as const) : []),
          ['nome', 'Nome'],
          ['valor', 'Valor'],
          ...(vencimento ? ([['venc', 'Vencimento']] as const) : []),
          ...(orcamento ? ([['real', 'Real'], ['dif', 'Diferença']] as const) : []),
          ...(parcelas ? ([['tipo', 'Tipo']] as const) : []),
        ]}
      />

      {movel ? (
        <ListaMovel
          itens={lista}
          ordenado={!!ordem}
          filtrando={filtrando}
          fab={grupo !== 'entrada'}
          grupo={grupo}
          acoes={acoes}
          ano={ano}
          mes={mes}
          anterior={anterior}
          hoje={hoje}
          check={check}
          orcamento={orcamento}
          parcelas={parcelas}
          vencimento={vencimento}
          essencial={essencial}
          categoriaFixos={categoriaFixos}
          rotuloFixo={rotuloFixo}
          novoItem={novoItem}
          totalValor={totalValor}
          totalReal={totalReal}
          abrirTipo={(item, ancora) => setTipoAberto({ id: item.id, r: itens.indexOf(item), ancora })}
        />
      ) : (
      <div ref={tabela} className="min-h-0 flex-1 overflow-auto text-sm">
        <div className="flex min-h-full min-w-fit flex-col">
          {/* Cabeçalho das colunas (fica fixo ao rolar) */}
          <div className="sticky top-0 z-10 grid bg-blue-700" style={{ gridTemplateColumns: template }}>
            <div />
            {check && cabecalho('pago', <Check size={14} />, 'justify-center px-0', check === 'pago' ? 'Pago' : 'Recebido')}
            {cabecalho('nome', 'Nome')}
            {cabecalho('valor', orcamento ? 'Valor R$' : grupo === 'entrada' ? 'Entrada R$' : 'Saída R$', 'justify-end')}
            {vencimento && cabecalho('venc', 'Venc.', 'justify-center', 'Data de vencimento')}
            {orcamento && (
              <>
                {cabecalho('real', 'Real', 'justify-end bg-red-500 hover:bg-red-400')}
                {cabecalho('dif', 'Diferença', 'justify-end bg-red-500 hover:bg-red-400')}
              </>
            )}
            {parcelas && cabecalho('tipo', 'Tipo', 'justify-center', 'Fixo, parcelado (com prazo) ou avulso')}
            <div />
          </div>

          {lista.map((item, r) => {
            const dif = arred(item.valor - (item.real ?? 0))
            const pendente = orcamento && item.real == null
            const marcado = check && item.pago
            return (
              <div
                key={item.id}
                draggable={!ordem && pegador === item.id}
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
                  onMouseDown={() => !ordem && setPegador(item.id)}
                  onMouseUp={() => setPegador(null)}
                  className={`flex items-center justify-center text-slate-300 opacity-0 group-hover:opacity-100 ${ordem ? 'cursor-not-allowed' : 'cursor-grab'}`}
                  title={ordem ? 'Volte à ordem manual (clique no cabeçalho) para reordenar' : 'Arraste para reordenar'}
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
                      className={`num flex h-linha items-center justify-end px-2 ${
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
                  {GRUPO_NOME[grupo] && (
                    <button
                      tabIndex={-1}
                      onClick={() => acoes.mover(item, grupo === 'cartao' ? 'pix' : 'cartao')}
                      className="rounded p-1 text-slate-300 opacity-0 hover:bg-slate-100 hover:text-slate-700 group-hover:opacity-100"
                      title={`Mover para ${GRUPO_NOME[grupo === 'cartao' ? 'pix' : 'cartao']}`}
                    >
                      <ArrowRightLeft size={14} />
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
            <div className="flex h-linha items-center px-2 text-slate-600">Total</div>
            <div className="num flex h-linha items-center justify-end px-2">{numero(totalValor)}</div>
            {orcamento && (
              <>
                <div className="num flex h-linha items-center justify-end px-2">{numero(totalReal)}</div>
                <div className={`num flex h-linha items-center justify-end px-2 ${totalValor - totalReal < 0 ? 'text-red-600' : ''}`}>
                  {numero(arred(totalValor - totalReal))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      )}
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

function ordenar(itens: Lancamento[], col: ColunaOrdem, dir: 1 | -1): Lancamento[] {
  const chave = chaveOrdem[col]
  return [...itens].sort((a, b) => {
    const x = chave(a)
    const y = chave(b)
    if (x == null || y == null) return x == null && y == null ? 0 : x == null ? 1 : -1
    const c = typeof x === 'string' ? x.localeCompare(y as string, 'pt-BR', { sensitivity: 'base' }) : x - (y as number)
    return c * dir
  })
}

interface BarraProps {
  visao: Visao
  setVisao: (v: Visao | ((anterior: Visao) => Visao)) => void
  movel: boolean
  total: number
  mostrando: number
  filtros: readonly (readonly [EstadoFiltro, string])[]
  colunas: readonly (readonly [ColunaOrdem, string])[]
}

/** Busca por nome, filtros rápidos e (no celular, onde não há cabeçalho de colunas) a ordenação */
function Barra({ visao, setVisao, movel, total, mostrando, filtros, colunas }: BarraProps) {
  const { ordem, texto, estado } = visao
  const ativo = texto.trim() !== '' || estado !== 'todos'
  if (total === 0 && !ativo) return null

  const chip = (marcado: boolean) =>
    `shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${
      marcado ? 'border-green-600 bg-green-50 text-green-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
    } ${movel ? 'py-1.5' : ''}`

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-slate-200 bg-white px-2 py-1.5">
      <label className="relative min-w-[7rem] flex-1">
        <Search size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={texto}
          onChange={(e) => setVisao((v) => ({ ...v, texto: e.target.value }))}
          placeholder="Filtrar por nome…"
          aria-label="Filtrar por nome"
          className="w-full rounded-lg border border-slate-200 bg-white py-1 pl-7 pr-2 text-xs outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/20 max-md:py-2 max-md:text-base"
        />
      </label>

      {filtros.map(([valor, rotulo]) => (
        <button key={valor} onClick={() => setVisao((v) => ({ ...v, estado: v.estado === valor ? 'todos' : valor }))} className={chip(estado === valor)} aria-pressed={estado === valor}>
          {rotulo}
        </button>
      ))}

      {movel && (
        <div className="flex w-full items-center gap-1.5">
          <select
            value={ordem?.col ?? ''}
            onChange={(e) => {
              const col = e.target.value as ColunaOrdem | ''
              setVisao((v) => ({ ...v, ordem: col ? { col, dir: v.ordem?.dir ?? 1 } : null }))
            }}
            aria-label="Ordenar por"
            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-2 text-base text-slate-700"
          >
            <option value="">Ordem manual</option>
            {colunas.map(([col, rotulo]) => (
              <option key={col} value={col}>
                Ordenar por {rotulo.toLowerCase()}
              </option>
            ))}
          </select>
          {ordem && (
            <button
              onClick={() => setVisao((v) => (v.ordem ? { ...v, ordem: { ...v.ordem, dir: v.ordem.dir === 1 ? -1 : 1 } } : v))}
              className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-sm text-slate-700"
              aria-label={ordem.dir === 1 ? 'Crescente' : 'Decrescente'}
            >
              {ordem.dir === 1 ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
            </button>
          )}
        </div>
      )}

      {ativo && (
        <div className="flex w-full items-center justify-between text-xs text-slate-500">
          <span>
            Mostrando <b className="text-slate-700">{mostrando}</b> de {total}
          </span>
          <button onClick={() => setVisao((v) => ({ ...v, texto: '', estado: 'todos' }))} className="flex items-center gap-1 text-green-700 hover:underline">
            <X size={12} /> Limpar filtros
          </button>
        </div>
      )}
    </div>
  )
}
