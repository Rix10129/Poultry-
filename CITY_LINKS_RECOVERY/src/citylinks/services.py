"""Business logic. Pure Python (no Excel formulas needed) so it can be tested and later
moved to SQLite / PostgreSQL / a web app unchanged.

Rules enforced here:
* Customer IDs are permanent and unique; nothing renumbers them.
* Monthly billing rows are snapshots; generating a month never touches other months.
* Payments are never deleted or edited - wrong payments are voided.
* Possible duplicates are reported, never merged.
"""
from __future__ import annotations

import datetime as dt
import re
from dataclasses import dataclass, field

from . import schema as S
from .store import Store
from .util import (UserError, clean_text, digits, due_date_of, month_name, norm_key, now, parse_month,
                   previous_month, to_number)

LOC_RE = re.compile(r"^([A-Za-z]+)\s*-?\s*(\d+)$")


# =========================================================== data snapshot
@dataclass
class Data:
    settings: dict
    areas: list[dict]
    locations: list[dict]
    packages: list[dict]
    collectors: list[dict]
    customers: list[dict]
    months: list[dict]
    billing: list[dict]
    payments: list[dict]
    assignments: list[dict]
    cash: list[dict]
    events: list[dict]
    by_id: dict = field(default_factory=dict)

    def customer(self, cid: str) -> dict:
        c = self.by_id.get(clean_text(cid).upper())
        if not c:
            raise UserError(f"Customer {cid} was not found.")
        return c

    def collector_name(self, cid: str) -> str:
        for c in self.collectors:
            if c["Collector ID"] == cid:
                return clean_text(c["Collector Name"])
        return cid or "Unassigned"


def load(store: Store) -> Data:
    d = Data(
        settings=store.settings(),
        areas=store.rows(S.AREAS), locations=store.rows(S.LOCATIONS), packages=store.rows(S.PACKAGES),
        collectors=store.rows(S.COLLECTORS), customers=store.rows(S.CUSTOMERS), months=store.rows(S.MONTHS),
        billing=store.rows(S.BILLING), payments=store.rows(S.PAYMENTS), assignments=store.rows(S.ASSIGNMENTS),
        cash=store.rows(S.CASH), events=store.rows(S.EVENTS),
    )
    loc_map = location_map(d)
    pkg_fee = {clean_text(p["Package Name"]): to_number(p["Default Monthly Fee"]) for p in d.packages}
    for c in d.customers:
        derive_customer(c, loc_map, pkg_fee)
        d.by_id[c["Customer ID"].upper()] = c
    for p in d.payments:
        p["Billing ID"] = f'{parse_month_safe(p["Month"])}-{p["Customer ID"]}' if p["Month"] and p["Customer ID"] else ""
        p["Amount"] = to_number(p["Amount"]) or 0
        p["_void"] = clean_text(p.get("Voided")).lower() == "yes"
    assign = active_assignments(d)
    pays: dict[str, list] = {}
    for p in d.payments:
        if not p["_void"]:
            pays.setdefault(p["Billing ID"], []).append(p)
    allow_neg = clean_text(d.settings.get("AllowNegativeBalance")).lower() == "yes"
    grace = int(to_number(d.settings.get("OverdueGraceDays")) or 0)
    for b in d.billing:
        derive_bill(b, pays.get(b["Billing ID"], []), assign, d, allow_neg, grace)
    return d


def parse_month_safe(v) -> str:
    try:
        return parse_month(v)
    except UserError:
        return clean_text(v)


def location_map(d: Data) -> dict:
    areas = {clean_text(a["Area Code"]).upper(): a for a in d.areas}
    out = {}
    for l in d.locations:
        code = clean_text(l["Location Code"]).upper()
        a = areas.get(clean_text(l["Area Code"]).upper())
        area_name = clean_text(a["Area Name"]) if a else ""
        street = clean_text(l["Street Name"])
        out[code] = {
            "Area Code": clean_text(l["Area Code"]).upper(), "Area": area_name,
            "Area Urdu": clean_text(a.get("Area Name Urdu")) if a else "",
            "Street": street, "Full Address": f"{area_name}, {street}" if street else area_name,
            "Active": clean_text(l.get("Active")) or "Yes", "exists_area": bool(a),
        }
    return out


def derive_customer(c: dict, loc_map: dict, pkg_fee: dict):
    loc = loc_map.get(c["Location Code"].upper(), {})
    c["Area"] = loc.get("Area", "")
    c["Street"] = loc.get("Street", "")
    base = loc.get("Full Address", "")
    detail = clean_text(c.get("Address Detail"))
    c["Full Address"] = base + (", " + detail if detail else "") if base else detail
    c["Package Fee"] = pkg_fee.get(clean_text(c.get("Package")))
    override = to_number(c.get("Fee Override"))
    c["Monthly Fee"] = override if override is not None else c["Package Fee"]
    c["Customer Status"] = clean_text(c.get("Customer Status"))
    c["Customer Name"] = clean_text(c.get("Customer Name"))
    c["Due Date"] = to_number(c.get("Due Date"))


def active_assignments(d: Data) -> dict:
    out = {}
    for a in d.assignments:
        if clean_text(a.get("Assignment Status")) in ("Reassigned", "Cancelled"):
            continue
        key = f'{a["Month"]}|{a["Customer ID"]}'
        out.setdefault(key, a["Collector ID"])      # first match wins (same as Excel MATCH)
    return out


