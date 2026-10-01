"""Small helpers: months, dates, text normalisation, safe file names, mobiles."""
from __future__ import annotations

import calendar
import datetime as dt
import re
import unicodedata

MONTH_NAMES = {name.lower(): i for i, name in enumerate(calendar.month_name) if name}
MONTH_ABBR = {name.lower(): i for i, name in enumerate(calendar.month_abbr) if name}


class UserError(Exception):
    """An error with a message meant for the office operator."""


# --------------------------------------------------------------------- months
def parse_month(value) -> str:
    """Accepts 2026-10, 2026/10, 10-2026, 10/2026, October 2026, Oct 2026, Oct-2026, a date.

    Returns the canonical key ``YYYY-MM``.
    """
    if value is None:
        raise UserError("Month is missing. Use the format YYYY-MM, e.g. 2026-10.")
    if isinstance(value, (dt.date, dt.datetime)):
        return f"{value.year:04d}-{value.month:02d}"
    s = str(value).strip()
    m = re.fullmatch(r"(\d{4})\s*[-/.]\s*(\d{1,2})", s)
    if m:
        y, mo = int(m.group(1)), int(m.group(2))
    else:
        m = re.fullmatch(r"(\d{1,2})\s*[-/.]\s*(\d{4})", s)
        if m:
            mo, y = int(m.group(1)), int(m.group(2))
        else:
            m = re.fullmatch(r"([A-Za-z]+)[\s\-,/]*(\d{4})", s)
            if not m:
                raise UserError(f"'{s}' is not a valid month. Use the format YYYY-MM, e.g. 2026-10.")
            word = m.group(1).lower()
            mo = MONTH_NAMES.get(word) or MONTH_ABBR.get(word[:3])
            y = int(m.group(2))
            if not mo:
                raise UserError(f"'{s}' is not a valid month name.")
    if not (1 <= mo <= 12) or not (2000 <= y <= 2100):
        raise UserError(f"'{s}' is not a valid month.")
    return f"{y:04d}-{mo:02d}"


def month_name(key: str) -> str:
    y, m = int(key[:4]), int(key[5:7])
    return f"{calendar.month_name[m]} {y}"


def month_range(start: str, end: str) -> list[str]:
    y, m = int(start[:4]), int(start[5:7])
    out = []
    while f"{y:04d}-{m:02d}" <= end:
        out.append(f"{y:04d}-{m:02d}")
        m += 1
        if m == 13:
            y, m = y + 1, 1
    return out


def previous_month(key: str) -> str:
    y, m = int(key[:4]), int(key[5:7])
    return f"{y - 1:04d}-12" if m == 1 else f"{y:04d}-{m - 1:02d}"


def due_date_of(month: str, due_day) -> dt.date | None:
    if due_day in (None, ""):
        return None
    y, m = int(month[:4]), int(month[5:7])
    last = calendar.monthrange(y, m)[1]
    return dt.date(y, m, min(int(due_day), last))


# ---------------------------------------------------------------------- dates
def parse_date(value, fmt_hint: str = "DD-MM-YYYY") -> dt.date:
    if isinstance(value, dt.datetime):
        return value.date()
    if isinstance(value, dt.date):
        return value
    s = str(value or "").strip()
    if not s:
        raise UserError("Date is missing.")
    if s.lower() in ("today", "t"):
        return dt.date.today()
    for f in ("%d-%m-%Y", "%d/%m/%Y", "%d.%m.%Y", "%Y-%m-%d", "%d-%b-%Y", "%d %b %Y", "%d-%B-%Y", "%d %B %Y", "%d-%m-%y", "%d/%m/%y"):
        try:
            return dt.datetime.strptime(s, f).date()
        except ValueError:
            pass
    raise UserError(f"'{s}' is not a valid date. Use {fmt_hint}, e.g. 15-10-2026.")


def fmt_date(d) -> str:
    if isinstance(d, dt.datetime):
        d = d.date()
    return d.strftime("%d-%b-%Y") if isinstance(d, dt.date) else ""


def now() -> dt.datetime:
    return dt.datetime.now().replace(microsecond=0)


# ----------------------------------------------------------------------- text
def clean_text(v) -> str:
    """Cell value -> trimmed text. Integral floats lose the '.0' (405.0 -> '405')."""
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    if isinstance(v, (dt.datetime, dt.date)):
        return fmt_date(v)
    return re.sub(r"\s+", " ", str(v)).strip()


_URDU_FOLD = str.maketrans({"ي": "ی", "ى": "ی", "ك": "ک", "ە": "ہ", "ۀ": "ہ", "‌": "", "ـ": ""})


def norm_key(v) -> str:
    """Comparison key: case-insensitive, whitespace-collapsed, Arabic/Urdu letter variants folded,
    diacritics removed. Used only to *flag* possible duplicates / search, never to change data."""
    s = unicodedata.normalize("NFKC", clean_text(v)).translate(_URDU_FOLD)
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    return s.casefold()


def digits(v) -> str:
    return re.sub(r"\D", "", clean_text(v))


def to_number(v):
    """Return int/float or None. Accepts '1,300', 'Rs. 1300'."""
    if v is None or v == "":
        return None
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return int(v) if float(v).is_integer() else float(v)
    s = re.sub(r"(?i)rs\.?|pkr|,|\s", "", str(v))
    try:
        f = float(s)
    except ValueError:
        return None
    return int(f) if f.is_integer() else f


def money(v) -> str:
    n = to_number(v) or 0
    return f"{n:,.0f}"


def safe_filename(text: str, max_len: int = 80) -> str:
    """Windows-safe file name that keeps Urdu letters (NTFS supports Unicode)."""
    s = unicodedata.normalize("NFC", clean_text(text))
    s = re.sub(r"[‎‏‪-‮⁦-⁩]", "", s)   # bidi control chars
    s = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "", s)
    s = re.sub(r"\s+", "_", s).strip("._ ")
    if s.upper() in {"CON", "PRN", "AUX", "NUL"} or re.fullmatch(r"(?i)(COM|LPT)\d", s):
        s = "_" + s
    return s[:max_len]


def whatsapp_number(mobile, country_code: str = "92") -> str | None:
    """0300-1234567 -> 923001234567. Returns None if it does not look like a mobile number."""
    d = digits(mobile)
    cc = digits(country_code) or "92"
    if not d:
        return None
    if d.startswith("00"):
        d = d[2:]
    if d.startswith(cc) and len(d) >= len(cc) + 9:
        return d
    if d.startswith("0") and len(d) == 11:
        return cc + d[1:]
    if len(d) == 10 and d.startswith("3"):
        return cc + d
    return None
