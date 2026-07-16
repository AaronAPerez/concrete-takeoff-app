// Not yet implemented: blueprint PDFs are currently rendered entirely
// client-side via pdfjs-dist (see canvas/pdfRenderer.ts). A server-side parse
// route would live here for future OCR/vector-text extraction into the checklist.
export async function POST() {
  return new Response(null, { status: 501 });
}
