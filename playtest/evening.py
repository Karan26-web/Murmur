#!/usr/bin/env python3
"""Play one whole evening with the autopilot and report it:
    python3 playtest/evening.py [--fast 4] [--seed 3] [--miss 0] [--size 1280x800] [--touch] [--query extra=1]
The autopilot answers every question (wrong --miss times first, to climb the hint ladder). Prints each question as it
is reached, the final count, and saves a screenshot of every question to playtest/screens/ev_<n>_<type>.png.
Exits 1 on a page error or if the evening never reaches the results."""
import sys, os, time, subprocess, socket, argparse, json
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'playtest', 'screens')

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--fast', type=int, default=4); ap.add_argument('--seed', type=int, default=3); ap.add_argument('--miss', type=int, default=0)
    ap.add_argument('--size', default='1280x800'); ap.add_argument('--query', default=''); ap.add_argument('--touch', action='store_true')
    ap.add_argument('--limit', type=int, default=420); ap.add_argument('--tag', default='ev')
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
            q = f'start=1&auto=1&fast={a.fast}&seed={a.seed}&miss={a.miss}&mute=1' + ('&' + a.query if a.query else '')
            pg.goto(f'http://127.0.0.1:{port}/index.html?{q}')
            pg.wait_for_function('window.__mm && window.__mm.flow && window.__mm.flow.phase !== "boot"', timeout=60000)
            last, t0, shot, slow = None, time.time(), set(), 0
            while time.time() - t0 < a.limit:
                st = json.loads(pg.evaluate('JSON.stringify(window.__mm.dev.state())'))
                slow = max(slow, st['ms'] / a.fast)
                key = (st['phase'], st['qi'])
                if key != last:
                    print(f"[{time.time()-t0:5.1f}s] {st['phase']:8} q{st['qi']} {st['type'] or '-'}  flock={st['flock']} home={st['home']} total={st['total']} first={st['first']}/{st['asked']}")
                    last = key
                if st['dock'] and st['qi'] not in shot:
                    shot.add(st['qi'])
                    pg.screenshot(path=os.path.join(OUT, f"{a.tag}_{st['qi']}_{st['type']}.png"))
                if st['phase'] == 'results':
                    pg.wait_for_timeout(3000); pg.screenshot(path=os.path.join(OUT, f'{a.tag}_results.png'))
                    print('RESULT', json.dumps(st['result']), '| slowest step ms', round(slow, 2), '| audio', st['audio']); ok = True; break
                pg.wait_for_timeout(250)
            b.close()
    finally:
        srv.terminate()
    for e in errors[:20]: print('   ', e[:500])
    sys.exit(0 if ok and not any('pageerror' in e for e in errors) else 1)

if __name__ == '__main__':
    main()
