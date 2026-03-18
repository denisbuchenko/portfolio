function _normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

function _stripLeadingSlashes(path: string): string {
  return path.replace(/^\/+/, "");
}

function _isExternalUrl(path: string): boolean {
  return /^(?:[a-z]+:)?\/\//i.test(path) || path.startsWith("data:");
}

export function publicAssetUrl(path: string): string {
  if (_isExternalUrl(path)) return path;

  const normalizedBaseUrl = _normalizeBaseUrl(import.meta.env.BASE_URL || "/");
  const normalizedPath = _stripLeadingSlashes(path);
  return `${normalizedBaseUrl}${normalizedPath}`;
}
