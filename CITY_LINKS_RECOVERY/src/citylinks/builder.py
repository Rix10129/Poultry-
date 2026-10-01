"""Builds a fresh CITY LINKS Recovery workbook (structure, formulas, validation, layouts).

Only master/setup rows are written here.  Customer data is never invented: the
real workbook starts with an empty CUSTOMERS table.
"""
from __future__ import annotations

import datetime as dt
from pathlib import Path

from openpyxl import Workbook
from openpyxl.formatting.rule import CellIsRule, FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Protection, Side
from openpyxl.utils import get_column_letter
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.worksheet.hyperlink import Hyperlink
from openpyxl.worksheet.table import Table, TableColumn, TableFormula, TableStyleInfo

from . import schema as S
from .store import Store

# --------------------------------------------------------------------- styles
NAVY = "1F3864"
F_TITLE = Font(name="Calibri", size=18, bold=True, color=NAVY)
F_SUB = Font(name="Calibri", size=10, italic=True, color="595959")
F_H = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
F_B = Font(name="Calibri", size=11, bold=True)
F_LINK = Font(name="Calibri", size=11, color="0563C1", underline="single")
F_BIGNUM = Font(name="Calibri", size=16, bold=True, color=NAVY)
FILL_INPUT = PatternFill("solid", fgColor="FFF2CC")       # yellow = you type here
FILL_CALC = PatternFill("solid", fgColor="F2F2F2")        # grey   = calculated
FILL_SYS = PatternFill("solid", fgColor="EAF1FB")         # blue   = system generated
FILL_H_INPUT = PatternFill("solid", fgColor="1F4E79")
FILL_H_CALC = PatternFill("solid", fgColor="595959")
FILL_H_SYS = PatternFill("solid", fgColor="2E75B6")
FILL_SECTION = PatternFill("solid", fgColor="D9E1F2")
FILL_KPI = PatternFill("solid", fgColor="F7F9FC")
THIN = Side(style="thin", color="A6A6A6")
BOX = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
CENTER = Alignment(horizontal="center", vertical="center", wrap_text=True)
LEFT = Alignment(horizontal="left", vertical="center")
WRAP = Alignment(wrap_text=True, vertical="top")

HEADER_ROW = 4          # table header row on every data sheet
LIST_ROWS = 300         # capacity of dynamic dropdown lists
PRINT_ROWS = 500        # capacity of the live print sheet
HIST_ROWS = 120
STMT_ROWS = 72

GREEN, AMBER, RED = "C6EFCE", "FFEB9C", "FFC7CE"

SHEET_ORDER = [
    "HOME", "DASHBOARD", "CUSTOMERS", "MONTHLY_BILLING", "PAYMENTS", "PAYMENT_ENTRY", "PRINT_CENTER",
    "PRINT_SHEET", "PRINT_SHEET_UR", "CUSTOMER_HISTORY", "STATEMENT", "CASH_RECONCILIATION",
    "RECOVERY_ASSIGNMENTS", "REPORTS", "MONTHS", "CUSTOMER_EVENTS", "AREAS", "LOCATION_CODES",
    "PACKAGES", "COLLECTORS", "IMPORT_BATCHES", "IMPORT_STAGING", "VERIFICATION_QUEUE", "SETTINGS", "LISTS",
]

NAV = [
    ("Dashboard", "DASHBOARD"), ("Customer Master", "CUSTOMERS"), ("Add Customer", "CUSTOMERS"),
    ("Monthly Recovery", "MONTHLY_BILLING"), ("Payment Entry", "PAYMENT_ENTRY"), ("Payments", "PAYMENTS"),
    ("Print Center", "PRINT_CENTER"), ("Customer History", "CUSTOMER_HISTORY"), ("Customer Statement", "STATEMENT"),
    ("Pending Recovery", "PRINT_CENTER"), ("Cash Reconciliation", "CASH_RECONCILIATION"),
    ("Recovery Assignments", "RECOVERY_ASSIGNMENTS"), ("Reports", "REPORTS"), ("Monthly Archive", "MONTHS"),
    ("Connection History", "CUSTOMER_EVENTS"), ("Areas", "AREAS"), ("Location Codes", "LOCATION_CODES"),
    ("Packages", "PACKAGES"), ("Collectors", "COLLECTORS"), ("Import Batches (Page Review)", "IMPORT_BATCHES"),
    ("Verification Queue", "VERIFICATION_QUEUE"),
    ("Settings", "SETTINGS"),
]

# Data-validation definitions: key -> kwargs for DataValidation
VALIDATIONS = {
    "yesno": dict(type="list", formula1="L_YesNo", error="Choose Yes or No."),
    "custstatus": dict(type="list", formula1="L_CustStatus", error="Choose Active, Suspended, Disconnected or On Hold."),
    "method": dict(type="list", formula1="L_Methods", error="Choose Cash, Bank, JazzCash, EasyPaisa or Other."),
    "eventtype": dict(type="list", formula1="L_EventTypes", error="Choose an event type from the list."),
    "assignstatus": dict(type="list", formula1="L_AssignStatus", error="Choose a status from the list."),
    "language": dict(type="list", formula1="L_Languages", error="Choose English or Urdu."),
    "orientation": dict(type="list", formula1='"Landscape,Portrait"', error="Choose Landscape or Portrait."),
    "month": dict(type="list", formula1="L_Months", error="Choose a month in the format YYYY-MM, e.g. 2026-10."),
    "loccode": dict(type="list", formula1="L_LocCodes", error="This Location Code does not exist. Add it in LOCATION_CODES first."),
    "areacode": dict(type="list", formula1="L_AreaCodes", error="This Area Code does not exist. Add it in AREAS first."),
    "package": dict(type="list", formula1="L_Packages", error="This package does not exist. Add it in PACKAGES first."),
    "collector": dict(type="list", formula1="L_CollectorIDs", error="This Collector ID does not exist. Add it in COLLECTORS first."),
    "money": dict(type="decimal", operator="greaterThanOrEqual", formula1="0", error="Amount cannot be negative."),
    "amount": dict(type="decimal", operator="greaterThan", formula1="0", error="Payment amount must be more than 0 (cannot be negative)."),
    "dueday": dict(type="whole", operator="between", formula1="1", formula2="31", error="Due Date is the day of the month (1 to 31)."),
    "date": dict(type="date", operator="between", formula1="36526", formula2="73051", error="Enter a valid date, e.g. 15-10-2026."),
}


# ------------------------------------------------------------------- helpers
def name(wb, nm: str, ref: str):
    wb.defined_names[nm] = DefinedName(nm, attr_text=ref)


def abs_ref(sheet: str, cell: str) -> str:
    col = "".join(ch for ch in cell if ch.isalpha())
    row = "".join(ch for ch in cell if ch.isdigit())
    return f"'{sheet}'!${col}${row}"


def link(cell, sheet: str, text: str | None = None, target="A1"):
    if text is not None:
        cell.value = text
    cell.hyperlink = Hyperlink(ref=cell.coordinate, location=f"'{sheet}'!{target}", display=str(cell.value))
    cell.font = F_LINK


def title(ws, text, sub=None, width_cols=10):
    ws["A1"] = text
    ws["A1"].font = F_TITLE
    if sub:
        ws["A2"] = sub
        ws["A2"].font = F_SUB
    ws.sheet_view.showGridLines = False


def home_link(ws, cell="L1"):
    link(ws[cell], "HOME", "◄ HOME")


def inp(cell, value=None, fmt=None):
    if value is not None:
        cell.value = value
    cell.fill = FILL_INPUT
    cell.border = BOX
    cell.protection = Protection(locked=False)
    if fmt:
        cell.number_format = fmt


def calc(cell, formula, fmt=None, bold=False):
    cell.value = formula
    cell.fill = FILL_CALC
    cell.border = BOX
    if fmt:
        cell.number_format = fmt
    if bold:
        cell.font = F_B


def label(cell, text, bold=True):
    cell.value = text
    cell.font = F_B if bold else Font(name="Calibri", size=11)
    cell.alignment = LEFT


def section(ws, row, text, c1=1, c2=12):
    ws.cell(row, c1, text).font = Font(name="Calibri", size=12, bold=True, color=NAVY)
    for c in range(c1, c2 + 1):
        ws.cell(row, c).fill = FILL_SECTION


def header_cells(ws, row, headers, c1=1, fill=FILL_H_CALC):
    for i, h in enumerate(headers):
        c = ws.cell(row, c1 + i, h)
        c.font = F_H
        c.fill = fill
        c.alignment = CENTER
        c.border = BOX


def add_dv(ws, key, rng, prompt=None):
    kw = dict(VALIDATIONS[key])
    err = kw.pop("error")
    dv = DataValidation(allow_blank=True, showErrorMessage=True, errorTitle="CITY LINKS", error=err, **kw)
    if prompt:
        dv.promptTitle, dv.prompt, dv.showInputMessage = "CITY LINKS", prompt, True
    ws.add_data_validation(dv)
    dv.add(rng)
    return dv


def protect(ws):
    ws.protection.sheet = True
    ws.protection.autoFilter = False
    ws.protection.sort = False
    ws.protection.formatColumns = False
    ws.protection.formatRows = False
    ws.protection.selectLockedCells = False
    ws.protection.selectUnlockedCells = False


def page_setup(ws, landscape=True, fit_width=True, title_rows=None, footer=None):
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_setup.orientation = "landscape" if landscape else "portrait"
    if fit_width:
        ws.sheet_properties.pageSetUpPr.fitToPage = True
        ws.page_setup.fitToWidth = 1
        ws.page_setup.fitToHeight = 0
    ws.page_margins.left = ws.page_margins.right = 0.4
    ws.page_margins.top = 0.5
    ws.page_margins.bottom = 0.6
    ws.page_margins.header = ws.page_margins.footer = 0.25
    if title_rows:
        ws.print_title_rows = title_rows
    ws.oddFooter.right.text = "Page &P of &N"
    ws.oddFooter.right.size = 9
    if footer:
        ws.oddFooter.left.text = footer
        ws.oddFooter.left.size = 9
    ws.print_options.horizontalCentered = True


def widths(ws, ws_widths: dict):
    for col, w in ws_widths.items():
        ws.column_dimensions[col].width = w


