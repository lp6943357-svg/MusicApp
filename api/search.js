module.exports = async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.status(200).json({ results: [] });

  const url = new URL("https://api.audius.co/v1/tracks/search");
  url.searchParams.set("query", q);
  url.searchParams.set("limit", "20");
  url.searchParams.set("sort_method", "relevant");

  try {
    const r = await fetch(url);
    const data = await r.json();

    if (!r.ok) {
      return res.status(r.status).json({
        error: "Falha ao consultar o catálogo Audius."
      });
    }

    const results = (data.data || []).map(t => ({
      id: String(t.id),
      title: t.title || "Sem título",
      artist: t.user?.name || t.user?.handle || "Artista desconhecido",
      cover:
        t.artwork?._480x480 ||
        t.artwork?._150x150 ||
        t.artwork?._1000x1000 ||
        "",
      audioId: String(t.id),
      downloadAllowed: Boolean(t.downloadable ?? t.isDownloadable),
      license: t.license || ""
    }));

    res.setHeader(
      "Cache-Control",
      "s-maxage=60, stale-while-revalidate=300"
    );

    return res.status(200).json({ results });
  } catch (e) {
    return res.status(500).json({
      error: "Erro de conexão com o catálogo Audius."
    });
  }
};