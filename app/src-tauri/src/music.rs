// SPDX-License-Identifier: GPL-3.0-or-later
//! Host-side music analysis for the A75's music mode: system audio in,
//! 32 band levels 0..=6 out, one `SET_AUDIO` frame per tick.
//!
//! Frame shape and limits come from a USB capture of the vendor app
//! (2,970 frames): `[0x0D, 0 x6, 0xF2]` then 32 levels at bytes 8..40, low
//! to high, values 0..=6, one frame every 31.25 ms.

use std::collections::VecDeque;
use std::sync::Arc;

use parking_lot::Mutex;
use rustfft::{num_complex::Complex, Fft, FftPlanner};
use serde::{Deserialize, Serialize};

use crate::protocol::{packet, Checksum, REPORT_LEN};

pub const SET_AUDIO: u8 = 0x0D;
pub const BANDS: usize = 32;
pub const LEVEL_MAX: u8 = 6;
/// 32 frames a second, as the vendor sends them.
pub const FRAME_US: u64 = 31_250;
const FFT_N: usize = 2048;
const LOW_HZ: f32 = 40.0;
const HIGH_HZ: f32 = 16_000.0;

/// The knobs on the Music page. All 0..=100 except `style`.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MusicParams {
    /// LEDPARAM mode: 22 (music 2) or 20 (music 3). Both take the same frames.
    #[serde(default = "default_mode")]
    pub mode: u8,
    /// Firmware layout: 0 upright, 1 separate, 2 intersect (LEDPARAM option).
    pub style: u8,
    /// 0: this app's analyser. 1: the vendor's (see `vendor_levels`).
    #[serde(default)]
    pub algo: u8,
    /// What drives the board: "music", "cpu", "ram", "volume", "timer", "screen".
    #[serde(default = "default_source")]
    pub source: String,
    /// While music plays, turning the knob shows a volume bar for a moment.
    #[serde(default)]
    pub volume_overlay: bool,
    /// Countdown length for the "timer" source.
    #[serde(default)]
    pub timer_secs: u32,
    /// Screen colour: extra saturation and brightness, 0..=100.
    #[serde(default)]
    pub boost: f32,
    pub gain: f32,
    pub gate: f32,
    pub decay: f32,
    pub bass: f32,
    pub spread: f32,
}

fn default_mode() -> u8 {
    22
}

fn default_source() -> String {
    "music".into()
}

impl Default for MusicParams {
    fn default() -> Self {
        Self {
            mode: 22,
            style: 0,
            algo: 0,
            source: default_source(),
            volume_overlay: false,
            timer_secs: 0,
            boost: 40.0,
            gain: 55.0,
            gate: 12.0,
            decay: 45.0,
            bass: 30.0,
            spread: 25.0,
        }
    }
}

/// The frame for one set of levels. Values above 6 are clamped: the vendor
/// never sends more, and what the firmware does with more is unknown.
pub fn audio_packet(levels: &[u8; BANDS]) -> [u8; REPORT_LEN] {
    let mut payload = [0u8; 7 + BANDS];
    for (i, &l) in levels.iter().enumerate() {
        payload[7 + i] = l.min(LEVEL_MAX);
    }
    packet(SET_AUDIO, &payload, Checksum::Bit7)
}

pub struct Analyzer {
    fft: Arc<dyn Fft<f32>>,
    window: Vec<f32>,
    /// FFT bin range per band.
    bands: Vec<(usize, usize)>,
    held: [f32; BANDS],
    /// Vendor path: Blackman window and the analyser's smoothed magnitudes.
    blackman: Vec<f32>,
    smooth: Vec<f32>,
}

impl Analyzer {
    pub fn new(sample_rate: u32) -> Self {
        let fft = FftPlanner::new().plan_fft_forward(FFT_N);
        let window = (0..FFT_N)
            .map(|i| 0.5 - 0.5 * (2.0 * std::f32::consts::PI * i as f32 / (FFT_N - 1) as f32).cos())
            .collect();
        let hz_per_bin = sample_rate as f32 / FFT_N as f32;
        let high = HIGH_HZ.min(sample_rate as f32 / 2.0 - hz_per_bin);
        let mut bands = Vec::with_capacity(BANDS);
        let mut prev_end = 1usize;
        for i in 0..BANDS {
            let f0 = LOW_HZ * (high / LOW_HZ).powf(i as f32 / BANDS as f32);
            let f1 = LOW_HZ * (high / LOW_HZ).powf((i + 1) as f32 / BANDS as f32);
            // Low bands are narrower than a bin: give each at least one bin
            // of its own, moving upward, so no two bands mirror each other.
            let start = ((f0 / hz_per_bin).floor() as usize).max(prev_end).min(FFT_N / 2 - 1);
            let end = ((f1 / hz_per_bin).ceil() as usize).max(start + 1).min(FFT_N / 2);
            bands.push((start, end));
            prev_end = end;
        }
        let blackman = (0..FFT_N)
            .map(|i| {
                let x = 2.0 * std::f32::consts::PI * i as f32 / FFT_N as f32;
                0.42 - 0.5 * x.cos() + 0.08 * (2.0 * x).cos()
            })
            .collect();
        Self { fft, window, bands, held: [0.0; BANDS], blackman, smooth: vec![0.0; FFT_N / 2] }
    }

