import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib"

// A dependency-on-Chromium-free PDF export for wide, many-column report
// tables. The in-browser Print button depends on the client's print
// dialog correctly picking up the page's @page landscape/scale hints,
// which real-world browsers and printer drivers don't do consistently —
// this bakes the page geometry directly into the PDF bytes instead, so
// what the client opens is exactly what prints, regardless of local
// print-dialog settings.

export type WideTableColumn = { header: string; key: string; weight: number; align?: "left" | "right" }

export type WideTablePdfOptions = {
  title: string
  subtitle?: string
  columns: WideTableColumn[]
  rows: Record<string, string>[]
  totalsRow?: Record<string, string>
  orientation?: "portrait" | "landscape"
  // A report with few enough columns has room for a more comfortable
  // font than the default — set explicitly per report rather than
  // globally, since bumping the shared default would need every other
  // wide-table report's column weights re-verified against it too.
  fontSize?: number
  headerFontSize?: number
}

const A4_LANDSCAPE = { width: 841.89, height: 595.28 }
const A4_PORTRAIT = { width: 595.28, height: 841.89 }
const MARGIN = 28
const HEADER_HEIGHT = 42
const DEFAULT_FONT_SIZE = 9
const DEFAULT_HEADER_FONT_SIZE = 8.5
// Right-aligned columns (mostly money) sit flush against their own right
// edge, which is also the next column's left edge — with only a small
// inset, adjacent right-aligned numbers can read as running into each
// other. Give them a wider reserved margin than left-aligned text needs.
const LEFT_INSET = 4
const RIGHT_INSET = 9

function truncate(font: PDFFont, text: string, maxWidth: number, size: number): string {
  if (!text) return text
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text
  let low = 0, high = text.length
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    const candidate = text.slice(0, mid) + "…"
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) low = mid
    else high = mid - 1
  }
  // A column sized too narrow for even one character plus an ellipsis
  // would otherwise render nothing at all — an unlabeled column is a much
  // worse failure than an ellipsis alone, so fall back to that.
  if (low > 0) return text.slice(0, low) + "…"
  return font.widthOfTextAtSize("…", size) <= maxWidth ? "…" : ""
}

export async function buildWideTablePdf(opts: WideTablePdfOptions): Promise<Uint8Array> {
  const { title, subtitle, columns, rows, totalsRow, orientation = "landscape" } = opts
  const FONT_SIZE = opts.fontSize ?? DEFAULT_FONT_SIZE
  const HEADER_FONT_SIZE = opts.headerFontSize ?? DEFAULT_HEADER_FONT_SIZE
  const ROW_HEIGHT = FONT_SIZE + 8.5
  const HEADER_ROW_HEIGHT = HEADER_FONT_SIZE + 9
  const { width: PAGE_WIDTH, height: PAGE_HEIGHT } = orientation === "portrait" ? A4_PORTRAIT : A4_LANDSCAPE
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold)

  const usableWidth = PAGE_WIDTH - MARGIN * 2
  const totalWeight = columns.reduce((s, c) => s + c.weight, 0)
  const colWidths = columns.map((c) => (c.weight / totalWeight) * usableWidth)
  const colX: number[] = []
  {
    let x = MARGIN
    for (const w of colWidths) { colX.push(x); x += w }
  }

  let page: PDFPage
  let y = 0
  let pageNumber = 0
  const pages: PDFPage[] = []

  function newPage() {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    pages.push(page)
    pageNumber++
    y = PAGE_HEIGHT - MARGIN
    if (pageNumber === 1) {
      page.drawText(title, { x: MARGIN, y, size: 13, font: boldFont, color: rgb(0.09, 0.13, 0.24) })
      y -= 16
      if (subtitle) {
        page.drawText(subtitle, { x: MARGIN, y, size: 8.5, font, color: rgb(0.4, 0.44, 0.53) })
        y -= 14
      }
      y -= 4
    } else {
      y -= 6
    }
    drawHeaderRow()
  }

  function drawHeaderRow() {
    page.drawRectangle({ x: MARGIN, y: y - HEADER_HEIGHT / 2 - 4, width: usableWidth, height: HEADER_ROW_HEIGHT, color: rgb(0.93, 0.95, 0.97) })
    columns.forEach((c, i) => {
      const inset = c.align === "right" ? RIGHT_INSET : LEFT_INSET
      const label = truncate(boldFont, c.header, colWidths[i] - inset - LEFT_INSET, HEADER_FONT_SIZE)
      const textWidth = boldFont.widthOfTextAtSize(label, HEADER_FONT_SIZE)
      const tx = c.align === "right" ? colX[i] + colWidths[i] - inset - textWidth : colX[i] + LEFT_INSET
      page.drawText(label, { x: tx, y: y - (HEADER_FONT_SIZE - 2), size: HEADER_FONT_SIZE, font: boldFont, color: rgb(0.25, 0.29, 0.38) })
    })
    y -= HEADER_ROW_HEIGHT + 2
  }

  function drawRow(row: Record<string, string>, opts2?: { bold?: boolean; shade?: boolean }) {
    if (y - ROW_HEIGHT < MARGIN + 14) {
      newPage()
    }
    if (opts2?.shade) {
      page.drawRectangle({ x: MARGIN, y: y - ROW_HEIGHT + 4, width: usableWidth, height: ROW_HEIGHT, color: rgb(0.97, 0.97, 0.98) })
    }
    const rowFont = opts2?.bold ? boldFont : font
    columns.forEach((c, i) => {
      const inset = c.align === "right" ? RIGHT_INSET : LEFT_INSET
      const raw = row[c.key] ?? ""
      const label = truncate(rowFont, raw, colWidths[i] - inset - LEFT_INSET, FONT_SIZE)
      const textWidth = rowFont.widthOfTextAtSize(label, FONT_SIZE)
      const tx = c.align === "right" ? colX[i] + colWidths[i] - inset - textWidth : colX[i] + LEFT_INSET
      page.drawText(label, { x: tx, y: y - (FONT_SIZE + 1), size: FONT_SIZE, font: rowFont, color: rgb(0.13, 0.16, 0.24) })
    })
    y -= ROW_HEIGHT
  }

  newPage()
  rows.forEach((row, i) => drawRow(row, { shade: i % 2 === 1 }))
  if (totalsRow) {
    if (y - ROW_HEIGHT < MARGIN + 14) newPage()
    page!.drawLine({ start: { x: MARGIN, y: y + 4 }, end: { x: MARGIN + usableWidth, y: y + 4 }, thickness: 1, color: rgb(0.6, 0.63, 0.7) })
    drawRow(totalsRow, { bold: true })
  }

  pages.forEach((p, i) => {
    p.drawText(`Page ${i + 1} of ${pages.length}`, {
      x: PAGE_WIDTH - MARGIN - 60, y: MARGIN - 14, size: 7, font, color: rgb(0.55, 0.58, 0.65),
    })
  })

  // pdf-lib defaults to a compressed cross-reference *stream* (PDF 1.5+).
  // Valid, and every mainstream desktop reader handles it — but several
  // stripped-down parsers (chat-app inline previews, some mobile PDF
  // viewers) only understand the older plain-text xref table and fail to
  // open the file entirely. The classic table costs a little file size;
  // "won't open on some phones" is a worse failure mode than that.
  return doc.save({ useObjectStreams: false })
}
