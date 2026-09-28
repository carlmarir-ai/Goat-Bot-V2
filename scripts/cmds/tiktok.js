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

    if (!body || !messageID) return;

    const match = body.match(
      /https?:\/\/(?:www\.)?(?:tiktok\.com|vt\.tiktok\.com)\/[^\s]+/i
    );

    if (!match) return;

    const tiktokURL = match[0].replace(
      /[)\]}>.,]+$/,
      ""
    );

    let filePath = null;
    let sendingVideo = false;

    try {

      // =========================
      // ⏳ PROCESSING
      // =========================
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
        encodeURIComponent(tiktokURL);

      const response = await axios.get(
        workerURL,
        {
          timeout: 30000
        }
      );

      const data = response?.data;

      console.log(
        "[TIKTOK WORKER]",
        data
      );

      if (
        !data?.success ||
        !data?.download_url
      ) {
        throw new Error(
          "Worker did not return download_url"
        );
      }

      const videoURL =
        data.download_url;

      console.log(
        "[TIKTOK] Download URL received"
      );

      // =========================
      // CACHE
      // =========================
      const cacheDir =
        path.join(
          __dirname,
          "cache"
        );

      await fs.ensureDir(
        cacheDir
      );

      filePath =
        path.join(
          cacheDir,
          `tiktok_${Date.now()}_${Math.random()
            .toString(36)
            .slice(2)}.mp4`
        );

      // =========================
      // DOWNLOAD VIDEO
      // =========================
      const videoResponse =
        await axios.get(
          videoURL,
          {
            responseType: "stream",
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
            require("fs")
              .createWriteStream(
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

      // =========================
      // CHECK FILE
      // =========================
      if (
        !fs.existsSync(
          filePath
        )
      ) {
        throw new Error(
          "Video file does not exist"
        );
      }

      const stat =
        await fs.stat(
          filePath
        );

      console.log(
        "[TIKTOK] Video size:",
        stat.size,
        "bytes"
      );

      if (stat.size <= 0) {
        throw new Error(
          "Video file is empty"
        );
      }

      // =========================
      // START SENDING
      // =========================

      // IMPORTANT:
      // From this point, don't show ❌
      sendingVideo = true;

      console.log(
        "[TIKTOK] Sending video..."
      );

      api.sendMessage(
        {
          attachment:
            fs.createReadStream(
              filePath
            )
        },
        threadID,

        () => {

          console.log(
            "[TIKTOK] Video sent successfully"
          );

          // =========================
          // DELETE TEMP FILE
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
        err?.response?.data ||
        err?.message ||
        err
      );

      // =========================
      // ❌ ONLY REAL ERROR
      // =========================
      // If video sending already started,
      // DON'T change it to ❌.
      if (!sendingVideo) {

        api.setMessageReaction(
          "❌",
          messageID,
          () => {},
          true
        );
      }

      // Cleanup
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
          "[TIKTOK ERROR CLEANUP]",
          e
        );
      }
    }
  }
};
