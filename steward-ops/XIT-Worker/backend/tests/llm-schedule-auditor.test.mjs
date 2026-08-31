import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  auditSchedule,
  auditorTools,
  validateAuditSuggestion
} from '../scheduling/llm-schedule-auditor.mjs';
import { ROLE_DEFINITIONS } from '../scheduling/scheduling-context.mjs';

const mainRoles = ROLE_DEFINITIONS.filter((role) => role.section === 'main');

function completePayload() {
  const dates = ['2026-07-05', '2026-07-12'];
  const people = mainRoles.flatMap((role) => ['a', 'b'].map((suffix) => ({
    id: `p-${role.roleId}-${suffix}`,
    name: `${role.roleId}-${suffix}`,
    categories: [role.name],
    sections: ['main']
  })));
  const assignments = {};
  for (const date of dates) {
    for (const role of mainRoles) {
      const isCommunion = role.roleId === 'main-communion';
      if (isCommunion && date !== '2026-07-12') continue;
      assignments[`${date}__${role.name}`] = `main-${role.roleId.slice(5)}-a`;
    }
  }
  return {
    targetSection: 'main',
    sectionDates: { main: dates, children: [] },
    people,
    assignments,
    locked: {},
    temporaryRules: []
  };
}

function toolResponse(suggestions) {
  return {
    response: {
      functionCalls: () => [{
        name: 'submit_swap_suggestions',
        args: { suggestions }
      }]
    }
  };
}

const validReplacement = {
  cell: { date: '2026-07-12', roleId: 'main-leader' },
  sourcePersonId: 'p-main-leader-a',
  targetPersonId: 'p-main-leader-b',
  reasonCode: 'REDUCE_TARGET_GAP'
};

describe('llm-schedule-auditor', () => {
  it('uses a fixed-array Function Calling schema', () => {
    const schema = auditorTools[0].parameters;
    assert.equal(schema.properties.suggestions.type.toLowerCase(), 'array');
    const visit = (value) => {
      if (!value || typeof value !== 'object') return;
      assert.equal(Object.hasOwn(value, 'additionalProperties'), false);
      Object.values(value).forEach(visit);
    };
    visit(schema);
  });

  it('accepts only a hard-rule-safe replacement with measurable improvement', async () => {
    const result = await auditSchedule({
      payload: completePayload(),
      model: {
        generateContent: async () => toolResponse([validReplacement])
      }
    });

    assert.equal(result.suggestions.length, 1);
    assert.equal(result.suggestions[0].sourceKey, '2026-07-12__領會');
    assert.equal(result.suggestions[0].targetPerson, 'main-leader-b');
    assert.ok(
      result.suggestions[0].expectedImprovement.absoluteTargetGapDelta < 0
    );
    assert.match(result.sourceScheduleHash, /^[a-f0-9]{64}$/);
  });

  it('rejects hallucinated or ineligible suggestions', async () => {
    const result = await auditSchedule({
      payload: completePayload(),
      model: {
        generateContent: async () => toolResponse([
          {
            ...validReplacement,
            targetPersonId: 'p-main-piano-b'
          }
        ])
      }
    });

    assert.deepEqual(result.suggestions, []);
    assert.equal(result.rejectedSuggestions[0].code, 'TARGET_NOT_ELIGIBLE');
  });

  it('revalidates an accepted suggestion and rejects stale hashes', async () => {
    const payload = completePayload();
    const audit = await auditSchedule({
      payload,
      model: {
        generateContent: async () => toolResponse([validReplacement])
      }
    });
    const accepted = audit.suggestions[0];
    const validation = validateAuditSuggestion({
      payload,
      suggestion: accepted,
      expectedSourceScheduleHash: audit.sourceScheduleHash
    });

    assert.deepEqual(validation.assignmentPatch, {
      '2026-07-12__領會': 'main-leader-b'
    });
    assert.throws(() => validateAuditSuggestion({
      payload,
      suggestion: accepted,
      expectedSourceScheduleHash: 'stale'
    }), (error) => error.code === 'AUDIT_SUGGESTION_STALE');
  });

  it('refuses to audit an incomplete source schedule', async () => {
    const payload = completePayload();
    delete payload.assignments['2026-07-12__領會'];
    await assert.rejects(
      () => auditSchedule({
        payload,
        model: { generateContent: async () => toolResponse([]) }
      }),
      (error) => error.code === 'AUDIT_SOURCE_INVALID'
    );
  });

  it('classifies provider quota failures', async () => {
    await assert.rejects(
      () => auditSchedule({
        payload: completePayload(),
        model: {
          generateContent: async () => {
            const error = new Error('429 quota exceeded provider details');
            error.status = 429;
            throw error;
          }
        }
      }),
      (error) => (
        error.code === 'AUDIT_LLM_QUOTA_EXCEEDED'
        && !error.message.includes('provider details')
      )
    );
  });

  it('does not misreport a missing tool call as an optimal schedule', async () => {
    let calls = 0;
    await assert.rejects(() => auditSchedule({
      payload: completePayload(),
      apiKey: 'test',
      model: {
        generateContent: async () => {
          calls += 1;
          return {
            response: {
              functionCalls: () => [],
              text: () => '目前沒有需要調整的建議。'
            }
          };
        }
      }
    }), (error) => error.code === 'AUDIT_TOOL_CALL_INVALID');
    assert.equal(calls, 2);
  });

  it('recovers when the auditor uses prose before an empty tool call', async () => {
    let calls = 0;
    const result = await auditSchedule({
      payload: completePayload(),
      model: {
        generateContent: async () => {
          calls += 1;
          return calls === 1
            ? { response: { functionCalls: () => [] } }
            : toolResponse([]);
        }
      }
    });

    assert.equal(calls, 2);
    assert.equal(result.toolRetryUsed, true);
    assert.deepEqual(result.suggestions, []);
  });
});