def bill_status(fee, paid) -> str:
    fee, paid = fee or 0, paid or 0
    if paid >= fee:
        return "PAID"
    return "PARTIAL" if paid > 0 else "PENDING"


def derive_bill(b, pays, assign, d: Data, allow_neg=False, grace=0, today=None):
    fee = to_number(b.get("Monthly Fee")) or 0
    paid = sum(p["Amount"] for p in pays)
    b["Monthly Fee"] = fee
    b["Amount Paid"] = paid
    b["Balance"] = fee - paid if allow_neg else max(0, fee - paid)
    b["Excess Paid"] = max(0, paid - fee)
    b["Payment Status"] = bill_status(fee, paid)
    b["Payments Count"] = len(pays)
    b["Last Payment Date"] = max((as_date(p["Payment Date"]) for p in pays if p["Payment Date"]), default=None)
    b["Collector ID"] = assign.get(f'{b["Month"]}|{b["Customer ID"]}', "")
    b["Collector Name"] = d.collector_name(b["Collector ID"]) if b["Collector ID"] else "Unassigned"
    b["Overdue"] = "OVERDUE" if is_overdue(b, today, grace) else ""
    b["_payments"] = pays


def as_date(v):
    if isinstance(v, dt.datetime):
        return v.date()
    return v if isinstance(v, dt.date) else None


def is_overdue(b, today=None, grace=0) -> bool:
    """OVERDUE = balance > 0 AND today is after (due day of the billing month + grace days).
    Due day 31 in a 30-day month means the last day of that month."""
    today = today or dt.date.today()
    due = due_date_of(b["Month"], b.get("Due Date"))
    return bool(due) and b["Balance"] > 0 and today > due + dt.timedelta(days=grace)


# ========================================================== ID generation
def next_customer_id(d: Data) -> str:
    prefix = clean_text(d.settings.get("CustomerIDPrefix") or "CL")
    width = int(to_number(d.settings.get("CustomerIDDigits")) or 4)
    nums = [int(m.group(1)) for c in d.customers
            if (m := re.fullmatch(re.escape(prefix) + r"-(\d+)", c["Customer ID"], re.I))]
    return f"{prefix}-{(max(nums) + 1 if nums else 1):0{width}d}"


def _next_seq(rows, key, prefix, width):
    nums = [int(m.group(1)) for r in rows if (m := re.fullmatch(re.escape(prefix) + r"-?(\d+)", clean_text(r.get(key))))]
    return f"{prefix}-{(max(nums) + 1 if nums else 1):0{width}d}"


# ===================================================== locations / masters
def parse_location_code(code) -> tuple[str, int]:
    s = clean_text(code).upper().replace(" ", "")
    m = LOC_RE.match(s)
    if not m:
        raise UserError(f"'{code}' is not a valid Location Code. Use Area Code + street number, e.g. A1.")
    return m.group(1), int(m.group(2))


def resolve_location(d: Data, code) -> dict:
    code = clean_text(code).upper().replace(" ", "")
    loc = location_map(d).get(code)
    if not loc:
        raise UserError(f"Location Code {code} does not exist. Add it in LOCATION_CODES first (menu: Add location code).")
    return loc


def add_area(store: Store, code: str, name: str, urdu: str = "", notes: str = ""):
    d = load(store)
    code = clean_text(code).upper()
    if not re.fullmatch(r"[A-Z]+", code):
        raise UserError("Area Code must be letters only, e.g. C.")
    if any(clean_text(a["Area Code"]).upper() == code for a in d.areas):
        raise UserError(f"Area Code {code} already exists.")
    if not clean_text(name):
        raise UserError("Area Name is missing.")
    store.t(S.AREAS).append({"Area Code": code, "Area Name": clean_text(name), "Area Name Urdu": clean_text(urdu),
                             "Active": "Yes", "Notes": notes})


def add_location(store: Store, code: str, street_name: str | None = None, notes: str = "") -> str:
    d = load(store)
    area_code, num = parse_location_code(code)
    code = f"{area_code}{num}"
    if code in location_map(d):
        raise UserError(f"Location Code {code} already exists.")
    if not any(clean_text(a["Area Code"]).upper() == area_code for a in d.areas):
        raise UserError(f"Area Code {area_code} does not exist. Add the area first (menu: Add area).")
    store.t(S.LOCATIONS).append({"Location Code": code, "Area Code": area_code, "Street Number": num,
                                 "Street Name": clean_text(street_name) or f"Gali {num}", "Active": "Yes", "Notes": notes})
    return code


# ============================================================== customers
REQUIRED_CUSTOMER = ["Customer Name", "Location Code", "VLAN ID", "Due Date", "Customer Status"]


def validate_customer(d: Data, c: dict) -> list[str]:
    errs = []
    for f in REQUIRED_CUSTOMER:
        if c.get(f) in (None, ""):
            errs.append(f"{f} is missing.")
    if c.get("Location Code"):
        try:
            resolve_location(d, c["Location Code"])
        except UserError as e:
            errs.append(str(e))
    due = to_number(c.get("Due Date"))
    if c.get("Due Date") not in (None, "") and (due is None or not float(due).is_integer() or not 1 <= due <= 31):
        errs.append("Due Date must be a day of the month from 1 to 31.")
    if c.get("Customer Status") and c["Customer Status"] not in S.CUSTOMER_STATUSES:
        errs.append(f"Customer Status must be one of: {', '.join(S.CUSTOMER_STATUSES)}.")
    pkg = clean_text(c.get("Package"))
    if pkg and pkg not in {clean_text(p["Package Name"]) for p in d.packages}:
        errs.append(f"Package {pkg} does not exist in PACKAGES.")
    fee = to_number(c.get("Fee Override"))
    if c.get("Fee Override") not in (None, "") and (fee is None or fee < 0):
        errs.append("Fee Override must be a number (0 or more).")
    pkg_fee = {clean_text(p["Package Name"]): to_number(p["Default Monthly Fee"]) for p in d.packages}
    if fee is None and pkg_fee.get(pkg) is None:
        errs.append("Monthly Fee is missing. Choose a package that has a fee, or enter a Fee Override.")
    col = clean_text(c.get("Default Collector ID"))
    if col and col not in {x["Collector ID"] for x in d.collectors}:
        errs.append(f"Collector {col} does not exist.")
    return errs


