import axios from 'axios'

const CHAVE = 'financeiro.token'

// "Lembrar-me" guarda o token em localStorage (permanente); sem ele, em sessionStorage
// (some ao fechar o navegador).
export const auth = {
  token: () => localStorage.getItem(CHAVE) ?? sessionStorage.getItem(CHAVE),
  salvar: (t: string, lembrar: boolean) => {
    auth.limpar()
    ;(lembrar ? localStorage : sessionStorage).setItem(CHAVE, t)
  },
  limpar: () => {
    localStorage.removeItem(CHAVE)
    sessionStorage.removeItem(CHAVE)
  },
}

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  headers: { Accept: 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = auth.token()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(undefined, (erro) => {
  if (erro.response?.status === 401 && auth.token()) {
    auth.limpar()
    window.dispatchEvent(new Event('auth:sair'))
  }
  return Promise.reject(erro)
})
