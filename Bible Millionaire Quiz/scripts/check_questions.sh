#!/bin/bash
psql -U postgres -c "SELECT COUNT(*) FROM questions;"
