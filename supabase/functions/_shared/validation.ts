import { AppError, ErrorCode } from './errors.ts';

export interface ValidationSchema {
  [key: string]: {
    required?: boolean;
    type?: 'string' | 'number' | 'boolean' | 'object' | 'array';
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
    validator?: (value: any) => boolean;
  };
}

export function validatePayload<T>(
  payload: any,
  schema: ValidationSchema
): T {
  if (!payload || typeof payload !== 'object') {
    throw new AppError('Invalid payload format', ErrorCode.INVALID_PAYLOAD, 400);
  }

  const errors: string[] = [];

  for (const [field, rules] of Object.entries(schema)) {
    const value = payload[field];

    // Check required fields
    if (rules.required && (value === undefined || value === null || value === '')) {
      errors.push(`Field '${field}' is required`);
      continue;
    }

    // Skip validation for optional empty fields
    if (!rules.required && (value === undefined || value === null || value === '')) {
      continue;
    }

    // Type validation
    if (rules.type) {
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      if (actualType !== rules.type) {
        errors.push(`Field '${field}' must be of type ${rules.type}`);
        continue;
      }
    }

    // String validations
    if (rules.type === 'string' && typeof value === 'string') {
      if (rules.minLength && value.length < rules.minLength) {
        errors.push(`Field '${field}' must be at least ${rules.minLength} characters`);
      }
      if (rules.maxLength && value.length > rules.maxLength) {
        errors.push(`Field '${field}' must be at most ${rules.maxLength} characters`);
      }
      if (rules.pattern && !rules.pattern.test(value)) {
        errors.push(`Field '${field}' format is invalid`);
      }
    }

    // Custom validator
    if (rules.validator && !rules.validator(value)) {
      errors.push(`Field '${field}' validation failed`);
    }
  }

  if (errors.length > 0) {
    throw new AppError(
      `Validation failed: ${errors.join(', ')}`,
      ErrorCode.INVALID_FIELD_VALUE,
      400
    );
  }

  return payload as T;
}

export const schemas = {
  createPayment: {
    sessionId: {
      required: true,
      type: 'string' as const,
      minLength: 1,
      pattern: /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
    }
  },
  
  createSubscription: {
    priceId: {
      required: true,
      type: 'string' as const,
      minLength: 1
    }
  },

  verifyPayment: {
    sessionId: {
      required: true,
      type: 'string' as const,
      minLength: 1
    }
  }
};