# Build: T17 — General Settings Enforcement + Custom Font Install

## What Was Built

1. useAppSettings hook — applies font family/size from settings to DOM on boot
2. settings-changed event listener — re-applies on save from any window
3. install_font_from_url Rust command — downloads font to ~/.snapfzz/fonts/
4. install_font_from_file Rust command — copies font file to ~/.snapfzz/fonts/
5. list_installed_fonts Rust command — returns installed font names
6. Custom font UI — URL install + file picker + installed fonts tags
7. Boot font loading — FontFace API registers installed fonts
8. GeneralSettings emits settings-changed + applies immediately after save

## Tests
- 51 TS tests passing, 90.74% branch coverage
- 20 Rust tests passing (2 new font tests)