# ------------------------------------------------------------- data sheets
def build_table_sheet(wb, tdef: S.TableDef):
    ws = wb[tdef.sheet]
    title(ws, tdef.title, tdef.description)
    ws["A3"] = "Header colours:  dark blue = you type   |   mid blue = system generated (do not edit)   |   grey = calculated formula (never type)"
    ws["A3"].font = Font(size=9, color="595959")
    home_link(ws, f"{get_column_letter(min(len(tdef.columns), 12) + 1)}1")
    ncol = len(tdef.columns)
    for i, col in enumerate(tdef.columns, start=1):
        c = ws.cell(HEADER_ROW, i, col.name)
        c.font = F_H
        c.alignment = CENTER
        c.fill = {S.INPUT: FILL_H_INPUT, S.SYSTEM: FILL_H_SYS, S.CALC: FILL_H_CALC}[col.kind]
        ws.column_dimensions[get_column_letter(i)].width = col.width
        if col.note:
            from openpyxl.comments import Comment
            c.comment = Comment(col.note + (" (required)" if col.required else ""), "CITY LINKS")
        letter = get_column_letter(i)
        rng = f"{letter}{HEADER_ROW + 1}:{letter}{HEADER_ROW + tdef.dv_rows}"
        if col.dv and col.kind != S.CALC:
            if col.dv == "custid":
                dv = DataValidation(type="custom", formula1=f"COUNTIF(${letter}${HEADER_ROW+1}:${letter}${HEADER_ROW+tdef.dv_rows},{letter}{HEADER_ROW+1})=1",
                                    allow_blank=True, showErrorMessage=True, errorTitle="CITY LINKS",
                                    error="Customer ID already exists. Every customer must have a unique Customer ID.")
                ws.add_data_validation(dv)
                dv.add(rng)
            elif col.dv == "payid":
                dv = DataValidation(type="custom", formula1=f"COUNTIF(${letter}${HEADER_ROW+1}:${letter}${HEADER_ROW+tdef.dv_rows},{letter}{HEADER_ROW+1})=1",
                                    allow_blank=True, showErrorMessage=True, errorTitle="CITY LINKS", error="Payment ID already exists.")
                ws.add_data_validation(dv)
                dv.add(rng)
            else:
                add_dv(ws, col.dv, rng)
        if col.text:
            for r in range(HEADER_ROW + 1, HEADER_ROW + 201):
                ws.cell(r, i).number_format = S.FMT_TEXT
    ws.row_dimensions[HEADER_ROW].height = 32
    ref = f"A{HEADER_ROW}:{get_column_letter(ncol)}{HEADER_ROW + 1}"
    tbl = Table(displayName=tdef.name, ref=ref)
    tbl.tableStyleInfo = TableStyleInfo(name="TableStyleLight1", showRowStripes=False)
    tbl._initialise_columns()
    for tc, col in zip(tbl.tableColumns, tdef.columns):
        tc.name = col.name              # must equal the header text or Excel reports a damaged table
        if col.kind == S.CALC:
            tc.calculatedColumnFormula = TableFormula(attr_text=tdef.expand(col.formula)[1:])
    ws.add_table(tbl)
    freeze_col = {"tblCustomers": "C", "tblBilling": "F", "tblPayments": "C"}.get(tdef.name, "B")
    ws.freeze_panes = f"{freeze_col}{HEADER_ROW + 1}"
    page_setup(ws, title_rows=f"{HEADER_ROW}:{HEADER_ROW}")
    return ws


def table_conditional_formats(wb):
    def colrange(tdef, colname, rows=None):
        i = tdef.names.index(colname) + 1
        L = get_column_letter(i)
        return L, f"{L}{HEADER_ROW + 1}:{L}{HEADER_ROW + (rows or tdef.dv_rows)}"

    red = PatternFill("solid", fgColor=RED)
    amber = PatternFill("solid", fgColor=AMBER)
    green = PatternFill("solid", fgColor=GREEN)
    grey_font = Font(color="808080")
    r0 = HEADER_ROW + 1

    for tdef in (S.CUSTOMERS, S.PAYMENTS, S.LOCATIONS):
        ws = wb[tdef.sheet]
        L, rng = colrange(tdef, "Data Check")
        ws.conditional_formatting.add(rng, FormulaRule(formula=[f'LEN({L}{r0})>0'], fill=red))

    ws = wb["CUSTOMERS"]
    L, _ = colrange(S.CUSTOMERS, "Customer Status")
    full = f"A{r0}:{get_column_letter(len(S.CUSTOMERS.columns))}{HEADER_ROW + S.CUSTOMERS.dv_rows}"
    ws.conditional_formatting.add(full, FormulaRule(formula=[f'${L}{r0}="Disconnected"'], font=grey_font))
    ws.conditional_formatting.add(f"{L}{r0}:{L}{HEADER_ROW + S.CUSTOMERS.dv_rows}",
                                  FormulaRule(formula=[f'OR({L}{r0}="Suspended",{L}{r0}="On Hold")'], fill=amber))

    ws = wb["MONTHLY_BILLING"]
    L, rng = colrange(S.BILLING, "Payment Status")
    for val, fill in (("PAID", green), ("PARTIAL", amber), ("PENDING", red)):
        ws.conditional_formatting.add(rng, CellIsRule(operator="equal", formula=[f'"{val}"'], fill=fill))
    L, rng = colrange(S.BILLING, "Overdue")
    ws.conditional_formatting.add(rng, CellIsRule(operator="equal", formula=['"OVERDUE"'], font=Font(color="C00000", bold=True)))

    ws = wb["PAYMENTS"]
    L, _ = colrange(S.PAYMENTS, "Voided")
    ws.conditional_formatting.add(f"A{r0}:N{HEADER_ROW + S.PAYMENTS.dv_rows}",
                                  FormulaRule(formula=[f'${L}{r0}="Yes"'], font=Font(color="808080", strike=True)))

    ws = wb["CASH_RECONCILIATION"]
    L, rng = colrange(S.CASH, "Cash Difference")
    ws.conditional_formatting.add(rng, FormulaRule(formula=[f'AND({L}{r0}<>"",{L}{r0}<0)'], fill=red, font=Font(bold=True, color="9C0006")))
    ws.conditional_formatting.add(rng, FormulaRule(formula=[f'AND({L}{r0}<>"",{L}{r0}>0)'], fill=amber, font=Font(bold=True)))
    ws.conditional_formatting.add(rng, FormulaRule(formula=[f'AND({L}{r0}<>"",{L}{r0}=0)'], fill=green))
    L, rng = colrange(S.CASH, "Reconciliation Status")
    ws.conditional_formatting.add(rng, CellIsRule(operator="equal", formula=['"CASH DIFFERENCE"'], fill=red))
    ws.conditional_formatting.add(rng, CellIsRule(operator="equal", formula=['"MATCHED"'], fill=green))

    ws = wb["VERIFICATION_QUEUE"]
    L, rng = colrange(S.VERIFY, "Status")
    ws.conditional_formatting.add(rng, CellIsRule(operator="equal", formula=['"Open"'], fill=amber))
    L, rng = colrange(S.VERIFY, "Answer")
    ws.conditional_formatting.add(rng, FormulaRule(formula=[f'${get_column_letter(S.VERIFY.names.index("Status")+1)}{r0}="Open"'], fill=PatternFill("solid", fgColor="FFF2CC")))

    ws = wb["IMPORT_STAGING"]
    L, rng = colrange(S.STAGING, "Row Status")
    ws.conditional_formatting.add(rng, CellIsRule(operator="equal", formula=['"Needs Verification"'], fill=amber))
    ws.conditional_formatting.add(rng, CellIsRule(operator="equal", formula=['"Possible Duplicate"'], fill=red))
    ws.conditional_formatting.add(rng, CellIsRule(operator="equal", formula=['"Imported"'], fill=green))


def batches_conditional_formats(wb):
    ws = wb["IMPORT_BATCHES"]
    r0, last = HEADER_ROW + 1, HEADER_ROW + S.BATCHES.dv_rows
    L = get_column_letter(S.BATCHES.names.index("Page Reviewed") + 1)
    ws.conditional_formatting.add(f"{L}{r0}:{L}{last}", CellIsRule(operator="equal", formula=['"YES"'], fill=PatternFill("solid", fgColor=GREEN), font=Font(bold=True)))
    ws.conditional_formatting.add(f"{L}{r0}:{L}{last}", CellIsRule(operator="equal", formula=['"NO"'], fill=PatternFill("solid", fgColor=RED), font=Font(bold=True, color="9C0006")))
    L = get_column_letter(S.BATCHES.names.index("Batch Status") + 1)
    rng = f"{L}{r0}:{L}{last}"
    ws.conditional_formatting.add(rng, FormulaRule(formula=[f'LEFT({L}{r0},13)="PAGE REVIEWED"'], fill=PatternFill("solid", fgColor=GREEN), font=Font(bold=True)))
    ws.conditional_formatting.add(rng, FormulaRule(formula=[f'LEFT({L}{r0},17)="PAGE NOT REVIEWED"'], fill=PatternFill("solid", fgColor=RED), font=Font(bold=True, color="9C0006")))
    ws.conditional_formatting.add(rng, FormulaRule(formula=[f'LEFT({L}{r0},7)="WAITING"'], fill=PatternFill("solid", fgColor=AMBER), font=Font(bold=True)))
    ws["A3"] = ("RULE: nothing from a handwritten page becomes a customer until a person has checked EVERY row against the original "
                "page/image and typed PAGE REVIEWED in the menu program (Menu 15). Unclear values stay in VERIFICATION_QUEUE.")
    ws["A3"].font = Font(size=10, bold=True, color="C00000")
    ws.sheet_properties.tabColor = "BF8F00"


def home_batch_status(wb):
    ws = wb["HOME"]
    label(ws["B11"], "Pages NOT yet reviewed:")
    ws["C11"] = '=COUNTIF(tblBatches[Batch Status],"PAGE NOT REVIEWED*")+COUNTIF(tblBatches[Batch Status],"WAITING*")'
    ws["C11"].font = Font(bold=True, color="C00000")


def upgrade_workbook(store) -> list[str]:
    """Add sheets/tables introduced after a workbook was created. Never touches existing data."""
    wb = store.wb
    done = []
    if "IMPORT_BATCHES" not in wb.sheetnames:
        wb.create_sheet("IMPORT_BATCHES", index=wb.sheetnames.index("IMPORT_STAGING"))
        build_table_sheet(wb, S.BATCHES)
        batches_conditional_formats(wb)
        store.t(S.BATCHES).ensure_formulas()
        home_batch_status(wb)
        link(wb["HOME"].cell(13 + len(NAV) - 1, 2), "IMPORT_BATCHES", "► Import Batches (Page Review)")
        done.append("added IMPORT_BATCHES (page review) sheet")
    if "CFG_SharedVLANs" not in wb.defined_names:
        ws = wb["SETTINGS"]
        st = S.SETTING_KEYS["SharedVLANs"]
        r = 5 + [s.key for s in S.SETTINGS].index("SharedVLANs")
        while ws.cell(r, 1).value not in (None, ""):          # never overwrite an existing settings row
            r += 1
        label(ws.cell(r, 1), st.label)
        inp(ws.cell(r, 2), st.default)
        ws.cell(r, 2).number_format = "@"
        ws.cell(r, 3, st.note).font = Font(size=9, color="595959")
        name(wb, "CFG_SharedVLANs", abs_ref("SETTINGS", f"B{r}"))
        refresh_calc_column(store, S.CUSTOMERS, "Data Check")
        done.append("added SETTINGS > Shared VLANs and updated CUSTOMERS Data Check formula")
    return done


def refresh_calc_column(store, tdef, colname):
    """Re-write one calculated column (table definition + every row) from schema.py."""
    t = store.t(tdef)
    for tc in t.table.tableColumns:
        if tc.name == colname:
            tc.calculatedColumnFormula = TableFormula(attr_text=tdef.expand(tdef.col(colname).formula)[1:])
    col = tdef.col(colname)
    for r in range(t.header_row + 1, t.last_row + 1):
        t._write_cell(r, col, None)


