import { useState } from "react";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import styles from "../../styles/SignUp.module.css";

export default function BetaOnboarding() {
  const { status } = useSession();
  const router = useRouter();
  const [betaType, setBetaType] = useState("social"); // "school" or "social"
  const [formData, setFormData] = useState({
    schoolName: "",
    organizationName: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (status === "loading") {
    return (
      <div className={styles.signupContainer}>
        <div className={styles.signupCard}>
          <h1 className={styles.pageTitle}>Beta Program</h1>
          <p style={{ textAlign: "center", color: "var(--text-muted)" }}>
            Loading...
          </p>
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    router.push("/signup");
    return null;
  }

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // Validate based on beta type
    if (betaType === "school") {
      if (!formData.schoolName?.trim()) {
        return setError("School name is required.");
      }
    }
    // Organization name is optional for social type

    setLoading(true);

    try {
      const res = await fetch("/api/beta/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trialType: betaType,
          schoolName: betaType === "school" ? formData.schoolName.trim() : null,
          organizationName: formData.organizationName?.trim() || null,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(data.error || "Failed to join beta program.");
        setLoading(false);
        return;
      }

      // If server returned a redirect (Stripe checkout) for a one-time beta payment,
      // redirect them to the Stripe checkout page.
      const redirect = data?.data?.redirect;
      if (redirect && redirect.method === 'stripe' && redirect.url) {
        window.location.href = redirect.url;
        return;
      }

      // Success - redirect to dashboard
      router.push("/dashboard");
    } catch (err) {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className={styles.signupContainer}>
      <div className={styles.signupCard} style={{ maxWidth: "500px" }}>
        <h1 className={styles.pageTitle}>Join Beta Program</h1>
        <p style={{ textAlign: "center", marginBottom: "1.5rem", color: "var(--text-muted)" }}>
          Get limited access to Lift while we develop new features for only $3
        </p>

        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label style={{ marginBottom: "0.75rem", display: "block" }}>
              <strong>Trial Type</strong>
            </label>
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
              <label
                style={{
                  flex: 1,
                  padding: "0.75rem",
                  border:
                    betaType === "social"
                      ? "2px solid #1f003bff"
                      : "1px solid var(--card-border)",
                  borderRadius: "6px",
                  cursor: "pointer",
                  textAlign: "center",
                  backgroundColor:
                    betaType === "social"
                      ? "rgba(31, 0, 59, 0.12)"
                      : "transparent",
                }}
              >
                <input
                  type="radio"
                  name="betaType"
                  value="social"
                  checked={betaType === "social"}
                  onChange={() => {
                    setBetaType("social");
                    setFormData({ schoolName: "", organizationName: "" });
                  }}
                  style={{ marginRight: "0.5rem" }}
                />
                Individual (3-4 days)
              </label>
              <label
                style={{
                  flex: 1,
                  padding: "0.75rem",
                  border:
                    betaType === "school"
                      ? "2px solid var(--accent)"
                      : "1px solid var(--card-border)",
                  borderRadius: "6px",
                  cursor: "pointer",
                  textAlign: "center",
                  backgroundColor:
                    betaType === "school"
                      ? "rgba(var(--accent-rgb), 0.08)"
                      : "transparent",
                }}
              >
                <input
                  type="radio"
                  name="betaType"
                  value="school"
                  checked={betaType === "school"}
                  onChange={() => {
                    setBetaType("school");
                    setFormData({ schoolName: "", organizationName: "" });
                  }}
                  style={{ marginRight: "0.5rem" }}
                />
                School (14 days)
              </label>
            </div>
          </div>

          {betaType === "social" && (
            <div className={styles.formGroup}>
              <label htmlFor="org-name">Organization Name (Optional)</label>
              <input
                id="org-name"
                name="organizationName"
                type="text"
                value={formData.organizationName}
                onChange={handleChange}
                placeholder="Your organization or school"
              />
              <small style={{ color: "var(--text-muted)" }}>
                Tell us about your organization if applicable
              </small>
            </div>
          )}

          {betaType === "school" && (
            <div className={styles.formGroup}>
              <label htmlFor="school-name">School Name</label>
              <input
                id="school-name"
                name="schoolName"
                type="text"
                value={formData.schoolName}
                onChange={handleChange}
                placeholder="Your school name"
                required
              />
            </div>
          )}

          {error && (
            <div
              style={{
                color: "#dc2626",
                marginBottom: "1rem",
                padding: "0.75rem",
                backgroundColor: "rgba(220, 38, 38, 0.08)",
                borderRadius: "6px",
                fontSize: "0.9rem",
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={styles.submitButton}
            style={{ opacity: loading ? 0.6 : 1, cursor: loading ? "not-allowed" : "pointer" }}
          >
            {loading ? "Joining..." : "Join Beta Program"}
          </button>
        </form>

        <p style={{ textAlign: "center", fontSize: "0.85em", color: "var(--text-muted)", marginTop: "1.5rem" }}>
          {betaType === "school"
            ? "14-day free trial. Full access to Lift Notes and Lift Career."
            : "3-4 day free trial. Full access to all features."}
        </p>
      </div>
    </div>
  );
}
