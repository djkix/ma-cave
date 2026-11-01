// Notifications Web Push, chargées par le service worker généré par
// vite-plugin-pwa (workbox.importScripts, voir vite.config.ts).
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // Corps non JSON : notification générique.
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Ma Cave', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url || '/' },
    }),
  );
});

// Ouvre l'adresse de la notification (de ce site seulement) dans un onglet déjà ouvert, sinon dans un nouveau.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin);
  const url = target.origin === self.location.origin ? target.href : self.location.origin + '/';
  event.waitUntil(
    (async () => {
      const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const tab = tabs.find((c) => new URL(c.url).origin === self.location.origin);
      if (!tab) return self.clients.openWindow(url);
      await tab.focus();
      return tab.navigate(url).catch(() => undefined);
    })(),
  );
});
