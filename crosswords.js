(function () {
  var root = document.getElementById("crossword");
  var list = document.getElementById("puzzle-list");
  var intro = document.getElementById("cw-intro");
  var gate = document.getElementById("cw-gate");
  if (!root) return;

  // Supabase project URL and anon public key (Project Settings → API).
  var LEADERBOARD = {
    url: "https://fxjejwkmskzsvreagcmr.supabase.co",
    key: "sb_publishable_FaSzIso4MiscMKsP8zviIA_20STuCdg"
  };

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var STORE = "leo-crossword-";
  var NAME_KEY = "leo-crossword-player";
  var UNLOCK_KEY = "leo-crossword-unlocked";
  var PASSWORD = "donquavius";
  var DIRS = ["across", "down"];

  var playerName = "";
  var unlocked = false;
  try {
    playerName = localStorage.getItem(NAME_KEY) || "";
    unlocked = localStorage.getItem(UNLOCK_KEY) === "1";
  } catch (err) {}

  var puzzles = [];
  var puzzle = null;
  var model = null;
  var active = null;
  var dir = "across";
  var seconds = 0;
  var started = false;
  var solved = false;
  var ticker = null;
  var ui = {};

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function formatDate(iso) {
    var p = String(iso || "").split("-");
    if (p.length !== 3) return iso || "";
    return MONTHS[Number(p[1]) - 1] + " " + Number(p[2]) + ", " + p[0];
  }

  function setClue(node, text) {
    node.textContent = "";
    String(text || "")
      .split(/(_+)/)
      .forEach(function (part) {
        if (!part) return;
        if (part.charAt(0) !== "_") return node.appendChild(document.createTextNode(part));
        var blank = el("span", "cw-blank");
        blank.setAttribute("role", "img");
        blank.setAttribute("aria-label", "blank, " + part.length + (part.length === 1 ? " letter" : " letters"));
        for (var i = 0; i < part.length; i++) blank.appendChild(el("span", "cw-blank-letter"));
        node.appendChild(blank);
      });
  }

  function clock(total) {
    var m = Math.floor(total / 60);
    var s = total % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function load(id) {
    try {
      return JSON.parse(localStorage.getItem(STORE + id)) || null;
    } catch (err) {
      return null;
    }
  }

  function save() {
    if (!puzzle) return;
    var letters = model.cells
      .map(function (cell) {
        return cell.block ? "#" : cell.letter || ".";
      })
      .join("");
    try {
      localStorage.setItem(
        STORE + puzzle.id,
        JSON.stringify({ letters: letters, seconds: seconds, solved: solved })
      );
    } catch (err) {}
  }

  function buildModel(p) {
    var rows = p.grid.length;
    var cols = p.grid.reduce(function (most, row) {
      return Math.max(most, row.length);
    }, 0);
    var cells = [];
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var ch = (p.grid[r][c] || "#").toUpperCase();
        cells.push({ r: r, c: c, block: ch === "#", answer: ch, letter: "", num: 0 });
      }
    }
    function at(r, c) {
      if (r < 0 || c < 0 || r >= rows || c >= cols) return null;
      return cells[r * cols + c];
    }
    function open(r, c) {
      var cell = at(r, c);
      return Boolean(cell && !cell.block);
    }

    var words = { across: [], down: [] };
    var n = 0;
    cells.forEach(function (cell) {
      if (cell.block) return;
      var startsAcross = !open(cell.r, cell.c - 1) && open(cell.r, cell.c + 1);
      var startsDown = !open(cell.r - 1, cell.c) && open(cell.r + 1, cell.c);
      if (!startsAcross && !startsDown) return;
      n += 1;
      cell.num = n;
      DIRS.forEach(function (d) {
        if (d === "across" ? !startsAcross : !startsDown) return;
        var clues = (p.clues && p.clues[d]) || {};
        var word = { dir: d, num: n, clue: clues[n] || clues[String(n)] || "", cells: [] };
        var r = cell.r;
        var c = cell.c;
        while (open(r, c)) {
          var part = at(r, c);
          part[d] = word;
          word.cells.push(part);
          if (d === "across") c += 1;
          else r += 1;
        }
        words[d].push(word);
      });
    });

    DIRS.forEach(function (d) {
      words[d].forEach(function (word) {
        word.refs = [];
        var pattern = /(\d+)\s*-\s*(across|down)\b/gi;
        var match;
        while ((match = pattern.exec(word.clue))) {
          var target = words[match[2].toLowerCase()].filter(function (w) {
            return w.num === Number(match[1]);
          })[0];
          if (target && target !== word && word.refs.indexOf(target) < 0) word.refs.push(target);
        }
      });
    });

    return { rows: rows, cols: cols, cells: cells, words: words, at: at };
  }

  function allWords() {
    return model.words.across.concat(model.words.down);
  }

  function firstEmpty(word) {
    for (var i = 0; i < word.cells.length; i++) {
      if (!word.cells[i].letter) return word.cells[i];
    }
    return null;
  }

  function render() {
    root.innerHTML = "";
    root.classList.toggle("is-solved", solved);
    root.style.setProperty("--cols", model.cols);

    var back = el("a", "cw-back", "All minis");
    back.href = "#";
    back.insertBefore(arrowIcon(), back.firstChild);
    root.appendChild(back);

    var head = el("div", "cw-head");
    var titles = el("div", "cw-titles");
    titles.appendChild(el("h2", "cw-title", puzzle.title || "Mini"));
    titles.appendChild(el("span", "cw-date", formatDate(puzzle.date)));
    head.appendChild(titles);
    ui.timer = el("span", "cw-timer", clock(seconds));
    head.appendChild(ui.timer);
    root.appendChild(head);

    ui.bar = el("div", "cw-bar");
    ui.barNum = el("span", "cw-bar-num");
    ui.barText = el("span", "cw-bar-text");
    ui.bar.appendChild(ui.barNum);
    ui.bar.appendChild(ui.barText);
    var stage = el("div", "cw-stage");
    stage.appendChild(ui.bar);

    var body = el("div", "cw-body");
    var board = el("div", "cw-board");
    ui.grid = el("div", "cw-grid");
    model.cells.forEach(function (cell) {
      var node = el("div", "cw-cell" + (cell.block ? " is-block" : ""));
      if (!cell.block) {
        if (cell.num) node.appendChild(el("span", "cw-num", String(cell.num)));
        cell.letterEl = el("span", "cw-letter", cell.letter);
        node.appendChild(cell.letterEl);
        node.addEventListener("mousedown", function (event) {
          event.preventDefault();
        });
        node.addEventListener("click", function () {
          if (cell === active && cell.across && cell.down) {
            select(cell, dir === "across" ? "down" : "across");
          } else {
            select(cell, cell[dir] ? dir : dir === "across" ? "down" : "across");
          }
          focusInput();
        });
      }
      cell.el = node;
      ui.grid.appendChild(node);
    });
    board.appendChild(ui.grid);

    ui.input = el("input", "cw-input");
    ui.input.type = "text";
    ui.input.value = " ";
    ui.input.setAttribute("autocomplete", "off");
    ui.input.setAttribute("autocorrect", "off");
    ui.input.setAttribute("autocapitalize", "characters");
    ui.input.setAttribute("spellcheck", "false");
    ui.input.setAttribute("enterkeyhint", "next");
    ui.input.addEventListener("keydown", onKey);
    ui.input.addEventListener("input", onInput);
    board.appendChild(ui.input);
    body.appendChild(board);

    var clues = el("div", "cw-clues");
    DIRS.forEach(function (d) {
      if (!model.words[d].length) return;
      var group = el("div", "cw-clue-group");
      group.appendChild(el("h3", "", d === "across" ? "Across" : "Down"));
      var ol = el("ol");
      model.words[d].forEach(function (word) {
        var li = el("li");
        var button = el("button", "cw-clue");
        button.type = "button";
        button.appendChild(el("span", "cw-clue-num", String(word.num)));
        var text = el("span", "cw-clue-text");
        setClue(text, word.clue);
        button.appendChild(text);
        button.addEventListener("mousedown", function (event) {
          event.preventDefault();
        });
        button.addEventListener("click", function () {
          select(firstEmpty(word) || word.cells[0], word.dir);
          focusInput();
        });
        word.clueEl = button;
        li.appendChild(button);
        ol.appendChild(li);
      });
      group.appendChild(ol);
      clues.appendChild(group);
    });
    body.appendChild(clues);
    stage.appendChild(body);

    var actions = el("div", "cw-actions");
    var check = el("button", "cw-action", "Check");
    check.type = "button";
    check.addEventListener("click", checkLetters);
    var clear = el("button", "cw-action", "Clear");
    clear.type = "button";
    clear.addEventListener("click", clearPuzzle);
    ui.status = el("p", "cw-status");
    actions.appendChild(check);
    actions.appendChild(clear);
    actions.appendChild(ui.status);
    stage.appendChild(actions);

    if (!solved) {
      var resuming =
        seconds > 0 ||
        model.cells.some(function (cell) {
          return cell.letter;
        });
      ui.cover = el("div", "cw-cover");
      ui.cover.appendChild(el("p", "cw-cover-title", resuming ? "Welcome back" : "Ready?"));
      ui.cover.appendChild(
        el(
          "p",
          "cw-cover-text",
          resuming
            ? "Your puzzle is paused at " + clock(seconds) + "."
            : model.words.across.length +
                " across, " +
                model.words.down.length +
                " down. The timer starts when you do."
        )
      );
      var startButton = el("button", "cw-action cw-cover-go", resuming ? "Continue" : "Start");
      startButton.type = "button";
      startButton.addEventListener("click", begin);
      ui.cover.appendChild(startButton);
      stage.appendChild(ui.cover);
      root.classList.add("is-covered");
    } else {
      ui.cover = null;
      root.classList.remove("is-covered");
    }
    root.appendChild(stage);

    var leaders = el("section", "cw-leaderboard");
    var leadersHead = el("div", "cw-leaderboard-head");
    leadersHead.appendChild(el("h3", "", "Leaderboard"));
    leadersHead.appendChild(el("span", "cw-leaderboard-you", "Playing as " + playerName));
    leaders.appendChild(leadersHead);
    ui.board = el("div", "cw-leaderboard-body");
    leaders.appendChild(ui.board);
    root.appendChild(leaders);

    root.hidden = false;
    if (solved) ui.status.textContent = "Solved in " + clock(seconds) + ".";
  }

  function select(cell, d) {
    if (!cell || cell.block) return;
    if (!cell[d]) d = d === "across" ? "down" : "across";
    if (!cell[d]) return;
    active = cell;
    dir = d;
    var word = cell[d];
    var other = cell[d === "across" ? "down" : "across"];

    var refCells = [];
    word.refs.forEach(function (ref) {
      refCells = refCells.concat(ref.cells);
    });
    model.cells.forEach(function (c) {
      if (!c.el) return;
      c.el.classList.toggle("is-active", c === cell);
      c.el.classList.toggle("in-word", c !== cell && word.cells.indexOf(c) >= 0);
      c.el.classList.toggle("is-ref", refCells.indexOf(c) >= 0);
    });
    allWords().forEach(function (w) {
      if (!w.clueEl) return;
      w.clueEl.classList.toggle("is-active", w === word);
      w.clueEl.classList.toggle("is-cross", w === other);
    });

    ui.barNum.textContent = word.num + (d === "across" ? "A" : "D");
    setClue(ui.barText, word.clue);
    ui.input.setAttribute(
      "aria-label",
      word.num + " " + d + ": " + word.clue.replace(/_+/g, "blank") + ", " + word.cells.length + " letters"
    );
    ui.input.style.left = cell.el.offsetLeft + "px";
    ui.input.style.top = cell.el.offsetTop + "px";
  }

  function covered() {
    return Boolean(ui.cover);
  }

  function begin() {
    if (!ui.cover) return;
    ui.cover.remove();
    ui.cover = null;
    root.classList.remove("is-covered");
    var first = allWords()[0];
    if (!active && first) select(firstEmpty(first) || first.cells[0], first.dir);
    else if (active) select(active, dir);
    startTimer();
    focusInput();
  }

  function focusInput() {
    if (!ui.input) return;
    try {
      ui.input.focus({ preventScroll: true });
    } catch (err) {
      ui.input.focus();
    }
  }

  function setLetter(cell, letter) {
    cell.letter = letter;
    cell.letterEl.textContent = letter;
    cell.el.classList.remove("is-wrong");
  }

  function startTimer() {
    if (started || solved) return;
    started = true;
    ticker = setInterval(function () {
      if (solved || document.visibilityState !== "visible") return;
      seconds += 1;
      ui.timer.textContent = clock(seconds);
      if (seconds % 5 === 0) save();
    }, 1000);
  }

  function stopTimer() {
    clearInterval(ticker);
    ticker = null;
    started = false;
  }

  function type(letter) {
    if (!active || solved) return;
    startTimer();
    setLetter(active, letter);
    ui.status.textContent = "";
    if (finish()) return;

    var word = active[dir];
    var idx = word.cells.indexOf(active);
    for (var i = idx + 1; i < word.cells.length; i++) {
      if (!word.cells[i].letter) return select(word.cells[i], dir);
    }
    var gap = firstEmpty(word);
    if (gap) return select(gap, dir);
    if (idx < word.cells.length - 1) return select(word.cells[idx + 1], dir);
    nextClue(1);
  }

  function backspace() {
    if (!active || solved) return;
    if (active.letter) {
      setLetter(active, "");
    } else {
      var word = active[dir];
      var idx = word.cells.indexOf(active);
      if (idx > 0) {
        select(word.cells[idx - 1], dir);
      } else {
        var words = allWords();
        var prev = words[(words.indexOf(word) - 1 + words.length) % words.length];
        select(prev.cells[prev.cells.length - 1], prev.dir);
      }
      setLetter(active, "");
    }
    save();
  }

  function move(dr, dc) {
    var r = active.r + dr;
    var c = active.c + dc;
    var cell = model.at(r, c);
    while (cell && cell.block) {
      r += dr;
      c += dc;
      cell = model.at(r, c);
    }
    if (cell) select(cell, dir);
  }

  function nextClue(step) {
    var words = allWords();
    var idx = words.indexOf(active[dir]);
    for (var i = 1; i <= words.length; i++) {
      var word = words[(idx + step * i + words.length * 2) % words.length];
      var gap = firstEmpty(word);
      if (gap) return select(gap, word.dir);
    }
    var next = words[(idx + step + words.length) % words.length];
    select(next.cells[0], next.dir);
  }

  function onKey(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    var key = event.key;
    var handled = true;
    if (key === "ArrowLeft" || key === "ArrowRight") {
      if (dir !== "across" && active.across) select(active, "across");
      else move(0, key === "ArrowLeft" ? -1 : 1);
    } else if (key === "ArrowUp" || key === "ArrowDown") {
      if (dir !== "down" && active.down) select(active, "down");
      else move(key === "ArrowUp" ? -1 : 1, 0);
    } else if (key === "Backspace") {
      backspace();
    } else if (key === "Delete") {
      if (active && !solved) {
        setLetter(active, "");
        save();
      }
    } else if (key === "Tab") {
      nextClue(event.shiftKey ? -1 : 1);
    } else if (key === "Enter") {
      nextClue(1);
    } else if (key === " ") {
      select(active, dir === "across" ? "down" : "across");
    } else if (/^[a-z]$/i.test(key)) {
      type(key.toUpperCase());
    } else {
      handled = false;
    }
    if (handled) event.preventDefault();
  }

  function onInput() {
    var value = ui.input.value;
    ui.input.value = " ";
    if (value === "") return backspace();
    var letters = value.replace(/[^a-z]/gi, "");
    if (letters) type(letters[letters.length - 1].toUpperCase());
  }

  function finish() {
    var open = model.cells.filter(function (cell) {
      return !cell.block;
    });
    var full = open.every(function (cell) {
      return cell.letter;
    });
    if (!full) {
      save();
      return false;
    }
    var right = open.every(function (cell) {
      return cell.letter === cell.answer;
    });
    if (!right) {
      ui.status.textContent = "Not quite. Something's off.";
      save();
      return false;
    }
    solved = true;
    stopTimer();
    root.classList.add("is-solved");
    model.cells.forEach(function (cell) {
      if (cell.el) cell.el.classList.remove("is-active", "in-word", "is-ref", "is-wrong");
    });
    allWords().forEach(function (word) {
      if (word.clueEl) word.clueEl.classList.remove("is-active", "is-cross");
    });
    ui.status.textContent = "Solved in " + clock(seconds) + ".";
    ui.barNum.textContent = "";
    ui.barText.textContent = "You got it! Nice work.";
    if (ui.input) ui.input.blur();
    save();
    celebrate();
    var solvedPuzzle = puzzle;
    submitTime(solvedPuzzle, seconds).then(function () {
      if (puzzle === solvedPuzzle) loadBoard(solvedPuzzle);
    });
    return true;
  }

  function celebrate() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    var cells = model.cells;
    cells.forEach(function (cell) {
      if (cell.block || !cell.el) return;
      cell.el.style.setProperty("--i", cell.r + cell.c);
      cell.el.classList.add("is-cheering");
    });
    setTimeout(function () {
      cells.forEach(function (cell) {
        if (cell.el) cell.el.classList.remove("is-cheering");
      });
    }, 1600);

    var canvas = el("canvas", "cw-confetti");
    canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(canvas);
    var ctx = canvas.getContext("2d");
    var scale = window.devicePixelRatio || 1;
    var W = window.innerWidth;
    var H = window.innerHeight;
    canvas.width = Math.round(W * scale);
    canvas.height = Math.round(H * scale);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    var colors = [
      "hsl(44, 80%, 55%)",
      "hsl(348, 70%, 60%)",
      "hsl(22, 75%, 56%)",
      "hsl(142, 45%, 46%)",
      "hsl(205, 80%, 58%)"
    ];
    var box = ui.grid.getBoundingClientRect();
    var pieces = [];
    function burst(count, spread) {
      for (var i = 0; i < count; i++) {
        var angle = -Math.PI / 2 + (Math.random() - 0.5) * spread;
        var speed = 380 + Math.random() * 520;
        pieces.push({
          x: box.left + box.width * (0.2 + Math.random() * 0.6),
          y: box.top + box.height * 0.45,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          w: 5 + Math.random() * 5,
          h: 3 + Math.random() * 3,
          spin: (Math.random() - 0.5) * 14,
          turn: Math.random() * Math.PI,
          flip: Math.random() * Math.PI,
          color: colors[Math.floor(Math.random() * colors.length)],
          age: 0,
          life: 2.2 + Math.random() * 1.2
        });
      }
    }
    burst(110, 2.2);
    setTimeout(function () {
      burst(70, 1.6);
    }, 220);

    var last = null;
    function frame(now) {
      var dt = last === null ? 0 : Math.min((now - last) / 1000, 0.05);
      last = now;
      ctx.clearRect(0, 0, W, H);
      pieces = pieces.filter(function (p) {
        p.age += dt;
        p.vy += 900 * dt;
        p.vx *= Math.exp(-1.6 * dt);
        p.vy *= Math.exp(-0.9 * dt);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.turn += p.spin * dt;
        p.flip += 6 * dt;
        ctx.save();
        ctx.globalAlpha = Math.min(1, (p.life - p.age) / 0.5);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.turn);
        ctx.scale(1, Math.cos(p.flip));
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
        return p.age < p.life && p.y < H + 40;
      });
      if (pieces.length) requestAnimationFrame(frame);
      else canvas.remove();
    }
    requestAnimationFrame(frame);
  }

  function checkLetters() {
    if (solved) return;
    var wrong = 0;
    model.cells.forEach(function (cell) {
      if (cell.block || !cell.letter) return;
      var bad = cell.letter !== cell.answer;
      cell.el.classList.toggle("is-wrong", bad);
      if (bad) wrong += 1;
    });
    ui.status.textContent = wrong
      ? wrong + (wrong === 1 ? " square is" : " squares are") + " wrong."
      : "So far so good.";
  }

  function clearPuzzle() {
    model.cells.forEach(function (cell) {
      if (!cell.block) setLetter(cell, "");
    });
    stopTimer();
    seconds = 0;
    solved = false;
    root.classList.remove("is-solved");
    ui.timer.textContent = clock(0);
    ui.status.textContent = "";
    try {
      localStorage.removeItem(STORE + puzzle.id);
    } catch (err) {}
    var first = allWords()[0];
    if (first) select(first.cells[0], first.dir);
  }

  function open(p) {
    stopTimer();
    puzzle = p;
    model = buildModel(p);
    var saved = load(p.id);
    seconds = 0;
    solved = false;
    if (saved && typeof saved.letters === "string") {
      model.cells.forEach(function (cell, i) {
        var ch = saved.letters[i];
        if (!cell.block && ch && ch !== "." && ch !== "#") cell.letter = ch;
      });
      seconds = saved.seconds || 0;
      solved = Boolean(saved.solved);
    }
    render();
    var words = allWords();
    var first = words[0];
    var gapWord = words.filter(firstEmpty)[0];
    if (first && !solved) {
      if (gapWord) select(firstEmpty(gapWord), gapWord.dir);
      else select(first.cells[0], first.dir);
    } else if (first) {
      active = null;
      ui.barNum.textContent = "";
      ui.barText.textContent = "Nice work.";
    }
    if (list) list.hidden = true;
    if (gate) gate.hidden = true;
    loadBoard(p);
    if (intro) {
      intro.textContent = solved
        ? "Solved. Check where you landed on the leaderboard."
        : "Press start when you're ready. Then just type: arrows move, space flips direction, tab jumps to the next clue.";
    }
    document.title = (p.title || "Mini") + " — Crosswords — Leo S. Feng";
  }

  function leave() {
    if (!puzzle) return;
    stopTimer();
    save();
    puzzle = null;
    model = null;
    active = null;
  }

  function arrowIcon() {
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.4");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    ["M13.5 8H2.8", "M7 3.6L2.6 8L7 12.4"].forEach(function (d) {
      var path = document.createElementNS(ns, "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    });
    return svg;
  }

  function progressOf(p) {
    var m = buildModel(p);
    var saved = load(p.id) || {};
    var letters = typeof saved.letters === "string" ? saved.letters : "";
    var total = 0;
    var filled = 0;
    var map = m.cells.map(function (cell, i) {
      if (cell.block) return "#";
      total += 1;
      var ch = letters[i];
      if (ch && ch !== "." && ch !== "#") {
        filled += 1;
        return ch;
      }
      return "";
    });
    return {
      model: m,
      map: map,
      total: total,
      filled: filled,
      seconds: saved.seconds || 0,
      solved: Boolean(saved.solved)
    };
  }

  function boardReady() {
    return Boolean(LEADERBOARD.url && LEADERBOARD.key);
  }

  function boardFetch(path, options) {
    options = options || {};
    var headers = {
      apikey: LEADERBOARD.key,
      Authorization: "Bearer " + LEADERBOARD.key
    };
    if (options.body) headers["Content-Type"] = "application/json";
    if (options.prefer) headers.Prefer = options.prefer;
    return fetch(LEADERBOARD.url.replace(/\/+$/, "") + "/rest/v1/" + path, {
      method: options.method || "GET",
      headers: headers,
      body: options.body
    });
  }

  function boardNote(text) {
    if (!ui.board) return;
    ui.board.innerHTML = "";
    ui.board.appendChild(el("p", "cw-leaderboard-note", text));
  }

  function loadBoard(p) {
    if (!boardReady()) return boardNote("The leaderboard isn't set up yet.");
    boardNote("Loading…");
    boardFetch(
      "crossword_times?select=name,seconds&puzzle_id=eq." +
        encodeURIComponent(p.id) +
        "&order=seconds.asc,created_at.asc&limit=10"
    )
      .then(function (res) {
        if (!res.ok) throw new Error(res.status);
        return res.json();
      })
      .then(function (rows) {
        if (puzzle === p) renderBoard(rows);
      })
      .catch(function () {
        if (puzzle === p) boardNote("Couldn't load the leaderboard.");
      });
  }

  function renderBoard(rows) {
    if (!rows.length) return boardNote("No solves yet. Be the first.");
    ui.board.innerHTML = "";
    var ol = el("ol", "cw-leaderboard-list");
    var me = playerName.toLowerCase();
    rows.forEach(function (row, i) {
      var li = el("li", String(row.name).toLowerCase() === me ? "is-you" : "");
      li.appendChild(el("span", "cw-rank", String(i + 1)));
      li.appendChild(el("span", "cw-rank-name", row.name));
      li.appendChild(el("span", "cw-rank-time", clock(row.seconds)));
      ol.appendChild(li);
    });
    ui.board.appendChild(ol);
  }

  function submitTime(p, secs) {
    if (!boardReady() || !playerName) return Promise.resolve();
    return boardFetch("crossword_times", {
      method: "POST",
      prefer: "return=minimal",
      body: JSON.stringify({ puzzle_id: p.id, name: playerName, seconds: secs })
    }).catch(function () {});
  }

  function showGate() {
    leave();
    root.hidden = true;
    root.innerHTML = "";
    if (list) list.hidden = true;
    if (!gate) return;
    gate.hidden = false;
    gate.innerHTML = "";
    if (intro) {
      intro.textContent = unlocked
        ? "Mini crosswords I make for fun. Enter your name so your times can go on the leaderboard."
        : "Mini crosswords I make for fun. Enter your name and the password to play.";
    }
    document.title = "Crosswords — Leo S. Feng";

    var form = el("form", "cw-gate-form");
    var label = el("label", "cw-gate-label", "Your name");
    label.htmlFor = "cw-gate-name";
    var input = el("input", "cw-gate-input");
    input.id = "cw-gate-name";
    input.type = "text";
    input.maxLength = 24;
    input.autocomplete = "nickname";
    input.placeholder = "e.g. Edison";
    input.value = playerName;
    var go = el("button", "cw-action cw-gate-go", "Let's play");
    go.type = "submit";
    form.appendChild(label);

    var secret = null;
    if (unlocked) {
      var row = el("div", "cw-gate-row");
      row.appendChild(input);
      row.appendChild(go);
      form.appendChild(row);
    } else {
      form.appendChild(input);
      var secretLabel = el("label", "cw-gate-label cw-gate-label-gap", "Password");
      secretLabel.htmlFor = "cw-gate-password";
      secret = el("input", "cw-gate-input");
      secret.id = "cw-gate-password";
      secret.type = "password";
      secret.autocomplete = "current-password";
      var secretRow = el("div", "cw-gate-row");
      secretRow.appendChild(secret);
      secretRow.appendChild(go);
      form.appendChild(secretLabel);
      form.appendChild(secretRow);
    }

    var error = el("p", "cw-gate-error");
    form.appendChild(error);
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var name = input.value.replace(/\s+/g, " ").trim().slice(0, 24);
      if (!name) {
        error.textContent = "Type a name first.";
        input.focus();
        return;
      }
      if (secret && secret.value.trim().toLowerCase() !== PASSWORD) {
        error.textContent = secret.value ? "That's not the password." : "Enter the password.";
        secret.value = "";
        secret.focus();
        return;
      }
      playerName = name;
      unlocked = true;
      try {
        localStorage.setItem(NAME_KEY, name);
        localStorage.setItem(UNLOCK_KEY, "1");
      } catch (err) {}
      gate.hidden = true;
      route();
    });
    gate.appendChild(form);
    (playerName && secret ? secret : input).focus();
  }

  function showList() {
    leave();
    root.hidden = true;
    root.innerHTML = "";
    if (gate) gate.hidden = true;
    if (intro) intro.textContent = "Mini crosswords I make for fun. Pick one to play.";
    document.title = "Crosswords — Leo S. Feng";
    renderList();
  }

  function renderList() {
    if (!list) return;
    list.innerHTML = "";
    list.hidden = false;

    var stats = puzzles.map(progressOf);
    var done = stats.filter(function (s) {
      return s.solved;
    }).length;
    var title = el("h2", "chart-title cw-picks-title");
    title.appendChild(el("span", "", "Minis"));
    title.appendChild(el("span", "", done + " of " + puzzles.length + " solved"));
    list.appendChild(title);

    var player = el("p", "cw-player", "Playing as ");
    player.appendChild(el("strong", "", playerName));
    var change = el("button", "cw-player-change", "Change");
    change.type = "button";
    change.addEventListener("click", showGate);
    player.appendChild(change);
    list.insertBefore(player, title);

    var ul = el("ul", "cw-picks");
    puzzles.forEach(function (p, idx) {
      var s = stats[idx];
      var started = s.filled > 0 || s.seconds > 0;
      var a = el(
        "a",
        "cw-pick" + (s.solved ? " is-solved" : started ? " is-started" : "")
      );
      a.href = "#" + encodeURIComponent(p.id);

      var thumb = el("span", "cw-thumb");
      thumb.setAttribute("aria-hidden", "true");
      thumb.style.setProperty("--cols", s.model.cols);
      s.map.forEach(function (ch) {
        thumb.appendChild(
          el("span", "cw-thumb-cell" + (ch === "#" ? " is-block" : ch ? " is-filled" : ""))
        );
      });
      a.appendChild(thumb);

      var info = el("span", "cw-pick-info");
      info.appendChild(el("span", "cw-pick-title", p.title || "Mini"));
      info.appendChild(el("span", "cw-pick-date", formatDate(p.date)));
      a.appendChild(info);

      var pct = s.total ? Math.round((s.filled / s.total) * 100) : 0;
      var state = el("span", "cw-pick-state");
      var label = s.solved ? "Solved" : started ? pct + "% filled" : "Not started";
      state.appendChild(el("span", "cw-pick-label", label));
      state.appendChild(
        el("span", "cw-pick-time", s.solved || started ? clock(s.seconds) : "–")
      );
      var bar = el("span", "cw-pick-bar");
      var fill = el("span");
      fill.style.width = (s.solved ? 100 : pct) + "%";
      bar.appendChild(fill);
      state.appendChild(bar);
      a.appendChild(state);

      a.setAttribute(
        "aria-label",
        (p.title || "Mini") +
          ", " +
          formatDate(p.date) +
          ", " +
          (s.solved
            ? "solved in " + clock(s.seconds)
            : started
            ? pct + "% filled, " + clock(s.seconds) + " so far"
            : "not started")
      );

      var li = el("li");
      li.appendChild(a);
      ul.appendChild(li);
    });
    list.appendChild(ul);
  }

  function fromHash() {
    var id = decodeURIComponent(location.hash.slice(1));
    if (!id) return null;
    return (
      puzzles.filter(function (p) {
        return p.id === id;
      })[0] || null
    );
  }

  function route() {
    if (!playerName || !unlocked) return showGate();
    var p = fromHash();
    if (p) {
      if (p !== puzzle) {
        leave();
        open(p);
        window.scrollTo(0, 0);
      }
      return;
    }
    if (location.href.indexOf("#") >= 0 && history.replaceState) {
      history.replaceState(null, "", location.pathname + location.search);
    }
    showList();
  }

  window.addEventListener("hashchange", route);

  document.addEventListener("keydown", function (event) {
    if (!puzzle || solved || !ui.input || event.target === ui.input) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    var target = event.target;
    var tag = target && target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (target && target.isContentEditable)) {
      return;
    }
    var key = event.key;
    var puzzleKey = /^[a-z]$/i.test(key) || /^Arrow/.test(key) || key === "Backspace";
    if (covered()) {
      if (key === "Enter" && tag !== "BUTTON" && tag !== "A") {
        event.preventDefault();
        begin();
      }
      return;
    }
    if (!puzzleKey || !active) return;
    focusInput();
    onKey(event);
  });

  window.addEventListener("pagehide", function () {
    if (puzzle) save();
  });

  window.addEventListener("resize", function () {
    if (active) select(active, dir);
  });

  fetch("crosswords.json", { cache: "no-cache" })
    .then(function (res) {
      if (!res.ok) throw new Error(res.status);
      return res.json();
    })
    .then(function (data) {
      var order = data.puzzles || [];
      puzzles = order
        .filter(function (p) {
          return p && p.id && Array.isArray(p.grid) && p.grid.length;
        })
        .sort(function (a, b) {
          return (
            String(b.date).localeCompare(String(a.date)) || order.indexOf(b) - order.indexOf(a)
          );
        });
      if (!puzzles.length) {
        root.hidden = false;
        root.appendChild(el("p", "cw-status", "No puzzles yet."));
        return;
      }
      route();
    })
    .catch(function () {
      root.hidden = false;
      root.appendChild(el("p", "cw-status", "Couldn't load the puzzles."));
    });
})();
