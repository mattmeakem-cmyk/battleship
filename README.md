# Battleship

A classic game of Battleship you play in your web browser against a computer opponent.

**Play it here: https://mattmeakem-cmyk.github.io/battleship/**

 It is written in plain HTML, CSS and JavaScript with no frameworks and no build step, so it runs on GitHub Pages straight from `index.html`.

## How to play

1. **Place your fleet.** You have five ships: Carrier (5), Battleship (4), Cruiser (3), Submarine (3) and Destroyer (2).
   - Pick a ship from the list, then click a square on **Your fleet** to place it. The ship extends right (horizontal) or down (vertical) from the square you click.
   - Press **Rotate** (or the `R` key) to switch between horizontal and vertical.
   - A green preview means the ship fits there. Red means it would go off the board or overlap another ship.
   - Click a ship you've already placed to pick it up and move it.
   - Or press **Place randomly** to have your whole fleet placed for you. **Clear** empties the board.
2. **Start the battle.** Once all five ships are placed, press **Start battle**. The computer's fleet is placed at random and hidden.
3. **Take turns firing.** On your turn, click a square in **Enemy waters**. The status bar shows whose turn it is and what happened.
   - **Red square**: hit
   - **Dot**: miss
   - **Dark red with ✕**: a sunk ship. The fleet list under each board crosses off sunk ships.
4. **Win** by sinking all five enemy ships before the computer sinks yours. When the game ends, a message says whether you won or lost, and **Play again** starts a new game. You can also start over at any time with **New game**.

### The computer opponent

The computer searches the board in a spread-out pattern instead of firing at random. It fires on a diagonal grid spaced so that every remaining ship has to cross it, skips squares where none of your remaining ships could fit, and prefers open areas of the board. There is still some randomness, so it doesn't always take the best square. Once it hits something, it fires at the squares around that hit, follows the line once it has two hits in a row, and goes back to searching after the ship sinks.

## Running it

- **Online:** https://mattmeakem-cmyk.github.io/battleship/ is hosted by GitHub Pages from the root of the `main` branch and updates automatically when `main` changes.
- **Locally:** open `index.html` in any modern browser. No server or install is needed.

It works on desktop and mobile. On small screens the boards stack, and during the battle the enemy board is shown first.

## Project layout

```
index.html        Page markup
css/style.css     Styling, including the mobile layout
js/logic.js       Game rules and computer AI (no DOM code, unit-tested)
js/app.js         User interface: rendering, placement, turns
tests/index.html  Open in a browser to run the logic tests
tests/browser/    Automated browser tests (Playwright) that play the game end to end
BUGS.md           Bugs found during testing and how they were fixed
```

## Testing

- **Logic tests:** open `tests/index.html` in a browser. It runs unit tests on the game rules and the computer AI, including thousands of simulated moves.
- **Browser tests:** `tests/browser/test_game.py` opens the real game in Chrome and plays it like a user would. It covers:
  - ships going off the board or overlapping
  - clicking the same square twice
  - clicking during the computer's turn
  - restarting mid-game
  - a full game through to "Play again"
  - a phone-sized screen
  - keyboard navigation

  It also runs the logic tests. It needs Python 3:

  ```
  pip install -r tests/browser/requirements.txt
  python -m playwright install chromium
  python tests/browser/test_game.py              # add --headed to watch it play, --screenshots out/ to save screenshots
  ```

  It prints PASS or FAIL for each check and exits with an error if anything fails.

Bugs found by these tests, and how each was fixed, are listed in [BUGS.md](BUGS.md).
