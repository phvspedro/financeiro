import { useSyncExternalStore } from 'react'

const CONSULTA = '(max-width: 767px)'

function assinar(aviso: () => void) {
  const mq = window.matchMedia(CONSULTA)
  mq.addEventListener('change', aviso)
  return () => mq.removeEventListener('change', aviso)
}

/** true em telas de celular (< 768px): o app troca a planilha por listas e folhas de edição */
export function useMovel() {
  return useSyncExternalStore(
    assinar,
    () => window.matchMedia(CONSULTA).matches,
    () => false,
  )
}
