"""CITY LINKS Recovery - menu program and command line.

Run ``python citylinks.py`` for the numbered menu (what the office operator uses), or
``python citylinks.py <command> --help`` for individual commands.
"""
from __future__ import annotations

import argparse
import datetime as dt
import os
import subprocess
import sys
import urllib.parse
import warnings
import webbrowser
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill

from . import backup as bk
from . import importer as imp
from . import pdfgen
from . import schema as S
from . import services as svc
from .store import Store, lock_file
from .util import UserError, clean_text, fmt_date, money, month_name, parse_date, parse_month, to_number, whatsapp_number

warnings.filterwarnings("ignore", category=UserWarning, module="openpyxl")

ROOT = Path(__file__).resolve().parents[2]


class App:
    def __init__(self, workbook: Path | None = None, root: Path = ROOT):
        self.root = Path(root)
        self.workbook = Path(workbook) if workbook else self.root / "data" / "CITY_LINKS_Recovery.xlsx"
        self.backups = self.root / "backups"
        self.exports = self.root / "exports"
        self.imports = self.root / "imports"

    # --------------------------------------------------------------- plumbing
    def read(self) -> svc.Data:
        return svc.load(Store(self.workbook, check_lock=False))

    def write(self, func, reason: str | None = None):
        """Run func(store) and save. reason != None -> named backup first (major operation);
        otherwise one automatic backup per day."""
        if lock_file(self.workbook).exists():
            raise UserError(f"{self.workbook.name} is open in Excel. Please SAVE and CLOSE it in Excel first. Nothing was changed.")
        if reason:
            b = bk.backup(self.workbook, self.backups, reason)
            print(f"  Backup saved: {b.relative_to(self.root) if b.is_relative_to(self.root) else b}")
        else:
            bk.daily_backup_if_needed(self.workbook, self.backups)
        store = Store(self.workbook)
        result = func(store)
        store.save()
        return result

    def settings(self) -> dict:
        return Store(self.workbook, check_lock=False).settings()

    def current_month(self) -> str:
        m = clean_text(self.settings().get("CurrentMonth"))
        return parse_month(m) if m else dt.date.today().strftime("%Y-%m")


# ======================================================================= UI
def ask(prompt: str, default=None, allow_blank=False) -> str:
    sfx = f" [{default}]" if default not in (None, "") else ""
    while True:
        v = input(f"{prompt}{sfx}: ").strip()
        if not v and default not in (None, ""):
            return str(default)
        if v or allow_blank:
            return v
        print("  Please enter a value (or press Ctrl+C to cancel).")


def yes(prompt: str, default=False) -> bool:
    v = input(f"{prompt} ({'Y/n' if default else 'y/N'}): ").strip().lower()
    return default if not v else v in ("y", "yes", "haan", "ha", "ji")


def choose(prompt: str, options: list[str], default=None) -> str:
    for i, o in enumerate(options, 1):
        print(f"   {i:>2}. {o}")
    while True:
        v = ask(prompt, default)
        if v.isdigit() and 1 <= int(v) <= len(options):
            return options[int(v) - 1]
        for o in options:
            if v.lower() == str(o).lower():
                return o
        print("  Choose a number from the list.")


def pick_customer(d: svc.Data, text: str | None = None) -> dict | None:
    text = text or ask("Customer ID / Name / Mobile / VLAN / Location")
    res = svc.search_customers(d, text)
    if not res:
        print(f"  Customer {text} was not found.")
        return None
    if len(res) == 1:
        c = res[0]
        print(f"  Found: {c['Customer ID']}  {c['Customer Name']}  {c['Full Address']}  VLAN {c['VLAN ID']}  ({c['Customer Status']})")
        if clean_text(text).upper() != c["Customer ID"].upper() and not yes("  Is this the correct customer?", True):
            return None
        return c
    print(f"  {len(res)} customers match. Choose one:")
    show = res[:30]
    for i, c in enumerate(show, 1):
        print(f"   {i:>2}. {c['Customer ID']:<9} {c['Customer Name']:<24} {c['Location Code']:<5} VLAN {c['VLAN ID']:<6} {c['Mobile Number']:<13} {c['Customer Status']}")
    if len(res) > 30:
        print("   ... more results - type a more exact search.")
    v = ask("Number (blank = cancel)", allow_blank=True)
    if v.isdigit() and 1 <= int(v) <= len(show):
        return show[int(v) - 1]
    return None


def open_file(path: Path):
    try:
        if sys.platform.startswith("win"):
            os.startfile(str(path))  # type: ignore[attr-defined]
        elif sys.platform == "darwin":
            subprocess.Popen(["open", str(path)])
        elif os.environ.get("DISPLAY"):
            subprocess.Popen(["xdg-open", str(path)])
    except Exception:
        pass


def print_bills(bills, limit=60):
    print(f"   {'#':>3} {'ID':<9} {'Name':<22} {'Loc':<4} {'VLAN':<6} {'Due':>3} {'Fee':>7} {'Paid':>7} {'Bal':>7} {'Status':<8} Collector")
    for i, b in enumerate(bills[:limit], 1):
        print(f"   {i:>3} {b['Customer ID']:<9} {b['Customer Name'][:22]:<22} {b['Location Code']:<4} {b['VLAN ID']:<6} "
              f"{int(b['Due Date'] or 0):>3} {money(b['Monthly Fee']):>7} {money(b['Amount Paid']):>7} {money(b['Balance']):>7} "
              f"{b['Payment Status']:<8} {b['Collector Name']} {b['Overdue']}")
    if len(bills) > limit:
        print(f"   ... {len(bills) - limit} more (use the PDF / Excel print for the full list)")
    t = svc.totals(bills)
    print(f"   Customers: {t['customers']}   Billing: {money(t['billing'])}   Recovered: {money(t['recovered'])}   "
          f"Pending: {money(t['pending'])}   Recovery: {t['recovery_pct']:.1%}")


# =================================================================== actions
def act_set_month(app: App, month=None):
    month = parse_month(month or ask("Current month (YYYY-MM or 'November 2026')", app.current_month()))
    app.write(lambda s: s.set_setting("CurrentMonth", month))
    print(f"  Current Month is now {month} ({month_name(month)}).")


