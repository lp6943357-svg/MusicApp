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
    // Catálogo de previews autorizados, sem depender de chave externa.
    // Isso garante que a pesquisa continue funcionando mesmo se o Audius estiver indisponível.
    for (const query of queries) {
      const url = new URL("https://itunes.apple.com/search");
      url.searchParams.set("term", query);
      url.searchParams.set("media", "music");
      url.searchParams.set("entity", "song");
      url.searchParams.set("country", "BR");
      url.searchParams.set("limit", "50");

      const r = await fetch(url);
      if (!r.ok) continue;
      const data = await r.json();

      for (const t of data.results || []) {
        if (!t.previewUrl) continue;
        add({
          id: "itunes-" + t.trackId,
          title: t.trackName || "Sem título",
          artist: t.artistName || "Artista desconhecido",
          cover: (t.artworkUrl100 || "").replace("100x100", "300x300"),
          audioId: "",
          file: t.previewUrl,
          downloadAllowed: false,
          source: "Prévia autorizada",
          playCount: Number(t.trackCount || 0)
        });
      }
    }

    // Audius é opcional: só é consultado quando uma chave foi configurada no Vercel.
    // Não deixamos uma falha do Audius impedir os resultados do iTunes.
    if (process.env.AUDIUS_API_KEY) {
      for (const query of queries) {
        const url = new URL("https://api.audius.co/v1/tracks/search");
        url.searchParams.set("query", query);
        url.searchParams.set("limit", "30");
        url.searchParams.set("sort_method", "relevant");
        url.searchParams.set("api_key", process.env.AUDIUS_API_KEY);

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
    }

    results.sort((a, b) => b.playCount - a.playCount);
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json({ results: results.slice(0, 50) });
  } catch (e) {
    console.error("search error", e);
    return res.status(200).json({ results });
  }
};