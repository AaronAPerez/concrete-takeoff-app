// Not yet implemented: blueprint pages are currently rendered whole (at 2x)
// directly in the browser (see canvas/pdfRenderer.ts). A tiling endpoint would
// live here if very large sheets ever need progressive/tiled loading.
export async function GET() {
  return new Response(null, { status: 501 });
}
