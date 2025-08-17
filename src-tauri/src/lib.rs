#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![open_scanner_ui, spawn_scanner_app])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

// Attempt to open the native scanner UI on the host system.
#[tauri::command]
fn open_scanner_ui() -> Result<String, String> {
  #[cfg(target_os = "windows")]
  {
    use std::process::Command;
    match Command::new("wiaacmgr.exe").spawn() {
      Ok(_) => Ok("opened".into()),
      Err(e) => Err(format!("Failed to open scanner UI: {}", e)),
    }
  }

  #[cfg(not(target_os = "windows"))]
  {
    Err("Scanner UI launch not supported on this OS".into())
  }
}

#[tauri::command]
fn spawn_scanner_app(path: String) -> Result<String, String> {
  use std::process::Command;
  if cfg!(target_os = "windows") {
    match Command::new(path).spawn() {
      Ok(_) => Ok("spawned".into()),
      Err(e) => Err(format!("Failed to spawn scanner app: {}", e)),
    }
  } else {
    Err("Not supported on this OS".into())
  }
}
