use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ApiError>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ApiError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
}

pub mod error_codes {
    pub const NOT_FOUND: &str = "NOT_FOUND";
    pub const INSTALL_FAILED: &str = "INSTALL_FAILED";
    pub const UNINSTALL_FAILED: &str = "UNINSTALL_FAILED";
    pub const NETWORK_ERROR: &str = "NETWORK_ERROR";
    pub const VALIDATION_ERROR: &str = "VALIDATION_ERROR";
    pub const INTERNAL_ERROR: &str = "INTERNAL_ERROR";
    pub const NOT_READY: &str = "NOT_READY";
}

impl<T> ApiResponse<T> {
    pub fn success(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn success_empty() -> ApiResponse<()> {
        ApiResponse {
            success: true,
            data: None,
            error: None,
        }
    }

    pub fn error(code: &str, message: impl Into<String>) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(ApiError {
                code: code.to_string(),
                message: message.into(),
                details: None,
            }),
        }
    }

    pub fn error_with_details(
        code: &str,
        message: impl Into<String>,
        details: serde_json::Value,
    ) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(ApiError {
                code: code.to_string(),
                message: message.into(),
                details: Some(details),
            }),
        }
    }
}

impl From<std::io::Error> for ApiError {
    fn from(value: std::io::Error) -> Self {
        Self {
            code: error_codes::INTERNAL_ERROR.to_string(),
            message: value.to_string(),
            details: None,
        }
    }
}

impl From<serde_json::Error> for ApiError {
    fn from(value: serde_json::Error) -> Self {
        Self {
            code: error_codes::VALIDATION_ERROR.to_string(),
            message: value.to_string(),
            details: None,
        }
    }
}

impl From<reqwest::Error> for ApiError {
    fn from(value: reqwest::Error) -> Self {
        Self {
            code: error_codes::NETWORK_ERROR.to_string(),
            message: value.to_string(),
            details: None,
        }
    }
}

impl From<String> for ApiError {
    fn from(value: String) -> Self {
        Self {
            code: error_codes::INTERNAL_ERROR.to_string(),
            message: value,
            details: None,
        }
    }
}

impl From<&str> for ApiError {
    fn from(value: &str) -> Self {
        Self {
            code: error_codes::INTERNAL_ERROR.to_string(),
            message: value.to_string(),
            details: None,
        }
    }
}

impl From<crate::settings::SettingsError> for ApiError {
    fn from(value: crate::settings::SettingsError) -> Self {
        Self {
            code: error_codes::VALIDATION_ERROR.to_string(),
            message: value.to_string(),
            details: None,
        }
    }
}

impl From<crate::process::ProcessError> for ApiError {
    fn from(value: crate::process::ProcessError) -> Self {
        Self {
            code: error_codes::INTERNAL_ERROR.to_string(),
            message: value.to_string(),
            details: None,
        }
    }
}

impl From<crate::boot::PreflightError> for ApiError {
    fn from(value: crate::boot::PreflightError) -> Self {
        Self {
            code: error_codes::NOT_READY.to_string(),
            message: value.to_string(),
            details: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a014_api_response_success_serializes_with_data_only() {
        let response = ApiResponse::success("ok".to_string());
        let json = serde_json::to_value(response).expect("serialize success response");

        assert_eq!(json.get("success"), Some(&serde_json::Value::Bool(true)));
        assert_eq!(
            json.get("data"),
            Some(&serde_json::Value::String("ok".to_string()))
        );
        assert_eq!(json.get("error"), None);
    }

    #[test]
    fn a014_api_response_error_serializes_with_error_only() {
        let response: ApiResponse<()> =
            ApiResponse::error(error_codes::INSTALL_FAILED, "install failed");
        let json = serde_json::to_value(response).expect("serialize error response");

        assert_eq!(json.get("success"), Some(&serde_json::Value::Bool(false)));
        assert_eq!(json.get("data"), None);
        assert_eq!(
            json.pointer("/error/code"),
            Some(&serde_json::Value::String(
                error_codes::INSTALL_FAILED.to_string()
            ))
        );
        assert_eq!(
            json.pointer("/error/message"),
            Some(&serde_json::Value::String("install failed".to_string()))
        );
    }

    #[test]
    fn a014_api_response_success_empty_omits_data_and_error() {
        let response = ApiResponse::<()>::success_empty();
        let json = serde_json::to_value(response).expect("serialize success_empty");

        assert_eq!(json.get("success"), Some(&serde_json::Value::Bool(true)));
        assert_eq!(json.get("data"), None);
        assert_eq!(json.get("error"), None);
    }

    #[test]
    fn a014_api_response_error_with_details_includes_details_field() {
        let details = serde_json::json!({"field": "api_key", "reason": "required"});
        let response: ApiResponse<()> = ApiResponse::error_with_details(
            error_codes::VALIDATION_ERROR,
            "validation failed",
            details.clone(),
        );
        let json = serde_json::to_value(response).expect("serialize error_with_details");

        assert_eq!(json.get("success"), Some(&serde_json::Value::Bool(false)));
        assert_eq!(json.get("data"), None);
        assert_eq!(
            json.pointer("/error/code"),
            Some(&serde_json::Value::String(
                error_codes::VALIDATION_ERROR.to_string()
            ))
        );
        assert_eq!(
            json.pointer("/error/message"),
            Some(&serde_json::Value::String("validation failed".to_string()))
        );
        assert_eq!(json.pointer("/error/details"), Some(&details));
    }

    #[test]
    fn a014_api_error_from_io_error_uses_internal_error_code() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "file not found");
        let api_err = ApiError::from(io_err);
        assert_eq!(api_err.code, error_codes::INTERNAL_ERROR);
        assert!(api_err.message.contains("file not found"));
        assert!(api_err.details.is_none());
    }

