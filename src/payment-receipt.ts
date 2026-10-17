import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { StudioPayment, StudioProject } from "./studio-model";
import { validAmount, validDate } from "./money";

type ReceiptFonts = { regular: Uint8Array; bold: Uint8Array };
const clean = (s: string) =>
  s
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[\u2010-\u2015]/g, "-");
export function receiptFilename(payment: StudioPayment) {
  const safe = (s: string) =>
    s
      .normalize("NFKC")
      .replace(/[^\p{L}\p{N}._-]+/gu, "-")
      .slice(0, 100);
  return `Interior-Que-Receipt-${safe(payment.date)}-${safe(payment.id)}.pdf`;
}
let fontsPromise: Promise<ReceiptFonts> | undefined;
async function receiptFonts() {
  if (!fontsPromise)
    fontsPromise = Promise.all(
      ["500", "700"].map(async (weight) => {
        const response = await fetch(
          `${import.meta.env.BASE_URL}fonts/plus-jakarta-sans-${weight}.ttf`,
        );
        if (!response.ok)
          throw new Error(
            "The receipt font could not be loaded. Reconnect and retry the download.",
          );
        return new Uint8Array(await response.arrayBuffer());
      }),
    )
      .then(([regular, bold]) => ({ regular, bold }))
      .catch((error) => {
        fontsPromise = undefined;
        throw error;
      });
  return fontsPromise;
}

export async function createPaymentReceipt(
  studio: string,
  project: StudioProject,
  payment: StudioPayment,
  category = "",
  fonts?: ReceiptFonts,
) {
  if (payment.type !== "Received" || payment.projectId !== project.id)
    throw new Error(
      "Choose a received payment from this project to download its receipt.",
    );
  validAmount(String(payment.amount));
  validDate(payment.date);
  const bytes = fonts || (await receiptFonts()),
    doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(bytes.regular, { subset: true }),
    bold = await doc.embedFont(bytes.bold, { subset: true });
  const supported = new Set(regular.getCharacterSet());
  // Never silently print missing glyphs in a name, reference or financial amount.
  const texts = [
    studio,
    project.name,
    project.clientName,
    project.location,
    payment.description,
    payment.id,
    category,
    payment.mode || "",
  ];
  if (
    texts.some((text) =>
      Array.from(clean(text)).some(
        (char) => char.trim() && !supported.has(char.codePointAt(0)!),
      ),
    )
  )
    throw new Error(
      "Some receipt text uses characters this PDF font cannot display. Please contact support so the receipt can be exported without missing text.",
    );
  doc.setTitle(`Payment receipt - ${payment.id}`);
  doc.setAuthor(clean(studio));
  doc.setCreator("Interior Que");
  const width = 595.28,
    height = 841.89,
    margin = 46,
    content = width - margin * 2;
  const ink = rgb(0.106, 0.114, 0.165),
    muted = rgb(0.357, 0.376, 0.439),
    accent = rgb(0.31, 0.275, 0.898);
  let page: PDFPage, y: number;
  const newPage = (continued = false) => {
    page = doc.addPage([width, height]);
    y = height - margin;
    page.drawRectangle({
      x: 0,
      y: height - 8,
      width,
      height: 8,
      color: accent,
    });
    if (continued) {
      page.drawText("PAYMENT RECEIPT - CONTINUED", {
        x: margin,
        y: y - 12,
        size: 11,
        font: bold,
        color: accent,
      });
      y -= 36;
    }
  };
  const ensure = (space: number) => {
    if (y - space < 70) newPage(true);
  };
  const wrap = (
    text: string,
    font: PDFFont,
    size: number,
    maxWidth = content,
  ) => {
    const lines: string[] = [];
    for (const paragraph of clean(text).split(/\r?\n/)) {
      let line = "";
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        if (
          font.widthOfTextAtSize((line ? line + " " : "") + word, size) <=
          maxWidth
        ) {
          line += (line ? " " : "") + word;
          continue;
        }
        if (line) {
          lines.push(line);
          line = "";
        }
        for (const character of word) {
          if (
            line &&
            font.widthOfTextAtSize(line + character, size) > maxWidth
          ) {
            lines.push(line);
            line = "";
          }
          line += character;
        }
      }
      lines.push(line);
    }
    return lines;
  };
  const write = (
    text: string,
    size = 11,
    font = regular,
    color = ink,
    gap = 4,
  ) => {
    const leading = size * 1.55;
    for (const line of wrap(text, font, size)) {
      ensure(leading);
      y -= leading;
      page.drawText(line, { x: margin, y, size, font, color });
    }
    y -= gap;
  };
  const field = (label: string, value: string) => {
    ensure(48);
    write(label.toUpperCase(), 8.5, bold, muted, 1);
    write(value || "Not recorded", 11, regular, ink, 11);
  };
  newPage();
  write(studio || "Interior Que", 21, bold, ink, 0);
  write("PAYMENT RECEIPT", 11, bold, accent, 16);
  write("A record of your payment", 10, regular, muted, 12);

  ensure(110);
  page!.drawRectangle({
    x: margin,
    y: y! - 100,
    width: content,
    height: 100,
    color: rgb(0.944, 0.945, 0.995),
  });
  page!.drawText("AMOUNT RECEIVED", {
    x: margin + 20,
    y: y! - 25,
    size: 9,
    font: bold,
    color: accent,
  });
  const amount = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(payment.amount);
  let amountSize = 31;
  while (bold.widthOfTextAtSize(amount, amountSize) > content - 40)
    amountSize--;
  page!.drawText(amount, {
    x: margin + 20,
    y: y! - 68,
    size: amountSize,
    font: bold,
    color: accent,
  });
  y! -= 125;
  const date = new Date(`${payment.date}T12:00:00Z`).toLocaleDateString(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    },
  );
  field("Payment date", date);
  field("Payment method", payment.mode || "Not recorded");
  field("Project client", project.clientName || "Not recorded");
  field("Project", project.name);
  if (project.location) field("Location", project.location);
  if (category) field("Category", category);
  field("Payment details", payment.description);
  field("Transaction reference", payment.id);
  ensure(50);
  write("Thank you for your payment.", 11, bold, ink, 5);
  write(
    "This receipt reflects the saved transaction in Interior Que.",
    9,
    regular,
    muted,
  );
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawLine({
      start: { x: margin, y: 49 },
      end: { x: width - margin, y: 49 },
      color: rgb(0.89, 0.9, 0.94),
      thickness: 0.6,
    });
    p.drawText("Generated with Interior Que", {
      x: margin,
      y: 32,
      size: 8,
      font: regular,
      color: muted,
    });
    const text = `${i + 1} / ${pages.length}`;
    p.drawText(text, {
      x: width - margin - regular.widthOfTextAtSize(text, 8),
      y: 32,
      size: 8,
      font: regular,
      color: muted,
    });
  });
  return doc.save();
}

export async function downloadPaymentReceipt(
  studio: string,
  project: StudioProject,
  payment: StudioPayment,
  category?: string,
) {
  const bytes = await createPaymentReceipt(studio, project, payment, category);
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(bytes).buffer], { type: "application/pdf" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = receiptFilename(payment);
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Let the browser finish reading the blob, including on mobile Safari.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
