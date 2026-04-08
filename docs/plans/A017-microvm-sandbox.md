# A017 — MicroVM Sandbox

Isolated execution environment for blackbox binaries and untrusted code. Multi-backend capability API — Firecracker microVMs first, room for VZ/HCS/namespace backends. Three layers: sandbox trait (kernel), component download/install (packs), lifecycle management (runtime).

---

## Why

Plugins run inside `~/.snapfzz/plugins/{id}/` with directory isolation and capability checks. This handles trusted JavaScript plugins well.

Blackbox binaries — user-provided executables, pip/conda packages, arbitrary user scripts — need stronger isolation. They run on the host process level, can escape directory boundaries, and access system-wide resources.

The solution: each untrusted workload runs inside its own hardware-isolated microVM. No access to host filesystem beyond what's explicitly mounted. No network unless explicitly granted. Kill the VM = SIGKILL the hypervisor process + kernel reclaims everything.

```
Host process (Rust/Tokio)          Sandbox VM                     Inside VM
┌──────────────────────────┐       ┌──────────────────────────┐   ┌─────────────────┐
│ ProcessManager           │       │ Firecracker (child proc)  │   │                 │
│   ├── spawn()            │──IPC──│  ├── KVM/nitro (hardware) │   │ Blackbox binary │
│   ├── kill()             │       │  ├── 512MB rootfs.ext4    │   │ Isolated        │
│   ├── collect_artifacts()│       │  ├── vsock (host↔guest)   │   │ 802.11 = off    │
│   └── health()           │       │  └── SIGKILL = dead       │   │ Exit code → host│
└──────────────────────────┘       └──────────────────────────┘   └─────────────────┘
```

---

## Architecture

> See [ARCHITECTURE.md](../../ARCHITECTURE.md) for the current system architecture.
> See [A014 — Kernel Architecture](A014-kernel-architecture.md) for kernel crate boundaries.
> See [A016 — Runtime Architecture](A016-runtime-architecture.md) for the Runtime trait pattern.

This spec extends three crates along existing boundaries:

| Crate | New Layer | Pattern |
|---|---|---|
| `snapfzz-kernel` | `SandboxBackend` trait + `SandboxConfig` | Follows `SystemComponent` / `Runtime` trait style |
| `snapfzz-packs` | `FirecrackerPack` (binary + kernel + rootfs) | Follows `CefPackComponent` / `UvComponent` pattern |
| `snapfzz-runtime` | `MicrovmRuntime` (spawn, configure, kill, snapshot) | Follows `AgentScopeRuntime` pattern |

```
snapfzz-kernel    → SandboxBackend trait, SandboxConfig, WorkDirDiff, NetworkPolicy
snapfzz-packs     → FirecrackerPack: download/cache firecracker.bin + vmlinux + rootfs.ext4
snapfzz-runtime   → MicrovmRuntime: lifecycle (spawn→configure→start→monitor→kill→snapshot)
```

---

## 1. Sandboxing Philosophy

### Why MicroVMs (Not Containers)

Containers share the host kernel. They break on P1 (right from the beginning — kernel patches require rewrites) and P3 (sell infrastructure — containers create lock-in to one OS).

MicroVMs provide hardware-level isolation. Each VM boots its own kernel. Escape from a microVM means escaping the hypervisor — a significantly harder problem than container escape.

| | Container (Docker) | Namespace (Linux) | MicroVM (Firecracker) |
|---|---|---|---|
| Kernel isolation | Shared | Shared | **Separate kernel per VM** |
| Escape surface | Container runtime bug | Namespace escape | **Hypervisor bug (much harder)** |
| Cross-platform | Linux only | Linux only | **Hypervisor per OS** |
| Memory overhead | ~100MB | ~0MB | **~5MiB per VM** |
| Boot time | ~1-5s | ~10ms | **~125ms** |
| Network control | iptables | iptables | **Host-level nftables** |

### Three-Layer Defense

```
Layer 1: Rust Process Boundary (snapfzz-kernel)
  └── tokio::process::Command → SIGKILL always works
  └── Kernel reclaims all VM resources on process death
  └── vsock for host↔guest IPC (no NIC needed for control)

Layer 2: Hypervisor Isolation (Firecracker)
  └── KVM (Linux) / Apple Hypervisor.framework (macOS) / HCS (Windows)
  └── Each VM has separate kernel, memory, devices
  └── No network interface = no network access (hardware-level)

Layer 3: Jailer Enrichment (Firecracker-specific, Linux only)
  └── chroot into /firecracker/rootfs
  └── seccomp-bpf filter (120+ syscalls blocked)
  └── Cgroup memory limits + cgroup v2 namespace
  └── Dedicated network namespace per VM
```

### Why Not Unikernels

Unikernels compile one binary + kernel. They are fast but have no general-purpose filesystem, no standard tooling, and cannot run blackbox binaries. They serve a different use case.

### Capability Contract (Frontier)

The `SandboxBackend` trait abstracts over backends at the **capability level**, not the **isolation level**:

```
All backends provide:
  ✓ Spawn process with working directory
  ✓ Set environment variables
  ✓ Block/allow network access
  ✓ Read stdout/stderr
  ✓ Collect exit status
  ✓ Collect artifacts (exit code, stdout, stderr, files)

Backend-specific details:
  Linux   → Firecracker + KVM (hardware isolation)
  macOS   → Apple Virtualization.framework (hardware isolation)
  Windows → HCS utility VM or Hyper-V (hardware isolation)
```

Each backend uses its native hypervisor. The trait guarantees the same capabilities. This is "sell infrastructure" — users get better isolation on their native OS.

**Do not try to unify at the isolation primitive level.** You cannot abstract away the difference between KVM, Hypervisor.framework, and HCS. You can abstract above them.

---

## 2. Sandbox Backend Trait

All sandbox backends implement this trait. Firecracker is the first implementation. VZ/HCS/namespace backends can be added later.

### snapfzz-kernel

```
src-tauri/crates/snapfzz-kernel/
├── src/
│   ├── sandbox/
│   │   ├── mod.rs          (SandboxBackend trait, SandboxConfig, SandboxedError)
│   │   ├── config.rs       (SandboxConfig, NetworkPolicy, WorkDirSpec)
│   │   ├── artifact.rs     (WorkDirDiff, Artifact, ExitInfo)
│   │   └── firecracker/    (future: FirecrackerBackend impl lives here if needed)
```

### SandboxBackend trait

