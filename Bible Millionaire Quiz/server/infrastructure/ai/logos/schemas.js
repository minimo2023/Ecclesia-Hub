/**
 * Logos Engine Task Schemas
 * Standardized output formats for all AI tasks.
 */

export const TASK_SCHEMAS = {
    'scripture_segmentation_boundary_review': {
        type: 'object',
        properties: {
            decisions: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        boundaryId: { type: 'string' },
                        decision: { type: 'string', enum: ['KEEP', 'FORBID', 'PREFER'] }
                    },
                    required: ['boundaryId', 'decision']
                }
            }
        },
        required: ['decisions']
    },
    'scripture_segmentation_review_generation': {
        type: 'object',
        properties: {
            results: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        passageId: { type: 'string' },
                        verses: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    verse: { type: 'integer' },
                                    fragments: { type: 'array', minItems: 1, items: { type: 'string' } },
                                    uncertainBoundaries: { type: 'array', items: { type: 'integer' } }
                                },
                                required: ['verse', 'fragments', 'uncertainBoundaries']
                            }
                        }
                    },
                    required: ['passageId', 'verses']
                }
            }
        },
        required: ['results']
    },
    'scripture_order_fragment_generation': {
        type: 'object',
        properties: {
            fragments: {
                type: 'array', minItems: 8, maxItems: 24,
                items: { type: 'string' }
            },
            rationale: { type: 'string' }
        },
        required: ['fragments', 'rationale']
    },
    'scripture_order_fragment_audit': {
        type: 'object',
        properties: {
            results: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        passage_id: { type: 'string' },
                        verdict: { type: 'string', enum: ['PASS', 'REJECT'] },
                        reason: { type: 'string' },
                        awkward_boundaries: { type: 'array', items: { type: 'integer' } }
                    },
                    required: ['passage_id', 'verdict', 'reason', 'awkward_boundaries']
                }
            }
        },
        required: ['results']
    },
    'single_question': {
        type: 'object',
        properties: {
            question: { type: 'string' },
            answer: { type: 'string' },
            distractors: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3 },
            evidence: { type: 'string' },
            category: { type: 'string' }
        },
        required: ['question', 'answer', 'distractors', 'evidence', 'category']
    },
    'batch_questions': {
        type: 'object',
        properties: {
            questions: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        segment_id: { type: 'integer' },
                        status: {
                            type: 'string',
                            enum: ['success', 'need_more_context']
                        },
                        question: { type: 'string' },
                        answer: { type: 'string' },
                        evidence: { type: 'string' },
                        verseRef: { type: 'string' },
                        category: {
                            type: 'string',
                            enum: ['verse_fill', 'verse_fact', 'person', 'geography', 'theology', 'lexicon']
                        }
                    },
                    required: ['segment_id', 'status', 'question', 'answer', 'evidence', 'verseRef', 'category']
                }
            }
        },
        required: ['questions']
    },
    'batch_expedition': {
        type: 'object',
        properties: {
            questions: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        question: { type: 'string' },
                        answer: { type: 'string' },
                        distractors: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3 },
                        evidence: { type: 'string' },
                        category: { type: 'string' }
                    },
                    required: ['question', 'answer', 'distractors', 'evidence', 'category']
                }
            }
        },
        required: ['questions']
    },
    'expedition_question': {
        type: 'object',
        properties: {
            question: { type: 'string' },
            options: { type: 'array', items: { type: 'string' } },
            correctIndex: { type: 'integer' },
            evidence: { type: 'string' },
            questionType: { type: 'string' }
        },
        required: ['question', 'options', 'correctIndex', 'evidence', 'questionType']
    },
    'content_generator': {
        type: 'object',
        properties: {
            scripture: { type: 'string' },
            scriptureReference: { type: 'string' },
            understanding: { type: 'string' },
            meditation: { type: 'string' },
            prayer: { type: 'string' },
            closingWord: { type: 'string' }
        },
        required: ['scripture', 'scriptureReference', 'understanding', 'meditation', 'prayer', 'closingWord']
    },
    'distractor_rules': {
        type: 'object',
        properties: {
            // 固定 5 個誘餌：支援 4/5/6 選一全模式（4選一取前3，5選一取前4，6選一全取）
            distractors: { type: 'array', items: { type: 'string' }, minItems: 5, maxItems: 5 }
        },
        required: ['distractors']
    },
    'question_distractor_repair': {
        type: 'object',
        properties: {
            status: { type: 'string', enum: ['REPAIRABLE', 'UNREPAIRABLE'] },
            reason: { type: 'string' },
            answer_type: { type: 'string' },
            risk_flags: { type: 'array', items: { type: 'string' } },
            distractor_sets: {
                type: 'array',
                minItems: 0,
                maxItems: 3,
                items: {
                    type: 'array',
                    minItems: 5,
                    maxItems: 5,
                    items: { type: 'string' }
                }
            },
            generation_notes: { type: 'array', items: { type: 'string' } }
        },
        required: [
            'status', 'reason', 'answer_type', 'risk_flags',
            'distractor_sets', 'generation_notes'
        ]
    },
    'question_location_fix': {
        type: 'object',
        properties: {
            status: { type: 'string', enum: ['FOUND', 'NOT_FOUND'] },
            chapter: { type: ['integer', 'null'], minimum: 1 },
            verse_start: { type: ['integer', 'null'], minimum: 1 },
            verse_end: { type: ['integer', 'null'], minimum: 1 },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            reason: { type: 'string' },
            evidence_quote: { type: 'string' }
        },
        required: [
            'status', 'chapter', 'verse_start', 'verse_end',
            'confidence', 'reason', 'evidence_quote'
        ]
    },
    'fun_facts': {
        type: 'object',
        properties: {
            facts: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 5 }
        },
        required: ['facts']
    },

    'chapter_analysis': {
        type: 'object',
        properties: {
            structure: { type: 'array', items: { type: 'object', properties: { range: { type: 'string' }, label: { type: 'string' } } } },
            key_themes: { type: 'array', items: { type: 'string' } },
            difficult_terms: { type: 'array', items: { type: 'object', properties: { term: { type: 'string' }, definition: { type: 'string' } } } }
        }
    },
    'knowledge_search': {
        type: 'object',
        properties: {
            results: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        title: { type: 'string' },
                        type: { type: 'string', enum: ['資料', '經文', '辭典', '人物', '地名'] },
                        content: { type: 'string' },
                        link: { type: 'string' }
                    },
                    required: ['title', 'type', 'content']
                }
            },
            direct_answer: { type: 'string' }
        },
        required: ['results']
    },
    'story_theme_classification': {
        type: 'object',
        properties: {
            query_type: { type: 'string', enum: ['character', 'event', 'theme', 'passage', 'invalid'] },
            is_bible_related: { type: 'boolean' },
            normalized_intent: { type: 'string' },
            matched_topic: { type: 'string' },
            availability_status: { type: 'string', enum: ['available', 'generatable', 'ambiguous', 'invalid'] },
            matched_story_id: { type: 'string', nullable: true },
            matched_scripture_refs: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: { book_id: { type: 'string' }, chapter: { type: 'integer' }, verse_start: { type: 'integer' }, verse_end: { type: 'integer' } }
                }
            },
            suggested_story_ids: { type: 'array', items: { type: 'string' } },
            ai_confirmation_message: { type: 'string' }
        },
        required: ['query_type', 'is_bible_related', 'normalized_intent', 'availability_status', 'suggested_story_ids', 'ai_confirmation_message']
    },
    /**
     * STORY V3.0: THE CINEMATIC TURN ENGINE
     * Refactored interaction schema for the "Time Traveler" Meta-Narrative.
     */
    'interaction_engine': {
        type: 'object',
        properties: {
            // Narrative Layer (Flex-Stack)
            narrative: {
                type: 'object',
                properties: {
                    preamble: { type: 'string', nullable: true }, // For the "Preamble Phase"
                    environment: { type: 'string' },               // Deep sensory description
                    dialogue: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: { identity: { type: 'string' }, content: { type: 'string' } }
                        }
                    },
                    action: { type: 'string' }                     // Physical movement/consequence
                },
                required: ['environment', 'dialogue', 'action']
            },
            // Logic Layer (Hidden/Structural)
            logic: {
                type: 'object',
                properties: {
                    system_progress: { type: 'string' },           // Unstoppable canon advancement
                    paradox_prevention: { type: 'string', nullable: true }, // The "Destiny Wall"
                    pacing_score: { type: 'integer' },             // Current arc tension (1-10)
                    is_complete: { type: 'boolean' }               // Trigger for "Extractor" phase
                },
                required: ['system_progress', 'pacing_score', 'is_complete']
            },
            // Meta-Narrative Layer (Navigator)
            navigator_feedback: { type: 'string' },               // The Chrono-Guide's voice
            suggested_actions: { type: 'array', items: { type: 'string' } }
        },
        required: ['narrative', 'logic', 'navigator_feedback', 'suggested_actions']
    },
    'scene_transition': {
        type: 'object',
        properties: {
            transition_text: { type: 'string' },
            background_pressure: { type: 'string' },
            scene_loaded: { type: 'string' }
        },
        required: ['transition_text', 'scene_loaded']
    },
    'action_options': {
        type: 'object',
        properties: {
            mainline: {
                type: 'array',
                items: { type: 'object', properties: { actionId: { type: 'string' }, label: { type: 'string' } }, required: ['actionId', 'label'] }
            },
            interaction: {
                type: 'array',
                items: { type: 'object', properties: { actionId: { type: 'string' }, label: { type: 'string' } }, required: ['actionId', 'label'] }
            },
            dialogue: {
                type: 'array',
                items: { type: 'object', properties: { actionId: { type: 'string' }, label: { type: 'string' } }, required: ['actionId', 'label'] }
            },
            system: {
                type: 'array',
                items: { type: 'object', properties: { actionId: { type: 'string' }, label: { type: 'string' } }, required: ['actionId', 'label'] }
            }
        },
        required: ['mainline', 'interaction', 'dialogue', 'system']
    },
    /**
     * STORY V3.0 State Machine Snapshot
     */
    'story_v3_state': {
        type: 'object',
        properties: {
            persistent: {
                type: 'object',
                properties: {
                    fragments_collected: { type: 'array', items: { type: 'string' } },
                    traveler_stats: { type: 'object' }
                }
            },
            session: {
                type: 'object',
                properties: {
                    source_ref: { type: 'string' },
                    immutable_beats: { type: 'array', items: { type: 'object', properties: { beat_id: { type: 'string' }, is_done: { type: 'boolean' } } } },
                    sync_rate: { type: 'integer' }
                }
            },
            scene: {
                type: 'object',
                properties: {
                    location_id: { type: 'string' },
                    npc_states: { type: 'array', items: { type: 'object' } },
                    current_turn: { type: 'integer' }
                }
            }
        },
        required: ['persistent', 'session', 'scene']
    },
    'scene_assessor': {
        type: 'object',
        properties: {
            text_type: { type: 'string', enum: ['narrative', 'discourse', 'poetry', 'law', 'genealogy', 'vision', 'other'] },
            dramatic_score: { type: 'integer' },
            signals_positive: { type: 'array', items: { type: 'string' } },
            signals_negative: { type: 'array', items: { type: 'string' } },
            recommended_mode: { type: 'string', enum: ['playable_narrative', 'scene_lite', 'lore_reflection', 'non_story_content'] },
            reason: { type: 'string' }
        },
        required: ['text_type', 'dramatic_score', 'recommended_mode', 'reason']
    },
    'lexicon_formatter': {
        type: 'object',
        properties: {
            brief: { type: 'string' },
            narrative: { type: 'string' },
            symbolism: { type: 'string' }
        },
        required: ['brief', 'narrative', 'symbolism']
    },
    'blueprint_builder': {
        type: 'object',
        properties: {
            story: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    title: { type: 'string' },
                    primary_source: { type: 'string' },
                    parallel_refs: { type: 'array', items: { type: 'string' } },
                    immutable_beats: { type: 'array', items: { type: 'string' } },
                    threads: { type: 'array', items: { type: 'string' } },
                    start_scene_id: { type: 'string' }
                },
                required: ['id', 'title', 'primary_source', 'immutable_beats', 'threads', 'start_scene_id']
            },
            npc_archetypes: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: { id: { type: 'string' }, label: { type: 'string' }, social_role: { type: 'string' } },
                    required: ['id', 'label']
                }
            },
            scenes: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        title: { type: 'string' },
                        goal: { type: 'string' },
                        entry_text: { type: 'string' },
                        actions: { type: 'object' }
                    },
                    required: ['id', 'title', 'goal', 'entry_text', 'actions']
                }
            }
        },
        required: ['story', 'npc_archetypes', 'scenes']
    },
    /**
     * DEVOTIONAL V6.1: TWO-STAGE PIPELINE SCHEMAS
     */
    'scripture_selector': {
        type: 'object',
        properties: {
            selectedIndex: { type: 'integer', minimum: 1, maximum: 3 },
            selectedVersion: { type: 'string', enum: ['CUV_TRAD', 'CNV_TRAD', 'TCV_TRAD'] },
            intent: { type: 'string' },
            book: { type: 'string' },
            chapter: { type: 'integer', minimum: 1 },
            verseStart: { type: 'integer', minimum: 1 },
            verseEnd: { type: 'integer', minimum: 1 },
            theme: { type: 'string' },
            reason: { type: 'string' }
        },
        oneOf: [
            { required: ['selectedIndex', 'selectedVersion', 'intent'] },
            { required: ['book', 'chapter', 'verseStart', 'verseEnd', 'theme', 'reason'] }
        ]
    },
    'theology_extractor': {
        type: 'object',
        properties: {
            selected_verse: { type: 'string' },
            verse_text: { type: 'string' },
            theological_insight: { type: 'string' },
            gospel_connection: { type: 'string' },
            prayer_direction: { type: 'string' },
            life_application: { type: 'string' }
        },
        required: ['selected_verse', 'verse_text', 'theological_insight', 'gospel_connection', 'prayer_direction', 'life_application']
    },
    'prose_formatter': {
        type: 'object',
        properties: {
            scripture: { type: 'string' },
            scriptureReference: { type: 'string' },
            understanding: { type: 'string' },
            meditation: { type: 'string' },
            prayer: { type: 'string' },
            closingWord: { type: 'string' }
        },
        required: ['scripture', 'scriptureReference', 'understanding', 'meditation', 'prayer', 'closingWord']
    },
    'layout_formatter': {
        type: 'object',
        properties: {
            formatted_text: { type: 'string' }
        },
        required: ['formatted_text']
    },
    'expert_chat': {
        type: 'object',
        properties: {
            response: { type: 'string' }
        },
        required: ['response']
    },
    'audit': {
        type: 'object',
        properties: {
            status: { type: 'string', enum: ['PASS', 'FREEZE'] },
            reason: { type: 'string' },
            risk_flags: { type: 'array', items: { type: 'string' } }
        },
        required: ['status', 'reason']
    },
    'question_body_audit': {
        type: 'object',
        properties: {
            verdict: { type: 'string', enum: ['PASS', 'FREEZE', 'REJECT'] },
            reason: { type: 'string' },
            risk_flags: { type: 'array', items: { type: 'string' } },
            distractor_flags: { type: 'array', items: { type: 'string' } },  // 各組誘餌審核備註
            estimated_difficulty_score: { type: 'integer', minimum: 0, maximum: 100 },
            difficulty_reason_general_believer: { type: 'string' },
            difficulty_reason_seminary_student: { type: 'string' }
        },
        required: [
            'verdict', 'reason', 'risk_flags', 'estimated_difficulty_score',
            'difficulty_reason_general_believer',
            'difficulty_reason_seminary_student'
        ]
    },
    'question_full_audit': {
        type: 'object',
        properties: {
            verdict: { type: 'string', enum: ['PASS', 'FREEZE', 'REJECT', 'RETRY_DISTRACTORS'] },
            reason: { type: 'string' },
            risk_flags: { type: 'array', items: { type: 'string' } },
            distractor_set_results: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        set_index: { type: 'integer', minimum: 1, maximum: 3 },
                        verdict: { type: 'string', enum: ['PASS', 'REJECT'] },
                        flags: { type: 'array', items: { type: 'string' } },
                        reason: { type: 'string' }
                    },
                    required: ['set_index', 'verdict', 'flags', 'reason']
                }
            },
            estimated_difficulty_score: { type: 'integer', minimum: 0, maximum: 100 },
            difficulty_reason_general_believer: { type: 'string' },
            difficulty_reason_seminary_student: { type: 'string' }
        },
        required: [
            'verdict', 'reason', 'risk_flags', 'distractor_set_results',
            'estimated_difficulty_score',
            'difficulty_reason_general_believer',
            'difficulty_reason_seminary_student'
        ]
    },
    'question_difficulty_audit': {
        type: 'object',
        properties: {
            estimated_difficulty_score: { type: 'integer', minimum: 0, maximum: 100 },
            difficulty_band: { type: 'string', enum: ['EASY', 'MEDIUM', 'HARD', 'VERY_HARD'] },
            evidence_complexity: {
                type: 'string',
                enum: ['DIRECT_SINGLE_VERSE', 'CONTEXTUAL', 'MULTI_VERSE_REASONING', 'MULTI_CLUE_SYNTHESIS']
            },
            target_band_supported: { type: 'boolean' },
            difficulty_reason_general_believer: { type: 'string' },
            difficulty_reason_seminary_student: { type: 'string' }
        },
        required: [
            'estimated_difficulty_score', 'difficulty_band', 'evidence_complexity',
            'target_band_supported', 'difficulty_reason_general_believer',
            'difficulty_reason_seminary_student'
        ]
    },
    'question_duplicate_audit': {
        type: 'object',
        properties: {
            results: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        candidate_id: { type: 'string' },
                        verdict: { type: 'string', enum: ['UNIQUE', 'DUPLICATE', 'UNCERTAIN'] },
                        duplicate_question_id: { type: ['string', 'null'] },
                        confidence: { type: 'number', minimum: 0, maximum: 1 },
                        reason: { type: 'string' },
                        shared_fact: { type: ['string', 'null'] },
                        suggested_new_angle: { type: ['string', 'null'] }
                    },
                    required: [
                        'candidate_id', 'verdict', 'duplicate_question_id',
                        'confidence', 'reason', 'shared_fact', 'suggested_new_angle'
                    ]
                }
            }
        },
        required: ['results']
    },
    'distractor_audit': {
        type: 'object',
        properties: {
            is_polluted: { type: 'boolean', description: '是否被靜態垃圾或不合邏輯的選項污染' },
            reason: { type: 'string', description: '判斷理由' }
        },
        required: ['is_polluted', 'reason']
    },
    /**
     * DEVOTIONAL V6.2: UNIFIED ONE-STAGE GENERATION SCHEMA
     * AI 自主選题 + 一次生成完整靈修短文
     */
    'unified_devotional': {
        type: 'object',
        properties: {
            selected_index: { type: 'integer' },
            title: { type: 'string' },
            scripture: { type: 'string' },
            scriptureReference: { type: 'string' },
            understanding: { type: 'string' },
            meditation: { type: 'string' },
            prayer: { type: 'string' },
            closingWord: { type: 'string' }
        },
        required: ['selected_index', 'title', 'scripture', 'scriptureReference', 'understanding', 'meditation', 'prayer', 'closingWord']
    }
};

// Aliases — story variants all share the interaction_engine schema
TASK_SCHEMAS['story_observation'] = TASK_SCHEMAS['interaction_engine'];
TASK_SCHEMAS['story_dialogue'] = TASK_SCHEMAS['interaction_engine'];
TASK_SCHEMAS['story_fate_barrier'] = TASK_SCHEMAS['interaction_engine'];
TASK_SCHEMAS['story_interaction'] = TASK_SCHEMAS['interaction_engine'];
