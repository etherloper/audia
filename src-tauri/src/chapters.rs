//! Reading chapter markers embedded in single-file audiobooks.
//!
//! Supported formats:
//! - MP4/M4B/M4A QuickTime chapter track (iTunes, Apple Books, most Audible
//!   conversions): a text track referenced from the audio track's `tref/chap`.
//! - MP4 Nero chapter list (`moov/udta/chpl`).
//! - MP3 ID3v2 `CHAP` frames.

use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{BufReader, Read, Seek, SeekFrom};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EmbeddedChapter {
    pub title: String,
    pub start_secs: f64,
    pub duration_secs: f64,
}

/// Read embedded chapters, if the file has more than one.
pub fn read_chapters(path: &Path, total_duration_secs: f64) -> Option<Vec<EmbeddedChapter>> {
    let ext = path.extension()?.to_str()?.to_lowercase();
    let starts = match ext.as_str() {
        "m4b" | "m4a" | "mp4" => {
            let file = File::open(path).ok()?;
            let size = file.metadata().ok()?.len();
            let mut reader = BufReader::new(file);
            mp4_chapter_track(&mut reader, size).or_else(|| mp4_nero_chapters(&mut reader, size))?
        }
        "mp3" => id3_chapters(path)?,
        _ => return None,
    };
    to_chapters(starts, total_duration_secs)
}

/// Turn (start, title) pairs into chapters with durations. Needs at least two.
fn to_chapters(mut starts: Vec<(f64, String)>, total: f64) -> Option<Vec<EmbeddedChapter>> {
    starts.retain(|(s, _)| s.is_finite() && *s >= 0.0);
    starts.sort_by(|a, b| a.0.total_cmp(&b.0));
    starts.dedup_by(|b, a| (a.0 - b.0).abs() < 0.001);
    if starts.len() < 2 {
        return None;
    }
    let chapters = starts
        .iter()
        .enumerate()
        .map(|(i, (start, title))| {
            let end = starts.get(i + 1).map(|n| n.0).unwrap_or(total.max(*start));
            let title = title.trim();
            EmbeddedChapter {
                title: if title.is_empty() {
                    format!("Chapter {}", i + 1)
                } else {
                    title.to_string()
                },
                start_secs: *start,
                duration_secs: (end - start).max(0.0),
            }
        })
        .collect();
    Some(chapters)
}

// ---------------------------------------------------------------------------
// MP4 atoms

/// (name, content_start, content_end) for each direct child atom in a range.
fn child_atoms<R: Read + Seek>(reader: &mut R, start: u64, end: u64) -> Vec<([u8; 4], u64, u64)> {
    let mut atoms = Vec::new();
    let mut pos = start;
    let mut header = [0u8; 8];
    while pos + 8 <= end {
        if reader.seek(SeekFrom::Start(pos)).is_err() || reader.read_exact(&mut header).is_err() {
            break;
        }
        let name = [header[4], header[5], header[6], header[7]];
        let raw = u32::from_be_bytes([header[0], header[1], header[2], header[3]]) as u64;
        let (content_start, size) = match raw {
            0 => (pos + 8, end - pos),
            1 => {
                let mut ext = [0u8; 8];
                if reader.read_exact(&mut ext).is_err() {
                    break;
                }
                (pos + 16, u64::from_be_bytes(ext))
            }
            n => (pos + 8, n),
        };
        if size < content_start - pos || pos + size > end {
            break;
        }
        atoms.push((name, content_start, pos + size));
        pos += size;
    }
    atoms
}

fn find_child<R: Read + Seek>(
    reader: &mut R,
    range: (u64, u64),
    name: &[u8; 4],
) -> Option<(u64, u64)> {
    child_atoms(reader, range.0, range.1)
        .into_iter()
        .find(|(n, _, _)| n == name)
        .map(|(_, s, e)| (s, e))
}

