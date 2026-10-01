"""Initial workbooks.

* build_real(): the operating workbook. Contains ONLY setup data the owner gave us
  (A = Arif Town, B = Arai Colony, streets 1-3 as examples) plus clearly marked
  EXAMPLE packages and PLACEHOLDER collectors to edit. NO customers.
* build_demo(): a separate DEMO workbook with clearly labelled sample customers
  ("[DEMO] ...") for training and testing. Never mix it with real data.
"""
from __future__ import annotations

import datetime as dt
import random
import warnings
from pathlib import Path

from . import schema as S
from . import services as svc
from .builder import build_workbook
from .store import Store

warnings.filterwarnings("ignore", category=UserWarning, module="openpyxl")

AREAS = [
    {"Area Code": "A", "Area Name": "Arif Town", "Area Name Urdu": "عارف ٹاؤن", "Active": "Yes", "Notes": ""},
    {"Area Code": "B", "Area Name": "Arai Colony", "Area Name Urdu": "آرائیں کالونی", "Active": "Yes", "Notes": ""},
]
LOCATIONS = [{"Location Code": f"{a}{n}", "Area Code": a, "Street Number": n, "Street Name": f"Gali {n}",
              "Active": "Yes", "Notes": "Add more streets with the next number (e.g. A4)" if n == 3 else ""}
             for a in "AB" for n in (1, 2, 3)]
PACKAGES = [
    {"Package ID": "PKG-01", "Package Name": "Basic", "Speed": "10 Mbps", "Default Monthly Fee": 1300, "Active": "Yes", "Notes": "EXAMPLE - edit to your real package"},
    {"Package ID": "PKG-02", "Package Name": "Standard", "Speed": "15 Mbps", "Default Monthly Fee": 1500, "Active": "Yes", "Notes": "EXAMPLE - edit to your real package"},
    {"Package ID": "PKG-03", "Package Name": "Premium", "Speed": "20 Mbps", "Default Monthly Fee": 1800, "Active": "Yes", "Notes": "EXAMPLE - edit to your real package"},
]
COLLECTORS = [
    {"Collector ID": "B01", "Collector Name": "Ali", "Mobile": "", "Active": "Yes", "Notes": "PLACEHOLDER - edit name/mobile"},
    {"Collector ID": "B02", "Collector Name": "Bilal", "Mobile": "", "Active": "Yes", "Notes": "PLACEHOLDER - edit name/mobile"},
    {"Collector ID": "B03", "Collector Name": "Asad", "Mobile": "", "Active": "Yes", "Notes": "PLACEHOLDER - edit name/mobile"},
]


def _seed():
    return {"tblAreas": AREAS, "tblLocations": LOCATIONS, "tblPackages": PACKAGES, "tblCollectors": COLLECTORS}


def build_real(path: Path, current_month: str | None = None) -> Path:
    s = {"WorkbookType": "REAL DATA"}
    if current_month:
        s["CurrentMonth"] = current_month
    build_workbook(path, s, _seed())
    st = Store(path)
    svc.refresh_snapshot(st)
    st.save()
    return path


DEMO_NAMES = [
    "Shahid Mahmood", "شاہد محمود", "Imran Ali", "عمران علی", "Naveed Akhtar", "Bilal Ahmed", "خالد محمود", "Asif Iqbal",
    "Tariq Mehmood", "طارق محمود", "Usman Ghani", "Kashif Raza", "Sajid Hussain", "ساجد حسین", "Faisal Nawaz", "Adnan Shah",
    "Zubair Khan", "زبیر خان", "Hamid Latif", "Waqas Ahmad", "Rizwan Saleem", "رضوان سلیم", "Nadeem Abbas", "Akram Javed",
    "Javed Iqbal", "جاوید اقبال", "Arshad Mehmood", "Majid Ali", "Shoaib Akhtar", "شعیب اختر", "Yasir Arafat", "Qasim Raza",
]


