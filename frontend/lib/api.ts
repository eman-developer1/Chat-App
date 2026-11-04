import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from "axios";
import { API_BASE_URL } from "./config";

export interface User {
  id: string;
  email: string;
  username: string;
  bio?: string;
  avatar?: string;
}

export interface AuthSuccessResponse {
  token: string;
  user: User;
}

export interface RegisterResponse {
  message: string;
  email: string;
  isVerified: boolean;
}

export interface VerifyOtpResponse {
  success: boolean;
  message: string;
  isVerified: boolean;
  email?: string;
}

export interface ResendOtpResponse {
  success: boolean;
  message: string;
  waitSeconds?: number;
}

export interface UploadResponse {
  url: string;
  fileName: string;
}

export interface ApiErrorResponse {
  error?: string;
  message?: string;
  isVerified?: boolean;
  email?: string;
  expired?: boolean;
  needsNewCode?: boolean;
  maxAttemptsReached?: boolean;
  remainingAttempts?: number;
  waitSeconds?: number;
}

/**
 * Central Axios instance with base configuration
 */
export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

/**
 * Request Interceptor: Attach JWT Token automatically from storage
 */
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("chat_token");
      if (token && !config.headers.Authorization) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * Extract clean error message from Axios errors
 */
export function extractErrorMessage(err: unknown, defaultMessage = "An unexpected error occurred"): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as ApiErrorResponse | undefined;
    if (data?.error) return data.error;
    if (data?.message) return data.message;
    if (err.message) {
      if (err.code === "ECONNABORTED" || err.message.includes("timeout")) {
        return "Request timed out. Please check your internet connection and backend status.";
      }
      if (err.message.includes("Network Error")) {
        return "Cannot connect to server. Please check your network and backend availability.";
      }
      return err.message;
    }
  } else if (err instanceof Error) {
    return err.message;
  }
  return defaultMessage;
}

/**
 * Authentication API Service
 */
export const authApi = {
  /**
   * Register a new user
   */
  async register(data: { email: string; username: string; password: string }): Promise<RegisterResponse> {
    const res = await apiClient.post<RegisterResponse>("/api/auth/register", data);
    return res.data;
  },

  /**
   * Login with email and password
   */
  async login(data: { email: string; password: string }): Promise<AuthSuccessResponse> {
    const res = await apiClient.post<AuthSuccessResponse>("/api/auth/login", data);
    return res.data;
  },

  /**
   * Verify email via 6-digit OTP
   */
  async verifyEmail(data: { email: string; otp: string }): Promise<VerifyOtpResponse> {
    const res = await apiClient.post<VerifyOtpResponse>("/api/auth/verify-email", data);
    return res.data;
  },

  /**
   * Request resend of verification OTP
   */
  async resendOtp(data: { email: string }): Promise<ResendOtpResponse> {
    const res = await apiClient.post<ResendOtpResponse>("/api/auth/resend-otp", data);
    return res.data;
  },

  /**
   * Fetch current user profile to validate session and sync state
   */
  async getCurrentUser(username: string): Promise<Partial<User>> {
    const res = await apiClient.get<Partial<User>>(`/api/user/${encodeURIComponent(username)}`);
    return res.data;
  },
};

/**
 * Profile API Service
 */
export const profileApi = {
  /**
   * Update current user profile bio and avatar
   */
  async updateProfile(data: { bio?: string; avatar?: string }): Promise<User> {
    const res = await apiClient.put<User>("/api/profile", data);
    return res.data;
  },

  /**
   * Get specific user profile
   */
  async getUser(username: string): Promise<Partial<User>> {
    const res = await apiClient.get<Partial<User>>(`/api/user/${encodeURIComponent(username)}`);
    return res.data;
  },
};

/**
 * Media & File Upload API Service
 */
export const mediaApi = {
  /**
   * Upload an avatar, image, or file attachment
   */
  async uploadFile(file: File): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append("file", file);

    const res = await apiClient.post<UploadResponse>("/api/upload", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return res.data;
  },
};

/**
 * Users & Contacts API Service
 */
export const userApi = {
  /**
   * Search users by username query
   */
  async searchUsers(query: string): Promise<{ username: string; email: string; bio?: string; avatar?: string }[]> {
    if (!query || !query.trim()) return [];
    const res = await apiClient.get<{ username: string; email: string; bio?: string; avatar?: string }[]>(
      `/api/search?q=${encodeURIComponent(query.trim())}`
    );
    return res.data;
  },

  /**
   * Block or unblock a user
   */
  async blockUser(username: string, block: boolean): Promise<{ blockedUsers: string[] }> {
    const res = await apiClient.post<{ blockedUsers: string[] }>("/api/block", {
      username,
      block,
    });
    return res.data;
  },
};
