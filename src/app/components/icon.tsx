import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const size = { width: 64, height: 64 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'white',
          borderRadius: 16,
          border: '2px solid #e2e8f0',
          fontSize: 28,
          fontWeight: 700,
          color: '#0f172a',
          letterSpacing: '-0.06em',
        }}
      >
        CB
      </div>
    ),
    { ...size }
  );
}
