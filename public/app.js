const $=id=>document.getElementById(id);
let movies=[], lastUrl='', seen=new Set(), requestSerial=0;
const regionNames = new Intl.DisplayNames(['es'],{type:'region'});
const controls=['genre','country','decade','runtime','rating'];
const setStatus=(s,error=false)=>{ $('status').textContent=s;$('status').className='hint'+(error?' error':'');};
function fillOptions(id,items,display){const s=$(id),old=s.value;s.replaceChildren(new Option(s.options[0]?.textContent||'Todos',''));for(const item of items)s.add(new Option(display(item),String(item)));s.value=old;}
function initialize(data){
 movies=(data.movies||[]).map(x=>({...x,year:Number(x.year)||null,runtime:Number(x.runtime)||null,genres:Array.isArray(x.genres)?x.genres:[],countries:Array.isArray(x.countries)?x.countries:[],tmdbRating:x.tmdbRating==null?null:Number(x.tmdbRating),tmdbRatingChecked:!!x.tmdbRatingChecked}));
 $('workspace').hidden=false;$('profile').textContent='@'+data.username;
 const fresh=data.updatedAt?new Date(data.updatedAt).toLocaleString('es-AR'):'Importación local';
 $('meta').textContent=`${movies.length} películas · Actualizado: ${fresh}${data.enrichmentPending?' · '+(movies.length-data.enrichmentPending)+'/'+movies.length+' procesadas por TMDB':''}`;
 fillOptions('genre',[...new Set(movies.flatMap(x=>x.genres))].sort(),x=>x);
 fillOptions('country',[...new Set(movies.flatMap(x=>x.countries))].sort(),x=>{try{return regionNames.of(x)}catch{return x}});
 fillOptions('decade',[...new Set(movies.map(x=>x.year&&Math.floor(x.year/10)*10).filter(Boolean))].sort((a,b)=>b-a),x=>`${x}s`);
 updateCount();
}
function filtered(){return movies.filter(m=>(!$('genre').value||m.genres.includes($('genre').value))&&(!$('country').value||m.countries.includes($('country').value))&&(!$('decade').value||Math.floor(m.year/10)*10===Number($('decade').value))&&(!$('runtime').value||(m.runtime!==null && m.runtime<=Number($('runtime').value)))&&(!$('rating').value||(m.tmdbRating!==null&&m.tmdbRating>=Number($('rating').value))));}
function updateCount(){const matches=filtered();const decade=$('decade').value;const relevant=movies.filter(m=>!decade || Math.floor(m.year/10)*10===Number(decade));const pending=relevant.filter(m=>!m.metadataChecked && !m.tmdbId).length;const ratingPending=relevant.filter(m=>!m.tmdbRatingChecked).length;const ratingUnavailable=relevant.filter(m=>m.tmdbRatingChecked && m.tmdbRating===null).length; $('count').textContent=`${matches.length} de ${movies.length} películas coinciden` + (matches.length===0 && $('runtime').value && movies.some(m=>m.runtime===null) ? ' · Todavía hay películas sin duración: completá primero la carga de TMDB.' : '') + (pending ? ` · ${pending} películas de esta selección pendientes de verificar con TMDB` : '') + ($('rating').value ? ` · ${ratingPending} calificaciones pendientes · ${ratingUnavailable} sin puntuación verificable` : '');$('draw').disabled=!matches.length;}
function draw(){const pool=filtered();if(!pool.length)return;let unshown=pool.filter(x=>!seen.has(x.url||x.name));if(!unshown.length){seen.clear();unshown=pool;}const m=unshown[Math.floor(Math.random()*unshown.length)];seen.add(m.url||m.name);
 const result=$('result');result.replaceChildren();const wrapper=document.createElement('div');wrapper.className='movie';const poster=document.createElement('div');poster.className='poster';
 if(m.poster?.startsWith('https://image.tmdb.org/')){const img=document.createElement('img');img.src=m.poster;img.alt=`Póster de ${m.name}`;img.loading='lazy';img.onerror=()=>{poster.textContent='🎞';};poster.append(img)}else poster.textContent='🎞';wrapper.append(poster);
 const copy=document.createElement('div');copy.className='movie-copy';const tag=document.createElement('div');tag.className='tag';tag.textContent='YOUR NEXT MOVIE';copy.append(tag);const h=document.createElement('h2');h.textContent=m.name;copy.append(h);const details=document.createElement('p');details.textContent=[m.year,m.runtime?`${m.runtime} min`:null,m.tmdbRating!=null?`★ ${m.tmdbRating.toFixed(2)} / 5 (TMDB)`:null,...m.genres.slice(0,2)].filter(Boolean).join(' · ');copy.append(details);
 if(m.countries.length){const p=document.createElement('p');p.textContent=m.countries.map(x=>{try{return regionNames.of(x)}catch{return x}}).join(', ');copy.append(p)}
 if(m.url?.startsWith('https://letterboxd.com/')){const link=document.createElement('a');link.href=m.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Ver en Letterboxd ↗';link.addEventListener('click',()=>window.randomizerTrack?.('letterboxd_opened',{profile_queried:$('profile').textContent.replace(/^@/,''),movie_title:m.name,movie_year:m.year||0}));copy.append(link)}wrapper.append(copy);result.append(wrapper);
 window.randomizerTrack?.('movie_randomized',{profile_queried:$('profile').textContent.replace(/^@/,''),movie_title:m.name,movie_year:m.year||0,matches:pool.length});
}
function apiUrl(username){const params=new URLSearchParams({username});const decade=$('decade').value;if(decade)params.set('decade',decade);return `/api/watchlist?${params}`;}
async function loadUser(username){
 username=username.trim().toLowerCase();
 if(!/^[a-z0-9_-]{1,30}$/.test(username)){setStatus('Nombre de usuario inválido.',true);return;}
 const serial=++requestSerial;
 setStatus('Cargando tu watchlist y sus metadatos…');
 $('username-form').querySelector('button').disabled=true;
 try{
   let response=await fetch(apiUrl(username));
   let data=await response.json();
   if(!response.ok)throw Error(data.error||'Error de conexión');
   history.replaceState({},'',`/u/${username}`);lastUrl=location.href;
   initialize(data);
   window.randomizerTrack?.('watchlist_loaded',{profile_queried:username,matches:data.movies.length,source:'public_watchlist'});
   let pending=Number(data.enrichmentPending)||0;
   setStatus(data.warning||`${data.movies.length} películas cargadas. ${pending?`Enriqueciendo TMDB: ${data.enrichedCount||0} con ficha.`:''}`);
   // Continue fetching batches. On each iteration Netlify stores the enriched records.
   let attempts=0;
   while(pending>0 && attempts<160 && serial===requestSerial && !data.warning){
     attempts++;
     response=await fetch(apiUrl(username));
     data=await response.json();
     if(!response.ok)throw Error(data.error||'Error al consultar TMDB');
     if(serial!==requestSerial)return;
     initialize(data);
     pending=Number(data.enrichmentPending)||0;
     setStatus(`TMDB: ${data.enrichedCount||0} de ${data.movies.length} películas identificadas · ${data.enrichmentPending||0} fichas TMDB pendientes.`);
   }
   if(serial===requestSerial && !pending)setStatus(`${data.movies.length} películas cargadas · ${data.enrichedCount||0} identificadas en TMDB · ${data.ratingVerifiedCount||0} con puntuación TMDB.`);
 }catch(e){if(serial===requestSerial)setStatus(e.message+' Podés importar tu CSV oficial como alternativa.',true);}
 finally{if(serial===requestSerial)$('username-form').querySelector('button').disabled=false;}
}
$('username-form').addEventListener('submit',e=>{e.preventDefault();loadUser($('username').value)});
for(const id of controls)$(id).addEventListener('change',()=>{updateCount();window.randomizerTrack?.('filters_applied',{profile_queried:$('profile').textContent.replace(/^@/,''),genre:$('genre').value,country:$('country').value,decade:$('decade').value,max_minutes:Number($('runtime').value)||0,min_tmdb_rating:Number($('rating').value)||0,matches:filtered().length});});
$('reset').addEventListener('click',()=>{for(const id of controls)$(id).value='';updateCount()});$('draw').addEventListener('click',draw);
$('copy-link').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(lastUrl||location.href);$('copy-link').textContent='¡Copiado!';setTimeout(()=>$('copy-link').textContent='Copiar enlace ↗',2000)}catch{alert(location.href)}});
$('import').addEventListener('click',()=>$('file').click());$('import-toggle').addEventListener('click',()=>$('file').click());
// CSV parser supporting quoted fields and embedded commas/newlines.
function parseCSV(text){const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){let c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){row.push(cell);cell=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell=''}else cell+=c;}row.push(cell);if(row.some(v=>v.trim()))rows.push(row);return rows;}
$('file').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;requestSerial++;const rows=parseCSV((await file.text()).replace(/^\uFEFF/,''));const headers=(rows.shift()||[]).map(s=>s.toLowerCase().trim());const name=headers.indexOf('name'),year=headers.indexOf('year'),uri=headers.indexOf('letterboxd uri');if(name===-1){setStatus('El CSV debe incluir una columna Name.',true);return;}const result=rows.map(r=>({name:r[name]||'',year:year<0?null:parseInt(r[year],10)||null,url:uri<0?null:r[uri],poster:null,runtime:null,genres:[],countries:[],tmdbRating:null,tmdbRatingChecked:false})).filter(x=>x.name);initialize({username:'importación local',movies:result});window.randomizerTrack?.('watchlist_loaded',{source:'csv_import',matches:result.length});setStatus('CSV importado en el navegador. Para pósters y filtros avanzados necesitás la sincronización con TMDB.');e.target.value='';});
const match=location.pathname.match(/^\/u\/([\w-]+)\/?$/);if(match){$('username').value=match[1];loadUser(match[1]);}
