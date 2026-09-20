module.exports = async (req, res) => {
  const raw = String(req.query.q || "").trim();
  if (!raw) return res.status(200).json({ results: [] });

  const normalize = value =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  const baseQueries = [...new Set([raw, normalize(raw)])].filter(Boolean);
  const results = [];
  const seen = new Set();

  const audiusKey = String(process.env.AUDIUS_API_KEY || "").trim();
  const jamendoClientId = String(process.env.JAMENDO_CLIENT_ID || "").trim();
  const spotifyClientId = String(process.env.SPOTIFY_CLIENT_ID || "").trim();
  const spotifyClientSecret = String(process.env.SPOTIFY_CLIENT_SECRET || "").trim();

  const add = song => {
    // Regra do MusicApp: só entra na busca principal o que é faixa completa
    // e pode ser baixado pela fonte.
    if (song.kind !== "full") return;

    const key = normalize(song.title) + "|" + normalize(song.artist);
    if (!key || seen.has(key)) return;
    seen.add(key);
    results.push(song);
  };

  // O Spotify é usado somente como índice de descoberta de títulos/artistas.
  // O áudio nunca vem do Spotify e nenhuma prévia do Spotify é exibida.
  async function getSpotifyQueries() {
    if (!spotifyClientId || !spotifyClientSecret) return [];

    try {
      const auth = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization:
            "Basic " +
            Buffer.from(spotifyClientId + ":" + spotifyClientSecret).toString("base64")
        },
        body: "grant_type=client_credentials"
      });

      if (!auth.ok) return [];

      const authData = await auth.json();
      if (!authData.access_token) return [];

      const url = new URL("https://api.spotify.com/v1/search");
      url.searchParams.set("q", raw);
      url.searchParams.set("type", "track");
      url.searchParams.set("market", "BR");
      url.searchParams.set("limit", "10");

      const r = await fetch(url, {
        headers: { Authorization: "Bearer " + authData.access_token }
      });

      if (!r.ok) return [];

      const data = await r.json();
      const tracks = data.tracks?.items || [];

      return tracks
        .map(t => {
          const title = String(t.name || "").trim();
          const artist = String(t.artists?.[0]?.name || "").trim();
          return title && artist ? title + " " + artist : "";
        })
        .filter(Boolean);
    } catch (e) {
      console.error("Spotify discovery error", e);
      return [];
    }
  }

  const spotifyQueries = await getSpotifyQueries();
  const queries = [...new Set([...baseQueries, ...spotifyQueries])].slice(0, 12);

  const searches = queries.map(async query => {
    // 1) Audius: procurar somente faixas que a própria plataforma marca como baixáveis.
    try {
      const url = new URL("https://api.audius.co/v1/tracks/search");
      url.searchParams.set("query", query);
      url.searchParams.set("limit", "50");
      url.searchParams.set("sort_method", "relevant");
      url.searchParams.set("app_name", "MusicApp");
      url.searchParams.set("only_downloadable", "true");
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

    // 2) Jamendo: somente faixas com download explicitamente autorizado.
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
              downloadFile: t.audiodownload || "",
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
  });

  try {
    await Promise.all(searches);

    results.sort((a, b) => {
      const sourceScore = song => song.source === "Audius" ? 2 : 1;
      return (sourceScore(b) - sourceScore(a)) || (b.playCount - a.playCount);
    });

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json({
      results: results.slice(0, 100),
      previews: []
    });
  } catch (e) {
    console.error("search error", e);
    return res.status(200).json({ results, previews: [] });
  }
};