# -------------------------------------------------------------------- LISTS
def build_lists(wb):
    ws = wb["LISTS"]
    title(ws, "LISTS (system)", "Dropdown lists used by the workbook. Do not edit - change AREAS / LOCATION_CODES / PACKAGES / COLLECTORS instead.")
    first = 4
    static = {
        "L_CustStatus": S.CUSTOMER_STATUSES, "L_PayStatus": S.PAYMENT_STATUSES, "L_Methods": S.PAYMENT_METHODS,
        "L_YesNo": S.YES_NO, "L_EventTypes": S.EVENT_TYPES, "L_AssignStatus": S.ASSIGNMENT_STATUSES,
        "L_Languages": S.LANGUAGES, "L_PrintModes": S.PRINT_MODES, "L_PrintStatuses": S.PRINT_STATUSES,
        "L_PrintStatusLabels": ["", "Pending", "Unpaid (Pending)", "Partial Payment", "Paid", "Overdue"],
        "L_SearchTypes": ["Customer ID", "Customer Name", "Mobile Number", "VLAN ID", "Location Code", "Area", "Any Field"],
    }
    months = []
    for y in range(2024, 2036):
        for m in range(1, 13):
            months.append(f"{y:04d}-{m:02d}")
    static["L_Months"] = months
    static["L_MonthsAll"] = ["All"] + months
    static["L_DueDaysAll"] = ["All"] + list(range(1, 32))
    col = 1
    for nm, values in static.items():
        ws.cell(first - 1, col, nm).font = F_B
        for i, v in enumerate(values):
            c = ws.cell(first + i, col, v)
            if isinstance(v, str):
                c.number_format = "@"
        L = get_column_letter(col)
        name(wb, nm, f"'LISTS'!${L}${first}:${L}${first + len(values) - 1}")
        ws.column_dimensions[L].width = 16
        col += 1
    dynamic = [
        ("L_AreaCodes", "tblAreas[Area Code]", False),
        ("L_AreaNamesAll", "tblAreas[Area Name]", True),
        ("L_LocCodes", "tblLocations[Location Code]", False),
        ("L_LocCodesAll", "tblLocations[Location Code]", True),
        ("L_Packages", "tblPackages[Package Name]", False),
        ("L_CollectorIDs", "tblCollectors[Collector ID]", False),
        ("L_CollectorNamesAll", "tblCollectors[Collector Name]", True),
        ("L_CustomerIDs", "tblCustomers[Customer ID]", False),
    ]
    for nm, src, with_all in dynamic:
        ws.cell(first - 1, col, nm).font = F_B
        L = get_column_letter(col)
        offset = 0
        if with_all:
            ws.cell(first, col, "All")
            offset = 1
            if nm == "L_CollectorNamesAll":
                ws.cell(first + 1, col, "Unassigned")
                offset = 2
        for i in range(LIST_ROWS):
            r = first + offset + i
            ws.cell(r, col, f'=IFERROR(INDEX({src},{i + 1})&"","")')
        name(wb, nm, f"OFFSET('LISTS'!${L}${first},0,0,MAX(1,COUNTIF('LISTS'!${L}${first}:${L}${first + LIST_ROWS + 2},\"?*\")),1)")
        ws.column_dimensions[L].width = 18
        col += 1
    protect(ws)


# ----------------------------------------------------------------- SETTINGS
def build_settings(wb, overrides: dict):
    ws = wb["SETTINGS"]
    title(ws, "SETTINGS", "Change company details and system options here. Yellow cells are editable.")
    home_link(ws, "E1")
    header_cells(ws, 4, ["Setting", "Value", "Notes"], fill=FILL_H_INPUT)
    for i, st in enumerate(S.SETTINGS):
        r = 5 + i
        label(ws.cell(r, 1), st.label)
        v = overrides.get(st.key, st.default)
        c = ws.cell(r, 2)
        inp(c, v)
        if st.key in ("CurrentMonth", "CustomerIDPrefix", "WhatsAppCountryCode"):
            c.number_format = "@"
        if st.key == "WhatsAppMessage":
            c.alignment = WRAP
            ws.row_dimensions[r].height = 48
        ws.cell(r, 3, st.note).font = Font(size=9, color="595959")
        name(wb, f"CFG_{st.key}", abs_ref("SETTINGS", f"B{r}"))
        if st.dv:
            add_dv(ws, st.dv, f"B{r}")
    widths(ws, {"A": 34, "B": 46, "C": 70})
    ws.freeze_panes = "A5"


# ---------------------------------------------------------------- DASHBOARD
def build_dashboard(wb):
    ws = wb["DASHBOARD"]
    ws["A1"] = '=CFG_CompanyName&" - RECOVERY DASHBOARD"'
    ws["A1"].font = F_TITLE
    ws.sheet_view.showGridLines = False
    home_link(ws, "N1")
    label(ws["A2"], "Month (YYYY-MM):")
    inp(ws["C2"], "=CFG_CurrentMonth")
    ws["C2"].number_format = "@"
    add_dv(ws, "month", "C2", "Select a month. Default = Current Month from SETTINGS.")
    name(wb, "DB_Month", abs_ref("DASHBOARD", "C2"))
    calc(ws["D2"], '=IFERROR(TEXT(DATE(LEFT(DB_Month,4),MID(DB_Month,6,2),1),"mmmm yyyy"),"Select month")', bold=True)
    ws["F2"] = '=IF(CFG_WorkbookType<>"REAL DATA","DEMO WORKBOOK - SAMPLE DATA ONLY","")'
    ws["F2"].font = Font(bold=True, color="C00000", size=12)
    ws["A3"] = "All figures are calculated from the workbook data. Nothing is typed by hand."
    ws["A3"].font = F_SUB

    M = "DB_Month"
    kpis = [
        # (row, col, label, formula, fmt)
        ("CUSTOMERS", [
            ("Total Customers", '=COUNTIF(tblCustomers[Customer ID],"?*")', "0"),
            ("Active Customers", '=COUNTIF(tblCustomers[Customer Status],"Active")', "0"),
            ("Suspended", '=COUNTIF(tblCustomers[Customer Status],"Suspended")', "0"),
            ("Disconnected Customers", '=COUNTIF(tblCustomers[Customer Status],"Disconnected")', "0"),
            ("On Hold", '=COUNTIF(tblCustomers[Customer Status],"On Hold")', "0"),
        ]),
        ("SELECTED MONTH", [
            ("Customers Billed", f'=COUNTIF(tblBilling[Month],{M})', "0"),
            ("Monthly Billing", f'=SUMIFS(tblBilling[Monthly Fee],tblBilling[Month],{M})', S.FMT_MONEY),
            ("Total Recovered", f'=SUMIFS(tblBilling[Amount Paid],tblBilling[Month],{M})', S.FMT_MONEY),
            ("Total Pending (Balance)", f'=SUMIFS(tblBilling[Balance],tblBilling[Month],{M})', S.FMT_MONEY),
            ("Recovery Percentage", f'=IF(SUMIFS(tblBilling[Monthly Fee],tblBilling[Month],{M})=0,0,SUMIFS(tblBilling[Amount Paid],tblBilling[Month],{M})/SUMIFS(tblBilling[Monthly Fee],tblBilling[Month],{M}))', S.FMT_PCT),
        ]),
        ("PAYMENT STATUS", [
            ("Paid Customers", f'=COUNTIFS(tblBilling[Month],{M},tblBilling[Payment Status],"PAID")', "0"),
            ("Partial Customers", f'=COUNTIFS(tblBilling[Month],{M},tblBilling[Payment Status],"PARTIAL")', "0"),
            ("Total Partial (Balance)", f'=SUMIFS(tblBilling[Balance],tblBilling[Month],{M},tblBilling[Payment Status],"PARTIAL")', S.FMT_MONEY),
            ("Pending Customers", f'=COUNTIFS(tblBilling[Month],{M},tblBilling[Payment Status],"PENDING")', "0"),
            ("Overdue Customers", f'=COUNTIFS(tblBilling[Month],{M},tblBilling[Overdue],"OVERDUE")', "0"),
        ]),
        ("CASH", [
            ("Today's Collection", '=SUMIFS(tblPayments[Amount],tblPayments[Payment Date],TODAY(),tblPayments[Voided],"<>Yes")', S.FMT_MONEY),
            ("Current Month Collection", f'=IFERROR(SUMIFS(tblPayments[Amount],tblPayments[Payment Date],">="&DATE(LEFT({M},4),MID({M},6,2),1),tblPayments[Payment Date],"<="&EOMONTH(DATE(LEFT({M},4),MID({M},6,2),1),0),tblPayments[Voided],"<>Yes"),0)', S.FMT_MONEY),
            ("Outstanding Balance (All Months)", '=SUM(tblBilling[Balance])', S.FMT_MONEY),
            ("Cash Difference (Month)", f'=SUMIFS(tblCash[Cash Difference],tblCash[Month],{M})', '#,##0;[Red]-#,##0;0'),
            ("Collectors Not Submitted", f'=COUNTIFS(tblCash[Month],{M},tblCash[Reconciliation Status],"NOT SUBMITTED")', "0"),
        ]),
    ]
    col = 1
    for heading, items in kpis:
        section(ws, 5, heading, col, col + 2)
        for i, (lab, f, fmt) in enumerate(items):
            r = 6 + i * 2
            ws.cell(r, col, lab).font = Font(size=10, color="595959")
            c = ws.cell(r + 1, col, f)
            c.font = F_BIGNUM
            c.number_format = fmt
            c.alignment = LEFT
            for cc in range(col, col + 3):
                ws.cell(r, cc).fill = FILL_KPI
                ws.cell(r + 1, cc).fill = FILL_KPI
        col += 4
    ws["A16"] = "Current Month Collection = all payments received (by payment date) during the selected calendar month, for any bill."
    ws["A16"].font = F_SUB

    # --- area-wise
    r0 = 18
    section(ws, r0, "AREA-WISE RECOVERY (selected month)", 1, 11)
    hdr = ["Area", "Customers", "Active Customers", "Billed", "Monthly Billing", "Recovered", "Pending (Balance)",
           "Paid", "Partial", "Pending", "Recovery %"]
    header_cells(ws, r0 + 1, hdr)
    for k in range(1, 26):
        r = r0 + 1 + k
        a = f"$A{r}"
        ws.cell(r, 1, f'=IFERROR(INDEX(tblAreas[Area Name],{k})&"","")')
        f = {
            2: f'=IF({a}="","",COUNTIF(tblCustomers[Area],{a}))',
            3: f'=IF({a}="","",COUNTIFS(tblCustomers[Area],{a},tblCustomers[Customer Status],"Active"))',
            4: f'=IF({a}="","",COUNTIFS(tblBilling[Month],{M},tblBilling[Area],{a}))',
            5: f'=IF({a}="","",SUMIFS(tblBilling[Monthly Fee],tblBilling[Month],{M},tblBilling[Area],{a}))',
            6: f'=IF({a}="","",SUMIFS(tblBilling[Amount Paid],tblBilling[Month],{M},tblBilling[Area],{a}))',
            7: f'=IF({a}="","",SUMIFS(tblBilling[Balance],tblBilling[Month],{M},tblBilling[Area],{a}))',
            8: f'=IF({a}="","",COUNTIFS(tblBilling[Month],{M},tblBilling[Area],{a},tblBilling[Payment Status],"PAID"))',
            9: f'=IF({a}="","",COUNTIFS(tblBilling[Month],{M},tblBilling[Area],{a},tblBilling[Payment Status],"PARTIAL"))',
            10: f'=IF({a}="","",COUNTIFS(tblBilling[Month],{M},tblBilling[Area],{a},tblBilling[Payment Status],"PENDING"))',
            11: f'=IF(OR({a}="",N(E{r})=0),"",F{r}/E{r})',
        }
        for c, fx in f.items():
            cell = ws.cell(r, c, fx)
            cell.number_format = S.FMT_PCT if c == 11 else (S.FMT_MONEY if c in (5, 6, 7) else "0")
    ws.conditional_formatting.add(f"A{r0 + 2}:K{r0 + 26}", FormulaRule(formula=[f'$A{r0 + 2}<>""'], border=BOX))
    ws.auto_filter.ref = f"A{r0 + 1}:K{r0 + 26}"

    # --- collector-wise
    r1 = r0 + 29
    section(ws, r1, "COLLECTOR-WISE RECOVERY & CASH (selected month)", 1, 14)
    hdr = ["Collector ID", "Collector", "Assigned Customers", "Assigned Billing", "Recovered", "Pending (Balance)",
           "Paid", "Partial", "Pending", "Recovery %", "Expected Cash", "Actual Cash", "Difference", "Status"]
    header_cells(ws, r1 + 1, hdr)
    for k in range(1, 22):
        r = r1 + 1 + k
        idc = f"$A{r}"
        if k <= 20:
            ws.cell(r, 1, f'=IFERROR(INDEX(tblCollectors[Collector ID],{k})&"","")')
            ws.cell(r, 2, f'=IF({idc}="","",INDEX(tblCollectors[Collector Name],{k}))')
            crit = f'tblBilling[Collector ID],{idc}'
        else:
            ws.cell(r, 1, "")
            ws.cell(r, 2, "Unassigned")
            crit = 'tblBilling[Collector ID],""'
        guard = f'$B{r}=""'
        f = {
            3: f'=IF({guard},"",COUNTIFS(tblBilling[Month],{M},{crit}))',
            4: f'=IF({guard},"",SUMIFS(tblBilling[Monthly Fee],tblBilling[Month],{M},{crit}))',
            5: f'=IF({guard},"",SUMIFS(tblBilling[Amount Paid],tblBilling[Month],{M},{crit}))',
            6: f'=IF({guard},"",SUMIFS(tblBilling[Balance],tblBilling[Month],{M},{crit}))',
            7: f'=IF({guard},"",COUNTIFS(tblBilling[Month],{M},{crit},tblBilling[Payment Status],"PAID"))',
            8: f'=IF({guard},"",COUNTIFS(tblBilling[Month],{M},{crit},tblBilling[Payment Status],"PARTIAL"))',
            9: f'=IF({guard},"",COUNTIFS(tblBilling[Month],{M},{crit},tblBilling[Payment Status],"PENDING"))',
            10: f'=IF(OR({guard},N(D{r})=0),"",E{r}/D{r})',
        }
        if k <= 20:
            f.update({
                11: f'=IF({idc}="","",SUMIFS(tblPayments[Amount],tblPayments[Collector ID],{idc},tblPayments[Month],{M},tblPayments[Payment Method],"Cash",tblPayments[Voided],"<>Yes"))',
                12: f'=IF({idc}="","",IF(COUNTIFS(tblCash[Month],{M},tblCash[Collector ID],{idc},tblCash[Actual Cash Submitted],"<>")=0,"",SUMIFS(tblCash[Actual Cash Submitted],tblCash[Month],{M},tblCash[Collector ID],{idc})))',
                13: f'=IF(OR({idc}="",L{r}=""),"",L{r}-K{r})',
                14: f'=IF({idc}="","",IF(L{r}="","NOT SUBMITTED",IF(M{r}=0,"MATCHED","CASH DIFFERENCE")))',
            })
        for c, fx in f.items():
            cell = ws.cell(r, c, fx)
            cell.number_format = S.FMT_PCT if c == 10 else ("#,##0;[Red]-#,##0;0" if c == 13 else (S.FMT_MONEY if c in (4, 5, 6, 11, 12) else "0"))
    ws.conditional_formatting.add(f"A{r1 + 2}:N{r1 + 22}", FormulaRule(formula=[f'$B{r1 + 2}<>""'], border=BOX))
    rng = f"M{r1 + 2}:M{r1 + 22}"
    ws.conditional_formatting.add(rng, FormulaRule(formula=[f'AND(M{r1+2}<>"",M{r1+2}<0)'], fill=PatternFill("solid", fgColor=RED), font=Font(bold=True, color="9C0006")))
    ws.conditional_formatting.add(rng, FormulaRule(formula=[f'AND(M{r1+2}<>"",M{r1+2}>0)'], fill=PatternFill("solid", fgColor=AMBER)))
    ws.conditional_formatting.add(f"N{r1 + 2}:N{r1 + 22}", CellIsRule(operator="equal", formula=['"CASH DIFFERENCE"'], fill=PatternFill("solid", fgColor=RED)))
    ws.cell(r1 + 24, 1, "Expected Cash = cash payments recorded under that collector for the month. Actual Cash = amount entered in CASH_RECONCILIATION. "
                        "A difference is only shown as a number - please add an explanation in CASH_RECONCILIATION > Remarks.").font = F_SUB
    link(ws.cell(r1 + 25, 1), "CASH_RECONCILIATION", "Open Cash Reconciliation ►")
    link(ws.cell(r1 + 25, 4), "PRINT_CENTER", "Print recovery lists ►")
    link(ws.cell(r1 + 25, 7), "REPORTS", "Reports & monthly comparison ►")
    widths(ws, {"A": 22, "B": 16, "C": 14, "D": 14, "E": 15, "F": 14, "G": 14, "H": 10, "I": 14, "J": 11, "K": 13, "L": 13, "M": 12, "N": 17})
    page_setup(ws)
    protect(ws)
    ws["C2"].protection = Protection(locked=False)


