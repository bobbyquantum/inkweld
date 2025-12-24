import React from 'react';
import { useColorMode } from '@docusaurus/theme-common';

interface ThemedImageProps {
  /** Base path without -light.png or -dark.png suffix */
  src: string;
  /** Alt text for accessibility */
  alt: string;
  /** Optional width */
  width?: number | string;
  /** Optional additional styles */
  style?: React.CSSProperties;
}

/**
 * An image component that automatically switches between light and dark variants
 * based on the current Docusaurus color mode.
 *
 * Expects images to follow the naming convention:
 * - Light mode: {src}-light.png
 * - Dark mode: {src}-dark.png
 *
 * @example
 * <ThemedImage
 *   src="/img/features/character-overview"
 *   alt="Character overview panel"
 * />
 */
export default function ThemedImage({
  src,
  alt,
  width,
  style,
}: ThemedImageProps): React.ReactElement {
  const { colorMode } = useColorMode();
  const suffix = colorMode === 'dark' ? '-dark.png' : '-light.png';
  const fullSrc = `${src}${suffix}`;

  return (
    <img src={fullSrc} alt={alt} width={width} style={style} loading="lazy" />
  );
}