```rust
#[async_trait::async_trait]
pub trait SandboxBackend: Send + Sync {
    /// Create and configure a new sandbox instance.
    /// Does not start the VM. Call start() separately.
    async fn create(config: &SandboxConfig) -> Result<Self, SandboxedError>
    where
        Self: Sized;

    /// Start the sandbox. Spawns the hypervisor process, waits for readiness.
    async fn start(&mut self) -> Result<(), SandboxedError>;

    /// Execute a command inside the sandbox.
    /// Returns ExitInfo with status, stdout, stderr, duration.
    async fn exec(&mut self, cmd: &SandboxCommand) -> Result<ExitInfo, SandboxedError>;

    /// Copy a file from host into the sandbox's working directory.
    async fn copy_in(&mut self, source: &Path, dest_path: &str) -> Result<(), SandboxedError>;

    /// Copy a file from the sandbox's working directory to host.
    async fn copy_out(&mut self, source_path: &str, dest: &Path) -> Result<(), SandboxedError>;

    /// Signal the sandbox (SIGTERM, SIGKILL, SIGINT).
    async fn signal(&mut self, signal: SandboxSignal) -> Result<(), SandboxedError>;

    /// Kill the sandbox immediately (SIGKILL the hypervisor process).
    async fn kill(&mut self) -> Result<(), SandboxedError>;

    /// Wait for the sandbox to exit naturally.
    async fn wait(&mut self) -> Result<ExitInfo, SandboxedError>;

    /// Collect all artifacts from the sandbox's working directory.
    async fn collect_artifacts(&mut self) -> Result<WorkDirDiff, SandboxedError>;

    /// Check if the sandbox is still running.
    fn is_running(&self) -> bool;

    /// Optional: save VM state snapshot.
    async fn save_snapshot(&mut self, path: &Path) -> Result<(), SandboxedError>;

    /// Optional: restore from snapshot (warm start).
    async fn load_snapshot(&mut self, snapshot_path: &Path) -> Result<(), SandboxedError>;
}
```

### SandboxConfig

```rust
#[derive(Debug, Clone)]
pub struct SandboxConfig {
    /// Unique identifier for this sandbox instance.
    pub sandbox_id: String,

    /// Working directory spec — files available inside the sandbox.
    pub workdir: WorkDirSpec,

    /// Network access policy.
    pub network: NetworkPolicy,

    /// Environment variables to set inside the sandbox.
    pub env_vars: HashMap<String, String>,

    /// Resource limits.
    pub limits: SandboxLimits,

    /// Timeout for the sandbox execution.
    pub timeout: Option<Duration>,

    /// Path to the base rootfs image.
    pub base_rootfs: PathBuf,

    /// Path to the kernel binary.
    pub kernel_path: PathBuf,

    /// Number of vCPUs (default: 1).
    pub vcpu_count: u8,

    /// Memory size in MB (default: 512).
    pub memory_mb: u16,

    /// Enable vsock for host↔guest IPC.
    pub enable_vsock: bool,
}

#[derive(Debug, Clone)]
pub enum WorkDirSpec {
    /// Start from empty, populate via copy_in().
    Empty,
    /// Copy this directory into the sandbox at boot.
    /// Copied into a new rootfs block device — no live mount.
    HostDirectory(PathBuf),
}

#[derive(Debug, Clone)]
pub enum NetworkPolicy {
    /// No network interface attached to the VM. Hardware-level block.
    None,
    /// TAP interface with host-side nftables rules.
    Restricted {
        /// Allowed outbound host:port pairs. Empty = deny all except DNS.
        allowed: Vec<NetworkRule>,
    },
    /// Full network access (development mode only).
    Unrestricted,
}

#[derive(Debug, Clone)]
pub struct NetworkRule {
    pub host: String,
    pub port: Option<u16>,
    pub protocol: NetworkProtocol,
}

#[derive(Debug, Clone, PartialEq)]
pub enum NetworkProtocol {
    Tcp,
    Udp,
    Any,
}

#[derive(Debug, Clone)]
pub struct SandboxLimits {
    /// Max memory in MB.
    pub max_memory_mb: u16,
    /// Max disk I/O bytes per second.
    pub max_disk_io_bps: Option<u64>,
    /// Max execution time.
    pub max_execution_time: Option<Duration>,
}
```

### Auxiliary Types

```rust
#[derive(Debug, Clone, PartialEq)]
pub enum SandboxSignal {
    Term,
    Kill,
    Int,
}

#[derive(Debug, Clone)]
pub struct SandboxCommand {
    pub args: Vec<String>,
    pub env: HashMap<String, String>,
    pub working_dir: Option<String>,
    pub timeout: Option<Duration>,
}

#[derive(Debug, Clone)]
pub struct ExitInfo {
    pub exit_code: Option<i32>,
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
    pub duration: Duration,
    pub killed: bool,
    pub oom_killed: bool,
    pub timeout: bool,
}

#[derive(Debug, Clone)]
pub struct WorkDirDiff {
    /// Files that exist in the sandbox's working directory.
    pub files: Vec<Artifact>,
    /// Total size of all artifacts.
    pub total_size_bytes: u64,
}

#[derive(Debug, Clone)]
pub struct Artifact {
    pub path: String,
    pub size: u64,
    pub content_hash: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum SandboxedError {
    #[error("sandbox '{0}' failed: {1}")]
    SpawnFailed(String, String),
    #[error("sandbox '{0}' execution timeout")]
    Timeout(String),
    #[error("sandbox '{0}' killed by OOM")]
    OutOfMemory(String),
    #[error("sandbox '{0}' was killed")]
    Killed(String),
    #[error("network config error: {0}")]
    NetworkConfig(String),
    #[error("artifact collection failed: {0}")]
    ArtifactError(String),
    #[error("internal error: {0}")]
    Internal(String),
}
```

---

## 3. Process Budget Integration

`ProcessLocation` in `budget/supervised.rs` extends to track microVM placement:

```rust
// Existing (line 12-15):
pub enum ProcessLocation {
    Local,
    Cloud { endpoint: String },
}

// Add:
pub enum ProcessLocation {
    Local,
    Cloud { endpoint: String },
    Microvm { vm_id: String },  // NEW — supervised budget tracks via vm_id
}
```

A sandboxed process registers with `ProcessLocation::Microvm { vm_id }`. The budget system tracks it alongside regular processes:

```
ProcessBudget for microVM:
  ├── owner: "sandbox.{sandbox_id}"
  ├── max_memory_mb: 512  (from SandboxLimits)
  ├── location: Microvm { vm_id: "vm_abc123" }
  ├── health_url: "vsock://{vm_id}/health"  (or internal check)
  └── status: Starting → Online → Offline
```

