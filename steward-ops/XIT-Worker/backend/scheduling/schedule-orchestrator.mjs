import { generateCandidateMatrix } from './candidate-matrix.mjs';
import { calculateLoad } from './load-calculator.mjs';
import {
  DEFAULT_GLOBAL_PLANNER_MAX_INPUT_BYTES,
  DEFAULT_GLOBAL_PLANNER_MAX_INPUT_TOKENS,
  estimateGlobalDraftContext,
  planGlobalDraft
} from './llm-global-planner.mjs';
import { checkPreflightConflicts } from './preflight-check.mjs';
import { buildRulePriorityReservations } from './rule-priority-planner.mjs';
import { repairConsecutiveDraft } from './schedule-soft-repair.mjs';
import {
  getSchedulingModelCandidates
} from './scheduling-model-policy.mjs';
import {
  buildSchedulingContext,
  toDisplayAssignments
} from './scheduling-context.mjs';
import { optimizeSchedule } from './schedule-optimizer.mjs';
import { validateSchedule } from './schedule-validator.mjs';
import { cellKey, toAssignmentMap } from './rule-utils.mjs';

function orchestratorError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function validateToolDraft(
  args,
  context,
  matrix,
  loadSummary = {},
  priorityReservations = []
) {
  const scheduleValidation = validateSchedule({
    assignments: args.proposedAssignments,
    targetSlots: context.targetSlots,
    people: context.people,
    rules: context.rules,
    lockedKeys: context.lockedKeys,
    lockedAssignments: context.lockedAssignments,
    baselineAssignments: context.baselineAssignments,
    childrenReadOnlyReservations: context.childrenReadOnlyReservations,
    childrenAssignments: context.childrenAssignments,
    snapshotHash: context.snapshotHash
  });
  const conflicts = [...scheduleValidation.conflicts];
  const matrixByKey = new Map(matrix.map((cell) => [cell.key, cell]));
  const planned = toAssignmentMap(args.proposedAssignments);

  for (const assignment of args.proposedAssignments || []) {
    const key = cellKey(assignment.date, assignment.roleId);
    const cell = matrixByKey.get(key);
    if (cell && !cell.eligible.includes(assignment.personId)) {
      conflicts.push({
        code: 'NOT_IN_CANDIDATE_DOMAIN',
        cellKey: key,
        personId: assignment.personId,
        availableCandidates: cell.eligible
      });
    }
  }

  const knownPeople = new Set(context.people.map((person) => person.id));
  const seenTargets = new Set();
  for (const target of args.globalPlan?.personTargets || []) {
    if (!knownPeople.has(target.personId)) {
      conflicts.push({
        code: 'UNKNOWN_TARGET_PERSON',
        personId: target.personId
      });
    }
    if (seenTargets.has(target.personId)) {
      conflicts.push({
        code: 'DUPLICATE_PERSON_TARGET',
        personId: target.personId
      });
    }
    seenTargets.add(target.personId);
  }

  const plannedCounts = Object.values(planned).reduce((counts, personId) => {
    counts.set(personId, (counts.get(personId) || 0) + 1);
    return counts;
  }, new Map());
  for (const load of Object.values(loadSummary)) {
    if (!load.rulePriorityMinimum) continue;
    const assignedCount = plannedCounts.get(load.personId) || 0;
    if (assignedCount < load.rulePriorityMinimum) {
      conflicts.push({
        code: 'RULE_PRIORITY_MINIMUM_MISSING',
        personId: load.personId,
        requiredMinimum: load.rulePriorityMinimum,
        assignedCount,
        ruleTypes: load.rulePriorityTypes || []
      });
    }
  }
  for (const reservation of priorityReservations) {
    const key = cellKey(reservation.date, reservation.roleId);
    if (planned[key] !== reservation.personId) {
      conflicts.push({
        code: 'RULE_PRIORITY_RESERVATION_MISSING',
        cellKey: key,
        personId: reservation.personId,
        actualPersonId: planned[key] || null
      });
    }
  }

  return {
    ...scheduleValidation,
    valid: conflicts.length === 0,
    conflicts,
    errors: conflicts
  };
}

