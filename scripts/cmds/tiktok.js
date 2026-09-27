const fs = require("fs-extra");
const axios = require("axios");
const request = require("request");
const path = require("path");

module.exports = {
  config: {
    name: "tiktok",
    version: "1.1",
    author: "Aminul Sardar",
    countDown: 5,
    role: 0,
    shortDescription: "Auto download TikTok videos",
    category: "media"
  },

  onStart: async function () {},

  onChat: async function ({ api, event }) {
    try {
      const { threadID, messageID, body } = event;

      if (!body || !messageID) return;

      const match = body.match(
        /https?:\/\/(?:www\.)?(?:tiktok\.com|vt\.tiktok\.com)\/[^\s]+/i
      );

      if (!match) return;

      const tiktokURL = match[0].replace(/[)\]}>.,]+$/, "");

      // ⏳ Downloading
      api.setMessageReaction(
        "⏳",
        messageID,
        () => {},
        true
      );

      const workerURL =
        "https://black-waterfall-01b9.jamesbaroyofficial.workers.dev/download?url=" +
        encodeURIComponent(tiktokURL);

      const response = await axios.get(workerURL, {
        timeout: 30000
      });

      const data = response?.data;

      if (!data?.success || !data?.download_url) {
        api.setMessageReaction(
          "❌",
          messageID,
          () => {},
          true
        );
        return;
      }

      const videoURL = data.download_url;

      const filePath = path.join(
        __dirname,
        "cache",
        `tiktok_${Date.now()}.mp4`
      );

      await fs.ensureDir(path.dirname(filePath));

      request(videoURL)
        .on("error", (err) => {
          console.error("[TIKTOK DOWNLOAD]", err);

          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }

          api.setMessageReaction(
            "❌",
            messageID,
            () => {},
            true
          );
        })
        .pipe(fs.createWriteStream(filePath))
        .on("close", () => {

          if (!fs.existsSync(filePath)) {
            api.setMessageReaction(
              "❌",
              messageID,
              () => {},
              true
            );
            return;
          }

          api.sendMessage(
            {
              attachment: fs.createReadStream(filePath)
            },
            threadID,
            () => {

              // Delete temporary video
              try {
                if (fs.existsSync(filePath)) {
                  fs.unlinkSync(filePath);
                }
              } catch (e) {
                console.error("[TIKTOK CLEANUP]", e);
              }

              // ⏳ → ✅
              api.setMessageReaction(
                "✅",
                messageID,
                () => {},
                true
              );
            },
            messageID
          );
        });

    } catch (err) {
      console.error("[TIKTOK ERROR]", err);

      api.setMessageReaction(
        "❌",
        event.messageID,
        () => {},
        true
      );
    }
  }
};
