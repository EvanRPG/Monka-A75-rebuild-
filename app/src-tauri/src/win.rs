// SPDX-License-Identifier: GPL-3.0-or-later
//! The few Windows facilities the A75 extras need. Every function has a
//! stub elsewhere so the crate still builds and tests on other systems.

/// File name of the program owning the foreground window, lower-case.
pub fn foreground_exe() -> Option<String> {
    imp::foreground_exe()
}

/// Master volume of the default playback device, 0..1, and whether muted.
pub fn master_volume() -> Option<(f32, bool)> {
    imp::master_volume()
}

/// Average colour of the primary screen.
pub fn screen_average() -> Option<[u8; 3]> {
    imp::screen_average()
}

/// Calls `on_key(vk)` for every physical key press (repeats and injected
/// input excluded) until `stop()` on the returned handle.
pub fn key_hook(on_key: fn(u32)) -> Option<HookHandle> {
    imp::key_hook(on_key)
}

pub struct HookHandle {
    #[allow(dead_code)]
    thread_id: u32,
}

impl HookHandle {
    pub fn stop(self) {
        imp::stop_hook(self.thread_id)
    }
}

/// Windows virtual-key code to HID keyboard usage, for the keys the A75 has.
pub fn vk_to_usage(vk: u32) -> Option<u8> {
    Some(match vk {
        0x41..=0x5A => (vk - 0x41 + 4) as u8,  // A..Z
        0x31..=0x39 => (vk - 0x31 + 30) as u8, // 1..9
        0x30 => 39,
        0x70..=0x7B => (vk - 0x70 + 58) as u8, // F1..F12
        0x0D => 40,
        0x1B => 41,
        0x08 => 42,
        0x09 => 43,
        0x20 => 44,
        0xBD => 45,
        0xBB => 46,
        0xDB => 47,
        0xDD => 48,
        0xDC => 49,
        0xBA => 51,
        0xDE => 52,
        0xC0 => 53,
        0xBC => 54,
        0xBE => 55,
        0xBF => 56,
        0x14 => 57,
        0x2D => 73,
        0x24 => 74,
        0x21 => 75,
        0x2E => 76,
        0x23 => 77,
        0x22 => 78,
        0x27 => 79,
        0x25 => 80,
        0x28 => 81,
        0x26 => 82,
        0xA2 => 224,
        0xA0 => 225,
        0xA4 => 226,
        0x5B => 227,
        0xA3 => 228,
        0xA1 => 229,
        0xA5 => 230,
        0x5C => 231,
        _ => return None,
    })
}

#[cfg(windows)]
mod imp {
    use super::HookHandle;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use windows::core::PWSTR;
    use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::Graphics::Gdi::{
        CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetDIBits,
        ReleaseDC, SelectObject, SetStretchBltMode, StretchBlt, BITMAPINFO, BITMAPINFOHEADER,
        BI_RGB, DIB_RGB_COLORS, HALFTONE, SRCCOPY,
    };
    use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
    use windows::Win32::Media::Audio::{
        eConsole, eRender, IMMDeviceEnumerator, MMDeviceEnumerator,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED,
    };
    use windows::Win32::System::Threading::{
        GetCurrentThreadId, OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, DispatchMessageW, GetForegroundWindow, GetMessageW, GetSystemMetrics,
        GetWindowThreadProcessId, PostThreadMessageW, SetWindowsHookExW, TranslateMessage,
        UnhookWindowsHookEx, KBDLLHOOKSTRUCT, LLKHF_INJECTED, MSG, SM_CXSCREEN, SM_CYSCREEN,
        WH_KEYBOARD_LL, WM_KEYDOWN, WM_KEYUP, WM_QUIT, WM_SYSKEYDOWN, WM_SYSKEYUP,
    };

    pub fn foreground_exe() -> Option<String> {
        unsafe {
            let hwnd: HWND = GetForegroundWindow();
            if hwnd.0.is_null() {
                return None;
            }
            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            if pid == 0 {
                return None;
            }
            let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
            let mut buf = [0u16; 520];
            let mut len = buf.len() as u32;
            let ok = QueryFullProcessImageNameW(
                h,
                PROCESS_NAME_WIN32,
                PWSTR(buf.as_mut_ptr()),
                &mut len,
            );
            let _ = CloseHandle(h);
            ok.ok()?;
            let path = String::from_utf16_lossy(&buf[..len as usize]);
            path.rsplit(['\\', '/']).next().map(|s| s.to_lowercase())
        }
    }

