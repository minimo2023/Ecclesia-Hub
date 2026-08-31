import {
  FunctionCallingConfigMode,
  GoogleGenAI
} from '@google/genai';
import { resolveSchedulingModel } from './scheduling-model-policy.mjs';
import { schedulingTools } from './scheduling-tools.mjs';

export const DEFAULT_GLOBAL_PLANNER_MAX_INPUT_BYTES = 384 * 1024;
export const DEFAULT_GLOBAL_PLANNER_MAX_INPUT_TOKENS = 90000;

function plannerError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function responseDiagnostics(result) {
  const response = result?.response;
  const candidate = response?.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  const usage = response?.usageMetadata || {};
  return {
    finishReason: candidate?.finishReason || 'UNKNOWN',
    responsePartTypes: parts.map((part) => (
      part.functionCall ? 'functionCall'
        : part.thought ? 'thought'
          : part.text ? 'text'
            : 'other'
    )).join(','),
    promptTokenCount: usage.promptTokenCount || 0,
    candidateTokenCount: usage.candidatesTokenCount || 0,
    thoughtsTokenCount: usage.thoughtsTokenCount || 0,
    totalTokenCount: usage.totalTokenCount || 0
  };
}

function parseToolCall(result, candidateMatrix, minimumDraftCoverage = 0.95) {
  const calls = result?.response?.functionCalls?.() || [];
  const call = calls.find((item) => item.name === 'validate_global_draft');
  if (!call) {
    throw plannerError(
      'LLM_TOOL_CALL_MISSING',
      'LLM 未呼叫 validate_global_draft',
      responseDiagnostics(result)
    );
  }
  const args = call.args;
  if (!args
    || !args.globalPlan
    || !Array.isArray(args.globalPlan.personTargets)
    || (!Array.isArray(args.assignmentPairs)
      && (!Array.isArray(args.assignmentCellIndexes)
        || !Array.isArray(args.assignmentPersonIds)))
    || !Array.isArray(args.unfilledCellIndexes)) {
    throw plannerError('LLM_TOOL_SCHEMA_INVALID', 'LLM 工具參數格式不完整');
  }
  const protocolRepairs = [];
  const unfilledIndexes = new Set();
  for (const rawIndex of args.unfilledCellIndexes) {
    const cellIndex = Number(rawIndex);
    if (
      Number.isInteger(cellIndex)
      && cellIndex >= 0
      && cellIndex < candidateMatrix.length
    ) {
      unfilledIndexes.add(cellIndex);
    } else {
      protocolRepairs.push({ code: 'DROPPED_INVALID_UNFILLED_INDEX' });
    }
  }
  const personByCellIndex = new Map();
  const rawPairs = Array.isArray(args.assignmentPairs)
    ? args.assignmentPairs.map((pair) => {
        const text = String(pair || '');
        const divider = text.indexOf('|');
        return divider > 0
          ? [text.slice(0, divider), text.slice(divider + 1)]
          : [Number.NaN, ''];
      })
    : args.assignmentCellIndexes.map((cellIndex, vectorIndex) => [
        cellIndex,
        args.assignmentPersonIds[vectorIndex]
      ]);

  for (const [rawIndex, rawPersonId] of rawPairs) {
    const cellIndex = Number(rawIndex);
    const personId = String(rawPersonId || '').trim();
    if (
      !Number.isInteger(cellIndex)
      || cellIndex < 0
      || cellIndex >= candidateMatrix.length
      || !personId
    ) {
      protocolRepairs.push({ code: 'DROPPED_MALFORMED_ASSIGNMENT_PAIR' });
      continue;
    }
    if (personByCellIndex.has(cellIndex)) {
      protocolRepairs.push({ code: 'DROPPED_DUPLICATE_ASSIGNMENT_PAIR' });
      continue;
    }
    if (unfilledIndexes.delete(cellIndex)) {
      protocolRepairs.push({ code: 'ASSIGNMENT_OVERRIDES_UNFILLED_INDEX' });
    }
    personByCellIndex.set(cellIndex, personId);
  }

  let inferredUnfilledCount = 0;
  candidateMatrix.forEach((_cell, index) => {
    if (!personByCellIndex.has(index) && !unfilledIndexes.has(index)) {
      unfilledIndexes.add(index);
      inferredUnfilledCount += 1;
    }
  });
  if (inferredUnfilledCount) {
    protocolRepairs.push({
      code: 'INFERRED_MISSING_CELLS_AS_UNFILLED',
      count: inferredUnfilledCount
    });
  }

  const draftCoverage = candidateMatrix.length
    ? personByCellIndex.size / candidateMatrix.length
    : 1;
  if (draftCoverage < minimumDraftCoverage) {
    throw plannerError(
      'LLM_DRAFT_COVERAGE_TOO_LOW',
      'LLM 草稿可用配對過少，無法代表全局規劃。',
      {
        expected: candidateMatrix.length,
        assigned: personByCellIndex.size,
        minimumDraftCoverage,
        actualDraftCoverage: draftCoverage
      }
    );
  }

  const proposedAssignments = [];
  const unfilled = [];
  candidateMatrix.forEach((cell, index) => {
    const personId = personByCellIndex.get(index) || '';
    if (!personId || unfilledIndexes.has(index)) {
      unfilled.push({
        date: cell.date,
        roleId: cell.roleId,
        reasonCode: 'LLM_LEFT_UNFILLED'
      });
      return;
    }
    const appliedRuleIds = cell.softRuleIdsByPerson
      ?.find((entry) => entry.personId === personId)?.ruleIds || [];
    proposedAssignments.push({
      date: cell.date,
      roleId: cell.roleId,
      personId,
      appliedRuleIds
    });
  });

  return {
    globalPlan: args.globalPlan,
    proposedAssignments,
    unfilled,
    protocolRepairs
  };
}

