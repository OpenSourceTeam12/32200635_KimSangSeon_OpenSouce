const API_BASE_URL = "http://172.22.140.223:8000";
const UPLOAD_API_URL = `${API_BASE_URL}/upload`;

// 결과 조회 API는 서버에서 실제 엔드포인트가 정해지면 여기만 수정하면 됨.
// 예시: GET http://172.22.140.223:8000/result/{session_id}
const RESULT_API_URL = (sessionId) => `${API_BASE_URL}/result/${sessionId}`;

const pageIds = [
  "homePage",
  "uploadPage",
  "serverPage",
  "livePage",
  "rhythmPage",
  "finalPage",
  "practiceUploadPage"
];

const qs = (selector) => document.querySelector(selector);
const qsa = (selector) => document.querySelectorAll(selector);

let savedTabCount = 0;
let userRecordingBlob = null;
let practiceRecordingBlob = null;
let userRecorder = null;
let practiceRecorder = null;
let userChunks = [];
let practiceChunks = [];
let currentSessionId = null;
let latestUploadResponse = null;
let latestResultResponse = null;
let serverConnectionReady = false;

qs("#micStartButton").addEventListener("click", () => {
  qs("#micStartButton").classList.add("is-on");
  qs("#micLabel").textContent = "ON";
  setTimeout(startNewSession, 300);
});

qs("#newSessionTab").addEventListener("click", () => {
  activateNewTab();
  showPage("homePage");
});

qs("#uploadButton").addEventListener("click", async () => {
  const originalFile = qs("#originalFile").files[0];
  const userFile = qs("#userFile").files[0];

  if (!originalFile) {
    alert("원곡 파일을 선택하세요.");
    return;
  }

  if (!userFile && !userRecordingBlob) {
    alert("사용자 녹음 파일을 업로드하거나 클라이언트에서 바로 녹음하세요.");
    return;
  }

  resetServerStatus();
  showPage("serverPage");
  await uploadOriginalAndUserFile(originalFile, userFile || userRecordingBlob);
});

qs("#goLiveButton").addEventListener("click", async () => {
  if (!serverConnectionReady || !currentSessionId) {
    alert("서버 확인이 완료된 뒤 다음 화면으로 이동할 수 있습니다.");
    return;
  }

  clearLiveResult();
  showPage("livePage");
  await loadResultSkeleton("live");
});

qs("#goRhythmButton").addEventListener("click", async () => {
  clearRhythmResult();
  showPage("rhythmPage");
  await loadResultSkeleton("rhythm");
});

qs("#goFinalButton").addEventListener("click", async () => {
  clearFinalResult();
  showPage("finalPage");
  await loadResultSkeleton("final");
});

qs("#goPracticeUploadButton").addEventListener("click", () => {
  qs("#practiceContextText").textContent = latestResultResponse?.wrong_section
    ? `다시 연습할 구간: ${latestResultResponse.wrong_section}`
    : "틀린 구간 정보를 서버 결과와 연결할 예정입니다.";
  resetPracticeRecording();
  showPage("practiceUploadPage");
});

qs("#restartAnalyzeButton").addEventListener("click", async () => {
  const originalFile = qs("#originalFile").files[0];
  const practiceFile = qs("#practiceFile").files[0];

  if (!originalFile) {
    alert("재분석을 위해 원곡 파일을 다시 선택하세요.");
    showPage("uploadPage");
    return;
  }

  if (!practiceFile && !practiceRecordingBlob) {
    alert("재녹음 파일을 업로드하거나 클라이언트에서 바로 재녹음하세요.");
    return;
  }

  resetServerStatus();
  showPage("serverPage");
  await uploadOriginalAndUserFile(originalFile, practiceFile || practiceRecordingBlob);
});

qs("#saveResultButton").addEventListener("click", () => {
  const title = qs("#recordTitleInput").value.trim();

  if (!title) {
    alert("저장할 분석 이름을 입력하세요.");
    return;
  }

  const tab = addHistoryTab(title);
  activateTab(tab);
  openSavedResult(title);

  setTimeout(() => {
    addNewSessionWindow();
  }, 250);
});

qsa("[data-page]").forEach((button) => {
  button.addEventListener("click", () => showPage(button.dataset.page));
});

qs("#originalFile").addEventListener("change", (event) => setFileName("originalFileName", event.target.files[0]));
qs("#userFile").addEventListener("change", (event) => {
  setFileName("userFileName", event.target.files[0]);
  if (event.target.files[0]) resetUserRecording();
});
qs("#practiceFile").addEventListener("change", (event) => {
  setFileName("practiceFileName", event.target.files[0]);
  if (event.target.files[0]) resetPracticeRecording();
});

