'use client';

import { useEffect, useRef, useState } from 'react';
import { Chessground } from '@lichess-org/chessground';
import { Config } from '@lichess-org/chessground/config';
import { DrawShape } from '@lichess-org/chessground/draw';

interface ChessBoardProps {
  fen: string;
  orientation?: 'white' | 'black';
  shapes?: DrawShape[];
  lastMove?: Config['lastMove'];
  viewOnly?: boolean;
  className?: string;
}

export default function ChessBoard({
  fen,
  orientation = 'white',
  shapes = [],
  lastMove,
  viewOnly = true,
  className = '',
}: ChessBoardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [api, setApi] = useState<ReturnType<typeof Chessground> | null>(null);
  const initialConfigRef = useRef<{
    fen: string;
    orientation: 'white' | 'black';
    shapes: DrawShape[];
    lastMove?: Config['lastMove'];
    viewOnly: boolean;
  }>({ fen, orientation, shapes, lastMove, viewOnly });

  useEffect(() => {
    if (!ref.current) return;

    const initial = initialConfigRef.current;
    const chessgroundApi = Chessground(ref.current, {
      fen: initial.fen,
      orientation: initial.orientation,
      viewOnly: initial.viewOnly,
      coordinates: false, // Cleaner look for a benchmark
      drawable: {
        shapes: initial.shapes,
        autoShapes: [],
      },
      lastMove: initial.lastMove,
      animation: {
        enabled: true,
        duration: 200,
      },
      // Disable interaction for benchmark viewer
      movable: {
        free: false,
        color: undefined,
        dests: new Map(),
      },
      premovable: {
        enabled: false,
      },
      selectable: {
        enabled: false,
      },
      highlight: {
        lastMove: true,
        check: true,
      },
    });

    setApi(chessgroundApi);

    return () => {
      chessgroundApi.destroy();
    };
  }, []); // Run once on mount

  // Update board when props change
  useEffect(() => {
    initialConfigRef.current = { fen, orientation, shapes, lastMove, viewOnly };
    if (api) {
      api.set({
        fen,
        orientation,
        viewOnly,
        drawable: { shapes, autoShapes: [] },
        lastMove,
      });
    }
  }, [fen, orientation, shapes, lastMove, viewOnly, api]);

  return (
    <div className={`relative w-full aspect-square ${className}`}>
      <div ref={ref} className="w-full h-full cg-wrap-brown" />
    </div>
  );
}
