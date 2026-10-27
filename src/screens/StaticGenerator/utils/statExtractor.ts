export interface ExtractedStat {
  stat: string;
  label: string;
  isExtracted: boolean;
}

/**
 * Extracts numeric metrics (e.g. '80%', '4.2x', '10M+', '$100K', '+140%') from headline or text
 * to render massive display typography for 'stat' slide layouts.
 */
export function extractStatData(
  headline: string,
  supportingText: string,
  manualStat?: string,
  manualLabel?: string
): ExtractedStat {
  if (manualStat && manualStat.trim()) {
    return {
      stat: manualStat.trim(),
      label: manualLabel?.trim() || headline.replace(/\[([^\]]+)\]/g, '$1').trim(),
      isExtracted: false,
    };
  }

  if (!headline) {
    return {
      stat: '80%',
      label: supportingText || 'Key metric insight',
      isExtracted: false,
    };
  }

  // 1. Check if bracketed text contains a number (e.g. "[80% of their time]" or "[10x]")
  const bracketMatch = headline.match(/\[([^\]]*?\d+[^\]]*?)\]/);
  if (bracketMatch) {
    const inside = bracketMatch[1].trim();
    const numSubMatch = inside.match(/([+-]?[$€£]?\d+(?:\.\d+)?(?:%|[xX]|[kK]|[mM]|[bB]|\+)?)/);
    if (numSubMatch) {
      const stat = numSubMatch[1];
      const remainingInside = inside.replace(stat, '').trim();
      const cleanedHeadline = headline
        .replace(bracketMatch[0], remainingInside)
        .replace(/\s+/g, ' ')
        .replace(/^[\s,.-]+|[\s,.-]+$/g, '')
        .trim();
      return {
        stat,
        label: cleanedHeadline || supportingText,
        isExtracted: true,
      };
    }
    return {
      stat: inside,
      label: headline.replace(bracketMatch[0], '').replace(/\s+/g, ' ').trim() || supportingText,
      isExtracted: true,
    };
  }

  // 2. Look for metric patterns in the headline:
  // e.g. +140%, 80%, $500K, 4.2x, 10M+, 3.5X, 9/10
  const metricRegex = /([+-]?[$€£]?\d+(?:\.\d+)?(?:%|[xX]|[kK]|[mM]|[bB]|\+)?(?:\/\d+)?)/;
  const match = headline.match(metricRegex);

  if (match) {
    const stat = match[1];
    const cleanedLabel = headline
      .replace(/\[([^\]]+)\]/g, '$1')
      .replace(stat, '')
      .replace(/\s+/g, ' ')
      .replace(/^[\s,.-]+|[\s,.-]+$/g, '')
      .trim();

    return {
      stat,
      label: cleanedLabel || supportingText,
      isExtracted: true,
    };
  }

  // 3. Fallback default metric
  return {
    stat: '80%',
    label: headline.replace(/\[([^\]]+)\]/g, '$1').trim() || supportingText,
    isExtracted: false,
  };
}
