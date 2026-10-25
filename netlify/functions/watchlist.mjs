import { getStore } from '@netlify/blobs';
import * as cheerio from 'cheerio';

const DAY = 24 * 60 * 60 * 1000;
const UA = 'Mozilla/5.0 (compatible; PersonalWatchlistRandomizer/2.0; contact: site administrator)';
const j = (body, status=200) => new Response(JSON.stringify(body), {status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*'}});
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const cleanTitle = t => String(t||'').replace(/\s*\(\d{4}\)\s*$/, '').trim();
function normalize(m){return {name:cleanTitle(m.name), year:Number(m.year)||null, url:m.url||null, poster:m.poster||null, runtime:Number(m.runtime)||null, genres:m.genres||[], countries:m.countries||[], tmdbId:m.tmdbId||null};}
function extract(html) {
  const $ = cheerio.load(html), found = new Map();
  $('[data-film-slug], [data-film-name], [data-item-name], .poster-container, .film-poster, .poster').each((_,el)=>{
    const node=$(el); const inner=node.find('[data-film-slug], [data-film-name], [data-item-name], img').first();
    const d=node.attr('data-film-name')||node.attr('data-item-name')||inner.attr('data-film-name')||inner.attr('data-item-name')||node.find('img').first().attr('alt')||'';
    const slug=node.attr('data-film-slug')||inner.attr('data-film-slug')||'';
    const href=node.find('a[href*="/film/"]').first().attr('href')||node.closest('a[href*="/film/"]').attr('href')|| (slug?`/film/${slug}/`:null);
    const title=cleanTitle(d);const yr=d.match(/\((\d{4})\)\s*$/)?.[1]||node.attr('data-film-release-year')||null;
    if(!href||!title||title.toLowerCase()==='poster')return;
    const path=href.match(/\/film\/([^/?#]+)/)?.[1]; if(!path)return;
    found.set(path,{name:title,year:yr?Number(yr):null,url:`https://letterboxd.com/film/${path}/`,poster:null,runtime:null,genres:[],countries:[],tmdbId:null});
  });
  return [...found.values()];
}
async function scrape(username){
  const all=new Map();let previousSize=-1;
  for(let page=1;page<=50;page++){
    const url=`https://letterboxd.com/${encodeURIComponent(username)}/watchlist/${page===1?'':`page/${page}/`}`;
    const resp=await fetch(url,{headers:{'User-Agent':UA,'Accept':'text/html'},signal:AbortSignal.timeout(12000)});
    if(resp.status===404) {if(page===1)throw Error('Usuario inexistente o watchlist inaccesible.');break;}
    if(!resp.ok)throw Error(`Letterboxd bloqueó la consulta (${resp.status}). Podés usar la importación CSV.`);
    const html=await resp.text(); const movies=extract(html);
    if(page===1&&!movies.length)throw Error('No se pudieron leer películas de la página pública. La estructura de Letterboxd puede haber cambiado. Usá la importación CSV.');
    if(!movies.length)break;
    previousSize=all.size;
    for(const m of movies)all.set(m.url,m);
    if(all.size===previousSize)break;
    await sleep(110);
  }
  return [...all.values()];
}
async function enrich(movie,token,store){
  if(!token)return movie;
  const key=`film-${encodeURIComponent((movie.name+'-'+(movie.year||'')).toLowerCase())}`;
  try {
    const cached=await store.get(key,{type:'json'});
    if(cached && cached.checkedAt && Date.now()-cached.checkedAt<90*DAY)return {...movie,...cached.fields};
    const headers={Authorization:`Bearer ${token}`,Accept:'application/json'};
    const params=new URLSearchParams({query:movie.name,include_adult:'false'});
    if(movie.year)params.set('year',String(movie.year));
    const sr=await fetch(`https://api.themoviedb.org/3/search/movie?${params}`,{headers,signal:AbortSignal.timeout(10000)});
    if(sr.status===401||sr.status===403)throw Error('Token de TMDB inválido o sin autorización.');
    if(!sr.ok)return movie;
    const results=(await sr.json()).results||[];
    const same=results.find(x=>x.title?.toLowerCase()===movie.name.toLowerCase() && (!movie.year||Math.abs(Number(x.release_date?.slice(0,4))-movie.year)<=1));
    const match=same||results.find(x=>(!movie.year||Number(x.release_date?.slice(0,4))===movie.year) && x.title?.toLowerCase()===movie.name.toLowerCase());
    if(!match)return movie;
    const dr=await fetch(`https://api.themoviedb.org/3/movie/${match.id}`,{headers,signal:AbortSignal.timeout(10000)});
    if(!dr.ok)return movie;
    const detail=await dr.json();
    const fields={runtime:Number(detail.runtime)||null, poster:detail.poster_path?`https://image.tmdb.org/t/p/w500${detail.poster_path}`:null, genres:(detail.genres||[]).map(x=>x.name),countries:(detail.production_countries||[]).map(x=>x.iso_3166_1),tmdbId:match.id};
    await store.setJSON(key,{checkedAt:Date.now(),fields});
    return {...movie,...fields};
  }catch(e){if(String(e.message).includes('Token de TMDB'))throw e;return movie;}
}
export default async (request)=>{
  const u=new URL(request.url), username=(u.searchParams.get('username')||'').trim().toLowerCase();
  if(!/^[a-z0-9_-]{1,30}$/.test(username))return j({error:'Ingresá un usuario de Letterboxd válido.'},400);
  const store=getStore({name:'letterboxd-watchlists',consistency:'strong'}), key=`wl-${username}`;
  try{
    const saved=await store.get(key,{type:'json'});
    const fresh=saved?.updatedAt && Date.now()-saved.updatedAt<DAY;
    if(fresh){
      const token=process.env.TMDB_READ_ACCESS_TOKEN;
      const pending=saved.movies.filter(m=>!m.tmdbId);
      if(!token||!pending.length)return j({...saved,source:'cache'});
      const batch=pending.slice(0,12);
      const enriched=await Promise.all(batch.map(m=>enrich(m,token,store)));
      const replacements=new Map(enriched.map(m=>[m.url,m]));
      const movies=saved.movies.map(m=>replacements.get(m.url)||m);
      const out={...saved,movies,enrichmentPending:movies.filter(m=>!m.tmdbId).length};
      await store.setJSON(key,out);return j({...out,source:'cache'});
    }
    let list;
    try{list=await scrape(username);}catch(e){if(saved?.movies?.length)return j({...saved,stale:true,warning:e.message});throw e;}
    if(!list.length)throw Error('La watchlist está vacía o no es pública.');
    const previous=new Map((saved?.movies||[]).map(m=>[m.url,m]));
    list=list.map(m=>({...m,...(previous.get(m.url)||{}),name:m.name,url:m.url}));
    const token=process.env.TMDB_READ_ACCESS_TOKEN;
    // Enrich only a bounded subset per HTTP request to stay under Netlify function limits.
    const pending=list.filter(m=>!m.tmdbId);
    const batch=pending.slice(0,12);
    const enriched=await Promise.all(batch.map(m=>enrich(m,token,store)));
    const mapped=new Map(enriched.map(m=>[m.url,m]));list=list.map(m=>mapped.get(m.url)||m);
    const out={username,updatedAt:Date.now(),movies:list, enrichmentPending:list.filter(m=>!m.tmdbId).length, warning:!token?'Configurá TMDB_READ_ACCESS_TOKEN en Netlify para obtener pósters, duraciones y filtros.':undefined};
    await store.setJSON(key,out);return j(out);
  }catch(e){console.error('watchlist function:',e);return j({error:String(e.message||e)},502);}
};