# ------------------------------------------------------------- PRINT CENTER
def build_print_center(wb):
    ws = wb["PRINT_CENTER"]
    title(ws, "PRINT CENTER - RECOVERY LISTS", "1) Choose filters in the yellow cells  2) Check the preview count  3) Open PRINT SHEET and print (Ctrl+P).")
    home_link(ws, "H1")
    rows = [
        ("Print Mode", "PC_Mode", "Area-wise Recovery", "L_PrintModes", None),
        ("Month", "PC_Month", "=CFG_CurrentMonth", "L_Months", "@"),
        ("Area", "PC_Area", "All", "L_AreaNamesAll", None),
        ("Location Code / Street", "PC_Location", "All", "L_LocCodesAll", "@"),
        ("Collector", "PC_Collector", "All", "L_CollectorNamesAll", None),
        ("Payment Status", "PC_Status", "All", "L_PrintStatuses", None),
        ("Due Date (day)", "PC_DueDate", "All", "L_DueDaysAll", None),
    ]
    for i, (lab, nm, default, lst, fmt) in enumerate(rows):
        r = 4 + i
        label(ws.cell(r, 2), lab)
        c = ws.cell(r, 3)
        inp(c, default)
        if fmt:
            c.number_format = fmt
        dv = DataValidation(type="list", formula1=lst, allow_blank=False, showErrorMessage=True,
                            errorTitle="CITY LINKS", error="Please choose a value from the list.")
        ws.add_data_validation(dv)
        dv.add(c.coordinate)
        name(wb, nm, abs_ref("PRINT_CENTER", c.coordinate))
    ws["D5"] = '=IFERROR(TEXT(DATE(LEFT(PC_Month,4),MID(PC_Month,6,2),1),"mmmm yyyy"),"")'
    ws["D7"] = '=IF(PC_Location="All","",IFERROR(INDEX(tblLocations[Full Address],MATCH(PC_Location,tblLocations[Location Code],0)),"Location Code does not exist"))'
    ws["D9"] = "UNPAID = Pending + Partial (everyone who still owes money)"
    ws["D9"].font = F_SUB

    label(ws.cell(12, 2), "Effective Status Filter")
    calc(ws["C12"], '=IF(AND(PC_Mode="Pending Recovery",PC_Status="All"),"UNPAID",IF(AND(PC_Mode="Partial Payment Recovery",PC_Status="All"),"PARTIAL",PC_Status))')
    name(wb, "PC_StatusEff", abs_ref("PRINT_CENTER", "C12"))
    label(ws.cell(13, 2), "Customers in this list")
    calc(ws["C13"], "=SUM(tblBilling[Print Match])", "0", bold=True)
    name(wb, "PC_Count", abs_ref("PRINT_CENTER", "C13"))
    label(ws.cell(14, 2), "List Title")
    calc(ws["C14"],
         '=TRIM(IF(PC_Location<>"All",IFERROR(INDEX(tblLocations[Full Address],MATCH(PC_Location,tblLocations[Location Code],0)),PC_Location),'
         'IF(PC_Area<>"All",PC_Area,"All Areas"))&" "&IFERROR(INDEX(L_PrintStatusLabels,MATCH(PC_StatusEff,L_PrintStatuses,0)),"")'
         '&" Recovery List"&IF(PC_Collector<>"All"," - "&PC_Collector,"")&IF(PC_DueDate<>"All"," - Due "&PC_DueDate,""))', bold=True)
    name(wb, "PC_Title", abs_ref("PRINT_CENTER", "C14"))
    label(ws.cell(15, 2), "Total Billing")
    calc(ws["C15"], '=SUMIFS(tblBilling[Monthly Fee],tblBilling[Print Match],1)', S.FMT_MONEY)
    name(wb, "PC_TotalFee", abs_ref("PRINT_CENTER", "C15"))
    label(ws.cell(16, 2), "Total Recovered")
    calc(ws["C16"], '=SUMIFS(tblBilling[Amount Paid],tblBilling[Print Match],1)', S.FMT_MONEY)
    name(wb, "PC_TotalPaid", abs_ref("PRINT_CENTER", "C16"))
    label(ws.cell(17, 2), "Total Pending")
    calc(ws["C17"], '=SUMIFS(tblBilling[Balance],tblBilling[Print Match],1)', S.FMT_MONEY)
    name(wb, "PC_TotalBalance", abs_ref("PRINT_CENTER", "C17"))
    label(ws.cell(18, 2), "Message")
    calc(ws["C18"], f'=IF(COUNTIF(tblBilling[Month],PC_Month)=0,"No billing exists for "&PC_Month&". Generate the month first.",'
                    f'IF(PC_Count>{PRINT_ROWS},"More than {PRINT_ROWS} customers - narrow the filters or use the menu program (Print recovery list PDF).",'
                    'IF(PC_Count=0,"No customers match these filters.","Ready to print.")))', bold=True)
    link(ws["C20"], "PRINT_SHEET", "► OPEN PRINT SHEET (English)")
    link(ws["C21"], "PRINT_SHEET_UR", "► OPEN PRINT SHEET (Urdu / RTL)")
    ws["C22"] = '="Print Language in SETTINGS: "&CFG_PrintLanguage'
    ws["C22"].font = F_SUB

    section(ws, 24, "PRINT MODES (presets)", 2, 4)
    help_rows = [
        ("Area-wise Recovery", "Choose Area, keep Location = All."),
        ("Street-wise Recovery", "Choose Location Code e.g. A1 (Arif Town, Gali 1)."),
        ("Collector-wise Recovery", "Choose Collector (uses RECOVERY_ASSIGNMENTS)."),
        ("Due-Date-wise Recovery", "Choose Due Date (day of month)."),
        ("Pending Recovery", "Status All is treated as UNPAID (pending + partial)."),
        ("Partial Payment Recovery", "Status All is treated as PARTIAL."),
        ("Custom Filtered Recovery", "Type Customer IDs in column F; only those customers are listed (other filters still apply)."),
    ]
    for i, (m, h) in enumerate(help_rows):
        ws.cell(25 + i, 2, m).font = F_B
        ws.cell(25 + i, 3, h)

    ws["F3"] = "Custom Customer IDs"
    ws["F3"].font = F_B
    for r in range(4, 104):
        inp(ws.cell(r, 6))
        ws.cell(r, 6).number_format = "@"
    name(wb, "PC_CustomIDs", "'PRINT_CENTER'!$F$4:$F$103")
    ws["G3"] = "Count"
    ws["G4"] = '=COUNTIF(PC_CustomIDs,"?*")'
    name(wb, "PC_CustomCount", abs_ref("PRINT_CENTER", "G4"))
    widths(ws, {"A": 3, "B": 26, "C": 44, "D": 46, "E": 3, "F": 16, "G": 8})
    protect(ws)


