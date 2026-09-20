const { Readable } = require("stream");

module.exports = async (req, res) => {
  const id = String(req.query.id || "").trim();
  const mode = String(req.query.mode || "stream").trim();

  if (!id) return res.status(400).send("ID ausente");
  if (mode !== "stream" && mode !== "download") {
    return res.status(400).send("Modo inválido");
  }

  try {
    if (mode === "download") {
      const metaUrl = new URL(
        "https://api.audius.co/v1/tracks/" + encodeURIComponent(id)
      );

      const metaResponse = await fetch(metaUrl);
      const meta = await metaResponse.json();
      const track = meta.data;

      if (!metaResponse.ok || !track) {
        return res.status(404).send("Música não encontrada");
      }

      const downloadable = Boolean(
        track.downloadable ?? track.isDownloadable
      );

      if (!downloadable) {
        return res
          .status(403)
          .send("Download não permitido para esta música");
      }
    }

    const endpoint =
      "https://api.audius.co/v1/tracks/" +
      encodeURIComponent(id) +
      "/" +
      (mode === "download" ? "download" : "stream");

    const r = await fetch(endpoint);

    if (!r.ok || !r.body) {
      return res.status(r.status || 404).send("Áudio indisponível");
    }

    res.setHeader(
      "Content-Type",
      r.headers.get("content-type") || "audio/mpeg"
    );

    res.setHeader(
      "Cache-Control",
      mode === "download"
        ? "private, max-age=0, no-store"
        : "public, max-age=31536000, immutable"
    );

    if (mode === "download") {
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="musicapp-track.mp3"'
      );
    }

    const length = r.headers.get("content-length");
    if (length) res.setHeader("Content-Length", length);

    Readable.fromWeb(r.body).pipe(res);
  } catch (e) {
    return res.status(500).send("Erro ao obter áudio");
  }
};