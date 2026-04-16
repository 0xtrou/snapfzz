// A039/PhasedBoot: Three independent async phases coordinated by Notify signals and a watch
// channel. Per A003: UI visible at 0ms, interactive at 200ms. Runtime boot runs entirely in the
// background and is NOT part of the startup budget.
//
// Phase 1 — Python runtime install (no locks, fully independent)
// Phase 2 — PostgreSQL start (independent; stores handle behind Arc<Mutex> only at end)
// Phase 3 — Service spawn (waits for Phase 1 + 2 via Notify; brief lock per service)

use crate::constants::databases;
use crate::helpers::emit_supervisor;
#[allow(unused_imports)]
use tauri::Emitter;
use snapfzz_kernel::process::ProcessFactoryRegistry;
use snapfzz_packs::{runtime::python::PythonRuntime, ComponentRegistry};
use std::{path::PathBuf, sync::Arc};

pub fn spawn_boot_phases(
    data_dir: PathBuf,
    python_runtime: Arc<PythonRuntime>,
    component_registry: Arc<ComponentRegistry>,
    postgres_runtime: Arc<tokio::sync::Mutex<Option<snapfzz_packs::runtime::postgres::PostgresRuntime>>>,
    factory_registry: Arc<tokio::sync::RwLock<ProcessFactoryRegistry>>,
    app_handle: tauri::AppHandle,
) {
    let python_ready = Arc::new(tokio::sync::Notify::new());
    let pg_ready = Arc::new(tokio::sync::Notify::new());
    // Per A039: PG URL flows from Phase 2 → Phase 3 via a watch channel.
    // None = not yet ready, Some(None) = PG failed, Some(Some(url)) = PG ready with URL.
    let (pg_url_tx, pg_url_rx) = tokio::sync::watch::channel(None::<Option<String>>);

    // Phase 1: Python runtime (independent, no locks)
    {
        let rt = python_runtime.clone();
        let cr = component_registry.clone();
        let notify = python_ready.clone();
        tauri::async_runtime::spawn(async move {
            if rt.is_runtime_ready() {
                eprintln!("[boot/python] runtime ready — skipping install");
            } else {
                eprintln!("[boot/python] runtime not ready — installing...");

                if !rt.is_uv_ready() {
                    if let Some(uv) = cr.get("uv") {
                        eprintln!("[boot/python] downloading uv...");
                        match uv.download().await {
                            Ok(_) => {
                                if let Err(e) = uv.extract().await {
                                    eprintln!("[boot/python] uv extract failed: {e}");
                                }
                            }
                            Err(e) => eprintln!("[boot/python] uv download failed: {e}"),
                        }
                    }
                }

                if !rt.is_python_installed() {
                    if let Some(py) = cr.get("python") {
                        eprintln!("[boot/python] downloading Python...");
                        match py.download().await {
                            Ok(_) => {
                                if let Err(e) = py.extract().await {
                                    eprintln!("[boot/python] python extract failed: {e}");
                                }
                            }
                            Err(e) => eprintln!("[boot/python] python download failed: {e}"),
                        }
                    }
                }

                if rt.is_uv_ready() && rt.is_python_installed() {
                    eprintln!("[boot/python] installing packages...");
                    let rt2 = rt.clone();
                    match tokio::task::spawn_blocking(move || rt2.install_all_packages()).await {
                        Ok(Ok(_)) => eprintln!("[boot/python] packages installed"),
                        Ok(Err(e)) => eprintln!("[boot/python] package install failed: {e}"),
                        Err(e) => eprintln!("[boot/python] install task panicked: {e}"),
                    }
                } else {
                    eprintln!("[boot/python] skipping packages — uv or python missing");
                }
            }
            notify.notify_one();
        });
    }

    // Phase 2: PostgreSQL (independent, only locks postgres_runtime briefly to store handle)
    {
        let pg_runtime = postgres_runtime.clone();
        let notify = pg_ready.clone();
        tauri::async_runtime::spawn(async move {
            let mut pg = snapfzz_packs::runtime::postgres::PostgresRuntime::new(data_dir);
            let mut maybe_url = None;

            if let Err(e) = pg.setup().await {
                eprintln!("[boot/postgres] setup failed: {e}");
            } else if let Err(e) = pg.start().await {
                eprintln!("[boot/postgres] start failed: {e}");
            } else {
                if let Err(e) = pg.create_database(databases::LITELLM).await {
                    eprintln!("[boot/postgres] create litellm db failed: {e}");
                }
                maybe_url = pg.connection_url(databases::LITELLM);
                if let Some(ref url) = maybe_url {
                    eprintln!("[boot/postgres] litellm URL: {url}");
                } else {
                    eprintln!("[boot/postgres] URL unavailable after startup");
                }
            }

            *pg_runtime.lock().await = Some(pg);
            let _ = pg_url_tx.send(Some(maybe_url));
            notify.notify_one();
        });
    }

    // Phase 3: Service spawning (waits for Phase 1 + 2, brief lock per service)
    {
        tauri::async_runtime::spawn(async move {
            // Wait for both runtimes — does NOT hold any lock while waiting
            python_ready.notified().await;
            pg_ready.notified().await;

            // Read PG URL from watch channel
            let maybe_url = pg_url_rx.borrow().clone().flatten();

            // Phase 1 (quick write): set database_url + prepare spawn handles
            let handles = {
                let mut registry = factory_registry.write().await;
                if let Some(url) = maybe_url {
                    registry.set_database_url(url);
                }
                registry.prepare_spawn_all()
                // write lock released here — UI reads can proceed
            };

            // Phase 2 (no lock): await all spawns concurrently
            let spawn_results = snapfzz_kernel::process::ProcessFactoryRegistry::run_spawn_handles(handles).await;

            // Phase 3 (quick write): reinsert spawned processes
            let results = factory_registry.write().await.finalize_spawn_all(spawn_results);

            for (name, result) in results {
                match result {
                    Ok(()) => {
                        eprintln!("[boot/spawn] {} started", name);
                        emit_supervisor(
                            &app_handle,
                            "success",
                            &name,
                            format!("{} started successfully", name),
                        );
                    }
                    Err(e) => {
                        eprintln!("[boot/spawn] {} FAILED: {}", name, e);
                        emit_supervisor(
                            &app_handle,
                            "error",
                            &name,
                            format!("Failed to start {}: {}", name, e),
                        );
                    }
                }
            }

            // Per A003/BootComplete: emit after all Phase 3 results are processed so the
            // frontend skeleton stays visible until the full boot sequence is done.
            app_handle.emit("boot-complete", serde_json::json!({
                "success": true,
                "timestamp": std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64
            })).ok();
            eprintln!("[boot] boot-complete event emitted");
        });
    }
}
