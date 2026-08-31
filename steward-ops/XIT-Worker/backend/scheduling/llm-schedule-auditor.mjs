import crypto from 'crypto';
import {
  FunctionCallingConfigMode,
  GoogleGenAI,
  Type
} from '@google/genai';
import { generateCandidateMatrix } from './candidate-matrix.mjs';
import { calculateLoad } from './load-calculator.mjs';
import {
  buildSchedulingContext,
  toDisplayAssignments
} from './scheduling-context.mjs';
import { validateSchedule } from './schedule-validator.mjs';
import { cellKey } from './rule-utils.mjs';
import { resolveSchedulingModel } from './scheduling-model-policy.mjs';

function auditError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

const cellSchema = {
  type: Type.OBJECT,
  properties: {
    date: { type: Type.STRING },
    roleId: { type: Type.STRING }
  },
  required: ['date', 'roleId']
};

export const auditorTools = [{
  name: 'submit_swap_suggestions',
  description: 'Submit optional single-cell replacements that may improve global load balance.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      suggestions: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            cell: cellSchema,
            sourcePersonId: { type: Type.STRING },
            targetPersonId: { type: Type.STRING },
            reasonCode: { type: Type.STRING }
          },
          required: [
            'cell',
            'sourcePersonId',
            'targetPersonId',
            'reasonCode'
          ]
        }
      }
    },
    required: ['suggestions']
  }
}];

function stableHash(value) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex');
}

function variance(values) {
  if (!values.length) return 0;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + ((value - average) ** 2), 0);
}

function loadMetrics(loads) {
  const values = Object.values(loads);
  return {
    absoluteTargetGap: values.reduce(
      (sum, load) => sum + Math.abs(load.targetGap),
      0
    ),
    normalizedLoadVariance: Number(variance(
      values.map((load) => load.normalizedLoad)
    ).toFixed(6))
  };
}

function calculateAuditLoads(context, candidateMatrix, assignments) {
  return calculateLoad({
    people: context.people,
    rules: context.rules,
    candidateMatrix,
    baselineAssignments: context.baselineAssignments,
    childrenReadOnlyReservations: context.childrenReadOnlyReservations,
    plannedAssignments: assignments
  });
}

