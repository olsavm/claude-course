const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_STATUSES   = ['todo', 'in_progress', 'done'];
const VALID_PRIORITIES = ['low', 'medium', 'high'];

function isValidUUID(value) {
  return UUID_RE.test(value);
}

function isValidStatus(value) {
  return VALID_STATUSES.includes(value);
}

function isValidPriority(value) {
  return VALID_PRIORITIES.includes(value);
}

function isValidDate(value) {
  return !isNaN(new Date(value).getTime());
}

function isFutureDate(value) {
  return new Date(value) > new Date();
}

module.exports = { isValidUUID, isValidStatus, isValidPriority, isValidDate, isFutureDate };
