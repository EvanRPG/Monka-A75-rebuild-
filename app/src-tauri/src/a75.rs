// SPDX-License-Identifier: GPL-3.0-or-later
//! Monka A75 (device 1549) additions: report rate and host-driven music.
//! Everything here refuses other boards; the evidence is for this one.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use parking_lot::Mutex;
use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::commands::{
    led_wire, light_gap, open_board, with_open, with_writable, write_gap, AppState, SETTING_GAP,
};
use crate::hid::Link;
use crate::music::{self, Analyzer, MusicParams, Ring, BANDS};
use crate::ops;
use crate::protocol::{packet, Checksum, LedParam};
use crate::wire::block_on;

pub const A75_ID: u32 = 1549;
const SET_REPORT: u8 = 0x04;
const GET_REPORT: u8 = 0x84;
/// LEDPARAM mode the vendor app switches to before streaming (captured).
const MODE_MUSIC: u8 = 22;
/// The vendor's other music mode; same frames, its own renderer.
const MODE_MUSIC_3: u8 = 20;

fn require_a75(state: &tauri::State<AppState>, cable: bool) -> Result<(), String> {
    match open_board(state) {
        None => Err("没有连接键盘".into()),
        Some((id, _)) if id != A75_ID => Err("这个功能只支持魔咖 A75".into()),
        Some((_, Link::Receiver)) if cable => Err("这个功能需要插着数据线使用".into()),
        _ => Ok(()),
    }
}

// ---------------------------------------------------------------- report rate

fn rate_of(code: u8) -> Option<u16> {
    match code {
        1 => Some(1000),
        2 => Some(500),
        4 => Some(250),
        8 => Some(125),
        _ => None,
    }
}

fn code_of(rate: u16) -> Option<u8> {
    match rate {
        1000 => Some(1),
        500 => Some(2),
        250 => Some(4),
        125 => Some(8),
        _ => None,
    }
}

/// `GET 0x84 [profile 0]`, Bit7, rate code at reply[2] (vendor class cP).
/// An unsupported opcode replays the previous reply, so the echo of 0x84
/// in reply[0] is required before the byte means anything.
fn read_rate(state: &tauri::State<AppState>) -> Result<Option<u16>, String> {
    let reply = with_open(state, |t, _| t.roundtrip(GET_REPORT, &[0], Checksum::Bit7))?;
    log::info!("GET_REPORT reply {:02X?}", &reply[..8]);
    Ok(if reply[0] == GET_REPORT { rate_of(reply[2]) } else { None })
}

/// Current rate, or null when the keyboard does not answer the read in a
/// way that makes sense. The page offers the setting only on a real answer.
#[tauri::command(async)]
pub fn a75_get_report_rate(state: tauri::State<AppState>) -> Result<Option<u16>, String> {
    require_a75(&state, false)?;
    read_rate(&state)
}

/// Write, then read back. Refused unless the read already works: a write
/// with no working read would be a blind write to an unproven register.
#[tauri::command(async)]
pub fn a75_set_report_rate(state: tauri::State<AppState>, rate: u16) -> Result<Option<u16>, String> {
    require_a75(&state, false)?;
    let code = code_of(rate).ok_or("回报率只能是 125、250、500 或 1000")?;
    if read_rate(&state)?.is_none() {
        return Err("键盘没有正常回应回报率查询，为安全起见不写入".into());
    }
    write_gap(&state, SETTING_GAP);
    with_writable(&state, |t, _| t.send(&packet(SET_REPORT, &[0, code], Checksum::Bit7)))?;
    std::thread::sleep(Duration::from_millis(300));
    read_rate(&state)
}

// ---------------------------------------------------------------------- music

#[derive(Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MusicStatus {
    pub running: bool,
    pub source: Option<String>,
    pub levels: Vec<u8>,
    /// Why the stream stopped on its own, if it did.
    pub error: Option<String>,
}

struct Run {
    stop: Arc<AtomicBool>,
    params: Arc<Mutex<MusicParams>>,
    thread: Option<JoinHandle<()>>,
    /// Lighting before music, restored on stop.
    before: LedParam,
    /// (mode, style) last written, so a change rewrites LEDPARAM once.
    style_sent: (u8, u8),
}

#[derive(Default)]
pub struct MusicState {
    run: Mutex<Option<Run>>,
    status: Arc<Mutex<MusicStatus>>,
}

fn music_led(mode: u8, style: u8, before: &LedParam) -> LedParam {
    // The captured switch: mode 22, flags byte 0 (option 0, no colour
    // flag), wire speed 4 (host 1 on yc500's 5-based scale), brightness kept.
    LedParam {
        mode: if mode == MODE_MUSIC_3 { MODE_MUSIC_3 } else { MODE_MUSIC },
        speed: 1,
        brightness: before.brightness.max(1),
        option: style.min(2),
        dazzle: true,
        r: before.r,
        g: before.g,
        b: before.b,
    }
}

fn send_led(state: &tauri::State<AppState>, p: LedParam) -> Result<(), String> {
    let wire = led_wire(state);
    light_gap(state);
    with_writable(state, |t, _| t.send(&p.to_packet_for(wire)))
}

