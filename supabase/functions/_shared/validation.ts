import { AppError, ErrorCode } from './errors.ts';

export interface ValidationRule<T = any> {
  required?: boolean;
  type?: 'string' | 'number' | 'boolean' | 'uuid';
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  validator?: (value: T) => boolean;
  errorMessage?: string;
}

export interface ValidationSchema {
  [key: string]: ValidationRule;
}

export function validatePayload<T extends Record<string, any>>(
  payload: unknown,
  schema: ValidationSchema
): T {
  if (!payload || typeof payload !== 'object') {
    throw new AppError('Invalid payload format', ErrorCode.INVALID_PAYLOAD, 400);
  }

  const data = payload as Record<string, any>;
  const validated: Record<string, any> = {};

  for (const [field, rule] of Object.entries(schema)) {
    const value = data[field];

    // Check required fields
    if (rule.required && (value === undefined || value === null)) {
      throw new AppError(
        `Field '${field}' is required`,
        ErrorCode.MISSING_REQUIRED_FIELD,
        400,
        rule.errorMessage || `${field} is required`
      );
    }

    // Skip validation for optional undefined fields
    if (value === undefined || value === null) {
      continue;
    }

    // Type validation
    if (rule.type) {
      if (!validateType(value, rule.type)) {
        throw new AppError(
          `Field '${field}' must be of type ${rule.type}`,
          ErrorCode.INVALID_FIELD_VALUE,
          400,
          rule.errorMessage || `${field} must be a valid ${rule.type}`
        );
      }
    }

    // String validations
    if (typeof value === 'string') {
      if (rule.minLength && value.length < rule.minLength) {
        throw new AppError(
          `Field '${field}' must be at least ${rule.minLength} characters`,
          ErrorCode.INVALID_FIELD_VALUE,
          400,
          rule.errorMessage || `${field} is too short`
        );
      }

      if (rule.maxLength && value.length > rule.maxLength) {
        throw new AppError(
          `Field '${field}' must be at most ${rule.maxLength} characters`,
          ErrorCode.INVALID_FIELD_VALUE,
          400,
          rule.errorMessage || `${field} is too long`
        );
      }

      if (rule.pattern && !rule.pattern.test(value)) {
        throw new AppError(
          `Field '${field}' has invalid format`,
          ErrorCode.INVALID_FIELD_VALUE,
          400,
          rule.errorMessage || `${field} has invalid format`
        );
      }
    }

    // Number validations
    if (typeof value === 'number') {
      if (rule.min !== undefined && value < rule.min) {
        throw new AppError(
          `Field '${field}' must be at least ${rule.min}`,
          ErrorCode.INVALID_FIELD_VALUE,
          400,
          rule.errorMessage || `${field} is too small`
        );
      }

      if (rule.max !== undefined && value > rule.max) {
        throw new AppError(
          `Field '${field}' must be at most ${rule.max}`,
          ErrorCode.INVALID_FIELD_VALUE,
          400,
          rule.errorMessage || `${field} is too large`
        );
      }
    }

    // Custom validation
    if (rule.validator && !rule.validator(value)) {
      throw new AppError(
        `Field '${field}' failed custom validation`,
        ErrorCode.INVALID_FIELD_VALUE,
        400,
        rule.errorMessage || `${field} is invalid`
      );
    }

    validated[field] = value;
  }

  return validated as T;
}

function validateType(value: any, type: string): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && !isNaN(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'uuid':
      return typeof value === 'string' && isValidUUID(value);
    default:
      return false;
  }
}

export function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function isValidStripeCustomerId(customerId: string): boolean {
  return /^cus_[a-zA-Z0-9]{14,}$/.test(customerId);
}

export function isValidStripeSessionId(sessionId: string): boolean {
  return /^cs_[a-zA-Z0-9]{1,}$/.test(sessionId);
}

// Common validation schemas
export const schemas = {
  createPayment: {
    sessionId: {
      required: true,
      type: 'uuid' as const,
      errorMessage: 'Valid session ID is required'
    }
  },
  
  verifyPayment: {
    sessionId: {
      required: true,
      type: 'string' as const,
      validator: isValidStripeSessionId,
      errorMessage: 'Valid Stripe session ID is required'
    }
  }
} as const;