def act_generate_month(app: App, month=None, assume_yes=False):
    d = app.read()
    month = parse_month(month or ask("Month to generate (YYYY-MM)", app.current_month()))
    if svc.month_exists(d, month):
        raise UserError(f"{month_name(month)} billing already exists. It was NOT created again.")
    later = sorted({b["Month"] for b in d.billing if b["Month"] > month})
    if later:
        print(f"  Note: later months already exist ({', '.join(later)}). You are creating an older month.")
    ok, problems = svc.check_month_ready(d)
    print(f"  Active customers ready to bill: {len(ok)}   Total billing: {money(sum(c['Monthly Fee'] for c in ok))}")
    skip = False
    if problems:
        print("  These Active customers have problems and CANNOT be billed:")
        for p in problems:
            print("   - " + p)
        if assume_yes:
            skip = True
        elif not yes("  Generate the month WITHOUT them? (you can add them later with 'Add customer to month')"):
            print("  Cancelled. Nothing was changed.")
            return
        skip = True
    if not assume_yes and not yes(f"  Generate {month_name(month)} for {len(ok)} customers now?", True):
        print("  Cancelled.")
        return
    r = app.write(lambda s: (svc.sync_events(s), svc.generate_month(s, month, skip_invalid=skip))[1], reason=f"before_new_month_{month}")
    print(f"  DONE: {month_name(month)} created. Bills: {r.billed}  Total: {money(r.total)}  Auto-assigned to collectors: {r.assigned}")
    print(f"  Current Month is now {month}. Previous months were not changed.")


def act_record_payment(app: App):
    d = app.read()
    c = pick_customer(d)
    if not c:
        return
    month = parse_month(ask("Month of the bill", app.current_month()))
    bill = svc.bill_for(d, c["Customer ID"], month)
    unpaid = [b for b in d.billing if b["Customer ID"] == c["Customer ID"] and b["Balance"] > 0]
    if not bill:
        print(f"  No bill for {month_name(month)}.")
        if unpaid:
            print("  Bills with balance: " + ", ".join(f"{b['Month']} ({money(b['Balance'])})" for b in unpaid))
        return
    print(f"  Customer: {c['Customer Name']}   Month: {month_name(month)}")
    print(f"  Bill: {money(bill['Monthly Fee'])}   Already Paid: {money(bill['Amount Paid'])}   Remaining: {money(bill['Balance'])}   Status: {bill['Payment Status']}")
    other = [b for b in unpaid if b["Month"] != month]
    if other:
        print("  Other unpaid months: " + ", ".join(f"{b['Month']} ({money(b['Balance'])})" for b in other))
    amt = to_number(ask("Payment Amount", bill["Balance"] if bill["Balance"] > 0 else None))
    if amt is None:
        raise UserError("Payment amount is missing.")
    if amt < 0:
        raise UserError("Payment amount cannot be negative.")
    over = amt > bill["Balance"]
    if over and not yes(f"  {money(amt)} is MORE than the remaining {money(bill['Balance'])}. Save anyway (excess is shown as Excess Paid)?"):
        return
    pdate = parse_date(ask("Payment Date (DD-MM-YYYY or 'today')", "today"))
    st = app.settings()
    method = choose("Payment Method", S.PAYMENT_METHODS, st.get("DefaultPaymentMethod") or "Cash")
    col = ask("Collector ID (blank = office)", bill["Collector ID"], allow_blank=True)
    ref = ask("Reference (receipt / transaction no.)", allow_blank=True)
    rem = ask("Remarks", allow_blank=True)
    print(f"  SAVE: {c['Customer ID']} {month} {money(amt)} {method} on {fmt_date(pdate)} collector {col or '-'}")
    if not yes("  Confirm?", True):
        return
    pid = app.write(lambda s: svc.record_payment(s, c["Customer ID"], month, amt, pdate, method, col, ref, rem, allow_overpay=over))
    b2 = svc.bill_for(app.read(), c["Customer ID"], month)
    print(f"  Saved {pid}. Total Paid: {money(b2['Amount Paid'])}  Balance: {money(b2['Balance'])}  Status: {b2['Payment Status']}")


def act_quick_entry(app: App):
    """Enter the results of a returned recovery list in one go."""
    d = app.read()
    month = parse_month(ask("Month", app.current_month()))
    cols = [c["Collector ID"] for c in d.collectors]
    print("  Collectors: " + ", ".join(f"{c['Collector ID']}={c['Collector Name']}" for c in d.collectors))
    col = ask("Collector ID who collected", allow_blank=False)
    if col not in cols:
        raise UserError(f"Collector {col} does not exist.")
    scope = choose("Which customers?", ["Customers assigned to this collector", "An area", "A location code (street)", "All unpaid"], "1")
    area = loc = "All"
    collector = "All"
    if scope.startswith("Customers assigned"):
        collector = col
    elif scope == "An area":
        area = choose("Area", [clean_text(a["Area Name"]) for a in d.areas])
    elif scope.startswith("A location"):
        loc = ask("Location Code").upper()
    bills = svc.select_bills(d, month, area=area, location=loc, collector=collector, status="UNPAID")
    if not bills:
        print("  No unpaid bills in this list.")
        return
    pdate = parse_date(ask("Collection date for these payments", "today"))
    method = choose("Payment Method", S.PAYMENT_METHODS, "Cash")
    print("  For each customer type the amount received. Enter = nothing received, 'f' = full balance, 'q' = stop.")
    entries = []
    for b in bills:
        v = input(f"   {b['Customer ID']} {b['Customer Name'][:24]:<24} {b['Location Code']:<4} balance {money(b['Balance']):>7} : ").strip().lower()
        if v == "q":
            break
        if not v:
            continue
        amt = b["Balance"] if v == "f" else to_number(v)
        if amt is None or amt <= 0:
            print("     not a valid amount - skipped")
            continue
        if amt > b["Balance"] and not yes(f"     {money(amt)} is more than balance {money(b['Balance'])}. Keep?"):
            continue
        entries.append((b, amt))
    if not entries:
        print("  Nothing entered.")
        return
    total = sum(a for _, a in entries)
    print(f"  {len(entries)} payments, total {money(total)} ({method}, {fmt_date(pdate)}, collector {col}).")
    if not yes("  Save all?", True):
        return

    def run(s):
        return [svc.record_payment(s, b["Customer ID"], month, a, pdate, method, col, "", "Quick recovery entry",
                                   allow_overpay=True) for b, a in entries]
    ids = app.write(run, reason=f"bulk_payments_{month}_{col}")
    print(f"  Saved {len(ids)} payments ({ids[0]} .. {ids[-1]}). Now enter the cash he handed over (menu: Cash submitted).")


