# What to Watch? v2 — Letterboxd Multiusuario

Sitio público para sortear películas de watchlists públicas de Letterboxd, con filtros por duración, año, década, género y país de producción. URL compartible `/u/usuario`.

## Publicar en Netlify

1. Subí todo este proyecto a un **repositorio nuevo** en GitHub, o preservá tu proyecto anterior en una rama/copia si preferís reemplazarlo.
2. En Netlify, importá el repositorio. Build command: `echo Static frontend ready` (configurado en `netlify.toml`). Publish directory: `public`.
3. Configurá una variable de entorno **TMDB_READ_ACCESS_TOKEN** en Netlify → Project configuration → Environment variables, disponible para Functions. Es el **API Read Access Token** (Bearer) de TMDB, no la API Key corta. Redeploy después de guardarla.
4. Probá `/u/franimpo`. En la primera visita se consulta Letterboxd y se guarda un caché compartido con Netlify Blobs por 24 horas.

## Limitaciones de esta versión de prueba

- La extracción depende del HTML público de Letterboxd; el scraper no está validado contra una descarga real desde este entorno. Si Letterboxd cambia su HTML o bloquea tráfico desde Netlify, la app explica el fallo y permite importar `watchlist.csv` en el navegador (sin enviarlo al servidor).
- Las watchlists privadas no están soportadas.
- La sincronización es **lazy**: al visitar la URL tras 24 horas se vuelve a consultar. No es una actualización activa en segundo plano para todos los usuarios.
- La primera carga de una lista muy grande puede llegar al tiempo máximo de una Function, dependiendo de Letterboxd. Por eso esto es una beta, no una infraestructura a escala para miles de usuarios.
- Por límites de tiempo de las Functions, TMDB enriquece hasta **12 películas por visita**; visitas posteriores recuperan otras 12. Los filtros avanzados solamente incluirán las películas que ya tienen esos metadatos. No se inventan imágenes ni duraciones.
- Para escalar y procesar listas grandes de forma fiable: cola de trabajos + worker programado + base de datos. No implementados en este ZIP.
- Importación CSV local incluye año y nombre, pero sin datos TMDB; permite sortear por año/década.
- No se crea ningún workflow de GitHub Actions porque esta versión ya no está limitada a `franimpo`.

## Probar localmente

```bash
npm install
npm run dev
```

Netlify CLI inicia la web y las Functions. Abrí la URL local que indique.

## Datos y privacidad

Solo se consulta información pública de Letterboxd y se guardan copias en la caché del sitio. No se requiere ni almacena contraseña de Letterboxd. Nunca exponer `TMDB_READ_ACCESS_TOKEN` en el frontend. Para un lanzamiento público revisá los términos, la posibilidad de bloqueo y los límites aplicables.
