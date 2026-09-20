(function () {
  var KEY = "leo-fish-eaten";

  function count() {
    var n = parseInt(localStorage.getItem(KEY) || "0", 10);
    return n > 0 ? n : 0;
  }

  function label(n) {
    return String(n).padStart(3, "0");
  }

  function render(animate) {
    var el = document.getElementById("fish-counter");
    if (!el) return;
    var n = count();
    if (n < 1) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    var wasHidden = el.hidden;
    el.hidden = false;
    el.textContent = label(n);
    if (animate || wasHidden) {
      el.classList.remove("is-in");
      void el.offsetWidth;
      el.classList.add("is-in");
    }
  }

  window.LeoFish = {
    count: count,
    add: function () {
      localStorage.setItem(KEY, String(count() + 1));
      render(true);
    },
    render: render
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      render(false);
    });
  } else {
    render(false);
  }
})();