def show_history(app: App, c: dict):
    d = app.read()
    h = svc.customer_history(d, c["Customer ID"])
    c = h["customer"]
    print("\n  ================= CUSTOMER PROFILE =================")
    for k in ("Customer ID", "Customer Name", "Area", "Street", "Full Address", "VLAN ID", "Package", "Monthly Fee",
              "Due Date", "Mobile Number", "Customer Status"):
        v = c.get(k)
        print(f"  {k:<16}: {money(v) if k == 'Monthly Fee' and v not in (None, '') else clean_text(v)}")
    print(f"  {'Connection Date':<16}: {fmt_date(c.get('Connection Date'))}")
    print("\n  Month           Bill     Paid  Payment Date   Balance  Status")
    for b in h["bills"]:
        print(f"  {b['Month Name']:<14} {money(b['Monthly Fee']):>6} {money(b['Amount Paid']):>8}  {fmt_date(b['Last Payment Date']):<12} {money(b['Balance']):>8}  {b['Payment Status']}")
    print(f"\n  Total Billing: {money(h['total_billing'])}   Total Paid: {money(h['total_paid'])}   Total Outstanding: {money(h['total_outstanding'])}")
    if h["last_payment_date"]:
        print(f"  Last Payment: {fmt_date(h['last_payment_date'])}  Amount: {money(h['last_payment_amount'])}")
    if h["events"]:
        print("\n  Connection history:")
        for e in h["events"]:
            print(f"   {fmt_date(e['Event Date'])}  {e['Event Type']:<15} {clean_text(e['Old Value'])} -> {clean_text(e['New Value'])}  {clean_text(e['Notes'])}")


def act_history(app: App):
    c = pick_customer(app.read())
    if c:
        show_history(app, c)


def whatsapp_link(settings: dict, mobile: str) -> str | None:
    num = whatsapp_number(mobile, clean_text(settings.get("WhatsAppCountryCode") or "92"))
    if not num:
        return None
    msg = clean_text(settings.get("WhatsAppMessage")) if "\n" not in str(settings.get("WhatsAppMessage")) else str(settings.get("WhatsAppMessage"))
    return f"https://wa.me/{num}?text={urllib.parse.quote(msg)}"


def make_statement(app: App, cid: str, start="All", end="All") -> Path:
    d = app.read()
    h = svc.customer_history(d, cid, start, end)
    return pdfgen.statement_pdf(h, d.settings, app.exports / "statements")


def act_statement(app: App):
    d = app.read()
    c = pick_customer(d)
    if not c:
        return
    rng = choose("Statement period", ["Complete history", "Selected period"], "1")
    start = end = "All"
    if rng == "Selected period":
        start = parse_month(ask("From month (YYYY-MM)"))
        end = parse_month(ask("To month (YYYY-MM)", app.current_month()))
        if end < start:
            raise UserError("'To' month is before 'From' month.")
    path = make_statement(app, c["Customer ID"], start, end)
    print(f"\n  Statement saved: {path}")
    print(f"  Customer: {c['Customer Name']}   Mobile: {c['Mobile Number'] or '(no mobile number)'}")
    link = whatsapp_link(d.settings, c["Mobile Number"])
    if link:
        print(f"  WhatsApp link: {link}")
        print("  NOTE: WhatsApp opens with the message ready. The PDF is NOT attached automatically -")
        print("        attach the PDF file shown above (paper-clip icon) and press send.")
    else:
        print("  No valid mobile number - WhatsApp link not available.")
    choice = choose("Next", ["Open PDF (print / check)", "Open WhatsApp + PDF folder", "Done"], "3")
    if choice.startswith("Open PDF"):
        open_file(path)
    elif choice.startswith("Open WhatsApp") and link:
        webbrowser.open(link)
        open_file(path.parent)


def _ask_filters(app: App, d: svc.Data) -> dict:
    month = parse_month(ask("Month", app.current_month()))
    mode = choose("Print mode", S.PRINT_MODES, "1")
    f = {"month": month, "mode": mode, "area": "All", "location": "All", "collector": "All", "status": "All", "due": "All"}
    if mode in ("Area-wise Recovery", "Pending Recovery", "Partial Payment Recovery", "Custom Filtered Recovery"):
        f["area"] = choose("Area", ["All"] + [clean_text(a["Area Name"]) for a in d.areas], "1")
    if mode in ("Street-wise Recovery", "Custom Filtered Recovery") or (f["area"] != "All" and yes("  Only one street/location code?")):
        f["location"] = ask("Location Code (e.g. A1, or All)", "All").upper().replace("ALL", "All")
        if f["location"] != "All":
            f["location_address"] = svc.resolve_location(d, f["location"])["Full Address"]
    if mode in ("Collector-wise Recovery", "Custom Filtered Recovery") or yes("  Filter by collector?"):
        f["collector"] = choose("Collector", ["All", "Unassigned"] + [clean_text(c["Collector Name"]) for c in d.collectors], "1")
    if mode not in ("Pending Recovery", "Partial Payment Recovery"):
        f["status"] = choose("Payment status (UNPAID = pending + partial)", S.PRINT_STATUSES, "2")
    if mode == "Due-Date-wise Recovery":
        f["due"] = ask("Due date (day 1-31 or All)", "All")
    if mode == "Custom Filtered Recovery":
        ids = ask("Customer IDs separated by commas (blank = no ID filter)", allow_blank=True)
        f["ids"] = [clean_text(x).upper() for x in ids.split(",") if clean_text(x)] or None
    return f


def filtered_bills(d, f):
    return svc.select_bills(d, f["month"], f["area"], f["location"], f["collector"], f["status"], f["due"],
                            f.get("ids"), mode=f.get("mode"))


def act_print(app: App, f: dict | None = None, language=None):
    d = app.read()
    f = f or _ask_filters(app, d)
    if f.get("location", "All") != "All":
        loc = svc.resolve_location(d, f["location"])
        f.setdefault("location_address", loc["Full Address"])
        if f.get("area", "All") == "All":
            f["area"] = loc["Area"]          # display + consistent filter (location belongs to this area)
    bills = filtered_bills(d, f)
    print(f"\n  {pdfgen.list_title(f)} - {month_name(f['month'])}")
    print_bills(bills, 25)
    if not bills:
        return None
    language = language or choose("Language", S.LANGUAGES, d.settings.get("PrintLanguage") or "English")
    path = pdfgen.recovery_list_pdf(bills, f, d.settings, app.exports / "recovery_lists", language)
    print(f"  PDF saved: {path}")
    if sys.stdin.isatty() and yes("  Open it now for printing?", True):
        open_file(path)
    return path


