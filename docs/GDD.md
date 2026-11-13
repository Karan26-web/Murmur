# Murmur: game design

Version 1, 14 November 2026.

## 1. The idea in one breath

At golden hour a small flock of starlings wheels over a lake. The player is a mote of light the flock follows. Wisps of strays cross the sky; fly through them and they join. A falcon comes; scatter at the right moment and it passes through. When the sun touches the far bank the temple bell rings, and the flock has until dark to pour into the banyan tree. The score is how many came home.

The flock is not animated. It is simulated: every bird obeys three rules about its nearest neighbours, and nothing else. The game is about having one more rule to give them.

## 2. Pillars

1. **The flock is the spectacle.** Nothing on screen competes with it. No particles for their own sake, no HUD beyond two numbers and a sun.
2. **One finger.** Drag to lead, tap to scatter. Everything else (speed, shape, depth) is a consequence.
3. **The sky is the clock.** There is no timer bar. The sun going down is the timer, and its colour is the difficulty curve.
4. **Emergence over scripting.** If a behaviour can come from the three rules, it is not hand-authored: the vortex round a still light, the comet tail when the light moves, the vacuole round the falcon, the funnel into the tree.
5. **An evening has an arc.** Calm, then pressure, then one decisive act, then rest. Four minutes, start to finish.

## 3. The evening

| Phase | Game time | Sky (`tod`) | What happens |
|---|---|---|---|
| Title | — | 0.05 | The starting flock wheels by itself. Tap to begin. |
| Intro | 3 s | 0.05 | The camera cranes up from the reeds to the play view. |
| Play, act 1 | 0–56 s | 0.05 → 0.24 | Small wisps (55–100 birds), slow. Learn to lead and to gather. |
| Play, act 2 | 56–116 s | → 0.45 | Medium wisps (140–250). The falcon arrives (first at about 50 s, then every 24–32 s). |
| Play, act 3 | 116–165 s | → 0.62 | Large wisps (300–470), faster. The falcon every 17–23 s. |
| Call | 165 s | 0.62 | The sun touches the bank. Bell, lamps, the beam over the tree, a whip and a vertigo push in on the banyan. |
| Roost | up to 55 s | → 0.82 | Hold the flock over the tree and it pours in. Two late wisps. One last falcon. |
| Finale | 15 s | → 0.93 | Whoever is still flying is lost to the dark. The camera circles the lit tree; the count. |

Sizes above are for the desktop cap of 5,000 birds; on touch devices the cap is 3,200 and every wisp is scaled to match. An evening holds about 4,600 birds in all: 300 to start and roughly twenty wisps.

Rating, by the share of all the evening's birds that came home: under 25 % "a few stragglers", 25 % "a whisper", 55 % "a murmur", 80 % "a murmuration". The best count is kept in `localStorage`.

## 4. The flock

`src/world/flock.js`. Plain typed arrays on the CPU; neighbours through a hashed grid whose cells are as wide as a bird's sight (6 m).

Each bird, each step:

| Rule | What it does | Constant |
|---|---|---|
| 1. Keep apart | pushed away from any bird closer than 3.4 m | `sep` 30 |
| 2. Fly the same way | steers toward the average velocity of its neighbours | `ali` 2.5 |
| 3. Stay close | steers toward the average position of its neighbours | `coh` 0.6 |
| 4. The pull of a place | steers for the group's target at cruise speed | `goal` 0.72 |

Decisions that shape the look:

- **Seven or eight neighbours, not a radius.** A bird stops counting after 8 neighbours (`K_NEIGH`), however dense the flock is. This is what real starlings do, and it is why a wave can cross the whole flock: information moves from neighbour to neighbour at the same speed in thin and thick parts.
- **The fourth rule pulls the flock as a body.** Each bird steers for the target as seen from a point between itself and the flock's centre. If every bird dived at the same spot the flock would collapse into a ball; this way it travels as one shape, and wheels when it arrives because a bird cannot stop (minimum speed 12 m/s).
- **A lens, not a ball.** A small extra pull toward the flock's mean height flattens it. Seen from a lens a few metres above the water, a flat flock tilting as it turns is what makes the dark bands sweep across it.
- **Gusts.** A slow, smooth force field moves whole regions of the flock together (the billows). Per-bird noise alone only makes it fuzzy.
- **A tether.** Birds further from the centre than a comfort radius (`4 + 3.1·∛n` metres) are pulled back, so a stretched flock stays one flock.
- **Half the flock thinks each frame.** A bird looks round on every other frame and keeps its last decision in between. The neighbour search is the cost; this halves it with no visible change. 4,000 birds cost about 3 ms a step on the Apple-silicon Mac it was built on.

