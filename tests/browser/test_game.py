"""
End-to-end browser tests for the Battleship game.

Serves the repo on a local port, opens the game in Chromium with Playwright and
plays it like a user: placing ships, firing, edge cases, a full game, a phone
viewport and keyboard navigation. Also runs the logic tests in tests/index.html.

    pip install -r tests/browser/requirements.txt
    python -m playwright install chromium
    python tests/browser/test_game.py                 # headless
    python tests/browser/test_game.py --headed        # watch it play
    python tests/browser/test_game.py --screenshots out/

Exits with status 1 if any check fails.
"""
import argparse
import functools
import http.server
import os
import sys
import threading

from playwright.sync_api import sync_playwright

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SHOT_SELECTOR = ".cell.hit, .cell.miss"

failures = []


def check(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond:
        failures.append(msg)


def serve_repo():
    handler = functools.partial(QuietHandler, directory=REPO_ROOT)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, "http://127.0.0.1:%d" % server.server_address[1]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def pcell(pg, i):
    return pg.locator('#player-board .cell[data-index="%d"]' % i)


def ecell(pg, i):
    return pg.locator('#enemy-board .cell[data-index="%d"]' % i)


def count(pg, sel):
    return pg.locator(sel).count()


def enemy_shots(pg):
    return count(pg, "#enemy-board .cell.hit, #enemy-board .cell.miss")


def player_shots(pg):
    return count(pg, "#player-board .cell.hit, #player-board .cell.miss")


def mouse_click(pg, loc):
    """Click by coordinates so disabled cells still receive a real mouse click."""
    box = loc.bounding_box()
    pg.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)


def script_click(pg, board, index):
    """Dispatch a click event directly, bypassing the disabled attribute."""
    pg.evaluate(
        "([b, i]) => document.querySelector('#' + b + ' .cell[data-index=\"' + i + '\"]')"
        ".dispatchEvent(new MouseEvent('click', {bubbles: true}))",
        [board, index],
    )


def wait_for_player_turn_or_end(pg):
    pg.wait_for_function(
        "document.getElementById('turn').textContent === 'Your turn'"
        " || !document.getElementById('overlay').hidden"
    )


def track_errors(pg):
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: m.type == "error" and errors.append(m.text))
    return errors


def screenshot(pg, out_dir, name, **kwargs):
    if out_dir:
        pg.screenshot(path=os.path.join(out_dir, name), **kwargs)


def test_logic_suite(browser, base):
    print("\n== Logic tests (tests/index.html) ==")
    ctx = browser.new_context()
    pg = ctx.new_page()
    pg.goto(base + "/tests/index.html")
    pg.wait_for_function("window.__testResults", timeout=120000)
    results = pg.evaluate("window.__testResults")
    for r in results:
        check(r["ok"], "logic: " + r["name"] + ("" if r["ok"] else " - " + r.get("error", "")))
    print(pg.inner_text("#summary"))
    ctx.close()


def test_placement(pg):
    print("\n== Ship placement ==")
    check(pg.locator("#start").is_disabled(), "Start is disabled before ships are placed")
    check(count(pg, "#player-board .cell") == 100 and count(pg, "#enemy-board .cell") == 100, "two 10x10 grids")
    check(count(pg, "#enemy-board .cell.ship") == 0, "enemy ships are hidden")

    pcell(pg, 9).click()  # horizontal Carrier at J1 would run off the board
    check(count(pg, "#player-board .cell.ship") == 0, "off-board horizontal placement rejected")
    check("doesn't fit" in pg.inner_text("#message"), "'doesn't fit' message shown")
    pcell(pg, 9).hover()
    check(count(pg, "#player-board .cell.preview-bad") >= 1, "red preview when hovering an invalid spot")

    pg.keyboard.press("r")
    check("Vertical" in pg.inner_text("#rotate"), "R key rotates")
    pcell(pg, 9).click()
    check(count(pg, "#player-board .cell.ship") == 5, "vertical Carrier placed at J1")

    pcell(pg, 80).click()  # vertical Battleship at A9 would run off the bottom
    check(count(pg, "#player-board .cell.ship") == 5, "off-board vertical placement rejected")

    pg.locator("#rotate").click()
    pcell(pg, 26).click()  # horizontal Battleship G3-J3 crosses the Carrier
    check(count(pg, "#player-board .cell.ship") == 5, "overlapping placement rejected")
    pcell(pg, 20).click()
    check(count(pg, "#player-board .cell.ship") == 9, "Battleship placed")

    pcell(pg, 21).click()
    check(count(pg, "#player-board .cell.ship") == 5, "clicking a placed ship picks it up")
    check("Battleship" in pg.inner_text(".ship-chip.is-selected"), "picked-up ship is selected again")

    mouse_click(pg, ecell(pg, 0))
    check(enemy_shots(pg) == 0, "cannot fire before the battle starts")
    check(pg.locator("#start").is_disabled(), "Start stays disabled with a partial fleet")

    pg.locator("#clear").click()
    check(count(pg, "#player-board .cell.ship") == 0, "Clear empties the board")
    pg.locator("#random").click()
    check(count(pg, "#player-board .cell.ship") == 17, "Place randomly gives 17 ship squares")
    check(not pg.locator("#start").is_disabled(), "Start enabled with a full fleet")


