import { CalendarPlus, CopyPlus, History, Keyboard, Loader2, Redo2, StickyNote, Undo2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AbasTipo, filtrarPorAba, novoItemDaAba, useAba } from '../components/AbasTipo'
import { Grade, type AcoesGrade } from '../components/Grade'
import { HistoricoPainel } from '../components/HistoricoPainel'
import { Modal } from '../components/Modal'
import { ReplicarModal } from '../components/ReplicarModal'
import { Resumo } from '../components/Resumo'
import { alertaAberto, confirmar } from '../lib/alerta'
import { api } from '../lib/api'
import { brl, calcularTotais, MESES, realAutomatico } from '../lib/money'
import type { Lancamento, MesInfo, Pilha, ResultadoPropagar, ResultadoReplicar, ValoresAnteriores } from '../lib/types'

interface Props {
  ano: number
  mes: number
  avisar: (texto: string, tipo?: 'ok' | 'erro') => void
}

export function Planilha({ ano, mes, avisar }: Props) {
  const [info, setInfo] = useState<MesInfo | null>(null)
  const [itens, setItens] = useState<Lancamento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [obs, setObs] = useState('')
  const [anterior, setAnterior] = useState<ValoresAnteriores>({})
  const [historico, setHistorico] = useState(false)
  const [notas, setNotas] = useState(false)
  const [entradasAberto, setEntradasAberto] = useState(false)
  const [replicarAberto, setReplicarAberto] = useState(false)
  const [abaCartao, setAbaCartao] = useAba('cartao')
  const [abaPix, setAbaPix] = useAba('pix')
  const [pilha, setPilha] = useState<Pilha>({ desfazer: null, refazer: null })

  const url = `/meses/${ano}/${mes}`
  const urlAtual = useRef(url)
  urlAtual.current = url

  const carregar = useCallback(async () => {
    const { data } = await api.get(url)
    if (urlAtual.current !== url) return // usuário já trocou de mês
    setInfo(data.mes)
    setItens(data.lancamentos)
    setAnterior(data.anterior ?? {})
    setObs(data.mes.observacao ?? '')
  }, [url])

  useEffect(() => {
    setCarregando(true)
    carregar()
      .catch(() => avisar('Não foi possível carregar o mês.', 'erro'))
      .finally(() => setCarregando(false))
  }, [carregar, avisar])

  // Todas as gravações saem em fila, uma de cada vez e na ordem: assim o Desfazer nunca passa
  // na frente de uma edição que ainda está a caminho do servidor.
  const fila = useRef<Promise<unknown>>(Promise.resolve())
  const enfileirar = useCallback(<T,>(tarefa: () => Promise<T>): Promise<T> => {
    const resultado = fila.current.then(tarefa)
    fila.current = resultado.catch(() => undefined)
    return resultado
  }, [])

  // O que Desfazer/Refazer fariam agora (atualizado, sem pressa, depois de cada gravação)
  const atualizarPilha = useCallback(() => {
    api
      .get<Pilha>(`${url}/pilha`)
      .then(({ data }) => urlAtual.current === url && setPilha(data))
      .catch(() => undefined)
  }, [url])
  const pilhaTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const agendarPilha = useCallback(() => {
    clearTimeout(pilhaTimer.current)
    pilhaTimer.current = setTimeout(atualizarPilha, 250)
  }, [atualizarPilha])
  useEffect(() => {
    atualizarPilha()
    return () => clearTimeout(pilhaTimer.current)
  }, [atualizarPilha])

  const recarregar = useCallback(async () => {
    await carregar()
    atualizarPilha()
  }, [carregar, atualizarPilha])

  const falhou = useCallback(() => {
    avisar('Não foi possível salvar. Recarregando…', 'erro')
    recarregar().catch(() => undefined)
  }, [avisar, recarregar])

  /**
   * Aplica o tipo e as parcelas deste item aos meses seguintes (criando os que faltarem até a última parcela).
   * Com `perguntar`, confirma antes, mas só quando não há parcelas definidas: nesse caso a mudança pode tirar
   * o item de outros meses. Com parcelas informadas, aplica direto.
   */
  const propagar = useCallback(
    async (item: Lancamento, perguntar = false) => {
      await fila.current // espera as gravações pendentes (o item precisa estar salvo)
      try {
        if (perguntar) {
          const { data: todos } = await api.get<string[]>('/meses')
          const atual = `${ano}-${String(mes).padStart(2, '0')}`
          const depois = todos.filter((c) => c > atual).length
          if (!depois) return

          const ok = await confirmar({
            titulo: `Aplicar "${item.nome}" aos meses seguintes?`,
            texto: `Já ${depois === 1 ? 'existe 1 mês' : `existem ${depois} meses`} depois deste. O item é ajustado neles para ficar igual a este (e sai dos meses em que não deveria mais aparecer). Dá para desfazer.`,
            confirmar: 'Aplicar aos próximos meses',
            cancelar: 'Só neste mês',
          })
          if (!ok) return
        }

        const { data } = await enfileirar(() => api.post<ResultadoPropagar>(`/lancamentos/${item.id}/propagar`))
        const novos = data.novos_meses
        const existentes = data.meses - novos.length
        const partes = [
          existentes > 0 && `${existentes} ${existentes === 1 ? 'mês ajustado' : 'meses ajustados'}`,
          novos.length > 0 && `${novos.length} ${novos.length === 1 ? 'mês criado' : 'meses criados'} até a última parcela (${novos.join(', ')}), a partir do último mês já criado`,
          data.removidos > 0 && `${data.removidos} ${data.removidos === 1 ? 'item removido' : 'itens removidos'}`,
        ].filter(Boolean)
        avisar(data.meses ? `Aplicado: ${partes.join(' · ')}. Dá para desfazer.` : 'Os meses seguintes já estavam assim.')
        atualizarPilha()
      } catch {
        avisar('Não foi possível aplicar aos meses seguintes.', 'erro')
      }
    },
    [ano, mes, enfileirar, avisar, atualizarPilha],
  )

  const acoes: AcoesGrade = useMemo(
    () => ({
      atualizar(id, dados) {
        // Atualiza na tela na hora e salva em segundo plano
        const atual = itens.find((l) => l.id === id)
        const extra = atual ? realAutomatico(atual, dados) : {}
        setItens((lista) => lista.map((l) => (l.id === id ? { ...l, ...dados, ...extra } : l)))
        enfileirar(() => api.patch(`/lancamentos/${id}`, dados)).then(agendarPilha, falhou)
      },
      alterarTipo(item, dados) {
        const mudou = (['recorrente', 'variavel', 'parcela_atual', 'parcela_total'] as const).some((c) => c in dados && dados[c] !== item[c])
        this.atualizar(item.id, dados)
        // Mudou o tipo/parcelas: os meses seguintes ainda têm a versão antiga. Com as parcelas informadas
        // aplica direto; sem parcelas (fixo/avulso) pergunta, porque pode tirar o item de outros meses.
        if (mudou) {
          const novo = { ...item, ...dados }
          void propagar(novo, !novo.parcela_total)
        }
      },
      propagar: (item) => void propagar(item),
      atualizarVarios(alteracoes, rotulo) {
        if (!alteracoes.length) return
        const porId = new Map(alteracoes.map((a) => [a.id, a.dados]))
        setItens((lista) => lista.map((l) => (porId.has(l.id) ? { ...l, ...porId.get(l.id) } : l)))
        enfileirar(() => api.post('/lancamentos/lote', { rotulo, itens: alteracoes.map((a) => ({ id: a.id, ...a.dados })) })).then(agendarPilha, falhou)
      },
      async criar(grupo, dados) {
        try {
          const { data } = await enfileirar(() => api.post<Lancamento>(`${url}/lancamentos`, { grupo, ...dados }))
          setItens((lista) => [...lista, data])
          agendarPilha()
          return data
        } catch {
          falhou()
        }
      },
      async remover(id) {
        const item = itens.find((l) => l.id === id)
        if (!item) return
        const ok = await confirmar({ titulo: `Excluir "${item.nome}"?`, texto: 'Dá para desfazer depois (Ctrl+Z ou pelo Histórico).', confirmar: 'Excluir', perigo: true })
        if (!ok) return
        setItens((lista) => lista.filter((l) => l.id !== id))
        enfileirar(() => api.delete(`/lancamentos/${id}`)).then(agendarPilha, falhou)
      },
      reordenar(grupo, idsVisiveis) {
        // Numa aba filtrada só parte do grupo aparece: os itens de fora ficam onde estão e os
        // visíveis trocam de lugar entre as posições que ocupavam.
        const todos = itens.filter((l) => l.grupo === grupo).sort((a, b) => a.ordem - b.ordem || a.id - b.id)
        const visiveis = new Set(idsVisiveis)
        let k = 0
        const ids = todos.map((l) => (visiveis.has(l.id) ? idsVisiveis[k++] : l.id))
        const posicao = new Map(ids.map((id, i) => [id, i + 1]))
        setItens((lista) => lista.map((l) => (posicao.has(l.id) ? { ...l, ordem: posicao.get(l.id)! } : l)))
        enfileirar(() => api.post('/lancamentos/reordenar', { ids })).catch(falhou)
      },
    }),
    [url, itens, falhou, enfileirar, agendarPilha, propagar],
  )

  /** Desfazer (Ctrl+Z) e refazer (Ctrl+Y) a última ação deste mês */
  const voltar = useCallback(
    async (qual: 'desfazer' | 'refazer') => {
      try {
        const { data } = await enfileirar(() => api.post(`${url}/${qual}`))
        await recarregar()
        avisar(qual === 'desfazer' ? `Desfeito: ${data.descricao}` : `Refeito: ${String(data.descricao).replace(/^Desfez: /, '')}`)
      } catch (e) {
        const mensagem = (e as { response?: { data?: { message?: string } } }).response?.data?.message
        avisar(mensagem ?? 'Não foi possível desfazer.', 'erro')
        recarregar().catch(() => undefined)
      }
    },
    [url, enfileirar, recarregar, avisar],
  )

  useEffect(() => {
    const teclas = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || alertaAberto()) return
      const alvo = e.target as HTMLElement
      // Dentro de um campo de texto, Ctrl+Z continua desfazendo a digitação
      if (alvo.matches?.('input, textarea, select, [contenteditable]')) return
      const tecla = e.key.toLowerCase()
      if (tecla === 'z' && !e.shiftKey) {
        e.preventDefault()
        voltar('desfazer')
      } else if (tecla === 'y' || (tecla === 'z' && e.shiftKey)) {
        e.preventDefault()
        voltar('refazer')
      }
    }
    window.addEventListener('keydown', teclas)
    return () => window.removeEventListener('keydown', teclas)
  }, [voltar])

  function replicado(r: ResultadoReplicar) {
    setReplicarAberto(false)
    atualizarPilha()
    avisar(
      r.criados + r.atualizados === 0
        ? 'Nada novo para replicar: os itens já existem nesses meses.'
        : `Replicado para ${r.meses.length} ${r.meses.length === 1 ? 'mês' : 'meses'}: ${r.criados} item(ns) adicionado(s)${r.atualizados ? `, ${r.atualizados} atualizado(s)` : ''}. Dá para desfazer.`,
    )
  }

  async function importarFixos() {
    try {
      const { data } = await enfileirar(() => api.post(`${url}/importar-fixos`))
      setItens(data.lancamentos)
      atualizarPilha()
      avisar(data.copiados ? `${data.copiados} item(ns) fixo(s) trazido(s) do mês anterior.` : 'Nenhum item novo para trazer, todos os fixos já estão aqui.')
    } catch {
      avisar('Não foi possível importar os fixos.', 'erro')
    }
  }

  function salvarObs() {
    if (!info || obs === (info.observacao ?? '')) return
    setInfo({ ...info, observacao: obs })
    api.patch(url, { observacao: obs }).catch(() => avisar('Não foi possível salvar a anotação.', 'erro'))
  }

  const comuns = { ano, mes, anterior }
  const fecharHistorico = useCallback(() => setHistorico(false), [])
  const fecharEntradas = useCallback(() => setEntradasAberto(false), [])
  const fecharReplicar = useCallback(() => setReplicarAberto(false), [])
  const t = calcularTotais(itens)
  const por = (g: Lancamento['grupo']) => itens.filter((l) => l.grupo === g).sort((a, b) => a.ordem - b.ordem || a.id - b.id)
  const NOMES_ABA = { todos: 'Todos', fixos: '', parcelas: 'Parcelas', avulsos: 'Gastos do mês' }

  if (carregando && !info) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-400">
        <Loader2 className="animate-spin" />
      </div>
    )
  }

  const botao = 'flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50'

  return (
    // Em telas grandes a página ocupa exatamente a altura da janela: as tabelas rolam por dentro
    <div className={`flex flex-col gap-3 transition-opacity lg:h-full ${carregando ? 'opacity-50' : ''}`}>
      <Resumo t={t} itens={itens} ano={ano} mes={mes} abrirEntradas={() => setEntradasAberto(true)} />

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <p className="hidden items-center gap-1.5 text-xs text-slate-500 md:flex">
          <Keyboard size={14} />
          Clique duas vezes ou comece a digitar para editar · <b>Enter</b> desce · <b>Tab</b> avança · setas navegam · aceita contas como <code className="rounded bg-slate-200 px-1">540+60</code>
        </p>
        <div className="ml-auto flex flex-wrap gap-2">
          <button onClick={() => setNotas(!notas)} className={`${botao} ${notas ? 'bg-slate-100' : ''}`} title="Anotações do mês">
            <StickyNote size={14} /> Anotações
            {obs.trim() && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
          </button>
          <button onClick={() => setHistorico(true)} className={botao} title="Ver tudo o que foi alterado neste mês">
            <History size={14} /> Histórico
          </button>
          <button
            onClick={() => voltar('desfazer')}
            disabled={!pilha.desfazer}
            className={`${botao} disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white`}
            title={pilha.desfazer ? `Desfazer: ${pilha.desfazer.descricao} (Ctrl+Z)` : 'Nada para desfazer'}
          >
            <Undo2 size={14} /> Desfazer
          </button>
          <button
            onClick={() => voltar('refazer')}
            disabled={!pilha.refazer}
            className={`${botao} disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white`}
            title={pilha.refazer ? `Refazer: ${pilha.refazer.descricao.replace(/^Desfez: /, '')} (Ctrl+Y)` : 'Nada para refazer'}
          >
            <Redo2 size={14} /> Refazer
          </button>
          <button onClick={() => setReplicarAberto(true)} className={botao} title="Copiar este mês inteiro para os meses seguintes">
            <CalendarPlus size={14} /> Replicar mês
          </button>
          <button onClick={importarFixos} className={botao} title="Traz para este mês os itens fixos e parcelas do mês anterior que ainda não estão aqui">
            <CopyPlus size={14} /> Trazer fixos do mês anterior
          </button>
        </div>
      </div>

      {notas && (
        <textarea
          autoFocus
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          onBlur={salvarObs}
          rows={2}
          placeholder="Anotações do mês. Ex.: IPVA parcelado, viagem em dezembro, renegociar internet…"
          className="w-full shrink-0 resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/20"
        />
      )}

      {/* Telas largas: as 3 tabelas lado a lado · médias: Saídas à esquerda, Cartão e PIX empilhados · celular: uma embaixo da outra */}
      {/* breakpoints em rem: o Tailwind só ordena corretamente media queries na mesma unidade (106.25rem = 1700px) */}
      <div className="grid gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[1fr_1.4fr] lg:grid-rows-[minmax(260px,1fr)_minmax(260px,1fr)] min-[106.25rem]:grid-cols-[1fr_1.25fr_1.25fr] min-[106.25rem]:grid-rows-[minmax(360px,1fr)]">
        <Grade
          className="lg:row-span-2 min-[106.25rem]:row-span-1"
          titulo="Saídas"
          grupo="saida"
          corTitulo="bg-red-500"
          check="pago"
          parcelas
          vencimento
          itens={por('saida')}
          acoes={acoes}
          {...comuns}
          rodape={
            <div className="flex justify-between gap-2 whitespace-nowrap text-slate-600">
              <span>
                Pago <b className="num text-green-700">{brl(t.pagas)}</b>
              </span>
              <span>
                Falta <b className="num text-amber-700">{brl(t.faltaPagar)}</b>
              </span>
            </div>
          }
        />
        <Grade
          titulo="Recorrentes Cartão"
          grupo="cartao"
          corTitulo="bg-slate-600"
          orcamento
          parcelas
          essencial
          categoriaFixos="Assinatura"
          itens={filtrarPorAba(por('cartao'), abaCartao)}
          abas={<AbasTipo itens={por('cartao')} aba={abaCartao} onChange={setAbaCartao} rotuloFixos="Assinaturas" />}
          nomeAba={abaCartao === 'fixos' ? 'Assinaturas' : abaCartao === 'todos' ? '' : NOMES_ABA[abaCartao]}
          novoItem={novoItemDaAba(abaCartao)}
          acoes={acoes}
          {...comuns}
        />
        <Grade
          titulo="Recorrentes PIX"
          grupo="pix"
          corTitulo="bg-green-500"
          orcamento
          parcelas
          essencial
          categoriaFixos="Fixo"
          itens={filtrarPorAba(por('pix'), abaPix)}
          abas={<AbasTipo itens={por('pix')} aba={abaPix} onChange={setAbaPix} rotuloFixos="Fixos" />}
          nomeAba={abaPix === 'fixos' ? 'Fixos' : abaPix === 'todos' ? '' : NOMES_ABA[abaPix]}
          novoItem={novoItemDaAba(abaPix)}
          acoes={acoes}
          {...comuns}
        />
      </div>

      {entradasAberto && (
        <Modal titulo="Entradas" subtitulo={<><span className="capitalize">{MESES[mes - 1]}</span> / {ano} · use o ícone de repetir para marcar as entradas fixas (Salário FIXO)</>} fechar={fecharEntradas}>
          <Grade
            titulo="Entradas"
            grupo="entrada"
            corTitulo="bg-green-600"
            check="recebido"
            itens={por('entrada')}
            acoes={acoes}
            {...comuns}
            rotuloFixo="Salário fixo: repete todo mês"
            rodape={
              <div className="flex justify-between gap-2 whitespace-nowrap text-slate-600">
                <span className="flex items-center gap-1.5" title="Salário FIXO: entradas marcadas como fixas">
                  <span className="rounded bg-green-500 px-1.5 py-0.5 text-xs font-semibold text-white">Fixo</span>
                  <b className="num">{brl(t.salarioFixo)}</b>
                </span>
                <span>
                  Extra <b className="num">{brl(t.entradas - t.salarioFixo)}</b>
                </span>
              </div>
            }
          />
        </Modal>
      )}

      {replicarAberto && <ReplicarModal ano={ano} mes={mes} fechar={fecharReplicar} concluido={replicado} />}

      {historico && <HistoricoPainel ano={ano} mes={mes} fechar={fecharHistorico} aoMudar={recarregar} />}
    </div>
  )
}
