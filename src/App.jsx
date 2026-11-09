import React, { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "./lib/supabase";
import AgentRegistration from "./components/AgentRegistration";
import { signIn, signOut } from "./services/authService";
import { listAllLeads, listMyLeads } from "./services/leadService";
import { createLead } from "./services/leadService";
import { uploadPrivateDocument } from "./services/documentService";
import { saveAssessment, updateApplicationDecision, saveDocumentRequirements } from "./services/decisionService";
import { evaluateScenario } from "./services/eligibilityService";
import { LOAN_PRODUCTS } from "./lib/constants";
import Field from "./components/Field";
import StatusPill from "./components/StatusPill";

const money = n => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));

function Login({ onLogin, onSignup }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");

    try {
      await onLogin(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-wrap">
      <section className="login-card">
        <div className="brand-mark">LD</div>

        <p className="eyebrow">LOAN ELIGIBILITY WORKSPACE</p>
        <h1>Welcome back</h1>

        <p className="muted">
          Sign in to your secure LoanDesk account.
        </p>

        {!isSupabaseConfigured && (
          <div className="notice warning">
            Supabase is not configured. Add the project URL and
            publishable key to your environment.
          </div>
        )}

        <form onSubmit={submit}>
          <Field label="Email address">
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </Field>

          <Field label="Password">
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </Field>

          {error && (
            <div className="notice danger">{error}</div>
          )}

          <button
            className="primary full"
            disabled={busy || !isSupabaseConfigured}
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="login-divider">
          <span>OR</span>
        </div>

        <button
          type="button"
          className="secondary full"
          onClick={onSignup}
        >
          Sign Up as Agent
        </button>

        <p className="tiny muted">
          New agents can register here. All registrations
          require administrator approval.
        </p>
      </section>
    </main>
  );
}

function Shell({ profile, children, onLogout, active, setActive }) {
  return <div className="app-shell"><aside className="sidebar">
    <div className="brand"><span className="brand-mark small">LD</span><div><b>LoanDesk</b><small>Eligibility workspace</small></div></div>
    <nav>
      <button className={active==="dashboard"?"nav-active":""} onClick={()=>setActive("dashboard")}>▦ Dashboard</button>
      {profile.role === "agent" && <button className={active==="new"?"nav-active":""} onClick={()=>setActive("new")}>＋ Add lead</button>}
    </nav>
    <div className="side-bottom"><div className="avatar">{(profile.full_name||"U").slice(0,1).toUpperCase()}</div><div className="profile-label"><b>{profile.full_name || "User"}</b><small>{profile.role}</small></div><button className="icon-button" onClick={onLogout} title="Sign out">↪</button></div>
  </aside><main className="main-area"><header className="topbar"><div><span className="eyebrow">WORKSPACE</span><h2>{active==="new"?"Create new lead":profile.role==="admin"?"Admin overview":"Agent overview"}</h2></div><span className="role-chip">{profile.role}</span></header>{children}</main></div>;
}

function LeadForm({ onCreated }) {
  const [form, setForm] = useState({
    applicant_name:"", mobile:"", email:"", pan:"", loan_product:"Personal Loan", requested_amount:"",
    income_type:"salaried", employment_type:"private", employer_name:"", gross_salary:"", net_salary:"",
    pf_deduction:false, salary_bank_credit:false, business_name:"", business_constitution:"proprietorship",
    business_vintage_years:"", business_nature:"", co_applicant_available:false,
    co_applicant_name:"", co_applicant_mobile:"", co_applicant_email:"", co_applicant_pan:"",
    bureau_name:"CIBIL", report_source:"direct", existing_emi:"", other_obligations:""
  });
  const [financialYears,setFinancialYears] = useState([
    { fy:"FY 2025-26", itr_turnover:"", itr_net_income:"", gst_turnover:"" },
    { fy:"FY 2024-25", itr_turnover:"", itr_net_income:"", gst_turnover:"" },
    { fy:"FY 2023-24", itr_turnover:"", itr_net_income:"", gst_turnover:"" }
  ]);
  const [report,setReport] = useState(null); const [busy,setBusy] = useState(false); const [error,setError] = useState("");
  const set = (key,value)=>setForm(old=>({...old,[key]:value}));
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const payload = {
        applicant_name:form.applicant_name.trim(), mobile:form.mobile.trim(), email:form.email.trim()||null,
        pan:form.pan.trim().toUpperCase(), loan_product:form.loan_product, requested_amount:Number(form.requested_amount),
        income_type:form.income_type, status:"submitted",
        co_applicant_available:form.co_applicant_available,
        agent_notes:null
      };
      const lead = await createLead(payload);
      const incomePayload = {
        application_id:lead.id, income_type:form.income_type,
        employment_type:form.income_type==="salaried"?form.employment_type:null,
        employer_name:form.employer_name||null, gross_monthly_salary:Number(form.gross_salary)||null,
        net_monthly_salary:Number(form.net_salary)||null, pf_deduction:form.pf_deduction,
        salary_credited_to_bank:form.salary_bank_credit,
        business_name:form.business_name||null, business_constitution:form.business_constitution,
        business_vintage_years:Number(form.business_vintage_years)||null, business_nature:form.business_nature||null,
        existing_monthly_emi:Number(form.existing_emi)||0, other_monthly_obligations:Number(form.other_obligations)||0,
        financial_years:financialYears
      };
      const { error:incomeError } = await supabase.from("applicant_income").insert(incomePayload);
      if (incomeError) throw incomeError;
      if (form.co_applicant_available) {
        const { error:coError } = await supabase.from("co_applicants").insert({
          application_id:lead.id, full_name:form.co_applicant_name, mobile:form.co_applicant_mobile,
          email:form.co_applicant_email||null, pan:form.co_applicant_pan||null
        });
        if (coError) throw coError;
      }
      if (report) {
        const uploaded = await uploadPrivateDocument(lead.id, report, "credit_report");
        const { error:reportError } = await supabase.from("credit_reports").insert({
          application_id:lead.id, document_id:uploaded.id, bureau_name:form.bureau_name,
          report_source:form.report_source, extraction_status:"pending_verification"
        });
        if (reportError) throw reportError;
      }
      onCreated();
    } catch(err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <section className="panel"><div className="panel-heading"><div><p className="eyebrow">AGENT WORKSPACE</p><h3>New loan lead</h3><p className="muted">Enter the applicant details and submit for admin review.</p></div><span className="step-tag">Application form</span></div>
    <form onSubmit={submit} className="form-grid">
      <h4 className="form-section">01 · Loan requirement</h4>
      <Field label="Loan product"><select value={form.loan_product} onChange={e=>set("loan_product",e.target.value)}>{LOAN_PRODUCTS.map(g=><optgroup key={g.group} label={g.group}>{g.items.map(x=><option key={x}>{x}</option>)}</optgroup>)}</select></Field>
      <Field label="Required loan amount (₹)"><input type="number" min="1" required value={form.requested_amount} onChange={e=>set("requested_amount",e.target.value)} /></Field>
      <h4 className="form-section">02 · Applicant details</h4>
      <Field label="Applicant full name"><input required value={form.applicant_name} onChange={e=>set("applicant_name",e.target.value)} /></Field>
      <Field label="Mobile number"><input required inputMode="numeric" pattern="[0-9]{10}" value={form.mobile} onChange={e=>set("mobile",e.target.value)} /></Field>
      <Field label="Email ID"><input type="email" value={form.email} onChange={e=>set("email",e.target.value)} /></Field>
      <Field label="PAN number"><input required maxLength="10" value={form.pan} onChange={e=>set("pan",e.target.value.toUpperCase())} /></Field>
      <h4 className="form-section">03 · Income profile</h4>
      <Field label="Income type"><select value={form.income_type} onChange={e=>set("income_type",e.target.value)}><option value="salaried">Salaried employee</option><option value="business">Business owner / self-employed</option><option value="professional">Self-employed professional</option></select></Field>
      {form.income_type==="salaried" ? <>
        <Field label="Employment type"><select value={form.employment_type} onChange={e=>set("employment_type",e.target.value)}><option value="government">Government</option><option value="private">Private</option></select></Field>
        <Field label="Employer name"><input value={form.employer_name} onChange={e=>set("employer_name",e.target.value)} /></Field>
        <Field label="Gross monthly salary (₹)"><input type="number" min="0" value={form.gross_salary} onChange={e=>set("gross_salary",e.target.value)} /></Field>
        <Field label="Net monthly salary (₹)"><input type="number" min="0" required value={form.net_salary} onChange={e=>set("net_salary",e.target.value)} /></Field>
        <Field label="PF deduction"><select value={String(form.pf_deduction)} onChange={e=>set("pf_deduction",e.target.value==="true")}><option value="false">No</option><option value="true">Yes</option></select></Field>
        <Field label="Salary credited to bank"><select value={String(form.salary_bank_credit)} onChange={e=>set("salary_bank_credit",e.target.value==="true")}><option value="false">No</option><option value="true">Yes</option></select></Field>
      </> : <>
        <Field label="Business name"><input value={form.business_name} onChange={e=>set("business_name",e.target.value)} /></Field>
        <Field label="Business constitution"><select value={form.business_constitution} onChange={e=>set("business_constitution",e.target.value)}><option value="proprietorship">Proprietorship</option><option value="partnership">Partnership</option><option value="llp">LLP</option><option value="private_limited">Private Limited</option><option value="other">Other</option></select></Field>
        <Field label="Business vintage (years)"><input type="number" min="0" step="0.5" value={form.business_vintage_years} onChange={e=>set("business_vintage_years",e.target.value)} /></Field>
        <Field label="Nature of business"><input value={form.business_nature} onChange={e=>set("business_nature",e.target.value)} /></Field>
        <div className="wide"><h4 className="subheading">Last three financial years (₹)</h4><div className="table-wrap"><table><thead><tr><th>Financial year</th><th>ITR turnover</th><th>ITR net income</th><th>GST turnover</th></tr></thead><tbody>{financialYears.map((r,i)=><tr key={r.fy}><td>{r.fy}</td>{["itr_turnover","itr_net_income","gst_turnover"].map(k=><td><input type="number" min="0" value={r[k]} onChange={e=>setFinancialYears(old=>old.map((x,j)=>j===i?{...x,[k]:e.target.value}:x))}/></td>)}</tr>)}</tbody></table></div></div>
      </>}
      <Field label="Existing monthly EMIs (₹)"><input type="number" min="0" value={form.existing_emi} onChange={e=>set("existing_emi",e.target.value)} /></Field>
      <Field label="Other monthly obligations (₹)"><input type="number" min="0" value={form.other_obligations} onChange={e=>set("other_obligations",e.target.value)} /></Field>
      <h4 className="form-section">04 · Co-applicant</h4>
      <Field label="Co-applicant available"><select value={String(form.co_applicant_available)} onChange={e=>set("co_applicant_available",e.target.value==="true")}><option value="false">No</option><option value="true">Yes</option></select></Field>
      {form.co_applicant_available && <>
        <Field label="Co-applicant name"><input required value={form.co_applicant_name} onChange={e=>set("co_applicant_name",e.target.value)} /></Field>
        <Field label="Co-applicant mobile"><input required value={form.co_applicant_mobile} onChange={e=>set("co_applicant_mobile",e.target.value)} /></Field>
        <Field label="Co-applicant email"><input type="email" value={form.co_applicant_email} onChange={e=>set("co_applicant_email",e.target.value)} /></Field>
        <Field label="Co-applicant PAN"><input maxLength="10" value={form.co_applicant_pan} onChange={e=>set("co_applicant_pan",e.target.value.toUpperCase())} /></Field>
      </>}
      <h4 className="form-section">05 · Credit report</h4>
      <Field label="Credit bureau"><select value={form.bureau_name} onChange={e=>set("bureau_name",e.target.value)}><option>CIBIL</option><option>Experian</option><option>Equifax</option><option>CRIF High Mark</option></select></Field>
      <Field label="Report source"><select value={form.report_source} onChange={e=>set("report_source",e.target.value)}><option value="direct">Direct bureau</option><option value="third_party">Third-party provider</option></select></Field>
      <Field label="Upload credit report PDF"><input type="file" accept="application/pdf,.pdf" onChange={e=>setReport(e.target.files?.[0]||null)} /><small>PDF only · maximum 15 MB</small></Field>
      <div className="wide consent"><input type="checkbox" required id="consent"/><label htmlFor="consent">I confirm that the applicant has authorized collection and processing of the information and credit report for preliminary loan assessment.</label></div>
      {error && <div className="wide notice danger">{error}</div>}
      <div className="wide form-actions"><button className="primary" disabled={busy}>{busy?"Submitting…":"Submit lead for review"}</button></div>
    </form>
  </section>;
}

function Dashboard({ profile, onNewLead, onOpen }) {
  const [leads,setLeads]=useState([]); const [loading,setLoading]=useState(true); const [error,setError]=useState("");
  async function load(){setLoading(true);try{setLeads(profile.role==="admin"?await listAllLeads():await listMyLeads());}catch(e){setError(e.message);}finally{setLoading(false);}}
  useEffect(()=>{load();},[profile.role]);
  const counts = { total:leads.length, pending:leads.filter(x=>["submitted","under_review","on_hold"].includes(x.status)).length, docs:leads.filter(x=>x.status==="documents_required").length, rejected:leads.filter(x=>x.status==="rejected").length };
  return <div className="content-stack">
    <div className="welcome-row"><div><p className="eyebrow">OVERVIEW</p><h1>Hello, {profile.full_name?.split(" ")[0]||"there"}</h1><p className="muted">{profile.role==="admin"?"Review incoming files and manage the loan pipeline.":"Track your submitted loan applications."}</p></div>{profile.role==="agent"&&<button className="primary" onClick={onNewLead}>＋ Add lead</button>}</div>
    <div className="stats-grid"><Stat label="Total leads" value={counts.total}/><Stat label="Pending review" value={counts.pending}/><Stat label="Documents required" value={counts.docs}/><Stat label="Rejected" value={counts.rejected}/></div>
    <section className="panel"><div className="panel-heading"><div><h3>{profile.role==="admin"?"All loan applications":"Your applications"}</h3><p className="muted">Most recent submissions first</p></div><button className="secondary" onClick={load}>Refresh</button></div>
      {error&&<div className="notice danger">{error}</div>}
      {loading?<p className="muted">Loading applications…</p>:leads.length===0?<div className="empty"><b>No applications yet</b><p>New submissions will appear here.</p></div>:<div className="table-wrap"><table><thead><tr><th>Application</th><th>Applicant</th><th>Loan product</th><th>Amount</th><th>Status</th><th></th></tr></thead><tbody>{leads.map(l=><tr key={l.id}><td><b>{l.application_no||l.id.slice(0,8)}</b><small>{new Date(l.created_at).toLocaleDateString("en-IN")}</small></td><td>{l.applicant_name}</td><td>{l.loan_product}</td><td>{money(l.requested_amount)}</td><td><StatusPill status={l.status}/></td><td><button className="text-button" onClick={()=>onOpen(l.id)}>Open →</button></td></tr>)}</tbody></table></div>}
    </section>
  </div>;
}
function Stat({label,value}){return <div className="stat-card"><span>{label}</span><strong>{value}</strong></div>}

function DecisionWorkspace({ id, onBack }) {
  const [bundle,setBundle]=useState(null); const [busy,setBusy]=useState(true); const [error,setError]=useState("");
  const [percent,setPercent]=useState(60); const [rate,setRate]=useState(14); const [tenure,setTenure]=useState(60);
  const [notes,setNotes]=useState(""); const [docs,setDocs]=useState("Latest 3 months salary slips\nLatest 6 months bank statement\nPAN card");
  async function load(){
    setBusy(true);try{
      const {data:application,error:aerr}=await supabase.from("loan_applications").select("*").eq("id",id).single();if(aerr)throw aerr;
      const [income,co,reports,accounts,dpd,assessments,requirements]=await Promise.all([
        supabase.from("applicant_income").select("*").eq("application_id",id).maybeSingle(),
        supabase.from("co_applicants").select("*").eq("application_id",id),
        supabase.from("credit_reports").select("*").eq("application_id",id),
        supabase.from("credit_accounts").select("*").eq("application_id",id),
        supabase.from("credit_dpd_history").select("*").eq("application_id",id).order("month",{ascending:false}),
        supabase.from("eligibility_assessments").select("*").eq("application_id",id).order("created_at",{ascending:false}),
        supabase.from("document_requirements").select("*").eq("application_id",id)
      ]);
      [income,co,reports,accounts,dpd,assessments,requirements].forEach(x=>{if(x.error)throw x.error;});
      setBundle({application,income:income.data,co:co.data,reports:reports.data,accounts:accounts.data,dpd:dpd.data,assessments:assessments.data,requirements:requirements.data});
      setPercent(60);
    }catch(e){setError(e.message);}finally{setBusy(false);}
  }
  useEffect(()=>{load();},[id]);
  if(busy)return <section className="panel">Loading application…</section>;
  if(error)return <section className="panel"><div className="notice danger">{error}</div><button onClick={onBack}>Back</button></section>;
  const a=bundle.application, inc=bundle.income||{};
  const incomeAmount=inc.income_type==="salaried"?Number(inc.net_monthly_salary||0):Number(inc.average_monthly_net_income||0);
  const result=evaluateScenario({incomeAmount,eligibleIncomePercent:percent,existingMonthlyEmi:inc.existing_monthly_emi||0,otherMonthlyObligations:inc.other_monthly_obligations||0,requestedAmount:a.requested_amount,annualInterestRate:rate,tenureMonths:tenure});
  async function saveScenario(){try{await saveAssessment({application_id:id,eligible_income_percent:percent,income_amount:incomeAmount,eligible_income:result.eligibleIncome,existing_monthly_emi:result.totalExistingObligations,available_emi:result.availableEmi,interest_rate:rate,tenure_months:tenure,maximum_eligible_loan:result.maximumEligibleLoan,requested_loan_emi:result.requestedLoanEmi,requested_amount_feasible:result.requestedAmountFeasible,assessment_json:result});alert("Scenario saved.");}catch(e){alert(e.message);}}
  async function decide(status){try{await updateApplicationDecision(id,status,notes);alert("Decision saved.");load();}catch(e){alert(e.message);}}
  async function requestDocs(){try{await saveDocumentRequirements(id,docs.split("\n"));alert("Document requirements sent to agent.");load();}catch(e){alert(e.message);}}
  return <div className="content-stack"><button className="back-link" onClick={onBack}>← Back to applications</button>
    <section className="panel"><div className="panel-heading"><div><p className="eyebrow">ADMIN REVIEW · {a.application_no||a.id.slice(0,8)}</p><h2>{a.applicant_name}</h2><p className="muted">{a.loan_product} · {money(a.requested_amount)}</p></div><StatusPill status={a.status}/></div>
      <div className="detail-grid"><Info label="Mobile" value={a.mobile}/><Info label="Email" value={a.email||"—"}/><Info label="PAN" value={a.pan}/><Info label="Loan amount" value={money(a.requested_amount)}/><Info label="Income type" value={inc.income_type||"—"}/><Info label="Existing EMI" value={money(inc.existing_monthly_emi)}/><Info label="Net monthly salary" value={money(inc.net_monthly_salary)}/><Info label="Business vintage" value={inc.business_vintage_years??"—"}/></div>
    </section>
    <section className="panel"><div className="panel-heading"><div><p className="eyebrow">DECISION WORKSPACE</p><h3>Eligibility scenario calculator</h3><p className="muted">Adjust policy assumptions and see the impact instantly.</p></div></div>
      <div className="calculator-grid"><div>
        <Field label={`Eligible income share: ${percent}%`}><input type="range" min="30" max="90" step="5" value={percent} onChange={e=>setPercent(Number(e.target.value))}/></Field>
        <Field label="Annual interest rate (%)"><input type="number" min="0" max="50" step="0.1" value={rate} onChange={e=>setRate(Number(e.target.value))}/></Field>
        <Field label="Tenure (months)"><input type="number" min="1" max="480" value={tenure} onChange={e=>setTenure(Number(e.target.value))}/></Field>
        <button className="secondary" onClick={saveScenario}>Save this assessment</button>
      </div><div className="result-panel">
        <div className="result-line"><span>Eligible income</span><b>{money(result.eligibleIncome)}</b></div>
        <div className="result-line"><span>Existing obligations</span><b>{money(result.totalExistingObligations)}</b></div>
        <div className="result-line"><span>Available EMI capacity</span><b>{money(result.availableEmi)}</b></div>
        <div className="result-line"><span>EMI for requested loan</span><b>{money(result.requestedLoanEmi)}</b></div>
        <div className="result-line highlight"><span>Maximum eligible loan (estimate)</span><b>{money(result.maximumEligibleLoan)}</b></div>
        <div className={`notice ${result.requestedAmountFeasible?"success":"danger"}`}>{result.requestedAmountFeasible?"Requested amount fits this scenario.":"Requested amount does not fit this scenario."}</div>
      </div></div>
      <p className="tiny muted">For salaried applicants, the initial model uses net salary. Business income must be reviewed and normalized before relying on calculations. This is an illustrative scenario, not a lender approval.</p>
    </section>
    <section className="panel"><h3>Credit report overview</h3>{bundle.reports.length===0?<p className="muted">No credit report metadata found.</p>:bundle.reports.map(r=><div className="result-line" key={r.id}><span>{r.bureau_name} · {r.report_source}</span><b>{r.extraction_status}</b></div>)}
      <div className="detail-grid"><Info label="Extracted credit accounts" value={bundle.accounts.length}/><Info label="DPD months captured" value={bundle.dpd.length}/><Info label="Co-applicants" value={bundle.co.length}/></div>
      {bundle.accounts.length>0&&<div className="table-wrap"><table><thead><tr><th>Institution</th><th>Account type</th><th>Outstanding</th><th>Overdue</th><th>Status</th></tr></thead><tbody>{bundle.accounts.map(x=><tr key={x.id}><td>{x.institution||"—"}</td><td>{x.account_type||"—"}</td><td>{money(x.current_balance)}</td><td>{money(x.overdue_amount)}</td><td>{x.account_status||"—"}</td></tr>)}</tbody></table></div>}
      {bundle.dpd.length>0&&<div className="table-wrap"><table><thead><tr><th>Month</th><th>DPD</th><th>Account</th></tr></thead><tbody>{bundle.dpd.map(x=><tr key={x.id}><td>{x.month}</td><td>{x.dpd_days}</td><td>{x.account_reference||"—"}</td></tr>)}</tbody></table></div>}
    </section>
    <section className="panel"><h3>Admin decision & document requirements</h3><Field label="Internal notes (not visible to agent)"><textarea rows="3" value={notes} onChange={e=>setNotes(e.target.value)} /></Field>
      <Field label="Documents to request (one per line)"><textarea rows="5" value={docs} onChange={e=>setDocs(e.target.value)}/></Field>
      <div className="button-row"><button className="primary" onClick={requestDocs}>Request documents</button><button className="secondary" onClick={()=>decide("approved_for_processing")}>Approve for processing</button><button className="danger-button" onClick={()=>decide("rejected")}>Reject file</button><button className="ghost" onClick={()=>decide("on_hold")}>Put on hold</button></div>
    </section>
  </div>;
}
function Info({label,value}){return <div className="info-item"><span>{label}</span><b>{value??"—"}</b></div>}

export default function App(){
  const [session, setSession] = useState(null);
const [profile, setProfile] = useState(null);

const [active, setActive] = useState("dashboard");
const [selected, setSelected] = useState(null);
const [loading, setLoading] = useState(true);

const [showAgentSignup, setShowAgentSignup] = useState(false);
  useEffect(()=>{
    if(!supabase){setLoading(false);return;}
    supabase.auth.getSession().then(async({data})=>{
      if(data.session){setSession(data.session);const {data:p}=await supabase.from("profiles").select("id,full_name,role,is_active").eq("id",data.session.user.id).single();if(p?.is_active)setProfile(p);}
      setLoading(false);
    });
    const {data:{subscription}}=supabase.auth.onAuthStateChange(async(_event,s)=>{
      setSession(s);
      if(s){const {data:p}=await supabase.from("profiles").select("id,full_name,role,is_active").eq("id",s.user.id).single();setProfile(p?.is_active?p:null);}
      else setProfile(null);
    });
    return ()=>subscription.unsubscribe();
  },[]);
  async function login(email,password){const result=await signIn(email,password);setSession({user:result.user});setProfile(result.profile);}
  async function logout(){await signOut();setSession(null);setProfile(null);setSelected(null);}
  if(loading)return <div className="loading-screen">Loading LoanDesk…</div>;
  if (!session || !profile) {
  if (showAgentSignup) {
    return (
      <AgentRegistration
        onBack={() => setShowAgentSignup(false)}
      />
    );
  }

  return (
    <Login
      onLogin={login}
      onSignup={() => setShowAgentSignup(true)}
    />
  );
}
  return <Shell profile={profile} onLogout={logout} active={active} setActive={v=>{setActive(v);setSelected(null);}}>
    {selected&&profile.role==="admin"?<DecisionWorkspace id={selected} onBack={()=>setSelected(null)}/>:
      active==="new"&&profile.role==="agent"?<LeadForm onCreated={()=>{setActive("dashboard");alert("Lead submitted successfully.");}}/>:
      <Dashboard profile={profile} onNewLead={()=>setActive("new")} onOpen={id=>setSelected(id)}/>}
  </Shell>;
}