fn find_path<R: Read + Seek>(
    reader: &mut R,
    mut range: (u64, u64),
    path: &[&[u8; 4]],
) -> Option<(u64, u64)> {
    for name in path {
        range = find_child(reader, range, name)?;
    }
    Some(range)
}

fn read_range<R: Read + Seek>(reader: &mut R, range: (u64, u64), max: u64) -> Option<Vec<u8>> {
    let len = range.1.checked_sub(range.0)?;
    if len > max {
        return None;
    }
    reader.seek(SeekFrom::Start(range.0)).ok()?;
    let mut buf = vec![0u8; len as usize];
    reader.read_exact(&mut buf).ok()?;
    Some(buf)
}

fn read_child<R: Read + Seek>(
    reader: &mut R,
    range: (u64, u64),
    name: &[u8; 4],
    max: u64,
) -> Option<Vec<u8>> {
    let child = find_child(reader, range, name)?;
    read_range(reader, child, max)
}

fn be_u32(data: &[u8], at: usize) -> Option<u32> {
    Some(u32::from_be_bytes(data.get(at..at + 4)?.try_into().ok()?))
}

fn be_u64(data: &[u8], at: usize) -> Option<u64> {
    Some(u64::from_be_bytes(data.get(at..at + 8)?.try_into().ok()?))
}

/// Track ID from a `tkhd` atom.
fn track_id(tkhd: &[u8]) -> Option<u32> {
    // version(1) flags(3), then created/modified (4 bytes each in v0, 8 in v1)
    be_u32(tkhd, if tkhd.first()? == &1 { 20 } else { 12 })
}

