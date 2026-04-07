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

#[cfg(test)]
mod tests {
    use super::{piped_stdio, RuntimeState};

    #[test]
    fn a014_process_runtime_new_starts_without_child_or_pid() {
        let state = RuntimeState::new();
        assert!(state.child.is_none());
        assert!(state.child_pid.is_none());
    }

    #[test]
    fn a014_process_runtime_piped_stdio_is_usable_for_command_stdout() {
        let mut child = std::process::Command::new("sh")
            .arg("-c")
            .arg("printf runtime-ok")
            .stdout(piped_stdio())
            .spawn()
            .expect("spawn command with piped stdout");

        let mut output = String::new();
        let mut stdout = child.stdout.take().expect("stdout should be piped");
        use std::io::Read;
        stdout
            .read_to_string(&mut output)
            .expect("read stdout bytes");

        let status = child.wait().expect("wait for child status");
        assert!(status.success());
        assert_eq!(output, "runtime-ok");
    }
}