---

## 4. Firecracker Pack

`FirecrackerPack` downloads and caches the three components needed to run Firecracker:

1. **Firecracker binary** — the VMM process, spawned as child of snapfzz-kernel
2. **Linux kernel (vmlinux)** — used to boot every microVM guest
3. **Base rootfs (rootfs.ext4)** — minimal Alpine/ext4 image with Python3 + SSH + working dir

### snapfzz-packs

```
src-tauri/crates/snapfzz-packs/
├── src/
│   ├── firecracker.rs      (FirecrackerPack component)
│   └── kernel_asset.rs     (optional: prebuilt vmlinux download)
```

### Cross-Platform Installation

| Platform | Hypervisor | Components to Download | Installation Path |
|---|---|---|---|
| **Linux** | KVM + Firecracker native | firecracker binary, vmlinux, rootfs.ext4 | `~/.snapfzz/runtime/sandbox/firecracker/{platform}/` |
| **macOS** | Apple Hypervisor.framework | firecracker (via Lima/UTM nested) OR VZ direct backend | `~/.snapfzz/runtime/sandbox/firecracker/{platform}/` |
| **Windows** | HCS (Hyper-V / WSL2) | firecracker (in WSL2) OR HCS util VM | `~/.snapfzz/runtime/sandbox/firecracker/{platform}/` |

### Linux (Primary — Native Support)

```
Firecracker runs directly on host. Requires:
  ✓ KVM device (/dev/kvm) with read-write permissions
  ✓ x86_64 or aarch64 architecture
  ✓ Kernel 5.10+ with KVM enabled
  ✓ No additional binaries required for isolation

Download:
  ✓ Firecracker release binary (~20MB) from GitHub releases
  ✓ vmlinux kernel (~15MB) pre-built or compile from source
  ✓ rootfs.ext4 (~50MB) pre-built from Alpine base
```

**Installation flow:**

1. Check `/dev/kvm` exists and is accessible
2. Download `firecracker-{version}-{arch}` from `https://github.com/firecracker-microvm/firecracker/releases`
3. Place in `~/.snapfzz/runtime/bin/firecracker`
4. Download or compile `vmlinux` → `~/.snapfzz/runtime/sandbox/kernels/vmlinux-{platform}`
5. Create `rootfs.ext4` → `~/.snapfzz/runtime/sandbox/rootfs/base-alpine.ext4`
6. Verify checksums
7. Mark as installed

### macOS (Nested or Alternative Backend)

Firecracker does not run natively on macOS. Two approaches:

**Approach A — Nested Linux VM (simpler but heavier)**
1. Download UTM/Lima minimal Linux VM (~500MB)
2. Boot nested Linux VM with Hypervisor.framework
3. Run Firecracker inside that VM
4. Host communicates via vsock through the nested VM

**Approach B — Apple Virtualization.framework directly (better but backend-specific)**
1. Use `vz` crate to create VMs via Apple virtualization
2. Runs Linux guests directly on macOS hardware
3. Different API from Firecracker — same `SandboxBackend` trait, different implementation

**Recommended:** Start with Approach A (nested). Add Approach B when macOS performance becomes a priority. Both behind the same `SandboxBackend` trait — capability contract doesn't change.

### Windows (Nested or HCS)

Similar to macOS:

**Approach A — WSL2 (simpler)**
1. Install WSL2 if not present
2. Run Firecracker inside WSL2 Linux kernel
3. Host communicates via WSL2 interop

**Approach B — HCS Utility VM (native but different API)**
1. Use `hcsshim` to create Windows utility VMs
2. Process isolation via Hyper-V
3. Different API from Firecracker

**Recommended:** Start with Approach A (WSL2). Add Approach B for native isolation.

### FirecrackerPack Component

```rust
pub struct FirecrackerPack {
    install_dir: PathBuf,        // ~/.snapfzz/runtime/sandbox/firecracker/
    platform: PlatformInfo,
    cancelled: Arc<AtomicBool>,
    cached_version: Mutex<Option<String>>,
}

impl FirecrackerPack {
    pub fn new(data_dir: PathBuf, platform: PlatformInfo) -> Self { ... }
}

#[async_trait::async_trait]
impl SystemComponent for FirecrackerPack {
    fn id(&self) -> &str { "firecracker" }
    fn name(&self) -> &str { "Firecracker MicroVM Sandbox" }
    fn install_dir(&self) -> &Path { &self.install_dir }

    async fn resolve(&self) -> Result<ComponentInfo, ComponentError> {
        let firecracker_bin = self.install_dir.join("bin").join("firecracker");
        let version = self.get_version().await?;
        Ok(ComponentInfo {
            id: "firecracker".into(),
            name: "Firecracker MicroVM Sandbox".into(),
            description: "Hardware-isolated VMs for untrusted code execution".into(),
            license: "Apache-2.0".into(),
            version,
            platform: self.platform.platform.clone(),
            platform_display: self.platform.display.to_string(),
            download_url: format!(
                "https://github.com/firecracker-microvm/firecracker/releases/download/v{}/firecracker-{}-{arch}",
                LATEST_FC_VERSION, self.platform.os, arch = self.platform.arch
            ),
            install_path: self.install_dir.to_string_lossy().into(),
            size: FC_TOTAL_SIZE_BYTES,
            checksum: FC_CHECKSUM.into(),
            checksum_algorithm: "sha256".into(),
            is_installed: self.is_installed(),
        })
    }

    async fn download(&self) -> Result<Vec<DownloadProgress>, ComponentError> {
        // Phase 1: Download firecracker binary
        let firecracker_bin = self.install_dir.join("bin").join("firecracker");
        download_file(FC_RELEASE_URL, &firecracker_bin, &progress_tx).await?;

        // Phase 2: Download pre-built vmlinux kernel
        let kernel_dir = self.install_dir.join("kernels");
        let vmlinux = kernel_dir.join(format!("vmlinux-{}", self.platform.platform));
        download_file(VMLINUX_URL, &vmlinux, &progress_tx).await?;

        // Phase 3: Create rootfs.ext4 (download or build)
        let rootfs_dir = self.install_dir.join("rootfs");
        let rootfs = rootfs_dir.join("base-alpine.ext4");
        download_file(ROOTFS_URL, &rootfs, &progress_tx).await?;

        // Phase 4: Verify checksums
        self.verify().await?;

        Ok(vec![])
    }

    async fn verify(&self) -> Result<String, ComponentError> {
        // Verify firecracker binary checksum
        verify_sha256(&self.install_dir.join("bin").join("firecracker"), FC_SHA256)?;
        // Verify vmlinux checksum
        // Verify rootfs.ext4 checksum

        // Test run: start firecracker with --api-timeout 1s, verify it starts
        Ok(self.get_version().await?)
    }

    async fn uninstall(&self) -> Result<(), ComponentError> {
        Ok(std::fs::remove_dir_all(&self.install_dir)?)
    }
}
```

