from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


OUT = Path(r"C:\nextjs\letson\output\pdf\Letson_Mobile_API_Reference.pdf")

NAVY = colors.HexColor("#0B2545")
BLUE = colors.HexColor("#1F4D78")
LIGHT_BLUE = colors.HexColor("#E8EEF5")
LIGHT_GRAY = colors.HexColor("#F2F4F7")
GREEN = colors.HexColor("#0A7A53")
GOLD = colors.HexColor("#E6A817")
MUTED = colors.HexColor("#64748B")
INK = colors.HexColor("#111827")


class ApiReferenceDoc(BaseDocTemplate):
    def __init__(self, filename):
        super().__init__(
            filename,
            pagesize=letter,
            rightMargin=0.58 * inch,
            leftMargin=0.58 * inch,
            topMargin=0.62 * inch,
            bottomMargin=0.58 * inch,
            title="Letson Mobile API Reference",
            author="ISAY Fried Chicken",
            subject="Backend endpoints used by the Letson cashier mobile app",
        )
        frame = Frame(
            self.leftMargin,
            self.bottomMargin,
            self.width,
            self.height,
            id="normal",
        )
        self.addPageTemplates(PageTemplate(id="api", frames=[frame], onPage=self._page))

    def _page(self, canvas, doc):
        canvas.saveState()
        canvas.setStrokeColor(colors.HexColor("#D7DEE8"))
        canvas.setLineWidth(0.5)
        canvas.line(self.leftMargin, 0.42 * inch, letter[0] - self.rightMargin, 0.42 * inch)
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(self.leftMargin, 0.25 * inch, "ISAY Fried Chicken - Letson ERP Mobile API")
        canvas.drawRightString(letter[0] - self.rightMargin, 0.25 * inch, f"Page {doc.page}")
        canvas.restoreState()


styles = getSampleStyleSheet()
styles.add(
    ParagraphStyle(
        name="ApiTitle",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=24,
        leading=28,
        textColor=NAVY,
        alignment=TA_LEFT,
        spaceAfter=6,
    )
)
styles.add(
    ParagraphStyle(
        name="ApiSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=10.5,
        leading=15,
        textColor=BLUE,
        spaceAfter=14,
    )
)
styles.add(
    ParagraphStyle(
        name="ApiH1",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=14,
        leading=17,
        textColor=BLUE,
        spaceBefore=10,
        spaceAfter=6,
        keepWithNext=True,
    )
)
styles.add(
    ParagraphStyle(
        name="ApiBody",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=8.7,
        leading=12,
        textColor=INK,
    )
)
styles.add(
    ParagraphStyle(
        name="ApiCell",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=7.6,
        leading=9.6,
        textColor=INK,
    )
)
styles.add(
    ParagraphStyle(
        name="ApiHeader",
        parent=styles["BodyText"],
        fontName="Helvetica-Bold",
        fontSize=7.2,
        leading=8,
        textColor=colors.white,
    )
)
styles.add(
    ParagraphStyle(
        name="ApiCode",
        parent=styles["BodyText"],
        fontName="Courier",
        fontSize=6.9,
        leading=8.4,
        textColor=NAVY,
    )
)
styles.add(
    ParagraphStyle(
        name="ApiNote",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=12,
        textColor=INK,
    )
)


def p(text, style="ApiCell"):
    return Paragraph(text, styles[style])


def endpoint_table(rows):
    data = [
        [
            p("METHOD", "ApiHeader"),
            p("ENDPOINT", "ApiHeader"),
            p("PURPOSE", "ApiHeader"),
            p("PERMISSION", "ApiHeader"),
        ]
    ]
    for method, endpoint, purpose, permission in rows:
        data.append(
            [
                p(f"<b>{method}</b>"),
                p(endpoint, "ApiCode"),
                p(purpose),
                p(permission, "ApiCode"),
            ]
        )

    table = Table(
        data,
        colWidths=[0.66 * inch, 2.14 * inch, 3.34 * inch, 1.20 * inch],
        repeatRows=1,
        hAlign="LEFT",
    )
    commands = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.45, colors.HexColor("#AEB8C6")),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    for row_index in range(1, len(data)):
        if row_index % 2 == 0:
            commands.append(("BACKGROUND", (0, row_index), (-1, row_index), LIGHT_GRAY))
        method = rows[row_index - 1][0]
        method_color = {
            "GET": colors.HexColor("#E8F3FF"),
            "POST": colors.HexColor("#E7F8F1"),
            "PATCH": colors.HexColor("#FFF5D9"),
            "DELETE": colors.HexColor("#FDEBEC"),
        }.get(method, colors.white)
        commands.append(("BACKGROUND", (0, row_index), (0, row_index), method_color))
    table.setStyle(TableStyle(commands))
    return table