def build_demo(path: Path, months=("2026-08", "2026-09", "2026-10"), today: dt.date | None = None) -> Path:
    """Sample data generated through the normal service functions (so it also exercises them)."""
    rnd = random.Random(2026)
    today = today or dt.date(2026, 10, 1)
    build_workbook(path, {"WorkbookType": "DEMO - SAMPLE DATA", "CurrentMonth": months[0]}, _seed())
    st = Store(path)
    pkgs = ["Basic", "Standard", "Premium"]
    cols = ["B01", "B02", "B03"]
    for i, nm in enumerate(DEMO_NAMES):
        loc = f"{'AB'[i % 2]}{(i // 2) % 3 + 1}"
        fields = {
            "Customer Name": f"[DEMO] {nm}", "Location Code": loc, "VLAN ID": str(400 + i * 2 + (1 if i % 5 == 0 else 0)),
            "Package": pkgs[i % 3], "Due Date": (10, 5, 15, 20)[i % 4],
            "Mobile Number": f"0300-{1000000 + i * 7919:07d}", "Customer Status": "Active",
            "Default Collector ID": cols[0] if loc.startswith("A") else (cols[1] if loc in ("B1", "B2") else cols[2]),
            "Connection Date": dt.date(2025, 1 + i % 12, 1 + i % 27), "Notes": "DEMO sample customer - not real",
        }
        if i in (0,):
            fields.update({"Package": "", "Fee Override": 1300, "VLAN ID": "405", "Due Date": 10})   # example row from the owner's sheet
        if i in (7, 19):
            fields["Fee Override"] = 1200     # special price example
        svc.add_customer(st, fields, confirm_duplicates=lambda d: True, created=dt.date(2026, 7, 25))
    svc.refresh_snapshot(st)
    st.save()

    for mi, month in enumerate(months):
        st = Store(path)
        svc.generate_month(st, month, set_current=True)
        d = svc.load(st)
        bills = [b for b in d.billing if b["Month"] == month]
        y, m = int(month[:4]), int(month[5:7])
        last_month = mi == len(months) - 1
        for b in bills:
            r = rnd.random()
            fee = b["Monthly Fee"]
            col = b["Collector ID"]
            day = lambda: dt.date(y, m, 1 if last_month else rnd.randint(2, 25))
            if last_month and r < 0.5:
                continue                                            # current month: many still pending
            if r < 0.72:
                svc.record_payment(st, b["Customer ID"], month, fee, day(), "Cash", col)
            elif r < 0.85:
                svc.record_payment(st, b["Customer ID"], month, fee // 3, day(), "Cash", col)
                svc.record_payment(st, b["Customer ID"], month, fee // 3, day(), "Cash", col)
                if r < 0.8:
                    svc.record_payment(st, b["Customer ID"], month, fee - 2 * (fee // 3), day(), "JazzCash", col, "JC-DEMO")
            elif r < 0.93:
                svc.record_payment(st, b["Customer ID"], month, 500, day(), "Cash", col)
        if not last_month:
            for rec in svc.cash_reconciliation(svc.load(st), month):
                diff = -2000 if (rec["Collector ID"] == "B02" and mi == 1) else 0
                svc.set_cash_submitted(st, month, rec["Collector ID"], rec["Expected Cash"] + diff,
                                       dt.date(y, m, 28), "Office (DEMO)",
                                       "DEMO: difference under discussion" if diff else "")
        if mi == 0:
            svc.update_customer(st, "CL-0001", {"VLAN ID": "407"}, dt.date(2026, 8, 20), "DEMO: VLAN moved to new switch port")
            svc.update_customer(st, "CL-0012", {"Customer Status": "Disconnected"}, dt.date(2026, 8, 30), "DEMO: customer left")
            svc.update_customer(st, "CL-0020", {"Customer Status": "Suspended"}, dt.date(2026, 8, 30), "DEMO: unpaid 2 months")
        if mi == 1:
            svc.update_customer(st, "CL-0020", {"Customer Status": "Active"}, dt.date(2026, 9, 15), "DEMO: paid and reconnected")
            svc.update_customer(st, "CL-0005", {"Package": "Premium"}, dt.date(2026, 9, 10), "DEMO: upgrade")
        st.save()
    st = Store(path)
    st.named_cell("CH_SearchText").value = "CL-0001"
    st.named_cell("ST_CustomerID").value = "CL-0001"
    st.named_cell("PE_CustomerID").value = "CL-0001"
    st.named_cell("PC_Area").value = "Arif Town"
    st.named_cell("PC_Status").value = "UNPAID"
    st.save()
    return path
