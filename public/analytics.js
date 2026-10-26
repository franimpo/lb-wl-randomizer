// PostHog sin interfaz de consentimiento: sólo eventos explícitos.
const allowedEvents = new Set(['watchlist_loaded','filters_applied','movie_randomized','letterboxd_opened']);
const allowedProperties = new Set(['profile_queried','genre','country','decade','max_minutes','movie_title','movie_year','matches','source']);
let analyticsReady = false;
const queuedEvents = [];
window.randomizerTrack = (event, properties={}) => {
  if (!allowedEvents.has(event)) return;
  const clean = Object.fromEntries(Object.entries(properties).filter(([key,value]) =>
    allowedProperties.has(key) && ['string','number','boolean'].includes(typeof value)));
  if (analyticsReady) window.posthog?.capture(event,clean);
  else if (queuedEvents.length<100) queuedEvents.push([event,clean]);
};
function initializePostHog(token,host){
  // Adaptación de la carga oficial del SDK de PostHog.
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split('.');2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement('script')).type='text/javascript',p.crossOrigin='anonymous',p.async=!0,p.src=s.api_host.replace('.i.posthog.com','-assets.i.posthog.com')+'/static/array.js',(r=t.getElementsByTagName('script')[0]).parentNode.insertBefore(p,r);var u=e;void 0!==a?u=e[a]=[]:a='posthog',u.people=u.people||[],Object.defineProperty(u,'toString',{configurable:!0,enumerable:!0,writable:!0,value:function(t){var e='posthog';return'posthog'!==a&&(e+='.'+a),t||(e+=' (stub)'),e}}),u.people.toString=function(){return u.toString(1)+'.people (stub)'},o='capture identify alias people.set people.set_once people.unset reset opt_in_capturing opt_out_capturing'.split(' ');for(n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])})}(document,window.posthog||[]);
  window.posthog.init(token,{
    api_host:host,
    autocapture:false,
    capture_pageview:false,
    capture_pageleave:false,
    disable_session_recording:true,
    person_profiles:'identified_only',
    persistence:'memory',
    loaded(ph){analyticsReady=true;for(const [name,properties] of queuedEvents.splice(0)) ph.capture(name,properties);}
  });
}
async function start(){
  try {
    const res=await fetch('/api/analytics-config',{cache:'no-store'});
    if (!res.ok)return;
    const settings=await res.json();
    if (!settings.enabled || !settings.token)return;
    initializePostHog(settings.token,settings.host);
  }catch(e){console.warn('Analítica no disponible. El selector sigue funcionando.',e)}
}
start();
