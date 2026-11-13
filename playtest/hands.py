#!/usr/bin/env python3
"""The game played with real input events (no calls into the game's functions): python3 playtest/hands.py
Mouse and keys: Play, read the first triangle, answer wrong (the hint ladder), answer right, lead the flock to the next
lamp, answer with a number key, pause and resume, restart. Touch: tap Play, tap an answer, drag to lead. The falcon:
let its clock run out. Prints PASS / FAIL per check; exits 1 on any failure."""
import sys, os, time, subprocess, socket, json
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'playtest', 'screens')
fails = []

def check(name, ok, info=''):
    print(('PASS ' if ok else 'FAIL ') + name + (f'  [{info}]' if info != '' else ''))
    if not ok: fails.append(name)

def js(pg, expr): return pg.evaluate(expr)
OPEN = '__mm.flow.phase === "{}" && !document.getElementById("dock").hidden && !__mm.dock.locked'
def option(pg, right):
    """the on-screen centre of a right (or wrong) option's button"""
    i = js(pg, f'__mm.dock.options.findIndex(o => (o.code === null) === {str(right).lower()})')
    b = pg.locator('#dkOpts button').nth(i).bounding_box()
    return b['x'] + b['width'] / 2, b['y'] + b['height'] / 2, i
def goal_px(pg):
    return js(pg, '(() => { const g = __mm.flow.goal; if (!g) return null; const v = g.clone().project(__mm.camera); return [(v.x * .5 + .5) * innerWidth, (-v.y * .5 + .5) * innerHeight]; })()')

