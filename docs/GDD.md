# Murmur: game design

Version 2, 14 November 2026. Version 1 (the same day) was a flock toy with no maths and no reason to act; the review of it was "it is not feeling like a game" and "not an interactive game for Class 10". This version keeps the world and rebuilds the game inside it. §12 lists what changed.

## 1. What it is

A practice game for **Class 10, NCERT Chapter 9, "Some Applications of Trigonometry"** (heights and distances).

At golden hour a small flock of starlings waits at a lamp on a lake. Wisps of strays circle above the water. Each wisp is a right triangle: the lamp, a distance along the water, an angle of elevation, a height. The player works out the missing part; scouts fly that answer; if it is right the strays join. Twice a falcon turns the triangle upside down (an angle of depression, against a clock). At dusk the banyan tree asks the chapter's hardest question, and then the flock goes home. The score is how many birds came home.

## 2. Why this maths belongs in this world

A sky over flat water is already a page of right triangles: the water is the horizontal, anything in the air has a height, and looking at it is a line of sight. Nothing was added to the fiction to make room for the maths:

| In the chapter | In the game |
|---|---|
| the observer | the lamp the flock waits at |
| the horizontal | the water, with a floating diya every 10 m |
| the object | a wisp of strays, the falcon, the top of the banyan |
| the line of sight | the line the scouts fly |
| angle of elevation | drawn at the lamp |
| angle of depression | drawn at the falcon, between its horizontal and its dive |
| "find the height of the tower" | "how high are they?", and the flock has to get there |

And the answer is not typed into a box and marked: **it is flown**. A height that is too small is a line that passes under the strays.

## 3. Pillars

1. **The answer is an action.** Every option, right or wrong, is carried out in the world, so being wrong is something you see, with a direction and a size.
2. **A wrong option is a diagnosis.** Each distractor is one particular mistake, so a miss can be answered with the idea that was missing.
3. **Never stopped, never told.** Hints climb a ladder (idea → set-up → working). There is no game over and no way to fail out, and the answer is not given until the third miss.
4. **The score is the flock.** No points, no lives. Misses cost birds; what came home is the result.
5. **Few words.** The first triangle arrives with its vocabulary, each word as its part is drawn. After that, numbers and a one-line question.
6. **You still hold the flock.** Between questions the player leads it by hand; at the end pours it into the tree. The maths is the game, but the flock is the toy.

## 4. One evening

Ten questions, about eight minutes (an estimate: nobody has played it by hand yet).

| # | Kind | Asks for | Ratio | Notes |
|---|---|---|---|---|
| 1 | Sighting | height | tan 45° | the triangle's words appear; distance 50–70 m so there is room for them |
| 2 | Sighting | height | tan 60° | the first √3 |
| 3 | Sighting | height | tan 30° | the first division by √3 |
| 4 | Sighting | distance | tan (30°, 45° or 60°) | the same ratio, the other way round |
| 5 | Falcon | distance | tan | angle of depression; 35 s |
| 6 | Sighting | line of sight | sin or cos | the hypotenuse enters |
| 7 | Sighting | angle | tan | two sides given |
| 8 | Sighting | mixed | any | one of: distance, height, line of sight, angle from sin/cos |
| 9 | Falcon | distance | tan (30° or 60°) | |
| 10 | Banyan | height | two tans | 30° and 60° from lamps 40 m apart: 20√3 m |

Numbers are drawn per evening from a seed (`problems.js`), always so that answers are whole numbers or whole multiples of √2 or √3, as in the textbook. The sun goes down by one step per question, not by the clock: the only timer in the game is the falcon's.

**Between questions (transit).** The next lamp lights with a thin beam over it. The player drags (or moves the mouse) and the flock follows the light across the lake. Three knots of fledglings, each with a mote of light, sit off the straight road: brush them with the flock and they join. If nobody leads for five seconds the light starts for the lamp by itself, and the next question begins within twenty seconds whatever happens: a transit cannot be failed and cannot stall the evening.

## 5. A sighting, beat by beat

