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

// Dependency-free, valid single-page PDF for direct operational downloads.
export function pdfResponse(title: string, filename: string, columns: ExportColumn[], rows: Record<string, unknown>[]) {
  const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")
  const lines = [title, columns.map(c => c.header).join(" | "), ...rows.map(row => columns.map(c => String(row[c.key] ?? "")).join(" | "))].slice(0, 55)
  const stream = `BT /F1 9 Tf 36 800 Td ${lines.map((line, index) => `${index ? "0 -13 Td " : ""}(${escape(line.slice(0, 150))}) Tj`).join(" ")} ET`
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>", `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
  let pdf = "%PDF-1.4\n"; const offsets = [0]
  objects.forEach((object, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${object}\nendobj\n` })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(o => `${String(o).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return new Response(pdf, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}.pdf"` } })
}