function compactPlannerContext(context) {
  return {
    version: '2.2-compact',
    basicRules: context.basicRules,
    priorityRequirements: context.priorityRequirements,
    priorityReservations: context.priorityReservations,
    roleCoverageRequirements: context.roleCoverageRequirements.map((item) => [
      item.roleId,
      item.targetDistinctAssignments,
      item.requiredCellIndexes,
      item.eligiblePersonIds
    ]),
    roleCoverageColumns: [
      'roleId',
      'targetDistinctAssignments',
      'requiredCellIndexes',
      'eligiblePersonIds'
    ],
    peopleColumns: [
      'personId',
      'baselineServiceCount',
      'eligibleDateCount',
      'opportunityWeight',
      'deterministicTarget',
      'rulePriorityMinimum',
      'rulePriorityTypes'
    ],
    peopleRows: context.people.map((person) => [
      person.personId,
      person.baselineServiceCount,
      person.eligibleDateCount,
      person.opportunityWeight,
      person.deterministicTarget,
      person.rulePriorityMinimum,
      person.rulePriorityTypes
    ]),
    ruleColumns: [
      'ruleId',
      'type',
      'scope',
      'personId',
      'roleId',
      'personIds',
      'roleIds',
      'date',
      'dates',
      'dateRange',
      'maxCount',
      'period',
      'condition',
      'action',
      'weight'
    ],
    ruleRows: context.rules.map((rule) => [
      rule.ruleId,
      rule.type,
      rule.scope,
      rule.personId,
      rule.roleId,
      rule.personIds,
      rule.roleIds,
      rule.date,
      rule.dates,
      rule.dateRange,
      rule.maxCount,
      rule.period,
      rule.condition,
      rule.action,
      rule.weight
    ]),
    cellColumns: [
      'cellIndex',
      'date',
      'roleId',
      'required',
      'candidatePersonIds'
    ],
    cellRows: context.cells.map((cell) => [
      cell.cellIndex,
      cell.date,
      cell.roleId,
      cell.required,
      cell.candidatePersonIds
    ]),
    existingPreferenceColumns: ['date', 'roleId', 'personId'],
    existingPreferenceRows: context.existingPreferences.map((item) => [
      item.date,
      item.roleId,
      item.personId
    ])
  };
}

