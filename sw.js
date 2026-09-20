const CACHE_NAME="musicapp-v6";
const AUDIO_CACHE="musicapp-audio-v3";
const FILES=["./","./index.html","./manifest.json","./sw.js"];

self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()));
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(
      keys.filter(k=>k.startsWith("musicapp-") && k!==CACHE_NAME && k!==AUDIO_CACHE)
        .map(k=>caches.delete(k))
    )).then(()=>self.clients.claim())
  );
});

self.addEventListener("fetch",event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=="GET") return;

  if(url.origin===location.origin && url.pathname.startsWith("/api/")){
    event.respondWith(fetch(event.request));
    return;
  }

  // Always get the app shell from the network first so deployments are not stuck on old HTML.
  if(url.origin===location.origin && (url.pathname==="/" || url.pathname.endsWith("/index.html") || url.pathname.endsWith("/sw.js"))){
    event.respondWith(
      fetch(event.request, {cache:"no-store"})
        .then(response=>{
          const copy=response.clone();
          caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy));
          return response;
        })
        .catch(()=>caches.match(event.request).then(c=>c || caches.match("./")))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached=>cached || fetch(event.request).then(response=>{
      if(url.origin===location.origin){
        const copy=response.clone();
        caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy));
      }
      return response;
    }).catch(()=>caches.match("./")))
  );
});