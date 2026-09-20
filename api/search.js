module.exports = async (req, res) => {
  const raw = String(req.query.q || "").trim();
  if (!raw) return res.status(200).json({ results: [] });

  const normalize = value =>
    value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

  const queries = [...new Set([raw, normalize(raw)])].filter(Boolean);
  const results = [];
  const seen = new Set();

  const add = song => {
    const key = (song.title + "|" + song.artist).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    results.push(song);
  };

  try {
    // Audius: faixas completas de artistas que disponibilizam o áudio no catálogo.
    for (const query of queries) {
      const url = new URL("https://api.audius.co/v1/tracks/search");
      url.searchParams.set("query", query);
      url.searchParams.set("limit", "20");
      url.searchParams.set("sort_method", "relevant");

      const r = await fetch(url);
      if (!r.ok) continue;
      const data = await r.json();

      for (const t of data.data || []) {
        add({
          id: "audius-" + t.id,
          title: t.title || "Sem título",
          artist: t.user?.name || t.user?.handle || "Artista desconhecido",
          cover: t.artwork?._480x480 || t.artwork?._150x150 || "",
          audioId: String(t.id),
          file: "/api/audio?id=" + encodeURIComponent(t.id),
          downloadAllowed: Boolean(t.downloadable ?? t.isDownloadable),
          source: "Audius",
          playCount: Number(t.playCount || 0)
        });
      }
    }

    // iTunes: catálogo comercial amplo para encontrar artistas/músicas populares.
    // O preview é somente uma amostra autorizada; não oferecemos download.
    for (const query of queries) {
      const url = new URL("https://itunes.apple.com/search");
      url.searchParams.set("term", query);
      url.searchParams.set("media", "music");
      url.searchParams.set("entity", "song");
      url.searchParams.set("country", "BR");
      url.searchParams.set("limit", "30");

      const r = await fetch(url);
      if (!r.ok) continue;
      const data = await r.json();

      for (const t of data.results || []) {
        if (!t.previewUrl) continue;
        add({
          id: "itunes-" + t.trackId,
          title: t.trackName || "Sem título",
          artist: t.artistName || "Artista desconhecido",
          cover: t.artworkUrl100 || "",
          audioId: "",
          file: t.previewUrl,
          downloadAllowed: false,
          source: "iTunes",
          playCount: Number(t.trackCount || 0)
        });
      }
    }

    results.sort((a, b) => b.playCount - a.playCount);

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json({ results: results.slice(0, 50) });
  } catch (e) {
    return res.status(500).json({ error: "Erro de conexão com os catálogos de música." });
  }
};