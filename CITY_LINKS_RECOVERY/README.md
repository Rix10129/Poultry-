# CITY LINKS – ISP Customer & Recovery Management System

An Excel workbook plus a simple menu program. Together they replace the handwritten
Urdu recovery sheets.

| File | What it is |
|---|---|
| `data/CITY_LINKS_Recovery.xlsx` | **Your real workbook.** It has no customers yet. Areas A (Arif Town) and B (Arai Colony) with Gali 1–3 are set up. |
| `data/DEMO_CITY_LINKS_Recovery.xlsx` | A **DEMO** workbook with sample customers, for practice only. Every name starts with `[DEMO]`. |
| `CityLinks.bat` | Double-click to open the **menu program** (new month, payments, PDFs, imports…). |
| `SETUP_WINDOWS.bat` | Run once to install what the menu program needs. |
| `templates/` | Import templates (old customer list, handwritten transcription). |
| `exports/` | Saved PDFs and reports: `statements/`, `recovery_lists/`, `reports/`. |
| `backups/` | Automatic backups, grouped by month (`backups/2026-10/…`). |

> **Before first use:** open `CITY_LINKS_Recovery.xlsx` and correct three sheets.
> **PACKAGES** contains *examples* (Basic/Standard/Premium), **COLLECTORS** contains *placeholders* (Ali, Bilal, Asad), and **LOCATION_CODES** only has Gali 1–3. Change them to your real packages, recovery boys and streets.

---

## 0. One-time setup (Windows)

1. Install Python 3.10 or newer from python.org. During setup, tick **"Add Python to PATH"**.
2. Double-click **`SETUP_WINDOWS.bat`**. It installs `openpyxl`, `fpdf2` and `uharfbuzz`; the last one makes Urdu display correctly in PDFs.
3. Done. The workbook also works in Excel on its own, but the actions listed below need the menu program.

**Important:** close the workbook in Excel before using a menu option that *saves* something. If it is still open, the program stops with the message *"…is open in Excel. Please SAVE and CLOSE it"*, and nothing is changed.

## 1. How to open the system

* **To view, search or print:** open `data/CITY_LINKS_Recovery.xlsx` in Excel. The **HOME** sheet has links to every part.
* **To make changes** (new month, payments, PDFs, imports): double-click **`CityLinks.bat`** and type a menu number.

Cell colours in the workbook:

* **Yellow / dark-blue header:** you type here.
* **Grey:** calculated by a formula. Never type here.
* **Light blue:** created by the system (IDs, monthly snapshots).

## 2. How to add a customer

**Menu → 9 "Add customer"**. You type the name (Urdu or English, exactly as written), Location Code (e.g. `A1`), VLAN ID, package or special fee, due date and mobile.

* The **Customer ID** (CL-0001, CL-0002 …) is given automatically and **never changes**.
* Area, Street and Full Address come from the Location Code. `A1` becomes *Arif Town, Gali 1*.
* If the same mobile number, the same name and location, or an active VLAN already exists, the program shows **POSSIBLE DUPLICATE**. It saves the customer only if you confirm. Customers are never merged.

You can also type directly in the **CUSTOMERS** sheet. The next free ID is shown on HOME, and the **Data Check** column turns red for problems such as a duplicate ID, a location code that doesn't exist, a missing VLAN or a missing fee.

To change VLAN, package, fee, address or status, use **Menu → 10 "Edit customer"**. Each change is written to **CUSTOMER_EVENTS** (for example *VLAN Change 405 → 407*). If you edit directly in Excel, run **Menu → 17 "Check data"**; it records those edits in CUSTOMER_EVENTS too.

New areas and streets: **Menu → 18** (e.g. `C = New Area`, then `C1`, `C2` …), or add rows to **AREAS** / **LOCATION_CODES**.

## 3. How to create a new month

**Menu → 2 "GENERATE NEW MONTH"** and type the month, e.g. `2026-11` or `November 2026`.

* A backup is made first.
* Every **Active** customer gets a bill for that month. The bill copies the customer's current name, address, VLAN and fee, with Paid = 0 and Status PENDING.
* Earlier months are **never changed**. If the month already exists you get *"November 2026 billing already exists"* and nothing is created.
* Customers with missing data, such as no fee, no VLAN or a wrong location code, are listed. You can fix them first, or continue without them and add them later with **Menu → 19**.
* Each customer is assigned to their *Default Collector*, or else to last month's collector. The new month becomes the **Current Month** (shown in SETTINGS).

## 4. How to record a payment

**Menu → 3 "Record payment"**. Search by ID, name or mobile. The program shows the bill, the amount already paid and the remaining balance. Then enter the amount, date, method (Cash / Bank / JazzCash / EasyPaisa / Other), collector and reference.

* Partial payments are allowed, as many as needed. 500 + 500 + 500 on a 1,500 bill gives **PAID**.
* Status is calculated automatically: **PAID** when Paid ≥ Bill, **PARTIAL** when Paid > 0, **PENDING** when Paid = 0.
* The balance never goes below 0. Overpayment needs confirmation and is shown as *Excess Paid*.
* If a payment was entered wrongly, use **Menu → 20 "Void a wrong payment"**. Payments are never deleted.