/// QuickTime chapter track: find the track referenced by any `tref/chap`, then
/// read its text samples and their timestamps.
fn mp4_chapter_track<R: Read + Seek>(reader: &mut R, file_size: u64) -> Option<Vec<(f64, String)>> {
    const MAX_TABLE: u64 = 16 << 20;
    let moov = find_child(reader, (0, file_size), b"moov")?;
    let traks: Vec<(u64, u64)> = child_atoms(reader, moov.0, moov.1)
        .into_iter()
        .filter(|(n, _, _)| n == b"trak")
        .map(|(_, s, e)| (s, e))
        .collect();

    // Which track IDs are chapter tracks?
    let mut chapter_ids = Vec::new();
    for trak in &traks {
        if let Some(chap) = find_path(reader, *trak, &[b"tref", b"chap"]) {
            let data = read_range(reader, chap, 4096)?;
            chapter_ids.extend(
                data.as_chunks::<4>()
                    .0
                    .iter()
                    .map(|c| u32::from_be_bytes(*c)),
            );
        }
    }
    if chapter_ids.is_empty() {
        return None;
    }

    let trak = traks.iter().copied().find(|trak| {
        find_child(reader, *trak, b"tkhd")
            .and_then(|r| read_range(reader, r, 256))
            .and_then(|d| track_id(&d))
            .is_some_and(|id| chapter_ids.contains(&id))
    })?;

    let mdia = find_child(reader, trak, b"mdia")?;
    let mdhd = read_child(reader, mdia, b"mdhd", 256)?;
    let timescale = be_u32(&mdhd, if mdhd.first()? == &1 { 20 } else { 12 })? as f64;
    if timescale <= 0.0 {
        return None;
    }
    let stbl = find_path(reader, mdia, &[b"minf", b"stbl"])?;

    // Sample start times (stts: runs of (count, delta))
    let stts = read_child(reader, stbl, b"stts", MAX_TABLE)?;
    let mut starts = Vec::new();
    let mut t: u64 = 0;
    for i in 0..be_u32(&stts, 4)? as usize {
        let count = be_u32(&stts, 8 + i * 8)?;
        let delta = be_u32(&stts, 12 + i * 8)? as u64;
        for _ in 0..count {
            starts.push(t);
            t += delta;
            if starts.len() > 10_000 {
                return None;
            }
        }
    }

    // Sample sizes
    let stsz = read_child(reader, stbl, b"stsz", MAX_TABLE)?;
    let uniform = be_u32(&stsz, 4)?;
    let sample_count = be_u32(&stsz, 8)? as usize;
    let sizes: Vec<u64> = (0..sample_count)
        .map(|i| {
            if uniform != 0 {
                Some(uniform as u64)
            } else {
                be_u32(&stsz, 12 + i * 4).map(u64::from)
            }
        })
        .collect::<Option<_>>()?;

    // Chunk offsets (32- or 64-bit)
    let chunk_offsets: Vec<u64> = if let Some(r) = find_child(reader, stbl, b"stco") {
        let d = read_range(reader, r, MAX_TABLE)?;
        (0..be_u32(&d, 4)? as usize)
            .map(|i| be_u32(&d, 8 + i * 4).map(u64::from))
            .collect::<Option<_>>()?
    } else {
        let d = read_child(reader, stbl, b"co64", MAX_TABLE)?;
        (0..be_u32(&d, 4)? as usize)
            .map(|i| be_u64(&d, 8 + i * 8))
            .collect::<Option<_>>()?
    };

    // Samples per chunk (stsc: runs of (first_chunk, samples_per_chunk, desc))
    let stsc = read_child(reader, stbl, b"stsc", MAX_TABLE)?;
    let runs: Vec<(usize, usize)> = (0..be_u32(&stsc, 4)? as usize)
        .map(|i| {
            Some((
                be_u32(&stsc, 8 + i * 12)? as usize,
                be_u32(&stsc, 12 + i * 12)? as usize,
            ))
        })
        .collect::<Option<_>>()?;

    // Walk chunks to find each sample's file offset
    let mut offsets = Vec::with_capacity(sample_count);
    for (chunk_idx, chunk_offset) in chunk_offsets.iter().enumerate() {
        let chunk_no = chunk_idx + 1;
        let per_chunk = runs
            .iter()
            .rev()
            .find(|(first, _)| *first <= chunk_no)
            .map(|r| r.1)?;
        let mut off = *chunk_offset;
        for _ in 0..per_chunk {
            let i = offsets.len();
            if i >= sample_count {
                break;
            }
            offsets.push(off);
            off += sizes[i];
        }
    }

    let mut chapters = Vec::new();
    for (i, offset) in offsets.iter().enumerate() {
        let size = sizes[i];
        let title = if size >= 2 {
            read_range(reader, (*offset, offset + size), 64 * 1024)
                .map(|d| {
                    let len = (u16::from_be_bytes([d[0], d[1]]) as usize).min(d.len() - 2);
                    decode_text_sample(&d[2..2 + len])
                })
                .unwrap_or_default()
        } else {
            String::new()
        };
        let start = starts.get(i).copied().unwrap_or(0) as f64 / timescale;
        chapters.push((start, title));
    }
    Some(chapters)
}

fn decode_text_sample(bytes: &[u8]) -> String {
    if bytes.starts_with(&[0xFE, 0xFF]) {
        let units: Vec<u16> = bytes[2..]
            .as_chunks::<2>()
            .0
            .iter()
            .map(|c| u16::from_be_bytes(*c))
            .collect();
        String::from_utf16_lossy(&units)
    } else if bytes.starts_with(&[0xFF, 0xFE]) {
        let units: Vec<u16> = bytes[2..]
            .as_chunks::<2>()
            .0
            .iter()
            .map(|c| u16::from_le_bytes(*c))
            .collect();
        String::from_utf16_lossy(&units)
    } else {
        String::from_utf8_lossy(bytes).to_string()
    }
}

