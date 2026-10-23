# Battleship

A classic game of Battleship you play in your web browser against a computer opponent. It is written in plain HTML, CSS and JavaScript with no frameworks and no build step, so it runs on GitHub Pages straight from `index.html`.

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

The computer fires at random until it hits something. Then it fires at the squares around that hit. Once it has two hits in a row, it keeps going along that line until the ship sinks, and then goes back to firing at random.

## Running it

- **Online:** enable GitHub Pages for this repo (Settings → Pages → Deploy from branch → `main` / root). The game will be at `https://<user>.github.io/battleship/`.
- **Locally:** open `index.html` in any modern browser. No server or install is needed.

It works on desktop and mobile. On small screens the boards stack, and during the battle the enemy board is shown first.

## Project layout

```
index.html        Page markup
css/style.css     Styling, including the mobile layout
js/logic.js       Game rules and computer AI (no DOM code, unit-tested)
js/app.js         User interface: rendering, placement, turns
tests/index.html  Open in a browser to run the logic tests
BUGS.md           Bugs found during testing and how they were fixed
```
