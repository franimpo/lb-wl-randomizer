# Letterboxd Randomizer v2.3 — Analítica sin aviso visible

Esta variante conserva íntegramente el `index.html` y `style.css` subidos por el usuario, con la única adición de la referencia a `/analytics.js` en HTML. No incluye banner ni estilos nuevos.

Configurar en Netlify `POSTHOG_PROJECT_TOKEN` y `POSTHOG_REGION` (`us` o `eu`). Mantener `TMDB_READ_ACCESS_TOKEN`.

Se miden cuatro eventos: `watchlist_loaded`, `filters_applied`, `movie_randomized`, `letterboxd_opened`. PostHog no tiene grabación, autocaptura ni páginas vistas activas; usa persistencia `memory`, por lo que no reconoce visitantes entre sesiones. El username consultado puede corresponder a una persona y **no debe considerarse un dato anónimo**.

El HTML del usuario contiene Google Analytics; se mantuvo sin cambios. Evaluar requisitos de información/consentimiento para la audiencia y la jurisdicción antes de activar analítica sin aviso.

Publicar el contenido en la raíz del repositorio, manteniendo la carpeta `public/` y `netlify/functions/`.
