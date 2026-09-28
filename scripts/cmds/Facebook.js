const fs = require("fs-extra");
const axios = require("axios");

module.exports = {
  config: {
    name: "facebook",
    version: "2.0",
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
      // ⏳ Downloading
      api.setMessageReaction(
        "⏳",
        messageID,
        () => {},
        true
      );

      // =========================
      // CLOUDFLARE WORKER
      // =========================
      const workerURL =
        "https://black-waterfall-01b9.jamesbaroyofficial.workers.dev/download?url=" +
        encodeURIComponent(facebookURL);

      const workerResponse = await axios.get(workerURL, {
        timeout: 30000
      });

      const data = workerResponse?.data;

      console.log("[FACEBOOK WORKER]", data);

      if (!data?.success || !data?.download_url) {
        console.error(
          "[FACEBOOK] No download URL received"
        );

        api.setMessageReaction(
          "❌",
          messageID,
          () => {},
          true
        );

        return;
      }

      const videoURL = data.download_url;

      console.log(
        "[FACEBOOK] Download URL received"
      );

      // =========================
      // DOWNLOAD VIDEO AS BUFFER
      // =========================
      const videoResponse = await axios.get(videoURL, {
        responseType: "arraybuffer",
        timeout: 60000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });

      const videoBuffer = Buffer.from(
        videoResponse.data
      );

      console.log(
        "[FACEBOOK] Video size:",
        videoBuffer.length,
        "bytes"
      );

      if (!videoBuffer.length) {
        throw new Error(
          "Downloaded video is empty"
        );
      }

      // =========================
      // SEND VIDEO
      // =========================
      api.sendMessage(
        {
          attachment: videoBuffer
        },
        threadID,
        (err, messageInfo) => {

          console.log(
            "[FACEBOOK SEND]",
            err || messageInfo
          );

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

            return;
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
