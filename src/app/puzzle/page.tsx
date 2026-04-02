import { redirect } from 'next/navigation';

/** Legacy URL: same UI lives on `/` with client tabs (puzzle is default). */
export default function LegacyPuzzlePage() {
  redirect('/');
}