def build_print_sheet(wb, urdu=False):
    sheet = "PRINT_SHEET_UR" if urdu else "PRINT_SHEET"
    ws = wb[sheet]
    ws.sheet_view.showGridLines = False
    if urdu:
        ws.sheet_view.rightToLeft = True
    big = Font(size=16, bold=True, color=NAVY)
    ws.merge_cells("A1:L1")
    ws["A1"] = "=CFG_CompanyName"
    ws["A1"].font = Font(size=20, bold=True, color=NAVY)
    ws["A1"].alignment = CENTER
    ws.merge_cells("A2:L2")
    ws["A2"] = "=CFG_Tagline"
    ws["A2"].alignment = CENTER
    ws["A2"].font = Font(size=11, bold=True, color="595959")
    ws.merge_cells("A3:L3")
    ws["A3"] = "ماہانہ ریکوری شیٹ" if urdu else "MONTHLY RECOVERY SHEET"
    ws["A3"].font = big
    ws["A3"].alignment = CENTER
    ws.merge_cells("A4:L4")
    ws["A4"] = "=PC_Title"
    ws["A4"].font = Font(size=12, bold=True)
    ws["A4"].alignment = CENTER
    L = (lambda en, ur: ur if urdu else en)
    info = [
        (5, 1, L("Area:", "علاقہ:"), 3, '=PC_Area'),
        (5, 4, L("Location/Street:", "گلی / لوکیشن:"), 5, '=IF(PC_Location="All","All",PC_Location&" - "&IFERROR(INDEX(tblLocations[Full Address],MATCH(PC_Location,tblLocations[Location Code],0)),""))'),
        (5, 8, L("Month:", "مہینہ:"), 9, '=IFERROR(TEXT(DATE(LEFT(PC_Month,4),MID(PC_Month,6,2),1),"mmmm yyyy"),PC_Month)'),
        (5, 10, L("Collector:", "ریکوری:"), 11, '=PC_Collector'),
        (6, 1, L("Total Customers:", "کل کسٹمر:"), 3, '=PC_Count'),
        (6, 4, L("Total Billing:", "کل بل:"), 5, '=CFG_CurrencySymbol&" "&TEXT(PC_TotalFee,"#,##0")'),
        (6, 8, L("Recovered:", "وصول شدہ:"), 9, '=CFG_CurrencySymbol&" "&TEXT(PC_TotalPaid,"#,##0")'),
        (6, 10, L("Pending:", "بقایا:"), 11, '=CFG_CurrencySymbol&" "&TEXT(PC_TotalBalance,"#,##0")'),
        (7, 1, L("Status:", "اسٹیٹس:"), 3, '=PC_StatusEff'),
        (7, 4, L("Printed:", "پرنٹ تاریخ:"), 5, '=TODAY()'),
    ]
    for r, lc, lab, vc, f in info:
        ws.cell(r, lc, lab).font = F_B
        if lc == 1:
            ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=2)
        c = ws.cell(r, vc, f)
        c.alignment = LEFT
        if f == "=TODAY()":
            c.number_format = S.FMT_DATE
    hdr = S.PRINT_COLUMNS_UR if urdu else S.PRINT_COLUMNS
    header_cells(ws, 9, hdr, fill=PatternFill("solid", fgColor=NAVY))
    ws.row_dimensions[9].height = 30
    first = 10
    ws["Z1"] = f"=MIN(PC_Count,{PRINT_ROWS})+{first - 1}+7"     # rows to print (used by dynamic print area)
    ws["Z1"].font = Font(color="FFFFFF")
    src_cols = {2: "Customer ID", 3: "Customer Name", 4: "Full Address", 5: "VLAN ID", 6: "Due Date",
                7: "Monthly Fee", 8: "Amount Paid", 9: "Balance", 10: "Payment Status", 11: "Last Payment Date",
                12: "Collector Name"}
    for k in range(1, PRINT_ROWS + 1):
        r = first + k - 1
        pos = f"$N{r}"
        t = f"$O{r}"
        if urdu:
            # Urdu sheet mirrors the English sheet (same data, RTL layout)
            for c in range(1, 13):
                src = f"PRINT_SHEET!{get_column_letter(c)}{r}"
                if c == 10:
                    ws.cell(r, c, f'=IFERROR(INDEX({{"ادا شدہ","جزوی","بقایا"}},MATCH({src},{{"PAID","PARTIAL","PENDING"}},0)),{src})')
                else:
                    ws.cell(r, c, f'=IF({src}="","",{src})')
        else:
            if k == 1:
                ws.cell(r, 14, '=IFERROR(MATCH(1,tblBilling[Print Match],0),"")')
            else:
                prev = f"N{r - 1}"
                ws.cell(r, 14, f'=IF({prev}="","",IFERROR({prev}+MATCH(1,INDEX(tblBilling[Print Match],{prev}+1):INDEX(tblBilling[Print Match],ROWS(tblBilling[Print Match])),0),""))')
            ws.cell(r, 15, f"=ROW()-{first - 1}-MIN(PC_Count,{PRINT_ROWS})")
            ws.cell(r, 1, f'=IF({pos}="","",ROW()-{first - 1})')
            for c, colname in src_cols.items():
                getter = f"INDEX(tblBilling[{colname}],{pos})"
                if c == 3:
                    tail = (f'CHOOSE(MIN(MAX({t},0),7)+1,"","TOTAL","","Total Customers: "&PC_Count,'
                            f'"Total Recovered: "&CFG_CurrencySymbol&" "&TEXT(PC_TotalPaid,"#,##0"),"","Collector Signature: ____________","")')
                elif c == 4:
                    tail = (f'CHOOSE(MIN(MAX({t},0),7)+1,"","","","Total Billing: "&CFG_CurrencySymbol&" "&TEXT(PC_TotalFee,"#,##0"),'
                            f'"Total Pending: "&CFG_CurrencySymbol&" "&TEXT(PC_TotalBalance,"#,##0"),"","Office Verification: ____________","")')
                elif c == 7:
                    tail = f'IF({t}=1,PC_TotalFee,"")'
                elif c == 8:
                    tail = f'IF({t}=1,PC_TotalPaid,"")'
                elif c == 9:
                    tail = f'IF({t}=1,PC_TotalBalance,"")'
                else:
                    tail = '""'
                if c == 11:
                    getter = f'IF({getter}="","",{getter})'
                ws.cell(r, c, f'=IF({pos}<>"",{getter},{tail})')
        for c in range(1, 13):
            cell = ws.cell(r, c)
            cell.font = Font(size=10)
            cell.alignment = Alignment(vertical="center", horizontal="right" if urdu and c in (3, 4) else None)
            if c in (7, 8, 9):
                cell.number_format = S.FMT_MONEY
            elif c == 11:
                cell.number_format = S.FMT_DATE
            elif c in (1, 6):
                cell.number_format = "0"
                cell.alignment = Alignment(horizontal="center", vertical="center")
        ws.row_dimensions[r].height = 20
    last = first + PRINT_ROWS - 1
    rng = f"A{first}:L{last}"
    eng = "PRINT_SHEET!" if urdu else ""
    ws.conditional_formatting.add(rng, FormulaRule(formula=[f'{eng}$N{first}<>""'], border=BOX))
    ws.conditional_formatting.add(rng, FormulaRule(formula=[f'{eng}$O{first}=1'], font=Font(bold=True),
                                                   fill=PatternFill("solid", fgColor="D9E1F2"), border=BOX))
    ws.conditional_formatting.add(rng, FormulaRule(formula=[f'OR({eng}$O{first}=3,{eng}$O{first}=4,{eng}$O{first}=6)'], font=Font(bold=True)))
    for col in ("N", "O"):
        ws.column_dimensions[col].hidden = True
    widths(ws, {"A": 5, "B": 11, "C": 30, "D": 30, "E": 8, "F": 6, "G": 10, "H": 10, "I": 10, "J": 10, "K": 12, "L": 13})
    page_setup(ws, title_rows="4:9", footer="Collector Signature: ______________     Office Verification: ______________")
    ws.print_area = f"A1:L{last + 1}"
    protect(ws)


