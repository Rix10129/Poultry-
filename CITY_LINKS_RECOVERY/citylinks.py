"""CITY LINKS ISP Customer & Recovery Management System - start here.

    python citylinks.py            -> menu
    python citylinks.py --help     -> commands
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from citylinks.cli import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main())
