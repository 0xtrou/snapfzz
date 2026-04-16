"""CLI entry point — started by Snapfzz process manager."""

import argparse
import sys


def main() -> None:
    parser = argparse.ArgumentParser(prog="name")
    sub = parser.add_subparsers(dest="command")

    app_parser = sub.add_parser("app", help="Start the server")
    app_parser.add_argument("--host", default="127.0.0.1")
    app_parser.add_argument("--port", type=int, default=8080)
    app_parser.add_argument("--log-level", default="info",
                            choices=["debug", "info", "warning", "error"])

    args = parser.parse_args()

    if args.command == "app":
        import uvicorn
        uvicorn.run(
            "name.app:create_app",
            factory=True,
            host=args.host,
            port=args.port,
            log_level=args.log_level,
            workers=1,
        )
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
