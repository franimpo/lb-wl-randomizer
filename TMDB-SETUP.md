# TMDB — configuración de duraciones

1. Creá una cuenta en https://www.themoviedb.org/ y solicitá acceso a su API desde los ajustes de API.
2. Copiá el **API Read Access Token** (no la contraseña de tu cuenta).
3. En GitHub: Settings → Secrets and variables → Actions → New repository secret.
4. Nombre exacto: `TMDB_READ_ACCESS_TOKEN`; valor: tu token. Guardalo. **Nunca lo pongas en archivos del repo.**
5. Subí al repositorio los archivos nuevos de este ZIP **conservando la estructura de carpetas** y reemplazá `.github/workflows/sync.yml`.
6. En GitHub: Actions → Daily Letterboxd sync → Run workflow.
7. Comprobá `data/watchlist.csv`: ahora incorpora `runtime` (minutos) y `tmdb_id`. El navegador filtra directamente con `runtime`.

El caché en `data/tmdb_cache.json` impide consultas repetidas de películas ya identificadas. Películas sin coincidencia inequívoca quedan sin duración para evitar datos inventados; no aparecerán en filtros con máximo de minutos, pero sí en «Todas».

**Importante:** el trabajo inicial puede tardar más porque consulta las películas por primera vez. La sincronización diaria es a las 05:00 hora argentina (08:00 UTC), sujeto a posibles retrasos de GitHub Actions.