def find_possible_duplicates(d: Data, c: dict, exclude_id: str | None = None) -> list[tuple[str, str]]:
    """Returns [(customer_id, reason)]. Never merges anything."""
    out = []
    name = norm_key(c.get("Customer Name"))
    loc = clean_text(c.get("Location Code")).upper()
    mob = digits(c.get("Mobile Number"))
    vlan = clean_text(c.get("VLAN ID"))
    detail = norm_key(c.get("Address Detail"))
    for o in d.customers:
        if exclude_id and o["Customer ID"].upper() == exclude_id.upper():
            continue
        reasons = []
        if c.get("Customer ID") and o["Customer ID"].upper() == clean_text(c["Customer ID"]).upper():
            reasons.append("same Customer ID")
        if mob and len(mob) >= 7 and digits(o.get("Mobile Number")) == mob:
            reasons.append("same Mobile Number")
        if name and norm_key(o["Customer Name"]) == name and o["Location Code"].upper() == loc:
            reasons.append("same Name + Location Code")
            if detail and norm_key(o.get("Address Detail")) == detail:
                reasons.append("same Name + Address")
        if vlan and o["VLAN ID"] == vlan and o["Customer Status"] == "Active":
            reasons.append(f"VLAN {vlan} already used by an Active customer")
        if reasons:
            out.append((o["Customer ID"], "; ".join(reasons)))
    return out


def add_customer(store: Store, fields: dict, confirm_duplicates=None, created: dt.date | None = None,
                 event_note: str = "New connection") -> str:
    """Adds one customer. ``confirm_duplicates(list)`` must return True to continue when
    possible duplicates exist (None = refuse)."""
    d = load(store)
    c = {k: (clean_text(v) if isinstance(v, str) else v) for k, v in fields.items()}
    c.setdefault("Customer Status", "Active")
    c["Location Code"] = clean_text(c.get("Location Code")).upper().replace(" ", "")
    if c.get("Customer ID"):
        cid = clean_text(c["Customer ID"]).upper()
        if cid in d.by_id:
            raise UserError(f"Customer ID {cid} already exists.")
    else:
        cid = next_customer_id(d)
    c["Customer ID"] = cid
    errs = validate_customer(d, c)
    if errs:
        raise UserError("Customer not saved:\n  - " + "\n  - ".join(errs))
    dups = find_possible_duplicates(d, c)
    if dups and not (confirm_duplicates and confirm_duplicates(dups)):
        raise UserError("Possible duplicate - customer NOT saved:\n  - " +
                        "\n  - ".join(f"{i}: {r}" for i, r in dups))
    today = created or dt.date.today()
    row = {k: c.get(k) for k in S.CUSTOMERS.names if S.CUSTOMERS.col(k).kind != S.CALC}
    row["Due Date"] = int(to_number(c["Due Date"]))
    row["Fee Override"] = to_number(c.get("Fee Override"))
    row["Created Date"] = today
    row["Last Updated"] = today
    if isinstance(row.get("Connection Date"), str) and row["Connection Date"]:
        from .util import parse_date
        row["Connection Date"] = parse_date(row["Connection Date"])
    store.t(S.CUSTOMERS).append(row)
    snapshot_put(store, cid)
    log_event(store, d, cid, row.get("Connection Date") or today, "New Connection", "",
              f'{row["Location Code"]} / VLAN {row["VLAN ID"]}', event_note)
    return cid


EVENT_FOR_FIELD = {
    "Package": "Package Change", "VLAN ID": "VLAN Change", "Location Code": "Location Change",
    "Address Detail": "Address Change", "Fee Override": "Fee Change", "Due Date": "Due Date Change",
    "Mobile Number": "Mobile Change", "Customer Name": "Name Change", "Default Collector ID": "Collector Change",
}
EDITABLE_FIELDS = ["Customer Name", "Location Code", "Address Detail", "VLAN ID", "Package", "Fee Override",
                   "Due Date", "Mobile Number", "Default Collector ID", "Connection Date", "Customer Status", "Notes"]


def status_event(old: str, new: str) -> str:
    if new == "Disconnected":
        return "Disconnection"
    if new in ("Suspended", "On Hold"):
        return "Suspension"
    if new == "Active" and old in ("Suspended", "Disconnected", "On Hold"):
        return "Reactivation"
    return "Status Change"


