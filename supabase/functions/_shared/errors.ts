export enum ErrorCode {
  // Authentication errors
  MISSING_AUTH_HEADER = 'MISSING_AUTH_HEADER',
  INVALID_AUTH_FORMAT = 'INVALID_AUTH_FORMAT',
  INVALID_TOKEN = 'INVALID_TOKEN',
  TOKEN_INVALID = 'TOKEN_INVALID',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED',
  PROFILE_NOT_FOUND = 'PROFILE_NOT_FOUND',
  AUTH_FAILED = 'AUTH_FAILED',

  // Request errors
  INVALID_REQUEST_METHOD = 'INVALID_REQUEST_METHOD',
  INVALID_PAYLOAD = 'INVALID_PAYLOAD',
  INVALID_FIELD_VALUE = 'INVALID_FIELD_VALUE',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',

  // Business logic errors
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  SESSION_FULL = 'SESSION_FULL',
  ALREADY_ENROLLED = 'ALREADY_ENROLLED',
  CANNOT_ENROLL_OWN_SESSION = 'CANNOT_ENROLL_OWN_SESSION',

  // System errors
  CONFIG_ERROR = 'CONFIG_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  STRIPE_ERROR = 'STRIPE_ERROR',
  CUSTOMER_NOT_FOUND = 'CUSTOMER_NOT_FOUND',
  INTERNAL_ERROR = 'INTERNAL_ERROR'
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

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
};

export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function createErrorResponse(
  error: unknown,
  requestId: string,
  headers: Record<string, string> = corsHeaders
): Response {
  if (error instanceof AppError) {
    return new Response(
      JSON.stringify({
        error: {
          code: error.code,
          message: error.userMessage || error.message,
          request_id: requestId
        }
      }),
      {
        status: error.status,
        headers: { ...headers, 'Content-Type': 'application/json' }
      }
    );
  }

  // Generic error response
  const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
  
  return new Response(
    JSON.stringify({
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Internal server error',
        request_id: requestId
      }
    }),
    {
      status: 500,
      headers: { ...headers, 'Content-Type': 'application/json' }
    }
  );
}

interface LogEventData {
  level: 'info' | 'warn' | 'error';
  function_name: string;
  user_id?: string;
  action: string;
  success: boolean;
  error_code?: ErrorCode;
  error_message?: string;
  duration_ms?: number;
  metadata?: any;
  request_id: string;
}

// Constants for standardized timeouts
export const STRIPE_TIMEOUT = 15000; // 15 seconds standard

// Environment validation function
export function validateEnvironment(): void {
  const requiredVars = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY', 
    'SUPABASE_SERVICE_ROLE_KEY',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET'
  ];

  const missing = requiredVars.filter(varName => !Deno.env.get(varName));
  
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }
}

export function logEvent(data: LogEventData): void {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${data.function_name.toUpperCase()}] ${data.action}`;
  
  const logData = {
    timestamp,
    ...data
  };

  if (data.level === 'error') {
    console.error(logMessage, logData);
  } else if (data.level === 'warn') {
    console.warn(logMessage, logData);
  } else {
    console.log(logMessage, logData);
  }
}