/// Nero chapter list: `moov/udta/chpl`.
fn mp4_nero_chapters<R: Read + Seek>(reader: &mut R, file_size: u64) -> Option<Vec<(f64, String)>> {
    let chpl = find_path(reader, (0, file_size), &[b"moov", b"udta", b"chpl"])?;
    let data = read_range(reader, chpl, 1 << 20)?;
    // version(1) flags(3) [reserved(4) in v1] count(1)
    let mut pos = if *data.first()? != 0 { 8 } else { 4 };
    let count = *data.get(pos)? as usize;
    pos += 1;
    let mut chapters = Vec::with_capacity(count);
    for _ in 0..count {
        let start_100ns = be_u64(&data, pos)?;
        let len = *data.get(pos + 8)? as usize;
        let title = String::from_utf8_lossy(data.get(pos + 9..pos + 9 + len)?).to_string();
        pos += 9 + len;
        chapters.push((start_100ns as f64 / 10_000_000.0, title));
    }
    Some(chapters)
}

// ---------------------------------------------------------------------------
// ID3v2 CHAP frames (MP3)

fn syncsafe(b: &[u8]) -> u32 {
    b.iter().fold(0, |acc, &x| (acc << 7) | (x as u32 & 0x7F))
}

fn id3_chapters(path: &Path) -> Option<Vec<(f64, String)>> {
    let mut file = File::open(path).ok()?;
    let mut header = [0u8; 10];
    file.read_exact(&mut header).ok()?;
    if &header[0..3] != b"ID3" {
        return None;
    }
    let version = header[3];
    let flags = header[5];
    if !(3..=4).contains(&version) || flags & 0x80 != 0 {
        return None; // v2.2, or unsynchronised tags (rare) — not supported
    }
    let tag_size = syncsafe(&header[6..10]) as usize;
    if tag_size > 64 << 20 {
        return None;
    }
    let mut tag = vec![0u8; tag_size];
    file.read_exact(&mut tag).ok()?;

    let mut pos = 0;
    if flags & 0x40 != 0 {
        // Extended header
        let size = if version == 4 {
            syncsafe(tag.get(0..4)?) as usize
        } else {
            be_u32(&tag, 0)? as usize + 4
        };
        pos = size;
    }
    parse_id3_frames(&tag[pos.min(tag.len())..], version)
}

/// Read a sequence of ID3v2 frames, collecting CHAP entries.
fn parse_id3_frames(data: &[u8], version: u8) -> Option<Vec<(f64, String)>> {
    let mut chapters = Vec::new();
    let mut pos = 0;
    while pos + 10 <= data.len() {
        let id = &data[pos..pos + 4];
        if id[0] == 0 {
            break; // padding
        }
        let size = if version == 4 {
            syncsafe(&data[pos + 4..pos + 8])
        } else {
            be_u32(data, pos + 4)?
        } as usize;
        let body = data.get(pos + 10..pos + 10 + size)?;
        if id == b"CHAP"
            && let Some(ch) = parse_chap(body, version)
        {
            chapters.push(ch);
        }
        pos += 10 + size;
    }
    if chapters.is_empty() {
        None
    } else {
        Some(chapters)
    }
}

fn parse_chap(body: &[u8], version: u8) -> Option<(f64, String)> {
    let id_end = body.iter().position(|&b| b == 0)?;
    let times = id_end + 1;
    let start_ms = be_u32(body, times)?;
    // end ms, start offset, end offset follow; sub-frames start after them
    let sub = body.get(times + 16..)?;
    let mut title = String::new();
    let mut pos = 0;
    while pos + 10 <= sub.len() {
        let size = if version == 4 {
            syncsafe(&sub[pos + 4..pos + 8])
        } else {
            be_u32(sub, pos + 4)?
        } as usize;
        let frame = sub.get(pos + 10..pos + 10 + size)?;
        if &sub[pos..pos + 4] == b"TIT2" {
            title = decode_id3_text(frame);
            break;
        }
        pos += 10 + size;
    }
    Some((start_ms as f64 / 1000.0, title))
}