    /// Levels for the newest `FFT_N` samples (mono, -1..1). Fewer samples
    /// are zero-padded at the front.
    pub fn levels(&mut self, samples: &[f32], p: &MusicParams) -> [u8; BANDS] {
        if p.algo == 1 {
            let raw = self.vendor_levels(samples);
            return self.finish(raw.map(|v| v as f32), p);
        }
        let mut buf: Vec<Complex<f32>> = vec![Complex::new(0.0, 0.0); FFT_N];
        let take = samples.len().min(FFT_N);
        let off = FFT_N - take;
        for (i, &s) in samples[samples.len() - take..].iter().enumerate() {
            buf[off + i] = Complex::new(s * self.window[off + i], 0.0);
        }
        self.fft.process(&mut buf);
        let scale = 2.0 / FFT_N as f32;

        // Loudness window: gain slides the top of the scale down, so a
        // quiet source still reaches the top row.
        let top_db = -8.0 - p.gain.clamp(0.0, 100.0) * 0.32;
        let floor_db = top_db - 42.0;
        let gate = p.gate.clamp(0.0, 100.0) / 100.0 * 0.6;

        let mut raw = [0f32; BANDS];
        for (i, &(a, b)) in self.bands.iter().enumerate() {
            let peak = buf[a..b].iter().map(|c| c.norm() * scale).fold(0.0f32, f32::max);
            let tilt = 1.0 + p.bass.clamp(0.0, 100.0) / 100.0 * 1.5 * (1.0 - i as f32 / (BANDS - 1) as f32);
            // Higher bands carry less energy in music; a gentle lift keeps
            // the right side of the board alive.
            let lift = 1.0 + 1.2 * i as f32 / (BANDS - 1) as f32;
            let db = 20.0 * (peak * tilt * lift + 1e-9).log10();
            let norm = ((db - floor_db) / (top_db - floor_db)).clamp(0.0, 1.0);
            raw[i] = if norm < gate { 0.0 } else { norm * LEVEL_MAX as f32 };
        }
        self.finish(raw, p)
    }

    /// Fall-off and glow, shared by both analysers.
    fn finish(&mut self, raw: [f32; BANDS], p: &MusicParams) -> [u8; BANDS] {
        let fall = 0.12 + (1.0 - p.decay.clamp(0.0, 100.0) / 100.0) * 1.3;
        for (h, &r) in self.held.iter_mut().zip(raw.iter()) {
            *h = r.max(*h - fall);
        }
        let k = p.spread.clamp(0.0, 100.0) / 100.0 * 0.6;
        let mut out = [0u8; BANDS];
        for (i, o) in out.iter_mut().enumerate() {
            let l = self.held[i.saturating_sub(1)];
            let r = self.held[(i + 1).min(BANDS - 1)];
            let v = self.held[i] * (1.0 - k) + (l + r) * 0.5 * k;
            *o = v.round().clamp(0.0, LEVEL_MAX as f32) as u8;
        }
        out
    }

