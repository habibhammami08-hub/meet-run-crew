export enum ErrorCode {
  // Auth errors
  MISSING_AUTH_HEADER = 'MISSING_AUTH_HEADER',
  INVALID_AUTH_FORMAT = 'INVALID_AUTH_FORMAT',
  INVALID_TOKEN = 'INVALID_TOKEN',
  TOKEN_INVALID = 'TOKEN_INVALID',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED',
  PROFILE_NOT_FOUND = 'PROFILE_NOT_FOUND',
  AUTH_FAILED = 'AUTH_FAILED',

  // Validation errors
  INVALID_REQUEST_METHOD = 'INVALID_REQUEST_METHOD',
  INVALID_PAYLOAD = 'INVALID_PAYLOAD',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  INVALID_FIELD_VALUE = 'INVALID_FIELD_VALUE',

  // Business logic errors
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  ALREADY_ENROLLED = 'ALREADY_ENROLLED',
  SESSION_FULL = 'SESSION_FULL',
  CUSTOMER_NOT_FOUND = 'CUSTOMER_NOT_FOUND',

  // External service errors
  STRIPE_ERROR = 'STRIPE_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  
  // Generic errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  CONFIG_ERROR = 'CONFIG_ERROR'
}

export interface ErrorResponse {
  error: string;
  code: ErrorCode;
  timestamp: string;
  request_id?: string;
}

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  function_name: string;
  user_id?: string;
  action: string;
  success: boolean;
  error_code?: ErrorCode;
  error_message?: string;
  duration_ms?: number;
  metadata?: Record<string, any>;
  request_id?: string;
}

export class AppError extends Error {
  constructor(
    message: string,
    public code: ErrorCode,
    public status: number = 500,
    public userMessage?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function logEvent(entry: Omit<LogEntry, 'timestamp'>): void {
  const logEntry: LogEntry = {
    ...entry,
    timestamp: new Date().toISOString()
  };
  
  console.log(JSON.stringify(logEntry));
}

export function createErrorResponse(
  error: unknown,
  requestId: string,
  corsHeaders: Record<string, string>
): Response {
  let errorResponse: ErrorResponse;
  let status = 500;

  if (error instanceof AppError) {
    status = error.status;
    errorResponse = {
      error: error.userMessage || getPublicErrorMessage(error.code),
      code: error.code,
      timestamp: new Date().toISOString(),
      request_id: requestId
    };
  } else if (error instanceof Error) {
    // Log the actual error but don't expose it
    console.error('Unexpected error:', error);
    errorResponse = {
      error: 'An unexpected error occurred',
      code: ErrorCode.INTERNAL_ERROR,
      timestamp: new Date().toISOString(),
      request_id: requestId
    };
  } else {
    console.error('Unknown error type:', error);
    errorResponse = {
      error: 'Service unavailable',
      code: ErrorCode.SERVICE_UNAVAILABLE,
      timestamp: new Date().toISOString(),
      request_id: requestId
    };
  }

  return new Response(JSON.stringify(errorResponse), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

function getPublicErrorMessage(code: ErrorCode): string {
  const messages: Record<ErrorCode, string> = {
    [ErrorCode.MISSING_AUTH_HEADER]: 'Authentication required',
    [ErrorCode.INVALID_AUTH_FORMAT]: 'Invalid authentication format',
    [ErrorCode.INVALID_TOKEN]: 'Invalid access token',
    [ErrorCode.TOKEN_INVALID]: 'Access token expired or invalid',
    [ErrorCode.USER_NOT_FOUND]: 'User account not found',
    [ErrorCode.EMAIL_NOT_VERIFIED]: 'Email verification required',
    [ErrorCode.PROFILE_NOT_FOUND]: 'User profile not found',
    [ErrorCode.AUTH_FAILED]: 'Authentication failed',
    
    [ErrorCode.INVALID_REQUEST_METHOD]: 'Invalid request method',
    [ErrorCode.INVALID_PAYLOAD]: 'Invalid request data',
    [ErrorCode.MISSING_REQUIRED_FIELD]: 'Required field missing',
    [ErrorCode.INVALID_FIELD_VALUE]: 'Invalid field value',
    
    [ErrorCode.SESSION_NOT_FOUND]: 'Session not found',
    [ErrorCode.ALREADY_ENROLLED]: 'Already enrolled in this session',
    [ErrorCode.SESSION_FULL]: 'Session is full',
    [ErrorCode.CUSTOMER_NOT_FOUND]: 'Customer account not found',
    
    [ErrorCode.STRIPE_ERROR]: 'Payment service temporarily unavailable',
    [ErrorCode.DATABASE_ERROR]: 'Database service temporarily unavailable',
    
    [ErrorCode.INTERNAL_ERROR]: 'Internal server error',
    [ErrorCode.SERVICE_UNAVAILABLE]: 'Service temporarily unavailable',
    [ErrorCode.CONFIG_ERROR]: 'Service configuration error'
  };

  return messages[code] || 'An error occurred';
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};