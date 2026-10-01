# Test Results

Run on 01-Oct-2026 with Python 3.11.15, openpyxl, fpdf2 + uharfbuzz, LibreOffice 24.2.7.2 (formula recalculation).

```
$ python -m pytest tests -v
tests/test_system.py::test_new_customer_gets_permanent_id_and_event PASSED [  2%]
tests/test_system.py::test_prefix_is_configurable PASSED                 [  5%]
tests/test_system.py::test_duplicate_customer_id_is_refused PASSED       [  8%]
tests/test_system.py::test_possible_duplicate_needs_confirmation PASSED  [ 11%]
tests/test_system.py::test_location_code_A1_and_B1_derive_address PASSED [ 14%]
tests/test_system.py::test_invalid_location_code PASSED                  [ 17%]
tests/test_system.py::test_new_area_and_location PASSED                  [ 20%]
tests/test_system.py::test_required_fields_messages PASSED               [ 23%]
tests/test_system.py::test_vlan_text_keeps_leading_zero PASSED           [ 26%]
tests/test_system.py::test_package_fee_and_override PASSED               [ 29%]
tests/test_system.py::test_month_generation_only_active_and_snapshot PASSED [ 32%]
tests/test_system.py::test_duplicate_month_is_refused PASSED             [ 35%]
tests/test_system.py::test_month_with_problem_customer PASSED            [ 38%]
tests/test_system.py::test_full_partial_multiple_and_pending PASSED      [ 41%]
tests/test_system.py::test_payment_errors PASSED                         [ 44%]
tests/test_system.py::test_void_payment_keeps_record PASSED              [ 47%]
tests/test_system.py::test_area_street_collector_due_status_filters PASSED [ 50%]
tests/test_system.py::test_reassignment_keeps_history PASSED             [ 52%]
tests/test_system.py::test_recovery_list_pdf_english_and_urdu PASSED     [ 55%]
tests/test_system.py::test_dashboard_and_cash_reconciliation PASSED      [ 58%]
tests/test_system.py::test_overdue_definition PASSED                     [ 61%]
tests/test_system.py::test_customer_history_events_and_statement_pdf PASSED [ 64%]
tests/test_system.py::test_customer_id_never_changes PASSED              [ 67%]
tests/test_system.py::test_excel_edits_are_logged_as_events PASSED       [ 70%]
tests/test_system.py::test_backup_never_overwrites PASSED                [ 73%]
tests/test_system.py::test_app_write_makes_backup_and_refuses_open_workbook PASSED [ 76%]
tests/test_system.py::test_reports_export PASSED                         [ 79%]
tests/test_system.py::test_handwritten_verification_queue PASSED         [ 82%]
tests/test_system.py::test_low_ocr_confidence_goes_to_queue PASSED       [ 85%]
tests/test_system.py::test_answer_needs_field_when_row_has_several PASSED [ 88%]
tests/test_system.py::test_import_existing_excel_preview PASSED          [ 91%]
tests/test_system.py::test_months_and_filenames PASSED                   [ 94%]
tests/test_system.py::test_demo_workbook_builds PASSED                   [ 97%]
tests/test_system.py::test_excel_formulas_match_python PASSED            [100%]
======================== 34 passed in 182.42s (0:03:02) ========================

$ python tools/verify_workbook.py data/CITY_LINKS_Recovery.xlsx
Verifying data/CITY_LINKS_Recovery.xlsx
  structure: OK
  recalculation vs Python: OK

$ python tools/verify_workbook.py data/DEMO_CITY_LINKS_Recovery.xlsx
Verifying data/DEMO_CITY_LINKS_Recovery.xlsx
  structure: OK
  recalculation vs Python: OK
```

verify_workbook.py reopens each workbook and checks all 24 sheets, 13 Excel Tables (column names + calculated-column formulas), named ranges, dropdown validations, print titles / landscape / page numbers / dynamic print areas, RTL Urdu print sheet and sheet protection. It then recalculates every formula with LibreOffice and compares the results with the Python business logic: every bill's Paid / Balance / Status / Collector / Overdue, customer Area / Address / Fee, dashboard KPIs, print-center list and totals, cash reconciliation and customer history. Result: no formula errors and no differences.
