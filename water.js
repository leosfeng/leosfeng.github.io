(function () {
  var host = document.querySelector(".water-surface");
  if (!host) return;

  var canvas = document.createElement("canvas");
  canvas.className = "water-canvas";
  host.insertBefore(canvas, host.firstChild);
  var ctx = canvas.getContext("2d");

  var LEVEL = 54;
  var LINE = "#adc3da";
  var FOAM = "#94aecb";
  var GLOW = "rgba(55, 135, 240, 0.16)";
  var TAU = Math.PI * 2;

  var W = 0;
  var H = 0;
  var time = 0;
  var surface = [];
  var rings = [];
  var foam = [];
  var stir = { x: 0, strength: 0, dir: 1 };
  var boat = host.querySelector(".boat");

  function size() {
    var scale = window.devicePixelRatio || 1;
    W = host.clientWidth;
    H = host.clientHeight;
    canvas.width = Math.round(W * scale);
    canvas.height = Math.round(H * scale);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }

  function water() {
    surface.length = 0;
    for (var px = 0; px <= W + 2; px += 2) {
      var y =
        1.3 * Math.sin(px * 0.011 - time * 0.7) +
        0.9 * Math.sin(px * 0.045 - time * 1.4) +
        0.4 * Math.sin(px * 0.12 + time * 2.1);

      if (stir.strength > 0.01) {
        var ahead = (px - stir.x) * stir.dir;
        var from = Math.abs(px - stir.x);
        y -= stir.strength * 2.4 * Math.exp(-Math.pow((ahead - 6) / 9, 2)) *
          (0.8 + 0.2 * Math.sin(time * 9));
        if (ahead < -4) {
          var back = -4 - ahead;
          y += stir.strength * 1.6 * Math.exp(-back / 36) * Math.sin(back * 0.3 + time * 7);
        }
        y += stir.strength * 0.5 * Math.exp(-from / 60) * Math.sin(from * 0.2 - time * 5);
      }

      for (var r = 0; r < rings.length; r++) {
        var hit = rings[r];
        var age = time - hit.time;
        var dist = Math.abs(px - hit.x);
        if (dist < age * 70) {
          y += hit.size * 2.2 * Math.exp(-age * 1.5 - dist / 46) * Math.sin(dist * 0.38 - age * 11);
        }
      }

      surface.push(LEVEL + y);
    }
  }

  function surfaceAt(px) {
    if (!surface.length) return LEVEL;
    var i = Math.min(Math.max(Math.round(px / 2), 0), surface.length - 1);
    return surface[i];
  }

  function surfacePath() {
    ctx.moveTo(0, surface[0]);
    for (var i = 1; i < surface.length; i++) ctx.lineTo(i * 2, surface[i]);
  }

  function draw() {
    water();
    ctx.clearRect(0, 0, W, H);

    var glow = ctx.createLinearGradient(0, LEVEL - 3, 0, LEVEL + 14);
    glow.addColorStop(0, GLOW);
    glow.addColorStop(1, GLOW.replace(/[\d.]+\)$/, "0)"));
    ctx.fillStyle = glow;
    ctx.beginPath();
    surfacePath();
    ctx.lineTo(W + 2, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1.4;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    surfacePath();
    ctx.stroke();

    ctx.fillStyle = FOAM;
    for (var i = 0; i < foam.length; i++) {
      var bit = foam[i];
      ctx.globalAlpha = 0.9 * (1 - bit.age / bit.life);
      ctx.beginPath();
      ctx.arc(bit.x, bit.y, bit.size, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function rideBoat() {
    if (!boat) return;
    var hostBox = host.getBoundingClientRect();
    var box = boat.getBoundingClientRect();
    var cx = box.left + box.width / 2 - hostBox.left;
    var lift = surfaceAt(cx) - LEVEL;
    boat.style.marginTop = lift.toFixed(2) + "px";
  }

  function addFoam(px, count, spread, lean) {
    for (var i = 0; i < count && foam.length < 260; i++) {
      foam.push({
        x: px + (Math.random() - 0.5) * spread,
        y: surfaceAt(px) - Math.random(),
        vx: (Math.random() - 0.5 + lean) * 40,
        vy: -(14 + Math.random() * 32),
        size: 0.6 + Math.random() * 0.7,
        age: 0,
        life: 3,
        floating: false
      });
    }
  }

  function step(dt) {
    time += dt;
    rings = rings.filter(function (hit) {
      return time - hit.time < 3;
    });
    stir.strength *= Math.pow(0.02, dt);

    if (stir.strength > 0.25 && Math.random() < stir.strength * dt * 22) {
      addFoam(stir.x - stir.dir * 10, 1, 6, -stir.dir * 0.35);
    }

    foam = foam.filter(function (bit) {
      bit.age += dt;
      if (bit.floating) {
        bit.x += bit.vx * 0.15 * dt;
        bit.y = surfaceAt(bit.x) - 0.4;
      } else {
        bit.vy += 80 * dt;
        bit.x += bit.vx * dt;
        bit.y += bit.vy * dt;
        if (bit.vy > 0 && bit.y >= surfaceAt(bit.x)) {
          bit.floating = true;
          bit.life = bit.age + 0.5 + Math.random() * 0.7;
        }
      }
      return bit.age < bit.life;
    });
  }

  function localX(clientX) {
    return clientX - host.getBoundingClientRect().left;
  }

  window.LeoWater = {
    level: LEVEL,
    stir: function (clientX, strength, dir) {
      stir.x = localX(clientX);
      stir.strength = Math.max(stir.strength, Math.min(strength, 1));
      stir.dir = dir < 0 ? -1 : 1;
    },
    splash: function (clientX, strength) {
      var px = localX(clientX);
      var s = Math.min(Math.max(strength || 1, 0.2), 1.5);
      rings.push({ x: px, time: time, size: s });
      addFoam(px, Math.round(26 * s), 8, 0);
    }
  };

  size();
  var resizing;
  window.addEventListener("resize", function () {
    clearTimeout(resizing);
    resizing = setTimeout(size, 150);
  });

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    draw();
    return;
  }

  var last = null;
  function frame(now) {
    var dt = last === null ? 0 : Math.min((now - last) / 1000, 0.05);
    last = now;
    step(dt);
    if (host.getBoundingClientRect().bottom > 0) {
      draw();
      rideBoat();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
