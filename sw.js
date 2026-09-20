const CACHE_NAME="musicapp-v1";
const FILES=["./","./index.html","./manifest.json","./music/teste.mp3"];
self.addEventListener("install",event=>{event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(FILES)))});
self.addEventListener("fetch",event=>{event.respondWith(caches.match(event.request).then(response=>response||fetch(event.request)))});
