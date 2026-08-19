import ExcelJS from "exceljs"

export type ExportColumn = { header: string; key: string; width?: number; numeric?: boolean }

export async function excelResponse(title: string, filename: string, columns: ExportColumn[], rows: Record<string, unknown>[]) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(title.slice(0, 31))
  sheet.columns = columns.map(c => ({ header: c.header, key: c.key, width: c.width ?? 18 }))
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } }
  sheet.getRow(1).eachCell(cell => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } } })
  rows.forEach(row => sheet.addRow(row))
  columns.forEach((column, index) => { if (column.numeric) sheet.getColumn(index + 1).numFmt = "#,##0.00" })
  return new Response(new Uint8Array(await workbook.xlsx.writeBuffer()), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${filename}.xlsx"` } })
}