def update_customer(store: Store, cid: str, changes: dict, event_date: dt.date | None = None, notes: str = "") -> list[str]:
    """Changes customer fields (never the Customer ID) and records one event per changed field."""
    d = load(store)
    c = d.customer(cid)
    if "Customer ID" in changes:
        raise UserError("Customer ID can never be changed.")
    bad = [k for k in changes if k not in EDITABLE_FIELDS]
    if bad:
        raise UserError(f"These fields cannot be edited here: {', '.join(bad)}")
    new = dict(c)
    for k, v in changes.items():
        new[k] = clean_text(v) if isinstance(v, str) else v
    if "Location Code" in changes:
        new["Location Code"] = clean_text(new["Location Code"]).upper().replace(" ", "")
    if "Due Date" in changes:
        new["Due Date"] = to_number(new["Due Date"])
    if "Fee Override" in changes:
        new["Fee Override"] = to_number(new["Fee Override"]) if new["Fee Override"] not in (None, "") else None
    errs = validate_customer(d, new)
    if errs:
        raise UserError("Not saved:\n  - " + "\n  - ".join(errs))
    when = event_date or dt.date.today()
    done = []
    upd = {}
    for k in changes:
        old_v, new_v = c.get(k), new.get(k)
        if clean_text(old_v) == clean_text(new_v):
            continue
        upd[k] = new_v
        if k == "Customer Status":
            et = status_event(c["Customer Status"], new_v)
        elif k == "Location Code":
            et = "Address Change"
            old_v = f'{old_v} ({c["Full Address"]})'
            new_v = f'{new_v} ({resolve_location(d, new_v)["Full Address"]})'
        else:
            et = EVENT_FOR_FIELD.get(k, "Other")
        if k in ("Notes",):
            continue
        log_event(store, d, c["Customer ID"], when, et, clean_text(old_v), clean_text(new_v), notes or f"{k} changed")
        done.append(f"{k}: {clean_text(old_v)} -> {clean_text(new_v)}")
    if upd:
        upd["Last Updated"] = dt.date.today()
        store.t(S.CUSTOMERS).update(c["_row"], upd)
    snapshot_put(store, c["Customer ID"])
    return done


def log_event(store: Store, d: Data | None, cid, when, etype, old, new, notes=""):
    rows = store.rows(S.EVENTS)
    eid = _next_seq(rows, "Event ID", "EV", 6)
    store.t(S.EVENTS).append({"Event ID": eid, "Customer ID": cid, "Event Date": when, "Event Type": etype,
                              "Old Value": old, "New Value": new, "Notes": notes, "Recorded At": now()})
    return eid


# -- change detection for edits made directly in Excel -----------------------
SNAP_FIELDS = ["Customer Name", "Location Code", "Address Detail", "VLAN ID", "Package", "Fee Override",
               "Due Date", "Mobile Number", "Customer Status"]


def _snapshot_sheet(store: Store):
    if "_SNAPSHOT" not in store.wb.sheetnames:
        ws = store.wb.create_sheet("_SNAPSHOT")
        ws.sheet_state = "veryHidden"
        ws.append(["Customer ID"] + SNAP_FIELDS)
    return store.wb["_SNAPSHOT"]


def snapshot_put(store: Store, cid: str):
    """Record the current values of ONE customer (other customers' unsynced Excel edits stay detectable)."""
    ws = _snapshot_sheet(store)
    c = next((x for x in store.rows(S.CUSTOMERS) if x["Customer ID"].upper() == cid.upper()), None)
    if c is None:
        return
    vals = [c["Customer ID"]] + [clean_text(c.get(f)) for f in SNAP_FIELDS]
    for r in range(2, ws.max_row + 1):
        if clean_text(ws.cell(r, 1).value).upper() == cid.upper():
            for i, v in enumerate(vals, 1):
                ws.cell(r, i).value = v
            return
    ws.append(vals)


def refresh_snapshot(store: Store):
    ws = _snapshot_sheet(store)
    ws.delete_rows(2, ws.max_row)
    for c in store.rows(S.CUSTOMERS):
        ws.append([c["Customer ID"]] + [clean_text(c.get(f)) for f in SNAP_FIELDS])


def sync_events(store: Store) -> list[str]:
    """Finds customer fields edited directly in Excel since the last check and records them
    in CUSTOMER_EVENTS (old -> new). Only adds history; never changes customer data."""
    ws = _snapshot_sheet(store)
    old = {}
    for row in ws.iter_rows(min_row=2, values_only=True):
        if row and row[0]:
            old[clean_text(row[0]).upper()] = dict(zip(SNAP_FIELDS, [clean_text(v) for v in row[1:]]))
    found = []
    if old:
        d = load(store)
        for c in d.customers:
            o = old.get(c["Customer ID"].upper())
            if not o:
                continue
            for f in SNAP_FIELDS:
                nv = clean_text(c.get(f))
                if f == "Due Date" and c.get(f) is not None:
                    nv = clean_text(int(c[f]) if float(c[f]).is_integer() else c[f])
                ov = o.get(f, "")
                if f == "Due Date" and ov:
                    ov = clean_text(to_number(ov))
                if nv != ov:
                    et = status_event(ov, nv) if f == "Customer Status" else (
                        "Address Change" if f == "Location Code" else EVENT_FOR_FIELD.get(f, "Other"))
                    log_event(store, d, c["Customer ID"], dt.date.today(), et, ov, nv,
                              "Detected by system: changed directly in the workbook")
                    found.append(f'{c["Customer ID"]} {f}: {ov} -> {nv}')
    refresh_snapshot(store)
    return found


# ================================================================= search
SEARCH_FIELDS = ["Customer ID", "Customer Name", "Mobile Number", "VLAN ID", "Location Code", "Area"]


