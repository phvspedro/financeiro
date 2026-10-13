import { ArrowDown, ArrowUp } from 'lucide-react'
import { arred, brl, fmtVencimento, statusVencimento } from '../lib/money'
import type { Lancamento } from '../lib/types'

/** Setinha quando o valor mudou em relação ao mês anterior (ou ponto quando o item é novo) */
export function Variacao({ atual, antes, temAnterior, entrada }: { atual: number; antes?: number; temAnterior: boolean; entrada: boolean }) {
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
export function Vencimento({ item, hoje, ano }: { item: Lancamento; hoje: string; ano: number }) {
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
