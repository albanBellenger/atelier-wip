import type { AuthErrorBody } from '../services/api'

export interface ParsedApiError {
  title: string
  message: string
  code: string | undefined
}

function isAuthErrorBody(err: unknown): err is AuthErrorBody {
  return typeof err === 'object' && err !== null && 'detail' in err
}

function formatDetail(detail: unknown): string {
  if (typeof detail === 'string') {
    return detail
  }
  if (Array.isArray(detail)) {
    return detail.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join('; ')
  }
  try {
    return JSON.stringify(detail)
  } catch {
    return 'Invalid response'
  }
}

function titleForCode(code: string): string {
  switch (code) {
    case 'UNAUTHORIZED':
      return 'Sign in required'
    case 'FORBIDDEN':
      return 'Access denied'
    case 'NOT_FOUND':
      return 'Not found'
    case 'VALIDATION_ERROR':
    case 'SECTION_REQUIRED':
      return 'Invalid input'
    case 'LLM_NOT_CONFIGURED':
    case 'LLM_PROVIDER_UNSUPPORTED':
    case 'EMBEDDING_NOT_CONFIGURED':
    case 'EMBEDDING_PROVIDER_UNSUPPORTED':
      return 'Configuration required'
    case 'LLM_TIMEOUT':
    case 'LLM_TRANSPORT_ERROR':
    case 'LLM_UPSTREAM_ERROR':
    case 'EMBEDDING_TIMEOUT':
    case 'EMBEDDING_TRANSPORT_ERROR':
    case 'EMBEDDING_UPSTREAM_ERROR':
      return 'AI service unavailable'
    case 'GITLAB_ERROR':
    case 'GITLAB_TRANSPORT_ERROR':
      return 'GitLab error'
    case 'INTERNAL_ERROR':
      return 'Server error'
    default:
      return 'Request failed'
  }
}

export function parseApiError(err: unknown): ParsedApiError {
  if (isAuthErrorBody(err)) {
    const code =
      typeof err.code === 'string' ? err.code : ('HTTP_ERROR' as const)
    const message = formatDetail(err.detail)
    return {
      title: titleForCode(code),
      message,
      code,
    }
  }
  if (err instanceof Error) {
    return {
      title: 'Error',
      message: err.message,
      code: undefined,
    }
  }
  return {
    title: 'Error',
    message: 'Something went wrong.',
    code: undefined,
  }
}
