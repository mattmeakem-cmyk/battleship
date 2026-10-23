# Bug log

Every bug found while building and testing the game, how it was found, and how it was fixed.

Testing used two tools:

- **Logic tests**: [`tests/index.html`](tests/index.html). Open it in a browser and it runs unit tests against `js/logic.js`. It covers placement bounds and overlap, random placement (500 boards), shot results, and 200 full simulated games for the computer AI.
- **Browser tests**: [`tests/browser/test_game.py`](tests/browser/test_game.py) plays `index.html` in Chrome with Playwright, at desktop size (1280×900) and as a touch phone (375×740). Screenshots from each run were reviewed by eye. See the README for how to run it.

## Bugs found and fixed

### 1. Placement preview got stuck on touch screens
- **How found:** In the phone test, I tapped a square to place the Carrier and then counted cells with the `preview-ok`/`preview-bad` class. It found 4. A red Battleship preview stayed on screen over the ship that had just been placed, because touch screens fire `mouseover` on a tap and never fire the matching `mouseleave`.
- **Fix:** `js/app.js` now records the pointer type on `pointerdown`/`pointermove`. The hover preview only shows for a mouse (or keyboard focus), and a touch tap clears it after placing. The same test now counts 0 preview cells after a tap.

### 2. White band under the page on mobile
- **How found:** A full-page screenshot of the phone layout had a white background below the first screen-height. The page background was a `fixed` gradient set only on `body`, and nothing was painted under it.
- **Fix:** `css/style.css` now sets a solid background colour on `html` and uses a normal (not `fixed`) gradient on `body`. `background-attachment: fixed` is also known to be unreliable on iOS Safari.

### 3. Your shot's result disappeared too quickly
- **How found:** While reviewing mid-game screenshots, the status bar only showed the computer's last shot (for example "Computer fired at H8 — miss."). The player's own result ("You fired at E2 — hit!") was replaced after 0.7 seconds, so it was easy to miss whether you had hit anything.
- **Fix:** When the turn comes back to you, the status bar shows both results, for example "You fired at E2 — hit! Computer fired at H8 — miss."

### 4. "You lose" heading used the wrong colour
- **How found:** In the game-over screenshot, the status-bar heading "You lose" was yellow (the colour for "Computer's turn") while the dialog heading was red.
- **Fix:** Added an `is-lose` style so the loss message is red everywhere.

### 5. Your own board's squares stayed in the Tab order during the battle
- **How found:** Flagged by an automated code review of the merged PR, then confirmed with a keyboard test. During the battle, all 100 squares of your own board could still be reached with Tab, even though clicking them does nothing. Keyboard players had to tab past every one before reaching the enemy board.
- **Fix:** `renderPlayerBoard` in `js/app.js` now disables your board's squares outside the placement phase. A keyboard test now goes from "New game" straight to enemy square A1, and your board's squares are enabled again after restarting.

### 6. Choosing a ship with the keyboard lost focus
- **How found:** Flagged by the same code review, then confirmed with a keyboard test. Pressing Enter on a ship chip rebuilt the whole ship list, which removed the button that had focus. The next Tab then started over from the top of the page.
- **Fix:** The ship chips are now created once (`buildDock`), and `renderDock` only updates their classes and disabled state. After pressing Enter on "Cruiser", focus stays on Cruiser and Tab moves on to "Submarine".

### 7. The computer's search shots clustered together
- **How found:** Reported by the user after playing. Their screenshot showed many search shots (shots before the computer had a hit) right next to earlier misses, which made the computer too easy. A simulation of 1,000 games confirmed it: 56% of search shots were next to an earlier miss, and the computer needed 60.6 shots on average to win (worst game: 100).
- **Fix:** Search shots now come from `chooseHuntShot` in `js/logic.js`:
  - It skips squares where no remaining ship could fit.
  - It only fires on a diagonal grid spaced by the smallest remaining ship (a checkerboard while the Destroyer is afloat).
  - It picks at random, weighted towards open areas where more ship placements fit.

  Shots that follow up a hit work the same as before. Over the same 1,000 games, 13% of search shots are next to a miss, and the computer averages 48.1 shots (worst game: 65). It doesn't always take the best square, so it stays beatable rather than near-perfect. A perfect strategy would average about 42–44. New tests in `tests/index.html` cover the dead-square rule and the grid pattern, and keep the average between 42 and 55.

## Edge cases tested (no bug found)

These were handled in the first version of the code. The tests above confirm they still work:

| Edge case | How it was tested | Result |
|---|---|---|
| Clicking the same enemy square twice | Clicked an already-fired square (both a normal click and a click event sent from a script) | Ignored. No extra shot, and it stays your turn. The logic layer also returns `repeat`. |
| Clicking during the computer's turn | Fired, then right away clicked two more enemy squares | Only 1 shot recorded. Enemy cells are disabled and the click handler checks whose turn it is. |
| Double-clicking a square | `dblclick` on a new enemy square | Only one shot fired |
| Ships going off the board | Horizontal Carrier at J1, vertical Battleship at row 9, plus unit tests on every edge | Rejected with a "doesn't fit" message. Red preview on hover. |
| Ships overlapping | Placed a Battleship across an existing Carrier, plus unit tests | Rejected. Ships right next to each other are allowed (standard rules). |
| Random placement | 500 random boards in unit tests | Always exactly 17 ship squares, no overlaps, ships never wrap onto the next row |
| Restarting mid-game during the computer's turn | Fired, clicked "New game" right away, then waited longer than the computer's delay | The computer's queued shot is cancelled. The new board stays clean. |
| Firing before the battle starts | Clicked enemy squares while placing ships | Ignored |
| Starting with a partial fleet | Placed only some ships | "Start battle" stays disabled until all 5 are placed |
| Firing after the game ends | Clicked an enemy square after the win/lose dialog appeared | Ignored |
| "Play again" | Clicked it after a finished game | Boards, fleet status and messages all reset |
| Rotate key during battle | Pressed `R` after starting | No effect |
| Computer AI correctness | 200 simulated full games | Never fires the same square twice, always finishes, and averages about 48 shots per game (pure random needs about 96) |