    /// The vendor app's `music3Delt`, which feeds both of its music modes:
    /// a Web Audio analyser (fftSize 2048, smoothing 0.4, byte data over
    /// -100..-30 dB); the first 100 bins less the minimum of bins 20..40;
    /// scaled so the frame's loudest bin is 6; bins 27..59 sent.
    pub fn vendor_levels(&mut self, samples: &[f32]) -> [u8; BANDS] {
        let mut buf: Vec<Complex<f32>> = vec![Complex::new(0.0, 0.0); FFT_N];
        let take = samples.len().min(FFT_N);
        let off = FFT_N - take;
        for (i, &s) in samples[samples.len() - take..].iter().enumerate() {
            buf[off + i] = Complex::new(s * self.blackman[off + i], 0.0);
        }
        self.fft.process(&mut buf);
        let mut bytes = [0f32; 100];
        for (k, b) in bytes.iter_mut().enumerate() {
            let mag = buf[k].norm() / FFT_N as f32;
            self.smooth[k] = 0.4 * self.smooth[k] + 0.6 * mag;
            let db = 20.0 * (self.smooth[k] + 1e-12).log10();
            *b = (255.0 * (db + 100.0) / 70.0).clamp(0.0, 255.0).floor();
        }
        let floor = bytes[20..40].iter().copied().fold(f32::MAX, f32::min);
        let rel: Vec<f32> = bytes.iter().map(|v| v - floor).collect();
        let max = rel.iter().copied().fold(f32::MIN, f32::max);
        let mut out = [0u8; BANDS];
        if max <= 0.0 {
            return out;
        }
        let unit = max / LEVEL_MAX as f32;
        for (o, &v) in out.iter_mut().zip(rel[27..59].iter()) {
            *o = (v / unit).round().clamp(0.0, LEVEL_MAX as f32) as u8;
        }
        out
    }
}

/// A bar filling the board left to right, `f` in 0..1. The last column
/// takes the remainder as height, so the bar moves smoothly.
pub fn fill_levels(f: f32) -> [u8; BANDS] {
    let cols = f.clamp(0.0, 1.0) * BANDS as f32;
    let mut out = [0u8; BANDS];
    for (i, o) in out.iter_mut().enumerate() {
        let part = (cols - i as f32).clamp(0.0, 1.0);
        *o = (part * LEVEL_MAX as f32).round() as u8;
    }
    out
}

/// A scrolling graph: oldest sample on the left, each 0..1.
pub fn graph_levels(history: &VecDeque<f32>) -> [u8; BANDS] {
    let mut out = [0u8; BANDS];
    let skip = BANDS.saturating_sub(history.len());
    for (o, v) in out.iter_mut().skip(skip).zip(history.iter().rev().take(BANDS).rev()) {
        *o = (v.clamp(0.0, 1.0) * LEVEL_MAX as f32).round() as u8;
    }
    out
}

/// Screen colour made livelier: an averaged screen is mostly grey.
pub fn boost_color([r, g, b]: [u8; 3], boost: f32) -> [u8; 3] {
    let (r, g, b) = (r as f32 / 255.0, g as f32 / 255.0, b as f32 / 255.0);
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    if max <= 0.0 {
        return [0, 0, 0];
    }
    let k = boost.clamp(0.0, 100.0) / 100.0;
    // Push each channel away from the grey level, then lift brightness.
    let grey = (max + min) / 2.0;
    let sat = 1.0 + 2.0 * k;
    let lift = 1.0 / max.max(0.2) * k + (1.0 - k);
    let f = |c: f32| (((c - grey) * sat + grey) * lift).clamp(0.0, 1.0);
    [(f(r) * 255.0) as u8, (f(g) * 255.0) as u8, (f(b) * 255.0) as u8]
}

/// Recent mono samples from the capture callback.
#[derive(Clone, Default)]
pub struct Ring(Arc<Mutex<VecDeque<f32>>>);

impl Ring {
    pub fn push(&self, data: impl Iterator<Item = f32>) {
        let mut q = self.0.lock();
        q.extend(data);
        let excess = q.len().saturating_sub(FFT_N * 2);
        q.drain(..excess);
    }
    pub fn latest(&self) -> Vec<f32> {
        let q = self.0.lock();
        let n = q.len().min(FFT_N);
        q.iter().skip(q.len() - n).copied().collect()
    }
}

/// System audio capture. On Windows an input stream opened on the default
/// *output* device is a WASAPI loopback of what is playing.
pub mod capture {
    use super::Ring;
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

    pub struct Capture {
        _stream: cpal::Stream,
        pub sample_rate: u32,
        pub source: String,
    }

