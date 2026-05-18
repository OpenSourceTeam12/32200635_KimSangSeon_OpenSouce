from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import uuid
import shutil

app = FastAPI()

# 클라이언트 HTML/JS에서 접근 가능하게 허용
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent.parent
SESSION_DIR = BASE_DIR / "sessions"


@app.get("/")
def root():
    return {"message": "Singing Coach Server is running"}


@app.post("/upload")
async def upload_files(
    original_file: UploadFile = File(...),
    user_file: UploadFile = File(...)
):
    # 1. 세션 ID 생성
    session_id = str(uuid.uuid4())

    # 2. 세션 디렉토리 생성
    current_session_dir = SESSION_DIR / session_id
    current_session_dir.mkdir(parents=True, exist_ok=True)

    # 3. 저장 경로 생성
    original_path = current_session_dir / original_file.filename
    user_path = current_session_dir / user_file.filename

    # 4. 원곡 파일 저장
    with open(original_path, "wb") as buffer:
        shutil.copyfileobj(original_file.file, buffer)

    # 5. 사용자 녹음 파일 저장
    with open(user_path, "wb") as buffer:
        shutil.copyfileobj(user_file.file, buffer)

    # 6. 클라이언트에게 결과 반환
    return {
        "message": "파일 업로드 성공",
        "session_id": session_id,
        "original_file": str(original_path),
        "user_file": str(user_path)
    }

@app.get("/result/{session_id}")
def get_result(session_id: str):
    # 1. session_id에 해당하는 세션 폴더 경로 만들기
    session_path = SESSION_DIR / session_id

    # 2. 해당 세션 폴더가 없으면 404 에러 반환
    if not session_path.exists():
        raise HTTPException(
            status_code=404,
            detail="해당 session_id를 가진 세션이 존재하지 않습니다."
        )

    # 3. 세션 폴더 안의 파일 목록 확인
    saved_files = [file.name for file in session_path.iterdir() if file.is_file()]

    # 4. 아직 AI 분석이 없으므로 더미 결과 반환
    return {
        "session_id": session_id,
        "status": "completed",
        "saved_files": saved_files,
        "result": {
            "pitch_score": 82,
            "rhythm_score": 76,
            "total_score": 79,
            "feedback": "아직 실제 AI 분석은 연결되지 않았으며, 테스트용 더미 결과입니다."
        }
    }

