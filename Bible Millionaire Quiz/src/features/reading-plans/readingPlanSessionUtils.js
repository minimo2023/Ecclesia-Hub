export function normalizeReadingPlanVerses(rows = []) {
  return rows.map(row => ({
    verse: Number(row.verseStart ?? row.verse),
    verseStart: Number(row.verseStart ?? row.verse),
    verseEnd: Number(row.verseEnd ?? row.verse),
    verseLabel: String(row.verseLabel ?? row.verse),
    coveredVerses: Array.isArray(row.coveredVerses)
      ? row.coveredVerses.map(Number)
      : [Number(row.verseStart ?? row.verse)],
    isMergedVerse: Boolean(row.isMergedVerse),
    text: row.text,
    lineBreakAfter: Boolean(row.lineBreakAfter),
    paragraphBreakAfter: Boolean(row.paragraphBreakAfter)
  }));
}

export function readingSecondsForVerses(verses = []) {
  return Math.ceil(verses.reduce((total, verse) => (
    total + Math.max(
      1,
      Number(verse.verseEnd ?? verse.verse) - Number(verse.verseStart ?? verse.verse) + 1
    )
  ), 0));
}
