'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { Chessground } from '@lichess-org/chessground';
import { Config } from '@lichess-org/chessground/config';
import { DrawShape } from '@lichess-org/chessground/draw';

interface ChessBoardProps {
  fen: string;
  startFen?: string;
  orientation?: 'white' | 'black';
  shapes?: DrawShape[];
  lastMove?: Config['lastMove'];
  replayKey?: string;
  viewOnly?: boolean;
  className?: string;
}

const INTRO_MOVE_HOLD_MS = 250;

export default function ChessBoard({
  fen,
  startFen,
  orientation = 'white',
  shapes = [],
  lastMove,
  replayKey,
  viewOnly = true,
  className = '',
}: ChessBoardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const apiRef = useRef<ReturnType<typeof Chessground> | null>(null);
  const replayFrameRef = useRef<number | null>(null);
  const replayTimeoutRef = useRef<number | null>(null);
  const mountedRef = useRef(false);
  const lastReplayKeyRef = useRef<string | null>(null);

  const clearReplayTimers = () => {
    if (replayFrameRef.current != null) {
      window.cancelAnimationFrame(replayFrameRef.current);
      replayFrameRef.current = null;
    }
    if (replayTimeoutRef.current != null) {
      window.clearTimeout(replayTimeoutRef.current);
      replayTimeoutRef.current = null;
    }
  };

  // We use a ref so the mount effect can apply the latest props without a stale closure
  const latestPropsRef = useRef({ fen, orientation, viewOnly, shapes, lastMove });
  latestPropsRef.current = { fen, orientation, viewOnly, shapes, lastMove };

  const applyFinalState = () => {
    const p = latestPropsRef.current;
    apiRef.current?.set({
      fen: p.fen,
      orientation: p.orientation,
      viewOnly: p.viewOnly,
      animation: { enabled: true, duration: 300 },
      drawable: { shapes: p.shapes, autoShapes: [] },
      lastMove: p.lastMove,
    });
  };

  const initialConfigRef = useRef<{
    fen: string;
    orientation: 'white' | 'black';
    shapes: DrawShape[];
    lastMove?: Config['lastMove'];
    viewOnly: boolean;
  }>({
    fen: startFen && startFen !== fen ? startFen : fen,
    orientation,
    shapes: startFen && startFen !== fen ? [] : shapes,
    lastMove: startFen && startFen !== fen ? undefined : lastMove,
    viewOnly,
  });

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
        duration: 300,
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

    apiRef.current = chessgroundApi;
    mountedRef.current = true;
    
    // We update lastReplayKeyRef so the initial playback doesn't trigger again on the first update if props haven't changed
    lastReplayKeyRef.current = replayKey ?? null;

    if (startFen && startFen !== fen) {
      // Trigger initial playback
      replayFrameRef.current = window.requestAnimationFrame(() => {
        replayTimeoutRef.current = window.setTimeout(() => {
          replayTimeoutRef.current = null;
          replayFrameRef.current = null;
          applyFinalState();
        }, INTRO_MOVE_HOLD_MS);
      });
    }

    return () => {
      clearReplayTimers();
      apiRef.current = null;
      chessgroundApi.destroy();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  useLayoutEffect(() => {
    if (!mountedRef.current || !apiRef.current) return;

    const hasReplayKey = typeof replayKey === 'string' && replayKey.length > 0;
    const shouldReplay = hasReplayKey ? replayKey !== lastReplayKeyRef.current : false;
    const replayFen = shouldReplay && startFen && startFen !== fen ? startFen : null;

    lastReplayKeyRef.current = replayKey ?? null;

    // Only skip application if we are scheduling a replay right now, 
    // OR if replayFen is truthy.
    if (replayFen) {
      clearReplayTimers();
      
      // Instantly jump to the start state without animation (prevents pieces from flying across the board from preceding puzzle)
      apiRef.current.set({
        fen: replayFen,
        orientation,
        viewOnly,
        animation: { enabled: false }, // Critical fix for glitching
        drawable: { shapes: [], autoShapes: [] },
        lastMove: undefined,
      });

      // Schedule the real move with animation enabled
      replayFrameRef.current = window.requestAnimationFrame(() => {
        replayTimeoutRef.current = window.setTimeout(() => {
          replayTimeoutRef.current = null;
          replayFrameRef.current = null;
          applyFinalState();
        }, INTRO_MOVE_HOLD_MS);
      });
      return;
    }

    // Normal fast updates (e.g., changing model or filter)
    // Only if we aren't already waiting for a replay timer to finish
    if (!replayTimeoutRef.current) {
      applyFinalState();
    }
  }, [fen, startFen, orientation, shapes, lastMove, replayKey, viewOnly]);

  return (
    <div className={`relative w-full aspect-square ${className}`}>
      <div ref={ref} className="w-full h-full cg-wrap-brown" />
    </div>
  );
}
