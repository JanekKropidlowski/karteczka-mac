#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIcon, TrayIconBuilder},
    Manager, State,
};

struct TrayHandle(Mutex<Option<TrayIcon>>);

/// Licznik zadan na dzis obok ikonki w pasku menu (puste = zero)
#[tauri::command]
fn set_tray_count(state: State<TrayHandle>, count: u32) {
    if let Some(tray) = state.0.lock().unwrap().as_ref() {
        let title: Option<String> = if count > 0 { Some(count.to_string()) } else { None };
        let _ = tray.set_title(title);
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(TrayHandle(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![set_tray_count])
        .setup(|app| {
            let win = app
                .get_webview_window("main")
                .expect("brak okna main");
            // Duplikacja ustawien z tauri.conf.json na wypadek znanych bugow
            // (tauri#9439, tauri#11488) - wolanie jawne po starcie
            let _ = win.set_always_on_top(true);
            let _ = win.set_visible_on_all_workspaces(true);

            let show = MenuItem::with_id(app, "toggle", "Pokaż / ukryj", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Zakończ", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;

            let tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().expect("brak ikony").clone())
                .tooltip("Karteczka")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "toggle" => {
                        if let Some(w) = app.get_webview_window("main") {
                            if w.is_visible().unwrap_or(false) {
                                let _ = w.hide();
                            } else {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            *app.state::<TrayHandle>().0.lock().unwrap() = Some(tray);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("blad uruchamiania karteczki");
}
