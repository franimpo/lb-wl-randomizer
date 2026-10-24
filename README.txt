Reemplazar en GitHub estos dos archivos respetando las rutas:
- scripts/enrich_tmdb.py
- .github/workflows/sync.yml

Confirmar el secreto TMDB_READ_ACCESS_TOKEN en Settings > Secrets and variables > Actions.
Ejecutar Actions > Daily Letterboxd sync > Run workflow.
Verificar data/watchlist.json: poster debe contener https://image.tmdb.org/t/p/w500/... y runtime debe ser un número para las películas identificadas.

No borres data/watchlist.csv ni data/watchlist.json.
Las películas sin coincidencia confiable permanecerán sin póster o duración.