1. The strays fly in and circle their point. The camera goes to a long lens from 12 m up, sized so the triangle fills the screen beside the dock.
2. The diagram draws itself in reading order, each part with a sound: the plumb line and its right angle → the water (diyas lighting one by one when the distance is given, ticks on the plumb line when the height is) → the line of sight → the angle arc. The unknown is amber and carries a `?`.
3. The dock: one question, up to four options.
4. The player chooses. Seventy scouts leave the flock with a light and fly the answer: the line it makes is drawn behind them.
5. **Perfect:** the line turns green, the strays fall in behind the scouts, half a second of slow motion, a run of notes, and they all go back to the flock.
   **Miss:** the line turns red and its end is labelled with what was chosen; the stamp says *Too low / Too high / Too short / Too far*; a third of the strays give up and fly away; the scouts come back; the red line stays, faint, to compare against. The options change places (nothing is struck out).

Where an option puts the light (`endpoint()`):

| Asked for | The option fixes | So a miss reads as |
|---|---|---|
| height | the height above the foot | too low / too high |
| distance | how far out, at the known height | too short / too far |
| line of sight | how far along the true direction | too short / too far |
| angle | the direction, out to the known distance | too low / too high |
| the tree's height | how far down from the flock the scouts come | too high (hover) / too low (into the boughs) |

## 6. Mistakes and the hint ladder

Every wrong option carries a code (`problems.js`):

| Code | The mistake | First-miss idea |
|---|---|---|
| `inv` | multiplied where they should divide (or the reverse) | tan θ = opposite ÷ adjacent. Is the side you want on top, or underneath? |
| `ratio` | used sin or cos where tan joins the two sides | Which two sides are in play here? Use the ratio that joins exactly those two. |
| `value` | right ratio, wrong standard value (or forgot the √3) | Right ratio. Now check its value for this angle. |
| `hyp` | gave the line of sight instead of a leg | That is the length of the line of sight, the slanted side. |
| `side` | gave the other leg instead of the line of sight | That is the other side of the triangle, not the line of sight. |
| `longest` | a line of sight no longer than a leg | The line of sight is the longest side of the triangle. |
| `swap` | 30° for 60° or the reverse | Compare the two sides. Is the height longer than the distance, or shorter? |
| `one` (tree) | treated 40 m as the distance to the tree | 40 m is the gap between the lamps, not the distance to the tree. |
| `x` (tree) | stopped at x | That is how far the near lamp is from the tree. How tall is the tree? |

The ladder, by misses on one question:

1. **The idea** for the mistake just made. Never a digit of the answer.
2. **The set-up**, without the finish: `tan 60° = height ÷ 30` and "Now finish it."
3. **The working**, a line at a time, the right option lit, and the scouts fly it. The question is over.

What joins, of a wisp: all of it on the first try, 66 % after one miss, 33 % after two, 15 % once the working has been shown.

## 7. The falcon

It hangs over the far end of a lane of water; the flock strings itself out along the lane (each bird is given its own place along a line instead of a point). The reading: its height on a plumb line, the horizontal through its eye (dashed), the start of its line of sight, and the angle between them. The first time, the words *angle of depression* sit beside it.

One question, one answer, 35 seconds: *how far out will it come down?* The flock opens a gap where the player says (a gate of two dashed lines marks it). Then the falcon folds and goes down its line: the world drops to 30 % speed, the horizon tips, and its path draws in red.

- Right: it goes through the gap. *It missed.*
- Wrong, or too late: it goes through birds. It takes 12 % of the flock, and then the working is shown, starting with the line this question exists for: *angle of depression from above = angle of elevation from below*.

There is no second try: the falcon is the one place where an answer cannot be taken back.

## 8. The banyan and home

At question ten the temple bell rings three times, the lamps on the ghat come on, a column of light rises from the tree and every lamp of the evening relights across the lake. The camera whips to the tree and does a dolly zoom along its sightline, then settles on the water 140 m out.

The tree is built to be exactly 20√3 m tall above the lamp line, so two lamps 60 m and 20 m from its foot see its top at 30° and 60°. The diagram shows both angles and the 40 m between the lamps; the height is the `?`. Scouts come straight down from the flock to the height chosen. Each miss costs 8 % of the flock.

Then the roost: the light settles over the crown and the flock pours in at 70–260 birds a second. The player can swirl them; left alone, they go in by themselves. A perched bird is an ember, so the tree lights up as it fills. Night falls round it, the camera circles, and the count comes up: *N came home*, a rank, and *a of 10 right on the first try*.

Rank by the share of the evening's birds that came home: 85 % a murmuration, 60 % a murmur, 25 % a whisper. Measured with the autopilot: every answer right first time, 98 %; one miss on every question, 52 %; two, 28 %; three, 15 %.

