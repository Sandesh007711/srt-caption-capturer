import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import {
  getGoogleAuthUrl,
  handleGoogleCallback,
  uploadSRT,
} from "./googleDrive.js";

dotenv.config();

const app = express();

const PORT = process.env.PORT || 5000;

const FRONTEND_URL =
  process.env.FRONTEND_URL ||
  "http://localhost:5173";

const UPLOAD_API_KEY =
  process.env.UPLOAD_API_KEY;


/* =====================================================
   SECURITY / MIDDLEWARE
===================================================== */

app.disable("x-powered-by");

app.use(
  cors({
    origin: FRONTEND_URL,
    methods: ["GET", "POST"],
    allowedHeaders: [
      "Content-Type",
      "x-api-key",
    ],
  })
);

app.use(
  express.json({
    limit: "10mb",
  })
);


/* =====================================================
   HEALTH CHECK
===================================================== */

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "SRT Caption Backend is running.",
  });
});


/* =====================================================
   GOOGLE AUTH
   ONLY NEEDED FOR INITIAL OWNER SETUP
===================================================== */

app.get("/auth/google", (req, res) => {
  try {
    const url = getGoogleAuthUrl();

    res.redirect(url);
  } catch (error) {
    console.error(
      "Google auth error:",
      error.message
    );

    res.status(500).send(
      "Google authentication could not be started."
    );
  }
});


/* =====================================================
   GOOGLE CALLBACK
===================================================== */

app.get(
  "/oauth2callback",
  async (req, res) => {
    try {
      const code = req.query.code;

      if (!code) {
        return res
          .status(400)
          .send(
            "Missing Google authorization code."
          );
      }

      const tokens =
        await handleGoogleCallback(code);

      /*
       * IMPORTANT:
       *
       * Do NOT print the refresh token
       * in production logs.
       */

      if (tokens.refresh_token) {
        console.log(
          "Google Drive authorization completed."
        );

        console.log(
          "A refresh token was received."
        );
      } else {
        console.log(
          "Google authorization completed."
        );
      }

      res.send(`
        <!DOCTYPE html>

        <html>
          <head>
            <title>Google Drive Connected</title>
          </head>

          <body
            style="
              font-family: Arial;
              padding: 40px;
              text-align: center;
            "
          >
            <h2>
              Google Drive Connected ✓
            </h2>

            <p>
              You can close this window.
            </p>
          </body>
        </html>
      `);

    } catch (error) {
      console.error(
        "OAuth callback error:",
        error.message
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
   API KEY PROTECTION
===================================================== */

function requireApiKey(
  req,
  res,
  next
) {
  /*
   * During local development, allow
   * the API if no key has been configured.
   */

  if (!UPLOAD_API_KEY) {
    return next();
  }

  const suppliedKey =
    req.headers["x-api-key"];

  if (
    !suppliedKey ||
    suppliedKey !== UPLOAD_API_KEY
  ) {
    return res
      .status(401)
      .json({
        success: false,
        message: "Unauthorized.",
      });
  }

  next();
}


/* =====================================================
   UPLOAD SRT
===================================================== */

app.post(
  "/api/upload-srt",
  requireApiKey,

  async (req, res) => {
    try {
      const {
        fileName,
        srtText,
      } = req.body;


      /* ---------------------------------------------
         VALIDATE FILE NAME
      --------------------------------------------- */

      if (
        !fileName ||
        typeof fileName !== "string"
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "File name is required.",
          });
      }


      /* ---------------------------------------------
         VALIDATE SRT
      --------------------------------------------- */

      if (
        !srtText ||
        typeof srtText !== "string"
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "SRT content is required.",
          });
      }


      /* ---------------------------------------------
         LIMIT SRT SIZE
      --------------------------------------------- */

      if (
        Buffer.byteLength(
          srtText,
          "utf8"
        ) > 5 * 1024 * 1024
      ) {
        return res
          .status(413)
          .json({
            success: false,
            message:
              "SRT file is too large.",
          });
      }


      /* ---------------------------------------------
         BASIC SRT VALIDATION
      --------------------------------------------- */

      if (
        !srtText.includes("-->")
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Invalid SRT content.",
          });
      }


      /* ---------------------------------------------
         UPLOAD
      --------------------------------------------- */

      const result =
        await uploadSRT({
          fileName,
          srtText,
        });


      /* ---------------------------------------------
         RESPONSE
      --------------------------------------------- */

      return res.json({
        success: true,

        message:
          "SRT uploaded successfully.",

        file: result,
      });

    } catch (error) {

      console.error(
        "SRT upload error:",
        error.message
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Could not upload SRT to Google Drive.",
        });
    }
  }
);


/* =====================================================
   404 HANDLER
===================================================== */

app.use(
  (req, res) => {
    res
      .status(404)
      .json({
        success: false,
        message:
          "Endpoint not found.",
      });
  }
);


/* =====================================================
   GLOBAL ERROR HANDLER
===================================================== */

app.use(
  (
    error,
    req,
    res,
    next
  ) => {
    console.error(
      "Unhandled server error:",
      error.message
    );

    res
      .status(500)
      .json({
        success: false,
        message:
          "Internal server error.",
      });
  }
);


/* =====================================================
   START SERVER
===================================================== */

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `SRT backend running on port ${PORT}`
    );

    console.log(
      `Frontend allowed: ${FRONTEND_URL}`
    );

    console.log(
      `Upload API protection: ${
        UPLOAD_API_KEY
          ? "ENABLED"
          : "DISABLED (development)"
      }`
    );
  }
);