def act_show_status(app: App, status=None):
    d = app.read()
    status = status or choose("Show", ["PENDING", "PARTIAL", "PAID", "OVERDUE", "UNPAID"], "1")
    month = parse_month(ask("Month", app.current_month()))
    bills = svc.select_bills(d, month, status=status)
    print(f"\n  {status} - {month_name(month)}")
    if status == "OVERDUE":
        print("  (OVERDUE = balance > 0 and today is after the due date of that month + grace days in SETTINGS)")
    print_bills(bills)


def act_add_customer(app: App):
    d = app.read()
    nxt = svc.next_customer_id(d)
    print(f"  New Customer ID will be: {nxt}  (permanent)")
    print("  Locations: " + ", ".join(f"{k}={v['Full Address']}" for k, v in sorted(svc.location_map(d).items())))
    f = {"Customer Name": ask("Customer Name (Urdu or English, exactly as written)")}
    loc = ask("Location Code (e.g. A1)").upper().replace(" ", "")
    lmap = svc.location_map(d)
    if loc not in lmap:
        raise UserError(f"Location Code {loc} does not exist. Add it first (menu: Add area / location code).")
    print(f"   -> {lmap[loc]['Full Address']}")
    f["Location Code"] = loc
    f["Address Detail"] = ask("House / extra address (optional)", allow_blank=True)
    f["VLAN ID"] = ask("VLAN ID")
    pk = [clean_text(p["Package Name"]) for p in d.packages if clean_text(p.get("Active")) != "No"]
    if pk:
        print("  Packages: " + ", ".join(f"{clean_text(p['Package Name'])} ({money(p['Default Monthly Fee'])})" for p in d.packages))
    f["Package"] = ask("Package (blank = none)", allow_blank=True)
    f["Fee Override"] = ask("Special monthly fee (blank = package fee)", allow_blank=True)
    f["Due Date"] = ask("Due Date (day of month 1-31)")
    f["Mobile Number"] = ask("Mobile Number", allow_blank=True)
    f["Default Collector ID"] = ask("Default Collector ID (optional)", allow_blank=True)
    cd = ask("Connection Date (DD-MM-YYYY, blank = today)", allow_blank=True)
    f["Connection Date"] = parse_date(cd) if cd else dt.date.today()
    f["Customer Status"] = choose("Status", S.CUSTOMER_STATUSES, "1")
    f["Notes"] = ask("Notes", allow_blank=True)
    f = {k: v for k, v in f.items() if v not in ("", None)}

    def confirm(dups):
        print("  POSSIBLE DUPLICATE:")
        for i, why in dups:
            print(f"   - {i}: {why}")
        return yes("  Is this really a NEW, different customer? Save anyway?")
    cid = app.write(lambda s: svc.add_customer(s, f, confirm_duplicates=confirm))
    print(f"  Saved {cid}.")
    month = app.current_month()
    d2 = app.read()
    if f["Customer Status"] == "Active" and svc.month_exists(d2, month) and not svc.bill_for(d2, cid, month):
        if yes(f"  {month_name(month)} is already generated. Add a bill for this customer for {month}?"):
            app.write(lambda s: svc.add_customer_to_month(s, cid, month))
            print("  Bill added.")


def act_edit_customer(app: App):
    d = app.read()
    c = pick_customer(d)
    if not c:
        return
    fieldname = choose("Field to change", svc.EDITABLE_FIELDS)
    print(f"  Current value: {clean_text(c.get(fieldname)) or '(blank)'}")
    if fieldname == "Customer Status":
        new = choose("New status", S.CUSTOMER_STATUSES)
    else:
        new = ask("New value (blank = clear)", allow_blank=True)
    if fieldname == "Connection Date" and new:
        new = parse_date(new)
    when = parse_date(ask("Date of change", "today"))
    notes = ask("Notes / reason", allow_blank=True)
    if not yes(f"  Change {fieldname} of {c['Customer ID']} from '{clean_text(c.get(fieldname))}' to '{clean_text(new)}'?"):
        return
    done = app.write(lambda s: svc.update_customer(s, c["Customer ID"], {fieldname: new}, when, notes))
    print("  Saved and recorded in CUSTOMER_EVENTS: " + ("; ".join(done) or "no change"))
    if fieldname in ("Package", "Fee Override", "VLAN ID", "Location Code"):
        print("  Note: bills already generated keep their old values. New months use the new value.")


def act_assign(app: App):
    d = app.read()
    month = parse_month(ask("Month", app.current_month()))
    print("  Collectors: " + ", ".join(f"{c['Collector ID']}={c['Collector Name']}" for c in d.collectors))
    col = ask("Assign to Collector ID")
    how = choose("Assign by", ["Area", "Street / Location Code", "Individual customers", "Custom filter (area + status)"])
    bills = [b for b in d.billing if b["Month"] == month]
    if how == "Area":
        area = choose("Area", [clean_text(a["Area Name"]) for a in d.areas])
        ids = [b["Customer ID"] for b in bills if b["Area"] == area]
    elif how.startswith("Street"):
        locs = [x.strip().upper() for x in ask("Location Code(s), comma separated e.g. A1,A2").split(",")]
        ids = [b["Customer ID"] for b in bills if b["Location Code"].upper() in locs]
    elif how.startswith("Individual"):
        ids = [x.strip().upper() for x in ask("Customer IDs, comma separated").split(",") if x.strip()]
    else:
        area = choose("Area", ["All"] + [clean_text(a["Area Name"]) for a in d.areas])
        st = choose("Status", S.PRINT_STATUSES)
        ids = [b["Customer ID"] for b in svc.select_bills(d, month, area=area, status=st)]
    if not ids:
        print("  No billed customers match.")
        return
    if not yes(f"  Assign {len(ids)} customer(s) for {month} to {col}?", True):
        return
    done, same = app.write(lambda s: svc.assign_collector(s, month, col, ids), reason=f"assign_{month}_{col}")
    print(f"  Assigned {done}. Already with {col}: {same}. Old assignments kept as 'Reassigned'.")