## 9. The flock (unchanged from version 1, and still not animated)

`src/world/flock.js`. Each bird, each step: keep apart (closer than 3.4 m), fly the same way as, and stay close to, its nearest eight neighbours, and steer for its group's place. Neighbours come from a hashed grid; half the flock decides on each frame. 4,000 birds cost about 3 ms a step on the Apple-silicon Mac it was built on. Version 2 added: a line to string out along (the falcon's lane), a gap to keep open, tighter groups (wisps, scouts), and taking the nearest N birds to a point as a new group (scouts, the strays that leave, the falcon's bite).

## 10. Look, camera, sound

- **Light:** one number, the time of day, picks between five palettes; every material reads the same uniforms. The lake is a true planar reflection. HDR with bloom, ACES.
- **The diagram** is drawn in the world with camera-facing ribbons of constant on-screen width: a bright core inside a dark rim, so the same line reads on a gold sky and a violet one. Labels are DOM text pinned to world points.
- **Camera:** crane out of the reeds at the start; a long lens from above the reeds for each question; the low bank camera for transits; slow motion and a tilted horizon for the falcon; whip pan and dolly zoom at the call home; an orbit for the finale.
- **Sound:** all synthesised. A tanpura drone and a flute in raga Bhoopali; every part of a diagram, every diya, every line of working is a note of the same scale; a miss is two notes falling; the falcon, the bell, wings, water, crickets after dark.

## 11. Words

`src/engine/i18n.js`, English and Hindi (`?lan=hi`). The Hindi uses the NCERT terms: उन्नयन कोण, अवनमन कोण, दृष्टि रेखा, सम्मुख भुजा, संलग्न भुजा. It was written with the game and has not been read by a native-speaking maths teacher.

## 12. What changed from version 1

| Version 1 | Version 2 |
|---|---|
| Drag anywhere; the flock follows | Ten questions; the flock is led between them |
| Wisps cross the sky; fly through them | Each wisp is a triangle to solve |
| Tap to flare when the falcon dives (reflex) | Work out where it comes down (angle of depression, 35 s) |
| Hold the flock over the tree | Find the tree's height from two angles, then roost |
| A 220-second clock | No clock except the falcon's; the sun steps down per question |
| Score: how many you happened to catch | Score: how many your answers earned |

Removed: the flare as a free action, the wisp schedule, the roaming falcon, depth assist for wisps. Kept: the whole world, the flock simulation, the roost and finale, the engine.

## 13. Verified

- `playtest/evening.py`: whole evenings on autopilot reach the results with no page errors, answering right first time (seeds 3, 9, 2 at desktop, tablet and phone sizes) and wrong one, two and three times per question (seeds 5, 9, 13), which walks every rung of the ladder on every kind of question.
- `playtest/hands.py`: 27 checks with real mouse, keyboard and touch events: the first triangle's labels, a wrong answer (the idea shown contains no digit of the answer; a third of the strays leave; nothing is struck out), a right answer by number key, leading the flock to the next lamp by mouse and by touch drag, pause, mute, resume, restart, tablet button sizes, and the falcon's clock running out.
- Layouts looked at in screenshots: 1280×800, 1600×1000, 1024×768 touch, 390×844 touch, and Hindi.

## 14. Not done, and open questions

- **Nobody has played it by hand.** The flow, the numbers and the layouts were checked with an autopilot, scripted input and screenshots. A first playtest with Class 10 students should watch: whether the diagram is read before the options are, whether "the scouts fly your answer" lands without being told, whether 35 seconds is right for the falcon, and how long an evening really takes.
- **Options, not typing.** Four options make every mistake diagnosable and keep it one tap on a tablet, but they can be guessed. The cost of a miss is the counterweight. A typed mode (a keypad with a √3 key) for a second, harder evening is the obvious next step; the mistake table already covers typed answers.
- **One chapter, one evening.** The generators vary the numbers, not the kinds of question. More kinds exist in the chapter (two objects on opposite sides, a moving object seen at two times, a shadow) and would fit the same lake.
- **The audio has not been listened to by a person**, only measured as present.
- **Real devices and Safari** have not been tried; tablets were emulated in desktop Chromium.
- The lesson itself is not here: this is the practice. A short taught opening, or the team's own lesson module in front of it (as in Spaceship Mission), is a product decision.
