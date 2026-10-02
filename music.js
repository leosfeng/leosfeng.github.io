(function () {
  var SEARCH = "https://music.apple.com/us/search?term=";

  function searchUrl(term) {
    return SEARCH + encodeURIComponent(term);
  }

  function row(opts) {
    var a = document.createElement("a");
    a.className = "course" + (opts.cover ? " has-cover" : "");
    a.href = opts.href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";

    var rank = document.createElement("span");
    rank.className = "rank";
    rank.textContent = String(opts.rank);
    a.appendChild(rank);

    if (opts.cover) {
      var img = document.createElement("img");
      img.className = opts.coverClass || "song-cover";
      img.src = opts.cover;
      img.alt = opts.title;
      img.width = 40;
      img.height = 40;
      img.loading = "lazy";
      img.decoding = "async";
      a.appendChild(img);
    }

    var h2 = document.createElement("h2");
    h2.textContent = opts.title;
    a.appendChild(h2);

    if (opts.right) {
      var code = document.createElement("span");
      code.className = "code";
      code.textContent = opts.right;
      a.appendChild(code);
    }

    var li = document.createElement("li");
    li.appendChild(a);
    return li;
  }

  function section(title, items, makeRow) {
    if (!items || !items.length) return null;
    var wrap = document.createElement("section");
    wrap.className = "chart";
    var heading = document.createElement("h2");
    heading.className = "chart-title";
    heading.textContent = title;
    wrap.appendChild(heading);
    var ul = document.createElement("ul");
    items.forEach(function (item, i) {
      ul.appendChild(makeRow(item, i + 1));
    });
    wrap.appendChild(ul);
    return wrap;
  }

  function songHref(song) {
    if (song.url) return song.url;
    return searchUrl([song.title, song.artist].filter(Boolean).join(" "));
  }

  function artistHref(artist) {
    if (artist.url) return artist.url;
    return searchUrl(artist.name);
  }

  fetch("music.json")
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      var month = data.month || "this month";
      var monthEl = document.getElementById("music-month");
      if (monthEl) monthEl.textContent = "Music · " + month;

      var root = document.getElementById("music-lists");
      var intro = document.getElementById("music-intro");
      var embed = document.getElementById("music-embed");
      var songs = data.songs || [];
      var artists = data.artists || [];

      if (intro) {
        intro.textContent =
          "I love music from all sorts of genres. Here are my most-listened songs and artists of " +
          month +
          ".";
      }

      if (root) {
        root.innerHTML = "";
        var songSection = section(
          "Top songs of " + month,
          songs,
          function (song, rank) {
            return row({
              rank: rank,
              title: song.title,
              right: song.artist,
              href: songHref(song),
              cover: song.cover
            });
          }
        );
        var artistSection = section(
          "Top artists of " + month,
          artists,
          function (artist, rank) {
            return row({
              rank: rank,
              title: artist.name,
              right: artist.plays,
              href: artistHref(artist),
              cover: artist.cover,
              coverClass: "song-cover artist-cover"
            });
          }
        );
        if (songSection) root.appendChild(songSection);
        if (artistSection) root.appendChild(artistSection);
      }

      if (embed && data.playlist) {
        var src = data.playlist
          .replace("music.apple.com", "embed.music.apple.com")
          .replace("https://embed.embed.", "https://embed.");
        var frame = document.createElement("iframe");
        frame.allow = "autoplay *; encrypted-media *; clipboard-write";
        frame.setAttribute(
          "sandbox",
          "allow-forms allow-popups allow-same-origin allow-scripts allow-top-navigation-by-user-activation"
        );
        frame.title = "Apple Music playlist";
        frame.src = src;
        embed.hidden = false;
        embed.appendChild(frame);
      }
    })
    .catch(function () {});
})();