function buildPrompt({
  candidateMatrix,
  people,
  rules,
  loadSummary,
  priorityReservations,
  existingPreferences
}) {
  const priorityRequirements = people
    .map((person) => {
      const load = loadSummary[person.id] || {};
      if (!load.rulePriorityMinimum) return null;
      return {
        personId: person.id,
        minimumAssignments: load.rulePriorityMinimum,
        ruleTypes: load.rulePriorityTypes || [],
        eligibleCellIndexes: candidateMatrix
          .map((cell, cellIndex) => (
            cell.eligible.includes(person.id) ? cellIndex : null
          ))
          .filter((cellIndex) => cellIndex !== null)
      };
    })
    .filter(Boolean)
    .sort((left, right) => (
      left.eligibleCellIndexes.length - right.eligibleCellIndexes.length
      || left.personId.localeCompare(right.personId)
    ));
  const coverageByRole = new Map();
  candidateMatrix.forEach((cell, cellIndex) => {
    if (cell.required === false) return;
    const coverage = coverageByRole.get(cell.roleId) || {
      roleId: cell.roleId,
      requiredCellIndexes: [],
      eligiblePersonIds: new Set()
    };
    coverage.requiredCellIndexes.push(cellIndex);
    for (const personId of cell.eligible || []) {
      if (personId !== '空班') {
        coverage.eligiblePersonIds.add(personId);
      }
    }
    coverageByRole.set(cell.roleId, coverage);
  });
  const roleCoverageRequirements = [...coverageByRole.values()]
    .map((coverage) => ({
      roleId: coverage.roleId,
      targetDistinctAssignments: Math.min(
        coverage.requiredCellIndexes.length,
        coverage.eligiblePersonIds.size
      ),
      requiredCellIndexes: coverage.requiredCellIndexes,
      eligiblePersonIds: [...coverage.eligiblePersonIds].sort()
    }))
    .sort((left, right) => left.roleId.localeCompare(right.roleId));
  const context = {
    basicRules: [
      'Schedule rule-priority people before unrestricted people.',
      'Rule priority order: fixed_assignment, only_available, preferred, available, then unrestricted.',
      'Only schedule cells listed in cells.',
      'Use only candidatePersonIds listed for that cell.',
      'One person may serve at most once per date across main and children.',
      'Every required cell must be filled.',
      'Hard rules cannot be violated.',
      'Balance ruled and unruled workers across the whole period.',
      'Within each role, use as many distinct eligible people as possible before repeating anyone.'
    ],
    priorityRequirements,
    roleCoverageRequirements,
    priorityReservations: priorityReservations.map((reservation) => ({
      cellIndex: reservation.cellIndex,
      personId: reservation.personId,
      ruleTypes: reservation.ruleTypes || []
    })),
    people: people
      .filter((person) => person.id !== '空班')
      .map((person) => ({
      personId: person.id,
      baselineServiceCount: loadSummary[person.id]?.baselineServiceCount || 0,
      eligibleDateCount: loadSummary[person.id]?.eligibleDateCount || 0,
      opportunityWeight: loadSummary[person.id]?.opportunityWeight || 0,
      deterministicTarget: loadSummary[person.id]?.periodTarget || 0,
      rulePriorityMinimum:
        loadSummary[person.id]?.rulePriorityMinimum || 0,
      rulePriorityTypes:
        loadSummary[person.id]?.rulePriorityTypes || []
    })),
    rules: rules.map((rule) => ({
      ruleId: rule.ruleId,
      type: rule.type,
      scope: rule.scope,
      personId: rule.personId,
      roleId: rule.roleId,
      personIds: rule.personIds,
      roleIds: rule.roleIds,
      date: rule.date,
      dates: rule.dates,
      dateRange: rule.dateRange,
      maxCount: rule.maxCount,
      period: rule.period,
      condition: rule.condition,
      action: rule.action,
      weight: rule.weight
    })),
    cells: candidateMatrix.map((cell, cellIndex) => ({
      cellIndex,
      date: cell.date,
      roleId: cell.roleId,
      required: cell.required,
      candidatePersonIds: (cell.eligible || []).filter((id) => id !== '空班')
    })),
    existingPreferences: Object.entries(existingPreferences || {}).map(([key, personId]) => {
      const [date, roleId] = key.split('__');
      return { date, roleId, personId };
    })
  };
  return [
    'Plan the complete main-hall schedule globally, not month by month.',
    'The priorityReservations array contains exact mandatory cellIndex/personId pairs. Copy every one into assignmentPairs unchanged.',
    'Never replace or omit a priority reservation.',
    'The priorityRequirements array is mandatory: satisfy every minimumAssignments value before assigning unrestricted people.',
    'Use each priority person only in their eligibleCellIndexes.',
    'Do not call validate_global_draft until every priority requirement is satisfied.',
    'First satisfy every rulePriorityMinimum and assign fixed, only-available, preferred, and scarce people.',
    'Only after all rule-priority minimums are met may unrestricted people fill remaining cells.',
    'For every roleCoverageRequirement, maximize distinct eligible people used in that role before repeating a person in the same role.',
    'Role coverage is subordinate to hard rules and priority reservations, but takes precedence over preserving existing preferences.',
    'Then balance target gaps and opportunity-normalized load.',
    'Return assignmentPairs as compact atomic strings formatted exactly "cellIndex|personId".',
    'Every cellIndex must appear exactly once in assignmentPairs or unfilledCellIndexes.',
    'Do not return separate index/person arrays. Do not repeat date or roleId in the output.',
    'Use unfilledCellIndexes only when no legal assignment exists.',
    'personTargets contains only exceptional target adjustments; return an empty array when deterministicTarget is suitable.',
    'Every person is allowed to be scheduled for TWO consecutive weeks exactly ONCE per role per month. Do NOT schedule a person for 3 consecutive weeks, and do NOT schedule them for two separate consecutive pairs (Empty shifts "空班" are excluded from this consecutive restriction).',
    'Return no free-form answer. Call validate_global_draft exactly once with the complete draft.',
    'Use concise rationale codes; do not reveal chain-of-thought.',
    JSON.stringify(compactPlannerContext(context))
  ].join('\n');
}