def test_battle_edge_cases(pg, out_dir):
    print("\n== Battle edge cases ==")
    screenshot(pg, out_dir, "01-placement.png")
    pg.locator("#start").click()
    check(pg.inner_text("#turn") == "Your turn", "'Your turn' shown after starting")
    pg.keyboard.press("r")
    check(count(pg, "#player-board .cell.ship") == 17, "R key does nothing during battle")

    ecell(pg, 0).click()
    check(pg.inner_text("#turn") == "Computer's turn", "turn passes to the computer")
    mouse_click(pg, ecell(pg, 1))
    script_click(pg, "enemy-board", 2)
    check(enemy_shots(pg) == 1, "clicks during the computer's turn are ignored")
    wait_for_player_turn_or_end(pg)
    check(player_shots(pg) == 1, "computer fires exactly once per turn")

    mouse_click(pg, ecell(pg, 0))
    script_click(pg, "enemy-board", 0)
    check(enemy_shots(pg) == 1, "firing at the same square twice is ignored")
    check(pg.inner_text("#turn") == "Your turn", "still your turn after a repeat click")

    ecell(pg, 55).dblclick()
    check(enemy_shots(pg) == 2, "double-click fires only once")

    pg.locator("#new-game").click()  # restart while the computer is about to fire
    pg.wait_for_timeout(1200)
    check(player_shots(pg) == 0, "no stale computer shot after restarting mid-game")
    check("phase-placement" in pg.get_attribute("body", "class"), "restart returns to placement")
    check(count(pg, "#player-board .cell.ship") == 0 and enemy_shots(pg) == 0, "both boards reset")


def test_full_game(pg, out_dir):
    print("\n== Full game ==")
    pg.locator("#random").click()
    pg.locator("#start").click()
    for i in range(100):
        wait_for_player_turn_or_end(pg)
        if not pg.locator("#overlay").is_hidden():
            break
        if i == 20:
            screenshot(pg, out_dir, "02-battle.png")
        ecell(pg, i).click()
    pg.wait_for_selector("#overlay:not([hidden])")
    title = pg.inner_text("#result-title")
    check(title in ("You win!", "You lose"), "game over dialog shown: " + title)
    enemy_sunk = count(pg, "#enemy-fleet li.is-sunk")
    player_sunk = count(pg, "#player-fleet li.is-sunk")
    check(
        (title == "You win!" and enemy_sunk == 5) or (title == "You lose" and player_sunk == 5),
        "fleet lists match the result (enemy sunk %d, yours sunk %d)" % (enemy_sunk, player_sunk),
    )
    check(count(pg, ".cell.sunk") >= 2, "sunk ships drawn on the boards")
    if title == "You lose":
        check(count(pg, "#enemy-board .cell.ship") > 0, "enemy ships revealed after a loss")
    screenshot(pg, out_dir, "03-game-over.png")

    before = enemy_shots(pg)
    pg.evaluate(
        "(() => { const c = document.querySelector('#enemy-board .cell:not(.hit):not(.miss)');"
        " if (c) c.dispatchEvent(new MouseEvent('click', {bubbles: true})); })()"
    )
    check(enemy_shots(pg) == before, "cannot fire after the game is over")

    pg.locator("#play-again").click()
    check(pg.locator("#overlay").is_hidden(), "Play again closes the dialog")
    check("phase-placement" in pg.get_attribute("body", "class"), "Play again returns to placement")
    check(count(pg, "#enemy-fleet li.is-sunk") == 0 and enemy_shots(pg) == 0, "Play again resets the game")