def main():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
    srv = subprocess.Popen([sys.executable, os.path.join(ROOT, 'playtest', 'serve.py'), str(port), ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.6); os.makedirs(OUT, exist_ok=True)
    url = f'http://127.0.0.1:{port}/index.html?seed=3'
    errors = []
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(headless=True, args=['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'])
            # ------------------------------------------------------- mouse and keys
            ctx = b.new_context(viewport={'width': 1280, 'height': 800}); pg = ctx.new_page()
            pg.on('pageerror', lambda e: errors.append(str(e)))
            pg.goto(url); pg.wait_for_selector('#btnPlay:not([hidden])', timeout=60000)
            check('title: audio waits for a gesture', js(pg, '__mm.audio.ctx === null'))
            pg.screenshot(path=os.path.join(OUT, 'hands_title.png'))
            pg.mouse.move(640, 300); pg.click('#btnPlay')
            pg.wait_for_function(OPEN.format('sight'), timeout=40000)
            check('Play starts the evening and the audio', js(pg, '__mm.audio.ctx && __mm.audio.ctx.state') == 'running')
            labs = js(pg, '[...document.querySelectorAll(".lab")].map(e => e.textContent)')
            check('the triangle is labelled: the distance, the angle, a ? on the height, and its words', any('m' in x for x in labs) and '45°' in labs and '?' in labs and 'line of sight' in labs, ' | '.join(labs))
            q0 = js(pg, 'JSON.stringify({a: __mm.flow.plan[0].answer, n: __mm.flow.plan[0].birds, opts: __mm.dock.options.map(o => o.text)})'); q0 = json.loads(q0)
            check('four options, the answer among them', len(q0['opts']) == 4 and q0['a'] in q0['opts'], str(q0['opts']))
            check('the first question says how answering works', 'scouts' in js(pg, 'document.getElementById("dkFb").textContent'))
            # a wrong answer: scouts fly it, a third of the strays leave, an idea (not the answer) is offered
            x, y, i = option(pg, False); pg.mouse.click(x, y); pg.wait_for_timeout(150)
            check('a click takes an option and locks the dock', js(pg, '__mm.dock.locked') and js(pg, '__mm.flow.scouts && __mm.flow.scouts.n') > 20)
            pg.wait_for_timeout(1800); pg.screenshot(path=os.path.join(OUT, 'hands_wrong.png'))
            pg.wait_for_function(OPEN.format('sight') + ' && !document.getElementById("dkFb").hidden && !!document.querySelector(".fb-t")', timeout=30000)
            pg.wait_for_timeout(500)                      # (the flock's head-counts are taken once a frame)
            fb = js(pg, 'document.getElementById("dkFb").innerText'); left = js(pg, '__mm.flow.wisp.n')
            check('a miss: a title and an idea, and no digits of the answer in it', len(fb) > 20 and q0['a'].split()[0] not in fb.replace('tan θ', ''), fb.replace('\n', ' / '))
            check('a miss: a third of the strays have left', abs(left - round(q0['n'] * 0.66)) <= 2, f"{q0['n']} -> {left}")
            check('a miss: nothing is struck out, all four options are still there', len(js(pg, '__mm.dock.options')) == 4 and pg.locator('#dkOpts button').count() == 4)
            flock0 = js(pg, '__mm.world.flock.player.n')
            # the right answer, with the keyboard
            x, y, i = option(pg, True); pg.keyboard.press(str(i + 1))
            pg.wait_for_function('__mm.flow.phase === "transit"', timeout=40000)
            flock1 = js(pg, '__mm.world.flock.player.n + (__mm.flow.scouts ? __mm.flow.scouts.n : 0)')
            check('a number key answers; the strays that stayed have joined', flock1 - flock0 == left, f'{flock0} + {left} = {flock1}')
            check('the pip for a question answered after a miss is not gold', js(pg, 'document.getElementById("hudPips").children[0].className') == 'ok')
            # the road to the next lamp: lead by hand
            pg.wait_for_timeout(700)
            check('transit: the lead hint is showing', 'lamp' in js(pg, 'document.getElementById("hintText").textContent'), js(pg, 'document.getElementById("hintText").textContent'))
            t0 = time.time(); arrived = False
            while time.time() - t0 < 13:
                g = goal_px(pg)
                if not g: break
                pg.mouse.move(g[0], g[1], steps=4); pg.wait_for_timeout(200)
                if time.time() - t0 > 1.2 and not os.path.exists(os.path.join(OUT, 'hands_transit.png')): pg.screenshot(path=os.path.join(OUT, 'hands_transit.png'))
                if js(pg, '__mm.flow.phase') != 'transit': arrived = True; break
            took = time.time() - t0
            check('transit: the flock follows the pointer to the lamp', arrived and js(pg, '__mm.input.leading'), f'{took:.1f}s')
            pg.wait_for_function(OPEN.format('sight'), timeout=40000)
            # pause
            pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
            check('Esc pauses (the pause card, the clock stopped)', js(pg, '__mm.flow.paused && __mm.clock.paused && !document.getElementById("pause").hidden'))
            pg.click('#btnSound'); check('pause: the sound button mutes', js(pg, '__mm.audio.muted') is True); pg.click('#btnSound')
            pg.click('#btnResume'); pg.wait_for_timeout(300)
            check('Resume carries on with the same question', js(pg, '!__mm.flow.paused && document.getElementById("pause").hidden && !__mm.dock.locked'))
            x, y, i = option(pg, True); pg.mouse.click(x, y)
            pg.wait_for_function('__mm.flow.qi === 2', timeout=40000)
            check('a first-try answer earns a gold pip', js(pg, 'document.getElementById("hudPips").children[1].className') == 'gold')
            pg.keyboard.press('Escape'); pg.click('#btnRestart')
            pg.wait_for_function(OPEN.format('sight') + ' && __mm.flow.qi === 0', timeout=40000)
            check('Start again: a new evening from its first question', js(pg, '__mm.world.flock.player.n') == 300 and js(pg, '__mm.flow.asked') == 0 and js(pg, '__mm.post.fx.fade') < 0.05 and len(js(pg, '[...document.querySelectorAll(".lab")].map(e => e.textContent)')) >= 4)
            ctx.close()
            # ---------------------------------------------------------------- touch
            ctx = b.new_context(viewport={'width': 1024, 'height': 768}, has_touch=True, is_mobile=True); pg = ctx.new_page()
            pg.on('pageerror', lambda e: errors.append(str(e)))
            pg.goto(url); pg.wait_for_selector('#btnPlay:not([hidden])', timeout=60000)
            box = pg.locator('#btnPlay').bounding_box(); pg.touchscreen.tap(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
            pg.wait_for_function(OPEN.format('sight'), timeout=40000)
            check('touch: a tap on Play starts; 3,200 birds at most on a tablet', js(pg, '__mm.world.flock.max') == 3200)
            dk = pg.locator('#dock').bounding_box(); bt = pg.locator('#dkOpts button').first.bounding_box()
            check('touch: the dock is on screen and its buttons are finger-sized', dk['x'] >= 0 and dk['x'] + dk['width'] <= 1024 and bt['height'] >= 44 and bt['width'] >= 60, f"button {bt['width']:.0f}x{bt['height']:.0f}")
            pg.screenshot(path=os.path.join(OUT, 'hands_tablet.png'))
            x, y, i = option(pg, True); pg.touchscreen.tap(x, y)
            pg.wait_for_function('__mm.flow.phase === "transit"', timeout=40000)
            check('touch: a tap on an option answers', js(pg, '__mm.flow.firstTry') == 1)
            cdp = ctx.new_cdp_session(pg)
            def touch(kind, pts): cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [{'x': x, 'y': y, 'id': 1} for x, y in pts]})
            pg.wait_for_timeout(600); g = goal_px(pg); touch('touchStart', [(512, 300)])
            t0 = time.time(); arrived = False
            while time.time() - t0 < 13:
                g = goal_px(pg)
                if not g: break
                touch('touchMove', [(g[0], g[1])]); pg.wait_for_timeout(200)
                if js(pg, '__mm.flow.phase') != 'transit': arrived = True; break
            touch('touchEnd', [])
            check('touch: a drag leads the flock to the lamp', arrived and js(pg, '__mm.input.leading'), f'{time.time() - t0:.1f}s')
            box = pg.locator('#btnPause').bounding_box(); pg.touchscreen.tap(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2); pg.wait_for_timeout(300)
            check('touch: the pause button pauses', js(pg, '__mm.flow.paused'))
            ctx.close()
            # ----------------------------------------------------- the falcon's clock
            ctx = b.new_context(viewport={'width': 1280, 'height': 800}); pg = ctx.new_page()
            pg.on('pageerror', lambda e: errors.append(str(e)))
            pg.goto(url + '&start=1&q=4&fast=3&mute=1'); pg.wait_for_function(OPEN.format('falcon'), timeout=60000)
            n0 = js(pg, '__mm.world.flock.player.n')
            check('the falcon: a clock is running on the dock', js(pg, '!document.getElementById("dkTimer").hidden') and 'depression' in ' '.join(js(pg, '[...document.querySelectorAll(".lab")].map(e => e.textContent)')))
            pg.screenshot(path=os.path.join(OUT, 'hands_falcon.png'))
            pg.wait_for_function('!!document.querySelector("#dkWork .wk")', timeout=60000)
            n1 = js(pg, '__mm.world.flock.player.n')
            check('the falcon: no answer in time and it takes about an eighth of the flock', abs((n0 - n1) - round(n0 * 0.12)) <= 2, f'{n0} -> {n1}')
            check('the falcon: then the working is shown', js(pg, 'document.querySelectorAll("#dkWork .wk").length') >= 1)
            ctx.close(); b.close()
    finally:
        srv.terminate()
    check('no page errors', not errors, '; '.join(errors)[:400])
    print('\n' + ('ALL PASS' if not fails else f'{len(fails)} FAILED: ' + ', '.join(fails)))
    sys.exit(1 if fails else 0)

if __name__ == '__main__':
    main()
