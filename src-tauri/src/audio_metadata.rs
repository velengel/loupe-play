use std::{
    borrow::Cow,
    fs::File,
    io::BufReader,
    path::{Path, PathBuf},
    time::Duration,
};

use lofty::{
    config::{ParseOptions, ParsingMode},
    file::{AudioFile, FileType, TaggedFile, TaggedFileExt},
    probe::Probe,
    tag::{Accessor, Tag},
};
use serde::Serialize;
use tauri_plugin_fs::FsExt;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ProbedAudioFormat {
    Wav,
    Mpeg,
    Flac,
}

impl ProbedAudioFormat {
    fn from_file_type(file_type: FileType) -> Option<Self> {
        match file_type {
            FileType::Wav => Some(Self::Wav),
            FileType::Mpeg => Some(Self::Mpeg),
            FileType::Flac => Some(Self::Flac),
            _ => None,
        }
    }

    fn from_path(path: &Path) -> Option<Self> {
        let extension = path.extension()?.to_str()?;

        if extension.eq_ignore_ascii_case("wav") {
            Some(Self::Wav)
        } else if extension.eq_ignore_ascii_case("mp3") {
            Some(Self::Mpeg)
        } else if extension.eq_ignore_ascii_case("flac") {
            Some(Self::Flac)
        } else {
            None
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
enum CandidateRejection {
    ScopeDenied,
    OutsideRoot,
    Symlink,
    NotRegularFile,
    UnsupportedFormat,
    Unreadable,
    InvalidTags,
    InvalidMetadata,
    MissingTags,
}

#[derive(Debug)]
struct CandidateBoundary<'a> {
    canonical_root: &'a Path,
    canonical_path: &'a Path,
    root_scope_allowed: bool,
    path_scope_allowed: bool,
    is_regular_file: bool,
    is_symlink: bool,
    probed_format: Option<ProbedAudioFormat>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
enum MetadataStatus {
    Tagged,
    Fallback,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AudioMetadataResult {
    index: usize,
    title: String,
    artist: Option<String>,
    album: Option<String>,
    duration_ms: Option<i64>,
    status: MetadataStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    failure_kind: Option<CandidateRejection>,
}

impl AudioMetadataResult {
    fn fallback(index: usize, path: &Path, failure_kind: CandidateRejection) -> Self {
        Self {
            index,
            title: candidate_display_title(None, candidate_file_name(path)),
            artist: None,
            album: None,
            duration_ms: None,
            status: MetadataStatus::Fallback,
            failure_kind: Some(failure_kind),
        }
    }
}

fn first_non_blank_metadata_value(candidates: &[Option<&str>]) -> Option<String> {
    candidates
        .iter()
        .flatten()
        .map(|value| value.trim())
        .find(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn candidate_display_title(metadata_title: Option<&str>, file_name: &str) -> String {
    if let Some(title) = first_non_blank_metadata_value(&[metadata_title]) {
        return title;
    }

    let stem = Path::new(file_name)
        .file_stem()
        .and_then(|value| value.to_str())
        .and_then(|value| first_non_blank_metadata_value(&[Some(value)]));

    stem.or_else(|| first_non_blank_metadata_value(&[Some(file_name)]))
        .unwrap_or_else(|| "Untitled".to_owned())
}

fn checked_duration_millis(duration: Duration) -> Option<i64> {
    i64::try_from(duration.as_millis()).ok()
}

fn validate_file_boundary(boundary: &CandidateBoundary<'_>) -> Result<(), CandidateRejection> {
    if !boundary.root_scope_allowed || !boundary.path_scope_allowed {
        return Err(CandidateRejection::ScopeDenied);
    }

    if !boundary.canonical_path.starts_with(boundary.canonical_root) {
        return Err(CandidateRejection::OutsideRoot);
    }

    if boundary.is_symlink {
        return Err(CandidateRejection::Symlink);
    }

    if !boundary.is_regular_file {
        return Err(CandidateRejection::NotRegularFile);
    }

    Ok(())
}

fn validate_candidate_boundary(boundary: &CandidateBoundary<'_>) -> Result<(), CandidateRejection> {
    validate_file_boundary(boundary)?;

    let Some(declared_format) = ProbedAudioFormat::from_path(boundary.canonical_path) else {
        return Err(CandidateRejection::UnsupportedFormat);
    };

    if boundary.probed_format != Some(declared_format) {
        return Err(CandidateRejection::UnsupportedFormat);
    }

    Ok(())
}

fn validate_selected_file_boundary(
    boundary: &CandidateBoundary<'_>,
) -> Result<(), CandidateRejection> {
    if !boundary.path_scope_allowed {
        return Err(CandidateRejection::ScopeDenied);
    }

    if boundary.is_symlink {
        return Err(CandidateRejection::Symlink);
    }

    if !boundary.is_regular_file {
        return Err(CandidateRejection::NotRegularFile);
    }

    let Some(declared_format) = ProbedAudioFormat::from_path(boundary.canonical_path) else {
        return Err(CandidateRejection::UnsupportedFormat);
    };

    if boundary.probed_format != Some(declared_format) {
        return Err(CandidateRejection::UnsupportedFormat);
    }

    Ok(())
}

fn candidate_file_name(path: &Path) -> &str {
    path.file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("")
}

#[derive(Clone, Copy)]
enum MetadataField {
    Title,
    Artist,
    Album,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum MetadataReadMode {
    TagsAndProperties,
    PropertiesOnly,
}

fn prioritized_tags(tagged_file: &TaggedFile) -> Vec<&Tag> {
    let primary = tagged_file.primary_tag();
    let mut tags = Vec::with_capacity(tagged_file.tags().len());

    if let Some(primary) = primary {
        tags.push(primary);
    }

    tags.extend(
        tagged_file
            .tags()
            .iter()
            .filter(|tag| primary.is_none_or(|primary| !std::ptr::eq(*tag, primary))),
    );

    tags
}

fn tag_field_value(tagged_file: &TaggedFile, field: MetadataField) -> Option<String> {
    for tag in prioritized_tags(tagged_file) {
        let value: Option<Cow<'_, str>> = match field {
            MetadataField::Title => tag.title(),
            MetadataField::Artist => tag.artist(),
            MetadataField::Album => tag.album(),
        };

        if let Some(value) = value {
            if let Some(value) = first_non_blank_metadata_value(&[Some(value.as_ref())]) {
                return Some(value);
            }
        }
    }

    None
}

fn metadata_parse_options(mode: MetadataReadMode) -> ParseOptions {
    ParseOptions::new()
        .read_tags(matches!(mode, MetadataReadMode::TagsAndProperties))
        .read_properties(true)
        .read_cover_art(false)
        .parsing_mode(ParsingMode::BestAttempt)
}

fn parse_metadata_with_retry<T, E>(
    mut read: impl FnMut(MetadataReadMode) -> Result<T, E>,
) -> Result<(T, Option<CandidateRejection>), CandidateRejection> {
    match read(MetadataReadMode::TagsAndProperties) {
        Ok(metadata) => Ok((metadata, None)),
        Err(_) => read(MetadataReadMode::PropertiesOnly)
            .map(|metadata| (metadata, Some(CandidateRejection::InvalidTags)))
            .map_err(|_| CandidateRejection::InvalidMetadata),
    }
}

fn supported_file_type(path: &Path) -> Result<FileType, CandidateRejection> {
    let declared_format =
        ProbedAudioFormat::from_path(path).ok_or(CandidateRejection::UnsupportedFormat)?;
    let file = File::open(path).map_err(|_| CandidateRejection::Unreadable)?;
    let probe = Probe::new(BufReader::new(file))
        .guess_file_type()
        .map_err(|_| CandidateRejection::Unreadable)?;
    let file_type = probe
        .file_type()
        .ok_or(CandidateRejection::UnsupportedFormat)?;
    let probed_format = ProbedAudioFormat::from_file_type(file_type)
        .ok_or(CandidateRejection::UnsupportedFormat)?;

    if probed_format != declared_format {
        return Err(CandidateRejection::UnsupportedFormat);
    }

    Ok(file_type)
}

fn read_supported_metadata(
    path: &Path,
) -> Result<(TaggedFile, Option<CandidateRejection>), CandidateRejection> {
    let file_type = supported_file_type(path)?;

    parse_metadata_with_retry(|mode| {
        let file = File::open(path).map_err(|_| ())?;

        Probe::new(BufReader::new(file))
            .set_file_type(file_type)
            .options(metadata_parse_options(mode))
            .read()
            .map_err(|_| ())
    })
}

#[cfg(test)]
fn read_supported_tagged_file(path: &Path) -> Result<TaggedFile, CandidateRejection> {
    read_supported_metadata(path).map(|(tagged_file, _)| tagged_file)
}

#[cfg(test)]
fn read_tagged_metadata(
    index: usize,
    path: &Path,
    tagged_file: &TaggedFile,
) -> AudioMetadataResult {
    read_tagged_metadata_with_failure(index, path, tagged_file, None)
}

fn read_tagged_metadata_with_failure(
    index: usize,
    path: &Path,
    tagged_file: &TaggedFile,
    parse_failure: Option<CandidateRejection>,
) -> AudioMetadataResult {
    let tagged_title = tag_field_value(tagged_file, MetadataField::Title);
    let artist = tag_field_value(tagged_file, MetadataField::Artist);
    let album = tag_field_value(tagged_file, MetadataField::Album);
    let has_basic_tag = tagged_title.is_some() || artist.is_some() || album.is_some();

    let failure_kind =
        parse_failure.or_else(|| (!has_basic_tag).then_some(CandidateRejection::MissingTags));

    AudioMetadataResult {
        index,
        title: candidate_display_title(tagged_title.as_deref(), candidate_file_name(path)),
        artist,
        album,
        duration_ms: checked_duration_millis(tagged_file.properties().duration()),
        status: if failure_kind.is_none() {
            MetadataStatus::Tagged
        } else {
            MetadataStatus::Fallback
        },
        failure_kind,
    }
}

fn read_candidate_metadata(
    index: usize,
    canonical_root: &Path,
    root_scope_allowed: bool,
    requested_path: PathBuf,
    scope: &tauri::fs::Scope,
) -> AudioMetadataResult {
    let requested_scope_allowed = scope.is_allowed(&requested_path);
    if !root_scope_allowed || !requested_scope_allowed {
        return AudioMetadataResult::fallback(
            index,
            &requested_path,
            CandidateRejection::ScopeDenied,
        );
    }

    let file_metadata = match std::fs::symlink_metadata(&requested_path) {
        Ok(metadata) => metadata,
        Err(_) => {
            return AudioMetadataResult::fallback(
                index,
                &requested_path,
                CandidateRejection::Unreadable,
            )
        }
    };
    if file_metadata.file_type().is_symlink() {
        return AudioMetadataResult::fallback(index, &requested_path, CandidateRejection::Symlink);
    }
    if !file_metadata.is_file() {
        return AudioMetadataResult::fallback(
            index,
            &requested_path,
            CandidateRejection::NotRegularFile,
        );
    }

    let canonical_path = match std::fs::canonicalize(&requested_path) {
        Ok(path) => path,
        Err(_) => {
            return AudioMetadataResult::fallback(
                index,
                &requested_path,
                CandidateRejection::Unreadable,
            )
        }
    };
    let path_scope_allowed = requested_scope_allowed && scope.is_allowed(&canonical_path);
    let mut boundary = CandidateBoundary {
        canonical_root,
        canonical_path: &canonical_path,
        root_scope_allowed,
        path_scope_allowed,
        is_regular_file: file_metadata.is_file(),
        is_symlink: file_metadata.file_type().is_symlink(),
        probed_format: None,
    };

    if let Err(rejection) = validate_file_boundary(&boundary) {
        return AudioMetadataResult::fallback(index, &requested_path, rejection);
    }

    let (tagged_file, parse_failure) = match read_supported_metadata(&canonical_path) {
        Ok(metadata) => metadata,
        Err(rejection) => return AudioMetadataResult::fallback(index, &requested_path, rejection),
    };
    boundary.probed_format = ProbedAudioFormat::from_file_type(tagged_file.file_type());

    if let Err(rejection) = validate_candidate_boundary(&boundary) {
        return AudioMetadataResult::fallback(index, &requested_path, rejection);
    }

    read_tagged_metadata_with_failure(index, &requested_path, &tagged_file, parse_failure)
}

fn read_selected_candidate_metadata(
    index: usize,
    requested_path: PathBuf,
    scope: &tauri::fs::Scope,
) -> AudioMetadataResult {
    let requested_scope_allowed = scope.is_allowed(&requested_path);
    if !requested_scope_allowed {
        return AudioMetadataResult::fallback(
            index,
            &requested_path,
            CandidateRejection::ScopeDenied,
        );
    }

    let file_metadata = match std::fs::symlink_metadata(&requested_path) {
        Ok(metadata) => metadata,
        Err(_) => {
            return AudioMetadataResult::fallback(
                index,
                &requested_path,
                CandidateRejection::Unreadable,
            )
        }
    };
    if file_metadata.file_type().is_symlink() {
        return AudioMetadataResult::fallback(index, &requested_path, CandidateRejection::Symlink);
    }
    if !file_metadata.is_file() {
        return AudioMetadataResult::fallback(
            index,
            &requested_path,
            CandidateRejection::NotRegularFile,
        );
    }

    let canonical_path = match std::fs::canonicalize(&requested_path) {
        Ok(path) => path,
        Err(_) => {
            return AudioMetadataResult::fallback(
                index,
                &requested_path,
                CandidateRejection::Unreadable,
            )
        }
    };
    let path_scope_allowed = requested_scope_allowed && scope.is_allowed(&canonical_path);
    if !path_scope_allowed {
        return AudioMetadataResult::fallback(
            index,
            &requested_path,
            CandidateRejection::ScopeDenied,
        );
    }
    let (tagged_file, parse_failure) = match read_supported_metadata(&canonical_path) {
        Ok(metadata) => metadata,
        Err(rejection) => return AudioMetadataResult::fallback(index, &requested_path, rejection),
    };
    let boundary = CandidateBoundary {
        canonical_root: &canonical_path,
        canonical_path: &canonical_path,
        root_scope_allowed: false,
        path_scope_allowed,
        is_regular_file: file_metadata.is_file(),
        is_symlink: file_metadata.file_type().is_symlink(),
        probed_format: ProbedAudioFormat::from_file_type(tagged_file.file_type()),
    };

    if let Err(rejection) = validate_selected_file_boundary(&boundary) {
        return AudioMetadataResult::fallback(index, &requested_path, rejection);
    }

    read_tagged_metadata_with_failure(index, &requested_path, &tagged_file, parse_failure)
}

fn read_selected_audio_metadata_blocking(
    paths: Vec<PathBuf>,
    scope: tauri::fs::Scope,
) -> Vec<AudioMetadataResult> {
    paths
        .into_iter()
        .enumerate()
        .map(|(index, path)| read_selected_candidate_metadata(index, path, &scope))
        .collect()
}

fn read_audio_metadata_blocking(
    root: PathBuf,
    paths: Vec<PathBuf>,
    scope: tauri::fs::Scope,
) -> Result<Vec<AudioMetadataResult>, String> {
    let requested_root_allowed = scope.is_allowed(&root);
    if !requested_root_allowed {
        return Err("metadata-root-not-allowed".to_owned());
    }

    let root_metadata = std::fs::metadata(&root).map_err(|_| "metadata-root-unavailable")?;
    if !root_metadata.is_dir() {
        return Err("metadata-root-not-directory".to_owned());
    }

    let canonical_root = std::fs::canonicalize(&root).map_err(|_| "metadata-root-unavailable")?;
    let root_scope_allowed = requested_root_allowed && scope.is_allowed(&canonical_root);
    if !root_scope_allowed {
        return Err("metadata-root-not-allowed".to_owned());
    }

    Ok(paths
        .into_iter()
        .enumerate()
        .map(|(index, path)| {
            read_candidate_metadata(index, &canonical_root, root_scope_allowed, path, &scope)
        })
        .collect())
}

#[tauri::command]
pub(crate) async fn read_audio_metadata(
    app: tauri::AppHandle,
    root: String,
    paths: Vec<String>,
) -> Result<Vec<AudioMetadataResult>, String> {
    let scope = app.fs_scope();
    let root = PathBuf::from(root);
    let paths = paths.into_iter().map(PathBuf::from).collect();

    tauri::async_runtime::spawn_blocking(move || read_audio_metadata_blocking(root, paths, scope))
        .await
        .map_err(|_| "metadata-task-failed".to_owned())?
}

#[tauri::command]
pub(crate) async fn read_selected_audio_metadata(
    app: tauri::AppHandle,
    paths: Vec<String>,
) -> Result<Vec<AudioMetadataResult>, String> {
    let scope = app.fs_scope();
    let paths = paths.into_iter().map(PathBuf::from).collect();

    tauri::async_runtime::spawn_blocking(move || {
        read_selected_audio_metadata_blocking(paths, scope)
    })
    .await
    .map_err(|_| "metadata-task-failed".to_owned())
}

#[cfg(test)]
mod tests {
    use std::{
        path::{Path, PathBuf},
        time::Duration,
    };

    use super::{
        candidate_display_title, checked_duration_millis, first_non_blank_metadata_value,
        parse_metadata_with_retry, read_supported_metadata, read_supported_tagged_file,
        read_tagged_metadata, read_tagged_metadata_with_failure, validate_candidate_boundary,
        validate_selected_file_boundary, CandidateBoundary, CandidateRejection, MetadataReadMode,
        MetadataStatus, ProbedAudioFormat,
    };
    use lofty::{
        file::{FileType, TaggedFile, TaggedFileExt},
        properties::FileProperties,
        tag::{Accessor, Tag, TagType},
    };

    fn valid_mp3_candidate() -> CandidateBoundary<'static> {
        CandidateBoundary {
            canonical_root: Path::new("/library"),
            canonical_path: Path::new("/library/album/track.mp3"),
            root_scope_allowed: true,
            path_scope_allowed: true,
            is_regular_file: true,
            is_symlink: false,
            probed_format: Some(ProbedAudioFormat::Mpeg),
        }
    }

    #[test]
    fn metadata_values_are_trimmed_and_fall_back_per_field() {
        let candidates = [Some(" \n "), None, Some("  Secondary title\t")];

        assert_eq!(
            first_non_blank_metadata_value(&candidates).as_deref(),
            Some("Secondary title")
        );
    }

    #[test]
    fn display_title_uses_trimmed_metadata_before_the_file_name() {
        assert_eq!(
            candidate_display_title(Some("  Tagged title \n"), "recording.take.mp3"),
            "Tagged title"
        );
    }

    #[test]
    fn display_title_falls_back_to_the_file_stem_after_the_last_extension() {
        assert_eq!(
            candidate_display_title(Some(" \t"), "recording.take.mp3"),
            "recording.take"
        );
    }

    #[test]
    fn duration_is_converted_to_checked_whole_milliseconds() {
        let duration = Duration::new(2, 345_999_999);

        assert_eq!(checked_duration_millis(duration), Some(2_345));
        assert_eq!(checked_duration_millis(Duration::MAX), None);
    }

    #[test]
    fn metadata_parse_retries_properties_only_after_tagged_parse_failure() {
        let mut attempts = Vec::new();
        let duration = Duration::from_millis(2_468);

        let parsed = parse_metadata_with_retry(|mode| {
            attempts.push(mode);
            match mode {
                MetadataReadMode::TagsAndProperties => Err("invalid tags"),
                MetadataReadMode::PropertiesOnly => Ok(duration),
            }
        });

        assert_eq!(
            attempts,
            vec![
                MetadataReadMode::TagsAndProperties,
                MetadataReadMode::PropertiesOnly,
            ]
        );
        assert_eq!(
            parsed,
            Ok((duration, Some(CandidateRejection::InvalidTags)))
        );
    }

    #[test]
    fn metadata_parse_stays_invalid_when_properties_only_retry_also_fails() {
        let mut attempts = Vec::new();

        let parsed = parse_metadata_with_retry(|mode| {
            attempts.push(mode);
            Err::<Duration, _>("invalid metadata")
        });

        assert_eq!(
            attempts,
            vec![
                MetadataReadMode::TagsAndProperties,
                MetadataReadMode::PropertiesOnly,
            ]
        );
        assert_eq!(parsed, Err(CandidateRejection::InvalidMetadata));
    }

    #[test]
    fn successful_tagged_parse_does_not_retry_without_tags() {
        let duration = Duration::from_millis(1_234);
        let mut attempts = Vec::new();

        let parsed = parse_metadata_with_retry(|mode| {
            attempts.push(mode);
            match mode {
                MetadataReadMode::TagsAndProperties => Ok::<Duration, &str>(duration),
                MetadataReadMode::PropertiesOnly => panic!("normal metadata must not be retried"),
            }
        });

        assert_eq!(attempts, vec![MetadataReadMode::TagsAndProperties]);
        assert_eq!(parsed, Ok((duration, None)));
    }

    #[test]
    fn successful_tagged_metadata_keeps_tagged_status_and_duration() {
        let duration = Duration::from_millis(3_579);
        let mut tag = Tag::new(TagType::Id3v2);
        tag.set_title("  Tagged title  ".to_owned());
        let tagged_file = TaggedFile::new(
            FileType::Mpeg,
            FileProperties::new(duration, None, None, None, None, None, None),
            vec![tag],
        );

        let result = read_tagged_metadata(0, Path::new("track.mp3"), &tagged_file);

        assert_eq!(result.title, "Tagged title");
        assert_eq!(result.duration_ms, Some(3_579));
        assert_eq!(result.status, MetadataStatus::Tagged);
        assert_eq!(result.failure_kind, None);
    }

    #[test]
    fn successful_parse_without_basic_tags_remains_missing_tags() {
        let duration = Duration::from_millis(4_680);
        let tagged_file = TaggedFile::new(
            FileType::Flac,
            FileProperties::new(duration, None, None, None, None, None, None),
            vec![],
        );

        let result = read_tagged_metadata(0, Path::new("untagged.flac"), &tagged_file);

        assert_eq!(result.title, "untagged");
        assert_eq!(result.duration_ms, Some(4_680));
        assert_eq!(result.status, MetadataStatus::Fallback);
        assert_eq!(result.failure_kind, Some(CandidateRejection::MissingTags));
    }

    #[test]
    fn both_the_root_and_candidate_must_be_in_the_dynamic_scope() {
        let mut denied_root = valid_mp3_candidate();
        denied_root.root_scope_allowed = false;
        assert_eq!(
            validate_candidate_boundary(&denied_root),
            Err(CandidateRejection::ScopeDenied)
        );

        let mut denied_path = valid_mp3_candidate();
        denied_path.path_scope_allowed = false;
        assert_eq!(
            validate_candidate_boundary(&denied_path),
            Err(CandidateRejection::ScopeDenied)
        );
    }

    #[test]
    fn canonical_candidate_must_remain_under_the_canonical_root() {
        let mut outside = valid_mp3_candidate();
        outside.canonical_path = Path::new("/other-library/track.mp3");

        assert_eq!(
            validate_candidate_boundary(&outside),
            Err(CandidateRejection::OutsideRoot)
        );
    }

    #[test]
    fn an_explicitly_selected_file_does_not_require_parent_directory_scope() {
        let mut selected = valid_mp3_candidate();
        selected.canonical_root = Path::new("/parent-that-was-not-selected");
        selected.root_scope_allowed = false;

        assert_eq!(validate_selected_file_boundary(&selected), Ok(()));
    }

    #[test]
    fn an_explicitly_selected_file_still_requires_its_exact_scope() {
        let mut denied = valid_mp3_candidate();
        denied.path_scope_allowed = false;

        assert_eq!(
            validate_selected_file_boundary(&denied),
            Err(CandidateRejection::ScopeDenied)
        );
    }

    #[test]
    fn symlinks_and_non_regular_files_are_rejected_before_metadata_io() {
        let mut symlink = valid_mp3_candidate();
        symlink.is_symlink = true;
        assert_eq!(
            validate_candidate_boundary(&symlink),
            Err(CandidateRejection::Symlink)
        );

        let mut directory = valid_mp3_candidate();
        directory.is_regular_file = false;
        assert_eq!(
            validate_candidate_boundary(&directory),
            Err(CandidateRejection::NotRegularFile)
        );
    }

    #[test]
    fn an_audio_extension_cannot_disguise_unsupported_content() {
        let mut disguised = valid_mp3_candidate();
        disguised.probed_format = None;

        assert_eq!(
            validate_candidate_boundary(&disguised),
            Err(CandidateRejection::UnsupportedFormat)
        );
    }

    #[test]
    fn declared_extension_must_match_the_supported_probed_format() {
        let mut disguised = valid_mp3_candidate();
        disguised.probed_format = Some(ProbedAudioFormat::Flac);

        assert_eq!(
            validate_candidate_boundary(&disguised),
            Err(CandidateRejection::UnsupportedFormat)
        );
    }

    #[test]
    fn content_probe_does_not_expand_the_supported_extension_boundary() {
        let mut wrong_extension = valid_mp3_candidate();
        wrong_extension.canonical_path = Path::new("/library/album/track.bin");

        assert_eq!(
            validate_candidate_boundary(&wrong_extension),
            Err(CandidateRejection::UnsupportedFormat)
        );
    }

    #[test]
    fn wav_mpeg_and_flac_candidates_are_accepted_after_all_boundary_checks() {
        for (path, format) in [
            ("/library/track.wav", ProbedAudioFormat::Wav),
            ("/library/track.mp3", ProbedAudioFormat::Mpeg),
            ("/library/track.flac", ProbedAudioFormat::Flac),
        ] {
            let mut candidate = valid_mp3_candidate();
            candidate.canonical_path = Path::new(path);
            candidate.probed_format = Some(format);

            assert_eq!(validate_candidate_boundary(&candidate), Ok(()));
        }
    }

    #[test]
    fn lofty_reads_a_generated_wav_without_a_committed_binary_fixture() {
        let path = std::env::temp_dir().join(format!(
            "loupe-play-generated-metadata-{}.wav",
            std::process::id()
        ));
        let wav = [
            b'R', b'I', b'F', b'F', 38, 0, 0, 0, b'W', b'A', b'V', b'E', b'f', b'm', b't', b' ',
            16, 0, 0, 0, 1, 0, 1, 0, 0x40, 0x1f, 0, 0, 0x80, 0x3e, 0, 0, 2, 0, 16, 0, b'd', b'a',
            b't', b'a', 2, 0, 0, 0, 0, 0,
        ];
        std::fs::write(&path, wav).expect("generated WAV should be writable");

        let parsed = read_supported_tagged_file(&path);
        let _ = std::fs::remove_file(&path);

        assert_eq!(parsed.map(|file| file.file_type()), Ok(FileType::Wav));
    }

    #[test]
    #[ignore = "requires LOUPE_PLAY_REAL_AUDIO_FIXTURE_DIR with local WAV, MP3, and FLAC files"]
    fn lofty_reads_external_real_codec_fixtures_without_committing_media() {
        let fixture_root = std::env::var_os("LOUPE_PLAY_REAL_AUDIO_FIXTURE_DIR")
            .map(PathBuf::from)
            .expect("LOUPE_PLAY_REAL_AUDIO_FIXTURE_DIR must point to the smoke fixture root");

        for (relative_path, expected_type, expected_title) in [
            ("root-wave.wav", FileType::Wav, "root-wave"),
            ("Session/session-mp3.mp3", FileType::Mpeg, "session-mp3"),
            ("Session/session-flac.flac", FileType::Flac, "session-flac"),
        ] {
            let path = fixture_root.join(relative_path);
            let (tagged_file, parse_failure) = read_supported_metadata(&path)
                .unwrap_or_else(|failure| panic!("{relative_path} must parse: {failure:?}"));
            let result = read_tagged_metadata_with_failure(0, &path, &tagged_file, parse_failure);

            assert_eq!(tagged_file.file_type(), expected_type, "{relative_path}");
            assert_eq!(result.title, expected_title, "{relative_path}");
            assert_eq!(result.status, MetadataStatus::Fallback, "{relative_path}");
            assert_eq!(
                result.failure_kind,
                Some(CandidateRejection::MissingTags),
                "{relative_path}"
            );
            assert!(
                result
                    .duration_ms
                    .is_some_and(|duration| (179_000..=181_000).contains(&duration)),
                "{relative_path} must retain its approximately 180-second duration"
            );
        }
    }
}
