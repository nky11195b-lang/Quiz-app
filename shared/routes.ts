import { z } from 'zod';
import { insertQuizSchema, insertQuestionSchema, insertScoreSchema, quizzes, questions, scores } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  quizzes: {
    list: {
      method: 'GET' as const,
      path: '/api/quizzes' as const,
      responses: {
        200: z.array(z.custom<typeof quizzes.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/quizzes/:id' as const,
      responses: {
        200: z.custom<typeof quizzes.$inferSelect & { questions: typeof questions.$inferSelect[] }>(),
        404: errorSchemas.notFound,
      },
    },
  },
  scores: {
    submit: {
      method: 'POST' as const,
      path: '/api/scores' as const,
      input: insertScoreSchema,
      responses: {
        201: z.custom<typeof scores.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    list: {
      method: 'GET' as const,
      path: '/api/quizzes/:quizId/scores' as const,
      responses: {
        200: z.array(z.custom<typeof scores.$inferSelect>()),
      }
    }
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
