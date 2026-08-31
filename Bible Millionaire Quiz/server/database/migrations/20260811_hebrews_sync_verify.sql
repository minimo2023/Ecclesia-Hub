\pset tuples_only on
\pset format unaligned

SELECT version || ':' || COUNT(*) || ':chapters=' || COUNT(DISTINCT chapter)
       || ':blank=' || COUNT(*) FILTER (WHERE BTRIM(COALESCE(text, '')) = '')
FROM bible_verses
WHERE book = 'Hebrews'
GROUP BY version
ORDER BY version;

SELECT 'total:' || version || ':' || COUNT(*)
FROM bible_verses
WHERE version IN ('CUV_TRAD', 'CNV_TRAD', 'TCV2010_TRAD')
GROUP BY version
ORDER BY version;

SELECT 'duplicates=' || COUNT(*)
FROM (
    SELECT version, chapter, verse
    FROM bible_verses
    WHERE book = 'Hebrews'
    GROUP BY version, chapter, verse
    HAVING COUNT(*) > 1
) AS duplicates;

SELECT 'missing_source_version=' || COUNT(*)
FROM bible_verses
WHERE book = 'Hebrews'
  AND version IN ('CUV_TRAD', 'CNV_TRAD', 'TCV2010_TRAD')
  AND BTRIM(COALESCE(metadata ->> 'source_version', '')) = '';

SELECT 'sync_runs=' || COUNT(*)
FROM bible_source_sync_runs
WHERE book = 'Hebrews' AND status = 'COMPLETED';
