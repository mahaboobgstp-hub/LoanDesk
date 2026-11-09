
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  listAgentRegistrations,
  listAgents,
  approveAgent,
  rejectAgent
} from "../services/agentService";
import { listAllLeads } from "../services/leadService";

const money = value =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(Number(value || 0));

const MENU = [
  { id: "dashboard", label: "Dashboard", icon: "▦" },
  { id: "approvals", label: "Agent Approvals", icon: "✓" },
  { id: "agents", label: "Agent Management", icon: "♙" },
  { id: "applications", label: "All Loan Applications", icon: "▤" },
  { id: "credit", label: "Credit Assessment", icon: "◈" },
  { id: "documents", label: "Document Verification", icon: "▧" },
  { id: "partners", label: "Banks & NBFC Partners", icon: "▥" },
  { id: "rules", label: "Eligibility Rules", icon: "⚙" },
  { id: "reports", label: "Reports & MIS", icon: "▥" },
  { id: "settings", label: "Settings", icon: "⚙" },
  { id: "audit", label: "Audit Logs", icon: "◷" }
];

export default function AdminWorkspace({
  profile,
  onLogout,
  onOpenApplication
}) {
  const [active, setActive] = useState("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [registrations, setRegistrations] = useState([]);
  const [agents, setAgents] = useState([]);
  const [leads, setLeads] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [rules, setRules] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const results = await Promise.all([
        listAgentRegistrations(),
        listAgents(),
        listAllLeads(),
        supabase.from("uploaded_documents")
          .select(`
            id,
            original_name,
            document_type,
            mime_type,
            file_size,
            created_at,
            application_id,
            loan_applications (
              application_no,
              applicant_name,
              mobile
            )
          `)
          .order("created_at", { ascending: false }),
        supabase.from("eligibility_policies")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase.from("audit_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100)
      ]);

      if (results[3].error) throw results[3].error;
      if (results[4].error) throw results[4].error;
      if (results[5].error) throw results[5].error;

      setRegistrations(results[0] || []);
      setAgents(results[1] || []);
      setLeads(results[2] || []);
      setDocuments(results[3].data || []);
      setRules(results[4].data || []);
      setAuditLogs(results[5].data || []);
    } catch (err) {
      setError(err.message || "Unable to load administration data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleApprove(id) {
    if (!window.confirm("Approve this agent registration?")) return;

    setBusyId(id);
    setError("");

    try {
      await approveAgent(id);
      alert("Agent approved. Invitation process initiated.");
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  }

  async function handleReject(id) {
    const reason = window.prompt("Enter the reason for rejection:");
    if (reason === null) return;

    setBusyId(id);
    setError("");

    try {
      await rejectAgent(id, reason);
      alert("Agent registration rejected.");
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  }

  function navigate(id) {
    setActive(id);
    setMenuOpen(false);
  }

  const pendingAgents = registrations.filter(
    item => item.status === "pending"
  );

  const activeAgents = agents.filter(item => item.is_active);

  const pendingLeads = leads.filter(item =>
    ["submitted", "under_review", "on_hold"].includes(item.status)
  );

  const documentRequired = leads.filter(
    item => item.status === "documents_required"
  );

  const pageTitle = MENU.find(item => item.id === active)?.label || "Dashboard";

  return (
    <div className="admin-layout">
      <aside className={`admin-sidebar ${menuOpen ? "admin-sidebar-open" : ""}`}>
        <div className="admin-brand">
          <div className="brand-mark">LD</div>
          <div>
            <b>LoanDesk</b>
            <small>Administration</small>
          </div>
        </div>

        <div className="admin-menu-label">MAIN MENU</div>

        <nav className="admin-nav">
          {MENU.map(item => (
            <button
              key={item.id}
              className={active === item.id ? "admin-nav-active" : ""}
              onClick={() => navigate(item.id)}
            >
              <span className="admin-nav-icon">{item.icon}</span>
              <span>{item.label}</span>

              {item.id === "approvals" && pendingAgents.length > 0 && (
                <span className="admin-menu-count">
                  {pendingAgents.length}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="admin-user">
          <div className="avatar">
            {(profile.full_name || "A").slice(0, 1).toUpperCase()}
          </div>
          <div className="admin-user-info">
            <b>{profile.full_name || "Administrator"}</b>
            <small>Administrator</small>
          </div>
          <button onClick={onLogout} title="Sign out">↪</button>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <button
            className="admin-menu-toggle"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            ☰
          </button>

          <div>
            <p className="eyebrow">ADMINISTRATION WORKSPACE</p>
            <h2>{pageTitle}</h2>
          </div>

          <button className="secondary" onClick={loadData}>
            Refresh
          </button>
        </header>

        {error && (
          <div className="notice danger admin-notice">{error}</div>
        )}

        {loading && (
          <div className="panel">Loading administration data…</div>
        )}

        {!loading && active === "dashboard" && (
          <div className="content-stack">
            <div className="welcome-row">
              <div>
                <p className="eyebrow">OVERVIEW</p>
                <h1>Welcome, {profile.full_name || "Admin"}</h1>
                <p className="muted">
                  Manage your agents, loan applications and eligibility operations.
                </p>
              </div>
            </div>

            <div className="stats-grid">
              <Stat label="Pending agent approvals" value={pendingAgents.length}
                onClick={() => navigate("approvals")} />
              <Stat label="Active agents" value={activeAgents.length}
                onClick={() => navigate("agents")} />
              <Stat label="Total loan applications" value={leads.length}
                onClick={() => navigate("applications")} />
              <Stat label="Pending loan review" value={pendingLeads.length}
                onClick={() => navigate("credit")} />
              <Stat label="Documents required" value={documentRequired.length}
                onClick={() => navigate("applications")} />
              <Stat label="Uploaded documents" value={documents.length}
                onClick={() => navigate("documents")} />
            </div>

            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h3>Pending agent registrations</h3>
                  <p className="muted">New agent applications awaiting your decision.</p>
                </div>
                <button className="secondary" onClick={() => navigate("approvals")}>
                  View all
                </button>
              </div>

              {pendingAgents.length === 0 ? (
                <div className="empty">
                  <b>No pending agent registrations</b>
                  <p>New agent applications will appear here.</p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Agent</th>
                        <th>Email</th>
                        <th>Mobile</th>
                        <th>Location</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingAgents.slice(0, 5).map(item => (
                        <tr key={item.id}>
                          <td>{item.full_name}</td>
                          <td>{item.email}</td>
                          <td>{item.mobile}</td>
                          <td>{item.city}, {item.state}</td>
                          <td>
                            <button className="text-button"
                              onClick={() => navigate("approvals")}>
                              Review
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="panel">
              <h3>Recent loan applications</h3>
              <ApplicationTable
                leads={leads.slice(0, 5)}
                onOpen={onOpenApplication}
              />
            </section>
          </div>
        )}

        {!loading && active === "approvals" && (
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h3>Agent approval requests</h3>
                <p className="muted">
                  Review new agent registrations before account activation.
                </p>
              </div>
              <span className="step-tag">
                {pendingAgents.length} pending
              </span>
            </div>

            {pendingAgents.length === 0 ? (
              <div className="empty">
                <b>All caught up!</b>
                <p>There are no pending agent approvals.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Mobile</th>
                      <th>City</th>
                      <th>State</th>
                      <th>Registered</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingAgents.map(item => (
                      <tr key={item.id}>
                        <td><b>{item.full_name}</b></td>
                        <td>{item.email}</td>
                        <td>{item.mobile}</td>
                        <td>{item.city}</td>
                        <td>{item.state}</td>
                        <td>{new Date(item.created_at).toLocaleDateString("en-IN")}</td>
                        <td>
                          <div className="button-row">
                            <button
                              className="primary"
                              disabled={busyId === item.id}
                              onClick={() => handleApprove(item.id)}
                            >
                              {busyId === item.id ? "Please wait…" : "Approve"}
                            </button>
                            <button
                              className="danger-button"
                              disabled={busyId === item.id}
                              onClick={() => handleReject(item.id)}
                            >
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {!loading && active === "agents" && (
          <section className="panel">
            <h3>Agent management</h3>
            <p className="muted">Registered agent accounts and their activation status.</p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Agent name</th>
                    <th>Agent code</th>
                    <th>Mobile</th>
                    <th>City</th>
                    <th>Status</th>
                    <th>Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map(agent => (
                    <tr key={agent.id}>
                      <td>{agent.full_name}</td>
                      <td>{agent.agent_code || "—"}</td>
                      <td>{agent.mobile || "—"}</td>
                      <td>{agent.city || "—"}</td>
                      <td>
                        <span className={`pill ${agent.is_active ? "green" : "amber"}`}>
                          {agent.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td>{new Date(agent.created_at).toLocaleDateString("en-IN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {agents.length === 0 && <div className="empty">No agents found.</div>}
            </div>
          </section>
        )}

        {!loading && active === "applications" && (
          <section className="panel">
            <h3>All loan applications</h3>
            <p className="muted">Complete application pipeline.</p>
            <ApplicationTable leads={leads} onOpen={onOpenApplication} />
          </section>
        )}

        {!loading && active === "credit" && (
          <section className="panel">
            <h3>Credit assessment queue</h3>
            <p className="muted">
              Open an application to review financial details, credit report data
              and eligibility scenarios.
            </p>
            <ApplicationTable
              leads={leads.filter(item =>
                ["submitted", "under_review", "documents_submitted", "on_hold"].includes(item.status)
              )}
              onOpen={onOpenApplication}
            />
          </section>
        )}

        {!loading && active === "documents" && (
          <section className="panel">
            <h3>Document verification</h3>
            <p className="muted">
              Uploaded files linked to loan applications. Verification workflow
              and document status controls will be added after the document
              review schema is finalized.
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Applicant</th>
                    <th>Application</th>
                    <th>Document type</th>
                    <th>Uploaded</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map(doc => (
                    <tr key={doc.id}>
                      <td>{doc.original_name}</td>
                      <td>{doc.loan_applications?.applicant_name || "—"}</td>
                      <td>{doc.loan_applications?.application_no || "—"}</td>
                      <td>{doc.document_type}</td>
                      <td>{new Date(doc.created_at).toLocaleDateString("en-IN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {documents.length === 0 && <div className="empty">No uploaded documents found.</div>}
          </section>
        )}

        {!loading && active === "partners" && (
          <ComingSoon
            title="Banks & NBFC partnership management"
            description="This module will manage lender profiles, loan products, contact persons, sourcing rules, commission structures and partner-specific eligibility criteria."
            items={[
              "Bank and NBFC master",
              "Lender contact directory",
              "Loan product mapping",
              "Interest rate and processing fee",
              "Agent commission configuration",
              "Lender application tracking"
            ]}
          />
        )}

        {!loading && active === "rules" && (
          <section className="panel">
            <h3>Eligibility rules</h3>
            <p className="muted">
              Existing eligibility policy records. Policy editing and version
              control will be added in the next implementation phase.
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Policy</th>
                    <th>Loan product</th>
                    <th>Income type</th>
                    <th>Eligible income %</th>
                    <th>Minimum score</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map(rule => (
                    <tr key={rule.id}>
                      <td>{rule.policy_name}</td>
                      <td>{rule.loan_product}</td>
                      <td>{rule.income_type}</td>
                      <td>{rule.eligible_income_percent}%</td>
                      <td>{rule.minimum_credit_score ?? "—"}</td>
                      <td>{rule.is_active ? "Active" : "Inactive"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rules.length === 0 && <div className="empty">No eligibility policies configured.</div>}
          </section>
        )}

        {!loading && active === "reports" && (
          <section className="panel">
            <h3>Reports & MIS</h3>
            <p className="muted">Current operational summary.</p>
            <div className="stats-grid">
              <Stat label="Total applications" value={leads.length} />
              <Stat label="Submitted" value={leads.filter(x => x.status === "submitted").length} />
              <Stat label="Under review" value={leads.filter(x => x.status === "under_review").length} />
              <Stat label="Approved for processing" value={leads.filter(x => x.status === "approved_for_processing").length} />
              <Stat label="Rejected" value={leads.filter(x => x.status === "rejected").length} />
              <Stat label="Completed" value={leads.filter(x => x.status === "completed").length} />
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Application status</th><th>Count</th></tr>
                </thead>
                <tbody>
                  {[
                    "submitted",
                    "under_review",
                    "documents_required",
                    "documents_submitted",
                    "approved_for_processing",
                    "rejected",
                    "completed",
                    "on_hold"
                  ].map(status => (
                    <tr key={status}>
                      <td>{status.replaceAll("_", " ")}</td>
                      <td>{leads.filter(x => x.status === status).length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="tiny muted">
              These are live counts from the current application records.
              Financial disbursement and commission reports require additional
              transaction data.
            </p>
          </section>
        )}

        {!loading && active === "settings" && (
          <section className="panel">
            <h3>Administrator settings</h3>
            <p className="muted">Current signed-in administrator profile.</p>
            <div className="detail-grid">
              <Info label="Administrator name" value={profile.full_name} />
              <Info label="User ID" value={profile.id} />
              <Info label="Role" value={profile.role} />
              <Info label="Account status" value="Active" />
            </div>
            <div className="notice warning">
              Organization profile, branding, notification preferences,
              access controls and system configuration are not yet editable.
              These need dedicated settings tables and controls.
            </div>
          </section>
        )}

        {!loading && active === "audit" && (
          <section className="panel">
            <h3>Audit logs</h3>
            <p className="muted">
              Latest records available in the audit log table.
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Action</th>
                    <th>Application ID</th>
                    <th>Actor ID</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map(log => (
                    <tr key={log.id}>
                      <td>{new Date(log.created_at).toLocaleString("en-IN")}</td>
                      <td>{log.action}</td>
                      <td>{log.application_id || "—"}</td>
                      <td>{log.actor_id || "—"}</td>
                      <td>{JSON.stringify(log.details || {})}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {auditLogs.length === 0 && <div className="empty">No audit records found.</div>}
          </section>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value, onClick }) {
  return (
    <div
      className={`stat-card ${onClick ? "stat-clickable" : ""}`}
      onClick={onClick}
    >
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ApplicationTable({ leads, onOpen }) {
  if (!leads.length) {
    return <div className="empty">No applications found.</div>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Application</th>
            <th>Applicant</th>
            <th>Loan product</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {leads.map(item => (
            <tr key={item.id}>
              <td>{item.application_no || item.id.slice(0, 8)}</td>
              <td>{item.applicant_name}</td>
              <td>{item.loan_product}</td>
              <td>{money(item.requested_amount)}</td>
              <td>{item.status?.replaceAll("_", " ")}</td>
              <td>
                <button className="text-button" onClick={() => onOpen(item.id)}>
                  Open →
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ComingSoon({ title, description, items }) {
  return (
    <section className="panel">
      <h3>{title}</h3>
      <p className="muted">{description}</p>
      <div className="detail-grid">
        {items.map(item => (
          <div className="info-item" key={item}>
            <b>{item}</b>
          </div>
        ))}
      </div>
      <div className="notice warning">
        Screen structure planned. Database tables and save/edit functionality
        are not yet connected.
      </div>
    </section>
  );
}

function Info({ label, value }) {
  return (
    <div className="info-item">
      <span>{label}</span>
      <b>{value || "—"}</b>
    </div>
  );
}
