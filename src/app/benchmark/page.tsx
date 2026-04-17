import { redirect } from 'next/navigation';

/** Legacy URL: benchmarks now live on `/` below the puzzle explorer. */
export default function LegacyBenchmarkPage() {
  redirect('/#benchmarks');
}
