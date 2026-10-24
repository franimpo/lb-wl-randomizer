# ¿Qué veo hoy? — franimpo

Webapp estática para sortear películas de la watchlist de Letterboxd, con CSV/JSON sincronizados diariamente desde GitHub Actions.

## Publicación

1. Crear un repositorio **público** en GitHub y subir el contenido de esta carpeta conservando `.github/workflows/sync.yml`.
2. En GitHub ir a **Actions → Daily Letterboxd sync → Run workflow**. Si falla la extracción, revisar el log: el HTML de Letterboxd puede cambiar o bloquear las consultas. No se borran los datos existentes si la extracción falla.
3. Cuando aparezcan `data/watchlist.csv` y `data/watchlist.json`, conectar el repositorio a Netlify con `Build command` vacío y `Publish directory` = `.`. Netlify desplegará la webapp al detectar actualizaciones del repositorio.
4. La acción se ejecuta a las **08:00 UTC = 05:00 Argentina**, diariamente, aunque GitHub puede retrasar ejecuciones programadas.
5. Para sincronizar manualmente: **Actions → Daily Letterboxd sync → Run workflow**.

## Limitación importante: filtro por duración

La página pública de Letterboxd no expone necesariamente la duración en el listado de pósters, por lo que inicialmente las películas llevan `runtime: null`. El filtro por duración no devuelve películas hasta enriquecer el dataset con duración real. No se inventan duraciones. En una siguiente iteración se puede integrar TMDB (necesita API key) y almacenar los minutos en CSV/JSON.

## Exportación inicial opcional

Si falla el scraping, Letterboxd permite exportar un ZIP de datos desde Settings → Data → Export. Dentro hay un `watchlist.csv`. Esto sirve como respaldo inicial pero no sustituye la sincronización automatizada.

## Notas

- No requiere credenciales de Letterboxd.
- La watchlist debe ser pública.
- Revisa los términos de Letterboxd y evita aumentar la frecuencia de consultas o eludir controles de acceso.
- Archivo de trabajo, no validado contra el HTML en vivo de Letterboxd desde este entorno.
