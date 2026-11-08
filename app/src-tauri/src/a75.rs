// SPDX-License-Identifier: GPL-3.0-or-later
//! Monka A75 (device 1549) additions: report rate and host-driven music.
//! Everything here refuses other boards; the evidence is for this one.

use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::commands::{
    led_wire, light_gap, open_board, with_open, with_writable, write_gap, AppState, SETTING_GAP,
};
use crate::hid::Link;
use crate::music::{self, Analyzer, MusicParams, Ring, BANDS};
use crate::win;
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

// ---------------------------------------------------------------- live light
//
// One stream at a time drives the board from the computer: music, a meter
// (CPU, RAM, volume, countdown) or the screen colour. Music and meters are
// SET_AUDIO frames under LEDPARAM 22/20 (captured); the screen is the
// vendor's SET_WINDOS frame, `[0x0E, R, G, B, A]` Bit7, under mode 21.

const SET_WINDOS: u8 = 0x0E;
const MODE_SCREEN: u8 = 21;

#[derive(Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MusicStatus {
    pub running: bool,
    pub source: Option<String>,
    pub levels: Vec<u8>,
    /// Last colour sent by the screen source.
    pub color: Option<[u8; 3]>,
    /// Why the stream stopped on its own, if it did.
    pub error: Option<String>,
}

struct Run {
    stop: Arc<AtomicBool>,
    params: Arc<Mutex<MusicParams>>,
    thread: Option<JoinHandle<()>>,
    /// Lighting before the stream, restored on stop.
    before: LedParam,
    /// LEDPARAM last written for the stream, so a change rewrites it once.
    led_sent: (u8, u8),
}

#[derive(Default)]
pub struct MusicState {
    run: Mutex<Option<Run>>,
    status: Arc<Mutex<MusicStatus>>,
}

/// (mode, option) the board needs for these params.
fn live_mode(p: &MusicParams) -> (u8, u8) {
    match p.source.as_str() {
        "screen" => (MODE_SCREEN, 0),
        "music" => (if p.mode == MODE_MUSIC_3 { MODE_MUSIC_3 } else { MODE_MUSIC }, p.style.min(2)),
        // Meters read as bars only in the upright layout, verified on the board.
        _ => (MODE_MUSIC, 0),
    }
}

