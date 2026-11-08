// SPDX-FileCopyrightText: JR Lanteigne <root@dnim.dev>
// SPDX-FileCopyrightText: Shiroki Satsuki <me@shirok1.dev>
// SPDX-License-Identifier: GPL-3.0-or-later
mod a75;
mod commands;
pub mod derive;
pub mod dev;
pub mod hid;
mod music;
pub mod ops;
mod permissions;
pub mod protocol;
pub mod registry;
pub mod session;
mod tray;
mod win;
pub mod wire;

use commands::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Two copies on one keyboard stall the endpoint. A second launch
        // raises the first window.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.webview_windows().values().next() {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .manage(AppState::default())
        .manage(a75::MusicState::default())
        .manage(a75::Extras::default())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .setup(|app| {
            a75::load(app.handle());
            tray::build(app.handle())?;
            // Started with Windows: stay in the tray.
            if std::env::args().any(|a| a == "--hidden") {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.hide();
                }
            }
            Ok(())
        })
        // Closing the window keeps the app in the tray (so program rules and
        // live lighting carry on) unless the owner turned that off.
        .on_window_event(|w, e| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = e {
                if a75::prefs(w.app_handle()).close_to_tray {
                    api.prevent_close();
                    let _ = w.hide();
                } else {
                    a75::on_exit(w.app_handle());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::scan,
            permissions::request_input_monitoring,
            permissions::open_input_monitoring_settings,
            permissions::reveal_current_app,
            commands::allow_unregistered,
            commands::apply_owner_record,
            commands::set_switch_trial,
            commands::get_switches,
            commands::travel_stream,
            commands::travel_read,
            commands::set_switch_key,
            commands::set_switch_keys,
            commands::set_switches_all,
            commands::get_switch_preset,
            commands::set_switch_preset,
            commands::set_switches_global,
            commands::read_keymap_layer,
            commands::set_key_layer,
            commands::build_id,
            commands::get_led_param,
            commands::set_led_param,
            commands::set_led_flags_swapped,
            commands::get_profile,
            commands::get_screen_version,
            commands::set_profile,
            commands::read_keymap,
            commands::read_fn_keymap,
            commands::set_key,
            commands::get_settings,
            commands::set_debounce,
            commands::set_sleep,
            commands::set_options,
            commands::set_side_light,
            commands::set_auto_os,
            commands::factory_reset,
            commands::set_clock,
            commands::write_per_key,
            commands::write_screen_image,
            commands::read_macro,
            commands::write_macro,
            commands::contribution_bundle,
            commands::export_config,
            commands::import_config,
            commands::raw_command,
            a75::a75_get_report_rate,
            a75::a75_set_report_rate,
            a75::a75_music_start,
            a75::a75_music_stop,
            a75::a75_music_params,
            a75::a75_music_status,
            a75::a75_prefs_get,
            a75::a75_prefs_set,
            a75::a75_recent_apps,
            a75::a75_stats_get,
            a75::a75_stats_reset,
            a75::a75_autostart_get,
            a75::a75_autostart_set,
            a75::a75_notify,
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                a75::on_exit(app);
            }
        });
}