# ------------------------------------------------------------- PAYMENT ENTRY
def build_payment_entry(wb):
    ws = wb["PAYMENT_ENTRY"]
    title(ws, "PAYMENT ENTRY", "Type a Customer ID to see the bill. Recommended: record payments with the menu program (option 'Record payment') - it saves and checks everything automatically.")
    home_link(ws, "H1")
    label(ws["B4"], "Customer ID")
    inp(ws["C4"], "")
    ws["C4"].number_format = "@"
    name(wb, "PE_CustomerID", abs_ref("PAYMENT_ENTRY", "C4"))
    label(ws["B5"], "Month")
    inp(ws["C5"], "=CFG_CurrentMonth")
    add_dv(ws, "month", "C5")
    name(wb, "PE_Month", abs_ref("PAYMENT_ENTRY", "C5"))
    cid, mon = "PE_CustomerID", "PE_Month"
    look = lambda col: f'=IF({cid}="","",IFERROR(INDEX(tblCustomers[{col}],MATCH({cid},tblCustomers[Customer ID],0)),"Customer "&{cid}&" was not found."))'
    bid = f'{mon}&"-"&{cid}'
    bill = lambda col: f'=IF({cid}="","",IFERROR(INDEX(tblBilling[{col}],MATCH({bid},tblBilling[Billing ID],0)),"No bill for this month"))'
    fields = [
        ("Customer Name", look("Customer Name"), None),
        ("Full Address", look("Full Address"), None),
        ("VLAN ID", look("VLAN ID"), None),
        ("Mobile", look("Mobile Number"), None),
        ("Customer Status", look("Customer Status"), None),
        ("Bill (this month)", bill("Monthly Fee"), S.FMT_MONEY),
        ("Already Paid", bill("Amount Paid"), S.FMT_MONEY),
        ("Remaining", bill("Balance"), S.FMT_MONEY),
        ("Payment Status", bill("Payment Status"), None),
        ("Assigned Collector", bill("Collector Name"), None),
        ("Outstanding (all months)", f'=IF({cid}="","",SUMIFS(tblBilling[Balance],tblBilling[Customer ID],{cid}))', S.FMT_MONEY),
        ("Next Payment ID", '="PAY-"&TEXT(IFERROR(AGGREGATE(14,6,--MID(tblPayments[Payment ID],5,10),1),0)+1,"000000")', None),
    ]
    for i, (lab, f, fmt) in enumerate(fields):
        r = 7 + i
        label(ws.cell(r, 2), lab)
        calc(ws.cell(r, 3), f, fmt, bold=lab in ("Remaining", "Payment Status"))
    r = 7 + len(fields) + 1
    section(ws, r, "HOW TO SAVE A PAYMENT WITHOUT THE MENU PROGRAM", 2, 4)
    steps = [
        "1. Go to PAYMENTS and type in the first empty row below the table: Payment ID (shown above), Customer ID, Month,",
        "   Payment Date, Amount, Payment Method, Collector ID. Set Voided = No.",
        "2. Amount Paid, Balance and Status in MONTHLY_BILLING update automatically. Several partial payments are allowed.",
        "3. Never delete a wrong payment - set Voided = Yes and write the reason.",
    ]
    for i, s in enumerate(steps):
        ws.cell(r + 1 + i, 2, s)
    link(ws.cell(r + 6, 2), "PAYMENTS", "► Open PAYMENTS")
    r2 = r + 8
    section(ws, r2, "THIS CUSTOMER'S PAYMENTS (latest 20 shown in order entered)", 2, 9)
    header_cells(ws, r2 + 1, ["Payment ID", "Month", "Payment Date", "Amount", "Method", "Collector", "Reference", "Voided"], c1=2)
    cols = ["Payment ID", "Month", "Payment Date", "Amount", "Payment Method", "Collector ID", "Reference", "Voided"]
    for k in range(1, 21):
        rr = r2 + 1 + k
        if k == 1:
            ws.cell(rr, 11, f'=IF({cid}="","",IFERROR(MATCH({cid},tblPayments[Customer ID],0),""))')
        else:
            p = f"K{rr - 1}"
            ws.cell(rr, 11, f'=IF({p}="","",IFERROR({p}+MATCH({cid},INDEX(tblPayments[Customer ID],{p}+1):INDEX(tblPayments[Customer ID],ROWS(tblPayments[Customer ID])),0),""))')
        for j, cn in enumerate(cols):
            c = ws.cell(rr, 2 + j, f'=IF($K{rr}="","",INDEX(tblPayments[{cn}],$K{rr})&"")' if cn not in ("Payment Date", "Amount") else
                        f'=IF($K{rr}="","",INDEX(tblPayments[{cn}],$K{rr}))')
            c.number_format = S.FMT_DATE if cn == "Payment Date" else (S.FMT_MONEY if cn == "Amount" else "General")
            c.border = BOX
    ws.column_dimensions["K"].hidden = True
    widths(ws, {"A": 3, "B": 26, "C": 40, "D": 14, "E": 12, "F": 12, "G": 12, "H": 14, "I": 9})
    protect(ws)


# ---------------------------------------------------------- CUSTOMER HISTORY
def build_customer_history(wb):
    ws = wb["CUSTOMER_HISTORY"]
    title(ws, "CUSTOMER HISTORY", "Search by Customer ID (best), Name, Mobile, VLAN ID, Location Code or Area. Capital/small letters do not matter.")
    home_link(ws, "J1")
    label(ws["B4"], "Search By")
    inp(ws["C4"], "Customer ID")
    dv = DataValidation(type="list", formula1="L_SearchTypes", allow_blank=False)
    ws.add_data_validation(dv)
    dv.add("C4")
    name(wb, "CH_SearchType", abs_ref("CUSTOMER_HISTORY", "C4"))
    label(ws["B5"], "Search Text")
    inp(ws["C5"], "")
    ws["C5"].number_format = "@"
    name(wb, "CH_SearchText", abs_ref("CUSTOMER_HISTORY", "C5"))
    label(ws["B6"], "Matches found")
    calc(ws["C6"], "=SUM(tblCustomers[Search Match])", "0")
    label(ws["B7"], "SELECTED CUSTOMER ID")
    calc(ws["C7"], '=IF(CH_SearchText="","",IF(COUNTIF(tblCustomers[Customer ID],CH_SearchText)=1,'
                   'INDEX(tblCustomers[Customer ID],MATCH(CH_SearchText,tblCustomers[Customer ID],0)),'
                   'IF(C6=1,INDEX(tblCustomers[Customer ID],MATCH(1,tblCustomers[Search Match],0)),"")))', bold=True)
    ws["C7"].font = Font(size=14, bold=True, color="C00000")
    name(wb, "CH_CustomerID", abs_ref("CUSTOMER_HISTORY", "C7"))
    ws["D7"] = '=IF(CH_SearchText="","Type a Customer ID (e.g. CL-0025) in Search Text.",IF(C6=0,"Customer "&CH_SearchText&" was not found.",IF(C7="","Several customers match - copy the correct Customer ID from the list on the right into Search Text.","")))'
    ws["D7"].font = Font(bold=True, color="C00000")

    # matches list
    ws["F3"] = "MATCHING CUSTOMERS (first 15)"
    ws["F3"].font = F_B
    header_cells(ws, 4, ["Customer ID", "Customer Name", "Location", "VLAN", "Mobile", "Status"], c1=6)
    mcols = ["Customer ID", "Customer Name", "Location Code", "VLAN ID", "Mobile Number", "Customer Status"]
    for k in range(1, 16):
        r = 4 + k
        if k == 1:
            ws.cell(r, 13, '=IFERROR(MATCH(1,tblCustomers[Search Match],0),"")')
        else:
            p = f"M{r - 1}"
            ws.cell(r, 13, f'=IF({p}="","",IFERROR({p}+MATCH(1,INDEX(tblCustomers[Search Match],{p}+1):INDEX(tblCustomers[Search Match],ROWS(tblCustomers[Search Match])),0),""))')
        for j, cn in enumerate(mcols):
            c = ws.cell(r, 6 + j, f'=IF($M{r}="","",INDEX(tblCustomers[{cn}],$M{r})&"")')
            c.border = BOX
    ws.column_dimensions["M"].hidden = True

    cid = "CH_CustomerID"
    look = lambda col: f'=IF({cid}="","",INDEX(tblCustomers[{col}],MATCH({cid},tblCustomers[Customer ID],0)))'
    section(ws, 21, "CUSTOMER PROFILE", 2, 4)
    prof = [("Customer ID", "=CH_CustomerID"), ("Customer Name", look("Customer Name")), ("Location Code", look("Location Code")),
            ("Area", look("Area")), ("Street", look("Street")), ("Full Address", look("Full Address")),
            ("VLAN ID", look("VLAN ID")), ("Package", look("Package")), ("Monthly Fee", look("Monthly Fee")),
            ("Due Date", look("Due Date")), ("Connection Date", look("Connection Date")),
            ("Current Status", look("Customer Status")), ("Mobile", look("Mobile Number"))]
    for i, (lab, f) in enumerate(prof):
        r = 22 + i
        label(ws.cell(r, 2), lab)
        calc(ws.cell(r, 3), f, S.FMT_MONEY if lab == "Monthly Fee" else (S.FMT_DATE if lab == "Connection Date" else None))
        ws.cell(r, 3).alignment = LEFT
    section(ws, 21, "TOTALS", 6, 9)
    tots = [
        ("Total Billing", f'=IF({cid}="","",SUMIFS(tblBilling[Monthly Fee],tblBilling[Customer ID],{cid}))', S.FMT_MONEY),
        ("Total Paid", f'=IF({cid}="","",SUMIFS(tblBilling[Amount Paid],tblBilling[Customer ID],{cid}))', S.FMT_MONEY),
        ("Total Outstanding", f'=IF({cid}="","",SUMIFS(tblBilling[Balance],tblBilling[Customer ID],{cid}))', S.FMT_MONEY),
        ("Last Payment Date", f'=IF({cid}="","",IF(COUNTIFS(tblPayments[Customer ID],{cid},tblPayments[Voided],"<>Yes")=0,"No payments",IFERROR(_xlfn.MAXIFS(tblPayments[Payment Date],tblPayments[Customer ID],{cid},tblPayments[Voided],"<>Yes"),"")))', S.FMT_DATE),
        ("Last Payment Amount", f'=IF(OR({cid}="",NOT(ISNUMBER(H25))),"",SUMIFS(tblPayments[Amount],tblPayments[Customer ID],{cid},tblPayments[Payment Date],H25,tblPayments[Voided],"<>Yes"))', S.FMT_MONEY),
        ("Months Billed", f'=IF({cid}="","",COUNTIF(tblBilling[Customer ID],{cid}))', "0"),
    ]
    for i, (lab, f, fmt) in enumerate(tots):
        r = 22 + i
        label(ws.cell(r, 6), lab)
        ws.merge_cells(start_row=r, start_column=6, end_row=r, end_column=7)
        calc(ws.cell(r, 8), f, fmt, bold=True)
    label(ws.cell(29, 6), "WhatsApp")
    ws["H29"] = (f'=IF(OR({cid}="",C34=""),"",HYPERLINK("https://wa.me/"&IF(LEFT(SUBSTITUTE(SUBSTITUTE(C34,"-","")," ",""),1)="0",'
                 f'CFG_WhatsAppCountryCode&MID(SUBSTITUTE(SUBSTITUTE(C34,"-","")," ",""),2,20),SUBSTITUTE(SUBSTITUTE(C34,"-","")," ",""))'
                 f'&"?text="&_xlfn.ENCODEURL(CFG_WhatsAppMessage),"OPEN WHATSAPP"))')
    ws["H29"].font = F_LINK
    ws["F30"] = "The PDF statement must be attached manually in WhatsApp."
    ws["F30"].font = F_SUB
    link(ws["F31"], "STATEMENT", "► Customer statement sheet")

    r0 = 37
    section(ws, r0, "COMPLETE BILLING / PAYMENT HISTORY (never overwritten)", 2, 10)
    hdr = ["Month", "Month Name", "Bill", "Paid", "Payment Date", "Balance", "Status", "Collector", "Payments"]
    header_cells(ws, r0 + 1, hdr, c1=2)
    cols = ["Month", "Month Name", "Monthly Fee", "Amount Paid", "Last Payment Date", "Balance", "Payment Status", "Collector Name", "Payments Count"]
    for k in range(1, HIST_ROWS + 1):
        r = r0 + 1 + k
        if k == 1:
            ws.cell(r, 13, f'=IF({cid}="","",IFERROR(MATCH({cid},tblBilling[Customer ID],0),""))')
        else:
            p = f"M{r - 1}"
            ws.cell(r, 13, f'=IF({p}="","",IFERROR({p}+MATCH({cid},INDEX(tblBilling[Customer ID],{p}+1):INDEX(tblBilling[Customer ID],ROWS(tblBilling[Customer ID])),0),""))')
        for j, cn in enumerate(cols):
            g = f"INDEX(tblBilling[{cn}],$M{r})"
            f = f'=IF($M{r}="","",IF({g}="","",{g}))'
            c = ws.cell(r, 2 + j, f)
            c.number_format = {"Monthly Fee": S.FMT_MONEY, "Amount Paid": S.FMT_MONEY, "Balance": S.FMT_MONEY,
                               "Last Payment Date": S.FMT_DATE, "Payments Count": "0"}.get(cn, "@" if cn == "Month" else "General")
        for c in range(2, 11):
            ws.cell(r, c).border = Border(bottom=Side(style="hair", color="BFBFBF"))
    rng = f"H{r0 + 2}:H{r0 + 1 + HIST_ROWS}"
    for val, fill in (("PAID", GREEN), ("PARTIAL", AMBER), ("PENDING", RED)):
        ws.conditional_formatting.add(rng, CellIsRule(operator="equal", formula=[f'"{val}"'], fill=PatternFill("solid", fgColor=fill)))

    r1 = r0 + HIST_ROWS + 3
    section(ws, r1, "CONNECTION HISTORY (CUSTOMER_EVENTS)", 2, 10)
    header_cells(ws, r1 + 1, ["Event Date", "Event Type", "Old Value", "New Value", "Notes"], c1=2)
    ecols = ["Event Date", "Event Type", "Old Value", "New Value", "Notes"]
    for k in range(1, 41):
        r = r1 + 1 + k
        if k == 1:
            ws.cell(r, 13, f'=IF({cid}="","",IFERROR(MATCH({cid},tblEvents[Customer ID],0),""))')
        else:
            p = f"M{r - 1}"
            ws.cell(r, 13, f'=IF({p}="","",IFERROR({p}+MATCH({cid},INDEX(tblEvents[Customer ID],{p}+1):INDEX(tblEvents[Customer ID],ROWS(tblEvents[Customer ID])),0),""))')
        for j, cn in enumerate(ecols):
            g = f"INDEX(tblEvents[{cn}],$M{r})"
            c = ws.cell(r, 2 + j, f'=IF($M{r}="","",IF({g}="","",{g}))')
            if cn == "Event Date":
                c.number_format = S.FMT_DATE
    widths(ws, {"A": 3, "B": 22, "C": 34, "D": 12, "E": 13, "F": 13, "G": 22, "H": 14, "I": 13, "J": 13, "K": 14})
    ws.freeze_panes = "A8"
    protect(ws)