def act_cash(app: App):
    d = app.read()
    month = parse_month(ask("Month", app.current_month()))
    rows = svc.cash_reconciliation(d, month)
    print(f"\n  CASH RECONCILIATION - {month_name(month)}")
    print(f"   {'Collector':<16} {'Expected':>9} {'Actual':>9} {'Difference':>10}  Status")
    for r in rows:
        print(f"   {r['Collector ID']} {r['Collector Name'][:12]:<12} {money(r['Expected Cash']):>9} "
              f"{(money(r['Actual Cash']) if r['Actual Cash'] is not None else '-'):>9} "
              f"{(money(r['Difference']) if r['Difference'] is not None else '-'):>10}  {r['Status']}")
    if not yes("  Enter cash submitted by a collector now?", True):
        return
    col = ask("Collector ID")
    amt = ask("Actual cash handed over")
    by = ask("Received by", allow_blank=True)
    rem = ask("Remarks / explanation (if any difference)", allow_blank=True)
    app.write(lambda s: svc.set_cash_submitted(s, month, col, amt, dt.date.today(), by, rem))
    r = next(x for x in svc.cash_reconciliation(app.read(), month) if x["Collector ID"] == col)
    print(f"  Expected {money(r['Expected Cash'])}  Actual {money(r['Actual Cash'])}  Cash Difference {money(r['Difference'])}  ({r['Status']})")


def act_dashboard(app: App, month=None):
    d = app.read()
    month = parse_month(month or app.current_month())
    s = svc.dashboard(d, month)
    print(f"\n  ===== DASHBOARD - {month_name(month)} =====")
    print(f"  Customers: {s['total_customers']}  Active: {s['active']}  Suspended: {s['suspended']}  Disconnected: {s['disconnected']}  On Hold: {s['on_hold']}")
    print(f"  Monthly Billing: {money(s['billing'])}   Recovered: {money(s['recovered'])}   Pending: {money(s['pending'])}   Recovery: {s['recovery_pct']:.1%}")
    print(f"  Paid: {s['paid']}   Partial: {s['partial']} (balance {money(s['partial_balance'])})   Pending: {s['pending_count']}   Overdue: {s['overdue']}")
    print(f"  Today's Collection: {money(s['today_collection'])}   Collected during {month_name(month)}: {money(s['calendar_month_collection'])}   Outstanding (all months): {money(s['outstanding_all'])}")
    print("\n  Area                 Billed   Billing  Recovered   Pending  Recovery")
    for a in svc.area_summary(d, month):
        print(f"  {a['Area'][:20]:<20} {a['Billed']:>6} {money(a['Monthly Billing']):>9} {money(a['Recovered']):>10} {money(a['Pending Balance']):>9} {a['Recovery %']:>8.1%}")
    print("\n  Collector            Assigned  Billing  Recovered  Expected   Actual  Difference")
    for r in svc.cash_reconciliation(d, month):
        print(f"  {r['Collector Name'][:20]:<20} {r['Assigned Customers']:>8} {money(r['Assigned Billing']):>8} {money(r['Recovered']):>10} "
              f"{money(r['Expected Cash']):>9} {(money(r['Actual Cash']) if r['Actual Cash'] is not None else '-'):>8} "
              f"{(money(r['Difference']) if r['Difference'] is not None else '-'):>10}")


def export_reports(app: App, month=None) -> Path:
    d = app.read()
    month = parse_month(month or app.current_month())
    wb = Workbook()
    bold = Font(bold=True)
    hdr_fill = PatternFill("solid", fgColor="D9E1F2")

    def sheet(title, headers, rows):
        ws = wb.create_sheet(title)
        ws.append([f"{d.settings.get('CompanyName')} - {title.replace('_', ' ')} - {month_name(month)}"])
        ws["A1"].font = Font(bold=True, size=13)
        ws.append([])
        ws.append(headers)
        for c in ws[3]:
            c.font, c.fill = bold, hdr_fill
        for r in rows:
            ws.append(r)
        for i, h in enumerate(headers, 1):
            ws.column_dimensions[ws.cell(3, i).column_letter].width = max(10, min(32, len(str(h)) + 4))
        ws.freeze_panes = "A4"
        return ws

    bills = [b for b in d.billing if b["Month"] == month]
    bh = ["Billing ID", "Customer ID", "Customer Name", "Location Code", "Full Address", "VLAN ID", "Due Date", "Monthly Fee",
          "Amount Paid", "Balance", "Payment Status", "Overdue", "Collector Name", "Last Payment Date"]
    row = lambda b: [b[k] if k != "Last Payment Date" else b[k] for k in bh]
    sheet("Monthly_Recovery", bh, [row(b) for b in bills])
    a = svc.area_summary(d, month)
    sheet("Area_wise", list(a[0].keys()) if a else ["Area"], [list(x.values()) for x in a])
    l = svc.location_summary(d, month)
    sheet("Street_wise", list(l[0].keys()) if l else ["Location Code"], [list(x.values()) for x in l])
    c = svc.cash_reconciliation(d, month)
    keys = ["Collector ID", "Collector Name", "Assigned Customers", "Assigned Billing", "Recovered", "Pending Balance", "Partial", "Pending", "Recovery %"]
    sheet("Collector_wise", keys, [[x[k] for k in keys] for x in c])
    sheet("Pending", bh, [row(b) for b in bills if b["Payment Status"] == "PENDING"])
    sheet("Partial", bh, [row(b) for b in bills if b["Payment Status"] == "PARTIAL"])
    ck = ["Collector ID", "Collector Name", "Expected Cash", "Non Cash Collected", "Actual Cash", "Difference", "Status", "Remarks"]
    sheet("Cash_Reconciliation", ck, [[x[k] for k in ck] for x in c])
    months = sorted({b["Month"] for b in d.billing})
    comp = []
    for m in months:
        t = svc.totals([b for b in d.billing if b["Month"] == m])
        comp.append([m, month_name(m), t["customers"], t["billing"], t["recovered"], t["pending"], t["paid"], t["partial"], t["pending_count"], t["recovery_pct"]])
    sheet("Monthly_Comparison", ["Month", "Month Name", "Customers", "Billing", "Recovered", "Pending", "Paid", "Partial", "Pending Count", "Recovery %"], comp)
    del wb["Sheet"]
    for ws in wb.worksheets:
        for r in ws.iter_rows(min_row=4):
            for cell in r:
                h = clean_text(ws.cell(3, cell.column).value)
                if "%" in h:
                    cell.number_format = "0.0%"
                elif isinstance(cell.value, (int, float)):
                    cell.number_format = "#,##0"
                elif isinstance(cell.value, (dt.date, dt.datetime)):
                    cell.number_format = "dd-mmm-yyyy"
    out = app.exports / "reports" / f"CITY_LINKS_Reports_{month}_{dt.datetime.now():%Y%m%d_%H%M%S}.xlsx"
    out.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out)
    return out


