import { useEffect, useSyncExternalStore } from 'react'
import { api } from './api'
import { brl, hojeISO } from './money'
import type { Lancamento } from './types'

const CHAVE_ATIVO = 'financeiro.lembretes'
const CHAVE_AVISADOS = 'financeiro.lembretes.avisados'

const ouvintes = new Set<() => void>()
const avisar = () => ouvintes.forEach((f) => f())

const lerAtivo = () => {
  try {
    return localStorage.getItem(CHAVE_ATIVO) === '1'
  } catch {
    return false
  }
}

export const suportaNotificacao = () => typeof Notification !== 'undefined'

export type EstadoLembretes = 'indisponivel' | 'bloqueado' | 'desligado' | 'ligado'

function estadoAtual(): EstadoLembretes {
  if (!suportaNotificacao()) return 'indisponivel'
  if (Notification.permission === 'denied') return 'bloqueado'
  return Notification.permission === 'granted' && lerAtivo() ? 'ligado' : 'desligado'
}

export function useLembretes(): EstadoLembretes {
  return useSyncExternalStore(
    (f) => {
      ouvintes.add(f)
      return () => ouvintes.delete(f)
    },
    estadoAtual,
  )
}

/** Liga ou desliga os lembretes. Ao ligar, pede a permissão do navegador. Retorna o estado resultante. */
export async function alternarLembretes(): Promise<EstadoLembretes> {
  if (!suportaNotificacao()) return 'indisponivel'
  if (estadoAtual() === 'ligado') {
    localStorage.setItem(CHAVE_ATIVO, '0')
  } else {
    const permissao = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
    if (permissao === 'granted') {
      localStorage.setItem(CHAVE_ATIVO, '1')
      void verificarVencimentos(true)
    }
  }
  avisar()
  return estadoAtual()
}

const dois = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`

async function notificar(titulo: string, corpo: string, tag: string, ano: number, mes: number) {
  const opcoes: NotificationOptions = { body: corpo, tag, icon: '/icon-192.png', badge: '/icon-192.png', data: { url: `/#/mes/${ano}-${dois(mes)}` } }
  try {
    const registro = await navigator.serviceWorker?.getRegistration()
    if (registro) return await registro.showNotification(titulo, opcoes)
  } catch {
    /* cai para a notificação simples */
  }
  new Notification(titulo, opcoes)
}

function jaAvisados(hoje: string): Set<string> {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_AVISADOS) ?? 'null') as { data: string; chaves: string[] } | null
    return new Set(salvo?.data === hoje ? salvo.chaves : [])
  } catch {
    return new Set()
  }
}

/**
 * Avisa dos pagamentos (Saídas) que vencem hoje ou amanhã e ainda não foram marcados como pagos.
 * Cada item é avisado uma vez por dia. `teste` ignora o "já avisado" (usado ao ligar os lembretes).
 */
export async function verificarVencimentos(teste = false): Promise<number> {
  if (estadoAtual() !== 'ligado') return 0

  const agora = new Date()
  const amanha = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1)
  const hoje = hojeISO()
  const alvos = [...new Set([`${agora.getFullYear()}-${dois(agora.getMonth() + 1)}`, `${amanha.getFullYear()}-${dois(amanha.getMonth() + 1)}`])]

  let existentes: string[]
  try {
    existentes = (await api.get<string[]>('/meses')).data
  } catch {
    return 0
  }

  const itens: Lancamento[] = []
  for (const competencia of alvos.filter((c) => existentes.includes(c))) {
    const [a, m] = competencia.split('-')
    try {
      itens.push(...(await api.get<{ lancamentos: Lancamento[] }>(`/meses/${Number(a)}/${Number(m)}`)).data.lancamentos)
    } catch {
      /* tenta de novo na próxima verificação */
    }
  }

  const pendentes = itens.filter((l) => l.grupo === 'saida' && !l.pago && l.vencimento)
  const avisados = jaAvisados(hoje)
  const novos: string[] = []
  let enviados = 0

  for (const [quando, data, titulo] of [
    ['hoje', hoje, 'Vence hoje'],
    ['amanha', iso(amanha), 'Vence amanhã'],
  ] as const) {
    const lista = pendentes.filter((l) => l.vencimento === data && (teste || !avisados.has(`${quando}:${l.id}`)))
    if (!lista.length) continue
    const [ano, mes] = data.split('-').map(Number)
    const corpo = lista.map((l) => `${l.nome}${l.valor ? ` · ${brl(l.valor)}` : ''}`).join('\n')
    await notificar(lista.length > 1 ? `${titulo}: ${lista.length} pagamentos` : titulo, corpo, `vencimento-${quando}`, ano, mes)
    novos.push(...lista.map((l) => `${quando}:${l.id}`))
    enviados += lista.length
  }

  if (novos.length) {
    try {
      localStorage.setItem(CHAVE_AVISADOS, JSON.stringify({ data: hoje, chaves: [...avisados, ...novos] }))
    } catch {
      /* ignora */
    }
  }
  return enviados
}

/** Enquanto o app está aberto: confere ao abrir, ao voltar para a aba e a cada 30 minutos */
export function useVerificarVencimentos(ativo: boolean) {
  useEffect(() => {
    if (!ativo) return
    void verificarVencimentos()
    const voltou = () => document.visibilityState === 'visible' && void verificarVencimentos()
    document.addEventListener('visibilitychange', voltou)
    const timer = setInterval(() => void verificarVencimentos(), 30 * 60_000)
    return () => {
      document.removeEventListener('visibilitychange', voltou)
      clearInterval(timer)
    }
  }, [ativo])
}