def search_customers(d: Data, text: str, field: str | None = None) -> list[dict]:
    """Case-insensitive search. An exact Customer ID match is returned alone.
    No fuzzy matching - the operator must confirm when several customers match."""
    q = norm_key(text)
    if not q:
        return []
    exact = d.by_id.get(clean_text(text).upper())
    if exact and field in (None, "Customer ID"):
        return [exact]
    fields = [field] if field else SEARCH_FIELDS
    qd = digits(text)
    out = []
    for c in d.customers:
        for f in fields:
            v = c.get(f)
            if f == "Mobile Number":
                if qd and len(qd) >= 4 and qd in digits(v):
                    out.append(c)
                    break
            elif q in norm_key(v):
                out.append(c)
                break
    return out


# ======================================================= month generation
def month_exists(d: Data, month: str) -> bool:
    return any(m["Month"] == month for m in d.months) or any(b["Month"] == month for b in d.billing)


def billing_row(c: dict, month: str) -> dict:
    return {
        "Billing ID": f'{month}-{c["Customer ID"]}', "Month": month, "Month Name": month_name(month),
        "Customer ID": c["Customer ID"], "Customer Name": c["Customer Name"], "Location Code": c["Location Code"],
        "Area": c["Area"], "Street": c["Street"], "Full Address": c["Full Address"], "VLAN ID": c["VLAN ID"],
        "Package": clean_text(c.get("Package")), "Due Date": int(c["Due Date"]) if c.get("Due Date") else None,
        "Monthly Fee": c["Monthly Fee"], "Created At": now(),
    }


def sort_key(c):
    try:
        a, n = parse_location_code(c["Location Code"])
    except UserError:
        a, n = "~", 0
    return (a, n, c["Customer ID"])


def check_month_ready(d: Data) -> tuple[list[dict], list[str]]:
    """Active customers that can be billed, and problems for those that cannot."""
    ok, problems = [], []
    for c in d.customers:
        if c["Customer Status"] != "Active":
            continue
        errs = []
        if c["Monthly Fee"] in (None, ""):
            errs.append("Monthly Fee is missing")
        if not c["VLAN ID"]:
            errs.append("VLAN ID is missing")
        if not c["Area"]:
            errs.append(f'Location Code {c["Location Code"] or "(blank)"} does not exist')
        if not c.get("Due Date"):
            errs.append("Due Date is missing")
        if errs:
            problems.append(f'{c["Customer ID"]} {c["Customer Name"]}: ' + ", ".join(errs))
        else:
            ok.append(c)
    return ok, problems


@dataclass
class MonthResult:
    month: str
    billed: int
    skipped: list[str]
    assigned: int
    total: float


def generate_month(store: Store, month, skip_invalid: bool = False, carry_assignments: bool = True,
                   set_current: bool = True) -> MonthResult:
    month = parse_month(month)
    d = load(store)
    if month_exists(d, month):
        raise UserError(f"{month_name(month)} billing already exists. It was NOT created again.")
    ok, problems = check_month_ready(d)
    if problems and not skip_invalid:
        raise UserError("Some Active customers have missing/invalid data. Fix them first (or choose to skip them):\n  - "
                        + "\n  - ".join(problems))
    if not ok:
        raise UserError("There are no Active customers to bill.")
    ok.sort(key=sort_key)
    bt = store.t(S.BILLING)
    for c in ok:
        bt.append(billing_row(c, month))
    # collector assignments: customer's default collector, else last month's collector
    assigned = 0
    if carry_assignments:
        prev = previous_month(month)
        prev_assign = {k.split("|", 1)[1]: v for k, v in active_assignments(d).items() if k.startswith(prev + "|")}
        active_cols = {x["Collector ID"] for x in d.collectors if clean_text(x.get("Active")) != "No"}
        rows = store.rows(S.ASSIGNMENTS)
        seq = _next_seq(rows, "Assignment ID", "AS", 6)
        n = int(seq.split("-")[1])
        for c in ok:
            col = clean_text(c.get("Default Collector ID")) or prev_assign.get(c["Customer ID"], "")
            if col and col in active_cols:
                store.t(S.ASSIGNMENTS).append({
                    "Assignment ID": f"AS-{n:06d}", "Month": month, "Customer ID": c["Customer ID"], "Collector ID": col,
                    "Assigned Date": dt.date.today(), "Assignment Status": "Assigned",
                    "Remarks": "Auto: default collector" if c.get("Default Collector ID") else f"Auto: carried from {prev}"})
                n += 1
                assigned += 1
    for col in d.collectors:
        if clean_text(col.get("Active")) != "No":
            store.t(S.CASH).append({"Month": month, "Collector ID": col["Collector ID"]})
    total = sum(c["Monthly Fee"] for c in ok)
    store.t(S.MONTHS).append({"Month": month, "Month Name": month_name(month), "Generated At": now(),
                              "Billing Records": len(ok),
                              "Notes": f"{len(problems)} customer(s) skipped" if problems else ""})
    if set_current:
        store.set_setting("CurrentMonth", month)
    return MonthResult(month, len(ok), problems if skip_invalid else [], assigned, total)


