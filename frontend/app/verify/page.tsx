"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import { authApi, extractErrorMessage, type ApiErrorResponse } from "@/lib/api";

function VerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [isEditingEmail, setIsEditingEmail] = useState(false);

  const [otp, setOtp] = useState<string[]>(["", "", "", "", "", ""]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isExpired, setIsExpired] = useState(false);
  const [isVerified, setIsVerified] = useState(false);

  // 60-second resend countdown
  const [countdown, setCountdown] = useState<number>(60);

  // Initialize email from URL param or localStorage
  useEffect(() => {
    const paramEmail = searchParams?.get("email");
    const storedEmail = typeof window !== "undefined" ? localStorage.getItem("pending_verify_email") : null;
    const initialEmail = (paramEmail || storedEmail || "").trim();

    if (initialEmail) {
      setEmail(initialEmail);
      setEmailInput(initialEmail);
    } else {
      setIsEditingEmail(true);
    }
  }, [searchParams]);

  // Countdown timer effect
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // Focus the first input box on initial load
  useEffect(() => {
    if (!isEditingEmail && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [isEditingEmail]);

  const handleOtpChange = (index: number, value: string) => {
    setError("");
    const cleaned = value.replace(/\D/g, "");

    // Handle single digit input
    if (cleaned.length <= 1) {
      const nextOtp = [...otp];
      nextOtp[index] = cleaned;
      setOtp(nextOtp);

      // Auto-advance to next input if a digit was entered
      if (cleaned && index < 5) {
        inputRefs.current[index + 1]?.focus();
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (!otp[index] && index > 0) {
        // Move back and clear previous input
        const nextOtp = [...otp];
        nextOtp[index - 1] = "";
        setOtp(nextOtp);
        inputRefs.current[index - 1]?.focus();
      } else if (otp[index]) {
        // Clear current input
        const nextOtp = [...otp];
        nextOtp[index] = "";
        setOtp(nextOtp);
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    setError("");
    const pasteData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasteData) return;

    const nextOtp = [...otp];
    for (let i = 0; i < 6; i++) {
      nextOtp[i] = pasteData[i] || "";
    }
    setOtp(nextOtp);

    // Focus the box following the last pasted digit
    const focusIndex = Math.min(pasteData.length, 5);
    inputRefs.current[focusIndex]?.focus();
  };

  const handleVerify = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const fullOtp = otp.join("");

    if (!email) {
      setError("Please specify your email address.");
      setIsEditingEmail(true);
      return;
    }

    if (fullOtp.length !== 6) {
      setError("Please enter the complete 6-digit verification code.");
      return;
    }

    setError("");
    setLoading(true);
    setIsExpired(false);

    try {
      const data = await authApi.verifyEmail({
        email: email.toLowerCase().trim(),
        otp: fullOtp,
      });

      setSuccess(data.message || "Email verified successfully! Redirecting to login...");
      setIsVerified(true);
      if (typeof window !== "undefined") {
        localStorage.removeItem("pending_verify_email");
        localStorage.setItem("prefill_login_email", email.toLowerCase().trim());
      }

      // Automatically redirect to home/login after a short delay
      setTimeout(() => {
        router.push("/?verified=true");
      }, 2000);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const resData = err.response?.data as ApiErrorResponse | undefined;
        if (resData?.expired) {
          setIsExpired(true);
        }
        if (resData?.isVerified) {
          setIsVerified(true);
        }
      }
      setError(extractErrorMessage(err, "Verification failed. Please check the code."));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email) {
      setError("Please provide an email address first.");
      setIsEditingEmail(true);
      return;
    }

    if (countdown > 0) return;

    setError("");
    setSuccess("");
    setResendLoading(true);
    setIsExpired(false);

    try {
      const data = await authApi.resendOtp({ email: email.toLowerCase().trim() });

      setSuccess(data.message || "A new 6-digit verification code has been sent to your email!");
      setCountdown(data.waitSeconds || 60);
      setOtp(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const resData = err.response?.data as ApiErrorResponse | undefined;
        if (resData?.isVerified) {
          setIsVerified(true);
        }
        if (resData?.waitSeconds) {
          setCountdown(resData.waitSeconds);
        }
      }
      setError(extractErrorMessage(err, "Failed to resend verification code."));
    } finally {
      setResendLoading(false);
    }
  };

  const handleSaveEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim()) return;
    setEmail(emailInput.trim());
    setIsEditingEmail(false);
    if (typeof window !== "undefined") {
      localStorage.setItem("pending_verify_email", emailInput.trim());
    }
    setError("");
    setSuccess("");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-tg-bg px-4 py-8">
      <div className="bg-tg-sidebar p-8 rounded-2xl shadow-2xl w-full max-w-md mx-auto border border-tg-input">
        {/* Header Section */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-tg-blue rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-tg-blue/20">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="white"
              className="w-8 h-8"
            >
              <path d="M1.5 8.67v8.58a3 3 0 003 3h15a3 3 0 003-3V8.67l-8.928 5.493a3 3 0 01-3.144 0L1.5 8.67z" />
              <path d="M22.5 6.908V6.75a3 3 0 00-3-3h-15a3 3 0 00-3 3v.158l9.714 5.978a1.5 1.5 0 001.572 0L22.5 6.908z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-tg-text">Verify Your Email</h1>
          <p className="text-tg-text-secondary text-sm mt-1">
            We sent a 6-digit confirmation code to your email address.
          </p>
        </div>

        {/* Email Address Display / Change */}
        <div className="mb-6 bg-tg-input/50 rounded-xl p-3 border border-tg-input">
          {isEditingEmail ? (
            <form onSubmit={handleSaveEmail} className="flex gap-2">
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="your.email@example.com"
                required
                className="flex-1 bg-tg-input text-tg-text placeholder-tg-text-secondary rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-tg-blue"
              />
              <button
                type="submit"
                className="bg-tg-blue hover:bg-tg-blue-dark text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors"
              >
                Set
              </button>
            </form>
          ) : (
            <div className="flex items-center justify-between">
              <div className="truncate mr-2">
                <span className="text-xs text-tg-text-secondary block">Destination Email:</span>
                <span className="text-sm font-medium text-tg-text truncate block">{email}</span>
              </div>
              <button
                type="button"
                onClick={() => setIsEditingEmail(true)}
                className="text-xs text-tg-blue hover:underline whitespace-nowrap"
              >
                Change
              </button>
            </div>
          )}
        </div>

        {/* Feedback Messages */}
        {error && (
          <div className="mb-5 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-start gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 shrink-0 mt-0.5">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
            <div className="flex-1">
              <p>{error}</p>
              {isExpired && (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendLoading || countdown > 0}
                  className="mt-1 text-xs font-semibold text-tg-blue hover:underline block"
                >
                  Click here to request a fresh verification code
                </button>
              )}
            </div>
          </div>
        )}

        {success && (
          <div className="mb-5 p-3 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 text-sm flex items-start gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 shrink-0 mt-0.5">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
            </svg>
            <p className="flex-1">{success}</p>
          </div>
        )}

        {/* Verification Form */}
        <form onSubmit={handleVerify} className="space-y-6">
          {/* 6 Digit Inputs */}
          <div>
            <label className="block text-xs font-medium text-tg-text-secondary uppercase tracking-wider mb-3 text-center">
              Enter 6-Digit Code
            </label>
            <div className="flex justify-between gap-2">
              {otp.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => {
                    inputRefs.current[index] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={1}
                  value={digit}
                  disabled={loading || isVerified}
                  onChange={(e) => handleOtpChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  onPaste={handlePaste}
                  className="w-12 h-14 text-center text-2xl font-bold bg-tg-input text-tg-text rounded-xl border border-tg-input focus:border-tg-blue focus:ring-2 focus:ring-tg-blue/40 outline-none transition-all disabled:opacity-50"
                />
              ))}
            </div>
          </div>

          {/* Verify Button */}
          <button
            type="submit"
            disabled={loading || otp.join("").length !== 6 || isVerified}
            className="w-full bg-tg-blue hover:bg-tg-blue-dark text-white font-medium py-3.5 rounded-xl transition-all shadow-md shadow-tg-blue/20 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
                <span>Verifying Code...</span>
              </>
            ) : isVerified ? (
              "Verified!"
            ) : (
              "Verify Email"
            )}
          </button>
        </form>

        {/* Resend Countdown & Action */}
        <div className="mt-6 text-center text-sm">
          {countdown > 0 ? (
            <p className="text-tg-text-secondary">
              Resend code in{" "}
              <span className="text-tg-text font-semibold">{countdown}s</span>
            </p>
          ) : (
            <div className="flex items-center justify-center gap-1 text-tg-text-secondary">
              <span>Didn&apos;t receive the code?</span>
              <button
                type="button"
                onClick={handleResend}
                disabled={resendLoading || isVerified}
                className="text-tg-blue hover:underline font-semibold disabled:opacity-50 inline-flex items-center gap-1"
              >
                {resendLoading ? "Sending..." : "Resend Code"}
              </button>
            </div>
          )}
        </div>

        {/* Back to Login link */}
        <div className="mt-8 pt-5 border-t border-tg-input text-center">
          <Link
            href="/"
            className="text-tg-text-secondary hover:text-tg-text text-sm transition-colors inline-flex items-center gap-1.5"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
            </svg>
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen flex items-center justify-center bg-tg-bg text-tg-text">
          <div className="flex items-center gap-2">
            <svg className="animate-spin h-5 w-5 text-tg-blue" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            <span>Loading verification...</span>
          </div>
        </div>
      }
    >
      <VerifyContent />
    </Suspense>
  );
}