def act_reports(app: App):
    month = parse_month(ask("Month", app.current_month()))
    out = export_reports(app, month)
    print(f"  Report pack saved: {out}")
    print("  Sheets: Monthly Recovery, Area-wise, Street-wise, Collector-wise, Pending, Partial, Cash Reconciliation, Monthly Comparison")
    d = app.read()
    ms = sorted({b["Month"] for b in d.billing})
    if len(ms) >= 2 and yes("  Show a month-vs-month comparison?", True):
        a = parse_month(ask("Month A", ms[-2]))
        b = parse_month(ask("Month B", ms[-1]))
        r = svc.monthly_comparison(d, a, b)
        print(f"   {'':<12} {month_name(a):>16} {month_name(b):>16}")
        for k, lab in (("customers", "Customers"), ("billing", "Billing"), ("recovered", "Recovered"), ("pending", "Pending")):
            print(f"   {lab:<12} {money(r['a'][k]):>16} {money(r['b'][k]):>16}")
        print(f"   {'Recovery %':<12} {r['a']['recovery_pct']:>16.1%} {r['b']['recovery_pct']:>16.1%}")


def act_handwritten(app: App):
    opt = choose("Handwritten import", [
        "Create a blank transcription template", "Load a transcription / OCR file into staging",
        "Run OCR on a scanned image (needs Tesseract)", "Answer verification questions",
        "Apply answers typed in the VERIFICATION_QUEUE sheet", "Commit verified rows as customers", "Reject a staged row"])
    if opt.startswith("Create"):
        p = imp.create_transcription_template(app.imports / "handwritten" / f"transcription_{dt.datetime.now():%Y%m%d_%H%M%S}.xlsx")
        print(f"  Template saved: {p}\n  Type each row exactly as written. Type ? for anything unclear. Then use 'Load'.")
        open_file(p)
    elif opt.startswith("Load"):
        path = Path(ask("File path (.xlsx / .csv / .txt)").strip('"'))
        batch, n, k = app.write(lambda s: imp.load_transcription(s, path), reason="before_handwritten_import")
        print(f"  Batch {batch}: {n} rows staged, {k} field(s) need verification.")
        if k:
            _verify_loop(app, batch)
    elif opt.startswith("Run OCR"):
        img = Path(ask("Image path").strip('"'))
        out = imp.ocr_image(img, to_number(app.settings().get("OCRConfidenceThreshold")) or 90)
        print(f"  OCR draft saved: {out}. Review it, then load it (low-confidence values go to verification).")
    elif opt.startswith("Answer"):
        _verify_loop(app, None)
    elif opt.startswith("Apply"):
        msgs = app.write(imp.apply_sheet_answers)
        print("  " + ("\n  ".join(msgs) if msgs else "No answers found in the sheet."))
    elif opt.startswith("Commit"):
        batch = ask("Batch ID")

        def confirm(row, dups):
            print(f"  Row {row['Row No']} {row['Customer Name']} {row['Location Code']} VLAN {row['VLAN ID']} looks like:")
            for i, why in dups:
                print(f"    - {i}: {why}")
            return yes("  Create as a NEW customer anyway?")
        r = app.write(lambda s: imp.commit_batch(s, batch, confirm), reason=f"before_commit_{batch}")
        print(f"  Imported: {len(r['imported'])}  " + ", ".join(f"row {a}->{b}" for a, b in r["imported"]))
        print(f"  Still waiting for verification: {r['waiting_verification']}   Possible duplicates (not imported): {len(r['possible_duplicates'])}")
        for e in r["errors"]:
            print("  ERROR " + e)
    else:
        batch = ask("Batch ID")
        row = int(ask("Row No"))
        reason = ask("Reason")
        app.write(lambda s: imp.reject_row(s, batch, row, reason))
        print("  Row rejected (kept in IMPORT_STAGING for the record).")


def _verify_loop(app: App, batch):
    items = imp.open_items(Store(app.workbook, check_lock=False), batch)
    if not items:
        print("  No open verification items.")
        return
    print("\n  Please enter ONLY these unclear values (nothing is guessed):")
    for i in items:
        print(f"   [{i['Batch ID']}] Row {i['Row No']} - {i['Field']}   (read: {i['Detected Value']}; {i['Reason']})")
    print("\n  Type answers, one per line, e.g.   9 = خالد محمود    12 = 407    14 fee = 1500")
    print("  (If a row has several unclear fields write: 12 vlan = 407).  Empty line = finish.")
    lines = []
    while True:
        line = input("   > ").strip()
        if not line:
            break
        lines.append(line)
    if not lines:
        return
    answers = imp.parse_answers("\n".join(lines))
    msgs = app.write(lambda s: imp.apply_answers(s, answers, batch))
    print("  Updated: " + "; ".join(msgs))
    left = imp.open_items(Store(app.workbook, check_lock=False), batch)
    print(f"  Open items remaining: {len(left)}")


