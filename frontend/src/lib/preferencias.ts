import { useCallback, useState } from 'react'

/** Estado que o navegador lembra entre uma visita e outra (ordenação, filtros...). Sem armazenamento, só não lembra. */
export function usePersistido<T>(chave: string, inicial: T): [T, (v: T | ((anterior: T) => T)) => void] {
  const [valor, setValor] = useState<T>(() => {
    try {
      const salvo = localStorage.getItem(chave)
      return salvo ? { ...inicial, ...(JSON.parse(salvo) as T) } : inicial
    } catch {
      return inicial
    }
  })

  const definir = useCallback(
    (v: T | ((anterior: T) => T)) => {
      setValor((anterior) => {
        const novo = typeof v === 'function' ? (v as (a: T) => T)(anterior) : v
        try {
          localStorage.setItem(chave, JSON.stringify(novo))
        } catch {
          /* ignora */
        }
        return novo
      })
    },
    [chave],
  )

  return [valor, definir]
}