qs("#startUserRecordButton").addEventListener("click", () => startRecording("user"));
qs("#stopUserRecordButton").addEventListener("click", () => stopRecording("user"));
qs("#startPracticeRecordButton").addEventListener("click", () => startRecording("practice"));
qs("#stopPracticeRecordButton").addEventListener("click", () => stopRecording("practice"));

async function uploadOriginalAndUserFile(originalFile, selectedUserFile) {
  setNextButton(false, "확인 중...");
  setServerGuide("서버로 파일을 전송하는 중입니다.");
  setServerStatus("전송 중", "전송 중", "서버 요청 중...");
  qs("#sessionStatus").textContent = "확인 중";
  qs("#resultApiStatus").textContent = "대기";

  const formData = new FormData();
  formData.append("original_file", originalFile);
  formData.append("user_file", toUploadFile(selectedUserFile, "user_recording.webm"));

  try {
    const response = await fetch(UPLOAD_API_URL, {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      throw new Error(`업로드 실패: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    latestUploadResponse = result;
    currentSessionId = result.session_id;

    if (!currentSessionId) {
      throw new Error("서버 응답에 session_id가 없습니다.");
    }

    localStorage.setItem("singingCoachSessionId", currentSessionId);

    setServerStatus(
      result.original_file || originalFile.name || "전송 완료",
      result.user_file || selectedUserFile.name || "전송 완료",
      "업로드 연결 성공"
    );
    qs("#sessionStatus").textContent = currentSessionId;
    setServerGuide("업로드 API 연결은 확인되었습니다. 결과 조회 API 상태를 확인하는 중입니다.");

    console.log("업로드 API 응답:", result);

    await verifyResultApiConnection(currentSessionId);
    serverConnectionReady = true;
    setNextButton(true, "실시간 비교 시작");
  } catch (error) {
    console.error("업로드 API 오류:", error);
    serverConnectionReady = false;
    setServerStatus("실패", "실패", "서버 연결 실패");
    qs("#sessionStatus").textContent = "확인 실패";
    qs("#resultApiStatus").textContent = "확인 불가";
    setServerGuide("서버가 실행 중인지, 같은 네트워크인지, CORS 설정이 되어 있는지 확인해야 합니다.");
    setNextButton(false, "서버 확인 필요");
    alert("업로드에 실패했습니다. 서버 실행 상태, 같은 네트워크 접속 여부, CORS 설정을 확인하세요.");
  }
}

async function verifyResultApiConnection(sessionId) {
  qs("#resultApiStatus").textContent = "확인 중";

  try {
    const response = await fetch(RESULT_API_URL(sessionId), {
      method: "GET"
    });

    if (!response.ok) {
      throw new Error(`결과 조회 실패: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    latestResultResponse = result;
    qs("#resultApiStatus").textContent = "연결 성공";
    setServerGuide("서버 확인이 완료되었습니다. 이제 다음 화면으로 이동할 수 있습니다.");
    console.log("결과 조회 API 확인 응답:", result);
  } catch (error) {
    console.warn("결과 조회 API 확인 실패:", error);
    qs("#resultApiStatus").textContent = "기본 틀 확인 필요";
    setServerGuide("업로드 API 연결은 성공했습니다. 결과 조회 API는 아직 서버 구현 또는 엔드포인트 확인이 필요합니다. 다음 화면으로 이동은 가능합니다.");
  }
}

// 결과 조회 API 기본 틀
// 서버 쪽 결과 조회 API가 아직 완성되지 않아도, session_id로 연결 테스트를 할 수 있게 만들어둔 함수.
async function loadResultSkeleton(targetPage) {
  const sessionId = currentSessionId || localStorage.getItem("singingCoachSessionId");

  if (!sessionId) {
    applyPlaceholderResult(targetPage, "아직 session_id가 없습니다. 먼저 파일 업로드를 완료하세요.");
    return;
  }

  try {
    const response = await fetch(RESULT_API_URL(sessionId), {
      method: "GET"
    });

    if (!response.ok) {
      throw new Error(`결과 조회 실패: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    latestResultResponse = result;
    applyResultToPage(targetPage, result);
    console.log("결과 조회 API 응답:", result);
  } catch (error) {
    console.warn("결과 조회 API는 아직 서버 구현이 필요할 수 있습니다:", error);
    applyPlaceholderResult(targetPage, `업로드 연결 확인 완료 / session_id: ${sessionId}`);
  }
}

function applyResultToPage(targetPage, result) {
  if (targetPage === "live") {
    qs("#liveTotalScore").textContent = result.total_score ?? "--";
    qs("#livePitchScore").textContent = result.pitch_score ?? "--";
    qs("#liveToneScore").textContent = result.tone_score ?? "--";
    qs("#pitchFeedback").textContent = result.pitch_feedback || "서버 결과를 화면에 연결했습니다.";
  }

  if (targetPage === "rhythm") {
    qs("#rhythmScore").textContent = result.rhythm_score ?? "--";
    qs("#rhythmFeedback").textContent = result.rhythm_feedback || "박자 분석 결과를 화면에 연결할 예정입니다.";
  }

  if (targetPage === "final") {
    qs("#finalTotalScore").textContent = result.total_score ?? "--";
    qs("#finalPitchScore").textContent = result.pitch_score ?? "--";
    qs("#finalToneScore").textContent = result.tone_score ?? "--";
    qs("#finalRhythmScore").textContent = result.rhythm_score ?? "--";
    qs("#finalFeedback").textContent = result.final_feedback || result.feedback || "최종 분석 결과를 화면에 연결했습니다.";
    qs("#wrongSection").textContent = result.wrong_section || "가장 많이 틀린 구간 결과를 연결할 예정입니다.";
  }
}

function applyPlaceholderResult(targetPage, message) {
  if (targetPage === "live") {
    qs("#pitchFeedback").textContent = message;
  }

  if (targetPage === "rhythm") {
    qs("#rhythmFeedback").textContent = message;
  }

  if (targetPage === "final") {
    qs("#finalFeedback").textContent = message;
    qs("#wrongSection").textContent = "결과 조회 API 응답 형식이 확정되면 이 영역에 틀린 구간을 표시합니다.";
  }
}

function toUploadFile(fileOrBlob, fallbackName) {
  if (fileOrBlob instanceof File) return fileOrBlob;

  const mimeType = fileOrBlob.type || "audio/webm";
  const extension = mimeType.includes("wav") ? "wav" : "webm";
  const safeName = fallbackName.includes(".") ? fallbackName : `${fallbackName}.${extension}`;

  return new File([fileOrBlob], safeName, { type: mimeType });
}

function setServerStatus(originalText, userText, serverText) {
  qs("#originalStatus").textContent = originalText;
  qs("#userStatus").textContent = userText;
  qs("#serverStatus").textContent = serverText;
}

function setServerGuide(message) {
  qs("#serverGuideText").textContent = message;
}

function setNextButton(enabled, label) {
  const button = qs("#goLiveButton");
  button.disabled = !enabled;
  button.textContent = label;
}

function startNewSession() {
  activateNewTab();
  resetInputs();
  resetMic();
  showPage("uploadPage");
}

function addNewSessionWindow() {
  activateNewTab();
  resetInputs();
  resetMic();
  showPage("homePage");
}

function showPage(pageId) {
  pageIds.forEach((id) => qs(`#${id}`).classList.remove("active"));
  qs(`#${pageId}`).classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setFileName(elementId, file) {
  qs(`#${elementId}`).textContent = file ? file.name : "파일을 선택하세요";
}

function resetInputs() {
  qs("#originalFile").value = "";
  qs("#userFile").value = "";
  qs("#practiceFile").value = "";
  qs("#recordTitleInput").value = "";
  currentSessionId = null;
  latestUploadResponse = null;
  latestResultResponse = null;

  setFileName("originalFileName");
  setFileName("userFileName");
  setFileName("practiceFileName");
  resetUserRecording();
  resetPracticeRecording();
}

function resetMic() {
  qs("#micStartButton").classList.remove("is-on");
  qs("#micLabel").textContent = "OFF";
}

function resetServerStatus() {
  serverConnectionReady = false;
  setServerStatus("--", "--", "--");
  qs("#sessionStatus").textContent = "--";
  qs("#resultApiStatus").textContent = "--";
  setServerGuide("파일을 전송하면 서버 연결 상태를 확인합니다.");
  setNextButton(false, "확인 중...");
}

function clearLiveResult() {
  qs("#liveTotalScore").textContent = "--";
  qs("#livePitchScore").textContent = "--";
  qs("#liveToneScore").textContent = "--";
  qs("#pitchFeedback").textContent = "";
}

function clearRhythmResult() {
  qs("#rhythmScore").textContent = "--";
  qs("#rhythmFeedback").textContent = "";
}

function clearFinalResult() {
  qs("#finalTitle").textContent = "최종 결과";
  qs("#finalTotalScore").textContent = "--";
  qs("#finalPitchScore").textContent = "--";
  qs("#finalToneScore").textContent = "--";
  qs("#finalRhythmScore").textContent = "--";
  qs("#finalFeedback").textContent = "";
  qs("#wrongSection").textContent = "";
  qs("#recordTitleInput").value = "";
}

function addHistoryTab(title) {
  savedTabCount += 1;

  const tab = document.createElement("button");
  tab.className = "tab history-tab";
  tab.type = "button";
  tab.dataset.historyTitle = title;
  tab.style.setProperty("--dot", getDotColor(savedTabCount));
  tab.innerHTML = `
    <span class="record-icon"></span>
    <span class="tab-title-text">${escapeHtml(title)}</span>
    <span class="close" aria-label="기록 삭제">×</span>
  `;

  tab.addEventListener("click", () => {
    activateTab(tab);
    openSavedResult(title);
  });

  tab.querySelector(".close").addEventListener("click", (event) => {
    event.stopPropagation();
    const wasActive = tab.classList.contains("active");
    tab.remove();

    if (wasActive) {
      activateNewTab();
      showPage("homePage");
    }
  });

  qs("#tabStrip").appendChild(tab);
  return tab;
}

function openSavedResult(title) {
  clearFinalResult();
  qs("#finalTitle").textContent = `${title} 결과`;
  showPage("finalPage");

  if (latestResultResponse) {
    applyResultToPage("final", latestResultResponse);
  } else {
    applyPlaceholderResult("final", "저장된 분석 결과 API는 추후 연결 예정입니다.");
  }
}

function activateNewTab() {
  activateTab(qs("#newSessionTab"));
}

function activateTab(tab) {
  qsa(".tab").forEach((item) => item.classList.remove("active"));
  tab.classList.add("active");
}

function getDotColor(index) {
  const colors = ["#2b2b2b", "#555555", "#777777", "#999999", "#444444", "#666666"];
  return colors[(index - 1) % colors.length];
}

async function startRecording(type) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert("이 브라우저에서는 녹음 기능을 사용할 수 없습니다.");
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    const chunks = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      stream.getTracks().forEach((track) => track.stop());
      setRecordedAudio(type, blob);
    };

    if (type === "user") {
      userRecorder = recorder;
      userChunks = chunks;
      qs("#startUserRecordButton").disabled = true;
      qs("#stopUserRecordButton").disabled = false;
      qs("#userRecordStatus").textContent = "녹음 중";
    } else {
      practiceRecorder = recorder;
      practiceChunks = chunks;
      qs("#startPracticeRecordButton").disabled = true;
      qs("#stopPracticeRecordButton").disabled = false;
      qs("#practiceRecordStatus").textContent = "녹음 중";
    }

    recorder.start();
  } catch (error) {
    alert("마이크 권한을 허용해야 녹음할 수 있습니다.");
  }
}

function stopRecording(type) {
  const recorder = type === "user" ? userRecorder : practiceRecorder;
  if (recorder && recorder.state !== "inactive") recorder.stop();
}

function setRecordedAudio(type, blob) {
  const url = URL.createObjectURL(blob);

  if (type === "user") {
    userRecordingBlob = blob;
    qs("#userRecordAudio").src = url;
    qs("#userRecordAudio").hidden = false;
    qs("#userRecordStatus").textContent = "녹음 완료";
    qs("#startUserRecordButton").disabled = false;
    qs("#stopUserRecordButton").disabled = true;
    qs("#userFile").value = "";
    setFileName("userFileName");
  } else {
    practiceRecordingBlob = blob;
    qs("#practiceRecordAudio").src = url;
    qs("#practiceRecordAudio").hidden = false;
    qs("#practiceRecordStatus").textContent = "녹음 완료";
    qs("#startPracticeRecordButton").disabled = false;
    qs("#stopPracticeRecordButton").disabled = true;
    qs("#practiceFile").value = "";
    setFileName("practiceFileName");
  }
}

function resetUserRecording() {
  userRecordingBlob = null;
  userChunks = [];
  if (userRecorder && userRecorder.state !== "inactive") userRecorder.stop();
  userRecorder = null;
  qs("#userRecordStatus").textContent = "대기";
  qs("#startUserRecordButton").disabled = false;
  qs("#stopUserRecordButton").disabled = true;
  qs("#userRecordAudio").removeAttribute("src");
  qs("#userRecordAudio").hidden = true;
}

function resetPracticeRecording() {
  practiceRecordingBlob = null;
  practiceChunks = [];
  if (practiceRecorder && practiceRecorder.state !== "inactive") practiceRecorder.stop();
  practiceRecorder = null;
  qs("#practiceRecordStatus").textContent = "대기";
  qs("#startPracticeRecordButton").disabled = false;
  qs("#stopPracticeRecordButton").disabled = true;
  qs("#practiceRecordAudio").removeAttribute("src");
  qs("#practiceRecordAudio").hidden = true;
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
