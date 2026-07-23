# Inventory import files

## Metsun Pharma Gate Pass 0183

`metsun-gate-pass-0183-products.json` contains the products readable from the uploaded Metsun Pharma Gate Pass 0183 image dated 2026-06-24.

Important notes:

- The image is marked `Page 1 of 2`, so this file only includes the products visible on page 1.
- Lines 22 (`Paracon C 50`) and 23 (`Ecto Pick`) are crossed out on the image and are not included.
- Expiry dates are not visible on the gate pass image. The import file uses `2028-12-31` as a placeholder expiry date so batches can be imported; verify and edit expiry dates in inventory before selling.
- Prices are taken from the handwritten right-side values where readable. Verify prices before selling.
- Batch quantities use the printed `Unit` column as the stock quantity.

To import in the app, sign in as an OWNER and use Settings → Restore from Backup, then choose the JSON file.
