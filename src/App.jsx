import { useState, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import "./App.css";


/* =========================================================
   HELPERS
========================================================= */

function cleanText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value)
    .replace(/\r/g, "")
    .replace(/\u0000/g, "")
    .trim();
}

function parseGotraAndName(value) {
  const text = cleanText(value);

  if (!text) {
    return {
      gotra: "",
      name: "",
    };
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length >= 2) {
    return {
      gotra: lines[0],
      name: lines.slice(1).join(" "),
    };
  }

  return {
    gotra: lines[0] || "",
    name: "",
  };
}


/* =========================================================
   EXCEL PARSER
========================================================= */

async function parseExcel(file) {
  const arrayBuffer = await file.arrayBuffer();

  const workbook = XLSX.read(arrayBuffer, {
    type: "array",
  });

  const sheetName = workbook.SheetNames[0];

  const worksheet = workbook.Sheets[sheetName];

  const rows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: "",
  });

  let headerIndex = -1;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || [];

    const rowText = row
      .map((cell) => cleanText(cell))
      .join(" ")
      .toLowerCase();

    if (
      rowText.includes("chadhava name") &&
      rowText.includes("sr.no.")
    ) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    throw new Error(
      "Could not find the Excel column headers."
    );
  }

  const headers = rows[headerIndex].map((header) =>
    cleanText(header)
  );

  const findColumn = (searchText) => {
    return headers.findIndex((header) =>
      header
        .toLowerCase()
        .includes(searchText.toLowerCase())
    );
  };

  const chadhavaColumn = findColumn("Chadhava Name");
  const countColumn = findColumn("Count");
  const srNoColumn = findColumn("Sr.No.");
  const hindiColumn = findColumn("Gotra & Name (Hindi)");
  const englishColumn = findColumn("Gotra & Name");

  if (srNoColumn === -1) {
    throw new Error(
      "Sr.No. column was not found."
    );
  }

  if (
    hindiColumn === -1 &&
    englishColumn === -1
  ) {
    throw new Error(
      "Gotra & Name column was not found."
    );
  }

  const records = [];

  let currentChadhava = "";

  for (
    let i = headerIndex + 1;
    i < rows.length;
    i++
  ) {
    const row = rows[i] || [];

    const chadhavaValue = cleanText(
      row[chadhavaColumn]
    );

    if (chadhavaValue) {
      currentChadhava = chadhavaValue;
    }

    const srNoValue = cleanText(
      row[srNoColumn]
    );

    if (!srNoValue) {
      continue;
    }

    const srNo = Number(srNoValue);

    if (Number.isNaN(srNo)) {
      continue;
    }

    let gotraNameValue = "";

    if (hindiColumn !== -1) {
      gotraNameValue = cleanText(
        row[hindiColumn]
      );
    }

    if (
      !gotraNameValue &&
      englishColumn !== -1
    ) {
      gotraNameValue = cleanText(
        row[englishColumn]
      );
    }

    const { gotra, name } =
      parseGotraAndName(
        gotraNameValue
      );

    if (!gotra && !name) {
      continue;
    }

    records.push({
      id: `${srNo}-${i}`,
      chadhava: currentChadhava,
      count:
        countColumn !== -1
          ? cleanText(row[countColumn])
          : "",
      srNo,
      gotra,
      name,
    });
  }

  if (records.length === 0) {
    throw new Error(
      "No valid records were found in the Excel file."
    );
  }

  records.sort(
    (a, b) => a.srNo - b.srNo
  );

  return records;
}


/* =========================================================
   SRT TIME
========================================================= */

function formatSRTTime(milliseconds) {
  const totalMs = Math.max(
    0,
    Math.round(milliseconds)
  );

  const hours = Math.floor(
    totalMs / 3600000
  );

  const minutes = Math.floor(
    (totalMs % 3600000) / 60000
  );

  const seconds = Math.floor(
    (totalMs % 60000) / 1000
  );

  const ms = totalMs % 1000;

  return (
    String(hours).padStart(2, "0") +
    ":" +
    String(minutes).padStart(2, "0") +
    ":" +
    String(seconds).padStart(2, "0") +
    "," +
    String(ms).padStart(3, "0")
  );
}


/* =========================================================
   CREATE SRT
========================================================= */

