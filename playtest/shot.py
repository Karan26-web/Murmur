#!/usr/bin/env python3
"""Screenshot the game: python3 playtest/shot.py name=query [name=query ...] [--wait 4000] [--size 1280x800] [--soft]
Each shot opens index.html?<query>, waits, saves playtest/screens/<name>.png and prints the game state and any errors."""
import sys, os, time, subprocess, socket, argparse, json
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'playtest', 'screens')

def free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('shots', nargs='+')
    ap.add_argument('--wait', type=int, default=3500)
    ap.add_argument('--size', default='1280x800')
    ap.add_argument('--soft', action='store_true')
    ap.add_argument('--touch', action='store_true')
    a = ap.parse_args()
    w, h = map(int, a.size.split('x'))
    port = free_port()
    srv = subprocess.Popen([sys.executable, os.path.join(ROOT, 'playtest', 'serve.py'), str(port), ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.6)
    os.makedirs(OUT, exist_ok=True)
    try:
        with sync_playwright() as p:
            args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] if a.soft else ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']
            b = p.chromium.launch(headless=True, args=args + ['--autoplay-policy=no-user-gesture-required'])
            for spec in a.shots:
                name, q = spec.split('=', 1)
                ctx = b.new_context(viewport={'width': w, 'height': h}, has_touch=a.touch, is_mobile=a.touch)
                pg = ctx.new_page()
                logs = []
                pg.on('console', lambda m: logs.append(f'[{m.type}] {m.text}'))
                pg.on('pageerror', lambda e: logs.append(f'[pageerror] {e}'))
                t0 = time.time()
                pg.goto(f'http://127.0.0.1:{port}/index.html?{q}')
                try:
                    pg.wait_for_function('window.__mm && window.__mm.flow && window.__mm.flow.phase !== "boot"', timeout=60000)
                except Exception as e:
                    logs.append(f'[timeout] {e}')
                pg.wait_for_timeout(a.wait)
                path = os.path.join(OUT, f'{name}.png')
                pg.screenshot(path=path)
                try:
                    st = pg.evaluate('JSON.stringify(window.__mm.dev.state())')
                except Exception as e:
                    st = f'(no state: {e})'
                print(f'== {name} ({time.time()-t0:.1f}s) -> {path}\n   {st}')
                for l in logs:
                    if 'GPU stall' in l or 'Automatic fallback' in l: continue
                    print('   ', l[:500])
                ctx.close()
            b.close()
    finally:
        srv.terminate()

if __name__ == '__main__':
    main()
