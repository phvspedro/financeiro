import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

export type Direcao = 'cima' | 'baixo' | 'esquerda' | 'direita'

interface Props {
  r: number
  c: string
  /** Conteúdo exibido quando não está editando */
  children: ReactNode
  /** Texto inicial ao entrar em edição */
  textoEdicao: string
  /** Retorna false se o valor digitado for inválido (mantém em edição) */
  onSalvar: (texto: string) => boolean | void
  onNavegar: (r: number, c: string, d: Direcao) => void
  className?: string
  alinhar?: 'esquerda' | 'direita' | 'centro'
  placeholder?: string
  titulo?: string
}

/**
 * Célula editável no estilo Excel:
 * - clique duplo, Enter, F2 ou começar a digitar → edita
 * - Enter salva e desce · Tab salva e vai para a direita · Esc cancela
 * - setas navegam entre células · Delete limpa
 */
export function Celula({ r, c, children, textoEdicao, onSalvar, onNavegar, className = '', alinhar = 'esquerda', placeholder, titulo }: Props) {
  const [editando, setEditando] = useState(false)
  const [rascunho, setRascunho] = useState('')
  const [erro, setErro] = useState(false)
  const celula = useRef<HTMLDivElement>(null)
  const finalizado = useRef(false)
  const jaFocada = useRef(false)
  // Teclas que chegam antes do campo abrir (digitação muito rápida) são somadas, não perdidas
  const abrindo = useRef(false)

  const alin = alinhar === 'direita' ? 'text-right justify-end' : alinhar === 'centro' ? 'text-center justify-center' : 'text-left'

  function editar(inicial: string, digitando = false) {
    if (digitando && abrindo.current) {
      setRascunho((r) => r + inicial)
      return
    }
    abrindo.current = digitando
    finalizado.current = false
    setErro(false)
    setRascunho(inicial)
    setEditando(true)
  }

  function salvar(): boolean {
    if (finalizado.current) return true
    if (rascunho !== textoEdicao && onSalvar(rascunho) === false) {
      setErro(true)
      return false
    }
    finalizado.current = true
    abrindo.current = false
    setEditando(false)
    return true
  }

  function cancelar() {
    abrindo.current = false
    finalizado.current = true
    setEditando(false)
    celula.current?.focus()
  }

  function teclaCelula(e: KeyboardEvent<HTMLDivElement>) {
    const mapa: Record<string, Direcao> = { ArrowUp: 'cima', ArrowDown: 'baixo', ArrowLeft: 'esquerda', ArrowRight: 'direita' }
    if (mapa[e.key]) {
      e.preventDefault()
      onNavegar(r, c, mapa[e.key])
    } else if (e.key === 'Tab') {
      e.preventDefault()
      onNavegar(r, c, e.shiftKey ? 'esquerda' : 'direita')
    } else if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault()
      editar(textoEdicao)
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      onSalvar('')
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault()
      editar(e.key, true)
    }
  }

  function teclaInput(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      if (salvar()) onNavegar(r, c, e.key === 'Tab' ? (e.shiftKey ? 'esquerda' : 'direita') : e.shiftKey ? 'cima' : 'baixo')
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelar()
    }
  }

  return (
    <div
      ref={celula}
      tabIndex={0}
      data-r={r}
      data-c={c}
      title={titulo}
      onKeyDown={editando ? undefined : teclaCelula}
      onDoubleClick={() => !editando && editar(textoEdicao)}
      // Clicar numa célula já selecionada também edita (prático no celular)
      onMouseDown={() => (jaFocada.current = document.activeElement === celula.current)}
      onClick={() => !editando && jaFocada.current && editar(textoEdicao)}
      className={`cell flex h-8 items-center px-2 outline-none ${alin} ${className}`}
    >
      {editando ? (
        <input
          autoFocus
          value={rascunho}
          placeholder={placeholder}
          onChange={(e) => {
            setErro(false)
            setRascunho(e.target.value)
          }}
          onKeyDown={teclaInput}
          onBlur={() => {
            if (!salvar()) cancelar()
          }}
          onFocus={(e) => {
            // Se entrou pelo Enter/duplo clique, seleciona tudo; se começou a digitar, cursor no fim
            if (rascunho === textoEdicao) e.target.select()
            else e.target.setSelectionRange(rascunho.length, rascunho.length)
          }}
          className={`num -mx-1 h-7 w-full rounded-sm bg-white px-1 text-sm outline-none ring-2 ${erro ? 'ring-red-500' : 'ring-green-600'} ${alin}`}
        />
      ) : (
        children
      )}
    </div>
  )
}
