"""Enrich Letterboxd public watchlist with TMDB runtime and poster.
Requires TMDB_READ_ACCESS_TOKEN GitHub Actions secret.
"""
import csv
import json
import os
import re
import time
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
TOKEN = os.environ.get('TMDB_READ_ACCESS_TOKEN', '').strip()
API = 'https://api.themoviedb.org/3'
SESSION = requests.Session()
SESSION.headers.update({'Authorization': f'Bearer {TOKEN}', 'Accept': 'application/json'})

def clean_title(value):
    return re.sub(r'\s*\(\d{4}\)\s*$', '', str(value or '')).strip()

def normalized(value):
    value = unicodedata.normalize('NFKD', str(value or ''))
    value = ''.join(c for c in value if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]+', ' ', value.casefold()).strip()

def get(path, params=None):
    for attempt in range(5):
        try:
            response = SESSION.get(API + path, params=params, timeout=30)
        except requests.RequestException:
            if attempt == 4:
                raise
            time.sleep(2 ** attempt)
            continue
        if response.status_code in (401, 403):
            raise RuntimeError('TMDB authentication failed (401/403). Verify TMDB_READ_ACCESS_TOKEN is the API Read Access Token and is passed to the Action.')
        if response.status_code in (429, 500, 502, 503, 504):
            if attempt == 4:
                response.raise_for_status()
            time.sleep(min(2 ** attempt, 20))
            continue
        response.raise_for_status()
        return response.json()
    raise RuntimeError('TMDB request failed after retries')

def fetch_match(movie):
    title = clean_title(movie.get('name'))
    year = str(movie.get('year') or '').strip()
    if not title:
        return None
    params = {'query': title}
    if re.fullmatch(r'\d{4}', year):
        params['year'] = year
    results = get('/search/movie', params).get('results', [])
    n = normalized(title)
    exact = []
    for candidate in results:
        if n not in (normalized(candidate.get('title')), normalized(candidate.get('original_title'))):
            continue
        released = str(candidate.get('release_date') or '')[:4]
        if year.isdigit() and released.isdigit() and abs(int(released) - int(year)) > 1:
            continue
        exact.append(candidate)
    if len(exact) != 1:
        return None  # Never assign dubious matches
    details = get('/movie/' + str(exact[0]['id']))
    runtime = details.get('runtime')
    poster_path = details.get('poster_path')
    poster = ('https://image.tmdb.org/t/p/w500' + poster_path) if poster_path else ''
    return {
        'tmdb_id': details['id'],
        'runtime': runtime if isinstance(runtime, int) and runtime > 0 else None,
        'tmdb_poster': poster,
        'verified_at': datetime.now(timezone.utc).isoformat(),
    }

def main():
    if not TOKEN:
        raise RuntimeError('Missing TMDB_READ_ACCESS_TOKEN GitHub Actions secret')
    # Validate credentials even if every film is already cached.
    get('/configuration')
    source = DATA / 'watchlist.json'
    dataset = json.loads(source.read_text(encoding='utf-8'))
    movies = dataset.get('movies', [])
    if not movies:
        raise RuntimeError('Empty watchlist')
    cache_path = DATA / 'tmdb_cache.json'
    cache = json.loads(cache_path.read_text(encoding='utf-8')) if cache_path.exists() else {}
    matched = posters = runtimes = 0
    for i, movie in enumerate(movies, 1):
        key = movie.get('url') or normalized(movie.get('name')) + ':' + str(movie.get('year'))
        entry = cache.get(key)
        # Refresh cache entries lacking both poster and runtime; otherwise reuse.
        if not entry or (not entry.get('tmdb_poster') and not entry.get('runtime')):
            try:
                entry = fetch_match(movie)
            except requests.RequestException as exc:
                raise RuntimeError(f'TMDB network/API error while looking up {movie.get("name")}: {exc}') from exc
            if entry:
                cache[key] = entry
            time.sleep(0.12)
        poster = movie.get('poster') or ''
        if 'empty-poster' in poster:
            poster = ''
        if entry:
            matched += 1
            movie['tmdb_id'] = entry.get('tmdb_id')
            movie['runtime'] = entry.get('runtime')
            poster = entry.get('tmdb_poster') or poster
        else:
            movie['runtime'] = None
            movie.pop('tmdb_id', None)
        movie['poster'] = poster
        posters += bool(poster)
        runtimes += isinstance(movie['runtime'], int) and movie['runtime'] > 0
        if i % 100 == 0:
            print(f'Processed {i}/{len(movies)}', flush=True)
    if matched == 0:
        raise RuntimeError('No movies matched TMDB. Aborting without publishing empty enrichment.')
    dataset.update(movies=movies, runtime_matches=runtimes, poster_matches=posters)
    json_tmp = source.with_suffix('.json.tmp')
    json_tmp.write_text(json.dumps(dataset, ensure_ascii=False, indent=2), encoding='utf-8')
    json_tmp.replace(source)
    csv_path = DATA / 'watchlist.csv'
    csv_tmp = csv_path.with_suffix('.csv.tmp')
    with csv_tmp.open('w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['name', 'year', 'url', 'poster', 'runtime', 'tmdb_id'], extrasaction='ignore')
        writer.writeheader()
        writer.writerows(movies)
    csv_tmp.replace(csv_path)
    cache_tmp = cache_path.with_suffix('.json.tmp')
    cache_tmp.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding='utf-8')
    cache_tmp.replace(cache_path)
    print(f'TMDB verified matches: {matched}/{len(movies)}; posters: {posters}; runtimes: {runtimes}', flush=True)

if __name__ == '__main__':
    main()
