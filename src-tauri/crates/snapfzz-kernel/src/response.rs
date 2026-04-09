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
}