# ---------------------------------------------------------------- STATEMENT
def build_statement(wb):
    ws = wb["STATEMENT"]
    ws.sheet_view.showGridLines = False
    ws.merge_cells("A1:H1")
    ws["A1"] = "=CFG_CompanyName"
    ws["A1"].font = Font(size=22, bold=True, color=NAVY)
    ws["A1"].alignment = CENTER
    ws.merge_cells("A2:H2")
    ws["A2"] = '=CFG_Tagline&IF(CFG_CompanyPhone="","","  |  "&CFG_CompanyPhone)'
    ws["A2"].alignment = CENTER
    ws["A2"].font = Font(size=11, bold=True, color="595959")
    ws.merge_cells("A3:H3")
    ws["A3"] = "CUSTOMER PAYMENT STATEMENT"
    ws["A3"].font = Font(size=15, bold=True)
    ws["A3"].alignment = CENTER
    ws["J1"] = "SELECT ->"
    ws["J1"].font = F_B
    label(ws["J2"], "Customer ID")
    inp(ws["K2"], "")
    ws["K2"].number_format = "@"
    name(wb, "ST_CustomerID", abs_ref("STATEMENT", "K2"))
    label(ws["J3"], "From Month")
    inp(ws["K3"], "All")
    label(ws["J4"], "To Month")
    inp(ws["K4"], "All")
    for c in ("K3", "K4"):
        dv = DataValidation(type="list", formula1="L_MonthsAll", allow_blank=False)
        ws.add_data_validation(dv)
        dv.add(c)
    name(wb, "ST_From", abs_ref("STATEMENT", "K3"))
    name(wb, "ST_To", abs_ref("STATEMENT", "K4"))
    ws["J5"] = "All = complete history. Use the menu program for the PDF file (Export PDF)."
    ws["J5"].font = F_SUB
    link(ws["J6"], "HOME", "◄ HOME")
    cid = "ST_CustomerID"
    look = lambda col: f'=IF({cid}="","",IFERROR(INDEX(tblCustomers[{col}],MATCH({cid},tblCustomers[Customer ID],0)),"Customer "&{cid}&" was not found."))'
    info = [("Customer ID", f"={cid}"), ("Customer Name", look("Customer Name")), ("Address", look("Full Address")),
            ("VLAN ID", look("VLAN ID")), ("Package", look("Package")), ("Monthly Fee", look("Monthly Fee")),
            ("Connection Date", look("Connection Date")), ("Current Status", look("Customer Status"))]
    for i, (lab, f) in enumerate(info):
        r = 5 + i
        ws.cell(r, 1, lab).font = F_B
        ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=2)
        ws.merge_cells(start_row=r, start_column=3, end_row=r, end_column=5)
        c = ws.cell(r, 3, f)
        c.alignment = LEFT
        c.number_format = S.FMT_MONEY if lab == "Monthly Fee" else (S.FMT_DATE if lab == "Connection Date" else "General")
    ws["F5"] = "Period:"
    ws["F5"].font = F_B
    ws["G5"] = '=IF(AND(ST_From="All",ST_To="All"),"Complete History",IF(ST_From="All","Up to ","")&ST_From&IF(AND(ST_From<>"All",ST_To<>"All")," to ","")&IF(ST_To="All"," onwards",ST_To))'
    ws["F6"] = "Generated:"
    ws["F6"].font = F_B
    ws["G6"] = "=TODAY()"
    ws["G6"].number_format = S.FMT_DATE
    ws["G6"].alignment = LEFT
    hr = 14
    header_cells(ws, hr, ["Month", "Bill", "Paid", "Payment Date", "Balance", "Status", "Payments", "Remarks"], fill=PatternFill("solid", fgColor=NAVY))
    cols = ["Month Name", "Monthly Fee", "Amount Paid", "Last Payment Date", "Balance", "Payment Status", "Payments Count", "Remarks"]
    ws["Z1"] = f'=MAX(COUNTIF(tblBilling[Stmt Match],1),1)+{hr}+6'
    ws["Z1"].font = Font(color="FFFFFF")
    for k in range(1, STMT_ROWS + 1):
        r = hr + k
        if k == 1:
            ws.cell(r, 26, '=IFERROR(MATCH(1,tblBilling[Stmt Match],0),"")')
        else:
            p = f"Z{r - 1}"
            ws.cell(r, 26, f'=IF({p}="","",IFERROR({p}+MATCH(1,INDEX(tblBilling[Stmt Match],{p}+1):INDEX(tblBilling[Stmt Match],ROWS(tblBilling[Stmt Match])),0),""))')
        ws.cell(r, 27, f'=ROW()-{hr}-COUNTIF(tblBilling[Stmt Match],1)')
        for j, cn in enumerate(cols):
            g = f"INDEX(tblBilling[{cn}],$Z{r})"
            if j == 0:
                tail = f'CHOOSE(MIN(MAX($AA{r},0),5)+1,"","TOTAL","","Total Billing: "&CFG_CurrencySymbol&" "&TEXT(SUMIFS(tblBilling[Monthly Fee],tblBilling[Stmt Match],1),"#,##0"),"Total Paid: "&CFG_CurrencySymbol&" "&TEXT(SUMIFS(tblBilling[Amount Paid],tblBilling[Stmt Match],1),"#,##0"),"Total Outstanding: "&CFG_CurrencySymbol&" "&TEXT(SUMIFS(tblBilling[Balance],tblBilling[Stmt Match],1),"#,##0"))'
            elif cn in ("Monthly Fee", "Amount Paid", "Balance"):
                tail = f'IF($AA{r}=1,SUMIFS(tblBilling[{cn}],tblBilling[Stmt Match],1),"")'
            else:
                tail = '""'
            c = ws.cell(r, 1 + j, f'=IF($Z{r}<>"",IF({g}="","",{g}),{tail})')
            c.number_format = {"Monthly Fee": S.FMT_MONEY, "Amount Paid": S.FMT_MONEY, "Balance": S.FMT_MONEY,
                               "Last Payment Date": S.FMT_DATE, "Payments Count": "0"}.get(cn, "General")
            c.font = Font(size=10)
    rng = f"A{hr + 1}:H{hr + STMT_ROWS}"
    ws.conditional_formatting.add(rng, FormulaRule(formula=[f'$Z{hr + 1}<>""'], border=BOX))
    ws.conditional_formatting.add(rng, FormulaRule(formula=[f'$AA{hr + 1}=1'], font=Font(bold=True), fill=PatternFill("solid", fgColor="D9E1F2"), border=BOX))
    ws.conditional_formatting.add(rng, FormulaRule(formula=[f'$AA{hr + 1}>=3'], font=Font(bold=True, size=11)))
    for col in ("Z", "AA"):
        ws.column_dimensions[col].hidden = True
    widths(ws, {"A": 16, "B": 11, "C": 11, "D": 14, "E": 11, "F": 11, "G": 10, "H": 22, "I": 3, "J": 14, "K": 14})
    page_setup(ws, landscape=False, title_rows=f"{hr}:{hr}", footer="Computer generated statement")
    ws.print_area = f"A1:H{hr + STMT_ROWS}"
    protect(ws)


