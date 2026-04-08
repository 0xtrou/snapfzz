use serde_json::json;
use snapfzz_kernel::boot::PreflightContext;
use snapfzz_kernel::budget::device::DeviceInfo;

#[test]
fn a008_kernel_context_device_serialization_round_trip() {
    let device = DeviceInfo {
        os: "macos".to_string(),
        arch: "aarch64".to_string(),
        platform: "macos-arm64".to_string(),
        platform_display: "macOS (Apple Silicon)".to_string(),
        cores: 8,
        ram_gb: 16,
        on_battery: false,
    };
    let mut ctx = PreflightContext::new(std::path::PathBuf::from("/tmp/snapfzz"));
    ctx.set_device(device);

    assert_eq!(
        serde_json::to_value(ctx.device()).unwrap(),
        json!({
            "os": "macos",
            "arch": "aarch64",
            "platform": "macos-arm64",
            "platformDisplay": "macOS (Apple Silicon)",
            "cores": 8,
            "ramGb": 16,
            "onBattery": false
        })
    );
}
