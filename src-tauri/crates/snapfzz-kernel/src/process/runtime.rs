use std::process::Stdio;

#[derive(Default)]
pub struct RuntimeState {
    pub child: Option<tokio::process::Child>,
    pub child_pid: Option<u32>,
}

impl RuntimeState {
    pub fn new() -> Self {
        Self::default()
    }
}

pub fn piped_stdio() -> Stdio {
    Stdio::piped()
}
