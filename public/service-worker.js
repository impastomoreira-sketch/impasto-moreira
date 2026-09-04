const CACHE = "impasto-moreira-v3";
const SHELL = ["/assets/style.css", "/assets/logo.png", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api")) return;

  // A própria página (HTML) sempre busca a versão mais nova na rede primeiro,
  // assim nenhuma atualização futura fica presa em cache antigo no celular do cliente.
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
    return;
  }

  // Arquivos estáticos (css, imagens, manifest): responde com o cache na hora
  // (rápido), mas já busca a versão nova em segundo plano e atualiza o cache
  // pra próxima visita. Assim, mesmo sem trocar o nome do CACHE a cada deploy,
  // o cliente se autoatualiza sozinho em no máximo uma visita extra.
  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(event.request).then((cached) => {
        const network = fetch(event.request)
          .then((response) => {
            if (response && response.ok) cache.put(event.request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })
    )
  );
});
