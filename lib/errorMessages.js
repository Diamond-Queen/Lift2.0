/**
 * Error Message Utility
 * Provides user-friendly, specific error messages based on error type, status code, and context
 */

export function getErrorMessage(error, context = {}) {
  // If it's already a nice string message, return it
  if (typeof error === 'string' && error.length > 0 && error.length < 200) {
    return error;
  }

  // Handle API error responses with status and data
  if (error && typeof error === 'object') {
    // Server error response
    if (error.status && error.data) {
      return getServerErrorMessage(error.status, error.data, context);
    }
    
    // Fetch API error with response
    if (error.response) {
      return getServerErrorMessage(error.response.status, error.response.data, context);
    }

    // Custom error object with message
    if (error.message) {
      return getSpecificErrorMessage(error.message, context);
    }
  }

  // Default fallback
  return 'An unexpected error occurred. Please try again.';
}

function getServerErrorMessage(status, data, context) {
  // Extract error from response
  const errorMsg = data?.error || data?.message || 'Unknown error';
  const errorCode = data?.code || status;

  switch (status) {
    case 400:
      return getValidationError(errorMsg, context);
    case 401:
      return 'Your session expired. Please log in again.';
    case 403:
      if (errorMsg.includes('firewall')) {
        return `You've been temporarily blocked for security. ${data?.blockUntil ? `Try again in ${Math.ceil((new Date(data.blockUntil) - Date.now()) / 1000)} seconds.` : 'Please try again later.'}`;
      }
      if (errorMsg.includes('Stripe subscription')) {
        return 'No active Stripe subscription found. Please contact support or start a new subscription.';
      }
      return 'You don\'t have permission to perform this action.';
    case 404:
      return getNotFoundError(errorMsg, context);
    case 429:
      if (errorMsg.includes('rate')) {
        return `Too many requests. ${data?.blockUntil ? `Please wait ${Math.ceil((new Date(data.blockUntil) - Date.now()) / 1000)} seconds before trying again.` : 'Please try again in a moment.'}`;
      }
      return 'You\'re doing that too quickly. Please slow down.';
    case 503:
      return 'Service temporarily unavailable. Our team is working on it. Please try again soon.';
    case 500:
    case 502:
    case 504:
      return 'Server error. Please try again in a moment, or contact support if this persists.';
    default:
      return errorMsg || 'An error occurred. Please try again.';
  }
}

function getValidationError(errorMsg, context) {
  const msg = String(errorMsg).toLowerCase();

  if (msg.includes('email')) {
    if (msg.includes('already')) return 'This email is already registered. Please log in instead.';
    if (msg.includes('required')) return 'Email address is required.';
    if (msg.includes('invalid')) return 'Please enter a valid email address.';
    return 'Email error. Please check and try again.';
  }

  if (msg.includes('password')) {
    if (msg.includes('weak')) return 'Password too weak. Use at least 8 characters with letters, numbers, and symbols.';
    if (msg.includes('required')) return 'Password is required.';
    if (msg.includes('mismatch')) return 'Passwords don\'t match.';
    return 'Password error. Please check and try again.';
  }

  if (msg.includes('subscription')) {
    if (msg.includes('same')) return 'You already have this plan.';
    if (msg.includes('no active')) return 'No active subscription found. Please create a new subscription first.';
    if (msg.includes('stripe')) return 'No Stripe subscription on file. Please contact support or start a new subscription.';
    return 'Subscription error. Please try again or contact support.';
  }

  if (msg.includes('plan')) {
    if (msg.includes('not configured')) return 'This plan is not currently available. Please choose another.';
    if (msg.includes('invalid')) return 'Invalid plan selection. Please choose a valid plan.';
    return 'Plan error. Please try again.';
  }

  if (msg.includes('required')) {
    return `Please fill in all required fields. ${extractMissing(errorMsg)}`;
  }

  if (msg.includes('invalid')) {
    return 'Invalid input. Please check your information and try again.';
  }

  return errorMsg || 'Invalid request. Please check your information.';
}

function getNotFoundError(errorMsg, context) {
  const msg = String(errorMsg).toLowerCase();

  if (msg.includes('user')) return 'User account not found. Please create a new account.';
  if (msg.includes('subscription')) return 'Subscription not found. It may have been deleted.';
  if (msg.includes('note') || msg.includes('content')) return 'Note not found. It may have been deleted.';
  if (msg.includes('class')) return 'Class not found. Please select a valid class.';
  if (msg.includes('ip')) return 'Entry not found. It may have already been cleared.';

  return 'The requested item could not be found.';
}

function getSpecificErrorMessage(errorMsg, context) {
  const msg = String(errorMsg).toLowerCase();

  if (msg.includes('network') || msg.includes('failed to fetch')) {
    return 'Network connection error. Please check your internet and try again.';
  }

  if (msg.includes('timeout')) {
    return 'Request timed out. Please check your connection and try again.';
  }

  if (msg.includes('cors')) {
    return 'Request blocked. Please try again or contact support.';
  }

  if (msg.includes('json')) {
    return 'Invalid response from server. Please try again.';
  }

  return errorMsg || 'An error occurred. Please try again.';
}

function extractMissing(errorMsg) {
  const match = String(errorMsg).match(/(\w+)\s*(?:is required|required)/i);
  if (match) {
    return `Make sure to fill in: ${match[1]}`;
  }
  return '';
}

/**
 * Parse fetch response and extract error details
 */
export async function parseFetchError(response) {
  let data = {};
  try {
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = { error: response.statusText || 'Unknown error' };
    }
  } catch (e) {
    data = { error: 'Failed to parse error response' };
  }

  return {
    status: response.status,
    data
  };
}
