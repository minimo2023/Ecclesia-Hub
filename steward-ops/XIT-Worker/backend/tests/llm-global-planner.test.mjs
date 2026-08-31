import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planGlobalDraft } from '../scheduling/llm-global-planner.mjs';
import { schedulingTools } from '../scheduling/scheduling-tools.mjs';

function response(args) {
  return {
    response: {
      functionCalls: () => [{ name: 'validate_global_draft', args }]
    }
  };
}

function draft(personId) {
  return {
    globalPlan: {
      personTargets: [{
        personId,
        periodTarget: 1,
        rationaleCode: 'BALANCE'
      }],
      schedulingPriorities: [{ priorityCode: 'SCARCE_FIRST', rank: 1 }],
      decisionSummary: [{ code: 'BALANCED', subjectId: personId }]
    },
    assignmentPairs: [`0|${personId}`],
    unfilledCellIndexes: []
  };
}

function candidateMatrix(count = 1) {
  return Array.from({ length: count }, (_, index) => ({
    key: `2026-08-${String(index + 1).padStart(2, '0')}__r1`,
    date: `2026-08-${String(index + 1).padStart(2, '0')}`,
    roleId: 'r1',
    required: true,
    eligible: ['p1'],
    softRuleIdsByPerson: []
  }));
}

