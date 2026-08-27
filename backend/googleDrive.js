import { google } from "googleapis";
import dotenv from "dotenv";
import { Readable } from "node:stream";

dotenv.config();

const SCOPES = [
  "https://www.googleapis.com/auth/drive",
];

const ROOT_FOLDER_ID = "root";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

if (process.env.GOOGLE_REFRESH_TOKEN) {
  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });
}

const drive = google.drive({
  version: "v3",
  auth: oauth2Client,
});

/* =====================================================
   GOOGLE AUTH URL
===================================================== */

export function getGoogleAuthUrl() {
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });
}

/* =====================================================
   GOOGLE CALLBACK
===================================================== */

export async function handleGoogleCallback(code) {
  const { tokens } = await oauth2Client.getToken(code);

  oauth2Client.setCredentials(tokens);

  return tokens;
}

/* =====================================================
   ESCAPE DRIVE QUERY
===================================================== */

function escapeQuery(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'");
}

/* =====================================================
   FIND FOLDER
===================================================== */

async function findFolder(
  name,
  parentId = ROOT_FOLDER_ID
) {
  const safeName = escapeQuery(name);

  const response = await drive.files.list({
    q:
  `name = '${safeName}' ` +
  `and mimeType = 'application/vnd.google-apps.folder' ` +
  `and trashed = false ` +
  `and '${parentId}' in parents`,

    fields:
      "files(id,name,parents,mimeType)",

    pageSize: 10,

    orderBy: "createdTime",
  });

  const folder =
    response.data.files?.[0] || null;

  if (folder) {
    console.log(
      `[Drive] Found folder: ${folder.name} (${folder.id})`
    );
  }

  return folder;
}

/* =====================================================
   CREATE FOLDER
===================================================== */

async function createFolder(
  name,
  parentId = ROOT_FOLDER_ID
) {
  const response = await drive.files.create({
    requestBody: {
      name,

      mimeType:
        "application/vnd.google-apps.folder",

      parents: [parentId],
    },

    fields:
      "id,name,parents,mimeType",
  });

  console.log(
    `[Drive] Created folder: ${name} (${response.data.id})`
  );

  return response.data;
}

/* =====================================================
   GET OR CREATE FOLDER
===================================================== */

async function getOrCreateFolder(
  name,
  parentId = ROOT_FOLDER_ID
) {
  const existing =
    await findFolder(
      name,
      parentId
    );

  if (existing) {
    return existing;
  }

  return createFolder(
    name,
    parentId
  );
}

/* =====================================================
   MAIN SRT FOLDER
===================================================== */

async function getMainFolder() {
  return getOrCreateFolder(
    "SRT Captions",
    ROOT_FOLDER_ID
  );
}

/* =====================================================
   TODAY DATE FOLDER
===================================================== */

async function getDateFolder() {
  const mainFolder =
    await getMainFolder();

  const now = new Date();

  const day =
    String(now.getDate())
      .padStart(2, "0");

  const month =
    String(now.getMonth() + 1)
      .padStart(2, "0");

  const year =
    now.getFullYear();

  const folderName =
    `${day}-${month}-${year}`;

  const dateFolder =
    await getOrCreateFolder(
      folderName,
      mainFolder.id
    );

  console.log(
    `[Drive] Upload folder: ` +
    `SRT Captions/${folderName} ` +
    `(${dateFolder.id})`
  );

  return dateFolder;
}

/* =====================================================
   CLEAN FILE NAME
===================================================== */

function cleanSRTFileName(fileName) {
  let name =
    String(
      fileName ||
      "chadhava-captions"
    ).trim();

  // Remove Excel extension
  name = name.replace(
    /\.(xlsx|xls)$/i,
    ""
  );

  // Remove existing SRT extension
  name = name.replace(
    /\.srt$/i,
    ""
  );

  return `${name}.srt`;
}

/* =====================================================
   UPLOAD SRT
===================================================== */

export async function uploadSRT({
  fileName,
  srtText,
}) {
  if (!fileName) {
    throw new Error(
      "SRT file name is required."
    );
  }

  if (!srtText) {
    throw new Error(
      "SRT content is empty."
    );
  }

  /*
   * First create/find:
   *
   * My Drive
   *    └── SRT Captions
   *          └── DD-MM-YYYY
   */

  const dateFolder =
    await getDateFolder();

  const finalFileName =
    cleanSRTFileName(fileName);

  const srtStream =
    Readable.from([
      Buffer.from(
        srtText,
        "utf8"
      ),
    ]);

  console.log(
    `[Drive] Uploading "${finalFileName}" ` +
    `to folder ID ${dateFolder.id}`
  );

  const response =
    await drive.files.create({
      requestBody: {
        name: finalFileName,

        /*
         * THIS IS THE IMPORTANT PART.
         *
         * The SRT file is explicitly placed
         * inside today's date folder.
         */

        parents: [
          dateFolder.id,
        ],

        mimeType:
          "application/x-subrip",
      },

      media: {
        mimeType:
          "application/x-subrip",

        body: srtStream,
      },

      fields:
        "id,name,parents,webViewLink",
    });

  console.log(
    `[Drive] Uploaded: ` +
    `${response.data.name} ` +
    `(${response.data.id})`
  );

  console.log(
    "[Drive] File parents:",
    response.data.parents
  );

  return {
    id:
      response.data.id,

    name:
      response.data.name,

    link:
      response.data.webViewLink,

    folder:
      dateFolder.name,

    folderId:
      dateFolder.id,
  };
}