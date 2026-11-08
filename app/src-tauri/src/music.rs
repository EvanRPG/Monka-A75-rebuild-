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
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MusicParams {
    /// Firmware layout: 0 upright, 1 separate, 2 intersect (LEDPARAM option).
    pub style: u8,
    pub gain: f32,
    pub gate: f32,
    pub decay: f32,
    pub bass: f32,
    pub spread: f32,
}

impl Default for MusicParams {
    fn default() -> Self {
        Self { style: 0, gain: 55.0, gate: 12.0, decay: 45.0, bass: 30.0, spread: 25.0 }
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
        Self { fft, window, bands, held: [0.0; BANDS] }
    }

    /// Levels for the newest `FFT_N` samples (mono, -1..1). Fewer samples
    /// are zero-padded at the front.
    pub fn levels(&mut self, samples: &[f32], p: &MusicParams) -> [u8; BANDS] {
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
        let fall = 0.12 + (1.0 - p.decay.clamp(0.0, 100.0) / 100.0) * 1.3;

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
        for i in 0..BANDS {
            self.held[i] = raw[i].max(self.held[i] - fall);
        }
        let k = p.spread.clamp(0.0, 100.0) / 100.0 * 0.6;
        let mut out = [0u8; BANDS];
        for i in 0..BANDS {
            let l = self.held[i.saturating_sub(1)];
            let r = self.held[(i + 1).min(BANDS - 1)];
            let v = self.held[i] * (1.0 - k) + (l + r) * 0.5 * k;
            out[i] = v.round().clamp(0.0, LEVEL_MAX as f32) as u8;
        }
        out
    }
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
    fn bands_cover_increasing_bins() {
        let a = Analyzer::new(48_000);
        for w in a.bands.windows(2) {
            assert!(w[0].0 < w[0].1 && w[0].0 <= w[1].0, "{:?}", a.bands);
        }
    }
}
