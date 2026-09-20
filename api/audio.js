const { Readable } = require("stream");

module.exports = async (req, res) => {
  const id = String(req.query.id || "").trim();
  const mode = String(req.query.mode || "stream").trim();
  if (!id) return res.status(400).send("ID ausente");
  if (mode !== "stream" && mode !== "download") return res.status(400).send("Modo inválido");

  const clientId = process.env.JAMENDO_CLIENT_ID;
  if (!clientId) return res.status(500).send("JAMENDO_CLIENT_ID não configurado no Vercel.");

  try {
    if (mode === "download") {
      const metaUrl = new URL("https://api.jamendo.com/v3.0/tracks/");
      metaUrl.searchParams.set("client_id", clientId);
      metaUrl.searchParams.set("format", "json");
      metaUrl.searchParams.set("limit", "1");
      metaUrl.searchParams.set("id", id);

      const metaResponse = await fetch(metaUrl);
      const meta = await metaResponse.json();
      const track = meta.results && meta.results[0];

      if (!metaResponse.ok || !track) {
        return res.status(404).send("Música não encontrada");
      }

      if (!track.audiodownload_allowed) {
        return res.status(403).send("Download não permitido para esta música");
      }
    }

    const url = new URL("https://api.jamendo.com/v3.0/tracks/file/");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("id", id);
    url.searchParams.set("audioformat", "mp32");
    url.searchParams.set("action", mode === "download" ? "download" : "stream");

    const r = await fetch(url);
    if (!r.ok || !r.body) {
      return res.status(r.status || 404).send("Áudio indisponível");
    }

    res.setHeader("Content-Type", r.headers.get("content-type") || "audio/mpeg");
    res.setHeader(
      "Cache-Control",
      mode === "download"
        ? "private, max-age=0, no-store"
        : "public, max-age=31536000, immutable"
    );

    if (mode === "download") {
      res.setHeader("Content-Disposition", 'attachment; filename="musicapp-track.mp3"');
    }

    const length = r.headers.get("content-length");
    if (length) res.setHeader("Content-Length", length);

    Readable.fromWeb(r.body).pipe(res);
  } catch (e) {
    return res.status(500).send("Erro ao obter áudio");
  }
};