import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runOrchestrator } from '../scheduling/schedule-orchestrator.mjs';

const roleNames = [
  '領會',
  '司琴',
  '配唱',
  '影音控制',
  '影音播放',
  '1F招待',
  '6F招待',
  '餅杯服事'
];

function payload() {
  return {
    targetSection: 'main',
    sectionDates: {
      main: ['2026-07-05', '2026-07-12'],
      children: ['2026-07-05']
    },
    people: [
      ...roleNames.map((role, index) => ({
        id: `p${index}`,
        name: `同工${index}`,
        categories: [role]
      })),
      {
        id: 'children-only',
        name: '兒主專用同工',
        categories: []
      }
    ],
    assignments: {
      '2026-07-05__兒主大班': '兒主專用同工'
    },
    locked: {
      '2026-07-05__講員': true,
      '2026-07-12__講員': true
    },
    temporaryRules: []
  };
}

async function completePlanner({ candidateMatrix, validateDraft, modelName = 'fake' }) {
  const proposedAssignments = candidateMatrix.map((cell) => ({
    date: cell.date,
    roleId: cell.roleId,
    personId: cell.eligible[0],
    appliedRuleIds: []
  }));
  const args = {
    globalPlan: {
      personTargets: [],
      schedulingPriorities: [],
      decisionSummary: []
    },
    proposedAssignments,
    unfilled: []
  };
  return {
    ...args,
    validation: validateDraft(args),
    correctionUsed: false,
    modelName
  };
}