---

## 5. MicroVM Runtime

`MicrovmRuntime` manages the full lifecycle of a Firecracker microVM — spawn, configure, start, monitor, kill, snapshot.

### snapfzz-runtime

```
src-tauri/crates/snapfzz-runtime/
├── src/
│   ├── sandbox/
│   │   ├── mod.rs           (SandboxManager — orchestrates all sandboxes)
│   │   ├── firecracker.rs   (FirecrackerBackend impl of SandboxBackend)
│   │   └── config.rs        (Sandbox runtime config helpers)
```

### MicroVM Lifecycle (Firecracker Backend)

```
1. Create
   ├── Generate unique vm_id
   ├── Allocate memory (512MB default)
   ├── Create socket path: ~/.snapfzz/runtime/sandbox/sockets/{vm_id}.sock
   ├── Create jailer root: ~/.snapfzz/runtime/sandbox/jails/{vm_id}/

2. Configure (via REST API to socket)
   ├── PUT /boot-source
   │   ├── kernel_image_path: {install_dir}/kernels/vmlinux-{platform}
   │   └── boot_args: "console=ttyS0 reboot=k panic=1 pci=off"
   ├── PUT /drives/rootfs
   │   ├── path_on_host: {jail_root}/rootfs.ext4 (copy of base + workdir)
   │   ├── is_root_device: true
   │   └── is_read_only: false
   ├── PUT /vsock (optional)
   │   ├── guest_cid: 3
   │   └── uds_path: {socket_dir}/{vm_id}.vsock
   ├── PUT /network-interfaces (if network != None)
   │   ├── iface_id: eth0
   │   ├── host_dev_name: tap0-{vm_id}
   │   └── guest_mac: AA:FC:00:00:00:01
   └── PUT /actions (with action_type: InstanceStart)

3. Monitor
   ├── Watch child process (firecracker --api-sock {socket_path})
   ├── Stream stdout/stderr from child process
   ├── Optionally poll vsock health endpoint
   └── Track memory via ProcessBudget

4. Kill
   ├── SIGKILL to firecracker process (always works)
   ├── Clean up TAP interface (if created)
   ├── Remove jail directory
   ├── Remove socket file
   └── Update ProcessBudget status → Offline
```

### FirecrackerBackend Implementation

```rust
pub struct FirecrackerBackend {
    vm_id: String,
    child: Option<Child>,
    socket_path: PathBuf,
    tap_interface: Option<String>,
    config: SandboxConfig,
    firecracker_bin: PathBuf,
    jail_root: PathBuf,
    http_client: reqwest::Client,  // for REST API calls to socket
    started_at: Option<Instant>,
    status: RwLock<SandboxStatus>,
}

impl FirecrackerBackend {
    /// Build the JSON config for this VM.
    fn build_vm_config(&self) -> FirecrackerVmConfig { ... }

    /// Configure VM via REST API before starting.
    async fn configure(&self) -> Result<(), SandboxedError> {
        // PUT /boot-source
        self.put_boot_source().await?;
        // PUT /drives/rootfs
        self.put_rootfs_drive().await?;
        // PUT /vsock (if enabled)
        if self.config.enable_vsock {
            self.put_vsock().await?;
        }
        // PUT /network-interfaces (if network != None)
        if !matches!(self.config.network, NetworkPolicy::None) {
            self.put_network_interface().await?;
        }
        // PUT /machine-config
        self.put_machine_config().await?;
        Ok(())
    }

    /// Start the VM (send InstanceStart action).
    async fn start_vm(&mut self) -> Result<(), SandboxedError> {
        let response = self.http_client
            .put(format!("http://localhost/actions"))
            .json(&serde_json::json!({"action_type": "InstanceStart"}))
            .send()
            .await?;
        if !response.status().is_success() {
            return Err(SandboxedError::SpawnFailed(self.vm_id.clone(),
                format!("InstanceStart failed: {}", response.text().await?)));
        }
        self.started_at = Some(Instant::now());
        Ok(())
    }

    /// Create a TAP interface and attach it to the VM.
    async fn setup_network(&self) -> Result<String, SandboxedError> {
        let tap_name = format!("tap0-{}", &self.vm_id[..8]);
        // ip tuntap add {tap_name} mode tap
        // ip link set {tap_name} up
        // Apply nftables rules based on NetworkPolicy
        Ok(tap_name)
    }

    /// Collect stdout/stderr from the child's pipes.
    async fn collect_logs(&mut self) -> Result<(Vec<u8>, Vec<u8>), SandboxedError> { ... }
}

#[async_trait::async_trait]
impl SandboxBackend for FirecrackerBackend {
    async fn create(config: &SandboxConfig) -> Result<Self, SandboxedError> { ... }
    async fn start(&mut self) -> Result<(), SandboxedError> {
        self.configure().await?;
        self.start_vm().await?;
        Ok(())
    }
    async fn exec(&mut self, command: &SandboxCommand) -> Result<ExitInfo, SandboxedError> {
        // Send command via vsock or ssh into the running VM
        // Wait for completion, collect output
    }
    async fn copy_in(&mut self, source: &Path, dest: &str) -> Result<(), SandboxedError> {
        // Copy file into rootfs before VM starts,
        // OR send via vsock if VM is running
    }
    async fn copy_out(&mut self, source: &str, dest: &Path) -> Result<(), SandboxedError> {
        // Extract from rootfs (mount loopback + cp),
        // OR receive via vsock if VM is running
    }
    async fn signal(&mut self, signal: SandboxSignal) -> Result<(), SandboxedError> { ... }
    async fn kill(&mut self) -> Result<(), SandboxedError> {
        if let Some(mut child) = self.child.take() {
            child.kill().await?;
            child.wait().await?;
            self.cleanup_resources().await?;
        }
        Ok(())
    }
    async fn wait(&mut self) -> Result<ExitInfo, SandboxedError> {
        if let Some(ref mut child) = self.child {
            let status = child.wait().await?;
            self.collect_logs().await
        } else { Err(SandboxedError::Internal("no child".into())) }
    }
    async fn collect_artifacts(&mut self) -> Result<WorkDirDiff, SandboxedError> { ... }
    fn is_running(&self) -> bool { ... }
    async fn save_snapshot(&mut self, path: &Path) -> Result<(), SandboxedError> {
        // PUT /snapshot/create → PUT /vm/pause → copy memory file + state file
    }
    async fn load_snapshot(&mut self, path: &Path) -> Result<(), SandboxedError> {
        // PUT /snapshot/load → PUT /vm/resume
    }
}
```

