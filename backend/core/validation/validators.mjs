export function validateRequiredFields(value, fields) {
  const errors = fields
    .filter((field) => value[field] === undefined || value[field] === null || value[field] === '')
    .map((field) => ({ field, code: 'REQUIRED_FIELD', message: `${field} is required.` }));

  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors),
  });
}

export function validateAllowedValue(field, value, allowedValues) {
  const valid = allowedValues.includes(value);
  return Object.freeze({
    valid,
    errors: Object.freeze(valid ? [] : [{ field, code: 'INVALID_VALUE', message: `${field} has an unsupported value.` }]),
  });
}

export function validatePattern(field, value, pattern, message = `${field} has an invalid format.`) {
  const valid = pattern.test(String(value || ''));
  return Object.freeze({
    valid,
    errors: Object.freeze(valid ? [] : [{ field, code: 'INVALID_FORMAT', message }]),
  });
}

export function combineValidationResults(...results) {
  const errors = results.flatMap((result) => result.errors || []);
  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors),
  });
}
