// The desktop shell: one window showing the bundled web build. No game logic lives here.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Jimothy Crickets");
}