    pub fn start(ring: Ring) -> Result<Capture, String> {
        let host = cpal::default_host();
        let device = host
            .default_output_device()
            .ok_or("没有找到默认播放设备")?;
        let source = device.name().unwrap_or_else(|_| "默认播放设备".into());
        let config = device.default_output_config().map_err(|e| e.to_string())?;
        let channels = config.channels() as usize;
        let sample_rate = config.sample_rate().0;
        let err = |e| log::warn!("audio capture: {e}");
        let stream = match config.sample_format() {
            cpal::SampleFormat::F32 => {
                let ring = ring.clone();
                device.build_input_stream(
                    &config.into(),
                    move |d: &[f32], _| ring.push(d.chunks(channels).map(|f| f.iter().sum::<f32>() / channels as f32)),
                    err,
                    None,
                )
            }
            cpal::SampleFormat::I16 => {
                let ring = ring.clone();
                device.build_input_stream(
                    &config.into(),
                    move |d: &[i16], _| {
                        ring.push(d.chunks(channels).map(|f| f.iter().map(|&s| s as f32 / 32768.0).sum::<f32>() / channels as f32))
                    },
                    err,
                    None,
                )
            }
            cpal::SampleFormat::I32 => {
                let ring = ring.clone();
                device.build_input_stream(
                    &config.into(),
                    move |d: &[i32], _| {
                        ring.push(d.chunks(channels).map(|f| f.iter().map(|&s| s as f32 / 2147483648.0).sum::<f32>() / channels as f32))
                    },
                    err,
                    None,
                )
            }
            f => return Err(format!("不支持的音频格式 {f:?}")),
        }
        .map_err(|e| e.to_string())?;
        stream.play().map_err(|e| e.to_string())?;
        Ok(Capture { _stream: stream, sample_rate, source })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn packet_matches_vendor_capture_header() {
        let mut lv = [0u8; BANDS];
        lv[0] = 6;
        lv[31] = 9; // clamped
        let p = audio_packet(&lv);
        assert_eq!(&p[..8], &[0x0D, 0, 0, 0, 0, 0, 0, 0xF2]);
        assert_eq!(p[8], 6);
        assert_eq!(p[39], 6);
        assert!(p[40..].iter().all(|&b| b == 0));
    }

    #[test]
    fn silence_is_dark() {
        let mut a = Analyzer::new(48_000);
        let lv = a.levels(&vec![0.0; FFT_N], &MusicParams::default());
        assert!(lv.iter().all(|&l| l == 0));
    }

    #[test]
    fn a_bass_tone_lights_the_low_bands_only() {
        let mut a = Analyzer::new(48_000);
        let tone: Vec<f32> = (0..FFT_N).map(|i| 0.5 * (2.0 * std::f32::consts::PI * 80.0 * i as f32 / 48_000.0).sin()).collect();
        let p = MusicParams { spread: 0.0, ..Default::default() };
        let lv = a.levels(&tone, &p);
        assert!(lv[..8].iter().any(|&l| l >= 4), "{lv:?}");
        assert!(lv[20..].iter().all(|&l| l <= 1), "{lv:?}");
    }

    #[test]
    fn vendor_path_tops_out_at_six_and_is_dark_in_silence() {
        let mut a = Analyzer::new(48_000);
        let p = MusicParams { algo: 1, spread: 0.0, decay: 0.0, ..Default::default() };
        assert!(a.levels(&vec![0.0; FFT_N], &p).iter().all(|&l| l == 0));
        // 1 kHz sits in bins 27..59 at 48 kHz (bin 42 or so).
        let tone: Vec<f32> = (0..FFT_N).map(|i| 0.3 * (2.0 * std::f32::consts::PI * 1000.0 * i as f32 / 48_000.0).sin()).collect();
        let mut a = Analyzer::new(48_000);
        let lv = a.levels(&tone, &p);
        assert_eq!(lv.iter().copied().max(), Some(6), "{lv:?}");
    }

    #[test]
    fn fill_and_graph_shapes() {
        assert_eq!(fill_levels(0.0), [0; BANDS]);
        assert_eq!(fill_levels(1.0), [LEVEL_MAX; BANDS]);
        let half = fill_levels(0.5);
        assert!(half[..16].iter().all(|&l| l == 6) && half[16..].iter().all(|&l| l == 0));
        let h: VecDeque<f32> = vec![1.0, 0.0].into();
        let g = graph_levels(&h);
        assert_eq!((g[30], g[31]), (6, 0));
    }

    #[test]
    fn boost_keeps_black_and_saturates_colour() {
        assert_eq!(boost_color([0, 0, 0], 50.0), [0, 0, 0]);
        let c = boost_color([120, 100, 90], 100.0);
        assert!(c[0] as i32 - c[2] as i32 > 30, "{c:?}");
    }

    #[test]
    fn bands_cover_increasing_bins() {
        let a = Analyzer::new(48_000);
        for w in a.bands.windows(2) {
            assert!(w[0].0 < w[0].1 && w[0].0 <= w[1].0, "{:?}", a.bands);
        }
    }
}