fn decode_id3_text(frame: &[u8]) -> String {
    let Some((&encoding, text)) = frame.split_first() else {
        return String::new();
    };
    let s = match encoding {
        1 | 2 => {
            let (big_endian, body) = match text {
                [0xFF, 0xFE, rest @ ..] => (false, rest),
                [0xFE, 0xFF, rest @ ..] => (true, rest),
                _ => (encoding == 2, text),
            };
            let units: Vec<u16> = body
                .as_chunks::<2>()
                .0
                .iter()
                .map(|c| {
                    if big_endian {
                        u16::from_be_bytes([c[0], c[1]])
                    } else {
                        u16::from_le_bytes([c[0], c[1]])
                    }
                })
                .collect();
            String::from_utf16_lossy(&units)
        }
        3 => String::from_utf8_lossy(text).to_string(),
        _ => text.iter().map(|&b| b as char).collect(), // ISO-8859-1
    };
    s.trim_end_matches('\0').to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn atom(name: &[u8; 4], content: &[u8]) -> Vec<u8> {
        let mut v = ((content.len() + 8) as u32).to_be_bytes().to_vec();
        v.extend_from_slice(name);
        v.extend_from_slice(content);
        v
    }

    fn full(version_flags: u32, rest: &[u8]) -> Vec<u8> {
        let mut v = version_flags.to_be_bytes().to_vec();
        v.extend_from_slice(rest);
        v
    }

    fn u32s(vals: &[u32]) -> Vec<u8> {
        vals.iter().flat_map(|v| v.to_be_bytes()).collect()
    }

    /// Build a minimal MP4 with an audio track (id 1) pointing at a text chapter track (id 2).
    fn mp4_with_chapter_track(titles: &[&str], deltas: &[u32], timescale: u32) -> Vec<u8> {
        // Text samples live in an mdat at the start of the file
        let mut samples = Vec::new();
        let mut sizes = Vec::new();
        for t in titles {
            let mut s = (t.len() as u16).to_be_bytes().to_vec();
            s.extend_from_slice(t.as_bytes());
            sizes.push(s.len() as u32);
            samples.extend(s);
        }
        let mdat = atom(b"mdat", &samples);
        let first_sample_offset = 8u32; // right after the mdat header

        let tkhd = |id: u32| atom(b"tkhd", &full(0, &u32s(&[0, 0, id, 0, 0])));
        let audio_trak = atom(
            b"trak",
            &[tkhd(1), atom(b"tref", &atom(b"chap", &u32s(&[2])))].concat(),
        );

        let n = titles.len() as u32;
        let stts_entries: Vec<u32> = deltas.iter().flat_map(|d| [1, *d]).collect();
        let stbl = atom(
            b"stbl",
            &[
                atom(
                    b"stts",
                    &full(
                        0,
                        &[u32s(&[deltas.len() as u32]), u32s(&stts_entries)].concat(),
                    ),
                ),
                atom(b"stsz", &full(0, &[u32s(&[0, n]), u32s(&sizes)].concat())),
                atom(b"stsc", &full(0, &u32s(&[1, 1, n, 1]))),
                atom(b"stco", &full(0, &u32s(&[1, first_sample_offset]))),
            ]
            .concat(),
        );
        let mdia = atom(
            b"mdia",
            &[
                atom(b"mdhd", &full(0, &u32s(&[0, 0, timescale, 0, 0]))),
                atom(b"minf", &stbl),
            ]
            .concat(),
        );
        let text_trak = atom(b"trak", &[tkhd(2), mdia].concat());
        let moov = atom(b"moov", &[audio_trak, text_trak].concat());
        [mdat, moov].concat()
    }

    #[test]
    fn reads_quicktime_chapter_track() {
        let data =
            mp4_with_chapter_track(&["Opening", "The Middle", "End"], &[1000, 2500, 500], 1000);
        let len = data.len() as u64;
        let starts = mp4_chapter_track(&mut Cursor::new(data), len).unwrap();
        assert_eq!(
            starts,
            vec![
                (0.0, "Opening".to_string()),
                (1.0, "The Middle".to_string()),
                (3.5, "End".to_string())
            ]
        );
        let chapters = to_chapters(starts, 4.0).unwrap();
        assert_eq!(chapters[1].duration_secs, 2.5);
        assert_eq!(chapters[2].duration_secs, 0.5);
    }

    #[test]
    fn reads_nero_chapters() {
        let mut chpl = full(0, &[]);
        chpl.push(2);
        for (start, title) in [(0u64, "One"), (30_000_000u64, "Two")] {
            chpl.extend(start.to_be_bytes());
            chpl.push(title.len() as u8);
            chpl.extend(title.as_bytes());
        }
        let data = atom(b"moov", &atom(b"udta", &atom(b"chpl", &chpl)));
        let len = data.len() as u64;
        let starts = mp4_nero_chapters(&mut Cursor::new(data), len).unwrap();
        assert_eq!(
            starts,
            vec![(0.0, "One".to_string()), (3.0, "Two".to_string())]
        );
    }

    fn id3_frame(id: &[u8; 4], body: &[u8]) -> Vec<u8> {
        let mut v = id.to_vec();
        v.extend((body.len() as u32).to_be_bytes()); // v2.3 sizes are plain big-endian
        v.extend([0, 0]);
        v.extend_from_slice(body);
        v
    }

    #[test]
    fn reads_id3_chap_frames() {
        let chap = |eid: &str, start: u32, end: u32, title: &str| {
            let mut body = eid.as_bytes().to_vec();
            body.push(0);
            body.extend(u32s(&[start, end, u32::MAX, u32::MAX]));
            let mut text = vec![3u8]; // UTF-8
            text.extend(title.as_bytes());
            body.extend(id3_frame(b"TIT2", &text));
            id3_frame(b"CHAP", &body)
        };
        let frames = [
            id3_frame(b"TIT2", b"\x00Book"),
            chap("ch1", 60_000, 120_000, "Second"),
            chap("ch0", 0, 60_000, "First"),
            vec![0; 16], // padding
        ]
        .concat();
        let mut starts = parse_id3_frames(&frames, 3).unwrap();
        starts.sort_by(|a, b| a.0.total_cmp(&b.0));
        assert_eq!(
            starts,
            vec![(0.0, "First".to_string()), (60.0, "Second".to_string())]
        );
    }

    #[test]
    fn single_marker_is_not_chapters() {
        assert!(to_chapters(vec![(0.0, "Only".into())], 100.0).is_none());
    }

    #[test]
    fn decodes_utf16_titles() {
        assert_eq!(decode_id3_text(&[1, 0xFF, 0xFE, b'H', 0, b'i', 0]), "Hi");
        assert_eq!(decode_text_sample(&[0xFE, 0xFF, 0, b'O', 0, b'k']), "Ok");
    }

    /// Manual check against real files: AUDIA_CHAPTER_FILES="a.m4b;b.mp3" cargo test real_files -- --ignored --nocapture
    #[test]
    #[ignore]
    fn real_files() {
        let files = std::env::var("AUDIA_CHAPTER_FILES").unwrap_or_default();
        for f in files.split(';').filter(|f| !f.is_empty()) {
            let path = Path::new(f);
            if f.ends_with(".m4b") {
                let size = std::fs::metadata(path).unwrap().len();
                let mut r = BufReader::new(File::open(path).unwrap());
                println!(
                    "{f}
  chapter track: {:?}",
                    mp4_chapter_track(&mut r, size)
                );
                println!("  nero chpl:     {:?}", mp4_nero_chapters(&mut r, size));
            }
            println!("  read_chapters: {:#?}", read_chapters(path, 30.0));
        }
    }
}
