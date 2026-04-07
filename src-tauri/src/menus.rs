use crate::commands::system::open_preferences;
use tauri::Manager;

pub fn setup_menus(app: &mut tauri::App) -> Result<(), tauri::Error> {
    use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
    use tauri::{WebviewUrl, WebviewWindowBuilder};

    let preferences_item = MenuItemBuilder::with_id("preferences", "Preferences…")
        .accelerator("CmdOrCtrl+,")
        .build(app)?;
    let about_item = MenuItemBuilder::with_id("about", "About Snapfzz").build(app)?;

    let app_menu = SubmenuBuilder::new(app, "Snapfzz")
        .item(&about_item)
        .separator()
        .item(&preferences_item)
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    let view_menu = SubmenuBuilder::new(app, "View").fullscreen().build()?;
    let window_menu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .close_window()
        .build()?;

    app.set_menu(
        MenuBuilder::new(app)
            .item(&app_menu)
            .item(&edit_menu)
            .item(&view_menu)
            .item(&window_menu)
            .build()?,
    )?;

    let menu_handle = app.handle().clone();
    app.on_menu_event(move |_app, event| match event.id().as_ref() {
        "preferences" => {
            let handle = menu_handle.clone();
            tauri::async_runtime::spawn(async move {
                let _ = open_preferences(handle).await;
            });
        }
        "about" => {
            let handle = menu_handle.clone();
            if let Some(about_window) = handle.get_webview_window("about") {
                let _ = about_window.set_focus();
                return;
            }
            let url = if cfg!(debug_assertions) {
                WebviewUrl::External("http://localhost:5174/about.html".parse().unwrap())
            } else {
                WebviewUrl::App("about.html".into())
            };
            let _ = WebviewWindowBuilder::new(&handle, "about", url)
                .title("About")
                .inner_size(420.0, 520.0)
                .resizable(false)
                .maximizable(false)
                .minimizable(false)
                .center()
                .build();
        }
        _ => {}
    });

    Ok(())
}
