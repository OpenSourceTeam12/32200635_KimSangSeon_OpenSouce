from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from dataclasses import dataclass, asdict
from datetime import datetime
import uuid
import shutil
import queue
import threading
import time
import json


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent.parent
SESSION_DIR = BASE_DIR / "sessions"

job_queue = queue.Queue()
job_status = {}
job_lock = threading.Lock()


@dataclass
class AnalysisJob:
    session_id: str
    original_file_path: str
    user_file_path: str
    session_dir: str
    status: str = "queued"
    created_at: str = ""
    started_at: str | None = None
    completed_at: str | None = None
    error_message: str | None = None


def update_job_status(session_id: str, **kwargs):
    with job_lock:
        if session_id in job_status:
            for key, value in kwargs.items():
                setattr(job_status[session_id], key, value)


def save_result_json(job: AnalysisJob):
    session_path = Path(job.session_dir)
    result_path = session_path / "result.json"

    result_data = {
        "session_id": job.session_id,
        "status": "completed",
        "scores": {
            "pitch_score": 82,
            "rhythm_score": 76,
            "total_score": 79
        },
        "feedback": "KAN-34 테스트용 더미 분석 결과입니다. KAN-35에서 실제 파이프라인과 연결할 예정입니다.",
        "pitch_data": [],
        "rhythm_data": [],
        "visualization_urls": {}
    }

    with open(result_path, "w", encoding="utf-8") as f:
        json.dump(result_data, f, ensure_ascii=False, indent=4)


def process_analysis_job(job: AnalysisJob):
    try:
        update_job_status(
            job.session_id,
            status="processing",
            started_at=datetime.now().isoformat()
        )

        print(f"[Worker] 분석 시작: {job.session_id}")

        # TODO: KAN-35에서 실제 파이프라인 함수 호출로 교체
        # 예시:
        # run_analysis(
        #     original_path=job.original_file_path,
        #     user_path=job.user_file_path,
        #     output_dir=job.session_dir
        # )

        time.sleep(5)

        save_result_json(job)

        update_job_status(
            job.session_id,
            status="completed",
            completed_at=datetime.now().isoformat()
        )

        print(f"[Worker] 분석 완료: {job.session_id}")

    except Exception as e:
        update_job_status(
            job.session_id,
            status="failed",
            error_message=str(e),
            completed_at=datetime.now().isoformat()
        )

        print(f"[Worker] 분석 실패: {job.session_id}, error={e}")


def worker_loop():
    while True:
        job = job_queue.get()

        if job is None:
            break

        process_analysis_job(job)
        job_queue.task_done()


@app.on_event("startup")
def startup_event():
    SESSION_DIR.mkdir(parents=True, exist_ok=True)

    worker_count = 2

    for i in range(worker_count):
        worker = threading.Thread(
            target=worker_loop,
            daemon=True,
            name=f"analysis-worker-{i + 1}"
        )
        worker.start()

    print(f"[Server] Worker Thread {worker_count}개 실행 완료")


@app.get("/")
def root():
    return {"message": "Singing Coach Server is running"}


@app.post("/upload")
async def upload_files(
    original_file: UploadFile = File(...),
    user_file: UploadFile = File(...)
):
    session_id = str(uuid.uuid4())

    current_session_dir = SESSION_DIR / session_id
    current_session_dir.mkdir(parents=True, exist_ok=True)

    original_path = current_session_dir / original_file.filename
    user_path = current_session_dir / user_file.filename

    with open(original_path, "wb") as buffer:
        shutil.copyfileobj(original_file.file, buffer)

    with open(user_path, "wb") as buffer:
        shutil.copyfileobj(user_file.file, buffer)

    job = AnalysisJob(
        session_id=session_id,
        original_file_path=str(original_path),
        user_file_path=str(user_path),
        session_dir=str(current_session_dir),
        status="queued",
        created_at=datetime.now().isoformat()
    )

    with job_lock:
        job_status[session_id] = job

    job_queue.put(job)

    return {
        "message": "파일 업로드 성공. 분석 작업이 JobQueue에 등록되었습니다.",
        "session_id": session_id,
        "status": "queued",
        "original_file": str(original_path),
        "user_file": str(user_path)
    }


@app.get("/result/{session_id}")
def get_result(session_id: str):
    session_path = SESSION_DIR / session_id

    if not session_path.exists():
        raise HTTPException(
            status_code=404,
            detail="해당 session_id를 가진 세션이 존재하지 않습니다."
        )

    with job_lock:
        job = job_status.get(session_id)

    if job is None:
        raise HTTPException(
            status_code=404,
            detail="해당 session_id의 작업 상태를 찾을 수 없습니다."
        )

    result_path = session_path / "result.json"

    if job.status == "completed" and result_path.exists():
        with open(result_path, "r", encoding="utf-8") as f:
            result_data = json.load(f)

        return result_data

    return {
        "session_id": session_id,
        "status": job.status,
        "job": asdict(job)
    }