describe('schedule-orchestrator', () => {
  it('completes only main mutable cells and never returns children writes', async () => {
    const progress = [];
    const result = await runOrchestrator(
      payload(),
      ['fake-key'],
      (stage) => progress.push(stage),
      {
        planner: completePlanner,
        solverTimeLimitMs: 500
      }
    );

    assert.equal(result.ok, true);
    assert.equal(result.mutableCellCount, 15);
    assert.equal(Object.keys(result.assignments).length, 15);
    assert.equal(Object.keys(result.assignments).some((key) => key.includes('兒主')), false);
    assert.ok(progress.includes('completed'));
    assert.ok(progress.includes('checking-feasibility'));
  });

  it('uses the LLM draft as a seed but still applies final validation', async () => {
    const fakePlanner = async ({ candidateMatrix, validateDraft }) => {
      const proposedAssignments = candidateMatrix.map((cell) => ({
        date: cell.date,
        roleId: cell.roleId,
        personId: cell.eligible[0],
        appliedRuleIds: []
      }));
      const args = {
        globalPlan: { personTargets: [], schedulingPriorities: [], decisionSummary: [] },
        proposedAssignments,
        unfilled: []
      };
      return {
        ...args,
        validation: validateDraft(args),
        correctionUsed: false,
        modelName: 'fake'
      };
    };
    const result = await runOrchestrator(payload(), ['fake-key'], () => {}, {
      planner: fakePlanner,
      solverTimeLimitMs: 500
    });

    assert.equal(result.ok, true);
    assert.equal(result.llmSummary.used, true);
    assert.equal(Object.keys(result.assignments).length, result.mutableCellCount);
    assert.equal(result.qualityMetrics.llmCoverage, 1);
    assert.equal(result.llmCoverage, 1);
    assert.equal(result.llmAssignedCount, result.mutableCellCount);
    assert.equal(result.cspContributionRate, 0);
    assert.equal(result.qualityMetrics.cspContributionRate, 0);
    assert.equal(result.qualityMetrics.rulePrioritySatisfactionRate, 1);
    assert.equal(result.qualityMetrics.hardConflictCount, 0);
    assert.equal(result.hardConflictCount, 0);
    assert.equal(result.modelName, 'fake');
  });

  it('rejects oversized LLM context before calling the planner', async () => {
    let plannerCalled = false;
    const progress = [];

    await assert.rejects(
      () => runOrchestrator(
        payload(),
        ['fake-key'],
        (stage) => progress.push(stage),
        {
          planner: async () => {
            plannerCalled = true;
            throw new Error('planner should not be called');
          },
          plannerOptions: {
            maxInputBytes: 10
          },
          solverTimeLimitMs: 500
        }
      ),
      (error) => (
        error.code === 'AI_CONTEXT_TOO_LARGE'
        && error.details?.mutableCellCount === 15
      )
    );

    assert.equal(plannerCalled, false);
    assert.ok(progress.includes('checking-feasibility'));
    assert.equal(progress.includes('planning-global-draft'), false);
  });

  it('rejects an LLM draft below 95% coverage instead of silently using CSP', async () => {
    const fakePlanner = async ({ candidateMatrix, validateDraft }) => {
      const proposedAssignments = candidateMatrix
        .slice(0, 12)
        .map((cell) => ({
          date: cell.date,
          roleId: cell.roleId,
          personId: cell.eligible[0],
          appliedRuleIds: []
        }));
      const args = {
        globalPlan: {
          personTargets: [],
          schedulingPriorities: [],
          decisionSummary: []
        },
        proposedAssignments,
        unfilled: candidateMatrix.slice(12).map((cell) => ({
          date: cell.date,
          roleId: cell.roleId,
          reasonCode: 'LLM_LEFT_UNFILLED'
        }))
      };
      return {
        ...args,
        validation: validateDraft(args),
        correctionUsed: false,
        modelName: 'fake-partial'
      };
    };

    await assert.rejects(
      () => runOrchestrator(payload(), ['fake-key'], () => {}, {
        planner: fakePlanner,
        solverTimeLimitMs: 500
      }),
      (error) => error.code === 'LLM_COVERAGE_BELOW_MINIMUM'
    );
  });

  it('rejects a result when CSP contribution exceeds 5%', async () => {
    const partialPlanner = async ({ candidateMatrix, validateDraft }) => {
      const proposedAssignments = candidateMatrix
        .slice(0, 12)
        .map((cell) => ({
          date: cell.date,
          roleId: cell.roleId,
          personId: cell.eligible[0],
          appliedRuleIds: []
        }));
      const args = {
        globalPlan: {
          personTargets: [],
          schedulingPriorities: [],
          decisionSummary: []
        },
        proposedAssignments,
        unfilled: []
      };
      return {
        ...args,
        validation: validateDraft(args),
        correctionUsed: false,
        modelName: 'fake-partial'
      };
    };

    await assert.rejects(
      () => runOrchestrator(payload(), ['fake-key'], () => {}, {
        planner: partialPlanner,
        minimumLlmCoverage: 0.8,
        maximumCspContribution: 0.05,
        solverTimeLimitMs: 500
      }),
      (error) => error.code === 'CSP_CONTRIBUTION_LIMIT_EXCEEDED'
    );
  });

  it('repairs a disclosed same-day conflict when the change stays below 5%', async () => {
    const boundedPayload = payload();
    boundedPayload.sectionDates.main = [
      '2026-07-05',
      '2026-07-12',
      '2026-07-19',
      '2026-07-26',
      '2026-08-02',
      '2026-08-09'
    ];
    boundedPayload.locked['2026-07-19__講員'] = true;
    boundedPayload.locked['2026-07-26__講員'] = true;
    boundedPayload.locked['2026-08-02__講員'] = true;
    boundedPayload.locked['2026-08-09__講員'] = true;
    boundedPayload.people.push({
      id: 'multi-role',
      name: '跨職位人員',
      categories: [roleNames[0], roleNames[1]]
    });
    const boundedPlanner = async ({ candidateMatrix, validateDraft }) => {
      const duplicateKeys = new Set(candidateMatrix
        .filter((cell) => (
          cell.date === '2026-07-05'
          && cell.eligible.includes('multi-role')
        ))
        .slice(0, 2)
        .map((cell) => cell.key));
      assert.equal(duplicateKeys.size, 2);
      const proposedAssignments = candidateMatrix.map((cell) => {
        const forceDuplicate = duplicateKeys.has(cell.key);
        const dateIndex = boundedPayload.sectionDates.main.indexOf(cell.date);
        const balanceWithMultiRole = dateIndex > 0
          && cell.eligible.includes('multi-role')
          && (
            (dateIndex % 3 === 1 && cell.eligible.includes('p0'))
            || (dateIndex % 3 === 2 && cell.eligible.includes('p1'))
          );
        return {
          date: cell.date,
          roleId: cell.roleId,
          personId: forceDuplicate || balanceWithMultiRole
            ? 'multi-role'
            : cell.eligible.find((personId) => personId !== 'multi-role')
              || cell.eligible[0],
          appliedRuleIds: []
        };
      });
      const args = {
        globalPlan: {
          personTargets: [],
          schedulingPriorities: [],
          decisionSummary: []
        },
        proposedAssignments,
        unfilled: []
      };
      const validation = validateDraft(args);
      assert.ok(validation.conflicts.some(
        (conflict) => conflict.code === 'SAME_DAY_DUPLICATE'
      ));
      return {
        ...args,
        validation,
        boundedRepair: {
          accepted: true,
          estimatedChangeCount: 1,
          maximumChangeCount: 1,
          maximumRepairRate: 0.05
        },
        correctionUsed: false,
        modelName: 'fake-bounded-repair'
      };
    };

    const result = await runOrchestrator(
      boundedPayload,
      ['fake-key'],
      () => {},
      { planner: boundedPlanner, solverTimeLimitMs: 500 }
    );

    assert.equal(result.ok, true);
    assert.equal(result.qualityMetrics.hardConflictCount, 0);
    assert.ok(result.qualityMetrics.cspContributionRate <= 0.05);
    assert.equal(result.llmSummary.boundedRepair.accepted, true);
  });

  it('does not run a full CSP schedule when no LLM key is configured', async () => {
    const progress = [];
    await assert.rejects(
      () => runOrchestrator(
        payload(),
        [],
        (stage) => progress.push(stage),
        { solverTimeLimitMs: 500 }
      ),
      (error) => error.code === 'LLM_API_KEY_MISSING'
    );
    assert.equal(progress.includes('completed'), false);
    assert.equal(progress.includes('llm-quality-gate-failed'), true);
  });

  it('rejects an LLM draft that skips a rule-priority person', async () => {
    const rulePayload = payload();
    rulePayload.people.push({
      id: 'priority-leader',
      name: '優先領會',
      categories: ['領會']
    });
    rulePayload.temporaryRules = [{
      type: 'only_available',
      person: '優先領會',
      role: '領會',
      date: '2026-07-12',
      scope: 'main',
      reason: '只有這天可以服事'
    }];
    const skipsPriorityPlanner = async ({
      candidateMatrix,
      validateDraft
    }) => {
      const proposedAssignments = candidateMatrix.map((cell) => ({
        date: cell.date,
        roleId: cell.roleId,
        personId: cell.eligible.find((personId) => (
          personId !== 'priority-leader'
        )) || cell.eligible[0],
        appliedRuleIds: []
      }));
      const args = {
        globalPlan: {
          personTargets: [],
          schedulingPriorities: [],
          decisionSummary: []
        },
        proposedAssignments,
        unfilled: []
      };
      return {
        ...args,
        validation: validateDraft(args),
        correctionUsed: true,
        modelName: 'fake-skips-priority'
      };
    };

    await assert.rejects(
      () => runOrchestrator(
        rulePayload,
        ['fake-key'],
        () => {},
        { planner: skipsPriorityPlanner, solverTimeLimitMs: 500 }
      ),
      (error) => error.code === 'LLM_DRAFT_VALIDATION_FAILED'
    );
  });

  it('rejects a draft that moves a priority person away from the reserved cell', async () => {
    const rulePayload = payload();
    rulePayload.people.push({
      id: 'priority-worker',
      name: '規則人員',
      categories: [roleNames[0], roleNames[1]]
    });
    rulePayload.temporaryRules = [{
      type: 'only_available',
      person: '規則人員',
      role: roleNames[0],
      date: '2026-07-12',
      scope: 'main',
      reason: '這一天優先安排'
    }];
    let validationConflicts = [];
    const movesReservationPlanner = async ({
      candidateMatrix,
      validateDraft,
      priorityReservations
    }) => {
      assert.equal(priorityReservations.length, 1);
      const reservation = priorityReservations[0];
      const proposedAssignments = candidateMatrix.map((cell, cellIndex) => ({
        date: cell.date,
        roleId: cell.roleId,
        personId: cellIndex === reservation.cellIndex
          ? cell.eligible.find((personId) => personId !== reservation.personId)
          : cell.eligible[0],
        appliedRuleIds: []
      }));
      const alternate = proposedAssignments.find((assignment) => (
        assignment.date !== reservation.date
        && candidateMatrix.find((cell) => (
          cell.date === assignment.date && cell.roleId === assignment.roleId
        ))?.eligible.includes(reservation.personId)
      ));
      assert.ok(alternate);
      alternate.personId = reservation.personId;
      const args = {
        globalPlan: {
          personTargets: [],
          schedulingPriorities: [],
          decisionSummary: []
        },
        proposedAssignments,
        unfilled: []
      };
      const validation = validateDraft(args);
      validationConflicts = validation.conflicts;
      return {
        ...args,
        validation,
        correctionUsed: true,
        modelName: 'fake-moves-reservation'
      };
    };

    await assert.rejects(
      () => runOrchestrator(
        rulePayload,
        ['fake-key'],
        () => {},
        { planner: movesReservationPlanner, solverTimeLimitMs: 500 }
      ),
      (error) => error.code === 'LLM_DRAFT_VALIDATION_FAILED'
    );
    assert.ok(validationConflicts.some(
      (conflict) => conflict.code === 'RULE_PRIORITY_RESERVATION_MISSING'
    ));
  });

  it('tries the next non-retired Flash model before failing the run', async () => {
    const attemptedModels = [];
    const progress = [];
    const fakePlanner = async ({
      candidateMatrix,
      validateDraft,
      modelName
    }) => {
      attemptedModels.push(modelName);
      if (['gemini-3.5-flash', 'gemini-3.6-flash'].includes(modelName)) {
        const error = new Error('malformed tool call');
        error.code = 'LLM_TOOL_CALL_MISSING';
        throw error;
      }
      const proposedAssignments = candidateMatrix.map((cell) => ({
        date: cell.date,
        roleId: cell.roleId,
        personId: cell.eligible[0],
        appliedRuleIds: []
      }));
      const args = {
        globalPlan: {
          personTargets: [],
          schedulingPriorities: [],
          decisionSummary: []
        },
        proposedAssignments,
        unfilled: []
      };
      return {
        ...args,
        validation: validateDraft(args),
        correctionUsed: false,
        modelName
      };
    };

    const result = await runOrchestrator(
      payload(),
      ['fake-key'],
      (stage) => progress.push(stage),
      {
        planner: fakePlanner,
        plannerOptions: {
          enableModelFailover: true,
          modelName: 'gemini-3.5-flash'
        },
        solverTimeLimitMs: 500
      }
    );

    assert.deepEqual(attemptedModels, [
      'gemini-3.5-flash',
      'gemini-3.6-flash',
      'gemini-2.5-flash'
    ]);
    assert.equal(result.llmSummary.used, true);
    assert.equal(result.llmSummary.modelName, 'gemini-2.5-flash');
    assert.ok(progress.includes('llm-model-fallback'));
  });

  it('rejects children targets and required cells without candidates', async () => {
    await assert.rejects(
      () => runOrchestrator({ ...payload(), targetSection: 'children' }),
      (error) => error.code === 'AI_SCHEDULING_MAIN_ONLY'
    );
    const impossible = payload();
    impossible.people = [];
    await assert.rejects(
      () => runOrchestrator(impossible, []),
      (error) => error.code === 'HARD_UNSAT'
    );
  });
});
