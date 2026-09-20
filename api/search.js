module.exports = async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.status(200).json({ results: [] });
  const clientId = process.env.JAMENDO_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: "JAMENDO_CLIENT_ID não configurado no Vercel." });
  const url = new URL("https://api.jamendo.com/v3.0/tracks/");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "20");
  url.searchParams.set("search", q);
  url.searchParams.set("audioformat", "mp32");
  url.searchParams.set("audiodlformat", "mp32");
  url.searchParams.set("imagesize", "200");
  url.searchParams.set("type", "single albumtrack");
  try {
    const r = await fetch(url);
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: "Falha ao consultar o catálogo." });
    const results = (data.results || []).map(t => ({
      id: String(t.id),
      title: t.name,
      artist: t.artist_name,
      cover: t.image || t.album_image || "",
      audioId: String(t.id),
      downloadAllowed: Boolean(t.audiodownload_allowed),
      license: t.license_ccurl || ""
    }));
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json({ results });
  } catch (e) {
    return res.status(500).json({ error: "Erro de conexão com o catálogo." });
  }
};