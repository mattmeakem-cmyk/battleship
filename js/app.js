(function () {
  'use strict';

  var L = window.BattleshipLogic;
  var SIZE = L.SIZE;
  var COMPUTER_DELAY_MS = 700;
  var COLS = 'ABCDEFGHIJ';

  var els = {
    body: document.body,
    turn: document.getElementById('turn'),
    message: document.getElementById('message'),
    dock: document.getElementById('ship-dock'),
    rotate: document.getElementById('rotate'),
    random: document.getElementById('random'),
    clear: document.getElementById('clear'),
    start: document.getElementById('start'),
    newGame: document.getElementById('new-game'),
    playerBoard: document.getElementById('player-board'),
    enemyBoard: document.getElementById('enemy-board'),
    playerFleet: document.getElementById('player-fleet'),
    enemyFleet: document.getElementById('enemy-fleet'),
    overlay: document.getElementById('overlay'),
    modal: document.querySelector('.modal'),
    resultTitle: document.getElementById('result-title'),
    resultText: document.getElementById('result-text'),
    playAgain: document.getElementById('play-again')
  };

  var state;
  var playerCells = [];
  var enemyCells = [];
  var hoverIndex = null;
  var computerTimer = null;
  var lastPointerType = 'mouse';
  var lastPlayerShotText = '';

  function coord(index) {
    var p = L.toRowCol(index);
    return COLS[p.col] + (p.row + 1);
  }

  function buildBoard(boardEl, cellList, owner) {
    boardEl.innerHTML = '';
    cellList.length = 0;
    boardEl.appendChild(makeLabel(''));
    for (var c = 0; c < SIZE; c++) boardEl.appendChild(makeLabel(COLS[c]));
    for (var r = 0; r < SIZE; r++) {
      boardEl.appendChild(makeLabel(String(r + 1)));
      for (var col = 0; col < SIZE; col++) {
        var idx = L.toIndex(r, col);
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cell';
        btn.dataset.index = idx;
        btn.dataset.owner = owner;
        btn.setAttribute('aria-label', (owner === 'enemy' ? 'Enemy ' : 'Your ') + coord(idx));
        boardEl.appendChild(btn);
        cellList.push(btn);
      }
    }
  }

  function makeLabel(text) {
    var d = document.createElement('div');
    d.className = 'label';
    d.textContent = text;
    d.setAttribute('aria-hidden', 'true');
    return d;
  }

  function newGame() {
    if (computerTimer) { clearTimeout(computerTimer); computerTimer = null; }
    state = {
      phase: 'placement',
      turn: 'player',
      player: L.createBoard(),
      computer: L.placeAllRandom(L.createBoard()),
      horizontal: true,
      selected: L.SHIPS[0].name,
      lastShot: null
    };
    hoverIndex = null;
    lastPlayerShotText = '';
    els.overlay.hidden = true;
    setMessage('Place your ships', 'Pick a ship, then click your board to place it. Click a placed ship to move it.');
    renderAll();
  }

  function setMessage(turn, msg, who) {
    els.turn.textContent = turn;
    els.turn.className = 'turn' + (who ? ' is-' + who : '');
    els.message.textContent = msg || '';
  }

  /* ---------- Placement ---------- */

  function placedNames() {
    return state.player.ships.map(function (s) { return s.name; });
  }

  function nextUnplaced() {
    var placed = placedNames();
    for (var i = 0; i < L.SHIPS.length; i++) {
      if (placed.indexOf(L.SHIPS[i].name) === -1) return L.SHIPS[i].name;
    }
    return null;
  }

  function shipDef(name) {
    for (var i = 0; i < L.SHIPS.length; i++) if (L.SHIPS[i].name === name) return L.SHIPS[i];
    return null;
  }

  function previewCells(index) {
    var def = shipDef(state.selected);
    if (!def || index === null) return null;
    var p = L.toRowCol(index);
    var cells = [];
    for (var i = 0; i < def.size; i++) {
      var r = state.horizontal ? p.row : p.row + i;
      var c = state.horizontal ? p.col + i : p.col;
      if (r < SIZE && c < SIZE) cells.push(L.toIndex(r, c));
    }
    return { cells: cells, ok: L.canPlace(state.player, def.size, p.row, p.col, state.horizontal) };
  }

  function onPlayerCellClick(index) {
    if (state.phase !== 'placement') return;
    // Touch screens never fire mouseleave, so drop the preview after a tap.
    if (lastPointerType !== 'mouse') hoverIndex = null;
    var occupant = state.player.cells[index];
    if (occupant !== null) {
      // Pick up an already placed ship so it can be moved or rotated.
      var removed = L.removeShip(state.player, occupant);
      state.selected = removed.name;
      state.horizontal = removed.horizontal;
      setMessage('Place your ships', removed.name + ' picked up. Click to place it again.');
      renderAll();
      return;
    }
    var def = shipDef(state.selected);
    if (!def) return;
    var p = L.toRowCol(index);
    if (!L.placeShip(state.player, def, p.row, p.col, state.horizontal)) {
      setMessage('Place your ships', "The " + def.name + " doesn't fit there. Try another square or rotate.");
      renderAll();
      return;
    }
    state.selected = nextUnplaced();
    if (state.selected) {
      setMessage('Place your ships', def.name + ' placed. Next: ' + state.selected + '.');
    } else {
      setMessage('Fleet ready', 'All ships placed. Press "Start battle" when you are ready.');
    }
    renderAll();
  }

  function toggleRotate() {
    if (state.phase !== 'placement') return;
    state.horizontal = !state.horizontal;
    renderAll();
  }

  function randomPlacement() {
    if (state.phase !== 'placement') return;
    state.player = L.placeAllRandom(L.createBoard());
    state.selected = null;
    setMessage('Fleet ready', 'Ships placed randomly. Shuffle again or press "Start battle".');
    renderAll();
  }

  function clearPlacement() {
    if (state.phase !== 'placement') return;
    state.player = L.createBoard();
    state.selected = L.SHIPS[0].name;
    setMessage('Place your ships', 'Board cleared. Pick a ship, then click your board to place it.');
    renderAll();
  }

  function startBattle() {
    if (state.phase !== 'placement' || state.player.ships.length !== L.SHIPS.length) return;
    state.phase = 'battle';
    state.turn = 'player';
    state.selected = null;
    hoverIndex = null;
    setMessage('Your turn', 'Fire at the enemy waters.', 'player');
    renderAll();
  }

  /* ---------- Battle ---------- */

  function describe(result, ship, who, index) {
    var where = coord(index);
    if (result === 'miss') return who + ' fired at ' + where + ' — miss.';
    if (result === 'hit') return who + ' fired at ' + where + ' — hit!';
    return who + ' fired at ' + where + ' — sunk the ' + ship.name + '!';
  }

  function onEnemyCellClick(index) {
    if (state.phase !== 'battle' || state.turn !== 'player') return;
    var shot = L.receiveShot(state.computer, index);
    if (shot.result === 'repeat' || shot.result === 'invalid') {
      setMessage('Your turn', 'You already fired at ' + coord(index) + '. Pick another square.', 'player');
      return;
    }
    state.lastShot = { board: 'enemy', index: index };
    var text = describe(shot.result, shot.ship, 'You', index);
    lastPlayerShotText = text;

    if (L.allSunk(state.computer)) {
      endGame(true, text);
      return;
    }
    state.turn = 'computer';
    setMessage("Computer's turn", text + ' The computer is aiming…', 'computer');
    renderAll();
    computerTimer = setTimeout(computerTurn, COMPUTER_DELAY_MS);
  }

  function computerTurn() {
    computerTimer = null;
    if (state.phase !== 'battle' || state.turn !== 'computer') return;
    var index = L.chooseComputerShot(state.player);
    var shot = L.receiveShot(state.player, index);
    state.lastShot = { board: 'player', index: index };
    var text = describe(shot.result, shot.ship, 'Computer', index);

    if (L.allSunk(state.player)) {
      endGame(false, text);
      return;
    }
    state.turn = 'player';
    setMessage('Your turn', lastPlayerShotText + ' ' + text, 'player');
    renderAll();
  }

  function endGame(playerWon, text) {
    state.phase = 'over';
    var shots = Object.keys(state.computer.shots).length;
    if (playerWon) {
      setMessage('You win!', text, 'player');
      els.resultTitle.textContent = 'You win!';
      els.resultText.textContent = 'You sank the entire enemy fleet in ' + shots + ' shots.';
      els.modal.className = 'modal is-win';
    } else {
      setMessage('You lose', text, 'lose');
      els.resultTitle.textContent = 'You lose';
      els.resultText.textContent = 'The computer sank your fleet. Its remaining ships are now revealed.';
      els.modal.className = 'modal is-lose';
    }
    renderAll();
    els.overlay.hidden = false;
    els.playAgain.focus();
  }

  /* ---------- Rendering ---------- */

  function renderAll() {
    els.body.className = 'phase-' + state.phase;
    renderDock();
    renderPlayerBoard();
    renderEnemyBoard();
    renderFleet(els.playerFleet, state.player);
    renderFleet(els.enemyFleet, state.computer);
  }

  function buildDock() {
    els.dock.innerHTML = '';
    L.SHIPS.forEach(function (def) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'ship-chip';
      chip.dataset.ship = def.name;
      var pips = '';
      for (var i = 0; i < def.size; i++) pips += '<i></i>';
      chip.innerHTML = '<span>' + def.name + '</span><span class="pips" aria-hidden="true">' + pips + '</span>';
      els.dock.appendChild(chip);
    });
  }

  function renderDock() {
    // Update chips in place so a focused chip keeps keyboard focus.
    var placed = placedNames();
    Array.prototype.forEach.call(els.dock.children, function (chip) {
      var name = chip.dataset.ship;
      var isPlaced = placed.indexOf(name) !== -1;
      chip.classList.toggle('is-placed', isPlaced);
      chip.classList.toggle('is-selected', state.selected === name);
      chip.disabled = isPlaced;
      chip.setAttribute('aria-pressed', String(state.selected === name));
    });
    els.rotate.textContent = 'Rotate (R): ' + (state.horizontal ? 'Horizontal' : 'Vertical');
    els.rotate.setAttribute('aria-pressed', String(!state.horizontal));
    els.start.disabled = state.player.ships.length !== L.SHIPS.length;
  }

  function sunkSet(board) {
    var set = {};
    board.ships.forEach(function (s) {
      if (L.isSunk(s)) s.cells.forEach(function (c) { set[c] = true; });
    });
    return set;
  }

  function renderPlayerBoard() {
    var preview = state.phase === 'placement' ? previewCells(hoverIndex) : null;
    var sunk = sunkSet(state.player);
    playerCells.forEach(function (cell, i) {
      var cls = 'cell';
      if (state.player.cells[i] !== null) cls += ' ship';
      var shot = state.player.shots[i];
      if (shot) cls += ' ' + shot;
      if (sunk[i]) cls += ' sunk';
      if (preview && preview.cells.indexOf(i) !== -1) cls += preview.ok ? ' preview-ok' : ' preview-bad';
      if (state.lastShot && state.lastShot.board === 'player' && state.lastShot.index === i) cls += ' just-shot';
      cell.className = cls;
      cell.disabled = state.phase !== 'placement';
      cell.setAttribute('aria-label', 'Your ' + coord(i) + cellStatus(state.player, i, sunk, true));
    });
  }

  function renderEnemyBoard() {
    var sunk = sunkSet(state.computer);
    var revealAll = state.phase === 'over';
    var active = state.phase === 'battle' && state.turn === 'player';
    els.enemyBoard.classList.toggle('is-active', active);
    enemyCells.forEach(function (cell, i) {
      var cls = 'cell';
      var shot = state.computer.shots[i];
      if (shot) cls += ' ' + shot;
      if (sunk[i]) cls += ' sunk';
      else if (revealAll && state.computer.cells[i] !== null && !shot) cls += ' ship';
      if (state.lastShot && state.lastShot.board === 'enemy' && state.lastShot.index === i) cls += ' just-shot';
      cell.className = cls;
      cell.disabled = !active || !!shot;
      cell.setAttribute('aria-label', 'Enemy ' + coord(i) + cellStatus(state.computer, i, sunk, revealAll));
    });
  }

  function cellStatus(board, i, sunk, showShips) {
    if (sunk[i]) return ', sunk';
    if (board.shots[i] === 'hit') return ', hit';
    if (board.shots[i] === 'miss') return ', miss';
    if (showShips && board.cells[i] !== null) return ', ship';
    return '';
  }

  function renderFleet(listEl, board) {
    listEl.innerHTML = '';
    L.SHIPS.forEach(function (def) {
      var li = document.createElement('li');
      var ship = null;
      board.ships.forEach(function (s) { if (s.name === def.name) ship = s; });
      li.textContent = def.name + ' (' + def.size + ')';
      if (ship && L.isSunk(ship)) {
        li.classList.add('is-sunk');
        li.textContent += ' — sunk';
      }
      listEl.appendChild(li);
    });
  }

  /* ---------- Events ---------- */

  function indexFromEvent(e) {
    var t = e.target.closest('.cell');
    return t ? Number(t.dataset.index) : null;
  }

  els.playerBoard.addEventListener('click', function (e) {
    var i = indexFromEvent(e);
    if (i !== null) onPlayerCellClick(i);
  });

  function setHover(i) {
    if (state.phase !== 'placement' || hoverIndex === i || lastPointerType !== 'mouse') return;
    hoverIndex = i;
    renderPlayerBoard();
  }

  document.addEventListener('pointerdown', function (e) { lastPointerType = e.pointerType || 'mouse'; }, true);
  document.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') lastPointerType = 'mouse'; }, true);
  els.playerBoard.addEventListener('mouseover', function (e) { setHover(indexFromEvent(e)); });
  els.playerBoard.addEventListener('focusin', function (e) { setHover(indexFromEvent(e)); });
  els.playerBoard.addEventListener('mouseleave', function () { setHover(null); });

  els.enemyBoard.addEventListener('click', function (e) {
    var i = indexFromEvent(e);
    if (i !== null) onEnemyCellClick(i);
  });

  els.dock.addEventListener('click', function (e) {
    var chip = e.target.closest('.ship-chip');
    if (!chip || chip.disabled || state.phase !== 'placement') return;
    state.selected = chip.dataset.ship;
    renderAll();
  });

  els.rotate.addEventListener('click', toggleRotate);
  els.random.addEventListener('click', randomPlacement);
  els.clear.addEventListener('click', clearPlacement);
  els.start.addEventListener('click', startBattle);
  els.newGame.addEventListener('click', newGame);
  els.playAgain.addEventListener('click', newGame);

  document.addEventListener('keydown', function (e) {
    if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey && !e.altKey) toggleRotate();
    if (e.key === 'Escape' && !els.overlay.hidden) els.overlay.hidden = true;
  });

  buildDock();
  buildBoard(els.playerBoard, playerCells, 'player');
  buildBoard(els.enemyBoard, enemyCells, 'enemy');
  newGame();
})();