function onlyFillableConflicts(validation) {
  return (validation?.conflicts || []).every(
    (conflict) => conflict.code === 'REQUIRED_CELL_UNFILLED'
  );
}

function buildFeasibilitySummary({
  context,
  matrix,
  deterministicLoads,
  priorityPlan,
  plannerContext
}) {
  const candidateCounts = matrix.map((cell) => cell.eligible.length);
  const minimumCandidateCount = candidateCounts.length
    ? Math.min(...candidateCounts)
    : 0;
  const lowCandidateCells = matrix
    .filter((cell) => cell.eligible.length === minimumCandidateCount)
    .slice(0, 10)
    .map((cell) => cell.key);
  const childrenReservationCount = Object.values(
    context.childrenReadOnlyReservations || {}
  ).reduce((count, reservations) => count + reservations.length, 0);
  const priorityLoads = Object.values(deterministicLoads)
    .filter((load) => load.rulePriorityMinimum > 0);

  return {
    mutableCellCount: context.targetSlots.length,
    activeRuleCount: context.rules.length,
    minimumCandidateCount,
    lowCandidateCellCount: matrix.filter(
      (cell) => cell.eligible.length === minimumCandidateCount
    ).length,
    lowCandidateCells,
    lockedCellCount: context.lockedKeys.length,
    lockedAssignmentCount: Object.keys(context.lockedAssignments).length,
    blankLockedCellCount:
      context.lockedKeys.length - Object.keys(context.lockedAssignments).length,
    childrenReservationDateCount:
      Object.keys(context.childrenReadOnlyReservations || {}).length,
    childrenReservationCount,
    rulePriorityPersonCount: priorityLoads.length,
    priorityReservationCount: priorityPlan.reservations.length,
    llmInputBytes: plannerContext.inputBytes,
    llmEstimatedTokens: plannerContext.estimatedTokens
  };
}

