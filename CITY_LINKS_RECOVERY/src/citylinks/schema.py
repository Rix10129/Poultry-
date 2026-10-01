"""Data model for the CITY LINKS Recovery workbook.

Every data sheet is an Excel Table.  Each column has a *kind*:

* ``input``  - typed by the office operator (yellow header)
* ``system`` - written once by the system, e.g. IDs and monthly snapshots (blue header)
* ``calc``   - an Excel formula, never typed (grey header)

Formula templates use ``[@Column Name]`` for "this row" references.  They are
expanded to the Excel file syntax ``tblX[[#This Row],[Column Name]]`` when written.

The same definitions drive the workbook builder, the Python data layer and a
future SQL migration (one table == one SQL table, ``input``/``system`` columns
are stored, ``calc`` columns become views/queries).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

INPUT, SYSTEM, CALC = "input", "system", "calc"

FMT_MONEY = "#,##0"
FMT_DATE = "dd-mmm-yyyy"
FMT_DATETIME = "dd-mmm-yyyy hh:mm"
FMT_PCT = "0.0%"
FMT_TEXT = "@"

CUSTOMER_STATUSES = ["Active", "Suspended", "Disconnected", "On Hold"]
PAYMENT_STATUSES = ["PAID", "PARTIAL", "PENDING"]
PAYMENT_METHODS = ["Cash", "Bank", "JazzCash", "EasyPaisa", "Other"]
YES_NO = ["Yes", "No"]
EVENT_TYPES = [
    "New Connection", "Package Change", "VLAN Change", "Address Change",
    "Location Change", "Fee Change", "Due Date Change", "Mobile Change",
    "Name Change", "Status Change", "Suspension", "Reactivation",
    "Disconnection", "Collector Change", "Other",
]
ASSIGNMENT_STATUSES = ["Assigned", "Completed", "Reassigned", "Cancelled"]
LANGUAGES = ["English", "Urdu"]
PRINT_MODES = [
    "Area-wise Recovery", "Street-wise Recovery", "Collector-wise Recovery",
    "Due-Date-wise Recovery", "Pending Recovery", "Partial Payment Recovery",
    "Custom Filtered Recovery",
]
# UNPAID = PENDING + PARTIAL (everything with a balance)
PRINT_STATUSES = ["All", "UNPAID", "PENDING", "PARTIAL", "PAID", "OVERDUE"]
STAGING_STATUSES = ["Needs Verification", "Ready", "Possible Duplicate", "Imported", "Rejected"]


@dataclass
class Col:
    name: str
    kind: str = INPUT
    formula: str | None = None
    width: float = 14
    fmt: str | None = None
    text: bool = False          # stored as text (keeps leading zeros, e.g. VLAN "0405", mobile)
    required: bool = False
    dv: str | None = None       # data-validation key (see builder.VALIDATIONS)
    note: str = ""


@dataclass
class TableDef:
    sheet: str
    name: str
    columns: list[Col]
    title: str
    description: str
    dv_rows: int = 5000
    key: str | None = None      # primary-key column

    def col(self, name: str) -> Col:
        for c in self.columns:
            if c.name == name:
                return c
        raise KeyError(f"{self.name} has no column {name!r}")

    @property
    def names(self) -> list[str]:
        return [c.name for c in self.columns]

    def stored(self) -> list[Col]:
        return [c for c in self.columns if c.kind != CALC]

    def expand(self, template: str) -> str:
        return expand_formula(template, self.name)


_THIS_ROW = re.compile(r"\[@([^\]]+)\]")


def expand_formula(template: str, table: str) -> str:
    body = _THIS_ROW.sub(lambda m: f"{table}[[#This Row],[{m.group(1)}]]", template)
    return body if body.startswith("=") else "=" + body


# ---------------------------------------------------------------------------
# Table definitions
# ---------------------------------------------------------------------------
AREAS = TableDef("AREAS", "tblAreas", [
    Col("Area Code", required=True, width=11, text=True, note="Letter(s) e.g. A"),
    Col("Area Name", required=True, width=24),
    Col("Area Name Urdu", width=22, note="Optional, used on Urdu print"),
    Col("Active", width=9, dv="yesno"),
    Col("Notes", width=36),
], "AREAS", "Area master. A = Arif Town, B = Arai Colony ... Add new areas at the bottom.", key="Area Code")

LOCATIONS = TableDef("LOCATION_CODES", "tblLocations", [
    Col("Location Code", required=True, width=13, text=True, note="Area Code + Street number, e.g. A1"),
    Col("Area Code", required=True, width=11, text=True, dv="areacode"),
    Col("Area Name", CALC, 'IFERROR(INDEX(tblAreas[Area Name],MATCH([@Area Code],tblAreas[Area Code],0)),"AREA CODE NOT FOUND")', width=22),
    Col("Street Number", width=13, fmt="0"),
    Col("Street Name", width=16, note="e.g. Gali 1"),
    Col("Full Address", CALC, 'IF([@Street Name]="",[@Area Name],[@Area Name]&", "&[@Street Name])', width=30),
    Col("Active", width=9, dv="yesno"),
    Col("Notes", width=26),
    Col("Data Check", CALC,
        'TRIM(IF(COUNTIF(tblLocations[Location Code],[@Location Code])>1,"DUPLICATE CODE. ","")'
        '&IF([@Location Code]<>[@Area Code]&[@Street Number],"CODE SHOULD BE "&[@Area Code]&[@Street Number]&". ",""))',
        width=30),
], "LOCATION CODES", "A1 = Arif Town, Gali 1. Area Name and Full Address are calculated from AREAS.", key="Location Code")

PACKAGES = TableDef("PACKAGES", "tblPackages", [
    Col("Package ID", required=True, width=12, text=True),
    Col("Package Name", required=True, width=18),
    Col("Speed", width=12),
    Col("Default Monthly Fee", required=True, width=18, fmt=FMT_MONEY, dv="money"),
    Col("Active", width=9, dv="yesno"),
    Col("Notes", width=40),
], "PACKAGES", "Internet packages. Edit names, speeds and fees to match your real packages.", key="Package ID")

COLLECTORS = TableDef("COLLECTORS", "tblCollectors", [
    Col("Collector ID", required=True, width=12, text=True),
    Col("Collector Name", required=True, width=22),
    Col("Mobile", width=16, text=True),
    Col("Active", width=9, dv="yesno"),
    Col("Notes", width=40),
], "COLLECTORS (RECOVERY BOYS)", "Recovery boys. Collector ID never changes.", key="Collector ID")

CUSTOMERS = TableDef("CUSTOMERS", "tblCustomers", [
    Col("Customer ID", required=True, width=11, text=True, dv="custid", note="Permanent ID e.g. CL-0001. Never change it."),
    Col("Customer Name", required=True, width=24, note="Urdu or English, exactly as written"),
    Col("Location Code", required=True, width=10, text=True, dv="loccode"),
    Col("Area", CALC, 'IFERROR(INDEX(tblLocations[Area Name],MATCH([@Location Code],tblLocations[Location Code],0)),"")', width=16),
    Col("Street", CALC, 'IFERROR(INDEX(tblLocations[Street Name],MATCH([@Location Code],tblLocations[Location Code],0))&"","")', width=10),
    Col("Address Detail", width=16, note="Optional house/shop no."),
    Col("Full Address", CALC,
        'IFERROR(INDEX(tblLocations[Full Address],MATCH([@Location Code],tblLocations[Location Code],0)),"")'
        '&IF([@Address Detail]="","",", "&[@Address Detail])', width=28),
    Col("VLAN ID", required=True, width=9, text=True),
    Col("Package", width=14, dv="package"),
    Col("Package Fee", CALC, 'IFERROR(INDEX(tblPackages[Default Monthly Fee],MATCH([@Package],tblPackages[Package Name],0)),"")', width=11, fmt=FMT_MONEY),
    Col("Fee Override", width=11, fmt=FMT_MONEY, dv="money", note="Special price. Leave blank to use package fee."),
    Col("Monthly Fee", CALC, 'IF([@Fee Override]<>"",[@Fee Override],[@Package Fee])', width=11, fmt=FMT_MONEY),
    Col("Due Date", required=True, width=8, fmt="0", dv="dueday", note="Day of month 1-31"),
    Col("Mobile Number", width=14, text=True),
    Col("Default Collector ID", width=12, text=True, dv="collector"),
    Col("Connection Date", width=13, fmt=FMT_DATE, dv="date"),
    Col("Customer Status", required=True, width=12, dv="custstatus"),
    Col("Notes", width=24),
    Col("Created Date", SYSTEM, width=13, fmt=FMT_DATE),
    Col("Last Updated", SYSTEM, width=13, fmt=FMT_DATE),
    Col("Data Check", CALC,
        'TRIM(IF(COUNTIF(tblCustomers[Customer ID],[@Customer ID])>1,"DUPLICATE CUSTOMER ID. ","")'
        '&IF([@Customer Name]="","NAME MISSING. ","")'
        '&IF([@Location Code]="","LOCATION CODE MISSING. ",IF(ISNA(MATCH([@Location Code],tblLocations[Location Code],0)),"LOCATION CODE "&[@Location Code]&" DOES NOT EXIST. ",""))'
        '&IF([@VLAN ID]="","VLAN ID MISSING. ","")'
        '&IF([@Monthly Fee]="","MONTHLY FEE MISSING. ","")'
        '&IF([@Due Date]="","DUE DATE MISSING. ","")'
        '&IF([@Customer Status]="","STATUS MISSING. ","")'
        '&IF(AND([@Mobile Number]<>"",COUNTIF(tblCustomers[Mobile Number],[@Mobile Number])>1),"POSSIBLE DUPLICATE: SAME MOBILE. ","")'
        '&IF(AND([@Customer Name]<>"",COUNTIFS(tblCustomers[Customer Name],[@Customer Name],tblCustomers[Location Code],[@Location Code])>1),"POSSIBLE DUPLICATE: SAME NAME + LOCATION. ","")'
        '&IF(AND([@VLAN ID]<>"",[@Customer Status]="Active",COUNTIFS(tblCustomers[VLAN ID],[@VLAN ID],tblCustomers[Customer Status],"Active")>1),"VLAN USED BY ANOTHER ACTIVE CUSTOMER. ",""))',
        width=40),
    Col("Search Match", CALC,
        'IF(CH_SearchText="",0,IF(ISNUMBER(SEARCH(CH_SearchText,CHOOSE(MATCH(CH_SearchType,L_SearchTypes,0),'
        '[@Customer ID],[@Customer Name],SUBSTITUTE(SUBSTITUTE([@Mobile Number],"-","")," ",""),[@VLAN ID]&"",[@Location Code],[@Area],'
        '[@Customer ID]&"|"&[@Customer Name]&"|"&SUBSTITUTE([@Mobile Number],"-","")&"|"&[@VLAN ID]&"|"&[@Location Code]&"|"&[@Area]))),1,0))',
        width=8, note="system helper for CUSTOMER_HISTORY search"),
], "CUSTOMER MASTER", "One row per customer. Grey columns are calculated. Area / Street / Address come from Location Code.", key="Customer ID")

MONTHS = TableDef("MONTHS", "tblMonths", [
    Col("Month", SYSTEM, width=10, text=True),
    Col("Month Name", SYSTEM, width=16),
    Col("Generated At", SYSTEM, width=17, fmt=FMT_DATETIME),
    Col("Billing Records", SYSTEM, width=10, fmt="0"),
    Col("Notes", width=30),
    Col("Customers Billed", CALC, 'COUNTIF(tblBilling[Month],[@Month])', width=10, fmt="0"),
    Col("Total Billing", CALC, 'SUMIFS(tblBilling[Monthly Fee],tblBilling[Month],[@Month])', width=13, fmt=FMT_MONEY),
    Col("Recovered", CALC, 'SUMIFS(tblBilling[Amount Paid],tblBilling[Month],[@Month])', width=13, fmt=FMT_MONEY),
    Col("Outstanding", CALC, 'SUMIFS(tblBilling[Balance],tblBilling[Month],[@Month])', width=13, fmt=FMT_MONEY),
    Col("Paid Count", CALC, 'COUNTIFS(tblBilling[Month],[@Month],tblBilling[Payment Status],"PAID")', width=8, fmt="0"),
    Col("Partial Count", CALC, 'COUNTIFS(tblBilling[Month],[@Month],tblBilling[Payment Status],"PARTIAL")', width=8, fmt="0"),
    Col("Pending Count", CALC, 'COUNTIFS(tblBilling[Month],[@Month],tblBilling[Payment Status],"PENDING")', width=8, fmt="0"),
    Col("Recovery Pct", CALC, 'IF([@Total Billing]=0,0,[@Recovered]/[@Total Billing])', width=10, fmt=FMT_PCT),
], "MONTHLY ARCHIVE", "One row per generated month (created by GENERATE NEW MONTH). Prevents duplicate months.", key="Month")

BILLING = TableDef("MONTHLY_BILLING", "tblBilling", [
    Col("Billing ID", SYSTEM, width=17, text=True),
    Col("Month", SYSTEM, width=9, text=True),
    Col("Month Name", SYSTEM, width=14),
    Col("Customer ID", SYSTEM, width=10, text=True),
    Col("Customer Name", SYSTEM, width=22),
    Col("Location Code", SYSTEM, width=9, text=True),
    Col("Area", SYSTEM, width=14),
    Col("Street", SYSTEM, width=9),
    Col("Full Address", SYSTEM, width=24),
    Col("VLAN ID", SYSTEM, width=8, text=True),
    Col("Package", SYSTEM, width=11),
    Col("Due Date", SYSTEM, width=7, fmt="0"),
    Col("Monthly Fee", SYSTEM, width=10, fmt=FMT_MONEY),
    Col("Collector ID", CALC, 'IFERROR(INDEX(tblAssignments[Collector ID],MATCH([@Month]&"|"&[@Customer ID],tblAssignments[Key],0))&"","")', width=9),
    Col("Collector Name", CALC, 'IF([@Collector ID]="","Unassigned",IFERROR(INDEX(tblCollectors[Collector Name],MATCH([@Collector ID],tblCollectors[Collector ID],0)),[@Collector ID]))', width=13),
    Col("Amount Paid", CALC, 'SUMIFS(tblPayments[Amount],tblPayments[Billing ID],[@Billing ID],tblPayments[Voided],"<>Yes")', width=10, fmt=FMT_MONEY),
    Col("Balance", CALC, 'IF(CFG_AllowNegativeBalance="Yes",[@Monthly Fee]-[@Amount Paid],MAX(0,[@Monthly Fee]-[@Amount Paid]))', width=10, fmt=FMT_MONEY),
    Col("Excess Paid", CALC, 'MAX(0,[@Amount Paid]-[@Monthly Fee])', width=9, fmt=FMT_MONEY),
    Col("Payment Status", CALC, 'IF([@Amount Paid]>=[@Monthly Fee],"PAID",IF([@Amount Paid]>0,"PARTIAL","PENDING"))', width=10),
    Col("Overdue", CALC,
        'IF(OR([@Balance]<=0,[@Due Date]=""),"",IF(TODAY()>DATE(LEFT([@Month],4),MID([@Month],6,2),'
        'MIN([@Due Date],DAY(EOMONTH(DATE(LEFT([@Month],4),MID([@Month],6,2),1),0))))+CFG_OverdueGraceDays,"OVERDUE",""))',
        width=10),
    Col("Payments Count", CALC, 'COUNTIFS(tblPayments[Billing ID],[@Billing ID],tblPayments[Voided],"<>Yes")', width=8, fmt="0"),
    Col("Last Payment Date", CALC, 'IF([@Payments Count]=0,"",IFERROR(_xlfn.MAXIFS(tblPayments[Payment Date],tblPayments[Billing ID],[@Billing ID],tblPayments[Voided],"<>Yes"),""))', width=13, fmt=FMT_DATE),
    Col("Remarks", width=22),
    Col("Created At", SYSTEM, width=16, fmt=FMT_DATETIME),
    Col("Print Match", CALC,
        'IF(AND([@Month]=PC_Month,OR(PC_Area="All",[@Area]=PC_Area),OR(PC_Location="All",[@Location Code]=PC_Location),'
        'OR(PC_Collector="All",[@Collector Name]=PC_Collector),OR(PC_DueDate="All",[@Due Date]=PC_DueDate),'
        'OR(PC_StatusEff="All",AND(PC_StatusEff="UNPAID",[@Balance]>0),[@Payment Status]=PC_StatusEff,AND(PC_StatusEff="OVERDUE",[@Overdue]="OVERDUE")),'
        'OR(PC_Mode<>"Custom Filtered Recovery",PC_CustomCount=0,COUNTIF(PC_CustomIDs,[@Customer ID])>0)),1,0)',
        width=7, note="system helper for PRINT_CENTER"),
    Col("Stmt Match", CALC,
        'IF(AND([@Customer ID]=ST_CustomerID,OR(ST_From="All",[@Month]>=ST_From),OR(ST_To="All",[@Month]<=ST_To)),1,0)',
        width=7, note="system helper for STATEMENT"),
], "MONTHLY BILLING (ALL MONTHS - HISTORY)",
    "One row per customer per month, created by GENERATE NEW MONTH. Never overwritten. Paid / Balance / Status are calculated from PAYMENTS.",
    dv_rows=60000, key="Billing ID")

PAYMENTS = TableDef("PAYMENTS", "tblPayments", [
    Col("Payment ID", SYSTEM, width=12, text=True, dv="payid"),
    Col("Customer ID", required=True, width=11, text=True),
    Col("Customer Name", CALC, 'IFERROR(INDEX(tblCustomers[Customer Name],MATCH([@Customer ID],tblCustomers[Customer ID],0)),"CUSTOMER NOT FOUND")', width=22),
    Col("Month", required=True, width=9, text=True, dv="month"),
    Col("Billing ID", CALC, 'IF(OR([@Month]="",[@Customer ID]=""),"",[@Month]&"-"&[@Customer ID])', width=17),
    Col("Payment Date", required=True, width=13, fmt=FMT_DATE, dv="date"),
    Col("Amount", required=True, width=10, fmt=FMT_MONEY, dv="amount"),
    Col("Payment Method", width=11, dv="method"),
    Col("Collector ID", width=10, text=True, dv="collector"),
    Col("Reference", width=14),
    Col("Remarks", width=22),
    Col("Voided", width=8, dv="yesno", note="Never delete a payment. Mark Voided = Yes instead."),
    Col("Void Reason", width=18),
    Col("Created At", SYSTEM, width=16, fmt=FMT_DATETIME),
    Col("Data Check", CALC,
        'TRIM(IF(AND([@Billing ID]<>"",ISNA(MATCH([@Billing ID],tblBilling[Billing ID],0))),"NO BILL FOR THIS CUSTOMER/MONTH. ","")'
        '&IF(N([@Amount])<=0,"AMOUNT MUST BE MORE THAN 0. ","")'
        '&IF(COUNTIF(tblPayments[Payment ID],[@Payment ID])>1,"DUPLICATE PAYMENT ID. ","")'
        '&IF([@Payment Date]="","PAYMENT DATE MISSING. ",""))', width=30),
], "PAYMENT TRANSACTIONS", "Every payment is a separate row (multiple partial payments allowed). Never delete - set Voided = Yes.",
    dv_rows=60000, key="Payment ID")

ASSIGNMENTS = TableDef("RECOVERY_ASSIGNMENTS", "tblAssignments", [
    Col("Assignment ID", SYSTEM, width=13, text=True),
    Col("Month", required=True, width=9, text=True, dv="month"),
    Col("Customer ID", required=True, width=11, text=True),
    Col("Customer Name", CALC, 'IFERROR(INDEX(tblCustomers[Customer Name],MATCH([@Customer ID],tblCustomers[Customer ID],0)),"CUSTOMER NOT FOUND")', width=22),
    Col("Location Code", CALC, 'IFERROR(INDEX(tblCustomers[Location Code],MATCH([@Customer ID],tblCustomers[Customer ID],0)),"")', width=9),
    Col("Collector ID", required=True, width=10, text=True, dv="collector"),
    Col("Collector Name", CALC, 'IFERROR(INDEX(tblCollectors[Collector Name],MATCH([@Collector ID],tblCollectors[Collector ID],0)),"COLLECTOR NOT FOUND")', width=16),
    Col("Assigned Date", width=12, fmt=FMT_DATE, dv="date"),
    Col("Assignment Status", width=12, dv="assignstatus"),
    Col("Remarks", width=26),
    Col("Key", CALC, 'IF(OR([@Assignment Status]="Reassigned",[@Assignment Status]="Cancelled"),"",[@Month]&"|"&[@Customer ID])', width=18, note="system helper"),
], "RECOVERY ASSIGNMENTS", "Which recovery boy collects which customer in which month. Old assignments are marked Reassigned, never deleted.",
    dv_rows=60000, key="Assignment ID")

CASH = TableDef("CASH_RECONCILIATION", "tblCash", [
    Col("Month", required=True, width=9, text=True, dv="month"),
    Col("Collector ID", required=True, width=10, text=True, dv="collector"),
    Col("Collector Name", CALC, 'IFERROR(INDEX(tblCollectors[Collector Name],MATCH([@Collector ID],tblCollectors[Collector ID],0)),"")', width=16),
    Col("Expected Collection", CALC, 'SUMIFS(tblPayments[Amount],tblPayments[Collector ID],[@Collector ID],tblPayments[Month],[@Month],tblPayments[Payment Method],"Cash",tblPayments[Voided],"<>Yes")', width=13, fmt=FMT_MONEY),
    Col("Non Cash Collected", CALC, 'SUMIFS(tblPayments[Amount],tblPayments[Collector ID],[@Collector ID],tblPayments[Month],[@Month],tblPayments[Voided],"<>Yes")-[@Expected Collection]', width=12, fmt=FMT_MONEY),
    Col("Actual Cash Submitted", width=13, fmt=FMT_MONEY, dv="money"),
    Col("Cash Difference", CALC, 'IF([@Actual Cash Submitted]="","",[@Actual Cash Submitted]-[@Expected Collection])', width=12, fmt='#,##0;[Red]-#,##0;0'),
    Col("Reconciliation Status", CALC, 'IF([@Actual Cash Submitted]="","NOT SUBMITTED",IF([@Cash Difference]=0,"MATCHED","CASH DIFFERENCE"))', width=15),
    Col("Submission Date", width=13, fmt=FMT_DATE, dv="date"),
    Col("Received By", width=14),
    Col("Remarks", width=34, note="Explanation of any difference"),
], "CASH RECONCILIATION",
    "Expected = cash payments recorded under the collector for that month. Enter the cash actually handed over in Actual Cash Submitted.")

EVENTS = TableDef("CUSTOMER_EVENTS", "tblEvents", [
    Col("Event ID", SYSTEM, width=11, text=True),
    Col("Customer ID", required=True, width=11, text=True),
    Col("Customer Name", CALC, 'IFERROR(INDEX(tblCustomers[Customer Name],MATCH([@Customer ID],tblCustomers[Customer ID],0)),"")', width=22),
    Col("Event Date", required=True, width=13, fmt=FMT_DATE, dv="date"),
    Col("Event Type", required=True, width=16, dv="eventtype"),
    Col("Old Value", width=18),
    Col("New Value", width=18),
    Col("Notes", width=40),
    Col("Recorded At", SYSTEM, width=16, fmt=FMT_DATETIME),
], "CUSTOMER EVENTS (CONNECTION HISTORY)", "New connections, VLAN / package / address / status changes. Never delete rows.",
    key="Event ID")

STAGING = TableDef("IMPORT_STAGING", "tblStaging", [
    Col("Batch ID", SYSTEM, width=16, text=True),
    Col("Row No", SYSTEM, width=7, fmt="0"),
    Col("Page", SYSTEM, width=6),
    Col("Customer Name", width=22),
    Col("Location Code", width=9, text=True),
    Col("VLAN ID", width=8, text=True),
    Col("Due Date", width=7),
    Col("Monthly Fee", width=9),
    Col("Mobile Number", width=13, text=True),
    Col("Other Fields", width=20),
    Col("Source File", SYSTEM, width=24),
    Col("Row Status", SYSTEM, width=17),
    Col("Customer ID Assigned", SYSTEM, width=12, text=True),
    Col("Notes", width=30),
], "IMPORT STAGING (HANDWRITTEN / OCR)", "Rows read from handwritten sheets. Nothing here is a customer until it is verified and committed.")

VERIFY = TableDef("VERIFICATION_QUEUE", "tblVerify", [
    Col("Item ID", SYSTEM, width=10, text=True),
    Col("Batch ID", SYSTEM, width=16, text=True),
    Col("Row No", SYSTEM, width=7, fmt="0"),
    Col("Field", SYSTEM, width=14),
    Col("Detected Value", SYSTEM, width=18),
    Col("Confidence", SYSTEM, width=10),
    Col("Reason", SYSTEM, width=30),
    Col("Question", SYSTEM, width=38),
    Col("Answer", width=20, note="Type the correct value here (or answer in the menu)"),
    Col("Status", SYSTEM, width=10),
    Col("Resolved At", SYSTEM, width=16, fmt=FMT_DATETIME),
], "VERIFICATION QUEUE", "Unclear handwriting goes here. The system NEVER guesses. Type the correct value in Answer, then run 'Apply verification answers'.")

ALL_TABLES: list[TableDef] = [AREAS, LOCATIONS, PACKAGES, COLLECTORS, CUSTOMERS, MONTHS, BILLING,
                              PAYMENTS, ASSIGNMENTS, CASH, EVENTS, STAGING, VERIFY]
TABLES = {t.name: t for t in ALL_TABLES}

# ---------------------------------------------------------------------------
# Settings (sheet SETTINGS, each value is a named cell CFG_<Key>)
# ---------------------------------------------------------------------------
@dataclass
class Setting:
    key: str
    label: str
    default: object
    note: str = ""
    dv: str | None = None


SETTINGS: list[Setting] = [
    Setting("CompanyName", "Company Name", "CITY LINKS"),
    Setting("CompanyShortName", "Company Short Name", "CL"),
    Setting("Tagline", "Tagline", "INTERNET SERVICE PROVIDER"),
    Setting("CompanyPhone", "Company Phone (for statements)", "", "Optional"),
    Setting("CompanyAddress", "Company Address (for statements)", "", "Optional"),
    Setting("CustomerIDPrefix", "Customer ID Prefix", "CL", "New IDs: PREFIX-0001. Existing IDs never change."),
    Setting("CustomerIDDigits", "Customer ID Digits", 4),
    Setting("Currency", "Default Currency", "PKR"),
    Setting("CurrencySymbol", "Currency Symbol", "Rs."),
    Setting("DefaultLanguage", "Default Language", "English", dv="language"),
    Setting("PrintLanguage", "Print Language", "English", "English or Urdu (RTL) print layout", dv="language"),
    Setting("CurrentMonth", "Current Month", "", "Format YYYY-MM e.g. 2026-10", dv="month"),
    Setting("DateFormat", "Date Format", "DD-MM-YYYY", "Used by the menu program for typing dates"),
    Setting("DefaultPaymentMethod", "Default Payment Method", "Cash", dv="method"),
    Setting("AllowNegativeBalance", "Allow Negative Balance", "No", "No = overpayment shows in Excess Paid, Balance stays 0", dv="yesno"),
    Setting("OverdueGraceDays", "Overdue Grace Days", 0, "Bill is OVERDUE when balance > 0 and today > due date + grace days"),
    Setting("OCRConfidenceThreshold", "OCR Confidence Threshold (%)", 90, "Values below this always go to the Verification Queue"),
    Setting("WhatsAppCountryCode", "WhatsApp Country Code", "92"),
    Setting("WhatsAppMessage", "WhatsApp Message",
            "Assalam-o-Alaikum.\nYe aapki CITY LINKS payment history/statement hai.\nBarah-e-karam attached statement check kar lein."),
    Setting("PaperSize", "Default Paper Size", "A4"),
    Setting("PrintOrientation", "Recovery List Orientation", "Landscape", dv="orientation"),
    Setting("WorkbookType", "Workbook Type", "REAL DATA", "DEMO workbooks contain sample data only"),
]
SETTING_KEYS = {s.key: s for s in SETTINGS}

# Print-sheet columns (shared by Excel print sheet and the Python PDF)
PRINT_COLUMNS = ["#", "Customer ID", "Customer Name", "Address", "VLAN ID", "Due Date", "Monthly Fee",
                 "Amount Paid", "Balance", "Status", "Collection Date", "Collector"]
PRINT_COLUMNS_UR = ["#", "کسٹمر آئی ڈی", "نام", "پتہ", "VLAN", "تاریخ", "ماہانہ فیس",
                    "وصول شدہ", "بقایا", "اسٹیٹس", "تاریخ وصولی", "ریکوری"]
STATUS_UR = {"PAID": "ادا شدہ", "PARTIAL": "جزوی", "PENDING": "بقایا"}
