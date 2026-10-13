import Swal from 'sweetalert2'

const VERDE = '#16a34a'
const CINZA = '#64748b'
const VERMELHO = '#dc2626'

interface Confirmacao {
  titulo: string
  texto?: string
  /** Rótulo do botão de confirmar */
  confirmar?: string
  /** Rótulo do botão de cancelar */
  cancelar?: string
  /** Ação destrutiva: botão vermelho e foco no Cancelar */
  perigo?: boolean
}

/** Pergunta antes de uma ação. Resolve true se o usuário confirmou. */
export async function confirmar({ titulo, texto, confirmar = 'Confirmar', cancelar = 'Cancelar', perigo = false }: Confirmacao): Promise<boolean> {
  const { isConfirmed } = await Swal.fire({
    title: titulo,
    text: texto,
    icon: perigo ? 'warning' : 'question',
    showCancelButton: true,
    confirmButtonText: confirmar,
    cancelButtonText: cancelar,
    confirmButtonColor: perigo ? VERMELHO : VERDE,
    cancelButtonColor: CINZA,
    reverseButtons: true,
    focusCancel: perigo,
  })
  return isConfirmed
}

const aviso = Swal.mixin({
  toast: true,
  position: 'bottom',
  showConfirmButton: false,
  timer: 3500,
  timerProgressBar: true,
  didOpen: (el) => {
    el.addEventListener('mouseenter', Swal.stopTimer)
    el.addEventListener('mouseleave', Swal.resumeTimer)
  },
})

/** Aviso rápido no rodapé da tela */
export function toast(texto: string, tipo: 'ok' | 'erro' = 'ok') {
  void aviso.fire({ icon: tipo === 'erro' ? 'error' : 'success', title: texto, timer: tipo === 'erro' ? 6000 : 3500 })
}

/** Tem uma janela do SweetAlert aberta? (para o Esc fechar só ela) */
export const alertaAberto = () => Swal.isVisible()
