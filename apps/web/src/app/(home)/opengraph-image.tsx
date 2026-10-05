import { ImageResponse } from 'next/og';
import { generate as DefaultImage } from 'fumadocs-ui/og';

export const alt = 'Tally UI: open-source building blocks for point-of-sale apps';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    <DefaultImage
      title="Tally UI"
      description="Open-source building blocks for point-of-sale apps"
      site="Tally UI"
    />,
    size,
  );
}