#[tauri::command(async)]
pub fn a75_music_start(
    app: AppHandle,
    state: tauri::State<AppState>,
    music_state: tauri::State<MusicState>,
    params: MusicParams,
) -> Result<(), String> {
    require_a75(&state, true)?;
    {
        let mut guard = music_state.run.lock();
        let finished = guard.as_ref().is_some_and(|r| r.thread.as_ref().is_none_or(|t| t.is_finished()));
        if finished {
            // The stream ended on its own (unplugged, stalled): clear it so
            // this start is a fresh one.
            *guard = None;
        }
        if let Some(run) = guard.as_ref() {
            *run.params.lock() = params;
            return Ok(());
        }
    }
    let wire = led_wire(&state);
    let before = with_open(&state, |t, _| block_on(ops::read_led_param(t, wire)))?;
    // Already in music mode (an earlier run that never restored)? Fall back
    // to a plain static white so stop leaves the board lit.
    let before = if before.mode == MODE_MUSIC || before.mode == MODE_MUSIC_3 {
        LedParam { mode: 1, speed: 0, brightness: 4, option: 0, dazzle: false, r: 255, g: 255, b: 255 }
    } else {
        before
    };

    // The capture lives on the streaming thread (an audio stream may not
    // move between threads); it reports whether it opened.
    let stop = Arc::new(AtomicBool::new(false));
    let shared = Arc::new(Mutex::new(params));
    // Empty levels hold the thread back until the mode switch has gone out.
    music_state.status.lock().levels.clear();
    let (tx, rx) = std::sync::mpsc::channel::<Result<String, String>>();
    let thread = {
        let stop = stop.clone();
        let shared = shared.clone();
        let status = music_state.status.clone();
        let app = app.clone();
        std::thread::spawn(move || {
            let ring = Ring::default();
            let cap = match music::capture::start(ring.clone()) {
                Ok(c) => c,
                Err(e) => {
                    let _ = tx.send(Err(e));
                    return;
                }
            };
            let _ = tx.send(Ok(cap.source.clone()));
            // Wait for the go-ahead (the mode switch) before the first frame.
            while !stop.load(Ordering::Relaxed) && status.lock().levels.is_empty() {
                std::thread::sleep(Duration::from_millis(10));
            }
            stream(app, cap, ring, shared, stop, status)
        })
    };
    let source = match rx.recv_timeout(Duration::from_secs(5)) {
        Ok(Ok(s)) => s,
        Ok(Err(e)) => return Err(format!("无法采集电脑声音：{e}")),
        Err(_) => {
            stop.store(true, Ordering::Relaxed);
            return Err("打开音频设备超时".into());
        }
    };
    if let Err(e) = send_led(&state, music_led(params.mode, params.style, &before)) {
        stop.store(true, Ordering::Relaxed);
        return Err(e);
    }
    {
        let mut st = music_state.status.lock();
        *st = MusicStatus { running: true, source: Some(source), levels: vec![0; BANDS], error: None };
    }
    *music_state.run.lock() = Some(Run { stop, params: shared, thread: Some(thread), before, style_sent: (params.mode, params.style) });
    Ok(())
}

fn stream(
    app: AppHandle,
    cap: music::capture::Capture,
    ring: Ring,
    params: Arc<Mutex<MusicParams>>,
    stop: Arc<AtomicBool>,
    status: Arc<Mutex<MusicStatus>>,
) {
    let mut analyzer = Analyzer::new(cap.sample_rate);
    let frame = Duration::from_micros(music::FRAME_US);
    let mut next = Instant::now();
    while !stop.load(Ordering::Relaxed) {
        let p = *params.lock();
        let levels = analyzer.levels(&ring.latest(), &p);
        let pkt = music::audio_packet(&levels);
        let state = app.state::<AppState>();
        if let Err(e) = with_open(&state, |t, _| t.send(&pkt)) {
            log::warn!("music stream stopped: {e}");
            let mut st = status.lock();
            st.running = false;
            st.error = Some(e);
            return;
        }
        status.lock().levels = levels.to_vec();
        next += frame;
        let now = Instant::now();
        if next > now {
            std::thread::sleep(next - now);
        } else {
            // Fell behind (a slow write): do not burst to catch up.
            next = now;
        }
    }
    drop(cap);
}

/// Stop the stream and put the lighting back. Also called when the window closes.
pub fn stop_music(app: &AppHandle) -> Result<(), String> {
    let music_state = app.state::<MusicState>();
    let run = music_state.run.lock().take();
    let Some(mut run) = run else { return Ok(()) };
    run.stop.store(true, Ordering::Relaxed);
    if let Some(t) = run.thread.take() {
        let _ = t.join();
    }
    {
        let mut st = music_state.status.lock();
        st.running = false;
        st.levels = vec![0; BANDS];
    }
    let state = app.state::<AppState>();
    send_led(&state, run.before)
}

#[tauri::command(async)]
pub fn a75_music_stop(app: AppHandle) -> Result<(), String> {
    stop_music(&app)
}

/// Knobs apply on the next frame. A new style is a LEDPARAM write (flash),
/// so it goes out under the lighting floor.
#[tauri::command(async)]
pub fn a75_music_params(
    state: tauri::State<AppState>,
    music_state: tauri::State<MusicState>,
    params: MusicParams,
) -> Result<(), String> {
    let restyle = {
        let mut guard = music_state.run.lock();
        let Some(run) = guard.as_mut() else { return Ok(()) };
        *run.params.lock() = params;
        if run.style_sent != (params.mode, params.style) {
            run.style_sent = (params.mode, params.style);
            Some(music_led(params.mode, params.style, &run.before))
        } else {
            None
        }
    };
    match restyle {
        Some(p) => send_led(&state, p),
        None => Ok(()),
    }
}

#[tauri::command(async)]
pub fn a75_music_status(music_state: tauri::State<MusicState>) -> Result<MusicStatus, String> {
    Ok(music_state.status.lock().clone())
}
