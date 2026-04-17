# -*- coding: utf-8 -*-
"""Orchestrator CLI — production entry point.

Per A013/C1: Thin launcher that bridges uvicorn to build_app().
Env defaults are read before app construction so that QWENPAW_WORKING_DIR
is set before QwenPaw's constant module resolves WORKING_DIR.

Usage:
    orchestrator app --host 127.0.0.1 --port 9150
    orchestrator app --host 0.0.0.0 --port 9150 --log-level info

Started by Snapfzz PluginProcessFactory as a managed child process.
"""
from __future__ import annotations

import argparse
import os
import sys


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="orchestrator",
        description="Snapfzz Intelligence Orchestrator",
    )
    sub = parser.add_subparsers(dest="command")

    # orchestrator app
    app_parser = sub.add_parser("app", help="Start the orchestrator server")
    app_parser.add_argument(
        "--host",
        default=os.environ.get("SNAPFZZ_HOST", "127.0.0.1"),
        help="Bind address",
    )
    app_parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("SNAPFZZ_PORT", "9150")),
        help="Bind port",
    )
    app_parser.add_argument(
        "--log-level",
        default="info",
        choices=["debug", "info", "warning", "error"],
        help="Log level",
    )

    args = parser.parse_args()

    if args.command == "app":
        _run_app(args)
    else:
        parser.print_help()
        sys.exit(1)


def _run_app(args: argparse.Namespace) -> None:
    """Start the FastAPI orchestrator server via uvicorn.

    Per A013/C1: SNAPFZZ_HOST/PORT are set in env before build_app() so the
    app factory can read them even if argparse values differ.
    """
    import uvicorn

    # Per A013/C1: Mirror CLI values back into env so build_app() reads them.
    os.environ.setdefault("SNAPFZZ_HOST", args.host)
    os.environ.setdefault("SNAPFZZ_PORT", str(args.port))

    uvicorn.run(
        "orchestrator.app:build_app",
        factory=True,
        host=args.host,
        port=args.port,
        log_level=args.log_level,
        workers=1,
    )


if __name__ == "__main__":
    main()