The shimmer is not a separate effect. Each bird is drawn banked into its turn (bank = its sideways acceleration), and its back catches the low sun: a turning region of the flock flashes gold and goes dark again.

Groups: `player`, any number of `wisp`s (each following its own curve across the stage), `scatter` (knocked loose by the falcon) and `lost` (still flying at nightfall). Strays are drawn rosy, the player's birds dark; a bird changing group changes colour over half a second.

## 5. The stage and the finger

A finger has two dimensions and the sky has three. The pointer's ray is mapped like this (`Flow.pointer`):

- above the horizon it lands on a far wall of sky about 145 m from the lens, which undulates slowly from left to right, so sweeping across the screen also moves the flock toward and away from the lens;
- below the horizon the wall slopes back along the water toward the lens (down to 52 m): drag low and the flock comes skimming over the lake at you, big and loud;
- **depth assist:** if the ray passes within about 30 m of a wisp (or, at dusk, the tree), the light goes to that thing's own distance. Pointing at something sends the flock to it and not past it.

A wisp joins when the flock touches it: eight of the player's birds inside it, or the two centres closing. The light alone gathers nothing; the birds have to get there.

## 6. The falcon

`src/world/falcon.js`. States: away → circle (4.2 s, with its cry) → lock (0.9 s, a dashed red line to where it means to go, the light's ring turns red) → stoop (up to 86 m/s, homing a little) → leave.

When the falcon is 62 m out the world drops to 30 % speed and the horizon tips. That slowed dive is the window: **a flare that is still open when the falcon arrives is a dodge**, and it passes through the hole. No flare, and if enough birds are still in its path (3.5 % of the flock within 11 m), it takes a bite: the birds nearest its path break away as a `scatter` group, flee for three seconds, and are gone for good after fifteen unless the flock sweeps them up again.

The flare (0.8 s, recharges in 3.2 s) also opens the flock up, so it is not free: tapped during the circle or the lock it is over, and still recharging, when the falcon lands.

The first time, "Tap to scatter!" appears at the start of the slowed dive, and never again once the player has dodged that way.

## 7. The roost

At 165 s: three strokes of the temple bell, the lamps on the ghat come on one by one, a column of light rises from the banyan, fireflies wake. The camera whips to the tree and does a dolly zoom along its sightline (the lens travels 140 m toward the tree while zooming out, so the tree holds its size and the sky behind it stretches), then settles at a new vantage out on the water.

While the light is within 62 m of the crown, birds within 48 m peel off at 70–260 a second (more, the more are there) and spiral down to a perch. A perched bird is an ember: the tree lights up with every bird that comes home, and that glow is the progress bar. Each landing plucks a soft high note.

The evening ends when everyone is home or when the roost time runs out.

## 8. Camera

The engine's camera director, driven by `Flow`:

| Moment | Shot |
|---|---|
| Title | low in the reeds, slow lateral drift, handheld |
| Begin | banked spline crane to the play view |
| Play | stands at a vantage that drifts 56 m west over the evening (so by sunset the lens looks into the sun and the tree is silhouetted against it); pans up to 16° after the flock; widens as the flock grows |
| A big wisp joins | FOV punch, half a second at half speed |
| Flare | zoom blur out of the flock's centre, FOV punch |
| Falcon dives | 30 % speed, push in, 4° of roll toward the dive |
| Falcon hits | trauma shake, chromatic aberration, a flash |
| Call home | whip pan → dolly zoom on the banyan |
| Finale | slow orbit, the tree low in the frame under the stars |

## 9. Look

- **One number lights the world.** `tod` picks between five palette keys (golden hour, late gold, sunset, blue hour, night); the dome, the sun, the clouds, the fog, the light on the land and the birds all read the same uniforms (`SKY` in `sky.js`).
- **The water is a real mirror.** The scene is drawn twice, the second time from a camera mirrored under the surface into a half-resolution HDR target; the surface samples it through three octaves of ripple, stretched vertically because the lens is nearly at water level.
- **HDR, then tone-mapped.** The sun, the lamps and the embers are brighter than white and the dual-Kawase bloom does the rest. ACES, a little grain, a vignette.
- **Land is silhouette.** One flat-shaded material, facet normals from screen-space derivatives, rim light when looking into the sun. Hills dip where the sun sets so the disc reaches the bank.
- **Type:** Cormorant Garamond for everything that is read, a wide-tracked sans for labels. Ivory on sky.

## 10. Sound

All synthesised (`src/engine/audio.js`):

- **The score is an evening raga.** A tanpura drone (four Karplus-Strong strings rendered once into buffers: Pa, Sa, Sa, low Sa), a bansuri that wanders through Bhoopali with glides into each note, more often as the light goes.
- **The player plays it too.** Every wisp gathered plucks a run up the same scale (longer for a bigger wisp); every bird landing plucks one high note; the flare is a chord. Nothing the game does can be out of tune with the drone.
- **The bed:** wings (a band of fluttering noise, louder and brighter with the flock's size, speed and nearness, panned to where it is on screen), starling chatter, the lake, crickets once the light has gone.
- **Cues:** the falcon's cry, the lock ticks, the rising rush of the stoop, the hit, the dodge, the temple bell.

## 11. Words

Twenty-odd strings, English and Hindi (`src/engine/i18n.js`, `?lan=hi`). In play there are at most three one-line hints, each shown until the player has done the thing once: lead, gather, scatter. The pause card is also the explanation of the game: the three rules, and "You are the fourth: the way home."

The Hindi copy was written with the game and should be read by a native speaker before release.

## 12. Tech notes

- Vanilla ES modules, Three.js r170 core vendored, no build step, no runtime dependencies.
- Render scale adapts between 1× and 1.75× CSS pixels (1.5× on touch) on a rolling frame time; if 1× is still slow the reflection drops to a third resolution.
- Game time and real time are separate clocks: slow motion slows the world, never the camera or the UI.
- Screen flow is written as cancellable async scripts (`ScriptRunner`), so a restart can never leave a half-finished beat running. `enterTitle()` cancels every tween tagged to the previous evening.
- `?fast=N` runs N exact simulation steps per frame, which is how a four-minute evening is tested in thirty seconds.

## 13. Verified

- `playtest/evening.py`: whole evenings on autopilot reach the results with no page errors (seeds 3, 5, 11, 21). In the current build the autopilot brings home about 94 % when it flares and 90 % when it never does.
- Falcon: five dives, five dodges when the autopilot flares in the dive; five hits when it never flares.
- `playtest/hands.py`: 23 checks with real mouse, keyboard and touch events (lead, flare, a tap that is not a drag, pause, resume, mute, restart from the pause card).
- Audio produces signal in headless Chromium (RMS 0.02–0.06 before the last gain raise); it has not been listened to by a person.

## 14. Not done, and open questions

- **Nobody has played it by hand.** Everything above was tuned with an autopilot and screenshots. The first real playtest should look at: how hard wisps are to catch with a finger, whether the depth assist feels like help or like the light being pulled away, whether the roost is too quick, and the loudness balance.
- The autopilot's 93–98 % suggests the rating thresholds may be generous for a good player and still right for a first-timer. Decide after playtests.
- Tablets: built touch-first and capped at 3,200 birds, but only run in desktop Chromium with touch emulation. Needs a real iPad and a mid-range Android tablet.
- Safari has not been tried.
- Ideas held back to keep the first version small: wind that carries the flock, a second evening with rain, a photo mode, a sandbox with sliders for the three rules.