export function estimateGlobalDraftContext(options) {
  const prompt = buildPrompt(options);
  const inputBytes = Buffer.byteLength(prompt, 'utf8');
  return {
    prompt,
    inputBytes,
    estimatedTokens: Math.ceil(inputBytes / 4)
  };
}

function createCombinedSignal(externalSignal, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) abort();
  else externalSignal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(
      plannerError('LLM_TIMEOUT', 'LLM 全局規劃逾時')
    );
  }, timeoutMs);
  return {
    signal: controller.signal,
    didTimeout() {
      return timedOut;
    },
    cleanup() {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', abort);
    }
  };
}

function feedbackForValidation(validation, candidateMatrix) {
  return {
    valid: false,
    conflicts: (validation.conflicts || validation.errors || []).slice(0, 30),
    relevantCandidates: (validation.conflicts || [])
      .flatMap((conflict) => conflict.cells || [conflict.cellKey])
      .filter(Boolean)
      .map((key) => {
        const cellIndex = candidateMatrix.findIndex((item) => item.key === key);
        const cell = candidateMatrix[cellIndex];
        return cell ? { cellIndex, cellKey: key, personIds: cell.eligible } : null;
      })
      .filter(Boolean)
      .slice(0, 30),
    instruction: 'Correct only the conflicting cells and call validate_global_draft once more with the full assignmentPairs array.'
  };
}

function assessBoundedRepair(
  validation,
  candidateMatrix,
  maximumRepairRate = 0.05
) {
  const conflicts = validation.conflicts || validation.errors || [];
  const repairableCodes = new Set(['SAME_DAY_DUPLICATE']);
  const repairable = conflicts.length > 0
    && conflicts.every((conflict) => repairableCodes.has(conflict.code));
  const estimatedChangeCount = conflicts.reduce((count, conflict) => (
    count + Math.max(1, (conflict.cells?.length || 1) - 1)
  ), 0);
  const maximumChangeCount = Math.floor(
    candidateMatrix.length * maximumRepairRate
  );
  return {
    accepted: repairable
      && estimatedChangeCount <= maximumChangeCount,
    conflictCount: conflicts.length,
    conflictCodes: [
      ...new Set(conflicts.map((conflict) => conflict.code).filter(Boolean))
    ],
    estimatedChangeCount,
    maximumChangeCount,
    maximumRepairRate
  };
}

function plannerThinkingConfig(modelName) {
  const majorVersion = Number(
    modelName.match(/^gemini-(\d+)(?:\.|-)?.*flash/)?.[1]
  );
  return majorVersion >= 3
    ? { thinkingLevel: 'minimal' }
    : { thinkingBudget: 2048 };
}

