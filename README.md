# Fix de puntuación TMDB (escala 5 estrellas)

Reemplazá solamente `public/app.js` y `netlify/functions/watchlist.mjs`.

La API de TMDB devuelve `vote_average` entre 0 y 10. Se divide por 2 y se compara sin redondear para el filtro. Los valores de 0 votos se consideran sin puntaje y se excluyen si hay mínimo seleccionado.

Esta versión elimina las consultas a páginas individuales de Letterboxd para ratings. Al volver a cargar una watchlist con datos anteriores, procesa gradualmente las películas con TMDB ID que todavía no tienen rating TMDB, a razón de 8 por solicitud. El frontend sigue solicitando lotes hasta completar las pendientes.

No se modifican HTML, CSS, ni PostHog. Las clasificaciones de TMDB no son calificaciones de Letterboxd. Para evitar confusión, cambiá el texto de la etiqueta del select en tu `index.html` de «Calificación mínima de Letterboxd» a «Calificación mínima (TMDB)».
