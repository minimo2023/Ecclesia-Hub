#!/bin/bash
psql -U postgres -d bible_quiz -c "SELECT book, COUNT(*) as n FROM questions GROUP BY book ORDER BY n DESC;"