### SandboxManager

Follows the `RuntimeManager` pattern from A016:

```rust
pub struct SandboxManager {
    sandboxes: RwLock<HashMap<String, Arc<Mutex<dyn SandboxBackend>>>>,
    firecracker_bin: PathBuf,
    kernel_path: PathBuf,
    rootfs_path: PathBuf,
    sockets_dir: PathBuf,
    jails_dir: PathBuf,
}

impl SandboxManager {
    pub fn new(runtime_dir: &Path) -> Result<Self, SandboxedError>;
    pub fn create_sandbox(&self, config: SandboxConfig) -> Result<String, SandboxedError>;
    pub async fn start_sandbox(&self, sandbox_id: &str) -> Result<(), SandboxedError>;
    pub async fn exec_in(&self, sandbox_id: &str, command: &SandboxCommand) -> Result<ExitInfo, SandboxedError>;
    pub async fn kill_sandbox(&self, sandbox_id: &str) -> Result<(), SandboxedError>;
    pub async fn list_sandboxes(&self) -> Vec<SandboxInfo>;
    pub async fn collect_artifacts(&self, sandbox_id: &str) -> Result<WorkDirDiff, SandboxedError>;
    async fn cleanup_sandbox(&self, sandbox_id: &str);
}

/// Runtime status for sandbox (follows RuntimeStatus convention from A016).
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum SandboxStatus {
    NotInstalled,         // Firecracker binary/kernel/rootfs not present
    Created,              // Sandbox configured but not started
    Starting,             // VM boot in progress
    Running,              // InstanceStart succeeded, VM is alive
    Paused,               // VM paused (snapshot preparation)
    Stopped,              // VM exited cleanly
    Crashed(String),      // Unexpected termination
    Killed,               // Explicitly killed by user/system
}
```

---

## 6. Execution Mode

The sandbox supports two execution modes, matching how agents actually run:

### Mode 1: Command Execution (exec)

Synchronous or short-lived execution. Spawn → run command → collect output → kill.

```
ProcessManager.spawn()
  → SandboxBackend::create(config)
  → SandboxBackend::start()
  → SandboxBackend::exec(command)
  → collect artifacts
  → SandboxBackend::kill()
```

### Mode 2: Persistent Sandbox (server)

Long-running sandbox with vsock for IPC. The sandbox acts as a persistent execution environment.

```
ProcessManager.spawn()
  → SandboxBackend::create(config)
  → SandboxBackend::start()
  → vsock IPC channel established
  → Multiple commands sent over time via vsock
  → ProcessManager.kill() → SandboxBackend::kill()
```

The `exec()` method supports both:

```rust
// Short-lived: command runs, VM exits, artifacts collected
let info = sandbox.exec(&SandboxCommand {
    args: vec!["python", "script.py"],
    ..
}).await?;

// Persistent: command runs inside running VM, returns output, VM stays alive
sandbox.exec(&SandboxCommand {
    args: vec!["agent", "run", "--interactive"],
    ..
}).await?;  // VM keeps running
```

---

## 7. Network Architecture

### Host-Side Network Setup

Firecracker has no built-in firewall. Network control happens via TAP + host-side nftables:

```
Host                                              Firecracker VM
┌──────────────────────────────┐                  ┌──────────────┐
│  br0 (bridge)               │                  │              │
│  ├── vethA                  │←── TAP0 ────────→│  eth0        │
│  ├── vethB                  │                  │              │
│                              │                  │  vsock CID 3 │
│  nftables rules:            │←── vsock ────────│  (IPC)       │
│    rule 1: allow DNS        │                  │              │
│    rule 2: allow *.api.com  │                  │              │
│    rule 3: drop all others  │                  │              │
└──────────────────────────────┘                  └──────────────┘
```

### Network Policy Enforcement

| Policy | Implementation |
|---|---|
| `None` | No TAP interface created. No NIC in VM config. Physically impossible to transmit. |
| `Restricted { allowed: [...] }` | TAP created. nftables rules applied. Only allowed destinations pass. |
| `Unrestricted` | TAP attached to host bridge. Full host network. Development mode only. |

### Domain Filtering (Host-Side Proxy)

True domain filtering (e.g., "only api.openai.com") requires a DNS/proxy layer on the host:

```
VM (any DNS request) → DNS hijack → Host proxy → Proxy allows/denies based on policy
```

This is out of scope for M0 (basic sandboxing). Track for future work.

---

## 8. Working Directory Mounting

### The Challenge

Firecracker does not support live bind mounts (no virtiofs, no 9p). Block devices are the only way to give a VM persistent storage.

### M0 Approach: Copy to Block Device

1. Take the base `rootfs.ext4` image (pre-built Alpine Linux)
2. Copy the user's working directory into the rootfs:
   ```bash
   # Mount rootfs as loopback
   sudo mount -o loop base-alpine.ext4 /mnt/rootfs

   # Copy working directory into VM
   cp -r /path/to/working-dir/* /mnt/rootfs/home/sandbox/

   # Unmount
   sudo umount /mnt/rootfs
   ```
3. Pass the modified rootfs as the VM's root drive
4. VM boots with working directory pre-populated

### Artifact Collection

After the VM exits:

1. Mount the rootfs again
2. Read files from `/home/sandbox/`
3. Unmount
4. Return as `WorkDirDiff`

### Performance Considerations

- Copy-in happens during sandbox creation (before start)
- Copy-out happens after VM exits
- Not suitable for terabyte-scale data — but fine for agent workloads (MBs)
- Future M1: Use a second data drive (separate ext4) for the working directory — avoids modifying the base rootfs

---

## 9. Tauri Commands

Thin delegates to `SandboxManager`, following the pattern from A014/A016:

