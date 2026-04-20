import { startTransition, useDeferredValue, useEffect, useState } from "react";
import { assistantSuggestions, practiceAreas, solutionCards } from "./data";

const initialMessages = [
  {
    id: 1,
    role: "assistant",
    text: "Describe your issue, the people involved, and the key dates. I will help turn it into a lawyer-ready summary."
  }
];

const initialCaseState = {
  type: "Land dispute",
  title: "",
  details: "",
  files: []
};

const initialAuthForm = {
  name: "",
  email: "",
  password: ""
};

const initialLawyerForm = {
  id: "",
  name: "",
  specialty: "Land dispute",
  city: "",
  experience: "",
  rating: "4.8",
  casesClosed: "0",
  response: "",
  bio: ""
};

const initialReviewForm = {
  lawyerId: "",
  clientName: "",
  rating: "5",
  comment: ""
};

function NavButton({ active, onClick, children }) {
  return (
    <button className={`nav-button ${active ? "nav-button-active" : ""}`} type="button" onClick={onClick}>
      {children}
    </button>
  );
}

function App() {
  const [currentPage, setCurrentPage] = useState("home");
  const [messages, setMessages] = useState(initialMessages);
  const [messageDraft, setMessageDraft] = useState("");
  const [voiceStatus, setVoiceStatus] = useState("Voice input is available in supported browsers.");
  const [caseDraft, setCaseDraft] = useState(initialCaseState);
  const [analysis, setAnalysis] = useState(null);
  const [practiceFilter, setPracticeFilter] = useState("All practices");
  const [searchTerm, setSearchTerm] = useState("");
  const [lawyers, setLawyers] = useState([]);
  const [selectedLawyer, setSelectedLawyer] = useState(null);
  const [lawyersLoading, setLawyersLoading] = useState(true);
  const [lawyersError, setLawyersError] = useState("");
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantMode, setAssistantMode] = useState("demo");
  const [caseSubmitting, setCaseSubmitting] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState(initialAuthForm);
  const [authUser, setAuthUser] = useState(null);
  const [authToken, setAuthToken] = useState(() => window.localStorage.getItem("lawgic-token") || "");
  const [authStatus, setAuthStatus] = useState("");
  const [adminStats, setAdminStats] = useState(null);
  const [adminLawyerForm, setAdminLawyerForm] = useState(initialLawyerForm);
  const [adminStatus, setAdminStatus] = useState("");
  const [adminReviewForm, setAdminReviewForm] = useState(initialReviewForm);
  const [cases, setCases] = useState([]);
  const [casesLoading, setCasesLoading] = useState(false);
  const [caseHistoryScope, setCaseHistoryScope] = useState("mine");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotStatus, setForgotStatus] = useState("");

  const deferredSearch = useDeferredValue(searchTerm);

  useEffect(() => {
    async function loadLawyers() {
      try {
        setLawyersLoading(true);
        setLawyersError("");

        const params = new URLSearchParams();
        if (practiceFilter !== "All practices") {
          params.set("specialty", practiceFilter);
        }
        if (deferredSearch.trim()) {
          params.set("q", deferredSearch.trim());
        }

        const response = await fetch(`/api/lawyers?${params.toString()}`);
        if (!response.ok) {
          throw new Error("Unable to load lawyers.");
        }

        const data = await response.json();
        setLawyers(data.lawyers);
      } catch (error) {
        setLawyersError(error.message || "Unable to load lawyers.");
      } finally {
        setLawyersLoading(false);
      }
    }

    loadLawyers();
  }, [deferredSearch, practiceFilter]);

  useEffect(() => {
    async function loadCurrentUser() {
      if (!authToken) {
        setAuthUser(null);
        setAdminStats(null);
        return;
      }

      try {
        const response = await fetch("/api/me", {
          headers: {
            Authorization: `Bearer ${authToken}`
          }
        });

        if (!response.ok) {
          throw new Error("Session expired");
        }

        const data = await response.json();
        setAuthUser(data.user);
        window.localStorage.setItem("lawgic-token", authToken);

        if (data.user.role === "admin") {
          const statsResponse = await fetch("/api/admin/stats", {
            headers: {
              Authorization: `Bearer ${authToken}`
            }
          });

          if (statsResponse.ok) {
            const statsData = await statsResponse.json();
            setAdminStats(statsData.stats);
          }
        }
      } catch (_error) {
        setAuthUser(null);
        setAdminStats(null);
        setAuthToken("");
        window.localStorage.removeItem("lawgic-token");
      }
    }

    loadCurrentUser();
  }, [authToken]);

  useEffect(() => {
    async function loadCases() {
      if (!authToken) {
        setCases([]);
        return;
      }

      try {
        setCasesLoading(true);
        const params = new URLSearchParams();
        if (authUser?.role === "admin" && caseHistoryScope === "all") {
          params.set("scope", "all");
        }

        const response = await fetch(`/api/cases?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${authToken}`
          }
        });

        if (!response.ok) {
          throw new Error("Unable to load cases.");
        }

        const data = await response.json();
        setCases(data.cases);
      } catch (_error) {
        setCases([]);
      } finally {
        setCasesLoading(false);
      }
    }

    loadCases();
  }, [authToken, authUser?.role, caseHistoryScope]);

  async function handleAssistantSubmit(event) {
    event.preventDefault();
    const cleaned = messageDraft.trim();

    if (!cleaned) {
      return;
    }

    const userMessage = { id: Date.now(), role: "user", text: cleaned };
    setMessages((current) => [...current, userMessage]);
    setMessageDraft("");

    try {
      setAssistantLoading(true);
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ message: cleaned })
      });

      if (!response.ok) {
        throw new Error("Unable to contact assistant.");
      }

      const data = await response.json();
      setAssistantMode(data.live ? "live" : "demo");
      setMessages((current) => [...current, { id: Date.now() + 1, role: "assistant", text: data.reply }]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        { id: Date.now() + 1, role: "assistant", text: error.message || "The assistant is temporarily unavailable." }
      ]);
    } finally {
      setAssistantLoading(false);
    }
  }

  function startVoiceCapture() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setVoiceStatus("This browser does not support voice recognition. Text support is still available.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setVoiceStatus("Listening now. Speak your legal question clearly.");
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setMessageDraft(transcript);
      setVoiceStatus("Voice captured. Review the text and send when ready.");
    };

    recognition.onerror = () => {
      setVoiceStatus("Voice capture was interrupted. Please try again or continue with text.");
    };

    recognition.start();
  }

  function updateCaseField(field, value) {
    setCaseDraft((current) => ({
      ...current,
      [field]: value
    }));
  }

  function updateAuthField(field, value) {
    setAuthForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  function updateAdminLawyerField(field, value) {
    setAdminLawyerForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  function updateAdminReviewField(field, value) {
    setAdminReviewForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setAuthStatus("");

    try {
      const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
      const payload =
        authMode === "login"
          ? { email: authForm.email, password: authForm.password }
          : { name: authForm.name, email: authForm.email, password: authForm.password };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Unable to complete authentication.");
      }

      setAuthToken(data.token);
      setAuthUser(data.user);
      setAuthForm(initialAuthForm);
      setAuthStatus(authMode === "login" ? "Logged in successfully." : "Account created successfully.");
    } catch (error) {
      setAuthStatus(error.message || "Unable to complete authentication.");
    }
  }

  function handleLogout() {
    setAuthToken("");
    setAuthUser(null);
    setAdminStats(null);
    setAuthStatus("Logged out.");
    window.localStorage.removeItem("lawgic-token");
  }

  async function handleAdminLawyerSubmit(event) {
    event.preventDefault();
    setAdminStatus("");

    try {
      const editing = Boolean(adminLawyerForm.id);
      const response = await fetch(editing ? `/api/admin/lawyers/${adminLawyerForm.id}` : "/api/admin/lawyers", {
        method: editing ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify(adminLawyerForm)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Unable to create lawyer.");
      }

      setAdminLawyerForm(initialLawyerForm);
      setAdminStatus(editing ? "Lawyer updated successfully." : "Lawyer added successfully.");
      setPracticeFilter("All practices");
      setSearchTerm("");
      if (editing) {
        setLawyers((current) => current.map((lawyer) => (lawyer.id === data.lawyer.id ? data.lawyer : lawyer)));
      } else {
        setLawyers((current) => [data.lawyer, ...current]);
      }

      const statsResponse = await fetch("/api/admin/stats", {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });
      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setAdminStats(statsData.stats);
      }
    } catch (error) {
      setAdminStatus(error.message || "Unable to create lawyer.");
    }
  }

  async function handleDeleteLawyer(id) {
    try {
      const response = await fetch(`/api/admin/lawyers/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });
      if (!response.ok) {
        throw new Error("Unable to delete lawyer.");
      }
      setLawyers((current) => current.filter((lawyer) => lawyer.id !== id));
      if (selectedLawyer?.id === id) {
        setSelectedLawyer(null);
      }
      setAdminStatus("Lawyer deleted successfully.");
    } catch (error) {
      setAdminStatus(error.message || "Unable to delete lawyer.");
    }
  }

  async function handleAdminReviewSubmit(event) {
    event.preventDefault();
    setAdminStatus("");
    try {
      const response = await fetch("/api/admin/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify(adminReviewForm)
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Unable to add review.");
      }
      setAdminReviewForm(initialReviewForm);
      setAdminStatus("Review added successfully.");
      if (selectedLawyer?.id === data.review.lawyerId) {
        await openLawyerDetail(data.review.lawyerId);
      }
    } catch (error) {
      setAdminStatus(error.message || "Unable to add review.");
    }
  }

  async function handleDeleteReview(id, lawyerId) {
    try {
      const response = await fetch(`/api/admin/reviews/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });
      if (!response.ok) {
        throw new Error("Unable to delete review.");
      }
      setAdminStatus("Review deleted successfully.");
      if (selectedLawyer?.id === lawyerId) {
        await openLawyerDetail(lawyerId);
      }
    } catch (error) {
      setAdminStatus(error.message || "Unable to delete review.");
    }
  }

  async function handleForgotPassword(event) {
    event.preventDefault();
    setForgotStatus("");

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email: forgotEmail })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Unable to reset password.");
      }
      setForgotStatus(`${data.message} Temporary password: ${data.tempPassword}`);
    } catch (error) {
      setForgotStatus(error.message || "Unable to reset password.");
    }
  }

  async function openLawyerDetail(id) {
    try {
      const response = await fetch(`/api/lawyers/${id}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Unable to load lawyer.");
      }
      setSelectedLawyer(data.lawyer);
    } catch (_error) {
      setSelectedLawyer(null);
    }
  }

  async function handleCaseSubmit(event) {
    event.preventDefault();
    const formData = new FormData();
    formData.append("type", caseDraft.type);
    formData.append("title", caseDraft.title);
    formData.append("details", caseDraft.details);
    caseDraft.files.forEach((file) => formData.append("files", file));

    try {
      setCaseSubmitting(true);
      const response = await fetch("/api/cases", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error("Unable to submit case details.");
      }

      const data = await response.json();
      startTransition(() => {
        setAnalysis(data.analysis);
      });
      setCurrentPage("cases");
      const params = new URLSearchParams();
      if (authUser?.role === "admin" && caseHistoryScope === "all") {
        params.set("scope", "all");
      }
      const casesResponse = await fetch(`/api/cases?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });
      if (casesResponse.ok) {
        const casesData = await casesResponse.json();
        setCases(casesData.cases);
      }
    } catch (error) {
      startTransition(() => {
        setAnalysis({
          readiness: "Submission failed",
          wordCount: 0,
          focus: error.message || "Unable to submit case details.",
          nextSteps: ["Please retry with the backend server running on port 8787."],
          fileCount: caseDraft.files.length
        });
      });
    } finally {
      setCaseSubmitting(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="hero-section">
        <nav className="topbar">
          <div className="brand-block">
            <div className="brand-mark">L</div>
            <div>
              <p className="brand-name">Lawgic AI</p>
              <p className="brand-tag">Resolve smarter. Hire better.</p>
            </div>
          </div>
          <div className="nav-links">
            <NavButton active={currentPage === "home"} onClick={() => setCurrentPage("home")}>
              Home
            </NavButton>
            <NavButton active={currentPage === "cases"} onClick={() => setCurrentPage("cases")}>
              Cases
            </NavButton>
            <NavButton active={currentPage === "account"} onClick={() => setCurrentPage("account")}>
              Account
            </NavButton>
          </div>
        </nav>

        {currentPage === "home" ? (
        <div className="hero-grid">
          <section className="hero-copy">
            <span className="eyebrow">Legal support with clarity-first design</span>
            <h1>Lawgic AI turns stressful legal intake into a guided, usable experience.</h1>
            <p className="hero-text">
              People can upload their dispute details, receive AI-assisted intake guidance through text or voice,
              and compare lawyer portfolios with reviews before booking a consultation.
            </p>
            <div className="hero-actions">
              <a className="btn btn-primary" href="#intake">
                Start a case review
              </a>
              <a className="btn btn-secondary" href="#lawyers">
                Explore lawyers
              </a>
            </div>
            <div className="hero-metrics">
              <div className="metric-card">
                <strong>Text + Voice</strong>
                <span>AI-supported intake</span>
              </div>
              <div className="metric-card">
                <strong>Portfolio Match</strong>
                <span>Specialization and trust</span>
              </div>
              <div className="metric-card">
                <strong>Readable Summaries</strong>
                <span>Prepared for consultation</span>
              </div>
            </div>
          </section>

          <aside className="hero-panel">
            <div className="spotlight-card">
              <p className="card-label">Case readiness dashboard</p>
              <h2>Upload facts, surface gaps, and move into legal advice with more confidence.</h2>
              <div className="mini-list">
                <span>Timeline extraction</span>
                <span>Document prompts</span>
                <span>Lawyer discovery</span>
              </div>
            </div>
          </aside>
        </div>
        ) : null}
      </header>

      <main className="page-content">
        {currentPage === "home" ? (
          <>
        <section className="section" id="solutions">
          <div className="section-heading">
            <span className="eyebrow">Core use cases</span>
            <h2>Built around the legal situations people struggle to explain clearly.</h2>
          </div>
          <div className="solutions-grid">
            {solutionCards.map((card, index) => (
              <article className="feature-card" key={card.id}>
                <div className="feature-index">0{index + 1}</div>
                <h3>{card.title}</h3>
                <p>{card.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section assistant-layout" id="assistant">
          <div className="section-heading">
            <span className="eyebrow">AI assistant</span>
            <h2>Support users with text or voice before they ever speak to a lawyer.</h2>
          </div>
          <div className="assistant-grid">
            <div className="assistant-card">
              <div className="assistant-header">
                <div>
                  <p className="card-label">Live assistant demo</p>
                  <h3>Ask case-prep questions</h3>
                </div>
                <span className="status-pill">{assistantMode === "live" ? "OpenAI live" : "Fallback mode"}</span>
              </div>
              <div className="suggestions-row">
                {assistantSuggestions.map((suggestion) => (
                  <button
                    className="suggestion-pill"
                    key={suggestion}
                    type="button"
                    onClick={() => setMessageDraft(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
              <div className="chat-window">
                {messages.map((message) => (
                  <div className={`chat-bubble ${message.role}`} key={message.id}>
                    {message.text}
                  </div>
                ))}
              </div>
              <form className="assistant-form" onSubmit={handleAssistantSubmit}>
                <input
                  value={messageDraft}
                  onChange={(event) => setMessageDraft(event.target.value)}
                  placeholder="Describe your legal question..."
                />
                <button className="btn btn-primary" type="submit">
                  {assistantLoading ? "Sending..." : "Send"}
                </button>
                <button className="btn btn-voice" type="button" onClick={startVoiceCapture}>
                  Start voice
                </button>
              </form>
              <p className="helper-text">{voiceStatus}</p>
            </div>

            <div className="insight-card">
              <p className="card-label">Assistant outcomes</p>
              <div className="insight-stack">
                <article>
                  <h3>Structured intake</h3>
                  <p>Help users convert a long story into parties, events, records, notices, and goals.</p>
                </article>
                <article>
                  <h3>Document readiness</h3>
                  <p>Show what records are likely missing before a lawyer spends time reconstructing basics.</p>
                </article>
                <article>
                  <h3>Faster matching</h3>
                  <p>Guide users toward lawyers whose case history and reviews align with their dispute type.</p>
                </article>
              </div>
            </div>
          </div>
        </section>

        <section className="section intake-layout" id="intake">
          <div className="section-heading">
            <span className="eyebrow">Case upload</span>
            <h2>Users can submit details and immediately receive a consultation-ready overview.</h2>
          </div>
          <div className="intake-grid">
            <form className="intake-card" onSubmit={handleCaseSubmit}>
              <label>
                Case category
                <select value={caseDraft.type} onChange={(event) => updateCaseField("type", event.target.value)}>
                  <option value="Land dispute">Land dispute</option>
                  <option value="Rental agreement">Rental agreement</option>
                  <option value="General">General</option>
                </select>
              </label>
              <label>
                Case title
                <input
                  value={caseDraft.title}
                  onChange={(event) => updateCaseField("title", event.target.value)}
                  placeholder="Example: Boundary conflict over inherited property"
                />
              </label>
              <label>
                Case details
                <textarea
                  rows="7"
                  value={caseDraft.details}
                  onChange={(event) => updateCaseField("details", event.target.value)}
                  placeholder="Describe what happened, when it started, who is involved, what documents you have, and what outcome you want."
                />
              </label>
              <label>
                Upload supporting files
                <input
                  type="file"
                  multiple
                  onChange={(event) => updateCaseField("files", Array.from(event.target.files ?? []))}
                />
              </label>
              {!authUser ? <p className="helper-text">Log in first to save a case to your dashboard.</p> : null}
              <button className="btn btn-primary btn-wide" type="submit" disabled={!authUser || caseSubmitting}>
                {caseSubmitting ? "Submitting..." : "Analyze case details"}
              </button>
            </form>

            <div className="analysis-card">
              <p className="card-label">AI intake summary</p>
              {!analysis ? (
                <>
                  <h3>Your summary will appear here.</h3>
                  <p>
                    Submit the form to generate a preparation snapshot, likely focus areas, and the next steps a
                    user should take before hiring counsel.
                  </p>
                </>
              ) : (
                <>
                  <h3>{caseDraft.title || "Untitled case"}</h3>
                  <p>
                    Preparation level: <strong>{analysis.readiness}</strong>. Uploaded files:{" "}
                    <strong>{analysis.fileCount ?? caseDraft.files.length}</strong>. Intake words:{" "}
                    <strong>{analysis.wordCount}</strong>.
                  </p>
                  <div className="analysis-stack">
                    <div className="analysis-panel">
                      <strong>Primary focus</strong>
                      <p>{analysis.focus}</p>
                    </div>
                    <div className="analysis-panel">
                      <strong>Recommended next steps</strong>
                      <ul>
                        {analysis.nextSteps.map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

        <section className="section" id="lawyers">
          <div className="section-heading">
            <span className="eyebrow">Lawyer portfolio</span>
            <h2>Compare legal professionals by practice area, city, experience, and client feedback.</h2>
          </div>
          <div className="toolbar">
            <select value={practiceFilter} onChange={(event) => setPracticeFilter(event.target.value)}>
              {practiceAreas.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by lawyer, city, or practice"
            />
          </div>
          <div className="lawyer-grid">
            {lawyersLoading ? <p>Loading lawyers...</p> : null}
            {lawyersError ? <p>{lawyersError}</p> : null}
            {!lawyersLoading && !lawyersError
              ? lawyers.map((lawyer) => (
                  <article className="lawyer-card" key={lawyer.id}>
                    <div className="lawyer-head">
                      <div className="avatar-mark">{lawyer.name.slice(5, 6)}</div>
                      <div>
                        <h3>{lawyer.name}</h3>
                        <p className="lawyer-subtitle">
                          {lawyer.specialty} • {lawyer.city}
                        </p>
                      </div>
                    </div>
                    <p>{lawyer.bio}</p>
                    <div className="meta-row">
                      <span>{lawyer.rating} rating</span>
                      <span>{lawyer.experience}</span>
                      <span>{lawyer.casesClosed} matters</span>
                    </div>
                    <div className="review-card">
                      <p className="card-label">Client feedback</p>
                      <p>{lawyer.review}</p>
                    </div>
                    <p className="response-text">{lawyer.response}</p>
                    <button className="btn btn-secondary" type="button" onClick={() => openLawyerDetail(lawyer.id)}>
                      View profile
                    </button>
                    {authUser?.role === "admin" ? (
                      <>
                        <button className="btn btn-secondary" type="button" onClick={() => setAdminLawyerForm({ ...lawyer, id: lawyer.id })}>
                          Edit
                        </button>
                        <button className="btn btn-secondary" type="button" onClick={() => handleDeleteLawyer(lawyer.id)}>
                          Delete
                        </button>
                      </>
                    ) : null}
                  </article>
                ))
              : null}
          </div>
          {selectedLawyer ? (
            <div className="section">
              <div className="review-card">
                <p className="card-label">Lawyer detail</p>
                <h3>{selectedLawyer.name}</h3>
                <p>{selectedLawyer.specialty} • {selectedLawyer.city}</p>
                <p>{selectedLawyer.bio}</p>
                <p>Experience: {selectedLawyer.experience}</p>
                <p>Rating: {selectedLawyer.rating}</p>
                <p>Closed matters: {selectedLawyer.casesClosed}</p>
                <p>Latest client feedback: {selectedLawyer.review}</p>
                {selectedLawyer.reviews?.length ? (
                  <div className="insight-stack">
                    {selectedLawyer.reviews.map((review) => (
                      <div className="analysis-panel" key={review.id}>
                        <strong>{review.clientName}</strong>
                        <p>{review.comment}</p>
                        <p>Rating: {review.rating}</p>
                        {authUser?.role === "admin" ? (
                          <button className="btn btn-secondary" type="button" onClick={() => handleDeleteReview(review.id, selectedLawyer.id)}>
                            Delete review
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
          </>
        ) : null}

        {currentPage === "account" ? (
        <section className="section account-layout" id="account">
          <div className="section-heading">
            <span className="eyebrow">Account and admin</span>
            <h2>Sign in to manage cases and add lawyer profiles.</h2>
          </div>
          <div className="assistant-grid">
            <div className="assistant-card">
              <div className="assistant-header">
                <div>
                  <p className="card-label">User access</p>
                  <h3>{authUser ? `Signed in as ${authUser.name}` : "Create an account or log in"}</h3>
                </div>
                <span className="status-pill">{authUser ? authUser.role : authMode}</span>
              </div>

              {!authUser ? (
                <form className="auth-form" onSubmit={handleAuthSubmit}>
                  {authMode === "register" ? (
                    <label>
                      Full name
                      <input
                        value={authForm.name}
                        onChange={(event) => updateAuthField("name", event.target.value)}
                        placeholder="Your full name"
                      />
                    </label>
                  ) : null}
                  <label>
                    Email
                    <input
                      type="email"
                      value={authForm.email}
                      onChange={(event) => updateAuthField("email", event.target.value)}
                      placeholder="you@example.com"
                    />
                  </label>
                  <label>
                    Password
                    <input
                      type="password"
                      value={authForm.password}
                      onChange={(event) => updateAuthField("password", event.target.value)}
                      placeholder="Enter your password"
                    />
                  </label>
                  <button className="btn btn-primary btn-wide" type="submit">
                    {authMode === "login" ? "Log in" : "Create account"}
                  </button>
                  <button
                    className="btn btn-secondary btn-wide"
                    type="button"
                    onClick={() => setAuthMode((current) => (current === "login" ? "register" : "login"))}
                  >
                    {authMode === "login" ? "Need an account?" : "Already have an account?"}
                  </button>
                  <p className="helper-text">{authStatus || "Admin demo: admin@lawgic.ai / admin123"}</p>
                </form>
              ) : (
                <div className="account-summary">
                  <p className="helper-text">Email: {authUser.email}</p>
                  <p className="helper-text">Role: {authUser.role}</p>
                  <button className="btn btn-secondary" type="button" onClick={handleLogout}>
                    Log out
                  </button>
                  <p className="helper-text">{authStatus}</p>
                </div>
              )}
              {!authUser ? (
                <form className="auth-form" onSubmit={handleForgotPassword}>
                  <label>
                    Forgot password email
                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={(event) => setForgotEmail(event.target.value)}
                      placeholder="Enter your email"
                    />
                  </label>
                  <button className="btn btn-secondary btn-wide" type="submit">
                    Generate temporary password
                  </button>
                  <p className="helper-text">{forgotStatus}</p>
                </form>
              ) : null}
            </div>

            <div className="insight-card">
              <p className="card-label">Admin panel</p>
              {authUser?.role === "admin" ? (
                <div className="insight-stack">
                  <div className="admin-stats">
                    <span>Total users: {adminStats?.users ?? "-"}</span>
                    <span>Total cases: {adminStats?.cases ?? "-"}</span>
                    <span>Total lawyers: {adminStats?.lawyers ?? "-"}</span>
                  </div>
                  <form className="auth-form" onSubmit={handleAdminLawyerSubmit}>
                    <label>
                      Lawyer name
                      <input
                        value={adminLawyerForm.name}
                        onChange={(event) => updateAdminLawyerField("name", event.target.value)}
                        placeholder="Advocate name"
                      />
                    </label>
                    <label>
                      Specialty
                      <select
                        value={adminLawyerForm.specialty}
                        onChange={(event) => updateAdminLawyerField("specialty", event.target.value)}
                      >
                        <option value="Land dispute">Land dispute</option>
                        <option value="Rental agreement">Rental agreement</option>
                        <option value="General">General</option>
                      </select>
                    </label>
                    <label>
                      City
                      <input
                        value={adminLawyerForm.city}
                        onChange={(event) => updateAdminLawyerField("city", event.target.value)}
                        placeholder="City"
                      />
                    </label>
                    <label>
                      Experience
                      <input
                        value={adminLawyerForm.experience}
                        onChange={(event) => updateAdminLawyerField("experience", event.target.value)}
                        placeholder="12 years"
                      />
                    </label>
                    <label>
                      Rating
                      <input
                        value={adminLawyerForm.rating}
                        onChange={(event) => updateAdminLawyerField("rating", event.target.value)}
                        placeholder="4.8"
                      />
                    </label>
                    <label>
                      Closed matters
                      <input
                        value={adminLawyerForm.casesClosed}
                        onChange={(event) => updateAdminLawyerField("casesClosed", event.target.value)}
                        placeholder="80"
                      />
                    </label>
                    <label>
                      Response note
                      <input
                        value={adminLawyerForm.response}
                        onChange={(event) => updateAdminLawyerField("response", event.target.value)}
                        placeholder="Replies in under 4 hours"
                      />
                    </label>
                    <label>
                      Bio
                      <textarea
                        rows="3"
                        value={adminLawyerForm.bio}
                        onChange={(event) => updateAdminLawyerField("bio", event.target.value)}
                        placeholder="Short profile summary"
                      />
                    </label>
                    <label>
                      Review
                      <textarea
                        rows="3"
                        value={adminLawyerForm.review}
                        onChange={(event) => updateAdminLawyerField("review", event.target.value)}
                        placeholder="Client feedback snippet"
                      />
                    </label>
                    <button className="btn btn-primary btn-wide" type="submit">
                      {adminLawyerForm.id ? "Update lawyer profile" : "Add lawyer profile"}
                    </button>
                    {adminLawyerForm.id ? (
                      <button className="btn btn-secondary btn-wide" type="button" onClick={() => setAdminLawyerForm(initialLawyerForm)}>
                        Cancel edit
                      </button>
                    ) : null}
                    <label>
                      Review lawyer
                      <select
                        value={adminReviewForm.lawyerId}
                        onChange={(event) => updateAdminReviewField("lawyerId", event.target.value)}
                      >
                        <option value="">Select lawyer</option>
                        {lawyers.map((lawyer) => (
                          <option key={lawyer.id} value={lawyer.id}>
                            {lawyer.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Client name
                      <input
                        value={adminReviewForm.clientName}
                        onChange={(event) => updateAdminReviewField("clientName", event.target.value)}
                        placeholder="Client name"
                      />
                    </label>
                    <label>
                      Rating
                      <input
                        value={adminReviewForm.rating}
                        onChange={(event) => updateAdminReviewField("rating", event.target.value)}
                        placeholder="5"
                      />
                    </label>
                    <label>
                      Comment
                      <textarea
                        rows="3"
                        value={adminReviewForm.comment}
                        onChange={(event) => updateAdminReviewField("comment", event.target.value)}
                        placeholder="Client review"
                      />
                    </label>
                    <button className="btn btn-secondary btn-wide" type="button" onClick={handleAdminReviewSubmit}>
                      Add review
                    </button>
                    <p className="helper-text">{adminStatus}</p>
                  </form>
                </div>
              ) : (
                <p className="helper-text">Admin tools appear here after signing in with an admin account.</p>
              )}
            </div>
          </div>
        </section>
        ) : null}

        {currentPage === "cases" ? (
          <section className="section" id="cases">
            <div className="section-heading">
              <span className="eyebrow">Case history</span>
              <h2>Track submitted cases and review earlier intake summaries.</h2>
            </div>
            <div className="toolbar">
              {authUser?.role === "admin" ? (
                <select value={caseHistoryScope} onChange={(event) => setCaseHistoryScope(event.target.value)}>
                  <option value="mine">My cases</option>
                  <option value="all">All cases</option>
                </select>
              ) : null}
              <button className="btn btn-secondary" type="button" onClick={() => setCurrentPage("home")}>
                Submit a new case
              </button>
            </div>
            {!authUser ? <p className="helper-text">Please log in to view your case history.</p> : null}
            {authUser && casesLoading ? <p className="helper-text">Loading cases...</p> : null}
            {authUser && !casesLoading && cases.length === 0 ? (
              <p className="helper-text">No cases have been submitted yet.</p>
            ) : null}
            <div className="case-history-grid">
              {cases.map((caseItem) => (
                <article className="lawyer-card" key={caseItem.id}>
                  <h3>{caseItem.title}</h3>
                  <p className="lawyer-subtitle">
                    {caseItem.type} • {new Date(caseItem.createdAt).toLocaleString()}
                  </p>
                  <p>{caseItem.details}</p>
                  <div className="meta-row">
                    <span>{caseItem.analysis.readiness}</span>
                    <span>{caseItem.analysis.wordCount} words</span>
                    <span>{caseItem.analysis.fileCount} files</span>
                  </div>
                  <div className="review-card">
                    <p className="card-label">Primary focus</p>
                    <p>{caseItem.analysis.focus}</p>
                  </div>
                  <div className="analysis-panel">
                    <strong>Next steps</strong>
                    <ul>
                      {caseItem.analysis.nextSteps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ul>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}

export default App;
