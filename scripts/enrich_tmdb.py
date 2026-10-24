"""Enrich Letterboxd snapshots with verified TMDB runtimes and posters.

Requires TMDB_READ_ACCESS_TOKEN in the environment. Reuses previously verified
matches from data/tmdb_cache.json, querying only unseen / unresolved entries.
"""
import csv
import json
import os
import re
import time
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

import requests

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
TOKEN = os.environ.get('TMDB_READ_ACCESS_TOKEN', '').strip()
API = 'https://api.themoviedb.org/3'
HEADERS = {'Authorization': f'Bearer {TOKEN}', 'Accept': 'application/json'}
SESSION = requests.Session()
SESSION.headers.update(HEADERS)


def normalized(value):
    value = unicodedata.normalize('NFKD', str(value or ''))
    value = ''.join(c for c in value if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]+', ' ', value.casefold()).strip()


def request(path, params=None):
    for attempt in range(5):
        response = SESSION.get(API + path, params=params, timeout=30)
        if response.status_code in (429, 500, 502, 503, 504):
            time.sleep(min(2 ** attempt, 20))
            continue
        response.raise_for_status()
        return response.json()
    raise RuntimeError('TMDB rate limit/server error after 5 attempts')


def fetch_match(movie):
    name = (movie.get('name') or '').strip()
    year = str(movie.get('year') or '').strip()
    if not name:
        return None
    results = request('/search/movie', {'query': name, 'year': year} if year.isdigit() else {'query': name}).get('results', [])
    n = normalized(name)
    exact = []
    for result in results:
        names = {normalized(result.get('title')), normalized(result.get('original_title'))}
        if n not in names:
            continue
        release_year = str(result.get('release_date') or '')[:4]
        if year.isdigit() and release_year and abs(int(release_year) - int(year)) > 1:
            continue
        exact.append(result)
    # Avoid false positive matches: no duration for ambiguous or unmatched titles.
    if len(exact) != 1:
        return None
    selected = exact[0]
    details = request('/movie/' + str(selected['id']))
    runtime = details.get('runtime')
    if not isinstance(runtime, int) or runtime <= 0:
        return None
    poster = details.get('poster_path')
    return {'tmdb_id': details['id'], 'runtime': runtime,
            'tmdb_poster': ('https://image.tmdb.org/t/p/w500' + poster) if poster else '',
            'verified_at': datetime.now(timezone.utc).isoformat()}


def main():
    if not TOKEN:
        raise SystemExit('TMDB_READ_ACCESS_TOKEN is missing. Add it to GitHub Actions secrets.')
    dataset_file = DATA / 'watchlist.json'
    if not dataset_file.exists():
        raise SystemExit('Run scripts/sync.py first to create data/watchlist.json')
    dataset = json.loads(dataset_file.read_text(encoding='utf-8'))
    movies = dataset.get('movies') or []
    cache_file = DATA / 'tmdb_cache.json'
    cache = json.loads(cache_file.read_text(encoding='utf-8')) if cache_file.exists() else {}
    matched = 0
    missing = 0
    for i, movie in enumerate(movies, 1):
        key = movie.get('url') or normalized(movie.get('name')) + ':' + str(movie.get('year'))
        entry = cache.get(key)
        if entry is None:
            try:
                entry = fetch_match(movie)
            except requests.RequestException as e:
                # A temporary API error must not wipe known runtimes or stop the whole sync.
                print(f'API error for {movie.get("name")}: {e}', flush=True)
                entry = None
            if entry:
                cache[key] = entry
            time.sleep(0.12)
        if entry:
            movie['runtime'] = entry['runtime']
            movie['tmdb_id'] = entry['tmdb_id']
            movie['poster'] = entry.get('tmdb_poster') or movie.get('poster') or ''
            matched += 1
        else:
            movie['runtime'] = None
            missing += 1
        if i % 100 == 0:
            print(f'Processed {i}/{len(movies)}', flush=True)
    dataset['movies'] = movies
    dataset['runtime_matches'] = matched
    dataset['runtime_missing'] = missing
    tmp = dataset_file.with_suffix('.json.tmp')
    tmp.write_text(json.dumps(dataset, ensure_ascii=False, indent=2), encoding='utf-8')
    tmp.replace(dataset_file)
    csv_file = DATA / 'watchlist.csv'
    fields = ['name','year','url','poster','runtime','tmdb_id']
    tmp_csv = csv_file.with_suffix('.csv.tmp')
    with tmp_csv.open('w', newline='', encoding='utf-8') as fp:
        writer = csv.DictWriter(fp, fieldnames=fields, extrasaction='ignore')
        writer.writeheader()
        writer.writerows(movies)
    tmp_csv.replace(csv_file)
    cache_file.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'TMDB enriched {matched}/{len(movies)}; unresolved {missing}', flush=True)

if __name__ == '__main__':
    main()
