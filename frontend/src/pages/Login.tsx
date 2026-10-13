import { BarChart3, Loader2, Lock, Mail } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { api, auth } from '../lib/api'

export function Login({ entrou }: { entrou: () => void }) {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [lembrar, setLembrar] = useState(true)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      const { data } = await api.post('/login', { email, password: senha, remember: lembrar })
      auth.salvar(data.token, lembrar)
      entrou()
    } catch (err: unknown) {
      const resp = (err as { response?: { status?: number; data?: { message?: string } } }).response
      setErro(resp?.status === 429 ? 'Muitas tentativas. Aguarde um minuto.' : (resp?.data?.message ?? 'Não foi possível conectar ao servidor.'))
    } finally {
      setEnviando(false)
    }
  }

  const campo = 'w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/20'

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-green-700 via-green-600 to-emerald-500 p-4">
      <form onSubmit={enviar} className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="rounded-xl bg-green-600 p-3 text-white">
            <BarChart3 size={28} />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Controle Financeiro</h1>
          <p className="text-sm text-slate-500">Entre para ver seus gastos</p>
        </div>

        <label className="mb-1 block text-xs font-semibold text-slate-600">E-mail</label>
        <div className="relative mb-4">
          <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="email" required autoFocus autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={campo} placeholder="seu@email.com" />
        </div>

        <label className="mb-1 block text-xs font-semibold text-slate-600">Senha</label>
        <div className="relative mb-4">
          <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="password" required autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} className={campo} placeholder="••••••••" />
        </div>

        <label className="mb-5 flex cursor-pointer items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={lembrar} onChange={(e) => setLembrar(e.target.checked)} className="h-4 w-4 accent-green-600" />
          Lembrar-me neste dispositivo
        </label>

        {erro && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

        <button disabled={enviando} className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60">
          {enviando && <Loader2 size={16} className="animate-spin" />}
          Entrar
        </button>
        <p className="mt-4 text-center text-xs text-slate-400">Com "Lembrar-me" você continua conectado neste navegador até clicar em Sair.</p>
      </form>
    </div>
  )
}