function validateSourceSchedule(context, assignments) {
  const validation = validateSchedule({
    assignments,
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
  if (!validation.valid) {
    throw auditError(
      'AUDIT_SOURCE_INVALID',
      '目前班表尚未通過硬規則驗證，不能進行公平性稽核。',
      { conflicts: validation.conflicts }
    );
  }
  return validation;
}

function parseToolSuggestions(result) {
  const calls = result?.response?.functionCalls?.() || [];
  const call = calls.find((item) => item.name === 'submit_swap_suggestions');

  if (!call) {
    throw auditError(
      'AUDIT_TOOL_CALL_INVALID',
      'AI 稽核沒有依約回傳結構化建議；本次結果不採用。'
    );
  }

  if (!Array.isArray(call.args?.suggestions)) {
    throw auditError(
      'AUDIT_TOOL_CALL_INVALID',
      'AI 稽核工具參數格式不完整；本次結果不採用。'
    );
  }

  return call.args.suggestions;
}

function buildPrompt({ context, candidateMatrix, assignments, loads }) {
  const outliers = Object.values(loads)
    .filter((load) => load.targetGap !== 0)
    .map((load) => ({
      personId: load.personId,
      assignedCount: load.assignedCount,
      periodTarget: load.periodTarget,
      targetGap: load.targetGap,
      normalizedLoad: load.normalizedLoad,
      opportunityWeight: load.opportunityWeight,
      limits: load.limits
    }))
    .sort((left, right) => (
      left.targetGap - right.targetGap
      || left.personId.localeCompare(right.personId)
    ));
  const cells = candidateMatrix.map((cell) => ({
    date: cell.date,
    roleId: cell.roleId,
    assignedPersonId: assignments[cell.key],
    eligiblePersonIds: cell.eligible
  }));
  const rules = context.rules.map((rule) => ({
    ruleId: rule.ruleId,
    type: rule.type,
    personId: rule.personId,
    personIds: rule.personIds,
    roleId: rule.roleId,
    roleIds: rule.roleIds,
    date: rule.date,
    dates: rule.dates,
    dateRange: rule.dateRange,
    period: rule.period,
    maxCount: rule.maxCount
  }));

  return [
    'Audit this complete main-hall schedule globally.',
    'Suggest at most three single-cell replacements.',
    'The target person must be in that cell eligiblePersonIds.',
    'Prefer moving one assignment from targetGap < 0 to targetGap > 0.',
    'Do not provide prose. Call submit_swap_suggestions exactly once.',
    'The server will reject every suggestion that violates a hard rule or fails to improve load.',
    JSON.stringify({ outliers, cells, rules })
  ].join('\n');
}

function validateSuggestions({
  rawSuggestions,
  context,
  candidateMatrix,
  assignments,
  sourceLoads
}) {
  const matrixByKey = new Map(candidateMatrix.map((cell) => [cell.key, cell]));
  const sourceMetrics = loadMetrics(sourceLoads);
  const accepted = [];
  const rejected = [];
  const seen = new Set();

  for (const suggestion of rawSuggestions.slice(0, 12)) {
    const key = cellKey(suggestion.cell?.date, suggestion.cell?.roleId);
    const dedupeKey = `${key}__${suggestion.targetPersonId}`;
    const cell = matrixByKey.get(key);
    const sourcePersonId = assignments[key];
    let rejectionCode = null;

    if (seen.has(dedupeKey)) rejectionCode = 'DUPLICATE_SUGGESTION';
    else if (!cell) rejectionCode = 'UNKNOWN_MUTABLE_CELL';
    else if (!sourcePersonId) rejectionCode = 'SOURCE_CELL_EMPTY';
    else if (sourcePersonId !== suggestion.sourcePersonId) {
      rejectionCode = 'SOURCE_PERSON_MISMATCH';
    } else if (sourcePersonId === suggestion.targetPersonId) {
      rejectionCode = 'NO_CHANGE';
    } else if (!cell.eligible.includes(suggestion.targetPersonId)) {
      rejectionCode = 'TARGET_NOT_ELIGIBLE';
    }
    seen.add(dedupeKey);
    if (rejectionCode) {
      rejected.push({ key, code: rejectionCode });
      continue;
    }

    const proposed = {
      ...assignments,
      [key]: suggestion.targetPersonId
    };
    const validation = validateSchedule({
      assignments: proposed,
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
    if (!validation.valid) {
      rejected.push({
        key,
        code: 'HARD_RULE_VIOLATION',
        conflicts: validation.conflicts.slice(0, 5)
      });
      continue;
    }

    const proposedLoads = calculateAuditLoads(context, candidateMatrix, proposed);
    const proposedMetrics = loadMetrics(proposedLoads);
    const improvesGap = proposedMetrics.absoluteTargetGap
      < sourceMetrics.absoluteTargetGap;
    const improvesVariance = proposedMetrics.absoluteTargetGap
      <= sourceMetrics.absoluteTargetGap
      && proposedMetrics.normalizedLoadVariance
        < sourceMetrics.normalizedLoadVariance;
    if (!improvesGap && !improvesVariance) {
      rejected.push({ key, code: 'NO_MEASURABLE_IMPROVEMENT' });
      continue;
    }

    const displayAssignment = toDisplayAssignments({
      [key]: suggestion.targetPersonId
    }, context);
    accepted.push({
      cell: {
        date: suggestion.cell.date,
        roleId: suggestion.cell.roleId
      },
      sourceKey: Object.keys(displayAssignment)[0],
      sourcePersonId,
      sourcePerson: context.idToName[sourcePersonId],
      targetPersonId: suggestion.targetPersonId,
      targetPerson: context.idToName[suggestion.targetPersonId],
      reasonCode: suggestion.reasonCode,
      expectedImprovement: {
        absoluteTargetGapDelta:
          proposedMetrics.absoluteTargetGap - sourceMetrics.absoluteTargetGap,
        normalizedLoadVarianceDelta: Number((
          proposedMetrics.normalizedLoadVariance
          - sourceMetrics.normalizedLoadVariance
        ).toFixed(6))
      },
      validatedHash: validation.validatedHash
    });
    if (accepted.length >= 3) break;
  }
  return { accepted, rejected, sourceMetrics };
}

function prepareAuditState(payload) {
  const context = buildSchedulingContext({
    ...payload,
    targetSection: 'main'
  });
  const assignments = context.draftPreferences;
  const sourceValidation = validateSourceSchedule(context, assignments);
  const candidateMatrix = generateCandidateMatrix({
    targetSlots: context.targetSlots,
    people: context.people,
    rules: context.rules,
    lockedKeys: context.lockedKeys,
    lockedAssignments: context.lockedAssignments,
    baselineAssignments: context.baselineAssignments,
    childrenReadOnlyReservations: context.childrenReadOnlyReservations
  });
  const sourceLoads = calculateAuditLoads(context, candidateMatrix, assignments);
  const sourceScheduleHash = stableHash({
    snapshotHash: context.snapshotHash,
    assignments: Object.entries(assignments).sort(([a], [b]) => a.localeCompare(b))
  });
  return {
    context,
    assignments,
    sourceValidation,
    candidateMatrix,
    sourceLoads,
    sourceScheduleHash
  };
}

export function validateAuditSuggestion({
  payload,
  suggestion,
  expectedSourceScheduleHash
} = {}) {
  if (!payload || !suggestion) {
    throw auditError('AUDIT_SUGGESTION_REQUIRED', '缺少待驗證的換班建議。');
  }
  if (!expectedSourceScheduleHash) {
    throw auditError(
      'AUDIT_SOURCE_HASH_REQUIRED',
      '缺少換班建議所屬的班表版本。'
    );
  }
  const prepared = prepareAuditState(payload);
  if (prepared.sourceScheduleHash !== expectedSourceScheduleHash) {
    throw auditError(
      'AUDIT_SUGGESTION_STALE',
      '班表已更新，這筆稽核建議已過期。'
    );
  }
  const validated = validateSuggestions({
    rawSuggestions: [suggestion],
    context: prepared.context,
    candidateMatrix: prepared.candidateMatrix,
    assignments: prepared.assignments,
    sourceLoads: prepared.sourceLoads
  });
  if (!validated.accepted.length) {
    throw auditError(
      'AUDIT_SUGGESTION_INVALID',
      '這筆建議已不符合目前班表或沒有可驗證的改善。',
      { rejectedSuggestions: validated.rejected }
    );
  }
  const accepted = validated.accepted[0];
  return {
    suggestion: accepted,
    assignmentPatch: {
      [accepted.sourceKey]: accepted.targetPerson
    },
    sourceScheduleHash: prepared.sourceScheduleHash
  };
}

function createTimeoutSignal(externalSignal, timeoutMs) {
  const controller = new AbortController();
  const abort = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) abort();
  else externalSignal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(
    auditError('AUDIT_TIMEOUT', 'LLM 稽核逾時。')
  ), timeoutMs);
  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', abort);
    }
  };
}

