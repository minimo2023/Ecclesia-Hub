import { Type } from '@google/genai';

export const schedulingTools = [{
  name: 'validate_global_draft',
  description: 'Submit one compact, complete main-hall schedule vector for deterministic validation.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      globalPlan: {
        type: Type.OBJECT,
        properties: {
          personTargets: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                personId: { type: Type.STRING },
                periodTarget: { type: Type.INTEGER },
                rationaleCode: { type: Type.STRING }
              },
              required: [
                'personId',
                'periodTarget',
                'rationaleCode'
              ]
            }
          },
          schedulingPriorities: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                priorityCode: { type: Type.STRING },
                rank: { type: Type.INTEGER }
              },
              required: ['priorityCode', 'rank']
            }
          },
          decisionSummary: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                code: { type: Type.STRING },
                subjectId: { type: Type.STRING }
              },
              required: ['code', 'subjectId']
            }
          }
        },
        required: ['personTargets', 'schedulingPriorities', 'decisionSummary']
      },
      assignmentPairs: {
        type: Type.ARRAY,
        description: 'Atomic compact pairs formatted exactly as "cellIndex|personId".',
        items: { type: Type.STRING }
      },
      unfilledCellIndexes: {
        type: Type.ARRAY,
        items: { type: Type.INTEGER }
      }
    },
    required: [
      'globalPlan',
      'assignmentPairs',
      'unfilledCellIndexes'
    ]
  }
}];
