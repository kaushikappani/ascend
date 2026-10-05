// JSON Schemas for Claude Code structured output (validated by the CLI, re-asked on mismatch).
import { ALL_QUESTION_TYPES } from '@shared/constants';

const str = (description?: string) => (description ? { type: 'string', description } : { type: 'string' });
const strArray = (description?: string, extra: Record<string, unknown> = {}) => ({
  type: 'array',
  items: { type: 'string' },
  ...(description ? { description } : {}),
  ...extra,
});

export interface RoadmapOutput {
  tagline: string;
  levels: {
    number: number;
    title: string;
    summary: string;
    topics: { title: string; summary: string; concepts: string[]; interviewFocus: string }[];
  }[];
}

export function roadmapSchema(minLevels: number, maxLevels: number) {
  return {
    type: 'object',
    properties: {
      tagline: str('Short motivating tagline for the track, at most 10 words'),
      levels: {
        type: 'array',
        minItems: minLevels,
        maxItems: maxLevels,
        items: {
          type: 'object',
          properties: {
            number: { type: 'integer', minimum: 1 },
            title: str('Level title, at most 5 words'),
            summary: str('One sentence: what the learner can do after this level'),
            topics: {
              type: 'array',
              minItems: 3,
              maxItems: 7,
              items: {
                type: 'object',
                properties: {
                  title: str('Topic title, at most 6 words'),
                  summary: str('One sentence describing the topic'),
                  concepts: strArray('3-6 key concepts as short noun phrases', { minItems: 2, maxItems: 7 }),
                  interviewFocus: str('One sentence on what interviewers probe about this topic'),
                },
                required: ['title', 'summary', 'concepts', 'interviewFocus'],
              },
            },
          },
          required: ['number', 'title', 'summary', 'topics'],
        },
      },
    },
    required: ['tagline', 'levels'],
  };
}

export interface RawQuestion {
  type: string;
  topicId?: string;
  prompt?: string;
  code?: string;
  codeLanguage?: string;
  options?: string[];
  correctIndex?: number;
  correctIndices?: number[];
  answer?: boolean;
  blanks?: string[][];
  wordBank?: string[];
  items?: string[];
  pairs?: { left: string; right: string }[];
  keyPoints?: string[];
  sampleAnswer?: string;
  explanation?: string;
  optionFeedback?: string[];
  hint?: string;
  interviewTip?: string;
  difficulty?: number;
  concepts?: string[];
}

export function questionsSchema(topicIds: string[], count: number) {
  return {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        minItems: Math.max(1, count - 1),
        maxItems: count + 2,
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ALL_QUESTION_TYPES },
            topicId: { type: 'string', enum: topicIds },
            prompt: str('The question. Markdown allowed. For fill_blank, write each blank as ___ (three underscores).'),
            code: str('Optional code snippet shown with the question (no markdown fences)'),
            codeLanguage: str('Language of `code`, e.g. java, python, yaml, sql, text'),
            options: strArray('mcq / multi_select answer options'),
            correctIndex: { type: 'integer', minimum: 0, description: 'mcq: index of the correct option' },
            correctIndices: { type: 'array', items: { type: 'integer', minimum: 0 }, description: 'multi_select: indices of all correct options' },
            answer: { type: 'boolean', description: 'true_false: whether the statement is true' },
            blanks: {
              type: 'array',
              items: { type: 'array', items: { type: 'string' } },
              description: 'fill_blank: for each blank in order, the accepted answers',
            },
            wordBank: strArray('fill_blank: every correct answer plus 2-4 plausible distractors'),
            items: strArray('ordering: the items in the CORRECT order'),
            pairs: {
              type: 'array',
              items: {
                type: 'object',
                properties: { left: { type: 'string' }, right: { type: 'string' } },
                required: ['left', 'right'],
              },
              description: 'match: pairs to match',
            },
            keyPoints: strArray('short_answer: 3-5 rubric points an interviewer listens for'),
            sampleAnswer: str('short_answer: a strong 2-4 sentence model answer'),
            explanation: str('1-3 sentences teaching why the answer is right'),
            optionFeedback: strArray('mcq / multi_select: one short line per option explaining why it is right or wrong'),
            hint: str('Optional nudge that does not give away the answer'),
            interviewTip: str('Optional tip on how to talk about this in an interview'),
            difficulty: { type: 'integer', minimum: 1, maximum: 5 },
            concepts: strArray('1-3 key concepts this question tests', { minItems: 1, maxItems: 4 }),
          },
          required: ['type', 'topicId', 'prompt', 'explanation', 'difficulty', 'concepts'],
        },
      },
    },
    required: ['questions'],
  };
}

export interface GradeOutput {
  score: number;
  verdict: 'correct' | 'partial' | 'incorrect';
  feedback: string;
  missing: string[];
  improvedAnswer: string;
}

export const gradeSchema = {
  type: 'object',
  properties: {
    score: { type: 'integer', minimum: 0, maximum: 100 },
    verdict: { type: 'string', enum: ['correct', 'partial', 'incorrect'] },
    feedback: str('1-3 sentences addressed to the learner'),
    missing: strArray('Rubric points the answer missed or got wrong (short phrases)'),
    improvedAnswer: str('A concise ideal answer, 2-4 sentences'),
  },
  required: ['score', 'verdict', 'feedback', 'missing', 'improvedAnswer'],
};

