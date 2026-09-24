export type ErrorFields = Record<string, string>;

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: ErrorFields;
  readonly current?: unknown;

  constructor(
    status: number,
    code: string,
    message: string,
    fields?: ErrorFields,
    current?: unknown,
  ) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.current = current;
  }
}

export function apiError(
  status: number,
  code: string,
  message: string,
  fields?: ErrorFields,
  current?: unknown,
) {
  return Response.json(
    {
      error: {
        code,
        message,
        ...(fields ? { fields } : {}),
        ...(current !== undefined ? { current } : {}),
      },
    },
    { status, headers: { 'Cache-Control':'no-store' } },
  );
}

export function appErrorResponse(error: unknown) {
  if (error instanceof AppError) {
    return apiError(error.status, error.code, error.message, error.fields, error.current);
  }
  return apiError(500, "internal_error", "服务器暂时无法处理请求");
}
