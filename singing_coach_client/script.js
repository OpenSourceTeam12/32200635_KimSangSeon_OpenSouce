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

qs("#micStartButton").addEventListener("click", () => {
  qs("#micStartButton").classList.add("is-on");
  qs("#micLabel").textContent = "ON";
  setTimeout(startNewSession, 300);
});

qs("#newSessionTab").addEventListener("click", () => {
  activateNewTab();
  showPage("homePage");
});

qs("#uploadButton").addEventListener("click", () => {
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

  // TODO: 원곡 파일과 사용자 녹음 파일 또는 녹음 Blob을 서버로 전송할 위치
  // TODO: 서버 응답 상태를 화면에 반영할 위치
});

qs("#goLiveButton").addEventListener("click", () => {
  clearLiveResult();
  showPage("livePage");

  // TODO: 실시간 피치/음정 그래프 데이터를 연결할 위치
});

qs("#goRhythmButton").addEventListener("click", () => {
  clearRhythmResult();
  showPage("rhythmPage");

  // TODO: 박자 분석 데이터를 연결할 위치
});

qs("#goFinalButton").addEventListener("click", () => {
  clearFinalResult();
  showPage("finalPage");

  // TODO: 최종 점수, 피드백, 틀린 구간 결과를 표시할 위치
});

qs("#goPracticeUploadButton").addEventListener("click", () => {
  qs("#practiceContextText").textContent = "";
  resetPracticeRecording();
  showPage("practiceUploadPage");

  // TODO: 틀린 구간 정보를 재녹음 화면에 표시할 위치
});

qs("#restartAnalyzeButton").addEventListener("click", () => {
  const practiceFile = qs("#practiceFile").files[0];

  if (!practiceFile && !practiceRecordingBlob) {
    alert("재녹음 파일을 업로드하거나 클라이언트에서 바로 재녹음하세요.");
    return;
  }

  resetServerStatus();
  showPage("serverPage");

  // TODO: 재녹음 파일 또는 녹음 Blob을 서버로 전송할 위치
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
  qs("#originalStatus").textContent = "--";
  qs("#userStatus").textContent = "--";
  qs("#serverStatus").textContent = "--";
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

  // TODO: 저장된 분석 결과를 불러와 최종 결과 화면에 표시할 위치
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
