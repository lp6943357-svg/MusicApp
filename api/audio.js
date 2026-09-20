const { Readable } = require("stream");

module.exports = async (req, res) => {
  const id = String(req.query.id || "").trim();
  if (!id) return res.status(400).send("ID ausente");

  const clientId = process.env.JAMENDO_CLIENT_ID;
  if (!clientId) return res.status(500).send("JAMENDO_CLIENT_ID não configurado no Vercel.");

  const url = new URL("https://api.jamendo.com/v3.0/tracks/file/");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("id", id);
  url.searchParams.set("audioformat", "mp32");
  url.searchParams.set("action", "stream");

  try {
    const r = await fetch(url);
    if (!r.ok || !r.body) return res.status(r.status || 404).send("Áudio indisponível");

    res.setHeader("Content-Type", r.headers.get("content-type") || "audio/mpeg");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    const length = r.headers.get("content-length");
    if (length) res.setHeader("Content-Length", length);

    Readable.fromWeb(r.body).pipe(res);
  } catch (e) {
    return res.status(500).send("Erro ao obter áudio");
  }
};