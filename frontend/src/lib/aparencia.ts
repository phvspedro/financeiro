import { useSyncExternalStore } from 'react'

export type Tema = 'auto' | 'claro' | 'escuro'
export type Fonte = 'pequena' | 'media' | 'grande'
export type Densidade = 'compacta' | 'normal' | 'confortavel'

export interface Aparencia {
  tema: Tema
  fonte: Fonte
  densidade: Densidade
}

const CHAVE = 'financeiro.aparencia'
const PADRAO: Aparencia = { tema: 'auto', fonte: 'media', densidade: 'normal' }

/** Tamanho da letra (a raiz em %: o Tailwind usa rem, então tudo acompanha) e altura das linhas das tabelas */
const FONTE: Record<Fonte, string> = { pequena: '90%', media: '100%', grande: '112.5%' }
const LINHA: Record<Densidade, string> = { compacta: '1.625rem', normal: '2rem', confortavel: '2.5rem' }

const escuroDoSistema = () => window.matchMedia('(prefers-color-scheme: dark)')

function ler(): Aparencia {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE) ?? '{}') as Partial<Aparencia>
    return {
      tema: salvo.tema && ['auto', 'claro', 'escuro'].includes(salvo.tema) ? salvo.tema : PADRAO.tema,
      fonte: salvo.fonte && salvo.fonte in FONTE ? salvo.fonte : PADRAO.fonte,
      densidade: salvo.densidade && salvo.densidade in LINHA ? salvo.densidade : PADRAO.densidade,
    }
  } catch {
    return PADRAO
  }
}

let estado = ler()
const ouvintes = new Set<() => void>()

const ehEscuro = (a: Aparencia) => a.tema === 'escuro' || (a.tema === 'auto' && escuroDoSistema().matches)

function aplicar() {
  const raiz = document.documentElement
  const escuro = ehEscuro(estado)
  raiz.classList.toggle('dark', escuro)
  raiz.style.setProperty('--fonte-base', FONTE[estado.fonte])
  raiz.style.setProperty('--altura-linha', LINHA[estado.densidade])
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', escuro ? '#0f172a' : '#16a34a')
}

function avisar() {
  ouvintes.forEach((f) => f())
}

/** Aplica o que está salvo (chamado antes de a tela renderizar, para não piscar) e acompanha o tema do sistema */
export function iniciarAparencia() {
  aplicar()
  escuroDoSistema().addEventListener('change', () => {
    if (estado.tema === 'auto') {
      aplicar()
      avisar()
    }
  })
}

export function definirAparencia(parcial: Partial<Aparencia>) {
  estado = { ...estado, ...parcial }
  try {
    localStorage.setItem(CHAVE, JSON.stringify(estado))
  } catch {
    /* sem armazenamento: vale só nesta sessão */
  }
  aplicar()
  avisar()
}

function assinar(f: () => void) {
  ouvintes.add(f)
  return () => ouvintes.delete(f)
}

export function useAparencia() {
  return useSyncExternalStore(assinar, () => estado)
}

/** O tema escuro está valendo agora? (para gráficos, que não usam as classes do CSS) */
export function useEscuro() {
  return useSyncExternalStore(assinar, () => ehEscuro(estado))
}
