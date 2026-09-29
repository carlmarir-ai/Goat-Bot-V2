const fs = require("fs-extra");
const axios = require("axios");
const path = require("path");

module.exports = {
  config: {
    name: "facebook",
    version: "1.3",
    author: "Aminul Sardar",
    countDown: 5,
    role: 0,
    shortDescription: "Auto download Facebook videos",
    category: "media"
  },

  onStart: async function () {},

  onChat: async function ({ api, event }) {
    const {
      threadID,
      messageID,
      body,
      attachments
    } = event;

    if (!messageID) return;

    // ==========================================
    // FIND FACEBOOK URL
    // ==========================================
    let facebookURL = null;

    // Prefer the actual Reel URL detected by FCA
    if (Array.isArray(attachments)) {
      for (const attachment of attachments) {
        if (
          attachment?.facebookUrl &&
          /facebook\.com/i.test(
            attachment.facebookUrl
          )
        ) {
          facebookURL =
            attachment.facebookUrl;
          break;
        }

        if (
          attachment?.url &&
          /facebook\.com/i.test(
            attachment.url
          )
        ) {
          facebookURL =
            attachment.url;
          break;
        }
      }
    }

    // Fallback to message body
    if (!facebookURL && body) {
      const match = body.match(
        /https?:\/\/(?:www\.|m\.|web\.)?(?:facebook\.com|fb\.watch)\/[^\s]+/i
      );

      if (match) {
        facebookURL = match[0]
          .replace(/[)\]}>.,]+$/, "");
      }
    }

    if (!facebookURL) return;

    // ==========================================
    // SKIP NON-FACEBOOK LINKS (hal. TikTok)
    // Minsan l.facebook.com/l.php?u=<link> ang url ng attachment,
    // kaya nasasalo nito ang TikTok. Hawak iyon ng tiktok.js.
    // ==========================================
    let realURL = facebookURL;
    try {
      const u = new URL(facebookURL);
      if (/^l\.facebook\.com$/i.test(u.hostname) && u.searchParams.get("u")) {
        realURL = u.searchParams.get("u");
      }
    } catch (e) {}

    if (
      /tiktok\.com/i.test(body || "") ||
      !/(?:facebook\.com|fb\.watch)/i.test(realURL) ||
      /^https?:\/\/l\.facebook\.com/i.test(facebookURL)
    ) {
      return;
    }

    console.log(
      "[FACEBOOK] URL:",
      facebookURL
    );

    let filePath = null;

    try {
      // ==========================================
      // ⏳
      // ==========================================
      api.setMessageReaction(
        "⏳",
        messageID,
        () => {},
        true
      );

      // ==========================================
      // CACHE DIRECTORY
      // ==========================================
      const cacheDir =
        path.join(__dirname, "cache");

      await fs.ensureDir(cacheDir);

      filePath = path.join(
        cacheDir,
        `facebook_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2)}.mp4`
      );

      // ==========================================
      // CLOUDFLARE WORKER
      // ==========================================
      const workerURL =
        "https://black-waterfall-01b9.jamesbaroyofficial.workers.dev/download?url=" +
        encodeURIComponent(facebookURL);

      const workerResponse =
        await axios.get(
          workerURL,
          {
            timeout: 30000
          }
        );

      const data =
        workerResponse?.data;

      console.log(
        "[FACEBOOK WORKER]",
        data
      );

      if (
        !data?.success ||
        !data?.download_url
      ) {
        throw new Error(
          "No Facebook download URL"
        );
      }

      // ==========================================
      // DOWNLOAD MP4 TO FILE
      // ==========================================
      const videoResponse =
        await axios.get(
          data.download_url,
          {
            responseType:
              "stream",
            timeout: 60000,
            maxContentLength:
              Infinity,
            maxBodyLength:
              Infinity,
            headers: {
              "User-Agent":
                "Mozilla/5.0"
            }
          }
        );

      await new Promise(
        (resolve, reject) => {
          const writer =
            require("fs").createWriteStream(
              filePath
            );

          videoResponse.data.pipe(
            writer
          );

          writer.on(
            "finish",
            resolve
          );

          writer.on(
            "error",
            reject
          );

          videoResponse.data.on(
            "error",
            reject
          );
        }
      );

      // ==========================================
      // CHECK FILE
      // ==========================================
      const stat =
        await fs.stat(filePath);

      console.log(
        "[FACEBOOK] Video size:",
        stat.size,
        "bytes"
      );

      if (!stat.size) {
        throw new Error(
          "Downloaded video is empty"
        );
      }

      // ==========================================
      // SEND FILE AS STREAM
      // ==========================================
      const stream =
        fs.createReadStream(
          filePath
        );

      api.sendMessage(
        {
          attachment: stream
        },
        threadID,
        (err, info) => {

          console.log(
            "[FACEBOOK SEND CALLBACK]",
            err || info
          );

          // ======================================
          // CALLBACK ERROR
          // ======================================
          if (err) {
            console.error(
              "[FACEBOOK SEND ERROR]",
              err
            );

            try {
              if (
                filePath &&
                fs.existsSync(filePath)
              ) {
                fs.unlinkSync(filePath);
              }
            } catch (e) {}

            api.setMessageReaction(
              "❌",
              messageID,
              () => {},
              true
            );

            return;
          }

          // ======================================
          // SEND CALLBACK RECEIVED
          // ======================================
          console.log(
            "[FACEBOOK] Send callback received"
          );

          try {
            if (
              filePath &&
              fs.existsSync(filePath)
            ) {
              fs.unlinkSync(filePath);
            }
          } catch (e) {
            console.error(
              "[FACEBOOK CLEANUP]",
              e
            );
          }

          api.setMessageReaction(
            "✅",
            messageID,
            () => {},
            true
          );
        },

        messageID
      );

    } catch (err) {

      console.error(
        "[FACEBOOK ERROR]",
        err
      );

      try {
        if (
          filePath &&
          fs.existsSync(filePath)
        ) {
          fs.unlinkSync(filePath);
        }
      } catch (e) {}

      api.setMessageReaction(
        "❌",
        messageID,
        () => {},
        true
      );
    }
  }
};
