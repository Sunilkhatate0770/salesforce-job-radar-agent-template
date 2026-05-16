export function apiSuccess(data = {}, meta = {}) {
  return {
    success: true,
    ...data,
    ...(Object.keys(meta).length ? { meta } : {})
  };
}

export function apiError(message = 'Request failed', options = {}) {
  const status = Number(options.status || 500);
  const code = options.code || (status === 401 ? 'unauthorized' : 'request_failed');
  const payload = {
    success: false,
    error: String(message || 'Request failed'),
    code
  };

  if (options.details && options.exposeDetails) {
    payload.details = options.details;
  }

  return payload;
}

export function unauthorizedResponse(message = 'Unauthorized') {
  return apiError(message, { status: 401, code: 'unauthorized' });
}

export function sendNodeJson(res, status, payload, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    ...headers
  });
  res.end(JSON.stringify(payload));
}
