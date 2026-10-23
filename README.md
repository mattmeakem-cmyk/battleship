# Battleship

A classic game of Battleship you play in your web browser against a computer opponent.

**Play it here: https://mattmeakem-cmyk.github.io/battleship/**

 It is written in plain HTML, CSS and JavaScript with no frameworks and no build step, so it runs on GitHub Pages straight from `index.html`.

## How to play

1. **Pick a difficulty.** Above your ships, choose **Easy**, **Medium** (the default) or **Hard** for the computer opponent. Your choice stays the same for later games until you change it.
2. **Place your fleet.** You have five ships: Carrier (5), Battleship (4), Cruiser (3), Submarine (3) and Destroyer (2).
   - Pick a ship from the list, then click a square on **Your fleet** to place it. The ship extends right (horizontal) or down (vertical) from the square you click.
   - Press **Rotate** (or the `R` key) to switch between horizontal and vertical.
   - A green preview means the ship fits there. Red means it would go off the board or overlap another ship.
   - Click a ship you've already placed to pick it up and move it.
   - Or press **Place randomly** to have your whole fleet placed for you. **Clear** empties the board.
3. **Start the battle.** Once all five ships are placed, press **Start battle**. The computer's fleet is placed at random and hidden.
4. **Take turns firing.** On your turn, click a square in **Enemy waters**. The status bar shows whose turn it is and what happened.
   - **Red square**: hit
   - **Dot**: miss
   - **Dark red with ✕**: a sunk ship. The fleet list under each board crosses off sunk ships.
5. **Win** by sinking all five enemy ships before the computer sinks yours. When the game ends, a message says whether you won or lost, and **Play again** starts a new game. You can also start over at any time with **New game**.

### The computer opponent

All three difficulties fire at the squares around a hit until the ship sinks. They differ in how well they search for ships and how well they finish them off:

- **Easy:** often fires within a couple of squares of its earlier shots, so its shots bunch up. After a hit it tries random neighbouring squares and never works out which way the ship runs.
- **Medium:** searches in a spread-out pattern. It fires on a diagonal grid spaced so every remaining ship has to cross it, skips squares where none of your remaining ships could fit, and prefers open areas, with some randomness. Once it has two hits in a row, it follows that line.
- **Hard:** for every square, counts how many ways your remaining ships could still be lying across it, and fires at the most likely square. After a hit it only counts ship positions that pass through that hit, so it quickly works out which way the ship runs.

Average shots for the computer to sink your whole fleet, over 1,000 simulated games: Easy about 65, Medium about 48, Hard about 44.

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
  - the difficulty toggles
  - keyboard navigation

  It also runs the logic tests. It needs Python 3:

  ```
  pip install -r tests/browser/requirements.txt
  python -m playwright install chromium
  python tests/browser/test_game.py              # add --headed to watch it play, --screenshots out/ to save screenshots
  ```

  It prints PASS or FAIL for each check and exits with an error if anything fails.

Bugs found by these tests, and how each was fixed, are listed in [BUGS.md](BUGS.md).
