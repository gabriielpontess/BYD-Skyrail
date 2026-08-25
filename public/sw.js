const VERSION='1.5.0';
const CACHE=`byd-skyrail-${VERSION}`;
const INDEX='/index.html';
const ROOT='/';

async function cacheCurrentShell(){
  const cache=await caches.open(CACHE);
  const response=await fetch(INDEX,{cache:'reload'});
  if(!response.ok)throw new Error(`Falha ao carregar shell: HTTP ${response.status}`);
  const html=await response.clone().text();
  await cache.put(INDEX,response.clone());
  await cache.put(ROOT,response.clone());

  const assets=new Set(['/manifest.webmanifest']);
  for(const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)){
    const raw=match[1];
    if(!raw||raw.startsWith('data:')||raw.startsWith('blob:')||raw.startsWith('#'))continue;
    const url=new URL(raw,self.location.origin + ROOT);
    if(url.origin!==self.location.origin)continue;
    assets.add(url.pathname+url.search);
  }

  await Promise.all([...assets].map(async asset=>{
    const assetResponse=await fetch(asset,{cache:'reload'});
    if(!assetResponse.ok)throw new Error(`Falha ao pré-carregar ${asset}: HTTP ${assetResponse.status}`);
    await cache.put(asset,assetResponse.clone());
  }));
}

self.addEventListener('install',event=>event.waitUntil((async()=>{
  await cacheCurrentShell();
  await self.skipWaiting();
})()));

self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const key of await caches.keys()){
    if(key.startsWith('byd-skyrail-')&&key!==CACHE)await caches.delete(key);
  }
  await self.clients.claim();
})()));

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;

  if(event.request.mode==='navigate'){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      try{
        const response=await fetch(event.request,{cache:'no-store'});
        if(response.ok)return response;
      }catch{}
      return await cache.match(ROOT)||await cache.match(INDEX)||Response.error();
    })());
    return;
  }

  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const cached=await cache.match(event.request);
    if(cached)return cached;
    try{
      const response=await fetch(event.request);
      if(response.ok)await cache.put(event.request,response.clone());
      return response;
    }catch{
      return Response.error();
    }
  })());
});
