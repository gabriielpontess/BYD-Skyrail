const VERSION='1.3.0';
const CACHE=`byd-skyrail-${VERSION}`;
const SHELL=['./','./index.html','./manifest.webmanifest'];

self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await Promise.allSettled(SHELL.map(async path=>{
    const response=await fetch(path,{cache:'reload'});
    if(response.ok)await cache.put(path,response.clone());
  }));
  await self.skipWaiting();
})()));

self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const key of await caches.keys())if(key.startsWith('byd-skyrail-')&&key!==CACHE)await caches.delete(key);
  await self.clients.claim();
})()));

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==location.origin)return;
  if(event.request.mode==='navigate'){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      try{
        const response=await fetch(event.request);
        if(response.ok){
          await cache.put('./index.html',response.clone());
          await cache.put('./',response.clone());
        }
        return response;
      }catch{
        return await cache.match('./')||await cache.match('./index.html')||Response.error();
      }
    })());
    return;
  }
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const hit=await cache.match(event.request);
    if(hit)return hit;
    try{
      const response=await fetch(event.request);
      if(response.ok)await cache.put(event.request,response.clone());
      return response;
    }catch{return Response.error()}
  })());
});