export interface DebriefOutput {
  headline: string;
  summary: string;
  strengths: string[];
  focusNext: string[];
  nextStep: string;
  notes: { kind: 'strength' | 'weakness' | 'insight'; text: string }[];
  remedialTopic?: { title: string; summary: string; concepts: string[]; reason: string };
}

export const debriefSchema = {
  type: 'object',
  properties: {
    headline: str('At most 8 words, upbeat but honest'),
    summary: str('2-3 sentences'),
    strengths: strArray(undefined, { maxItems: 3 }),
    focusNext: strArray(undefined, { maxItems: 3 }),
    nextStep: str('One actionable sentence'),
    notes: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['strength', 'weakness', 'insight'] },
          text: str('A durable observation, at most 25 words'),
        },
        required: ['kind', 'text'],
      },
    },
    remedialTopic: {
      type: 'object',
      description: 'Only include when a significant prerequisite gap needs its own lesson',
      properties: {
        title: str('At most 6 words'),
        summary: str(),
        concepts: strArray(undefined, { minItems: 2, maxItems: 6 }),
        reason: str('Why this was added, addressed to the learner, one sentence'),
      },
      required: ['title', 'summary', 'concepts', 'reason'],
    },
  },
  required: ['headline', 'summary', 'strengths', 'focusNext', 'nextStep', 'notes'],
};

export const briefSchema = {
  type: 'object',
  properties: {
    overview: str('Markdown: what the company does, products, scale, engineering culture (120-220 words)'),
    techStack: strArray('Technologies the company/team is known to use'),
    interviewProcess: {
      type: 'array',
      items: {
        type: 'object',
        properties: { stage: str(), description: str(), tips: str() },
        required: ['stage', 'description'],
      },
    },
    values: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: str(), howToShow: str('How to demonstrate this value in answers') },
        required: ['name', 'howToShow'],
      },
    },
    recentNews: strArray('Notable recent developments worth mentioning (only if found)'),
    roleSummary: str('2-3 sentences on what this role really needs'),
    mustHave: strArray('Must-have skills from the JD'),
    niceToHave: strArray('Nice-to-have skills from the JD'),
    keywords: strArray('Important JD keywords'),
    skillGaps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          skill: str(),
          importance: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          currentLevel: { type: 'string', enum: ['none', 'basic', 'intermediate', 'strong'] },
          gap: str('What is missing'),
          action: str('Concrete preparation action'),
        },
        required: ['skill', 'importance', 'currentLevel', 'gap', 'action'],
      },
    },
    prepPlan: {
      type: 'array',
      items: {
        type: 'object',
        properties: { day: str('e.g. "Day 1" or "Week 1"'), focus: str(), tasks: strArray() },
        required: ['day', 'focus', 'tasks'],
      },
    },
    likelyQuestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: ['technical', 'behavioral', 'system_design', 'coding', 'company'] },
          question: str(),
          whyAsked: str(),
          answerHints: strArray(),
        },
        required: ['category', 'question', 'whyAsked', 'answerHints'],
      },
    },
    tips: strArray('Practical tips for this specific interview'),
    sources: {
      type: 'array',
      items: {
        type: 'object',
        properties: { title: str(), url: str() },
        required: ['title', 'url'],
      },
    },
    readinessEstimate: { type: 'integer', minimum: 0, maximum: 100, description: 'Current readiness for this role, 0-100' },
  },
  required: [
    'overview',
    'techStack',
    'interviewProcess',
    'values',
    'recentNews',
    'roleSummary',
    'mustHave',
    'niceToHave',
    'keywords',
    'skillGaps',
    'prepPlan',
    'likelyQuestions',
    'tips',
    'sources',
    'readinessEstimate',
  ],
};

export const scorecardSchema = {
  type: 'object',
  properties: {
    overall: { type: 'integer', minimum: 0, maximum: 100 },
    verdict: { type: 'string', enum: ['strong_hire', 'hire', 'lean_hire', 'lean_no_hire', 'no_hire'] },
    summary: str('3-4 sentences'),
    dimensions: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: str(), score: { type: 'integer', minimum: 1, maximum: 5 }, comment: str() },
        required: ['name', 'score', 'comment'],
      },
    },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          question: str(),
          score: { type: 'integer', minimum: 1, maximum: 5 },
          feedback: str(),
          idealAnswer: str('What a strong answer would have covered, 3-5 sentences'),
        },
        required: ['question', 'score', 'feedback', 'idealAnswer'],
      },
    },
    strengths: strArray(),
    improvements: strArray(),
    focusTopics: strArray('Topics or concepts to study next'),
  },
  required: ['overall', 'verdict', 'summary', 'dimensions', 'questions', 'strengths', 'improvements', 'focusTopics'],
};

export const insightSchema = {
  type: 'object',
  properties: {
    headline: str('At most 10 words'),
    summary: str('3-4 sentences'),
    wins: strArray(),
    risks: strArray(),
    plan: {
      type: 'array',
      items: {
        type: 'object',
        properties: { when: str('e.g. "Today", "Tomorrow", "Wed"'), focus: str() },
        required: ['when', 'focus'],
      },
    },
    readiness: {
      type: 'array',
      items: {
        type: 'object',
        properties: { area: str(), score: { type: 'integer', minimum: 0, maximum: 100 }, comment: str() },
        required: ['area', 'score', 'comment'],
      },
    },
  },
  required: ['headline', 'summary', 'wins', 'risks', 'plan', 'readiness'],
};
