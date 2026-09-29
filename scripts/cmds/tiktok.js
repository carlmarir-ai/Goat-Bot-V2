const fs = require("fs-extra");
const axios = require("axios");
const path = require("path");

module.exports = {
  config: {
    name: "tiktok",
    version: "1.3",
    author: "Aminul Sardar",
    countDown: 5,
    role: 0,
    shortDescription: "Auto download TikTok videos",
    category: "media"
  },

  onStart: async function () {},

  onChat: async function ({ api, event }) {

    const {
      threadID,
      messageID,
      body
    } = event;

    if (!messageID) return;

    let tiktokURL = null;

    // =========================
    // GET TIKTOK URL
    // =========================
    if (body) {

      const match = body.match(
        /https?:\/\/(?:www\.)?(?:tiktok\.com|vt\.tiktok\.com)\/[^\s]+/i
      );

      if (match) {
        tiktokURL = match[0]
          .replace(/[)\]}>.,]+$/, "");
      }
    }

    if (!tiktokURL) return;

    console.log(
      "[TIKTOK] URL:",
      tiktokURL
    );

    let filePath = null;

    try {

      // =========================
      // ⏳
      // =========================
      api.setMessageReaction(
        "⏳",
        messageID,
        () => {},
        true
      );

      const cacheDir =
        path.join(
          __dirname,
          "cache"
        );

      await fs.ensureDir(
        cacheDir
      );

      filePath = path.join(
        cacheDir,
        `tiktok_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2)}.mp4`
      );

      // =========================
      // CLOUDFLARE WORKER
      // =========================
      const workerURL =
        "https://black-waterfall-01b9.jamesbaroyofficial.workers.dev/download?url=" +
        encodeURIComponent(tiktokURL);

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
        "[TIKTOK WORKER]",
        data
      );

      if (
        !data?.success ||
        !data?.download_url
      ) {
        throw new Error(
          "No TikTok download URL"
        );
      }

      // =========================
      // DOWNLOAD VIDEO
      // =========================
      const videoResponse =
        await axios.get(
          data.download_url,
          {
            responseType:
              "stream",

            timeout:
              60000,

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

      const stat =
        await fs.stat(
          filePath
        );

      console.log(
        "[TIKTOK] Video size:",
        stat.size,
        "bytes"
      );

      if (!stat.size) {
        throw new Error(
          "Downloaded video is empty"
        );
      }

      // =========================
      // SEND VIDEO
      // SAME STYLE AS FACEBOOK.JS
      // =========================
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
            "[TIKTOK SEND CALLBACK]",
            err || info
          );

          if (err) {

            console.error(
              "[TIKTOK SEND ERROR]",
              err
            );

            try {
              if (
                filePath &&
                fs.existsSync(
                  filePath
                )
              ) {
                fs.unlinkSync(
                  filePath
                );
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

          console.log(
            "[TIKTOK] Send callback received"
          );

          // =========================
          // CLEANUP
          // =========================
          try {

            if (
              filePath &&
              fs.existsSync(
                filePath
              )
            ) {
              fs.unlinkSync(
                filePath
              );
            }

          } catch (e) {

            console.error(
              "[TIKTOK CLEANUP]",
              e
            );
          }

          // =========================
          // ⏳ → ✅
          // =========================
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
        "[TIKTOK ERROR]",
        err
      );

      // =========================
      // CLEANUP ON ERROR
      // =========================
      try {

        if (
          filePath &&
          fs.existsSync(
            filePath
          )
        ) {
          fs.unlinkSync(
            filePath
          );
        }

      } catch (e) {}

      // =========================
      // ❌
      // =========================
      api.setMessageReaction(
        "❌",
        messageID,
        () => {},
        true
      );
    }
  }
};
