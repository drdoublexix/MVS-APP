import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

export function useVisualViewport() {
  const [visualViewportHeight, setVisualViewportHeight] = useState<number | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }

    const updateHeight = () => {
      const nextHeight = window.visualViewport?.height ?? window.innerHeight;

      setVisualViewportHeight(nextHeight);
      document.documentElement.style.setProperty(
        '--visual-viewport-height',
        `${nextHeight}px`
      );
    };

    updateHeight();

    const viewport = window.visualViewport;

    viewport?.addEventListener('resize', updateHeight);
    viewport?.addEventListener('scroll', updateHeight);
    window.addEventListener('resize', updateHeight);

    return () => {
      viewport?.removeEventListener('resize', updateHeight);
      viewport?.removeEventListener('scroll', updateHeight);
      window.removeEventListener('resize', updateHeight);
    };
  }, []);

  return visualViewportHeight;
}
