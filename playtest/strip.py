#!/usr/bin/env python3
"""A film strip of one run: python3 playtest/strip.py "query" [--n 6] [--every 1500] [--first 4000] [--size 960x600] [--name strip]
Opens index.html?<query>, then saves n frames `every` ms apart, tiled into playtest/screens/<name>.jpg, and prints the
game state at each frame."""
import sys, os, time, subprocess, socket, argparse, io
from playwright.sync_api import sync_playwright
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'playtest', 'screens')

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('query'); ap.add_argument('--n', type=int, default=6); ap.add_argument('--every', type=int, default=1500)
    ap.add_argument('--first', type=int, default=4000); ap.add_argument('--size', default='960x600'); ap.add_argument('--name', default='strip')
    ap.add_argument('--cols', type=int, default=3); ap.add_argument('--touch', action='store_true')
    a = ap.parse_args()
    w, h = map(int, a.size.split('x'))
    s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
    srv = subprocess.Popen([sys.executable, os.path.join(ROOT, 'playtest', 'serve.py'), str(port), ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.6); os.makedirs(OUT, exist_ok=True)
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(headless=True, args=['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'])
            ctx = b.new_context(viewport={'width': w, 'height': h}, has_touch=a.touch, is_mobile=a.touch)
            pg = ctx.new_page(); logs = []
            pg.on('console', lambda m: logs.append(f'[{m.type}] {m.text}') if m.type in ('error', 'warning') else None)
            pg.on('pageerror', lambda e: logs.append(f'[pageerror] {e}'))
            pg.goto(f'http://127.0.0.1:{port}/index.html?{a.query}')
            pg.wait_for_function('window.__mm && window.__mm.flow && window.__mm.flow.phase !== "boot"', timeout=60000)
            pg.wait_for_timeout(a.first)
            frames = []
            for i in range(a.n):
                frames.append(Image.open(io.BytesIO(pg.screenshot())).convert('RGB'))
                print(i, pg.evaluate('JSON.stringify(window.__mm.dev.state())'))
                if i < a.n - 1: pg.wait_for_timeout(a.every)
            cols = min(a.cols, a.n); rows = (a.n + cols - 1) // cols
            sheet = Image.new('RGB', (w * cols, h * rows))
            for i, f in enumerate(frames): sheet.paste(f, ((i % cols) * w, (i // cols) * h))
            scale = min(1.0, 1800 / sheet.width)
            if scale < 1: sheet = sheet.resize((int(sheet.width * scale), int(sheet.height * scale)), Image.LANCZOS)
            path = os.path.join(OUT, f'{a.name}.jpg'); sheet.save(path, quality=88); print('->', path)
            for l in logs:
                if 'GPU stall' in l or 'Automatic fallback' in l: continue
                print('  ', l[:400])
            b.close()
    finally:
        srv.terminate()

if __name__ == '__main__':
    main()
