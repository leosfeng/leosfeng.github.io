(function () {
  var boat = document.querySelector(".water-surface .boat");
  if (!boat) return;

  var TAU = Math.PI * 2;
  var INK = "rgba(0, 0, 0, 0.5)";
  var DIVER_INK = "rgba(0, 0, 0, 0.45)";
  var BUBBLE = "#94aecb";
  var SAND = "rgba(0, 0, 0, 0.28)";
  var BODY = 13;
  var ARM = 9.35;
  var LEG = 7.7;
  var HEAD = 2.1;
  var DIVER_SCALE = 1.1;
  var DIVER_SPEED = 110;
  var TOW_SPEED = 65;

  var SHAPES = [
    {
      d: "M6 22C10 25 17 26.5 23.2 26.5L22 24.8L23.8 23.6L22.6 22M11 22H22.6",
      pivot: [15, 24],
      points: [[6, 22], [10, 24.6], [17, 26.4], [23.2, 26.5], [22.6, 22], [11, 22]],
      rest: 0.2,
      pop: -1
    },
    {
      d: "M24.8 26.5C31 26.5 38 25 42 22M25.4 22H37M24.8 26.5L26 24.7L24.4 23.5L25.4 22",
      pivot: [33, 24],
      points: [[24.8, 26.5], [31, 26.4], [38, 25], [42, 22], [25.4, 22], [37, 22]],
      rest: -0.16,
      pop: 1
    },
    {
      d: "M24 21V4M24 5.2L38 20H24ZM24 8L13 20M24 4L30 5.6L24 7.4",
      pivot: [25, 13],
      points: [[24, 21], [24, 4], [38, 20], [13, 20], [30, 5.6]],
      rest: 1.42,
      pop: 0
    }
  ];

  var canvas = null;
  var ctx = null;
  var W = 0;
  var H = 0;
  var running = false;
  var last = null;
  var time = 0;
  var stage = "idle";
  var stageTime = 0;
  var pieces = [];
  var divers = [];
  var bubbles = [];
  var dust = [];
  var sand = [];

  function waterLine() {
    var host = document.querySelector(".water-surface");
    var level = window.LeoWater ? window.LeoWater.level : 54;
    if (!host) return level;
    return host.getBoundingClientRect().top + window.scrollY + level;
  }

  function sampleSand() {
    sand = [];
    var path = document.querySelector(".seabed .sand-line");
    if (!path || !path.getScreenCTM) return;
    var m = path.getScreenCTM();
    var len = path.getTotalLength();
    for (var i = 0; i <= 80; i++) {
      var p = path.getPointAtLength((len * i) / 80);
      var q = new DOMPoint(p.x, p.y).matrixTransform(m);
      sand.push([q.x + window.scrollX, q.y + window.scrollY]);
    }
  }

  function sandAt(px) {
    if (!sand.length) return document.documentElement.scrollHeight - 30;
    if (px <= sand[0][0]) return sand[0][1];
    for (var i = 1; i < sand.length; i++) {
      if (px <= sand[i][0]) {
        var a = sand[i - 1];
        var b = sand[i];
        return a[1] + ((b[1] - a[1]) * (px - a[0])) / (b[0] - a[0] || 1);
      }
    }
    return sand[sand.length - 1][1];
  }

  function size() {
    if (!canvas) return;
    var scale = window.devicePixelRatio || 1;
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * scale);
    canvas.height = Math.round(H * scale);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }

  function lowest(piece) {
    var c = Math.cos(piece.angle);
    var s = Math.sin(piece.angle);
    var low = -Infinity;
    for (var i = 0; i < piece.shape.points.length; i++) {
      var p = piece.shape.points[i];
      var lx = (p[0] - piece.shape.pivot[0]) * piece.flip * piece.scale;
      var ly = (p[1] - piece.shape.pivot[1]) * piece.scale;
      low = Math.max(low, lx * s + ly * c);
    }
    return low;
  }

  function bubble(x, y, size) {
    if (bubbles.length > 160) return;
    bubbles.push({
      x: x,
      y: y,
      age: 0,
      life: 3 + Math.random() * 1.5,
      size: size || 0.8 + Math.random() * 0.9,
      seed: Math.random() * TAU
    });
  }

  function breakBoat() {
    var box = boat.getBoundingClientRect();
    var inner = boat.querySelector(".boat-inner") || boat;
    var innerBox = inner.getBoundingClientRect();
    var matrix = new DOMMatrix(getComputedStyle(boat).transform);
    var flip = matrix.a < 0 ? -1 : 1;
    var scale = innerBox.width / 48;
    var left = innerBox.left + window.scrollX;
    var top = innerBox.top + window.scrollY;

    pieces = SHAPES.map(function (shape, i) {
      var bx = flip < 0 ? 48 - shape.pivot[0] : shape.pivot[0];
      return {
        shape: shape,
        path: new Path2D(shape.d),
        flip: flip,
        scale: scale,
        x: left + bx * scale,
        y: top + shape.pivot[1] * scale,
        vx: shape.pop * flip * (22 + Math.random() * 14) + (Math.random() - 0.5) * 8,
        vy: shape.pop === 0 ? -26 : -10,
        angle: 0,
        spin: (shape.pop || (Math.random() < 0.5 ? -1 : 1)) * flip * (0.5 + Math.random() * 0.5),
        rest: shape.rest * (shape.pop === 0 ? (Math.random() < 0.5 ? -1 : 1) : flip),
        terminal: 100 + Math.random() * 30,
        seed: Math.random() * TAU,
        delay: 0.35 + i * 0.25,
        landed: false,
        towed: false,
        gone: false
      };
    });

    boat.classList.add("is-wrecked");
    if (window.LeoWater) {
      var cx = box.left + box.width / 2;
      window.LeoWater.splash(cx, 1.5);
      setTimeout(function () {
        window.LeoWater.splash(cx - 14, 1);
        window.LeoWater.splash(cx + 14, 1);
      }, 260);
    }
  }

  function sinkPieces(dt) {
    var line = waterLine();
    var minX = sand.length ? sand[0][0] + 24 : window.scrollX + 30;
    var maxX = sand.length ? sand[sand.length - 1][0] - 24 : window.scrollX + W - 30;
    pieces.forEach(function (p) {
      if (p.landed) {
        p.angle += (p.rest - p.angle) * (1 - Math.exp(-3 * dt));
        p.y = sandAt(p.x) + 1.5 - lowest(p);
        return;
      }
      if (time < p.delay) {
        p.x += p.vx * dt;
        p.vx *= Math.exp(-2.5 * dt);
        p.y = line - 3 + Math.sin(time * 6 + p.seed) * 1.2 + (p.shape.pivot[1] - 22) * p.scale;
        p.angle += p.spin * 0.6 * dt;
        return;
      }
      p.vy += (p.terminal - p.vy) * (1 - Math.exp(-1.1 * dt));
      var aim = Math.min(Math.max(p.x, minX), maxX);
      p.vx += (aim - p.x) * 0.35 * dt;
      p.vx *= Math.exp(-0.6 * dt);
      p.x += (p.vx + Math.sin(time * 1.1 + p.seed) * 14) * dt;
      p.y += p.vy * dt;
      p.angle += (p.rest - p.angle) * (1 - Math.exp(-0.5 * dt)) +
        Math.sin(time * 2.2 + p.seed) * 0.35 * dt;
      if (Math.random() < dt * 2.4) bubble(p.x, p.y - 4);
      var floor = sandAt(p.x);
      if (p.y + lowest(p) >= floor + 1.5) {
        p.landed = true;
        p.y = floor + 1.5 - lowest(p);
        for (var i = 0; i < 9; i++) {
          dust.push({
            x: p.x + (Math.random() - 0.5) * 18,
            y: floor - 1,
            vx: (Math.random() - 0.5) * 30,
            vy: -(8 + Math.random() * 18),
            age: 0,
            life: 0.7 + Math.random() * 0.5
          });
        }
      }
    });
  }

  function sendDivers() {
    var mid = window.scrollX + W / 2;
    var order = pieces.slice().sort(function (a, b) {
      return Math.abs(a.x - mid) - Math.abs(b.x - mid);
    });
    divers = order.map(function (p, i) {
      var side = p.x < mid ? -1 : 1;
      return {
        piece: p,
        side: side,
        facing: -side,
        x: side < 0 ? window.scrollX - 40 : window.scrollX + W + 40,
        y: p.y - 16 - Math.random() * 10,
        kick: Math.random(),
        breath: 0.4 + Math.random(),
        stage: "wait",
        time: -i * 0.6,
        speed: 0
      };
    });
  }

  function holdPoint(d) {
    return [d.x + d.side * 4, d.y + 11];
  }

  function moveDivers(dt) {
    divers.forEach(function (d) {
      d.time += dt;
      if (d.stage === "gone") return;
      if (d.stage === "wait") {
        if (d.time > 0) d.stage = "swim";
        return;
      }
      var p = d.piece;
      var speed = 0;
      if (d.stage === "swim") {
        var toX = p.x - d.side * 4;
        var toY = p.y - 11;
        var gap = toX - d.x;
        speed = Math.min(DIVER_SPEED, Math.abs(gap) * 6);
        d.x += Math.sign(gap) * speed * dt;
        var near = Math.abs(gap) < 60;
        d.y += ((near ? toY : toY - 10) - d.y) * (1 - Math.exp(-4 * dt));
        if (Math.abs(gap) > 1.5) d.facing = Math.sign(gap);
        if (Math.abs(gap) <= 1.5 && Math.abs(toY - d.y) < 2) {
          d.stage = "grip";
          d.time = 0;
          d.facing = d.side;
        }
      } else if (d.stage === "grip") {
        p.angle += (0.08 * d.side - p.angle) * (1 - Math.exp(-4 * dt));
        if (d.time > 0.45) {
          d.stage = "tow";
          d.time = 0;
          p.towed = true;
        }
      } else if (d.stage === "tow") {
        d.speed = Math.min(d.speed + 45 * dt, TOW_SPEED);
        speed = d.speed;
        d.x += d.side * speed * dt;
        d.y -= Math.min(d.time, 1) * 10 * dt;
        var hold = holdPoint(d);
        p.x += (hold[0] - p.x) * (1 - Math.exp(-6 * dt));
        p.y += (hold[1] + 2 - p.y) * (1 - Math.exp(-6 * dt));
        p.angle += (0.12 * d.side + Math.sin(time * 3 + p.seed) * 0.06 - p.angle) *
          (1 - Math.exp(-3 * dt));
        var out = d.side < 0
          ? d.x < window.scrollX - 70
          : d.x > window.scrollX + W + 70;
        if (out) {
          d.stage = "gone";
          p.gone = true;
        }
      }
      d.kick += dt * (0.8 + speed / 30);
      d.breath -= dt;
      if (d.breath <= 0) {
        d.breath = 1.6 + Math.random() * 0.6;
        for (var i = 0; i < 3; i++) {
          bubble(d.x + d.facing * 4 * DIVER_SCALE, d.y - 1 - i * 2.5, 0.6 + Math.random() * 0.5);
        }
      }
    });
  }

  function step(dt) {
    time += dt;
    stageTime += dt;

    if (stage === "sinking") {
      sinkPieces(dt);
      if (pieces.every(function (p) { return p.landed; }) && stageTime > 1) {
        stage = "resting";
        stageTime = 0;
      }
    } else if (stage === "resting") {
      sinkPieces(dt);
      if (stageTime > 1.1) {
        stage = "rescue";
        stageTime = 0;
        sendDivers();
      }
    } else if (stage === "rescue") {
      pieces.forEach(function (p) {
        if (!p.towed && p.landed) {
          p.y = sandAt(p.x) + 1.5 - lowest(p);
        }
      });
      moveDivers(dt);
      if (divers.every(function (d) { return d.stage === "gone"; })) {
        stage = "waiting";
        stageTime = 0;
      }
    } else if (stage === "waiting" && stageTime > 1.6) {
      stage = "done";
      newBoat();
    }

    var line = waterLine();
    bubbles = bubbles.filter(function (b) {
      b.age += dt;
      b.y -= 26 * dt;
      b.x += 3 * Math.sin(b.age * 7 + b.seed) * dt;
      return b.age < b.life && b.y > line + 1;
    });
    dust = dust.filter(function (bit) {
      bit.age += dt;
      bit.vy += 40 * dt;
      bit.vx *= Math.exp(-3 * dt);
      bit.x += bit.vx * dt;
      bit.y = Math.min(bit.y + bit.vy * dt, sandAt(bit.x) - 0.5);
      return bit.age < bit.life;
    });
  }

  function line(x1, y1, x2, y2, width) {
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function scuba(d) {
    var ox = window.scrollX;
    var oy = window.scrollY;
    ctx.save();
    ctx.translate(d.x - ox, d.y - oy);
    ctx.scale(d.facing * DIVER_SCALE, DIVER_SCALE);
    ctx.strokeStyle = DIVER_INK;
    ctx.fillStyle = DIVER_INK;
    line(-10, -3, -2.5, -3, 2.4);
    line(-BODY, 0, 0, 0, 2.6);
    ctx.beginPath();
    ctx.arc(2.6, -0.2, HEAD, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(-2.5, -3.4);
    ctx.quadraticCurveTo(3, -5.5, 4.4, 0.9);
    ctx.stroke();
    for (var k = 0; k < 2; k++) {
      var kick = 0.3 * Math.sin(TAU * d.kick + k * Math.PI);
      var fx = -BODY - Math.cos(kick) * LEG;
      var fy = Math.sin(kick) * LEG;
      var fin = kick - 0.35 * Math.cos(TAU * d.kick + k * Math.PI);
      line(-BODY, 0, fx, fy, 1.8);
      line(fx, fy, fx - Math.cos(fin) * 4.5, fy + Math.sin(fin) * 4.5, 1.3);
    }
    if (d.stage === "swim" || d.stage === "wait") {
      line(0, 0.3, -5.5, 1.6, 1.4);
    } else {
      var p = d.piece;
      var hx = ((p.x - d.x) * d.facing) / DIVER_SCALE;
      var hy = (p.y - 2.5 * p.scale - d.y) / DIVER_SCALE;
      var far = Math.min(ARM / Math.hypot(hx, hy - 0.3), 1);
      line(0, 0.3, hx * far, 0.3 + (hy - 0.3) * far, 1.4);
    }
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillRect(3.3, -1.3, 1.3, 1.5);
    ctx.restore();
  }

  function draw() {
    var ox = window.scrollX;
    var oy = window.scrollY;
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    pieces.forEach(function (p) {
      if (p.gone) return;
      ctx.save();
      ctx.translate(p.x - ox, p.y - oy);
      ctx.rotate(p.angle);
      ctx.scale(p.flip * p.scale, p.scale);
      ctx.translate(-p.shape.pivot[0], -p.shape.pivot[1]);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      ctx.stroke(p.path);
      ctx.restore();
    });

    divers.forEach(function (d) {
      if (d.stage !== "gone" && d.stage !== "wait") scuba(d);
    });

    ctx.strokeStyle = BUBBLE;
    ctx.lineWidth = 0.8;
    bubbles.forEach(function (b) {
      ctx.globalAlpha = Math.min(1, (b.life - b.age) / 0.6) * 0.9;
      ctx.beginPath();
      ctx.arc(b.x - ox, b.y - oy, b.size, 0, TAU);
      ctx.stroke();
    });

    ctx.fillStyle = SAND;
    dust.forEach(function (bit) {
      ctx.globalAlpha = 1 - bit.age / bit.life;
      ctx.beginPath();
      ctx.arc(bit.x - ox, bit.y - oy, 0.8, 0, TAU);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function newBoat() {
    boat.classList.remove("is-wrecked");
    void boat.offsetWidth;
    boat.classList.add("is-arriving");
    boat.addEventListener("animationend", function arrived(event) {
      if (event.animationName !== "boatArrive") return;
      boat.removeEventListener("animationend", arrived);
      boat.classList.remove("is-arriving");
      window.LeoWreck.active = false;
    });
  }

  function frame(now) {
    var dt = last === null ? 0 : Math.min((now - last) / 1000, 0.05);
    last = now;
    step(dt);
    draw();
    var settled = stage === "done" && !bubbles.length && !dust.length;
    if (settled) {
      running = false;
      canvas.remove();
      canvas = null;
      return;
    }
    requestAnimationFrame(frame);
  }

  window.addEventListener("resize", function () {
    size();
    if (stage !== "idle" && stage !== "done") sampleSand();
  });

  window.LeoWreck = {
    active: false,
    sink: function () {
      if (this.active || running) return;
      this.active = true;
      canvas = document.createElement("canvas");
      canvas.className = "wreck-canvas";
      canvas.setAttribute("aria-hidden", "true");
      document.body.appendChild(canvas);
      ctx = canvas.getContext("2d");
      size();
      sampleSand();
      time = 0;
      stage = "sinking";
      stageTime = 0;
      divers = [];
      bubbles = [];
      dust = [];
      breakBoat();
      running = true;
      last = null;
      requestAnimationFrame(frame);
    }
  };
})();
