const fs = require("fs-extra");
const axios = require("axios");
const path = require("path");
const { pipeline } = require("stream/promises");

// Cloudflare Worker mo
const WORKER_URL =
  "https://black-waterfall-01b9.jamesbaroyofficial.workers.dev/download";

const URL_REGEX = /https?:\/\/(?:[a-z0-9-]+\.)?tiktok\.com\/[^\s]+/i;

module.exports = {
  config: {
    name: "tt",
    aliases: ["tiktok"],
    version: "2.0",
    author: "Aminul Sardar",
    countDown: 5,
    role: 0,
    shortDescription: "Download TikTok video",
    category: "media",
    guide: "{pn} <tiktok link>  (o i-reply ang message na may link)"
  },

  onStart: async function ({ api, event, args }) {
    const { threadID, messageID } = event;

    const react = (emoji) =>
      api.setMessageReaction(emoji, messageID, () => {}, true);

    // Kunin ang link: mula sa args, o sa nireplyan na message
    const source = args.join(" ") || event.messageReply?.body || "";
    const match = source.match(URL_REGEX);

    if (!match) {
      return api.sendMessage(
        "Link please ex: !tt https://vt.tiktok.com/xxxx",
        threadID,
        messageID
      );
    }

    const tiktokURL = match[0].replace(/[)\]}>.,]+$/, "");
    console.log("[TIKTOK] URL:", tiktokURL);

    let filePath = null;

    try {
      react("⏳");

      const cacheDir = path.join(__dirname, "cache");
      await fs.ensureDir(cacheDir);
      filePath = path.join(
        cacheDir,
        `tiktok_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`
      );

      const { data } = await axios.get(WORKER_URL, {
        params: { url: tiktokURL },
        timeout: 30000
      });
      console.log("[TIKTOK WORKER]", data);

      const downloadURL = data?.download_url || data?.url;
      if (!data?.success || !downloadURL) {
        throw new Error(data?.error || data?.message || "No TikTok download URL");
      }

      const videoResponse = await axios.get(downloadURL, {
        responseType: "stream",
        timeout: 60000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        headers: { "User-Agent": "Mozilla/5.0" }
      });
      await pipeline(videoResponse.data, fs.createWriteStream(filePath));

      const { size } = await fs.stat(filePath);
      console.log("[TIKTOK] Video size:", size, "bytes");
      if (!size) throw new Error("Downloaded video is empty");

      const sendResult = await new Promise((resolve) => {
        api.sendMessage(
          { attachment: fs.createReadStream(filePath) },
          threadID,
          (err, info) => resolve({ err, info }),
          messageID
        );
      });

      if (sendResult.err) {
        // Minsan false error ang callback, kaya hindi ❌
        console.error("[TIKTOK] Send callback error:", sendResult.err);
        react("");
      } else {
        react("✅");
      }
    } catch (err) {
      console.error("[TIKTOK ERROR]", err.message || err);
      react("❌");
    } finally {
      if (filePath) {
        const f = filePath;
        setTimeout(() => fs.remove(f).catch(() => {}), 60 * 1000);
      }
    }
  }
};