fn live_led((mode, option): (u8, u8), before: &LedParam) -> LedParam {
    // Music: the captured switch, mode 22, flags byte 0, wire speed 4 (host 1
    // on yc500's 5-based scale), brightness kept. Screen: flags 0 as well.
    LedParam {
        mode,
        speed: 1,
        brightness: before.brightness.max(1),
        option,
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

pub fn live_running(app: &AppHandle) -> bool {
    app.state::<MusicState>()
        .run
        .lock()
        .as_ref()
        .is_some_and(|r| r.thread.as_ref().is_some_and(|t| !t.is_finished()))
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
            // The stream ended on its own (unplugged, stalled): start fresh.
            *guard = None;
        }
    }
    if music_state.run.lock().is_some() {
        // Already streaming: this is a change of source or settings.
        return a75_music_params(state, music_state, params);
    }
    let wire = led_wire(&state);
    let before = with_open(&state, |t, _| block_on(ops::read_led_param(t, wire)))?;
    // Still in a stream mode (an earlier run that never restored)? Fall back
    // to a plain static white so stop leaves the board lit.
    let before = if matches!(before.mode, MODE_MUSIC | MODE_MUSIC_3 | MODE_SCREEN) {
        LedParam { mode: 1, speed: 0, brightness: 4, option: 0, dazzle: false, r: 255, g: 255, b: 255 }
    } else {
        before
    };

    // The capture lives on the streaming thread (an audio stream may not
    // move between threads); it reports whether it opened.
    let stop = Arc::new(AtomicBool::new(false));
    let shared = Arc::new(Mutex::new(params.clone()));
    let go = Arc::new(AtomicBool::new(false));
    let needs_audio = params.source == "music";
    let (tx, rx) = std::sync::mpsc::channel::<Result<String, String>>();
    let thread = {
        let stop = stop.clone();
        let go = go.clone();
        let shared = shared.clone();
        let status = music_state.status.clone();
        let app = app.clone();
        std::thread::spawn(move || {
            let ring = Ring::default();
            let cap = match music::capture::start(ring.clone()) {
                Ok(c) => {
                    let _ = tx.send(Ok(c.source.clone()));
                    Some(c)
                }
                Err(e) if needs_audio => {
                    let _ = tx.send(Err(e));
                    return;
                }
                Err(_) => {
                    let _ = tx.send(Ok(String::new()));
                    None
                }
            };
            // Wait for the mode switch before the first frame.
            while !stop.load(Ordering::Relaxed) && !go.load(Ordering::Relaxed) {
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
    let mode = live_mode(&params);
    if let Err(e) = send_led(&state, live_led(mode, &before)) {
        stop.store(true, Ordering::Relaxed);
        return Err(e);
    }
    *music_state.status.lock() = MusicStatus {
        running: true,
        source: (!source.is_empty()).then_some(source),
        levels: vec![0; BANDS],
        color: None,
        error: None,
    };
    *music_state.run.lock() = Some(Run { stop, params: shared, thread: Some(thread), before, led_sent: mode });
    go.store(true, Ordering::Relaxed);
    Ok(())
}

struct Meters {
    sys: sysinfo::System,
    cpu: VecDeque<f32>,
    cpu_at: Instant,
    volume: (f32, bool),
    volume_at: Instant,
    volume_changed: Option<Instant>,
    timer: (u32, Instant),
}

impl Meters {
    fn new() -> Self {
        let now = Instant::now();
        Self {
            sys: sysinfo::System::new(),
            cpu: VecDeque::new(),
            cpu_at: now - Duration::from_secs(1),
            volume: win::master_volume().unwrap_or((0.0, false)),
            volume_at: now,
            volume_changed: None,
            timer: (0, now),
        }
    }

    fn poll_volume(&mut self) {
        if self.volume_at.elapsed() < Duration::from_millis(100) {
            return;
        }
        self.volume_at = Instant::now();
        if let Some(v) = win::master_volume() {
            if (v.0 - self.volume.0).abs() > 0.004 || v.1 != self.volume.1 {
                self.volume_changed = Some(Instant::now());
            }
            self.volume = v;
        }
    }

    fn volume_fill(&self) -> [u8; BANDS] {
        if self.volume.1 {
            [0; BANDS]
        } else {
            music::fill_levels(self.volume.0)
        }
    }

    fn levels(&mut self, p: &MusicParams) -> [u8; BANDS] {
        match p.source.as_str() {
            "cpu" => {
                if self.cpu_at.elapsed() >= Duration::from_millis(250) {
                    self.cpu_at = Instant::now();
                    self.sys.refresh_cpu_usage();
                    self.cpu.push_back(self.sys.global_cpu_usage() / 100.0);
                    while self.cpu.len() > BANDS {
                        self.cpu.pop_front();
                    }
                }
                music::graph_levels(&self.cpu)
            }
            "ram" => {
                self.sys.refresh_memory();
                let total = self.sys.total_memory().max(1) as f32;
                music::fill_levels(self.sys.used_memory() as f32 / total)
            }
            "volume" => {
                self.poll_volume();
                self.volume_fill()
            }
            "timer" => {
                if self.timer.0 != p.timer_secs {
                    self.timer = (p.timer_secs, Instant::now());
                }
                let total = p.timer_secs.max(1) as f32;
                let left = 1.0 - self.timer.1.elapsed().as_secs_f32() / total;
                if left > 0.0 {
                    music::fill_levels(left)
                } else if (self.timer.1.elapsed().as_millis() / 500).is_multiple_of(2) {
                    // Time's up: the whole board blinks until stopped.
                    [music::LEVEL_MAX; BANDS]
                } else {
                    [0; BANDS]
                }
            }
            _ => [0; BANDS],
        }
    }
}

fn stream(
    app: AppHandle,
    cap: Option<music::capture::Capture>,
    ring: Ring,
    params: Arc<Mutex<MusicParams>>,
    stop: Arc<AtomicBool>,
    status: Arc<Mutex<MusicStatus>>,
) {
    let mut analyzer = Analyzer::new(cap.as_ref().map_or(48_000, |c| c.sample_rate));
    let mut meters = Meters::new();
    let mut next = Instant::now();
    while !stop.load(Ordering::Relaxed) {
        let p = params.lock().clone();
        let (pkt, levels, color) = if p.source == "screen" {
            let c = win::screen_average().map(|c| music::boost_color(c, p.boost)).unwrap_or([0, 0, 0]);
            (packet(SET_WINDOS, &[c[0], c[1], c[2], 0xFF], Checksum::Bit7), None, Some(c))
        } else {
            let mut lv = if p.source == "music" { analyzer.levels(&ring.latest(), &p) } else { meters.levels(&p) };
            if p.source == "music" && p.volume_overlay {
                meters.poll_volume();
                if meters.volume_changed.is_some_and(|t| t.elapsed() < Duration::from_millis(1500)) {
                    lv = meters.volume_fill();
                }
            }
            (music::audio_packet(&lv), Some(lv), None)
        };
        let state = app.state::<AppState>();
        if let Err(e) = with_open(&state, |t, _| t.send(&pkt)) {
            log::warn!("live stream stopped: {e}");
            let mut st = status.lock();
            st.running = false;
            st.error = Some(e);
            return;
        }
        {
            let mut st = status.lock();
            if let Some(lv) = levels {
                st.levels = lv.to_vec();
            }
            st.color = color;
        }
        // The vendor samples the screen every 40 ms; music goes at 32 fps.
        next += if p.source == "screen" { Duration::from_millis(40) } else { Duration::from_micros(music::FRAME_US) };
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

/// Stop the stream and put the lighting back. Also called on exit.
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
        st.color = None;
    }
    let state = app.state::<AppState>();
    send_led(&state, run.before)
}

#[tauri::command(async)]
pub fn a75_music_stop(app: AppHandle) -> Result<(), String> {
    stop_music(&app)
}

/// Settings apply on the next frame. A new source or style that needs a
/// different LEDPARAM is one write (flash) under the lighting floor.
#[tauri::command(async)]
pub fn a75_music_params(
    state: tauri::State<AppState>,
    music_state: tauri::State<MusicState>,
    params: MusicParams,
) -> Result<(), String> {
    let relight = {
        let mut guard = music_state.run.lock();
        let Some(run) = guard.as_mut() else { return Ok(()) };
        let mode = live_mode(&params);
        *run.params.lock() = params;
        if run.led_sent != mode {
            run.led_sent = mode;
            Some(live_led(mode, &run.before))
        } else {
            None
        }
    };
    match relight {
        Some(p) => send_led(&state, p),
        None => Ok(()),
    }
}

#[tauri::command(async)]
pub fn a75_music_status(music_state: tauri::State<MusicState>) -> Result<MusicStatus, String> {
    Ok(music_state.status.lock().clone())
}

// ---------------------------------------------------------------- preferences

/// One per-program lighting rule.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppRule {
    /// Program file name, e.g. "valorant.exe". Compared case-insensitively.
    pub exe: String,
    pub led: LedParam,
    /// Lock the Windows key while this program is in front.
    #[serde(default)]
    pub win_lock: bool,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Prefs {
    pub rules_enabled: bool,
    pub rules: Vec<AppRule>,
    pub stats_enabled: bool,
    /// Notify below this battery percent over 2.4G; 0 turns it off.
    pub battery_alert: u8,
    /// Closing the window keeps the app in the tray.
    pub close_to_tray: bool,
}

impl Default for Prefs {
    fn default() -> Self {
        Self { rules_enabled: false, rules: vec![], stats_enabled: false, battery_alert: 20, close_to_tray: true }
    }
}

#[derive(Default)]
pub struct Extras {
    prefs: Mutex<Prefs>,
    recent: Mutex<VecDeque<String>>,
    hook: Mutex<Option<win::HookHandle>>,
}

fn config_file(app: &AppHandle, name: &str) -> Option<PathBuf> {
    let dir = app.path().app_config_dir().ok()?;
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir.join(name))
}

pub fn prefs(app: &AppHandle) -> Prefs {
    app.state::<Extras>().prefs.lock().clone()
}

/// Read the saved preferences and statistics, and start what they ask for.
pub fn load(app: &AppHandle) {
    if let Some(p) = config_file(app, "a75-prefs.json")
        .and_then(|f| std::fs::read_to_string(f).ok())
        .and_then(|s| serde_json::from_str::<Prefs>(&s).ok())
    {
        *app.state::<Extras>().prefs.lock() = p;
    }
    stats_load(app);
    apply_stats_enabled(app);
    start_rules_watcher(app.clone());
    start_stats_saver(app.clone());
}

#[tauri::command(async)]
pub fn a75_prefs_get(app: AppHandle) -> Prefs {
    prefs(&app)
}

#[tauri::command(async)]
pub fn a75_prefs_set(app: AppHandle, prefs: Prefs) -> Result<(), String> {
    let text = serde_json::to_string_pretty(&prefs).map_err(|e| e.to_string())?;
    if let Some(f) = config_file(&app, "a75-prefs.json") {
        std::fs::write(f, text).map_err(|e| e.to_string())?;
    }
    *app.state::<Extras>().prefs.lock() = prefs;
    apply_stats_enabled(&app);
    Ok(())
}

// ---------------------------------------------------------------- app rules

/// Programs seen in front recently, newest first, for "add this program".
#[tauri::command(async)]
pub fn a75_recent_apps(app: AppHandle) -> Vec<String> {
    app.state::<Extras>().recent.lock().iter().cloned().collect()
}

fn set_win_lock(app: &AppHandle, on: bool) {
    let state = app.state::<AppState>();
    if let Ok(settings) = crate::commands::get_settings(state.clone()) {
        if let Some(mut o) = settings.options {
            if o.win_lock != on {
                o.win_lock = on;
                let _ = crate::commands::set_options(state, o);
            }
        }
    }
}

/// Once a second: which program is in front, and does a rule want a
/// different look. Each switch is one LEDPARAM write; nothing is sent while
/// the same program stays in front, so flash sees a write per switch only.
fn start_rules_watcher(app: AppHandle) {
    std::thread::spawn(move || {
        let own = std::env::current_exe()
            .ok()
            .and_then(|p| p.file_name().map(|n| n.to_string_lossy().to_lowercase()));
        let mut last_exe = String::new();
        // The look before the first rule kicked in, restored afterwards.
        let mut base: Option<(LedParam, bool)> = None;
        let mut applied: Option<String> = None;
        loop {
            std::thread::sleep(Duration::from_secs(1));
            let Some(exe) = win::foreground_exe() else { continue };
            if Some(&exe) == own.as_ref() || exe == last_exe {
                continue;
            }
            last_exe = exe.clone();
            {
                let ex = app.state::<Extras>();
                let mut recent = ex.recent.lock();
                recent.retain(|e| e != &exe);
                recent.push_front(exe.clone());
                recent.truncate(12);
            }
            let p = prefs(&app);
            if !p.rules_enabled || live_running(&app) {
                continue;
            }
            let state = app.state::<AppState>();
            if !matches!(open_board(&state), Some((A75_ID, _))) {
                continue;
            }
            let rule = p.rules.iter().find(|r| r.exe.eq_ignore_ascii_case(&exe)).cloned();
            match (rule, applied.clone()) {
                (Some(r), cur) if cur.as_deref() != Some(&r.exe.to_lowercase()) => {
                    if base.is_none() {
                        let wire = led_wire(&state);
                        let led = with_open(&state, |t, _| block_on(ops::read_led_param(t, wire)));
                        let lock = crate::commands::get_settings(state.clone())
                            .ok()
                            .and_then(|s| s.options)
                            .is_some_and(|o| o.win_lock);
                        if let Ok(led) = led {
                            base = Some((led, lock));
                        }
                    }
                    let _ = send_led(&state, r.led);
                    set_win_lock(&app, r.win_lock);
                    applied = Some(r.exe.to_lowercase());
                    log::info!("rule for {} applied", r.exe);
                }
                (None, Some(_)) => {
                    if let Some((led, lock)) = base.take() {
                        let _ = send_led(&state, led);
                        set_win_lock(&app, lock);
                    }
                    applied = None;
                }
                _ => {}
            }
        }
    });
}

// ---------------------------------------------------------------- typing stats

static KEY_COUNTS: Mutex<Option<HashMap<u8, u64>>> = Mutex::new(None);
static KEY_TOTAL: AtomicU64 = AtomicU64::new(0);
static KEY_RECENT: Mutex<VecDeque<Instant>> = Mutex::new(VecDeque::new());
static STATS_SINCE: Mutex<Option<String>> = Mutex::new(None);

fn on_key(vk: u32) {
    KEY_TOTAL.fetch_add(1, Ordering::Relaxed);
    if let Some(u) = win::vk_to_usage(vk) {
        *KEY_COUNTS.lock().get_or_insert_with(HashMap::new).entry(u).or_insert(0) += 1;
    }
    let now = Instant::now();
    let mut r = KEY_RECENT.lock();
    r.push_back(now);
    while r.front().is_some_and(|t| now.duration_since(*t) > Duration::from_secs(60)) {
        r.pop_front();
    }
}

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct SavedStats {
    counts: HashMap<u8, u64>,
    total: u64,
    since: String,
}

fn today() -> String {
    // Days since the epoch is enough to label a start date in the UI.
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_secs());
    secs.to_string()
}

fn stats_load(app: &AppHandle) {
    let saved = config_file(app, "a75-stats.json")
        .and_then(|f| std::fs::read_to_string(f).ok())
        .and_then(|s| serde_json::from_str::<SavedStats>(&s).ok())
        .unwrap_or_default();
    KEY_TOTAL.store(saved.total, Ordering::Relaxed);
    *KEY_COUNTS.lock() = Some(saved.counts);
    *STATS_SINCE.lock() = Some(if saved.since.is_empty() { today() } else { saved.since });
}

fn stats_save(app: &AppHandle) {
    let saved = SavedStats {
        counts: KEY_COUNTS.lock().clone().unwrap_or_default(),
        total: KEY_TOTAL.load(Ordering::Relaxed),
        since: STATS_SINCE.lock().clone().unwrap_or_else(today),
    };
    if let (Some(f), Ok(text)) = (config_file(app, "a75-stats.json"), serde_json::to_string(&saved)) {
        let _ = std::fs::write(f, text);
    }
}

fn start_stats_saver(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(60));
        if prefs(&app).stats_enabled {
            stats_save(&app);
        }
    });
}

