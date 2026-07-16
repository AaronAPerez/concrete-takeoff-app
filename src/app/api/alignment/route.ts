// Not yet implemented: revision alignment is currently computed entirely
// client-side (see components/workspace/AlignmentWizard.tsx + utils/alignment.ts).
export async function POST() {
  return new Response(null, { status: 501 });
}
