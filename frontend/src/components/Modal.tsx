import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { alertaAberto } from '../lib/alerta'

interface Props {
  titulo: ReactNode
  subtitulo?: ReactNode
  fechar: () => void
  children: ReactNode
}

export function Modal({ titulo, subtitulo, fechar, children }: Props) {
  const caixa = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Esc fecha, a não ser que uma célula em edição já tenha tratado o Esc (cancelar edição)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented && !alertaAberto() && fechar()
    window.addEventListener('keydown', esc)
    // Já posiciona na primeira célula para poder digitar direto
    caixa.current?.querySelector<HTMLElement>('[data-c="nome"]')?.focus()
    return () => window.removeEventListener('keydown', esc)
  }, [fechar])

  return createPortal(
    <div className="fixed inset-0 z-40 flex items-end justify-center overflow-y-auto bg-black/40 md:items-center md:p-4" onMouseDown={(e) => e.target === e.currentTarget && fechar()}>
      <div ref={caixa} role="dialog" aria-modal="true" className="w-full max-w-2xl rounded-t-2xl bg-slate-50 shadow-2xl md:rounded-2xl">
        <header className="flex items-center justify-between px-4 pb-2 pt-4 md:px-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{titulo}</h2>
            {subtitulo && <p className="text-xs text-slate-500">{subtitulo}</p>}
          </div>
          <button onClick={fechar} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200" title="Fechar (Esc)">
            <X size={18} />
          </button>
        </header>
        <div className="max-h-[80dvh] overflow-y-auto px-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:max-h-[75vh] md:px-5">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
