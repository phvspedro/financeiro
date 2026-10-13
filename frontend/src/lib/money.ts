import type { Lancamento } from './types'

const formato = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const formatoNum = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const brl = (v: number | null | undefined) => formato.format(v ?? 0)
export const numero = (v: number | null | undefined) => (v == null ? '' : formatoNum.format(v))
export const arred = (v: number) => Math.round(v * 100) / 100

/** Converte um número digitado no padrão brasileiro ("1.234,56", "2.000", "24,9") */
function normalizar(token: string): string {
  if (token.includes(',')) return token.replace(/\./g, '').replace(',', '.')
  const pontos = token.split('.').length - 1
  if (pontos > 1) return token.replace(/\./g, '')
  if (pontos === 1 && /\.\d{3}$/.test(token)) return token.replace('.', '') // 2.000 = dois mil
  return token
}

/**
 * Lê o que foi digitado numa célula de valor. Aceita contas como no Excel:
 * "540+60", "=1.600/2", "R$ 99,90". Retorna null se não for válido.
 */
export function lerValor(texto: string): number | null {
  let t = texto.trim().replace(/^=/, '').replace(/R\$/gi, '').replace(/\s+/g, '')
  if (!t) return null
  t = t.replace(/\d[\d.,]*/g, normalizar)
  if (!/^[\d+\-*/().]+$/.test(t)) return null
  try {
    const resultado = Function(`"use strict"; return (${t})`)()
    return typeof resultado === 'number' && Number.isFinite(resultado) ? arred(resultado) : null
  } catch {
    return null
  }
}

export type TipoItem = 'fixo' | 'variavel' | 'parcelado' | 'avulso'

/**
 * Fixo: repete todo mês com valor fixo · Variável: repete todo mês, mas o valor muda (gasolina, mercado)
 * Parcelado: tem prazo para acabar · Avulso: só este mês
 */
export const tipoDe = (l: Lancamento): TipoItem => (l.recorrente ? (l.variavel ? 'variavel' : 'fixo') : l.parcela_total ? 'parcelado' : 'avulso')

export const chaveItem = (l: Pick<Lancamento, 'grupo' | 'nome'>) => `${l.grupo}|${l.nome.trim().toLowerCase()}`

/** Mês (1-12) e ano em que um parcelado termina, a partir do mês atual */
export function terminaEm(l: Lancamento, ano: number, mes: number) {
  const d = new Date(ano, mes - 1 + ((l.parcela_total ?? 1) - (l.parcela_atual ?? 1)), 1)
  return { ano: d.getFullYear(), mes: d.getMonth() + 1, texto: `${MESES[d.getMonth()].slice(0, 3)}/${String(d.getFullYear()).slice(2)}` }
}

/** Esta parcela já foi paga? Saídas: check de pago. Cartão e PIX não têm check: vale o real lançado. */
export const pagoNoMes = (l: Lancamento) => l.pago || ((l.grupo === 'cartao' || l.grupo === 'pix') && l.real != null)

/** Quanto ainda falta pagar de um parcelado: as parcelas seguintes, mais a deste mês se ainda não foi paga */
export const restante = (l: Lancamento) => arred(l.valor * ((l.parcela_total ?? 1) - (l.parcela_atual ?? 1) + (pagoNoMes(l) ? 0 : 1)))

export const ehGastoFixo = (l: Lancamento) => tipoDe(l) === 'fixo' && (l.grupo === 'cartao' || l.grupo === 'pix')

/**
 * Gasto fixo e assinatura (Cartão e PIX) já têm o Real preenchido, igual ao valor; o amarelo fica só para o que
 * ainda falta lançar (se deixar de ser fixo, o Real automático some). Devolve o Real que o servidor vai aplicar junto de uma alteração (mesma regra do backend),
 * para a tela mostrar na hora: ao virar fixo com o Real em branco, ou ao mudar o valor quando o Real acompanhava.
 */
export function realAutomatico(item: Lancamento, dados: Partial<Lancamento>): Partial<Lancamento> {
  if ('real' in dados) return {}
  const novo = { ...item, ...dados }
  const acompanhava = item.real != null && Math.abs(item.real - item.valor) < 0.005
  if (!ehGastoFixo(novo)) return ehGastoFixo(item) && acompanhava ? { real: null } : {} // deixou de ser fixo: volta a ficar em aberto
  if (!ehGastoFixo(item) && novo.real == null) return { real: novo.valor }
  if ('valor' in dados && acompanhava) return { real: novo.valor }
  return {}
}