def section(title, rows):
    return [Paragraph(title, styles["ApiH1"]), endpoint_table(rows), Spacer(1, 5)]


story = []
story.append(Paragraph("LETSON ERP + CASHIER APP", ParagraphStyle(
    "Kicker", fontName="Helvetica-Bold", fontSize=8.5, leading=10,
    textColor=GOLD, spaceAfter=7
)))
story.append(Paragraph("Mobile API Reference", styles["ApiTitle"]))
story.append(
    Paragraph(
        "Current backend routes used by the Flutter outlet cashier workflow: authentication, shifts, menu setup, inventory, transfers, sales, deductions, repacking, stock receiving, and expenses.",
        styles["ApiSubtitle"],
    )
)

summary_data = [
    [p("BASE URL"), p("https://isayfriedchicken.com/api/mobile", "ApiCode")],
    [p("AUTH HEADER"), p("Authorization: Bearer &lt;mobile-token&gt;", "ApiCode")],
    [p("TOKEN LIFE"), p("30 days; current user, role, permissions, and outlet are reloaded on protected requests")],
    [p("CURRENT SCOPE"), p("18 route URLs providing 24 HTTP operations")],
]
summary = Table(summary_data, colWidths=[1.25 * inch, 6.09 * inch], hAlign="LEFT")
summary.setStyle(
    TableStyle(
        [
            ("BACKGROUND", (0, 0), (0, -1), LIGHT_BLUE),
            ("BACKGROUND", (1, 0), (1, -1), colors.white),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#AEB8C6")),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 7),
            ("RIGHTPADDING", (0, 0), (-1, -1), 7),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]
    )
)
story.append(summary)
story.append(Spacer(1, 8))

