import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { createPaymentReceipt, receiptFilename } from "./payment-receipt";
import type { StudioPayment, StudioProject } from "./studio-model";
const fonts = {
  regular: new Uint8Array(
    readFileSync("public/fonts/plus-jakarta-sans-500.ttf"),
  ),
  bold: new Uint8Array(readFileSync("public/fonts/plus-jakarta-sans-700.ttf")),
};
const project: StudioProject = {
  id: "p1",
  name: "001-IQ-3BHK",
  clientName: "Sample client",
  location: "Hyderabad",
  start: "2026-10-01",
  end: "2026-11-01",
  progress: 30,
  status: "In progress",
  brief: "",
  image: "",
};
const payment: StudioPayment = {
  id: "sample-40000-receipt",
  projectId: "p1",
  type: "Received",
  amount: 40000.25,
  date: "2026-10-14",
  mode: "Cash",
  description: "Advance received for interior work",
  categoryId: "inc-client",
};
describe("downloadable payment receipts", () => {
  it("creates a readable A4 PDF with embedded rupee-capable fonts", async () => {
    const bytes = await createPaymentReceipt(
      "Sample Interior Studio",
      project,
      payment,
      "Client payments",
      fonts,
    );
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getPage(0).getWidth()).toBeCloseTo(595.28);
    expect(pdf.getTitle()).toBe("Payment receipt - sample-40000-receipt");
    expect(pdf.getAuthor()).toBe("Sample Interior Studio");
  });
  it("wraps long names, descriptions and references without dropping pages", async () => {
    const bytes = await createPaymentReceipt(
      "A very long studio name ".repeat(5),
      {
        ...project,
        name: "LongProject".repeat(30),
        clientName: "Client ".repeat(20),
        location: "Address ".repeat(40),
      },
      {
        ...payment,
        description: "Detailed site work ".repeat(27),
        id: "reference".repeat(20),
        amount: 1000000000,
      },
      "Client payments",
      fonts,
    );
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });
  it("rejects expenses, mismatched projects, invalid dates and unsupported glyphs", async () => {
    await expect(
      createPaymentReceipt(
        "Studio",
        project,
        { ...payment, type: "Spent" },
        "",
        fonts,
      ),
    ).rejects.toThrow("received payment");
    await expect(
      createPaymentReceipt(
        "Studio",
        { ...project, id: "p2" },
        payment,
        "",
        fonts,
      ),
    ).rejects.toThrow();
    await expect(
      createPaymentReceipt(
        "Studio",
        project,
        { ...payment, date: "2026-02-30" },
        "",
        fonts,
      ),
    ).rejects.toThrow("valid date");
    await expect(
      createPaymentReceipt(
        "Studio",
        { ...project, clientName: "客户" },
        payment,
        "",
        fonts,
      ),
    ).rejects.toThrow("without missing text");
  });
  it("uses stable filenames and removes path separators", () => {
    expect(receiptFilename(payment)).toBe(
      "Interior-Que-Receipt-2026-10-14-sample-40000-receipt.pdf",
    );
    expect(
      receiptFilename({ ...payment, id: "../../sample\\receipt" }),
    ).not.toMatch(/[\\/]/);
  });
});
