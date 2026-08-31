\pset tuples_only on
\pset format unaligned

SELECT COUNT(*) FROM questions;

SELECT MD5(STRING_AGG(row_hash, '' ORDER BY id))
FROM (
    SELECT
        id,
        MD5(CONCAT_WS('|',
            id,
            COALESCE(question, ''),
            COALESCE(answer, ''),
            COALESCE(options::TEXT, ''),
            COALESCE(correct_index::TEXT, ''),
            COALESCE(status, '')
        )) AS row_hash
    FROM questions
) AS question_fingerprints;

SELECT status || ':' || COUNT(*)
FROM questions
GROUP BY status
ORDER BY status;
