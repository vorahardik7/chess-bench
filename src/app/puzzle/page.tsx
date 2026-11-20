import { redirect } from 'next/navigation';

/** Legacy URL: puzzle browser opens on `/` via the Puzzle Browser tab. */
export default function LegacyPuzzlePage() {
  redirect('/?tab=puzzles');
}
