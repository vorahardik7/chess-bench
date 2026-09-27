import { getModelAttempts } from '@/app/lib/results';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ modelId: string }> }
) {
  const { modelId } = await params;
  const attempts = await getModelAttempts(decodeURIComponent(modelId));
  if (!attempts) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }
  return Response.json({ attempts });
}