def add_customer_to_month(store: Store, cid: str, month) -> str:
    """Bill one customer for a month that was already generated (e.g. new connection mid-month)."""
    month = parse_month(month)
    d = load(store)
    c = d.customer(cid)
    if not month_exists(d, month):
        raise UserError(f"{month_name(month)} has not been generated yet.")
    bid = f'{month}-{c["Customer ID"]}'
    if any(b["Billing ID"] == bid for b in d.billing):
        raise UserError(f'{c["Customer ID"]} already has a bill for {month_name(month)}.')
    if c["Customer Status"] != "Active":
        raise UserError(f'{c["Customer ID"]} is {c["Customer Status"]}. Only Active customers are billed.')
    if c["Monthly Fee"] in (None, ""):
        raise UserError("Monthly Fee is missing.")
    if not c["VLAN ID"]:
        raise UserError("VLAN ID is missing.")
    if not c["Area"]:
        raise UserError(f'Location Code {c["Location Code"]} does not exist.')
    store.t(S.BILLING).append(billing_row(c, month))
    return bid


# ================================================================ payments
def record_payment(store: Store, customer_id: str, month, amount, pay_date, method: str = "Cash",
                   collector_id: str = "", reference: str = "", remarks: str = "", allow_overpay: bool = False) -> str:
    month = parse_month(month)
    d = load(store)
    c = d.customer(customer_id)
    amt = to_number(amount)
    if amt is None:
        raise UserError("Payment amount is missing.")
    if amt < 0:
        raise UserError("Payment amount cannot be negative.")
    if amt == 0:
        raise UserError("Payment amount must be more than 0.")
    if method not in S.PAYMENT_METHODS:
        raise UserError(f"Payment Method must be one of: {', '.join(S.PAYMENT_METHODS)}.")
    collector_id = clean_text(collector_id)
    if collector_id and collector_id not in {x["Collector ID"] for x in d.collectors}:
        raise UserError(f"Collector {collector_id} does not exist.")
    bid = f'{month}-{c["Customer ID"]}'
    bill = next((b for b in d.billing if b["Billing ID"] == bid), None)
    if not bill:
        raise UserError(f'No bill exists for {c["Customer ID"]} in {month_name(month)}. Generate the month or add the customer to it first.')
    if amt > bill["Balance"] and not allow_overpay:
        raise UserError(f'Amount {amt:,.0f} is more than the remaining balance {bill["Balance"]:,.0f}. Confirm overpayment to save it.')
    if not isinstance(pay_date, (dt.date, dt.datetime)):
        from .util import parse_date
        pay_date = parse_date(pay_date)
    pid = _next_seq(d.payments, "Payment ID", "PAY", 6)
    store.t(S.PAYMENTS).append({
        "Payment ID": pid, "Customer ID": c["Customer ID"], "Month": month, "Payment Date": pay_date, "Amount": amt,
        "Payment Method": method, "Collector ID": collector_id, "Reference": reference, "Remarks": remarks,
        "Voided": "No", "Created At": now()})
    return pid


def void_payment(store: Store, payment_id: str, reason: str):
    if not clean_text(reason):
        raise UserError("A reason is required to void a payment.")
    for p in store.rows(S.PAYMENTS):
        if p["Payment ID"].upper() == clean_text(payment_id).upper():
            if clean_text(p.get("Voided")).lower() == "yes":
                raise UserError(f"Payment {payment_id} is already voided.")
            store.t(S.PAYMENTS).update(p["_row"], {"Voided": "Yes", "Void Reason": reason})
            return
    raise UserError(f"Payment {payment_id} was not found.")


def bill_for(d: Data, cid: str, month: str) -> dict | None:
    bid = f"{month}-{cid}"
    return next((b for b in d.billing if b["Billing ID"] == bid), None)


# ============================================================ assignments
def assign_collector(store: Store, month, collector_id: str, customer_ids: list[str], remarks: str = "") -> tuple[int, int]:
    """Assign customers' bills for a month to a collector. Previous assignments are kept
    but marked Reassigned. Returns (assigned, already_with_this_collector)."""
    month = parse_month(month)
    d = load(store)
    if collector_id not in {x["Collector ID"] for x in d.collectors}:
        raise UserError(f"Collector {collector_id} does not exist.")
    billed = {b["Customer ID"] for b in d.billing if b["Month"] == month}
    if not billed:
        raise UserError(f"{month_name(month)} billing does not exist yet. Generate the month first.")
    t = store.t(S.ASSIGNMENTS)
    rows = store.rows(S.ASSIGNMENTS)
    n = int(_next_seq(rows, "Assignment ID", "AS", 6).split("-")[1])
    done = same = 0
    for cid in customer_ids:
        if cid not in billed:
            continue
        current = [a for a in rows if a["Month"] == month and a["Customer ID"] == cid
                   and clean_text(a.get("Assignment Status")) not in ("Reassigned", "Cancelled")]
        if any(a["Collector ID"] == collector_id for a in current):
            same += 1
            continue
        for a in current:
            t.update(a["_row"], {"Assignment Status": "Reassigned",
                                 "Remarks": (clean_text(a.get("Remarks")) + f" | reassigned to {collector_id} on {dt.date.today():%d-%m-%Y}").strip(" |")})
        t.append({"Assignment ID": f"AS-{n:06d}", "Month": month, "Customer ID": cid, "Collector ID": collector_id,
                  "Assigned Date": dt.date.today(), "Assignment Status": "Assigned", "Remarks": remarks})
        n += 1
        done += 1
    return done, same