describe('llm-global-planner', () => {
  it('uses a fixed array Function Calling schema', () => {
    const parameters = schedulingTools[0].parameters;
    assert.equal(
      parameters.properties.assignmentPairs.type.toLowerCase(),
      'array'
    );
    assert.equal(
      Object.hasOwn(parameters.properties, 'assignmentPersonIds'),
      false
    );

    const visit = (value) => {
      if (!value || typeof value !== 'object') return;
      assert.equal(Object.hasOwn(value, 'additionalProperties'), false);
      Object.values(value).forEach(visit);
    };
    visit(parameters);
  });

  it('executes the deterministic interceptor and allows one correction', async () => {
    const calls = [];
    const model = {
      countTokens: async () => ({ totalTokens: 100 }),
      startChat: () => ({
        sendMessage: async (message) => {
          calls.push(message);
          return calls.length === 1 ? response(draft('bad')) : response(draft('p1'));
        }
      })
    };
    const validations = [];
    const result = await planGlobalDraft({
      candidateMatrix: candidateMatrix(),
      people: [{ id: 'p1' }],
      rules: [],
      loadSummary: { p1: { periodTarget: 1 } },
      apiKey: 'test',
      model,
      validateDraft(args) {
        validations.push(args);
        return {
          valid: args.proposedAssignments[0].personId === 'p1',
          conflicts: [{
            code: 'NOT_IN_CANDIDATE_DOMAIN',
            cellKey: '2026-08-09__r1'
          }]
        };
      }
    });

    assert.equal(calls.length, 2);
    assert.equal(validations.length, 2);
    assert.equal(result.correctionUsed, true);
    assert.equal(result.validation.valid, true);
    assert.equal(result.proposedAssignments[0].personId, 'p1');
  });

  it('puts exact rule-priority reservations in the LLM context', async () => {
    let receivedPrompt = '';
    const model = {
      countTokens: async () => ({ totalTokens: 100 }),
      startChat: () => ({
        sendMessage: async (message) => {
          receivedPrompt = message;
          return response(draft('p1'));
        }
      })
    };
    await planGlobalDraft({
      candidateMatrix: candidateMatrix(),
      people: [{ id: 'p1' }],
      rules: [],
      loadSummary: {
        p1: {
          periodTarget: 1,
          rulePriorityMinimum: 1,
          rulePriorityTypes: ['only_available']
        }
      },
      priorityReservations: [{
        cellIndex: 0,
        date: '2026-08-01',
        roleId: 'r1',
        personId: 'p1',
        ruleTypes: ['only_available']
      }],
      apiKey: 'test',
      model,
      validateDraft: () => ({ valid: true, conflicts: [] })
    });

    assert.match(receivedPrompt, /"priorityReservations":\[\{"cellIndex":0,"personId":"p1"/);
    assert.match(receivedPrompt, /exact mandatory cellIndex\/personId pairs/);
  });

  it('tells the LLM to maximize distinct people within each role', async () => {
    let receivedPrompt = '';
    const model = {
      countTokens: async () => ({ totalTokens: 100 }),
      startChat: () => ({
        sendMessage: async (message) => {
          receivedPrompt = message;
          return response(draft('p1'));
        }
      })
    };
    await planGlobalDraft({
      candidateMatrix: [{
        ...candidateMatrix()[0],
        eligible: ['p1', 'p2']
      }],
      people: [{ id: 'p1' }, { id: 'p2' }],
      rules: [],
      loadSummary: {
        p1: { periodTarget: 1 },
        p2: { periodTarget: 0 }
      },
      apiKey: 'test',
      model,
      validateDraft: () => ({ valid: true, conflicts: [] })
    });

    assert.match(receivedPrompt, /"roleCoverageRequirements":/);
    assert.match(receivedPrompt, /maximize distinct eligible people/);
  });

  it('keeps a 95% atomic draft and infers omitted cells for CSP completion', async () => {
    const model = {
      countTokens: async () => ({ totalTokens: 10 }),
      startChat: () => ({
        sendMessage: async () => response({
          assignmentPairs: Array.from(
            { length: 19 },
            (_, index) => `${index}|p1`
          ),
          unfilledCellIndexes: [],
          globalPlan: {
            personTargets: [],
            schedulingPriorities: [],
            decisionSummary: []
          }
        })
      })
    };
    const result = await planGlobalDraft({
      candidateMatrix: candidateMatrix(20),
      people: [{ id: 'p1' }],
      rules: [],
      loadSummary: {},
      apiKey: 'test',
      model,
      validateDraft: () => ({ valid: true, conflicts: [] })
    });

    assert.equal(result.proposedAssignments.length, 19);
    assert.equal(result.unfilled.length, 1);
    assert.deepEqual(result.protocolRepairs, [{
      code: 'INFERRED_MISSING_CELLS_AS_UNFILLED',
      count: 1
    }]);
  });

  it('defers a small same-day conflict to the bounded safety repair', async () => {
    let callCount = 0;
    const model = {
      countTokens: async () => ({ totalTokens: 10 }),
      startChat: () => ({
        sendMessage: async () => {
          callCount += 1;
          return response({
            assignmentPairs: Array.from(
              { length: 20 },
              (_, index) => `${index}|p1`
            ),
            unfilledCellIndexes: [],
            globalPlan: {
              personTargets: [],
              schedulingPriorities: [],
              decisionSummary: []
            }
          });
        }
      })
    };
    const result = await planGlobalDraft({
      candidateMatrix: candidateMatrix(20),
      people: [{ id: 'p1' }],
      rules: [],
      loadSummary: {},
      apiKey: 'test',
      model,
      validateDraft: () => ({
        valid: false,
        conflicts: [{
          code: 'SAME_DAY_DUPLICATE',
          cells: ['2026-08-01__r1', '2026-08-01__r2']
        }]
      })
    });

    assert.equal(callCount, 1);
    assert.equal(result.correctionUsed, false);
    assert.equal(result.boundedRepair.accepted, true);
    assert.equal(result.boundedRepair.estimatedChangeCount, 1);
  });

  it('rejects a sparse draft before it can masquerade as global planning', async () => {
    const model = {
      countTokens: async () => ({ totalTokens: 10 }),
      startChat: () => ({
        sendMessage: async () => response({
          assignmentPairs: Array.from(
            { length: 18 },
            (_, index) => `${index}|p1`
          ),
          unfilledCellIndexes: [],
          globalPlan: {
            personTargets: [],
            schedulingPriorities: [],
            decisionSummary: []
          }
        })
      })
    };

    await assert.rejects(() => planGlobalDraft({
      candidateMatrix: candidateMatrix(20),
      people: [{ id: 'p1' }],
      rules: [],
      loadSummary: {},
      apiKey: 'test',
      model,
      validateDraft: () => ({ valid: true, conflicts: [] })
    }), (error) => error.code === 'LLM_DRAFT_COVERAGE_TOO_LOW');
  });

  it('rejects oversized context before model generation', async () => {
    const model = {
      countTokens: async () => ({ totalTokens: 999 }),
      startChat: () => {
        throw new Error('must not start');
      }
    };
    await assert.rejects(() => planGlobalDraft({
      candidateMatrix: [],
      people: [],
      rules: [],
      loadSummary: {},
      apiKey: 'test',
      model,
      maxInputTokens: 10,
      validateDraft: () => ({ valid: true, conflicts: [] })
    }), (error) => error.code === 'AI_CONTEXT_TOO_LARGE');
  });

  it('classifies quota failures without leaking the provider response', async () => {
    const model = {
      countTokens: async () => ({ totalTokens: 10 }),
      startChat: () => ({
        sendMessage: async () => {
          const error = new Error('429 Too Many Requests: quota exceeded with provider details');
          error.status = 429;
          throw error;
        }
      })
    };
    await assert.rejects(() => planGlobalDraft({
      candidateMatrix: [],
      people: [],
      rules: [],
      loadSummary: {},
      apiKey: 'test',
      model,
      validateDraft: () => ({ valid: true, conflicts: [] })
    }), (error) => (
      error.code === 'LLM_QUOTA_EXCEEDED'
      && !error.message.includes('provider details')
    ));
  });

  it('distinguishes user cancellation from a real LLM timeout', async () => {
    const controller = new AbortController();
    controller.abort(new Error('user cancelled'));
    const model = {
      countTokens: async () => ({ totalTokens: 10 }),
      startChat: () => ({
        sendMessage: async () => {
          throw new Error('aborted');
        }
      })
    };

    await assert.rejects(() => planGlobalDraft({
      candidateMatrix: [],
      people: [],
      rules: [],
      loadSummary: {},
      apiKey: 'test',
      model,
      signal: controller.signal,
      validateDraft: () => ({ valid: true, conflicts: [] })
    }), (error) => error.code === 'LLM_CANCELLED');
  });

  it('normalizes DOM AbortError code 20 into LLM_TIMEOUT', async () => {
    const model = {
      countTokens: async () => ({ totalTokens: 10 }),
      startChat: () => ({
        sendMessage: async (_message, { signal }) => new Promise(
          (_resolve, reject) => {
            signal.addEventListener('abort', () => {
              const error = new Error('This operation was aborted');
              error.code = 20;
              reject(error);
            }, { once: true });
          }
        )
      })
    };

    await assert.rejects(() => planGlobalDraft({
      candidateMatrix: [],
      people: [],
      rules: [],
      loadSummary: {},
      apiKey: 'test',
      model,
      timeoutMs: 5,
      validateDraft: () => ({ valid: true, conflicts: [] })
    }), (error) => error.code === 'LLM_TIMEOUT');
  });
});
