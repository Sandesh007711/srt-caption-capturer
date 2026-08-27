import express from "express";

import cors from "cors";

import dotenv from "dotenv";

import {
  getGoogleAuthUrl,
  handleGoogleCallback,
  uploadSRT
} from "./googleDrive.js";

dotenv.config();

const app =
  express();


/* =====================================================
   MIDDLEWARE
===================================================== */

app.use(
  cors({
    origin: true
  })
);

app.use(
  express.json({
    limit: "10mb"
  })
);


/* =====================================================
   HEALTH CHECK
===================================================== */

app.get(
  "/",
  (req, res) => {
    res.json({
      success: true,

      message:
        "SRT Caption Backend is running."
    });
  }
);


/* =====================================================
   GOOGLE AUTH
===================================================== */

app.get(
  "/auth/google",
  (req, res) => {
    const url =
      getGoogleAuthUrl();

    res.redirect(url);
  }
);


/* =====================================================
   GOOGLE CALLBACK
===================================================== */

app.get(
  "/oauth2callback",
  async (req, res) => {
    try {
      const code =
        req.query.code;

      if (!code) {
        return res
          .status(400)
          .send(
            "Missing Google authorization code."
          );
      }

      const tokens =
        await handleGoogleCallback(
          code
        );

      /*
       * IMPORTANT:
       *
       * For local development we will
       * display the refresh token.
       *
       * NEVER put this token in GitHub.
       */

      console.log(
        "\n================================"
      );

      console.log(
        "GOOGLE REFRESH TOKEN:"
      );

      console.log(
        tokens.refresh_token
      );

      console.log(
        "================================\n"
      );

      res.send(`
        <html>
          <body
            style="
              font-family: Arial;
              padding: 40px;
            "
          >
            <h2>Google Drive Connected ✓</h2>

            <p>
              Check your backend terminal.
            </p>

            <p>
              The refresh token has been
              printed there.
            </p>

            <p>
              You can close this page.
            </p>
          </body>
        </html>
      `);

    } catch (error) {
      console.error(
        "OAuth callback error:",
        error
      );

      res
        .status(500)
        .send(
          "Google authorization failed."
        );
    }
  }
);


/* =====================================================
   UPLOAD SRT
===================================================== */

app.post(
  "/api/upload-srt",
  async (req, res) => {
    try {
      const {
        fileName,
        srtText
      } = req.body;

      if (!fileName) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "File name is required."
          });
      }

      if (!srtText) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "SRT content is required."
          });
      }

      const result =
        await uploadSRT({
          fileName,
          srtText
        });

      res.json({
        success: true,

        message:
          "SRT uploaded successfully.",

        file:
          result
      });

    } catch (error) {
      console.error(
        "SRT upload error:",
        error
      );

      res
        .status(500)
        .json({
          success: false,

          message:
            "Could not upload SRT to Google Drive.",

          error:
            error.message
        });
    }
  }
);


/* =====================================================
   SERVER
===================================================== */

const PORT =
  process.env.PORT || 5000;

 app.get("/api/test-drive", async (req, res) => {
  try {
    const result = await uploadSRT({
      fileName: "test-srt.srt",

      srtText: `1
00:00:00,000 --> 00:00:05,000
वत्स
आशुतोष पारीक

2
00:00:05,000 --> 00:00:10,000
कश्यप
राहुल शर्मा
`
    });

    res.json({
      success: true,
      message: "Google Drive upload successful!",
      file: result
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
}); 

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `SRT backend running on port ${PORT}`
    );
  }
);