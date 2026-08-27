import mammoth from "mammoth";

export async function extractResumeText(
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  if (contentType === "application/pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text.replace(/\s+/g, " ").trim().slice(0, 100_000);
    } finally {
      await parser.destroy();
    }
  }

  const result = await mammoth.extractRawText({ buffer });
  return result.value.replace(/\s+/g, " ").trim().slice(0, 100_000);
}