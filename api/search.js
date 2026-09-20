module.exports = async (req, res) => {
  const raw = String(req.query.q || "").trim();
  if (!raw) return res.status(200).json({ results: [] });

  const normalize = value =>
    value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

  const queries = [...new Set([raw, normalize(raw)])].filter(Boolean);
  const results = [];
  const seen = new Set();

  try {
    for (const query of queries) {
      for (const sort of ["relevant", "popular"]) {
        const url = new URL("https://api.audius.co/v1/tracks/search");
        url.searchParams.set("query", query);
        url.searchParams.set("limit", "20");
        url.searchParams.set("sort_method", sort);

        const r = await fetch(url);
        const data = await r.json();

        if (!r.ok) continue;

        for (const t of data.data || []) {
          const id = String(t.id);
          if (seen.has(id)) continue;
          seen.add(id);

          results.push({
            id,
            title: t.title || "Sem título",
            artist: t.user?.name || t.user?.handle || "Artista desconhecido",
            cover:
              t.artwork?._480x480 ||
              t.artwork?._150x150 ||
              t.artwork?._1000x1000 ||
              "",
            audioId: id,
            downloadAllowed: Boolean(t.downloadable ?? t.isDownloadable),
            license: t.license || "",
            playCount: Number(t.playCount || 0)
          });
        }
      }
    }

    results.sort((a, b) => b.playCount - a.playCount);

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json({ results: results.slice(0, 40) });
  } catch (e) {
    return res.status(500).json({
      error: "Erro de conexão com o catálogo Audius."
    });
  }
};