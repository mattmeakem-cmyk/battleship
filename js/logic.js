/*
 * Pure game logic for Battleship. No DOM access, so it can be unit tested.
 * Exposed as window.BattleshipLogic in the browser and module.exports in Node.
 */
(function (root) {
  'use strict';

  var SIZE = 10;
  var SHIPS = [
    { name: 'Carrier', size: 5 },
    { name: 'Battleship', size: 4 },
    { name: 'Cruiser', size: 3 },
    { name: 'Submarine', size: 3 },
    { name: 'Destroyer', size: 2 }
  ];

  function toIndex(row, col) { return row * SIZE + col; }
  function toRowCol(index) { return { row: Math.floor(index / SIZE), col: index % SIZE }; }
  function inBounds(row, col) { return row >= 0 && row < SIZE && col >= 0 && col < SIZE; }

  function createBoard() {
    return {
      cells: new Array(SIZE * SIZE).fill(null), // ship id or null
      ships: [],
      shots: {} // index -> 'hit' | 'miss'
    };
  }

  function shipCells(size, row, col, horizontal) {
    var cells = [];
    for (var i = 0; i < size; i++) {
      var r = horizontal ? row : row + i;
      var c = horizontal ? col + i : col;
      if (!inBounds(r, c)) return null;
      cells.push(toIndex(r, c));
    }
    return cells;
  }

  function canPlace(board, size, row, col, horizontal) {
    var cells = shipCells(size, row, col, horizontal);
    if (!cells) return false;
    for (var i = 0; i < cells.length; i++) {
      if (board.cells[cells[i]] !== null) return false;
    }
    return true;
  }

  function placeShip(board, shipDef, row, col, horizontal) {
    if (!canPlace(board, shipDef.size, row, col, horizontal)) return null;
    var cells = shipCells(shipDef.size, row, col, horizontal);
    var ship = {
      id: board.ships.length ? Math.max.apply(null, board.ships.map(function (s) { return s.id; })) + 1 : 0,
      name: shipDef.name,
      size: shipDef.size,
      cells: cells,
      horizontal: horizontal,
      hits: []
    };
    board.ships.push(ship);
    cells.forEach(function (idx) { board.cells[idx] = ship.id; });
    return ship;
  }

  function removeShip(board, shipId) {
    var ship = getShip(board, shipId);
    if (!ship) return null;
    ship.cells.forEach(function (idx) { board.cells[idx] = null; });
    board.ships = board.ships.filter(function (s) { return s.id !== shipId; });
    return ship;
  }

  function getShip(board, shipId) {
    for (var i = 0; i < board.ships.length; i++) {
      if (board.ships[i].id === shipId) return board.ships[i];
    }
    return null;
  }

  function placeAllRandom(board, rng) {
    rng = rng || Math.random;
    SHIPS.forEach(function (def) {
      var placed = null;
      // A legal spot always exists for a standard fleet; loop until found.
      while (!placed) {
        var horizontal = rng() < 0.5;
        var row = Math.floor(rng() * SIZE);
        var col = Math.floor(rng() * SIZE);
        placed = placeShip(board, def, row, col, horizontal);
      }
    });
    return board;
  }

  function isSunk(ship) { return ship.hits.length === ship.size; }

  /** Returns { result: 'invalid' | 'repeat' | 'miss' | 'hit' | 'sunk', ship } */
  function receiveShot(board, index) {
    if (typeof index !== 'number' || index < 0 || index >= SIZE * SIZE || index % 1 !== 0) {
      return { result: 'invalid' };
    }
    if (board.shots[index]) return { result: 'repeat' };
    var shipId = board.cells[index];
    if (shipId === null) {
      board.shots[index] = 'miss';
      return { result: 'miss' };
    }
    var ship = getShip(board, shipId);
    board.shots[index] = 'hit';
    ship.hits.push(index);
    return { result: isSunk(ship) ? 'sunk' : 'hit', ship: ship };
  }

  function allSunk(board) {
    return board.ships.length > 0 && board.ships.every(isSunk);
  }

  function neighbors(index) {
    var p = toRowCol(index);
    var out = [];
    [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (d) {
      var r = p.row + d[0], c = p.col + d[1];
      if (inBounds(r, c)) out.push(toIndex(r, c));
    });
    return out;
  }

  /**
   * Computer opponent: hunt randomly, then target around hits that do not yet
   * belong to a sunk ship. When two or more hits line up, keep firing along
   * that line before trying other neighbours.
   */
  function chooseComputerShot(board, rng) {
    rng = rng || Math.random;
    var unshot = function (i) { return !board.shots[i]; };
    var pick = function (list) { return list[Math.floor(rng() * list.length)]; };

    var sunkCells = {};
    board.ships.forEach(function (s) {
      if (isSunk(s)) s.cells.forEach(function (c) { sunkCells[c] = true; });
    });
    var openHits = Object.keys(board.shots)
      .map(Number)
      .filter(function (i) { return board.shots[i] === 'hit' && !sunkCells[i]; });
    var isOpenHit = {};
    openHits.forEach(function (i) { isOpenHit[i] = true; });

    if (openHits.length) {
      // 1) Extend lines of 2+ adjacent open hits.
      var lineTargets = [];
      openHits.forEach(function (i) {
        var p = toRowCol(i);
        [[0, 1], [1, 0]].forEach(function (d) {
          var nr = p.row + d[0], nc = p.col + d[1];
          if (!inBounds(nr, nc) || !isOpenHit[toIndex(nr, nc)]) return;
          // Walk to both ends of this line.
          [1, -1].forEach(function (dir) {
            var r = p.row, c = p.col;
            while (inBounds(r, c) && isOpenHit[toIndex(r, c)]) { r += d[0] * dir; c += d[1] * dir; }
            if (inBounds(r, c) && unshot(toIndex(r, c))) lineTargets.push(toIndex(r, c));
          });
        });
      });
      if (lineTargets.length) return pick(lineTargets);

      // 2) Any unshot neighbour of an open hit.
      var adj = [];
      openHits.forEach(function (i) {
        neighbors(i).forEach(function (n) { if (unshot(n)) adj.push(n); });
      });
      if (adj.length) return pick(adj);
    }

    // 3) Hunt: random unshot square.
    var remaining = [];
    for (var i = 0; i < SIZE * SIZE; i++) if (unshot(i)) remaining.push(i);
    return remaining.length ? pick(remaining) : -1;
  }

  var api = {
    SIZE: SIZE,
    SHIPS: SHIPS,
    toIndex: toIndex,
    toRowCol: toRowCol,
    createBoard: createBoard,
    canPlace: canPlace,
    placeShip: placeShip,
    removeShip: removeShip,
    getShip: getShip,
    placeAllRandom: placeAllRandom,
    receiveShot: receiveShot,
    isSunk: isSunk,
    allSunk: allSunk,
    neighbors: neighbors,
    chooseComputerShot: chooseComputerShot
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BattleshipLogic = api;
})(this);
