# Letterboxd Randomizer — v2.1

Correcciones de filtros, imágenes y enriquecimiento con TMDB.

## Publicación

1. Subí el contenido de este proyecto a tu repositorio (reemplazá archivos existentes).
2. Netlify: carpeta de publicación `public`. El `netlify.toml` incluido configura las Functions y rutas.
3. En Netlify > Project configuration > Environment variables, agregá `TMDB_READ_ACCESS_TOKEN` (TMDB API Read Access Token, no API key) en el scope Functions.
4. Hacé un deploy nuevo. Probá `/u/franimpo`.

## Qué cambia

- Se elimina el filtro de año; se conserva década.
- Las películas se enriquecen con TMDB en **lotes de ocho**; el cliente solicita lotes sucesivos mientras haya pendientes.
- Cada lote se almacena en Netlify Blobs para que visitas posteriores reutilicen resultados.
- En la interfaz aparece un contador de identificadas y pendientes.
- Búsquedas TMDB con título limpio, coincidencia con título original y margen de un año; no se asignan datos dudosos.
- Un error de autenticación TMDB detiene las consultas y muestra un mensaje explícito.
- Si no existe duración en TMDB, esa película no se incluye en un filtro de duración máxima; el contador indica el motivo.

## Limitaciones

- La importación local CSV sigue sin obtener metadatos de TMDB porque se procesa solo en el navegador.
- Las watchlists grandes pueden requerir varias solicitudes para enriquecer la totalidad; mantené la pestaña abierta durante la primera carga.
- Si Letterboxd bloquea la extracción a Netlify, la corrección de TMDB no resuelve dicho bloqueo.
- Los créditos y las condiciones de uso de las APIs de TMDB y Letterboxd deben respetarse si la app se distribuye públicamente.
- Pruebas realizadas: verificación de sintaxis de JavaScript; aún falta probar la ejecución real en Netlify con el token.
