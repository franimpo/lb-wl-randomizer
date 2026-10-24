import csv, json, os, re, sys, time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
USERNAME = os.environ.get('LETTERBOXD_USERNAME', 'franimpo')
BASE = f'https://letterboxd.com/{USERNAME}/watchlist/'
S = requests.Session()
S.headers.update({'User-Agent':'Mozilla/5.0 (compatible; PersonalWatchlistSync/1.0)', 'Accept-Language':'en-US,en;q=0.9'})

def get_page(url):
    r = S.get(url, timeout=30)
    r.raise_for_status()
    return BeautifulSoup(r.text, 'html.parser')

def parse_page(soup):
    records=[]
    for el in soup.select('li.poster-container, li.griditem, div.react-component[data-item-name], li[data-film-id]'):
        holder = el.select_one('[data-film-slug], [data-target-link], [data-item-name], [data-film-name]') or el
        slug = holder.get('data-film-slug') or ''
        link = holder.get('data-target-link') or ''
        if not link and slug: link = f'/film/{slug}/'
        if not link:
            a = el.select_one('a[href*="/film/"]')
            if a: link = a.get('href','')
        if not link or '/film/' not in link: continue
        url = urljoin('https://letterboxd.com', link)
        img = el.select_one('img')
        title = holder.get('data-film-name') or holder.get('data-item-name') or (img.get('alt') if img else '') or (el.get('data-item-name') or '')
        if not title:
            name_match = re.search(r'/film/([^/]+)/', url)
            title = name_match.group(1).replace('-', ' ').title() if name_match else ''
        yr = holder.get('data-film-release-year') or el.get('data-film-release-year') or ''
        if not yr:
            m = re.search(r'\((\d{4})\)',title)
            if m: yr=m.group(1)
        records.append({'name':title.strip(), 'year':str(yr), 'url':url.split('?')[0], 'poster':(img.get('src') or img.get('data-src') or '') if img else '', 'runtime':None})
    return records

def main():
    all_films={}
    page=1
    while page <= 100:
        url = BASE if page==1 else urljoin(BASE, f'page/{page}/')
        print('Fetching', url, flush=True)
        soup=get_page(url)
        current=parse_page(soup)
        if not current:
            if page==1: raise RuntimeError('No films extracted from first page; markup or access might have changed. Existing data is preserved.')
            break
        for movie in current: all_films[movie['url']] = movie
        if len(current) < 20: break
        page += 1
        time.sleep(1)
    records=list(all_films.values())
    if len(records)<20: raise RuntimeError(f'Only {len(records)} films extracted. Refusing to replace existing data.')
    DATA.mkdir(exist_ok=True)
    # CSV is the canonical daily snapshot. JSON feeds the browser.
    csvtmp=DATA/'watchlist.csv.tmp'
    with csvtmp.open('w',newline='',encoding='utf-8') as f:
        writer=csv.DictWriter(f, fieldnames=['name','year','url','poster','runtime'])
        writer.writeheader();writer.writerows(records)
    csvtmp.replace(DATA/'watchlist.csv')
    payload={'username':USERNAME, 'updated_at':datetime.now(timezone.utc).isoformat(), 'count':len(records), 'movies':records}
    jsontmp=DATA/'watchlist.json.tmp'
    jsontmp.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8')
    jsontmp.replace(DATA/'watchlist.json')
    print(f'Updated {len(records)} unique films')

if __name__=='__main__': main()
