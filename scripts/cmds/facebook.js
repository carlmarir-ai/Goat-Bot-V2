const axios = require("axios");

module.exports = {
  config: {
    name: "facebook",
    version: "1.2",
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

    // First try attachment URL
    if (Array.isArray(attachments)) {
      for (const attachment of attachments) {
        if (
          attachment?.facebookUrl &&
          /facebook\.com/i.test(
            attachment.facebookUrl
          )
        ) {
          facebookURL = attachment.facebookUrl;
          break;
        }

        if (
          attachment?.url &&
          /facebook\.com/i.test(
            attachment.url
          )
        ) {
          facebookURL = attachment.url;
          break;
        }
      }
    }

    // If no attachment URL, use message body
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

    console.log(
      "[FACEBOOK] URL:",
      facebookURL
    );

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
      // CLOUDFLARE WORKER
      // ==========================================
      const workerURL =
        "https://black-waterfall-01b9.jamesbaroyofficial.workers.dev/download?url=" +
        encodeURIComponent(facebookURL);

      const workerResponse =
        await axios.get(workerURL, {
          timeout: 30000
        });

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
      // DOWNLOAD VIDEO
      // ==========================================
      const videoResponse =
        await axios.get(
          data.download_url,
          {
            responseType:
              "arraybuffer",
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

      const videoBuffer =
        Buffer.from(
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

      // ==========================================
      // SEND VIDEO
      // ==========================================
      api.sendMessage(
        {
          attachment: videoBuffer
        },
        threadID,
        (err, info) => {

          console.log(
            "[FACEBOOK SEND CALLBACK]",
            err || info
          );

          // IMPORTANT:
          // Do NOT mark success when messageID is null
          if (
            err ||
            !info ||
            !info.messageID
          ) {
            console.error(
              "[FACEBOOK] Attachment was not confirmed by FCA"
            );

            api.setMessageReaction(
              "❌",
              messageID,
              () => {},
              true
            );

            return;
          }

          console.log(
            "[FACEBOOK] VIDEO SENT:",
            info.messageID
          );

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
