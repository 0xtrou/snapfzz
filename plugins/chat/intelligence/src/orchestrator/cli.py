"""Orchestrator CLI — production entry point.

Usage:
    orchestrator app --host 127.0.0.1 --port 9150
    orchestrator app --host 0.0.0.0 --port 9150 --log-level info

Started by Snapfzz PluginProcessFactory as a managed child process.
"""

import argparse
import sys


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="orchestrator",
        description="Snapfzz Intelligence Orchestrator",
    )
    sub = parser.add_subparsers(dest="command")

    # orchestrator app
    app_parser = sub.add_parser("app", help="Start the orchestrator server")
    app_parser.add_argument("--host", default="127.0.0.1", help="Bind address")
    app_parser.add_argument("--port", type=int, default=9150, help="Bind port")
    app_parser.add_argument(
        "--log-level",
        default="info",
        choices=["debug", "info", "warning", "error"],
        help="Log level",
    )
    app_parser.add_argument(
        "--working-dir",
        default=None,
        help="Agent workspace directory",
    )

    args = parser.parse_args()

    if args.command == "app":
        _run_app(args)
    else:
        parser.print_help()
        sys.exit(1)


def _run_app(args: argparse.Namespace) -> None:
    """Start the FastAPI orchestrator server via uvicorn."""
    import uvicorn

    uvicorn.run(
        "orchestrator.app:create_app",
        factory=True,
        host=args.host,
        port=args.port,
        log_level=args.log_level,
        workers=1,
    )


if __name__ == "__main__":
    main()
