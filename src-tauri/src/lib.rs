use aes_gcm::aead::Aead;
use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use base64::engine::general_purpose::STANDARD as Base64;
use base64::Engine;
use chrono::Local;
use rand::RngCore;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use thiserror::Error;

type AppResult<T> = Result<T, AppError>;

#[derive(Debug, Error)]
enum AppError {
    #[error("{0}")]
    Message(String),
    #[error("数据库错误: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("序列化错误: {0}")]
    Json(#[from] serde_json::Error),
    #[error("文件系统错误: {0}")]
    Io(#[from] std::io::Error),
    #[error("参数错误")]
    InvalidLength,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AuthStatePayload {
    lock_enabled: bool,
    needs_password_setup: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
    theme: String,
    font_scale: f32,
    last_opened_date: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BootstrapPayload {
    settings: AppSettings,
    auth: AuthStatePayload,
    preview_mode: bool,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JournalEntry {
    id: String,
    entry_date: String,
    title: String,
    mood: String,
    weather: String,
    content_json: Value,
    excerpt: String,
    created_at: String,
    updated_at: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SearchResult {
    id: String,
    entry_date: String,
    title: String,
    excerpt: String,
    updated_at: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DraftSnapshot {
    id: String,
    entry_date: String,
    title: String,
    mood: String,
    weather: String,
    content_json: Value,
    excerpt: String,
    captured_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveEntryInput {
    entry_date: String,
    title: String,
    mood: String,
    weather: String,
    content_json: Value,
    excerpt: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateSettingsInput {
    theme: Option<String>,
    font_scale: Option<f32>,
    last_opened_date: Option<String>,
}

#[derive(Clone)]
struct AuthRow {
    password_verifier: String,
    salt: String,
}

#[derive(Default)]
struct VaultRuntime {
    master_key: Option<[u8; 32]>,
}

struct AppState {
    db_path: PathBuf,
    runtime: Mutex<VaultRuntime>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CipherPayload {
    cipher: String,
    nonce: String,
}

impl AppState {
    fn new(db_path: PathBuf) -> AppResult<Self> {
        let state = Self {
            db_path,
            runtime: Mutex::new(VaultRuntime::default()),
        };
        state.init_db()?;
        Ok(state)
    }

    fn init_db(&self) -> AppResult<()> {
        if let Some(parent) = self.db_path.parent() {
            fs::create_dir_all(parent)?;
        }

        let connection = self.open_connection()?;
        connection.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS auth_state (
              id INTEGER PRIMARY KEY CHECK (id = 1),
              password_verifier TEXT NOT NULL,
              salt TEXT NOT NULL,
              created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS app_settings (
              id INTEGER PRIMARY KEY CHECK (id = 1),
              theme TEXT NOT NULL,
              font_scale REAL NOT NULL,
              last_opened_date TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS journal_entries (
              id TEXT PRIMARY KEY,
              entry_date TEXT NOT NULL UNIQUE,
              title TEXT NOT NULL,
              mood TEXT NOT NULL DEFAULT '',
              weather TEXT NOT NULL DEFAULT '',
              excerpt TEXT NOT NULL,
              content_nonce TEXT NOT NULL,
              content_cipher TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS draft_snapshots (
              id TEXT PRIMARY KEY,
              entry_date TEXT NOT NULL UNIQUE,
              payload_nonce TEXT NOT NULL,
              payload_cipher TEXT NOT NULL,
              captured_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_journal_entries_updated_at
            ON journal_entries(updated_at DESC);

            CREATE INDEX IF NOT EXISTS idx_journal_entries_search
            ON journal_entries(title, excerpt);
            ",
        )?;

        ensure_column(
            &connection,
            "journal_entries",
            "mood",
            "ALTER TABLE journal_entries ADD COLUMN mood TEXT NOT NULL DEFAULT ''",
        )?;
        ensure_column(
            &connection,
            "journal_entries",
            "weather",
            "ALTER TABLE journal_entries ADD COLUMN weather TEXT NOT NULL DEFAULT ''",
        )?;

        let settings_exists = connection
            .query_row("SELECT 1 FROM app_settings WHERE id = 1", [], |_row| Ok(true))
            .optional()?
            .unwrap_or(false);

        if !settings_exists {
            connection.execute(
                "INSERT INTO app_settings (id, theme, font_scale, last_opened_date) VALUES (1, ?1, ?2, ?3)",
                params!["dreamscape", 1.0_f32, today_entry_date()],
            )?;
        }

        Ok(())
    }

    fn open_connection(&self) -> AppResult<Connection> {
        Ok(Connection::open(&self.db_path)?)
    }

    fn load_auth_row(&self, connection: &Connection) -> AppResult<Option<AuthRow>> {
        let auth = connection
            .query_row(
                "SELECT password_verifier, salt FROM auth_state WHERE id = 1",
                [],
                |row| {
                    Ok(AuthRow {
                        password_verifier: row.get(0)?,
                        salt: row.get(1)?,
                    })
                },
            )
            .optional()?;

        Ok(auth)
    }

    fn load_settings(&self, connection: &Connection) -> AppResult<AppSettings> {
        let settings = connection.query_row(
            "SELECT theme, font_scale, last_opened_date FROM app_settings WHERE id = 1",
            [],
            |row| {
                Ok(AppSettings {
                    theme: row.get(0)?,
                    font_scale: row.get(1)?,
                    last_opened_date: row.get(2)?,
                })
            },
        )?;

        Ok(settings)
    }

    fn require_key(&self) -> AppResult<[u8; 32]> {
        let runtime = self
            .runtime
            .lock()
            .map_err(|_| AppError::Message("运行时状态不可用".into()))?;

        runtime
            .master_key
            .ok_or_else(|| AppError::Message("应用尚未解锁".into()))
    }
}

fn ensure_column(
    connection: &Connection,
    table_name: &str,
    column_name: &str,
    alter_sql: &str,
) -> AppResult<()> {
    let pragma = format!("PRAGMA table_info({table_name})");
    let mut statement = connection.prepare(&pragma)?;
    let column_exists = statement
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<Result<Vec<_>, _>>()?
        .iter()
        .any(|column| column == column_name);

    if !column_exists {
        connection.execute(alter_sql, [])?;
    }

    Ok(())
}

fn today_entry_date() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

fn now_iso() -> String {
    Local::now().to_rfc3339()
}

fn default_content() -> Value {
    json!({
      "type": "doc",
      "content": [{ "type": "paragraph" }]
    })
}

fn derive_master_key(password: &str, salt_bytes: &[u8]) -> AppResult<[u8; 32]> {
    let mut output = [0_u8; 32];
    Argon2::default()
        .hash_password_into(password.as_bytes(), salt_bytes, &mut output)
        .map_err(|error| AppError::Message(format!("密钥派生失败: {error}")))?;
    Ok(output)
}

fn encrypt_content(key: &[u8; 32], content: &str) -> AppResult<CipherPayload> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| AppError::InvalidLength)?;
    let mut nonce_bytes = [0_u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);

    let encrypted = cipher
        .encrypt(Nonce::from_slice(&nonce_bytes), content.as_bytes())
        .map_err(|error| AppError::Message(format!("内容加密失败: {error}")))?;

    Ok(CipherPayload {
        cipher: Base64.encode(encrypted),
        nonce: Base64.encode(nonce_bytes),
    })
}

fn decrypt_content(key: &[u8; 32], cipher_text: &str, nonce_text: &str) -> AppResult<String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| AppError::InvalidLength)?;
    let nonce_bytes = Base64
        .decode(nonce_text)
        .map_err(|error| AppError::Message(format!("随机向量损坏: {error}")))?;
    let payload = Base64
        .decode(cipher_text)
        .map_err(|error| AppError::Message(format!("密文损坏: {error}")))?;

    let decrypted = cipher
        .decrypt(Nonce::from_slice(&nonce_bytes), payload.as_ref())
        .map_err(|error| AppError::Message(format!("内容解密失败: {error}")))?;

    String::from_utf8(decrypted)
        .map_err(|error| AppError::Message(format!("正文编码损坏: {error}")))
}

fn empty_entry(entry_date: String) -> JournalEntry {
    let now = now_iso();
    JournalEntry {
        id: entry_date.clone(),
        entry_date,
        title: String::new(),
        mood: String::new(),
        weather: String::new(),
        content_json: default_content(),
        excerpt: String::new(),
        created_at: now.clone(),
        updated_at: now,
    }
}

#[tauri::command]
fn bootstrap_app(state: State<AppState>) -> Result<BootstrapPayload, String> {
    let connection = state.open_connection().map_err(|error| error.to_string())?;
    let auth = state.load_auth_row(&connection).map_err(|error| error.to_string())?;
    let settings = state.load_settings(&connection).map_err(|error| error.to_string())?;

    Ok(BootstrapPayload {
        settings,
        auth: AuthStatePayload {
            lock_enabled: auth.is_some(),
            needs_password_setup: auth.is_none(),
        },
        preview_mode: false,
    })
}

#[tauri::command]
fn setup_password(password: String, state: State<AppState>) -> Result<(), String> {
    if password.trim().len() < 8 {
        return Err("密码至少需要 8 位".into());
    }

    let connection = state.open_connection().map_err(|error| error.to_string())?;
    if state
        .load_auth_row(&connection)
        .map_err(|error| error.to_string())?
        .is_some()
    {
        return Err("密码已经设置过了".into());
    }

    let mut salt_bytes = [0_u8; 16];
    rand::thread_rng().fill_bytes(&mut salt_bytes);
    let salt = SaltString::encode_b64(&salt_bytes)
        .map_err(|error| format!("盐值生成失败: {error}"))?;
    let password_verifier = Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|error| format!("密码校验信息生成失败: {error}"))?
        .to_string();
    let master_key =
        derive_master_key(&password, &salt_bytes).map_err(|error| error.to_string())?;

    connection
        .execute(
            "INSERT INTO auth_state (id, password_verifier, salt, created_at) VALUES (1, ?1, ?2, ?3)",
            params![password_verifier, Base64.encode(salt_bytes), now_iso()],
        )
        .map_err(|error| error.to_string())?;

    let mut runtime = state
        .runtime
        .lock()
        .map_err(|_| "运行时状态不可用".to_string())?;
    runtime.master_key = Some(master_key);

    Ok(())
}

#[tauri::command]
fn unlock_app(password: String, state: State<AppState>) -> Result<(), String> {
    let connection = state.open_connection().map_err(|error| error.to_string())?;
    let auth = state
        .load_auth_row(&connection)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "尚未设置密码".to_string())?;

    let parsed_hash =
        PasswordHash::new(&auth.password_verifier).map_err(|error| format!("验证信息损坏: {error}"))?;

    Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .map_err(|_| "密码不正确".to_string())?;

    let salt_bytes = Base64
        .decode(auth.salt)
        .map_err(|error| format!("盐值损坏: {error}"))?;
    let master_key =
        derive_master_key(&password, &salt_bytes).map_err(|error| error.to_string())?;

    let mut runtime = state
        .runtime
        .lock()
        .map_err(|_| "运行时状态不可用".to_string())?;
    runtime.master_key = Some(master_key);

    Ok(())
}

#[tauri::command]
fn get_entry_by_date(entry_date: String, state: State<AppState>) -> Result<JournalEntry, String> {
    let key = state.require_key().map_err(|error| error.to_string())?;
    let connection = state.open_connection().map_err(|error| error.to_string())?;

    let record = connection
        .query_row(
            "
            SELECT id, entry_date, title, mood, weather, excerpt, content_nonce, content_cipher, created_at, updated_at
            FROM journal_entries
            WHERE entry_date = ?1
            ",
            params![entry_date],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, String>(7)?,
                    row.get::<_, String>(8)?,
                    row.get::<_, String>(9)?,
                ))
            },
        )
        .optional()
        .map_err(|error| error.to_string())?;

    match record {
        Some((
            id,
            record_entry_date,
            title,
            mood,
            weather,
            excerpt,
            content_nonce,
            content_cipher,
            created_at,
            updated_at,
        )) => {
            let decrypted =
                decrypt_content(&key, &content_cipher, &content_nonce).map_err(|error| error.to_string())?;
            let content_json: Value =
                serde_json::from_str(&decrypted).map_err(|error| error.to_string())?;

            Ok(JournalEntry {
                id,
                entry_date: record_entry_date,
                title,
                mood,
                weather,
                excerpt,
                content_json,
                created_at,
                updated_at,
            })
        }
        None => Ok(empty_entry(entry_date)),
    }
}

#[tauri::command]
fn save_entry(input: SaveEntryInput, state: State<AppState>) -> Result<JournalEntry, String> {
    let key = state.require_key().map_err(|error| error.to_string())?;
    let connection = state.open_connection().map_err(|error| error.to_string())?;
    let timestamp = now_iso();
    let serialized_content =
        serde_json::to_string(&input.content_json).map_err(|error| error.to_string())?;
    let encrypted = encrypt_content(&key, &serialized_content).map_err(|error| error.to_string())?;

    let existing_created_at: Option<String> = connection
        .query_row(
            "SELECT created_at FROM journal_entries WHERE entry_date = ?1",
            params![input.entry_date],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;

    let created_at = existing_created_at.unwrap_or_else(|| timestamp.clone());
    let id = input.entry_date.clone();

    connection
        .execute(
            "
            INSERT INTO journal_entries (
              id,
              entry_date,
              title,
              mood,
              weather,
              excerpt,
              content_nonce,
              content_cipher,
              created_at,
              updated_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
            ON CONFLICT(entry_date) DO UPDATE SET
              title = excluded.title,
              mood = excluded.mood,
              weather = excluded.weather,
              excerpt = excluded.excerpt,
              content_nonce = excluded.content_nonce,
              content_cipher = excluded.content_cipher,
              updated_at = excluded.updated_at
            ",
            params![
                id,
                input.entry_date,
                input.title,
                input.mood,
                input.weather,
                input.excerpt,
                encrypted.nonce,
                encrypted.cipher,
                created_at,
                timestamp
            ],
        )
        .map_err(|error| error.to_string())?;

    connection
        .execute(
            "DELETE FROM draft_snapshots WHERE entry_date = ?1",
            params![input.entry_date],
        )
        .map_err(|error| error.to_string())?;

    Ok(JournalEntry {
        id: input.entry_date.clone(),
        entry_date: input.entry_date,
        title: input.title,
        mood: input.mood,
        weather: input.weather,
        content_json: input.content_json,
        excerpt: input.excerpt,
        created_at,
        updated_at: timestamp,
    })
}

#[tauri::command]
fn search_entries(query: String, limit: usize, state: State<AppState>) -> Result<Vec<SearchResult>, String> {
    let _ = state.require_key().map_err(|error| error.to_string())?;
    let connection = state.open_connection().map_err(|error| error.to_string())?;
    let needle = format!("%{}%", query.trim());
    let mut statement = connection
        .prepare(
            "
            SELECT id, entry_date, title, excerpt, updated_at
            FROM journal_entries
            WHERE title LIKE ?1 OR excerpt LIKE ?1
            ORDER BY updated_at DESC
            LIMIT ?2
            ",
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map(params![needle, limit as i64], |row| {
            Ok(SearchResult {
                id: row.get(0)?,
                entry_date: row.get(1)?,
                title: row.get(2)?,
                excerpt: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })
        .map_err(|error| error.to_string())?;

    rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn save_draft_snapshot(input: SaveEntryInput, state: State<AppState>) -> Result<DraftSnapshot, String> {
    let key = state.require_key().map_err(|error| error.to_string())?;
    let connection = state.open_connection().map_err(|error| error.to_string())?;
    let snapshot = DraftSnapshot {
        id: input.entry_date.clone(),
        entry_date: input.entry_date.clone(),
        title: input.title,
        mood: input.mood,
        weather: input.weather,
        content_json: input.content_json,
        excerpt: input.excerpt,
        captured_at: now_iso(),
    };
    let payload = serde_json::to_string(&snapshot).map_err(|error| error.to_string())?;
    let encrypted = encrypt_content(&key, &payload).map_err(|error| error.to_string())?;

    connection
        .execute(
            "
            INSERT INTO draft_snapshots (id, entry_date, payload_nonce, payload_cipher, captured_at)
            VALUES (?1, ?2, ?3, ?4, ?5)
            ON CONFLICT(entry_date) DO UPDATE SET
              payload_nonce = excluded.payload_nonce,
              payload_cipher = excluded.payload_cipher,
              captured_at = excluded.captured_at
            ",
            params![
                snapshot.id,
                snapshot.entry_date,
                encrypted.nonce,
                encrypted.cipher,
                snapshot.captured_at
            ],
        )
        .map_err(|error| error.to_string())?;

    Ok(snapshot)
}

#[tauri::command]
fn get_draft_snapshot(entry_date: String, state: State<AppState>) -> Result<Option<DraftSnapshot>, String> {
    let key = state.require_key().map_err(|error| error.to_string())?;
    let connection = state.open_connection().map_err(|error| error.to_string())?;

    let record = connection
        .query_row(
            "
            SELECT payload_nonce, payload_cipher
            FROM draft_snapshots
            WHERE entry_date = ?1
            ",
            params![entry_date],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()
        .map_err(|error| error.to_string())?;

    match record {
        Some((nonce, cipher)) => {
            let payload = decrypt_content(&key, &cipher, &nonce).map_err(|error| error.to_string())?;
            let draft: DraftSnapshot =
                serde_json::from_str(&payload).map_err(|error| error.to_string())?;
            Ok(Some(draft))
        }
        None => Ok(None),
    }
}

#[tauri::command]
fn clear_draft_snapshot(entry_date: String, state: State<AppState>) -> Result<(), String> {
    let connection = state.open_connection().map_err(|error| error.to_string())?;
    connection
        .execute(
            "DELETE FROM draft_snapshots WHERE entry_date = ?1",
            params![entry_date],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn update_settings(input: UpdateSettingsInput, state: State<AppState>) -> Result<(), String> {
    let connection = state.open_connection().map_err(|error| error.to_string())?;
    let current = state.load_settings(&connection).map_err(|error| error.to_string())?;

    connection
        .execute(
            "
            UPDATE app_settings
            SET theme = ?1, font_scale = ?2, last_opened_date = ?3
            WHERE id = 1
            ",
            params![
                input.theme.unwrap_or(current.theme),
                input.font_scale.unwrap_or(current.font_scale),
                input
                    .last_opened_date
                    .unwrap_or(current.last_opened_date)
            ],
        )
        .map_err(|error| error.to_string())?;

    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let db_path = resolve_db_path(app.handle())?;
            let state = AppState::new(db_path).map_err(|error| -> Box<dyn std::error::Error> {
                Box::new(error)
            })?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            bootstrap_app,
            setup_password,
            unlock_app,
            get_entry_by_date,
            save_entry,
            search_entries,
            save_draft_snapshot,
            get_draft_snapshot,
            clear_draft_snapshot,
            update_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running dream diary application");
}

fn resolve_db_path(app: &AppHandle) -> Result<PathBuf, Box<dyn std::error::Error>> {
    let app_dir = app.path().app_data_dir()?;
    fs::create_dir_all(&app_dir)?;
    Ok(app_dir.join("dream-diary.sqlite3"))
}
