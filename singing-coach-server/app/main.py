from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
from pathlib import Path
import shutil
import uuid

app = FastAPI()

BASE_DIR = Path(__file__).resolve().parent.parent
SESSION_DIR = BASE_DIR / "sessions"


@app.get("/")
def root():
    return {"message": "Singing Coach Server is running"}


@app.post("/upload")
def upload_file(file: UploadFile = File(...)):
    session_id = str(uuid.uuid4())

    session_path = SESSION_DIR / session_id
    session_path.mkdir(parents=True, exist_ok=True)

    file_path = session_path / file.filename

    with file_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return JSONResponse(
        content={
            "message": "File uploaded successfully",
            "session_id": session_id,
            "filename": file.filename,
            "saved_path": str(file_path)
        }
    )
