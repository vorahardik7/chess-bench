import { redirect } from 'next/navigation';

/** Legacy URL: benchmarks open on `/` via the Leaderboard tab. */
export default function LegacyBenchmarkPage() {
  redirect('/?tab=benchmark');
}