function createGeminiModel({ apiKey, modelName }) {
  const ai = new GoogleGenAI({ apiKey });
  return {
    countTokens: (prompt) => ai.models.countTokens({
      model: modelName,
      contents: prompt
    }),
    startChat: () => {
      let conversationPrompt = '';
      return {
        async sendMessage(message, { signal } = {}) {
          if (typeof message === 'string') {
            conversationPrompt = message;
          } else {
            conversationPrompt = [
              conversationPrompt,
              'DETERMINISTIC VALIDATOR FEEDBACK:',
              JSON.stringify(message),
              'Return the full corrected vectors by calling validate_global_draft again.'
            ].join('\n');
          }
          const response = await ai.models.generateContent({
            model: modelName,
            contents: conversationPrompt,
            config: {
              abortSignal: signal,
              tools: [{ functionDeclarations: schedulingTools }],
              toolConfig: {
                functionCallingConfig: {
                  mode: FunctionCallingConfigMode.ANY,
                  allowedFunctionNames: ['validate_global_draft']
                }
              },
              temperature: 0.2,
              maxOutputTokens: 12288,
              thinkingConfig: plannerThinkingConfig(modelName)
            }
          });
          return {
            response: {
              functionCalls: () => response.functionCalls || [],
              candidates: response.candidates,
              usageMetadata: response.usageMetadata
            }
          };
        }
      };
    }
  };
}

