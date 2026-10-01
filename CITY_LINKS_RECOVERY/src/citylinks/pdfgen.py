"""PDF output: customer statements and recovery lists (English or Urdu/RTL).

Uses fpdf2 with HarfBuzz text shaping (package ``uharfbuzz``) so Urdu names are joined
and ordered right-to-left correctly.  The bundled FreeSerif font covers Urdu letters.
"""
from __future__ import annotations

import datetime as dt
import os
import warnings
from pathlib import Path

from fpdf import FPDF
from fpdf.fonts import FontFace

from .schema import PRINT_COLUMNS, PRINT_COLUMNS_UR, STATUS_UR
from .util import clean_text, fmt_date, money, month_name, safe_filename

ROOT = Path(__file__).resolve().parents[2]
FONT_CANDIDATES = [
    (ROOT / "fonts" / "FreeSerif.ttf", ROOT / "fonts" / "FreeSerifBold.ttf"),
    (Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts" / "arial.ttf", Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts" / "arialbd.ttf"),
    (Path("/usr/share/fonts/truetype/freefont/FreeSerif.ttf"), Path("/usr/share/fonts/truetype/freefont/FreeSerifBold.ttf")),
]
NAVY = (31, 56, 100)
GREY = (89, 89, 89)
LIGHT = (217, 225, 242)


def shaping_available() -> bool:
    try:
        import uharfbuzz  # noqa: F401
        return True
    except ImportError:
        return False


class Doc(FPDF):
    def __init__(self, settings: dict, orientation="P", header_lines=None, rtl=False):
        super().__init__(orientation=orientation, unit="mm", format="A4")
        self.settings = settings
        self.header_lines = header_lines or []
        self.rtl = rtl
        regular, bold = next(((r, b) for r, b in FONT_CANDIDATES if r.exists()), (None, None))
        if regular is None:
            raise RuntimeError("No Unicode font found. Put FreeSerif.ttf in the fonts folder.")
        self.add_font("Main", "", str(regular))
        self.add_font("Main", "B", str(bold if bold and bold.exists() else regular))
        if shaping_available():
            self.set_text_shaping(True)
        else:
            warnings.warn("uharfbuzz is not installed: Urdu text in PDFs will not be shaped correctly. "
                          "Run: pip install uharfbuzz")
        self.set_auto_page_break(True, margin=16)
        self.set_margins(10, 10, 10)
        self.alias_nb_pages()
        self.demo = clean_text(settings.get("WorkbookType")).upper() not in ("", "REAL DATA")

    def header(self):
        s = self.settings
        if self.demo:
            self.set_font("Main", "B", 9)
            self.set_text_color(192, 0, 0)
            self.cell(0, 4, "DEMO / SAMPLE DATA - NOT A REAL CUSTOMER DOCUMENT", align="C", new_x="LMARGIN", new_y="NEXT")
        self.set_text_color(*NAVY)
        self.set_font("Main", "B", 20 if self.page_no() == 1 else 12)
        self.cell(0, 9 if self.page_no() == 1 else 6, clean_text(s.get("CompanyName")), align="C", new_x="LMARGIN", new_y="NEXT")
        self.set_text_color(*GREY)
        self.set_font("Main", "B", 10)
        line = clean_text(s.get("Tagline"))
        extra = " | ".join(x for x in (clean_text(s.get("CompanyPhone")), clean_text(s.get("CompanyAddress"))) if x)
        self.cell(0, 5, line + (f"  |  {extra}" if extra else ""), align="C", new_x="LMARGIN", new_y="NEXT")
        self.set_text_color(0, 0, 0)
        for i, (txt, size) in enumerate(self.header_lines):
            if self.page_no() > 1 and i == 0:
                size = min(size, 11)
            self.set_font("Main", "B", size)
            self.cell(0, size * 0.5, txt, align="C", new_x="LMARGIN", new_y="NEXT")
        self.set_draw_color(*NAVY)
        self.set_line_width(0.5)
        self.line(self.l_margin, self.get_y() + 1, self.w - self.r_margin, self.get_y() + 1)
        self.ln(3)

    def footer(self):
        self.set_y(-12)
        self.set_font("Main", "", 8)
        self.set_text_color(*GREY)
        self.cell(0, 5, f"Generated {dt.datetime.now():%d-%b-%Y %H:%M}", align="L")
        self.set_x(self.l_margin)
        self.cell(0, 5, f"Page {self.page_no()} of {{nb}}", align="R")


