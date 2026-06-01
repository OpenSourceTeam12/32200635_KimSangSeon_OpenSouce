from pathlib import Path
import sqlite3
import json
from datetime import datetime


BASE_DIR = Path(__file__).resolve().parent.parent.parent
DB_PATH = BASE_DIR / "app.db"


def get_connection():
    return sqlite3.connect(DB_PATH)


def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            session_id TEXT PRIMARY KEY,
            original_file_path TEXT NOT NULL,
            user_file_path TEXT NOT NULL,
            session_dir TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL,
            completed_at TEXT
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS analysis_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            result_json_path TEXT NOT NULL,
            pipeline_status TEXT,
            pitch_score REAL,
            rhythm_score REAL,
            total_score REAL,
            feedback TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (session_id) REFERENCES sessions(session_id)
        )
    """)

    conn.commit()
    conn.close()


def save_session_metadata(
    session_id: str,
    original_file_path: str,
    user_file_path: str,
    session_dir: str,
    status: str,
    created_at: str,
    completed_at: str | None = None
):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT OR REPLACE INTO sessions (
            session_id,
            original_file_path,
            user_file_path,
            session_dir,
            status,
            created_at,
            completed_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        session_id,
        original_file_path,
        user_file_path,
        session_dir,
        status,
        created_at,
        completed_at
    ))

    conn.commit()
    conn.close()


def save_analysis_result(
    session_id: str,
    session_dir: str,
    result_data: dict
):
    conn = get_connection()
    cursor = conn.cursor()

    result_path = Path(session_dir) / "result.json"

    result = result_data.get("result", {})
    pipeline_status = result_data.get("pipeline_status")

    cursor.execute("""
        INSERT INTO analysis_results (
            session_id,
            result_json_path,
            pipeline_status,
            pitch_score,
            rhythm_score,
            total_score,
            feedback,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        session_id,
        str(result_path),
        pipeline_status,
        result.get("pitch_score"),
        result.get("rhythm_score"),
        result.get("total_score"),
        result.get("feedback"),
        datetime.now().isoformat()
    ))

    conn.commit()
    conn.close()


def save_metadata_json(
    session_id: str,
    original_file_path: str,
    user_file_path: str,
    session_dir: str,
    status: str,
    created_at: str,
    completed_at: str | None = None
):
    metadata_path = Path(session_dir) / "metadata.json"

    metadata = {
        "session_id": session_id,
        "original_file_path": original_file_path,
        "user_file_path": user_file_path,
        "session_dir": session_dir,
        "status": status,
        "created_at": created_at,
        "completed_at": completed_at
    }

    with open(metadata_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False, indent=4)