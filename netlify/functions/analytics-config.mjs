// The PostHog *project token* is public. Never expose a personal API key.
export default async () => {
  const token=(process.env.POSTHOG_PROJECT_TOKEN||'').trim();
  const region=(process.env.POSTHOG_REGION||'us').trim().toLowerCase();
  const host=region==='eu'?'https://eu.i.posthog.com':'https://us.i.posthog.com';
  return new Response(JSON.stringify({enabled: Boolean(token),token: token||null,host}), {headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
};
export const config={path:'/api/analytics-config'};