def act_import_customers(app: App, path=None, assume_yes=False):
    path = Path(path or ask("Excel/CSV file path").strip('"'))
    rows = imp.read_table_file(path)
    store = Store(app.workbook, check_lock=False)
    p = imp.preview_customers(store, rows)
    rep = imp.write_preview_report(p, app.imports / f"preview_{path.stem}_{dt.datetime.now():%Y%m%d_%H%M%S}.xlsx")
    print(f"\n  PREVIEW of {path.name} ({len(rows)} rows)  - full details: {rep}")
    print(f"   New customers:          {len(p.new)}")
    print(f"   Possible duplicates:    {len(p.duplicates)}")
    print(f"   Invalid location codes: {len(p.invalid_location)}")
    print(f"   Missing required fields:{len(p.missing)}")
    for c, d in p.duplicates[:10]:
        print(f"    DUP? row {c['_source_row']} {c['Customer Name']}: " + "; ".join(f"{i} ({w})" for i, w in d))
    for c, why in p.invalid_location[:10]:
        print(f"    LOC  row {c['_source_row']}: {why}")
    for c, m in p.missing[:10]:
        print(f"    MISS row {c['_source_row']}: {', '.join(m)}")
    to_add = list(p.new)
    if p.duplicates and not assume_yes:
        for c, d in p.duplicates:
            if yes(f"  Row {c['_source_row']} {c['Customer Name']} looks like an existing customer. Import as NEW anyway?"):
                to_add.append(c)
    if not to_add:
        print("  Nothing to import.")
        return []
    if not assume_yes and not yes(f"  Import {len(to_add)} customers now? (invalid rows are NOT imported)"):
        return []
    ids = app.write(lambda s: imp.commit_customers(s, to_add, f"Imported from {path.name}"), reason="before_customer_import")
    print(f"  Imported {len(ids)} customers: {ids[0]} .. {ids[-1]}")
    return ids


def act_check(app: App):
    found = app.write(svc.sync_events)
    if found:
        print("  Changes made directly in Excel were recorded in CUSTOMER_EVENTS:")
        for f in found:
            print("   - " + f)
    issues = svc.check_data(app.read())
    if not issues:
        print("  No problems found.")
    for i in issues:
        print("  ! " + i)


def act_add_location(app: App):
    opt = choose("Add", ["New area (e.g. C = New Area)", "New location code / street (e.g. C1)"])
    if opt.startswith("New area"):
        code = ask("Area Code (letters)").upper()
        nm = ask("Area Name")
        ur = ask("Area name in Urdu (optional)", allow_blank=True)
        app.write(lambda s: svc.add_area(s, code, nm, ur))
        print(f"  Area {code} = {nm} added.")
    else:
        code = ask("Location Code (e.g. C1)").upper()
        a, n = svc.parse_location_code(code)
        street = ask("Street name", f"Gali {n}")
        app.write(lambda s: svc.add_location(s, code, street))
        print(f"  {code} added.")


def act_add_to_month(app: App):
    c = pick_customer(app.read())
    if not c:
        return
    month = parse_month(ask("Month", app.current_month()))
    bid = app.write(lambda s: svc.add_customer_to_month(s, c["Customer ID"], month))
    print(f"  Bill {bid} added.")


def act_void(app: App):
    pid = ask("Payment ID to void (e.g. PAY-000123)").upper()
    reason = ask("Reason")
    if yes(f"  Void {pid}? It stays in PAYMENTS but no longer counts."):
        app.write(lambda s: svc.void_payment(s, pid, reason), reason=f"void_{pid}")
        print("  Voided.")


def act_backup(app: App):
    b = bk.backup(app.workbook, app.backups, "manual")
    print(f"  Backup saved: {b}")
    for p in bk.list_backups(app.backups)[-5:]:
        print(f"   {p.relative_to(app.backups)}")


MENU = [
    ("Select current month", act_set_month),
    ("GENERATE NEW MONTH", act_generate_month),
    ("Record payment", act_record_payment),
    ("Quick recovery entry (returned list)", act_quick_entry),
    ("Search customer / complete history", act_history),
    ("Customer statement PDF + WhatsApp", act_statement),
    ("Print recovery list (PDF)", act_print),
    ("Show PENDING / PARTIAL / PAID / OVERDUE", act_show_status),
    ("Add customer", act_add_customer),
    ("Edit customer (VLAN / package / fee / status ...)", act_edit_customer),
    ("Assign customers to collector", act_assign),
    ("Cash submitted / cash reconciliation", act_cash),
    ("Dashboard summary", act_dashboard),
    ("Reports pack (Excel)", act_reports),
    ("Handwritten import / OCR verification", act_handwritten),
    ("Import customers from Excel/CSV", act_import_customers),
    ("Check data (duplicates, errors, Excel edits)", act_check),
    ("Add area / location code", act_add_location),
    ("Add a customer to an existing month", act_add_to_month),
    ("Void a wrong payment", act_void),
    ("Backup now", act_backup),
    ("Open workbook in Excel", lambda app: open_file(app.workbook)),
]


def menu(app: App):
    while True:
        try:
            st = app.settings()
            print("\n" + "=" * 64)
            print(f"  {st.get('CompanyName')} - RECOVERY SYSTEM      Current Month: {app.current_month()} ({month_name(app.current_month())})")
            if clean_text(st.get("WorkbookType")).upper() != "REAL DATA":
                print("  *** DEMO WORKBOOK - sample data only ***")
            print("=" * 64)
            for i, (label, _) in enumerate(MENU, 1):
                print(f"  {i:>2}. {label}")
            print("   0. Exit")
            v = input("\n  Choose: ").strip()
            if v in ("0", "q", "exit"):
                return
            if not v.isdigit() or not 1 <= int(v) <= len(MENU):
                continue
            MENU[int(v) - 1][1](app)
        except UserError as e:
            print(f"\n  >> {e}")
        except KeyboardInterrupt:
            print("\n  Cancelled.")
        except EOFError:
            return
        if sys.stdin.isatty():
            input("\n  Press Enter to continue...")


