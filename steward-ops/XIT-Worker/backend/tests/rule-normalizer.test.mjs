import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRules } from '../scheduling/rule-normalizer.mjs';

const people = [
  { id: 'person-001', name: 'Test Worker A' },
  { id: 'person-002', name: '李小華' }
];

const roles = [
  { roleId: 'main-leader', name: '領會', section: 'main' },
  { roleId: 'main-piano', name: '司琴', section: 'main' }
];

describe('rule-normalizer', () => {
  it('resolves legacy names and role names into immutable IDs', () => {
    const rawRules = [{
      id: 'legacy-available',
      type: 'available',
      person: 'Test Worker A',
      role: '司琴',
      date: '2026-08-09',
      scope: 'main',
      status: 'confirmed',
      sourceType: 'manual_structured'
    }];

    const result = normalizeRules(rawRules, { people, roles });

    assert.equal(result.success, true);
    assert.equal(result.normalizedRules.length, 1);
    assert.equal(result.normalizedRules[0].personId, 'person-001');
    assert.equal(result.normalizedRules[0].roleId, 'main-piano');
    assert.equal(result.normalizedRules[0].ruleId, 'legacy-available');
    assert.equal(result.normalizedRules[0].hard, false);
  });

  it('routes every legacy fixed rule to review instead of activating it', () => {
    const result = normalizeRules([{
      type: 'fixed',
      person: 'Test Worker A',
      role: '領會',
      date: '2026-08-09',
      reason: '人員指定可排日期',
      scope: 'main'
    }], { people, roles });

    assert.equal(result.success, false);
    assert.equal(result.normalizedRules.length, 0);
    assert.equal(result.reviewRules.length, 1);
    assert.equal(result.reviewRules[0].type, 'fixed_assignment');
    assert.equal(result.reviewRules[0].status, 'needs_review');
    assert.ok(result.errors.some((error) => error.code === 'RULE_REVIEW_REQUIRED'));
  });

  it('keeps draft AI hard rules out of active scheduling rules', () => {
    const result = normalizeRules([{
      ruleId: 'rule-ai-001',
      type: 'unavailable',
      personId: 'person-001',
      date: '2026-08-09',
      scope: 'main',
      sourceType: 'ai_parsed_memo',
      status: 'draft_ai',
      schemaVersion: 1
    }], { people, roles });

    assert.equal(result.normalizedRules.length, 0);
    assert.equal(result.reviewRules.length, 1);
    assert.ok(result.errors.some((error) => error.code === 'RULE_CONFIRMATION_REQUIRED'));
  });

  it('normalizes legacy limit and exclusive_person shapes', () => {
    const result = normalizeRules([
      {
        id: 'limit-001',
        type: 'limit',
        person: 'Test Worker A',
        role: '司琴',
        dateRange: { start: '2026-08-01', end: '2026-08-31' },
        limit: 1,
        scope: 'main',
        status: 'confirmed',
        sourceType: 'manual_structured'
      },
      {
        id: 'exclusive-001',
        type: 'exclusive_person',
        person: 'Test Worker A',
        action: { person: '李小華' },
        scope: 'main',
        status: 'confirmed',
        sourceType: 'manual_structured'
      }
    ], { people, roles });

    assert.equal(result.success, true);
    const limit = result.normalizedRules.find((rule) => rule.type === 'limit');
    const exclusive = result.normalizedRules.find((rule) => rule.type === 'exclusive_person');
    assert.equal(limit.maxCount, 1);
    assert.deepEqual(limit.period, { start: '2026-08-01', end: '2026-08-31' });
    assert.deepEqual(exclusive.personIds, ['person-001', 'person-002']);
  });

  it('generates deterministic rule IDs and never mutates source objects', () => {
    const rawRule = {
      type: 'preferred',
      personId: 'person-001',
      roleId: 'main-piano',
      date: '2026-08-09',
      scope: 'main',
      status: 'confirmed',
      sourceType: 'manual_structured'
    };
    const before = structuredClone(rawRule);

    const first = normalizeRules([rawRule], { people, roles });
    const second = normalizeRules([rawRule], { people, roles });

    assert.deepEqual(rawRule, before);
    assert.equal(first.normalizedRules[0].ruleId, second.normalizedRules[0].ruleId);
  });

  it('rejects ambiguous display-name mappings and duplicate rule IDs', () => {
    const ambiguousPeople = [...people, { id: 'person-003', name: 'Test Worker A' }];
    const ambiguous = normalizeRules([{
      type: 'available',
      person: 'Test Worker A',
      date: '2026-08-09',
      scope: 'main',
      status: 'confirmed',
      sourceType: 'manual_structured'
    }], { people: ambiguousPeople, roles });
    const duplicateIds = normalizeRules([
      {
        ruleId: 'same-id',
        type: 'available',
        personId: 'person-001',
        date: '2026-08-09',
        scope: 'main',
        status: 'confirmed',
        sourceType: 'manual_structured',
        schemaVersion: 1
      },
      {
        ruleId: 'same-id',
        type: 'preferred',
        personId: 'person-002',
        date: '2026-08-09',
        scope: 'main',
        status: 'confirmed',
        sourceType: 'manual_structured',
        schemaVersion: 1
      }
    ], { people, roles });

    assert.ok(ambiguous.errors.some((error) => error.code === 'AMBIGUOUS_PERSON'));
    assert.ok(duplicateIds.errors.some((error) => error.code === 'DUPLICATE_RULE_ID'));
  });
});