# ====================================================== filters & reports
def select_bills(d: Data, month, area="All", location="All", collector="All", status="All", due="All",
                 customer_ids: list[str] | None = None, mode: str | None = None, sort_by_due: bool = False) -> list[dict]:
    """Same logic as the PRINT_CENTER (status UNPAID = PENDING + PARTIAL)."""
    month = parse_month(month)
    if mode == "Pending Recovery" and status == "All":
        status = "UNPAID"
    if mode == "Partial Payment Recovery" and status == "All":
        status = "PARTIAL"
    ids = {i.upper() for i in customer_ids} if customer_ids else None
    out = []
    for b in d.billing:
        if b["Month"] != month:
            continue
        if area != "All" and norm_key(b["Area"]) != norm_key(area):
            continue
        if location != "All" and b["Location Code"].upper() != clean_text(location).upper():
            continue
        if collector != "All" and collector not in (b["Collector ID"], b["Collector Name"]):
            continue
        if due != "All" and to_number(b["Due Date"]) != to_number(due):
            continue
        st = status.upper() if isinstance(status, str) else status
        if st == "UNPAID" and b["Balance"] <= 0:
            continue
        if st in ("PAID", "PARTIAL", "PENDING") and b["Payment Status"] != st:
            continue
        if st == "OVERDUE" and b["Overdue"] != "OVERDUE":
            continue
        if ids is not None and b["Customer ID"].upper() not in ids:
            continue
        out.append(b)
    if sort_by_due or mode == "Due-Date-wise Recovery":
        out.sort(key=lambda b: (b["Due Date"] or 99,) + sort_key(b))
    return out


def totals(bills: list[dict]) -> dict:
    fee = sum(b["Monthly Fee"] for b in bills)
    paid = sum(b["Amount Paid"] for b in bills)
    bal = sum(b["Balance"] for b in bills)
    return {"customers": len(bills), "billing": fee, "recovered": paid, "pending": bal,
            "paid": sum(1 for b in bills if b["Payment Status"] == "PAID"),
            "partial": sum(1 for b in bills if b["Payment Status"] == "PARTIAL"),
            "pending_count": sum(1 for b in bills if b["Payment Status"] == "PENDING"),
            "partial_balance": sum(b["Balance"] for b in bills if b["Payment Status"] == "PARTIAL"),
            "overdue": sum(1 for b in bills if b["Overdue"]),
            "recovery_pct": (paid / fee) if fee else 0.0}


def dashboard(d: Data, month, today: dt.date | None = None) -> dict:
    month = parse_month(month)
    today = today or dt.date.today()
    bills = [b for b in d.billing if b["Month"] == month]
    t = totals(bills)
    y, m = int(month[:4]), int(month[5:7])
    valid = [p for p in d.payments if not p["_void"]]
    res = {
        "month": month,
        "total_customers": len(d.customers),
        "active": sum(1 for c in d.customers if c["Customer Status"] == "Active"),
        "suspended": sum(1 for c in d.customers if c["Customer Status"] == "Suspended"),
        "disconnected": sum(1 for c in d.customers if c["Customer Status"] == "Disconnected"),
        "on_hold": sum(1 for c in d.customers if c["Customer Status"] == "On Hold"),
        "today_collection": sum(p["Amount"] for p in valid if as_date(p["Payment Date"]) == today),
        "calendar_month_collection": sum(p["Amount"] for p in valid if (dd := as_date(p["Payment Date"])) and dd.year == y and dd.month == m),
        "outstanding_all": sum(b["Balance"] for b in d.billing),
        **t,
    }
    return res


def area_summary(d: Data, month) -> list[dict]:
    month = parse_month(month)
    out = []
    for a in d.areas:
        name = clean_text(a["Area Name"])
        bills = [b for b in d.billing if b["Month"] == month and b["Area"] == name]
        t = totals(bills)
        out.append({"Area": name,
                    "Customers": sum(1 for c in d.customers if c["Area"] == name),
                    "Active Customers": sum(1 for c in d.customers if c["Area"] == name and c["Customer Status"] == "Active"),
                    "Billed": t["customers"], "Monthly Billing": t["billing"], "Recovered": t["recovered"],
                    "Pending Balance": t["pending"], "Paid": t["paid"], "Partial": t["partial"],
                    "Pending": t["pending_count"], "Recovery %": t["recovery_pct"]})
    return out


def location_summary(d: Data, month) -> list[dict]:
    month = parse_month(month)
    out = []
    for code, loc in sorted(location_map(d).items(), key=lambda kv: sort_key({"Location Code": kv[0], "Customer ID": ""})):
        bills = [b for b in d.billing if b["Month"] == month and b["Location Code"].upper() == code]
        t = totals(bills)
        out.append({"Location Code": code, "Full Address": loc["Full Address"], "Billed": t["customers"],
                    "Monthly Billing": t["billing"], "Recovered": t["recovered"], "Pending Balance": t["pending"],
                    "Unpaid Customers": t["partial"] + t["pending_count"], "Recovery %": t["recovery_pct"]})
    return out