```rust
// Sandbox management (thin delegates to SandboxManager)
#[tauri::command]
async fn sandbox_create(config: SandboxConfig, mgr: State<'_, Arc<SandboxManager>>)
    -> Result<String, String>

#[tauri::command]
async fn sandbox_start(id: String, mgr: State<'_, Arc<SandboxManager>>)
    -> Result<(), String>

#[tauri::command]
async fn sandbox_exec(id: String, command: SandboxCommand, mgr: State<'_, Arc<SandboxManager>>)
    -> Result<ExitInfo, String>

#[tauri::command]
async fn sandbox_kill(id: String, mgr: State<'_, Arc<SandboxManager>>)
    -> Result<(), String>

#[tauri::command]
async fn sandbox_list(mgr: State<'_, Arc<SandboxManager>>)
    -> Result<Vec<SandboxInfo>, String>

#[tauri::command]
async fn sandbox_collect_artifacts(id: String, mgr: State<'_, Arc<SandboxManager>>)
    -> Result<WorkDirDiff, String>

// Component install (follows patterns from A016)
#[tauri::command]
async fn sandbox_install_firecracker(pack: State<'_, Arc<FirecrackerPack>>)
    -> Result<(), String>

// Process budget integration (delegates to kernel budget system)
#[tauri::command]
async fn sandbox_set_budget(id: String, limits: SandboxLimits, mgr: State<'_, Arc<SandboxManager>>)
    -> Result<(), String>
```

---

## 10. Directory Convention

```
~/.snapfzz/
├── runtime/
│   └── sandbox/
│       ├── firecracker/           Firecracker component install dir
│       │   ├── bin/
│       │   │   └── firecracker   The VMM binary
│       │   ├── jailer/            (optional) jailer binary
│       │   ├── kernels/
│       │   │   └── vmlinux-{platform}  Guest kernel
│       │   └── rootfs/
│       │       └── base-alpine.ext4    Base filesystem image
│       ├── sockets/              Runtime API sockets
│       │   └── {vm_id}.sock      Firecracker API socket (per VM)
│       ├── jails/                Jailed VM environments
│       │   └── {vm_id}/
│       │       └── rootfs.ext4   Copy of base + working dir
│       ├── tap/                  TAP interfaces (auto-created/cleaned)
│       └── snapshots/            Saved VM snapshots (warm starts)
│           └── {vm_id}/
│               ├── snapshot.vmstate
│               └── snapshot.mem
```

**Hard rules:**
- No sandbox runs outside `~/.snapfzz/runtime/sandbox/`
- Each VM has its own jail directory — no sharing
- TAP interfaces are named and cleaned on VM death
- Snapshots are versioned and idempotent

---

## 11. Integration Points

### ProcessManager Integration

`ProcessManager` in `snapfzz-kernel/src/process/mod.rs` is the primary integration point. The new sandbox layer sits behind it.

```
Current ProcessManager flow:
  └── spawn() → tokio::process::Command → Child process → health check → monitor

Extended flow (with sandboxing):
  └── spawn()
      ├── If local process: tokio::process::Command (existing path)
      └── If sandbox: SandboxManager::create_sandbox() → start() → exec()
          └── Registers ProcessBudget with ProcessLocation::Microvm { vm_id }
```

### Budget Registry Integration

```rust
// When sandbox is created, register a supervised budget:
registry.supervised().register_process(
    &format!("sandbox.{sandbox_id}"),
    ProcessBudget {
        pid: None,               // PID of the firecracker child
        max_memory_mb: 512,      // From SandboxLimits
        health_url: format!("vsock://{vm_id}/health"),
        health_interval_ms: 5000,
        max_health_failures: 3,
        max_restarts: 3,
        location: ProcessLocation::Microvm { vm_id: vm_id.clone() },
        ..
    },
);
```

### Runtime Manager Integration

`RuntimeManager` from A016 manages long-lived services. `SandboxManager` manages short-lived sandboxed executions. They are separate managers with separate concerns:

```
main.rs setup:
  let runtime_mgr = RuntimeManager::new();      // AgentScope, LiteLLM, CEF
  let sandbox_mgr = SandboxManager::new(...);    // MicroVM sandbox

  runtime_mgr.register(agentscope_rt);
  runtime_mgr.register(litellm_rt);
  // ...

  app.manage(Arc::new(runtime_mgr));
  app.manage(Arc::new(sandbox_mgr));
```

### Component Registry Integration

Register `FirecrackerPack` alongside other system components:

```rust
// main.rs component registry setup (extends A016)
registry.register(Arc::new(FirecrackerPack::new(
    runtime_dir.join("sandbox").join("firecracker"),
    detect_platform()?,
)));
```

---

## 12. vsock IPC

vsock (virtual socket) enables host↔guest communication without a network interface.

### Why vsock

- **No NIC required** — VM can have `NetworkPolicy::None` but still communicate with host
- **Secure** — only host and this specific VM can connect (CID isolation)
- **Fast** — shared memory, not packet processing
- **Firecracker-native** — supported via `VMADDR_CID_ANY` and UDS path

### Setup

```rust
// Host side (FirecrackerBackend):
// PUT /vsock { "guest_cid": 3, "uds_path": "/tmp/{vm_id}.vsock" }

// Host connects via:
// UnixStream::connect(format!("/tmp/{vm_id}.vsock"))

// Guest connects via:
// socat VSOCK-CONNECT:3:8000 -  // CID 3, port 8000
```

### IPC Protocol

```
Host → Guest (vsock):
  JSON-RPC over stream
  {"method": "exec", "params": {"cmd": "python", "args": ["run.py"], "cwd": "/home/sandbox"}}

Guest → Host (vsock):
  JSON-RPC responses + events
  {"id": 1, "result": {"exit_code": 0, "stdout": "...", "stderr": "..."}}
```

### Guest Agent (M1)

For bidirectional IPC, the base rootfs needs a lightweight guest agent:

```
/home/sandbox/guest-agent
  └── Listens on vsock port 8000
  └── Receives exec requests from host
  └── Runs command in isolated cgroup
  └── Returns stdout/stderr/exit-code to host
  └── Auto-starts via /etc/init.d/ or systemd
```

M0: Use `firecracker --api-sock` + REST API for control, SSH for exec.
M1: Replace SSH with vsock guest agent for NIC-less operation.

---

## 13. Snapshots

Firecracker supports snapshotting — save VM state to disk and restore later (~5ms warm start vs ~125ms cold boot).

### Save Flow

```
1. PUT /snapshot/create {
       "mem_file_path": "sandbox/snapshots/{vm_id}/snapshot.mem",
       "snapshot_path": "sandbox/snapshots/{vm_id}/snapshot.vmstate"
   }
2. PUT /vm/pause
3. Wait for pause to complete
4. Memory file + state file written to disk
5. PUT /vm/resume (to continue running) OR kill() (to stop)
```

