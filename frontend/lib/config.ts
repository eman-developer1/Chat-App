/**
 * Centralized Application Configuration
 *
 * Reads backend API and Socket URLs from environment variables,
 * providing safe production defaults pointing to the deployed backend.
 */

const rawApiUrl =
  process.env.NEXT_PUBLIC_API_URL || "https://9anqur.bot-keep.xyz";
const rawSocketUrl =
  process.env.NEXT_PUBLIC_SOCKET_URL || rawApiUrl;

// Strip trailing slashes for consistent endpoint concatenation
export const API_BASE_URL = rawApiUrl.replace(/\/+$/, "");
export const SOCKET_BASE_URL = rawSocketUrl.replace(/\/+$/, "");

/**
 * Normalizes media URLs (avatars, image attachments, files) so they always
 * resolve to the deployed backend server instead of localhost or broken relative paths.
 */
export function getMediaUrl(url?: string | null): string {
  if (!url) return "";

  // If already an external absolute URL (e.g. data:, blob:, or https://)
  if (url.startsWith("data:") || url.startsWith("blob:")) {
    return url;
  }

  // If the backend returns a localhost or 127.0.0.1 URL (common in backend upload handlers)
  if (
    url.startsWith("http://localhost:3001") ||
    url.startsWith("http://127.0.0.1:3001")
  ) {
    const pathPart = url.replace(/^http:\/\/(localhost|127\.0\.0\.1):3001/, "");
    return `${API_BASE_URL}${pathPart.startsWith("/") ? "" : "/"}${pathPart}`;
  }

  // If relative path
  if (url.startsWith("/")) {
    return `${API_BASE_URL}${url}`;
  }

  // If already complete HTTPS or HTTP URL
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  // Fallback: assume relative upload path
  return `${API_BASE_URL}/${url}`;
}