def _kv_block(pdf: Doc, pairs, col_w=(38, 57), cols=2):
    pdf.set_font("Main", "", 10)
    x0 = pdf.l_margin
    for i in range(0, len(pairs), cols):
        for j, (k, v) in enumerate(pairs[i:i + cols]):
            pdf.set_x(x0 + j * sum(col_w))
            pdf.set_font("Main", "B", 10)
            pdf.cell(col_w[0], 6.5, k, border=1, fill=True)
            pdf.set_font("Main", "", 10)
            pdf.cell(col_w[1], 6.5, clean_text(v), border=1)
        pdf.ln(6.5)


def statement_pdf(hist: dict, settings: dict, out_dir: Path) -> Path:
    c = hist["customer"]
    cur = clean_text(settings.get("CurrencySymbol") or "Rs.")
    start, end = hist["period"]
    period = "Complete History" if start == "All" and end == "All" else \
        f"{month_name(start) if start != 'All' else 'Start'} to {month_name(end) if end != 'All' else 'Latest'}"
    pdf = Doc(settings, "P", [("CUSTOMER PAYMENT STATEMENT", 15)])
    pdf.set_title(f"{c['Customer ID']} Statement")
    pdf.set_author(clean_text(settings.get("CompanyName")))
    pdf.add_page()
    pdf.set_fill_color(*LIGHT)
    fee = c.get("Monthly Fee")
    _kv_block(pdf, [
        ("Customer ID", c["Customer ID"]), ("Customer Name", c["Customer Name"]),
        ("Address", c.get("Full Address")), ("VLAN ID", c.get("VLAN ID")),
        ("Package", c.get("Package") or "-"), ("Monthly Fee", f"{cur} {money(fee)}" if fee not in (None, "") else "-"),
        ("Connection Date", fmt_date(c.get("Connection Date")) or "-"), ("Current Status", c.get("Customer Status")),
        ("Statement Period", period), ("Mobile", c.get("Mobile Number") or "-"),
    ], col_w=(32, 63))
    pdf.ln(4)
    pdf.set_font("Main", "B", 12)
    pdf.set_text_color(*NAVY)
    pdf.cell(0, 7, "Payment History", new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(0, 0, 0)
    pdf.set_font("Main", "", 10)
    head = FontFace(emphasis="BOLD", color=(255, 255, 255), fill_color=NAVY)
    with pdf.table(col_widths=(34, 26, 26, 30, 26, 24, 24), text_align=("LEFT", "RIGHT", "RIGHT", "CENTER", "RIGHT", "CENTER", "CENTER"),
                   headings_style=head, line_height=6.5, repeat_headings=1, first_row_as_headings=True) as t:
        t.row(["Month", "Bill", "Paid", "Payment Date", "Balance", "Status", "Payments"])
        for b in hist["bills"]:
            t.row([b["Month Name"] or month_name(b["Month"]), money(b["Monthly Fee"]), money(b["Amount Paid"]),
                   fmt_date(b["Last Payment Date"]) or "-", money(b["Balance"]), b["Payment Status"], str(b["Payments Count"])])
        if not hist["bills"]:
            t.row(["No bills in this period", "", "", "", "", "", ""])
    pdf.ln(4)
    pdf.set_fill_color(*LIGHT)
    tot = [("Total Billing", f"{cur} {money(hist['total_billing'])}"),
           ("Total Paid", f"{cur} {money(hist['total_paid'])}"),
           ("Total Outstanding", f"{cur} {money(hist['total_outstanding'])}")]
    if hist["last_payment_date"]:
        tot += [("Last Payment Date", fmt_date(hist["last_payment_date"])),
                ("Last Payment Amount", f"{cur} {money(hist['last_payment_amount'])}")]
    pdf.set_x(pdf.w - pdf.r_margin - 100)
    for k, v in tot:
        pdf.set_x(pdf.w - pdf.r_margin - 100)
        pdf.set_font("Main", "B", 11)
        pdf.cell(55, 7.5, k, border=1, fill=True)
        pdf.cell(45, 7.5, v, border=1, align="R", new_x="LMARGIN", new_y="NEXT")
    if hist["payments"]:
        pdf.ln(5)
        pdf.set_font("Main", "B", 11)
        pdf.set_text_color(*NAVY)
        pdf.cell(0, 7, "Payment Details", new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(0, 0, 0)
        pdf.set_font("Main", "", 9)
        with pdf.table(col_widths=(28, 30, 28, 26, 26, 52), headings_style=head, line_height=5.5,
                       text_align=("LEFT", "LEFT", "CENTER", "RIGHT", "CENTER", "LEFT"), repeat_headings=1) as t:
            t.row(["Payment ID", "For Month", "Date", "Amount", "Method", "Reference"])
            for p in hist["payments"]:
                t.row([p["Payment ID"], month_name(p["Month"]) if len(clean_text(p["Month"])) == 7 else clean_text(p["Month"]),
                       fmt_date(p["Payment Date"]), money(p["Amount"]), clean_text(p["Payment Method"]), clean_text(p["Reference"])])
    pdf.ln(6)
    pdf.set_font("Main", "", 9)
    pdf.set_text_color(*GREY)
    pdf.multi_cell(0, 5, f"Statement generated on {dt.date.today():%d-%b-%Y}. This is a computer-generated statement from "
                         f"{clean_text(settings.get('CompanyName'))} records. Please contact our office if any entry is incorrect.")
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = safe_filename(f"{c['Customer ID']}_{c['Customer Name']}") or safe_filename(c["Customer ID"])
    suffix = "" if (start, end) == ("All", "All") else f"_{start}_to_{end}".replace("All", "start" if start == "All" else "latest")
    path = out_dir / f"{stem}_Statement{suffix}.pdf"
    pdf.output(str(path))
    return path


def recovery_list_pdf(bills: list[dict], filters: dict, settings: dict, out_dir: Path, language: str = "English",
                      title: str | None = None) -> Path:
    urdu = language.lower().startswith("ur")
    cur = clean_text(settings.get("CurrencySymbol") or "Rs.")
    month = filters["month"]
    t_fee = sum(b["Monthly Fee"] for b in bills)
    t_paid = sum(b["Amount Paid"] for b in bills)
    t_bal = sum(b["Balance"] for b in bills)
    title = title or list_title(filters)
    if urdu:
        lines = [("ماہانہ ریکوری شیٹ", 15), (title, 11),
                 (f"علاقہ: {filters.get('area', 'All')}   گلی: {filters.get('location', 'All')}   مہینہ: {month_name(month)}   ریکوری: {filters.get('collector', 'All')}", 10)]
    else:
        lines = [("MONTHLY RECOVERY SHEET", 15), (title, 11),
                 (f"Area: {filters.get('area', 'All')}    Location/Street: {filters.get('location', 'All')}    "
                  f"Month: {month_name(month)}    Collector: {filters.get('collector', 'All')}", 10)]
    pdf = Doc(settings, "L", lines, rtl=urdu)
    pdf.set_title(title)
    pdf.add_page()
    widths = [9, 22, 50, 58, 15, 12, 20, 20, 20, 18, 22, 29]
    heads = PRINT_COLUMNS_UR if urdu else PRINT_COLUMNS
    align = ["CENTER", "LEFT", "LEFT", "LEFT", "CENTER", "CENTER", "RIGHT", "RIGHT", "RIGHT", "CENTER", "CENTER", "LEFT"]
    if urdu:
        widths, heads = widths[::-1], heads[::-1]
        align = [("RIGHT" if a == "LEFT" else a) for a in align][::-1]
    head = FontFace(emphasis="BOLD", color=(255, 255, 255), fill_color=NAVY)
    total_face = FontFace(emphasis="BOLD", fill_color=LIGHT)
    pdf.set_font("Main", "", 9)
    with pdf.table(col_widths=widths, text_align=align, headings_style=head, line_height=6.2, repeat_headings=1) as t:
        t.row(heads)
        for i, b in enumerate(bills, 1):
            status = STATUS_UR.get(b["Payment Status"], b["Payment Status"]) if urdu else b["Payment Status"]
            vals = [str(i), b["Customer ID"], b["Customer Name"], b["Full Address"], b["VLAN ID"],
                    str(int(b["Due Date"])) if b.get("Due Date") else "", money(b["Monthly Fee"]),
                    money(b["Amount Paid"]), money(b["Balance"]), status, fmt_date(b["Last Payment Date"]),
                    b["Collector Name"]]
            t.row(vals[::-1] if urdu else vals)
        tot = ["", "", "کل" if urdu else "TOTAL", f"{len(bills)} " + ("کسٹمر" if urdu else "customers"), "", "",
               money(t_fee), money(t_paid), money(t_bal), "", "", ""]
        t.row(tot[::-1] if urdu else tot, style=total_face)
    pdf.ln(4)
    pdf.set_font("Main", "B", 10)
    summary = ([("کل کسٹمر", str(len(bills))), ("کل بل", f"{cur} {money(t_fee)}"),
                ("وصول شدہ", f"{cur} {money(t_paid)}"), ("بقایا", f"{cur} {money(t_bal)}")] if urdu else
               [("Total Customers", str(len(bills))), ("Total Billing", f"{cur} {money(t_fee)}"),
                ("Total Recovered", f"{cur} {money(t_paid)}"), ("Total Pending", f"{cur} {money(t_bal)}")])
    if pdf.get_y() > pdf.h - 50:
        pdf.add_page()
    pdf.set_fill_color(*LIGHT)
    for k, v in summary:
        if urdu:
            pdf.set_x(pdf.w - pdf.r_margin - 100)
            pdf.cell(50, 7, v, border=1, align="L")
            pdf.cell(50, 7, k, border=1, fill=True, align="R", new_x="LMARGIN", new_y="NEXT")
        else:
            pdf.cell(50, 7, k, border=1, fill=True)
            pdf.cell(50, 7, v, border=1, align="R", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(12)
    pdf.set_font("Main", "", 11)
    sig = ("دستخط ریکوری: ____________________", "تصدیق دفتر: ____________________") if urdu else \
          ("Collector Signature: ____________________", "Office Verification: ____________________")
    pdf.cell((pdf.w - 20) / 2, 8, sig[0], align="R" if urdu else "L")
    pdf.cell((pdf.w - 20) / 2, 8, sig[1], align="R" if urdu else "L", new_x="LMARGIN", new_y="NEXT")
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    parts = [month] + [clean_text(filters.get(k)) for k in ("area", "location", "collector", "status", "due") if filters.get(k) not in (None, "", "All")]
    stem = safe_filename("_".join(parts) + ("_Recovery_List_UR" if urdu else "_Recovery_List"))
    path = out_dir / f"{stem}.pdf"
    n = 2
    while path.exists():
        path = out_dir / f"{stem}_{n}.pdf"
        n += 1
    pdf.output(str(path))
    return path


STATUS_LABEL = {"All": "", "UNPAID": "Pending", "PENDING": "Unpaid (Pending)", "PARTIAL": "Partial Payment",
                "PAID": "Paid", "OVERDUE": "Overdue"}


def list_title(f: dict) -> str:
    place = f.get("location_address") if f.get("location", "All") != "All" else (f.get("area") if f.get("area", "All") != "All" else "All Areas")
    status = f.get("status", "All")
    if f.get("mode") == "Pending Recovery" and status == "All":
        status = "UNPAID"
    if f.get("mode") == "Partial Payment Recovery" and status == "All":
        status = "PARTIAL"
    t = " ".join(x for x in (place, STATUS_LABEL.get(status, status), "Recovery List") if x)
    if f.get("collector", "All") != "All":
        t += f" - {f['collector']}"
    if f.get("due", "All") != "All":
        t += f" - Due {f['due']}"
    return t
