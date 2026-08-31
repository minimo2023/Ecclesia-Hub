-- Migration: Add extended options for Progressive Difficulty (Phase 1.2)
-- Author: Antigravity
-- Date: 2025-12-24

-- Add option_E
ALTER TABLE questions ADD COLUMN option_E TEXT;

-- Add option_F
ALTER TABLE questions ADD COLUMN option_F TEXT;
