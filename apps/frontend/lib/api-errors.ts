type ErrorRecord = Record<string, unknown>;

function record(value: unknown): ErrorRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as ErrorRecord : undefined;
}

const safeMessages: Record<string, string> = {
  'Request validation failed.': 'تعذر التحقق من البيانات المدخلة.',
  'Resource was not found.': 'المحتوى المطلوب غير موجود.',
  'Unexpected platform error.': 'الخدمة غير متاحة مؤقتًا. يرجى المحاولة لاحقًا.',
  'Request could not be completed.': 'تعذر إكمال الطلب.'
};

// GlobalExceptionFilter owns { error: { code, message } }. Keep compatibility
// with endpoint responses that still use the older top-level message shape.
export function readApiError(data: unknown, statusCode: number): { message: string; code?: string } {
  const root = record(data) ?? {};
  const source = record(root.error) ?? root;
  const raw = source.message;
  const message = typeof raw === 'string' && raw.trim() ? raw.trim()
    : Array.isArray(raw) && raw.every((part) => typeof part === 'string')
      ? raw.map((part) => part.trim()).filter(Boolean).join('. ') : '';
  return {
    message: safeMessages[message] ?? (message || `تعذر إكمال الطلب (${statusCode}).`),
    code: typeof source.code === 'string' ? source.code : undefined
  };
}
