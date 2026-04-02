import { redirect } from 'next/navigation';

/** Legacy URL: same UI lives on `/` with client tabs. */
export default function LegacyBenchmarkPage() {
  redirect('/?tab=benchmark');
}