def test_keyboard(browser, base):
    print("\n== Keyboard navigation ==")
    ctx = browser.new_context()
    pg = ctx.new_page()
    pg.goto(base + "/index.html")
    pg.locator('.ship-chip[data-ship="Cruiser"]').focus()
    pg.keyboard.press("Enter")
    check(pg.evaluate("document.activeElement.dataset.ship") == "Cruiser", "choosing a ship keeps keyboard focus")
    pg.keyboard.press("Tab")
    check(pg.evaluate("document.activeElement.dataset.ship") == "Submarine", "Tab moves to the next ship")
    pg.locator("#random").click()
    pg.locator("#start").click()
    check(count(pg, "#player-board .cell:disabled") == 100, "your board is skipped by Tab during battle")
    pg.locator("#new-game").focus()
    pg.keyboard.press("Tab")
    check(pg.evaluate("document.activeElement.getAttribute('aria-label')") == "Enemy A1", "Tab from New game reaches enemy A1")
    ctx.close()


def test_mobile(browser, base, out_dir):
    print("\n== Phone viewport (375x740, touch) ==")
    ctx = browser.new_context(viewport={"width": 375, "height": 740}, is_mobile=True, has_touch=True, device_scale_factor=2)
    pg = ctx.new_page()
    errors = track_errors(pg)
    pg.goto(base + "/index.html")
    width = pg.evaluate("document.documentElement.scrollWidth")
    check(width <= 375, "no sideways scrolling (page width %d)" % width)
    pcell(pg, 0).tap()
    check(count(pg, "#player-board .cell.ship") == 5, "tapping places a ship")
    check(count(pg, "#player-board .preview-ok, #player-board .preview-bad") == 0, "no stuck placement preview after a tap")
    pg.locator("#random").tap()
    pg.locator("#start").tap()
    enemy_y = pg.locator("#enemy-wrap").bounding_box()["y"]
    player_y = pg.locator("#player-wrap").bounding_box()["y"]
    check(enemy_y < player_y, "enemy board shown first during battle")
    ecell(pg, 44).tap()
    check(enemy_shots(pg) == 1, "tapping fires")
    wait_for_player_turn_or_end(pg)
    screenshot(pg, out_dir, "04-mobile.png", full_page=True)
    check(not errors, "no console errors on mobile: %s" % errors)
    ctx.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--headed", action="store_true", help="show the browser window")
    parser.add_argument("--screenshots", metavar="DIR", help="save screenshots to this folder")
    parser.add_argument("--cdp", metavar="URL", help="connect to an already running Chrome over CDP instead of launching one")
    args = parser.parse_args()
    if args.screenshots:
        os.makedirs(args.screenshots, exist_ok=True)

    server, base = serve_repo()
    try:
        with sync_playwright() as p:
            if args.cdp:
                browser = p.chromium.connect_over_cdp(args.cdp)
            else:
                browser = p.chromium.launch(headless=not args.headed)

            test_logic_suite(browser, base)

            ctx = browser.new_context(viewport={"width": 1280, "height": 900})
            pg = ctx.new_page()
            errors = track_errors(pg)
            pg.goto(base + "/index.html")
            test_placement(pg)
            test_battle_edge_cases(pg, args.screenshots)
            test_full_game(pg, args.screenshots)
            check(not errors, "no console errors on desktop: %s" % errors)
            ctx.close()

            test_keyboard(browser, base)
            test_mobile(browser, base, args.screenshots)
            if not args.cdp:
                browser.close()
    finally:
        server.shutdown()

    print("\n%d check(s) failed" % len(failures) if failures else "\nAll checks passed")
    for f in failures:
        print("  - " + f)
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
