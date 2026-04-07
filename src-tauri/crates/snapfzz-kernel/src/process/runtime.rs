use std::collections::HashMap;
use std::process::Stdio;

pub struct ChildState {
    pub child: tokio::process::Child,
    pub pid: u32,
}

#[derive(Default)]
pub struct RuntimeState {
    pub children: HashMap<String, ChildState>,
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
    fn a014_process_runtime_new_starts_without_children() {
        let state = RuntimeState::new();
        assert!(state.children.is_empty());
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