/** Mesmas regras de totais da planilha (e do backend) */
export function calcularTotais(itens: Lancamento[]) {
  const soma = (filtro: (l: Lancamento) => boolean, campo: (l: Lancamento) => number | null) =>
    arred(itens.filter(filtro).reduce((s, l) => s + (campo(l) ?? 0), 0))

  const entradas = soma((l) => l.grupo === 'entrada', (l) => l.valor)
  const saidas = soma((l) => l.grupo === 'saida', (l) => l.valor)
  const pagas = soma((l) => l.grupo === 'saida' && l.pago, (l) => l.valor)
  const cartao = soma((l) => l.grupo === 'cartao', (l) => l.valor)
  const cartaoReal = soma((l) => l.grupo === 'cartao', (l) => l.real)
  const pixPrevisto = soma((l) => l.grupo === 'pix', (l) => l.valor)
  const pix = soma((l) => l.grupo === 'pix', (l) => l.real)
  const salarioFixo = soma((l) => l.grupo === 'entrada' && l.recorrente, (l) => l.valor)
  // Gastos fixos = itens fixos dos recorrentes do cartão e PIX
  const totalFixo = soma(ehGastoFixo, (l) => l.valor)
  const minimo = soma((l) => ehGastoFixo(l) && l.essencial, (l) => l.valor)
  const variaveis = soma((l) => tipoDe(l) === 'variavel' && (l.grupo === 'cartao' || l.grupo === 'pix'), (l) => l.valor)
  const parcelados = soma((l) => l.grupo !== 'entrada' && tipoDe(l) === 'parcelado', (l) => l.valor)

  return {
    entradas,
    saidas,
    final: arred(entradas - saidas),
    pagas,
    faltaPagar: arred(saidas - pagas),
    cartao,
    cartaoReal,
    pix,
    pixPrevisto,
    custo: arred(cartao + pix),
    salarioFixo,
    salarioMenosCusto: arred(salarioFixo - cartao - pix),
    sobra: arred(entradas - cartao - pix),
    totalFixo,
    cortavel: arred(totalFixo - minimo),
    minimo,
    parcelados,
    variaveis,
  }
}

export type Totais = ReturnType<typeof calcularTotais>

export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

const dois = (n: number) => String(n).padStart(2, '0')

/** Hoje, no fuso do computador, como 'AAAA-MM-DD' */
export function hojeISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`
}

/**
 * Lê o vencimento digitado: "10" (dia, no mês que está na tela), "10/11" ou "10/11/2026".
 * Vazio limpa a data. Retorna undefined se não for uma data válida.
 */
export function lerVencimento(texto: string, ano: number, mes: number): string | null | undefined {
  const t = texto.trim()
  if (!t) return null
  const m = t.match(/^(\d{1,2})(?:[/.-](\d{1,2})(?:[/.-](\d{4}|\d{2}))?)?$/)
  if (!m) return undefined

  const dia = Number(m[1])
  const mm = m[2] ? Number(m[2]) : mes
  const aa = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : ano
  const d = new Date(aa, mm - 1, dia)
  if (d.getFullYear() !== aa || d.getMonth() !== mm - 1 || d.getDate() !== dia) return undefined

  return `${aa}-${dois(mm)}-${dois(dia)}`
}

/** 'AAAA-MM-DD' → "dd/mm" (com o ano, se for diferente do ano da tela) */
export function fmtVencimento(iso: string | null, ano?: number): string {
  if (!iso) return ''
  const [a, m, d] = iso.split('-')
  return `${d}/${m}${ano !== undefined && Number(a) !== ano ? `/${a.slice(2)}` : ''}`
}

/** Texto para editar a célula: sempre com o ano, para não haver dúvida */
export const textoVencimento = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '')

const emDias = (iso: string, hoje: string) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / 86_400_000)

export type StatusVencimento = 'atrasado' | 'hoje' | 'breve' | 'ok' | 'pago'

/** Situação de um pagamento em relação ao vencimento (null se não tem data) */
export function statusVencimento(l: Pick<Lancamento, 'vencimento' | 'pago'>, hoje = hojeISO()): { status: StatusVencimento; dias: number } | null {
  if (!l.vencimento) return null
  const dias = emDias(l.vencimento, hoje)
  if (l.pago) return { status: 'pago', dias }
  if (dias < 0) return { status: 'atrasado', dias }
  if (dias === 0) return { status: 'hoje', dias }
  return { status: dias <= 3 ? 'breve' : 'ok', dias }
}
