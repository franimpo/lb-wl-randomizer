import { getStore } from '@netlify/blobs';
import * as cheerio from 'cheerio';

const DAY = 24 * 60 * 60 * 1000;
const UA = 'Mozilla/5.0 (compatible; PersonalWatchlistRandomizer/2.0; contact: site administrator)';
const j = (body, status=200) => new Response(JSON.stringify(body), {status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*'}});
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const cleanTitle = t => String(t||'').replace(/\s*\(\d{4}\)\s*$/, '').trim();
function normalize(m){return {name:cleanTitle(m.name), year:Number(m.year)||null, url:m.url||null, poster:m.poster||null, runtime:Number(m.runtime)||null, genres:m.genres||[], countries:m.countries||[], tmdbId:m.tmdbId||null};}
function extract(html) {
  const $ = cheerio.load(html);
  const found = new Map();
  const containers = $('li.poster-container, li.griditem, li.posteritem, li[data-film-id], .poster-container, .film-poster, [data-film-slug], [data-target-link], [data-item-name], [data-film-name]');
  containers.each((_, el) => {
    const node = $(el);
    const candidates = node.find('[data-film-slug], [data-target-link], [data-item-name], [data-film-name]');
    const sources = [node, ...candidates.toArray().map(x => $(x))];
    const attr = (key) => sources.map(x => x.attr(key)).find(Boolean) || '';
    const slug = attr('data-film-slug');
    const filmAnchor = node.find('a[href*="/film/"]').first();
    const outerAnchor = node.closest('a[href*="/film/"]');
    const href = attr('data-target-link') || filmAnchor.attr('href') || outerAnchor.attr('href') || (slug ? `/film/${slug}/` : '');
    const match = href.match(/\/film\/([^/?#]+)\/?/);
    if (!match) return;
    const image = node.is('img') ? node : node.find('img').first();
    let raw = attr('data-film-name') || attr('data-item-name') || image.attr('alt') || filmAnchor.attr('title') || node.attr('title') || '';
    if (!raw || /^poster$/i.test(raw.trim())) {
      raw = match[1].replace(/-\d{4}$/, '').replace(/-/g, ' ');
    }
    const title = cleanTitle(raw);
    if (!title) return;
    const yearMatch = raw.match(/\((\d{4})\)\s*$/);
    const year = yearMatch?.[1] || attr('data-film-release-year') || match[1].match(/-(\d{4})$/)?.[1] || null;
    const url = `https://letterboxd.com/film/${match[1]}/`;
    found.set(url, {name:title,year:year?Number(year):null,url,poster:null,runtime:null,genres:[],countries:[],tmdbId:null});
  });
  // Fallback for newer markup with film anchors but no poster-container wrapper.
  if (!found.size) $('a[href*="/film/"]').each((_,el)=>{
    const a=$(el), href=a.attr('href')||'', match=href.match(/\/film\/([^/?#]+)\/?/);
    if(!match)return;
    const wrapper=a.closest('[data-item-name], [data-film-name], [data-film-slug], li, .griditem');
    const raw=wrapper.attr('data-item-name')||wrapper.attr('data-film-name')||a.find('img').first().attr('alt')||a.attr('title')||'';
    // Without actual title metadata, slug-derived names are only a last resort.
    const name=cleanTitle(raw || match[1].replace(/-\d{4}$/,'').replace(/-/g,' '));
    if(!name)return;
    const year=raw.match(/\((\d{4})\)\s*$/)?.[1]||wrapper.attr('data-film-release-year')||null;
    const url=`https://letterboxd.com/film/${match[1]}/`;
    found.set(url,{name,year:year?Number(year):null,url,poster:null,runtime:null,genres:[],countries:[],tmdbId:null});
  });
  return [...found.values()];
}
function pageDiagnosis(html) {
  const h=html.toLowerCase();
  if(h.includes('cf-chl-') || h.includes('challenge-platform') || h.includes('just a moment...') || h.includes('attention required!'))
    return 'Letterboxd presentó un control antibots a Netlify (Cloudflare). La página no contiene la watchlist.';
  if(h.includes('log in') && h.includes('private') && h.includes('watchlist'))
    return 'La watchlist podría estar configurada como privada.';
  return 'La respuesta de Letterboxd no contiene películas reconocibles. Puede haber cambiado el HTML o estar bloqueando la lectura desde Netlify.';
}
async function scrape(username){
  const all=new Map();let previousSize=-1;
  for(let page=1;page<=50;page++){
    const url=`https://letterboxd.com/${encodeURIComponent(username)}/watchlist/${page===1?'':`page/${page}/`}`;
    const resp=await fetch(url,{headers:{'User-Agent':UA,'Accept':'text/html'},signal:AbortSignal.timeout(12000)});
    if(resp.status===404) {if(page===1)throw Error('Usuario inexistente o watchlist inaccesible.');break;}
    if(!resp.ok)throw Error(`Letterboxd bloqueó la consulta (${resp.status}). Podés usar la importación CSV.`);
    const html=await resp.text(); const movies=extract(html);
    console.log(`Letterboxd ${username} page ${page}: HTTP ${resp.status}, ${html.length} chars, ${movies.length} movies`);
    if(page===1&&!movies.length)throw Error(pageDiagnosis(html));
    if(!movies.length)break;
    previousSize=all.size;
    for(const m of movies)all.set(m.url,m);
    if(all.size===previousSize)break;
    await sleep(110);
  }
  return [...all.values()];
}
function titleKey(value){
  return cleanTitle(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
}
async function tmdbFetch(url, token){
  const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},signal:AbortSignal.timeout(12000)});
  if(response.status===401 || response.status===403)throw Error(`TMDB rechazó la autenticación (${response.status}). Comprobá TMDB_READ_ACCESS_TOKEN en Netlify y volvé a desplegar.`);
  if(response.status===429)throw Error('TMDB alcanzó su límite de consultas. Intentá de nuevo más tarde.');
  if(!response.ok)throw Error(`TMDB respondió HTTP ${response.status}`);
  return response.json();
}
async function enrich(movie,token,store){
  const key=`tmdb-${encodeURIComponent(titleKey(movie.name)+'-'+(movie.year||'sin-ano'))}`;
  const cached=await store.get(key,{type:'json'});
  if(cached && Date.now()-cached.checkedAt<(cached.matched?90:7)*DAY)
    return {...movie,...(cached.fields||{}),metadataChecked:true};
  const params=new URLSearchParams({query:cleanTitle(movie.name),include_adult:'false'});
  if(movie.year)params.set('year',String(movie.year));
  let results=(await tmdbFetch(`https://api.themoviedb.org/3/search/movie?${params}`,token)).results||[];
  const valid=r=>[r.title,r.original_title].some(t=>titleKey(t)===titleKey(movie.name)) && (!movie.year || Math.abs(Number(r.release_date?.slice(0,4))-movie.year)<=1);
  let match=results.find(valid);
  if(!match && movie.year){
    params.delete('year');
    results=(await tmdbFetch(`https://api.themoviedb.org/3/search/movie?${params}`,token)).results||[];
    match=results.find(valid);
  }
  if(!match){
    await store.setJSON(key,{checkedAt:Date.now(),matched:false,fields:{}});
    return {...movie,metadataChecked:true};
  }
  const detail=await tmdbFetch(`https://api.themoviedb.org/3/movie/${match.id}`,token);
  const fields={runtime:Number(detail.runtime)||null,poster:detail.poster_path?`https://image.tmdb.org/t/p/w500${detail.poster_path}`:null,genres:(detail.genres||[]).map(g=>g.name),countries:(detail.production_countries||[]).map(c=>c.iso_3166_1),tmdbId:match.id};
  await store.setJSON(key,{checkedAt:Date.now(),matched:true,fields});
  return {...movie,...fields,metadataChecked:true};
}
// Letterboxd publishes its weighted community rating in film-page JSON-LD.
function findRating(html){
  const $=cheerio.load(html);
  for(const el of $('script[type="application/ld+json"]').toArray()){
    let parsed;try{parsed=JSON.parse($(el).html()||'')}catch{continue}
    const queue=[parsed];
    while(queue.length){
      const node=queue.pop();
      if(Array.isArray(node)){queue.push(...node);continue}
      if(!node || typeof node!=='object')continue;
      const raw=node.aggregateRating?.ratingValue;
      if(raw!==undefined && raw!==null){
        const n=Number(raw),max=Number(node.aggregateRating?.bestRating||5);
        if(Number.isFinite(n)&&n>=0.5&&n<=5&&max===5)return n;
      }
      if(node['@graph'])queue.push(node['@graph']);
    }
  }
  return null;
}
async function enrichRating(movie,store){
  if(!/^https:\/\/letterboxd\.com\/film\/[a-z0-9-]+\/$/.test(movie.url||''))
    return {...movie,letterboxdRating:null,ratingChecked:true};
  const key=`rating-${encodeURIComponent(new URL(movie.url).pathname)}`;
  const cached=await store.get(key,{type:'json'});
  if(cached && Date.now()-cached.checkedAt<(cached.rating!==null?7:1)*DAY){
    return {...movie,letterboxdRating:cached.rating,ratingChecked:true};
  }
  try{
    const resp=await fetch(movie.url,{headers:{'User-Agent':UA,Accept:'text/html'},signal:AbortSignal.timeout(10000)});
    if(!resp.ok)throw Error(`Letterboxd HTTP ${resp.status}`);
    const rating=findRating(await resp.text());
    await store.setJSON(key,{checkedAt:Date.now(),rating});
    return {...movie,letterboxdRating:rating,ratingChecked:true};
  }catch(err){
    console.warn('Rating unavailable',movie.url,String(err?.message||err));
    // Keep failed fetches from triggering endless requests; retry with a refreshed watchlist.
    return {...movie,letterboxdRating:null,ratingChecked:true};
  }
}
async function enrichRatingBatch(data,store,preferredDecade=null){
  const candidates=data.movies.map((m,i)=>!m.ratingChecked?i:-1).filter(i=>i>=0);
  if(!candidates.length)return {...data,ratingPending:0};
  const preferred=preferredDecade===null?candidates:[
    ...candidates.filter(i=>Math.floor(Number(data.movies[i].year)/10)*10===preferredDecade),
    ...candidates.filter(i=>Math.floor(Number(data.movies[i].year)/10)*10!==preferredDecade)
  ];
  const batch=preferred.slice(0,8);
  const results=await Promise.all(batch.map(async i=>({index:i,movie:await enrichRating(data.movies[i],store)})));
  const movies=[...data.movies];
  for(const {index,movie} of results)movies[index]=movie;
  return {...data,movies,ratingPending:movies.filter(m=>!m.ratingChecked).length};
}
async function enrichBatch(data,token,store,preferredDecade=null){
  if(!token)return {...data,warning:'TMDB_READ_ACCESS_TOKEN no está disponible en Netlify Functions.',enrichmentPending:data.movies.filter(m=>!(m.metadataChecked||m.tmdbId)).length};
  const pending=data.movies.map((m,i)=>!(m.metadataChecked||m.tmdbId)?i:-1).filter(i=>i>=0);
  if(!pending.length)return {...data,enrichmentPending:0,warning:undefined};
  // When a decade is selected, verify its movies first instead of waiting for the entire watchlist.
  const ordered = preferredDecade === null ? pending : [
    ...pending.filter(i => Math.floor(Number(data.movies[i].year)/10)*10 === preferredDecade),
    ...pending.filter(i => Math.floor(Number(data.movies[i].year)/10)*10 !== preferredDecade)
  ];
  const batch=ordered.slice(0,8);
  // A small batch keeps requests well within Netlify Function execution time limits.
  const results=await Promise.all(batch.map(async i=>({index:i,movie:await enrich(data.movies[i],token,store)})));
  const movies=[...data.movies];
  for(const {index,movie} of results)movies[index]=movie;
  return {...data,movies,enrichmentPending:movies.filter(m=>!(m.metadataChecked||m.tmdbId)).length,warning:undefined};
}
export default async (request)=>{
  const u=new URL(request.url), username=(u.searchParams.get('username')||'').trim().toLowerCase();
  if(!/^[a-z0-9_-]{1,30}$/.test(username))return j({error:'Ingresá un usuario de Letterboxd válido.'},400);
  const store=getStore({name:'letterboxd-watchlists',consistency:'strong'}),key=`wl-${username}`;
  const token=(process.env.TMDB_READ_ACCESS_TOKEN||'').trim();
  const decadeParam=u.searchParams.get('decade');
  const preferredDecade=/^(18|19|20)\d0$/.test(decadeParam||'')?Number(decadeParam):null;
  try{
    let saved=await store.get(key,{type:'json'});
    const fresh=saved?.updatedAt && Date.now()-saved.updatedAt<DAY;
    let data=saved;
    if(!fresh){
      try {
        const list=await scrape(username);
        if(!list.length)throw Error('La watchlist está vacía o no es pública.');
        const previous=new Map((saved?.movies||[]).map(m=>[m.url,m]));
        const movies=list.map(m=>{const old=previous.get(m.url)||{};return {...m,...old,name:m.name,url:m.url,ratingChecked:old.letterboxdRating!=null?true:false};});
        data={username,updatedAt:Date.now(),movies};
      }catch(e){
        if(!saved?.movies?.length)throw e;
        data={...saved,stale:true,warning:`No se pudo actualizar Letterboxd: ${e.message}`};
      }
    }
    // Every request processes the next batch. The browser continues while data is pending.
    const syncWarning=data.warning;
    data=await enrichBatch(data,token,store,preferredDecade);
    data=await enrichRatingBatch(data,store,preferredDecade);
    if(syncWarning)data.warning=[syncWarning,data.warning].filter(Boolean).join(' ');
    await store.setJSON(key,data);
    const enriched=data.movies.filter(m=>m.tmdbId).length;
    return j({...data,enrichedCount:enriched,source:fresh?'cache':'letterboxd'});
  }catch(e){console.error('watchlist function:',e);return j({error:String(e.message||e)},502);}
};
