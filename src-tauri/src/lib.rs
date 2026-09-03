mod audio_metadata;

use tauri_plugin_sql::{Migration, MigrationKind};

fn foundation_migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create_foundation_health_table",
            sql: "
            CREATE TABLE IF NOT EXISTS foundation_health (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                probe TEXT NOT NULL,
                checked_at TEXT NOT NULL
            );
        ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_music_library_tables",
            sql: "
                CREATE TABLE IF NOT EXISTS music_folders (
                    id TEXT PRIMARY KEY NOT NULL,
                    root_path TEXT NOT NULL UNIQUE,
                    display_name TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS track_identities (
                    id TEXT PRIMARY KEY NOT NULL,
                    music_folder_id TEXT NOT NULL,
                    source TEXT NOT NULL,
                    source_identifier TEXT NOT NULL,
                    FOREIGN KEY (music_folder_id) REFERENCES music_folders(id) ON DELETE RESTRICT,
                    UNIQUE (music_folder_id, source, source_identifier),
                    UNIQUE (id, music_folder_id, source, source_identifier)
                );

                CREATE TABLE IF NOT EXISTS library_snapshots (
                    id TEXT NOT NULL UNIQUE,
                    music_folder_id TEXT NOT NULL,
                    FOREIGN KEY (music_folder_id) REFERENCES music_folders(id) ON DELETE RESTRICT,
                    UNIQUE (id, music_folder_id)
                );

                CREATE TABLE IF NOT EXISTS library_publications (
                    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                    library_snapshot_id TEXT NOT NULL UNIQUE,
                    music_folder_id TEXT NOT NULL,
                    folder_generation INTEGER NOT NULL CHECK (folder_generation >= 1),
                    selected_at TEXT NOT NULL,
                    FOREIGN KEY (library_snapshot_id, music_folder_id) REFERENCES library_snapshots(id, music_folder_id) ON DELETE RESTRICT,
                    UNIQUE (music_folder_id, folder_generation)
                );

                CREATE TABLE IF NOT EXISTS tracks (
                    library_snapshot_id TEXT NOT NULL,
                    id TEXT NOT NULL,
                    music_folder_id TEXT NOT NULL,
                    source TEXT NOT NULL,
                    source_identifier TEXT NOT NULL,
                    path TEXT NOT NULL,
                    relative_path TEXT NOT NULL,
                    file_name TEXT NOT NULL,
                    format TEXT NOT NULL CHECK (format IN ('wav', 'mp3', 'flac')),
                    title TEXT NOT NULL,
                    artist TEXT,
                    album TEXT,
                    duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
                    metadata_status TEXT NOT NULL CHECK (metadata_status IN ('tagged', 'fallback')),
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (library_snapshot_id, id),
                    FOREIGN KEY (library_snapshot_id) REFERENCES library_snapshots(id) ON DELETE RESTRICT,
                    FOREIGN KEY (music_folder_id) REFERENCES music_folders(id) ON DELETE RESTRICT,
                    FOREIGN KEY (library_snapshot_id, music_folder_id) REFERENCES library_snapshots(id, music_folder_id) ON DELETE RESTRICT,
                    FOREIGN KEY (id, music_folder_id, source, source_identifier) REFERENCES track_identities(id, music_folder_id, source, source_identifier) ON DELETE RESTRICT,
                    UNIQUE (library_snapshot_id, source, source_identifier)
                );
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "create_markers",
            sql: "
                CREATE TABLE IF NOT EXISTS markers (
                    id TEXT PRIMARY KEY NOT NULL,
                    track_id TEXT NOT NULL,
                    position_ms INTEGER NOT NULL CHECK (typeof(position_ms) = 'integer' AND position_ms >= 0),
                    label TEXT,
                    body TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    deleted_at TEXT CHECK (deleted_at IS NULL OR (typeof(deleted_at) = 'text' AND length(deleted_at) > 0)),
                    FOREIGN KEY (track_id) REFERENCES track_identities(id) ON DELETE RESTRICT
                );

                CREATE INDEX IF NOT EXISTS markers_track_active_order
                    ON markers (track_id, deleted_at, position_ms, created_at, id);
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "create_play_events_and_notes",
            sql: "
                CREATE TABLE IF NOT EXISTS play_events (
                    id TEXT PRIMARY KEY NOT NULL,
                    track_id TEXT NOT NULL,
                    started_at TEXT NOT NULL CHECK (typeof(started_at) = 'text' AND length(started_at) > 0),
                    ended_at TEXT CHECK (ended_at IS NULL OR (typeof(ended_at) = 'text' AND length(ended_at) > 0)),
                    start_position_ms INTEGER NOT NULL CHECK (typeof(start_position_ms) = 'integer' AND start_position_ms >= 0),
                    end_position_ms INTEGER CHECK (end_position_ms IS NULL OR (typeof(end_position_ms) = 'integer' AND end_position_ms >= 0)),
                    mode TEXT NOT NULL CHECK (mode IN ('listen', 'practice')),
                    playback_rate REAL NOT NULL CHECK (typeof(playback_rate) IN ('integer', 'real') AND playback_rate > 0),
                    loop_start_ms INTEGER,
                    loop_end_ms INTEGER,
                    closed_reason TEXT CHECK (closed_reason IS NULL OR closed_reason IN ('pause', 'ended', 'track-change', 'mode-change', 'rate-change', 'loop-change', 'manual-seek', 'load-failure', 'retry', 'unmount')),
                    recovered_at TEXT CHECK (recovered_at IS NULL OR (typeof(recovered_at) = 'text' AND length(recovered_at) > 0)),
                    active_slot INTEGER CHECK (active_slot IS NULL OR active_slot = 1),
                    CHECK ((ended_at IS NULL AND end_position_ms IS NULL) OR (ended_at IS NOT NULL AND end_position_ms IS NOT NULL)),
                    CHECK ((loop_start_ms IS NULL AND loop_end_ms IS NULL) OR (typeof(loop_start_ms) = 'integer' AND typeof(loop_end_ms) = 'integer' AND loop_start_ms >= 0 AND loop_start_ms < loop_end_ms)),
                    CHECK (active_slot IS NULL OR (ended_at IS NULL AND recovered_at IS NULL)),
                    FOREIGN KEY (track_id) REFERENCES track_identities(id) ON DELETE RESTRICT,
                    UNIQUE (id, track_id)
                );

                CREATE UNIQUE INDEX IF NOT EXISTS play_events_one_active
                    ON play_events (active_slot)
                    WHERE active_slot IS NOT NULL;

                CREATE INDEX IF NOT EXISTS play_events_track_order
                    ON play_events (track_id, started_at DESC, id DESC);

                CREATE TABLE IF NOT EXISTS track_notes (
                    id TEXT PRIMARY KEY NOT NULL,
                    track_id TEXT NOT NULL,
                    body TEXT NOT NULL CHECK (typeof(body) = 'text') CHECK (length(trim(body)) > 0) CHECK (body = trim(body)),
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    deleted_at TEXT CHECK (deleted_at IS NULL OR (typeof(deleted_at) = 'text' AND length(deleted_at) > 0)),
                    FOREIGN KEY (track_id) REFERENCES track_identities(id) ON DELETE RESTRICT
                );

                CREATE INDEX IF NOT EXISTS track_notes_track_active_order
                    ON track_notes (track_id, deleted_at, created_at DESC, id DESC);

                CREATE TABLE IF NOT EXISTS listening_notes (
                    id TEXT PRIMARY KEY NOT NULL,
                    play_event_id TEXT NOT NULL,
                    track_id TEXT NOT NULL,
                    body TEXT NOT NULL CHECK (typeof(body) = 'text') CHECK (length(trim(body)) > 0) CHECK (body = trim(body)),
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    deleted_at TEXT CHECK (deleted_at IS NULL OR (typeof(deleted_at) = 'text' AND length(deleted_at) > 0)),
                    FOREIGN KEY (play_event_id, track_id) REFERENCES play_events(id, track_id) ON DELETE RESTRICT
                );

                CREATE INDEX IF NOT EXISTS listening_notes_track_active_order
                    ON listening_notes (track_id, deleted_at, created_at DESC, id DESC);
            ",
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:loupe-play.db", foundation_migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            audio_metadata::read_audio_metadata,
            audio_metadata::read_selected_audio_metadata
        ])
        .run(tauri::generate_context!())
        .expect("error while running LoupePlay");
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    fn normalized_sql(sql: &str) -> String {
        sql.split_whitespace().collect::<Vec<_>>().join(" ")
    }

    fn table_definition<'a>(sql: &'a str, table: &str) -> &'a str {
        let marker = format!("CREATE TABLE IF NOT EXISTS {table} (");
        let start = sql
            .find(&marker)
            .unwrap_or_else(|| panic!("migration must create {table}"));
        let tail = &sql[start..];
        let end = tail
            .find(");")
            .unwrap_or_else(|| panic!("{table} definition must terminate"));

        &tail[..end + 2]
    }

    fn library_migration() -> tauri_plugin_sql::Migration {
        super::foundation_migrations()
            .into_iter()
            .find(|migration| migration.version == 2)
            .expect("migration v2 must add the persisted music library")
    }

    fn marker_migration() -> tauri_plugin_sql::Migration {
        super::foundation_migrations()
            .into_iter()
            .find(|migration| migration.version == 3)
            .expect("migration v3 must add persistent Markers")
    }

    fn notes_and_play_events_migration() -> tauri_plugin_sql::Migration {
        super::foundation_migrations()
            .into_iter()
            .find(|migration| migration.version == 4)
            .expect("migration v4 must add PlayEvents and Notes")
    }

    #[test]
    fn marker_migration_v3_is_additive_after_unchanged_foundation_and_library_migrations() {
        let migrations = super::foundation_migrations();
        let identity = migrations
            .iter()
            .filter(|migration| migration.version <= 3)
            .map(|migration| (migration.version, migration.description))
            .collect::<Vec<_>>();

        assert_eq!(
            identity,
            vec![
                (1, "create_foundation_health_table"),
                (2, "create_music_library_tables"),
                (3, "create_markers")
            ],
            "Marker persistence must be a new v3 migration, never a rewrite of v1 or v2"
        );
    }

    #[test]
    fn notes_and_play_events_migration_v4_is_additive_and_encodes_ownership() {
        let migrations = super::foundation_migrations();
        let identity = migrations
            .iter()
            .map(|migration| (migration.version, migration.description))
            .collect::<Vec<_>>();
        assert_eq!(
            identity,
            vec![
                (1, "create_foundation_health_table"),
                (2, "create_music_library_tables"),
                (3, "create_markers"),
                (4, "create_play_events_and_notes")
            ]
        );

        let migration = notes_and_play_events_migration();
        let sql = normalized_sql(migration.sql);
        let play_events = table_definition(&sql, "play_events");
        let track_notes = table_definition(&sql, "track_notes");
        let listening_notes = table_definition(&sql, "listening_notes");

        for required_fragment in [
            "track_id TEXT NOT NULL",
            "start_position_ms INTEGER NOT NULL CHECK (typeof(start_position_ms) = 'integer' AND start_position_ms >= 0)",
            "mode TEXT NOT NULL CHECK (mode IN ('listen', 'practice'))",
            "playback_rate REAL NOT NULL",
            "UNIQUE (id, track_id)",
            "FOREIGN KEY (track_id) REFERENCES track_identities(id) ON DELETE RESTRICT",
        ] {
            assert!(
                play_events.contains(required_fragment),
                "PlayEvent schema is missing: {required_fragment}"
            );
        }
        assert!(
            play_events.contains("loop_start_ms INTEGER")
                && play_events.contains("loop_end_ms INTEGER")
                && play_events.contains("recovered_at TEXT")
                && play_events.contains("active_slot INTEGER"),
            "PlayEvent schema must preserve loop and recovery state"
        );

        for (definition, table) in [
            (track_notes, "Track Note"),
            (listening_notes, "Listening Note"),
        ] {
            assert!(definition.contains("body TEXT NOT NULL"));
            assert!(definition.contains("created_at TEXT NOT NULL"));
            assert!(definition.contains("updated_at TEXT NOT NULL"));
            assert!(definition.contains("deleted_at TEXT"));
            assert!(
                definition.contains("CHECK (length(trim(body)) > 0)"),
                "{table} must reject blank bodies"
            );
        }
        assert!(track_notes
            .contains("FOREIGN KEY (track_id) REFERENCES track_identities(id) ON DELETE RESTRICT"));
        assert!(listening_notes.contains(
            "FOREIGN KEY (play_event_id, track_id) REFERENCES play_events(id, track_id) ON DELETE RESTRICT"
        ));
        assert!(sql.contains(
            "CREATE UNIQUE INDEX IF NOT EXISTS play_events_one_active ON play_events (active_slot) WHERE active_slot IS NOT NULL"
        ));
    }

    #[test]
    fn notes_and_play_events_migration_v4_enforces_real_sqlite_boundaries() {
        tauri::async_runtime::block_on(async {
            use sqlx::{Connection, SqliteConnection};

            let mut database = SqliteConnection::connect("sqlite::memory:")
                .await
                .expect("an in-memory SQLite database must open");
            sqlx::query("PRAGMA foreign_keys = ON")
                .execute(&mut database)
                .await
                .expect("foreign-key enforcement must be enabled");
            for migration in super::foundation_migrations() {
                sqlx::query(migration.sql)
                    .execute(&mut database)
                    .await
                    .unwrap_or_else(|error| {
                        panic!(
                            "migration v{} must execute before the Note boundary check: {error}",
                            migration.version
                        )
                    });
            }

            sqlx::query("INSERT INTO music_folders (id, root_path, display_name) VALUES (?, ?, ?)")
                .bind("folder-notes")
                .bind("/fixture-notes")
                .bind("Fixture Notes")
                .execute(&mut database)
                .await
                .expect("the fixture folder must persist");
            for (track_id, source_identifier) in
                [("track-notes", "one.wav"), ("track-other", "two.wav")]
            {
                sqlx::query(
                    "INSERT INTO track_identities (id, music_folder_id, source, source_identifier) \
                     VALUES (?, ?, ?, ?)",
                )
                .bind(track_id)
                .bind("folder-notes")
                .bind("local")
                .bind(source_identifier)
                .execute(&mut database)
                .await
                .expect("both fixture Track identities must persist");
            }

            sqlx::query(
                "INSERT INTO play_events (\
                     id, track_id, started_at, start_position_ms, mode, playback_rate, \
                     loop_start_ms, loop_end_ms, active_slot\
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .bind("event-notes")
            .bind("track-notes")
            .bind("2026-09-02T10:00:00Z")
            .bind(1_000_i64)
            .bind("practice")
            .bind(0.8_f64)
            .bind(500_i64)
            .bind(1_500_i64)
            .bind(1_i64)
            .execute(&mut database)
            .await
            .expect("one valid active PlayEvent must persist");

            let second_active = sqlx::query(
                "INSERT INTO play_events (\
                     id, track_id, started_at, start_position_ms, mode, playback_rate, active_slot\
                 ) VALUES (?, ?, ?, ?, ?, ?, ?)",
            )
            .bind("event-second-active")
            .bind("track-other")
            .bind("2026-09-02T10:01:00Z")
            .bind(0_i64)
            .bind("listen")
            .bind(1_f64)
            .bind(1_i64)
            .execute(&mut database)
            .await
            .expect_err("only one active PlayEvent may own the active slot");
            assert_eq!(
                second_active
                    .as_database_error()
                    .map(sqlx::error::DatabaseError::kind),
                Some(sqlx::error::ErrorKind::UniqueViolation)
            );

            for (id, position, mode, loop_start, loop_end) in [
                (
                    "event-fractional",
                    1.5_f64,
                    "listen",
                    None::<i64>,
                    None::<i64>,
                ),
                ("event-mode", 1_f64, "study", None::<i64>, None::<i64>),
                ("event-half-loop", 1_f64, "listen", Some(1_i64), None::<i64>),
            ] {
                let invalid_event = sqlx::query(
                    "INSERT INTO play_events (\
                         id, track_id, started_at, start_position_ms, mode, playback_rate, \
                         loop_start_ms, loop_end_ms\
                     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                )
                .bind(id)
                .bind("track-notes")
                .bind("2026-09-02T10:02:00Z")
                .bind(position)
                .bind(mode)
                .bind(1_f64)
                .bind(loop_start)
                .bind(loop_end)
                .execute(&mut database)
                .await;
                assert!(
                    invalid_event.is_err(),
                    "invalid PlayEvent {id} must be rejected"
                );
            }

            sqlx::query(
                "INSERT INTO track_notes (id, track_id, body, created_at, updated_at) \
                 VALUES (?, ?, ?, ?, ?)",
            )
            .bind("track-note")
            .bind("track-notes")
            .bind("曲全体を聴く")
            .bind("2026-09-02T11:00:00Z")
            .bind("2026-09-02T11:00:00Z")
            .execute(&mut database)
            .await
            .expect("a valid Track Note must persist");
            sqlx::query(
                "INSERT INTO listening_notes (\
                     id, play_event_id, track_id, body, created_at, updated_at\
                 ) VALUES (?, ?, ?, ?, ?, ?)",
            )
            .bind("listening-note")
            .bind("event-notes")
            .bind("track-notes")
            .bind("今日はAメロがよかった")
            .bind("2026-09-02T11:01:00Z")
            .bind("2026-09-02T11:01:00Z")
            .execute(&mut database)
            .await
            .expect("a Listening Note must belong to the same-Track PlayEvent");

            let blank_note = sqlx::query(
                "INSERT INTO track_notes (id, track_id, body, created_at, updated_at) \
                 VALUES (?, ?, ?, ?, ?)",
            )
            .bind("track-note-blank")
            .bind("track-notes")
            .bind("   ")
            .bind("2026-09-02T11:02:00Z")
            .bind("2026-09-02T11:02:00Z")
            .execute(&mut database)
            .await
            .expect_err("blank Note bodies must be rejected");
            assert_eq!(
                blank_note
                    .as_database_error()
                    .map(sqlx::error::DatabaseError::kind),
                Some(sqlx::error::ErrorKind::CheckViolation)
            );

            let mismatched_listening_note = sqlx::query(
                "INSERT INTO listening_notes (\
                     id, play_event_id, track_id, body, created_at, updated_at\
                 ) VALUES (?, ?, ?, ?, ?, ?)",
            )
            .bind("listening-note-mismatch")
            .bind("event-notes")
            .bind("track-other")
            .bind("別のTrack")
            .bind("2026-09-02T11:03:00Z")
            .bind("2026-09-02T11:03:00Z")
            .execute(&mut database)
            .await
            .expect_err("a Listening Note must not borrow another Track's PlayEvent");
            assert_eq!(
                mismatched_listening_note
                    .as_database_error()
                    .map(sqlx::error::DatabaseError::kind),
                Some(sqlx::error::ErrorKind::ForeignKeyViolation)
            );

            let violations = sqlx::query("PRAGMA foreign_key_check")
                .fetch_all(&mut database)
                .await
                .expect("the Note database must support foreign_key_check");
            assert!(violations.is_empty());
        });
    }

    #[test]
    fn note_search_query_is_literal_active_and_current_in_real_sqlite() {
        tauri::async_runtime::block_on(async {
            use sqlx::{Connection, Row, SqliteConnection};

            let mut database = SqliteConnection::connect("sqlite::memory:")
                .await
                .expect("an in-memory SQLite database must open");
            sqlx::query("PRAGMA foreign_keys = ON")
                .execute(&mut database)
                .await
                .expect("foreign-key enforcement must be enabled");
            for migration in super::foundation_migrations() {
                sqlx::query(migration.sql)
                    .execute(&mut database)
                    .await
                    .unwrap_or_else(|error| {
                        panic!(
                            "migration v{} must execute before the search boundary check: {error}",
                            migration.version
                        )
                    });
            }

            sqlx::query("INSERT INTO music_folders (id, root_path, display_name) VALUES (?, ?, ?)")
                .bind("folder-search")
                .bind("/fixture-search")
                .bind("Fixture Search")
                .execute(&mut database)
                .await
                .expect("the fixture folder must persist");
            for (track_id, source_identifier) in
                [("track-current", "current.wav"), ("track-old", "old.wav")]
            {
                sqlx::query(
                    "INSERT INTO track_identities (id, music_folder_id, source, source_identifier) \
                     VALUES (?, ?, ?, ?)",
                )
                .bind(track_id)
                .bind("folder-search")
                .bind("local")
                .bind(source_identifier)
                .execute(&mut database)
                .await
                .expect("both fixture Track identities must persist");
            }

            for snapshot_id in ["snapshot-old", "snapshot-current"] {
                sqlx::query("INSERT INTO library_snapshots (id, music_folder_id) VALUES (?, ?)")
                    .bind(snapshot_id)
                    .bind("folder-search")
                    .execute(&mut database)
                    .await
                    .expect("both fixture snapshots must persist");
            }
            for (snapshot_id, track_id, source_identifier, title) in [
                ("snapshot-old", "track-old", "old.wav", "Old 100%_!"),
                (
                    "snapshot-current",
                    "track-current",
                    "current.wav",
                    "Current Track",
                ),
            ] {
                sqlx::query(
                    "INSERT INTO tracks (\
                         library_snapshot_id, id, music_folder_id, source, source_identifier, \
                         path, relative_path, file_name, format, title, artist, album, \
                         duration_ms, metadata_status, updated_at\
                     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                )
                .bind(snapshot_id)
                .bind(track_id)
                .bind("folder-search")
                .bind("local")
                .bind(source_identifier)
                .bind(format!("/fixture-search/{source_identifier}"))
                .bind(source_identifier)
                .bind(source_identifier)
                .bind("wav")
                .bind(title)
                .bind(Option::<String>::None)
                .bind(Option::<String>::None)
                .bind(1_000_i64)
                .bind("fallback")
                .bind("2026-09-02T12:00:00Z")
                .execute(&mut database)
                .await
                .expect("each snapshot observation must persist");
            }
            for (snapshot_id, generation, selected_at) in [
                ("snapshot-old", 1_i64, "2026-09-02T11:00:00Z"),
                ("snapshot-current", 2_i64, "2026-09-02T12:00:00Z"),
            ] {
                sqlx::query(
                    "INSERT INTO library_publications (\
                         library_snapshot_id, music_folder_id, folder_generation, selected_at\
                     ) VALUES (?, ?, ?, ?)",
                )
                .bind(snapshot_id)
                .bind("folder-search")
                .bind(generation)
                .bind(selected_at)
                .execute(&mut database)
                .await
                .expect("both fixture publications must persist");
            }

            for (id, track_id, deleted_at) in [
                ("marker-current", "track-current", None),
                (
                    "marker-deleted",
                    "track-current",
                    Some("2026-09-02T12:02:00Z"),
                ),
                ("marker-old", "track-old", None),
            ] {
                sqlx::query(
                    "INSERT INTO markers (\
                         id, track_id, position_ms, label, created_at, updated_at, deleted_at\
                     ) VALUES (?, ?, ?, ?, ?, ?, ?)",
                )
                .bind(id)
                .bind(track_id)
                .bind(42_000_i64)
                .bind("100%_!")
                .bind("2026-09-02T12:01:00Z")
                .bind("2026-09-02T12:01:00Z")
                .bind(deleted_at)
                .execute(&mut database)
                .await
                .expect("fixture Markers must persist");
            }

            let rows = sqlx::query(include_str!("../../src/lib/search-current-publication.sql"))
                .bind("%100!%!_!!%")
                .fetch_all(&mut database)
                .await
                .expect("the shared literal search query must execute in SQLite");

            assert_eq!(rows.len(), 1);
            assert_eq!(rows[0].get::<String, _>("id"), "marker-current");
            assert_eq!(rows[0].get::<String, _>("kind"), "marker");
            assert_eq!(rows[0].get::<String, _>("track_id"), "track-current");
            assert_eq!(rows[0].get::<i64, _>("position_ms"), 42_000_i64);
        });
    }

    #[test]
    fn marker_migration_v3_has_track_owned_nullable_soft_delete_schema_and_order_index() {
        let migration = marker_migration();
        let sql = normalized_sql(migration.sql);
        let markers = table_definition(&sql, "markers");

        assert_eq!(migration.description, "create_markers");
        for required_fragment in [
            "id TEXT PRIMARY KEY NOT NULL",
            "track_id TEXT NOT NULL",
            "position_ms INTEGER NOT NULL CHECK (typeof(position_ms) = 'integer' AND position_ms >= 0)",
            "label TEXT",
            "body TEXT",
            "created_at TEXT NOT NULL",
            "updated_at TEXT NOT NULL",
            "deleted_at TEXT",
            "CHECK (deleted_at IS NULL OR (typeof(deleted_at) = 'text' AND length(deleted_at) > 0))",
            "FOREIGN KEY (track_id) REFERENCES track_identities(id) ON DELETE RESTRICT",
        ] {
            assert!(
                markers.contains(required_fragment),
                "migration v3 is missing Marker schema fragment: {required_fragment}"
            );
        }

        for nullable_column in [
            "label TEXT NOT NULL",
            "body TEXT NOT NULL",
            "deleted_at TEXT NOT NULL",
        ] {
            assert!(
                !markers.contains(nullable_column),
                "Marker schema must keep optional content and deletion state nullable: {nullable_column}"
            );
        }

        assert!(
            sql.contains("ON markers (track_id, deleted_at, position_ms, created_at, id)"),
            "migration v3 must index the active-list query and its deterministic order"
        );
        assert!(
            sql.contains("CREATE INDEX IF NOT EXISTS") && !sql.contains("CREATE UNIQUE INDEX"),
            "the Marker ordering index must be non-unique so one position can hold multiple Markers"
        );
        assert!(
            !markers.contains("UNIQUE (track_id, position_ms)"),
            "the same Track position must accept multiple Markers"
        );
    }

    #[test]
    fn marker_migration_v3_enforces_identity_position_soft_delete_and_restore_in_real_sqlite() {
        tauri::async_runtime::block_on(async {
            use sqlx::{Connection, SqliteConnection};

            let marker = marker_migration();
            let mut database = SqliteConnection::connect("sqlite::memory:")
                .await
                .expect("an in-memory SQLite database must open");
            sqlx::query("PRAGMA foreign_keys = ON")
                .execute(&mut database)
                .await
                .expect("foreign-key enforcement must be enabled");
            let foreign_keys_enabled = sqlx::query_scalar::<_, i64>("PRAGMA foreign_keys")
                .fetch_one(&mut database)
                .await
                .expect("the foreign-key pragma must be readable");
            assert_eq!(foreign_keys_enabled, 1);

            for migration in super::foundation_migrations()
                .into_iter()
                .filter(|migration| migration.version < marker.version)
            {
                sqlx::query(migration.sql)
                    .execute(&mut database)
                    .await
                    .unwrap_or_else(|error| {
                        panic!(
                            "migration v{} must remain executable before Marker v3: {error}",
                            migration.version
                        )
                    });
            }
            sqlx::query(marker.sql)
                .execute(&mut database)
                .await
                .expect("migration v3 must be executable SQLite DDL");

            sqlx::query("INSERT INTO music_folders (id, root_path, display_name) VALUES (?, ?, ?)")
                .bind("folder-1")
                .bind("/music")
                .bind("Music")
                .execute(&mut database)
                .await
                .expect("a valid folder must be stored before its Track identity");
            sqlx::query(
                "INSERT INTO track_identities (id, music_folder_id, source, source_identifier) \
                 VALUES (?, ?, ?, ?)",
            )
            .bind("track-1")
            .bind("folder-1")
            .bind("local")
            .bind("song.wav")
            .execute(&mut database)
            .await
            .expect("a persistent Track identity must own its Markers");

            for (id, position_ms, created_at, label, body) in [
                (
                    "marker-z",
                    4_200_i64,
                    "2026-09-02T12:01:00Z",
                    Some("later"),
                    None,
                ),
                (
                    "marker-b",
                    4_200_i64,
                    "2026-09-02T12:00:00Z",
                    None,
                    Some("same instant"),
                ),
                ("marker-a", 4_200_i64, "2026-09-02T12:00:00Z", None, None),
                (
                    "marker-first",
                    1_000_i64,
                    "2026-09-02T12:02:00Z",
                    Some("first by position"),
                    None,
                ),
            ] {
                sqlx::query(
                    "INSERT INTO markers (\
                         id, track_id, position_ms, label, body, created_at, updated_at, deleted_at\
                     ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)",
                )
                .bind(id)
                .bind("track-1")
                .bind(position_ms)
                .bind(label)
                .bind(body)
                .bind(created_at)
                .bind(created_at)
                .execute(&mut database)
                .await
                .expect("valid Markers, including empty and duplicate-position rows, must persist");
            }

            let ordered_ids = sqlx::query_scalar::<_, String>(
                "SELECT id FROM markers \
                 WHERE track_id = ? AND deleted_at IS NULL \
                 ORDER BY position_ms ASC, created_at ASC, id ASC",
            )
            .bind("track-1")
            .fetch_all(&mut database)
            .await
            .expect("active Markers must be readable in deterministic order");
            assert_eq!(
                ordered_ids,
                vec!["marker-first", "marker-a", "marker-b", "marker-z"]
            );

            let unknown_track = sqlx::query(
                "INSERT INTO markers (\
                     id, track_id, position_ms, created_at, updated_at\
                 ) VALUES (?, ?, ?, ?, ?)",
            )
            .bind("marker-orphan")
            .bind("missing-track")
            .bind(500_i64)
            .bind("2026-09-02T12:03:00Z")
            .bind("2026-09-02T12:03:00Z")
            .execute(&mut database)
            .await
            .expect_err("a Marker must not reference an unknown Track identity");
            assert_eq!(
                unknown_track
                    .as_database_error()
                    .map(sqlx::error::DatabaseError::kind),
                Some(sqlx::error::ErrorKind::ForeignKeyViolation)
            );

            let negative_position = sqlx::query(
                "INSERT INTO markers (\
                     id, track_id, position_ms, created_at, updated_at\
                 ) VALUES (?, ?, ?, ?, ?)",
            )
            .bind("marker-negative")
            .bind("track-1")
            .bind(-1_i64)
            .bind("2026-09-02T12:03:00Z")
            .bind("2026-09-02T12:03:00Z")
            .execute(&mut database)
            .await
            .expect_err("a Marker position must never be negative");
            assert_eq!(
                negative_position
                    .as_database_error()
                    .map(sqlx::error::DatabaseError::kind),
                Some(sqlx::error::ErrorKind::CheckViolation)
            );

            let fractional_position = sqlx::query(
                "INSERT INTO markers (\
                     id, track_id, position_ms, created_at, updated_at\
                 ) VALUES (?, ?, ?, ?, ?)",
            )
            .bind("marker-fractional")
            .bind("track-1")
            .bind(1.5_f64)
            .bind("2026-09-02T12:03:00Z")
            .bind("2026-09-02T12:03:00Z")
            .execute(&mut database)
            .await
            .expect_err("a persisted Marker position must remain an integer millisecond");
            assert!(fractional_position.as_database_error().is_some());

            let empty_deletion = sqlx::query("UPDATE markers SET deleted_at = '' WHERE id = ?")
                .bind("marker-b")
                .execute(&mut database)
                .await
                .expect_err("an empty deletion timestamp is neither active nor deleted");
            assert!(empty_deletion.as_database_error().is_some());

            let blob_deletion = sqlx::query("UPDATE markers SET deleted_at = X'01' WHERE id = ?")
                .bind("marker-b")
                .execute(&mut database)
                .await
                .expect_err("a deletion timestamp must not accept non-text storage classes");
            assert!(blob_deletion.as_database_error().is_some());

            let deleted_at = "2026-09-02T12:04:00Z";
            sqlx::query(
                "UPDATE markers SET deleted_at = ?, updated_at = ? \
                 WHERE id = ? AND deleted_at IS NULL",
            )
            .bind(deleted_at)
            .bind(deleted_at)
            .bind("marker-a")
            .execute(&mut database)
            .await
            .expect("soft delete must preserve the Marker row");
            let active_after_delete = sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM markers WHERE id = ? AND deleted_at IS NULL",
            )
            .bind("marker-a")
            .fetch_one(&mut database)
            .await
            .expect("active Marker state must be queryable after soft delete");
            let deleted_row =
                sqlx::query_as::<_, (String, Option<String>, Option<String>, String)>(
                    "SELECT id, label, body, deleted_at FROM markers WHERE id = ?",
                )
                .bind("marker-a")
                .fetch_one(&mut database)
                .await
                .expect("soft delete must retain the original Marker identity and content");
            assert_eq!(active_after_delete, 0);
            assert_eq!(
                deleted_row,
                ("marker-a".to_owned(), None, None, deleted_at.to_owned())
            );

            let restored_at = "2026-09-02T12:05:00Z";
            sqlx::query(
                "UPDATE markers SET deleted_at = NULL, updated_at = ? \
                 WHERE id = ? AND deleted_at IS NOT NULL",
            )
            .bind(restored_at)
            .bind("marker-a")
            .execute(&mut database)
            .await
            .expect("restore must clear deletion state on the same Marker row");
            let restored =
                sqlx::query_as::<_, (String, i64, Option<String>, Option<String>, String)>(
                    "SELECT id, position_ms, label, body, updated_at \
                 FROM markers WHERE id = ? AND deleted_at IS NULL",
                )
                .bind("marker-a")
                .fetch_one(&mut database)
                .await
                .expect("restored Marker must return as the same active row");
            assert_eq!(
                restored,
                (
                    "marker-a".to_owned(),
                    4_200,
                    None,
                    None,
                    restored_at.to_owned()
                )
            );

            let parent_delete = sqlx::query("DELETE FROM track_identities WHERE id = ?")
                .bind("track-1")
                .execute(&mut database)
                .await
                .expect_err("Marker ownership must restrict deletion of its Track identity");
            assert!(
                parent_delete.as_database_error().is_some(),
                "SQLite must reject deletion while a Marker still owns the Track identity"
            );
            let retained_parent: i64 =
                sqlx::query_scalar("SELECT COUNT(*) FROM track_identities WHERE id = ?")
                    .bind("track-1")
                    .fetch_one(&mut database)
                    .await
                    .expect("the restricted Track identity must remain after the rejected delete");
            assert_eq!(retained_parent, 1);

            let violations = sqlx::query("PRAGMA foreign_key_check")
                .fetch_all(&mut database)
                .await
                .expect("the database must support a foreign-key check after Marker mutations");
            assert!(
                violations.is_empty(),
                "all persisted and restored Markers must retain valid Track ownership"
            );
        });
    }

    #[test]
    fn foundation_migration_v1_stays_unchanged_when_the_library_is_added() {
        let migrations = super::foundation_migrations();
        let migration = migrations
            .iter()
            .find(|migration| migration.version == 1)
            .expect("foundation migration v1 must remain available");

        let expected = "
            CREATE TABLE IF NOT EXISTS foundation_health (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                probe TEXT NOT NULL,
                checked_at TEXT NOT NULL
            );
        ";

        assert_eq!(migration.description, "create_foundation_health_table");
        assert_eq!(migration.sql, expected);
    }

    #[test]
    fn library_migration_v2_has_folder_identity_snapshot_publication_and_track_schema() {
        let migration = library_migration();
        let sql = normalized_sql(migration.sql);
        let snapshots = table_definition(&sql, "library_snapshots");
        let publications = table_definition(&sql, "library_publications");

        assert_eq!(migration.description, "create_music_library_tables");
        for required_fragment in [
            "music_folders (",
            "id TEXT PRIMARY KEY",
            "root_path TEXT NOT NULL",
            "display_name TEXT NOT NULL",
            "track_identities (",
            "library_snapshots (",
            "id TEXT NOT NULL UNIQUE",
            "library_publications (",
            "tracks (",
            "library_snapshot_id TEXT NOT NULL",
            "music_folder_id TEXT NOT NULL",
            "source TEXT NOT NULL",
            "source_identifier TEXT NOT NULL",
            "path TEXT NOT NULL",
            "relative_path TEXT NOT NULL",
            "file_name TEXT NOT NULL",
            "format TEXT NOT NULL",
            "title TEXT NOT NULL",
            "artist TEXT",
            "album TEXT",
            "duration_ms INTEGER",
            "metadata_status TEXT NOT NULL",
            "updated_at TEXT NOT NULL",
        ] {
            assert!(
                sql.contains(required_fragment),
                "migration v2 is missing schema fragment: {required_fragment}"
            );
        }

        for nullable_column in [
            "artist TEXT NOT NULL",
            "album TEXT NOT NULL",
            "duration_ms INTEGER NOT NULL",
        ] {
            assert!(
                !sql.contains(nullable_column),
                "migration v2 must keep incomplete or missing metadata nullable: {nullable_column}"
            );
        }

        assert!(
            !snapshots.contains("sequence") && !snapshots.contains("selected_at"),
            "snapshot preparation must not claim publication time or order"
        );
        for required_publication_constraint in [
            "sequence INTEGER PRIMARY KEY AUTOINCREMENT",
            "library_snapshot_id TEXT NOT NULL",
            "music_folder_id TEXT NOT NULL",
            "folder_generation INTEGER NOT NULL CHECK (folder_generation >= 1)",
            "selected_at TEXT NOT NULL",
            "UNIQUE (music_folder_id, folder_generation)",
            "FOREIGN KEY (library_snapshot_id, music_folder_id) REFERENCES library_snapshots(id, music_folder_id) ON DELETE RESTRICT",
        ] {
            assert!(
                publications.contains(required_publication_constraint),
                "publication schema is missing constraint: {required_publication_constraint}"
            );
        }
        assert!(
            publications.contains("library_snapshot_id TEXT NOT NULL UNIQUE")
                || publications.contains("UNIQUE (library_snapshot_id)"),
            "one snapshot must have at most one publication"
        );
    }

    #[test]
    fn library_migration_v2_separates_track_identity_from_snapshot_observations() {
        let sql = normalized_sql(library_migration().sql);
        let identities = table_definition(&sql, "track_identities");
        let observations = table_definition(&sql, "tracks");

        for required_identity_constraint in [
            "id TEXT PRIMARY KEY",
            "music_folder_id TEXT NOT NULL",
            "source TEXT NOT NULL",
            "source_identifier TEXT NOT NULL",
            "UNIQUE (music_folder_id, source, source_identifier)",
            "UNIQUE (id, music_folder_id, source, source_identifier)",
            "FOREIGN KEY (music_folder_id) REFERENCES music_folders(id) ON DELETE RESTRICT",
        ] {
            assert!(
                identities.contains(required_identity_constraint),
                "stable Track identities are missing constraint: {required_identity_constraint}"
            );
        }

        assert!(
            observations.contains(
                "FOREIGN KEY (id, music_folder_id, source, source_identifier) REFERENCES track_identities(id, music_folder_id, source, source_identifier) ON DELETE RESTRICT"
            ),
            "snapshot observations must reference the matching stable Track identity"
        );
    }

    #[test]
    fn library_migration_v2_enforces_identity_references_and_domain_checks() {
        let sql = normalized_sql(library_migration().sql);

        for required_constraint in [
            "FOREIGN KEY (library_snapshot_id) REFERENCES library_snapshots(id) ON DELETE RESTRICT",
            "FOREIGN KEY (music_folder_id) REFERENCES music_folders(id) ON DELETE RESTRICT",
            "FOREIGN KEY (library_snapshot_id, music_folder_id) REFERENCES library_snapshots(id, music_folder_id) ON DELETE RESTRICT",
            "FOREIGN KEY (id, music_folder_id, source, source_identifier) REFERENCES track_identities(id, music_folder_id, source, source_identifier) ON DELETE RESTRICT",
            "PRIMARY KEY (library_snapshot_id, id)",
            "UNIQUE (id, music_folder_id)",
            "UNIQUE (library_snapshot_id, source, source_identifier)",
            "CHECK (format IN ('wav', 'mp3', 'flac'))",
            "CHECK (duration_ms IS NULL OR duration_ms >= 0)",
            "CHECK (metadata_status IN ('tagged', 'fallback'))",
        ] {
            assert!(
                sql.contains(required_constraint),
                "migration v2 is missing constraint: {required_constraint}"
            );
        }

        assert_eq!(
            sql.matches(
                "FOREIGN KEY (music_folder_id) REFERENCES music_folders(id) ON DELETE RESTRICT"
            )
            .count(),
            3,
            "identities, snapshots, and observations must retain their folder reference"
        );
    }

    #[test]
    fn library_migration_v2_keeps_publication_state_out_of_folder_and_snapshot_identity() {
        let sql = normalized_sql(library_migration().sql);
        let folders = table_definition(&sql, "music_folders");
        let snapshots = table_definition(&sql, "library_snapshots");

        assert!(!folders.contains("selected_at"));
        assert!(!folders.contains("sequence"));
        assert!(!snapshots.contains("selected_at"));
        assert!(!snapshots.contains("sequence"));
    }

    #[test]
    fn library_migration_v2_uses_publication_insertion_order_in_real_sqlite() {
        tauri::async_runtime::block_on(async {
            use sqlx::{Connection, SqliteConnection};

            let mut database = SqliteConnection::connect("sqlite::memory:")
                .await
                .expect("an in-memory SQLite database must open");
            sqlx::query("PRAGMA foreign_keys = ON")
                .execute(&mut database)
                .await
                .expect("foreign-key enforcement must be enabled for the migration test");
            let foreign_keys_enabled = sqlx::query_scalar::<_, i64>("PRAGMA foreign_keys")
                .fetch_one(&mut database)
                .await
                .expect("the foreign-key pragma must be readable");
            assert_eq!(foreign_keys_enabled, 1);
            sqlx::query(library_migration().sql)
                .execute(&mut database)
                .await
                .expect("migration v2 must be executable SQLite DDL");

            let tables = sqlx::query_scalar::<_, String>(
                "SELECT name FROM sqlite_master \
                 WHERE type = 'table' \
                   AND name IN ('music_folders', 'track_identities', 'library_snapshots', 'library_publications', 'tracks') \
                 ORDER BY name",
            )
            .fetch_all(&mut database)
            .await
            .expect("the migrated table names must be queryable");
            assert_eq!(
                tables,
                vec![
                    "library_publications",
                    "library_snapshots",
                    "music_folders",
                    "track_identities",
                    "tracks"
                ]
            );

            sqlx::query("INSERT INTO music_folders (id, root_path, display_name) VALUES (?, ?, ?)")
                .bind("folder-1")
                .bind("/music")
                .bind("Music")
                .execute(&mut database)
                .await
                .expect("a valid folder must be stored");
            sqlx::query(
                "INSERT INTO track_identities (id, music_folder_id, source, source_identifier) \
                 VALUES (?, ?, ?, ?)",
            )
            .bind("track-1")
            .bind("folder-1")
            .bind("local")
            .bind("song.wav")
            .execute(&mut database)
            .await
            .expect("a stable Track identity must be stored before observations");

            for (snapshot_id, title, updated_at) in [
                ("snapshot-a", "Prepared A", "2026-09-02T12:00:00Z"),
                ("snapshot-b", "Prepared B", "2026-09-02T12:01:00Z"),
            ] {
                sqlx::query("INSERT INTO library_snapshots (id, music_folder_id) VALUES (?, ?)")
                    .bind(snapshot_id)
                    .bind("folder-1")
                    .execute(&mut database)
                    .await
                    .expect("A then B snapshots must be prepared without publication state");
                sqlx::query(
                    "INSERT INTO tracks (\
                         library_snapshot_id, id, music_folder_id, source, source_identifier, \
                         path, relative_path, file_name, format, title, metadata_status, updated_at\
                     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                )
                .bind(snapshot_id)
                .bind("track-1")
                .bind("folder-1")
                .bind("local")
                .bind("song.wav")
                .bind("/music/song.wav")
                .bind("song.wav")
                .bind("song.wav")
                .bind("wav")
                .bind(title)
                .bind("fallback")
                .bind(updated_at)
                .execute(&mut database)
                .await
                .expect("each prepared snapshot must retain its own Track observation");
            }

            let unpublished_count =
                sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM library_publications")
                    .fetch_one(&mut database)
                    .await
                    .expect("publication rows must be countable");
            assert_eq!(unpublished_count, 0);

            // This schema-level test supplies successive generations directly so it can
            // isolate global publication ordering from the gateway's stale-generation
            // protocol. The separate stale-generation test covers two writers that read
            // the same base generation.
            for (snapshot_id, selected_at, folder_generation) in [
                ("snapshot-b", "2099-01-01T00:00:00Z", 1_i64),
                ("snapshot-a", "2000-01-01T00:00:00Z", 2_i64),
            ] {
                sqlx::query(
                    "INSERT INTO library_publications (\
                         library_snapshot_id, music_folder_id, folder_generation, selected_at\
                     ) VALUES (?, ?, ?, ?)",
                )
                .bind(snapshot_id)
                .bind("folder-1")
                .bind(folder_generation)
                .bind(selected_at)
                .execute(&mut database)
                .await
                .expect("B then A publication inserts must succeed");
            }

            let latest = sqlx::query_as::<_, (String, String, String, i64, i64)>(
                "SELECT snapshots.id, tracks.title, publications.selected_at, \
                        publications.sequence, publications.folder_generation \
                 FROM library_publications AS publications \
                 INNER JOIN library_snapshots AS snapshots \
                   ON snapshots.id = publications.library_snapshot_id \
                 INNER JOIN tracks \
                   ON tracks.library_snapshot_id = snapshots.id \
                 ORDER BY publications.sequence DESC \
                 LIMIT 1",
            )
            .fetch_one(&mut database)
            .await
            .expect("the last publication must be readable");
            assert_eq!(latest.0, "snapshot-a");
            assert_eq!(latest.1, "Prepared A");
            assert_eq!(latest.2, "2000-01-01T00:00:00Z");
            assert_eq!(latest.3, 2);
            assert_eq!(latest.4, 2);

            let duplicate_publication = sqlx::query(
                "INSERT INTO library_publications (\
                     library_snapshot_id, music_folder_id, folder_generation, selected_at\
                 ) VALUES (?, ?, ?, ?)",
            )
            .bind("snapshot-a")
            .bind("folder-1")
            .bind(3_i64)
            .bind("2026-09-02T13:00:00Z")
            .execute(&mut database)
            .await
            .expect_err("one snapshot must not be published twice");
            assert_eq!(
                duplicate_publication
                    .as_database_error()
                    .map(sqlx::error::DatabaseError::kind),
                Some(sqlx::error::ErrorKind::UniqueViolation)
            );

            let orphan_publication = sqlx::query(
                "INSERT INTO library_publications (\
                     library_snapshot_id, music_folder_id, folder_generation, selected_at\
                 ) VALUES (?, ?, ?, ?)",
            )
            .bind("missing-snapshot")
            .bind("folder-1")
            .bind(3_i64)
            .bind("2026-09-02T13:00:00Z")
            .execute(&mut database)
            .await
            .expect_err("a publication must reference an existing snapshot");
            assert_eq!(
                orphan_publication
                    .as_database_error()
                    .map(sqlx::error::DatabaseError::kind),
                Some(sqlx::error::ErrorKind::ForeignKeyViolation)
            );

            let missing_folder =
                sqlx::query("INSERT INTO library_snapshots (id, music_folder_id) VALUES (?, ?)")
                    .bind("snapshot-orphan")
                    .bind("missing-folder")
                    .execute(&mut database)
                    .await
                    .expect_err("the snapshot folder foreign key must reject orphan snapshots");
            assert_eq!(
                missing_folder
                    .as_database_error()
                    .map(sqlx::error::DatabaseError::kind),
                Some(sqlx::error::ErrorKind::ForeignKeyViolation)
            );

            sqlx::query(
                "INSERT INTO track_identities (id, music_folder_id, source, source_identifier) \
                 VALUES (?, ?, ?, ?)",
            )
            .bind("track-ogg")
            .bind("folder-1")
            .bind("local")
            .bind("unsupported.ogg")
            .execute(&mut database)
            .await
            .expect("the unsupported-format observation still needs a stable identity");

            let unsupported_format = sqlx::query(
                "INSERT INTO tracks (\
                     library_snapshot_id, id, music_folder_id, source, source_identifier, \
                     path, relative_path, file_name, format, title, metadata_status, updated_at\
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .bind("snapshot-a")
            .bind("track-ogg")
            .bind("folder-1")
            .bind("local")
            .bind("unsupported.ogg")
            .bind("/music/unsupported.ogg")
            .bind("unsupported.ogg")
            .bind("unsupported.ogg")
            .bind("ogg")
            .bind("Unsupported")
            .bind("fallback")
            .bind("2026-09-02T12:02:00Z")
            .execute(&mut database)
            .await
            .expect_err("the format CHECK must reject unsupported audio formats");
            assert_eq!(
                unsupported_format
                    .as_database_error()
                    .map(sqlx::error::DatabaseError::kind),
                Some(sqlx::error::ErrorKind::CheckViolation)
            );

            let violations = sqlx::query("PRAGMA foreign_key_check")
                .fetch_all(&mut database)
                .await
                .expect("the migrated database must support a foreign-key check");
            assert!(
                violations.is_empty(),
                "all successfully stored rows must satisfy foreign-key constraints"
            );
        });
    }

    #[test]
    fn marker_migration_v3_survives_a_closed_and_reopened_database_connection() {
        tauri::async_runtime::block_on(async {
            use std::time::{SystemTime, UNIX_EPOCH};

            use sqlx::{Connection, SqliteConnection};

            let unique_suffix = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("the system clock must be after the Unix epoch")
                .as_nanos();
            let database_path = std::env::temp_dir().join(format!(
                "loupe-play-marker-reopen-{}-{unique_suffix}.db",
                std::process::id()
            ));
            let database_url = format!("sqlite://{}?mode=rwc", database_path.display());

            let mut database = SqliteConnection::connect(&database_url)
                .await
                .expect("a temporary on-disk SQLite database must open");
            sqlx::query("PRAGMA foreign_keys = ON")
                .execute(&mut database)
                .await
                .expect("foreign-key enforcement must be enabled");
            for migration in super::foundation_migrations() {
                sqlx::query(migration.sql)
                    .execute(&mut database)
                    .await
                    .unwrap_or_else(|error| {
                        panic!(
                            "migration v{} must run before the reopen check: {error}",
                            migration.version
                        )
                    });
            }
            sqlx::query("INSERT INTO music_folders (id, root_path, display_name) VALUES (?, ?, ?)")
                .bind("folder-reopen")
                .bind("/fixture")
                .bind("Fixture")
                .execute(&mut database)
                .await
                .expect("the temporary folder identity must persist");
            sqlx::query(
                "INSERT INTO track_identities (id, music_folder_id, source, source_identifier) \
                 VALUES (?, ?, ?, ?)",
            )
            .bind("track-reopen")
            .bind("folder-reopen")
            .bind("local")
            .bind("fixture.wav")
            .execute(&mut database)
            .await
            .expect("the temporary Track identity must persist");
            sqlx::query(
                "INSERT INTO markers (\
                     id, track_id, position_ms, label, body, created_at, updated_at\
                 ) VALUES (?, ?, ?, ?, ?, ?, ?)",
            )
            .bind("marker-reopen")
            .bind("track-reopen")
            .bind(12_345_i64)
            .bind("再起動後")
            .bind("同じMarkerを読む")
            .bind("2026-09-02T12:00:00Z")
            .bind("2026-09-02T12:00:00Z")
            .execute(&mut database)
            .await
            .expect("the Marker must be stored before closing the connection");
            database
                .close()
                .await
                .expect("the first connection must close");

            let mut reopened = SqliteConnection::connect(&database_url)
                .await
                .expect("the same SQLite file must reopen through a new connection");
            let marker =
                sqlx::query_as::<_, (String, String, i64, Option<String>, Option<String>)>(
                    "SELECT id, track_id, position_ms, label, body \
                 FROM markers \
                 WHERE id = ? AND deleted_at IS NULL",
                )
                .bind("marker-reopen")
                .fetch_one(&mut reopened)
                .await
                .expect("the active Marker must survive the closed connection");
            assert_eq!(
                marker,
                (
                    "marker-reopen".to_owned(),
                    "track-reopen".to_owned(),
                    12_345,
                    Some("再起動後".to_owned()),
                    Some("同じMarkerを読む".to_owned())
                )
            );
            reopened
                .close()
                .await
                .expect("the reopened connection must close");
            std::fs::remove_file(&database_path)
                .expect("the temporary SQLite file must be removable after verification");
        });
    }

    #[test]
    fn library_migration_v2_rejects_stale_folder_generation_in_real_sqlite() {
        tauri::async_runtime::block_on(async {
            use sqlx::{Connection, SqliteConnection};

            let mut database = SqliteConnection::connect("sqlite::memory:")
                .await
                .expect("an in-memory SQLite database must open");
            sqlx::query("PRAGMA foreign_keys = ON")
                .execute(&mut database)
                .await
                .expect("foreign-key enforcement must be enabled");
            sqlx::query(library_migration().sql)
                .execute(&mut database)
                .await
                .expect("migration v2 must be executable SQLite DDL");

            for (folder_id, root_path) in [("folder-same", "/same"), ("folder-other", "/other")] {
                sqlx::query(
                    "INSERT INTO music_folders (id, root_path, display_name) VALUES (?, ?, ?)",
                )
                .bind(folder_id)
                .bind(root_path)
                .bind(folder_id)
                .execute(&mut database)
                .await
                .expect("both folder identities must be stored");
            }
            for (snapshot_id, folder_id) in [
                ("snapshot-first", "folder-same"),
                ("snapshot-stale", "folder-same"),
                ("snapshot-other", "folder-other"),
            ] {
                sqlx::query("INSERT INTO library_snapshots (id, music_folder_id) VALUES (?, ?)")
                    .bind(snapshot_id)
                    .bind(folder_id)
                    .execute(&mut database)
                    .await
                    .expect("same-base snapshots must be prepared before publication");
            }

            sqlx::query(
                "INSERT INTO library_publications (\
                     library_snapshot_id, music_folder_id, folder_generation, selected_at\
                 ) VALUES (?, ?, ?, ?)",
            )
            .bind("snapshot-first")
            .bind("folder-same")
            .bind(1_i64)
            .bind("2026-09-02T12:00:00Z")
            .execute(&mut database)
            .await
            .expect("the first generation-one publication must succeed");

            let stale_publication = sqlx::query(
                "INSERT INTO library_publications (\
                     library_snapshot_id, music_folder_id, folder_generation, selected_at\
                 ) VALUES (?, ?, ?, ?)",
            )
            .bind("snapshot-stale")
            .bind("folder-same")
            .bind(1_i64)
            .bind("2026-09-02T12:01:00Z")
            .execute(&mut database)
            .await
            .expect_err("a second publication from the same base generation must be rejected");
            assert_eq!(
                stale_publication
                    .as_database_error()
                    .map(sqlx::error::DatabaseError::kind),
                Some(sqlx::error::ErrorKind::UniqueViolation)
            );

            let latest_same_folder = sqlx::query_as::<_, (String, i64)>(
                "SELECT library_snapshot_id, folder_generation \
                 FROM library_publications \
                 WHERE music_folder_id = ? \
                 ORDER BY sequence DESC \
                 LIMIT 1",
            )
            .bind("folder-same")
            .fetch_one(&mut database)
            .await
            .expect("the winning publication must remain readable");
            assert_eq!(latest_same_folder, ("snapshot-first".to_owned(), 1));

            sqlx::query(
                "INSERT INTO library_publications (\
                     library_snapshot_id, music_folder_id, folder_generation, selected_at\
                 ) VALUES (?, ?, ?, ?)",
            )
            .bind("snapshot-other")
            .bind("folder-other")
            .bind(1_i64)
            .bind("2026-09-02T12:02:00Z")
            .execute(&mut database)
            .await
            .expect("a different folder may publish the same generation");

            let generations = sqlx::query_as::<_, (String, i64)>(
                "SELECT music_folder_id, folder_generation \
                 FROM library_publications \
                 ORDER BY sequence",
            )
            .fetch_all(&mut database)
            .await
            .expect("successful folder generations must be readable");
            assert_eq!(
                generations,
                vec![
                    ("folder-same".to_owned(), 1),
                    ("folder-other".to_owned(), 1)
                ]
            );

            let zero_generation = sqlx::query(
                "INSERT INTO library_publications (\
                     library_snapshot_id, music_folder_id, folder_generation, selected_at\
                 ) VALUES (?, ?, ?, ?)",
            )
            .bind("snapshot-stale")
            .bind("folder-same")
            .bind(0_i64)
            .bind("2026-09-02T12:03:00Z")
            .execute(&mut database)
            .await
            .expect_err("folder generation zero must be rejected");
            assert_eq!(
                zero_generation
                    .as_database_error()
                    .map(sqlx::error::DatabaseError::kind),
                Some(sqlx::error::ErrorKind::CheckViolation)
            );

            let mismatched_folder = sqlx::query(
                "INSERT INTO library_publications (\
                     library_snapshot_id, music_folder_id, folder_generation, selected_at\
                 ) VALUES (?, ?, ?, ?)",
            )
            .bind("snapshot-stale")
            .bind("folder-other")
            .bind(2_i64)
            .bind("2026-09-02T12:04:00Z")
            .execute(&mut database)
            .await
            .expect_err("a publication must use its snapshot's folder identity");
            assert_eq!(
                mismatched_folder
                    .as_database_error()
                    .map(sqlx::error::DatabaseError::kind),
                Some(sqlx::error::ErrorKind::ForeignKeyViolation)
            );

            let violations = sqlx::query("PRAGMA foreign_key_check")
                .fetch_all(&mut database)
                .await
                .expect("the database must support a foreign-key check");
            assert!(violations.is_empty());
        });
    }

    #[test]
    fn library_migration_v2_enforces_stable_identity_in_real_sqlite() {
        tauri::async_runtime::block_on(async {
            use sqlx::{Connection, SqliteConnection};

            let mut database = SqliteConnection::connect("sqlite::memory:")
                .await
                .expect("an in-memory SQLite database must open");
            sqlx::query("PRAGMA foreign_keys = ON")
                .execute(&mut database)
                .await
                .expect("foreign-key enforcement must be enabled");
            sqlx::query(library_migration().sql)
                .execute(&mut database)
                .await
                .expect("migration v2 must be executable SQLite DDL");

            sqlx::query("INSERT INTO music_folders (id, root_path, display_name) VALUES (?, ?, ?)")
                .bind("folder-1")
                .bind("/music")
                .bind("Music")
                .execute(&mut database)
                .await
                .expect("a valid folder must be stored");
            for snapshot_id in ["snapshot-1", "snapshot-2"] {
                sqlx::query("INSERT INTO library_snapshots (id, music_folder_id) VALUES (?, ?)")
                    .bind(snapshot_id)
                    .bind("folder-1")
                    .execute(&mut database)
                    .await
                    .expect("two observations may belong to separate snapshots");
            }

            let missing_identity = sqlx::query(
                "INSERT INTO tracks (\
                     library_snapshot_id, id, music_folder_id, source, source_identifier, \
                     path, relative_path, file_name, format, title, metadata_status, updated_at\
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .bind("snapshot-1")
            .bind("missing-track")
            .bind("folder-1")
            .bind("local")
            .bind("missing.wav")
            .bind("/music/missing.wav")
            .bind("missing.wav")
            .bind("missing.wav")
            .bind("wav")
            .bind("Missing")
            .bind("fallback")
            .bind("2026-09-02T12:00:00Z")
            .execute(&mut database)
            .await
            .expect_err("an observation without an identity must be rejected");
            assert_eq!(
                missing_identity
                    .as_database_error()
                    .map(sqlx::error::DatabaseError::kind),
                Some(sqlx::error::ErrorKind::ForeignKeyViolation)
            );

            sqlx::query(
                "INSERT INTO track_identities (id, music_folder_id, source, source_identifier) \
                 VALUES (?, ?, ?, ?)",
            )
            .bind("track-1")
            .bind("folder-1")
            .bind("local")
            .bind("song.wav")
            .execute(&mut database)
            .await
            .expect("the canonical Track identity must be stored");

            let duplicate_id = sqlx::query(
                "INSERT INTO track_identities (id, music_folder_id, source, source_identifier) \
                 VALUES (?, ?, ?, ?)",
            )
            .bind("track-1")
            .bind("folder-1")
            .bind("local")
            .bind("other.wav")
            .execute(&mut database)
            .await
            .expect_err("Track identity ids must be globally unique");
            assert_eq!(
                duplicate_id
                    .as_database_error()
                    .map(sqlx::error::DatabaseError::kind),
                Some(sqlx::error::ErrorKind::UniqueViolation)
            );

            let duplicate_natural_identity = sqlx::query(
                "INSERT INTO track_identities (id, music_folder_id, source, source_identifier) \
                 VALUES (?, ?, ?, ?)",
            )
            .bind("track-2")
            .bind("folder-1")
            .bind("local")
            .bind("song.wav")
            .execute(&mut database)
            .await
            .expect_err("one natural identity must not acquire a second UUID");
            assert_eq!(
                duplicate_natural_identity
                    .as_database_error()
                    .map(sqlx::error::DatabaseError::kind),
                Some(sqlx::error::ErrorKind::UniqueViolation)
            );

            for (snapshot_id, path) in [
                ("snapshot-1", "/music/song.wav"),
                ("snapshot-2", "/music/song.wav"),
            ] {
                sqlx::query(
                    "INSERT INTO tracks (\
                         library_snapshot_id, id, music_folder_id, source, source_identifier, \
                         path, relative_path, file_name, format, title, metadata_status, updated_at\
                     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                )
                .bind(snapshot_id)
                .bind("track-1")
                .bind("folder-1")
                .bind("local")
                .bind("song.wav")
                .bind(path)
                .bind("song.wav")
                .bind("song.wav")
                .bind("wav")
                .bind("Song")
                .bind("fallback")
                .bind("2026-09-02T12:00:00Z")
                .execute(&mut database)
                .await
                .expect("one identity must support observations in multiple snapshots");
            }

            sqlx::query(
                "CREATE TABLE future_markers (\
                     id TEXT PRIMARY KEY NOT NULL, \
                     track_id TEXT NOT NULL, \
                     FOREIGN KEY (track_id) REFERENCES track_identities(id) ON DELETE RESTRICT\
                 )",
            )
            .execute(&mut database)
            .await
            .expect("a future child table must be able to reference identity id alone");
            sqlx::query("INSERT INTO future_markers (id, track_id) VALUES (?, ?)")
                .bind("marker-1")
                .bind("track-1")
                .execute(&mut database)
                .await
                .expect("a future child may reference the canonical identity");
            let missing_child_identity =
                sqlx::query("INSERT INTO future_markers (id, track_id) VALUES (?, ?)")
                    .bind("marker-2")
                    .bind("missing-track")
                    .execute(&mut database)
                    .await
                    .expect_err("a future child must reject an unknown identity");
            assert_eq!(
                missing_child_identity
                    .as_database_error()
                    .map(sqlx::error::DatabaseError::kind),
                Some(sqlx::error::ErrorKind::ForeignKeyViolation)
            );

            let observation_count =
                sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM tracks WHERE id = ?")
                    .bind("track-1")
                    .fetch_one(&mut database)
                    .await
                    .expect("Track observations must be countable");
            assert_eq!(observation_count, 2);

            let violations = sqlx::query("PRAGMA foreign_key_check")
                .fetch_all(&mut database)
                .await
                .expect("the migrated database must support a foreign-key check");
            assert!(violations.is_empty());
        });
    }

    #[test]
    fn library_migration_v2_never_stores_audio_binary_columns() {
        let sql = normalized_sql(library_migration().sql).to_ascii_uppercase();

        assert!(
            !sql.contains("BLOB"),
            "library tables must store locators and metadata, never audio bytes"
        );
    }

    #[test]
    fn desktop_capability_adds_only_fixed_database_execute_permission() {
        let capability: serde_json::Value =
            serde_json::from_str(include_str!("../capabilities/default.json"))
                .expect("desktop capability must be valid JSON");
        let actual = capability["permissions"]
            .as_array()
            .expect("desktop capability must list permissions")
            .iter()
            .map(|permission| {
                permission
                    .as_str()
                    .expect("permission entries must be strings")
            })
            .collect::<BTreeSet<_>>();
        let expected = BTreeSet::from([
            "core:path:allow-join",
            "dialog:allow-open",
            "fs:allow-read-dir",
            "sql:allow-execute",
            "sql:allow-select",
        ]);

        assert_eq!(actual, expected);
    }
}
