
import React, { useState } from "react";
import Field from "./Field";
import { registerAgent } from "../services/agentService";

export default function AgentRegistration({ onBack }) {
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    mobile: "",
    city: "",
    state: "",
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const set = (key, value) =>
    setForm((old) => ({ ...old, [key]: value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");

    try {
      await registerAgent(form);
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (success) {
    return (
      <main className="login-wrap">
        <section className="login-card">
          <div className="brand-mark">LD</div>
          <h1>Registration submitted</h1>
          <p className="muted">
            Your registration is awaiting administrator approval.
            Once approved, you will receive an email invitation
            to set your password.
          </p>
          <button className="primary full" onClick={onBack}>
            Back to login
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="login-wrap">
      <section className="login-card">
        <div className="brand-mark">LD</div>
        <p className="eyebrow">AGENT REGISTRATION</p>
        <h1>Join LoanDesk</h1>
        <p className="muted">
          Register your details to request an agent account.
        </p>

        <form onSubmit={submit}>
          <Field label="Full name">
            <input required value={form.full_name}
              onChange={(e) => set("full_name", e.target.value)} />
          </Field>

          <Field label="Email address">
            <input required type="email" value={form.email}
              onChange={(e) => set("email", e.target.value)} />
          </Field>

          <Field label="Mobile number">
            <input required inputMode="numeric"
              pattern="[0-9]{10}" maxLength={10}
              value={form.mobile}
              onChange={(e) => set("mobile", e.target.value)} />
          </Field>

          <Field label="City">
            <input required value={form.city}
              onChange={(e) => set("city", e.target.value)} />
          </Field>

          <Field label="State">
            <input required value={form.state}
              onChange={(e) => set("state", e.target.value)} />
          </Field>

          {error && <div className="notice danger">{error}</div>}

          <button className="primary full" disabled={busy}>
            {busy ? "Submitting…" : "Submit registration"}
          </button>

          <button type="button" className="secondary full"
            onClick={onBack}>
            Back to login
          </button>
        </form>
      </section>
    </main>
  );
}
