const { Readable } = require("stream");

module.exports = async (req, res) => {
  const id = String(req.query.id || "").trim();
  const mode = String(req.query.mode || "stream").trim();
  const source = String(req.query.source || "audius").trim().toLowerCase();

  if (!id) return res.status(400).send("ID ausente");
  if (mode !== "stream" && mode !== "download") return res.status(400).send("Modo inválido");
  if (source !== "audius" && source !== "jamendo") return res.status(400).send("Fonte inválida");

  const apiKey = String(process.env.AUDIUS_API_KEY || "").trim();
  const jamendoClientId = String(process.env.JAMENDO_CLIENT_ID || "").trim();

  const addAudiusParams = url => {
    url.searchParams.set("app_name", "MusicApp");
    if (apiKey) url.searchParams.set("api_key", apiKey);
    return url;
  };

  const pipeAudio = async (url, filename) => {
    const r = await fetch(url);
    if (!r.ok || !r.body) return res.status(r.status || 404).send("Áudio indisponível");
    res.setHeader("Content-Type", r.headers.get("content-type") || "audio/mpeg");
    res.setHeader("Cache-Control", mode === "download" ? "private, max-age=0, no-store" : "public, max-age=31536000, immutable");
    if (mode === "download") res.setHeader("Content-Disposition", 'attachment; filename="' + filename + '"');
    const length = r.headers.get("content-length");
    if (length) res.setHeader("Content-Length", length);
    Readable.fromWeb(r.body).pipe(res);
  };

  try {
    if (source === "jamendo") {
      if (!jamendoClientId) return res.status(503).send("JAMENDO_CLIENT_ID não configurado");

      if (mode === "download") {
        const metaUrl = new URL("https://api.jamendo.com/v3.0/tracks/");
        metaUrl.searchParams.set("client_id", jamendoClientId);
        metaUrl.searchParams.set("format", "json");
        metaUrl.searchParams.set("id", id);
        metaUrl.searchParams.set("audioformat", "mp32");
        metaUrl.searchParams.set("audiodlformat", "mp32");

        const metaResponse = await fetch(metaUrl);
        const meta = await metaResponse.json();
        const track = meta.results?.[0];

        if (!metaResponse.ok || !track) return res.status(404).send("Música não encontrada");
        if (!Boolean(track.audiodownload_allowed) || !track.audiodownload) {
          return res.status(403).send("Download não permitido para esta música");
        }
      }

      const endpoint = new URL("https://api.jamendo.com/v3.0/tracks/file");
      endpoint.searchParams.set("client_id", jamendoClientId);
      endpoint.searchParams.set("id", id);
      endpoint.searchParams.set("audioformat", "mp32");
      endpoint.searchParams.set("action", mode === "download" ? "download" : "stream");
      return pipeAudio(endpoint, "musicapp-jamendo-" + id + ".mp3");
    }

    if (mode === "download") {
      const metaUrl = addAudiusParams(new URL("https://api.audius.co/v1/tracks/" + encodeURIComponent(id)));
      const metaResponse = await fetch(metaUrl);
      const meta = await metaResponse.json();
      const track = meta.data;
      if (!metaResponse.ok || !track) return res.status(404).send("Música não encontrada");
      if (!Boolean(track.downloadable ?? track.isDownloadable)) {
        return res.status(403).send("Download não permitido para esta música");
      }
    }

    const endpoint = addAudiusParams(new URL("https://api.audius.co/v1/tracks/" + encodeURIComponent(id) + "/" + (mode === "download" ? "download" : "stream")));
    return pipeAudio(endpoint, "musicapp-audius-" + id + ".mp3");
  } catch (e) {
    console.error("audio error", e);
    return res.status(500).send("Erro ao obter áudio");
  }
};