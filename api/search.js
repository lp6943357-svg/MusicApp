module.exports = async (req, res) => {
  const raw = String(req.query.q || "").trim();
  if (!raw) return res.status(200).json({ results: [] });

  const normalize = value =>
    value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

  const queries = [...new Set([raw, normalize(raw)])].filter(Boolean);
  const results = [];
  const seen = new Set();
  const audiusKey = String(process.env.AUDIUS_API_KEY || "").trim();
  const jamendoClientId = String(process.env.JAMENDO_CLIENT_ID || "").trim();

  const add = song => {
    const key = (song.title + "|" + song.artist).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    results.push(song);
  };

  const searches = queries.map(async query => {
    // 1) Audius: faixas completas do catálogo aberto.
    try {
      const url = new URL("https://api.audius.co/v1/tracks/search");
      url.searchParams.set("query", query);
      url.searchParams.set("limit", "50");
      url.searchParams.set("sort_method", "relevant");
      url.searchParams.set("app_name", "MusicApp");
      if (audiusKey) url.searchParams.set("api_key", audiusKey);

      const r = await fetch(url);
      if (r.ok) {
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
            playCount: Number(t.playCount || 0),
            duration: Number(t.duration || 0),
            kind: "full"
          });
        }
      }
    } catch (e) {
      console.error("Audius search error", e);
    }

    // 2) Jamendo: catálogo grande de artistas independentes.
    // Só é consultado quando JAMENDO_CLIENT_ID está configurado no Vercel.
    try {
      if (jamendoClientId) {
        const url = new URL("https://api.jamendo.com/v3.0/tracks/");
        url.searchParams.set("client_id", jamendoClientId);
        url.searchParams.set("format", "json");
        url.searchParams.set("namesearch", query);
        url.searchParams.set("limit", "50");
        url.searchParams.set("audioformat", "mp32");
        url.searchParams.set("include", "musicinfo");
        url.searchParams.set("imagesize", "300");

        const r = await fetch(url);
        if (r.ok) {
          const data = await r.json();
          for (const t of data.results || []) {
            add({
              id: "jamendo-" + t.id,
              title: t.name || "Sem título",
              artist: t.artist_name || "Artista desconhecido",
              cover: t.album_image || t.image || "",
              audioId: String(t.id),
              file: t.audio || "",
              downloadAllowed: Boolean(t.audiodownload_allowed),
              source: "Jamendo",
              playCount: Number(t.listeners || 0),
              duration: Number(t.duration || 0),
              kind: "full"
            });
          }
        }
      }
    } catch (e) {
      console.error("Jamendo search error", e);
    }

    // 3) iTunes: descoberta ampla. Continua sendo apenas prévia autorizada.
    // Não é usada como fonte de download.
    try {
      const url = new URL("https://itunes.apple.com/search");
      url.searchParams.set("term", query);
      url.searchParams.set("media", "music");
      url.searchParams.set("entity", "song");
      url.searchParams.set("country", "BR");
      url.searchParams.set("limit", "50");

      const r = await fetch(url);
      if (r.ok) {
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
            source: "iTunes — prévia",
            playCount: Number(t.trackCount || 0),
            duration: 30,
            kind: "preview"
          });
        }
      }
    } catch (e) {
      console.error("iTunes search error", e);
    }
  });

  try {
    await Promise.all(searches);

    // Faixas completas primeiro; prévias ficam como fallback de descoberta.
    results.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "full" ? -1 : 1;
      return b.playCount - a.playCount;
    });

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json({ results: results.slice(0, 100) });
  } catch (e) {
    console.error("search error", e);
    return res.status(200).json({ results });
  }
};