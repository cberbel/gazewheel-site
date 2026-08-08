# GazeWheel — notes for Claude Code

A round on-screen keyboard for people who cannot speak and point with a slow cursor
(eye tracker, head mouse, trackball, one finger). Plain HTML, CSS and JavaScript.
**No build step, no dependencies, no server.** Open a file in a browser and it runs.

If you are helping someone adapt this keyboard, read this first — it will save you
from breaking things that matter to the people using it.

## The files

| File | What it is |
|---|---|
| `en.html` | The keyboard, English. **Self-contained**: markup, styles and logic in one file. |
| `pt.html` | The same keyboard, Portuguese. Same code, translated strings and dictionary. |
| `index.html` | Home page |
| `challenge.html` | Passages to copy, and the comparison between layouts |
| `devices.html`, `feedback.html`, `support.html` | Equipment, suggestions, donations |
| `VERSIONS.md` | Changelog, mirrored in the "What has changed" section of `feedback.html` |

**`en.html` and `pt.html` are twins.** Any change to behaviour must be made in both.
The code is identical; only strings, the dictionary and the voice language differ.

## How the keyboard is built (inside `en.html` / `pt.html`)

1. **Vocabulary** — `BASE`, `VERBOS`, `AREA` merge into `WORDS`; `SEED_NEXT` holds
   starter word pairs; `CHAR_NEXT` is the letter-chain fallback for unknown words.
2. **Memory** — `LEARN` (words) and `NEXT` (chains) in `localStorage`, with decay:
   a word unused for `HALF_LIFE` days loses half its weight.
3. **Prediction** — `suggestions()` for the three word buttons, `letterScores()` for
   which letters deserve the inner ring, `pages()` for the rest.
4. **Selection** — `bind()` on every target; `fire()` runs it, with a cooldown so a
   parked cursor never fires twice. Dwell (selecting by resting the cursor) is optional.
5. **Drawing** — `drawWheel()` for the rings, `drawGrid()` for the traditional layout.
6. **Everything else** — speak, conversation mode, saved phrases, Teach, settings,
   the plain-language command box, the copy mode used by the challenge page.

## Things not to break

- **`localStorage` keys are `tr2.*`.** Renaming them erases the vocabulary people
  spent months teaching. Migrate, never rename.
- **`«início»`** is the sentence-start key in `SEED_NEXT` and `NEXT`. Not a label —
  do not translate it, it would orphan saved data.
- **The rest zone in the middle does nothing on purpose.** It is where someone parks
  their gaze to think. Never put a target there.
- **The outer ring never moves.** The whole alphabet stays in the same place so a
  letter can be found without hunting. Only the inner ring adapts.
- **The cooldown after each selection** exists because an unsteady cursor fires twice.
- **Nothing leaves the browser.** No analytics, no fonts from a CDN, no API calls.
  People write private things here. Keep it that way.
- **The keyboard writes lowercase and unaccented.** Accents arrive through the word
  prediction (type "nao", accept "não"). If you add capitals or accent keys, you are
  spending targets — the scarcest resource on the screen.

## Adapting it

Ask for what you want in plain terms; the structure is small enough that it works:

- *"Translate it to French"* — the dictionary, `SEED_NEXT`, `CHAR_NEXT`, the interface
  strings, the voice language (`speak()`), and the letters in `OUTER_ABC`.
- *"Bigger targets, fewer letters"* — `cfg.innerN` and `autoN()`.
- *"My father only moves his head to the left"* — the ring order and page logic in
  `pages()`; this is the kind of change that matters most and no one else will make.

Test in a browser as a real person would: open the file, turn on dwell, and write a
sentence without touching the keys with your hands.

## Licence

MIT. Use it, change it, translate it, ship it. If you build something with it, say so
on the [suggestions page](https://www.gazewheel.org/feedback.html) — that is the payment.