function createSRT(records, timings) {
  const captions = [];

  records.forEach((person, index) => {
    const timing = timings[index];

    if (!timing) {
      return;
    }

    if (
      timing.start === null ||
      timing.end === null
    ) {
      return;
    }

    const caption = [
      person.gotra,
      person.name,
    ].join("\n");

    captions.push(
      `${captions.length + 1}\n` +
      `${formatSRTTime(
        timing.start
      )} --> ${formatSRTTime(
        timing.end
      )}\n` +
      `${caption}\n`
    );
  });

  return captions.join("\n");
}


/* =========================================================
   DOWNLOAD SRT
========================================================= */

function downloadSRT(records, timings) {
  const srt = createSRT(
    records,
    timings
  );

  if (!srt.trim()) {
    alert(
      "No completed captions available."
    );

    return;
  }

  const blob = new Blob(
    [srt],
    {
      type:
        "text/plain;charset=utf-8",
    }
  );

  const url =
    URL.createObjectURL(blob);

  const link =
    document.createElement("a");

  link.href = url;

  link.download =
    "chadhava-captions.srt";

  document.body.appendChild(link);

  link.click();

  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}


/* =========================================================
   UPLOAD SRT TO GOOGLE DRIVE BACKEND
========================================================= */

async function uploadSRTToGoogleDrive(
  records,
  timings,
  excelFileName
) {
  const srt = createSRT(records, timings);

  if (!srt.trim()) {
    throw new Error(
      "No completed captions are available."
    );
  }

  const fileName =
    (excelFileName || "chadhava-captions.xlsx")
      .replace(/\.(xlsx|xls)$/i, "") +
    ".srt";

  const apiBaseUrl =
    import.meta.env.VITE_API_URL ||
    "http://localhost:5000";

  const uploadApiKey =
    import.meta.env.VITE_UPLOAD_API_KEY;

  if (!uploadApiKey) {
    throw new Error(
      "VITE_UPLOAD_API_KEY is missing. Add it to the frontend .env file and restart Vite."
    );
  }

  const response = await fetch(
  `${apiBaseUrl}/api/upload-srt`,
  {
    method: "POST",

    headers: {
      "Content-Type": "application/json",

      "x-api-key":
        import.meta.env.VITE_UPLOAD_API_KEY
    },

    body: JSON.stringify({
      fileName,
      srtText: srt
    })
  }
);

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error(
      "Backend returned an invalid response."
    );
  }

  if (!response.ok || !data?.success) {
    throw new Error(
      data?.message ||
      data?.error ||
      "Could not upload SRT to Google Drive."
    );
  }

  return data.file;
}


/* =========================================================
   APP
========================================================= */