export async function planGlobalDraft({
  candidateMatrix,
  people,
  rules,
  loadSummary,
  priorityReservations = [],
  existingPreferences = {},
  apiKey,
  validateDraft,
  modelName,
  timeoutMs = 120000,
  maxInputBytes = DEFAULT_GLOBAL_PLANNER_MAX_INPUT_BYTES,
  maxInputTokens = DEFAULT_GLOBAL_PLANNER_MAX_INPUT_TOKENS,
  minimumDraftCoverage = 0.95,
  maximumBoundedRepairRate = 0.05,
  signal,
  model: injectedModel,
  onTelemetry = () => {}
}) {
  if (typeof validateDraft !== 'function') {
    throw plannerError('VALIDATOR_REQUIRED', 'LLM planner 必須取得確定性攔截器');
  }
  const effectiveModelName = resolveSchedulingModel(modelName);
  const model = injectedModel || createGeminiModel({
    apiKey,
    modelName: effectiveModelName
  });
  const contextEstimate = estimateGlobalDraftContext({
    candidateMatrix,
    people,
    rules,
    loadSummary,
    priorityReservations,
    existingPreferences
  });
  const { prompt, inputBytes, estimatedTokens } = contextEstimate;
  onTelemetry(
    'llm-context-ready',
    `LLM 上下文已建立，共 ${inputBytes} bytes。`,
    {
      modelName: effectiveModelName,
      inputBytes,
      matrixCellCount: candidateMatrix.length
    }
  );
  if (inputBytes > maxInputBytes) {
    throw plannerError('AI_CONTEXT_TOO_LARGE', 'LLM 排班上下文超過位元組上限', {
      inputBytes,
      maxInputBytes
    });
  }
  if (estimatedTokens > maxInputTokens) {
    throw plannerError('AI_CONTEXT_TOO_LARGE', 'LLM ?銝?????token 銝?', {
      estimatedTokens,
      maxInputTokens,
      inputBytes
    });
  }
  let inputTokens = null;
  if (typeof model.countTokens === 'function') {
    const countStartedAt = Date.now();
    const tokenResult = await model.countTokens(prompt);
    inputTokens = tokenResult.totalTokens;
    onTelemetry(
      'llm-token-counted',
      `LLM 輸入共 ${inputTokens} tokens。`,
      {
        modelName: effectiveModelName,
        inputTokens,
        tokenCountElapsedMs: Date.now() - countStartedAt
      }
    );
    if (inputTokens > maxInputTokens) {
      throw plannerError('AI_CONTEXT_TOO_LARGE', 'LLM 排班上下文超過 token 上限', {
        inputTokens,
        maxInputTokens
      });
    }
  }

  const abort = createCombinedSignal(signal, timeoutMs);
  try {
    const chat = model.startChat();
    const generationStartedAt = Date.now();
    const firstResult = await chat.sendMessage(prompt, { signal: abort.signal });
    onTelemetry(
      'llm-response-received',
      'LLM 全局排班向量已回傳，正在交給攔截器。',
      {
        modelName: effectiveModelName,
        generationElapsedMs: Date.now() - generationStartedAt,
        ...responseDiagnostics(firstResult)
      }
    );
    let args = parseToolCall(
      firstResult,
      candidateMatrix,
      minimumDraftCoverage
    );
    let validation = validateDraft(args);
    let correctionUsed = false;
    let boundedRepair = assessBoundedRepair(
      validation,
      candidateMatrix,
      maximumBoundedRepairRate
    );

    if (!validation.valid && boundedRepair.accepted) {
      onTelemetry(
        'llm-bounded-repair-approved',
        `攔截器發現 ${boundedRepair.estimatedChangeCount} 格可局部修正，已交給安全引擎處理。`,
        {
          modelName: effectiveModelName,
          ...boundedRepair
        }
      );
    } else if (!validation.valid) {
      correctionUsed = true;
      onTelemetry(
        'llm-correction-requested',
        '攔截器發現草稿衝突，已要求 LLM 僅修正衝突格。',
        {
          modelName: effectiveModelName,
          conflictCount:
            validation.conflicts?.length || validation.errors?.length || 0,
          conflictCodes: [
            ...new Set(
              (validation.conflicts || validation.errors || [])
                .map((conflict) => conflict.code)
                .filter(Boolean)
            )
          ].join(','),
          incompleteCellCount: validation.incompleteCellCount || 0
        }
      );
      const correctionStartedAt = Date.now();
      const correctionResult = await chat.sendMessage([{
        functionResponse: {
          name: 'validate_global_draft',
          response: feedbackForValidation(validation, candidateMatrix)
        }
      }], { signal: abort.signal });
      onTelemetry(
        'llm-correction-response-received',
        'LLM 修正版草稿已回傳，正在再次交給攔截器。',
        {
          modelName: effectiveModelName,
          generationElapsedMs: Date.now() - correctionStartedAt,
          ...responseDiagnostics(correctionResult)
        }
      );
      args = parseToolCall(
        correctionResult,
        candidateMatrix,
        minimumDraftCoverage
      );
      validation = validateDraft(args);
      boundedRepair = assessBoundedRepair(
        validation,
        candidateMatrix,
        maximumBoundedRepairRate
      );
    }

    return {
      globalPlan: args.globalPlan,
      proposedAssignments: args.proposedAssignments,
      unfilled: args.unfilled,
      protocolRepairs: args.protocolRepairs,
      validation,
      boundedRepair,
      correctionUsed,
      modelName: effectiveModelName,
      inputBytes,
      inputTokens
    };
  } catch (error) {
    if (abort.signal.aborted) {
      if (signal?.aborted && !abort.didTimeout()) {
        throw plannerError('LLM_CANCELLED', 'LLM 全局規劃已由使用者取消。');
      }
      throw plannerError('LLM_TIMEOUT', 'LLM 全局規劃逾時');
    }
    const errorText = String(error?.message || error);
    if (error?.status === 429 || /\b429\b|quota exceeded|too many requests/i.test(errorText)) {
      throw plannerError(
        'LLM_QUOTA_EXCEEDED',
        'Gemini 配額目前不可用，已交由確定性安全引擎接手。',
        { retryable: true }
      );
    }
    if (error?.status === 404 || /model.+not found|not supported/i.test(errorText)) {
      throw plannerError(
        'LLM_MODEL_UNAVAILABLE',
        `Gemini 模型 ${effectiveModelName} 目前不可用。`,
        { modelName: effectiveModelName }
      );
    }
    if (
      error?.status >= 500 ||
      /\b50[0234]\b|service unavailable|temporarily unavailable/i.test(errorText)
    ) {
      throw plannerError(
        'LLM_PROVIDER_UNAVAILABLE',
        `Gemini 模型 ${effectiveModelName} 暫時無法服務。`,
        { modelName: effectiveModelName, retryable: true }
      );
    }
    throw error;
  } finally {
    abort.cleanup();
  }
}
