WITH current_snapshot AS (
  SELECT publications.library_snapshot_id
  FROM library_publications AS publications
  ORDER BY publications.sequence DESC
  LIMIT 1
),
current_tracks AS (
  SELECT
    tracks.id,
    tracks.title,
    tracks.artist,
    tracks.album,
    tracks.updated_at
  FROM tracks
  INNER JOIN current_snapshot
    ON current_snapshot.library_snapshot_id = tracks.library_snapshot_id
),
matched_results AS (
  SELECT
    current_tracks.id AS id,
    'track' AS kind,
    current_tracks.id AS track_id,
    current_tracks.title,
    current_tracks.artist,
    current_tracks.album,
    substr(current_tracks.title, 1, 160) AS excerpt,
    current_tracks.updated_at AS created_at,
    NULL AS position_ms
  FROM current_tracks
  WHERE current_tracks.title LIKE $1 ESCAPE '!'
    OR COALESCE(current_tracks.artist, '') LIKE $1 ESCAPE '!'
    OR COALESCE(current_tracks.album, '') LIKE $1 ESCAPE '!'

  UNION ALL

  SELECT
    track_notes.id,
    'track-note' AS kind,
    track_notes.track_id,
    current_tracks.title,
    current_tracks.artist,
    current_tracks.album,
    substr(track_notes.body, 1, 160) AS excerpt,
    track_notes.created_at,
    NULL AS position_ms
  FROM track_notes
  INNER JOIN current_tracks ON current_tracks.id = track_notes.track_id
  WHERE track_notes.deleted_at IS NULL
    AND track_notes.body LIKE $1 ESCAPE '!'

  UNION ALL

  SELECT
    listening_notes.id,
    'listening-note' AS kind,
    listening_notes.track_id,
    current_tracks.title,
    current_tracks.artist,
    current_tracks.album,
    substr(listening_notes.body, 1, 160) AS excerpt,
    listening_notes.created_at,
    NULL AS position_ms
  FROM listening_notes
  INNER JOIN current_tracks ON current_tracks.id = listening_notes.track_id
  WHERE listening_notes.deleted_at IS NULL
    AND listening_notes.body LIKE $1 ESCAPE '!'

  UNION ALL

  SELECT
    markers.id,
    'marker' AS kind,
    markers.track_id,
    current_tracks.title,
    current_tracks.artist,
    current_tracks.album,
    substr(COALESCE(NULLIF(markers.label, ''), markers.body, 'Marker'), 1, 160) AS excerpt,
    markers.created_at,
    markers.position_ms
  FROM markers
  INNER JOIN current_tracks ON current_tracks.id = markers.track_id
  WHERE markers.deleted_at IS NULL
    AND (
      COALESCE(markers.label, '') LIKE $1 ESCAPE '!'
      OR COALESCE(markers.body, '') LIKE $1 ESCAPE '!'
    )
)
SELECT
  id,
  kind,
  track_id,
  title,
  artist,
  album,
  excerpt,
  created_at,
  position_ms
FROM matched_results
ORDER BY created_at DESC, kind ASC, id ASC
LIMIT 100