    #[test]
    fn a014_api_error_from_serde_json_error_uses_validation_error_code() {
        let json_err = serde_json::from_str::<serde_json::Value>("{bad json}")
            .expect_err("expected parse error");
        let api_err = ApiError::from(json_err);
        assert_eq!(api_err.code, error_codes::VALIDATION_ERROR);
        assert!(!api_err.message.is_empty());
    }

    #[test]
    fn a014_api_error_from_string_uses_internal_error_code() {
        let s = String::from("something went wrong");
        let api_err = ApiError::from(s);
        assert_eq!(api_err.code, error_codes::INTERNAL_ERROR);
        assert_eq!(api_err.message, "something went wrong");
    }

    #[test]
    fn a014_api_error_from_str_ref_uses_internal_error_code() {
        let api_err = ApiError::from("static error message");
        assert_eq!(api_err.code, error_codes::INTERNAL_ERROR);
        assert_eq!(api_err.message, "static error message");
    }

    #[test]
    fn a014_api_error_from_settings_error_uses_validation_code() {
        let settings_err = crate::settings::SettingsError::Parse(
            serde_json::from_str::<serde_json::Value>("{bad}").expect_err("json error"),
        );
        let api_err = ApiError::from(settings_err);
        assert_eq!(api_err.code, error_codes::VALIDATION_ERROR);
        assert!(!api_err.message.is_empty());
    }

    #[test]
    fn a014_api_error_from_process_error_uses_internal_error_code() {
        let process_err = crate::process::ProcessError::RuntimeNotRunning {
            name: "agentscope".to_string(),
        };
        let api_err = ApiError::from(process_err);
        assert_eq!(api_err.code, error_codes::INTERNAL_ERROR);
        assert!(api_err.message.contains("agentscope"));
    }

    #[test]
    fn a014_api_error_from_preflight_error_uses_not_ready_code() {
        let preflight_err = crate::boot::PreflightError::FilesystemFailed("disk full".to_string());
        let api_err = ApiError::from(preflight_err);
        assert_eq!(api_err.code, error_codes::NOT_READY);
        assert!(api_err.message.contains("disk full"));
    }

    #[test]
    fn a014_error_codes_all_constants_are_non_empty_strings() {
        assert!(!error_codes::NOT_FOUND.is_empty());
        assert!(!error_codes::INSTALL_FAILED.is_empty());
        assert!(!error_codes::UNINSTALL_FAILED.is_empty());
        assert!(!error_codes::NETWORK_ERROR.is_empty());
        assert!(!error_codes::VALIDATION_ERROR.is_empty());
        assert!(!error_codes::INTERNAL_ERROR.is_empty());
        assert!(!error_codes::NOT_READY.is_empty());
    }

    #[test]
    fn a014_api_response_success_includes_no_error_field_in_json() {
        // skip_serializing_if omits the error key entirely (not null) for success
        let response = ApiResponse::success(42u32);
        let json = serde_json::to_string(&response).expect("serialize");
        assert!(!json.contains("\"error\""));
        assert!(json.contains("\"success\":true"));
    }

    #[test]
    fn a014_api_response_error_omits_data_key_from_json() {
        // skip_serializing_if omits the data key entirely (not null) for errors
        let response: ApiResponse<u32> = ApiResponse::error(error_codes::NOT_FOUND, "not found");
        let json = serde_json::to_string(&response).expect("serialize");
        assert!(!json.contains("\"data\""));
        assert!(json.contains("\"success\":false"));
    }

    #[test]
    fn a014_api_error_details_omitted_when_none() {
        let response: ApiResponse<()> = ApiResponse::error(error_codes::NOT_FOUND, "missing");
        let json = serde_json::to_string(&response).expect("serialize");
        assert!(!json.contains("\"details\""));
    }
}
