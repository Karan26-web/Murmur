#!/usr/bin/env python3
"""The controls, with real input events (no script calls into the game): python3 playtest/hands.py
Mouse: press Play, lead with the pointer, click to flare, Esc to pause, Resume, M to mute.
Touch: tap Play, drag to lead, tap to flare, the pause button. Prints PASS / FAIL per check; exits 1 on any failure."""
import sys, os, time, subprocess, socket, json
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'playtest', 'screens')
fails = []

def check(name, ok, info=''):
    print(('PASS ' if ok else 'FAIL ') + name + (f'  [{info}]' if info else ''))
    if not ok: fails.append(name)

def js(pg, expr): return pg.evaluate(expr)

def main():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
    srv = subprocess.Popen([sys.executable, os.path.join(ROOT, 'playtest', 'serve.py'), str(port), ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.6); os.makedirs(OUT, exist_ok=True)
    url = f'http://127.0.0.1:{port}/index.html?seed=3&nofalcon=1'
    errors = []
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(headless=True, args=['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'])
            # ------------------------------------------------------------ mouse
            ctx = b.new_context(viewport={'width': 1280, 'height': 800}); pg = ctx.new_page()
            pg.on('pageerror', lambda e: errors.append(str(e)))
            pg.goto(url); pg.wait_for_selector('#btnPlay:not([hidden])', timeout=60000)
            check('title: audio waits for a gesture', js(pg, '__mm.audio.ctx === null'))
            pg.mouse.move(640, 300); pg.click('#btnPlay')
            pg.wait_for_function('__mm.flow.phase === "play"', timeout=20000)
            check('mouse: Play starts the evening and the audio', js(pg, '__mm.audio.ctx && __mm.audio.ctx.state') == 'running')
            check('mouse: the lead hint is showing', js(pg, '!document.getElementById("hint").hidden'), js(pg, 'document.getElementById("hintText").textContent'))
            for i in range(30): pg.mouse.move(400 + i * 18, 320 - i * 4); pg.wait_for_timeout(16)
            pg.wait_for_timeout(300)
            t1 = js(pg, '__mm.world.lure.target.toArray()')
            pg.mouse.move(250, 200, steps=12); pg.wait_for_timeout(500)
            t2 = js(pg, '__mm.world.lure.target.toArray()')
            check('mouse: the light follows the pointer', js(pg, '__mm.input.leading') and abs(t1[0] - t2[0]) > 20, f'{[round(v) for v in t1]} -> {[round(v) for v in t2]}')
            c0 = js(pg, '[__mm.world.flock.player.cx, __mm.world.flock.player.cy]')
            pg.mouse.move(1000, 240, steps=20); pg.wait_for_timeout(3500)
            c1 = js(pg, '[__mm.world.flock.player.cx, __mm.world.flock.player.cy]'); lx = js(pg, '__mm.world.lure.pos.x')
            check('mouse: the flock follows the light', abs(c1[0] - lx) < abs(c0[0] - lx), f'flock x {c0[0]:.0f} -> {c1[0]:.0f}, light x {lx:.0f}')
            pg.wait_for_timeout(1200)
            check('mouse: the lead hint has gone', js(pg, '!(__mm.hud.hintKey || "").startsWith("hint.lead")'), str(js(pg, '__mm.hud.hintKey')))
            pg.mouse.click(900, 300); pg.wait_for_timeout(120)
            check('mouse: a click is the flare', js(pg, '__mm.world.lure.cool') < 0.3 and js(pg, '__mm.world.flock.flare') > 0)
            pg.screenshot(path=os.path.join(OUT, 'hands_flare.png'))
            pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
            check('keys: Esc pauses', js(pg, '__mm.flow.paused && __mm.clock.paused && !document.getElementById("pause").hidden'))
            pg.screenshot(path=os.path.join(OUT, 'hands_pause.png'))
            t_a = js(pg, '__mm.flow.t'); pg.wait_for_timeout(600); t_b = js(pg, '__mm.flow.t')
            check('pause: the evening stands still', t_a == t_b)
            pg.click('#btnSound'); check('pause: the sound button mutes', js(pg, '__mm.audio.muted') is True); pg.click('#btnSound')
            pg.click('#btnResume'); pg.wait_for_timeout(300)
            check('pause: Resume carries on', js(pg, '!__mm.flow.paused && document.getElementById("pause").hidden') and js(pg, '__mm.flow.t') > t_b - 1e-9)
            pg.keyboard.press('Space'); pg.wait_for_timeout(100)
            check('keys: Space does nothing while the flare recharges', js(pg, '__mm.world.lure.cool') < 1)
            pg.keyboard.down('ArrowLeft'); pg.wait_for_timeout(500); pg.keyboard.up('ArrowLeft')
            check('keys: arrows move the light', js(pg, '__mm.input.x') < 0.5)
            pg.keyboard.press('Escape'); pg.click('#btnRestart'); pg.wait_for_function('__mm.flow.phase === "play" && __mm.flow.t < 3', timeout=20000); pg.wait_for_timeout(400)
            check('pause: Start again restarts the evening', js(pg, '__mm.world.flock.player.n') == 300 and not js(pg, '__mm.flow.paused') and js(pg, '__mm.post.fx.fade') < 0.05 and js(pg, 'document.getElementById("title").hidden'))
            ctx.close()
            # ------------------------------------------------------------ touch
            ctx = b.new_context(viewport={'width': 1024, 'height': 768}, has_touch=True, is_mobile=True); pg = ctx.new_page()
            pg.on('pageerror', lambda e: errors.append(str(e)))
            pg.goto(url); pg.wait_for_selector('#btnPlay:not([hidden])', timeout=60000)
            box = pg.locator('#btnPlay').bounding_box(); pg.touchscreen.tap(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
            pg.wait_for_function('__mm.flow.phase === "play"', timeout=20000)
            check('touch: a tap on Play starts', True)
            check('touch: 3,200 birds at most on a tablet', js(pg, '__mm.world.flock.max') == 3200)
            cdp = ctx.new_cdp_session(pg)
            def touch(kind, pts): cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [{'x': x, 'y': y, 'id': 1} for x, y in pts]})
            touch('touchStart', [(300, 400)])
            for i in range(1, 25): touch('touchMove', [(300 + i * 18, 400 - i * 8)]); pg.wait_for_timeout(16)
            pg.wait_for_timeout(250)
            check('touch: a drag leads', js(pg, '__mm.input.leading') and js(pg, '__mm.input.x') > 0.3, f"x={js(pg, '__mm.input.x'):.2f}")
            check('touch: a drag is not a flare', js(pg, '__mm.world.lure.cool') == 1)
            touch('touchEnd', []); pg.wait_for_timeout(100)
            x_before = js(pg, '__mm.input.x')
            pg.touchscreen.tap(200, 300); pg.wait_for_timeout(120)
            check('touch: a quick tap is the flare', js(pg, '__mm.world.lure.cool') < 0.3)
            check('touch: a tap does not drag the light away', abs(js(pg, '__mm.input.x') - x_before) < 1e-6)
            box = pg.locator('#btnPause').bounding_box(); pg.touchscreen.tap(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2); pg.wait_for_timeout(300)
            check('touch: the pause button pauses', js(pg, '__mm.flow.paused'))
            pg.screenshot(path=os.path.join(OUT, 'hands_tablet_pause.png'))
            box = pg.locator('#btnResume').bounding_box(); pg.touchscreen.tap(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2); pg.wait_for_timeout(300)
            check('touch: Resume', not js(pg, '__mm.flow.paused'))
            ctx.close(); b.close()
    finally:
        srv.terminate()
    check('no page errors', not errors, '; '.join(errors)[:300])
    print('\n' + ('ALL PASS' if not fails else f'{len(fails)} FAILED: ' + ', '.join(fails)))
    sys.exit(1 if fails else 0)

if __name__ == '__main__':
    main()
