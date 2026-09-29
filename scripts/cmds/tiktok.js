const fs = require("fs-extra");
const axios = require("axios");
const path = require("path");
const { pipeline } = require("stream/promises");

// Ilagay dito ang Cloudflare Worker mo
const WORKER_URL =
  "https://black-waterfall-01b9.jamesbaroyofficial.workers.dev/download";

const processed = new Set(); // para hindi ma-double process ang parehong message

module.exports = {
  config: {
    name: "tiktok",
    version: "1.6",
    author: "Aminul Sardar",
    countDown: 5,
    role: 0,
    shortDescription: "Auto download TikTok videos",
    category: "media"
  },

  onStart: async function () {},

  onChat: async function ({ api, event }) {
    const { threadID, messageID, body, senderID } = event;

    if (!messageID || !body) return;
    if (senderID === api.getCurrentUserID()) return; // ignore sariling mensahe

    // =========================
    // GET TIKTOK URL
    // =========================
    const match = body.match(/https?:\/\/(?:[a-z0-9-]+\.)?tiktok\.com\/[^\s]+/i);
    if (!match) return;

    const tiktokURL = match[0].replace(/[)\]}>.,]+$/, "");

    // =========================
    // DEDUPE
    // =========================
    if (processed.has(messageID)) {
      console.log("[TIKTOK] Duplicate event ignored:", messageID);
      return;
    }
    processed.add(messageID);
    setTimeout(() => processed.delete(messageID), 5 * 60 * 1000);

    console.log("[TIKTOK] URL:", tiktokURL);

    const react = (emoji) =>
      api.setMessageReaction(emoji, messageID, () => {}, true);

    let filePath = null;

    try {
      // =========================
      // ⏳
      // =========================
      react("⏳");

      const cacheDir = path.join(__dirname, "cache");
      await fs.ensureDir(cacheDir);

      filePath = path.join(
        cacheDir,
        `tiktok_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`
      );

      // =========================
      // CLOUDFLARE WORKER
      // =========================
      const workerResponse = await axios.get(WORKER_URL, {
        params: { url: tiktokURL },
        timeout: 30000
      });

      const data = workerResponse?.data;
      console.log("[TIKTOK WORKER]", data);

      const downloadURL = data?.download_url || data?.url;

      if (!data?.success || !downloadURL) {
        throw new Error(data?.error || data?.message || "No TikTok download URL");
      }

      // =========================
      // DOWNLOAD VIDEO
      // =========================
      const videoResponse = await axios.get(downloadURL, {
        responseType: "stream",
        timeout: 60000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        headers: { "User-Agent": "Mozilla/5.0" }
      });

      await pipeline(videoResponse.data, fs.createWriteStream(filePath));

      const stat = await fs.stat(filePath);
      console.log("[TIKTOK] Video size:", stat.size, "bytes");

      if (!stat.size) throw new Error("Downloaded video is empty");

      // =========================
      // SEND VIDEO
      // =========================
      const sendResult = await new Promise((resolve) => {
        api.sendMessage(
          { attachment: fs.createReadStream(filePath) },
          threadID,
          (err, info) => resolve({ err, info }),
          messageID
        );
      });

      console.log("[TIKTOK SEND CALLBACK]", sendResult.err || sendResult.info);

      if (sendResult.err) {
        // Minsan nag-e-error ang callback pero na-send (o ina-retry) pa rin
        // ang video. Kaya HINDI na ❌ dito. I-clear lang ang ⏳.
        console.error("[TIKTOK SEND ERROR - hindi ❌]", sendResult.err);
        react("");
      } else {
        react("✅");
      }
    } catch (err) {
      // ❌ dito lang lalabas kung pumalya ang worker/download
      console.error("[TIKTOK ERROR -> ❌]", err.message || err);
      react("❌");
    } finally {
      // =========================
      // CLEANUP (delayed para hindi maputol ang upload/retry)
      // =========================
      if (filePath) {
        const f = filePath;
        setTimeout(() => fs.remove(f).catch(() => {}), 60 * 1000);
      }
    }
  }
};