export async function runOrchestrator(
  payload,
  apiKeys = [],
  emitProgress = () => {},
  {
    planner = planGlobalDraft,
    plannerOptions = {},
    solverTimeLimitMs = 2000,
    minimumLlmCoverage = 0.95,
    maximumCspContribution = 0.05,
    requireLlm = true,
    signal
  } = {}
) {
  if (payload?.targetSection && payload.targetSection !== 'main') {
    throw orchestratorError(
      'AI_SCHEDULING_MAIN_ONLY',
      'AI 排班只允許大堂，兒主維持純手動。'
    );
  }

  emitProgress('preparing-context', '正在建立大堂排班權威上下文…');
  const context = buildSchedulingContext(payload);

  emitProgress('checking-preflight-conflicts', '正在檢查硬規則衝突…');
  const preflight = checkPreflightConflicts({
    normalizedRules: context.rules,
    lockedAssignments: context.lockedAssignments,
    lockedKeys: context.lockedKeys,
    childrenReadOnlyReservations: context.childrenReadOnlyReservations,
    existingAssignments: context.childrenAssignments,
    people: context.people
  });
  if (!preflight.valid) {
    throw orchestratorError(
      'PREFLIGHT_CONFLICT',
      '規則或鎖定資料互相衝突，排班未啟動。',
      { conflicts: preflight.conflicts }
    );
  }

  emitProgress('building-candidates', '正在整理每格合法候選人…');
  const matrix = generateCandidateMatrix({
    targetSlots: context.targetSlots,
    people: context.people,
    rules: context.rules,
    lockedKeys: context.lockedKeys,
    lockedAssignments: context.lockedAssignments,
    baselineAssignments: context.baselineAssignments,
    childrenReadOnlyReservations: context.childrenReadOnlyReservations
  });
  const impossibleCells = matrix.filter(
    (cell) => cell.required && !cell.eligible.length
  );
  if (impossibleCells.length) {
    throw orchestratorError(
      'HARD_UNSAT',
      '部分大堂必填格沒有任何合法候選人。',
      { cells: impossibleCells }
    );
  }
  const candidateCounts = matrix.map((cell) => cell.eligible.length);
  emitProgress(
    'candidate-summary',
    `候選矩陣完成：${matrix.length} 格，最少每格 ${
      candidateCounts.length ? Math.min(...candidateCounts) : 0
    } 人。`,
    {
      matrixCellCount: matrix.length,
      requiredCellCount: matrix.filter((cell) => cell.required).length,
      minimumCandidateCount:
        candidateCounts.length ? Math.min(...candidateCounts) : 0,
      maximumCandidateCount:
        candidateCounts.length ? Math.max(...candidateCounts) : 0
    }
  );

  const deterministicLoads = calculateLoad({
    people: context.people,
    rules: context.rules,
    candidateMatrix: matrix,
    baselineAssignments: context.baselineAssignments,
    childrenReadOnlyReservations: context.childrenReadOnlyReservations
  });
  emitProgress(
    'reserving-rule-priority',
    '正在先安排有明確規則的人員...',
    {
      priorityPersonCount: Object.values(deterministicLoads)
        .filter((load) => load.rulePriorityMinimum > 0).length
    }
  );
  const priorityPlan = buildRulePriorityReservations({
    candidateMatrix: matrix,
    loadSummary: deterministicLoads
  });
  if (!priorityPlan.success) {
    throw orchestratorError(
      'RULE_PRIORITY_RESERVATION_UNSAT',
      '有規則的人員無法全部取得合法排班位置。',
      {
        requirementPersonCount: priorityPlan.requirementPersonCount,
        requiredAssignmentCount: priorityPlan.requiredAssignmentCount,
        unsatisfiedPeople: priorityPlan.unsatisfiedPeople
      }
    );
  }
  const plannerMaxInputBytes =
    plannerOptions.maxInputBytes ?? DEFAULT_GLOBAL_PLANNER_MAX_INPUT_BYTES;
  const plannerMaxInputTokens =
    plannerOptions.maxInputTokens ?? DEFAULT_GLOBAL_PLANNER_MAX_INPUT_TOKENS;
  const plannerContext = estimateGlobalDraftContext({
    candidateMatrix: matrix,
    people: context.people,
    rules: context.rules,
    loadSummary: deterministicLoads,
    priorityReservations: priorityPlan.reservations,
    existingPreferences: context.draftPreferences
  });
  const feasibilitySummary = buildFeasibilitySummary({
    context,
    matrix,
    deterministicLoads,
    priorityPlan,
    plannerContext
  });
  emitProgress(
    'checking-feasibility',
    '正在確認規則、人力、鎖定格、兒主占用與 LLM 上下文大小...',
    feasibilitySummary
  );
  if (plannerContext.inputBytes > plannerMaxInputBytes) {
    throw orchestratorError(
      'AI_CONTEXT_TOO_LARGE',
      'LLM 排班上下文過大，已在呼叫模型前中止。',
      {
        ...feasibilitySummary,
        maxInputBytes: plannerMaxInputBytes
      }
    );
  }
  if (plannerContext.estimatedTokens > plannerMaxInputTokens) {
    throw orchestratorError(
      'AI_CONTEXT_TOO_LARGE',
      'LLM 排班 token 預估過大，已在呼叫模型前中止。',
      {
        ...feasibilitySummary,
        maxInputTokens: plannerMaxInputTokens
      }
    );
  }

  const validateDraft = (args) => validateToolDraft(
    args,
    context,
    matrix,
    deterministicLoads,
    priorityPlan.reservations
  );

  let llmResult = null;
  let draftAssignments = context.draftPreferences;
  let personTargets = [];
  let llmDraft = {};
  let softRepairSummary = {
    initialWarningCount: 0,
    remainingWarningCount: 0,
    changedCellCount: 0
  };
  const apiKey = apiKeys.find(Boolean);

  if (!apiKey && requireLlm) {
    emitProgress(
      'llm-quality-gate-failed',
      '未設定 Gemini 金鑰，原班表不變。'
    );
    throw orchestratorError(
      'LLM_API_KEY_MISSING',
      '未設定 Gemini 金鑰，無法執行 LLM 主導排班。'
    );
  }

  if (apiKey) {
    const canUseModelFailover =
      (planner === planGlobalDraft
        || plannerOptions.enableModelFailover === true)
      && !plannerOptions.model;
    const modelCandidates = canUseModelFailover
      ? getSchedulingModelCandidates(plannerOptions.modelName)
      : [plannerOptions.modelName];
    const plannerTotalTimeoutMs = plannerOptions.timeoutMs ?? 120000;
    const plannerDeadline = Date.now() + plannerTotalTimeoutMs;
    const retryableModelErrors = new Set([
      'LLM_MODEL_UNAVAILABLE',
      'LLM_PROVIDER_UNAVAILABLE',
      'LLM_QUOTA_EXCEEDED',
      'LLM_TIMEOUT',
      'LLM_TOOL_CALL_MISSING',
      'LLM_TOOL_CALL_INVALID',
      'LLM_TOOL_SCHEMA_INVALID',
      'LLM_ASSIGNMENT_PAIR_LENGTH_INVALID',
      'LLM_ASSIGNMENT_INDEX_INVALID',
      'LLM_ASSIGNMENT_COVERAGE_INVALID',
      'LLM_DRAFT_COVERAGE_TOO_LOW',
      'LLM_COVERAGE_BELOW_MINIMUM',
      'LLM_DRAFT_VALIDATION_FAILED'
    ]);
    let lastPlannerError = null;

    for (let index = 0; index < modelCandidates.length; index += 1) {
      const modelName = modelCandidates[index];
      const remainingMs = plannerDeadline - Date.now();
      if (remainingMs <= 0) break;
      const hasFallback = index < modelCandidates.length - 1;
      const fallbackReserveMs = hasFallback ? 60000 : 0;
      const timeoutMs = hasFallback
        ? Math.min(remainingMs, Math.max(10000, remainingMs - fallbackReserveMs))
        : remainingMs;

      try {
        emitProgress('planning-global-draft', 'LLM 正在進行全期人力規劃…');
        const plannedResult = await planner({
          candidateMatrix: matrix,
          people: context.people,
          rules: context.rules,
          loadSummary: deterministicLoads,
          priorityReservations: priorityPlan.reservations,
          existingPreferences: context.draftPreferences,
          apiKey,
          validateDraft,
          signal,
          onTelemetry: (stage, message, details) => (
            emitProgress(stage, message, details)
          ),
          ...plannerOptions,
          modelName,
          timeoutMs
        });
        const coverage = context.targetSlots.length
          ? (plannedResult.proposedAssignments?.length || 0)
            / context.targetSlots.length
          : 1;
        if (coverage < minimumLlmCoverage) {
          throw orchestratorError(
            'LLM_COVERAGE_BELOW_MINIMUM',
            `LLM 草稿覆蓋率 ${Math.round(coverage * 1000) / 10}% 低於最低標準。`,
            {
              coverage,
              minimumLlmCoverage,
              assignedCellCount:
                plannedResult.proposedAssignments?.length || 0,
              mutableCellCount: context.targetSlots.length
            }
          );
        }
        const validationIsRepairable =
          onlyFillableConflicts(plannedResult.validation)
          || plannedResult.boundedRepair?.accepted;
        if (!plannedResult.validation?.valid && !validationIsRepairable) {
          throw orchestratorError(
            'LLM_DRAFT_VALIDATION_FAILED',
            'LLM 草稿仍未通過規則優先與硬規則攔截器。',
            {
              conflicts:
                plannedResult.validation?.conflicts?.slice(0, 20) || []
            }
          );
        }
        llmResult = plannedResult;
        break;
      } catch (error) {
        lastPlannerError = error;
        if (
          signal?.aborted
          || error.code === 'LLM_CANCELLED'
          || !hasFallback
          || !retryableModelErrors.has(error.code)
        ) {
          break;
        }
        emitProgress(
          'llm-model-fallback',
          `${modelName} 初稿無法使用，改試下一個可用 Flash 模型。`,
          {
            modelName,
            errorCode: error.code || 'LLM_FAILED',
            nextModelName: modelCandidates[index + 1]
          }
        );
      }
    }

    if (!llmResult) {
      const error = lastPlannerError || orchestratorError(
        'LLM_TIMEOUT',
        'LLM 全局規劃總時間已用盡。'
      );
      emitProgress(
        requireLlm ? 'llm-quality-gate-failed' : 'llm-fallback',
        requireLlm
          ? `LLM 未達排班標準，原班表不變：${error.code || 'LLM_FAILED'}`
          : `LLM 初稿無法使用，改由確定性核心完成：${error.code || 'LLM_FAILED'}`
      );
      if (requireLlm) {
        throw orchestratorError(
          error.code || 'LLM_PLAN_UNAVAILABLE',
          error.message || 'LLM 未能產生符合最低標準的全局班表。',
          error.details || {}
        );
      }
      llmResult = {
        errorCode: error.code || 'LLM_FAILED',
        errorMessage: error.message,
        errorDetails: error.details
      };
    }
  }

  if (llmResult && !llmResult.errorCode) {
    draftAssignments = llmResult.proposedAssignments;
    llmDraft = toAssignmentMap(llmResult.proposedAssignments);
    personTargets = llmResult.globalPlan?.personTargets || [];
    emitProgress(
      llmResult.correctionUsed
        ? 'repairing-llm-draft'
        : 'validating-llm-draft',
      llmResult.validation?.valid
        ? 'LLM 初稿已通過攔截器。'
        : 'LLM 初稿仍有衝突，交由確定性核心修補。'
    );

    const softRepairResult = repairConsecutiveDraft({
      draftAssignments,
      targetSlots: context.targetSlots,
      rules: context.rules,
      candidateMatrix: matrix,
      baselineAssignments: context.baselineAssignments,
      validateDraft,
      loadSummary: deterministicLoads
    });
    draftAssignments = softRepairResult.assignments;
    softRepairSummary = {
      initialWarningCount: softRepairResult.initialWarningCount,
      remainingWarningCount: softRepairResult.remainingWarningCount,
      changedCellCount: softRepairResult.changedCellCount
    };
    emitProgress(
      'smoothing-llm-draft',
      softRepairSummary.changedCellCount
        ? `已用最少換人修正 ${softRepairSummary.changedCellCount} 格可避免的連週排班。`
        : 'LLM 草稿沒有可安全修正的連週排班。',
      softRepairSummary
    );
  }

  emitProgress(
    'optimizing-schedule',
    '正在以最少改動原則產生完整合法班表…',
    {
      solverTimeLimitMs,
      llmDraftAvailable: Boolean(llmResult && !llmResult.errorCode)
    }
  );
  const requiredPriorityAssignments = Object.fromEntries(
    priorityPlan.reservations.map((reservation) => [
      cellKey(reservation.date, reservation.roleId),
      reservation.personId
    ])
  );
  const optimized = optimizeSchedule({
    targetSlots: context.targetSlots,
    people: context.people,
    rules: context.rules,
    lockedKeys: context.lockedKeys,
    lockedAssignments: context.lockedAssignments,
    baselineAssignments: context.baselineAssignments,
    childrenReadOnlyReservations: context.childrenReadOnlyReservations,
    childrenAssignments: context.childrenAssignments,
    draftAssignments,
    requiredDraftAssignments: requiredPriorityAssignments,
    personTargets,
    candidateMatrix: matrix,
    timeLimitMs: solverTimeLimitMs,
    signal
  });
  if (!optimized.success) {
    if (optimized.status === 'CANCELED') {
      throw orchestratorError('CANCELED', '排班已由使用者取消。');
    }
    throw orchestratorError(
      optimized.status,
      '無法在不違反硬規則的前提下產生完整大堂班表。',
      { optimizer: optimized }
    );
  }

  emitProgress('validating-final-schedule', '正在執行最終全表驗證…');
  const finalValidation = validateSchedule({
    assignments: optimized.assignments,
    targetSlots: context.targetSlots,
    people: context.people,
    rules: context.rules,
    lockedKeys: context.lockedKeys,
    lockedAssignments: context.lockedAssignments,
    baselineAssignments: context.baselineAssignments,
    childrenReadOnlyReservations: context.childrenReadOnlyReservations,
    childrenAssignments: context.childrenAssignments,
    snapshotHash: context.snapshotHash
  });
  if (!finalValidation.valid) {
    throw orchestratorError(
      'FINAL_VALIDATION_FAILED',
      '最終班表未通過硬規則驗證，結果未回傳。',
      { conflicts: finalValidation.conflicts }
    );
  }

  const optimizerSeed = toAssignmentMap(draftAssignments);
  const finalAssignments = optimized.assignments;
  const llmAssignedCount = Object.keys(llmDraft).length;
  const llmCoverage = context.targetSlots.length
    ? llmAssignedCount / context.targetSlots.length
    : 1;
  const cspFilledCount = context.targetSlots.filter((slot) => {
    const key = cellKey(slot.date, slot.roleId);
    return !optimizerSeed[key] && Boolean(finalAssignments[key]);
  }).length;
  const cspChangedCount = context.targetSlots.filter((slot) => {
    const key = cellKey(slot.date, slot.roleId);
    return Boolean(optimizerSeed[key])
      && optimizerSeed[key] !== finalAssignments[key];
  }).length;
  const cspContributionCount = cspFilledCount + cspChangedCount;
  const cspContributionRate = context.targetSlots.length
    ? cspContributionCount / context.targetSlots.length
    : 0;
  const finalPlannedCounts = Object.values(finalAssignments).reduce(
    (counts, personId) => {
      counts.set(personId, (counts.get(personId) || 0) + 1);
      return counts;
    },
    new Map()
  );
  const priorityLoads = Object.values(deterministicLoads)
    .filter((load) => load.rulePriorityMinimum > 0);
  const satisfiedPriorityLoads = priorityLoads.filter((load) => (
    (finalPlannedCounts.get(load.personId) || 0)
    >= load.rulePriorityMinimum
  ));
  const rulePrioritySatisfactionRate = priorityLoads.length
    ? satisfiedPriorityLoads.length / priorityLoads.length
    : 1;
  const satisfiedPriorityReservationCount = priorityPlan.reservations.filter(
    (reservation) => (
      finalAssignments[cellKey(reservation.date, reservation.roleId)]
      === reservation.personId
    )
  ).length;
  const qualityMetrics = {
    llmCoverage,
    llmAssignedCount,
    minimumLlmCoverage,
    cspFilledCount,
    cspChangedCount,
    cspContributionCount,
    cspContributionRate,
    maximumCspContribution,
    rulePriorityPersonCount: priorityLoads.length,
    rulePrioritySatisfiedCount: satisfiedPriorityLoads.length,
    rulePrioritySatisfactionRate,
    priorityReservationCount: priorityPlan.reservations.length,
    priorityReservationSatisfiedCount:
      satisfiedPriorityReservationCount,
    roleCoverageTargetCount:
      optimized.roleCoverageSummary?.targetDistinctCount || 0,
    roleCoverageAchievedCount:
      optimized.roleCoverageSummary?.achievedDistinctCount || 0,
    roleCoverageShortfall:
      optimized.roleCoverageSummary?.shortfall || 0,
    roleCoverageRate:
      optimized.roleCoverageSummary?.coverageRate ?? 1,
    hardConflictCount: finalValidation.conflicts.length
  };

  emitProgress(
    'checking-quality-gates',
    '正在確認規則優先、LLM 覆蓋率與 CSP 介入比例。',
    qualityMetrics
  );
  if (requireLlm && rulePrioritySatisfactionRate < 1) {
    throw orchestratorError(
      'RULE_PRIORITY_NOT_FULLY_SATISFIED',
      '有規則人員未全部優先安排，結果不套用。',
      qualityMetrics
    );
  }
  if (
    requireLlm
    && satisfiedPriorityReservationCount < priorityPlan.reservations.length
  ) {
    throw orchestratorError(
      'RULE_PRIORITY_RESERVATION_CHANGED',
      '有規則的人員安排在最佳化階段被改動，本次結果不採用。',
      qualityMetrics
    );
  }
  if (requireLlm && llmCoverage < minimumLlmCoverage) {
    throw orchestratorError(
      'LLM_COVERAGE_BELOW_MINIMUM',
      'LLM 排班覆蓋率低於最低標準，結果不套用。',
      qualityMetrics
    );
  }
  if (requireLlm && cspContributionRate > maximumCspContribution) {
    throw orchestratorError(
      'CSP_CONTRIBUTION_LIMIT_EXCEEDED',
      'CSP 補格或改動超過安全比例，結果不套用。',
      qualityMetrics
    );
  }

  emitProgress('completed', '大堂排班完成。');
  const finalLoads = calculateLoad({
    people: context.people,
    rules: context.rules,
    candidateMatrix: matrix,
    baselineAssignments: context.baselineAssignments,
    childrenReadOnlyReservations: context.childrenReadOnlyReservations,
    plannedAssignments: optimized.assignments,
    personTargets
  });
  return {
    ok: true,
    targetSection: 'main',
    assignments: toDisplayAssignments(optimized.assignments, context),
    canonicalAssignments: optimized.assignments,
    mutableCellCount: context.targetSlots.length,
    unfilled: optimized.unfilled,
    repairSummary: {
      ...optimized.repairSummary,
      consecutiveSoftRepair: softRepairSummary
    },
    optimizerStatus: optimized.status,
    optimizerMetrics: optimized.metrics,
    roleCoverageSummary: optimized.roleCoverageSummary,
    validatedHash: finalValidation.validatedHash,
    qualityMetrics,
    llmCoverage: qualityMetrics.llmCoverage,
    llmAssignedCount: qualityMetrics.llmAssignedCount,
    cspFilledCount: qualityMetrics.cspFilledCount,
    cspChangedCount: qualityMetrics.cspChangedCount,
    cspContributionRate: qualityMetrics.cspContributionRate,
    rulePrioritySatisfactionRate:
      qualityMetrics.rulePrioritySatisfactionRate,
    hardConflictCount: qualityMetrics.hardConflictCount,
    modelName: llmResult?.modelName || null,
    balanceSummary: finalLoads,
    ruleSummary: {
      activeRules: context.rules.length,
      warnings: context.warnings
    },
    llmSummary: llmResult
      ? {
          used: !llmResult.errorCode,
          correctionUsed: Boolean(llmResult.correctionUsed),
          initialDraftValid: Boolean(llmResult.validation?.valid),
          modelName: llmResult.modelName,
          inputBytes: llmResult.inputBytes,
          inputTokens: llmResult.inputTokens,
          protocolRepairs: llmResult.protocolRepairs,
          boundedRepair: llmResult.boundedRepair,
          consecutiveSoftRepair: softRepairSummary,
          errorCode: llmResult.errorCode,
          errorMessage: llmResult.errorMessage,
          errorDetails: llmResult.errorDetails
        }
      : { used: false }
  };
}
