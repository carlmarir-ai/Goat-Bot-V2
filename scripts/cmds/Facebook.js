const fs = require("fs-extra");
const axios = require("axios");
const request = require("request");
const path = require("path");

module.exports = {
  config: {
    name: "facebook",
    version: "1.0",
    author: "Aminul Sardar",
    countDown: 5,
    role: 0,
    shortDescription: "Auto download Facebook videos",
    category: "media"
  },

  onStart: async function () {},

  onChat: async function ({ api, event }) {
    const { threadID, messageID, body } = event;

    if (!body || !messageID) return;

    // Facebook links only
    const match = body.match(
      /https?:\/\/(?:www\.|m\.|web\.)?(?:facebook\.com|fb\.watch)\/[^\s]+/i
    );

    if (!match) return;

    const facebookURL = match[0].replace(/[)\]}>.,]+$/, "");

    try {
      // Downloading
      api.setMessageReaction(
        "⏳",
        messageID,
        () => {},
        true
      );

      // Cloudflare Worker
      const workerURL =
        "https://black-waterfall-01b9.jamesbaroyofficial.workers.dev/download?url=" +
        encodeURIComponent(facebookURL);

      const res = await axios.get(workerURL, {
        timeout: 30000
      });

      const data = res?.data;

      console.log("[FACEBOOK WORKER]", data);

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

      const cacheDir = path.join(__dirname, "cache");
      await fs.ensureDir(cacheDir);

      const filePath = path.join(
        cacheDir,
        `facebook_${Date.now()}.mp4`
      );

      // Download Facebook video
      request(videoURL)
        .on("error", (err) => {
          console.error(
            "[FACEBOOK DOWNLOAD ERROR]",
            err
          );

          try {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          } catch (e) {}

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

          // Video only
          api.sendMessage(
            {
              attachment: fs.createReadStream(filePath)
            },
            threadID,
            (err) => {

              try {
                if (fs.existsSync(filePath)) {
                  fs.unlinkSync(filePath);
                }
              } catch (e) {
                console.error(
                  "[FACEBOOK CLEANUP]",
                  e
                );
              }

              if (err) {
                console.error(
                  "[FACEBOOK SEND ERROR]",
                  err
                );

                api.setMessageReaction(
                  "❌",
                  messageID,
                  () => {},
                  true
                );
              } else {
                // ⏳ → ✅
                api.setMessageReaction(
                  "✅",
                  messageID,
                  () => {},
                  true
                );
              }
            },
            messageID
          );
        });

    } catch (err) {
      console.error(
        "[FACEBOOK ERROR]",
        err
      );

      api.setMessageReaction(
        "❌",
        messageID,
        () => {},
        true
      );
    }
  }
};
