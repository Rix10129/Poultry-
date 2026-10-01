# Test Results

Run on 01-Oct-2026 with Python 3.11.15, openpyxl, fpdf2 + uharfbuzz, LibreOffice 24.2.7.2 (formula recalculation).

```
$ python -m pytest tests -v
tests/test_system.py::test_new_customer_gets_permanent_id_and_event PASSED [  2%]
tests/test_system.py::test_prefix_is_configurable PASSED                 [  5%]
tests/test_system.py::test_duplicate_customer_id_is_refused PASSED       [  7%]
tests/test_system.py::test_possible_duplicate_needs_confirmation PASSED  [ 10%]
tests/test_system.py::test_location_code_A1_and_B1_derive_address PASSED [ 12%]
tests/test_system.py::test_invalid_location_code PASSED                  [ 15%]
tests/test_system.py::test_new_area_and_location PASSED                  [ 17%]
tests/test_system.py::test_required_fields_messages PASSED               [ 20%]
tests/test_system.py::test_vlan_text_keeps_leading_zero PASSED           [ 23%]
tests/test_system.py::test_package_fee_and_override PASSED               [ 25%]
tests/test_system.py::test_month_generation_only_active_and_snapshot PASSED [ 28%]
tests/test_system.py::test_duplicate_month_is_refused PASSED             [ 30%]
tests/test_system.py::test_month_with_problem_customer PASSED            [ 33%]
tests/test_system.py::test_full_partial_multiple_and_pending PASSED      [ 35%]
tests/test_system.py::test_payment_errors PASSED                         [ 38%]
tests/test_system.py::test_void_payment_keeps_record PASSED              [ 41%]
tests/test_system.py::test_area_street_collector_due_status_filters PASSED [ 43%]
tests/test_system.py::test_reassignment_keeps_history PASSED             [ 46%]
tests/test_system.py::test_recovery_list_pdf_english_and_urdu PASSED     [ 48%]
tests/test_system.py::test_dashboard_and_cash_reconciliation PASSED      [ 51%]
tests/test_system.py::test_overdue_definition PASSED                     [ 53%]
tests/test_system.py::test_customer_history_events_and_statement_pdf PASSED [ 56%]
tests/test_system.py::test_customer_id_never_changes PASSED              [ 58%]
tests/test_system.py::test_excel_edits_are_logged_as_events PASSED       [ 61%]
tests/test_system.py::test_backup_never_overwrites PASSED                [ 64%]
tests/test_system.py::test_app_write_makes_backup_and_refuses_open_workbook PASSED [ 66%]
tests/test_system.py::test_reports_export PASSED                         [ 69%]
tests/test_system.py::test_handwritten_verification_queue PASSED         [ 71%]
tests/test_system.py::test_page_review_required_even_when_all_fields_valid PASSED [ 74%]
tests/test_system.py::test_page_review_needs_exact_phrase_and_name PASSED [ 76%]
tests/test_system.py::test_yes_typed_in_excel_alone_is_not_a_review PASSED [ 79%]
tests/test_system.py::test_changes_after_review_cancel_the_review PASSED [ 82%]
tests/test_system.py::test_old_workbook_is_upgraded_without_data_loss PASSED [ 84%]
tests/test_system.py::test_low_ocr_confidence_goes_to_queue PASSED       [ 87%]
tests/test_system.py::test_answer_needs_field_when_row_has_several PASSED [ 89%]
tests/test_system.py::test_import_existing_excel_preview PASSED          [ 92%]
tests/test_system.py::test_months_and_filenames PASSED                   [ 94%]
tests/test_system.py::test_demo_workbook_builds PASSED                   [ 97%]
tests/test_system.py::test_excel_formulas_match_python PASSED            [100%]
======================== 39 passed in 207.32s (0:03:27) ========================

$ python tools/verify_workbook.py data/CITY_LINKS_Recovery.xlsx   (local production workbook - not in Git)
Verifying data/CITY_LINKS_Recovery.xlsx
  structure: OK
  recalculation vs Python: OK

$ python tools/verify_workbook.py data/DEMO_CITY_LINKS_Recovery.xlsx
Verifying data/DEMO_CITY_LINKS_Recovery.xlsx
  structure: OK
  recalculation vs Python: OK
```

verify_workbook.py reopens each workbook and checks all sheets, Excel Tables (column names + calculated-column formulas), named ranges, dropdown validations, print setup, dynamic print areas, RTL Urdu print sheet and sheet protection, then recalculates every formula with LibreOffice and compares the results with the Python business logic. Result: no formula errors and no differences.