When a recovery boy returns his list, use **Menu → 4 "Quick recovery entry"**. Choose the collector and the program walks through his unpaid customers one by one: type the amount, `f` for full, or press Enter for nothing.

Then record the cash he handed over with **Menu → 12 "Cash submitted"**. The system shows *Expected* (the cash payments recorded for him), *Actual* and *Cash Difference*. It never labels anyone; write any explanation in *Remarks*.

## 5. How to print by area (or street)

**In Excel:** open **PRINT_CENTER** and choose Month, Area, Location Code, Collector, Status and Due Date. "All" is allowed. Check the "Customers in this list" count, then open **PRINT_SHEET** and press Ctrl+P. It prints A4 landscape with the header row repeated on every page, page numbers, totals, and Collector Signature / Office Verification lines. For Urdu use **PRINT_SHEET_UR**, which runs right-to-left.

* Status **UNPAID** means *pending + partial*, i.e. everyone who still owes money.
* Print modes: Area-wise, Street-wise, Collector-wise, Due-Date-wise, Pending, Partial, and Custom. For Custom, type Customer IDs in column F.

**Or with the menu:** **Menu → 7 "Print recovery list (PDF)"**. Choose the mode and filters, preview the list on screen, and the PDF is saved in `exports/recovery_lists/`. It works in English or Urdu.

## 6. How to print by collector

In PRINT_CENTER set **Collector** (e.g. *Ali*), or use **Menu → 7 → Collector-wise Recovery**. To change who collects which customers, use **Menu → 11 "Assign customers to collector"**. You can assign by area, by street (A1, A2 …), by individual Customer IDs, or by a custom filter. Old assignments are kept and marked *Reassigned*.

## 7. How to find customer history

**In Excel:** on the **CUSTOMER_HISTORY** sheet, type a Customer ID (e.g. `CL-0025`) in *Search Text*. You can also search by Name, Mobile, VLAN, Location Code or Area. If several customers match, they are listed and you pick the exact ID; the system never picks one for you. You see the profile, every month's bill / paid / payment date / balance / status, the totals, the last payment, the connection history and an **OPEN WHATSAPP** link.

**With the menu:** **Menu → 5**.

## 8. How to generate a customer statement

**Menu → 6 "Customer statement PDF + WhatsApp"**. Choose *Complete history* or *Selected period* (e.g. 2026-08 to 2027-01). The PDF is saved as
`exports/statements/CL-0025_Shahid_Mahmood_Statement.pdf`. Urdu names are kept, and characters Windows doesn't allow are removed.
In Excel, the **STATEMENT** sheet shows the same one-page statement for printing.

## 9. How to export the PDF and send it on WhatsApp

After the statement is made, the menu shows the customer's mobile, name and file, plus a **WhatsApp link** with the message ready:

> Assalam-o-Alaikum. Ye aapki CITY LINKS payment history/statement hai. Barah-e-karam attached statement check kar lein.

Choose *"Open WhatsApp + PDF folder"*. **WhatsApp does not attach the PDF automatically.** Attach the file with the paper-clip icon and press Send. You can change the message in SETTINGS.

## 10. How to back up

* **Automatic:** before every new month, import, bulk payment entry, bulk assignment and void, plus once a day before the first change. Backups go to `backups/YYYY-MM/CITY_LINKS_Recovery_YYYYMMDD_HHMMSS_<reason>.xlsx`. A backup is never overwritten.
* **Manual:** **Menu → 21 "Backup now"**.
* **To restore:** close Excel, copy a backup file to `data/` and rename it `CITY_LINKS_Recovery.xlsx`. Keep the current file somewhere first.
* Also copy the whole folder to a USB drive or Google Drive every week.

## 11. How to import handwritten data

The system **never guesses unclear handwriting**.

1. **Menu → 15 → "Create a blank transcription template"**. Copy each handwritten row: Name, Location Code, VLAN, Due Date, Fee, Mobile. Type `?` for anything unclear.
   You can also write a `.txt` file, one row per line, like `1 | Shahid Mahmood | A1 | 405 | 10 | 1300`.
   If Tesseract OCR is installed, **"Run OCR on a scanned image"** makes the draft with confidence scores. Handwriting OCR is weak, so expect many questions.
2. **Menu → 15 → "Load a transcription"**. Rows go to **IMPORT_STAGING**. Every unclear, low-confidence (below 90%, set in SETTINGS) or invalid value goes to the **VERIFICATION_QUEUE**. This applies to names, VLANs, due dates, fees, mobiles and location codes.
3. **Menu → 15 → "Commit verified rows"**. Rows that are fully verified become customers with new IDs. Rows that look like existing customers wait for your confirmation.

Old Excel/CSV customer lists: **Menu → 16**. You first see a **preview** of new customers, possible duplicates, invalid location codes and missing fields, and a preview file is saved in `imports/`. Nothing is imported until you confirm. Use `templates/Customer_Import_Template.xlsx` as the format.

## 12. How to fix verification items

The program asks only for the unclear fields:

```
Row 9  - Customer Name
Row 12 - VLAN ID
Row 14 - Monthly Fee
```

Answer one per line:

```
9 = خالد محمود
12 = 407
14 = 1500
```

* Only those fields are updated. You never re-type the page.
* If a row has two unclear fields, name the field: `12 vlan = 407` (fields: name, loc, vlan, due, fee, mobile).
* Wrong answers are refused, for example a fee of `abc` or location `A9` when A9 does not exist.
* You can also type answers in the **Answer** column of the VERIFICATION_QUEUE sheet, then use **Menu → 15 → "Apply answers typed in the sheet"**.

---

## Monthly routine (summary)

1. Close Excel, then open `CityLinks.bat`.
2. Menu 2: generate the month.
3. Menu 11: assign collectors, if they changed.
4. PRINT_CENTER / Menu 7: print lists by area, street or collector.
5. The recovery boy collects.
6. Menu 4 or 3: enter payments.
7. Menu 12: enter the cash submitted.
8. The DASHBOARD updates itself.
9. CUSTOMER_HISTORY: search any ID.
10. Menu 6: statement PDF, then WhatsApp with the PDF attached by hand.

## Reports

* **DASHBOARD** (Excel), for any month: customer counts; billing, recovered, pending, partial and recovery %; today's collection; collection during the month; outstanding balance; area-wise and collector-wise tables, including Expected Cash, Actual Cash and Difference.
* **REPORTS** (Excel): month-vs-month comparison and a street-wise report.
* **MONTHS** (Excel): the monthly archive, one row per generated month with its totals.
* **Menu 14:** an Excel report pack with Monthly Recovery, Area-wise, Street-wise, Collector-wise, Pending, Partial, Cash Reconciliation and Monthly Comparison.
* **Menu 8:** SHOW PENDING / PARTIAL / PAID / OVERDUE.
  **OVERDUE** means the bill still has a balance and today is after that month's due date plus the *Overdue Grace Days* in SETTINGS. A due date of 31 in a 30-day month means the last day of the month.

## Settings (SETTINGS sheet)

Company Name, Short Name, Tagline, phone/address (printed on statements), Customer ID Prefix and digits, Currency, Default/Print Language, **Current Month**, Date Format, Default Payment Method, Allow Negative Balance, Overdue Grace Days, OCR Confidence Threshold, WhatsApp country code and message, paper/orientation.

## Data safety rules built into the system

* Customer IDs are permanent and unique; nothing renumbers them.
* Monthly bills are snapshots. A new month never changes old months.
* Payments are separate transactions. They are never overwritten or deleted, only voided with a reason.
* Customers are never merged automatically. Possible duplicates are only *shown*.
* Handwritten or OCR data is never guessed. Unclear values go to the Verification Queue.
* Major operations make a backup first. Saving never happens while Excel has the file open.

## Command line (advanced)

```
python citylinks.py                       # menu
python citylinks.py generate-month 2026-11
python citylinks.py pay CL-0025 500 --month 2026-11 --collector B01
python citylinks.py print --month 2026-11 --area "Arif Town" --status UNPAID --language Urdu
python citylinks.py statement CL-0025 --from 2026-08 --to 2027-01
python citylinks.py show PENDING
python citylinks.py dashboard --month 2026-11
python citylinks.py hw-load imports/handwritten/page1.txt
python citylinks.py hw-answer "9 = خالد محمود" "12 = 407"
python citylinks.py check
python citylinks.py --workbook data/DEMO_CITY_LINKS_Recovery.xlsx dashboard   # practise on the demo
```

## For developers

```
CITY_LINKS_RECOVERY/
  citylinks.py            entry point
  src/citylinks/
    schema.py             all tables/columns (input / system / calc) and formulas: the data model
    builder.py            builds the workbook (sheets, Excel Tables, formulas, dropdowns, print layouts)
    store.py              reads/writes Excel Tables safely (temp file + atomic replace, Excel-lock check)
    services.py           business rules in pure Python (billing, payments, filters, history, cash, duplicates)
    importer.py           Excel/CSV import with preview, handwritten/OCR staging + verification queue
    pdfgen.py             statements and recovery lists (fpdf2 + HarfBuzz for Urdu/RTL)
    backup.py, seed.py, cli.py, util.py
  tools/verify_workbook.py  checks structure and recalculates with LibreOffice, comparing every formula to Python
  tests/test_system.py      automated tests
```

* Run the tests with `python -m pytest tests -v`. The formula test runs when LibreOffice is installed.
* Build a new empty workbook with `python citylinks.py build data/NEW.xlsx`. It never overwrites an existing file.
* **Migration:** every sheet is a normal table with a primary key (Customer ID, Billing ID = `YYYY-MM-CustomerID`, Payment ID, …). The `input`/`system` columns map 1-to-1 to SQL columns; the `calc` columns become queries. `services.py` has no Excel logic in it, so it can sit on SQLite or PostgreSQL later.
* **Excel compatibility:** Excel 2010 or newer. *Last Payment Date* uses MAXIFS, so in Excel 2016 and older that one column stays blank; everything else works. No macros are used.