# ------------------------------------------------------------------ REPORTS
def build_reports(wb):
    ws = wb["REPORTS"]
    title(ws, "REPORTS", "Monthly comparison and street-wise report. Full report packs (Excel) are exported by the menu program.")
    home_link(ws, "J1")
    section(ws, 4, "MONTHLY COMPARISON", 2, 6)
    label(ws["B5"], "Month A")
    inp(ws["C5"], "")
    label(ws["B6"], "Month B")
    inp(ws["C6"], "=CFG_CurrentMonth")
    for c in ("C5", "C6"):
        ws[c].number_format = "@"
        add_dv(ws, "month", c)
    header_cells(ws, 8, ["Metric", "Month A", "Month B", "Change", "Change %"], c1=2)
    ms = [("Customers Billed", 'COUNTIF(tblBilling[Month],{m})', "0"),
          ("Billing", 'SUMIFS(tblBilling[Monthly Fee],tblBilling[Month],{m})', S.FMT_MONEY),
          ("Recovered", 'SUMIFS(tblBilling[Amount Paid],tblBilling[Month],{m})', S.FMT_MONEY),
          ("Pending (Balance)", 'SUMIFS(tblBilling[Balance],tblBilling[Month],{m})', S.FMT_MONEY),
          ("Paid Customers", 'COUNTIFS(tblBilling[Month],{m},tblBilling[Payment Status],"PAID")', "0"),
          ("Partial Customers", 'COUNTIFS(tblBilling[Month],{m},tblBilling[Payment Status],"PARTIAL")', "0"),
          ("Pending Customers", 'COUNTIFS(tblBilling[Month],{m},tblBilling[Payment Status],"PENDING")', "0"),
          ("Recovery %", 'IF(SUMIFS(tblBilling[Monthly Fee],tblBilling[Month],{m})=0,0,SUMIFS(tblBilling[Amount Paid],tblBilling[Month],{m})/SUMIFS(tblBilling[Monthly Fee],tblBilling[Month],{m}))', S.FMT_PCT)]
    for i, (lab, f, fmt) in enumerate(ms):
        r = 9 + i
        ws.cell(r, 2, lab).font = F_B
        for j, m in enumerate(("$C$5", "$C$6")):
            c = ws.cell(r, 3 + j, "=" + f.format(m=m))
            c.number_format = fmt
        ws.cell(r, 5, f"=D{r}-C{r}").number_format = fmt if fmt != S.FMT_PCT else "+0.0%;-0.0%;0.0%"
        ws.cell(r, 6, f'=IF(N(C{r})=0,"",(D{r}-C{r})/C{r})').number_format = "+0.0%;-0.0%;0.0%"
        for c in range(2, 7):
            ws.cell(r, c).border = BOX
    ws["B18"] = "Month-by-month totals for every generated month are in MONTHS (Monthly Archive)."
    ws["B18"].font = F_SUB
    link(ws["B19"], "MONTHS", "► Open Monthly Archive")

    section(ws, 21, "STREET / LOCATION-WISE REPORT (month below)", 2, 10)
    label(ws["B22"], "Month")
    inp(ws["C22"], "=CFG_CurrentMonth")
    ws["C22"].number_format = "@"
    add_dv(ws, "month", "C22")
    header_cells(ws, 23, ["Location", "Full Address", "Billed", "Billing", "Recovered", "Pending", "Recovery %", "Unpaid Customers", "Active Customers"], c1=2)
    for k in range(1, 151):
        r = 23 + k
        a = f"$B{r}"
        ws.cell(r, 2, f'=IFERROR(INDEX(tblLocations[Location Code],{k})&"","")')
        ws.cell(r, 3, f'=IF({a}="","",INDEX(tblLocations[Full Address],{k}))')
        ws.cell(r, 4, f'=IF({a}="","",COUNTIFS(tblBilling[Month],$C$22,tblBilling[Location Code],{a}))').number_format = "0"
        ws.cell(r, 5, f'=IF({a}="","",SUMIFS(tblBilling[Monthly Fee],tblBilling[Month],$C$22,tblBilling[Location Code],{a}))').number_format = S.FMT_MONEY
        ws.cell(r, 6, f'=IF({a}="","",SUMIFS(tblBilling[Amount Paid],tblBilling[Month],$C$22,tblBilling[Location Code],{a}))').number_format = S.FMT_MONEY
        ws.cell(r, 7, f'=IF({a}="","",SUMIFS(tblBilling[Balance],tblBilling[Month],$C$22,tblBilling[Location Code],{a}))').number_format = S.FMT_MONEY
        ws.cell(r, 8, f'=IF(OR({a}="",N(E{r})=0),"",F{r}/E{r})').number_format = S.FMT_PCT
        ws.cell(r, 9, f'=IF({a}="","",COUNTIFS(tblBilling[Month],$C$22,tblBilling[Location Code],{a},tblBilling[Balance],">0"))').number_format = "0"
        ws.cell(r, 10, f'=IF({a}="","",COUNTIFS(tblCustomers[Location Code],{a},tblCustomers[Customer Status],"Active"))').number_format = "0"
    ws.auto_filter.ref = "B23:J173"
    widths(ws, {"A": 3, "B": 22, "C": 30, "D": 14, "E": 13, "F": 13, "G": 13, "H": 11, "I": 14, "J": 14})
    page_setup(ws)
    protect(ws)


# --------------------------------------------------------------------- HOME
def build_home(wb):
    ws = wb["HOME"]
    ws.sheet_view.showGridLines = False
    ws["B2"] = "=CFG_CompanyName"
    ws["B2"].font = Font(size=28, bold=True, color=NAVY)
    ws["B3"] = "ISP CUSTOMER & RECOVERY MANAGEMENT SYSTEM"
    ws["B3"].font = Font(size=14, bold=True, color="595959")
    ws["B4"] = '=IF(CFG_WorkbookType<>"REAL DATA","*** DEMO WORKBOOK - SAMPLE DATA ONLY - NOT REAL CUSTOMERS ***","")'
    ws["B4"].font = Font(size=13, bold=True, color="C00000")
    label(ws["B6"], "Current Month:")
    ws["C6"] = '=CFG_CurrentMonth&"   ("&IFERROR(TEXT(DATE(LEFT(CFG_CurrentMonth,4),MID(CFG_CurrentMonth,6,2),1),"mmmm yyyy"),"not set")&")"'
    ws["C6"].font = F_B
    label(ws["B7"], "Customers (Active / Total):")
    ws["C7"] = '=COUNTIF(tblCustomers[Customer Status],"Active")&" / "&(COUNTIF(tblCustomers[Customer ID],"?*"))'
    label(ws["B8"], "Next Customer ID:")
    ws["C8"] = ('=CFG_CustomerIDPrefix&"-"&TEXT(IFERROR(AGGREGATE(14,6,--MID(tblCustomers[Customer ID],LEN(CFG_CustomerIDPrefix)+2,10)'
                '/(LEFT(tblCustomers[Customer ID],LEN(CFG_CustomerIDPrefix)+1)=CFG_CustomerIDPrefix&"-"),1),0)+1,REPT("0",CFG_CustomerIDDigits))')
    ws["C8"].font = Font(size=12, bold=True, color="C00000")
    label(ws["B9"], "Open verification items:")
    ws["C9"] = '=COUNTIF(tblVerify[Status],"Open")'
    label(ws["B10"], "Customers with data problems:")
    ws["C10"] = '=COUNTIF(tblCustomers[Data Check],"?*")'

    section(ws, 12, "GO TO", 2, 3)
    for i, (text, sheet) in enumerate(NAV):
        r = 13 + i
        link(ws.cell(r, 2), sheet, "► " + text)
    section(ws, 12, "MONTHLY WORKFLOW", 5, 7)
    steps = [
        "1. Double-click CityLinks.bat (menu program). Close this workbook in Excel first.",
        "2. Menu 1: Select / generate the month (GENERATE NEW MONTH). A backup is made first.",
        "3. Menu: Assign customers to collectors (by area / street / customer) if needed.",
        "4. PRINT_CENTER: choose Area / Street / Collector / Status  ->  print PRINT_SHEET,",
        "    or use the menu to save a PDF recovery list.",
        "5. Recovery boy collects cash and returns the signed list.",
        "6. Enter payments: menu 'Record payment' or 'Quick recovery entry' (whole list at once).",
        "7. Enter the cash he handed over in CASH_RECONCILIATION (Actual Cash Submitted).",
        "8. DASHBOARD updates automatically.",
        "9. CUSTOMER_HISTORY: type any Customer ID (e.g. CL-0025) to see the complete history.",
        "10. Menu 'Customer statement PDF' -> PDF saved in exports/statements.",
        "11. Menu shows the WhatsApp link - attach the PDF manually and send.",
    ]
    for i, s in enumerate(steps):
        ws.cell(13 + i, 5, s)
    section(ws, 27, "CELL COLOURS", 5, 7)
    leg = [(FILL_INPUT, "Yellow = you can type / choose here"), (FILL_CALC, "Grey = calculated by formula (do not type)"),
           (FILL_SYS, "Light blue = generated by the system (IDs, monthly snapshots)")]
    for i, (fill, text) in enumerate(leg):
        ws.cell(28 + i, 5).fill = fill
        ws.cell(28 + i, 5).border = BOX
        ws.cell(28 + i, 6, text)
    section(ws, 32, "SAFETY RULES", 5, 7)
    rules = ["Never delete customers, bills or payments. Use Customer Status / Voided instead.",
             "Customer ID never changes. VLAN / fee / area changes are recorded in CUSTOMER_EVENTS.",
             "Backups are created automatically in the backups folder before major operations.",
             "Handwritten data is never guessed - unclear values go to VERIFICATION_QUEUE."]
    for i, s in enumerate(rules):
        ws.cell(33 + i, 5, "• " + s)
    widths(ws, {"A": 3, "B": 30, "C": 26, "D": 4, "E": 6, "F": 90})
    page_setup(ws)
    protect(ws)


# --------------------------------------------------------------------- main
def build_workbook(path, settings: dict | None = None, seed: dict | None = None) -> Path:
    """Create a new workbook at *path*. ``seed`` may hold master rows for tblAreas,
    tblLocations, tblPackages, tblCollectors (no customers)."""
    path = Path(path)
    if path.exists():
        raise FileExistsError(f"{path} already exists - it will not be overwritten.")
    settings = dict(settings or {})
    settings.setdefault("CurrentMonth", dt.date.today().strftime("%Y-%m"))
    wb = Workbook()
    wb.active.title = SHEET_ORDER[0]
    for s in SHEET_ORDER[1:]:
        wb.create_sheet(s)
    wb["LISTS"].sheet_state = "hidden"
    for tdef in S.ALL_TABLES:
        build_table_sheet(wb, tdef)
    build_settings(wb, settings)
    build_lists(wb)
    table_conditional_formats(wb)
    build_dashboard(wb)
    build_print_center(wb)
    build_print_sheet(wb, urdu=False)
    build_print_sheet(wb, urdu=True)
    build_payment_entry(wb)
    build_customer_history(wb)
    build_statement(wb)
    build_reports(wb)
    build_home(wb)
    batches_conditional_formats(wb)
    home_batch_status(wb)
    # tab colours
    for s, color in {"HOME": NAVY, "DASHBOARD": NAVY, "PRINT_CENTER": "C65911", "PRINT_SHEET": "C65911",
                     "PRINT_SHEET_UR": "C65911", "CUSTOMERS": "548235", "MONTHLY_BILLING": "548235", "PAYMENTS": "548235",
                     "SETTINGS": "7F7F7F", "VERIFICATION_QUEUE": "BF8F00", "IMPORT_STAGING": "BF8F00"}.items():
        wb[s].sheet_properties.tabColor = color
    wb.active = 0

    store = Store(path, wb=wb)
    # every table gets its formulas on the initial blank row
    for tdef in S.ALL_TABLES:
        store.t(tdef).ensure_formulas()
    for tname, rows in (seed or {}).items():
        tdef = S.TABLES[tname]
        for row in rows:
            store.t(tdef).append(row)
    store.save()
    return path
