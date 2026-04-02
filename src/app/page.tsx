import ExplorerPage from './components/ExplorerPage';

type HomeSearchParams = { tab?: string | string[]; view?: string | string[] };

function firstString(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<HomeSearchParams>;
}) {
  const sp = await searchParams;
  const raw = (firstString(sp.tab) ?? firstString(sp.view) ?? 'puzzle').toLowerCase();
  const defaultView = raw === 'benchmark' ? 'benchmark' : 'puzzle';

  return <ExplorerPage defaultView={defaultView} />;
}
