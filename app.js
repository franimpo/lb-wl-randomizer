const $ = sel => document.querySelector(sel);
let movies = [], picked = new Set();
const pickButton = $('#pick');
const runtimeSelect = $('#max-runtime');
async function load(){
  try {
    const r=await fetch('data/watchlist.json?ts='+Date.now(),{cache:'no-store'});
    if(!r.ok) throw new Error('No se encontró la lista');
    const data=await r.json();
    movies=data.movies||[];
    const updated=data.updated_at?new Date(data.updated_at).toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires'}):'Sin fecha';
    $('#status').textContent=`${movies.length} películas · Última sincronización: ${updated}`;
    if(!movies.length) throw new Error('Lista vacía');
    pickButton.disabled=false;
  } catch(err){$('#status').textContent='Todavía no hay datos sincronizados. Ejecutá la acción de GitHub o cargá una exportación inicial.';pickButton.disabled=true;}
}
function choose(){
  const limit=Number(runtimeSelect.value), avoid=$('#no-repeat').checked;
  // No inventamos duraciones: para filtrar, la duración debe estar disponible.
  const eligible=movies.filter(m=>(!limit||(m.runtime!=null&&Number(m.runtime)<=limit))&&(!avoid||!picked.has(m.url)));
  if(!eligible.length){
    if(limit && movies.every(m=>m.runtime==null)){
      $('#movie-title').textContent='Faltan duraciones';
      $('#movie-meta').textContent='Para filtrar por minutos necesitamos enriquecer el CSV con duraciones verificadas (TMDB).';
    }else{$('#movie-title').textContent='Sin resultados';$('#movie-meta').textContent='Probá otro filtro o desactivá «Evitar repeticiones».';}
    $('#poster').hidden=true;$('#placeholder').hidden=false;$('#letterboxd-link').hidden=true;
    return;
  }
  const film=eligible[Math.floor(Math.random()*eligible.length)];picked.add(film.url);
  $('#movie-title').textContent=film.name;
  $('#movie-meta').textContent=[film.year,film.runtime?`${film.runtime} min`:null].filter(Boolean).join(' · ')||'Película de tu watchlist';
  const link=$('#letterboxd-link');link.href=film.url;link.hidden=false;
  let poster=film.poster||'';
  // Some scraped images are placeholders or lazy-load thumbnails.
  if(poster && !poster.startsWith('http')) poster=new URL(poster,'https://letterboxd.com').href;
  const img=$('#poster');img.onload=()=>{$('#placeholder').hidden=true;img.hidden=false};img.onerror=()=>{img.hidden=true;$('#placeholder').hidden=false};
  img.hidden=true;$('#placeholder').hidden=false;
  if(poster) img.src=poster;else img.removeAttribute('src');
}
pickButton.addEventListener('click',choose);
load();