note = Table(
    [[p("<b>Authentication:</b> Only the login endpoint is public. Every other route requires a valid mobile Bearer token. ADMIN bypasses permission checks; other accounts need at least one listed permission.", "ApiNote")]],
    colWidths=[7.34 * inch],
)
note.setStyle(
    TableStyle(
        [
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FFF8E8")),
            ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#D6B45C")),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ]
    )
)
story.append(note)

story.extend(
    section(
        "1. Authentication",
        [
            ("POST", "/auth/login", "Authenticate a user with username and password; return the mobile token, current user, permissions, and outlet.", "Public"),
            ("GET", "/auth/me", "Reload the authenticated user's current identity, role, permissions, and assigned outlet.", "Authenticated"),
            ("POST", "/auth/refresh", "Issue a new mobile token after validating the existing token and current account state.", "Authenticated"),
        ],
    )
)

story.extend(
    section(
        "2. Cash Shifts",
        [
            ("GET", "/cash/current", "Load the cashier's currently open shift, totals, and outlet context.", "cash.manage OR sales.view"),
            ("POST", "/cash/open", "Open a cashier shift with an opening float and optional remarks.", "cash.manage"),
            ("POST", "/cash/close", "Close the current shift using counted cash; calculate expected cash and variance.", "cash.manage"),
        ],
    )
)

story.extend(
    section(
        "3. Menu Setup",
        [
            ("GET", "/products", "Load the outlet's active menu items, categories, prices, images, availability, and mapped inventory components.", "sales.view OR sales.manage"),
            ("POST", "/products", "Create an outlet menu item; supports JSON or multipart image upload.", "sales.manage"),
            ("PATCH", "/products/{id}", "Update menu name, category, price, availability, and image.", "sales.manage"),
        ],
    )
)

story.extend(
    section(
        "4. Outlet Inventory and Adjustments",
        [
            ("GET", "/inventory", "Load current outlet inventory with source, unit, pack size, prices, and stock quantity.", "outlet-inventory.view OR sales.view"),
            ("GET", "/inventory/{id}/movements", "Load the latest 100 stock movements for one outlet inventory record.", "outlet-inventory.view OR sales.view"),
            ("GET", "/stock-in", "Load recent manual stock receiving records. Optional query: limit=1..200.", "outlet-inventory.view OR outlet-inventory.manage"),
            ("POST", "/stock-in", "Receive manual stock into an existing or new outlet inventory item; supports idempotency.", "outlet-inventory.manage"),
            ("GET", "/deductions", "Load manual outlet stock reduction history.", "outlet-inventory.view OR outlet-inventory.manage"),
            ("POST", "/deductions", "Deduct one or more outlet products with a valid inventory adjustment reason.", "outlet-inventory.manage"),
            ("GET", "/repack", "Load recent outlet repacking transactions. Optional query: limit=1..200.", "outlet-inventory.view OR outlet-inventory.manage"),
            ("POST", "/repack", "Convert a source inventory quantity into one or more target products atomically; supports idempotency.", "outlet-inventory.manage"),
        ],
    )
)

story.extend(
    section(
        "5. Stock Transfers",
        [
            ("GET", "/transfers", "Load stock transfers assigned to the authenticated outlet.", "stock-transfers.confirm OR stock-transfers.view"),
            ("GET", "/transfers?status=incoming", "Load transfers awaiting outlet receipt or confirmation.", "stock-transfers.confirm OR stock-transfers.view"),
            ("GET", "/transfers/{id}", "Load one transfer and its dispatched products, quantities, unit labels, and pack sizes.", "stock-transfers.confirm OR stock-transfers.view"),
            ("POST", "/transfers/{id}", "Confirm received quantities, record variances, and add accepted stock to outlet inventory.", "stock-transfers.confirm"),
        ],
    )
)

pack_note = Table(
    [[p("<b>Pack handling:</b> Transfer items preserve the entered unit. For C10 with packSize 50, receivedQty 10 packs becomes receivedPcs 500. Outlet inventory remains stored in the base stock quantity while the UI displays packs and loose PCS.", "ApiNote")]],
    colWidths=[7.34 * inch],
)
pack_note.setStyle(
    TableStyle(
        [
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#EAF8F2")),
            ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#7CB89E")),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ]
    )
)
story.append(pack_note)
story.append(Spacer(1, 4))

story.extend(
    section(
        "6. Mobile POS Sales",
        [
            ("GET", "/sales", "Load sales for the authenticated outlet. Optional query: limit=1..100; default 30.", "sales.view OR sales.manage"),
            ("POST", "/sales", "Record a cash sale, update the open shift, deduct mapped inventory components, and prevent duplicates with an idempotency key.", "sales.manage"),
            ("DELETE", "/sales/{id}", "Void a sale from the cashier's currently open shift and restore its inventory movements.", "sales.manage"),
        ],
    )
)

story.extend(
    section(
        "7. Outlet Expenses",
        [
            ("GET", "/expenses", "Load outlet expense history and total amount.", "expenses.view OR expenses.manage"),
            ("POST", "/expenses", "Record an operating expense against the authenticated outlet and currently open cash shift.", "expenses.manage"),
        ],
    )
)

story.append(Paragraph("8. Operational Notes", styles["ApiH1"]))
notes = [
    "Protected routes reject missing or invalid tokens with HTTP 401.",
    "Valid users without the required permission receive HTTP 403.",
    "Inactive or unassigned outlets cannot perform outlet-specific operations.",
    "Sales, stock-in, and repack operations use transaction and/or idempotency safeguards to reduce duplicate business records.",
    "Mobile sales require an open cash shift and deduct the menu item's mapped outlet inventory components.",
    "Voiding is limited to sales in the cashier's current open shift; the operation restores stock and shift totals atomically.",
    "The web NextAuth cookie session is separate from the mobile Bearer-token session.",
]
for item in notes:
    story.append(Paragraph(f"- {item}", ParagraphStyle(
        "ApiBullet", parent=styles["ApiBody"], leftIndent=12, firstLineIndent=-7,
        spaceAfter=3
    )))

story.append(Spacer(1, 8))
story.append(
    Paragraph(
        "Backend source: app/api/mobile. Authentication implementation: lib/mobile-auth.ts.",
        ParagraphStyle(
            "Source", parent=styles["ApiBody"], fontSize=8, textColor=MUTED,
            spaceBefore=4
        ),
    )
)

OUT.parent.mkdir(parents=True, exist_ok=True)
doc = ApiReferenceDoc(str(OUT))
doc.build(story)
print(OUT)
