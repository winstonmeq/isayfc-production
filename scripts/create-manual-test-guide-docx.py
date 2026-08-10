from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_ALIGN_VERTICAL, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


OUT = Path(r"C:\nextjs\letson\artifacts\Letson_ERP_Manual_Test_Data_Guide.docx")

NAVY = "0B2545"
BLUE = "1F4D78"
LIGHT_BLUE = "E8EEF5"
LIGHT_GRAY = "F2F4F7"
GREEN = "0A7A53"
GOLD = "E6A817"
WHITE = "FFFFFF"
RED = "9B1C1C"
MUTED = "64748B"


def set_font(run, size=10.5, bold=False, color="111827", italic=False):
    run.font.name = "Calibri"
    run._element.get_or_add_rPr().rFonts.set(qn("w:ascii"), "Calibri")
    run._element.get_or_add_rPr().rFonts.set(qn("w:hAnsi"), "Calibri")
    run.font.size = Pt(size)
    run.bold = bold
    run.italic = italic
    run.font.color.rgb = RGBColor.from_string(color)


def shade(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_margins(cell, top=80, start=120, bottom=80, end=120):
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for margin, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{margin}"))
        if node is None:
            node = OxmlElement(f"w:{margin}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_table_geometry(table, widths):
    table.autofit = False
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl_pr = table._tbl.tblPr
    tbl_w = tbl_pr.first_child_found_in("w:tblW")
    if tbl_w is None:
        tbl_w = OxmlElement("w:tblW")
        tbl_pr.append(tbl_w)
    tbl_w.set(qn("w:w"), str(sum(widths)))
    tbl_w.set(qn("w:type"), "dxa")
    tbl_ind = tbl_pr.first_child_found_in("w:tblInd")
    if tbl_ind is None:
        tbl_ind = OxmlElement("w:tblInd")
        tbl_pr.append(tbl_ind)
    tbl_ind.set(qn("w:w"), "120")
    tbl_ind.set(qn("w:type"), "dxa")

    grid = table._tbl.tblGrid
    for child in list(grid):
        grid.remove(child)
    for width in widths:
        col = OxmlElement("w:gridCol")
        col.set(qn("w:w"), str(width))
        grid.append(col)

    for row in table.rows:
        for idx, cell in enumerate(row.cells):
            width = widths[idx]
            tc_pr = cell._tc.get_or_add_tcPr()
            tc_w = tc_pr.first_child_found_in("w:tcW")
            if tc_w is None:
                tc_w = OxmlElement("w:tcW")
                tc_pr.append(tc_w)
            tc_w.set(qn("w:w"), str(width))
            tc_w.set(qn("w:type"), "dxa")
            set_cell_margins(cell)
            cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER


def repeat_header(row):
    tr_pr = row._tr.get_or_add_trPr()
    header = OxmlElement("w:tblHeader")
    header.set(qn("w:val"), "true")
    tr_pr.append(header)


def set_keep_with_next(paragraph):
    paragraph.paragraph_format.keep_with_next = True


def add_heading(doc, text, level=1):
    p = doc.add_paragraph(style=f"Heading {level}")
    p.add_run(text)
    set_keep_with_next(p)
    return p


def add_note(doc, title, text, fill=LIGHT_BLUE, accent=BLUE):
    table = doc.add_table(rows=1, cols=1)
    table.style = "Table Grid"
    set_table_geometry(table, [9360])
    cell = table.cell(0, 0)
    shade(cell, fill)
    p = cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(0)
    r = p.add_run(f"{title}: ")
    set_font(r, bold=True, color=accent)
    r = p.add_run(text)
    set_font(r, color="1F2937")
    doc.add_paragraph().paragraph_format.space_after = Pt(0)


def add_table(doc, headers, rows, widths, aligns=None, font_size=9.2, total_rows=None):
    table = doc.add_table(rows=1, cols=len(headers))
    table.style = "Table Grid"
    set_table_geometry(table, widths)
    repeat_header(table.rows[0])
    for idx, header in enumerate(headers):
        cell = table.rows[0].cells[idx]
        shade(cell, NAVY)
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_after = Pt(0)
        r = p.add_run(str(header))
        set_font(r, size=font_size, bold=True, color=WHITE)
    total_rows = set(total_rows or [])
    for row_index, values in enumerate(rows):
        cells = table.add_row().cells
        is_total = row_index in total_rows
        for idx, value in enumerate(values):
            if is_total:
                shade(cells[idx], LIGHT_BLUE)
            p = cells[idx].paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            p.alignment = (aligns[idx] if aligns else WD_ALIGN_PARAGRAPH.LEFT)
            r = p.add_run(str(value))
            set_font(r, size=font_size, bold=is_total, color=GREEN if is_total and idx > 0 else "111827")
    doc.add_paragraph().paragraph_format.space_after = Pt(0)
    return table


def add_check(doc, text):
    p = doc.add_paragraph(style="List Bullet")
    r = p.add_run(f"[ ] {text}")
    set_font(r)
    return p


def add_page_break(doc):
    doc.add_page_break()


doc = Document()
doc.settings.odd_and_even_pages_header_footer = False
sec = doc.sections[0]
sec.different_first_page_header_footer = False
sec.page_width = Inches(8.5)
sec.page_height = Inches(11)
sec.top_margin = Inches(0.7)
sec.bottom_margin = Inches(0.7)
sec.left_margin = Inches(1)
sec.right_margin = Inches(1)
sec.header_distance = Inches(0.35)
sec.footer_distance = Inches(0.35)

styles = doc.styles
normal = styles["Normal"]
normal.font.name = "Calibri"
normal._element.rPr.rFonts.set(qn("w:ascii"), "Calibri")
normal._element.rPr.rFonts.set(qn("w:hAnsi"), "Calibri")
normal.font.size = Pt(10.5)
normal.paragraph_format.space_after = Pt(6)
normal.paragraph_format.line_spacing = 1.15
for level, size, before, after, color in ((1, 16, 18, 8, BLUE), (2, 13, 14, 7, BLUE), (3, 11.5, 10, 5, NAVY)):
    style = styles[f"Heading {level}"]
    style.font.name = "Calibri"
    style._element.rPr.rFonts.set(qn("w:ascii"), "Calibri")
    style._element.rPr.rFonts.set(qn("w:hAnsi"), "Calibri")
    style.font.size = Pt(size)
    style.font.bold = True
    style.font.color.rgb = RGBColor.from_string(color)
    style.paragraph_format.space_before = Pt(before)
    style.paragraph_format.space_after = Pt(after)

# Keep running headers and footers empty so the operator pages remain clean
# and render consistently across Word's odd/even-page settings.

# Cover / operating brief
p = doc.add_paragraph()
p.paragraph_format.space_before = Pt(26)
p.paragraph_format.space_after = Pt(2)
r = p.add_run("LETSON ERP + OUTLET POS")
set_font(r, size=10, bold=True, color=GOLD)

p = doc.add_paragraph()
p.paragraph_format.space_after = Pt(8)
r = p.add_run("Manual End-to-End Test Data Guide")
set_font(r, size=25, bold=True, color=NAVY)

p = doc.add_paragraph()
p.paragraph_format.space_after = Pt(18)
r = p.add_run("Delivery -> Slicing -> Customer Sales -> Collections -> Outlet Transfer -> Mobile Cashier Sales")
set_font(r, size=12.5, color=BLUE)

add_note(doc, "Purpose", "Encode a small, traceable data set manually and reconcile inventory, revenue, customer balances, cash sales, and reports from beginning to end.")

add_heading(doc, "Test controls", 1)
add_table(
    doc,
    ["Control", "Required value"],
    [
        ["Test date", "August 4, 2026"],
        ["Supplier", "JARRY VEE"],
        ["Sliced product", "C10 (50 PCS per pack)"],
        ["Outlet", "Use one test outlet consistently"],
        ["Starting stock", "OS1 = 0; PS4 = 0; C10 = 0; outlet C10 = 0"],
        ["Test staff", "Slicer: TEST SLICER; Packer: TEST PACKER"],
    ],
    [2700, 6660],
    font_size=9.7,
)

add_heading(doc, "Execution order", 1)
for item in (
    "Encode all three supplier deliveries.",
    "Slice OS1 and PS4 into C10.",
    "Record two C10 customer sales.",
    "Record the two customer payments.",
    "Dispatch and confirm one C10 transfer to the outlet.",
    "Record two Buttered Chicken mobile cashier sales.",
    "Compare the final inventory, collection, and report results.",
):
    add_check(doc, item)

add_note(doc, "Important", "Use unique receipt numbers exactly as shown. Do not mix unrelated transactions into the test date while reconciling the results.", fill="FFF8E8", accent="7A5A00")

add_page_break(doc)

# Deliveries
add_heading(doc, "1. Supplier Deliveries", 1)
p = doc.add_paragraph("Purchasing > Deliveries > Add Delivery")
p.runs[0].italic = True
p.runs[0].font.color.rgb = RGBColor.from_string(MUTED)

add_table(
    doc,
    ["Code", "Receipt", "Product", "Bags", "Kilos", "Heads", "Price/kg", "Amount"],
    [
        ["901", "19001", "OS1", "2", "34.00", "24", "P152.00", "P5,168.00"],
        ["902", "19002", "OS1", "2", "34.00", "24", "P152.00", "P5,168.00"],
        ["903", "19003", "PS4", "2", "31.50", "30", "P154.00", "P4,851.00"],
        ["TOTAL", "-", "-", "6", "99.50", "78", "-", "P15,187.00"],
    ],
    [700, 950, 1050, 750, 900, 850, 1100, 3060],
    [WD_ALIGN_PARAGRAPH.CENTER] * 8,
    font_size=8.7,
    total_rows=[3],
)

add_heading(doc, "Expected stock after deliveries", 2)
add_table(
    doc,
    ["Product", "Bags", "Heads / PCS", "Kilos"],
    [["OS1", "4", "48", "68.00"], ["PS4", "2", "30", "31.50"]],
    [3000, 1800, 2280, 2280],
    [WD_ALIGN_PARAGRAPH.LEFT, WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.CENTER],
)

add_heading(doc, "Delivery verification", 2)
for item in (
    "All three delivery records are visible in Delivery History.",
    "The delivery total is P15,187.00.",
    "OS1 stock is 4 bags, 48 heads, and 68.00 kilos.",
    "PS4 stock is 2 bags, 30 heads, and 31.50 kilos.",
):
    add_check(doc, item)

add_page_break(doc)

# Slicing
add_heading(doc, "2. Production Slicing", 1)
p = doc.add_paragraph("Production > Add Slicing")
p.runs[0].italic = True
p.runs[0].font.color.rgb = RGBColor.from_string(MUTED)

add_heading(doc, "Batch A - OS1 to C10", 2)
add_table(
    doc,
    ["Entry field", "Encode", "Expected calculation", "Result"],
    [
        ["Bags", "4", "Standard slice", "28 PCS/head"],
        ["Heads", "48", "Standard PCS", "1,344"],
        ["Total kilos", "68.00", "Pack size", "50 PCS"],
        ["Actual sliced PCS", "1,400", "Full packs / loose", "28 / 0"],
        ["", "", "Variance / yield", "+56 / 104.17%"],
    ],
    [2100, 1500, 2750, 3010],
    font_size=9.3,
)

add_heading(doc, "Batch B - PS4 to C10", 2)
add_table(
    doc,
    ["Entry field", "Encode", "Expected calculation", "Result"],
    [
        ["Bags", "2", "Standard slice", "24 PCS/head"],
        ["Heads", "30", "Standard PCS", "720"],
        ["Total kilos", "31.50", "Pack size", "50 PCS"],
        ["Actual sliced PCS", "750", "Full packs / loose", "15 / 0"],
        ["", "", "Variance / yield", "+30 / 104.17%"],
    ],
    [2100, 1500, 2750, 3010],
    font_size=9.3,
)

add_note(doc, "Expected C10 production", "2,150 PCS = 43 full packs + 0 loose PCS. OS1 and PS4 should both return to zero because all delivered stock was used.", fill="ECFDF5", accent=GREEN)

add_heading(doc, "Slicing verification", 2)
for item in (
    "Slicing History shows both line-level transactions.",
    "Combined heads = 78; bags = 6; kilos = 99.50.",
    "Combined standard PCS = 2,064; actual PCS = 2,150.",
    "Combined variance = +86; C10 current stock = 43 packs.",
):
    add_check(doc, item)

add_page_break(doc)

# Sales and collections
add_heading(doc, "3. Customer Sales and Collections", 1)
p = doc.add_paragraph("Sales > All Sales (or Sell Chicken)")
p.runs[0].italic = True
p.runs[0].font.color.rgb = RGBColor.from_string(MUTED)

add_table(
    doc,
    ["Receipt", "Customer", "Product", "Quantity", "Price/pack", "Sale total", "PCS out"],
    [
        ["009001", "KAURAN", "C10", "10 packs", "P395.00", "P3,950.00", "500"],
        ["009002", "ARENDON", "C10", "5 packs", "P395.00", "P1,975.00", "250"],
        ["TOTAL", "-", "-", "15 packs", "-", "P5,925.00", "750"],
    ],
    [1000, 1450, 900, 1250, 1450, 1750, 1560],
    [WD_ALIGN_PARAGRAPH.CENTER] * 7,
    font_size=8.8,
    total_rows=[2],
)

add_note(doc, "Expected stock", "C10 moves from 43 packs to 28 packs after the two customer sales: 2,150 - 750 = 1,400 PCS.")

add_heading(doc, "Record customer payments", 2)
p = doc.add_paragraph("Collections > Add Payment")
p.runs[0].italic = True
p.runs[0].font.color.rgb = RGBColor.from_string(MUTED)

add_table(
    doc,
    ["Customer", "Sale", "Payment", "Expected balance"],
    [
        ["KAURAN", "P3,950.00", "P2,000.00", "P1,950.00"],
        ["ARENDON", "P1,975.00", "P1,975.00", "P0.00"],
        ["TOTAL", "P5,925.00", "P3,975.00", "P1,950.00"],
    ],
    [2400, 2320, 2320, 2320],
    [WD_ALIGN_PARAGRAPH.LEFT, WD_ALIGN_PARAGRAPH.RIGHT, WD_ALIGN_PARAGRAPH.RIGHT, WD_ALIGN_PARAGRAPH.RIGHT],
    total_rows=[2],
)

add_heading(doc, "Sales and collection verification", 2)
for item in (
    "Sales History shows receipt 009001 under KAURAN only.",
    "Sales History shows receipt 009002 under ARENDON only.",
    "Collection Summary shows P5,925.00 sales and P3,975.00 paid.",
    "KAURAN balance is P1,950.00; ARENDON balance is zero.",
):
    add_check(doc, item)

add_page_break(doc)

# Transfer
add_heading(doc, "4. Outlet Stock Transfer", 1)
p = doc.add_paragraph("Sales > Stock Transfers > New Delivery Order")
p.runs[0].italic = True
p.runs[0].font.color.rgb = RGBColor.from_string(MUTED)

add_table(
    doc,
    ["Field", "Value"],
    [
        ["Outlet", "Use the same test outlet for the full scenario"],
        ["Product", "C10 - Bodega"],
        ["Quantity", "10 packs"],
        ["PCS preview", "500 PCS (10 x 50)"],
        ["Remarks", "TEST C10 OUTLET TRANSFER"],
    ],
    [2500, 6860],
    font_size=9.7,
)

add_heading(doc, "Required transfer workflow", 2)
for item in (
    "Save and Dispatch the transfer from the web ERP.",
    "Open Incoming Transfers in the mobile app.",
    "Receive and confirm exactly 10 packs / 500 PCS.",
    "Verify that the transfer does not create sales revenue or customer balance.",
):
    add_check(doc, item)

add_heading(doc, "Expected stock after confirmation", 2)
add_table(
    doc,
    ["Location", "Before transfer", "Movement", "Current"],
    [
        ["Bodega C10", "28 packs / 1,400 PCS", "OUT 10 packs / 500 PCS", "18 packs / 900 PCS"],
        ["Outlet C10", "0", "IN 10 packs / 500 PCS", "10 packs / 500 PCS"],
    ],
    [1900, 2480, 2600, 2380],
    font_size=9.2,
)

add_note(doc, "Control", "A manual outlet stock transfer is an inventory movement, not a sale. Gross sales and customer receivables must remain unchanged.", fill="FFF8E8", accent="7A5A00")

add_page_break(doc)

# Mobile sales
add_heading(doc, "5. Mobile Cashier Sales", 1)
add_heading(doc, "Menu prerequisite", 2)
add_table(
    doc,
    ["Menu field", "Required value"],
    [
        ["Menu name", "Buttered Chicken"],
        ["Selling price", "P25.00"],
        ["Mapped inventory product", "C10"],
        ["Deduction per sale", "1 PCS"],
    ],
    [2900, 6460],
    font_size=9.7,
)

add_note(doc, "Before selling", "Open a cashier shift. Use zero opening cash for the simplest reconciliation.")

add_table(
    doc,
    ["Transaction", "Menu item", "Quantity", "Unit price", "Cash total", "C10 out"],
    [
        ["Mobile Sale 1", "Buttered Chicken", "3", "P25.00", "P75.00", "3 PCS"],
        ["Mobile Sale 2", "Buttered Chicken", "2", "P25.00", "P50.00", "2 PCS"],
        ["TOTAL", "-", "5", "-", "P125.00", "5 PCS"],
    ],
    [1500, 2150, 1100, 1450, 1650, 1510],
    [WD_ALIGN_PARAGRAPH.CENTER] * 6,
    font_size=9,
    total_rows=[2],
)

add_heading(doc, "Expected mobile and outlet result", 2)
add_table(
    doc,
    ["Metric", "Expected"],
    [
        ["Mobile transactions", "2"],
        ["Menu units sold", "5"],
        ["Cash sales", "P125.00"],
        ["Outlet C10 consumed", "5 PCS"],
        ["Outlet C10 current", "495 PCS"],
        ["Owner-friendly display", "9 packs + 45 loose PCS"],
        ["Expected cash at shift close", "P125.00 (if opening cash and other cash movements are zero)"],
    ],
    [3650, 5710],
    font_size=9.5,
)

add_heading(doc, "Mobile verification", 2)
for item in (
    "Today's Sales shows both transactions before and after shift close.",
    "Outlet inventory movement history shows two C10 stock-out entries.",
    "The shift reports two sales totaling P125.00.",
    "Outlet C10 stock equals 495 PCS.",
):
    add_check(doc, item)

add_page_break(doc)

# Final reconciliation
add_heading(doc, "6. Final Reconciliation", 1)
add_heading(doc, "Bodega inventory", 2)
add_table(
    doc,
    ["Product", "Stock in", "Stock out", "Expected current"],
    [
        ["OS1", "48 heads", "48 heads to slicing", "0"],
        ["PS4", "30 heads", "30 heads to slicing", "0"],
        ["C10", "2,150 PCS", "750 sold + 500 transferred", "900 PCS"],
        ["C10 packs", "43 packs", "15 sold + 10 transferred", "18 packs"],
    ],
    [1700, 2150, 3200, 2310],
    font_size=9.2,
)

add_heading(doc, "Outlet inventory", 2)
add_table(
    doc,
    ["Product", "Stock in", "Stock out", "Expected current"],
    [
        ["C10", "500 PCS", "5 PCS through POS", "495 PCS"],
        ["C10 display", "10 packs", "5 loose PCS", "9 packs + 45 PCS"],
    ],
    [1700, 2150, 3200, 2310],
    font_size=9.2,
)

add_heading(doc, "Sales, collections, and reports", 2)
add_table(
    doc,
    ["Measure", "Expected amount"],
    [
        ["C10 customer sales", "P5,925.00"],
        ["Mobile Buttered Chicken cash sales", "P125.00"],
        ["Overall gross sales", "P6,050.00"],
        ["Customer collections received", "P3,975.00"],
        ["Outstanding customer receivables", "P1,950.00"],
        ["Stock transfer revenue", "P0.00"],
        ["Operating expenses", "P0.00"],
    ],
    [6000, 3360],
    [WD_ALIGN_PARAGRAPH.LEFT, WD_ALIGN_PARAGRAPH.RIGHT],
    font_size=9.7,
)

add_note(doc, "Profitability", "Cost of Sales, Gross Profit, Net Income, and the profitability ratio depend on the historical C10 cost stored by the ERP. Verify the formulas: Gross Profit = P6,050.00 - COGS; Net Income = Gross Profit - Operating Expenses. With no test expenses, Net Income should equal Gross Profit.", fill="FFF8E8", accent="7A5A00")

add_heading(doc, "Final acceptance", 2)
for item in (
    "All expected inventory balances match exactly.",
    "Gross sales equals P6,050.00.",
    "Collections paid equals P3,975.00 and open balance equals P1,950.00.",
    "The transfer appears only as stock movement, not as revenue.",
    "No duplicate receipt, transfer, sale, payment, or inventory movement exists.",
):
    add_check(doc, item)

OUT.parent.mkdir(parents=True, exist_ok=True)
doc.save(OUT)
print(OUT)
