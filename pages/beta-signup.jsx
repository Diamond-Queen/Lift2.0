import { useState } from "react";
import { useRouter } from "next/router";
import { useSession, signIn } from "next-auth/react";
import Link from "next/link";
import styles from "../styles/SignUp.module.css";

export default function BetaSignup() {
  const { status } = useSession();
  const router = useRouter();
  const [trialType, setTrialType] = useState(null); // "school" or "social"
  const [formData, setFormData] = useState({
    email: "",
    name: "",
    schoolName: "",
    organizationName: "",
    password: "", // For new signups
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isNewUser, setIsNewUser] = useState(status === 'unauthenticated');

  // If user is not authenticated, redirect to signup
  if (status === "loading") {
    return (
      <div className={styles.signupContainer}>
        <div className={styles.signupCard}>
          <h1 className={styles.pageTitle}>Beta Testing Program</h1>
          <p style={{ textAlign: "center", color: "var(--text-muted)" }}>
            Loading...
          </p>
        </div>
      </div>
    );
  }

  // For unauthenticated users, show a combined signup + beta form
  // For authenticated users, show just the beta form

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const passwordMeetsPolicy = (pwd) => {
    return typeof pwd === 'string' && pwd.length >= 10 && /[0-9]/.test(pwd) && /[!@#$%^&*(),.?":{}|<>]/.test(pwd);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!trialType) {
      return setError("Please select a trial type.");
    }

    if (!formData.name || !formData.email) {
      return setError("Name and email are required.");
    }

    if (isNewUser && !formData.password) {
      return setError("Password is required to create an account.");
    }

    if (isNewUser && !passwordMeetsPolicy(formData.password)) {
      return setError("Password must be ≥10 chars and include a number & symbol.");
    }

    if (trialType === "school" && !formData.schoolName) {
      return setError("School name is required for school trials.");
    }

    if (trialType === "social" && !formData.organizationName) {
      return setError("Organization/Team name is required.");
    }

    setLoading(true);

    try {
      // If new user, register account first
      if (isNewUser) {
        const regRes = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formData.name.trim(),
            email: formData.email.trim().toLowerCase(),
            password: formData.password,
          }),
        });

        const regData = await regRes.json();
        if (!regRes.ok || !regData.ok) {
          setError(regData.error || "Failed to create account.");
          setLoading(false);
          return;
        }

        // Sign in the newly created user
        const signInRes = await signIn('credentials', {
          redirect: false,
          email: formData.email.trim().toLowerCase(),
          password: formData.password,
        });

        if (signInRes?.error) {
          setError(signInRes.error || 'Sign-in failed');
          setLoading(false);
          return;
        }
      }

      // Now register for beta
      const res = await fetch("/api/beta/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email.trim().toLowerCase(),
          name: formData.name.trim(),
          trialType,
          schoolName: trialType === "school" ? formData.schoolName.trim() : null,
          organizationName:
            trialType === "social" ? formData.organizationName.trim() : null,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(data.error || "Failed to register for beta program.");
        setLoading(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push("/dashboard");
      }, 2000);
    } catch (err) {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className={styles.signupContainer}>
        <div className={styles.signupCard}>
          <h1 className={styles.pageTitle}>Welcome to the Beta!</h1>
          <p style={{ textAlign: "center", color: "var(--text-success)" }}>
            ✓ Your beta trial has been activated! You'll be redirected to your
            dashboard shortly.
          </p>
          <p style={{ textAlign: "center", color: "var(--text-muted)", marginTop: "10px" }}>
            {trialType === "school"
              ? "You have 14 days of free access for your school."
              : "You have 3-4 days of free access to explore the platform."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.signupContainer}>
      <div className={styles.signupCard} style={{ maxWidth: "500px" }}>
        <h1 className={styles.pageTitle}>Join Our Beta Testing Program</h1>
        <p
          style={{
            textAlign: "center",
            color: "var(--text-muted)",
            marginBottom: "20px",
          }}
        >
          Be part of shaping the future of Lift. Get early access and help us
          improve!
        </p>

        {!trialType ? (
          // Trial Type Selection
          <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
            <div
              style={{
                padding: "15px",
                border: "2px solid var(--border-color)",
                borderRadius: "8px",
                cursor: "pointer",
                transition: "all 0.3s",
              }}
              onClick={() => setTrialType("school")}
              onMouseEnter={(e) =>
                (e.currentTarget.style.borderColor = "var(--primary-color)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.borderColor = "var(--border-color)")
              }
            >
              <h3 style={{ margin: "0 0 8px 0" }}>🏫 School Beta (14 days)</h3>
              <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.9em" }}>
                For schools and educational institutions. Get 2 weeks of free
                access.
              </p>
            </div>

            <div
              style={{
                padding: "15px",
                border: "2px solid var(--border-color)",
                borderRadius: "8px",
                cursor: "pointer",
                transition: "all 0.3s",
              }}
              onClick={() => setTrialType("social")}
              onMouseEnter={(e) =>
                (e.currentTarget.style.borderColor = "var(--primary-color)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.borderColor = "var(--border-color)")
              }
            >
              <h3 style={{ margin: "0 0 8px 0" }}>🚀 Social Beta (3-4 days)</h3>
              <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.9em" }}>
                For individuals and organizations. Quick trial to experience Lift.
              </p>
            </div>
          </div>
        ) : (
          // Registration Form
          <form onSubmit={handleSubmit} noValidate>
            <div style={{ marginBottom: "15px" }}>
              <button
                type="button"
                className={styles.submitButton}
                style={{
                  marginBottom: "15px",
                  backgroundColor: "var(--text-muted)",
                }}
                onClick={() => setTrialType(null)}
              >
                ← Change Trial Type
              </button>

              <p style={{ textAlign: "center", color: "var(--text-muted)" }}>
                {trialType === "school"
                  ? " School Beta Program (14 days free)"
                  : " Social Beta Program (3-4 days free)"}
              </p>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="beta-name">Full Name</label>
              <input
                id="beta-name"
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Your full name"
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="beta-email">Email</label>
              <input
                id="beta-email"
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="your@email.com"
                required
              />
            </div>

            {isNewUser && (
              <div className={styles.formGroup}>
                <label htmlFor="beta-password">Password</label>
                <input
                  id="beta-password"
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Create a password"
                  autoComplete="new-password"
                  required
                />
                <small style={{ display: "block", marginTop: "4px", color: "var(--text-muted)" }}>
                  Must be ≥10 chars, include a number & symbol.
                </small>
              </div>
            )}

            {trialType === "school" && (
              <div className={styles.formGroup}>
                <label htmlFor="beta-school">School Name *</label>
                <input
                  id="beta-school"
                  type="text"
                  name="schoolName"
                  value={formData.schoolName}
                  onChange={handleChange}
                  placeholder="Your school name"
                  required
                />
                <small style={{ display: "block", marginTop: "4px", color: "var(--text-muted)" }}>
                  This helps us support your institution better
                </small>
              </div>
            )}

            {trialType === "social" && (
              <div className={styles.formGroup}>
                <label htmlFor="beta-org">Organization/Team Name (Optional)</label>
                <input
                  id="beta-org"
                  type="text"
                  name="organizationName"
                  value={formData.organizationName}
                  onChange={handleChange}
                  placeholder="Your organization or team name"
                />
              </div>
            )}

            <button
              className={styles.submitButton}
              type="submit"
              disabled={loading}
            >
              {loading ? "Starting Your Trial..." : "Start Beta Trial"}
            </button>


            {error && (
              <div
                id="beta-error"
                className={styles.errorMessage}
                role="alert"
                aria-live="assertive"
              >
                {error}
              </div>
            )}
          </form>
        )}

        <div style={{ marginTop: "20px", textAlign: "center" }}>

          <button
              type="button"
              className={styles.submitButton}
              style={{
                marginTop: "10px",
                backgroundColor: "transparent",
                border: "1px solid var(--border-color)",
                color: "var(--text-muted)",
              }}
              onClick={() => router.push("/onboarding")}
             >
              No thanks
              </button>

          <p style={{ fontSize: "0.9em", color: "var(--text-muted)" }}>
            Questions? Email us at{" "}
            <a href="mailto:williams.lift101@gmail.com" style={{ color: "var(--primary-color)" }}>
              williams.lift101@gmail.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
