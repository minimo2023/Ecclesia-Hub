import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RULE_SCHEMA_VERSION,
  validateRule
} from '../scheduling/rule-schema.mjs';

function confirmedRule(overrides = {}) {
  return {
    ruleId: 'rule-001',
    type: 'available',
    personId: 'person-001',
    date: '2026-08-09',
    scope: 'main',
    sourceType: 'manual_structured',
    status: 'confirmed',
    schemaVersion: RULE_SCHEMA_VERSION,
    ...overrides
  };
}

describe('rule-schema validation', () => {
  it('rejects unknown rule types with a stable error code', () => {
    const result = validateRule(confirmedRule({ type: 'magic_wand' }));

    assert.equal(result.valid, false);
    assert.equal(result.errors[0].code, 'UNKNOWN_RULE_TYPE');
  });

  it('normalizes available and preferred as soft rules', () => {
    const available = validateRule(confirmedRule());
    const preferred = validateRule(confirmedRule({
      ruleId: 'rule-002',
      type: 'preferred'
    }));

    assert.equal(available.valid, true);
    assert.equal(available.normalized.hard, false);
    assert.equal(preferred.valid, true);
    assert.equal(preferred.normalized.hard, false);
  });

  it('requires personId, date, and roleId for fixed_assignment', () => {
    const result = validateRule(confirmedRule({
      type: 'fixed_assignment',
      roleId: undefined
    }));

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.code === 'REQUIRED_FIELD'));
  });

  it('accepts a complete fixed_assignment and forces it to hard', () => {
    const result = validateRule(confirmedRule({
      type: 'fixed_assignment',
      roleId: 'main-piano',
      hard: false
    }));

    assert.equal(result.valid, true);
    assert.equal(result.normalized.hard, true);
  });

  it('rejects unconfirmed AI rules for scheduling but accepts them for storage', () => {
    const rule = confirmedRule({
      type: 'fixed_assignment',
      roleId: 'main-piano',
      sourceType: 'ai_parsed_memo',
      status: 'draft_ai'
    });

    const schedulingResult = validateRule(rule);
    const storageResult = validateRule(rule, { mode: 'storage' });

    assert.equal(schedulingResult.valid, false);
    assert.equal(schedulingResult.errors[0].code, 'RULE_CONFIRMATION_REQUIRED');
    assert.equal(storageResult.valid, true);
  });

  it('rejects display names used as IDs', () => {
    const result = validateRule(confirmedRule({
      type: 'fixed_assignment',
      personId: 'Test Worker A',
      roleId: '司琴'
    }));

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.code === 'INVALID_ID'));
  });

  it('rejects impossible calendar dates and reversed date ranges', () => {
    const invalidDate = validateRule(confirmedRule({ date: '2026-02-30' }));
    const reversedRange = validateRule(confirmedRule({
      date: undefined,
      dateRange: { start: '2026-09-01', end: '2026-08-01' }
    }));

    assert.equal(invalidDate.valid, false);
    assert.equal(invalidDate.errors[0].code, 'INVALID_DATE');
    assert.equal(reversedRange.valid, false);
    assert.ok(reversedRange.errors.some((error) => error.code === 'INVALID_DATE_RANGE'));
  });

  it('validates only_available, limit, and exclusive_person fields', () => {
    const onlyAvailable = validateRule(confirmedRule({
      type: 'only_available',
      date: undefined,
      dates: ['2026-08-09', '2026-08-23']
    }));
    const invalidLimit = validateRule(confirmedRule({
      type: 'limit',
      date: undefined,
      maxCount: -1,
      period: { start: '2026-08-01', end: '2026-08-31' }
    }));
    const invalidExclusive = validateRule(confirmedRule({
      type: 'exclusive_person',
      personId: undefined,
      date: undefined,
      personIds: ['person-001']
    }));

    assert.equal(onlyAvailable.valid, true);
    assert.equal(invalidLimit.valid, false);
    assert.ok(invalidLimit.errors.some((error) => error.code === 'INVALID_MAX_COUNT'));
    assert.equal(invalidExclusive.valid, false);
    assert.ok(invalidExclusive.errors.some((error) => error.code === 'INVALID_PERSON_IDS'));
  });

  it('validates conditional endpoints and force_role fields', () => {
    const conditional = validateRule(confirmedRule({
      type: 'conditional',
      personId: undefined,
      date: undefined,
      condition: {
        section: 'main',
        personId: 'person-001',
        roleId: 'main-leader'
      },
      action: {
        section: 'children',
        personId: 'person-002',
        roleId: 'children-senior'
      }
    }));
    const invalidForceRole = validateRule(confirmedRule({
      type: 'force_role',
      personId: undefined,
      roleId: undefined
    }));

    assert.equal(conditional.valid, true);
    assert.equal(invalidForceRole.valid, false);
    assert.ok(invalidForceRole.errors.some((error) => error.code === 'REQUIRED_FIELD'));
  });

  it('supports allow_consecutive as a soft exception', () => {
    const result = validateRule(confirmedRule({
      type: 'allow_consecutive',
      roleId: 'main-piano'
    }));

    assert.equal(result.valid, true);
    assert.equal(result.normalized.hard, false);
  });

  it('rejects unknown fields in canonical scheduling rules', () => {
    const result = validateRule(confirmedRule({ unexpected: true }));

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.code === 'UNKNOWN_FIELD'));
  });
});