# ===================================================================== CLI
def main(argv=None):
    p = argparse.ArgumentParser(prog="citylinks", description="CITY LINKS ISP Recovery System")
    p.add_argument("--workbook", help="Workbook path (default data/CITY_LINKS_Recovery.xlsx)")
    sub = p.add_subparsers(dest="cmd")
    sub.add_parser("menu", help="Interactive menu (default)")
    s = sub.add_parser("generate-month", help="GENERATE NEW MONTH")
    s.add_argument("month")
    s.add_argument("--yes", action="store_true", help="skip questions (customers with problems are skipped and listed)")
    s = sub.add_parser("set-month")
    s.add_argument("month")
    s = sub.add_parser("pay", help="Record a payment")
    s.add_argument("customer_id"); s.add_argument("amount"); s.add_argument("--month"); s.add_argument("--date", default="today")
    s.add_argument("--method", default="Cash"); s.add_argument("--collector", default=""); s.add_argument("--ref", default="")
    s.add_argument("--remarks", default=""); s.add_argument("--allow-overpay", action="store_true")
    s = sub.add_parser("statement", help="Customer statement PDF")
    s.add_argument("customer_id"); s.add_argument("--from", dest="start", default="All"); s.add_argument("--to", dest="end", default="All")
    s = sub.add_parser("print", help="Recovery list PDF")
    s.add_argument("--month"); s.add_argument("--mode", default="Area-wise Recovery", choices=S.PRINT_MODES)
    s.add_argument("--area", default="All"); s.add_argument("--location", default="All"); s.add_argument("--collector", default="All")
    s.add_argument("--status", default="All", choices=S.PRINT_STATUSES); s.add_argument("--due", default="All")
    s.add_argument("--ids", default=""); s.add_argument("--language", default=None, choices=S.LANGUAGES)
    s = sub.add_parser("show", help="SHOW PENDING / PARTIAL / PAID / OVERDUE / UNPAID")
    s.add_argument("status", choices=["PENDING", "PARTIAL", "PAID", "OVERDUE", "UNPAID"]); s.add_argument("--month")
    s = sub.add_parser("dashboard"); s.add_argument("--month")
    s = sub.add_parser("reports"); s.add_argument("--month")
    s = sub.add_parser("history"); s.add_argument("query")
    s = sub.add_parser("search"); s.add_argument("query")
    sub.add_parser("check", help="Data check + record Excel edits in CUSTOMER_EVENTS")
    s = sub.add_parser("backup"); s.add_argument("--reason", default="manual")
    s = sub.add_parser("import-customers"); s.add_argument("file"); s.add_argument("--yes", action="store_true")
    s = sub.add_parser("hw-template")
    s = sub.add_parser("hw-load"); s.add_argument("file"); s.add_argument("--batch")
    s = sub.add_parser("hw-answer", help='e.g. hw-answer "9 = خالد محمود" "12 = 407"'); s.add_argument("answers", nargs="+"); s.add_argument("--batch")
    s = sub.add_parser("hw-open"); s.add_argument("--batch")
    s = sub.add_parser("hw-commit"); s.add_argument("batch"); s.add_argument("--accept-duplicates", action="store_true")
    s = sub.add_parser("build", help="Create a NEW empty workbook (never overwrites)"); s.add_argument("path")
    s = sub.add_parser("demo", help="Create the DEMO workbook with sample data"); s.add_argument("path", nargs="?")
    a = p.parse_args(argv)
    app = App(a.workbook)
    try:
        if a.cmd in (None, "menu"):
            menu(app)
        elif a.cmd == "generate-month":
            act_generate_month(app, a.month, assume_yes=a.yes)
        elif a.cmd == "set-month":
            act_set_month(app, a.month)
        elif a.cmd == "pay":
            month = parse_month(a.month or app.current_month())
            pid = app.write(lambda s: svc.record_payment(s, a.customer_id.upper(), month, a.amount, parse_date(a.date), a.method,
                                                         a.collector, a.ref, a.remarks, a.allow_overpay))
            b = svc.bill_for(app.read(), a.customer_id.upper(), month)
            print(f"Saved {pid}. Paid {money(b['Amount Paid'])} Balance {money(b['Balance'])} {b['Payment Status']}")
        elif a.cmd == "statement":
            path = make_statement(app, a.customer_id.upper(), a.start, a.end)
            print(path)
            c = app.read().customer(a.customer_id)
            link = whatsapp_link(app.settings(), c["Mobile Number"])
            print(f"WhatsApp: {link or 'no valid mobile'} (attach the PDF manually)")
        elif a.cmd == "print":
            d = app.read()
            f = {"month": parse_month(a.month or app.current_month()), "mode": a.mode, "area": a.area,
                 "location": a.location.upper() if a.location != "All" else "All", "collector": a.collector,
                 "status": a.status, "due": a.due, "ids": [x.strip().upper() for x in a.ids.split(",") if x.strip()] or None}
            print(act_print(app, f, a.language or d.settings.get("PrintLanguage") or "English"))
        elif a.cmd == "show":
            d = app.read()
            month = parse_month(a.month or app.current_month())
            print_bills(svc.select_bills(d, month, status=a.status), 10000)
        elif a.cmd == "dashboard":
            act_dashboard(app, a.month)
        elif a.cmd == "reports":
            print(export_reports(app, a.month))
        elif a.cmd in ("history", "search"):
            d = app.read()
            res = svc.search_customers(d, a.query)
            if a.cmd == "history" and len(res) == 1:
                show_history(app, res[0])
            else:
                for c in res:
                    print(f"{c['Customer ID']:<9} {c['Customer Name']:<24} {c['Location Code']:<5} VLAN {c['VLAN ID']:<6} {c['Mobile Number']:<13} {c['Customer Status']}")
                if not res:
                    print(f"Customer {a.query} was not found.")
        elif a.cmd == "check":
            act_check(app)
        elif a.cmd == "backup":
            print(bk.backup(app.workbook, app.backups, a.reason))
        elif a.cmd == "import-customers":
            act_import_customers(app, a.file, a.yes)
        elif a.cmd == "hw-template":
            print(imp.create_transcription_template(app.imports / "handwritten" / f"transcription_{dt.datetime.now():%Y%m%d_%H%M%S}.xlsx"))
        elif a.cmd == "hw-load":
            print(app.write(lambda s: imp.load_transcription(s, Path(a.file), a.batch), reason="before_handwritten_import"))
            for i in imp.open_items(Store(app.workbook, check_lock=False), a.batch):
                print(f"  Row {i['Row No']} - {i['Field']}: {i['Question']}")
        elif a.cmd == "hw-open":
            for i in imp.open_items(Store(app.workbook, check_lock=False), a.batch):
                print(f"[{i['Batch ID']}] Row {i['Row No']} - {i['Field']} (read: {i['Detected Value']}; {i['Reason']})")
        elif a.cmd == "hw-answer":
            ans = imp.parse_answers("\n".join(a.answers))
            print("\n".join(app.write(lambda s: imp.apply_answers(s, ans, a.batch))))
        elif a.cmd == "hw-commit":
            r = app.write(lambda s: imp.commit_batch(s, a.batch, (lambda r, d: True) if a.accept_duplicates else None),
                          reason=f"before_commit_{a.batch}")
            print(r)
        elif a.cmd == "build":
            from .seed import build_real
            print(build_real(Path(a.path)))
        elif a.cmd == "demo":
            from .seed import build_demo
            print(build_demo(Path(a.path) if a.path else app.root / "data" / "DEMO_CITY_LINKS_Recovery.xlsx"))
        return 0
    except UserError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 2
