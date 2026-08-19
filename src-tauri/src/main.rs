#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager,
};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
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

            TrayIconBuilder::new()
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

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("blad uruchamiania karteczki");
}