fn apply_stats_enabled(app: &AppHandle) {
    let want = prefs(app).stats_enabled;
    let ex = app.state::<Extras>();
    let mut hook = ex.hook.lock();
    match (want, hook.is_some()) {
        (true, false) => *hook = win::key_hook(on_key),
        (false, true) => {
            if let Some(h) = hook.take() {
                h.stop();
            }
            stats_save(app);
        }
        _ => {}
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    pub enabled: bool,
    /// Whether counting actually runs (it needs Windows).
    pub active: bool,
    /// HID usage → presses.
    pub counts: HashMap<u8, u64>,
    pub total: u64,
    /// Presses in the last minute.
    pub per_minute: usize,
    /// Unix seconds when counting began.
    pub since: String,
}

#[tauri::command(async)]
pub fn a75_stats_get(app: AppHandle) -> Stats {
    let now = Instant::now();
    let per_minute = KEY_RECENT
        .lock()
        .iter()
        .filter(|t| now.duration_since(**t) <= Duration::from_secs(60))
        .count();
    Stats {
        enabled: prefs(&app).stats_enabled,
        active: app.state::<Extras>().hook.lock().is_some(),
        counts: KEY_COUNTS.lock().clone().unwrap_or_default(),
        total: KEY_TOTAL.load(Ordering::Relaxed),
        per_minute,
        since: STATS_SINCE.lock().clone().unwrap_or_else(today),
    }
}

#[tauri::command(async)]
pub fn a75_stats_reset(app: AppHandle) {
    *KEY_COUNTS.lock() = Some(HashMap::new());
    KEY_TOTAL.store(0, Ordering::Relaxed);
    KEY_RECENT.lock().clear();
    *STATS_SINCE.lock() = Some(today());
    stats_save(&app);
}

pub fn on_exit(app: &AppHandle) {
    let _ = stop_music(app);
    stats_save(app);
}

// ---------------------------------------------------------------- system

#[tauri::command(async)]
pub fn a75_autostart_get(app: AppHandle) -> bool {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().unwrap_or(false)
}

#[tauri::command(async)]
pub fn a75_autostart_set(app: AppHandle, on: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let a = app.autolaunch();
    if on { a.enable() } else { a.disable() }.map_err(|e| e.to_string())
}

#[tauri::command(async)]
pub fn a75_notify(app: AppHandle, title: String, body: String) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    app.notification().builder().title(title).body(body).show().map_err(|e| e.to_string())
}
