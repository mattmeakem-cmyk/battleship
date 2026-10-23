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

  var DIFFICULTIES = ['easy', 'medium', 'hard'];
  var EASY_CLUSTER_CHANCE = 0.6;
  var EASY_CLUSTER_RADIUS = 2;

  /**
   * Computer opponent. difficulty is 'easy', 'medium' (default) or 'hard'.
   * Medium: spread-out search (see chooseHuntShot), then target around hits that
   * do not yet belong to a sunk ship. When two or more hits line up, keep firing
   * along that line before trying other neighbours.
   */
  function chooseComputerShot(board, rng, difficulty) {
    rng = rng || Math.random;
    if (difficulty === 'easy') return chooseEasyShot(board, rng);
    if (difficulty === 'hard') return chooseHardShot(board, rng);
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

    // 3) Hunt: no open hits, so search for the next ship.
    return chooseHuntShot(board, rng, unshot);
  }

  /**
   * Search shots that spread across the board instead of clustering:
   * - skip squares where no remaining ship could fit (e.g. small gaps between misses)
   * - only fire on a diagonal grid spaced by the smallest remaining ship, so every
   *   ship must cross it (a checkerboard while the Destroyer is afloat)
   * - pick randomly, weighted towards open areas where more ship placements fit,
   *   so the computer plays sensibly without always taking the best square
   */
  function chooseHuntShot(board, rng, unshot) {
    var sizes = board.ships.filter(function (s) { return !isSunk(s); }).map(function (s) { return s.size; });
    if (!sizes.length) sizes = SHIPS.map(function (s) { return s.size; });
    var density = new Array(SIZE * SIZE).fill(0);
    sizes.forEach(function (size) {
      for (var r = 0; r < SIZE; r++) {
        for (var c = 0; c < SIZE; c++) {
          [true, false].forEach(function (horizontal) {
            var cells = shipCells(size, r, c, horizontal);
            if (cells && cells.every(unshot)) cells.forEach(function (i) { density[i]++; });
          });
        }
      }
    });

    var minSize = Math.min.apply(null, sizes);
    if (board.aiParity === undefined) board.aiParity = Math.floor(rng() * SIZE);
    var onGrid = function (i) {
      var p = toRowCol(i);
      return (p.row + p.col) % minSize === board.aiParity % minSize;
    };

    var possible = [];
    for (var i = 0; i < SIZE * SIZE; i++) if (unshot(i) && density[i] > 0) possible.push(i);
    var grid = possible.filter(onGrid);
    var candidates = grid.length ? grid : possible;
    if (!candidates.length) {
      for (var j = 0; j < SIZE * SIZE; j++) if (unshot(j)) candidates.push(j);
      return candidates.length ? candidates[Math.floor(rng() * candidates.length)] : -1;
    }
    return weightedPick(candidates, function (i) { return density[i]; }, rng);
  }

  function openHitInfo(board) {
    var sunk = {};
    board.ships.forEach(function (s) {
      if (isSunk(s)) s.cells.forEach(function (c) { sunk[c] = true; });
    });
    var hits = Object.keys(board.shots)
      .map(Number)
      .filter(function (i) { return board.shots[i] === 'hit' && !sunk[i]; });
    var isOpen = {};
    hits.forEach(function (i) { isOpen[i] = true; });
    return { hits: hits, isOpen: isOpen, sunk: sunk };
  }

  function remainingSizes(board) {
    var sizes = board.ships.filter(function (s) { return !isSunk(s); }).map(function (s) { return s.size; });
    return sizes.length ? sizes : SHIPS.map(function (s) { return s.size; });
  }

  function unshotCells(board, keep) {
    var out = [];
    for (var i = 0; i < SIZE * SIZE; i++) if (!board.shots[i] && (!keep || keep(i))) out.push(i);
    return out;
  }

  /**
   * Easy: after a hit it fires at a random square next to it, but never works out
   * which way the ship runs. While searching it often fires within a couple of
   * squares of an earlier shot, so its shots bunch up, and otherwise fires anywhere.
   */
  function chooseEasyShot(board, rng) {
    var pick = function (list) { return list.length ? list[Math.floor(rng() * list.length)] : -1; };
    var info = openHitInfo(board);
    var adj = [];
    info.hits.forEach(function (i) {
      neighbors(i).forEach(function (n) { if (!board.shots[n]) adj.push(n); });
    });
    if (adj.length) return pick(adj);

    var shots = Object.keys(board.shots).map(Number);
    if (shots.length && rng() < EASY_CLUSTER_CHANCE) {
      var a = toRowCol(pick(shots));
      var near = unshotCells(board, function (i) {
        var p = toRowCol(i);
        return Math.abs(p.row - a.row) <= EASY_CLUSTER_RADIUS && Math.abs(p.col - a.col) <= EASY_CLUSTER_RADIUS;
      });
      if (near.length) return pick(near);
    }
    return pick(unshotCells(board));
  }

  /**
   * Hard: scores every unshot square by how many ways the remaining ships could
   * still lie across it, avoiding misses and sunk ships, and fires at the best one.
   * After a hit it only counts ship positions that pass through the unsunk hits,
   * favouring positions that cover more of them, so it finds the ship's direction
   * quickly. While searching it stays on the same spaced grid as Medium.
   */
  function chooseHardShot(board, rng) {
    var info = openHitInfo(board);
    var targeting = info.hits.length > 0;
    var blocked = function (i) { return board.shots[i] === 'miss' || info.sunk[i]; };
    var sizes = remainingSizes(board);
    var score = new Array(SIZE * SIZE).fill(0);
    sizes.forEach(function (size) {
      for (var r = 0; r < SIZE; r++) {
        for (var c = 0; c < SIZE; c++) {
          [true, false].forEach(function (horizontal) {
            var cells = shipCells(size, r, c, horizontal);
            if (!cells || cells.some(blocked)) return;
            var covered = cells.filter(function (i) { return info.isOpen[i]; }).length;
            if (targeting && !covered) return;
            var weight = targeting ? Math.pow(20, covered) : 1;
            cells.forEach(function (i) { if (!board.shots[i]) score[i] += weight; });
          });
        }
      }
    });

    var candidates = unshotCells(board, function (i) { return score[i] > 0; });
    if (!targeting) {
      var minSize = Math.min.apply(null, sizes);
      if (board.aiParity === undefined) board.aiParity = Math.floor(rng() * SIZE);
      var grid = candidates.filter(function (i) {
        var p = toRowCol(i);
        return (p.row + p.col) % minSize === board.aiParity % minSize;
      });
      if (grid.length) candidates = grid;
    }
    if (!candidates.length) return chooseComputerShot(board, rng, 'medium');
    var best = Math.max.apply(null, candidates.map(function (i) { return score[i]; }));
    var top = candidates.filter(function (i) { return score[i] === best; });
    return top[Math.floor(rng() * top.length)];
  }

  function weightedPick(list, weightOf, rng) {
    var total = 0;
    var weights = list.map(function (i) { var w = weightOf(i); total += w; return w; });
    var roll = rng() * total;
    for (var k = 0; k < list.length; k++) {
      roll -= weights[k];
      if (roll < 0) return list[k];
    }
    return list[list.length - 1];
  }

  var api = {
    SIZE: SIZE,
    SHIPS: SHIPS,
    DIFFICULTIES: DIFFICULTIES,
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