def cash_reconciliation(d: Data, month) -> list[dict]:
    """Expected = cash payments recorded under the collector for the month (not voided).
    Difference = Actual - Expected. Shown neutrally as 'Cash Difference'."""
    month = parse_month(month)
    out = []
    cash_rows = {c["Collector ID"]: c for c in d.cash if c["Month"] == month}
    for col in d.collectors:
        cid = col["Collector ID"]
        pays = [p for p in d.payments if not p["_void"] and p["Collector ID"] == cid and parse_month_safe(p["Month"]) == month]
        expected = sum(p["Amount"] for p in pays if p["Payment Method"] == "Cash")
        non_cash = sum(p["Amount"] for p in pays) - expected
        row = cash_rows.get(cid, {})
        actual = to_number(row.get("Actual Cash Submitted"))
        diff = None if actual is None else actual - expected
        bills = [b for b in d.billing if b["Month"] == month and b["Collector ID"] == cid]
        t = totals(bills)
        out.append({"Collector ID": cid, "Collector Name": clean_text(col["Collector Name"]),
                    "Assigned Customers": t["customers"], "Assigned Billing": t["billing"], "Recovered": t["recovered"],
                    "Pending Balance": t["pending"], "Partial": t["partial"], "Pending": t["pending_count"],
                    "Recovery %": t["recovery_pct"],
                    "Expected Cash": expected, "Non Cash Collected": non_cash, "Actual Cash": actual, "Difference": diff,
                    "Status": "NOT SUBMITTED" if actual is None else ("MATCHED" if diff == 0 else "CASH DIFFERENCE"),
                    "Remarks": clean_text(row.get("Remarks"))})
    return out


def set_cash_submitted(store: Store, month, collector_id: str, amount, when=None, received_by="", remarks=""):
    month = parse_month(month)
    amt = to_number(amount)
    if amt is None or amt < 0:
        raise UserError("Cash amount must be 0 or more.")
    d = load(store)
    if collector_id not in {x["Collector ID"] for x in d.collectors}:
        raise UserError(f"Collector {collector_id} does not exist.")
    vals = {"Actual Cash Submitted": amt, "Submission Date": when or dt.date.today(), "Received By": received_by}
    if remarks:
        vals["Remarks"] = remarks
    for r in store.rows(S.CASH):
        if r["Month"] == month and r["Collector ID"] == collector_id:
            store.t(S.CASH).update(r["_row"], vals)
            return
    store.t(S.CASH).append({"Month": month, "Collector ID": collector_id, **vals})


def monthly_comparison(d: Data, month_a, month_b) -> dict:
    a = totals([b for b in d.billing if b["Month"] == parse_month(month_a)])
    b = totals([x for x in d.billing if x["Month"] == parse_month(month_b)])
    return {"a": a, "b": b}


def customer_history(d: Data, cid: str, start: str | None = None, end: str | None = None) -> dict:
    c = d.customer(cid)
    start = parse_month(start) if start and start != "All" else None
    end = parse_month(end) if end and end != "All" else None
    bills = sorted((b for b in d.billing if b["Customer ID"] == c["Customer ID"]
                    and (not start or b["Month"] >= start) and (not end or b["Month"] <= end)), key=lambda b: b["Month"])
    pays = sorted((p for p in d.payments if p["Customer ID"] == c["Customer ID"] and not p["_void"]
                   and (not start or parse_month_safe(p["Month"]) >= start) and (not end or parse_month_safe(p["Month"]) <= end)),
                  key=lambda p: (as_date(p["Payment Date"]) or dt.date.min, p["Payment ID"]))
    last = pays[-1] if pays else None
    last_date = as_date(last["Payment Date"]) if last else None
    return {
        "customer": c, "bills": bills, "payments": pays,
        "events": [e for e in d.events if e["Customer ID"] == c["Customer ID"]],
        "total_billing": sum(b["Monthly Fee"] for b in bills),
        "total_paid": sum(b["Amount Paid"] for b in bills),
        "total_outstanding": sum(b["Balance"] for b in bills),
        "last_payment_date": last_date,
        "last_payment_amount": sum(p["Amount"] for p in pays if as_date(p["Payment Date"]) == last_date) if last else None,
        "period": (start or "All", end or "All"),
    }


# ============================================================ data checks
def check_data(d: Data) -> list[str]:
    issues = []
    seen = {}
    for c in d.customers:
        cid = c["Customer ID"].upper()
        if cid in seen:
            issues.append(f"Customer ID {c['Customer ID']} already exists (rows {seen[cid]} and {c['_row']}).")
        seen[cid] = c["_row"]
        errs = validate_customer(d, c)
        for e in errs:
            issues.append(f"{c['Customer ID']} (row {c['_row']}): {e}")
    reported = set()
    for c in d.customers:
        for oid, why in find_possible_duplicates(d, c, exclude_id=c["Customer ID"]):
            pair = tuple(sorted([c["Customer ID"], oid]))
            if pair not in reported:
                reported.add(pair)
                issues.append(f"Possible duplicate: {pair[0]} and {pair[1]} ({why}) - please check, nothing was merged.")
    bill_ids = {b["Billing ID"] for b in d.billing}
    seen_b = set()
    for b in d.billing:
        if b["Billing ID"] in seen_b:
            issues.append(f"Billing ID {b['Billing ID']} appears twice in MONTHLY_BILLING.")
        seen_b.add(b["Billing ID"])
    pids = set()
    for p in d.payments:
        if p["Payment ID"] in pids:
            issues.append(f"Payment ID {p['Payment ID']} appears twice.")
        pids.add(p["Payment ID"])
        if p["Billing ID"] and p["Billing ID"] not in bill_ids:
            issues.append(f"Payment {p['Payment ID']}: no bill for {p['Customer ID']} in {p['Month']}.")
        if p["Amount"] <= 0:
            issues.append(f"Payment {p['Payment ID']}: amount must be more than 0.")
        if not p.get("Payment Date"):
            issues.append(f"Payment {p['Payment ID']}: payment date missing.")
    codes = {}
    for l in d.locations:
        k = clean_text(l["Location Code"]).upper()
        if k in codes:
            issues.append(f"Location Code {k} appears twice in LOCATION_CODES.")
        codes[k] = 1
    return issues
