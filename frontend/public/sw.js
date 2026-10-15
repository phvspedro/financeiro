// Service worker mínimo: só existe para exibir notificações (lembretes de vencimento) e abrir o app ao tocar nelas.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = (e.notification.data && e.notification.data.url) || '/'
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((janelas) => {
      for (const j of janelas) {
        if ('focus' in j) {
          if ('navigate' in j) j.navigate(url).catch(() => {})
          return j.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
