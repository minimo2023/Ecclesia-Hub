import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SCHEDULING_MODEL,
  getSchedulingModelCandidates,
  isAllowedSchedulingModel,
  resolveSchedulingModel
} from '../scheduling/scheduling-model-policy.mjs';

const POLICY_DATE = { asOf: '2026-07-03' };

describe('scheduling model policy', () => {
  it('defaults to current stable Flash without imposing a version ceiling', () => {
    assert.equal(DEFAULT_SCHEDULING_MODEL, 'gemini-3.6-flash');
    assert.equal(
      resolveSchedulingModel(undefined, POLICY_DATE),
      'gemini-3.6-flash'
    );
    assert.equal(
      resolveSchedulingModel('gemini-3-flash-preview', POLICY_DATE),
      'gemini-3-flash-preview'
    );
    assert.equal(
      resolveSchedulingModel('gemini-4-flash', POLICY_DATE),
      'gemini-4-flash'
    );
  });

  it('rejects Pro, specialized Flash models, and shut-down models', () => {
    for (const modelName of [
      'gemini-2.5-pro',
      'gemini-3.1-flash-live-preview',
      'gemini-3.1-flash-image',
      'gemini-2.0-flash',
      'gemini-3.1-flash-lite-preview'
    ]) {
      assert.equal(
        isAllowedSchedulingModel(modelName, POLICY_DATE),
        false,
        modelName
      );
      assert.equal(
        resolveSchedulingModel(modelName, POLICY_DATE),
        DEFAULT_SCHEDULING_MODEL
      );
    }
  });

  it('keeps usable 2.5 Flash while Google has not announced a shutdown date', () => {
    assert.equal(
      isAllowedSchedulingModel('gemini-2.5-flash', {
        asOf: '2026-10-15'
      }),
      true
    );
    assert.equal(
      isAllowedSchedulingModel('gemini-2.5-flash', {
        asOf: '2027-12-31'
      }),
      true
    );
  });

  it('builds an ordered stable Flash fallback list', () => {
    assert.deepEqual(
      getSchedulingModelCandidates('gemini-3-flash-preview', POLICY_DATE),
      [
        'gemini-3-flash-preview',
        'gemini-3.6-flash',
        'gemini-3.5-flash',
        'gemini-2.5-flash',
        'gemini-3.5-flash-lite',
        'gemini-3.1-flash-lite',
        'gemini-2.5-flash-lite'
      ]
    );
  });

  it('prefers current Flash and removes retired fallbacks by date', () => {
    assert.deepEqual(
      getSchedulingModelCandidates(undefined, POLICY_DATE),
      [
        'gemini-3.6-flash',
        'gemini-3.5-flash',
        'gemini-2.5-flash',
        'gemini-3.5-flash-lite',
        'gemini-3.1-flash-lite',
        'gemini-2.5-flash-lite'
      ]
    );
    assert.deepEqual(
      getSchedulingModelCandidates(undefined, { asOf: '2027-05-07' }),
      [
        'gemini-3.6-flash',
        'gemini-3.5-flash',
        'gemini-2.5-flash',
        'gemini-3.5-flash-lite',
        'gemini-2.5-flash-lite'
      ]
    );
  });
});