### Load Flow

```
1. Create new VM with same machine config
2. PUT /snapshot/load {
       "mem_backend": { "backend_type": "File", "backend_path": "snapshot.mem" },
       "state_backend": { "backend_type": "File", "backend_path": "snapshot.vmstate" }
   }
3. PUT /vm/resume
4. VM resumes exactly where it left off (~5ms)
```

### Caveats

- Snapshots are NOT portable across different Firecracker versions
- Rootfs must be the same (or snapshot includes disk diff)
- Network state is NOT preserved (need to reconnect TAP)
- vsock connections are broken (need to reconnect)

---

## 14. Security Considerations

### Trust Boundary

```
TRUSTED: snapfzz-kernel (Rust process)
  └── Spawns, configures, kills Firecracker
  └── Has full control over VM lifecycle
  └── Can read/write VM block devices

UNTRUSTED: VM guest (blackbox binary running inside)
  └── Sees only what's in rootfs.ext4
  └── No network (unless explicitly allowed)
  └── Cannot escape hypervisor (KVM/hardware isolation)
  └── Exit code + stdout/stderr only
```

### Key Safety Measures

1. **No VM gets host root access** — each VM's root is its own ext4 image
2. **Firecracker runs unprivileged** — no root required (jailer drops privileges)
3. **TAP interfaces are per-VM** — no interface sharing between sandboxes
4. **vsock is CID-isolated** — VM A cannot connect to VM B's vsock
5. **Snapshots contain no host data** — VM memory only

### Known Limitations (M0)

- [ ] No seccomp-bpf filtering on macOS/Windows (hypervisor-specific)
- [ ] No domain filtering (only host:port rules)
- [ ] Rootfs copy is synchronous (blocks during sandbox creation)
- [ ] Snapshots are not encrypted
- [ ] No rate limiting on API socket access
- [ ] No audit logging (which sandbox accessed what)

---

## 15. Tests

```rust
// A017/Sandbox: SandboxConfig serializes with camelCase
// A017/Sandbox: SandboxConfig with NetworkPolicy::None creates no NIC
// A017/Sandbox: SandboxConfig with WorkDirHost copies dir into rootfs

// A017/Sandbox: ExitInfo captures exit_code, stdout, stderr, duration
// A017/Sandbox: ExitInfo with timeout=true when deadline exceeded
// A017/Sandbox: ExitInfo with oom_killed=true when RSS exceeds limit

// A017/Sandbox: SandboxedError variants cover all failure modes
// A017/Sandbox: SandboxedError::SpawnFailed includes sandbox_id in message

// A017/Firecracker: FirecrackerPack resolves with correct ComponentInfo for linux-x64
// A017/Firecracker: FirecrackerPack resolves with correct ComponentInfo for macos-arm64
// A017/Firecracker: FirecrackerPack download downloads three artifacts (bin, kernel, rootfs)
// A017/Firecracker: FirecrackerPack verify returns sha256 checksum of firecracker binary
// A017/Firecracker: FirecrackerPack uninstall removes install_dir
// A017/Firecracker: FirecrackerPack visible_in_components_list returns true

// A017/Backend: FirecrackerBackend create allocates vm_id and socket path
// A017/Backend: FirecrackerBackend create fails if firecracker_bin not found

// A017/Backend: FirecrackerBackend start configures VM via REST API
// A017/Backend: FirecrackerBackend start fails if KVM not available
// A017/Backend: FirecrackerBackend send_action InstanceStart returns ok
// A017/Backend: FirecrackerBackend send_action with invalid action fails

// A017/Backend: FirecrackerBackend kill sends SIGKILL to child process
// A017/Backend: FirecrackerBackend kill cleans up TAP interface
// A017/Backend: FirecrackerBackend kill cleans up socket file
// A017/Backend: FirecrackerBackend kill returns Ok even if child already dead

// A017/Backend: FirecrackerBackend setup_tap creates interface with vm_id prefix
// A017/Backend: FirecrackerBackend setup_nftables creates rules for NetworkPolicy::Restricted
// A017/Backend: FirecrackerBackend destroy_tap removes interface

// A017/Backend: FirecrackerBackend copy_in modifies rootfs.ext4 with new files
// A017/Backend: FirecrackerBackend copy_out extracts files from rootfs.ext4

// A017/Backend: FirecrackerBackend send_exec_command returns ExitInfo with exit_code 0
// A017/Backend: FirecrackerBackend collect_artifacts returns files from rootfs

// A017/Manager: SandboxManager create_sandbox returns unique id
// A017/Manager: SandboxManager create_sandbox fails with duplicate id
// A017/Manager: SandboxManager start_sandbox starts and registers ProcessBudget
// A017/Manager: SandboxManager kill_sandbox kills and unregisters ProcessBudget
// A017/Manager: SandboxManager list_sandboxes returns all active sandboxes
// A017/Manager: SandboxManager kill_sandbox on dead sandbox returns Ok

// A017/ProcessLocation: ProcessLocation::Microvm { vm_id } serializes correctly
// A017/ProcessLocation: ProcessBudget with Microvm location tracks memory via vm_id
// A017/ProcessLocation: SupervisedBudgets is_memory_exceeded works for Microvm location

// A017/Network: NetworkPolicy::None produces empty nftables rules
// A017/Network: NetworkPolicy::Restricted generates rules for each NetworkRule
// A017/Network: NetworkPolicy::Unrestricted attaches bridge without rules

// A017/Snapshot: FirecrackerBackend save_snapshot creates mem + state files
// A017/Snapshot: FirecrackerBackend load_snapshot restores VM state
// A017/Snapshot: Snapshots directory convention is cleaned up on uninstall
```

---

## 16. Directory Convention

```
src-tauri/crates/snapfzz-kernel/
├── src/
│   ├── sandbox/
│   │   ├── mod.rs        (pub mod config, artifact; SandboxBackend trait)
│   │   ├── config.rs     (SandboxConfig, WorkDirSpec, NetworkPolicy, SandboxLimits)
│   │   └── artifact.rs   (WorkDirDiff, Artifact, ExitInfo, SandboxedError)

src-tauri/crates/snapfzz-packs/
├── src/
│   └── firecracker.rs    (FirecrackerPack: SystemComponent impl)

src-tauri/crates/snapfzz-runtime/
├── src/
│   ├── sandbox/
│   │   ├── mod.rs        (SandboxManager)
│   │   └── firecracker.rs (FirecrackerBackend impl of SandboxBackend)
```