    pub fn master_volume() -> Option<(f32, bool)> {
        unsafe {
            // Harmless if this thread already joined COM in the same mode.
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let en: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).ok()?;
            let dev = en.GetDefaultAudioEndpoint(eRender, eConsole).ok()?;
            let vol: IAudioEndpointVolume = dev.Activate(CLSCTX_ALL, None).ok()?;
            let level = vol.GetMasterVolumeLevelScalar().ok()?;
            let muted = vol.GetMute().ok()?.as_bool();
            Some((level, muted))
        }
    }

    pub fn screen_average() -> Option<[u8; 3]> {
        const W: i32 = 32;
        const H: i32 = 18;
        unsafe {
            let sw = GetSystemMetrics(SM_CXSCREEN);
            let sh = GetSystemMetrics(SM_CYSCREEN);
            let screen = GetDC(None);
            if screen.is_invalid() {
                return None;
            }
            let mem = CreateCompatibleDC(Some(screen));
            let bmp = CreateCompatibleBitmap(screen, W, H);
            let old = SelectObject(mem, bmp.into());
            SetStretchBltMode(mem, HALFTONE);
            let ok = StretchBlt(mem, 0, 0, W, H, Some(screen), 0, 0, sw, sh, SRCCOPY).as_bool();
            let mut info = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: W,
                    biHeight: -H,
                    biPlanes: 1,
                    biBitCount: 32,
                    biCompression: BI_RGB.0,
                    ..Default::default()
                },
                ..Default::default()
            };
            let mut px = vec![0u8; (W * H * 4) as usize];
            let lines = GetDIBits(
                mem,
                bmp,
                0,
                H as u32,
                Some(px.as_mut_ptr().cast()),
                &mut info,
                DIB_RGB_COLORS,
            );
            SelectObject(mem, old);
            let _ = DeleteObject(bmp.into());
            let _ = DeleteDC(mem);
            ReleaseDC(None, screen);
            if !ok || lines == 0 {
                return None;
            }
            let (mut r, mut g, mut b) = (0u64, 0u64, 0u64);
            for p in px.chunks_exact(4) {
                b += p[0] as u64;
                g += p[1] as u64;
                r += p[2] as u64;
            }
            let n = (W * H) as u64;
            Some([(r / n) as u8, (g / n) as u8, (b / n) as u8])
        }
    }

    static ON_KEY: AtomicUsize = AtomicUsize::new(0);
    static DOWN: std::sync::Mutex<[bool; 256]> = std::sync::Mutex::new([false; 256]);

    unsafe extern "system" fn hook(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        if code >= 0 {
            let k = &*(lparam.0 as *const KBDLLHOOKSTRUCT);
            let msg = wparam.0 as u32;
            if (k.flags & LLKHF_INJECTED).0 == 0 && k.vkCode < 256 {
                let vk = k.vkCode as usize;
                if let Ok(mut down) = DOWN.lock() {
                    if msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN {
                        if !down[vk] {
                            down[vk] = true;
                            let f = ON_KEY.load(Ordering::Relaxed);
                            if f != 0 {
                                let f: fn(u32) = std::mem::transmute(f);
                                f(k.vkCode);
                            }
                        }
                    } else if msg == WM_KEYUP || msg == WM_SYSKEYUP {
                        down[vk] = false;
                    }
                }
            }
        }
        CallNextHookEx(None, code, wparam, lparam)
    }

    pub fn key_hook(on_key: fn(u32)) -> Option<HookHandle> {
        ON_KEY.store(on_key as usize, Ordering::Relaxed);
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || unsafe {
            let h = match SetWindowsHookExW(WH_KEYBOARD_LL, Some(hook), None, 0) {
                Ok(h) => h,
                Err(e) => {
                    log::warn!("keyboard hook: {e}");
                    let _ = tx.send(None);
                    return;
                }
            };
            let _ = tx.send(Some(GetCurrentThreadId()));
            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
            let _ = UnhookWindowsHookEx(h);
        });
        rx.recv()
            .ok()
            .flatten()
            .map(|thread_id| HookHandle { thread_id })
    }

    pub fn stop_hook(thread_id: u32) {
        unsafe {
            let _ = PostThreadMessageW(thread_id, WM_QUIT, WPARAM(0), LPARAM(0));
        }
    }
}

#[cfg(not(windows))]
mod imp {
    use super::HookHandle;
    pub fn foreground_exe() -> Option<String> {
        None
    }
    pub fn master_volume() -> Option<(f32, bool)> {
        None
    }
    pub fn screen_average() -> Option<[u8; 3]> {
        None
    }
    pub fn key_hook(_on_key: fn(u32)) -> Option<HookHandle> {
        None
    }
    pub fn stop_hook(_thread_id: u32) {}
}

#[cfg(test)]
mod tests {
    use super::vk_to_usage;

    #[test]
    fn letters_digits_and_modifiers_map_to_hid() {
        assert_eq!(vk_to_usage(0x41), Some(4)); // A
        assert_eq!(vk_to_usage(0x5A), Some(29)); // Z
        assert_eq!(vk_to_usage(0x30), Some(39)); // 0
        assert_eq!(vk_to_usage(0x70), Some(58)); // F1
        assert_eq!(vk_to_usage(0xA0), Some(225)); // left shift
        assert_eq!(vk_to_usage(0xAF), None); // volume up is not a key on the board
    }
}
