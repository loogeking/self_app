export type PdfSection = { title: string; depth: number; page?: number };

export type PdfExtract = {
  title: string;
  pageCount: number;
  sections: PdfSection[];
  tocText: string;
  outlineText: string;
  textChars: number;
  hasTextLayer: boolean;
};

type OutlineItem = {
  title?: string;
  dest?: string | unknown[] | null;
  items?: OutlineItem[];
};

const clean = (value: unknown) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

export async function extractPdf(blob: Blob): Promise<PdfExtract> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const data = new Uint8Array(await blob.arrayBuffer());
  const task = pdfjs.getDocument({ data, isEvalSupported: false });
  const pdf = await task.promise;

  try {
    const meta = await pdf.getMetadata().catch(() => null);
    const info = (meta?.info ?? {}) as { Title?: string };
    const title = clean(info.Title) || "PDF";

    const pageToNumber = async (dest: string | unknown[] | null | undefined) => {
      try {
        let value = dest;
        if (typeof value === "string") value = await pdf.getDestination(value);
        if (!Array.isArray(value) || !value.length) return undefined;
        const ref = value[0];
        if (ref && typeof ref === "object") {
          const index = await pdf.getPageIndex(ref as Parameters<typeof pdf.getPageIndex>[0]);
          return index + 1;
        }
        return typeof ref === "number" ? ref + 1 : undefined;
      } catch {
        return undefined;
      }
    };

    const sections: PdfSection[] = [];
    const walk = async (items: OutlineItem[] | null, depth: number) => {
      if (!items?.length || depth > 5 || sections.length >= 500) return;
      for (const item of items) {
        const name = clean(item.title);
        if (!name) continue;
        const page = await pageToNumber(item.dest);
        sections.push({ title: name.slice(0, 120), depth, page });
        if (item.items?.length) await walk(item.items, depth + 1);
      }
    };
    await walk((await pdf.getOutline().catch(() => null)) as OutlineItem[] | null, 0);

    const pageLimit = Math.min(pdf.numPages, 16);
    const pageTexts: string[] = [];
    for (let pageNo = 1; pageNo <= pageLimit; pageNo += 1) {
      const page = await pdf.getPage(pageNo);
      const content = await page.getTextContent();
      let text = "";
      for (const item of content.items) {
        const value = item as { str?: string; hasEOL?: boolean };
        if (typeof value.str === "string") text += value.str + (value.hasEOL ? "\n" : " ");
      }
      pageTexts.push(`--- 第 ${pageNo} 页 ---\n${text.trim()}`);
      if (pageTexts.join("\n").length > 60000) break;
    }

    const tocText = pageTexts.join("\n").slice(0, 60000);
    const outlineText = sections
      .map((section) => `${"  ".repeat(section.depth)}- ${section.title}${section.page ? ` (第 ${section.page} 页)` : ""}`)
      .join("\n");
    const textChars = tocText.replace(/\s/g, "").length;

    return {
      title,
      pageCount: pdf.numPages,
      sections,
      tocText,
      outlineText,
      textChars,
      hasTextLayer: textChars >= 80,
    };
  } finally {
    await pdf.destroy();
  }
}

export function formatSections(sections: PdfSection[]): string {
  return sections
    .map((section) => `${"  ".repeat(section.depth)}- ${section.title}${section.page ? ` (第 ${section.page} 页)` : ""}`)
    .join("\n");
}