### Runtime directory (at boot):

```
~/.snapfzz/runtime/
└── sandbox/
    ├── firecracker/           Component install (FirecrackerPack)
    ├── sockets/               Runtime API sockets (per-VM)
    ├── jails/                 Jailed VM environments (per-VM)
    ├── tap/                   TAP interfaces (auto-managed)
    └── snapshots/             Saved VM states
```

---

## 17. Dependency Graph

```
snapfzz-kernel/sandbox/   (SandboxBackend trait + types)
    ↑
snapfzz-packs             (FirecrackerPack implements SystemComponent)
    ↑
snapfzz-runtime/sandbox   (SandboxManager + FirecrackerBackend)
    ↑
src-tauri/main.rs         (registers SandboxManager + FirecrackerPack)
    ↑
src-tauri/commands/       (thin sandbox_* commands)
```

```
snapfzz-kernel/sandbox
  ├── async-trait
  ├── tokio (process::Command)
  ├── serde / serde_json
  ├── tokio-vsock (for vsock IPC)
  ├── thiserror
  ├── reqwest (for Firecracker REST API)
  └── tempfile (dev-dependency, tests)

snapfzz-packs
  └── snapfzz-kernel (SystemComponent trait)
  ├── tokio (for download)
  ├── sha2 (for checksum verification)
  └── flate2 / tar (for rootfs extraction, if needed)

snapfzz-runtime/sandbox
  ├── snapfzz-kernel/sandbox/ (SandboxBackend trait)
  ├── snapfzz-kernel/budget/ (register_process for ProcessBudget)
  ├── tokio (process + io)
  ├── reqwest (for Firecracker REST API via Unix socket)
  ├── serde_json (for REST API payloads)
  ├── nix or libc (for TAP creation, nftables, signal handling)
  └── sha2 (for artifact hashes)
```

New dependency justifications:

| Crate | Why needed? | Alternative? |
|---|---|---|
| `tokio-vsock` | vsock IPC for host↔guest communication | Could use Unix sockets only, but vsock provides CID isolation |
| `nix` | TAP interface creation, signal sending, nftables | Raw libc works but nix is safer |

---

## 18. Cross-Platform Summary

### Linux (Primary)

```
Architecture: x86_64 or aarch64
Hypervisor: KVM (kernel module, always available on modern kernels)
Firecracker: Native binary, no VM nesting needed
Networking: TAP + nftables (direct host control)
Jailer: chroot + seccomp + cgroups + network namespace
```

**Prerequisites:**
- `/dev/kvm` accessible (usually requires user in `kvm` group)
- Kernel 5.10+ with `CONFIG_KVM` enabled
- `nftables` for network rules

### macOS

```
Architecture: aarch64 (Apple Silicon) or x86_64 (Intel)
Hypervisor: Hypervisor.framework (built-in, no install needed)
Firecracker: NOT native — runs inside a nested Linux VM
Approach A: UTM/Lima minimal VM with Firecracker inside
  - Host → Hypervisor.framework → Linux VM → Firecracker → Nested microVM
  - Adds ~1s latency for nested VM startup
Approach B: Apple Virtualization.framework directly
  - Host → vz crate → Linux guest microVM
  - No nesting, better performance
  - Completely different API (separate Backend impl)
Networking: macOS does not support TAP creation easily. NAT through nested VM.
```

**Prerequisites (Approach A):**
- UTM or Lima app installed
- Linux VM image pre-downloaded (~500MB)
- Firecracker pre-installed in the nested VM

**Prerequisites (Approach B):**
- macOS 13.0+ (for full VZ support)
- IPSW image for Linux guest (~500MB, auto-downloaded)

### Windows

```
Architecture: x86_64 (primary), aarch64 (Windows on ARM)
Hypervisor: Hyper-V / WSL2
Firecracker: NOT native — runs inside WSL2 Linux
Approach A: WSL2 with Firecracker
  - Host → WSL2 → Firecracker → microVM
  - Requires Hyper-V platform enabled
Approach B: HCS (Host Compute System)
  - Host → hcsshim (Go) → utility VM
  - Native Windows isolation
  - Completely different API
Networking: NAT through WSL2 virtual switch (Approach A)
```

**Prerequisites (Approach A):**
- WSL2 installed with Linux distro
- Firecracker compiled/downloaded inside WSL2
- `/dev/kvm` available (WSL2 supports nested virtualization)

### Fallback: No Hypervisor Available

If no hypervisor is available (old kernel, nested virtualization blocked, etc.):

```
FALLBACK: Process sandboxing (namespace-level isolation)
  ├── Linux: unshare(CLONE_NEWPID|NEWNET|NEWNS)
  ├── macOS: seatbelt profile (seatbelt -t default)
  └── Windows: JobObject + integrity level
```

This is NOT hardware-isolated. It is a degraded mode with reduced security. The `SandboxBackend` trait still works — the isolation primitive changes.

---

## 19. Verification Criteria

```
1. cargo check — 0 warnings, 0 errors
2. cargo test — all existing tests pass (103+)
3. cargo test -p snapfzz-kernel --lib — sandbox/config + sandbox/artifact tests pass
4. cargo test -p snapfzz-packs --lib — FirecrackerPack resolve/verify/uninstall tests pass
5. cargo test -p snapfzz-runtime --lib — SandboxManager lifecycle tests pass
6. Platform detection: detect_platform includes sandbox support check (checks /dev/kvm on Linux)
7. SandboxConfig with NetworkPolicy::None produces correct Firecracker JSON (no NIC)
8. SandboxConfig with Restricted policy produces TAP + nftables rules
9. FirecrackerPack downloads 3 artifacts: bin + vmlinux + rootfs.ext4
10. All sandbox paths are under ~/.snapfzz/runtime/sandbox/
11. SandboxManager registers/deregisters ProcessBudget with ProcessLocation::Microvm
```

---

## 20. Hard Rules

- No compute on main thread — all sandbox operations use tokio async
- No feature code in core — sandbox is pure infrastructure
- No cross-sandbox imports — FirecrackerBackend stays in Runtime, trait stays in Kernel
- No API keys in sandbox directories — env vars are set per-execution, not stored
- No shared state between sandbox instances
- No live bind mounts to host filesystem (copy into block device only)
- No network by default — NetworkPolicy::None is the safe default
- TAP interfaces are always cleaned up on sandbox death
- Socket files are always deleted after sandbox exits
- No snapshot across Firecracker versions (snapshots are version-locked)
- Never run microVMs as root — Firecracker jailer drops privileges