function createAuditorModel({ apiKey, modelName }) {
  const ai = new GoogleGenAI({ apiKey });
  const majorVersion = Number(
    modelName.match(/^gemini-(\d+)(?:\.|-)?.*flash/)?.[1]
  );
  const thinkingConfig = majorVersion >= 3
    ? { thinkingLevel: 'minimal' }
    : { thinkingBudget: 0 };
  return {
    async generateContent(prompt, { signal } = {}) {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          abortSignal: signal,
          tools: [{ functionDeclarations: auditorTools }],
          toolConfig: {
            functionCallingConfig: {
              mode: FunctionCallingConfigMode.ANY,
              allowedFunctionNames: ['submit_swap_suggestions']
            }
          },
          temperature: 0.1,
          maxOutputTokens: 2048,
          thinkingConfig
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

export async function auditSchedule({
  payload,
  apiKey,
  modelName,
  timeoutMs = 60000,
  signal,
  model: injectedModel
} = {}) {
  if (!payload) throw auditError('AUDIT_PAYLOAD_REQUIRED', '缺少稽核班表資料。');
  if (!apiKey && !injectedModel) {
    throw auditError('AUDIT_API_KEY_MISSING', '未設定 Gemini 稽核金鑰。');
  }
  const effectiveModelName = resolveSchedulingModel(modelName);

  const prepared = prepareAuditState(payload);
  const {
    context,
    assignments,
    sourceValidation,
    candidateMatrix,
    sourceLoads,
    sourceScheduleHash
  } = prepared;
  const outlierCount = Object.values(sourceLoads)
    .filter((load) => load.targetGap !== 0).length;
  if (!outlierCount) {
    return {
      suggestions: [],
      rejectedSuggestions: [],
      sourceScheduleHash,
      sourceValidatedHash: sourceValidation.validatedHash,
      sourceMetrics: loadMetrics(sourceLoads),
      outlierCount
    };
  }

  const model = injectedModel || createAuditorModel({
    apiKey,
    modelName: effectiveModelName
  });
  const prompt = buildPrompt({
    context,
    candidateMatrix,
    assignments,
    loads: sourceLoads
  });
  if (Buffer.byteLength(prompt, 'utf8') > 524288) {
    throw auditError('AUDIT_CONTEXT_TOO_LARGE', '稽核上下文超過安全上限。');
  }

  const timeout = createTimeoutSignal(signal, timeoutMs);
  try {
    let result = await model.generateContent(prompt, {
      signal: timeout.signal
    });
    let rawSuggestions;
    let toolRetryUsed = false;
    try {
      rawSuggestions = parseToolSuggestions(result);
    } catch (error) {
      if (error.code !== 'AUDIT_TOOL_CALL_INVALID') throw error;
      toolRetryUsed = true;
      result = await model.generateContent([
        prompt,
        'Your previous response did not call submit_swap_suggestions.',
        'Call submit_swap_suggestions now. If no improvement exists, call it with {"suggestions":[]}.',
        'Do not return prose.'
      ].join('\n'), {
        signal: timeout.signal
      });
      rawSuggestions = parseToolSuggestions(result);
    }
    const validated = validateSuggestions({
      rawSuggestions,
      context,
      candidateMatrix,
      assignments,
      sourceLoads
    });
    return {
      suggestions: validated.accepted,
      rejectedSuggestions: validated.rejected,
      sourceScheduleHash,
      sourceValidatedHash: sourceValidation.validatedHash,
      sourceMetrics: validated.sourceMetrics,
      outlierCount,
      modelName: effectiveModelName,
      toolRetryUsed
    };
  } catch (error) {
    if (timeout.signal.aborted) {
      throw auditError('AUDIT_TIMEOUT', 'LLM 稽核逾時。');
    }
    const errorText = String(error?.message || error);
    if (error?.status === 429 || /\b429\b|quota exceeded|too many requests/i.test(errorText)) {
      throw auditError(
        'AUDIT_LLM_QUOTA_EXCEEDED',
        'Gemini 稽核配額目前不可用。',
        { retryable: true }
      );
    }
    throw error;
  } finally {
    timeout.cleanup();
  }
}
