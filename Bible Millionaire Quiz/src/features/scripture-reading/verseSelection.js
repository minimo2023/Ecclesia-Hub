function validVerse(value) {
  const verse = Number(value);
  return Number.isInteger(verse) && verse > 0 ? verse : null;
}

export function normalizeVerseSelection(values = []) {
  return [...new Set(values.map(validVerse).filter(Boolean))].sort((a, b) => a - b);
}

export function toggleVerseSelection(values, verseNumber) {
  const verse = validVerse(verseNumber);
  if (!verse) return normalizeVerseSelection(values);
  const next = new Set(normalizeVerseSelection(values));
  if (next.has(verse)) next.delete(verse);
  else next.add(verse);
  return [...next].sort((a, b) => a - b);
}

export function toggleVerseGroupSelection(values, verseNumbers = []) {
  const group = normalizeVerseSelection(verseNumbers);
  if (!group.length) return normalizeVerseSelection(values);
  const next = new Set(normalizeVerseSelection(values));
  const removeGroup = group.every(verse => next.has(verse));
  group.forEach(verse => {
    if (removeGroup) next.delete(verse);
    else next.add(verse);
  });
  return [...next].sort((a, b) => a - b);
}

export function applyVerseRange(values, anchorNumber, currentNumber, mode = 'add') {
  const anchor = validVerse(anchorNumber);
  const current = validVerse(currentNumber);
  if (!anchor || !current) return normalizeVerseSelection(values);
  const next = new Set(normalizeVerseSelection(values));
  const start = Math.min(anchor, current);
  const end = Math.max(anchor, current);
  for (let verse = start; verse <= end; verse += 1) {
    if (mode === 'remove') next.delete(verse);
    else next.add(verse);
  }
  return [...next].sort((a, b) => a - b);
}

export function summarizeVerseSelection(values) {
  const verses = normalizeVerseSelection(values);
  if (!verses.length) return null;
  const start = verses[0];
  const end = verses.at(-1);
  return {
    start,
    end,
    count: verses.length,
    verses,
    isContiguous: verses.length === end - start + 1
  };
}