function App() {

  const [records, setRecords] =
    useState([]);

  const [currentIndex, setCurrentIndex] =
    useState(0);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [elapsed, setElapsed] =
    useState(0);

  const [isRecording, setIsRecording] =
    useState(false);

  const [isEnded, setIsEnded] =
    useState(false);

  const [showExport, setShowExport] =
    useState(false);

  const [excelFileName, setExcelFileName] =
    useState("");

  const [driveUploading, setDriveUploading] =
    useState(false);

  const [driveUploadStatus, setDriveUploadStatus] =
    useState("");

  const [driveFile, setDriveFile] =
    useState(null);

  /*
   * Each item:
   *
   * {
   *   start: milliseconds,
   *   end: milliseconds
   * }
   */

  const timingsRef =
    useRef([]);

  /*
   * Total recording clock.
   */

  const recordingStartRef =
    useRef(null);

  /*
   * Accumulated time when paused.
   */

  const accumulatedRef =
    useRef(0);

  /*
   * Timestamp when current run started.
   */

  const runStartRef =
    useRef(null);

  /*
   * Start time of current person.
   */

  const currentPersonStartRef =
    useRef(0);


  const currentPerson =
    records[currentIndex];


  /* =======================================================
     TIMER
  ======================================================= */

  useEffect(() => {

    if (!isRecording) {
      return;
    }

    const interval =
      setInterval(() => {

        if (
          runStartRef.current !== null
        ) {

          const currentRun =
            Date.now() -
            runStartRef.current;

          setElapsed(
            accumulatedRef.current +
            currentRun
          );
        }

      }, 50);

    return () =>
      clearInterval(interval);

  }, [isRecording]);


  /* =======================================================
     START NEW RECORDING
  ======================================================= */

  const startRecording = () => {

    if (recordingStartRef.current === null) {

      const now =
        Date.now();

      recordingStartRef.current =
        now;

      runStartRef.current =
        now;

      accumulatedRef.current =
        0;

      currentPersonStartRef.current =
        0;

      setElapsed(0);

    } else {

      /*
       * Resume after pause.
       */

      runStartRef.current =
        Date.now();
    }

    setIsRecording(true);
  };


  /* =======================================================
     PAUSE
  ======================================================= */

  const pauseRecording = () => {

    if (!isRecording) {
      return;
    }

    if (
      runStartRef.current !== null
    ) {

      accumulatedRef.current +=
        Date.now() -
        runStartRef.current;
    }

    runStartRef.current =
      null;

    setElapsed(
      accumulatedRef.current
    );

    setIsRecording(false);
  };


  /* =======================================================
     GET CURRENT ELAPSED
  ======================================================= */

  const getElapsed = () => {

    if (
      !recordingStartRef.current
    ) {
      return 0;
    }

    if (
      runStartRef.current !== null
    ) {

      return (
        accumulatedRef.current +
        (
          Date.now() -
          runStartRef.current
        )
      );
    }

    return accumulatedRef.current;
  };


  /* =======================================================
     FINISH CURRENT PERSON
  ======================================================= */

  const finishCurrentPerson = () => {

    const end =
      getElapsed();

    const start =
      currentPersonStartRef.current;

    timingsRef.current[
      currentIndex
    ] = {
      start,
      end,
    };

    return end;
  };


  /* =======================================================
     NEXT
  ======================================================= */

  const nextPerson = () => {

    if (
      currentIndex >=
      records.length - 1
    ) {
      return;
    }

    /*
     * Save current person's
     * real end time.
     */

    const end =
      finishCurrentPerson();


    /*
     * Next person starts exactly
     * where previous ended.
     */

    currentPersonStartRef.current =
      end;


    /*
     * Clear any old timing for
     * the next person.
     *
     * This is important if the user
     * previously went backward.
     */

    timingsRef.current[
      currentIndex + 1
    ] = null;


    setCurrentIndex(
      (value) => value + 1
    );


    /*
     * Keep recording state.
     */

    if (!isRecording) {
      startRecording();
    }
  };


  /* =======================================================
     PREVIOUS
  ======================================================= */

  const previousPerson = () => {

    if (
      currentIndex <= 0
    ) {
      return;
    }


    /*
     * Delete the timing of the
     * person we are leaving.
     */

    timingsRef.current[
      currentIndex
    ] = null;


    /*
     * Move backward.
     */

    const previousIndex =
      currentIndex - 1;


    /*
     * Delete previous person's
     * old timing too.
     *
     * We are going to rerecord it.
     */

    timingsRef.current[
      previousIndex
    ] = null;


    /*
     * New recording starts NOW
     * for the previous person.
     */

    const newStart =
      getElapsed();


    currentPersonStartRef.current =
      newStart;


    setCurrentIndex(
      previousIndex
    );


    /*
     * If paused, resume automatically.
     */

    if (!isRecording) {
      startRecording();
    }

  };


  /* =======================================================
     END RECORDING
  ======================================================= */

  const endRecording = () => {

    if (isEnded) {
      return;
    }


    /*
     * Final person gets its
     * actual end time.
     */

    finishCurrentPerson();


    /*
     * Pause timer.
     */

    if (isRecording) {

      if (
        runStartRef.current !== null
      ) {

        accumulatedRef.current +=
          Date.now() -
          runStartRef.current;
      }

      runStartRef.current =
        null;
    }


    setElapsed(
      accumulatedRef.current
    );

    setIsRecording(false);

    setIsEnded(true);

    setShowExport(true);
  };


  /* =======================================================
     UPLOAD
  ======================================================= */

  const handleUpload =
    async (event) => {

      const file =
        event.target.files?.[0];

      if (!file) {
        return;
      }

      setLoading(true);

      setError("");

      setRecords([]);

      setCurrentIndex(0);

      timingsRef.current = [];

      recordingStartRef.current =
        null;

      accumulatedRef.current =
        0;

      runStartRef.current =
        null;

      currentPersonStartRef.current =
        0;

      setElapsed(0);

      setIsRecording(false);

      setIsEnded(false);

      setShowExport(false);

      setExcelFileName(file.name);
      setDriveUploading(false);
      setDriveUploadStatus("");
      setDriveFile(null);

      try {

        const parsedRecords =
          await parseExcel(file);

        setRecords(
          parsedRecords
        );

        timingsRef.current =
          parsedRecords.map(
            () => null
          );

        /*
         * First person starts
         * immediately.
         */

        setTimeout(() => {
          startRecording();
        }, 0);

      } catch (err) {

        console.error(err);

        setError(
          err?.message ||
          "Could not process the Excel file."
        );

      } finally {

        setLoading(false);
      }
    };


  /* =======================================================
     UPLOAD COMPLETED SRT TO GOOGLE DRIVE
  ======================================================= */

  const handleDriveUpload = async () => {
    if (driveUploading) {
      return;
    }

    if (!isEnded) {
      alert(
        "Please press End Recording first."
      );
      return;
    }

    setDriveUploading(true);
    setDriveUploadStatus("");
    setDriveFile(null);

    try {
      const uploadedFile =
        await uploadSRTToGoogleDrive(
          records,
          timingsRef.current,
          excelFileName
        );

      setDriveFile(uploadedFile);

      setDriveUploadStatus(
        "SRT uploaded to Google Drive successfully."
      );
    } catch (err) {
      console.error(
        "Google Drive upload error:",
        err
      );

      setDriveUploadStatus(
        err?.message ||
        "Could not upload SRT to Google Drive."
      );
    } finally {
      setDriveUploading(false);
    }
  };


  /* =======================================================
     RESET
  ======================================================= */

  const reset = () => {

    setRecords([]);

    setCurrentIndex(0);

    setElapsed(0);

    setError("");

    setIsRecording(false);

    setIsEnded(false);

    setShowExport(false);

    setExcelFileName("");
    setDriveUploading(false);
    setDriveUploadStatus("");
    setDriveFile(null);

    timingsRef.current = [];

    recordingStartRef.current =
      null;

    accumulatedRef.current =
      0;

    runStartRef.current =
      null;

    currentPersonStartRef.current =
      0;
  };


  /* =======================================================
     PROGRESS
  ======================================================= */

  const progress =
    records.length
      ? (
          (currentIndex + 1) /
          records.length
        ) * 100
      : 0;


  /* =======================================================
     CURRENT CAPTION DURATION
  ======================================================= */

  const currentDuration =
    Math.max(
      0,
      elapsed -
      currentPersonStartRef.current
    );


  /* =======================================================
     UPLOAD SCREEN
  ======================================================= */

  if (!records.length) {

    return (

      <div className="app">

        <header className="header">

          <h1>
            SRT Caption Capturer
          </h1>

          <p>
            Excel → Live Timing → SRT
          </p>

        </header>


        <main className="container">

          <section className="upload-card">

            <div className="upload-icon">
              📊
            </div>

            <h2>
              Upload Excel File
            </h2>

            <p>
              Upload your Excel file containing
              Chadhava, Gotra and Name data.
            </p>


            <label
              className={
                loading
                  ? "upload-button disabled"
                  : "upload-button"
              }
            >

              {loading
                ? "Reading Excel..."
                : "Choose Excel File"
              }

              <input
                type="file"
                accept=".xlsx,.xls"
                hidden
                disabled={loading}
                onChange={
                  handleUpload
                }
              />

            </label>


            {loading && (

              <div className="loading">

                <div className="spinner"></div>

                <p>
                  Reading your Excel file...
                </p>

              </div>

            )}


            {error && (

              <div className="error">
                {error}
              </div>

            )}

          </section>

        </main>

      </div>

    );
  }


  /* =======================================================
     CAPTION SCREEN
  ======================================================= */

  return (

    <div className="app">

      <header className="header">

        <h1>
          SRT Caption Capturer
        </h1>

        <p>
          Live Caption Recording
        </p>

      </header>


      <main className="container">

        <section className="caption-section">


          {/* TOP */}

          <div className="top-bar">

            <button
              className="secondary-button"
              onClick={reset}
              disabled={isRecording}
            >
              ← Upload Another Excel
            </button>


            <div className="counter">

              {currentIndex + 1}
              {" / "}
              {records.length}

            </div>

          </div>


          {/* PROGRESS */}

          <div className="progress">

            <div
              className="progress-fill"
              style={{
                width:
                  `${progress}%`,
              }}
            />

          </div>


          {/* RECORDING BAR */}

          <div className="recording-bar">

            <div className="recording-status">

              <span
                className={
                  isRecording
                    ? "recording-dot"
                    : "recording-dot paused"
                }
              />

              <span>

                {isEnded
                  ? "RECORDING ENDED"
                  : isRecording
                    ? "RECORDING"
                    : "PAUSED"
                }

              </span>

            </div>


            <div className="timer">
              {formatSRTTime(elapsed)}
            </div>

          </div>


          {/* CAPTION */}

          <div className="caption-card">

            <div className="caption-label">
              CURRENT CAPTION
            </div>


            <div className="chadhava">
              {currentPerson.chadhava}
            </div>


            <div className="field">

              <span className="field-label">
                क्रम संख्या
              </span>

              <strong className="srno">
                {currentPerson.srNo}
              </strong>

            </div>


            <div className="field">

              <span className="field-label">
                गोत्र
              </span>

              <strong className="gotra">
                {currentPerson.gotra}
              </strong>

            </div>


            <div className="field">

              <span className="field-label">
                भक्त का नाम
              </span>

              <strong className="name">
                {currentPerson.name}
              </strong>

            </div>

          </div>


          {/* CURRENT TIME */}

          <div className="caption-timer">

            Current caption:

            <strong>
              {formatSRTTime(
                currentDuration
              )}
            </strong>

          </div>


          {/* PLAY / PAUSE */}

          {!isEnded && (

            <div className="record-controls">

              {!isRecording ? (

                <button
                  className="control-button play"
                  onClick={
                    startRecording
                  }
                >
                  ▶ Play / Resume
                </button>

              ) : (

                <button
                  className="control-button pause"
                  onClick={
                    pauseRecording
                  }
                >
                  ⏸ Pause
                </button>

              )}

            </div>

          )}


          {/* NAVIGATION */}

          {!isEnded && (

            <div className="navigation">

              <button
                className="nav-button"
                onClick={
                  previousPerson
                }
                disabled={
                  currentIndex === 0
                }
              >
                ← Previous
              </button>


              <button
                className="nav-button next"
                onClick={
                  nextPerson
                }
                disabled={
                  currentIndex ===
                  records.length - 1
                }
              >
                Next →
              </button>

            </div>

          )}


          {/* END RECORDING */}

          {!isEnded &&
            currentIndex ===
              records.length - 1 && (

            <button
              className="end-recording-button"
              onClick={
                endRecording
              }
            >
              ■ End Recording
            </button>

          )}


          {/* EXPORT */}

          {showExport && (

            <section className="srt-panel">

              <div className="srt-info">

                <h3>
                  Recording Complete
                </h3>

                <p>
                  All recorded timings are ready
                  to export or upload as an SRT file.
                </p>

                {excelFileName && (
                  <div className="source-file-name">
                    File: <strong>{excelFileName}</strong>
                  </div>
                )}

              </div>


              <div className="srt-preview">

                <span>
                  SRT format
                </span>

                <code>
                  Gotra
                  <br />
                  Name
                </code>

              </div>


              <div className="srt-actions">
                <button
                  className="download-button"
                  onClick={() =>
                    downloadSRT(
                      records,
                      timingsRef.current
                    )
                  }
                >
                  ⬇ Extract SRT
                </button>

                <button
                  className="drive-upload-button"
                  onClick={handleDriveUpload}
                  disabled={driveUploading}
                >
                  {driveUploading
                    ? "☁ Uploading..."
                    : "☁ Upload to Google Drive"}
                </button>
              </div>

              {driveUploadStatus && (
                <div
                  className={
                    driveFile
                      ? "drive-status success"
                      : "drive-status error"
                  }
                >
                  {driveUploadStatus}

                  {driveFile?.link && (
                    <>
                      {" "}
                      <a
                        href={driveFile.link}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open in Drive
                      </a>
                    </>
                  )}
                </div>
              )}

            </section>

          )}


          {/* LAST PERSON */}

          {!isEnded &&
            currentIndex ===
              records.length - 1 && (

            <div className="complete-message">

              🎉 Last name reached!

              <br />

              <span>
                After Panditji finishes reading,
                press "End Recording".
              </span>

            </div>

          )}

        </section>

      </main>

    </div>

  );
}

export default App;