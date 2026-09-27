const axios = require("axios");

module.exports = {
  config: {
    name: "autolink",
    version: "3.0",
    author: "Aminul Sardar",
    countDown: 5,
    role: 0,
    shortDescription: "Auto handle TikTok and Facebook videos",
    category: "media"
  },

  onStart: async function () {},

  onChat: async function ({ api, event }) {
    const { threadID, messageID, body } = event;

    if (!body || !messageID) return;

    const match = body.match(/https?:\/\/[^\s]+/i);
    if (!match) return;

    const url = match[0].replace(/[)\]}>.,]+$/, "");

    try {
      // Downloading
      api.setMessageReaction("⏳", messageID, () => {}, true);

      // Cloudflare Worker
      const workerURL =
        "https://black-waterfall-01b9.jamesbaroyofficial.workers.dev/download?url=" +
        encodeURIComponent(url);

      const res = await axios.get(workerURL, {
        timeout: 30000
      });

      const data = res?.data;

      if (!data?.success || !data?.download_url) {
        api.setMessageReaction("❌", messageID, () => {}, true);
        return;
      }

      const videoURL = data.download_url;

      /*
       * IMPORTANT:
       * No fs.createWriteStream()
       * No request(videoURL)
       * No local MP4
       *
       * The URL is sent directly to FCA.
       */
      api.sendMessage(
        {
          url: videoURL
        },
        threadID,
        (err) => {
          if (err) {
            console.error("[AUTOLINK URL SEND ERROR]", err);
            api.setMessageReaction(
              "❌",
              messageID,
              () => {},
              true
            );
            return;
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
      console.error("[AUTOLINK ERROR]", err);

      api.setMessageReaction(
        "❌",
        messageID,
        () => {},
        true
      );
    }
  }
};
