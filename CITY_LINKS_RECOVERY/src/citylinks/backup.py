"""Backups: backups/<YYYY-MM>/<workbook>_<YYYYMMDD_HHMMSS>_<reason>.xlsx

* Made automatically before major operations (new month, imports, bulk updates).
* One automatic "daily" backup before the first change of each day.
* A backup file is never overwritten.
"""
from __future__ import annotations

import datetime as dt
import re
import shutil
from pathlib import Path


def backup(workbook: Path, backups_dir: Path, reason: str = "manual") -> Path:
    workbook, backups_dir = Path(workbook), Path(backups_dir)
    if not workbook.exists():
        raise FileNotFoundError(workbook)
    stamp = dt.datetime.now()
    folder = backups_dir / stamp.strftime("%Y-%m")
    folder.mkdir(parents=True, exist_ok=True)
    reason = re.sub(r"[^A-Za-z0-9_-]+", "_", reason).strip("_")[:40] or "backup"
    base = f"{workbook.stem}_{stamp:%Y%m%d_%H%M%S}_{reason}"
    target = folder / f"{base}.xlsx"
    n = 2
    while target.exists():                      # never overwrite an existing backup
        target = folder / f"{base}_{n}.xlsx"
        n += 1
    shutil.copy2(workbook, target)
    return target


def daily_backup_if_needed(workbook: Path, backups_dir: Path) -> Path | None:
    workbook = Path(workbook)
    today = dt.date.today()
    folder = Path(backups_dir) / today.strftime("%Y-%m")
    if folder.exists() and any(folder.glob(f"{workbook.stem}_{today:%Y%m%d}_*.xlsx")):
        return None
    return backup(workbook, backups_dir, "daily")


def list_backups(backups_dir: Path) -> list[Path]:
    return sorted(Path(backups_dir).glob("*/*.xlsx"))
