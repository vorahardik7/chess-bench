import { getAttemptDetail } from '@/app/lib/results';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ modelId: string; puzzleId: string }> }
) {
  const { modelId, puzzleId } = await params;
  const detail = await getAttemptDetail(
    decodeURIComponent(modelId),
    decodeURIComponent(puzzleId)
  );
  if (!detail) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }
  return Response.json(detail);
}
