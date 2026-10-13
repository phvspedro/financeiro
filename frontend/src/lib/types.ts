export type Grupo = 'entrada' | 'saida' | 'cartao' | 'pix'

export interface Lancamento {
  id: number
  grupo: Grupo
  nome: string
  valor: number
  real: number | null
  /** Data de vencimento, 'AAAA-MM-DD' */
  vencimento: string | null
  pago: boolean
  recorrente: boolean
  essencial: boolean
  /** Repete todo mês, mas o valor muda (gasolina, mercado): o valor é só uma estimativa */
  variavel: boolean
  parcela_atual: number | null
  parcela_total: number | null
  ordem: number
}

export interface Historico {
  id: number
  acao: 'criou' | 'alterou' | 'excluiu' | 'importou' | 'replicou' | 'propagou'
  grupo: Grupo | null
  nome: string | null
  campo: 'nome' | 'valor' | 'real' | 'vencimento' | 'pago' | 'recorrente' | 'essencial' | 'variavel' | 'parcela' | null
  antes: string | null
  depois: string | null
  created_at: string
  /** Linhas da mesma ação do usuário compartilham o lote (null nos registros antigos) */
  lote: string | null
  rotulo: string | null
  /** Lote que desfez esta ação (se foi desfeita) */
  desfeito_por: string | null
  /** Quando o lote é um "desfazer", o lote que ele desfez */
  reverte_lote: string | null
  automatico: boolean
  /** Em quantos meses o lote mexeu (replicar atinge vários) */
  lote_meses: number
  dados?: { meses?: string[] | number; criados?: number; atualizados?: number; removidos?: number } | null
}

export interface ResumoPilha {
  lote: string
  descricao: string
  itens: number
}

/** O que Desfazer (Ctrl+Z) e Refazer (Ctrl+Y) fariam agora */
export interface Pilha {
  desfazer: ResumoPilha | null
  refazer: ResumoPilha | null
}

export interface ResultadoPropagar {
  criados: number
  atualizados: number
  removidos: number
  meses: number
  /** Meses que não existiam e foram criados até a última parcela */
  novos_meses: string[]
}

export interface ResultadoReplicar {
  criados: number
  atualizados: number
  meses: string[]
}

/** Valor de cada item no mês anterior. Chave: "grupo|nome em minúsculas" */
export type ValoresAnteriores = Record<string, number>

export interface MesInfo {
  id: number
  competencia: string
  observacao: string | null
}

export interface TotaisAno {
  mes: number
  vazio?: boolean
  entradas?: number
  saidas?: number
  final?: number
  cartao?: number
  pix?: number
  custo?: number
  salario_fixo?: number
  salario_menos_custo?: number
  sobra?: number
  total_fixo?: number
  cortavel?: number
  minimo?: number
  parcelados?: number
  variaveis?: number
}
