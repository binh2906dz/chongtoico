import type { FastifyReply } from "fastify";
import { z } from "zod";

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string) => new HttpError(400, msg);
export const unauthorized = (msg = "Bạn cần đăng nhập.") => new HttpError(401, msg);
export const forbidden = (msg = "Bạn không có quyền làm việc này.") => new HttpError(403, msg);
export const notFound = (msg = "Không tìm thấy.") => new HttpError(404, msg);

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw badRequest(issue?.message || "Dữ liệu không hợp lệ.");
  }
  return result.data;
}

export const idParam = z.object({ id: z.coerce.number().int().positive() });

export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
});

export function paginate(page: number, perPage: number) {
  return { limit: perPage, offset: (page - 1) * perPage };
}

export function isUniqueViolation(err: unknown) {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

export function ok(reply: FastifyReply) {
  return reply.send({ ok: true });
}
