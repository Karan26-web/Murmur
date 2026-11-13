#!/usr/bin/env python3
"""Play one whole evening with the autopilot and report it: python3 playtest/evening.py [--fast 6] [--seed 3] [--size 1280x800] [--query extra=1]
Prints every change of phase, the falcon's results and the final count; saves a screenshot of each phase to
playtest/screens/evening_<phase>.png. Exits 1 on a page error or if the evening never reaches the results."""
import sys, os, time, subprocess, socket, argparse, json
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'playtest', 'screens')

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--fast', type=int, default=6); ap.add_argument('--seed', type=int, default=3); ap.add_argument('--size', default='1280x800')
    ap.add_argument('--query', default=''); ap.add_argument('--touch', action='store_true'); ap.add_argument('--limit', type=int, default=240)
    a = ap.parse_args()
    w, h = map(int, a.size.split('x'))
    s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
    srv = subprocess.Popen([sys.executable, os.path.join(ROOT, 'playtest', 'serve.py'), str(port), ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.6); os.makedirs(OUT, exist_ok=True)
    errors, ok = [], False
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(headless=True, args=['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'])
            ctx = b.new_context(viewport={'width': w, 'height': h}, has_touch=a.touch, is_mobile=a.touch)
            pg = ctx.new_page()
            pg.on('console', lambda m: errors.append(f'[{m.type}] {m.text}') if m.type == 'error' else None)
            pg.on('pageerror', lambda e: errors.append(f'[pageerror] {e}'))
            q = f'start=1&auto=1&fast={a.fast}&seed={a.seed}&mute=1' + ('&' + a.query if a.query else '')
            pg.goto(f'http://127.0.0.1:{port}/index.html?{q}')
            pg.wait_for_function('window.__mm && window.__mm.flow && window.__mm.flow.phase !== "boot"', timeout=60000)
            seen, last, t0, peak, slowest = set(), None, time.time(), 0, 0
            shots = {'play': 55, 'play2': 120}
            while time.time() - t0 < a.limit:
                st = json.loads(pg.evaluate('JSON.stringify(window.__mm.dev.state())'))
                peak = max(peak, st['flock']); slowest = max(slowest, st['ms'])
                key = st['phase']
                if key != last:
                    print(f"[{time.time()-t0:5.1f}s] {key:8} t={st['t']:6.1f} tod={st['tod']:.2f} flock={st['flock']} home={st['home']} wisps={st['wisps']} falcon={st['falcon']} stats={st['stats']}")
                    last = key
                    if key not in ('play',) and key not in seen:
                        pg.wait_for_timeout(1500 if key != 'results' else 3200); pg.screenshot(path=os.path.join(OUT, f'evening_{key}.png')); seen.add(key)
                for name, at in list(shots.items()):
                    if st['phase'] == 'play' and st['t'] >= at:
                        pg.screenshot(path=os.path.join(OUT, f'evening_{name}.png')); del shots[name]
                        print(f"          {name}: t={st['t']} flock={st['flock']} wisps={st['wisps']} falcon={st['falcon']} ms={st['ms']} fps={st['fps']} stats={st['stats']}")
                if st['phase'] == 'roost' and 'roost_mid' not in seen and st['home'] > 300:
                    pg.screenshot(path=os.path.join(OUT, 'evening_roost_mid.png')); seen.add('roost_mid')
                    print(f"          roost_mid: t={st['t']} flock={st['flock']} home={st['home']}")
                if st['phase'] == 'results':
                    print('RESULT', json.dumps(st['result']), 'peak flock', peak, 'slowest sim ms', slowest, 'audio', st['audio']); ok = True; break
                pg.wait_for_timeout(700)
            b.close()
    finally:
        srv.terminate()
    for e in errors[:20]: print('   ', e[:400])
    sys.exit(0 if ok and not any('pageerror' in e for e in errors) else 1)

if __name__ == '__main__':
    main()
