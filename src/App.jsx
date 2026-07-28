import React, { useState, useEffect, useRef, useCallback } from "react";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from "recharts";

// ── SOCKET.IO ─────────────────────────────────────────────────────────────────
let _socket = null;
function getSocket(apiUrl, clinicId) {
  if(_socket && _socket.connected) return _socket;
  try {
    if(typeof io === "undefined") return null;
    _socket = io(apiUrl, {
      transports: ["websocket","polling"],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
      timeout: 10000,
    });
    _socket.on("connect", () => {
      if(clinicId) _socket.emit("join", {clinic_id: clinicId});
    });
    return _socket;
  } catch(e) { return null; }
}

const API = "https://api.codt.my";

// Unregister service worker immediately at module load — before React renders
// This prevents SW from caching/intercepting API calls
if("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(reg => reg.unregister());
  });
  // Also claim control immediately if a SW is active
  navigator.serviceWorker.ready?.then(sw => sw.unregister()).catch(()=>{});
}
const CRM_VERSION = "2.9.386";

// Responsive hook
function useWindowSize() {
  const [size, setSize] = useState({w:window.innerWidth,h:window.innerHeight});
  useEffect(()=>{
    const fn = ()=>setSize({w:window.innerWidth,h:window.innerHeight});
    window.addEventListener("resize",fn);
    return ()=>window.removeEventListener("resize",fn);
  },[]);
  return size;
}
const WA_GREEN = "#25D366";
const WA_DARK  = "#128C7E";
const WA_BG    = "#ECE5DD";

const LEAD_CFG = {
  hot:  { label:"🔥 High Intent",  color:"#ef4444", bg:"#fef2f2", dark:"#2d1515", border:"#fca5a5" },
  warm: { label:"🟡 Interested", color:"#f59e0b", bg:"#fffbeb", dark:"#2d2010", border:"#fcd34d" },
  cold: { label:"🔵 Browsing", color:"#3b82f6", bg:"#eff6ff", dark:"#0f1e35", border:"#93c5fd" },
};
const PIPELINE = [
  { id:"new",         label:"🆕 New",        color:"#6b7280", bg:"#f3f4f6", dark:"#1f2937" },
  { id:"in_progress", label:"⚡ In Progress", color:"#f59e0b", bg:"#fffbeb", dark:"#2d2010" },
  { id:"contacted",   label:"📞 Contacted",   color:"#3b82f6", bg:"#eff6ff", dark:"#0f1e35" },
  { id:"done",        label:"✅ Done",         color:"#10b981", bg:"#ecfdf5", dark:"#052e16" },
];
const COLORS = ["#25D366","#128C7E","#34B7F1","#FF6B6B","#FFA726","#AB47BC","#42A5F5","#26A69A"];
const PIE_COLORS = { new:"#6b7280", in_progress:"#f59e0b", contacted:"#3b82f6", done:"#10b981" };
const PIE_LABELS = { new:"New", in_progress:"In Progress", contacted:"Contacted", done:"Done" };
const HOUR_LABELS = ["12am","1am","2am","3am","4am","5am","6am","7am","8am","9am","10am","11am","12pm","1pm","2pm","3pm","4pm","5pm","6pm","7pm","8pm","9pm","10pm","11pm"];

const formatMsgTime = (timeStr, dateStr) => {
  if (!timeStr) return "";
  if (!dateStr) return timeStr;
  // Format date as dd/mm/yyyy
  const dateParts = dateStr.split("-");
  const formattedDate = dateParts.length === 3 
    ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` 
    : dateStr;
  return `${timeStr} · ${formattedDate}`;
};

const getColor = n => { let h=0; for(let c of (n||"?")) h=c.charCodeAt(0)+((h<<5)-h); return COLORS[Math.abs(h)%COLORS.length]; };
const ts = () => new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",hour12:true});
const today = () => new Date().toISOString().split("T")[0];
const daysAgo = n => { const d=new Date(); d.setDate(d.getDate()-n); return d.toISOString().split("T")[0]; };

const TABS = [
  {id:"crm",          icon:"ti ti-message-2",    label:"Inbox"},
  {id:"leads",        icon:"ti ti-target",        label:"Leads"},
  {id:"broadcast",    icon:"ti ti-speakerphone",  label:"Broadcast"},
  {id:"analytics",    icon:"ti ti-chart-bar",     label:"Analytics"},
  {id:"kb",           icon:"ti ti-book",          label:"Knowledge"},
  {id:"bot",          icon:"ti ti-robot",         label:"Test Bot"},
  {id:"notes",        icon:"ti ti-notes",         label:"Notes"},
  {id:"integrations", icon:"ti ti-plug",          label:"Connect"},
  {id:"settings",     icon:"ti ti-settings",      label:"Settings"},
  {id:"admin",        icon:"ti ti-crown",         label:"Admin", adminOnly:true},
];

export default function App() {
  // ── AUTH ──
  const {w:winW} = useWindowSize();
  const isMobile = winW < 640;

  // Load socket.io-client dynamically
  React.useEffect(() => {
    if(typeof io === "undefined") {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.7.5/socket.io.min.js";
      s.async = true;
      document.head.appendChild(s);
    }
  }, []);
  const isTablet = winW >= 640 && winW < 1024;
  const isSmall  = winW < 1024; // mobile + tablet

  const [authToken, setAuthToken] = useState(()=>{
    // Clear session if logout param present (handles Safari cache)
    if(window.location.search.includes("logout=")) {
      sessionStorage.clear();
      window.history.replaceState({}, "", window.location.pathname);
      return "";
    }
    return sessionStorage.getItem("crm_token")||"";
  });
  const [currentUser, setCurrentUser] = useState(()=>{ try{ return JSON.parse(sessionStorage.getItem("crm_user")||"null"); }catch{return null;} });
  const [permissions, setPermissions] = useState(()=>{ try{ return JSON.parse(sessionStorage.getItem("crm_perms")||"null"); }catch{return null;} });
  const [loginForm, setLoginForm] = useState({username:"",password:""});
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [sessionConflict, setSessionConflict] = useState(null);

  // ── MAIN APP HOOKS (must all be declared before any return) ──
  const [tab, setTab] = useState("crm");
  const [showMoreSheet, setShowMoreSheet] = React.useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [backendStatus, setBackendStatus] = useState("online");
  const [backendVersion, setBackendVersion] = useState("");
  const [reply, setReply] = useState("");
  const [filter, setFilter] = useState("all");
  const [leadFilter, setLeadFilter] = useState("all");
  const [inboxFilter, setInboxFilter] = useState("all");
  const [inboxDateFilter, setInboxDateFilter] = useState("");
  const [search, setSearch] = useState("");
  const [qaData, setQaData] = useState([]);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editQ, setEditQ] = useState(""); const [editA, setEditA] = useState("");
  const [newQ, setNewQ] = useState(""); const [newA, setNewA] = useState("");
  const [appSettings, setAppSettings] = useState({});
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const settingsDirtyRef = useRef(false);
  const setSettingsDirtyWithRef = (val) => {
    settingsDirtyRef.current = val;
    setSettingsDirty(val);
  };
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [idleWarning, setIdleWarning] = useState(false);
  const [idleCountdown, setIdleCountdown] = useState(30);
  const idleWarningRef = useRef(false);
  const [confirmModal, setConfirmModal] = useState(null); // {title, message, icon, danger, onConfirm}
  const [pendingTab, setPendingTab] = useState(null);
  const [hoveredSource, setHoveredSource] = useState(null);
  const [highlightedQA, setHighlightedQA] = useState(null);
  const [selectedQAs, setSelectedQAs] = useState(new Set());
  const [dragOver, setDragOver] = useState(null);
  const [sendingFollowup, setSendingFollowup] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [adminOverview, setAdminOverview] = useState([]);
  const [selectedClinic, setSelectedClinic] = useState(null);
  const selectedClinicRef = useRef(null);
  const selectedRef = useRef(null);
  const manuallyReadRef = useRef(new Set()); // tracks contacts marked read locally
  const setSelectedClinicWithRef = (c) => {
    selectedClinicRef.current = c;
    setSelectedClinic(c);
  };
  // For admin viewing KB/Settings of a specific client
  const [adminViewClinic, setAdminViewClinic] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [leadsClinic, setLeadsClinic] = useState(null);
  const [leadsSearch, setLeadsSearch] = useState("");
  const [leadsDateFrom, setLeadsDateFrom] = useState("");
  const [leadsDateTo, setLeadsDateTo] = useState("");
  const [leadsUserFilter, setLeadsUserFilter] = useState(null); // user id
  const [settingsClinic, setSettingsClinic] = useState(null);
  const [clientSettings, setClientSettings] = useState(null);
  const [inboxClinic, setInboxClinic] = useState(null);
  const [kbClinic, setKbClinic] = useState(null);
  const [improverResult, setImproverResult] = useState(null);
  const [countryData, setCountryData] = useState([]);
  const [appliedQAIds, setAppliedQAIds] = useState(new Set()); // persists across tab switches
  const [improverDays, setImproverDays] = useState(7);
  const [kbSubTab, setKbSubTab] = useState("kb"); // "kb" | "wizard"
  const [adSummary, setAdSummary] = useState({count:0,totalClicks:0,totalBookings:0});
  const [adData, setAdData] = useState([]);
  const [fuTab, setFuTab] = useState("settings");
  const [followupTracker, setFollowupTracker] = useState([]);
  const [followupTrackerLoading, setFollowupTrackerLoading] = useState(false);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [dateFrom, setDateFrom] = useState(daysAgo(29));
  const [dateTo, setDateTo] = useState(today());
  const [datePreset, setDatePreset] = useState("30d");
  const [archiveConfirm, setArchiveConfirm] = useState(null);
  const [archivedContacts, setArchivedContacts] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [settingsNav, setSettingsNav] = useState("ai");
  const [bulkBotModal, setBulkBotModal] = useState(null);
  const [exportModal, setExportModal] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [broadcastSubTab, setBroadcastSubTab] = useState("send");
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [setupMissing, setSetupMissing] = useState([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [createTemplateStep, setCreateTemplateStep] = useState(1); // 1=setup, 2=edit, 3=submit
  const [createTemplateSubmitting, setCreateTemplateSubmitting] = useState(false);
  const [createTemplateResult, setCreateTemplateResult] = useState(null);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [templateSubmitting, setTemplateSubmitting] = useState(false);
  const [templateSubmitResult, setTemplateSubmitResult] = useState(null);
  const [newTemplate, setNewTemplate] = useState({template_name:"",language:"en",category:"MARKETING",header_type:"none",header_value:"",body_text:"",footer_text:"",variables:[],status:"pending"});
  const [broadcastContacts, setBroadcastContacts] = useState([]);
  const [broadcastProgress, setBroadcastProgress] = useState(null);
  const [broadcastLog, setBroadcastLog] = useState([]);
  const [broadcastSearch, setBroadcastSearch] = useState("");
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");
  const [scheduledBroadcasts, setScheduledBroadcasts] = useState([]);

  const fetchScheduledBroadcasts = async (clinicId) => {
    try {
      const url = clinicId ? `${API}/api/admin/clients/${clinicId}/scheduled-broadcasts` : `${API}/api/scheduled-broadcasts`;
      const r = await fetch(url, {headers: authHeaders()});
      const d = await r.json();
      setScheduledBroadcasts(Array.isArray(d) ? d : []);
    } catch(e) {}
  };
  const [broadcastFile, setBroadcastFile] = useState(null);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [adHistory, setAdHistory] = useState([]);

  const [adHistoryPage, setAdHistoryPage] = useState(0);
  const [navCollapsed, setNavCollapsed] = useState(true); // always icon-only
  const [selectedChats, setSelectedChats] = useState(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [showInboxStats, setShowInboxStats] = useState(false);
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [broadcastClinic, setBroadcastClinic] = useState(null);
  const [contactPickerSearch, setContactPickerSearch] = useState("");
  const [pickedContacts, setPickedContacts] = useState(new Set());
  const [exportKeywords, setExportKeywords] = useState("");
  const [exportDateFrom, setExportDateFrom] = useState("");
  const [exportDateTo, setExportDateTo] = useState("");
  const [exportLoading, setExportLoading] = useState(false); // {total, done, active}
  const [botConvo, setBotConvo] = useState([{from:"bot",text:"👋 Hi! I'm Sara from Nexora 😊\nHow can I help you today?",time:ts(),sources:[]}]);
  const [botInput, setBotInput] = useState("");
  const [botLoading, setBotLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState({});
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesClinic, setNotesClinic] = useState(null);
  const [showChangelog, setShowChangelog] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [leadsFilterOpen, setLeadsFilterOpen] = useState(false);
  const [changelogSeen, setChangelogSeen] = useState("");
  const [dark, setDark] = useState(false);

  const isAdmin = currentUser?.role === "admin";

  function safeSetTab(newTab) {
    setShowMoreSheet(false);
    if(settingsDirty && tab==="settings" && newTab!=="settings") {
      setPendingTab(newTab);
      setShowUnsavedModal(true);
    } else {
      setTab(newTab);
    }
  }
  const canSee = (tab) => {
    if (!currentUser) return false;
    if (isAdmin) return true;
    if (!permissions || permissions === "all") return true;
    const map = { crm:"can_inbox", leads:"can_leads", analytics:"can_analytics", bot:"can_testbot", kb:"can_knowledge", settings:"can_settings", integrations:"can_integrations", broadcast:"can_broadcast", notes:"can_notes", admin:false };
    return map[tab] ? permissions[map[tab]] : false;
  };

  const authHeaders = () => ({ "Content-Type":"application/json", "Authorization":`Bearer ${authToken}` });

  async function doLogin(force=false) {
    setLoginLoading(true); setLoginError("");
    try {
      const r = await fetch(`${API}/api/auth/login`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({...loginForm, force})
      });
      const d = await r.json();
      if (r.status === 409 && d.error === "already_logged_in") {
        setSessionConflict({...d, last_active_friendly: d.last_active_friendly||"recently"});
        setLoginLoading(false);
        return;
      }
      if (!r.ok) { setLoginError(d.error||"Login failed"); return; }
      setAuthToken(d.token);
      setCurrentUser(d.user);
      setPermissions(d.permissions);
      sessionStorage.setItem("crm_token", d.token);
      sessionStorage.setItem("crm_user", JSON.stringify(d.user));
      sessionStorage.setItem("crm_perms", JSON.stringify(d.permissions));
      sessionStorage.setItem("crm_timeout", String(d.session_timeout_mins||30));
      // Notify all other tabs to logout immediately
      try {
        const bc = new BroadcastChannel("crm_session");
        bc.postMessage({type:"new_login", token: d.token, username: d.user.username});
        bc.close();
      } catch(e) {}
      window.location.reload();
    } catch { setLoginError("Cannot connect to server"); }
    finally { setLoginLoading(false); }
  }

  async function doLogout() {
    try {
      await fetch(`${API}/api/auth/logout`, {method:"POST", headers:authHeaders()});
    } catch {}
    sessionStorage.clear();
    window.location.reload();
  }


  // ── LOGIN PAGE ──
  if (!currentUser) {
    return (
      <div style={{minHeight:"100vh",display:"flex",fontFamily:"'Helvetica Neue',Arial,sans-serif",background:"#f7f8fc"}}>
        <style>{`
          @keyframes fadeSlideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
          @keyframes floatCard{0%,100%{transform:translateY(0) rotate(-1.5deg)}50%{transform:translateY(-12px) rotate(-1.5deg)}}
          @keyframes floatCard2{0%,100%{transform:translateY(0) rotate(1.5deg)}50%{transform:translateY(-9px) rotate(1.5deg)}}
          @keyframes badgePop{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
          @keyframes shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
          @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
          .a0{animation:fadeSlideUp 0.5s ease both}
          .a1{animation:fadeSlideUp 0.5s 0.08s ease both}
          .a2{animation:fadeSlideUp 0.5s 0.16s ease both}
          .a3{animation:fadeSlideUp 0.5s 0.24s ease both}
          .a4{animation:fadeSlideUp 0.5s 0.32s ease both}
          .login-input{transition:all 0.2s}
          .login-input:focus{border-color:#4f46e5!important;box-shadow:0 0 0 4px rgba(79,70,229,0.1)!important;outline:none!important;background:#fff!important}
          .sign-btn{transition:all 0.2s;background:linear-gradient(135deg,#4f46e5,#6d28d9)}
          .sign-btn:hover{transform:translateY(-2px);box-shadow:0 12px 36px rgba(79,70,229,0.45)!important}
          .sign-btn:active{transform:translateY(0)}
        `}</style>

        {/* ══ LEFT PANEL ══ */}
        <div style={{width:"46%",minWidth:420,display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center",padding:"52px 56px",background:"#ffffff",position:"relative",boxShadow:"2px 0 40px rgba(0,0,0,0.06)",zIndex:2}}>

          {/* Subtle top-right accent */}
          <div style={{position:"absolute",top:0,right:0,width:180,height:180,background:"radial-gradient(circle at top right,rgba(79,70,229,0.06),transparent 70%)",pointerEvents:"none"}}/>
          <div style={{position:"absolute",bottom:0,left:0,width:150,height:150,background:"radial-gradient(circle at bottom left,rgba(109,40,217,0.05),transparent 70%)",pointerEvents:"none"}}/>

          <div style={{width:"100%",maxWidth:360}}>

            {/* Logo */}
            <div className="a0" style={{marginBottom:36}}>
              <div style={{display:"inline-flex",alignItems:"center",gap:10}}>
                <div style={{width:38,height:38,borderRadius:11,background:"linear-gradient(135deg,#4f46e5,#6d28d9)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:19,boxShadow:"0 4px 14px rgba(79,70,229,0.35)"}}>🤖</div>
                <div style={{fontWeight:900,fontSize:22,letterSpacing:-0.8,color:"#0f0f1a"}}>
                  Nexo<span style={{color:"#4f46e5"}}>ra</span>
                </div>
              </div>
            </div>


            {/* Tagline */}
            <div className="a2" style={{marginBottom:28}}>
              <h1 style={{margin:0,fontWeight:900,fontSize:26,color:"#0f0f1a",letterSpacing:-0.8,lineHeight:1.2}}>
                One inbox.<br/>
                <span style={{color:"#4f46e5"}}>Every channel.</span>
              </h1>
              <p style={{margin:"8px 0 0",fontSize:13,color:"#6b7280",lineHeight:1.6,fontWeight:400}}>Manage WhatsApp, Instagram, TikTok & Facebook conversations powered by AI.</p>
            </div>

            {/* Session conflict modal */}
            {sessionConflict&&<div style={{background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:14,padding:"18px",marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                <span style={{fontSize:22}}>🔒</span>
                <div style={{fontWeight:800,fontSize:15,color:"#92400e"}}>Account Already In Use</div>
              </div>
              <div style={{fontSize:13,color:"#78350f",marginBottom:10,lineHeight:1.6}}>
                This account is currently active on another device.<br/>
                You need to log out from that device first, or force login here.
              </div>
              <div style={{background:"#fef3c7",borderRadius:10,padding:"10px 12px",marginBottom:14,fontSize:12,color:"#92400e"}}>
                <div>📱 <strong>Device:</strong> {sessionConflict.device_info}</div>
                <div style={{marginTop:4}}>🕐 <strong>Last active:</strong> {sessionConflict.last_active_friendly||"recently"}</div>
                <div style={{marginTop:4}}>📅 <strong>Logged in at:</strong> {sessionConflict.logged_in_at ? new Date(sessionConflict.logged_in_at.replace(" ","T")+"Z").toLocaleString([],{dateStyle:"medium",timeStyle:"short"}) : "—"}</div>
              </div>
              <div style={{fontSize:12,color:"#b45309",marginBottom:12,padding:"8px 10px",background:"#fef9c3",borderRadius:8,border:"1px solid #fde68a"}}>
                ⚠️ Forcing login will immediately log out the other device
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>setSessionConflict(null)}
                  style={{flex:1,padding:"10px",borderRadius:10,border:"1px solid #fed7aa",background:"#fff",color:"#92400e",fontSize:13,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>
                  Cancel
                </button>
                <button onClick={()=>{setSessionConflict(null);doLogin(true);}}
                  style={{flex:2,padding:"10px",borderRadius:10,border:"none",background:"#dc2626",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                  🔓 Force Login
                </button>
              </div>
            </div>}

            {/* Error */}
            {loginError&&<div className="a2" style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:12,padding:"10px 14px",fontSize:13,color:"#dc2626",marginBottom:14,fontWeight:500}}>⚠ {loginError}</div>}

            {/* Form */}
            <div className="a3">
              <div style={{marginBottom:12}}>
                <label style={{display:"block",fontSize:11,fontWeight:700,color:"#374151",marginBottom:6,letterSpacing:0.5,textTransform:"uppercase"}}>Username</label>
                <input className="login-input" value={loginForm.username}
                  onChange={e=>setLoginForm(p=>({...p,username:e.target.value}))}
                  onKeyDown={e=>e.key==="Enter"&&doLogin()}
                  placeholder="Enter your username"
                  style={{width:"100%",padding:"13px 16px",borderRadius:14,border:"1.5px solid #e5e7eb",background:"#f9fafb",color:"#111",fontSize:14,boxSizing:"border-box",fontFamily:"inherit"}}/>
              </div>
              <div style={{marginBottom:22}}>
                <label style={{display:"block",fontSize:11,fontWeight:700,color:"#374151",marginBottom:6,letterSpacing:0.5,textTransform:"uppercase"}}>Password</label>
                <div style={{position:"relative"}}>
                  <input className="login-input" type={showPw?"text":"password"} value={loginForm.password}
                    onChange={e=>setLoginForm(p=>({...p,password:e.target.value}))}
                    onKeyDown={e=>e.key==="Enter"&&doLogin()}
                    placeholder="Enter your password"
                    style={{width:"100%",padding:"13px 48px 13px 16px",borderRadius:14,border:"1.5px solid #e5e7eb",background:"#f9fafb",color:"#111",fontSize:14,boxSizing:"border-box",fontFamily:"inherit"}}/>
                  <button onClick={()=>setShowPw(p=>!p)} style={{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",border:"none",background:"none",cursor:"pointer",fontSize:18,color:"#9ca3af",lineHeight:1,padding:0}}>{showPw?"🙈":"👁️"}</button>
                </div>
              </div>
              <button type="button" className="sign-btn" 
                onMouseDown={e=>{e.preventDefault();if(!loginLoading)doLogin();}}
                onClick={e=>{e.preventDefault();if(!loginLoading)doLogin();}}
                disabled={loginLoading}
                style={{width:"100%",padding:"14px",borderRadius:14,border:"none",color:"#fff",fontSize:15,fontWeight:800,cursor:loginLoading?"wait":"pointer",fontFamily:"inherit",letterSpacing:0.3,boxShadow:"0 6px 24px rgba(79,70,229,0.35)"}}>
                {loginLoading?"Signing in...":"Sign In →"}
              </button>
            </div>

            <div className="a4" style={{textAlign:"center",marginTop:22,fontSize:10,color:"#d1d5db",letterSpacing:1.5,fontWeight:600,textTransform:"uppercase"}}>Nexora CRM · v{CRM_VERSION}</div>
          </div>
        </div>

        {/* ══ RIGHT PANEL ══ */}
        <div style={{flex:1,background:"linear-gradient(145deg,#eef2ff 0%,#f5f3ff 45%,#ecfdf5 100%)",display:"flex",alignItems:"center",justifyContent:"center",position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",top:"-15%",right:"-10%",width:500,height:500,borderRadius:"50%",background:"radial-gradient(circle,rgba(79,70,229,0.1),transparent 65%)",pointerEvents:"none"}}/>
          <div style={{position:"absolute",bottom:"-15%",left:"-5%",width:400,height:400,borderRadius:"50%",background:"radial-gradient(circle,rgba(124,58,237,0.08),transparent 65%)",pointerEvents:"none"}}/>

          <div style={{position:"relative",width:"82%",maxWidth:500}}>
            {/* Main chat card */}
            <div style={{background:"#fff",borderRadius:28,padding:26,boxShadow:"0 24px 80px rgba(79,70,229,0.14),0 4px 16px rgba(0,0,0,0.06)",animation:"floatCard 5s ease-in-out infinite"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20,paddingBottom:16,borderBottom:"1px solid #f3f4f6"}}>
                <div style={{width:40,height:40,borderRadius:12,background:"linear-gradient(135deg,#4f46e5,#7c3aed)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,boxShadow:"0 4px 12px rgba(79,70,229,0.3)"}}>🤖</div>
                <div>
                  <div style={{fontWeight:800,fontSize:14,color:"#111"}}>Nexora AI</div>
                  <div style={{fontSize:11,color:"#25D366",fontWeight:700,display:"flex",alignItems:"center",gap:4}}>
                    <span style={{width:6,height:6,borderRadius:"50%",background:"#25D366",display:"inline-block",animation:"pulse 2s infinite"}}/>
                    Online · Responding
                  </div>
                </div>
                <div style={{marginLeft:"auto",display:"flex",gap:5}}>
                  {["#25D366","#e02d69","#111","#1877f2"].map((c,i)=>(
                    <div key={i} style={{width:22,height:22,borderRadius:6,background:c,boxShadow:`0 2px 6px ${c}60`}}/>
                  ))}
                </div>
              </div>
              {[
                {from:"bot",text:"Hi! How can I help you today? 😊",color:"#f3f4f6",tc:"#111"},
                {from:"user",text:"I want to book an appointment",color:"linear-gradient(135deg,#4f46e5,#7c3aed)",tc:"#fff"},
                {from:"bot",text:"Sure! What date works for you? 📅",color:"#f3f4f6",tc:"#111"},
                {from:"user",text:"Tomorrow at 3pm please",color:"linear-gradient(135deg,#4f46e5,#7c3aed)",tc:"#fff"},
              ].map((m,i)=>(
                <div key={i} style={{display:"flex",justifyContent:m.from==="user"?"flex-end":"flex-start",marginBottom:10}}>
                  <div style={{background:m.color,color:m.tc,padding:"10px 14px",borderRadius:m.from==="user"?"18px 18px 4px 18px":"18px 18px 18px 4px",fontSize:13,fontWeight:500,maxWidth:"76%",boxShadow:m.from==="user"?"0 4px 12px rgba(79,70,229,0.25)":"0 2px 8px rgba(0,0,0,0.05)"}}>{m.text}</div>
                </div>
              ))}
              <div style={{marginTop:14,display:"flex",gap:8,alignItems:"center"}}>
                <div style={{flex:1,background:"#f9fafb",borderRadius:12,padding:"10px 14px",fontSize:12,color:"#aaa",border:"1px solid #f3f4f6"}}>Type a message...</div>
                <div style={{width:38,height:38,borderRadius:12,background:"linear-gradient(135deg,#4f46e5,#7c3aed)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:16,boxShadow:"0 4px 12px rgba(79,70,229,0.4)"}}>↑</div>
              </div>
            </div>

            {/* Floating WA badge */}
            <div style={{position:"absolute",top:-22,right:-22,background:"#fff",borderRadius:18,padding:"11px 15px",boxShadow:"0 8px 32px rgba(37,211,102,0.2),0 2px 8px rgba(0,0,0,0.07)",display:"flex",alignItems:"center",gap:9,animation:"badgePop 4s ease-in-out infinite"}}>
              <div style={{width:34,height:34,borderRadius:10,background:"linear-gradient(135deg,#25D366,#128C7E)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 3px 10px rgba(37,211,102,0.4)"}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              </div>
              <div><div style={{fontSize:12,fontWeight:800,color:"#111"}}>WhatsApp</div><div style={{fontSize:10,color:"#25D366",fontWeight:700}}>Connected ✓</div></div>
            </div>

            {/* Floating IG badge */}
            <div style={{position:"absolute",bottom:-20,left:-28,background:"#fff",borderRadius:18,padding:"11px 15px",boxShadow:"0 8px 32px rgba(224,45,105,0.18),0 2px 8px rgba(0,0,0,0.07)",display:"flex",alignItems:"center",gap:9,animation:"badgePop 5.5s ease-in-out infinite 0.6s"}}>
              <div style={{width:34,height:34,borderRadius:10,background:"linear-gradient(135deg,#f9c336,#f47121,#e02d69,#c12591)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 3px 10px rgba(224,45,105,0.4)"}}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="white"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
              </div>
              <div><div style={{fontSize:12,fontWeight:800,color:"#111"}}>Instagram</div><div style={{fontSize:10,color:"#e02d69",fontWeight:700}}>Connected ✓</div></div>
            </div>

            {/* Floating TikTok badge */}
            <div style={{position:"absolute",top:"38%",right:-30,background:"#fff",borderRadius:18,padding:"11px 15px",boxShadow:"0 8px 32px rgba(105,201,208,0.18),0 2px 8px rgba(0,0,0,0.07)",display:"flex",alignItems:"center",gap:9,animation:"badgePop 6s ease-in-out infinite 1.1s"}}>
              <div style={{width:34,height:34,borderRadius:10,background:"#111",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 3px 10px rgba(0,0,0,0.3)"}}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="#69c9d0"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.27 8.27 0 004.84 1.56V6.78a4.85 4.85 0 01-1.07-.09z"/></svg>
              </div>
              <div><div style={{fontSize:12,fontWeight:800,color:"#111"}}>TikTok</div><div style={{fontSize:10,color:"#69c9d0",fontWeight:700}}>Connected ✓</div></div>
            </div>

            {/* Stats */}
            <div style={{position:"absolute",bottom:-52,right:12,background:"#fff",borderRadius:18,padding:"13px 18px",boxShadow:"0 8px 32px rgba(79,70,229,0.13)",animation:"floatCard2 6s ease-in-out infinite"}}>
              <div style={{fontSize:9,color:"#9ca3af",fontWeight:700,marginBottom:8,letterSpacing:1}}>TODAY'S MESSAGES</div>
              <div style={{display:"flex",gap:14,alignItems:"flex-end"}}>
                {[{c:"#25D366",n:"48",l:"WA"},{c:"#e02d69",n:"23",l:"IG"},{c:"#69c9d0",n:"31",l:"TT"},{c:"#1877f2",n:"17",l:"FB"}].map((s,i)=>(
                  <div key={i} style={{textAlign:"center"}}>
                    <div style={{fontWeight:900,fontSize:16,color:"#111"}}>{s.n}</div>
                    <div style={{width:28,height:4,borderRadius:2,background:s.c,margin:"3px auto"}}/>
                    <div style={{fontSize:9,color:s.c,fontWeight:700}}>{s.l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── MAIN APP (authenticated) ──

  const CHANGELOG = [
    { version:"2.9.95", date:"Jun 13 2026", tag:"NEW", color:"#10b981", items:[
      "📤 Follow-up messages tagged with agent name in CRM chat",
      "👤 Agent manual messages show who sent them",
      "🤖 Follow-up AI rewrote to focus on most recent customer message",
    ]},
    { version:"2.9.94", date:"Jun 14 2026", tag:"FIX", color:"#3b82f6", items:[
      "🔧 Follow-up: replaced browser popup with nice in-app toast notification",
    ]},
    { version:"2.9.92", date:"Jun 13 2026", tag:"NEW", color:"#10b981", items:[
      "⏱️ 24hr WhatsApp window circular indicator in chat header",
      "🔴 Follow-up button shows warning when 24hr window expired",
      "📢 Suggests using Broadcast instead after 24 hours",
    ]},
    { version:"2.9.90", date:"Jun 11 2026", tag:"NEW", color:"#10b981", items:[
      "📢 Broadcast: template body text field added",
      "🤖 Bot now reads broadcast content to answer customer questions",
      "⏱️ AI receives timestamps on all messages for better context",
    ]},
    { version:"2.9.89", date:"Jun 8 2026", tag:"FIX", color:"#3b82f6", items:[
      "🔧 Integrations: client users can now connect WhatsApp and Telegram themselves",
      "🔧 Integrations: Connect button shows for configured integrations",
    ]},
    { version:"2.9.88", date:"Jun 8 2026", tag:"FIX", color:"#3b82f6", items:[
      "🔧 Integrations: WhatsApp/Telegram correctly shows connected/not connected per client",
      "🔧 Integrations: field keys match DB columns",
      "🔧 KB: all Evera Health placeholders removed",
    ]},
    { version:"2.9.87", date:"Jun 8 2026", tag:"FIX", color:"#3b82f6", items:[
      "🔧 KB: removed Evera Health hardcoded placeholders",
      "🔧 Welcome message placeholder now generic",
    ]},
    { version:"2.9.86", date:"Jun 8 2026", tag:"FIX", color:"#3b82f6", items:[
      "📝 Notes: soft delete — never lost from DB, captures who deleted",
      "✅ Notes: mark done captures who marked done and when",
      "👁️ Notes: done cards show who marked done",
    ]},
    { version:"2.9.85", date:"Jun 8 2026", tag:"NEW", color:"#10b981", items:[
      "📝 Notes: Generate Notes button prominent at top",
      "📅 Date range + presets (Today, Yesterday, 7 days, 30 days)",
      "🤖 AI reads warm/hot conversations and creates notes on demand",
      "🔧 Removed background auto-note scheduler",
    ]},
    { version:"2.9.84", date:"Jun 8 2026", tag:"FIX", color:"#3b82f6", items:[
      "🔧 Inbox: removed stray } from sidebar",
      "🔧 Inbox: removed Resolve button and Resolved filter",
      "↩️ Leads: Reset All to Warm button in Done column",
    ]},
    { version:"2.9.83", date:"Jun 8 2026", tag:"FIX", color:"#3b82f6", items:[
      "✅ Inbox: Done added to lead dropdown",
      "🔧 Inbox: removed pipeline stage dropdown (redundant)",
      "⚡ Selecting Done moves card to Done column in Leads tab",
    ]},
    { version:"2.9.82", date:"Jun 6 2026", tag:"FIX", color:"#3b82f6", items:[
      "📝 Notes: simplified — auto runs every 5 mins in background",
      "🔄 Backfill hidden — available when needed at bottom",
      "✏️ Manual add note still available",
    ]},
    { version:"2.9.81", date:"Jun 6 2026", tag:"FIX", color:"#3b82f6", items:[
      "🔧 Leads: Unassigned now works correctly",
      "🔧 Leads: removed user filter pills (dropdown works fine)",
    ]},
    { version:"2.9.80", date:"Jun 6 2026", tag:"NEW", color:"#10b981", items:[
      "👤 Leads: filter by assigned user — click any agent name to see their tickets",
      "🔢 Shows count of open tickets per agent",
      "✅ Deleted/inactive users auto-removed from filter",
    ]},
    { version:"2.9.80", date:"Jun 6 2026", tag:"NEW", color:"#10b981", items:[
      "👥 Leads: filter by agent — see tickets assigned to specific user",
      "👤 Unassigned filter — see all unassigned leads at once",
      "🔄 Syncs with active users only — deleted users auto-removed from filter",
    ]},
    { version:"2.9.79", date:"Jun 6 2026", tag:"FIX", color:"#3b82f6", items:[
      "📅 Leads: date & time shown on each card",
      "🔍 Leads: date range filter added",
    ]},
    { version:"2.9.78", date:"Jun 6 2026", tag:"NEW", color:"#10b981", items:[
      "🎯 Leads: drag & drop cards between columns",
      "🔍 Leads: search by name or phone",
      "📅 Leads: sorted newest first within each column",
      "✋ Leads: Assign to Me button for staff",
      "⚡ Leads: lead change from inbox reflects instantly in leads tab",
    ]},
    { version:"2.9.77", date:"Jun 6 2026", tag:"FIX", color:"#3b82f6", items:[
      "🔧 Manual tab: only shows chats where agent replied AND bot is currently OFF",
    ]},
    { version:"2.9.76", date:"Jun 6 2026", tag:"FIX", color:"#3b82f6", items:[
      "🔧 Manual filter now shows only chats where human agent actually replied",
      "🔧 Mark as read fixed for client users — phone format handling",
    ]},
    { version:"2.9.75", date:"Jun 3 2026", tag:"NEW", color:"#10b981", items:[
      "📝 Notes: AI Generate button with date range picker",
      "🤖 AI reads warm/hot conversations and creates notes for interested-but-not-ready customers",
      "🔵 AI badge on auto-generated notes",
      "📅 Presets: Today, 7 days, 30 days",
    ]},
    { version:"2.9.74", date:"Jun 3 2026", tag:"FIX", color:"#3b82f6", items:[
      "🔧 Notes tab permission now saves correctly to DB",
      "🔧 can_notes added to all user permission payloads",
    ]},
    { version:"2.9.73", date:"Jun 3 2026", tag:"NEW", color:"#10b981", items:[
      "📝 Notes tab — agents write sticky notes per contact",
      "👁️ Client users see their notes, mark done, click to jump to chat",
      "✅ Done notes strikethrough and move to bottom",
      "🔐 can_notes permission — share/unshare from Admin panel",
    ]},
    { version:"2.9.68", date:"May 31 2026", tag:"NEW", color:"#10b981", items:[
      "🧪 Test Bot: sandbox mode — edit prompt/KB without touching live",
      "👥 Admin can select any client to test their bot",
      "🔍 Chat Analyser — paste broken chat, AI diagnoses and gives exact fixes",
      "🚀 Publish sandbox to live with one click",
    ]},
    { version:"2.9.6", date:"May 21 2026", tag:"NEW", color:"#10b981", items:[
      "📎 Images, documents, audio and video from WhatsApp now show in CRM",
      "🖼️ Click images to open full size",
      "📄 Documents show as download links",
    ]},
    { version:"2.9.6", date:"May 18 2026", tag:"NEW", color:"#10b981", items:[
      "🎨 Admin can now set brand colour per client in onboarding",
      "🏢 Client CRM shows their brand colour when logged in",
      "🖼️ Colour picker with presets in client onboarding form",
    ]},
    { version:"2.9.5", date:"May 16 2026", tag:"FIX", color:"#3b82f6", items:[
      "Mark as Unread button restored — hover over any chat",
      "Bot now knows today real date — no more wrong date calculations",
      "Smart follow-up — AI reads full conversation before deciding",
    ]},
    { version:"2.9.4", date:"May 16 2026", tag:"FIX", color:"#3b82f6", items:[
      "🔒 Chat window no longer auto-scrolls when reading old messages — properly fixed",
    ]},
    { version:"2.9.3", date:"May 16 2026", tag:"FIX", color:"#3b82f6", items:[
      "👤 Manual filter shows Turn Bot ON per chat + Turn All ON button",
      "🎯 Keywords boxes now expandable with live chip preview",
      "🔒 Chat scroll no longer jumps when reading old messages",
      "💾 Client settings now save correctly",
    ]},
    { version:"2.7.0", date:"Mar 12 2026", tag:"NEW", color:"#10b981", items:[
      "🤖 Multi AI provider — switch between Claude, GPT-4o, Groq (free) from Settings",
      "🔔 Notification bell — version changelog (you're reading it!)",
      "⚙️ Global AI ON/OFF toggle — zero API cost when off",
    ]},
    { version:"2.6.1", date:"Mar 9 2026", tag:"FIX", color:"#3b82f6", items:[
      "✅ Agent manual reply from CRM now working",
      "🔑 WhatsApp token error now shows exact error code",
      "🔌 Dead DB connection recovery — auto reconnects",
      "⏱️ Polling reduced to 10s — less backend load",
    ]},
    { version:"2.6.0", date:"Mar 8 2026", tag:"NEW", color:"#10b981", items:[
      "🗂️ Archive contact feature",
      "📊 Enhanced analytics — peak hours, bot vs human, growth %",
      "📱 Mobile hamburger menu",
      "🏷️ Versioning system (/version, /health, /stats)",
    ]},
  ];
  const latestVersion = CHANGELOG[0].version;
  const hasUnread = changelogSeen !== latestVersion;

  const messagesEndRef = useRef(null);
  const botEndRef = useRef(null);
  const qaRefs = useRef({});

  // Scroll refs for tracking
  const prevSelectedId = useRef(null);
  const userScrolled = useRef(false);
  const chatContainerRef = useRef(null);

  // Only scroll to bottom when switching to a new chat

  useEffect(() => {
    if(!selected?.id) return;
    if(selected.id !== prevSelectedId.current) {
      prevSelectedId.current = selected.id;
      userScrolled.current = false;
      setTimeout(()=>messagesEndRef.current?.scrollIntoView({behavior:"auto"}), 50);
    }
  }, [selected?.id]);

  // Only scroll when NEW message added AND user hasn't scrolled up
  const prevMsgCount = useRef(0);
  useEffect(() => {
    const count = selected?.messages?.length || 0;
    if(count > prevMsgCount.current && prevMsgCount.current > 0) {
      if(!userScrolled.current) {
        messagesEndRef.current?.scrollIntoView({behavior:"smooth"});
      }
    }
    prevMsgCount.current = count;
  }, [selected?.messages?.length]);

  useEffect(() => { botEndRef.current?.scrollIntoView({behavior:"smooth"}); }, [botConvo]);

  // Tick every minute to update 24hr window indicator
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  // Session guard — runs immediately and every 10 seconds
  useEffect(() => {
    if(!authToken || !currentUser || currentUser.role==="admin") return;

    const kickOut = (msg) => {
      sessionStorage.clear();
      showToast(msg, msg.includes("❌")||msg.includes("Error")||msg.includes("Failed")?"error":msg.includes("✅")?"success":"info");
      window.location.href = window.location.origin + window.location.pathname;
    };

    const checkSession = async () => {
      try {
        const r = await fetch(`${API}/api/auth/heartbeat`, {
          method:"POST",
          headers:{"Authorization":`Bearer ${authToken}`,"Content-Type":"application/json"}
        });
        if(r.status === 401) {
          kickOut("⚠️ You have been logged out because this account was accessed from another device or location.");
        }
      } catch(e) {
        // Network error — don't kick out, just skip
      }
    };

    // Get session timeout dynamically - re-read every check so admin changes apply immediately
    const getTimeoutMs = () => {
      const t = parseInt(sessionStorage.getItem("crm_timeout")||"30");
      return t * 60 * 1000;
    };

    // Track last user activity
    let lastActivity = Date.now();
    const onActivity = () => { lastActivity = Date.now(); };
    ["mousedown","keydown","touchstart","scroll"].forEach(e=>
      document.addEventListener(e, onActivity, {passive:true})
    );

    // Run immediately on mount
    checkSession();
    // Then every 10 seconds
    const interval = setInterval(()=>{
      // Check idle timeout - read fresh value each time
      if(Date.now() - lastActivity > getTimeoutMs() && !idleWarningRef.current) {
        idleWarningRef.current = true;
        setIdleWarning(true);
        return;
      }
      checkSession();
    }, 10000);

    // Check when tab/app becomes visible again (handles Safari background suspension)
    const onVisible = () => {
      if(document.visibilityState === "visible") {
        // Check idle timeout on visibility
        if(Date.now() - lastActivity > getTimeoutMs() && !idleWarningRef.current) {
          idleWarningRef.current = true;
          setIdleWarning(true);
          return;
        }
        checkSession();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    const onFocus = () => checkSession();
    window.addEventListener("focus", onFocus);

    // BroadcastChannel for same-browser tabs
    let bc;
    try {
      bc = new BroadcastChannel("crm_session");
      bc.onmessage = (e) => {
        if(e.data.type === "new_login") {
          kickOut("⚠️ Another login was detected. You have been logged out.");
        }
      };
    } catch(e) {}

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      ["mousedown","keydown","touchstart","scroll"].forEach(e=>
        document.removeEventListener(e, onActivity)
      );
      try { bc?.close(); } catch(e) {}
    };
  }, [authToken]);

  const fetchConversations = useCallback(async () => {
    try {
      const clinicParam = inboxClinic ? `?clinic_id=${inboxClinic}` : "";
      const ctrl = new AbortController();
      const tmo = setTimeout(()=>ctrl.abort(), 30000);
      const res = await fetch(`${API}/api/conversations${clinicParam}`, {headers:authHeaders(), signal:ctrl.signal});
      clearTimeout(tmo);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setContacts(prev => {
        return data.map(newC => {
          // If currently selected chat — keep unread:0 and re-mark read in DB
          if (selectedRef.current?.id === newC.id) {
            if(newC.unread > 0) {
              fetch(`${API}/api/conversations/${newC.id}/read`,{
                method:"PATCH",
                headers:{"Content-Type":"application/json","Authorization":`Bearer ${authToken}`},
                body: JSON.stringify({unread:0})
              }).catch(()=>{});
            }
            return {...newC, unread: 0};
          }
          // If agent manually read this chat — keep unread:0, don't let poll reset it
          if (manuallyReadRef.current.has(newC.id) && newC.unread === 0) {
            return {...newC, unread: 0};
          }
          // If new messages arrived for a manually-read chat — clear from set so badge shows
          if (manuallyReadRef.current.has(newC.id) && newC.unread > 0) {
            manuallyReadRef.current.delete(newC.id);
          }
          return newC;
        });
      });
      setBackendStatus("online");
      fetchConversations._failCount = 0; // reset on success
      try {
        const vr = await fetch(`${API}/version`);
        if (vr.ok) { const vd = await vr.json(); setBackendVersion(vd.version||""); }
      } catch {}
      if (selected) { const u = data.find(c=>c.id===selected.id); if (u) setSelected(prev => ({...prev, botActive: u.botActive, status: u.status, lead: u.lead})); }
    } catch { 
      // Don't set offline here — health ping handles status independently
      fetchConversations._failCount = (fetchConversations._failCount||0) + 1;
    }
    finally { setLoading(false); }
  }, [selected, inboxClinic]);

const fetchTemplates = useCallback(async (clinicId=null) => {
    try {
      const url = clinicId 
        ? `${API}/api/admin/clients/${clinicId}/templates`
        : `${API}/api/templates`;
      const r = await fetch(url, {headers:authHeaders()});
      if(r.ok) setTemplates(await r.json());
      else setTemplates([]);
    } catch {}
  }, []);

  const fetchKnowledge = useCallback(async (clinicId=null) => {
    try {
      const cParam = clinicId ? `?clinic_id=${clinicId}` : "";
      const r=await fetch(`${API}/api/knowledge${cParam}`, {headers:authHeaders()});
      if(!r.ok)return;
      const d=await r.json();
      setQaData(d.qa||[]);
      setSystemPrompt(d.systemPrompt||"");
      setWelcomeMessage(d.welcomeMessage||"");
    } catch {}
  }, []);

  const fetchSettings = useCallback(async (clinicId=null, force=false) => {
    // Admin gets settings via loadClientSettings — not this function
    if(isAdmin && !clinicId) return;
    try {
      const cParam = clinicId ? `?clinic_id=${clinicId}` : "";
      const r=await fetch(`${API}/api/settings${cParam}`, {headers:authHeaders()});
      if(!r.ok)return;
      const d=await r.json();
      if(force) {
        setAppSettings(d);
        setSettingsDirtyWithRef(false);
      } else if(!settingsDirtyRef.current) {
        setAppSettings(d);
      }
      if(d.session_timeout_mins) {
        sessionStorage.setItem("crm_timeout", String(d.session_timeout_mins));
      }
    } catch {}
  }, [isAdmin]);

  const [clinicUsers, setClinicUsers] = useState([]);

  // Refresh permissions from server (in case admin changed them)
  const refreshPermissions = useCallback(async () => {
    if(!authToken || isAdmin) return;
    try {
      const r = await fetch(`${API}/api/auth/me`, {headers:authHeaders()});
      if(r.ok) {
        const d = await r.json();
        if(d.permissions) {
          setPermissions(d.permissions);
          // Always update sessionStorage so reload uses fresh perms
          sessionStorage.setItem("crm_perms", JSON.stringify(d.permissions));
        }
      }
    } catch {}
  }, [authToken, isAdmin]);

  // Load clinic users for assignment dropdown
  const fetchClinicUsers = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/users`, {headers:authHeaders()});
      if(r.ok) {
        const d = await r.json();
        setClinicUsers(d);
        window._clinicUsers = d; // keep for backward compat
      }
    } catch {}
  }, []);

  // Handle session invalidation globally
  const apiFetch = useCallback(async (url, options={}) => {
    const r = await fetch(url, {...options, headers:{...authHeaders(), ...(options.headers||{})}});
    if(r.status === 401) {
      const d = await r.json().catch(()=>({}));
      if(d.code === "session_invalid") {
        showToast("You have been logged out — account logged in on another device","#ef4444");
        sessionStorage.clear();
        window.location.reload();
        return null;
      }
    }
    return r;
  }, [authToken]);

  const fetchAnalytics = useCallback(async (from, to, clinicId=null) => {
    setAnalyticsLoading(true);
    try {
      const cParam = clinicId ? `&clinic_id=${clinicId}` : "";
      console.log("📊 fetchAnalytics clinic_id=", clinicId, "url=", `/api/analytics?from=${from}&to=${to}${cParam}`);
      const r = await fetch(`${API}/api/analytics?from=${from}&to=${to}${cParam}`, {headers:authHeaders()});
      if(r.ok) setAnalytics(await r.json());
      // Also fetch ad summary for KPI card
      try {
        const cParam2 = clinicId ? `?clinic_id=${clinicId}` : "";
        const _arUrl = API+"/api/analytics/ads?from="+from+"&to="+to+(clinicId?"&clinic_id="+clinicId:"");
        const ar = await fetch(_arUrl, {headers:authHeaders()});
        if(ar.ok) {
          const ads = await ar.json();
          setAdData(ads.filter(a=>a.ad_headline&&a.ad_headline!=="Organic / Direct"));
          setAdSummary({
            count: ads.filter(a=>a.ad_headline&&a.ad_headline!=="Organic / Direct").length,
            totalClicks: ads.reduce((s,a)=>s+(a.total_clicks||0),0),
            totalBookings: ads.reduce((s,a)=>s+(a.bookings||0),0),
          });
        }
      } catch {}
    } catch {}
    setAnalyticsLoading(false);
  }, []);

  const fetchAdminOverview = useCallback(async () => {
    setOverviewLoading(true);
    try {
      const r = await fetch(`${API}/api/admin/analytics-overview`, {headers:authHeaders()});
      if(r.ok) {
        const data = await r.json();
        setAdminOverview(data);
      }
    } catch {}
    setOverviewLoading(false);
  }, []);

  const [settingsLoading, setSettingsLoading] = useState(false);

  async function loadClientSettings(client) {
    setSettingsClinic(client);
    setClientSettings(null);
    setSettingsDirtyWithRef(false);
    setSettingsLoading(true);
    try {
      const r = await fetch(`${API}/api/admin/clients/${client.clinic_id}/settings`, {headers:authHeaders()});
      if(r.ok) {
        const d = await r.json();
        setClientSettings(d);
        // Load ALL client settings into appSettings so every SettingInput works
        setAppSettings(prev=>({
          ...prev,
          ai_provider:          d.ai_provider||"anthropic",
          ai_model:             d.ai_model||"claude-haiku-4-5-20251001",
          timezone:             d.timezone||"",
          ai_enabled:           d.bot_enabled===false?"false":"true",
          usd_conversion:       d.usd_conversion||false,
          hot_keywords:         d.lead_keywords||d.hot_keywords||"",
          warm_keywords:        d.warm_keywords||"",
          cold_keywords:        d.cold_keywords||"",
          system_prompt:        d.system_prompt||"",
          followup_enabled:     d.followup_enabled||"true",
          followup_1_enabled:   d.followup_1_enabled||"true",
          followup_2_enabled:   d.followup_2_enabled||"false",
          followup_1_delay:     d.followup_1_delay||"2",
          followup_1_delay_unit:d.followup_1_delay_unit||"hours",
          followup_1_message:   d.followup_1_message||"",
          followup_2_delay:     d.followup_2_delay||"24",
          followup_2_delay_unit:d.followup_2_delay_unit||"hours",
          followup_2_message:   d.followup_2_message||"",
          followup_max:         d.followup_max||"2",
          telegram_token:        d.telegram_token||"",
          telegram_chat_id:      d.telegram_chat_id||"",
          telegram_notify_hot:   d.telegram_notify_hot||"true",
          telegram_notify_warm:  d.telegram_notify_warm||"false",
          telegram_notify_human: d.telegram_notify_human||"true",
          telegram_notify_booking: d.telegram_notify_booking||"true",
          anthropic_key:           d.anthropic_key||"",
          openai_key:              d.openai_key||"",
          groq_key:                d.groq_key||"",
        }));
      }
    } catch(e) {
      console.error("loadClientSettings failed:", e);
    } finally {
      setSettingsLoading(false);
    }
  }

  async function loadKbForClient(client) {
    setKbClinic(client);
    // Clear old data immediately so admin sees fresh data for new client
    setWelcomeMessage("");
    setSystemPrompt("");
    setQaData([]);
    try {
      const r = await fetch(`${API}/api/admin/clients/${client.clinic_id}/knowledge`, {headers:authHeaders()});
      if(r.ok) {
        const d = await r.json();
        setQaData(d.qa||[]);
        setSystemPrompt(d.systemPrompt||"");
        setWelcomeMessage(d.welcomeMessage||"");
      }
    } catch(e) {
      try {
        const r2 = await fetch(`${API}/api/knowledge?clinic_id=${client.clinic_id}`, {headers:authHeaders()});
        if(r2.ok) { const d=await r2.json(); setQaData(d.qa||[]); setSystemPrompt(d.systemPrompt||""); setWelcomeMessage(d.welcomeMessage||""); }
      } catch {}
    }
  }

  async function saveClientSettings() {
    if(!settingsClinic||!clientSettings) return;
    try {
      const r = await fetch(`${API}/api/admin/users/${settingsClinic.id}/settings`, {
        method:"PATCH", headers:authHeaders(),
        body:JSON.stringify(clientSettings)
      });
      if(r.ok){ setSettingsSaved(true); setTimeout(()=>setSettingsSaved(false),2500); }
    } catch {}
  }

  const pollRef = useRef(null);
  const socketRef = useRef(null);
  const fetchConvRef = useRef(null);
  useEffect(() => { fetchConvRef.current = fetchConversations; }, [fetchConversations]);

  // Fast health ping
  useEffect(() => {
    let failCount = 0;
    const ping = async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const r = await fetch(`${API}/health`, {signal: controller.signal});
        clearTimeout(timer);
        if(r.ok) { setBackendStatus("online"); failCount = 0; }
        else { failCount++; if(failCount >= 2) setBackendStatus("offline"); }
      } catch(e) {
        clearTimeout(timer);
        if(e.name !== "AbortError") { failCount++; if(failCount >= 2) setBackendStatus("offline"); }
      }
    };
    ping();
    const t = setInterval(ping, 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    fetchConversations();
    fetchKnowledge();
    fetchSettings();
    fetchClinicUsers();
    refreshPermissions();
  }, []);

  // Refetch when admin switches clinic
  useEffect(() => {
    if(inboxClinic) fetchConversations();
  }, [inboxClinic]);

  useEffect(() => {
    fetch(`${API}/api/ai-status`).then(r=>r.json()).then(setAiStatus).catch(()=>{});

    // ── WebSocket real-time connection ──
    const clinicId = authToken ? JSON.parse(atob(authToken.split(".")[1]||"e30="))?.clinic_id : null;
    if(typeof io !== "undefined") {
      try {
        const sock = io(API, {
          transports:["websocket","polling"],
          reconnectionAttempts:10,
          reconnectionDelay:2000,
          timeout:8000,
        });
        socketRef.current = sock;
        sock.on("connect", () => {
          if(clinicId) sock.emit("join", {clinic_id: clinicId});
          // Admin joins all clinic rooms for real-time updates
          const payload = authToken ? JSON.parse(atob(authToken.split(".")[1]||"e30=")) : {};
          if(payload.role==="admin") {
            [1,3,4,5,6,7,8,9,10].forEach(cid => sock.emit("join", {clinic_id: cid}));
          }
          setBackendStatus("online");
          // Slow fallback poll when WS connected — just in case
          if(pollRef.current) clearInterval(pollRef.current);
          pollRef.current = setInterval(()=>fetchConvRef.current?.(), 30000);
        });
        sock.on("new_message", () => {
          fetchConvRef.current?.();
        });
        sock.on("contact_update", () => {
          fetchConvRef.current?.();
        });
        sock.on("disconnect", () => {
          // Fall back to fast polling if WS drops
          if(pollRef.current) clearInterval(pollRef.current);
          pollRef.current = setInterval(()=>fetchConvRef.current?.(), 10000);
        });
        sock.on("connect_error", () => {
          // WS failed — use polling
          if(pollRef.current) clearInterval(pollRef.current);
          pollRef.current = setInterval(()=>fetchConvRef.current?.(), 10000);
        });
      } catch(e) {
        // Fallback to polling
        if(pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(()=>fetchConvRef.current?.(), 10000);
      }
    } else {
      // No socket.io — use polling
      if(pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(()=>fetchConvRef.current?.(), 10000);
    }

    return () => {
      if(pollRef.current) clearInterval(pollRef.current);
      if(socketRef.current) { socketRef.current.disconnect(); socketRef.current = null; }
    };
  }, []);

  useEffect(() => {
    if(tab==="broadcast") { if(!isAdmin) fetchTemplates(); }
    if(tab==="analytics") {
      fetchAnalytics(dateFrom, dateTo, selectedClinicRef.current?.id||selectedClinicRef.current?.clinic_id||null);
      if(isAdmin) fetchAdminOverview();
    }
    if((tab==="crm"||tab==="leads"||tab==="settings"||tab==="kb"||tab==="integrations") && isAdmin && adminOverview.length===0) {
      fetchAdminOverview();
    }
    if(tab==="integrations" && isAdmin) {
      fetchAdminOverview();
    }
  }, [tab]);

  // Global auto-refresh every 30s for all users and all tabs
  useEffect(() => {
    if(!authToken || !currentUser) return;
    const autoRefresh = () => {
      // Always refresh conversations (inbox)
      fetchConversations();
      // Refresh settings (client only — admin uses loadClientSettings)
      if(!isAdmin) fetchSettings();
      // Refresh current tab data
      if(tab==="broadcast") { if(!isAdmin) fetchTemplates(); }
      if(isAdmin) fetchAdminOverview();
    };
    const interval = setInterval(autoRefresh, 30000);
    return () => clearInterval(interval);
  }, [tab, authToken, currentUser]);

  function setPreset(p) {
    setDatePreset(p); const t=today();
    if(p==="7d")  { setDateFrom(daysAgo(6));  setDateTo(t); }
    if(p==="30d") { setDateFrom(daysAgo(29)); setDateTo(t); }
    if(p==="90d") { setDateFrom(daysAgo(89)); setDateTo(t); }
  }

  async function fetchFollowupTracker(clinicId) {
    setFollowupTrackerLoading(true);
    try {
      const url = `${API}/api/followup-tracker${clinicId?`?clinic_id=${clinicId}`:''}`;
      const r = await fetch(url, {headers:authHeaders()});
      if(r.ok) setFollowupTracker(await r.json());
    } catch(e) { console.error('followup tracker fetch failed:', e); }
    setFollowupTrackerLoading(false);
  }

  async function fetchAdHistory(phone) {
    try {
      const p = phone.replace("+","");
      const r = await fetch(`${API}/api/conversations/${p}/ad-history`, {headers:authHeaders()});
      if(r.ok) { setAdHistory(await r.json()); setAdHistoryPage(0); }
      else setAdHistory([]);
    } catch { setAdHistory([]); }
  }

  async function selectContact(c) {
    setShowRightPanel(true);
    setSelected({...c, messages: c.messages||[]}); selectedRef.current = c; setMenuOpen(false);
    manuallyReadRef.current.add(c.id);
    try { await fetch(`${API}/api/conversations/${c.id}/read`,{method:"PATCH",headers:authHeaders()}); } catch {}
    setContacts(p=>p.map(x=>x.id===c.id?{...x,unread:0}:x));
    fetchAdHistory(c.phone);
    // Lazy load messages if not already loaded
    if(!c.messages || c.messages.length===0) {
      try {
        const phone = c.phone.replace(/^\+/, '');
        const r = await fetch(`${API}/api/conversations/${phone}`,{headers:authHeaders()});
        if(r.ok) {
          const data = await r.json();
          const msgs = (data.messages || []).map(m=>({
            ...m,
            mediaUrl: m.mediaUrl || m.media_url || "",
            agentName: m.agentName || m.agent_name || "",
          }));
          setSelected(prev => prev?.id===c.id ? {...prev, ...data, messages: msgs} : prev);
          selectedRef.current = {...selectedRef.current, ...data, messages: msgs};
        }
      } catch(e) { console.error('lazy load failed:', e); }
    }
  }

  async function archiveContact(id) {
    try {
      await fetch(`${API}/api/conversations/${id}/archive`,{method:"PATCH",headers:authHeaders(),
        body:JSON.stringify({archived:true, archived_by:currentUser?.username||"unknown"})});
      setContacts(p=>p.filter(x=>x.id!==id));
      if(selected?.id===id) setSelected(null);
    } catch {}
    setArchiveConfirm(null);
  }

  async function fetchArchived() {
    try {
      const r = await fetch(`${API}/api/conversations?archived=true`,{headers:authHeaders()});
      if(r.ok) {
        const all = await r.json();
        setArchivedContacts(all.filter(c=>c.archived===true));
      }
    } catch {}
  }

  async function unarchiveContact(phone) {
    try {
      await fetch(`${API}/api/conversations/${phone}/archive`,{method:"PATCH",headers:authHeaders(),
        body:JSON.stringify({archived:false})});
      setArchivedContacts(p=>p.filter(x=>x.id!==phone));
      fetchConversations();
    } catch {}
  }

  async function sendAgentReply() {
    if(!reply.trim()||!selected) return;
    const text = reply.trim();
    setReply("");

    // Show message instantly in UI with agent name tag
    const agentName = currentUser?.username || currentUser?.name || "Agent";
    const tempMsg = { id: "temp_" + Date.now(), from: "agent", text, time: ts(), sources: [], date: today(), agentName };
    setSelected(prev => ({ ...prev, messages: [...(prev.messages||[]), tempMsg] }));
    setContacts(prev => prev.map(c => c.id===selected.id ? {...c, lastMessage:text, lastTime:ts()} : c));

    try {
      const r = await fetch(`${API}/api/conversations/${selected.id}/reply`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ text })
      });
      if (r.ok) {
        fetchConversations(); // refresh to get real message ID from DB
      } else {
        const err = await r.json().catch(()=>({}));
        showToast(`Failed to send: ${err.error||r.status} — check WhatsApp token`,"#ef4444");
        // Remove temp message on failure
        setSelected(prev => ({ ...prev, messages: prev.messages.filter(m=>m.id!==tempMsg.id) }));
      }
    } catch(e) {
      showToast("Network error — backend may be offline","#ef4444");
      setSelected(prev => ({ ...prev, messages: prev.messages.filter(m=>m.id!==tempMsg.id) }));
    }
  }

  async function toggleBot(id) {
    const c=contacts.find(x=>x.id===id);
    const newState = !c?.botActive;
    // Update locally immediately so badge disappears right away
    setContacts(prev=>prev.map(x=>x.id===id?{...x,botActive:newState}:x));
    if(selected?.id===id) setSelected(prev=>({...prev,botActive:newState}));
    try { await fetch(`${API}/api/conversations/${id}/bot`,{method:"PATCH",headers:authHeaders(),body:JSON.stringify({botActive:newState})}); } catch {}
  }

  async function toggleStatus(id) {
    const c=contacts.find(x=>x.id===id); const s=c?.status==="open"?"resolved":"open";
    try { await fetch(`${API}/api/conversations/${id}/status`,{method:"PATCH",headers:authHeaders(),body:JSON.stringify({status:s})}); fetchConversations(); } catch {}
  }

  async function setManualLead(id,lead) {
    // Update locally immediately so card moves instantly in leads tab
    const stage = lead==="done" ? "done" : undefined;
    setContacts(prev=>prev.map(c=>c.id===id?{...c,lead,...(stage?{pipelineStage:stage}:{})}:c));
    if(selected?.id===id) setSelected(prev=>({...prev,lead,...(stage?{pipelineStage:stage}:{})}));
    try {
      await fetch(`${API}/api/conversations/${id}/lead`,{method:"PATCH",headers:authHeaders(),body:JSON.stringify({lead})});
      if(stage) await fetch(`${API}/api/conversations/${id}/pipeline`,{method:"PATCH",headers:authHeaders(),body:JSON.stringify({stage:"done"})});
      fetchConversations();
    } catch {}
  }

  async function setPipelineStage(id,stage) {
    try { await fetch(`${API}/api/conversations/${id}/pipeline`,{method:"PATCH",headers:authHeaders(),body:JSON.stringify({stage})}); fetchConversations(); } catch {}
  }

  async function sendFollowup(phone,followupNum) {
    setSendingFollowup(phone);
    try {
      const r=await fetch(`${API}/api/conversations/${phone}/followup`,{method:"POST",headers:authHeaders(),body:JSON.stringify({followupNum})});
      if(r.ok){
        fetchConversations();
        showToast("✅ Follow-up sent successfully!","#22c55e");
      } else {
        const d=await r.json().catch(()=>({}));
        showToast("❌ "+(d.error||"Failed to send follow-up"),"#ef4444");
      }
    } catch{ showToast("❌ Network error","#ef4444"); }
    setSendingFollowup(null);
  }

  function showToast(msg, color="#22c55e") {
    const toast = document.createElement("div");
    toast.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:99999;
      background:${color};color:#fff;padding:12px 24px;border-radius:12px;
      font-size:14px;font-weight:600;font-family:inherit;
      box-shadow:0 4px 20px rgba(0,0,0,.2);
      animation:slideUp .3s ease`;
    toast.textContent = msg;
    const style = document.createElement("style");
    style.textContent = "@keyframes slideUp{from{opacity:0;transform:translate(-50%,-50%) scale(0.8)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}";
    document.head.appendChild(style);
    document.body.appendChild(toast);
    setTimeout(()=>{
      toast.style.transition="opacity .3s";
      toast.style.opacity="0";
      setTimeout(()=>{document.body.removeChild(toast);document.head.removeChild(style);},300);
    },3000);
  }

  // Claude-powered greeting toast
  async function showGreeting() {
    if(!currentUser) return;
    const name = currentUser.full_name || currentUser.username || "there";
    const firstName = name.split(" ")[0];
    const now = new Date();
    const hour = now.getHours();
    const day = now.toLocaleDateString("en-US",{weekday:"long"});
    const timeOfDay = hour>=5&&hour<12?"morning":hour>=12&&hour<17?"afternoon":hour>=17&&hour<21?"evening":"night";
    const isNight = hour>=21||hour<5;
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"claude-haiku-4-5-20251001",
          max_tokens:60,
          messages:[{role:"user",content:`Generate a unique, punchy greeting for ${firstName} opening their sales CRM. Time: ${timeOfDay} on ${day}. Random seed: ${Math.random().toString(36).slice(2,8)}. Rules: max 10 words, no punctuation at start, reference the time of day creatively, sound like a cool colleague not a bot, vary the style each time (sometimes motivational, sometimes witty, sometimes casual, sometimes energetic). ${isNight?"It is late night — be playful about working late.":""} End with 1 fitting emoji. Just the message, nothing else.`}]
        })
      });
      const data = await resp.json();
      const msg = data?.content?.[0]?.text?.trim();
      if(msg) showGreetingToast(msg);
    } catch(e) {
      const fallbacks = [
        `Hey ${firstName}! Ready to close some deals? 🔥`,
        `Welcome back, ${firstName}! Leads are waiting. 📊`,
        `${firstName} is in the building! Let's go. 💪`
      ];
      showGreetingToast(fallbacks[Math.floor(Math.random()*fallbacks.length)]);
    }
  }

  function showGreetingToast(msg) {
    const existing = document.getElementById("lluna-greeting-toast");
    if(existing) existing.remove();
    document.getElementById("lluna-greeting-style")?.remove();

    const style = document.createElement("style");
    style.id = "lluna-greeting-style";
    style.textContent = `
      @keyframes lgPop{0%{opacity:0;transform:translate(-50%,-50%) scale(0.75)}60%{transform:translate(-50%,-50%) scale(1.04)}100%{opacity:1;transform:translate(-50%,-50%) scale(1)}}
      @keyframes lgDrop{0%{opacity:1;transform:translate(-50%,-50%) scale(1)}100%{opacity:0;transform:translate(-50%,-46%) scale(0.9)}}
      @keyframes lgShine{0%{left:-100%}100%{left:200%}}
      #lluna-greeting-toast{animation:lgPop .5s cubic-bezier(.34,1.56,.64,1) forwards}
      #lluna-greeting-toast.hiding{animation:lgDrop .3s ease forwards}
    `;
    document.head.appendChild(style);

    const hour = new Date().getHours();
    const timeEmoji = hour>=5&&hour<12?"🌅":hour>=12&&hour<17?"☀️":hour>=17&&hour<21?"🌆":"🌙";

    const toast = document.createElement("div");
    toast.id = "lluna-greeting-toast";
    toast.style.cssText = `
      position:fixed;top:50%;left:50%;z-index:9999;
      background:linear-gradient(135deg,#8052FF 0%,#C040E8 60%,#FF6B9D 100%);
      color:#fff;
      padding:18px 28px;
      border-radius:50px;
      font-family:inherit;cursor:pointer;
      box-shadow:0 12px 48px rgba(128,82,255,.55),0 2px 8px rgba(0,0,0,.15);
      white-space:nowrap;
      display:inline-flex;align-items:center;gap:12px;
      overflow:hidden;
      max-width:90vw;
    `;

    // Shine effect
    const shine = document.createElement("div");
    shine.style.cssText = "position:absolute;top:0;left:-100%;width:60%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.2),transparent);animation:lgShine 2s ease 0.5s";
    toast.appendChild(shine);

    const emojiEl = document.createElement("span");
    emojiEl.style.cssText = "font-size:20px;flex-shrink:0;position:relative";
    emojiEl.textContent = timeEmoji;

    const textEl = document.createElement("span");
    textEl.style.cssText = "font-size:14px;font-weight:700;letter-spacing:-0.2px;position:relative;white-space:normal;max-width:320px;line-height:1.3";
    textEl.textContent = msg;

    toast.appendChild(emojiEl);
    toast.appendChild(textEl);

    const dismiss = ()=>{
      toast.classList.add("hiding");
      setTimeout(()=>{ toast.remove(); style.remove(); },300);
    };

    toast.onclick = dismiss;
    document.body.appendChild(toast);
    setTimeout(dismiss, 5000);
  }

  // Show greeting on login + every hour
  React.useEffect(()=>{
    if(!currentUser) return;
    const timer = setTimeout(()=>showGreeting(), 1500);
    const interval = setInterval(()=>showGreeting(), 60*60*1000);
    return ()=>{ clearTimeout(timer); clearInterval(interval); };
  },[currentUser?.username]);

  async function saveSettings() {
    try {
      if(isAdmin && !settingsClinic) {
        setConfirmModal({
          title:"Select a Client First",
          message:"Please select a client from the left sidebar before saving settings.",
          icon:"👈",danger:false,confirmText:"OK",onConfirm:()=>{}
        });
        return;
      }
      if(isAdmin && settingsClinic) {
        // Save ALL settings to this specific client's account
        const scId = settingsClinic.clinic_id || settingsClinic.id;
        await fetch(`${API}/api/admin/clients/${scId}/settings`, {
          method:"PATCH", headers:authHeaders(),
          body:JSON.stringify({
            ai_provider:          appSettings.ai_provider,
            ai_model:             appSettings.ai_model||"",
            timezone:             appSettings.timezone||"Asia/Kuala_Lumpur",
            anthropic_key:        appSettings.anthropic_key||"",
            openai_key:           appSettings.openai_key||"",
            groq_key:             appSettings.groq_key||"",
            bot_enabled:          appSettings.ai_enabled!=="false",
            usd_conversion:       appSettings.usd_conversion===true||appSettings.usd_conversion==="true",
            system_prompt:        appSettings.system_prompt||"",
            hot_keywords:         appSettings.hot_keywords||"",
            warm_keywords:        appSettings.warm_keywords||"",
            cold_keywords:        appSettings.cold_keywords||"",
            followup_enabled:     appSettings.followup_enabled||"true",
            followup_1_enabled:   appSettings.followup_1_enabled||"true",
            followup_2_enabled:   appSettings.followup_2_enabled||"false",
            followup_1_delay:     appSettings.followup_1_delay||"2",
            followup_1_delay_unit:appSettings.followup_1_delay_unit||"hours",
            followup_1_message:   appSettings.followup_1_message||"",
            followup_2_delay:     appSettings.followup_2_delay||"24",
            followup_2_delay_unit:appSettings.followup_2_delay_unit||"hours",
            followup_2_message:   appSettings.followup_2_message||"",
            followup_max:         appSettings.followup_max||"2",
            telegram_token:        appSettings.telegram_token||"",
            telegram_chat_id:      appSettings.telegram_chat_id||"",
            telegram_notify_hot:   appSettings.telegram_notify_hot||"true",
            telegram_notify_warm:  appSettings.telegram_notify_warm||"false",
            telegram_notify_human: appSettings.telegram_notify_human||"true",
            telegram_notify_booking: appSettings.telegram_notify_booking||"true",
          })
        });
      } else if(isAdmin && !settingsClinic) {
        // Admin with no clinic selected — show warning
        showToast("Please select a client from the sidebar first","#ef4444");
        return;
      } else {
        // Client saving their own settings
        await fetch(`${API}/api/settings`,{method:"PATCH",headers:authHeaders(),body:JSON.stringify(appSettings)});
      }
      setSettingsDirtyWithRef(false);
      if(appSettings.session_timeout_mins) {
        sessionStorage.setItem("crm_timeout", String(appSettings.session_timeout_mins));
      }
      // Nice centered success toast
      const toast = document.createElement("div");
      toast.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:99999;background:#fff;border-radius:20px;padding:32px 40px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.2);border:2px solid #86efac;min-width:280px;animation:fadeInScale .2s ease";
      toast.innerHTML = `
        <div style="font-size:44px;margin-bottom:12px">✅</div>
        <div style="font-weight:800;font-size:18px;color:#15803d;margin-bottom:6px">Settings Saved!</div>
        <div style="font-size:13px;color:#6b7280">All changes saved to database</div>
      `;
      const style = document.createElement("style");
      style.textContent = "@keyframes fadeInScale{from{opacity:0;transform:translate(-50%,-50%) scale(.8)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}";
      document.head.appendChild(style);
      document.body.appendChild(toast);
      setTimeout(()=>{ toast.style.transition="opacity .3s"; toast.style.opacity="0"; setTimeout(()=>{ document.body.removeChild(toast); document.head.removeChild(style); },300); }, 2000);
    } catch(e) {
      const toast = document.createElement("div");
      toast.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:99999;background:#fff;border-radius:20px;padding:32px 40px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.2);border:2px solid #fca5a5;min-width:280px";
      toast.innerHTML = `
        <div style="font-size:44px;margin-bottom:12px">❌</div>
        <div style="font-weight:800;font-size:18px;color:#dc2626;margin-bottom:6px">Save Failed</div>
        <div style="font-size:13px;color:#6b7280">Could not save — please try again</div>
      `;
      document.body.appendChild(toast);
      setTimeout(()=>{ document.body.removeChild(toast); }, 3000);
    }
  }

  async function addQA() {
    if(!newQ.trim()||!newA.trim()) return;
    const body = {question:newQ.trim(),answer:newA.trim()};
    if(kbClinic?.clinic_id) body.clinic_id = kbClinic.clinic_id;
    try { await fetch(`${API}/api/knowledge/qa`,{method:"POST",headers:authHeaders(),body:JSON.stringify(body)}); setNewQ(""); setNewA(""); fetchKnowledge(kbClinic?.clinic_id); } catch {}
  }

  async function saveEdit(id) {
    try { await fetch(`${API}/api/knowledge/qa/${id}`,{method:"PATCH",headers:authHeaders(),body:JSON.stringify({question:editQ,answer:editA})}); setEditingId(null); fetchKnowledge(kbClinic?.clinic_id); } catch {}
  }

  async function deleteQA(id) {
    setConfirmModal({title:"Delete Q&A?",message:"This will permanently remove this Q&A pair from the knowledge base.",icon:"🗑️",danger:true,confirmText:"Yes, Delete",
      onConfirm:async()=>{ try { await fetch(`${API}/api/knowledge/qa/${id}`,{method:"DELETE",headers:authHeaders()}); fetchKnowledge(kbClinic?.clinic_id); } catch {} }});
  }

  function parseBotResponse(raw) {
    const lines=raw.trim().split("\n"); let sources=[],text=raw.trim();
    try{const l=lines[lines.length-1].trim();if(l.startsWith('{"sources"')){sources=JSON.parse(l).sources||[];text=lines.slice(0,-1).join("\\n").trim();}}catch{}
    return {text,sources};
  }

  async function sendBotMessage() {
    if(!botInput.trim()||botLoading) return;
    const userMsg={from:"user",text:botInput.trim(),time:ts(),sources:[]};
    setBotConvo(p=>[...p,userMsg]); setBotInput(""); setBotLoading(true);
    try {
      const history=[...botConvo,userMsg].map(m=>({role:m.from==="user"?"user":"assistant",content:m.from==="user"?m.text:m.text+`\n{"sources":[]}`}));
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,messages:history})});
      const data=await res.json();
      const {text,sources}=parseBotResponse(data.content?.[0]?.text||"⚠️ No response");
      setBotConvo(p=>[...p,{from:"bot",text,time:ts(),sources}]);
    } catch { setBotConvo(p=>[...p,{from:"bot",text:"⚠️ Error.",time:ts(),sources:[]}]); }
    setBotLoading(false);
  }

  function highlightQA(qaId) {
    setHighlightedQA(qaId); setTab("kb");
    setTimeout(()=>qaRefs.current[qaId]?.scrollIntoView({behavior:"smooth",block:"center"}),150);
    setTimeout(()=>setHighlightedQA(null),3000);
  }

  function onDragStart(e,id){e.dataTransfer.setData("contactId",id);}
  async function onDrop(e,stage){
    e.preventDefault();setDragOver(null);
    const id=e.dataTransfer.getData("contactId");
    if(!id) return;
    // If dropping on done column -> update pipeline stage
    if(stage==="done") { await setPipelineStage(id,"done"); }
    // Otherwise update lead score
    else { await setManualLead(id,stage); }
  }

  const filtered = contacts.filter(c=>
    (filter==="all"||c.status===filter)&&
    (leadFilter==="all"||c.lead===leadFilter)&&
    (c.name?.toLowerCase().includes(search.toLowerCase())||c.phone?.includes(search))&&
    (!isAdmin||!inboxClinic||String(c.clinicId||c.clinic_id||1)===String(inboxClinic))
  ).filter(c=>{
    if(inboxFilter==="unread") return c.unread>0;
    if(inboxFilter==="manual") return c.hasAgentReply && !c.botActive;
    if(inboxFilter==="hot") return c.lead==="hot";
    return true;
  }).filter(c=>{
    if(!inboxDateFilter) return true;
    return c.lastDate===inboxDateFilter;
  }).sort((a,b)=>{
    const parseDate = (d,t) => {
      if(!d) return 0;
      try {
        let day,mon,yr,hr=0,min=0;
        if(d.includes("-")){
          // YYYY-MM-DD format from DB
          const p=d.split("-");
          yr=parseInt(p[0]);mon=parseInt(p[1])-1;day=parseInt(p[2]);
        } else if(d.includes("/")){
          // dd/mm/yyyy format
          const p=d.split("/");
          if(p[2]&&p[2].length===4){day=parseInt(p[0]);mon=parseInt(p[1])-1;yr=parseInt(p[2]);}
          else{yr=parseInt(p[0]);mon=parseInt(p[1])-1;day=parseInt(p[2]);}
        } else return 0;
        if(t){
          const tp=t.replace(/\s+/g," ").trim();
          const isPM=tp.toUpperCase().includes("PM");
          const isAM=tp.toUpperCase().includes("AM");
          const timePart=tp.replace(/[APap][Mm]/g,"").trim();
          const tc=timePart.split(":");
          hr=parseInt(tc[0])||0;min=parseInt(tc[1])||0;
          if(isPM&&hr!==12)hr+=12;
          if(isAM&&hr===12)hr=0;
        }
        return new Date(yr,mon,day,hr,min).getTime();
      } catch { return 0; }
    };
    return parseDate(b.lastDate,b.lastTime) - parseDate(a.lastDate,a.lastTime);
  });

  const totalUnread = contacts.reduce((s,c)=>s+c.unread,0);
  const hotCount    = contacts.filter(c=>c.lead==="hot"&&(c.pipelineStage||"new")!=="done").length;
  const warmCount   = contacts.filter(c=>c.lead==="warm"&&(c.pipelineStage||"new")!=="done").length;

  const T = dark ? {
    bg:"#0f1117",sidebar:"#1a1d27",nav:"#1a1d27",border:"#2d3048",
    card:"#1e2235",card2:"#252840",input:"#252840",inputBorder:"#3d4165",
    text:"#f1f3f9",textMuted:"#8b92b8",textFaint:"#5a6080",
    msgOut:"#1a3a4a",msgIn:"#1e2235",chatBg:"#0f1117",
    sidebarHover:"#252840",selectedBg:"#2d3048",overlay:"rgba(0,0,0,.75)",
  } : {
    bg:"#f5f6fa",sidebar:"#ffffff",nav:"#ffffff",border:"#e8eaf0",
    card:"#ffffff",card2:"#f5f6fa",input:"#f5f6fa",inputBorder:"#e8eaf0",
    text:"#1a1d2e",textMuted:"#6b7290",textFaint:"#9fa6c0",
    msgOut:"#e3f5e1",msgIn:"#ffffff",chatBg:"#eef0f5",
    sidebarHover:"#f0f1f8",selectedBg:"#eef0f8",overlay:"rgba(0,0,0,.4)",
  };

  function LeadBadge({lead,score,reason,small}) {
    const cfg=LEAD_CFG[lead]||LEAD_CFG.cold;
    return <div title={reason||""} style={{display:"inline-flex",alignItems:"center",gap:3,background:dark?cfg.dark:cfg.bg,border:`1px solid ${cfg.border}`,borderRadius:10,padding:small?"1px 6px":"3px 8px",fontSize:small?9:11,fontWeight:700,color:cfg.color,whiteSpace:"nowrap"}}>{cfg.label}{score>0&&!small&&<span style={{opacity:.7,fontWeight:400}}>· {score}</span>}</div>;
  }

  function SourceBadge({s}) {
    const qa=qaData.find(q=>String(q.id)===String(s.id)); if(!qa) return null;
    const color=s.relevance==="high"?WA_GREEN:"#FFA726";
    return (
      <div onMouseEnter={()=>setHoveredSource(s.id)} onMouseLeave={()=>setHoveredSource(null)} onClick={()=>highlightQA(s.id)}
        style={{position:"relative",display:"inline-flex",alignItems:"center",gap:4,background:dark?"#1a2e23":"#dcfce7",border:`1px solid ${color}40`,borderRadius:12,padding:"2px 8px",cursor:"pointer",marginRight:4,marginTop:4}}>
        <span style={{width:6,height:6,borderRadius:"50%",background:color,display:"inline-block"}}/>
        <span style={{fontSize:10,color,fontWeight:600}}>{qa.question.slice(0,28)}{qa.question.length>28?"…":""}</span>
        {hoveredSource===s.id&&<div style={{position:"absolute",bottom:"calc(100% + 6px)",left:0,zIndex:99,background:T.card,border:`1px solid ${T.border}`,borderRadius:10,padding:10,width:260,boxShadow:"0 4px 20px rgba(0,0,0,.15)"}}>
          <div style={{fontSize:11,color:WA_GREEN,fontWeight:700,marginBottom:4}}>📌 {qa.question}</div>
          <div style={{fontSize:11,color:T.textMuted,lineHeight:1.5}}>{qa.answer}</div>
        </div>}
      </div>
    );
  }

  function StatCard({icon,label,value,color,sub,badge}) {
    return <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:"16px 18px",flex:1,minWidth:120}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div style={{fontSize:22,marginBottom:6}}>{icon}</div>
        {badge&&<div style={{background:badge.positive?"#dcfce7":"#fef2f2",color:badge.positive?WA_GREEN:"#ef4444",fontSize:11,fontWeight:700,borderRadius:12,padding:"2px 8px"}}>{badge.positive?"+":""}{badge.value}%</div>}
      </div>
      <div style={{fontSize:28,fontWeight:800,color:color||T.text,lineHeight:1}}>{value??"-"}</div>
      <div style={{fontSize:12,fontWeight:600,color:T.text,marginTop:4}}>{label}</div>
      {sub&&<div style={{fontSize:11,color:T.textFaint,marginTop:2}}>{sub}</div>}
    </div>;
  }

  function SettingInput({label,hint,settingKey,type="text",rows}) {
    return <div style={{marginBottom:14}}>
      <div style={{fontWeight:600,fontSize:12,color:T.text,marginBottom:3}}>{label}</div>
      {hint&&<div style={{fontSize:11,color:T.textFaint,marginBottom:5}}>{hint}</div>}
      {rows?<textarea value={appSettings[settingKey]||""} rows={rows} onChange={e=>{setAppSettings(p=>({...p,[settingKey]:e.target.value}));setSettingsDirtyWithRef(true);}} style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:12,fontFamily:"inherit"}}/>
      :<input type={type} value={appSettings[settingKey]||""} onChange={e=>{setAppSettings(p=>({...p,[settingKey]:e.target.value}));setSettingsDirtyWithRef(true);}} style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:12}}/>}
    </div>;
  }

  const navStyle = {height:60,background:T.nav,borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",padding:"0 20px",gap:4,flexShrink:0,boxShadow:"0 1px 8px rgba(0,0,0,.06)"};

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:T.bg,fontFamily:"'Inter','Segoe UI',system-ui,sans-serif",color:T.text,overflow:"hidden"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        @import url('https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.44.0/tabler-icons.min.css');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-thumb{background:${T.border};border-radius:8px}::-webkit-scrollbar-track{background:transparent}
        textarea:focus,input:focus,select:focus{outline:none;border-color:${WA_GREEN}!important;box-shadow:0 0 0 3px ${WA_GREEN}15}
        input,textarea,select{transition:border-color .15s,box-shadow .15s}
        textarea{resize:none}
        button{transition:all .15s;cursor:pointer}

        .ci{transition:background .15s;cursor:pointer;position:relative}
        .ci:hover{background:${T.sidebarHover}}
        .ci.active{background:${WA_GREEN}10;border-right:2px solid ${WA_GREEN}}

        .nav-item-btn{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:10px;border:none;cursor:pointer;font-family:inherit;width:100%;text-align:left;font-size:13px;transition:all .15s;background:transparent;font-weight:400}
        .nav-item-btn:hover{background:${T.sidebarHover};color:${T.text}}
        .nav-item-btn.active{background:${WA_GREEN}15;color:${WA_GREEN}!important;font-weight:600}

        .nx-card{background:${T.card};border-radius:12px;border:1px solid ${T.border};padding:20px;margin-bottom:16px}
        .nx-card-title{font-size:13px;font-weight:700;color:${T.text};margin-bottom:14px;display:flex;align-items:center;gap:8px}

        .nx-btn{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:8px;border:1px solid ${T.border};background:${T.card};color:${T.text};font-size:12px;font-weight:500;cursor:pointer;font-family:inherit;transition:all .15s;white-space:nowrap}
        .nx-btn:hover{background:${T.card2}}
        .nx-btn.primary{background:${WA_GREEN};color:#fff;border-color:${WA_GREEN}}
        .nx-btn.primary:hover{background:#1db954;border-color:#1db954}
        .nx-btn.danger{color:#ef4444;border-color:#ef444440}
        .nx-btn.danger:hover{background:#fef2f2}

        .nx-input{width:100%;padding:9px 12px;border-radius:8px;border:1px solid ${T.border};background:${T.input};color:${T.text};font-size:12px;font-family:inherit;outline:none;transition:all .15s}
        .nx-input:focus{border-color:${WA_GREEN};background:${T.card};box-shadow:0 0 0 3px ${WA_GREEN}12}
        .nx-label{display:block;font-size:12px;font-weight:600;color:${T.text};margin-bottom:6px}
        .nx-hint{font-size:10px;color:${T.textMuted};margin-top:4px}

        .nx-table{width:100%;border-collapse:collapse;font-size:12px}
        .nx-table th{text-align:left;padding:10px 14px;background:${T.card2};color:${T.textMuted};font-weight:600;font-size:11px;border-bottom:1px solid ${T.border};white-space:nowrap}
        .nx-table td{padding:10px 14px;border-bottom:1px solid ${T.border};color:${T.text};vertical-align:middle}
        .nx-table tr:hover td{background:${T.card2}}

        .nx-badge{display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:600;padding:2px 8px;border-radius:20px}
        .nx-badge.hot{background:#fef2f2;color:#dc2626}
        .nx-badge.warm{background:#fffbeb;color:#b45309}
        .nx-badge.cold{background:#eff6ff;color:#1d4ed8}
        .nx-badge.success{background:#f0fdf4;color:#15803d}
        .nx-badge.pending{background:#fffbeb;color:#b45309}
        .nx-badge.failed{background:#fef2f2;color:#dc2626}

        .nx-stat{background:${T.card};border-radius:12px;border:1px solid ${T.border};padding:16px}
        .nx-stat-label{font-size:11px;color:${T.textMuted};font-weight:500;margin-bottom:6px}
        .nx-stat-val{font-size:24px;font-weight:800;color:${T.text};line-height:1}

        .nx-page-header{background:${T.card};border-bottom:1px solid ${T.border};padding:14px 24px;display:flex;align-items:center;gap:12px;flex-shrink:0}
        .nx-page-title{font-size:15px;font-weight:700;color:${T.text}}
        .nx-page-sub{font-size:11px;color:${T.textMuted};margin-top:1px}

        .nx-filter{font-size:11px;padding:4px 12px;border-radius:20px;border:1px solid ${T.border};background:transparent;color:${T.textMuted};cursor:pointer;white-space:nowrap;font-weight:500;font-family:inherit;transition:all .15s}
        .nx-filter:hover{border-color:${WA_GREEN};color:${WA_GREEN}}
        .nx-filter.active{background:${WA_GREEN};color:#fff;border-color:${WA_GREEN}}

        .nx-search{display:flex;align-items:center;gap:6px;background:${T.card2};border-radius:8px;padding:7px 10px;border:1px solid ${T.border};transition:all .15s}
        .nx-search:focus-within{border-color:${WA_GREEN};background:${T.card}}
        .nx-search input{border:none;background:transparent;font-size:12px;color:${T.text};width:100%;outline:none;font-family:inherit}

        .nx-toggle{width:34px;height:19px;border-radius:10px;position:relative;cursor:pointer;transition:background .2s;flex-shrink:0}
        .nx-toggle.on{background:${WA_GREEN}}
        .nx-toggle.off{background:${T.border}}
        .nx-toggle-dot{width:15px;height:15px;background:#fff;border-radius:50%;position:absolute;top:2px;transition:left .2s;box-shadow:0 1px 3px rgba(0,0,0,.2)}
        .nx-toggle.on .nx-toggle-dot{left:17px}
        .nx-toggle.off .nx-toggle-dot{left:2px}

        .mb{animation:fadeUp .2s ease}@keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        .sb:active{transform:scale(.92)}
        .qa-row.hl{background:#dcfce720!important;border-color:${WA_GREEN}!important}
        input::placeholder,textarea::placeholder{color:${T.textFaint}}
        @keyframes bounce{0%,80%,100%{transform:scale(0)}40%{transform:scale(1)}}
        .kc{border-radius:12px;min-height:200px;transition:background .15s}.kc.over{background:${dark?"#1a2e23":"#e8fdf0"}!important}
        .kcard{cursor:grab;transition:transform .15s,box-shadow .15s}.kcard:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.12)}.kcard:active{cursor:grabbing}
        .cc{background:${T.card};border:1px solid ${T.border};border-radius:12px;padding:20px;margin-bottom:16px}
        @media(min-width:640px){.hide-desktop{display:none!important}}
        .nav-item-wrap:hover .nav-tooltip{opacity:0!important;visibility:hidden!important}
        .nav-tooltip{display:none}
        .nav-tooltip::after{content:"";position:absolute;right:100%;top:50%;transform:translateY(-50%);border:5px solid transparent;border-right-color:#111827}
        @keyframes pulse{0%{transform:scale(1);opacity:.8}70%{transform:scale(2.2);opacity:0}100%{transform:scale(1);opacity:0}}
        @media(max-width:1023px){.tablet-stack{flex-direction:column!important}}
      `}</style>


            {/* EXPORT CSV MODAL */}
      {/* TEMPLATE FORM — Simple inline */}

      {/* ARCHIVED CONTACTS MODAL */}      {/* ARCHIVED CONTACTS MODAL */}

      {/* ARCHIVED CONTACTS MODAL */}
      {showArchived&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:20,backdropFilter:"blur(6px)"}}>
        <div style={{background:T.card,borderRadius:20,width:"100%",maxWidth:480,maxHeight:"80vh",display:"flex",flexDirection:"column",boxShadow:"0 24px 60px rgba(0,0,0,.4)"}}>
          {/* Header */}
          <div style={{padding:"18px 20px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div>
              <div style={{fontWeight:800,fontSize:16,color:T.text}}>📦 Archived Contacts</div>
              <div style={{fontSize:12,color:T.textMuted,marginTop:2}}>{archivedContacts.length} archived contact{archivedContacts.length!==1?"s":""}</div>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              {archivedContacts.length>0&&<button onClick={async()=>{
                setConfirmModal({title:`Restore ${archivedContacts.length} contacts?`,message:"All archived contacts will be moved back to your inbox.",icon:"📥",danger:false,confirmText:"Yes, Restore All",
                  onConfirm:async()=>{for(const c of archivedContacts){
                  await fetch(`${API}/api/conversations/${c.id}/archive`,{method:"PATCH",headers:authHeaders(),body:JSON.stringify({archived:false})});
                }setArchivedContacts([]);fetchConversations();}});
              }} style={{padding:"6px 12px",borderRadius:8,border:`1px solid ${WA_GREEN}`,background:`${WA_GREEN}10`,color:WA_GREEN,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                ↩️ Restore All
              </button>}
              <button onClick={()=>setShowArchived(false)} style={{border:"none",background:"none",cursor:"pointer",fontSize:20,color:T.textMuted}}>✕</button>
            </div>
          </div>
          {/* List */}
          <div style={{flex:1,overflowY:"auto"}}>
            {archivedContacts.length===0&&<div style={{padding:40,textAlign:"center",color:T.textFaint}}>
              <div style={{fontSize:40,marginBottom:8}}>📭</div>
              <div style={{fontSize:14,fontWeight:600}}>No archived contacts</div>
            </div>}
            {archivedContacts.map(c=>(
              <div key={c.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 20px",borderBottom:`1px solid ${T.border}`,
                transition:"background .15s"}}>
                <div style={{width:40,height:40,borderRadius:"50%",background:getColor(c.name||"?"),display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:14,color:"#fff",flexShrink:0}}>{c.avatar||"?"}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:13,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.name||c.phone}</div>
                  <div style={{fontSize:11,color:T.textMuted}}>{c.phone}</div>
                  {c.archived_by&&<div style={{fontSize:10,color:T.textFaint,marginTop:1}}>Archived by {c.archived_by} {c.archived_at?`· ${new Date(c.archived_at).toLocaleDateString("en-MY")}`:""}</div>}
                </div>
                <button onClick={async()=>{
                  await fetch(`${API}/api/conversations/${c.id}/archive`,{method:"PATCH",headers:authHeaders(),body:JSON.stringify({archived:false})});
                  setArchivedContacts(p=>p.filter(x=>x.id!==c.id));
                  fetchConversations();
                }} style={{padding:"6px 12px",borderRadius:8,border:`1px solid ${WA_GREEN}`,background:"transparent",color:WA_GREEN,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>
                  ↩️ Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>}

      {exportModal&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:20,backdropFilter:"blur(6px)"}}>
        <div style={{background:T.card,borderRadius:20,padding:28,width:"100%",maxWidth:480,boxShadow:"0 24px 60px rgba(0,0,0,.4)"}}>
          <div style={{fontWeight:800,fontSize:18,marginBottom:4,color:T.text}}>📥 Download Chats</div>
          <div style={{fontSize:12,color:T.textMuted,marginBottom:20}}>Filter by keywords and date, or download all chats.</div>

          {/* Keywords */}
          <div style={{marginBottom:16}}>
            <div style={{fontWeight:600,fontSize:12,color:T.text,marginBottom:6}}>Keywords <span style={{color:T.textFaint,fontWeight:400}}>(optional)</span></div>
            <div style={{fontSize:11,color:T.textFaint,marginBottom:6}}>Enter keywords separated by commas — only chats containing these words will be exported.</div>
            <textarea value={exportKeywords} onChange={e=>setExportKeywords(e.target.value)}
              placeholder="e.g. diabetes, kidney, stem cell, EECP, NAD, exosome"
              rows={3} style={{width:"100%",background:T.input,border:`1.5px solid ${T.border}`,borderRadius:10,
                padding:"10px 12px",color:T.text,fontSize:12,fontFamily:"inherit",resize:"vertical",boxSizing:"border-box"}}/>
            {/* Preset keyword chips */}
            <div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:6}}>
              {["Chronic Kidney Disease","Diabetes","Liver Detox","Stem Cells","Vitamin","NAD","Exosome","EECP"].map(kw=>(
                <span key={kw} onClick={()=>setExportKeywords(p=>p?p+", "+kw:kw)}
                  style={{fontSize:10,padding:"3px 8px",borderRadius:20,background:T.card2,
                    border:`1px solid ${T.border}`,cursor:"pointer",color:T.text,fontWeight:500}}>
                  + {kw}
                </span>
              ))}
            </div>
          </div>

          {/* Date range */}
          <div style={{marginBottom:20}}>
            <div style={{fontWeight:600,fontSize:12,color:T.text,marginBottom:6}}>Date Range <span style={{color:T.textFaint,fontWeight:400}}>(optional)</span></div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <input type="date" value={exportDateFrom} onChange={e=>setExportDateFrom(e.target.value)}
                style={{flex:1,background:T.input,border:`1.5px solid ${T.border}`,borderRadius:8,padding:"7px 10px",color:T.text,fontSize:12,fontFamily:"inherit"}}/>
              <span style={{color:T.textFaint,fontSize:12}}>to</span>
              <input type="date" value={exportDateTo} onChange={e=>setExportDateTo(e.target.value)}
                style={{flex:1,background:T.input,border:`1.5px solid ${T.border}`,borderRadius:8,padding:"7px 10px",color:T.text,fontSize:12,fontFamily:"inherit"}}/>
            </div>
          </div>

          {/* Buttons */}
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>{setExportModal(false);setExportKeywords("");setExportDateFrom("");setExportDateTo("");}}
              style={{flex:1,padding:"10px",borderRadius:10,border:`1px solid ${T.border}`,
                background:T.card2,color:T.textMuted,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
              Cancel
            </button>
            <button onClick={async()=>{
              setExportLoading(true);
              // Build filtered CSV from contacts
              const keywords = exportKeywords.split(",").map(k=>k.trim().toLowerCase()).filter(k=>k);
              const allContacts = contacts;
              
              // Filter by date
              let filtered = allContacts;
              if(exportDateFrom) filtered = filtered.filter(c=>c.lastDate>=exportDateFrom);
              if(exportDateTo) filtered = filtered.filter(c=>c.lastDate<=exportDateTo);
              
              // Filter by keywords and find matching keywords per contact
              const rows = [];
              for(const c of filtered){
                const allText = (c.messages||[]).map(m=>m.text||"").join(" ").toLowerCase();
                const matched = keywords.length===0 ? [] : keywords.filter(kw=>allText.includes(kw));
                if(keywords.length>0 && matched.length===0) continue;
                
                // Build full chat in one cell
                const chat = (c.messages||[]).map(m=>{
                  const speaker = m.from==="user"?c.name:m.from==="bot"?"Bot":m.agentName||"Agent";
                  return `[${m.time||""}] ${speaker}: ${(m.text||"").replace(/"/g,'""').replace(/[\r\n]+/g," ")}`;
                }).join(" | ");
                
                rows.push([
                  `"${(c.name||"").replace(/"/g,'""')}"`,
                  `"${c.phone||""}"`,
                  `"${chat}"`,
                  `"${matched.join(", ")||"all"}"`,
                  `"${c.lastDate||""}"`,
                  `"${c.lead||""}"`,
                ]);
              }
              
              const header = ["Name","Phone","Full Conversation","Keywords Matched","Last Date","Lead Score"];
              const csv = [header.join(","), ...rows.map(r=>r.join(","))].join("\\n");
              const blob = new Blob([csv], {type:"text/csv"});
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `chats_export_${new Date().toISOString().slice(0,10)}.csv`;
              a.click();
              URL.revokeObjectURL(url);
              setExportLoading(false);
              setExportModal(false);
              setExportKeywords("");setExportDateFrom("");setExportDateTo("");
            }} style={{flex:2,padding:"10px",borderRadius:10,border:"none",
              background:WA_GREEN,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",
              display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
              {exportLoading?"Preparing...":"📥 Download CSV"}
            </button>
          </div>
        </div>
      </div>}

      {/* CONTACT PICKER MODAL */}
      {showContactPicker&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:20,backdropFilter:"blur(6px)"}}>
        <div style={{background:T.card,borderRadius:20,width:"100%",maxWidth:480,maxHeight:"80vh",display:"flex",flexDirection:"column",boxShadow:"0 24px 60px rgba(0,0,0,.4)"}}>
          {/* Header */}
          <div style={{padding:"18px 20px 12px",borderBottom:`1px solid ${T.border}`}}>
            <div style={{fontWeight:800,fontSize:16,marginBottom:10,color:T.text}}>👥 Pick Contacts</div>
            <input value={contactPickerSearch} onChange={e=>setContactPickerSearch(e.target.value)}
              placeholder="Search by name or phone..."
              autoFocus
              style={{width:"100%",background:T.input,border:`1px solid ${T.border}`,borderRadius:10,padding:"8px 12px",color:T.text,fontSize:13,fontFamily:"inherit",boxSizing:"border-box"}}/>
          </div>
          {/* Contact list */}
          <div style={{flex:1,overflowY:"auto",padding:"8px 0"}}>
            {contacts.filter(c=>{
              // Filter by selected clinic for admin
              const cClinicId = c.clinicId||c.clinic_id; const bClinicId = broadcastClinic?.clinic_id||broadcastClinic?.id;
              if(isAdmin && broadcastClinic && cClinicId && bClinicId && cClinicId !== bClinicId) return false;
              if(!contactPickerSearch) return true;
              const s = contactPickerSearch.toLowerCase();
              return c.name?.toLowerCase().includes(s)||c.phone?.includes(s);
            }).map(c=>(
              <div key={c.id} onClick={()=>setPickedContacts(p=>{
                const n = new Set(p);
                if(n.has(c.id)) n.delete(c.id); else n.add(c.id);
                return n;
              })} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 20px",cursor:"pointer",
                background:pickedContacts.has(c.id)?`${WA_GREEN}10`:"transparent",
                borderLeft:pickedContacts.has(c.id)?`3px solid ${WA_GREEN}`:"3px solid transparent"}}>
                <div style={{width:20,height:20,borderRadius:6,border:`2px solid ${pickedContacts.has(c.id)?WA_GREEN:T.border}`,
                  background:pickedContacts.has(c.id)?WA_GREEN:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  {pickedContacts.has(c.id)&&<span style={{color:"#fff",fontSize:12,fontWeight:700}}>✓</span>}
                </div>
                <div style={{width:32,height:32,borderRadius:"50%",background:WA_GREEN,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:12,fontWeight:700,flexShrink:0}}>
                  {(c.name||"?")[0].toUpperCase()}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:13,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.name||c.phone}</div>
                  <div style={{fontSize:11,color:T.textMuted}}>{c.phone}</div>
                </div>
                {c.lead&&<span style={{fontSize:10,padding:"2px 6px",borderRadius:20,background:c.lead==="hot"?"#fef2f2":c.lead==="warm"?"#fffbeb":"#eff6ff",color:c.lead==="hot"?"#ef4444":c.lead==="warm"?"#f59e0b":"#3b82f6",fontWeight:600}}>{c.lead}</span>}
              </div>
            ))}
          </div>
          {/* Footer */}
          <div style={{padding:"12px 20px",borderTop:`1px solid ${T.border}`,display:"flex",gap:8,alignItems:"center"}}>
            <span style={{fontSize:12,color:T.textMuted,flex:1}}>{pickedContacts.size} selected</span>
            <button onClick={()=>setShowContactPicker(false)}
              style={{padding:"8px 16px",borderRadius:8,border:`1px solid ${T.border}`,background:T.card2,color:T.textMuted,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
              Cancel
            </button>
            <button onClick={()=>{
              const selected = contacts.filter(c=>pickedContacts.has(c.id)).map(c=>({phone:c.phone,name:c.name}));
              setBroadcastContacts(p=>{
                const existing = new Set(p.map(x=>x.phone));
                const newOnes = selected.filter(s=>!existing.has(s.phone));
                return [...p,...newOnes];
              });
              setShowContactPicker(false);
            }} style={{padding:"8px 20px",borderRadius:8,border:"none",background:WA_GREEN,color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
              Add {pickedContacts.size} Contact{pickedContacts.size!==1?"s":""}
            </button>
          </div>
        </div>
      </div>}

      {/* BULK BOT ON PROGRESS MODAL */}
      {bulkBotModal&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:20,backdropFilter:"blur(6px)"}}>
        <div style={{background:T.card,borderRadius:24,padding:36,width:"100%",maxWidth:340,boxShadow:"0 24px 60px rgba(0,0,0,.4)",textAlign:"center"}}>
          {/* Countdown circle */}
          <div style={{position:"relative",width:120,height:120,margin:"0 auto 20px"}}>
            <svg width="120" height="120" style={{transform:"rotate(-90deg)"}}>
              <circle cx="60" cy="60" r="50" fill="none" stroke={T.border} strokeWidth="10"/>
              <circle cx="60" cy="60" r="50" fill="none" stroke={WA_GREEN} strokeWidth="10"
                strokeDasharray={`${2*Math.PI*50}`}
                strokeDashoffset={`${2*Math.PI*50*(1-(bulkBotModal.done/bulkBotModal.total))}`}
                strokeLinecap="round"
                style={{transition:"stroke-dashoffset .4s ease"}}/>
            </svg>
            <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column"}}>
              <div style={{fontSize:32,fontWeight:900,color:WA_GREEN,lineHeight:1}}>{bulkBotModal.total - bulkBotModal.done}</div>
              <div style={{fontSize:11,color:T.textMuted}}>remaining</div>
            </div>
          </div>
          <div style={{fontSize:22,marginBottom:8}}>🤖</div>
          <div style={{fontWeight:800,fontSize:18,marginBottom:6,color:T.text}}>Turning Bots ON...</div>
          <div style={{fontSize:13,color:T.textMuted,marginBottom:16}}>
            <strong style={{color:WA_GREEN}}>{bulkBotModal.done}</strong> of <strong>{bulkBotModal.total}</strong> done
          </div>
          {/* Progress bar */}
          <div style={{height:6,borderRadius:3,background:T.border,overflow:"hidden"}}>
            <div style={{height:6,borderRadius:3,background:WA_GREEN,
              width:`${(bulkBotModal.done/bulkBotModal.total)*100}%`,
              transition:"width .4s ease"}}/>
          </div>
          <div style={{fontSize:11,color:T.textFaint,marginTop:8}}>Please wait...</div>
        </div>
      </div>}

      {/* ARCHIVE CONFIRM MODAL */}
      {archiveConfirm&&<div style={{position:"fixed",inset:0,background:T.overlay,zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
        <div style={{background:T.card,borderRadius:16,padding:24,width:"100%",maxWidth:340,boxShadow:"0 8px 32px rgba(0,0,0,.2)"}}>
          <div style={{fontSize:20,marginBottom:8}}>📦 Archive Contact</div>
          <div style={{fontSize:13,color:T.textMuted,marginBottom:20,lineHeight:1.6}}>
            Archive <strong>{contacts.find(c=>c.id===archiveConfirm)?.name}</strong>? They'll be hidden from CRM but all data stays safe in the database.
          </div>
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>setArchiveConfirm(null)} style={{flex:1,padding:"10px",borderRadius:12,border:`1px solid ${T.border}`,background:T.card2,color:T.textMuted,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
            <button onClick={()=>archiveContact(archiveConfirm)} style={{flex:1,padding:"10px",borderRadius:12,border:"none",background:"#f59e0b",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Archive</button>
          </div>
        </div>
      </div>}

      {/* NAV */}
      {/* Mobile hamburger only — desktop has no top bar like mockup */}
      <div className="hide-desktop" style={{height:56,background:T.nav,borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",padding:"0 14px",gap:10,flexShrink:0}}>
        <button className="tb" onClick={()=>setMenuOpen(m=>!m)}
          style={{width:38,height:38,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:4,padding:8,flexShrink:0}}>
          {[0,1,2].map(i=><div key={i} style={{width:18,height:2,background:menuOpen?WA_GREEN:T.textMuted,borderRadius:2,transition:"all .2s",transform:menuOpen?(i===0?"rotate(45deg) translate(4px,4px)":i===2?"rotate(-45deg) translate(4px,-4px)":"scaleX(0)"):"none"}}/>)}
        </button>
        <div style={{display:"flex",alignItems:"center",gap:8,flex:1}}>
          <div style={{width:26,height:26,borderRadius:7,background:WA_GREEN,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13}}>💬</div>
          <span style={{fontWeight:700,fontSize:14,color:T.text}}>{currentUser?.company_name||"Nexora"}</span>
        </div>
        <button onClick={()=>setDark(d=>!d)} style={{padding:"4px 8px",borderRadius:18,border:`1px solid ${T.border}`,background:T.card2,color:T.textMuted,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>{dark?"☀️":"🌙"}</button>
      </div>

      {/* HAMBURGER SIDEBAR OVERLAY */}
      {menuOpen&&<>
        <div onClick={()=>setMenuOpen(false)} style={{position:"fixed",inset:0,background:T.overlay,zIndex:90}}/>
        <div style={{position:"fixed",top:56,left:0,bottom:0,width:260,background:T.sidebar,borderRight:`1px solid ${T.border}`,zIndex:91,display:"flex",flexDirection:"column",padding:12,gap:4,boxShadow:"4px 0 20px rgba(0,0,0,.15)"}}>
          <div style={{fontSize:11,color:T.textFaint,fontWeight:700,padding:"4px 8px",marginBottom:4,textTransform:"uppercase",letterSpacing:.5}}>Navigation</div>
          {TABS.filter(t=>canSee(t.id)).map(t=>(
            <button key={t.id} onClick={()=>{safeSetTab(t.id);setMenuOpen(false);}}
              style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,border:"none",cursor:"pointer",fontFamily:"inherit",
                background:tab===t.id?`${WA_GREEN}15`:T.sidebar,
                color:tab===t.id?WA_GREEN:T.text,fontWeight:tab===t.id?700:400,fontSize:14,textAlign:"left"}}>
              <i className={t.icon} style={{fontSize:18}}/>
              <span style={{flex:1}}>{t.label}</span>
              {t.id==="crm"&&totalUnread>0&&<span style={{background:WA_GREEN,color:"#fff",borderRadius:10,padding:"1px 6px",fontSize:11,fontWeight:700}}>{totalUnread}</span>}
              {t.id==="leads"&&(hotCount+warmCount)>0&&<span style={{background:"#ef4444",color:"#fff",borderRadius:10,padding:"1px 6px",fontSize:11,fontWeight:700}}>{hotCount+warmCount}</span>}
            </button>
          ))}

        </div>
      </>}

      <div style={{flex:1,display:"flex",overflow:"hidden",position:"relative",background:T.bg}}>

        {/* ══ PERMANENT LEFT SIDEBAR (desktop) ══ */}

        <div className="hide-mobile nav-sidebar" style={{width:200,flexShrink:0,background:T.sidebar,borderRight:`1px solid ${T.border}`,display:"flex",flexDirection:"column",overflowY:"auto",overflowX:"hidden",position:"relative"}}>
          {/* Brand — top of sidebar like mockup */}
          <div style={{padding:"16px 14px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
            <div style={{width:32,height:32,borderRadius:8,background:WA_GREEN,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,color:"#fff",flexShrink:0}}>
              {currentUser?.logo_url?<img src={currentUser.logo_url} style={{width:"100%",height:"100%",objectFit:"cover",borderRadius:8}} alt="logo"/>:"N"}
            </div>
            <span style={{fontWeight:700,fontSize:14,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{currentUser?.company_name||"Nexora"}</span>
          </div>
          {/* Nav items */}
          <div style={{flex:1,padding:"8px",display:"flex",flexDirection:"column",gap:2,overflowY:"auto"}}>
            {(()=>{
              const visibleTabs = TABS.filter(t=>!t.adminOnly||isAdmin).filter(t=>canSee(t.id));
              return visibleTabs.map(t=>(
                <div key={t.id} style={{position:"relative"}} className="nav-item-wrap">
                  <button onClick={()=>safeSetTab(t.id)}
                    className={`nav-item-btn${tab===t.id?" active":""}`}>
                    <i className={t.icon} style={{fontSize:18,flexShrink:0,width:20,textAlign:"center"}}/>
                    <span style={{flex:1}}>{t.label}</span>
                    {t.id==="crm"&&totalUnread>0&&<span style={{
                      background:WA_GREEN,color:"#fff",borderRadius:10,
                      minWidth:18,height:18,display:"flex",alignItems:"center",justifyContent:"center",
                      fontSize:10,fontWeight:700,padding:"0 4px",lineHeight:1
                    }}>{totalUnread>99?"99+":totalUnread}</span>}
                    {t.id==="leads"&&(hotCount+warmCount)>0&&<span style={{
                      background:"#ef4444",color:"#fff",borderRadius:10,
                      minWidth:18,height:18,display:"flex",alignItems:"center",justifyContent:"center",
                      fontSize:10,fontWeight:700,padding:"0 4px",lineHeight:1
                    }}>{(hotCount+warmCount)>99?"99+":(hotCount+warmCount)}</span>}
                  </button>
                  <div className="nav-tooltip">
                    {t.label}{t.id==="crm"&&totalUnread>0?` · ${totalUnread} unread`:""}
                  </div>
                </div>
              ));
            })()}
          </div>

          {/* User profile bottom — clean with 3 dots menu */}
          <div style={{padding:"10px",borderTop:`1px solid ${T.border}`,flexShrink:0,position:"relative"}}>
            {/* 3-dot popup menu */}
            {showUserMenu&&<>
              <div onClick={()=>setShowUserMenu(false)} style={{position:"fixed",inset:0,zIndex:199}}/>
              <div style={{position:"absolute",bottom:"100%",left:10,right:10,marginBottom:4,background:T.card,border:`1px solid ${T.border}`,borderRadius:12,boxShadow:"0 8px 24px rgba(0,0,0,.15)",zIndex:200,overflow:"hidden"}}>
                {/* Dark mode toggle */}
                <button onClick={()=>setDark(d=>!d)}
                  style={{width:"100%",padding:"10px 14px",display:"flex",alignItems:"center",gap:10,border:"none",background:"transparent",cursor:"pointer",fontFamily:"inherit",color:T.text,fontSize:13,textAlign:"left",borderBottom:`1px solid ${T.border}`}}>
                  <span style={{fontSize:16}}>{dark?"☀️":"🌙"}</span>
                  <span>{dark?"Light mode":"Dark mode"}</span>
                </button>
                {/* What's new */}
                <button onClick={()=>{setShowChangelog(c=>!c);setShowUserMenu(false);if(hasUnread)setChangelogSeen(latestVersion);}}
                  style={{width:"100%",padding:"10px 14px",display:"flex",alignItems:"center",gap:10,border:"none",background:"transparent",cursor:"pointer",fontFamily:"inherit",color:T.text,fontSize:13,textAlign:"left",borderBottom:`1px solid ${T.border}`,position:"relative"}}>
                  <span style={{fontSize:16}}>🔔</span>
                  <span>What's new</span>
                  {hasUnread&&<span style={{marginLeft:"auto",background:"#ef4444",color:"#fff",borderRadius:10,fontSize:10,fontWeight:700,padding:"1px 6px"}}>NEW</span>}
                </button>
                {/* Version */}
                <div style={{padding:"8px 14px",fontSize:11,color:T.textFaint,borderBottom:`1px solid ${T.border}`}}>
                  v{CRM_VERSION}
                </div>
                {/* Logout */}
                <button onClick={()=>{setShowUserMenu(false);setConfirmModal({title:"Log Out?",message:"Log out of Nexora CRM?",icon:"🔐",danger:false,confirmText:"Yes, Log Out",onConfirm:()=>doLogout()});}}
                  style={{width:"100%",padding:"10px 14px",display:"flex",alignItems:"center",gap:10,border:"none",background:"transparent",cursor:"pointer",fontFamily:"inherit",color:"#ef4444",fontSize:13,textAlign:"left"}}>
                  <i className="ti ti-logout" style={{fontSize:16}}/>
                  <span>Log out</span>
                </button>
              </div>
            </>}

            {/* Changelog panel */}
            {showChangelog&&<div style={{position:"absolute",bottom:"100%",left:10,right:10,marginBottom:4,background:T.card,border:`1px solid ${T.border}`,borderRadius:12,boxShadow:"0 8px 32px rgba(0,0,0,.15)",zIndex:200,overflow:"hidden"}}>
              <div style={{padding:"12px 14px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <span style={{fontWeight:700,fontSize:13}}>🔔 What's New</span>
                <button onClick={()=>setShowChangelog(false)} style={{border:"none",background:"none",cursor:"pointer",fontSize:14,color:T.textMuted}}>✕</button>
              </div>
              <div style={{maxHeight:260,overflowY:"auto"}}>
                {CHANGELOG.map((c,i)=><div key={c.version} style={{padding:"10px 14px",borderBottom:i<CHANGELOG.length-1?`1px solid ${T.border}`:"none"}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                    <span style={{background:c.color,color:"#fff",fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:6}}>{c.tag}</span>
                    <span style={{fontWeight:700,fontSize:12}}>v{c.version}</span>
                    <span style={{fontSize:10,color:T.textMuted,marginLeft:"auto"}}>{c.date}</span>
                    {i===0&&<span style={{background:"#ef4444",color:"#fff",fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:6}}>NEW</span>}
                  </div>
                  {c.items?.map((item,j)=><div key={j} style={{fontSize:11,color:T.textMuted,marginBottom:2}}>· {item}</div>)}
                </div>)}
              </div>
            </div>}

            {/* User row */}
            <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:10,cursor:"pointer",transition:"background .15s"}}
              onMouseEnter={e=>e.currentTarget.style.background=T.sidebarHover}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <div style={{width:30,height:30,borderRadius:"50%",background:WA_GREEN,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:11,fontWeight:700,flexShrink:0}}>
                {(currentUser?.username||"U")[0].toUpperCase()}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,fontWeight:600,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{currentUser?.username||"User"}</div>
                <div style={{display:"flex",alignItems:"center",gap:4,marginTop:1}}>
                  <div style={{width:5,height:5,borderRadius:"50%",background:backendStatus==="online"?WA_GREEN:backendStatus==="checking"?"#f59e0b":"#ef4444",flexShrink:0}}/>
                  <span style={{fontSize:10,color:T.textMuted}}>{backendStatus==="online"?"Live":backendStatus==="checking"?"Connecting…":"Offline"}</span>
                </div>
              </div>
              <button onClick={e=>{e.stopPropagation();setShowUserMenu(m=>!m);setShowChangelog(false);}}
                style={{width:24,height:24,borderRadius:6,border:"none",background:"transparent",color:T.textMuted,fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <i className="ti ti-dots-vertical" style={{fontSize:16}}/>
              </button>
            </div>
          </div>
        </div>

        {/* ══ CRM TAB ══ */}
        {tab==="crm"&&<>
          {/* ══ INBOX SIDEBAR ══ */}
          <div style={{width:isMobile?"100%":isTablet?260:280,background:T.sidebar,borderRight:`1px solid ${T.border}`,display:"flex",flexDirection:"column",flexShrink:0,
            ...(isMobile&&selected?{display:"none"}:{})}}>

            {/* Sidebar Top — matches mockup exactly */}
            <div style={{padding:"14px",borderBottom:`1px solid ${T.border}`}}>
              {/* Title row */}
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                <span style={{fontSize:14,fontWeight:700,color:T.text}}>Inbox</span>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <i className="ti ti-adjustments-horizontal" onClick={()=>setShowInboxStats(p=>!p)} style={{fontSize:16,color:T.textMuted,cursor:"pointer"}}/>
                  <i className="ti ti-edit" onClick={()=>{setSelectMode(p=>!p);setSelectedChats(new Set());}} style={{fontSize:16,color:T.textMuted,cursor:"pointer"}}/>
                </div>
              </div>

              {/* Search — always visible like mockup */}
              <div className="nx-search" style={{marginBottom:8}}>
                <i className="ti ti-search" style={{fontSize:14,color:T.textFaint}}/>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search conversations..."/>
              </div>

              {showInboxStats&&<>
                {/* Admin client selector */}
                {isAdmin&&adminOverview.length>0&&<div style={{marginBottom:8}}>
                  <div style={{background:"#f8f9fc",border:"1px solid #e8eaef",borderRadius:10,overflow:"hidden"}}>
                    {[...new Map(adminOverview.filter(c=>c.company_name).map(c=>[c.clinic_id,c])).values()].map(c=>{
                      const isDisabled = c.active===false||c.active===0||c.active==="false";
                      const isSelected = String(inboxClinic)===String(c.clinic_id);
                      return <div key={c.clinic_id} onClick={()=>setInboxClinic(isSelected?null:String(c.clinic_id))}
                        style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",cursor:"pointer",
                          background:isSelected?"#6c63ff15":"transparent",
                          borderLeft:isSelected?"3px solid #6c63ff":"3px solid transparent",
                          opacity:isDisabled?0.5:1,transition:"all .15s"}}
                        onMouseEnter={e=>{if(!isSelected)e.currentTarget.style.background="#f0f1f8"}}
                        onMouseLeave={e=>{if(!isSelected)e.currentTarget.style.background="transparent"}}>
                        <div style={{width:22,height:22,borderRadius:6,overflow:"hidden",background:"#6c63ff15",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                          {c.logo_url?<img src={c.logo_url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:<span style={{fontSize:11}}>🏢</span>}
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:12,fontWeight:isSelected?700:600,color:isSelected?"#6c63ff":"#0d0f1a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.company_name}</div>
                          {isDisabled&&<div style={{fontSize:9,color:"#e11d48",fontWeight:600}}>Disabled</div>}
                        </div>
                        {isSelected&&<span style={{fontSize:10,color:"#6c63ff",fontWeight:700}}>✓</span>}
                      </div>;
                    })}
                  </div>
                </div>}

                {/* Stats */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5,marginBottom:8}}>
                  {[
                    {v:contacts.length,l:"Total",c:"#0d0f1a"},
                    {v:contacts.filter(c=>c.status==="open").length,l:"Open",c:"#16a34a"},
                    {v:hotCount,l:"🔥",c:"#e11d48"},
                    {v:warmCount,l:"🟡",c:"#d97706"},
                  ].map(s=>(
                    <div key={s.l} style={{background:"#f8f9fc",borderRadius:8,padding:"6px 4px",textAlign:"center",border:"1px solid #e8eaef"}}>
                      <div style={{fontSize:14,fontWeight:800,color:s.c,lineHeight:1}}>{s.v}</div>
                      <div style={{fontSize:9,color:"#9ca3af",marginTop:2}}>{s.l}</div>
                    </div>
                  ))}
                </div>

                {/* Bulk action bar */}
                {selectMode&&selectedChats.size>0&&<div style={{marginBottom:8,padding:"8px",background:T.card2,borderRadius:8,border:`1px solid ${T.border}`}}>
                  <div style={{fontSize:11,color:T.text,fontWeight:600,textAlign:"center",marginBottom:6}}>{selectedChats.size} selected</div>
                  <div style={{display:"flex",gap:4}}>
                    <button onClick={async()=>{
                      const phones=[...selectedChats];
                      for(const phone of phones){
                        const p=phone.startsWith("+")?phone.slice(1):phone;
                        await fetch(`${API}/api/conversations/${p}/read`,{method:"PATCH",headers:authHeaders(),body:JSON.stringify({unread:1})});
                      }
                      setContacts(p=>p.map(c=>selectedChats.has(c.phone)?{...c,unread:1}:c));
                      setSelectedChats(new Set());setSelectMode(false);
                    }} className="nx-btn" style={{flex:1,justifyContent:"center",fontSize:11}}>🔴 Unread</button>
                    <button onClick={async()=>{
                      setConfirmModal({title:`Delete ${selectedChats.size} chat${selectedChats.size>1?"s":""}?`,message:"This permanently deletes the selected conversations.",icon:"🗑️",danger:true,confirmText:"Yes, Delete",
                        onConfirm:async()=>{for(const phone of [...selectedChats]){await fetch(`${API}/api/conversations/${phone.replace("+","")}`,{method:"DELETE",headers:authHeaders()});}
                        setSelectedChats(new Set());setSelectMode(false);fetchConversations();
                        if(selected&&selectedChats.has(selected.phone))setSelected(null);}});
                    }} className="nx-btn danger" style={{flex:1,justifyContent:"center",fontSize:11}}>🗑️ Delete</button>
                  </div>
                </div>}



                {inboxFilter==="manual"&&!showArchived&&<div style={{marginBottom:6}}>
                  <button onClick={()=>{
                    const offContacts=filtered.filter(c=>!c.botActive);
                    if(offContacts.length===0)return;
                    setConfirmModal({title:"Turn Bot ON for All?",message:`Turn bot ON for ${offContacts.length} chat${offContacts.length>1?"s":""}?`,icon:"🤖",danger:false,confirmText:`Yes, Turn ON ${offContacts.length} Bots`,
                      onConfirm:async()=>{
                        const total=offContacts.length;setBulkBotModal({total,done:0,active:true});
                        for(let i=0;i<offContacts.length;i++){try{await fetch(`${API}/api/conversations/${offContacts[i].id}/bot`,{method:"PATCH",headers:authHeaders(),body:JSON.stringify({botActive:true})});}catch{}setBulkBotModal({total,done:i+1,active:true});}
                        await fetchConversations();setBulkBotModal(null);
                      }});
                  }} style={{width:"100%",padding:"5px",borderRadius:8,border:"1px solid #bbf7d0",background:"#f0fdf4",color:"#16a34a",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                    🤖 Turn Bot ON for All ({filtered.filter(c=>!c.botActive).length})
                  </button>
                </div>}

                <div style={{display:"flex",alignItems:"center",gap:5}}>
                  <input type="date" value={inboxDateFilter} onChange={e=>setInboxDateFilter(e.target.value)}
                    style={{flex:1,background:"#f8f9fc",border:"1px solid #e8eaef",borderRadius:10,padding:"5px 10px",color:"#0d0f1a",fontSize:11,fontFamily:"inherit"}}/>
                  {inboxDateFilter&&<button onClick={()=>setInboxDateFilter("")} style={{background:"none",border:"none",cursor:"pointer",color:"#9ca3af",fontSize:14,padding:"0 4px"}}>✕</button>}
                </div>
              </>}
            </div>

            {/* Filters — always visible like mockup */}
            <div style={{display:"flex",gap:4,padding:"8px 10px",borderBottom:`1px solid ${T.border}`,overflowX:"auto"}}>
              {[{id:"all",label:"All"},{id:"unread",label:"Unread"},{id:"manual",label:"Bot off"},{id:"hot",label:"Hot leads"}].map(f=>(
                <button key={f.id} onClick={()=>{setInboxFilter(f.id);setShowArchived(false);}}
                  className={`nx-filter${inboxFilter===f.id&&!showArchived?" active":""}`}>
                  {f.label}
                </button>
              ))}
              <button onClick={()=>{setShowArchived(p=>!p);if(!archivedContacts.length)fetchArchived();}}
                className={`nx-filter${showArchived?" active":""}`}>Archived</button>
            </div>

            {/* CONTACT LIST */}
            <div style={{flex:1,overflowY:"auto"}}>
              {loading&&<div style={{padding:20,textAlign:"center",color:T.textMuted,fontSize:12}}>Loading...</div>}
              {!loading&&filtered.length===0&&<div style={{padding:24,textAlign:"center",color:T.textMuted,fontSize:12}}>
                <div style={{fontSize:32,marginBottom:8}}>💬</div>
                {backendStatus==="offline"?"⚠️ Cannot reach server — check your connection":"No conversations yet"}
              </div>}

              {filtered.map(c=>(
                <div key={c.id}
                  onClick={()=>{
                    if(selectMode){setSelectedChats(p=>{const n=new Set(p);n.has(c.phone)?n.delete(c.phone):n.add(c.phone);return n;});}
                    else{selectContact(c);}
                  }}
                  style={{padding:"11px 14px",display:"flex",alignItems:"center",gap:10,cursor:"pointer",
                    transition:"background .1s",position:"relative",
                    borderBottom:`1px solid ${T.border}`,
                    borderRight:selected?.id===c.id?`2px solid ${WA_GREEN}`:"2px solid transparent",
                    background:selected?.id===c.id?`${WA_GREEN}10`:selectMode&&selectedChats.has(c.phone)?`${WA_GREEN}08`:"transparent"}}
                  onMouseEnter={e=>{if(selected?.id!==c.id)e.currentTarget.style.background=T.sidebarHover;}}
                  onMouseLeave={e=>{if(selected?.id!==c.id)e.currentTarget.style.background=selectMode&&selectedChats.has(c.phone)?`${WA_GREEN}08`:"transparent";}}>

                  {/* Checkbox in select mode */}
                  {selectMode&&<div style={{width:18,height:18,borderRadius:4,border:`2px solid ${selectedChats.has(c.phone)?WA_GREEN:T.border}`,background:selectedChats.has(c.phone)?WA_GREEN:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    {selectedChats.has(c.phone)&&<span style={{color:"#fff",fontSize:11,fontWeight:700}}>✓</span>}
                  </div>}

                  {/* AVATAR */}
                  <div style={{position:"relative",flexShrink:0}}>
                    <div style={{width:40,height:40,borderRadius:"50%",background:getColor(c.name||"?"),display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:13,color:"#fff",
                      boxShadow:c.lead==="hot"?`0 0 0 2px #e11d48`:c.lead==="warm"?`0 0 0 2px #d97706`:"none"}}>
                      {c.avatar||"?"}
                    </div>
                    {c.unread>0&&<div style={{position:"absolute",top:-2,right:-2,background:WA_GREEN,color:"#fff",borderRadius:"50%",width:16,height:16,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,border:"2px solid "+T.sidebar}}>
                      {c.unread>9?"9+":c.unread}
                    </div>}
                    {c.botActive&&<div style={{position:"absolute",bottom:-1,right:-1,width:12,height:12,borderRadius:"50%",background:"#16a34a",border:"2px solid "+T.sidebar,display:"flex",alignItems:"center",justifyContent:"center",fontSize:6}}>🤖</div>}
                  </div>

                  {/* Info */}
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
                      <span style={{fontWeight:c.unread>0?700:600,fontSize:13,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:130}}>
                        {c.name}
                      </span>
                      <span style={{fontSize:10,color:c.unread>0?WA_GREEN:T.textFaint,fontWeight:c.unread>0?700:400,flexShrink:0,marginLeft:4}}>{c.lastTime}</span>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:4}}>
                      <span style={{fontSize:11,color:T.textMuted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>
                        {c.lastMessage||"No messages"}
                      </span>
                      {c.unread>0&&<span style={{background:WA_GREEN,color:"#fff",borderRadius:10,fontSize:9,fontWeight:700,padding:"1px 5px",minWidth:16,textAlign:"center",flexShrink:0}}>{c.unread>9?"9+":c.unread}</span>}
                      {!c.unread&&!c.botActive&&<span style={{fontSize:9,background:"#f0fdf4",color:"#15803d",padding:"1px 5px",borderRadius:6,fontWeight:600,flexShrink:0}}>BOT</span>}
                    </div>
                  </div>
                    {/* Tags + score bar */}
                    <div style={{display:"flex",alignItems:"center",gap:4}}>
                    {inboxFilter==="manual"&&!c.botActive&&<div onClick={e=>{e.stopPropagation();toggleBot(c.id);}}
                      style={{marginTop:4,display:"inline-flex",alignItems:"center",gap:4,padding:"2px 8px",borderRadius:6,background:"#f0fdf4",border:"1px solid #bbf7d0",cursor:"pointer"}}>
                      <span style={{fontSize:10,color:"#16a34a",fontWeight:700}}>🤖 Turn Bot ON</span>
                    </div>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ══ CHAT WINDOW ══ */}
          {selected?(
            <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,overflow:"hidden"}}>

              {/* CHAT HEADER */}
              <div style={{padding:"10px 18px",background:T.card,borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
                {isMobile&&<button onClick={()=>setSelected(null)} style={{background:"none",border:"none",cursor:"pointer",color:WA_GREEN,fontSize:26,padding:"0 4px 0 0",display:"flex",alignItems:"center",lineHeight:1}}>‹</button>}
                <div style={{position:"relative",flexShrink:0}}>
                  <div style={{width:38,height:38,borderRadius:"50%",background:getColor(selected.name||"?"),display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:13,color:"#fff",
                    boxShadow:selected.lead==="hot"?`0 0 0 2px #e11d48`:selected.lead==="warm"?`0 0 0 2px #d97706`:"none"}}>
                    {selected.avatar}
                  </div>
                  <div style={{position:"absolute",bottom:0,right:0,width:10,height:10,borderRadius:"50%",background:"#16a34a",border:"2px solid "+T.card}}/>
                </div>
                <div>
                  <div style={{fontWeight:700,fontSize:14,color:T.text}}>{selected.name}</div>
                  <div style={{fontSize:11,color:T.textMuted}}>{selected.phone}</div>
                </div>
                <div style={{display:"flex",gap:10,alignItems:"center",marginLeft:"auto"}}>
                  <select value={selected.lead} onChange={e=>setManualLead(selected.id,e.target.value)}
                    style={{background:selected.lead==="hot"?"#fef2f2":selected.lead==="warm"?"#fffbeb":T.card2,
                      border:`1px solid ${selected.lead==="hot"?"#fecaca":selected.lead==="warm"?"#fde68a":T.border}`,
                      borderRadius:20,padding:"5px 10px",
                      color:selected.lead==="hot"?"#dc2626":selected.lead==="warm"?"#b45309":T.textMuted,
                      fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",outline:"none"}}>
                    <option value="hot">🔥 Hot</option><option value="warm">🟡 Warm</option><option value="cold">🔵 Cold</option><option value="done">✅ Done</option>
                  </select>
                  <i className="ti ti-search" onClick={()=>{}} title="Search" style={{fontSize:18,color:T.textMuted,cursor:"pointer"}}/>
                  <i className="ti ti-phone" onClick={()=>{}} title="Call" style={{fontSize:18,color:T.textMuted,cursor:"pointer"}}/>
                  <i className="ti ti-robot" onClick={()=>toggleBot(selected.id)} title={selected.botActive?"Bot ON — click to pause":"Bot OFF — click to activate"}
                    style={{fontSize:18,color:selected.botActive?WA_GREEN:T.textMuted,cursor:"pointer"}}/>
                  <i className="ti ti-dots-vertical" onClick={()=>{}} title="More" style={{fontSize:18,color:T.textMuted,cursor:"pointer"}}/>
                </div>
              </div>

              {/* BOT ACTIVE BAR */}
              {selected.botActive&&<div style={{background:"#f0fdf4",borderBottom:"1px solid #bbf7d0",padding:"5px 18px",fontSize:11,color:"#15803d",display:"flex",alignItems:"center",gap:6}}>
                🤖 Bot is handling this — toggle off to reply manually
                <div style={{marginLeft:"auto",width:6,height:6,borderRadius:"50%",background:"#16a34a"}}/>
              </div>}

              {/* LEAD BAR */}
              {(selected.lead==="hot"||selected.lead==="warm")&&<div style={{
                background:selected.lead==="hot"?"#fef2f2":"#fffbeb",
                borderBottom:`1px solid ${selected.lead==="hot"?"#fecaca":"#fde68a"}`,
                padding:"6px 18px",display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:13}}>{selected.lead==="hot"?"🔥":"🟡"}</span>
                <span style={{fontWeight:700,fontSize:11,color:selected.lead==="hot"?"#dc2626":"#b45309"}}>{selected.lead==="hot"?"Hot":"Warm"} Lead:</span>
                <span style={{fontSize:11,color:T.textMuted,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{selected.leadReason||"Keyword match"}</span>
                {(()=>{
                  const lastUserMsg=selected.messages?.filter(m=>m.from==="user").slice(-1)[0];
                  const lastUserTime=(()=>{
                    if(!lastUserMsg?.date||!lastUserMsg?.time)return 0;
                    try{
                      const d=lastUserMsg.date.includes("/")?lastUserMsg.date.split("/").reverse().join("-"):lastUserMsg.date;
                      const t=lastUserMsg.time.trim();const isPM=/PM/i.test(t);const isAM=/AM/i.test(t);
                      const tp=t.replace(/[APap][Mm]/g,"").trim();const tc=tp.split(":");
                      let h=parseInt(tc[0])||0;const m=parseInt(tc[1])||0;
                      if(isPM&&h!==12)h+=12;if(isAM&&h===12)h=0;
                      return new Date(`${d}T${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:00`).getTime();
                    }catch{return 0;}
                  })();
                  const hoursElapsed=lastUserTime?(now-lastUserTime)/3600000:999;
                  const over24=hoursElapsed>24;
                  const pct=Math.min(100,(hoursElapsed/24)*100);
                  const circleColor=pct<50?"#16a34a":pct<80?"#d97706":"#e11d48";
                  const r=9;const circ=2*Math.PI*r;
                  return <>
                    <div title={over24?"24hr window expired":""+Math.max(0,24-hoursElapsed).toFixed(1)+"hrs left"} style={{flexShrink:0}}>
                      <svg width="24" height="24" style={{transform:"rotate(-90deg)"}}>
                        <circle cx="12" cy="12" r={r} fill="none" stroke="#e8eaef" strokeWidth="2.5"/>
                        <circle cx="12" cy="12" r={r} fill="none" stroke={circleColor} strokeWidth="2.5"
                          strokeDasharray={circ} strokeDashoffset={circ*(pct/100)} strokeLinecap="round"/>
                      </svg>
                    </div>
                    {over24?(
                      <div style={{padding:"4px 10px",borderRadius:20,background:"#fff1f3",border:"1px solid #fecdd3",fontSize:11,color:"#e11d48",fontWeight:600,flexShrink:0}}>
                        ⚠️ 24hr expired. Use Broadcast.
                      </div>
                    ):(
                      <button onClick={()=>sendFollowup(selected.id,1)} disabled={sendingFollowup===selected.id}
                        style={{padding:"5px 14px",borderRadius:20,border:"none",
                          background:selected.lead==="hot"?"linear-gradient(135deg,#e11d48,#be123c)":"linear-gradient(135deg,#d97706,#b45309)",
                          color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",
                          boxShadow:selected.lead==="hot"?"0 2px 10px rgba(225,29,72,.3)":"0 2px 10px rgba(217,119,6,.25)",
                          transition:"all .2s",flexShrink:0}}>
                        {sendingFollowup===selected.id?"⏳":"📤 Follow-up"}
                      </button>
                    )}
                  </>;
                })()}
              </div>}

              {/* MESSAGES */}
              <div ref={chatContainerRef} onScroll={()=>{const el=chatContainerRef.current;if(!el)return;userScrolled.current=(el.scrollHeight-el.scrollTop-el.clientHeight)>120;}}
                style={{flex:1,overflowY:"auto",padding:"12px 12px",paddingBottom:isMobile?80:20,
                  background:"#f5f6fa",display:"flex",flexDirection:"column",gap:8,
                  backgroundImage:"radial-gradient(circle at 100% 0,rgba(108,99,255,.03) 0,transparent 60%)",
                  WebkitOverflowScrolling:"touch",minHeight:0}}>
                {(!selected.messages||selected.messages.length===0)&&<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",color:"#8696a0",gap:8}}>
                  <div style={{width:24,height:24,borderRadius:"50%",border:`3px solid ${WA_GREEN}30`,borderTop:`3px solid ${WA_GREEN}`,animation:"spin .8s linear infinite"}}/>
                  <span style={{fontSize:12}}>Loading messages...</span>
                </div>}
                {selected.messages?.map((msg,i)=>{
                  const isOut=msg.from!=="user";
                  const isBot=msg.from==="bot";
                  const isAgent=msg.from==="agent";
                  return <div key={msg.id||i} className="mb" style={{display:"flex",justifyContent:isOut?"flex-end":"flex-start",alignItems:"flex-end",gap:8}}>
                    {!isOut&&<div style={{width:28,height:28,borderRadius:"50%",background:getColor(selected.name||"?"),flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:"#fff",marginBottom:2}}>{selected.avatar}</div>}
                    <div style={{maxWidth:"65%"}}>
                      {isOut&&<div style={{fontSize:9,fontWeight:700,marginBottom:3,textAlign:"right",letterSpacing:.2,
                        color:isBot?WA_GREEN:isAgent?"#0284c7":T.textMuted}}>
                        {isBot?(msg.agentName?.startsWith("📤")?msg.agentName:"🤖 "+(
                          adminOverview.find(c=>String(c.clinic_id||c.id)===String(selected.clinicId||selected.clinic_id||1))?.company_name||
                          currentUser?.company_name||
                          "Bot"
                        )):msg.agentName?`👤 ${msg.agentName}`:"👤 Agent"}
                      </div>}
                      <div style={{
                        background:isOut?(isBot?WA_GREEN:isAgent?"#0284c7":T.card2):T.msgIn,
                        borderRadius:isOut?"12px 2px 12px 12px":"2px 12px 12px 12px",
                        padding:"9px 13px",
                        boxShadow:"0 1px 2px rgba(0,0,0,.06)",
                        border:isOut?`1px solid ${isBot?WA_GREEN:isAgent?"#0284c7":T.border}`:isBot?`1px solid ${T.border};border-left:3px solid ${WA_GREEN}`:`1px solid ${T.border}`}}>
                        {msg.mediaUrl&&msg.text?.startsWith("[Image")?(
                          <div><img src={msg.mediaUrl} alt="image" style={{maxWidth:"100%",maxHeight:220,borderRadius:8,display:"block",cursor:"pointer"}} onClick={()=>window.open(msg.mediaUrl,"_blank")}/></div>
                        ):msg.mediaUrl&&msg.text?.startsWith("[Document")?(
                          <a href={msg.mediaUrl} target="_blank" rel="noreferrer" style={{display:"flex",alignItems:"center",gap:8,textDecoration:"none",background:"rgba(255,255,255,.1)",borderRadius:8,padding:"8px 12px"}}>
                            <span style={{fontSize:20}}>📄</span>
                            <span style={{fontSize:12,color:isOut?"rgba(255,255,255,.9)":WA_GREEN,fontWeight:600}}>{msg.text.replace("[Document: ","").replace("]","")}</span>
                          </a>
                        ):msg.text?.startsWith("[Voice")||msg.text?.startsWith("[Audio")?(
                          <div style={{display:"flex",alignItems:"center",gap:10,background:"rgba(255,255,255,.1)",borderRadius:8,padding:"8px 12px"}}>
                            <div style={{width:32,height:32,borderRadius:"50%",background:isOut?"rgba(255,255,255,.2)":WA_GREEN+"20",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                              <span style={{fontSize:16}}>🎤</span>
                            </div>
                            <div style={{flex:1}}>
                              <div style={{fontSize:11,fontWeight:600,color:isOut?"rgba(255,255,255,.9)":T.text}}>Voice message</div>
                              <div style={{fontSize:10,color:isOut?"rgba(255,255,255,.6)":T.textMuted}}>Audio not playable in CRM</div>
                            </div>
                            {msg.mediaUrl&&<a href={msg.mediaUrl} target="_blank" rel="noreferrer"
                              style={{fontSize:10,color:isOut?"rgba(255,255,255,.8)":WA_GREEN,textDecoration:"none",fontWeight:600,flexShrink:0}}>
                              Download
                            </a>}
                          </div>
                        ):!msg.mediaUrl&&msg.text?.startsWith("[Document")?(
                          <div style={{display:"flex",alignItems:"center",gap:8,background:"rgba(255,255,255,.1)",borderRadius:8,padding:"8px 12px"}}>
                            <span style={{fontSize:20}}>📄</span>
                            <span style={{fontSize:12,color:isOut?"rgba(255,255,255,.9)":T.textMuted}}>{msg.text.replace("[Document: ","").replace("]","")}</span>
                          </div>
                        ):msg.text?.startsWith("📢 Broadcast:")?(
                          <div style={{background:"rgba(255,255,255,.1)",borderRadius:8,padding:"8px 10px"}}>
                            <div style={{fontSize:10,color:isOut?"rgba(255,255,255,.7)":WA_GREEN,fontWeight:700,marginBottom:4}}>📢 BROADCAST</div>
                            <div style={{fontSize:12,fontWeight:600,color:isOut?"#fff":T.text}}>{msg.text.replace("📢 Broadcast: ","")}</div>
                          </div>
                        ):(
                          <div style={{fontSize:13,lineHeight:1.55,whiteSpace:"pre-wrap",color:isOut?"#ffffff":T.text}}>{msg.text}</div>
                        )}
                        <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:4,marginTop:5}}>
                          <span style={{fontSize:9,color:isOut?"rgba(255,255,255,.6)":T.textFaint}}>{formatMsgTime(msg.time,msg.date)}</span>
                          {isOut&&msg.is_read&&<span style={{fontSize:10,color:"rgba(255,255,255,.7)"}}>✓✓</span>}
                          {isOut&&!msg.is_read&&<span style={{fontSize:10,color:"rgba(255,255,255,.4)"}}>✓</span>}
                        </div>
                      </div>
                      {msg.sources?.length>0&&<div style={{marginTop:4,paddingLeft:4}}>{msg.sources.map(s=><SourceBadge key={s.id} s={s}/>)}</div>}
                    </div>
                  </div>;
                })}
                <div ref={messagesEndRef}/>
              </div>

              {/* INPUT BAR */}
              <div className="mobile-chat-input" style={{padding:"10px 16px",background:T.card,borderTop:`1px solid ${T.border}`,display:"flex",gap:8,alignItems:"flex-end",
                flexShrink:0,paddingBottom:"10px"}}>
                <div style={{flex:1,background:"#f8f9fc",border:"1.5px solid #e8eaef",borderRadius:14,padding:"9px 14px",display:"flex",alignItems:"center",gap:8,transition:"all .15s"}}
                  onFocus={()=>{}} onBlur={()=>{}}>
                  <textarea value={reply} onChange={e=>setReply(e.target.value)}
                    onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendAgentReply();}}}
                    placeholder={selected.botActive?"Bot is active — toggle off to reply":"Type a message..."}
                    disabled={selected.botActive} rows={1}
                    style={{flex:1,background:"transparent",border:"none",color:selected.botActive?"#9ca3af":"#0d0f1a",fontSize:isMobile?16:13,maxHeight:100,fontFamily:"inherit",outline:"none",resize:"none",lineHeight:1.4}}/>
                  <span style={{fontSize:15,color:"#9ca3af",cursor:"pointer"}}>😊</span>
                  <span style={{fontSize:15,color:"#9ca3af",cursor:"pointer"}}>📎</span>
                </div>
                <button className="sb" onClick={sendAgentReply} disabled={selected.botActive||!reply.trim()}
                  style={{width:42,height:42,borderRadius:12,border:"none",
                    background:selected.botActive||!reply.trim()?"#f8f9fc":"linear-gradient(135deg,#6c63ff,#5a52e0)",
                    color:selected.botActive||!reply.trim()?"#9ca3af":"#fff",fontSize:17,cursor:selected.botActive?"not-allowed":"pointer",flexShrink:0,
                    boxShadow:selected.botActive||!reply.trim()?"none":"0 2px 10px rgba(108,99,255,.25)",transition:"all .2s"}}>➤</button>
              </div>
            </div>
          ):<div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12,background:"#f5f6fa"}}>
            <div style={{width:64,height:64,borderRadius:20,background:"linear-gradient(135deg,#f0effe,#e8eaef)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28}}>💬</div>
            <div style={{fontSize:15,fontWeight:700,color:"#0d0f1a"}}>Select a conversation</div>
            <div style={{fontSize:12,color:"#9ca3af"}}>Choose from the list to start chatting</div>
          </div>}

          {/* RIGHT PANEL — always visible on desktop when contact selected, like mockup */}
          {selected&&!isMobile&&showRightPanel&&<div style={{width:240,flexShrink:0,borderLeft:`1px solid ${T.border}`,background:T.sidebar,overflowY:"auto",display:"flex",flexDirection:"column"}}>
            <div style={{padding:"14px 16px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{fontWeight:700,fontSize:13,color:T.text}}>Contact info</div>
              <button onClick={()=>setShowRightPanel(false)} style={{border:"none",background:"none",cursor:"pointer",fontSize:16,color:T.textMuted,lineHeight:1}}>×</button>
            </div>
            {/* Profile */}
            <div style={{padding:"16px",borderBottom:`1px solid ${T.border}`,textAlign:"center"}}>
              {selected.profile_pic_url
                ?<img src={selected.profile_pic_url} style={{width:56,height:56,borderRadius:"50%",objectFit:"cover",marginBottom:8,border:`3px solid ${WA_GREEN}`}} alt="profile"/>
                :<div style={{width:56,height:56,borderRadius:"50%",background:getColor(selected.name||"?"),display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,fontWeight:700,color:"#fff",margin:"0 auto 8px",
                  boxShadow:selected.lead==="hot"?`0 0 0 2px #e11d48`:selected.lead==="warm"?`0 0 0 2px #d97706`:"none"}}>{selected.avatar}</div>}
              <div style={{fontWeight:700,fontSize:14,color:T.text}}>{selected.name}</div>
              <div style={{fontSize:11,color:T.textMuted,marginTop:2}}>{selected.phone}</div>
              {selected.last_seen&&<div style={{fontSize:10,color:T.textFaint,marginTop:4}}>Last seen: {new Date(selected.last_seen).toLocaleString("en-MY",{dateStyle:"short",timeStyle:"short"})}</div>}
              <div style={{display:"flex",justifyContent:"center",gap:6,marginTop:10}}>
                <span className={`nx-badge ${selected.lead==="hot"?"hot":selected.lead==="warm"?"warm":"cold"}`}>
                  {selected.lead==="hot"?"🔥 Hot":selected.lead==="warm"?"🟡 Warm":"🔵 Cold"}
                </span>
                {selected.booking_confirmed&&<span className="nx-badge success">✅ Booked</span>}
                {selected.needsHuman&&<span className="nx-badge" style={{background:"#fef2f2",color:"#dc2626",border:"1px solid #fca5a5"}}>👤 Needs Human</span>}
              </div>
            </div>
            {/* Lead score — mockup style */}
            {selected.leadScore>0&&<div style={{padding:"12px 14px",borderBottom:`1px solid ${T.border}`}}>
              <div style={{fontSize:10,fontWeight:700,color:T.textFaint,textTransform:"uppercase",letterSpacing:.6,marginBottom:8}}>Lead Score</div>
              <div style={{background:T.card2,borderRadius:8,padding:"10px 12px",border:`1px solid ${T.border}`}}>
                <div style={{height:5,background:T.border,borderRadius:3,overflow:"hidden",marginBottom:6}}>
                  <div style={{height:5,borderRadius:3,width:`${selected.leadScore||0}%`,background:selected.lead==="hot"?"#ef4444":selected.lead==="warm"?"#f59e0b":"#3b82f6",transition:"width .8s ease"}}/>
                </div>
                <div style={{fontSize:11,fontWeight:700,color:selected.lead==="hot"?"#dc2626":selected.lead==="warm"?"#b45309":"#1d4ed8"}}>{selected.leadScore} · {selected.lead==="hot"?"Hot lead":selected.lead==="warm"?"Warm lead":"Cold lead"}</div>
              </div>
            </div>}

            {/* Details — mockup style */}
            <div style={{padding:"12px 14px",borderBottom:`1px solid ${T.border}`}}>
              <div style={{fontSize:10,fontWeight:700,color:T.textFaint,textTransform:"uppercase",letterSpacing:.6,marginBottom:8}}>Details</div>
              {[
                {icon:"ti ti-phone", val:selected.phone},
                {icon:"ti ti-calendar", val:`First seen ${selected.firstSeen||"—"}`},
                {icon:"ti ti-message-2", val:`${selected.messages?.length||0} messages`},
                {icon:"ti ti-clock", val:selected.last_seen?`Active ${new Date(selected.last_seen).toLocaleString("en-MY",{dateStyle:"short",timeStyle:"short"})}`:"—"},
              ].map((r,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:i<3?`1px solid ${T.border}`:"none"}}>
                  <i className={r.icon} style={{fontSize:14,color:T.textMuted,flexShrink:0,width:16}}/>
                  <span style={{fontSize:11,color:T.text}}>{r.val}</span>
                </div>
              ))}
            </div>

            {/* Ad Source History */}
            <div style={{padding:"12px 14px",borderBottom:`1px solid ${T.border}`}}>
              <div style={{fontSize:10,fontWeight:700,color:T.textFaint,textTransform:"uppercase",letterSpacing:.6,marginBottom:8}}>Ad Source</div>
              {adHistory.length>0
                ?<div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {[...new Map(adHistory.map(a=>[a.ad_headline||a.ad_source, a])).values()].map((ad,i)=>(
                    <div key={i} style={{background:"#f5f3ff",borderRadius:8,padding:"7px 10px",border:"1px solid #c4b5fd"}}>
                      <div style={{fontSize:11,fontWeight:700,color:"#5b21b6",marginBottom:2}}>
                        {ad.ad_source_type==="ad"?"📘 Facebook":ad.ad_source_type==="instagram"?"📸 Instagram":"📢 Ad"}
                      </div>
                      <div style={{fontSize:11,color:"#6d28d9"}}>{ad.ad_headline||ad.ad_source||"—"}</div>
                      {ad.ad_source&&<a href={ad.ad_source} target="_blank" rel="noopener noreferrer" style={{fontSize:10,color:"#7c3aed",textDecoration:"none",display:"block",marginTop:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>🔗 {ad.ad_source}</a>}
                      {ad.first_message&&<div style={{fontSize:10,color:"#a78bfa",marginTop:2}}>"{ad.first_message?.slice(0,40)}{ad.first_message?.length>40?"...":""}"</div>}
                    </div>
                  ))}
                </div>
                :<div style={{fontSize:11,color:T.textFaint,fontStyle:"italic"}}>Organic / Direct</div>}
            </div>

            {/* Tags */}
            <div style={{padding:"12px 14px",borderBottom:`1px solid ${T.border}`}}>
              <div style={{fontSize:10,fontWeight:700,color:T.textFaint,textTransform:"uppercase",letterSpacing:.6,marginBottom:8}}>Tags</div>
              <div>
                {selected.lead==="hot"&&<span className="nx-badge hot" style={{margin:2}}>🔥 Hot lead</span>}
                {selected.lead==="warm"&&<span className="nx-badge warm" style={{margin:2}}>🟡 Warm lead</span>}
                {selected.lead==="cold"&&<span className="nx-badge cold" style={{margin:2}}>🔵 Cold</span>}
                {selected.booking_confirmed&&<span className="nx-badge success" style={{margin:2}}>✅ Booked</span>}
                {selected.pipelineStage&&selected.pipelineStage!=="new"&&<span className="nx-badge success" style={{margin:2}}>{selected.pipelineStage}</span>}
                {!selected.botActive&&<span style={{display:"inline-flex",fontSize:10,padding:"3px 8px",borderRadius:20,margin:2,fontWeight:500,background:"#fff7ed",color:"#c2410c",border:"1px solid #fed7aa"}}>Manual</span>}
              </div>
            </div>

            {/* AI Bot toggle */}
            <div style={{padding:"12px 14px",borderBottom:`1px solid ${T.border}`}}>
              <div style={{fontSize:10,fontWeight:700,color:T.textFaint,textTransform:"uppercase",letterSpacing:.6,marginBottom:8}}>AI Bot</div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 10px",background:T.card2,borderRadius:8,border:`1px solid ${T.border}`}}>
                <span style={{fontSize:11,fontWeight:600,color:T.text}}>{selected.botActive?"Bot active":"Bot paused"}</span>
                <div onClick={()=>toggleBot(selected.id)}
                  className={`nx-toggle ${selected.botActive?"on":"off"}`}
                  style={{cursor:"pointer"}}>
                  <div className="nx-toggle-dot"/>
                </div>
              </div>
            </div>

            {/* Lead selector */}
            <div style={{padding:"12px 14px",borderBottom:`1px solid ${T.border}`}}>
              <div style={{fontSize:10,fontWeight:700,color:T.textFaint,textTransform:"uppercase",letterSpacing:.6,marginBottom:8}}>Lead Status</div>
              <select value={selected.lead} onChange={e=>setManualLead(selected.id,e.target.value)}
                style={{width:"100%",padding:"8px 10px",borderRadius:8,border:`1px solid ${T.border}`,background:T.input,color:T.text,fontSize:12,fontFamily:"inherit",outline:"none"}}>
                <option value="hot">🔥 Hot</option>
                <option value="warm">🟡 Warm</option>
                <option value="cold">🔵 Cold</option>
                <option value="done">✅ Done</option>
              </select>
            </div>

            {/* Quick actions */}
            <div style={{padding:"12px 14px"}}>
              <div style={{fontSize:10,fontWeight:700,color:T.textFaint,textTransform:"uppercase",letterSpacing:.6,marginBottom:8}}>Quick actions</div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                <button onClick={()=>safeSetTab("broadcast")} className="nx-btn" style={{width:"100%",justifyContent:"center"}}>
                  <i className="ti ti-speakerphone" style={{fontSize:14}}/> Send template
                </button>
                <button onClick={()=>safeSetTab("notes")} className="nx-btn" style={{width:"100%",justifyContent:"center"}}>
                  <i className="ti ti-notes" style={{fontSize:14}}/> Add note
                </button>
                <button onClick={()=>setArchiveConfirm(selected.id)} className="nx-btn" style={{width:"100%",justifyContent:"center"}}>
                  <i className="ti ti-archive" style={{fontSize:14}}/> Archive chat
                </button>
              </div>
            </div>
          </div>}
        </>}


        {tab==="leads"&&<div style={{flex:1,display:"flex",background:T.bg,overflow:"hidden"}}>



          {/* Leads content - New Lead-based Kanban */}
          <div style={{flex:1,overflow:"auto",display:"flex",flexDirection:"column"}}>
            {/* Page header — matches mockup */}
            <div className="nx-page-header" style={{flexShrink:0}}>
              <i className="ti ti-target" style={{fontSize:20,color:WA_GREEN}}/>
              <div>
                <div className="nx-page-title">Leads</div>
                <div className="nx-page-sub">{leadsClinic?leadsClinic.company_name||leadsClinic.username:"AI-classified · Track your pipeline"}</div>
              </div>
              {isAdmin&&<div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
                <button onClick={()=>setLeadsClinic(null)}
                  style={{padding:"3px 10px",borderRadius:20,border:`1px solid ${!leadsClinic?WA_GREEN:T.border}`,background:!leadsClinic?`${WA_GREEN}15`:"transparent",color:!leadsClinic?WA_GREEN:T.textMuted,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                  All
                </button>
                {adminOverview.map(c=>{
                  const sel = leadsClinic?.id===c.id;
                  return <div key={c.id} onClick={()=>setLeadsClinic(sel?null:c)}
                    style={{display:"flex",alignItems:"center",gap:5,padding:"3px 10px",borderRadius:20,cursor:"pointer",
                      border:`1px solid ${sel?WA_GREEN:T.border}`,background:sel?`${WA_GREEN}15`:"transparent",
                      opacity:(c.active===false||c.active===0)?0.5:1}}>
                    <div style={{width:14,height:14,borderRadius:3,overflow:"hidden",background:`${WA_GREEN}15`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      {c.logo_url?<img src={c.logo_url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:<span style={{fontSize:9}}>🏢</span>}
                    </div>
                    <span style={{fontSize:11,fontWeight:700,color:sel?WA_GREEN:T.text}}>{c.company_name||c.username}</span>
                  </div>;
                })}
              </div>}
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                {/* Search */}
                <div className="nx-search" style={{width:180}}>
                  <i className="ti ti-search" style={{fontSize:14,color:T.textFaint}}/>
                  <input value={leadsSearch} onChange={e=>setLeadsSearch(e.target.value)} placeholder="Search..."/>
                  {leadsSearch&&<i className="ti ti-x" onClick={()=>setLeadsSearch("")} style={{fontSize:12,color:T.textMuted,cursor:"pointer"}}/>}
                </div>
                {/* Filter button with popup */}
                <div style={{position:"relative"}}>
                  <button className={`nx-btn${leadsUserFilter?" primary":""}`}
                    onClick={()=>setLeadsFilterOpen(o=>!o)}>
                    <i className="ti ti-filter" style={{fontSize:14}}/>
                    {leadsUserFilter?"Filtered":"Filter"}
                  </button>
                  {leadsFilterOpen&&<>
                    <div onClick={()=>setLeadsFilterOpen(false)} style={{position:"fixed",inset:0,zIndex:199}}/>
                    <div style={{position:"absolute",right:0,top:"calc(100% + 6px)",width:200,background:T.card,border:`1px solid ${T.border}`,borderRadius:12,boxShadow:"0 8px 24px rgba(0,0,0,.12)",zIndex:200,overflow:"hidden"}}>
                      <div style={{padding:"10px 14px",borderBottom:`1px solid ${T.border}`,fontSize:11,fontWeight:700,color:T.textMuted,textTransform:"uppercase",letterSpacing:.6}}>Filter by Agent</div>
                      {[{value:"",label:"All Agents"},{value:"unassigned",label:"Unassigned"},...clinicUsers.filter(u=>u.active!==false).map(u=>({value:String(u.id),label:"@"+u.username}))].map(opt=>(
                        <div key={opt.value} onClick={()=>{setLeadsUserFilter(opt.value);setLeadsFilterOpen(false);}}
                          style={{padding:"9px 14px",cursor:"pointer",fontSize:13,
                            background:leadsUserFilter===opt.value?`${WA_GREEN}12`:"transparent",
                            color:leadsUserFilter===opt.value?WA_GREEN:T.text,
                            fontWeight:leadsUserFilter===opt.value?600:400,
                            borderBottom:`1px solid ${T.border}`}}>
                          {leadsUserFilter===opt.value&&<i className="ti ti-check" style={{fontSize:12,marginRight:6}}/>}
                          {opt.label}
                        </div>
                      ))}
                    </div>
                  </>}
                </div>
                <button onClick={()=>setExportModal(true)} className="nx-btn">
                  <i className="ti ti-download" style={{fontSize:14}}/> Export
                </button>
              </div>
            </div>

            {/* Stat cards — matches mockup */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,padding:"16px 16px 0",flexShrink:0}}>
              <div className="nx-stat">
                <div className="nx-stat-label">🔥 Hot leads</div>
                <div className="nx-stat-val" style={{color:"#dc2626"}}>{hotCount}</div>
                <div style={{fontSize:10,color:T.textMuted,marginTop:4}}>Active pipeline</div>
              </div>
              <div className="nx-stat">
                <div className="nx-stat-label">🟡 Warm leads</div>
                <div className="nx-stat-val" style={{color:"#b45309"}}>{warmCount}</div>
                <div style={{fontSize:10,color:T.textMuted,marginTop:4}}>Needs nurturing</div>
              </div>
              <div className="nx-stat">
                <div className="nx-stat-label">🔵 Cold leads</div>
                <div className="nx-stat-val" style={{color:"#1d4ed8"}}>{contacts.filter(c=>c.lead==="cold"&&(c.pipelineStage||"new")!=="done").length}</div>
                <div style={{fontSize:10,color:T.textMuted,marginTop:4}}>Low priority</div>
              </div>
            </div>

            {/* Kanban board */}
            <div style={{flex:1,overflow:"auto",padding:16}}>

            {/* 4 Lead Columns */}
            <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":isTablet?"1fr 1fr":"repeat(4,minmax(220px,1fr))",gap:12,minWidth:isMobile?"auto":isTablet?"auto":900}}>
              {[
                {id:"hot",  label:"🔥 Hot Leads",  sub:"Ready to close",    color:"#ef4444", bg:"#fef2f2", dark:"#2d1515", border:"#fca5a5"},
                {id:"warm", label:"🟡 Warm Leads", sub:"Needs nurturing",   color:"#f59e0b", bg:"#fffbeb", dark:"#2d2010", border:"#fcd34d"},
                {id:"cold", label:"🔵 Browsing",   sub:"Low priority",      color:"#3b82f6", bg:"#eff6ff", dark:"#0f1e35", border:"#93c5fd"},
                {id:"done", label:"✅ Done",        sub:"Booking confirmed", color:"#22c55e", bg:"#f0fdf4", dark:"#0f2d1a", border:"#86efac"},
              ].map(col=>{
                const colContacts = contacts.filter(c=>{
                  // Filter by clinic for admin
                  if(isAdmin && leadsClinic && String(c.clinicId||c.clinic_id||1)!==String(leadsClinic.clinic_id)) return false;
                  // Filter by column
                  if(col.id==="done") {
                    if((c.pipelineStage||"new")!=="done") return false;
                  } else {
                    if(c.lead!==col.id || (c.pipelineStage||"new")==="done") return false;
                  }
                  // Search filter
                  if(leadsSearch) {
                    const s = leadsSearch.toLowerCase();
                    if(!c.name?.toLowerCase().includes(s) && !c.phone?.includes(s)) return false;
                  }
                  // Date filter
                  if(leadsDateFrom || leadsDateTo) {
                    const d = c.lastDate ? (c.lastDate.includes("/")?c.lastDate.split("/").reverse().join("-"):c.lastDate) : "";
                    if(leadsDateFrom && d < leadsDateFrom) return false;
                    if(leadsDateTo && d > leadsDateTo) return false;
                  }
                  // User filter
                  if(leadsUserFilter && String(c.assignedTo)!==String(leadsUserFilter)) return false;
                                  if(leadsUserFilter) {
                    if(leadsUserFilter==="unassigned") {
                      if(c.assignedTo!=null && c.assignedTo!=="") return false;
                    } else {
                      if(String(c.assignedTo)!==leadsUserFilter) return false;
                    }
                  }
                  return true;
                }).sort((a,b)=>{
                  // Sort newest first by lastDate+lastTime
                  const parseTs = (c) => {
                    try {
                      const d = c.lastDate||""; const t = c.lastTime||"";
                      if(!d) return 0;
                      const dp = d.includes("-")?d.split("-"):[d.split("/")[2],d.split("/")[1],d.split("/")[0]];
                      return new Date(`${dp[0]}-${dp[1]}-${dp[2]} ${t}`).getTime()||0;
                    } catch { return 0; }
                  };
                  return parseTs(b) - parseTs(a);
                });
                return (
                  <div key={col.id}
                    onDragOver={e=>{e.preventDefault();setDragOver(col.id);}}
                    onDragLeave={()=>setDragOver(null)}
                    onDrop={e=>onDrop(e,col.id)}
                    style={{background:T.card,borderRadius:12,border:`1px solid ${dragOver===col.id?col.color:T.border}`,overflow:"hidden",transition:"border .15s",boxShadow:"0 1px 4px rgba(0,0,0,.04)"}}>
                    {/* Column header */}
                    <div style={{padding:"12px 14px",borderBottom:`1px solid ${T.border}`,background:T.sidebar}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <div style={{width:8,height:8,borderRadius:"50%",background:col.color,flexShrink:0}}/>
                          <span style={{fontWeight:700,fontSize:13,color:T.text}}>{col.label}</span>
                        </div>
                        <div style={{background:`${col.color}15`,color:col.color,borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:700}}>{colContacts.length}</div>
                      </div>
                      <div style={{fontSize:11,color:T.textMuted,marginTop:4,paddingLeft:16}}>{col.sub}</div>
                      {col.id==="done"&&colContacts.length>0&&<button onClick={async()=>{
                        setConfirmModal({title:`Move ${colContacts.length} leads back to Warm?`,message:'All Done leads will be moved back to Warm and re-enter the pipeline.',icon:'🔄',danger:false,confirmText:'Yes, Move All',onConfirm:async()=>{
                        for(const c of colContacts){
                          await fetch(`${API}/api/conversations/${c.id}/lead`,{method:"PATCH",headers:{"Content-Type":"application/json","Authorization":`Bearer ${authToken}`},body:JSON.stringify({lead:"warm"})});
                          await fetch(`${API}/api/conversations/${c.id}/pipeline`,{method:"PATCH",headers:{"Content-Type":"application/json","Authorization":`Bearer ${authToken}`},body:JSON.stringify({stage:"new"})});
                        }
                        fetchConversations();}});
                      }} className="nx-btn" style={{marginTop:8,width:"100%",justifyContent:"center",fontSize:11}}>
                        ↩️ Reset All to Warm
                      </button>}
                    </div>

                    {/* Cards */}
                    <div style={{padding:"10px",display:"flex",flexDirection:"column",gap:8,maxHeight:"calc(100vh - 280px)",overflowY:"auto"}}>
                      {colContacts.length===0&&<div style={{textAlign:"center",padding:"24px 0",color:col.color,opacity:.4,fontSize:12}}>No leads here</div>}
                      {colContacts.map(c=>{
                        const assignedUser = contacts._users?.find(u=>u.id===c.assignedTo);
                        const silentMins = c.lastTime ? Math.round((Date.now()-new Date(c.lastTime).getTime())/60000) : null;
                        const silentText = silentMins ? silentMins<60?`${silentMins}m ago`:silentMins<1440?`${Math.floor(silentMins/60)}h ago`:`${Math.floor(silentMins/1440)}d ago` : "";
                        return (
                          <div key={c.id}
                            draggable
                            onDragStart={e=>onDragStart(e,c.id)}
                            onClick={()=>{setTab("crm");selectContact(c);}}
                            style={{background:T.card,borderRadius:10,padding:12,border:`1px solid ${T.border}`,
                              cursor:"grab",transition:"all .15s",
                              boxShadow:"0 1px 3px rgba(0,0,0,.05)"}}
                            onMouseEnter={e=>{e.currentTarget.style.boxShadow="0 4px 16px rgba(0,0,0,.1)";e.currentTarget.style.transform="translateY(-1px)";}}
                            onMouseLeave={e=>{e.currentTarget.style.boxShadow="0 1px 3px rgba(0,0,0,.05)";e.currentTarget.style.transform="none";}}>

                            {/* Name + avatar */}
                            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                              <div style={{width:32,height:32,borderRadius:"50%",background:getColor(c.name||"?"),flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:"#fff"}}>{c.avatar||"?"}</div>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontWeight:700,fontSize:13,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.name||"Unknown"}</div>
                                <div style={{fontSize:10,color:T.textFaint}}>{c.phone} {silentText&&<span>· {silentText}</span>}</div>
                              {c.lastDate&&<div style={{fontSize:10,color:col.color,fontWeight:600,marginTop:2}}>
                                📅 {c.lastDate.includes("-")?c.lastDate.split("-").reverse().join("/"):c.lastDate} {c.lastTime&&`· ${c.lastTime}`}
                              </div>}
                              </div>
                              {c.needsHuman&&<span style={{fontSize:10,fontWeight:600,padding:"1px 6px",borderRadius:10,background:"#fef2f2",color:"#dc2626",border:"1px solid #fca5a5",whiteSpace:"nowrap"}} title="Needs Human Attention">👤 Human</span>}
                            </div>

                            {/* Lead score */}
                            {col.id!=="done"&&c.leadScore>0&&<div style={{marginBottom:8}}>
                              <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                                <span style={{fontSize:10,color:T.textMuted}}>Intent score</span>
                                <span style={{fontSize:10,fontWeight:700,color:col.color}}>{c.leadScore}/100</span>
                              </div>
                              <div style={{height:4,borderRadius:2,background:T.border}}>
                                <div style={{height:4,borderRadius:2,width:`${c.leadScore}%`,background:col.color,transition:"width .3s"}}/>
                              </div>
                            </div>}

                            {/* Last message */}
                            {c.lastMessage&&<div style={{fontSize:11,color:T.textMuted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:8,fontStyle:"italic"}}>"{c.lastMessage}"</div>}

                            {/* Next action — only for hot/warm */}
                            {(col.id==="hot"||col.id==="warm")&&<div style={{marginBottom:8}}>
                              <span style={{fontSize:10,padding:"2px 8px",borderRadius:10,fontWeight:700,
                                background:col.id==="hot"?"#fef9c3":col.id==="warm"?"#eff6ff":"#f1f5f9",
                                color:col.id==="hot"?"#854d0e":col.id==="warm"?"#1d4ed8":"#475569",
                                border:`1px solid ${col.id==="hot"?"#fde047":col.id==="warm"?"#bfdbfe":"#cbd5e1"}`}}>
                                {col.id==="hot"?"⚡ Call them now":"📋 Send more info"}
                              </span>
                            </div>}

                            {/* Assign to staff */}
                            {col.id!=="done"&&col.id!=="cold"&&<div onClick={e=>e.stopPropagation()} style={{marginBottom:6}}>
                              <select
                                value={c.assignedTo!=null?String(c.assignedTo):""}
                                onChange={async e=>{
                                  e.stopPropagation();
                                  const uid = e.target.value ? parseInt(e.target.value) : null;
                                  const phone = c.id;
                                  const r = await fetch(`${API}/api/conversations/${phone}/assign`,{
                                    method:"PATCH",
                                    headers:{"Content-Type":"application/json","Authorization":`Bearer ${authToken}`},
                                    body:JSON.stringify({assigned_to:uid})
                                  });
                                  if(r.ok) {
                                    setContacts(prev=>prev.map(x=>x.id===c.id?{...x,assignedTo:uid}:x));
                                    fetchConversations();
                                  }
                                }}
                                style={{width:"100%",fontSize:10,padding:"4px 8px",borderRadius:8,
                                  border:`1px solid ${T.border}`,background:T.card2,color:T.text,
                                  fontFamily:"inherit",cursor:"pointer"}}>
                                <option value="">👤 Unassigned</option>
                                {clinicUsers.map(u=>(
                                  <option key={u.id} value={String(u.id)}>@{u.username}</option>
                                ))}
                              </select>
                              {/* Self-assign button */}
                              {!isAdmin&&currentUser&&c.assignedTo!==currentUser.id&&<button
                                onClick={async e=>{
                                  e.stopPropagation();
                                  const r = await fetch(`${API}/api/conversations/${c.id}/assign`,{
                                    method:"PATCH",headers:{"Content-Type":"application/json","Authorization":`Bearer ${authToken}`},
                                    body:JSON.stringify({assigned_to:currentUser.id})
                                  });
                                  if(r.ok) fetchConversations();
                                }}
                                style={{width:"100%",marginTop:4,padding:"4px",borderRadius:8,
                                  border:`1px solid ${WA_GREEN}40`,background:`${WA_GREEN}10`,
                                  color:WA_GREEN,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                                ✋ Assign to Me
                              </button>}
                            </div>}

                            {/* Action buttons */}
                            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                              {(col.id==="hot"||col.id==="warm")&&<button
                                onClick={e=>{e.stopPropagation();sendFollowup(c.id,1);}}
                                disabled={sendingFollowup===c.id}
                                style={{flex:1,padding:"4px",borderRadius:8,border:"none",
                                  background:col.id==="hot"?"#ef444420":"#f59e0b20",
                                  color:col.id==="hot"?"#ef4444":"#f59e0b",
                                  fontSize:10,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>
                                {sendingFollowup===c.id?"⏳":"📤 Follow-up"}
                              </button>}
                              <button onClick={e=>{e.stopPropagation();setPipelineStage(c.id,"done");}}
                                style={{padding:"4px 8px",borderRadius:8,border:`1px solid ${T.border}`,
                                  background:T.card2,color:"#22c55e",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>
                                ✅ Done
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          </div>
        </div>}

        {/* ══ ANALYTICS TAB ══ */}
        {tab==="analytics"&&<div style={{flex:1,display:"flex",background:T.bg,overflow:"hidden"}}>

          {/* ── ANALYTICS DRILLDOWN STATE ── */}
          {(()=>{
            // Analytics drilldown state — defined inline to avoid hook rules
            return null;
          })()}

          {/* Main analytics content */}
          <div style={{flex:1,overflowY:"auto",padding:16,paddingBottom:80,position:"relative"}}>
            <AnalyticsTab
              T={T} WA_GREEN={WA_GREEN} dark={dark} isAdmin={isAdmin}
              selectedClinic={selectedClinic} setSelectedClinicWithRef={setSelectedClinicWithRef}
              fetchAnalytics={fetchAnalytics} fetchAdminOverview={fetchAdminOverview}
              adminOverview={adminOverview} overviewLoading={overviewLoading}
              analyticsLoading={analyticsLoading} analytics={analytics}
              dateFrom={dateFrom} dateTo={dateTo}
              datePreset={datePreset} setDatePreset={setDatePreset}
              setDateFrom={setDateFrom} setDateTo={setDateTo}
              daysAgo={daysAgo} today={today}
              API={API} authHeaders={authHeaders}
              contacts={contacts}
              adSummary={adSummary}
              adData={adData}
              countryData={countryData} setCountryData={setCountryData}
            />
          </div>
        </div>}


        {tab==="bot"&&<BotTestTab
          T={T} WA_GREEN={WA_GREEN} dark={dark} isAdmin={isAdmin}
          currentUser={currentUser} authToken={authToken}
          adminOverview={adminOverview} API={API} ts={ts}
          formatMsgTime={formatMsgTime} botEndRef={botEndRef}
          qaData={qaData} SourceBadge={SourceBadge}
        />}

        {tab==="kb"&&<div style={{flex:1,display:"flex",background:T.bg,overflow:"hidden"}}>

          {/* Admin sidebar */}
          {isAdmin&&<div style={{width:220,borderRight:`1px solid ${T.border}`,overflowY:"auto",flexShrink:0,background:T.card}}>
            <div style={{padding:"12px 14px",borderBottom:`1px solid ${T.border}`,fontWeight:700,fontSize:11,color:T.textMuted,letterSpacing:1,textTransform:"uppercase"}}>Knowledge For</div>
            {adminOverview.map(c=>(
              <div key={c.id} onClick={()=>loadKbForClient(c)}
                style={{padding:"11px 14px",cursor:"pointer",opacity:(c.active===false||c.active===0||c.active==='false'||c.active===null)?0.45:1,background:kbClinic?.id===c.id?`${WA_GREEN}15`:"transparent",borderLeft:kbClinic?.id===c.id?`3px solid ${WA_GREEN}`:"3px solid transparent",display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:32,height:32,borderRadius:9,overflow:"hidden",background:`${WA_GREEN}12`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  {c.logo_url?<img src={c.logo_url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:<span style={{fontSize:15}}>🏢</span>}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:700,color:kbClinic?.id===c.id?WA_GREEN:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.company_name||c.username}</div>
                </div>
              </div>
            ))}
            {adminOverview.length===0&&<div style={{padding:16,fontSize:12,color:T.textMuted,textAlign:"center"}}>No clients yet</div>}
          </div>}

          {/* KB content */}
          <div style={{flex:1,overflowY:"auto",padding:16,paddingBottom:80}}>

            {/* Admin pick client prompt */}
            {isAdmin&&!kbClinic&&<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"60%",color:T.textMuted}}>
              <div style={{fontSize:48,marginBottom:12}}>📋</div>
              <div style={{fontWeight:700,fontSize:16,marginBottom:6}}>Select a client</div>
              <div style={{fontSize:13}}>Choose a client to manage their knowledge base</div>
            </div>}

            {/* Client header */}
            {isAdmin&&kbClinic&&<div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,padding:"10px 14px",borderRadius:12,background:T.card,border:`1px solid ${T.border}`}}>
              <div style={{width:32,height:32,borderRadius:8,overflow:"hidden",background:`${WA_GREEN}15`,display:"flex",alignItems:"center",justifyContent:"center"}}>
                {kbClinic.logo_url?<img src={kbClinic.logo_url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:<span style={{fontSize:16}}>🏢</span>}
              </div>
              <div>
                <div style={{fontWeight:700,fontSize:14}}>{kbClinic.company_name||kbClinic.username}</div>
                <div style={{fontSize:11,color:T.textMuted}}>{qaData.length} Q&A pairs</div>
              </div>
            </div>}

            {(!isAdmin||kbClinic)&&<div style={{maxWidth:800,width:"100%"}}>

              {/* ── KB HEADER ── */}
              <div style={{background:`linear-gradient(135deg,#0f172a,#1e3a5f)`,borderRadius:16,padding:"20px 24px",marginBottom:20,color:"#fff",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
                <div>
                  <div style={{fontSize:11,color:"rgba(255,255,255,.5)",letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>Bot Knowledge Base</div>
                  <div style={{fontSize:22,fontWeight:900}}>{qaData.length} Q&A Pairs</div>
                  <div style={{fontSize:11,color:"rgba(255,255,255,.5)",marginTop:4}}>
                    {qaData.length===0?"⚠️ Empty — add knowledge so your bot can answer questions":qaData.length<10?"⚠️ Low — add more so bot answers accurately":qaData.length<25?"📈 Good — keep adding more":qaData.length<50?"✅ Strong KB":"🚀 Excellent KB"}
                  </div>
                </div>
                <div style={{textAlign:"center",padding:"10px 20px",background:"rgba(255,255,255,.08)",borderRadius:12}}>
                  <div style={{fontSize:28,fontWeight:900,color:"#86efac"}}>{Math.min(100,Math.round(qaData.length/50*100))}%</div>
                  <div style={{fontSize:10,color:"rgba(255,255,255,.5)",marginTop:2}}>KB Coverage</div>
                </div>
              </div>

              {/* ── SECTION 0: WELCOME MESSAGE ── */}
              <div className="cc" style={{marginBottom:16}}>
                <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:12}}>
                  <div style={{width:36,height:36,borderRadius:10,background:"#f0fdf415",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>👋</div>
                  <div>
                    <div style={{fontWeight:800,fontSize:14}}>Welcome Message</div>
                    <div style={{fontSize:11,color:T.textMuted,marginTop:2,lineHeight:1.6}}>
                      This message is sent <strong>automatically</strong> when a customer messages for the <strong>very first time</strong>.
                      Leave blank to skip. Example: "Hi! I'm [Bot Name] from [Company] 😊 How can I help you today?"
                    </div>
                  </div>
                </div>
                <textarea value={welcomeMessage} onChange={e=>setWelcomeMessage(e.target.value)} rows={3}
                  placeholder={"Hi! I'm [Bot Name] from [Company] 😊 How can I help you today?"}
                  style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:10,padding:"10px 14px",color:T.text,fontSize:13,fontFamily:"inherit",resize:"vertical",boxSizing:"border-box"}}/>
                <button onClick={async()=>{
                  const body = {welcome_message: welcomeMessage};
                  const clinicId = kbClinic?.clinic_id || currentUser?.clinic_id;
                  const saveUrl = isAdmin
                    ? `${API}/api/admin/clients/${clinicId}/settings`
                    : `${API}/api/settings`;
                  await fetch(saveUrl,{method:"PATCH",headers:authHeaders(),body:JSON.stringify(body)});
                  const t=document.createElement("div");
                  t.style.cssText="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:99999;background:#fff;border-radius:20px;padding:28px 36px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.2);border:2px solid #86efac";
                  t.innerHTML="<div style='font-size:32px;margin-bottom:8px'>👋</div><div style='font-weight:800;font-size:16px;color:#166534'>Welcome Message Saved!</div>";
                  document.body.appendChild(t);
                  setTimeout(()=>t.remove(),2500);
                }} style={{marginTop:10,padding:"8px 20px",borderRadius:10,border:"none",background:WA_GREEN,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                  💾 Save Welcome Message
                </button>
              </div>

              {/* ── KB SUB-TAB SWITCHER ── */}
              {(isAdmin||permissions?.can_prompt_wizard)&&<div style={{display:"flex",gap:6,marginBottom:16,background:T.card2,padding:4,borderRadius:12,border:`1px solid ${T.border}`}}>
                {[
                  {id:"kb",label:"📋 Knowledge Base"},
                  {id:"wizard",label:"✨ Prompt Wizard"},
                ].map(t=>(
                  <button key={t.id} onClick={()=>setKbSubTab(t.id)}
                    style={{flex:1,padding:"8px 12px",borderRadius:9,border:"none",fontFamily:"inherit",fontSize:12,fontWeight:700,cursor:"pointer",transition:"all .15s",
                      background:kbSubTab===t.id?"linear-gradient(135deg,#6c63ff,#8b5cf6)":T.card,
                      color:kbSubTab===t.id?"#fff":T.textMuted,
                      boxShadow:kbSubTab===t.id?"0 2px 8px rgba(108,99,255,.3)":"none"}}>
                    {t.label}
                  </button>
                ))}
              </div>}

              {/* ── PROMPT WIZARD TAB ── */}
              {kbSubTab==="wizard"&&(isAdmin||permissions?.can_prompt_wizard)&&<PromptWizard
                T={T} WA_GREEN={WA_GREEN} dark={dark}
                API={API} authHeaders={authHeaders}
                kbClinic={kbClinic}
                systemPrompt={systemPrompt} setSystemPrompt={setSystemPrompt}
                setConfirmModal={setConfirmModal}
              />}

              {kbSubTab==="kb"&&<>
              {/* ── SECTION 1: BOT PERSONALITY ── */}
              <div className="cc" style={{marginBottom:16}}>
                <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:12}}>
                  <div style={{width:36,height:36,borderRadius:10,background:`${WA_GREEN}15`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>⚙️</div>
                  <div>
                    <div style={{fontWeight:800,fontSize:14}}>Bot Personality & Behaviour</div>
                    <div style={{fontSize:11,color:T.textMuted,marginTop:2,lineHeight:1.6}}>
                      This tells the bot <strong>who it is</strong>, <strong>how to talk</strong>, and <strong>what to do</strong>. 
                      Example: "You are Sara, a friendly assistant for Evera Health. Always reply in the customer's language. 
                      If someone asks to book, collect their name and preferred day."
                    </div>
                  </div>
                </div>
                <textarea value={systemPrompt} onChange={e=>setSystemPrompt(e.target.value)} rows={5}
                  style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:10,padding:"10px 14px",color:T.text,fontSize:12,fontFamily:"inherit",resize:"vertical",boxSizing:"border-box",minHeight:120,maxHeight:400}}/>
                <div style={{display:"flex",justifyContent:"flex-end",marginTop:4}}>
                  <button onClick={()=>{
                    const modal = document.createElement("div");
                    modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px)";
                    const box = document.createElement("div");
                    box.style.cssText = `background:${T.card};border-radius:16px;padding:24px;width:100%;max-width:860px;height:80vh;display:flex;flex-direction:column;gap:12px;box-shadow:0 24px 60px rgba(0,0,0,.4)`;
                    box.innerHTML = `
                      <div style="display:flex;align-items:center;justify-content:space-between">
                        <div style="font-weight:800;font-size:16px;color:${T.text}">⚙️ Bot Personality & Behaviour</div>
                        <button id="close-prompt-modal" style="border:none;background:#ef444420;color:#ef4444;border-radius:8px;padding:6px 14px;cursor:pointer;font-size:13px;font-weight:700">✕ Close</button>
                      </div>
                      <div style="font-size:11px;color:${T.textMuted}">Edit your full system prompt below. Changes are saved when you click Save Bot Personality.</div>
                      <textarea id="expanded-prompt" style="flex:1;width:100%;background:${T.input};border:1px solid ${T.inputBorder};border-radius:10px;padding:14px;color:${T.text};font-size:13px;font-family:inherit;resize:none;line-height:1.6;box-sizing:border-box">${systemPrompt}</textarea>
                      <div style="display:flex;gap:10px;justify-content:flex-end">
                        <button id="save-prompt-modal" style="padding:10px 24px;border-radius:10px;border:none;background:${WA_GREEN};color:#fff;font-size:13px;font-weight:700;cursor:pointer">💾 Save Bot Personality</button>
                      </div>
                    `;
                    modal.appendChild(box);
                    document.body.appendChild(modal);
                    document.getElementById("close-prompt-modal").onclick = () => document.body.removeChild(modal);
                    modal.onclick = (e) => { if(e.target === modal) document.body.removeChild(modal); };
                    document.getElementById("save-prompt-modal").onclick = async () => {
                      const newPrompt = document.getElementById("expanded-prompt").value;
                      setSystemPrompt(newPrompt);
                      document.body.removeChild(modal);
                    };
                  }} style={{padding:"5px 12px",borderRadius:8,border:`1px solid ${T.border}`,background:T.card2,color:T.textMuted,fontSize:11,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:4}}>
                    ⛶ Expand
                  </button>
                </div>
                <button onClick={()=>{
                  setConfirmModal({
                    title:"Save Bot Personality?",
                    message:"This updates how the AI bot talks to ALL customers for this client. Changes apply immediately.",
                    icon:"🤖",
                    danger:false,
                    confirmText:"Yes, Save",
                    onConfirm:async()=>{
                      const promptBody = {prompt:systemPrompt};
                      if(kbClinic?.clinic_id) promptBody.clinic_id = kbClinic.clinic_id;
                      await fetch(`${API}/api/knowledge/prompt`,{method:"PATCH",headers:authHeaders(),body:JSON.stringify(promptBody)});
                      const t=document.createElement("div");
                      t.style.cssText="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:99999;background:#fff;border-radius:20px;padding:28px 36px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.2);border:2px solid #86efac";
                      t.innerHTML="<div style='font-size:32px;margin-bottom:8px'>🤖</div><div style='font-weight:800;font-size:16px;color:#166534'>Bot Personality Saved!</div>";
                      document.body.appendChild(t);
                      setTimeout(()=>t.remove(),2500);
                    }
                  });
                }} style={{marginTop:10,padding:"8px 20px",borderRadius:10,border:"none",background:WA_GREEN,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                  💾 Save Bot Personality
                </button>
              </div>

              </>}{/* end kbSubTab===kb */}

              {/* ── AI PROMPT IMPROVER ── */}
              {(isAdmin||permissions?.can_prompt_improver)&&<AIPromptImprover
                T={T} WA_GREEN={WA_GREEN} dark={dark}
                API={API} authHeaders={authHeaders}
                kbClinic={kbClinic}
                systemPrompt={systemPrompt} setSystemPrompt={setSystemPrompt}
                qaData={qaData} setQaData={setQaData}
                fetchKnowledge={fetchKnowledge}
                authToken={authToken}
                isAdmin={isAdmin}
                improverResult={improverResult} setImproverResult={setImproverResult}
                appliedQAIds={appliedQAIds} setAppliedQAIds={setAppliedQAIds}
                improverDays={improverDays} setImproverDays={setImproverDays}
                onViewChat={(name)=>{
                  setTab("crm");
                  const c = contacts.find(x=>(x.name||"").toLowerCase().includes((name||"").toLowerCase()));
                  if(c) selectContact(c);
                }}
              />}

              {/* ── SECTION 2: ADD KNOWLEDGE ── */}
              <div style={{fontWeight:800,fontSize:15,marginBottom:12,color:T.text}}>📥 Add Knowledge to Your Bot</div>
              <div style={{fontSize:12,color:T.textMuted,marginBottom:16,lineHeight:1.6}}>
                The more your bot knows, the better it answers. Add knowledge in 3 ways below.
                Every Q&A you add = one more thing your bot can answer correctly without guessing.
              </div>

              {/* METHOD 1: From Website */}
              <div className="cc" style={{marginBottom:12,border:`2px solid ${WA_GREEN}30`,background:`${WA_GREEN}04`}}>
                <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:12}}>
                  <div style={{width:36,height:36,borderRadius:10,background:`${WA_GREEN}15`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>🌐</div>
                  <div>
                    <div style={{fontWeight:800,fontSize:14}}>Method 1 — Import from Website</div>
                    <div style={{fontSize:11,color:T.textMuted,marginTop:2,lineHeight:1.6}}>
                      Paste your website URL. Our AI will read every page — services, about, FAQ, contact — 
                      and automatically create Q&A pairs for your bot. Takes 20–60 seconds.
                    </div>
                  </div>
                </div>
                {/* Smart status — show existing KB count */}
                {qaData.length>0&&<div style={{padding:"8px 12px",borderRadius:8,background:`${WA_GREEN}10`,border:`1px solid ${WA_GREEN}30`,fontSize:11,color:WA_GREEN,marginBottom:10,display:"flex",alignItems:"center",gap:8}}>
                  <span>✅</span>
                  <span>Your bot already has <strong>{qaData.length} Q&A pairs</strong> from a previous import. Running again will only add NEW entries — duplicates are skipped automatically.</span>
                </div>}
                <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap"}}>
                  <input id="kb-url-input" placeholder="https://yourwebsite.com"
                    style={{flex:1,minWidth:200,background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:10,padding:"10px 14px",color:T.text,fontSize:13,fontFamily:"inherit"}}/>
                  <button onClick={async()=>{
                    const urlEl = document.getElementById("kb-url-input");
                    const urlVal = urlEl.value.trim();
                    if(!urlVal||!urlVal.startsWith("http")) return showToast("Please enter a valid URL starting with https://","#ef4444");
                    const clearEx = document.getElementById("kb-url-clear").checked;
                    const res = document.getElementById("url-import-result");
                    res.innerHTML = `<div style='background:#1e293b;border-radius:12px;padding:16px;color:#fff;text-align:center;margin-top:10px'>
                      <div style='font-size:24px;margin-bottom:8px'>🤖</div>
                      <div style='font-weight:700;font-size:14px;margin-bottom:4px'>Reading your website...</div>
                      <div style='font-size:11px;color:rgba(255,255,255,.6)'>AI is crawling all pages and building Q&A pairs<br/>Please wait 20–60 seconds</div>
                    </div>`;
                    const clinicId = kbClinic?.clinic_id || null;
                    const body = {url:urlVal, clear_existing:clearEx};
                    if(clinicId) body.clinic_id = clinicId;
                    try {
                      const r = await fetch(`${API}/api/knowledge/build-from-url`,{method:"POST",headers:authHeaders(),body:JSON.stringify(body)});
                      const d = await r.json();
                      if(d.error){res.innerHTML=`<div style='color:#ef4444;padding:10px;background:#fef2f2;border-radius:10px;margin-top:10px'>${d.error}</div>`;return;}
                      urlEl.value="";
                      document.getElementById("kb-url-clear").checked=false;

                      // Poll for completion
                      const jobId = d.job_id;
                      const dots = [".", "..", "..."];
                      let dotIdx = 0;
                      const poll = setInterval(async()=>{
                        dotIdx++;
                        const msgs = [
                          "🌐 Reading your website pages",
                          "📄 Extracting service details",
                          "🤖 AI building Q&A pairs",
                          "📚 Saving to knowledge base",
                          "⏳ Almost done"
                        ];
                        const msg = msgs[Math.min(Math.floor(dotIdx/3), msgs.length-1)];
                        res.innerHTML = `<div style='background:#1e293b;border-radius:12px;padding:16px;color:#fff;text-align:center;margin-top:10px'>
                          <div style='font-size:24px;margin-bottom:8px'>🤖</div>
                          <div style='font-weight:700;font-size:14px;margin-bottom:4px'>${msg}${dots[dotIdx%3]}</div>
                          <div style='font-size:11px;color:rgba(255,255,255,.6)'>This takes 30–90 seconds depending on site size</div>
                          <div style='height:3px;background:rgba(255,255,255,.1);border-radius:2px;margin-top:12px;overflow:hidden'>
                            <div style='height:3px;background:#25D366;border-radius:2px;width:${Math.min(95,dotIdx*5)}%;transition:width .5s'></div>
                          </div>
                        </div>`;
                        try {
                          const pr = await fetch(`${API}/api/knowledge/build-status/${jobId}`,{headers:authHeaders()});
                          const pd = await pr.json();
                          if(pd.status==="done"){
                            clearInterval(poll);
                            res.innerHTML = `<div style='background:#f0fdf4;border:2px solid #86efac;border-radius:12px;padding:16px;text-align:center;margin-top:10px'>
                              <div style='font-size:24px;margin-bottom:6px'>🎉</div>
                              <div style='font-size:18px;font-weight:900;color:#15803d'>${pd.built} Q&A Pairs Added!</div>
                              <div style='font-size:11px;color:#374151;margin-top:4px'>Scroll down to see your new knowledge entries</div>
                            </div>`;
                            fetchKnowledge(kbClinic?.clinic_id||null);
                          } else if(pd.status==="error"){
                            clearInterval(poll);
                            res.innerHTML = `<div style='color:#ef4444;padding:10px;background:#fef2f2;border-radius:10px;margin-top:10px'>❌ ${pd.error||"Build failed"}</div>`;
                          }
                        } catch{}
                      }, 3000);

                      // Safety timeout after 3 mins
                      setTimeout(()=>{
                        clearInterval(poll);
                        res.innerHTML += `<div style='font-size:11px;color:#6b7280;margin-top:8px;text-align:center'>Still running in background — refresh KB in a minute to see results</div>`;
                        fetchKnowledge(kbClinic?.clinic_id||null);
                      }, 180000);

                    } catch(e) {
                      res.innerHTML = `<div style='color:#ef4444;padding:10px;background:#fef2f2;border-radius:10px;margin-top:10px'>Failed: ${e.message}</div>`;
                    }
                  }} style={{padding:"10px 18px",borderRadius:10,border:"none",background:WA_GREEN,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                    🌐 Build from Website
                  </button>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8,fontSize:11,color:T.textMuted}}>
                  <input type="checkbox" id="kb-url-clear" style={{width:14,height:14,cursor:"pointer"}}/>
                  <label htmlFor="kb-url-clear" style={{cursor:"pointer"}}>Clear existing Q&A before importing (fresh rebuild)</label>
                </div>
                <div id="url-import-result"/>
              </div>

              {/* METHOD 2: Paste Text or Upload Doc */}
              <div className="cc" style={{marginBottom:12,border:`1.5px solid #6366f120`}}>
                <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:12}}>
                  <div style={{width:36,height:36,borderRadius:10,background:"#eef2ff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>📄</div>
                  <div>
                    <div style={{fontWeight:800,fontSize:14}}>Method 2 — Paste Text or Upload Document</div>
                    <div style={{fontSize:11,color:T.textMuted,marginTop:2,lineHeight:1.6}}>
                      Paste text directly <strong>or</strong> upload a PDF/Word document (brochure, price list, FAQ). 
                      Tell the AI what to focus on and it will extract Q&A pairs automatically.
                    </div>
                  </div>
                </div>

                {/* Upload doc OR paste text — tabs */}

                <div style={{display:"flex",gap:6,marginBottom:12}}>
                  {[{id:"paste",label:"✍️ Paste Text"},{id:"upload",label:"📎 Upload Document"}].map(t=>(
                    <button key={t.id} id={`m2tab-${t.id}`} onClick={()=>{
                      document.getElementById("m2-paste").style.display = t.id==="paste"?"block":"none";
                      document.getElementById("m2-upload").style.display = t.id==="upload"?"block":"none";
                      document.querySelectorAll("[id^=m2tab-]").forEach(b=>{
                        b.style.background = b.id===`m2tab-${t.id}`?"#6366f1":"transparent";
                        b.style.color = b.id===`m2tab-${t.id}`?"#fff":T.textMuted;
                        b.style.border = b.id===`m2tab-${t.id}`?"1px solid #6366f1":`1px solid ${T.border}`;
                      });
                    }} style={{padding:"6px 14px",borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",
                      background:t.id==="paste"?"#6366f1":"transparent",
                      color:t.id==="paste"?"#fff":T.textMuted,
                      border:t.id==="paste"?"1px solid #6366f1":`1px solid ${T.border}`}}>
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* Paste text area */}
                <div id="m2-paste">
                  <textarea id="bulk-import-text" rows={4}
                    placeholder="Paste your text here... e.g.&#10;Our clinic is open Tuesday to Sunday, 9AM to 6PM.&#10;Consultation fee is RM100 which includes blood test and HbA1C.&#10;We treat diabetes, kidney disease, and osteoarthritis..."
                    style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:10,padding:"10px 14px",color:T.text,fontSize:12,fontFamily:"inherit",resize:"vertical",boxSizing:"border-box",marginBottom:8}}/>
                </div>

                {/* Upload doc area */}
                <div id="m2-upload" style={{display:"none"}}>
                  <div style={{padding:"20px",borderRadius:10,border:`2px dashed ${T.border}`,background:T.card2,textAlign:"center",marginBottom:8}}>
                    <div style={{fontSize:32,marginBottom:8}}>📎</div>
                    <div style={{fontWeight:600,fontSize:13,marginBottom:4}}>Upload PDF or Word Document</div>
                    <div style={{fontSize:11,color:T.textMuted,marginBottom:12}}>Brochure, price list, FAQ, treatment guide — any document</div>
                    <label style={{display:"inline-flex",alignItems:"center",gap:6,padding:"8px 16px",borderRadius:8,border:`1px solid #6366f1`,background:"#6366f110",cursor:"pointer",fontSize:12,fontWeight:600,color:"#6366f1"}}>
                      📂 Choose File (PDF or DOCX)
                      <input type="file" accept=".pdf,.doc,.docx,.txt" style={{display:"none"}} onChange={async(e)=>{
                        const file = e.target.files[0];
                        if(!file) return;
                        const statusEl = document.getElementById("m2-upload-status");
                        statusEl.innerHTML = `<div style='color:#6366f1;font-size:12px;padding:6px'>⏳ Reading ${file.name}...</div>`;
                        try {
                          let text = "";
                          if(file.name.endsWith(".txt")) {
                            text = await file.text();
                          } else if(file.name.endsWith(".pdf")) {
                            // Use FileReader to get base64 then extract text
                            const arrBuf = await file.arrayBuffer();
                            const bytes = new Uint8Array(arrBuf);
                            // Simple text extraction from PDF bytes
                            const decoder = new TextDecoder("utf-8","ignore");
                            const raw = decoder.decode(bytes);
                            // Extract text between stream markers
                            // Simple text extraction
                            text = raw.replace(/[^\x20-\x7E\n]/g," ").replace(/  +/g," ").slice(0,8000);
                          } else {
                            // .docx — read as text, strip XML
                            const arrBuf = await file.arrayBuffer();
                            const decoder = new TextDecoder("utf-8","ignore");
                            const raw = decoder.decode(new Uint8Array(arrBuf));
                            text = raw.replace(/<[^>]+>/g," ").replace(/[^\x20-\x7E\n]/g," ").replace(/  +/g," ");
                          }
                          // Put text into paste area and switch to paste tab
                          const pasteEl = document.getElementById("bulk-import-text");
                          pasteEl.value = text.slice(0,8000);
                          statusEl.innerHTML = `<div style='color:#166534;font-size:12px;padding:6px;background:#f0fdf4;border-radius:6px'>✅ ${file.name} loaded — ${text.length} characters extracted. You can review the text in the Paste tab, then click Extract.</div>`;
                        } catch(err) {
                          statusEl.innerHTML = `<div style='color:#ef4444;font-size:12px;padding:6px'>❌ Could not read file: ${err.message}</div>`;
                        }
                      }}/>
                    </label>
                    <div id="m2-upload-status" style={{marginTop:8}}/>
                  </div>
                </div>

                {/* Instruction + Extract button — shared for both tabs */}
                <input id="bulk-import-instruction" placeholder="Optional: Tell AI what to focus on — e.g. 'Focus on pricing and booking' or 'Extract treatment FAQs only'"
                  style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:10,padding:"9px 14px",color:T.text,fontSize:12,fontFamily:"inherit",marginBottom:10,boxSizing:"border-box"}}/>
                <button onClick={async()=>{
                  const textEl = document.getElementById("bulk-import-text");
                  const instrEl = document.getElementById("bulk-import-instruction");
                  const text = textEl.value.trim();
                  if(!text) return showToast("Please paste some text or upload a document first","#ef4444");
                  const instruction = instrEl.value.trim();
                  const res = document.getElementById("bulk-result");
                  res.innerHTML = "<div style='color:#6366f1;font-size:12px;padding:8px'>🤖 AI is reading your content and creating Q&A pairs...</div>";
                  const r = await fetch(`${API}/api/knowledge/bulk-import`,{method:"POST",headers:authHeaders(),body:JSON.stringify({text, instruction})});
                  const d = await r.json();
                  if(d.error){res.innerHTML=`<div style='color:#ef4444;padding:10px;background:#fef2f2;border-radius:10px'>${d.error}</div>`;return;}
                  textEl.value=""; instrEl.value="";
                  res.innerHTML = `<div style='background:#f0fdf4;border:1.5px solid #86efac;border-radius:10px;padding:12px;margin-top:6px'>
                    <div style='font-weight:700;color:#15803d;margin-bottom:8px'>✅ ${d.imported} Q&A pairs added!</div>
                    ${(d.pairs||[]).slice(0,5).map(p=>`<div style='padding:6px 8px;background:#fff;border-radius:6px;margin-bottom:4px;font-size:11px'><strong style='color:#15803d'>Q:</strong> ${p.question}<br/><span style='color:#374151'>A: ${p.answer}</span></div>`).join("")}
                    ${d.imported>5?`<div style='font-size:10px;color:#6b7280;margin-top:4px'>...and ${d.imported-5} more. Scroll down to see all.</div>`:""}
                  </div>`;
                  fetchKnowledge();
                }} style={{padding:"9px 20px",borderRadius:10,border:"none",background:"#6366f1",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                  🤖 Extract Q&A with AI
                </button>
                <div id="bulk-result" style={{marginTop:4}}/>
              </div>

              {/* METHOD 3: Manual Q&A */}
              <div className="cc" style={{marginBottom:20}}>
                <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:12}}>
                  <div style={{width:36,height:36,borderRadius:10,background:"#fffbeb",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>✍️</div>
                  <div>
                    <div style={{fontWeight:800,fontSize:14}}>Method 3 — Add Manually</div>
                    <div style={{fontSize:11,color:T.textMuted,marginTop:2,lineHeight:1.6}}>
                      Type a specific question and answer directly. 
                      Best for adding very specific info like pricing, a doctor's name, or a special offer.
                    </div>
                  </div>
                </div>
                <input value={newQ} onChange={e=>setNewQ(e.target.value)}
                  placeholder="Question — e.g. How much is the diabetes consultation?"
                  style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:10,padding:"9px 14px",color:T.text,fontSize:12,marginBottom:8,boxSizing:"border-box"}}/>
                <textarea value={newA} onChange={e=>setNewA(e.target.value)}
                  placeholder="Answer — e.g. Our diabetes consultation is RM100 and includes a full assessment, blood test, and HbA1C check."
                  rows={2}
                  style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:10,padding:"9px 14px",color:T.text,fontSize:12,fontFamily:"inherit",resize:"vertical",marginBottom:10,boxSizing:"border-box"}}/>
                <button onClick={async()=>{
                  if(!newQ.trim()||!newA.trim()) return showToast("Please fill in both question and answer","#ef4444");
                  await fetch(`${API}/api/knowledge/qa`,{method:"POST",headers:authHeaders(),body:JSON.stringify({question:newQ.trim(),answer:newA.trim()})});
                  setNewQ(""); setNewA(""); fetchKnowledge();
                }} style={{padding:"9px 20px",borderRadius:10,border:"none",background:"#f59e0b",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                  ➕ Add Q&A
                </button>
              </div>

              {/* ── SECTION 3: CURRENT KNOWLEDGE ── */}
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap",gap:8}}>
                <div>
                  <div style={{fontWeight:800,fontSize:15}}>📋 Current Knowledge ({qaData.length} entries)</div>
                  <div style={{fontSize:11,color:T.textMuted,marginTop:2}}>These are all the things your bot currently knows.</div>
                </div>
                {qaData.length>0&&<div style={{display:"flex",alignItems:"center",gap:8}}>
                  {/* Select All toggle */}
                  <button onClick={()=>{
                    if(selectedQAs.size===qaData.length) setSelectedQAs(new Set());
                    else setSelectedQAs(new Set(qaData.map(q=>q.id)));
                  }} style={{padding:"5px 12px",borderRadius:8,border:`1px solid ${T.border}`,background:T.card2,color:T.text,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                    {selectedQAs.size===qaData.length?"☐ Deselect All":"☑ Select All"}
                  </button>
                  {/* Delete selected */}
                  {selectedQAs.size>0&&<button onClick={()=>{
                    setConfirmModal({
                      title:`Delete ${selectedQAs.size} Entries?`,
                      message:`You are about to permanently delete ${selectedQAs.size} KB ${selectedQAs.size===1?"entry":"entries"}. Your bot will no longer be able to answer questions based on this knowledge. This cannot be undone.`,
                      icon:"🗑️",
                      danger:true,
                      confirmText:`Yes, Delete ${selectedQAs.size} Entries`,
                      onConfirm:async()=>{
                        // Show progress overlay
                        const ids = Array.from(selectedQAs);
                        const overlay = document.createElement("div");
                        overlay.id = "kb-delete-overlay";
                        overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center;";
                        overlay.innerHTML = `<div style="background:#1e293b;border-radius:16px;padding:28px 36px;text-align:center;color:#fff;min-width:280px">
                          <div style="font-size:32px;margin-bottom:12px">🗑️</div>
                          <div style="font-weight:700;font-size:15px;margin-bottom:6px">Deleting entries...</div>
                          <div id="kb-del-progress" style="font-size:12px;color:rgba(255,255,255,.6)">0 of ${ids.length}</div>
                          <div style="height:4px;background:rgba(255,255,255,.1);border-radius:2px;margin-top:14px;overflow:hidden">
                            <div id="kb-del-bar" style="height:4px;background:#25D366;border-radius:2px;width:0%;transition:width .3s"></div>
                          </div>
                        </div>`;
                        document.body.appendChild(overlay);
                        let done = 0;
                        for(const id of ids){
                          try {
                            const r = await fetch(`${API}/api/knowledge/qa/${id}`,{method:"DELETE",headers:authHeaders()});
                            if(r.ok) done++;
                          } catch(e) { console.error("Delete failed for",id,e); }
                          const pct = Math.round((done/ids.length)*100);
                          const prog = document.getElementById("kb-del-progress");
                          const bar = document.getElementById("kb-del-bar");
                          if(prog) prog.textContent = `${done} of ${ids.length}`;
                          if(bar) bar.style.width = pct + "%";
                        }
                        document.body.removeChild(overlay);
                        setSelectedQAs(new Set());
                        fetchKnowledge();
                      }
                    });
                  }} style={{padding:"5px 14px",borderRadius:8,border:"1px solid #ef444440",background:"#ef444410",color:"#ef4444",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                    🗑️ Delete ({selectedQAs.size})
                  </button>}
                </div>}
              </div>

              {qaData.length===0&&<div style={{textAlign:"center",padding:"32px 20px",background:T.card,borderRadius:14,border:`2px dashed ${T.border}`,color:T.textMuted}}>
                <div style={{fontSize:32,marginBottom:8}}>📭</div>
                <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>No knowledge yet</div>
                <div style={{fontSize:12}}>Use one of the methods above to add knowledge to your bot</div>
              </div>}

              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {qaData.map((qa,i)=>{
                  const isSelected = selectedQAs.has(qa.id);
                  return (
                    <div key={qa.id} className="cc" ref={el=>qaRefs.current[qa.id]=el}
                      style={{padding:12,
                        borderLeft:highlightedQA===qa.id?`3px solid ${WA_GREEN}`:isSelected?`3px solid #ef4444`:"3px solid transparent",
                        background:isSelected?`#ef444408`:undefined,
                        marginBottom:0}}>
                      {editingId===qa.id
                        ?<div>
                          <input value={editQ} onChange={e=>setEditQ(e.target.value)}
                            style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:8,padding:"7px 10px",color:T.text,fontSize:12,marginBottom:6,boxSizing:"border-box"}}/>
                          <textarea value={editA} onChange={e=>setEditA(e.target.value)} rows={2}
                            style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:8,padding:"7px 10px",color:T.text,fontSize:12,fontFamily:"inherit",resize:"vertical",marginBottom:8,boxSizing:"border-box"}}/>
                          <div style={{display:"flex",gap:6}}>
                            <button onClick={()=>saveEdit(qa.id)} style={{padding:"5px 14px",borderRadius:8,border:"none",background:WA_GREEN,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Save</button>
                            <button onClick={()=>setEditingId(null)} style={{padding:"5px 14px",borderRadius:8,border:`1px solid ${T.border}`,background:T.card2,color:T.textMuted,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
                          </div>
                        </div>
                        :<div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                          {/* Checkbox */}
                          <div onClick={()=>{
                            const next = new Set(selectedQAs);
                            if(next.has(qa.id)) next.delete(qa.id); else next.add(qa.id);
                            setSelectedQAs(next);
                          }} style={{width:18,height:18,borderRadius:4,border:`2px solid ${isSelected?"#ef4444":T.border}`,
                            background:isSelected?"#ef4444":"transparent",
                            display:"flex",alignItems:"center",justifyContent:"center",
                            cursor:"pointer",flexShrink:0,marginTop:2}}>
                            {isSelected&&<span style={{color:"#fff",fontSize:10,fontWeight:700}}>✓</span>}
                          </div>
                          <div style={{width:22,height:22,borderRadius:6,background:`${WA_GREEN}15`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:WA_GREEN,flexShrink:0}}>{i+1}</div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                              <div style={{fontWeight:700,fontSize:12,color:T.text}}>{qa.question}</div>
                              {qa.is_static&&<span style={{fontSize:9,padding:"1px 6px",borderRadius:6,background:"#7c3aed",color:"#fff",fontWeight:700,flexShrink:0}}>STATIC</span>}
                            </div>
                            <div style={{fontSize:11,color:T.textMuted,lineHeight:1.5}}>{qa.answer}</div>
                          </div>
                          <div style={{display:"flex",gap:3,flexShrink:0,alignItems:"center"}}>
                            {/* Static toggle */}
                            <div onClick={async(e)=>{
                              e.stopPropagation();
                              const newVal = !qa.is_static;
                              // Optimistic update — update UI immediately
                              setQaData(prev=>prev.map(q=>q.id===qa.id?{...q,is_static:newVal}:q));
                              try {
                                const r = await fetch(`${API}/api/knowledge/qa/${qa.id}`,{method:"PATCH",headers:authHeaders(),body:JSON.stringify({is_static:newVal})});
                                if(!r.ok) {
                                  // Revert if failed
                                  setQaData(prev=>prev.map(q=>q.id===qa.id?{...q,is_static:!newVal}:q));
                                }
                              } catch {
                                setQaData(prev=>prev.map(q=>q.id===qa.id?{...q,is_static:!newVal}:q));
                              }
                            }} title={qa.is_static?"Static: exact answer sent":"Reference: AI uses as guide"}
                              style={{width:32,height:18,borderRadius:9,cursor:"pointer",
                                background:qa.is_static?"#7c3aed":"#cbd5e1",
                                position:"relative",transition:"background .2s",flexShrink:0}}>
                              <div style={{position:"absolute",top:2,left:qa.is_static?15:2,width:14,height:14,borderRadius:"50%",background:"#fff",transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,.2)"}}/>
                            </div>
                            <button onClick={()=>{setEditingId(qa.id);setEditQ(qa.question);setEditA(qa.answer);}} style={{padding:"3px 8px",borderRadius:7,border:`1px solid ${WA_GREEN}40`,background:`${WA_GREEN}10`,color:WA_GREEN,fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>✏️</button>
                            <button onClick={()=>{
                              setConfirmModal({
                                title:"Delete this entry?",
                                message:`"${qa.question.slice(0,80)}"\n\nYour bot will no longer know this. Cannot be undone.`,
                                icon:"🗑️",danger:true,confirmText:"Yes, Delete",
                                onConfirm:async()=>{ await fetch(`${API}/api/knowledge/qa/${qa.id}`,{method:"DELETE",headers:authHeaders()}); fetchKnowledge(); }
                              });
                            }} style={{padding:"3px 8px",borderRadius:7,border:"1px solid #ef444430",background:"#ef444408",color:"#ef4444",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>✕</button>
                          </div>
                        </div>}
                    </div>
                  );
                })}
              </div>

            </div>}
          </div>
        </div>}

        {/* ══ SETTINGS ══ */}
        {/* ══ INTEGRATIONS ══ */}

        {tab==="broadcast"&&<div style={{flex:1,display:"flex",overflow:"hidden",background:T.bg}}>

          {/* Main content — mockup style */}
          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>

            {/* Page header — always visible, pills let admin select client */}
            <div className="nx-page-header" style={{flexShrink:0}}>
              <i className="ti ti-speakerphone" style={{fontSize:20,color:WA_GREEN}}/>
              <div>
                <div className="nx-page-title">Broadcast</div>
                <div className="nx-page-sub">{broadcastClinic?broadcastClinic.company_name||broadcastClinic.name:"Send WhatsApp templates to multiple contacts"}</div>
              </div>
              {isAdmin&&adminOverview.length>0&&<div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center",marginLeft:12}}>
                {adminOverview.filter((c,i,a)=>a.findIndex(x=>x.clinic_id===c.clinic_id)===i).map(c=>{
                  const sel = broadcastClinic?.clinic_id===c.clinic_id;
                  return <div key={c.clinic_id} onClick={()=>{
                    if(sel){setBroadcastClinic(null);setTemplates([]);setSelectedTemplate(null);setBroadcastContacts([]);setBroadcastProgress(null);}
                    else{setBroadcastClinic(c);setTemplates([]);setSelectedTemplate(null);setBroadcastContacts([]);setBroadcastProgress(null);fetchTemplates(c.clinic_id);}
                  }} style={{display:"flex",alignItems:"center",gap:5,padding:"3px 10px",borderRadius:20,cursor:"pointer",
                    border:`1px solid ${sel?WA_GREEN:T.border}`,background:sel?`${WA_GREEN}15`:"transparent",
                    opacity:(c.active===false||c.active===0)?0.5:1}}>
                    <div style={{width:14,height:14,borderRadius:3,overflow:"hidden",background:`${WA_GREEN}15`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      {c.logo_url?<img src={c.logo_url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:<span style={{fontSize:9}}>🏢</span>}
                    </div>
                    <span style={{fontSize:11,fontWeight:700,color:sel?WA_GREEN:T.text}}>{c.company_name||c.username}</span>
                  </div>;
                })}
              </div>}
              <div style={{marginLeft:"auto",display:"flex",gap:8}}>
                <button onClick={()=>{setBroadcastSubTab("send");setCreateTemplateStep(1);setCreateTemplateResult(null);}}
                  className={`nx-btn${broadcastSubTab==="send"?" primary":""}`}>
                  <i className="ti ti-send" style={{fontSize:14}}/> Send Broadcast
                </button>
                <button onClick={()=>{setBroadcastSubTab("history");}}
                  className={`nx-btn${broadcastSubTab==="history"?" primary":""}`}>
                  <i className="ti ti-history" style={{fontSize:14}}/> History
                </button>
                <button onClick={()=>{setBroadcastSubTab("create");setCreateTemplateStep(1);setCreateTemplateResult(null);}}
                  className={`nx-btn${broadcastSubTab==="create"?" primary":""}`}>
                  <i className="ti ti-plus" style={{fontSize:14}}/> Create Template
                </button>
              </div>
            </div>

            {(!isAdmin||(isAdmin&&broadcastClinic))&&<>

            {/* ── SEND BROADCAST — two column layout like mockup ── */}
            {broadcastSubTab==="send"&&<div style={{flex:1,overflowY:"auto",padding:"20px"}}><div style={{display:"flex",gap:16,alignItems:"flex-start",height:"100%"}}>

            {/* LEFT COLUMN — Steps */}
            <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:12}}>

              {/* STEP 1 — Template */}
              <div style={{background:T.card,borderRadius:12,border:`1px solid ${T.border}`,overflow:"hidden"}}>
                <div style={{padding:"12px 16px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <i className="ti ti-template" style={{fontSize:16,color:WA_GREEN}}/>
                    <span style={{fontWeight:600,fontSize:13,color:T.text}}>1. Select Template</span>
                    {selectedTemplate&&<span style={{fontSize:11,background:`${WA_GREEN}15`,color:WA_GREEN,padding:"2px 8px",borderRadius:20,fontWeight:600}}>✓ {selectedTemplate.template_name}</span>}
                  </div>
                  <button onClick={async()=>{
                    const clinicId=isAdmin&&broadcastClinic?(broadcastClinic.clinic_id||broadcastClinic.id):null;
                    const pending=templates.filter(t=>t.status==="pending");
                    for(const t of pending){try{await fetch(clinicId?`${API}/api/admin/clients/${clinicId}/templates/status?name=${t.template_name}`:`${API}/api/templates/status?name=${t.template_name}`,{headers:authHeaders()});}catch(e){}}
                    fetchTemplates(clinicId);
                  }} className="nx-btn" style={{padding:"4px 10px",fontSize:11}}>
                    <i className="ti ti-refresh" style={{fontSize:12}}/> Refresh
                  </button>
                </div>
                {templates.length===0?
                  <div style={{padding:"20px",textAlign:"center",color:T.textMuted,fontSize:12}}>No templates yet — click <strong>Create Template</strong> to add one.</div>:
                  <div>{templates.map((t,i)=>{
                    const isSelected=selectedTemplate?.id===t.id;
                    const canSelect=t.status==="approved";
                    const statusColor=t.status==="approved"?"#15803d":t.status==="rejected"?"#dc2626":"#b45309";
                    const statusBg=t.status==="approved"?"#f0fdf4":t.status==="rejected"?"#fef2f2":"#fffbeb";
                    return <div key={t.id} onClick={()=>canSelect&&setSelectedTemplate(isSelected?null:t)}
                      style={{display:"flex",alignItems:"center",gap:12,padding:"11px 16px",
                        borderBottom:i<templates.length-1?`1px solid ${T.border}`:"none",
                        background:isSelected?`${WA_GREEN}08`:"transparent",cursor:canSelect?"pointer":"default",transition:"background .15s"}}
                      onMouseEnter={e=>{if(!isSelected&&canSelect)e.currentTarget.style.background=T.card2}}
                      onMouseLeave={e=>{if(!isSelected)e.currentTarget.style.background=isSelected?`${WA_GREEN}08`:"transparent"}}>
                      <div style={{width:18,height:18,borderRadius:"50%",border:`2px solid ${isSelected?WA_GREEN:T.border}`,
                        background:isSelected?WA_GREEN:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                        {isSelected&&<div style={{width:6,height:6,borderRadius:"50%",background:"#fff"}}/>}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:600,fontSize:13,color:T.text}}>{t.template_name}</div>
                        {t.body_text&&<div style={{fontSize:11,color:T.textMuted,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.body_text.slice(0,80)}</div>}
                      </div>
                      <span style={{fontSize:10,fontWeight:600,padding:"3px 8px",borderRadius:20,background:statusBg,color:statusColor,flexShrink:0}}>
                        {t.status==="approved"?"✅ Approved":t.status==="rejected"?"❌ Rejected":"⏳ Pending"}
                      </span>
                      <button onClick={async e=>{e.stopPropagation();
                        const clinicId=isAdmin&&broadcastClinic?(broadcastClinic.clinic_id||broadcastClinic.id):null;
                        await fetch(`${API}/api/templates/${t.id}`,{method:"DELETE",headers:authHeaders()});
                        fetchTemplates(clinicId);if(selectedTemplate?.id===t.id)setSelectedTemplate(null);
                      }} style={{width:24,height:24,border:"none",background:"transparent",color:T.textFaint,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",borderRadius:6,flexShrink:0}}
                      onMouseEnter={e=>e.currentTarget.style.color="#ef4444"}
                      onMouseLeave={e=>e.currentTarget.style.color=T.textFaint}>
                        <i className="ti ti-trash" style={{fontSize:13}}/>
                      </button>
                    </div>;
                  })}</div>
                }
              </div>

              {/* STEP 2 — Contacts */}
              <div style={{background:T.card,borderRadius:12,border:`1px solid ${T.border}`,overflow:"hidden"}}>
                <div style={{padding:"12px 16px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <i className="ti ti-users" style={{fontSize:16,color:WA_GREEN}}/>
                    <span style={{fontWeight:600,fontSize:13,color:T.text}}>2. Select Contacts</span>
                    <span style={{fontSize:11,color:T.textMuted}}>({contacts.length} total)</span>
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>setBroadcastContacts(contacts.map(c=>({name:c.name||c.phone,phone:c.phone})))} className="nx-btn" style={{padding:"4px 10px",fontSize:11}}>All</button>
                    <button onClick={()=>setBroadcastContacts([])} className="nx-btn" style={{padding:"4px 10px",fontSize:11}}>Clear</button>
                    <button onClick={()=>document.getElementById("broadcast-file-input").click()} className="nx-btn" style={{padding:"4px 10px",fontSize:11}}><i className="ti ti-paperclip" style={{fontSize:12}}/></button>
                  </div>
                </div>
                <input type="file" accept=".csv,.txt" id="broadcast-file-input" style={{display:"none"}} onChange={e=>{
                  const file=e.target.files[0]; if(!file) return;
                  const reader=new FileReader();
                  reader.onload=ev=>{
                    const lines=ev.target.result.split("\n").filter(Boolean);
                    const newContacts=[];
                    lines.forEach(line=>{
                      const parts=line.split(",");
                      const phone=(parts[1]||parts[0]||"").trim().replace(/[^0-9+]/g,"");
                      const name=(parts[0]||"").trim().replace(/"/g,"");
                      if(phone.length>=7) newContacts.push({name:name||phone,phone});
                    });
                    setBroadcastContacts(prev=>{
                      const existing=new Set(prev.map(x=>x.phone));
                      return [...prev,...newContacts.filter(x=>!existing.has(x.phone))];
                    });
                  };
                  reader.readAsText(file);
                }}/>
                <div style={{padding:"10px 14px",borderBottom:`1px solid ${T.border}`}}>
                  <div className="nx-search">
                    <i className="ti ti-search" style={{fontSize:14,color:T.textFaint}}/>
                    <input value={broadcastSearch||""} onChange={e=>setBroadcastSearch(e.target.value)} placeholder="Search by name or number..."/>
                    {broadcastSearch&&<i className="ti ti-x" onClick={()=>setBroadcastSearch("")} style={{fontSize:12,color:T.textMuted,cursor:"pointer"}}/>}
                  </div>
                </div>
                <div style={{maxHeight:220,overflowY:"auto"}}>
                  {(()=>{
                    const q=(broadcastSearch||"").toLowerCase();
                    const filtered=contacts.filter(c=>{
                      if(isAdmin && broadcastClinic) {
                        const cClinicId = String(c.clinicId||c.clinic_id||"");
                        const bClinicId = String(broadcastClinic.clinic_id||broadcastClinic.id||"");
                        if(cClinicId && bClinicId && cClinicId!==bClinicId) return false;
                      }
                      return (c.name||"").toLowerCase().includes(q)||c.phone?.includes(q);
                    });
                    const phoneMatch=/^[0-9+\s\-()]{7,}$/.test(broadcastSearch||"");
                    const exactMatch=contacts.some(c=>c.phone===broadcastSearch||c.phone==="+"+broadcastSearch);
                    return <>
                      {filtered.map((c,i,arr)=>{
                        const isChecked=broadcastContacts.some(x=>x.phone===c.phone);
                        const initials=(c.name||c.phone||"?").slice(0,2).toUpperCase();
                        return <div key={c.phone||i} onClick={()=>{
                          if(isChecked) setBroadcastContacts(p=>p.filter(x=>x.phone!==c.phone));
                          else setBroadcastContacts(p=>[...p,{name:c.name||c.phone,phone:c.phone}]);
                        }} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 14px",cursor:"pointer",
                          background:isChecked?`${WA_GREEN}08`:"transparent",
                          borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none",transition:"background .1s"}}
                        onMouseEnter={e=>{if(!isChecked)e.currentTarget.style.background=T.card2}}
                        onMouseLeave={e=>{if(!isChecked)e.currentTarget.style.background="transparent"}}>
                          <div style={{width:16,height:16,borderRadius:4,border:`2px solid ${isChecked?WA_GREEN:T.border}`,
                            background:isChecked?WA_GREEN:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                            {isChecked&&<i className="ti ti-check" style={{fontSize:10,color:"#fff"}}/>}
                          </div>
                          <div style={{width:32,height:32,borderRadius:"50%",background:getColor(c.name||"?"),display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#fff",flexShrink:0}}>{initials}</div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:13,fontWeight:600,color:T.text}}>{c.name||c.phone}</div>
                            <div style={{fontSize:11,color:T.textMuted}}>{c.phone}</div>
                          </div>
                          {c.lead==="hot"&&<span style={{fontSize:9,background:"#fef2f2",color:"#dc2626",padding:"2px 6px",borderRadius:10,fontWeight:600}}>🔥</span>}
                        </div>;
                      })}
                      {phoneMatch&&!exactMatch&&<div onClick={()=>{setBroadcastContacts(p=>[...p,{name:broadcastSearch,phone:broadcastSearch}]);setBroadcastSearch("");}}
                        style={{display:"flex",alignItems:"center",gap:10,padding:"9px 14px",cursor:"pointer",background:`${WA_GREEN}08`}}>
                        <div style={{width:32,height:32,borderRadius:"50%",background:`${WA_GREEN}20`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                          <i className="ti ti-plus" style={{fontSize:14,color:WA_GREEN}}/>
                        </div>
                        <div>
                          <div style={{fontSize:12,fontWeight:600,color:WA_GREEN}}>Add "{broadcastSearch}"</div>
                          <div style={{fontSize:10,color:T.textMuted}}>Send to this number</div>
                        </div>
                      </div>}
                      {filtered.length===0&&!phoneMatch&&<div style={{padding:"16px",fontSize:12,color:T.textMuted,textAlign:"center"}}>No contacts found</div>}
                    </>;
                  })()}
                </div>
                {broadcastContacts.length>0&&<div style={{padding:"8px 14px",borderTop:`1px solid ${T.border}`}}>
                  <div style={{fontSize:11,fontWeight:600,color:T.textMuted,marginBottom:6}}><i className="ti ti-check" style={{fontSize:11,marginRight:4,color:WA_GREEN}}/>{broadcastContacts.length} contact{broadcastContacts.length!==1?"s":""} selected</div>
                  <div style={{maxHeight:120,overflowY:"auto",display:"flex",flexWrap:"wrap",gap:4}}>
                    {broadcastContacts.map((c,i)=>(
                      <div key={i} style={{display:"flex",alignItems:"center",gap:4,background:T.card2,borderRadius:20,padding:"3px 8px 3px 4px",fontSize:11}}>
                        <div style={{width:18,height:18,borderRadius:"50%",background:`${WA_GREEN}20`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:700,color:WA_GREEN}}>{(c.name||c.phone||"?").slice(0,1).toUpperCase()}</div>
                        <span style={{color:T.text,maxWidth:80,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.name||c.phone}</span>
                        <i className="ti ti-x" onClick={()=>setBroadcastContacts(p=>p.filter((_,j)=>j!==i))} style={{fontSize:10,color:T.textMuted,cursor:"pointer"}}/>
                      </div>
                    ))}
                  </div>
                </div>}
              </div>

              {/* STEP 3 — Send */}
              <div style={{background:T.card,borderRadius:12,border:`1px solid ${T.border}`,overflow:"hidden"}}>
                <div style={{padding:"12px 16px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:8}}>
                  <i className="ti ti-send" style={{fontSize:16,color:WA_GREEN}}/>
                  <span style={{fontWeight:600,fontSize:13,color:T.text}}>3. Send</span>
                </div>
                <div style={{padding:"14px 16px"}}>
                  {/* Send Now / Schedule toggle */}
                  <div style={{display:"flex",gap:4,background:T.card2,borderRadius:8,padding:3,marginBottom:14}}>
                    <button onClick={()=>setScheduleMode(false)}
                      style={{flex:1,padding:"7px",borderRadius:6,border:"none",fontFamily:"inherit",fontSize:12,fontWeight:600,cursor:"pointer",transition:"all .15s",
                        background:!scheduleMode?T.card:"transparent",color:!scheduleMode?T.text:T.textMuted,
                        boxShadow:!scheduleMode?"0 1px 3px rgba(0,0,0,.08)":"none"}}>
                      <i className="ti ti-send" style={{fontSize:12,marginRight:4}}/>Send Now
                    </button>
                    <button onClick={()=>setScheduleMode(true)}
                      style={{flex:1,padding:"7px",borderRadius:6,border:"none",fontFamily:"inherit",fontSize:12,fontWeight:600,cursor:"pointer",transition:"all .15s",
                        background:scheduleMode?T.card:"transparent",color:scheduleMode?T.text:T.textMuted,
                        boxShadow:scheduleMode?"0 1px 3px rgba(0,0,0,.08)":"none"}}>
                      <i className="ti ti-clock" style={{fontSize:12,marginRight:4}}/>Schedule
                    </button>
                  </div>

                  {/* Schedule date/time picker */}
                  {scheduleMode&&<div style={{marginBottom:14,display:"flex",gap:8,flexWrap:"wrap"}}>
                    <div style={{flex:1,minWidth:120}}>
                      <label style={{fontSize:11,fontWeight:600,color:T.textMuted,display:"block",marginBottom:4}}>Date</label>
                      <input type="date" value={scheduleAt.split("T")[0]||""} min={new Date().toISOString().split("T")[0]}
                        onChange={e=>setScheduleAt(prev=>`${e.target.value}T${prev.split("T")[1]||"09:00"}`)}
                        style={{width:"100%",padding:"8px 10px",border:`1px solid ${T.border}`,borderRadius:8,background:T.input,color:T.text,fontSize:12,fontFamily:"inherit",outline:"none"}}/>
                    </div>
                    <div style={{flex:1,minWidth:80}}>
                      <label style={{fontSize:11,fontWeight:600,color:T.textMuted,display:"block",marginBottom:4}}>Hour</label>
                      <select value={scheduleAt.split("T")[1]?.split(":")[0]||"9"}
                        onChange={e=>setScheduleAt(prev=>`${prev.split("T")[0]||new Date().toISOString().split("T")[0]}T${e.target.value.padStart(2,"0")}:${prev.split("T")[1]?.split(":")[1]||"00"}`)}
                        style={{width:"100%",padding:"8px 10px",border:`1px solid ${T.border}`,borderRadius:8,background:T.input,color:T.text,fontSize:12,fontFamily:"inherit",outline:"none"}}>
                        {Array.from({length:24},(_,h)=><option key={h} value={h}>{String(h).padStart(2,"0")}:00</option>)}
                      </select>
                    </div>
                    <div style={{flex:1,minWidth:80}}>
                      <label style={{fontSize:11,fontWeight:600,color:T.textMuted,display:"block",marginBottom:4}}>Minute</label>
                      <select value={scheduleAt.split("T")[1]?.split(":")[1]||"0"}
                        onChange={e=>setScheduleAt(prev=>`${prev.split("T")[0]||new Date().toISOString().split("T")[0]}T${prev.split("T")[1]?.split(":")[0]||"09"}:${e.target.value}`)}
                        style={{width:"100%",padding:"8px 10px",border:`1px solid ${T.border}`,borderRadius:8,background:T.input,color:T.text,fontSize:12,fontFamily:"inherit",outline:"none"}}>
                        {["00","05","10","15","20","25","30","35","40","45","50","55"].map(m=><option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                  </div>}

                  {/* Send button */}
                  <button onClick={async()=>{
                    if(!selectedTemplate||broadcastContacts.length===0) return;
                    if(scheduleMode){
                      if(!scheduleAt||!scheduleAt.includes("T")) return alert("Please select a date and time.");
                      const localDate=new Date(scheduleAt);
                      if(isNaN(localDate.getTime())) return alert("Invalid date/time.");
                      const utcStr=localDate.toISOString();
                      const clinicId=isAdmin&&broadcastClinic?(broadcastClinic.clinic_id||broadcastClinic.id):null;
                      const url=clinicId?`${API}/api/admin/clients/${clinicId}/scheduled-broadcasts`:`${API}/api/scheduled-broadcasts`;
                      const r=await fetch(url,{method:"POST",headers:authHeaders(),body:JSON.stringify({
                        template_name:selectedTemplate.template_name,
                        language:selectedTemplate.language||"en",
                        header_value:selectedTemplate.header_value||"",
                        header_type:selectedTemplate.header_type||"none",
                        contacts:broadcastContacts,
                        scheduled_at:utcStr,
                      })});
                      if(r.ok){fetchScheduledBroadcasts(clinicId);setBroadcastContacts([]);setScheduleMode(false);setScheduleAt("");}
                      else alert("Failed to schedule.");
                      return;
                    }
                    setBroadcastProgress({active:true,done:0,total:broadcastContacts.length,failed:0});
                    setBroadcastLog([]);
                    let done=0,failed=0;
                    const token=sessionStorage.getItem("crm_token")||authToken;
                    const clinicId=isAdmin&&broadcastClinic?(broadcastClinic.clinic_id||broadcastClinic.id):null;
                    const url=clinicId?`${API}/api/admin/clients/${clinicId}/broadcast/send`:`${API}/api/broadcast/send`;
                    for(const contact of broadcastContacts){
                      try{
                        await new Promise((resolve)=>{
                          const xhr=new XMLHttpRequest();
                          xhr.open("POST",url);
                          xhr.setRequestHeader("Content-Type","application/json");
                          xhr.setRequestHeader("Authorization","Bearer "+token);
                          xhr.onload=()=>{try{const d=JSON.parse(xhr.responseText);if(d.success||d.message_id||d.messages||d.sent||d.status==="sent"){done++;setBroadcastLog(p=>[...p,{name:contact.name||contact.phone,phone:contact.phone,status:"sent"}]);}else{failed++;setBroadcastLog(p=>[...p,{name:contact.name||contact.phone,phone:contact.phone,status:"failed",error:d.error||"Failed"}]);}}catch{failed++;setBroadcastLog(p=>[...p,{name:contact.name||contact.phone,phone:contact.phone,status:"failed"}]);}resolve();};
                          xhr.onerror=()=>{failed++;setBroadcastLog(p=>[...p,{name:contact.name||contact.phone,phone:contact.phone,status:"failed",error:"Network error"}]);resolve();};
                          xhr.send(JSON.stringify({
                            phone:contact.phone,name:contact.name||contact.phone,
                            template_name:selectedTemplate.template_name,
                            language:selectedTemplate.language||"en",
                            header_value:selectedTemplate.header_value||"",
                            header_type:selectedTemplate.header_type||"none"
                          }));
                        });
                      }catch{failed++;setBroadcastLog(p=>[...p,{name:contact.name||contact.phone,phone:contact.phone,status:"failed"}]);}
                      setBroadcastProgress({active:true,done:done+failed,total:broadcastContacts.length,failed});
                    }
                    setBroadcastProgress({active:false,done,total:broadcastContacts.length,failed});
                  }} disabled={!selectedTemplate||broadcastContacts.length===0||broadcastProgress?.active}
                    className="nx-btn primary" style={{width:"100%",justifyContent:"center",padding:"11px",fontSize:13,fontWeight:600,
                      opacity:(!selectedTemplate||broadcastContacts.length===0)?0.5:1,
                      cursor:(!selectedTemplate||broadcastContacts.length===0)?"not-allowed":"pointer"}}>
                    <i className={`ti ti-${scheduleMode?"calendar":"send"}`} style={{fontSize:15}}/>
                    {scheduleMode?`Schedule for ${broadcastContacts.length} contacts`:`Send to ${broadcastContacts.length} contacts`}
                  </button>

                  {broadcastProgress&&!broadcastProgress.active&&broadcastLog.length>0&&<div style={{marginTop:8,fontSize:11,color:T.textMuted,textAlign:"center"}}>
                    ✅ {broadcastProgress.done} sent{broadcastProgress.failed>0?`, ${broadcastProgress.failed} failed`:""} — <span style={{cursor:"pointer",color:WA_GREEN,textDecoration:"underline"}} onClick={()=>setBroadcastProgress(null)}>dismiss</span>
                  </div>}
                </div>
              </div>

            </div>{/* end left column */}

            {/* RIGHT COLUMN — Preview + Scheduled */}
            <div style={{width:240,flexShrink:0,display:"flex",flexDirection:"column",gap:12}}>
              {/* Phone preview */}
              <div style={{background:T.card,borderRadius:12,border:`1px solid ${T.border}`,overflow:"hidden"}}>
                <div style={{padding:"12px 14px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:6}}>
                  <i className="ti ti-device-mobile" style={{fontSize:14,color:WA_GREEN}}/>
                  <span style={{fontWeight:600,fontSize:12,color:T.text}}>Preview</span>
                </div>
                <div style={{padding:12}}>
                  {selectedTemplate?<div style={{background:"#1a1a1a",borderRadius:24,padding:"8px 5px",boxShadow:"0 4px 20px rgba(0,0,0,.3)"}}>
                    <div style={{display:"flex",justifyContent:"center",marginBottom:5}}>
                      <div style={{width:30,height:3,borderRadius:2,background:"#333"}}/>
                    </div>
                    <div style={{background:"#e5ddd5",borderRadius:18,overflow:"hidden"}}>
                      <div style={{background:"#075e54",padding:"7px 9px",display:"flex",alignItems:"center",gap:7}}>
                        <div style={{width:22,height:22,borderRadius:"50%",background:"#128c7e",display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:"#fff",fontWeight:700}}>
                          {selectedTemplate.template_name[0]?.toUpperCase()}
                        </div>
                        <div style={{fontSize:10,fontWeight:700,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{selectedTemplate.template_name}</div>
                      </div>
                      <div style={{padding:"6px 5px"}}>
                        <div style={{background:"#fff",borderRadius:"0 7px 7px 7px",overflow:"hidden",boxShadow:"0 1px 2px rgba(0,0,0,.1)"}}>
                          {selectedTemplate.header_value&&selectedTemplate.header_type?.toUpperCase()==="IMAGE"&&
                            <img src={selectedTemplate.header_value} alt="" style={{width:"100%",maxHeight:80,objectFit:"cover",display:"block"}}/>}
                          {selectedTemplate.body_text&&<div style={{padding:"6px 8px",fontSize:10,color:"#1a1a1a",lineHeight:1.4,whiteSpace:"pre-wrap"}}>{selectedTemplate.body_text}</div>}
                          {selectedTemplate.footer_text&&<div style={{padding:"0 8px 4px",fontSize:9,color:"#888"}}>{selectedTemplate.footer_text}</div>}
                          <div style={{padding:"0 8px 4px",fontSize:9,color:"#999",textAlign:"right"}}>11:59 ✓✓</div>
                        </div>
                      </div>
                    </div>
                    <div style={{display:"flex",justifyContent:"center",marginTop:5}}>
                      <div style={{width:24,height:3,borderRadius:2,background:"#333"}}/>
                    </div>
                  </div>:<div style={{textAlign:"center",padding:"20px 0",color:T.textFaint,fontSize:11}}>Select a template to preview</div>}
                </div>
              </div>

              {/* Scheduled */}
              <div style={{background:T.card,borderRadius:12,border:`1px solid ${T.border}`,overflow:"hidden"}}>
                <div style={{padding:"12px 14px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:6}}>
                  <i className="ti ti-calendar" style={{fontSize:14,color:WA_GREEN}}/>
                  <span style={{fontWeight:600,fontSize:12,color:T.text}}>Scheduled</span>
                </div>
                <div style={{padding:10}}>
                  {scheduledBroadcasts.length===0?
                    <div style={{textAlign:"center",padding:"12px 0",color:T.textFaint,fontSize:11}}>No scheduled broadcasts</div>:
                    scheduledBroadcasts.map(s=>{
                      const contactCount=(Array.isArray(s.contacts)?s.contacts:(typeof s.contacts==="string"?JSON.parse(s.contacts||"[]"):[])).length;
                      const isPending=s.status==="pending";
                      const statusColor=isPending?"#b45309":s.status==="sent"?WA_GREEN:"#ef4444";
                      const statusLabel=isPending?"⏳ Pending":s.status==="sent"?"✅ Sent":"❌ Failed";
                      return <div key={s.id} style={{padding:"9px 10px",background:T.card2,borderRadius:8,marginBottom:6,border:`1px solid ${T.border}`}}>
                        <div style={{fontSize:12,fontWeight:600,color:T.text,marginBottom:2}}>{s.template_name}</div>
                        <div style={{fontSize:10,color:T.textMuted}}>{new Date(s.scheduled_at).toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit",hour12:true})} · {contactCount} contacts</div>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:4}}>
                          <span style={{fontSize:10,fontWeight:700,color:statusColor}}>{statusLabel}</span>
                          {isPending&&<button onClick={async()=>{
                            const clinicId=isAdmin&&broadcastClinic?(broadcastClinic.clinic_id||broadcastClinic.id):null;
                            await fetch(`${API}/api/scheduled-broadcasts/${s.id}`,{method:"DELETE",headers:authHeaders()});
                            fetchScheduledBroadcasts(clinicId);
                          }} style={{fontSize:10,color:"#ef4444",border:"none",background:"none",cursor:"pointer"}}>Cancel</button>}
                        </div>
                      </div>;
                    })
                  }
                </div>
              </div>
            </div>{/* end right column */}

            </div></div>}{/* end send tab */}

            {broadcastSubTab==="create"&&<CreateTemplatePanel
              T={T} WA_GREEN={WA_GREEN} dark={dark}
              API={API} authHeaders={authHeaders} authToken={authToken}
              isAdmin={isAdmin} broadcastClinic={broadcastClinic}
              step={createTemplateStep} setStep={setCreateTemplateStep}
              submitting={createTemplateSubmitting} setSubmitting={setCreateTemplateSubmitting}
              result={createTemplateResult} setResult={setCreateTemplateResult}
              onSuccess={()=>{ fetchTemplates(isAdmin&&broadcastClinic?broadcastClinic.clinic_id:null); setBroadcastSubTab("send"); }}
            />}

            {broadcastSubTab==="history"&&<BroadcastHistoryPanel
              T={T} WA_GREEN={WA_GREEN} API={API} authHeaders={authHeaders}
              isAdmin={isAdmin} broadcastClinic={broadcastClinic}
            />}

          </>}

          {isAdmin&&!broadcastClinic&&<div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",color:T.textMuted}}>
            <div style={{fontSize:48,marginBottom:12}}>👆</div>
            <div style={{fontWeight:700,fontSize:16,marginBottom:6}}>Select a client above</div>
            <div style={{fontSize:13}}>Click a client pill in the header to get started</div>
          </div>}
        </div>
        </div>}

        {tab==="notes"&&<NotesTab
          T={T} WA_GREEN={WA_GREEN} dark={dark} isAdmin={isAdmin}
          currentUser={currentUser} authToken={authToken}
          adminOverview={adminOverview} API={API} ts={ts}
          notes={notes} setNotes={setNotes}
          notesLoading={notesLoading} setNotesLoading={setNotesLoading}
          notesClinic={notesClinic} setNotesClinic={setNotesClinic}
          contacts={contacts}
          onJumpToChat={(contact_id, contact_name)=>{
            setTab("crm");
            const c = contacts.find(x=>x.id===contact_id||x.phone===contact_id);
            if(c) selectContact(c);
          }}
        />}
        {tab==="integrations"&&<IntegrationsTab
          T={T} WA_GREEN={WA_GREEN} dark={dark} isAdmin={isAdmin}
          currentUser={currentUser} authToken={authToken}
          permissions={permissions} API={API}/>}


        {tab==="settings"&&<div style={{flex:1,display:"flex",flexDirection:"column",background:T.bg,overflow:"hidden"}}>
          {/* Page header with client pills */}
          <div className="nx-page-header" style={{flexShrink:0}}>
            <i className="ti ti-settings" style={{fontSize:20,color:WA_GREEN}}/>
            <div>
              <div className="nx-page-title">Settings</div>
              <div className="nx-page-sub">{settingsClinic?settingsClinic.company_name||settingsClinic.username:"Configure your bot and account"}</div>
            </div>
            {isAdmin&&adminOverview.length>0&&<div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center",marginLeft:12}}>
              {adminOverview.map(c=>{
                const sel = settingsClinic?.id===c.id;
                return <div key={c.id} onClick={()=>sel?null:loadClientSettings(c)}
                  style={{display:"flex",alignItems:"center",gap:5,padding:"3px 10px",borderRadius:20,cursor:"pointer",
                    border:`1px solid ${sel?WA_GREEN:T.border}`,background:sel?`${WA_GREEN}15`:"transparent",
                    opacity:(c.active===false||c.active===0)?0.5:1,transition:"all .15s"}}
                  onMouseEnter={e=>{if(!sel){e.currentTarget.style.borderColor=WA_GREEN;e.currentTarget.style.background=`${WA_GREEN}10`;}}}
                  onMouseLeave={e=>{if(!sel){e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background="transparent";}}}>
                  <div style={{width:14,height:14,borderRadius:3,overflow:"hidden",background:`${WA_GREEN}15`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    {c.logo_url?<img src={c.logo_url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:<span style={{fontSize:9}}>🏢</span>}
                  </div>
                  <span style={{fontSize:11,fontWeight:700,color:sel?WA_GREEN:T.text}}>{c.company_name||c.username}</span>
                </div>;
              })}
            </div>}
          </div>

          {/* Body — left nav + right content */}
          <div style={{flex:1,display:"flex",overflow:"hidden"}}>
          {(()=>{
            const NAV = [
              {id:"ai",      icon:"ti ti-robot",          label:"AI & Bot"},
              {id:"keywords",icon:"ti ti-target",          label:"Lead Keywords"},
              {id:"followup",icon:"ti ti-clock",           label:"Follow-up"},
              {id:"telegram",icon:"ti ti-send",            label:"Notifications"},
            ];
            return <>
              {/* ── LEFT SETTINGS NAV ── */}
              <div style={{width:180,borderRight:`1px solid ${T.border}`,padding:"12px 8px",flexShrink:0,background:T.card,overflowY:"auto"}}>
                {NAV.map(n=>(
                  <div key={n.id} onClick={()=>setSettingsNav(n.id)}
                    style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderRadius:8,
                      fontSize:12,fontWeight:500,cursor:"pointer",marginBottom:2,transition:"all .15s",
                      background:settingsNav===n.id?`${WA_GREEN}15`:"transparent",
                      color:settingsNav===n.id?WA_GREEN:T.textMuted}}>
                    <i className={n.icon} style={{fontSize:16}}/>
                    {n.label}
                  </div>
                ))}
              </div>

              {/* ── RIGHT SETTINGS CONTENT ── */}
              <div style={{flex:1,overflowY:"auto",padding:"24px 40px",display:"flex",justifyContent:"center"}}>
              <div style={{width:"100%",maxWidth:fuTab==="tracker"?"100%":560}}>

                {/* Sticky save bar */}
                {settingsDirty&&<div style={{position:"sticky",top:0,zIndex:10,marginBottom:20,background:T.bg,paddingBottom:8}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 18px",borderRadius:12,
                    background:`${WA_GREEN}10`,border:`2px solid ${WA_GREEN}`,boxShadow:`0 4px 20px ${WA_GREEN}20`}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:8,height:8,borderRadius:"50%",background:WA_GREEN,animation:"pulse 1.5s infinite"}}/>
                      <span style={{fontSize:13,fontWeight:600,color:WA_GREEN}}>Unsaved changes</span>
                    </div>
                    <button onClick={saveSettings} className="nx-btn primary" style={{padding:"8px 22px",fontSize:13}}>
                      💾 Save Settings
                    </button>
                  </div>
                </div>}

                {/* ── AI & BOT ── */}
                {settingsNav==="ai"&&<>
                  {isAdmin&&!settingsClinic&&<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"60px 20px",color:T.textMuted}}>
                    <i className="ti ti-building" style={{fontSize:48,marginBottom:12,opacity:.3}}/>
                    <div style={{fontWeight:700,fontSize:15,marginBottom:6}}>Select a client</div>
                    <div style={{fontSize:12}}>Choose from the pills above to edit their settings</div>
                  </div>}
                  {(!isAdmin||settingsClinic)&&settingsLoading&&<div style={{textAlign:"center",padding:40,color:T.textMuted}}>
                    <div style={{width:32,height:32,borderRadius:"50%",border:`3px solid ${WA_GREEN}20`,borderTop:`3px solid ${WA_GREEN}`,animation:"spin .8s linear infinite",margin:"0 auto 12px"}}/>
                    Loading...
                  </div>}
                  {(!isAdmin||settingsClinic)&&!settingsLoading&&<>

                    {/* AI Provider Card */}
                    <div style={{background:T.card,borderRadius:14,border:`1px solid ${T.border}`,padding:"20px 22px",marginBottom:16,boxShadow:"0 1px 4px rgba(0,0,0,.04)"}}>
                      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
                        <div style={{width:36,height:36,borderRadius:10,background:"#f5f3ff",display:"flex",alignItems:"center",justifyContent:"center"}}>
                          <i className="ti ti-robot" style={{fontSize:18,color:"#7c3aed"}}/>
                        </div>
                        <div>
                          <div style={{fontSize:14,fontWeight:700,color:T.text}}>AI Provider</div>
                          <div style={{fontSize:11,color:T.textMuted,marginTop:1}}>Choose which AI powers your bot</div>
                        </div>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:16}}>
                        {[{id:"anthropic",label:"Claude",sub:"Anthropic",color:"#7c3aed",icon:"🟣"},
                          {id:"openai",label:"GPT-4o",sub:"OpenAI",color:"#10b981",icon:"🟢"},
                          {id:"groq",label:"Llama 3",sub:"Groq · Free",color:"#f59e0b",icon:"🟡"}].map(p=>(
                          <div key={p.id} onClick={()=>{setAppSettings(s=>({...s,ai_provider:p.id}));setSettingsDirtyWithRef(true);}}
                            style={{padding:"12px 10px",borderRadius:10,border:`2px solid ${appSettings.ai_provider===p.id?p.color:T.border}`,
                              background:appSettings.ai_provider===p.id?p.color+"0d":"transparent",
                              cursor:"pointer",textAlign:"center",transition:"all .15s"}}>
                            <div style={{fontSize:20,marginBottom:4}}>{p.icon}</div>
                            <div style={{fontSize:13,fontWeight:700,color:appSettings.ai_provider===p.id?p.color:T.text}}>{p.label}</div>
                            <div style={{fontSize:10,color:T.textMuted,marginTop:1}}>{p.sub}</div>
                            {appSettings.ai_provider===p.id&&<div style={{marginTop:6,fontSize:9,fontWeight:700,color:p.color,background:p.color+"15",borderRadius:20,padding:"2px 8px",display:"inline-block"}}>ACTIVE</div>}
                          </div>
                        ))}
                      </div>
                      <div style={{marginBottom:14}}>
                        <label style={{display:"block",fontSize:12,fontWeight:600,color:T.textMuted,marginBottom:6,letterSpacing:.3}}>API KEY</label>
                        <div style={{position:"relative"}}>
                          <input type="password"
                            value={appSettings.ai_provider==="anthropic"?appSettings.anthropic_key||"":appSettings.ai_provider==="openai"?appSettings.openai_key||"":appSettings.groq_key||""}
                            onChange={e=>{
                              const key = appSettings.ai_provider==="anthropic"?"anthropic_key":appSettings.ai_provider==="openai"?"openai_key":"groq_key";
                              setAppSettings(s=>({...s,[key]:e.target.value}));setSettingsDirtyWithRef(true);
                            }}
                            placeholder={appSettings.ai_provider==="anthropic"?"sk-ant-api03-...":appSettings.ai_provider==="openai"?"sk-...":"gsk_..."}
                            style={{width:"100%",padding:"10px 14px",borderRadius:8,border:`1.5px solid ${T.border}`,
                              background:T.card2,color:T.text,fontSize:13,fontFamily:"monospace",outline:"none",
                              boxSizing:"border-box",transition:"border-color .15s"}}
                            onFocus={e=>e.target.style.borderColor=WA_GREEN}
                            onBlur={e=>e.target.style.borderColor=T.border}/>
                        </div>
                      </div>
                      <div>
                        <label style={{display:"block",fontSize:12,fontWeight:600,color:T.textMuted,marginBottom:6,letterSpacing:.3}}>MODEL</label>
                        <select value={appSettings.ai_model||"claude-haiku-4-5-20251001"}
                          onChange={e=>{setAppSettings(s=>({...s,ai_model:e.target.value}));setSettingsDirtyWithRef(true);}}
                          style={{width:"100%",padding:"10px 14px",borderRadius:8,border:`1.5px solid ${T.border}`,
                            background:T.card2,color:T.text,fontSize:13,fontFamily:"inherit",outline:"none",
                            cursor:"pointer",transition:"border-color .15s"}}
                          onFocus={e=>e.target.style.borderColor=WA_GREEN}
                          onBlur={e=>e.target.style.borderColor=T.border}>
                          <option value="claude-haiku-4-5-20251001">claude-haiku-4-5 — Fast & economical ⚡</option>
                          <option value="claude-sonnet-4-6">claude-sonnet-4-6 — Balanced 🎯</option>
                          <option value="gpt-4o-mini">gpt-4o-mini — Fast & cheap ⚡</option>
                          <option value="gpt-4o">gpt-4o — Most powerful 💪</option>
                          <option value="llama-3.3-70b-versatile">llama-3.3-70b — Free via Groq 🆓</option>
                        </select>
                        <div style={{fontSize:10,color:T.textMuted,marginTop:5}}>💡 Haiku recommended — same quality, 5x cheaper</div>
                      </div>
                    </div>

                    {/* Timezone Card */}
                    <div style={{background:T.card,borderRadius:14,border:`1px solid ${T.border}`,padding:"20px 22px",marginBottom:16,boxShadow:"0 1px 4px rgba(0,0,0,.04)"}}>
                      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                        <div style={{width:36,height:36,borderRadius:10,background:"#eff6ff",display:"flex",alignItems:"center",justifyContent:"center"}}>
                          <i className="ti ti-clock" style={{fontSize:18,color:"#2563eb"}}/>
                        </div>
                        <div>
                          <div style={{fontSize:14,fontWeight:700,color:T.text}}>Timezone</div>
                          <div style={{fontSize:11,color:T.textMuted,marginTop:1}}>Affects follow-up timing and analytics</div>
                        </div>
                      </div>
                      <select value={appSettings.timezone||"Asia/Kuala_Lumpur"}
                        onChange={e=>{setAppSettings(s=>({...s,timezone:e.target.value}));setSettingsDirtyWithRef(true);}}
                        style={{width:"100%",padding:"10px 14px",borderRadius:8,border:`1.5px solid ${T.border}`,
                          background:T.card2,color:T.text,fontSize:13,fontFamily:"inherit",outline:"none",cursor:"pointer"}}>
                        <option value="Asia/Kuala_Lumpur">🇲🇾 Malaysia (UTC+8)</option>
                        <option value="Asia/Singapore">🇸🇬 Singapore (UTC+8)</option>
                        <option value="Asia/Jakarta">🇮🇩 Indonesia WIB (UTC+7)</option>
                        <option value="Asia/Kolkata">🇮🇳 India (UTC+5:30)</option>
                        <option value="Asia/Bangkok">🇹🇭 Thailand (UTC+7)</option>
                        <option value="Asia/Dubai">🇦🇪 UAE (UTC+4)</option>
                        <option value="Asia/Riyadh">🇸🇦 Saudi Arabia (UTC+3)</option>
                        <option value="Europe/London">🇬🇧 UK (UTC+0/+1)</option>
                        <option value="America/New_York">🇺🇸 US East (UTC-5/-4)</option>
                        <option value="America/Los_Angeles">🇺🇸 US West (UTC-8/-7)</option>
                        <option value="Australia/Sydney">🇦🇺 Australia (UTC+10/+11)</option>
                      </select>
                    </div>

                    {/* Bot Behaviour Card */}
                    <div style={{background:T.card,borderRadius:14,border:`1px solid ${T.border}`,padding:"20px 22px",marginBottom:20,boxShadow:"0 1px 4px rgba(0,0,0,.04)"}}>
                      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                        <div style={{width:36,height:36,borderRadius:10,background:"#f0fdf4",display:"flex",alignItems:"center",justifyContent:"center"}}>
                          <i className="ti ti-settings-2" style={{fontSize:18,color:WA_GREEN}}/>
                        </div>
                        <div>
                          <div style={{fontSize:14,fontWeight:700,color:T.text}}>Bot Behaviour</div>
                          <div style={{fontSize:11,color:T.textMuted,marginTop:1}}>Control how the bot responds</div>
                        </div>
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:10}}>
                        {[
                          {key:"ai_enabled",     label:"Enable AI bot globally",        hint:"Bot auto-replies to all incoming messages",            invert:true,  color:WA_GREEN},
                          {key:"usd_conversion", label:"International USD conversion",  hint:"Show MYR + USD for non-Malaysian phone numbers",        invert:false, color:"#f59e0b"},
                        ].map(t=>{
                          const val = t.invert ? appSettings[t.key]!=="false" : appSettings[t.key]===true||appSettings[t.key]==="true";
                          return <div key={t.key}
                            style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                              padding:"12px 14px",borderRadius:10,cursor:"pointer",transition:"all .15s",
                              background:val?t.color+"0a":T.card2,
                              border:`1.5px solid ${val?t.color+"40":T.border}`}}
                            onClick={()=>{
                              const newVal = t.invert ? (val?"false":"true") : !val;
                              setAppSettings(s=>({...s,[t.key]:newVal}));setSettingsDirtyWithRef(true);
                            }}>
                            <div>
                              <div style={{fontSize:13,fontWeight:600,color:T.text}}>{t.label}</div>
                              <div style={{fontSize:11,color:T.textMuted,marginTop:2}}>{t.hint}</div>
                            </div>
                            <div style={{width:42,height:24,borderRadius:12,flexShrink:0,
                              background:val?t.color:"#d1d5db",position:"relative",transition:"background .2s"}}>
                              <div style={{position:"absolute",top:3,left:val?21:3,width:18,height:18,borderRadius:"50%",
                                background:"#fff",transition:"left .2s",boxShadow:"0 1px 4px rgba(0,0,0,.2)"}}/>
                            </div>
                          </div>;
                        })}
                      </div>
                    </div>

                    <button onClick={saveSettings} className="nx-btn primary" style={{padding:"10px 28px",fontSize:13}}>
                      💾 Save Settings
                    </button>
                  </>}
                </>}

                {/* ── LEAD KEYWORDS ── */}
                {settingsNav==="keywords"&&(!isAdmin||settingsClinic)&&<>
                  <div style={{background:T.card,borderRadius:14,border:`1px solid ${T.border}`,padding:"20px 22px",marginBottom:16,boxShadow:"0 1px 4px rgba(0,0,0,.04)"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                      <div style={{width:36,height:36,borderRadius:10,background:"#fef2f2",display:"flex",alignItems:"center",justifyContent:"center"}}>
                        <i className="ti ti-target" style={{fontSize:18,color:"#ef4444"}}/>
                      </div>
                      <div>
                        <div style={{fontSize:14,fontWeight:700,color:T.text}}>Lead Scoring Keywords</div>
                        <div style={{fontSize:11,color:T.textMuted,marginTop:1}}>AI classifies leads based on these words. Separate with commas.</div>
                      </div>
                    </div>
                    <div style={{padding:"8px 12px",borderRadius:8,background:"#fffbeb",border:"1px solid #fde68a",fontSize:11,color:"#92400e",marginBottom:16,lineHeight:1.6}}>
                      💡 Keywords are case-insensitive. Add as many as you want separated by commas.
                    </div>
                    {[
                      {key:"hot_keywords",  label:"🔥 Hot — High Intent",   color:"#ef4444", light:"#fef2f2", border:"#fca5a5", hint:"book, appointment, price, how much, register, deposit"},
                      {key:"warm_keywords", label:"🟡 Warm — Interested",   color:"#f59e0b", light:"#fffbeb", border:"#fcd34d", hint:"interested, tell me more, what services, details, options"},
                      {key:"cold_keywords", label:"🔵 Cold — Just Browsing", color:"#3b82f6", light:"#eff6ff", border:"#93c5fd", hint:"just looking, maybe later, not sure, curious"},
                    ].map(kw=>(
                      <div key={kw.key} style={{marginBottom:18}}>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                          <label style={{fontSize:13,fontWeight:600,color:T.text}}>{kw.label}</label>
                          <span style={{fontSize:10,color:T.textFaint}}>{(appSettings[kw.key]||"").split(",").filter(k=>k.trim()).length} keywords</span>
                        </div>
                        <div style={{fontSize:10,color:T.textMuted,marginBottom:6}}>{kw.hint}</div>
                        <textarea value={appSettings[kw.key]||""} rows={2}
                          onChange={e=>{setAppSettings(s=>({...s,[kw.key]:e.target.value}));setSettingsDirtyWithRef(true);}}
                          style={{width:"100%",padding:"10px 14px",borderRadius:8,border:`1.5px solid ${kw.border}`,
                            background:kw.light,color:T.text,fontSize:13,fontFamily:"inherit",outline:"none",
                            resize:"vertical",boxSizing:"border-box",lineHeight:1.6,transition:"border-color .15s"}}
                          onFocus={e=>e.target.style.borderColor=kw.color}
                          onBlur={e=>e.target.style.borderColor=kw.border}/>
                        {(appSettings[kw.key]||"").trim()&&<div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:7}}>
                          {(appSettings[kw.key]||"").split(",").map(k=>k.trim()).filter(Boolean).map((k,i)=>(
                            <span key={i} style={{fontSize:11,padding:"3px 10px",borderRadius:20,
                              background:kw.color+"15",color:kw.color,border:`1px solid ${kw.border}`,fontWeight:600}}>
                              {k}
                            </span>
                          ))}
                        </div>}
                      </div>
                    ))}
                  </div>
                  <button onClick={saveSettings} className="nx-btn primary" style={{padding:"10px 28px",fontSize:13}}>
                    💾 Save Settings
                  </button>
                </>}

                {/* ── FOLLOW-UP ── */}
                {settingsNav==="followup"&&(!isAdmin||settingsClinic)&&<>
                  {/* Follow-up sub-tabs */}
                  <div style={{display:"flex",gap:4,marginBottom:18,background:T.card2,borderRadius:10,padding:4,width:"fit-content"}}>
                    {[{id:"settings",label:"Settings",icon:"ti-adjustments-horizontal"},{id:"tracker",label:"Tracker",icon:"ti-list-check"}].map(t=>(
                      <button key={t.id} onClick={()=>setFuTab(t.id)}
                        style={{padding:"6px 16px",borderRadius:8,border:"none",cursor:"pointer",fontFamily:"inherit",
                          fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:5,
                          background:fuTab===t.id?T.card:"transparent",
                          color:fuTab===t.id?T.text:T.textMuted,
                          boxShadow:fuTab===t.id?"0 1px 3px rgba(0,0,0,.08)":"none"}}>
                        <i className={`ti ${t.icon}`} style={{fontSize:13}}/>{t.label}
                      </button>
                    ))}
                  </div>
                  {fuTab==="settings"&&<>
                  <div style={{background:T.card,borderRadius:14,border:`1px solid ${T.border}`,padding:"20px 22px",marginBottom:14,boxShadow:"0 1px 4px rgba(0,0,0,.04)"}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <div style={{width:36,height:36,borderRadius:10,background:"#f0fdf4",display:"flex",alignItems:"center",justifyContent:"center"}}>
                          <i className="ti ti-clock" style={{fontSize:18,color:WA_GREEN}}/>
                        </div>
                        <div>
                          <div style={{fontSize:14,fontWeight:700,color:T.text}}>Auto Follow-up</div>
                          <div style={{fontSize:11,color:T.textMuted,marginTop:1}}>
                            {appSettings.followup_enabled==="true"?"✅ Active — sends when customer goes silent":"⏸️ Disabled — no follow-ups sent"}
                          </div>
                        </div>
                      </div>
                      <div onClick={()=>{setAppSettings(s=>({...s,followup_enabled:s.followup_enabled==="true"?"false":"true"}));setSettingsDirtyWithRef(true);}}
                        style={{width:48,height:26,borderRadius:13,cursor:"pointer",flexShrink:0,
                          background:appSettings.followup_enabled==="true"?WA_GREEN:"#d1d5db",position:"relative",transition:"background .25s"}}>
                        <div style={{position:"absolute",top:3,left:appSettings.followup_enabled==="true"?24:3,width:20,height:20,
                          borderRadius:"50%",background:"#fff",transition:"left .25s",boxShadow:"0 2px 5px rgba(0,0,0,.2)"}}/>
                      </div>
                    </div>
                    <div style={{marginTop:12,padding:"8px 12px",borderRadius:8,background:`${WA_GREEN}08`,border:`1px solid ${WA_GREEN}20`,fontSize:11,color:T.textMuted,lineHeight:1.6}}>
                      🤖 AI reads the full conversation and writes a personalised message. The fallback text below is only used if AI fails.
                    </div>
                  </div>

                  {/* Follow-up 1 & 2 */}
                  {[{n:1,delayKey:"followup_1_delay",unitKey:"followup_1_delay_unit",msgKey:"followup_1_message",enableKey:"followup_1_enabled",color:WA_GREEN,label:"First Follow-up"},
                    {n:2,delayKey:"followup_2_delay",unitKey:"followup_2_delay_unit",msgKey:"followup_2_message",enableKey:"followup_2_enabled",color:"#f59e0b",label:"Second Follow-up"}].map(fu=>{
                    const enabled = appSettings[fu.enableKey]!=="false";
                    return <div key={fu.n} style={{background:T.card,borderRadius:14,border:`1.5px solid ${enabled?fu.color+"50":T.border}`,
                      padding:"20px 22px",marginBottom:14,boxShadow:"0 1px 4px rgba(0,0,0,.04)",
                      opacity:appSettings.followup_enabled==="true"?1:0.5,transition:"all .2s"}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                        <div>
                          <div style={{fontSize:13,fontWeight:700,color:enabled?fu.color:T.textMuted}}>{fu.label}</div>
                          <div style={{fontSize:11,color:T.textMuted,marginTop:1}}>{fu.n===1?"Sent first when customer goes silent":"Sent if customer still doesn't reply"}</div>
                        </div>
                        <div onClick={()=>{setAppSettings(s=>({...s,[fu.enableKey]:enabled?"false":"true"}));setSettingsDirtyWithRef(true);}}
                          style={{width:42,height:24,borderRadius:12,cursor:"pointer",
                            background:enabled?fu.color:"#d1d5db",position:"relative",flexShrink:0,transition:"background .2s"}}>
                          <div style={{position:"absolute",top:3,left:enabled?21:3,width:18,height:18,borderRadius:"50%",
                            background:"#fff",transition:"left .2s",boxShadow:"0 1px 4px rgba(0,0,0,.2)"}}/>
                        </div>
                      </div>
                      <label style={{display:"block",fontSize:12,fontWeight:600,color:T.textMuted,marginBottom:8,letterSpacing:.3}}>SEND AFTER</label>
                      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:14}}>
                        <input type="number" value={appSettings[fu.delayKey]||"2"}
                          onChange={e=>{setAppSettings(s=>({...s,[fu.delayKey]:e.target.value}));setSettingsDirtyWithRef(true);}}
                          style={{width:80,padding:"9px 12px",borderRadius:8,border:`1.5px solid ${T.border}`,
                            background:T.card2,color:T.text,fontSize:15,fontWeight:700,textAlign:"center",outline:"none",
                            transition:"border-color .15s"}}
                          onFocus={e=>e.target.style.borderColor=fu.color}
                          onBlur={e=>e.target.style.borderColor=T.border}/>
                        <select value={appSettings[fu.unitKey]||"hours"}
                          onChange={e=>{setAppSettings(s=>({...s,[fu.unitKey]:e.target.value}));setSettingsDirtyWithRef(true);}}
                          style={{padding:"9px 14px",borderRadius:8,border:`1.5px solid ${T.border}`,
                            background:T.card2,color:T.text,fontSize:13,fontFamily:"inherit",outline:"none",cursor:"pointer"}}>
                          <option value="mins">Minutes</option>
                          <option value="hours">Hours</option>
                          <option value="days">Days</option>
                        </select>
                        <span style={{fontSize:12,color:T.textMuted}}>of customer silence</span>
                      </div>
                      <label style={{display:"block",fontSize:12,fontWeight:600,color:T.textMuted,marginBottom:6,letterSpacing:.3}}>FALLBACK MESSAGE <span style={{fontSize:10,fontWeight:400}}>(if AI unavailable)</span></label>
                      <textarea value={appSettings[fu.msgKey]||""} rows={3}
                        onChange={e=>{setAppSettings(s=>({...s,[fu.msgKey]:e.target.value}));setSettingsDirtyWithRef(true);}}
                        placeholder={`Hi {name}! ${fu.n===1?"Just checking in — can I help you with anything?":"We'd love to hear from you. Is there anything I can assist with?"}`}
                        style={{width:"100%",padding:"10px 14px",borderRadius:8,border:`1.5px solid ${T.border}`,
                          background:T.card2,color:T.text,fontSize:13,fontFamily:"inherit",outline:"none",
                          resize:"vertical",boxSizing:"border-box",lineHeight:1.6,transition:"border-color .15s"}}
                        onFocus={e=>e.target.style.borderColor=fu.color}
                        onBlur={e=>e.target.style.borderColor=T.border}/>
                      <div style={{fontSize:10,color:T.textFaint,marginTop:4}}>Use {"{name}"} to include the customer's name</div>
                    </div>;
                  })}
                  <button onClick={saveSettings} className="nx-btn primary" style={{padding:"10px 28px",fontSize:13}}>
                    💾 Save Settings
                  </button>

                  {/* ── FOLLOW-UP TRACKER ── */}
                  </>}
                  {fuTab==="tracker"&&<FollowupTracker
                    T={T} WA_GREEN={WA_GREEN}
                    API={API} authHeaders={authHeaders}
                    appSettings={appSettings}
                    followupTracker={followupTracker}
                    followupTrackerLoading={followupTrackerLoading}
                    fetchFollowupTracker={()=>fetchFollowupTracker(settingsClinic?.id||settingsClinic?.clinic_id||null)}
                    hideCompleted={hideCompleted}
                    setHideCompleted={setHideCompleted}
                  />}
                </>}

                {/* ── NOTIFICATIONS (Telegram) ── */}
                {settingsNav==="telegram"&&(!isAdmin||settingsClinic)&&<>
                  <div style={{background:T.card,borderRadius:14,border:`1px solid ${T.border}`,padding:"20px 22px",marginBottom:14,boxShadow:"0 1px 4px rgba(0,0,0,.04)"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                      <div style={{width:36,height:36,borderRadius:10,background:"#eff6ff",display:"flex",alignItems:"center",justifyContent:"center"}}>
                        <i className="ti ti-brand-telegram" style={{fontSize:18,color:"#0088cc"}}/>
                      </div>
                      <div>
                        <div style={{fontSize:14,fontWeight:700,color:T.text}}>Telegram Notifications</div>
                        <div style={{fontSize:11,color:T.textMuted,marginTop:1}}>Get instant alerts in your Telegram group</div>
                      </div>
                      {(appSettings.telegram_token||"").length>5&&(appSettings.telegram_chat_id||"").length>3&&
                        <span style={{marginLeft:"auto",fontSize:10,fontWeight:700,padding:"3px 10px",borderRadius:20,background:"#f0fdf4",color:"#15803d",border:"1px solid #bbf7d0"}}>
                          ✅ Connected
                        </span>}
                    </div>
                    {[{key:"telegram_token",label:"BOT TOKEN",ph:"8664616537:AAGE9wn...",pwd:true},
                      {key:"telegram_chat_id",label:"GROUP CHAT ID",ph:"-5277820778"}].map(f=>(
                      <div key={f.key} style={{marginBottom:14}}>
                        <label style={{display:"block",fontSize:11,fontWeight:700,color:T.textMuted,marginBottom:6,letterSpacing:.5}}>{f.label}</label>
                        <input type={f.pwd?"password":"text"} value={appSettings[f.key]||""}
                          onChange={e=>{setAppSettings(s=>({...s,[f.key]:e.target.value}));setSettingsDirtyWithRef(true);}}
                          placeholder={f.ph}
                          style={{width:"100%",padding:"10px 14px",borderRadius:8,border:`1.5px solid ${T.border}`,
                            background:T.card2,color:T.text,fontSize:13,fontFamily:"monospace",outline:"none",
                            boxSizing:"border-box",transition:"border-color .15s"}}
                          onFocus={e=>e.target.style.borderColor="#0088cc"}
                          onBlur={e=>e.target.style.borderColor=T.border}/>
                      </div>
                    ))}
                  </div>

                  <div style={{background:T.card,borderRadius:14,border:`1px solid ${T.border}`,padding:"20px 22px",marginBottom:16,boxShadow:"0 1px 4px rgba(0,0,0,.04)"}}>
                    <div style={{fontSize:13,fontWeight:700,color:T.text,marginBottom:12}}>Alert me when:</div>
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      {[
                        {key:"telegram_notify_hot",    label:"🔥 Hot lead detected",       hint:"Customer shows strong booking intent",     def:"true"},
                        {key:"telegram_notify_warm",   label:"🟡 Warm lead detected",      hint:"Customer shows interest but not ready",    def:"false"},
                        {key:"telegram_notify_human",  label:"🚨 Human agent needed",      hint:"Bot can't handle the question",            def:"true"},
                        {key:"telegram_notify_booking",label:"📅 Booking confirmed",       hint:"Customer committed to an appointment",     def:"true"},
                      ].map(t=>{
                        const on = (appSettings[t.key]||t.def)!=="false";
                        return <div key={t.key}
                          style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                            padding:"12px 14px",borderRadius:10,cursor:"pointer",transition:"all .15s",
                            background:on?"#eff6ff":T.card2,border:`1.5px solid ${on?"#bfdbfe":T.border}`}}
                          onClick={()=>{setAppSettings(s=>({...s,[t.key]:on?"false":"true"}));setSettingsDirtyWithRef(true);}}>
                          <div>
                            <div style={{fontSize:13,fontWeight:600,color:T.text}}>{t.label}</div>
                            <div style={{fontSize:11,color:T.textMuted,marginTop:1}}>{t.hint}</div>
                          </div>
                          <div style={{width:42,height:24,borderRadius:12,background:on?"#0088cc":"#d1d5db",position:"relative",flexShrink:0,transition:"background .2s"}}>
                            <div style={{position:"absolute",top:3,left:on?21:3,width:18,height:18,borderRadius:"50%",
                              background:"#fff",transition:"left .2s",boxShadow:"0 1px 4px rgba(0,0,0,.2)"}}/>
                          </div>
                        </div>;
                      })}
                    </div>
                  </div>

                  <div style={{display:"flex",gap:10}}>
                    <button onClick={saveSettings} className="nx-btn primary" style={{padding:"10px 28px",fontSize:13}}>
                      💾 Save Settings
                    </button>
                    <button onClick={async()=>{
                      const r=await fetch(`${API}/api/settings/test-telegram`,{method:"POST",headers:authHeaders()});
                      const d=await r.json();
                      setConfirmModal({title:d.ok?"Test Sent! ✅":"Failed ❌",
                        message:d.ok?"Check your Telegram group — you should see a test message.":"Could not send. Check your Bot Token and Chat ID.",
                        icon:d.ok?"📨":"⚠️",danger:!d.ok,confirmText:"OK",onConfirm:()=>{}});
                    }} style={{padding:"10px 18px",borderRadius:8,border:"none",background:"#0088cc",color:"#fff",
                      fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:6}}>
                      <i className="ti ti-send" style={{fontSize:14}}/> Send Test
                    </button>
                  </div>
                </>}

              </div>{/* end content wrapper */}
              </div>{/* end right panel */}
            </>
          })()}
          </div>{/* end body flex */}
        </div>}
        {/* ══ ADMIN TAB ══ */}
        {tab==="admin"&&isAdmin&&<AdminPanel authHeaders={authHeaders} authToken={authToken} T={T} WA_GREEN={WA_GREEN} dark={dark} setConfirmModal={setConfirmModal} adminOverview={adminOverview}/>}

      </div>

      {/* ══ CONFIRM MODAL ══ */}
      <ConfirmModal modal={confirmModal} onClose={()=>setConfirmModal(null)} T={T} WA_GREEN={WA_GREEN}/>
      {broadcastProgress&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
        <div style={{background:T.card,borderRadius:16,padding:24,width:"100%",maxWidth:420,boxShadow:"0 20px 60px rgba(0,0,0,.3)"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
            <div style={{width:36,height:36,borderRadius:"50%",background:`${WA_GREEN}20`,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <i className={`ti ti-${broadcastProgress.active?"send":"circle-check"}`} style={{fontSize:18,color:WA_GREEN}}/>
            </div>
            <div>
              <div style={{fontWeight:700,fontSize:15,color:T.text}}>{broadcastProgress.active?"Sending broadcast…":"Broadcast complete!"}</div>
              <div style={{fontSize:12,color:T.textMuted}}>{broadcastProgress.done}/{broadcastProgress.total} contacts{broadcastProgress.failed>0?` · ${broadcastProgress.failed} failed`:""}</div>
            </div>
          </div>
          <div style={{height:4,borderRadius:2,background:T.border,overflow:"hidden",marginBottom:16}}>
            <div style={{height:4,borderRadius:2,background:WA_GREEN,width:`${(broadcastProgress.done/broadcastProgress.total)*100}%`,transition:"width .3s"}}/>
          </div>
          <div style={{maxHeight:260,overflowY:"auto",display:"flex",flexDirection:"column",gap:6}}>
            {broadcastLog.map((l,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:T.card2,borderRadius:8,border:`1px solid ${T.border}`}}>
                <div style={{width:32,height:32,borderRadius:"50%",background:l.status==="sent"?`${WA_GREEN}20`:"#fef2f2",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <i className={`ti ti-${l.status==="sent"?"check":"x"}`} style={{fontSize:14,color:l.status==="sent"?WA_GREEN:"#ef4444"}}/>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l.name}</div>
                  <div style={{fontSize:11,color:T.textMuted}}>{l.phone}</div>
                </div>
                <span style={{fontSize:11,fontWeight:600,color:l.status==="sent"?WA_GREEN:"#ef4444",flexShrink:0}}>{l.status==="sent"?"✓ Sent":"✗ Failed"}</span>
              </div>
            ))}
            {broadcastProgress.active&&Array.from({length:broadcastProgress.total-broadcastLog.length}).map((_,i)=>(
              <div key={`pending-${i}`} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:T.card2,borderRadius:8,border:`1px solid ${T.border}`,opacity:0.4}}>
                <div style={{width:32,height:32,borderRadius:"50%",background:T.border,flexShrink:0}}/>
                <div style={{flex:1}}><div style={{height:10,background:T.border,borderRadius:4,width:"60%",marginBottom:4}}/><div style={{height:8,background:T.border,borderRadius:4,width:"40%"}}/></div>
                <div style={{width:40,height:10,background:T.border,borderRadius:4}}/>
              </div>
            ))}
          </div>
          {!broadcastProgress.active&&<button onClick={()=>{setBroadcastProgress(null);setBroadcastLog([]);}} className="nx-btn primary" style={{width:"100%",justifyContent:"center",marginTop:16,padding:"10px"}}>Done</button>}
        </div>
      </div>}

      {/* ══ IDLE WARNING MODAL ══ */}
      {idleWarning&&<IdleWarningModal
        countdown={idleCountdown}
        setCountdown={setIdleCountdown}
        onContinue={()=>{setIdleWarning(false);setIdleCountdown(30);idleWarningRef.current=false;}}
        onLogout={()=>{
          sessionStorage.removeItem("crm_token");
          sessionStorage.removeItem("crm_user");
          sessionStorage.removeItem("crm_perms");
          sessionStorage.removeItem("crm_timeout");
          window.location.href = window.location.href.split("?")[0] + "?logout=" + Date.now();
        }}
        T={T} WA_GREEN={WA_GREEN}
      />}

      {/* ══ UNSAVED SETTINGS MODAL ══ */}
      {showUnsavedModal&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
        <div style={{background:T.card,borderRadius:20,padding:28,width:"100%",maxWidth:380,boxShadow:"0 24px 60px rgba(0,0,0,.3)"}}>
          <div style={{fontSize:24,marginBottom:12,textAlign:"center"}}>⚠️</div>
          <div style={{fontWeight:800,fontSize:17,marginBottom:8,textAlign:"center"}}>Unsaved Changes</div>
          <div style={{fontSize:13,color:T.textMuted,marginBottom:24,textAlign:"center",lineHeight:1.6}}>
            You have unsaved settings changes.<br/>Do you want to save before leaving?
          </div>
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>{setShowUnsavedModal(false);setSettingsDirtyWithRef(false);setTab(pendingTab);setPendingTab(null);fetchSettings(null,true);}}
              style={{flex:1,padding:"11px",borderRadius:12,border:`1px solid ${T.border}`,background:T.card2,color:T.textMuted,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
              Discard
            </button>
            <button onClick={async()=>{await saveSettings();setShowUnsavedModal(false);setTab(pendingTab);setPendingTab(null);}}
              style={{flex:2,padding:"11px",borderRadius:12,border:"none",background:WA_GREEN,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
              💾 Save & Continue
            </button>
          </div>
        </div>
      </div>}

    </div>
  );
}

// ── BOT TEST TAB ──────────────────────────────────────────────────────────────
function BotTestTab({T, WA_GREEN, dark, isAdmin, currentUser, authToken, adminOverview, API, ts, formatMsgTime, botEndRef, qaData, SourceBadge}) {
  const authHeaders = () => ({"Content-Type":"application/json","Authorization":`Bearer ${authToken}`});

  // Which client's sandbox we're testing
  const [botClinicId, setBotClinicId] = React.useState(isAdmin ? null : currentUser?.clinic_id);
  const [botClinicName, setBotClinicName] = React.useState(isAdmin ? "" : (currentUser?.company_name||"Your Bot"));

  // Sandbox state
  const [sandbox, setSandbox] = React.useState(null);  // {system_prompt, welcome_message, qa}
  const [sandboxLoading, setSandboxLoading] = React.useState(false);
  const [sandboxDirty, setSandboxDirty] = React.useState(false);
  const [sandboxSaving, setSandboxSaving] = React.useState(false);
  const [publishLoading, setPublishLoading] = React.useState(false);
  const [publishResult, setPublishResult] = React.useState(null);

  // Panel tabs: "editor" | "chat" | "analyser"
  const [panel, setPanel] = React.useState("chat");

  // Chat
  const [convo, setConvo] = React.useState([{from:"bot",text:"👋 Hi! I'm the sandbox bot 😊\nHow can I help you today?",time:ts(),sources:[]}]);
  const [input, setInput] = React.useState("");
  const [chatLoading, setChatLoading] = React.useState(false);

  // Analyser
  const [brokenChat, setBrokenChat] = React.useState("");
  const [analysing, setAnalysing] = React.useState(false);
  const [analysis, setAnalysis] = React.useState("");

  // New QA for sandbox editor
  const [newQ, setNewQ] = React.useState("");
  const [newA, setNewA] = React.useState("");
  const [editQAId, setEditQAId] = React.useState(null);
  const [editQText, setEditQText] = React.useState("");
  const [editAText, setEditAText] = React.useState("");

  const loadSandbox = async (clinicId) => {
    if(!clinicId) return;
    setSandboxLoading(true); setSandbox(null); setSandboxDirty(false);
    try {
      const r = await fetch(`${API}/api/bot/sandbox/${clinicId}`, {headers:authHeaders()});
      if(r.ok) { const d = await r.json(); setSandbox(d); }
      else setSandbox({system_prompt:"",welcome_message:"",qa:[]});
    } catch { setSandbox({system_prompt:"",welcome_message:"",qa:[]}); }
    setSandboxLoading(false);
  };

  React.useEffect(()=>{ if(botClinicId) loadSandbox(botClinicId); }, [botClinicId]);

  // Auto-load for non-admin
  React.useEffect(()=>{ if(!isAdmin && currentUser?.clinic_id) { setBotClinicId(currentUser.clinic_id); } }, []);

  const saveSandbox = async () => {
    if(!botClinicId||!sandbox) return;
    setSandboxSaving(true);
    try {
      await fetch(`${API}/api/bot/sandbox/${botClinicId}`, {
        method:"PATCH", headers:authHeaders(),
        body:JSON.stringify(sandbox)
      });
      setSandboxDirty(false);
      flash("💾 Sandbox saved!");
    } catch { flash("❌ Save failed"); }
    setSandboxSaving(false);
  };

  const resetSandbox = async () => {
    if(!botClinicId) return;
    setConfirmModal({title:"Reset Sandbox?",message:"Your sandbox edits will be lost and replaced with live data.",icon:"🔄",danger:true,confirmText:"Yes, Reset",
      onConfirm:async()=>{try{await fetch(`${API}/api/bot/sandbox/${botClinicId}/reset`,{method:"POST",headers:authHeaders()});await loadSandbox(botClinicId);flash("🔄 Sandbox reset");}catch{flash("❌ Reset failed");}}});
  };

  const publishSandbox = async () => {
    if(!botClinicId) return;
    if(!window._confirmPublish) { setConfirmModal({title:`Publish to LIVE for ${botClinicName}?`,message:"This replaces the current live KB and system prompt. Users will see changes immediately.",icon:"🚀",danger:true,confirmText:"Yes, Publish Live",onConfirm:()=>{window._confirmPublish=true;publishSandbox();window._confirmPublish=false;}}); return; }
    setPublishLoading(true); setPublishResult(null);
    try {
      const r = await fetch(`${API}/api/bot/sandbox/${botClinicId}/publish`, {method:"POST",headers:authHeaders()});
      const d = await r.json();
      if(r.ok) setPublishResult({ok:true, msg:`✅ Published! ${d.published_qa} Q&A pairs now live.`});
      else setPublishResult({ok:false, msg:`❌ ${d.error}`});
    } catch { setPublishResult({ok:false, msg:"❌ Network error"}); }
    setPublishLoading(false);
  };

  const sendMessage = async () => {
    if(!input.trim()||chatLoading||!botClinicId) return;
    const userMsg = {from:"user",text:input.trim(),time:ts(),sources:[]};
    setConvo(p=>[...p,userMsg]); setInput(""); setChatLoading(true);
    try {
      const history = [...convo,userMsg].map(m=>({role:m.from==="user"?"user":"assistant",content:m.text}));
      const r = await fetch(`${API}/api/bot/sandbox/${botClinicId}/chat`, {
        method:"POST", headers:authHeaders(),
        body:JSON.stringify({history})
      });
      if(r.ok) {
        const d = await r.json();
        setConvo(p=>[...p,{from:"bot",text:d.text||"⚠️ No response",time:ts(),sources:d.sources||[]}]);
      } else {
        const err = await r.json().catch(()=>({}));
        setConvo(p=>[...p,{from:"bot",text:`⚠️ ${err.error||"Error"}`,time:ts(),sources:[]}]);
      }
    } catch { setConvo(p=>[...p,{from:"bot",text:"⚠️ Could not reach server.",time:ts(),sources:[]}]); }
    setChatLoading(false);
  };

  const runAnalysis = async () => {
    if(!brokenChat.trim()||!botClinicId) return;
    setAnalysing(true); setAnalysis("");
    try {
      const r = await fetch(`${API}/api/bot/analyse`, {
        method:"POST", headers:authHeaders(),
        body:JSON.stringify({clinic_id:botClinicId, conversation:brokenChat})
      });
      const d = await r.json();
      setAnalysis(d.analysis||d.error||"No response");
    } catch { setAnalysis("❌ Network error"); }
    setAnalysing(false);
  };

  // Apply AI suggestion to sandbox
  const applySuggestion = (text) => {
    // Look for ADD: lines and auto-add to sandbox QA
    const addLines = text.match(/ADD:\s*Q:\s*(.+?)\s*\|\s*A:\s*(.+)/g)||[];
    if(addLines.length>0 && sandbox) {
      const newPairs = addLines.map(l=>{
        const m = l.match(/ADD:\s*Q:\s*(.+?)\s*\|\s*A:\s*(.+)/);
        return m ? {question:m[1].trim(),answer:m[2].trim(),is_static:false} : null;
      }).filter(Boolean);
      setSandbox(p=>({...p, qa:[...(p.qa||[]),...newPairs]}));
      setSandboxDirty(true);
      flash(`➕ Added ${newPairs.length} Q&A pair(s) to sandbox`);
    } else {
      flash("Copy the suggestions above and apply them manually in the Editor tab");
    }
  };

  // Flash message
  const [flashMsg, setFlashMsg] = React.useState("");
  const flash = (msg) => { setFlashMsg(msg); setTimeout(()=>setFlashMsg(""),3000); };

  const PANELS = [
    {id:"editor", icon:"✏️", label:"Editor"},
    {id:"chat",   icon:"💬", label:"Test Chat"},
    {id:"analyser",icon:"🔍",label:"Analyser"},
  ];

  if(!botClinicId && isAdmin) {
    return (
      <div style={{flex:1,display:"flex",background:T.bg,overflow:"hidden"}}>
        {/* Admin client picker */}
        <div style={{width:240,borderRight:`1px solid ${T.border}`,overflowY:"auto",flexShrink:0,background:T.card}}>
          <div style={{padding:"14px 16px",borderBottom:`1px solid ${T.border}`,fontWeight:700,fontSize:11,color:T.textMuted,textTransform:"uppercase",letterSpacing:1}}>Select Client to Test</div>
          {adminOverview.filter((c,i,a)=>a.findIndex(x=>x.clinic_id===c.clinic_id)===i).map(c=>(
            <div key={c.clinic_id} onClick={()=>{setBotClinicId(c.clinic_id);setBotClinicName(c.company_name||c.username||"Client");}}
              style={{padding:"12px 16px",cursor:"pointer",opacity:(c.active===false||c.active===0||c.active==='false'||c.active===null)?0.45:1,display:"flex",alignItems:"center",gap:10,borderBottom:`1px solid ${T.border}40`}}>
              <div style={{width:32,height:32,borderRadius:8,overflow:"hidden",background:`${WA_GREEN}15`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                {c.logo_url?<img src={c.logo_url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:<span style={{fontSize:16}}>🏢</span>}
              </div>
              <div>
                <div style={{fontWeight:700,fontSize:13,color:T.text}}>{c.company_name||c.username}</div>
                <div style={{fontSize:10,color:T.textMuted}}>{c.industry||"Client"}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:10,color:T.textMuted}}>
          <div style={{fontSize:48}}>👈</div>
          <div style={{fontWeight:700,fontSize:16}}>Select a client to start testing</div>
          <div style={{fontSize:13}}>Each client has their own sandbox — changes here never affect live</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",background:T.bg}}>

      {/* Top bar */}
      <div style={{background:T.nav,borderBottom:`1px solid ${T.border}`,padding:"8px 16px",display:"flex",alignItems:"center",gap:12,flexShrink:0,flexWrap:"wrap"}}>
        {/* Client picker pill — admin only */}
        {isAdmin&&<div style={{display:"flex",alignItems:"center",gap:8,padding:"5px 12px",borderRadius:20,background:`${WA_GREEN}15`,border:`1px solid ${WA_GREEN}30`,cursor:"pointer"}}
          onClick={()=>{setBotClinicId(null);setSandbox(null);setConvo([{from:"bot",text:"👋 Hi! I'm the sandbox bot 😊\nHow can I help you today?",time:ts(),sources:[]}]);}}>
          <span style={{fontSize:11,fontWeight:700,color:WA_GREEN}}>🏢 {botClinicName}</span>
          <span style={{fontSize:10,color:WA_GREEN,opacity:.7}}>✕ change</span>
        </div>}

        {/* Panel tabs */}
        <div style={{display:"flex",gap:4,flex:1}}>
          {PANELS.map(p=>(
            <button key={p.id} onClick={()=>setPanel(p.id)}
              style={{padding:"5px 14px",borderRadius:16,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:panel===p.id?700:400,
                background:panel===p.id?WA_GREEN:T.card2,
                color:panel===p.id?"#fff":T.textMuted}}>
              {p.icon} {p.label}
            </button>
          ))}
        </div>

        {/* Sandbox status + actions */}
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          {sandboxDirty&&<span style={{fontSize:11,color:"#f59e0b",fontWeight:600}}>● Unsaved changes</span>}
          <button onClick={resetSandbox}
            style={{padding:"5px 10px",borderRadius:10,border:`1px solid ${T.border}`,background:T.card2,color:T.textMuted,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>
            🔄 Reset from Live
          </button>
          {sandboxDirty&&<button onClick={saveSandbox} disabled={sandboxSaving}
            style={{padding:"5px 12px",borderRadius:10,border:"none",background:"#3b82f6",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
            {sandboxSaving?"Saving...":"💾 Save Sandbox"}
          </button>}
          <button onClick={publishSandbox} disabled={publishLoading}
            style={{padding:"5px 14px",borderRadius:10,border:"none",background:WA_GREEN,color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
            {publishLoading?"Publishing...":"🚀 Publish to Live"}
          </button>
        </div>
      </div>

      {/* Flash message */}
      {flashMsg&&<div style={{background:"#1e293b",color:"#fff",padding:"8px 16px",fontSize:12,fontWeight:600,textAlign:"center",flexShrink:0}}>
        {flashMsg}
      </div>}

      {/* Publish result */}
      {publishResult&&<div style={{background:publishResult.ok?"#f0fdf4":"#fef2f2",color:publishResult.ok?"#166534":"#dc2626",
        padding:"8px 16px",fontSize:12,fontWeight:600,textAlign:"center",flexShrink:0,
        border:`1px solid ${publishResult.ok?"#86efac":"#fca5a5"}`}}>
        {publishResult.msg}
        <button onClick={()=>setPublishResult(null)} style={{marginLeft:12,border:"none",background:"none",cursor:"pointer",fontSize:14,color:"inherit"}}>✕</button>
      </div>}

      {sandboxLoading&&<div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:T.textMuted,fontSize:13}}>Loading sandbox...</div>}

      {!sandboxLoading&&<div style={{flex:1,display:"flex",overflow:"hidden"}}>

        {/* ── PANEL: EDITOR ── */}
        {panel==="editor"&&<div style={{flex:1,overflowY:"auto",padding:20,paddingBottom:80}}>
          <div style={{maxWidth:700,margin:"0 auto"}}>

            {/* Sandbox badge */}
            <div style={{background:"#fef9c3",border:"1px solid #fde68a",borderRadius:10,padding:"8px 14px",marginBottom:16,fontSize:12,color:"#854d0e",fontWeight:600,display:"flex",alignItems:"center",gap:8}}>
              🧪 <strong>Sandbox Mode</strong> — Changes here are isolated. Use "🚀 Publish to Live" when ready to go live.
            </div>

            {/* System Prompt */}
            <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:18,marginBottom:14}}>
              <div style={{fontWeight:800,fontSize:14,marginBottom:4}}>⚙️ Bot Personality & Behaviour</div>
              <div style={{fontSize:11,color:T.textMuted,marginBottom:10}}>Edit safely — won't affect live until you publish</div>
              <textarea value={sandbox?.system_prompt||""} rows={6}
                onChange={e=>{setSandbox(p=>({...p,system_prompt:e.target.value}));setSandboxDirty(true);}}
                style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:10,padding:"10px 14px",color:T.text,fontSize:12,fontFamily:"inherit",resize:"vertical",boxSizing:"border-box"}}/>
            </div>

            {/* Welcome Message */}
            <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:18,marginBottom:14}}>
              <div style={{fontWeight:800,fontSize:14,marginBottom:4}}>👋 Welcome Message</div>
              <textarea value={sandbox?.welcome_message||""} rows={2}
                onChange={e=>{setSandbox(p=>({...p,welcome_message:e.target.value}));setSandboxDirty(true);}}
                style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:10,padding:"10px 14px",color:T.text,fontSize:12,fontFamily:"inherit",resize:"vertical",boxSizing:"border-box"}}/>
            </div>

            {/* Q&A editor */}
            <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:18,marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                <div>
                  <div style={{fontWeight:800,fontSize:14}}>📋 Knowledge Base ({(sandbox?.qa||[]).length} entries)</div>
                  <div style={{fontSize:11,color:T.textMuted,marginTop:2}}>Edit sandbox KB — won't affect live</div>
                </div>
              </div>

              {/* Add new QA */}
              <div style={{background:T.card2,borderRadius:10,padding:12,marginBottom:12,border:`1px solid ${T.border}`}}>
                <input value={newQ} onChange={e=>setNewQ(e.target.value)}
                  placeholder="New question..."
                  style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:12,marginBottom:6,boxSizing:"border-box"}}/>
                <textarea value={newA} onChange={e=>setNewA(e.target.value)} rows={2}
                  placeholder="Answer..."
                  style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:12,fontFamily:"inherit",resize:"vertical",marginBottom:8,boxSizing:"border-box"}}/>
                <button onClick={()=>{
                  if(!newQ.trim()||!newA.trim()) return;
                  setSandbox(p=>({...p,qa:[...(p.qa||[]),{question:newQ.trim(),answer:newA.trim(),is_static:false}]}));
                  setSandboxDirty(true); setNewQ(""); setNewA("");
                }} style={{padding:"6px 16px",borderRadius:8,border:"none",background:WA_GREEN,color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                  ➕ Add to Sandbox
                </button>
              </div>

              {/* QA list */}
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {(sandbox?.qa||[]).map((qa,i)=>(
                  <div key={i} style={{background:T.card2,borderRadius:10,padding:"10px 12px",border:`1px solid ${T.border}`}}>
                    {editQAId===i
                      ?<div>
                        <input value={editQText} onChange={e=>setEditQText(e.target.value)}
                          style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:12,marginBottom:6,boxSizing:"border-box"}}/>
                        <textarea value={editAText} onChange={e=>setEditAText(e.target.value)} rows={2}
                          style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:7,padding:"7px 10px",color:T.text,fontSize:12,fontFamily:"inherit",resize:"vertical",marginBottom:8,boxSizing:"border-box"}}/>
                        <div style={{display:"flex",gap:6}}>
                          <button onClick={()=>{
                            const updated=[...(sandbox?.qa||[])];
                            updated[i]={...updated[i],question:editQText,answer:editAText};
                            setSandbox(p=>({...p,qa:updated})); setSandboxDirty(true); setEditQAId(null);
                          }} style={{padding:"4px 12px",borderRadius:7,border:"none",background:WA_GREEN,color:"#fff",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Save</button>
                          <button onClick={()=>setEditQAId(null)} style={{padding:"4px 12px",borderRadius:7,border:`1px solid ${T.border}`,background:T.card,color:T.textMuted,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
                        </div>
                      </div>
                      :<div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                        <div style={{width:20,height:20,borderRadius:5,background:`${WA_GREEN}15`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:WA_GREEN,flexShrink:0,marginTop:2}}>{i+1}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:700,fontSize:12,color:T.text,marginBottom:2}}>{qa.question}</div>
                          <div style={{fontSize:11,color:T.textMuted,lineHeight:1.5}}>{qa.answer}</div>
                        </div>
                        <div style={{display:"flex",gap:4,flexShrink:0}}>
                          <button onClick={()=>{setEditQAId(i);setEditQText(qa.question);setEditAText(qa.answer);}}
                            style={{padding:"3px 8px",borderRadius:6,border:`1px solid ${WA_GREEN}40`,background:`${WA_GREEN}10`,color:WA_GREEN,fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>✏️</button>
                          <button onClick={()=>{
                            const updated=(sandbox?.qa||[]).filter((_,j)=>j!==i);
                            setSandbox(p=>({...p,qa:updated})); setSandboxDirty(true);
                          }} style={{padding:"3px 8px",borderRadius:6,border:"1px solid #ef444430",background:"#ef444408",color:"#ef4444",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>✕</button>
                        </div>
                      </div>}
                  </div>
                ))}
                {(sandbox?.qa||[]).length===0&&<div style={{textAlign:"center",padding:24,color:T.textFaint,fontSize:12}}>No Q&A in sandbox yet</div>}
              </div>
            </div>
          </div>
        </div>}

        {/* ── PANEL: TEST CHAT ── */}
        {panel==="chat"&&<div style={{flex:1,display:"flex",flexDirection:"column",width:"100%"}}>
          {/* Sandbox info bar */}
          <div style={{background:"#fef9c3",borderBottom:"1px solid #fde68a",padding:"5px 14px",fontSize:11,color:"#854d0e",fontWeight:600,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
            <span>🧪 Using sandbox KB — {(sandbox?.qa||[]).length} entries · save sandbox before testing to see changes</span>
            <button onClick={()=>{setConvo([{from:"bot",text:"👋 Hi! I'm the sandbox bot 😊\nHow can I help you today?",time:ts(),sources:[]}]);}}
              style={{border:"none",background:"none",cursor:"pointer",fontSize:11,color:"#854d0e",fontWeight:700}}>↺ Reset chat</button>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:14,paddingBottom:20,background:T.chatBg,display:"flex",flexDirection:"column",gap:7}}>
            {convo.map((msg,i)=>(
              <div key={i} className="mb" style={{display:"flex",justifyContent:msg.from==="user"?"flex-end":"flex-start"}}>
                <div style={{maxWidth:"72%",background:msg.from==="user"?T.msgOut:T.msgIn,borderRadius:msg.from==="user"?"16px 4px 16px 16px":"4px 16px 16px 16px",padding:"9px 13px",boxShadow:"0 1px 2px rgba(0,0,0,.1)"}}>
                  <div style={{fontSize:10,color:msg.from==="user"?"#34B7F1":WA_GREEN,fontWeight:700,marginBottom:3}}>{msg.from==="user"?"👤 You":"🤖 Sandbox Bot"}</div>
                  <div style={{fontSize:13,lineHeight:1.5,whiteSpace:"pre-wrap",color:T.text}}>{msg.text}</div>
                  <div style={{fontSize:10,color:T.textFaint,textAlign:"right",marginTop:2}}>{msg.time}</div>
                </div>
              </div>
            ))}
            {chatLoading&&<div style={{display:"flex",justifyContent:"flex-start"}}>
              <div style={{background:T.msgIn,borderRadius:"4px 16px 16px 16px",padding:"10px 14px"}}>
                <div style={{display:"flex",gap:4}}>{[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:T.textMuted,animation:`bounce 1.2s ${i*0.2}s infinite`}}/>)}</div>
              </div>
            </div>}
            <div ref={botEndRef}/>
          </div>
          <div style={{padding:"8px 10px",background:T.nav,borderTop:`1px solid ${T.border}`,display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
            <input value={input} onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage();}}}
              placeholder={botClinicId?"Ask the sandbox bot anything...":"Select a client first"}
              disabled={chatLoading||!botClinicId}
              style={{flex:1,background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:20,padding:"9px 14px",color:T.text,fontSize:13}}/>
            <button onClick={sendMessage} disabled={chatLoading||!input.trim()||!botClinicId}
              style={{width:40,height:40,borderRadius:"50%",border:"none",
                background:chatLoading||!input.trim()||!botClinicId?T.card2:WA_GREEN,
                color:chatLoading||!input.trim()||!botClinicId?T.textFaint:"#fff",
                fontSize:16,cursor:chatLoading?"not-allowed":"pointer",flexShrink:0}}>➤</button>
          </div>
        </div>}

        {/* ── PANEL: ANALYSER ── */}
        {panel==="analyser"&&<div style={{flex:1,overflowY:"auto",padding:20,paddingBottom:80}}>
          <div style={{maxWidth:760,margin:"0 auto"}}>

            <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:20,marginBottom:16}}>
              <div style={{fontWeight:800,fontSize:16,marginBottom:4}}>🔍 Chat Analyser</div>
              <div style={{fontSize:12,color:T.textMuted,marginBottom:16,lineHeight:1.6}}>
                Paste a real conversation that went wrong. The AI will read your <strong>current sandbox</strong> prompt and KB, diagnose exactly what failed, and give you the precise text to fix it.
              </div>

              <div style={{fontSize:11,fontWeight:700,color:T.textMuted,marginBottom:6,textTransform:"uppercase",letterSpacing:0.5}}>Paste the broken conversation here:</div>
              <textarea value={brokenChat} onChange={e=>setBrokenChat(e.target.value)} rows={10}
                placeholder={"Customer: How much is the consultation?\nBot: I'm sorry, I don't have that information.\nCustomer: You useless lah\n\n(Bot should have answered RM100 from the KB)"}
                style={{width:"100%",background:T.input,border:`1.5px solid ${T.border}`,borderRadius:10,
                  padding:"12px 14px",color:T.text,fontSize:12,fontFamily:"monospace",
                  resize:"vertical",boxSizing:"border-box",minHeight:180,lineHeight:1.6}}/>

              <button onClick={runAnalysis} disabled={analysing||!brokenChat.trim()||!botClinicId}
                style={{marginTop:12,padding:"10px 24px",borderRadius:10,border:"none",
                  background:analysing||!brokenChat.trim()||!botClinicId?"#94a3b8":"#7c3aed",
                  color:"#fff",fontSize:13,fontWeight:700,cursor:analysing?"not-allowed":"pointer",fontFamily:"inherit",
                  display:"flex",alignItems:"center",gap:8}}>
                {analysing?"🔍 Analysing...":"🔍 Analyse & Fix"}
              </button>
            </div>

            {/* Analysis result */}
            {analysing&&<div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:20,textAlign:"center",color:T.textMuted}}>
              <div style={{fontSize:32,marginBottom:8}}>🤖</div>
              <div style={{fontWeight:600}}>AI is reading your prompt, KB, and conversation...</div>
            </div>}

            {analysis&&!analysing&&<div style={{background:T.card,border:`1px solid #7c3aed40`,borderRadius:14,padding:20}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                <div style={{fontWeight:800,fontSize:15,color:"#7c3aed"}}>🤖 AI Diagnosis</div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>applySuggestion(analysis)}
                    style={{padding:"5px 14px",borderRadius:8,border:"none",background:WA_GREEN,color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                    ➕ Apply ADD suggestions to Sandbox
                  </button>
                  <button onClick={()=>setPanel("editor")}
                    style={{padding:"5px 14px",borderRadius:8,border:`1px solid ${T.border}`,background:T.card2,color:T.text,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>
                    ✏️ Go to Editor
                  </button>
                </div>
              </div>
              {/* Render analysis with section highlights */}
              <div style={{whiteSpace:"pre-wrap",fontSize:13,lineHeight:1.8,color:T.text,fontFamily:"inherit"}}>
                {analysis.split("\n").map((line,i)=>{
                  const isHeader = /^(1\.|2\.|3\.|4\.|DIAGNOS|SYSTEM PROMPT|KB FIX|SUMMARY|ADD:|EDIT:)/i.test(line.trim());
                  const isAdd = /^ADD:/i.test(line.trim());
                  const isEdit = /^EDIT:/i.test(line.trim());
                  return <div key={i} style={{
                    fontWeight:isHeader?700:400,
                    color:isAdd?WA_GREEN:isEdit?"#f59e0b":isHeader?"#7c3aed":T.text,
                    background:isAdd?`${WA_GREEN}10`:isEdit?"#fffbeb":undefined,
                    borderRadius:isAdd||isEdit?6:undefined,
                    padding:isAdd||isEdit?"2px 8px":undefined,
                    marginBottom:isHeader?4:0,
                  }}>{line||"\u00a0"}</div>;
                })}
              </div>
            </div>}
          </div>
        </div>}

      </div>}
    </div>
  );
}

// ── NOTES TAB ─────────────────────────────────────────────────────────────────
function NotesTab({T, WA_GREEN, dark, isAdmin, currentUser, authToken, adminOverview, API, ts,
  notes, setNotes, notesLoading, setNotesLoading, notesClinic, setNotesClinic, onJumpToChat, contacts}) {

  const authHeaders = () => ({"Content-Type":"application/json","Authorization":`Bearer ${authToken}`});
  const [newNote, setNewNote] = React.useState({contact_id:"", contact_name:"", note_text:""});
  const [showAdd, setShowAdd] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [showBackfill, setShowBackfill] = React.useState(false);
  const [backfillFrom, setBackfillFrom] = React.useState(()=>{const d=new Date();d.setDate(d.getDate()-30);return d.toISOString().split("T")[0];});
  const [backfillTo, setBackfillTo] = React.useState(()=>new Date().toISOString().split("T")[0]);
  const [backfilling, setBackfilling] = React.useState(false);
  const [backfillResult, setBackfillResult] = React.useState(null);
  const [editingNoteId, setEditingNoteId] = React.useState(null);
  const [editingNoteText, setEditingNoteText] = React.useState("");
  // New: contact picker modal
  const [showAddModal, setShowAddModal] = React.useState(false);
  const [contactSearch, setContactSearch] = React.useState("");
  const [selectedContact, setSelectedContact] = React.useState(null);
  const [modalNoteText, setModalNoteText] = React.useState("");
  const [existingNoteWarn, setExistingNoteWarn] = React.useState(null); // {note} if active note exists
  const [highlightNoteId, setHighlightNoteId] = React.useState(null);

  const clinicId = isAdmin ? notesClinic?.clinic_id : currentUser?.clinic_id;

  const loadNotes = async (cid) => {
    if(!cid) return;
    setNotesLoading(true);
    try {
      const r = await fetch(`${API}/api/notes?clinic_id=${cid}`, {headers:authHeaders()});
      if(r.ok) setNotes(await r.json());
      else setNotes([]);
    } catch { setNotes([]); }
    setNotesLoading(false);
  };

  React.useEffect(()=>{ if(!isAdmin && currentUser?.clinic_id) loadNotes(currentUser.clinic_id); }, []);
  React.useEffect(()=>{ if(isAdmin && notesClinic?.clinic_id) loadNotes(notesClinic.clinic_id); }, [notesClinic]);

  const runBackfill = async () => {
    if(!clinicId) return;
    setBackfilling(true); setBackfillResult(null);
    try {
      const r = await fetch(`${API}/api/notes/generate`, {
        method:"POST", headers:authHeaders(),
        body:JSON.stringify({clinic_id:clinicId, date_from:backfillFrom, date_to:backfillTo})
      });
      const d = await r.json();
      if(r.ok) { setBackfillResult({ok:true, created:d.created, skipped:d.skipped, processed:d.processed}); await loadNotes(clinicId); }
      else setBackfillResult({ok:false, error:d.error||"Failed"});
    } catch { setBackfillResult({ok:false, error:"Network error"}); }
    setBackfilling(false);
  };

  const addNote = async () => {
    if(!newNote.contact_id.trim()||!newNote.note_text.trim()||!clinicId) return;
    setSaving(true);
    try {
      const r = await fetch(`${API}/api/notes`, {method:"POST", headers:authHeaders(), body:JSON.stringify({...newNote, clinic_id:clinicId})});
      if(r.ok) { const n = await r.json(); setNotes(p=>[n,...p]); setNewNote({contact_id:"", contact_name:"", note_text:""}); setShowAdd(false); }
    } catch {}
    setSaving(false);
  };

  const openAddModal = () => {
    setShowAddModal(true);
    setContactSearch("");
    setSelectedContact(null);
    setModalNoteText("");
    setExistingNoteWarn(null);
  };

  const selectContactForNote = (c) => {
    setSelectedContact(c);
    const existing = notes.find(n => !n.is_done && (n.contact_id===c.id||n.contact_id===c.phone));
    if(existing) { setExistingNoteWarn(existing); } else { setExistingNoteWarn(null); }
  };

  const saveModalNote = async () => {
    if(!selectedContact||!modalNoteText.trim()||!clinicId) return;
    setSaving(true);
    try {
      const r = await fetch(`${API}/api/notes`, {method:"POST", headers:authHeaders(),
        body:JSON.stringify({contact_id:selectedContact.id||selectedContact.phone,contact_name:selectedContact.name||selectedContact.phone,note_text:modalNoteText.trim(),clinic_id:clinicId})});
      if(r.ok) { const n=await r.json(); setNotes(p=>[n,...p]); setShowAddModal(false); setModalNoteText(""); setSelectedContact(null); }
    } catch {}
    setSaving(false);
  };

  const goToExistingNote = (note) => {
    setShowAddModal(false); setExistingNoteWarn(null);
    setHighlightNoteId(note.id); setEditingNoteId(note.id); setEditingNoteText(note.note_text);
    setTimeout(()=>{ const el=document.getElementById("note-card-"+note.id); if(el) el.scrollIntoView({behavior:"smooth",block:"center"}); }, 100);
    setTimeout(()=>setHighlightNoteId(null), 3000);
  };

  const markDone = async (id, isDone) => {
    try {
      const r = await fetch(`${API}/api/notes/${id}/done`, {method:"PATCH", headers:authHeaders(), body:JSON.stringify({is_done:isDone})});
      if(r.ok) { const u = await r.json(); setNotes(p=>p.map(n=>n.id===id?u:n).sort((a,b)=>a.is_done-b.is_done)); }
    } catch {}
  };

  const deleteNote = async (id) => {
    setConfirmModal({title:"Delete Note?",message:"This note will be permanently deleted.",icon:"🗑️",danger:true,confirmText:"Yes, Delete",
      onConfirm:async()=>{try{await fetch(`${API}/api/notes/${id}`,{method:"DELETE",headers:authHeaders()});setNotes(p=>p.filter(n=>n.id!==id));}catch{}}});
  };

  const saveEditNote = async (id) => {
    if(!editingNoteText.trim()) return;
    try {
      const r = await fetch(`${API}/api/notes/${id}`, {method:"PATCH", headers:authHeaders(), body:JSON.stringify({note_text:editingNoteText.trim()})});
      if(r.ok) { const u = await r.json(); setNotes(p=>p.map(n=>n.id===id?u:n)); setEditingNoteId(null); setEditingNoteText(""); }
    } catch {}
  };

  const fmt = (dt) => { try { return new Date(dt).toLocaleDateString("en-MY",{day:"numeric",month:"short",year:"numeric"}); } catch { return ""; } };

  const activeNotes = notes.filter(n=>!n.is_done);
  const doneNotes   = notes.filter(n=>n.is_done);

  // Admin client picker
  if(isAdmin && !notesClinic) return (
    <div style={{flex:1,display:"flex",flexDirection:"column",background:T.bg,overflow:"hidden"}}>
      {/* Page header with client pills */}
      <div className="nx-page-header" style={{flexShrink:0}}>
        <i className="ti ti-notes" style={{fontSize:20,color:WA_GREEN}}/>
        <div>
          <div className="nx-page-title">Notes</div>
          <div className="nx-page-sub">Select a client to view notes</div>
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
          {adminOverview.filter((c,i,a)=>a.findIndex(x=>x.clinic_id===c.clinic_id)===i).map(c=>(
            <div key={c.clinic_id} onClick={()=>setNotesClinic(c)}
              style={{display:"flex",alignItems:"center",gap:5,padding:"3px 10px",borderRadius:20,cursor:"pointer",
                border:`1px solid ${T.border}`,background:"transparent",
                opacity:(c.active===false||c.active===0)?0.5:1,transition:"all .15s"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=WA_GREEN;e.currentTarget.style.background=`${WA_GREEN}10`;}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background="transparent";}}>
              <div style={{width:14,height:14,borderRadius:3,overflow:"hidden",background:`${WA_GREEN}15`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                {c.logo_url?<img src={c.logo_url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:<span style={{fontSize:9}}>🏢</span>}
              </div>
              <span style={{fontSize:11,fontWeight:700,color:T.text}}>{c.company_name||c.username}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:10,color:T.textMuted}}>
        <div style={{fontSize:40,marginBottom:8}}>📝</div>
        <div style={{fontWeight:700,fontSize:16}}>Select a client above</div>
        <div style={{fontSize:13}}>Click a client pill to view their notes</div>
      </div>
    </div>
  );

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",background:T.bg,overflow:"hidden"}}>

      {/* ── CONTACT PICKER MODAL ── */}
      {showAddModal&&<>
        <div onClick={()=>{setShowAddModal(false);setExistingNoteWarn(null);}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.45)",zIndex:500,backdropFilter:"blur(4px)"}}/>
        <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",zIndex:600,
          background:T.card,borderRadius:20,width:"min(480px,95vw)",maxHeight:"80vh",display:"flex",flexDirection:"column",
          boxShadow:"0 20px 60px rgba(0,0,0,.2)",overflow:"hidden",animation:"fadeUp .25s cubic-bezier(.22,1,.36,1)"}}>
          {/* Modal Header */}
          <div style={{padding:"18px 20px 14px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
            <div style={{width:36,height:36,borderRadius:10,background:"linear-gradient(135deg,#6c63ff,#5a52e0)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>📝</div>
            <div style={{flex:1}}>
              <div style={{fontWeight:800,fontSize:15,color:T.text}}>Add Note</div>
              <div style={{fontSize:11,color:T.textMuted,marginTop:1}}>Select a contact from your inbox</div>
            </div>
            <button onClick={()=>{setShowAddModal(false);setExistingNoteWarn(null);}}
              style={{width:30,height:30,borderRadius:8,border:`1px solid ${T.border}`,background:T.card2,cursor:"pointer",fontSize:16,color:T.textMuted,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
          </div>

          {/* Existing note warning popup */}
          {existingNoteWarn&&<div style={{margin:"12px 20px 0",padding:"12px 14px",background:"#fff7ed",borderRadius:12,border:"1px solid #fed7aa",display:"flex",alignItems:"flex-start",gap:10}}>
            <span style={{fontSize:20,flexShrink:0}}>⚠️</span>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:12,color:"#c2410c",marginBottom:3}}>Active note already exists for this contact!</div>
              <div style={{fontSize:11,color:"#92400e",lineHeight:1.5,marginBottom:8}}>"{existingNoteWarn.note_text?.slice(0,80)}{existingNoteWarn.note_text?.length>80?"...":""}"</div>
              <div style={{display:"flex",gap:6}}>
                <button onClick={()=>goToExistingNote(existingNoteWarn)}
                  style={{padding:"6px 14px",borderRadius:8,border:"none",background:"#d97706",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>✏️ Edit Existing Note</button>
                <button onClick={()=>setExistingNoteWarn(null)}
                  style={{padding:"6px 12px",borderRadius:8,border:"1px solid #fed7aa",background:"transparent",color:"#92400e",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Create Anyway</button>
              </div>
            </div>
          </div>}

          {/* Selected contact display */}
          {selectedContact&&!existingNoteWarn&&<div style={{margin:"12px 20px 0",padding:"10px 12px",background:`${WA_GREEN}10`,borderRadius:10,border:"1px solid rgba(108,99,255,.2)",display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:32,height:32,borderRadius:"50%",background:"linear-gradient(135deg,#6c63ff,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:"#fff",flexShrink:0}}>
              {(selectedContact.name||"?")[0]?.toUpperCase()}
            </div>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:13,color:T.text}}>{selectedContact.name}</div>
              <div style={{fontSize:11,color:T.textMuted}}>{selectedContact.phone}</div>
            </div>
            <button onClick={()=>{setSelectedContact(null);setContactSearch("");}}
              style={{border:"none",background:"none",cursor:"pointer",color:T.textFaint,fontSize:16}}>×</button>
          </div>}

          {/* Search + contact list */}
          {!selectedContact&&<div style={{padding:"12px 20px 0",flexShrink:0}}>
            <div style={{position:"relative"}}>
              <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:12,color:T.textFaint}}>🔍</span>
              <input autoFocus value={contactSearch} onChange={e=>setContactSearch(e.target.value)}
                placeholder="Search by name or phone..."
                style={{width:"100%",padding:"8px 12px 8px 30px",borderRadius:10,border:`1.5px solid #e8eaef`,background:T.card2,color:T.text,fontSize:12,fontFamily:"inherit",outline:"none",boxSizing:"border-box",transition:"border-color .15s"}}
                onFocus={e=>e.target.style.borderColor=WA_GREEN} onBlur={e=>e.target.style.borderColor="#e8eaef"}/>
            </div>
          </div>}

          {/* Contact list */}
          {!selectedContact&&<div style={{flex:1,overflowY:"auto",padding:"8px 20px 14px"}}>
            {contacts.filter(c=>{
              if(!contactSearch) return true;
              const s=contactSearch.toLowerCase();
              return (c.name||"").toLowerCase().includes(s)||(c.phone||"").includes(s);
            }).slice(0,30).map((c,i)=>(
              <div key={c.id} onClick={()=>selectContactForNote(c)}
                style={{display:"flex",alignItems:"center",gap:10,padding:"9px 8px",borderRadius:10,cursor:"pointer",border:"1px solid transparent",marginBottom:2,transition:"all .15s"}}
                onMouseEnter={e=>{e.currentTarget.style.background=`${WA_GREEN}10`;e.currentTarget.style.borderColor="rgba(108,99,255,.15)";}}
                onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.borderColor="transparent";}}>
                <div style={{width:36,height:36,borderRadius:"50%",background:c.lead==="hot"?"linear-gradient(135deg,#e11d48,#f43f5e)":c.lead==="warm"?"linear-gradient(135deg,#d97706,#f59e0b)":"linear-gradient(135deg,#6c63ff,#8b5cf6)",
                  display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:"#fff",flexShrink:0,
                  boxShadow:c.lead==="hot"?"0 0 0 2px rgba(225,29,72,.2)":c.lead==="warm"?"0 0 0 2px rgba(217,119,6,.15)":"none"}}>
                  {(c.name||c.phone||"?")[0]?.toUpperCase()}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:13,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.name||c.phone}</div>
                  <div style={{fontSize:10,color:T.textFaint,marginTop:1}}>{c.phone}</div>
                </div>
                <div style={{display:"flex",gap:4,alignItems:"center",flexShrink:0}}>
                  {c.lead==="hot"&&<span style={{fontSize:9,padding:"2px 6px",borderRadius:20,fontWeight:700,background:"#fff1f3",color:"#e11d48",border:"1px solid #fecdd3"}}>🔥 Hot</span>}
                  {c.lead==="warm"&&<span style={{fontSize:9,padding:"2px 6px",borderRadius:20,fontWeight:700,background:"#fffbeb",color:"#d97706",border:"1px solid #fde68a"}}>🟡 Warm</span>}
                  {notes.some(n=>!n.is_done&&(n.contact_id===c.id||n.contact_id===c.phone))&&
                    <span style={{fontSize:9,padding:"2px 6px",borderRadius:20,fontWeight:700,background:"#eff6ff",color:"#2563eb",border:"1px solid #bfdbfe"}}>📝 Has note</span>}
                </div>
              </div>
            ))}
            {contacts.length===0&&<div style={{textAlign:"center",padding:24,color:T.textFaint,fontSize:12}}>No contacts in inbox yet</div>}
          </div>}

          {/* Note textarea + save */}
          {selectedContact&&!existingNoteWarn&&<div style={{padding:"12px 20px 20px",flexShrink:0,borderTop:`1px solid ${T.border}`,marginTop:12}}>
            <div style={{fontSize:11,fontWeight:600,color:T.textMuted,marginBottom:6}}>Note</div>
            <textarea value={modalNoteText} onChange={e=>setModalNoteText(e.target.value)}
              placeholder="Write your note here..." rows={3} autoFocus
              style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid rgba(108,99,255,.3)",background:`${WA_GREEN}10`,color:T.text,fontSize:12,fontFamily:"inherit",resize:"vertical",outline:"none",boxSizing:"border-box",lineHeight:1.55}}
              onFocus={e=>e.target.style.borderColor=WA_GREEN} onBlur={e=>e.target.style.borderColor="rgba(108,99,255,.3)"}/>
            <div style={{display:"flex",gap:8,marginTop:10}}>
              <button onClick={saveModalNote} disabled={saving||!modalNoteText.trim()}
                style={{flex:1,padding:"9px",borderRadius:10,border:"none",background:saving||!modalNoteText.trim()?"#e8eaef":"linear-gradient(135deg,#6c63ff,#5a52e0)",color:saving||!modalNoteText.trim()?T.textFaint:"#fff",fontSize:13,fontWeight:700,cursor:saving||!modalNoteText.trim()?"not-allowed":"pointer",fontFamily:"inherit",boxShadow:!saving&&modalNoteText.trim()?"0 2px 10px rgba(108,99,255,.25)":"none"}}>
                {saving?"⏳ Saving...":"💾 Save Note"}
              </button>
              <button onClick={()=>{setShowAddModal(false);setExistingNoteWarn(null);}}
                style={{padding:"9px 16px",borderRadius:10,border:`1px solid ${T.border}`,background:T.card2,color:T.textMuted,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
            </div>
          </div>}
        </div>
      </>}

      {/* PAGE HEADER — matches mockup */}
      <div className="nx-page-header" style={{flexShrink:0}}>
        <i className="ti ti-notes" style={{fontSize:20,color:WA_GREEN}}/>
        <div>
          <div className="nx-page-title">Notes</div>
          <div className="nx-page-sub">Internal team notes · {activeNotes.length} active · {doneNotes.length} done</div>
        </div>
        {isAdmin&&<div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
          {adminOverview.filter((c,i,a)=>a.findIndex(x=>x.clinic_id===c.clinic_id)===i).map(c=>{
            const sel = notesClinic?.clinic_id===c.clinic_id;
            return <div key={c.clinic_id} onClick={()=>setNotesClinic(sel?null:c)}
              style={{display:"flex",alignItems:"center",gap:5,padding:"3px 10px",borderRadius:20,cursor:"pointer",
                border:`1px solid ${sel?WA_GREEN:T.border}`,background:sel?`${WA_GREEN}15`:"transparent",
                opacity:(c.active===false||c.active===0)?0.5:1}}>
              <div style={{width:14,height:14,borderRadius:3,overflow:"hidden",background:`${WA_GREEN}15`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                {c.logo_url?<img src={c.logo_url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:<span style={{fontSize:9}}>🏢</span>}
              </div>
              <span style={{fontSize:11,fontWeight:700,color:sel?WA_GREEN:T.text}}>{c.company_name||c.username}</span>
            </div>;
          })}
        </div>}
        <div style={{marginLeft:"auto",display:"flex",gap:8}}>
          <button onClick={openAddModal} className="nx-btn primary">
            <i className="ti ti-plus" style={{fontSize:14}}/> New note
          </button>
          <button onClick={()=>loadNotes(clinicId)} className="nx-btn">
            <i className="ti ti-refresh" style={{fontSize:14}}/>
          </button>
        </div>
      </div>

      {/* Generate Notes Panel — compact */}
      <div style={{background:dark?"#1a1f2e":"#f5f3ff",borderBottom:`1px solid ${T.border}`,padding:"10px 20px",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <i className="ti ti-robot" style={{fontSize:14,color:"#7c3aed"}}/>
            <span style={{fontWeight:600,fontSize:12,color:T.text}}>AI Generate</span>
            <span style={{fontSize:11,color:T.textMuted}}>— reads warm/hot chats and creates notes</span>
          </div>
          <div style={{marginLeft:"auto",display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
            {/* Presets */}
            {[{l:"Today",d:0},{l:"Yesterday",d:1},{l:"7 days",d:7},{l:"30 days",d:30}].map(p=>(
              <button key={p.l} onClick={()=>{
                const to = new Date().toISOString().split("T")[0];
                const from = new Date(Date.now()-p.d*86400000).toISOString().split("T")[0];
                setBackfillFrom(from); setBackfillTo(to);
              }} style={{padding:"4px 10px",borderRadius:8,border:`1px solid ${T.border}`,background:T.card,color:T.textMuted,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>
                {p.l}
              </button>
            ))}
            <input type="date" value={backfillFrom} onChange={e=>setBackfillFrom(e.target.value)}
              style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:8,padding:"5px 8px",color:T.text,fontSize:11,fontFamily:"inherit"}}/>
            <span style={{color:T.textFaint,fontSize:11}}>to</span>
            <input type="date" value={backfillTo} onChange={e=>setBackfillTo(e.target.value)}
              style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:8,padding:"5px 8px",color:T.text,fontSize:11,fontFamily:"inherit"}}/>
            <button onClick={runBackfill} disabled={backfilling||!clinicId}
              style={{padding:"7px 18px",borderRadius:8,border:"none",
                background:backfilling?"#94a3b8":"#7c3aed",
                color:"#fff",fontSize:12,fontWeight:700,cursor:backfilling?"not-allowed":"pointer",fontFamily:"inherit",
                whiteSpace:"nowrap"}}>
              {backfilling?"⏳ Analysing...":"🤖 Generate Notes"}
            </button>
          </div>
        </div>
        {backfillResult&&<div style={{marginTop:10,padding:"8px 12px",borderRadius:8,fontSize:12,fontWeight:600,
          background:backfillResult.ok?"#f0fdf4":"#fef2f2",
          color:backfillResult.ok?"#166534":"#dc2626",
          border:`1px solid ${backfillResult.ok?"#86efac":"#fca5a5"}`}}>
          {backfillResult.ok
            ?`✅ Done — ${backfillResult.processed} conversations checked · ${backfillResult.created} notes created · ${backfillResult.skipped} skipped`
            :`❌ ${backfillResult.error}`}
        </div>}
      </div>

      {/* Add note form */}
      {showAdd&&<div style={{background:T.card,borderBottom:`1px solid ${T.border}`,padding:"14px 20px",flexShrink:0}}>
        <div style={{maxWidth:580,display:"flex",flexDirection:"column",gap:8}}>
          <div style={{display:"flex",gap:8}}>
            <input value={newNote.contact_id} onChange={e=>setNewNote(p=>({...p,contact_id:e.target.value}))}
              placeholder="Phone — e.g. +60123456789"
              style={{flex:1,background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:12,fontFamily:"inherit"}}/>
            <input value={newNote.contact_name} onChange={e=>setNewNote(p=>({...p,contact_name:e.target.value}))}
              placeholder="Name"
              style={{flex:1,background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:12,fontFamily:"inherit"}}/>
          </div>
          <textarea value={newNote.note_text} onChange={e=>setNewNote(p=>({...p,note_text:e.target.value}))}
            placeholder="Note..."
            rows={2}
            style={{width:"100%",background:T.input,border:`1.5px solid ${WA_GREEN}40`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:12,fontFamily:"inherit",resize:"vertical",boxSizing:"border-box"}}/>
          <button onClick={addNote} disabled={saving||!newNote.contact_id.trim()||!newNote.note_text.trim()}
            style={{alignSelf:"flex-start",padding:"7px 18px",borderRadius:8,border:"none",
              background:saving||!newNote.contact_id.trim()||!newNote.note_text.trim()?"#94a3b8":WA_GREEN,
              color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
            {saving?"Saving...":"💾 Save"}
          </button>
        </div>
      </div>}

      {/* Notes list */}
      <div style={{flex:1,overflowY:"auto",padding:20}}>
        {notesLoading&&<div style={{textAlign:"center",padding:40,color:T.textMuted}}>Loading...</div>}

        {!notesLoading&&notes.length===0&&<div style={{textAlign:"center",padding:60,color:T.textMuted}}>
          <div style={{fontSize:48,marginBottom:12}}>📝</div>
          <div style={{fontWeight:700,fontSize:16,marginBottom:6}}>No notes yet</div>
          <div style={{fontSize:13,color:T.textFaint,marginBottom:20}}>AI auto-generates notes every 5 mins for warm/hot contacts who went silent</div>
          {/* Hidden backfill link */}
          <button onClick={()=>setShowBackfill(p=>!p)}
            style={{border:"none",background:"none",cursor:"pointer",fontSize:11,color:T.textFaint,textDecoration:"underline",fontFamily:"inherit"}}>
            Backfill from old conversations
          </button>
        </div>}

        {/* Active notes — 3-column sticky card grid like mockup */}
        {activeNotes.length>0&&<>
          <div style={{fontWeight:700,fontSize:11,color:T.textMuted,textTransform:"uppercase",letterSpacing:1,marginBottom:12}}>Active ({activeNotes.length})</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:24}}>
            {activeNotes.map(n=>{
              const isAI = n.agent_name==="🤖 Auto-Note";
              const isHighlighted = highlightNoteId===n.id;
              return (
                <div key={n.id} id={"note-card-"+n.id}
                  style={{background:dark?"#2a2500":"#fffef0",border:`1px solid ${isHighlighted?"#f59e0b":"#fde68a"}`,
                    borderRadius:10,padding:14,transition:"all .15s",position:"relative",
                    boxShadow:isHighlighted?"0 0 0 3px rgba(245,158,11,.3)":"0 1px 3px rgba(0,0,0,.04)"}}
                  onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 12px rgba(0,0,0,.08)"}
                  onMouseLeave={e=>e.currentTarget.style.boxShadow=isHighlighted?"0 0 0 3px rgba(245,158,11,.3)":"0 1px 3px rgba(0,0,0,.04)"}>
                  {isAI&&<div style={{position:"absolute",top:10,right:10,fontSize:9,padding:"1px 6px",borderRadius:10,background:"#7c3aed",color:"#fff",fontWeight:700}}>AI</div>}
                  {/* Title */}
                  <div style={{fontSize:12,fontWeight:700,color:dark?"#fbbf24":"#92400e",marginBottom:6,paddingRight:isAI?28:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {n.contact_name||n.contact_id}
                  </div>
                  {/* Body */}
                  {editingNoteId===n.id?(
                    <div>
                      <textarea value={editingNoteText} onChange={e=>setEditingNoteText(e.target.value)} rows={3} autoFocus
                        style={{width:"100%",fontSize:11,color:dark?"#fef3c7":"#78350f",background:"transparent",border:"1px solid #fcd34d",borderRadius:6,padding:"6px 8px",fontFamily:"inherit",resize:"vertical",outline:"none",boxSizing:"border-box"}}/>
                      <div style={{display:"flex",gap:5,marginTop:6}}>
                        <button onClick={()=>saveEditNote(n.id)} style={{padding:"3px 10px",borderRadius:6,border:"none",background:"#d97706",color:"#fff",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Save</button>
                        <button onClick={()=>{setEditingNoteId(null);setEditingNoteText("");}} style={{padding:"3px 8px",borderRadius:6,border:"1px solid #fde68a",background:"transparent",color:"#92400e",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
                      </div>
                    </div>
                  ):(
                    <div style={{fontSize:11,color:dark?"#fef3c7":"#78350f",lineHeight:1.6,marginBottom:10,display:"-webkit-box",WebkitLineClamp:4,WebkitBoxOrient:"vertical",overflow:"hidden"}}>
                      {n.note_text}
                    </div>
                  )}
                  {/* Date */}
                  <div style={{fontSize:10,color:"#b45309",marginBottom:8}}>
                    {new Date(n.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})} · {new Date(n.created_at).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:true})}
                  </div>
                  {/* Actions */}
                  <div style={{display:"flex",gap:5,borderTop:"1px solid #fde68a",paddingTop:8}}>
                    <button onClick={()=>onJumpToChat(n.contact_id,n.contact_name)}
                      style={{flex:1,padding:"4px",borderRadius:6,border:"1px solid #fde68a",background:"transparent",color:"#92400e",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>💬 Chat</button>
                    <button onClick={()=>{setEditingNoteId(n.id);setEditingNoteText(n.note_text);}}
                      style={{flex:1,padding:"4px",borderRadius:6,border:"1px solid #fde68a",background:"transparent",color:"#92400e",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>✏️ Edit</button>
                    <button onClick={()=>markDone(n.id,true)}
                      style={{flex:1,padding:"4px",borderRadius:6,border:"none",background:"#d97706",color:"#fff",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>✓ Done</button>
                    <button onClick={()=>deleteNote(n.id)}
                      style={{padding:"4px 6px",borderRadius:6,border:"1px solid #fde68a",background:"transparent",color:"#ef4444",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>✕</button>
                  </div>
                </div>
              );
            })}
          </div>
        </>}

        {/* Done notes — compact rows */}
        {doneNotes.length>0&&<>
          <div style={{fontWeight:700,fontSize:11,color:T.textMuted,textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>Done ({doneNotes.length})</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {doneNotes.map(n=>(
              <div key={n.id} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"center",gap:12,opacity:.6}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:12,color:T.text,textDecoration:"line-through"}}>{n.contact_name||n.contact_id}</div>
                  <div style={{fontSize:11,color:T.textMuted,textDecoration:"line-through",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{n.note_text}</div>
                </div>
                <div style={{fontSize:10,color:T.textFaint,flexShrink:0,textAlign:"right"}}>
                  {n.done_by&&<div>✓ {n.done_by}</div>}
                  <div>{fmt(n.done_at||n.created_at)}</div>
                </div>
                <div style={{display:"flex",gap:4,flexShrink:0}}>
                  <button onClick={()=>markDone(n.id,false)} style={{padding:"3px 8px",borderRadius:6,border:`1px solid ${T.border}`,background:T.card2,color:T.textMuted,fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>↩️</button>
                  <button onClick={()=>deleteNote(n.id)} style={{padding:"3px 8px",borderRadius:6,border:"1px solid #fca5a5",background:"#fef2f2",color:"#ef4444",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>🗑️</button>
                </div>
              </div>
            ))}
          </div>
        </>}


      </div>
    </div>
  );
}

// ── INTEGRATIONS TAB ──────────────────────────────────────────────────────────
function IntegrationsTab({T, WA_GREEN, dark, isAdmin, currentUser, authToken, permissions, API}) {
  const authHeaders = () => ({"Content-Type":"application/json","Authorization":`Bearer ${authToken}`});
  const [editConn, setEditConn] = React.useState(null);
  const [connForm, setConnForm] = React.useState({});
  const [saving, setSaving] = React.useState(false);
  const [connData, setConnData] = React.useState({});
  const [selClinicId, setSelClinicId] = React.useState(null);
  const [clientList, setClientList] = React.useState([]);

  React.useEffect(()=>{
    if(!authToken) return;
    if(isAdmin) {
      fetch(`${API}/api/admin/clients`,{headers:authHeaders()})
        .then(r=>r.ok?r.json():[]).then(d=>{
          if(Array.isArray(d)&&d.length>0){setClientList(d);setSelClinicId(d[0].id);}
        }).catch(()=>{});
    } else {
      setSelClinicId(currentUser?.clinic_id);
    }
  },[authToken]);

  React.useEffect(()=>{
    if(!selClinicId) return;
    setConnData({});
    const url = isAdmin ? `${API}/api/admin/clients/${selClinicId}/settings` : `${API}/api/settings`;
    fetch(url,{headers:authHeaders()}).then(r=>r.ok?r.json():null).then(d=>{if(d)setConnData(d);}).catch(()=>{});
  },[selClinicId]);

  const ALL_CONNECTORS = [
    {id:"whatsapp",  label:"WhatsApp Business", color:"#25D366", bg:"#25D36615",
     desc:"Meta WhatsApp Business API — send and receive messages",
     isConnected:(d)=>!!(d.wa_phone_number_id||d.phone_number_id||d.whatsapp_number),
     statusText:(d)=>d.wa_phone_number||d.whatsapp_number||"",
     fields:[{key:"wa_phone_number_id",label:"Phone Number ID",ph:"985068241357564"},
             {key:"wa_phone_number",label:"WhatsApp Number",ph:"+60 11 1050 7200"},
             {key:"wa_token",label:"Access Token",ph:"EAAxxxxxxxx",pwd:true}],
     logo:<svg viewBox="0 0 24 24" fill="#25D366" width="28" height="28"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>,
     permKey:"integration_whatsapp"},
    {id:"telegram",  label:"Telegram Alerts", color:"#229ED9", bg:"#eff6ff",
     desc:"Get instant lead alerts and notifications in Telegram",
     isConnected:(d)=>!!(d.telegram_token&&d.telegram_token.length>5&&d.telegram_chat_id),
     statusText:(d)=>d.telegram_chat_id?"Chat: "+d.telegram_chat_id:"",
     fields:[{key:"telegram_token",label:"Bot Token",ph:"8664616537:AAGE9wn...",pwd:true},
             {key:"telegram_chat_id",label:"Group Chat ID",ph:"-5277820778"}],
     logo:<svg viewBox="0 0 24 24" fill="#229ED9" width="28" height="28"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>,
     permKey:"integration_telegram"},
    {id:"claude",    label:"Claude AI (Anthropic)", color:"#D97757", bg:"#fdf4ef",
     desc:"Powers your AI bot conversations and responses",
     isConnected:(d)=>!!(d.anthropic_key||d.ai_api_key),
     statusText:(d)=>d.ai_model||"claude-haiku-4-5",
     fields:[{key:"anthropic_key",label:"API Key",ph:"sk-ant-api03-...",pwd:true}],
     logo:<svg viewBox="0 0 24 24" width="28" height="28" fill="#D97757" xmlns="http://www.w3.org/2000/svg"><path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z"/></svg>,
     permKey:null},
    {id:"email",     label:"Email Notifications", color:"#ef4444", bg:"#fef2f2",
     desc:"Get notified when hot leads come in or bot needs help",
     isConnected:()=>false, statusText:()=>"", fields:[],
     logo:<svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.8" width="28" height="28"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 7 10-7"/></svg>,
     permKey:null},
    {id:"sheets",    label:"Google Sheets", color:"#16a34a", bg:"#f0fdf4",
     desc:"Export leads and conversations to Google Sheets automatically",
     isConnected:()=>false, statusText:()=>"", fields:[],
     logo:<svg viewBox="0 0 24 24" width="28" height="28"><rect x="3" y="3" width="18" height="18" rx="2" fill="#16a34a"/><path d="M7 8h10M7 12h10M7 16h6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/></svg>,
     permKey:null},
    {id:"slack",     label:"Slack Notifications", color:"#7c3aed", bg:"#fdf4ff",
     desc:"Send hot lead alerts directly to your Slack channel",
     isConnected:()=>false, statusText:()=>"", fields:[],
     logo:<svg viewBox="0 0 24 24" width="28" height="28"><g fill="none"><path d="M14.5 10a1.5 1.5 0 01-1.5-1.5v-4a1.5 1.5 0 013 0v4a1.5 1.5 0 01-1.5 1.5z" fill="#E01E5A"/><path d="M19.5 10H18V8.5a1.5 1.5 0 013 0A1.5 1.5 0 0119.5 10z" fill="#E01E5A"/><path d="M9.5 14a1.5 1.5 0 011.5 1.5v4a1.5 1.5 0 01-3 0v-4A1.5 1.5 0 019.5 14z" fill="#2EB67D"/><path d="M4.5 14H6v1.5a1.5 1.5 0 01-3 0A1.5 1.5 0 014.5 14z" fill="#2EB67D"/><path d="M14 14.5a1.5 1.5 0 011.5-1.5h4a1.5 1.5 0 010 3h-4a1.5 1.5 0 01-1.5-1.5z" fill="#ECB22E"/><path d="M14 19.5V18h1.5a1.5 1.5 0 010 3A1.5 1.5 0 0114 19.5z" fill="#ECB22E"/><path d="M10 9.5A1.5 1.5 0 018.5 11h-4a1.5 1.5 0 010-3h4A1.5 1.5 0 0110 9.5z" fill="#36C5F0"/><path d="M10 4.5V6H8.5a1.5 1.5 0 010-3A1.5 1.5 0 0110 4.5z" fill="#36C5F0"/></g></svg>,
     permKey:null},
    {id:"calendly",  label:"Calendly", color:"#d97706", bg:"#fff7ed",
     desc:"Let the bot book consultations directly into your calendar",
     isConnected:()=>false, statusText:()=>"", fields:[],
     logo:<svg viewBox="0 0 24 24" width="28" height="28" fill="none"><rect x="3" y="3" width="18" height="18" rx="3" fill="#d97706"/><path d="M8 2v4M16 2v4M3 10h18" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/><circle cx="8" cy="15" r="1.5" fill="#fff"/><circle cx="12" cy="15" r="1.5" fill="#fff"/><circle cx="16" cy="15" r="1.5" fill="#fff"/></svg>,
     permKey:null},
  ];

  const visibleConnectors = isAdmin ? ALL_CONNECTORS : ALL_CONNECTORS.filter(c=>{
    if(!c.permKey) return true;
    if(permissions==="all"||!permissions) return true;
    const hasAny = ALL_CONNECTORS.filter(x=>x.permKey).some(x=>permissions[x.permKey]);
    if(!hasAny) return true;
    return permissions[c.permKey];
  });

  const saveConnector = async () => {
    if(!selClinicId) return;
    setSaving(true);
    try {
      const url = isAdmin ? `${API}/api/admin/clients/${selClinicId}/settings` : `${API}/api/settings`;
      const r = await fetch(url,{method:"PATCH",headers:authHeaders(),body:JSON.stringify(connForm)});
      if(r.ok){setConnData(p=>({...p,...connForm}));setEditConn(null);setConnForm({});}
    } catch(e){}
    setSaving(false);
  };

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",background:T.bg,overflow:"hidden"}}>

      {/* Page header */}
      <div className="nx-page-header" style={{flexShrink:0}}>
        <i className="ti ti-plug" style={{fontSize:20,color:WA_GREEN}}/>
        <div>
          <div className="nx-page-title">Integrations</div>
          <div className="nx-page-sub">Connect your tools and services</div>
        </div>
        {/* Admin client selector */}
        {isAdmin&&clientList.length>0&&<div style={{marginLeft:"auto",display:"flex",gap:6,flexWrap:"wrap"}}>
          {clientList.map(c=>{
            const sel = String(c.id)===String(selClinicId);
            return <div key={c.id} onClick={()=>setSelClinicId(c.id)}
              style={{display:"flex",alignItems:"center",gap:6,padding:"4px 10px",borderRadius:20,cursor:"pointer",
                border:`1px solid ${sel?WA_GREEN:T.border}`,
                background:sel?`${WA_GREEN}15`:T.card}}>
              <div style={{width:16,height:16,borderRadius:4,overflow:"hidden",background:`${WA_GREEN}15`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                {c.logo_url?<img src={c.logo_url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:<span style={{fontSize:10}}>🏢</span>}
              </div>
              <span style={{fontSize:11,fontWeight:700,color:sel?WA_GREEN:T.text}}>{c.name||c.company_name}</span>
            </div>;
          })}
        </div>}
      </div>

      {/* Integration list — matches mockup flat list style */}
      <div style={{flex:1,overflowY:"auto",padding:"24px 40px",display:"flex",justifyContent:"center"}}>
        <div style={{maxWidth:560,width:"100%"}}>
          {visibleConnectors.map(conn=>{
            const connected = conn.isConnected(connData);
            const hasFields = conn.fields.length > 0;
            return (
              <div key={conn.id} style={{
                display:"flex",alignItems:"center",gap:14,
                padding:16,border:`1px solid ${T.border}`,borderRadius:10,
                marginBottom:10,background:T.card,transition:"border-color .15s"}}
                onMouseEnter={e=>e.currentTarget.style.borderColor=connected?conn.color:WA_GREEN}
                onMouseLeave={e=>e.currentTarget.style.borderColor=T.border}>
                {/* Icon */}
                <div style={{width:44,height:44,borderRadius:10,background:conn.bg,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:22,flexShrink:0}}>
                  {conn.logo}
                </div>
                {/* Name + desc */}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:700,color:T.text}}>{conn.label}</div>
                  <div style={{fontSize:11,color:T.textMuted,marginTop:2}}>{conn.desc}</div>
                </div>
                {/* Status / button */}
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6,flexShrink:0}}>
                  {connected?(
                    <>
                      <span style={{fontSize:10,fontWeight:600,padding:"3px 8px",borderRadius:20,
                        background:"#f0fdf4",color:"#15803d",border:"1px solid #bbf7d0"}}>
                        ✅ Connected
                      </span>
                      {conn.statusText(connData)&&<div style={{fontSize:10,color:T.textMuted}}>{conn.statusText(connData)}</div>}
                      {hasFields&&<button onClick={()=>{
                        const init={};conn.fields.forEach(f=>{init[f.key]=connData[f.key]||"";});
                        setConnForm(init);setEditConn(conn);
                      }} style={{fontSize:11,fontWeight:600,padding:"4px 12px",borderRadius:8,
                        border:`1px solid ${T.border}`,background:"transparent",cursor:"pointer",color:T.text,fontFamily:"inherit"}}>
                        Edit
                      </button>}
                    </>
                  ):hasFields?(
                    <button onClick={()=>{
                      const init={};conn.fields.forEach(f=>{init[f.key]=connData[f.key]||"";});
                      setConnForm(init);setEditConn(conn);
                    }} style={{fontSize:11,fontWeight:600,padding:"5px 12px",borderRadius:8,
                      border:`1px solid ${T.border}`,background:"transparent",cursor:"pointer",
                      color:T.text,fontFamily:"inherit",transition:"all .15s"}}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor=WA_GREEN;e.currentTarget.style.color=WA_GREEN;}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.color=T.text;}}>
                      Connect
                    </button>
                  ):(
                    <span style={{fontSize:10,color:T.textFaint,fontWeight:500}}>Coming soon</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Edit/Connect modal */}
      {editConn&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center"}}
        onClick={e=>{if(e.target===e.currentTarget){setEditConn(null);setConnForm({});}}}>
        <div style={{background:T.card,borderRadius:20,padding:28,width:380,maxWidth:"90vw",boxShadow:"0 20px 60px rgba(0,0,0,.25)"}}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
            <div style={{width:44,height:44,borderRadius:12,background:editConn.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>
              {editConn.logo}
            </div>
            <div>
              <div style={{fontWeight:800,fontSize:16}}>Connect {editConn.label}</div>
            </div>
            <button onClick={()=>{setEditConn(null);setConnForm({});}} style={{marginLeft:"auto",border:"none",background:"none",cursor:"pointer",fontSize:20,color:T.textMuted}}>✕</button>
          </div>
          {editConn.fields.map(f=>(
            <div key={f.key} style={{marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:700,color:T.textMuted,marginBottom:5}}>{f.label}</div>
              <input type={f.pwd?"password":"text"} value={connForm[f.key]||""}
                onChange={e=>setConnForm(p=>({...p,[f.key]:e.target.value}))}
                placeholder={f.ph}
                style={{width:"100%",background:T.input,border:`1px solid ${T.border}`,borderRadius:8,
                  padding:"9px 12px",color:T.text,fontSize:12,fontFamily:"inherit",boxSizing:"border-box",outline:"none"}}/>
            </div>
          ))}
          <div style={{display:"flex",gap:8,marginTop:20}}>
            <button onClick={()=>{setEditConn(null);setConnForm({});}}
              style={{flex:1,padding:"10px",borderRadius:10,border:`1px solid ${T.border}`,background:T.card2,color:T.textMuted,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
              Cancel
            </button>
            <button onClick={saveConnector} disabled={saving}
              style={{flex:2,padding:"10px",borderRadius:10,border:"none",background:WA_GREEN,
                color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",opacity:saving?.7:1}}>
              {saving?"Saving...":"💾 Save & Connect"}
            </button>
          </div>
        </div>
      </div>}
    </div>
  );
}

// ── ADMIN PANEL COMPONENT ─────────────────────────────────────────────────────

// ── IDLE WARNING MODAL ────────────────────────────────────────────────────────
function IdleWarningModal({countdown, setCountdown, onContinue, onLogout, T, WA_GREEN}) {
  useEffect(()=>{
    if(countdown <= 0){ onLogout(); return; }
    const t = setTimeout(()=>setCountdown(c=>c-1), 1000);
    return ()=>clearTimeout(t);
  },[countdown]);

  const pct = (countdown/30)*100;
  const color = countdown>10?"#22c55e":countdown>5?"#f59e0b":"#ef4444";

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:9999,
      display:"flex",alignItems:"center",justifyContent:"center",padding:20,backdropFilter:"blur(4px)"}}>
      <div style={{background:T.card,borderRadius:24,padding:32,width:"100%",maxWidth:360,
        boxShadow:"0 24px 60px rgba(0,0,0,.4)",textAlign:"center"}}>

        {/* Countdown circle */}
        <div style={{position:"relative",width:100,height:100,margin:"0 auto 20px"}}>
          <svg width="100" height="100" style={{transform:"rotate(-90deg)"}}>
            <circle cx="50" cy="50" r="44" fill="none" stroke={T.border} strokeWidth="8"/>
            <circle cx="50" cy="50" r="44" fill="none" stroke={color} strokeWidth="8"
              strokeDasharray={`${2*Math.PI*44}`}
              strokeDashoffset={`${2*Math.PI*44*(1-pct/100)}`}
              style={{transition:"stroke-dashoffset 1s linear, stroke .3s"}}
              strokeLinecap="round"/>
          </svg>
          <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",
            justifyContent:"center",flexDirection:"column"}}>
            <div style={{fontSize:28,fontWeight:800,color}}>{countdown}</div>
            <div style={{fontSize:10,color:T.textMuted}}>secs</div>
          </div>
        </div>

        <div style={{fontSize:22,marginBottom:8}}>⏰</div>
        <div style={{fontWeight:800,fontSize:18,marginBottom:8,color:T.text}}>Still there?</div>
        <div style={{fontSize:13,color:T.textMuted,marginBottom:24,lineHeight:1.6}}>
          You've been inactive for a while.<br/>
          You'll be logged out in <strong style={{color}}>{countdown} seconds</strong>.
        </div>

        <div style={{display:"flex",gap:10}}>
          <button onClick={onLogout}
            style={{flex:1,padding:"12px",borderRadius:12,border:`1px solid ${T.border}`,
              background:"transparent",color:T.textMuted,fontSize:14,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>
            Logout
          </button>
          <button onClick={onContinue}
            style={{flex:2,padding:"12px",borderRadius:12,border:"none",
              background:`linear-gradient(135deg,${WA_GREEN},#1da851)`,
              color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit",
              boxShadow:"0 4px 14px rgba(37,211,102,.35)"}}>
            ✅ I'm still here!
          </button>
        </div>
      </div>
    </div>
  );
}

// ── CONFIRM MODAL ─────────────────────────────────────────────────────────────
function ConfirmModal({modal, onClose, T, WA_GREEN}) {
  if(!modal) return null;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:9998,
      display:"flex",alignItems:"center",justifyContent:"center",padding:20,backdropFilter:"blur(4px)"}}>
      <div style={{background:T.card,borderRadius:24,padding:32,width:"100%",maxWidth:380,
        boxShadow:"0 24px 60px rgba(0,0,0,.4)",textAlign:"center",animation:"fadeInUp .2s ease"}}>

        {/* Icon */}
        <div style={{width:64,height:64,borderRadius:"50%",margin:"0 auto 16px",
          background:modal.danger?"#fef2f2":"#eff6ff",
          border:`2px solid ${modal.danger?"#fca5a5":"#bfdbfe"}`,
          display:"flex",alignItems:"center",justifyContent:"center",fontSize:28}}>
          {modal.icon||"⚠️"}
        </div>

        {/* Title */}
        <div style={{fontWeight:800,fontSize:18,marginBottom:8,color:T.text}}>{modal.title}</div>

        {/* Message */}
        <div style={{fontSize:13,color:T.textMuted,marginBottom:24,lineHeight:1.7,whiteSpace:"pre-line"}}>
          {modal.message}
        </div>

        {/* Warning badge for danger */}
        {modal.danger&&<div style={{background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:10,
          padding:"8px 14px",marginBottom:20,fontSize:12,color:"#dc2626",fontWeight:600}}>
          ⚠️ This action cannot be undone
        </div>}

        {/* Buttons */}
        <div style={{display:"flex",gap:10}}>
          <button onClick={onClose}
            style={{flex:1,padding:"12px",borderRadius:12,border:`1px solid ${T.border}`,
              background:T.card2,color:T.textMuted,fontSize:14,cursor:"pointer",
              fontFamily:"inherit",fontWeight:600}}>
            Cancel
          </button>
          <button onClick={()=>{modal.onConfirm();onClose();}}
            style={{flex:2,padding:"12px",borderRadius:12,border:"none",
              background:modal.danger?"linear-gradient(135deg,#ef4444,#dc2626)":WA_GREEN,
              color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit",
              boxShadow:modal.danger?"0 4px 14px rgba(239,68,68,.35)":"0 4px 14px rgba(37,211,102,.35)"}}>
            {modal.confirmText||"Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ADMIN SUB-COMPONENTS (defined outside to prevent focus loss) ─────────────
function SectionCard({title, children, T}) {
  return (
    <div className="cc" style={{marginBottom:12,padding:16}}>
      <div style={{fontWeight:700,fontSize:12,color:T.textMuted,letterSpacing:0.8,marginBottom:14}}>{title}</div>
      {children}
    </div>
  );
}

function FollowupTracker({T, WA_GREEN, appSettings, followupTracker, followupTrackerLoading, fetchFollowupTracker, hideCompleted, setHideCompleted}) {
  const followupEnabled = appSettings.followup_enabled === "true";
  const fu2Enabled = appSettings.followup_2_enabled === "true";
  const [page, setPage] = React.useState(1);
  const [perPage, setPerPage] = React.useState(10);

  React.useEffect(()=>{ if(followupEnabled) fetchFollowupTracker(); }, [followupEnabled]);
  React.useEffect(()=>{
    if(!followupEnabled) return;
    const t = setInterval(fetchFollowupTracker, 30000);
    return ()=>clearInterval(t);
  }, [followupEnabled]);

  if(!followupEnabled) return (
    <div style={{textAlign:"center",padding:"56px 24px",marginTop:8,background:T.card,borderRadius:12,border:`0.5px dashed ${T.border}`}}>
      <i className="ti ti-bell-off" style={{fontSize:28,color:T.textFaint,display:"block",marginBottom:12}}/>
      <div style={{fontSize:14,fontWeight:500,color:T.text,marginBottom:6}}>Follow-up tracker is off</div>
      <div style={{fontSize:12,color:T.textMuted,lineHeight:1.6,maxWidth:300,margin:"0 auto"}}>Enable auto follow-up in the Settings tab to see activity.</div>
    </div>
  );

  const total = followupTracker.length;
  const sent = followupTracker.filter(c=>c.followups?.some(f=>f.status==="sent")).length;
  const skipped = followupTracker.filter(c=>c.followups?.some(f=>f.status==="skipped")).length;
  const pending = followupTracker.filter(c=>c.lead!=="cold"&&!c.followups?.length).length;

  const getStatus = (c) => {
    const fus = c.followups||[];
    if(c.lead==="cold") return {label:"Excluded",dot:"#9ca3af",text:T.textMuted,bg:T.card2};
    if(!fus.length) return {label:"Pending",dot:"#f59e0b",text:"#b45309",bg:"#fffbeb"};
    if(fus.every(f=>f.status==="sent")) return {label:"All sent",dot:"#22c55e",text:"#27500A",bg:"#EAF3DE"};
    if(fus.some(f=>f.status==="skipped")&&fus.some(f=>f.status==="sent")) return {label:"Partial",dot:"#f59e0b",text:"#b45309",bg:"#fffbeb"};
    if(fus.some(f=>f.status==="skipped")) return {label:"Skipped",dot:"#f59e0b",text:"#854F0B",bg:"#FAEEDA"};
    return {label:"In progress",dot:"#60a5fa",text:"#185FA5",bg:"#E6F1FB"};
  };

  const getAv = (name, lead) => {
    const initials = (name||"?").split(" ").slice(0,2).map(w=>w[0]||"").join("").toUpperCase()||"?";
    const s = lead==="hot"?{bg:"#FAEEDA",c:"#633806"}:lead==="warm"?{bg:"#E6F1FB",c:"#0C447C"}:{bg:T.card2,c:T.textMuted};
    return {...s, initials};
  };

  const visible = hideCompleted
    ? followupTracker.filter(c=>!(c.followups?.length&&c.followups.every(f=>f.status==="sent")))
    : followupTracker;

  const totalPages = Math.ceil(visible.length/perPage);
  const paged = visible.slice((page-1)*perPage, page*perPage);

  const FuCell = ({fu, isCold, disabled}) => {
    if(isCold) return <span style={{fontSize:11,color:T.textMuted}}>—</span>;
    if(disabled) return <span style={{fontSize:11,color:T.textMuted}}>—</span>;
    if(!fu) return <div style={{fontSize:11,color:"#b45309",display:"flex",alignItems:"center",gap:4}}><span style={{width:5,height:5,borderRadius:"50%",background:"#f59e0b",display:"inline-block"}}/> Pending</div>;
    if(fu.status==="sent") return (
      <div>
        <div style={{fontSize:11,color:"#27500A",display:"flex",alignItems:"center",gap:4,marginBottom:3}}>
          <span style={{width:5,height:5,borderRadius:"50%",background:"#22c55e",display:"inline-block",flexShrink:0}}/>
          Sent · {fu.created_at}
        </div>
        <div style={{fontSize:11,color:T.textMuted,fontStyle:"italic",lineHeight:1.5}}>"{fu.message?.slice(0,90)}{fu.message?.length>90?"...":""}"</div>
      </div>
    );
    if(fu.status==="skipped") return (
      <div>
        <div style={{fontSize:11,color:"#854F0B",display:"flex",alignItems:"center",gap:4,marginBottom:3}}>
          <span style={{width:5,height:5,borderRadius:"50%",background:"#f59e0b",display:"inline-block",flexShrink:0}}/>
          AI skipped
        </div>
        <div style={{fontSize:11,color:"#854F0B",lineHeight:1.5}}>{fu.skip_reason||"AI decided not to send"}</div>
      </div>
    );
    return <span style={{fontSize:11,color:"#b45309"}}>Pending</span>;
  };

  const pages = Array.from({length:totalPages},(_,i)=>i+1)
    .filter(n=>n===1||n===totalPages||Math.abs(n-page)<=1)
    .reduce((acc,n,i,arr)=>{ if(i>0&&n-arr[i-1]>1) acc.push("..."); acc.push(n); return acc; },[]);

  const thStyle = {padding:"10px 14px",textAlign:"left",fontSize:10,fontWeight:500,color:T.textMuted,textTransform:"uppercase",letterSpacing:.6,whiteSpace:"nowrap"};
  const tdStyle = {padding:"12px 14px",borderBottom:`0.5px solid ${T.border}`,verticalAlign:"top"};

  return (
    <div>
      {/* KPI cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:20}}>
        {[{l:"Eligible today",v:total,c:T.text},{l:"Sent",v:sent,c:"#3B6D11"},{l:"AI skipped",v:skipped,c:"#854F0B"},{l:"Pending",v:pending,c:"#185FA5"}].map(s=>(
          <div key={s.l} style={{background:T.card2,borderRadius:8,padding:"14px 16px"}}>
            <div style={{fontSize:24,fontWeight:500,color:s.c,lineHeight:1,marginBottom:4}}>{followupTrackerLoading?"—":s.v}</div>
            <div style={{fontSize:12,color:T.textMuted}}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
        <div style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:T.textMuted}}>
          Show
          <select value={perPage} onChange={e=>{setPerPage(Number(e.target.value));setPage(1);}}
            style={{fontSize:12,padding:"3px 6px",borderRadius:6,border:`0.5px solid ${T.border}`,background:T.card,color:T.text,outline:"none",cursor:"pointer"}}>
            <option value={10}>10</option><option value={20}>20</option><option value={30}>30</option>
          </select>
          entries · {visible.length} total · refreshes every 30s
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <label style={{fontSize:12,color:T.textMuted,display:"flex",alignItems:"center",gap:5,cursor:"pointer"}}>
            <input type="checkbox" checked={hideCompleted} onChange={e=>{setHideCompleted(e.target.checked);setPage(1);}} style={{accentColor:WA_GREEN}}/>
            Hide completed
          </label>
          <button onClick={fetchFollowupTracker}
            style={{fontSize:12,padding:"5px 10px",borderRadius:6,border:`0.5px solid ${T.border}`,background:"transparent",color:T.text,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:4}}>
            <i className="ti ti-refresh" style={{fontSize:13}}/>Refresh
          </button>
        </div>
      </div>

      {/* Table */}
      {followupTrackerLoading&&<div style={{textAlign:"center",padding:48,color:T.textMuted,fontSize:13}}>Loading...</div>}
      {!followupTrackerLoading&&visible.length===0&&<div style={{textAlign:"center",padding:48,color:T.textMuted,fontSize:13,background:T.card,borderRadius:12,border:`0.5px solid ${T.border}`}}>No active contacts in the last 24 hours</div>}
      {!followupTrackerLoading&&visible.length>0&&<>
        <div style={{border:`0.5px solid ${T.border}`,borderRadius:12,overflow:"hidden"}}>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead>
                <tr style={{background:T.card2,borderBottom:`0.5px solid ${T.border}`}}>
                  <th style={{...thStyle,minWidth:150}}>Contact</th>
                  <th style={{...thStyle,minWidth:120}}>Phone</th>
                  <th style={{...thStyle,minWidth:70}}>Lead</th>
                  <th style={{...thStyle,minWidth:100}}>Last message</th>
                  <th style={{...thStyle,minWidth:220}}>Follow-up 1</th>
                  {fu2Enabled&&<th style={{...thStyle,minWidth:220}}>Follow-up 2</th>}
                  <th style={{...thStyle,minWidth:90}}>Status</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((c,i)=>{
                  const fu1 = c.followups?.find(f=>f.followup_num===1);
                  const fu2 = c.followups?.find(f=>f.followup_num===2);
                  const status = getStatus(c);
                  const av = getAv(c.name, c.lead);
                  const isCold = c.lead==="cold";
                  const isLast = i===paged.length-1;
                  return (
                    <tr key={i} style={{opacity:isCold?.45:1,transition:"background .1s"}}
                      onMouseEnter={e=>e.currentTarget.style.background=T.card2}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <td style={{...tdStyle,borderBottom:isLast?"none":tdStyle.borderBottom}}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <div style={{width:30,height:30,borderRadius:8,background:av.bg,color:av.c,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:500,flexShrink:0}}>{av.initials}</div>
                          <span style={{fontSize:13,fontWeight:500,color:T.text}}>{c.name}</span>
                        </div>
                      </td>
                      <td style={{...tdStyle,borderBottom:isLast?"none":tdStyle.borderBottom,fontSize:11,color:T.textMuted,whiteSpace:"nowrap"}}>{c.phone}</td>
                      <td style={{...tdStyle,borderBottom:isLast?"none":tdStyle.borderBottom}}>
                        <span style={{fontSize:11,fontWeight:500,padding:"3px 9px",borderRadius:20,background:c.lead==="hot"?"#FAEEDA":c.lead==="warm"?"#E6F1FB":T.card2,color:c.lead==="hot"?"#633806":c.lead==="warm"?"#0C447C":T.textMuted,whiteSpace:"nowrap"}}>
                          {c.lead==="hot"?"Hot":c.lead==="warm"?"Warm":"Cold"}
                        </span>
                      </td>
                      <td style={{...tdStyle,borderBottom:isLast?"none":tdStyle.borderBottom}}>
                        <div style={{fontSize:12,fontWeight:500,color:T.text,whiteSpace:"nowrap"}}>{c.last_message_time?c.last_message_time.slice(11,16)+" MYT":"—"}</div>
                        <div style={{fontSize:10,color:T.textMuted,marginTop:2,whiteSpace:"nowrap"}}>{c.silent_mins<60?c.silent_mins+"m ago":Math.floor(c.silent_mins/60)+"h ago"}</div>
                      </td>
                      <td style={{...tdStyle,borderBottom:isLast?"none":tdStyle.borderBottom}}><FuCell fu={fu1} isCold={isCold} disabled={false}/></td>
                      {fu2Enabled&&<td style={{...tdStyle,borderBottom:isLast?"none":tdStyle.borderBottom}}><FuCell fu={fu2} isCold={isCold} disabled={!fu1||fu1.status!=="sent"}/></td>}
                      <td style={{...tdStyle,borderBottom:isLast?"none":tdStyle.borderBottom}}>
                        <span style={{fontSize:11,fontWeight:500,padding:"3px 10px",borderRadius:20,background:status.bg,color:status.text,display:"inline-flex",alignItems:"center",gap:5,whiteSpace:"nowrap"}}>
                          <span style={{width:5,height:5,borderRadius:"50%",background:status.dot,flexShrink:0,display:"inline-block"}}/>
                          {status.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {totalPages>1&&<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:14}}>
          <span style={{fontSize:12,color:T.textMuted}}>Showing {(page-1)*perPage+1}–{Math.min(page*perPage,visible.length)} of {visible.length}</span>
          <div style={{display:"flex",gap:4}}>
            <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1}
              style={{padding:"4px 10px",borderRadius:6,border:`0.5px solid ${T.border}`,background:"transparent",color:page===1?T.textFaint:T.text,cursor:page===1?"default":"pointer",fontSize:12,fontFamily:"inherit"}}>‹ Prev</button>
            {pages.map((n,i)=>n==="..."
              ?<span key={i} style={{padding:"4px 6px",fontSize:12,color:T.textMuted}}>…</span>
              :<button key={i} onClick={()=>setPage(n)}
                style={{padding:"4px 10px",borderRadius:6,border:`0.5px solid ${n===page?WA_GREEN:T.border}`,
                  background:n===page?`${WA_GREEN}15`:"transparent",color:n===page?WA_GREEN:T.text,
                  cursor:"pointer",fontSize:12,fontFamily:"inherit",fontWeight:n===page?500:400}}>
                {n}
              </button>
            )}
            <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages}
              style={{padding:"4px 10px",borderRadius:6,border:`0.5px solid ${T.border}`,background:"transparent",color:page===totalPages?T.textFaint:T.text,cursor:page===totalPages?"default":"pointer",fontSize:12,fontFamily:"inherit"}}>Next ›</button>
          </div>
        </div>}
      </>}
    </div>
  );
}


function AIProviderCards({appSettings, setAppSettings, setSettingsDirtyWithRef, T}) {
  const [showKey, setShowKey] = useState({});
  const AI_PROVIDERS = [
    {id:"anthropic", label:"Claude",  company:"Anthropic", color:"#7c3aed", keyField:"anthropic_key", placeholder:"sk-ant-api03-...",
      models:["claude-haiku-4-5-20251001","claude-sonnet-4-5-20251001","claude-opus-4-5-20251001"]},
    {id:"openai",    label:"GPT-4o",  company:"OpenAI",    color:"#10b981", keyField:"openai_key",    placeholder:"sk-...",
      models:["gpt-4o-mini","gpt-4o","gpt-4-turbo"]},
    {id:"groq",      label:"Llama 3", company:"Groq",      color:"#f59e0b", keyField:"groq_key",      placeholder:"gsk_...", free:true,
      models:["llama-3.3-70b-versatile","mixtral-8x7b-32768","llama-3.1-8b-instant"]},
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:12}}>
      {AI_PROVIDERS.map(p=>{
        const isActive = appSettings.ai_provider===p.id;
        const hasKey = !!(appSettings[p.keyField]||"").trim();
        return (
          <div key={p.id} style={{borderRadius:14,border:`2px solid ${isActive?p.color:hasKey?"#22c55e50":T.border}`,
            background:isActive?`${p.color}10`:T.card2,padding:"14px 16px",transition:"all .15s"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div onClick={()=>{
                  if(hasKey||isActive){setAppSettings(prev=>({...prev,ai_provider:p.id}));setSettingsDirtyWithRef(true);}
                }} style={{width:40,height:22,borderRadius:11,cursor:hasKey?"pointer":"not-allowed",
                  background:isActive?p.color:"#cbd5e1",position:"relative",flexShrink:0,opacity:hasKey?1:0.5}}>
                  <div style={{position:"absolute",top:3,left:isActive?20:3,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,.2)"}}/>
                </div>
                <div>
                  <div style={{fontWeight:800,fontSize:13,color:isActive?p.color:T.text}}>{p.label}
                    {p.free&&<span style={{marginLeft:6,fontSize:9,padding:"1px 5px",borderRadius:6,background:"#10b981",color:"#fff",fontWeight:700}}>FREE</span>}
                  </div>
                  <div style={{fontSize:10,color:T.textMuted}}>{p.company}</div>
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                {isActive&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:8,background:p.color,color:"#fff",fontWeight:700}}>ACTIVE</span>}
                {hasKey&&!isActive&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:8,background:"#dcfce7",color:"#166534",fontWeight:700}}>✅ Saved</span>}
                {!hasKey&&<span style={{fontSize:10,color:"#94a3b8"}}>No key</span>}
              </div>
            </div>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <input type={showKey[p.id]?"text":"password"}
                value={appSettings[p.keyField]||""}
                onChange={e=>{setAppSettings(prev=>({...prev,[p.keyField]:e.target.value}));setSettingsDirtyWithRef(true);}}
                placeholder={p.placeholder}
                style={{flex:1,background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:8,
                  padding:"7px 10px",color:T.text,fontSize:11,fontFamily:"monospace",boxSizing:"border-box"}}/>
              <button onClick={()=>setShowKey(prev=>({...prev,[p.id]:!prev[p.id]}))}
                style={{padding:"7px 10px",borderRadius:8,border:`1px solid ${T.border}`,background:T.card,color:T.textMuted,cursor:"pointer",fontSize:11}}>
                {showKey[p.id]?"🙈":"👁️"}
              </button>
            </div>
            {isActive&&<div style={{marginTop:8}}>
              <div style={{fontSize:10,color:T.textMuted,marginBottom:4}}>🧠 Model</div>
              <select value={appSettings.ai_model||p.models[0]}
                onChange={e=>{setAppSettings(prev=>({...prev,ai_model:e.target.value}));setSettingsDirtyWithRef(true);}}
                style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:8,padding:"7px 10px",color:T.text,fontSize:11,fontFamily:"inherit"}}>
                {p.models.map(m=><option key={m} value={m}>{m}</option>)}
              </select>
            </div>}
          </div>
        );
      })}
    </div>
  );
}

function PermGrid({data, setData, PERM_TABS, WA_GREEN, T, INTEGRATION_CONNECTORS, onIntegrationToggle}) {
  return (
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
      {PERM_TABS.map(p=>(
        <div key={p.key} onClick={()=>setData(prev=>({...prev,[p.key]:!prev[p.key]}))}
          style={{padding:"10px 12px",borderRadius:10,border:`1px solid ${data[p.key]?WA_GREEN:T.border}`,
            background:data[p.key]?`${WA_GREEN}10`:T.card2,cursor:"pointer",
            display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <span style={{fontSize:12,fontWeight:600,color:data[p.key]?WA_GREEN:T.textMuted}}>{p.label}</span>
          <div style={{width:32,height:18,borderRadius:9,background:data[p.key]?WA_GREEN:T.border,position:"relative",flexShrink:0}}>
            <div style={{position:"absolute",top:2,left:data[p.key]?14:2,width:14,height:14,borderRadius:"50%",background:"#fff",transition:"left .15s"}}/>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── ADMIN PANEL COMPONENT ─────────────────────────────────────────────────────
function AdminPanel({authHeaders, authToken, T, WA_GREEN, dark, setConfirmModal, adminOverview=[]}) {
  const authH = () => ({"Content-Type":"application/json","Authorization":`Bearer ${authToken}`});
  const [view, setView] = useState("clients");
  const [clinics, setClinics] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editClinic, setEditClinic] = useState(null);
  const [globalSettings, setGlobalSettings] = React.useState({fallback_enabled:"false",fallback_api_key:"",fallback_provider:"anthropic"});
  const [savingGlobal, setSavingGlobal] = React.useState(false);
  const [selectedClinicRow, setSelectedClinicRow] = React.useState(null);

  const loadGlobalSettings = React.useCallback(async () => {
    try {
      const r = await fetch(API+"/api/admin/global-settings", {headers:authH()});
      if(r.ok) setGlobalSettings(await r.json());
    } catch {}
  }, []);

  const saveGlobalSettings = async (updates) => {
    setSavingGlobal(true);
    try {
      const newSettings = {...globalSettings,...updates};
      await fetch(API+"/api/admin/global-settings", {method:"PATCH", headers:authH(), body:JSON.stringify(newSettings)});
      setGlobalSettings(newSettings);
      const t=document.createElement("div");
      t.style.cssText="position:fixed;bottom:24px;right:24px;z-index:99999;background:#166534;color:#fff;border-radius:12px;padding:12px 20px;font-size:13px;font-weight:700;box-shadow:0 4px 20px rgba(0,0,0,.2);display:flex;align-items:center;gap:8px";
      t.innerHTML="✅ Global settings saved!";
      document.body.appendChild(t);
      setTimeout(()=>t.remove(),2500);
    } catch {
      const t=document.createElement("div");
      t.style.cssText="position:fixed;bottom:24px;right:24px;z-index:99999;background:#dc2626;color:#fff;border-radius:12px;padding:12px 20px;font-size:13px;font-weight:700;box-shadow:0 4px 20px rgba(0,0,0,.2)";
      t.innerHTML="❌ Save failed — try again";
      document.body.appendChild(t);
      setTimeout(()=>t.remove(),2500);
    }
    setSavingGlobal(false);
  };
  const [editUser, setEditUser] = useState(null);
  const [newUser, setNewUser] = useState(null);
  const [showPw, setShowPw] = useState(false);
  const [msg, setMsg] = useState("");
  const API = window.location.hostname==="localhost" ? "http://localhost:5000" : "https://api.codt.my";

  const INDUSTRIES = ["Healthcare & Clinic","Dental","Beauty & Salon","Spa & Wellness",
    "Fitness & Gym","Legal & Law Firm","Real Estate","Education","Restaurant & F&B","Other"];
  const PROVIDERS = [{id:"anthropic",label:"Claude (Anthropic)"},{id:"openai",label:"GPT (OpenAI)"},{id:"groq",label:"Groq"}];
  const INTEGRATION_CONNECTORS = [
    {key:"integration_whatsapp",  label:"WhatsApp"},
    {key:"integration_telegram",  label:"Telegram"},
    {key:"integration_instagram", label:"Instagram"},
    {key:"integration_tiktok",    label:"TikTok"},
    {key:"integration_messenger", label:"Messenger"},
    {key:"integration_calendar",  label:"Google Calendar"},
    {key:"integration_calendly",  label:"Calendly"},
  ];

  const [showIntegrationPerms, setShowIntegrationPerms] = useState(false);

  const PERM_TABS = [
    {key:"can_inbox",label:"💬 Inbox"},{key:"can_leads",label:"🎯 Leads"},
    {key:"can_analytics",label:"📊 Analytics"},{key:"can_testbot",label:"🤖 Test Bot"},
    {key:"can_knowledge",label:"📋 Knowledge"},{key:"can_settings",label:"⚙️ Settings"},
    {key:"can_integrations",label:"🔌 Integrations"},{key:"can_broadcast",label:"📢 Broadcast"},{key:"can_notes",label:"📝 Notes"},{key:"can_prompt_improver",label:"🤖 AI Improver"},{key:"can_prompt_wizard",label:"✨ Prompt Wizard"}
  ];
  const emptyClinic = {name:"",industry:"",website:"",client_domain:"",contact_phone:"",contact_email:"",report_frequency:"weekly",logo_url:"",
    whatsapp_number:"",phone_number_id:"",whatsapp_token:"",ai_provider:"anthropic",ai_api_key:"",max_seats:1};
  const emptyUser = (clinic_id="") => ({username:"",password:"",clinic_id,
    can_inbox:true,can_leads:false,can_analytics:false,can_testbot:false,can_knowledge:false,can_settings:false,can_integrations:false,can_broadcast:false,can_notes:false,can_prompt_improver:false,can_prompt_wizard:false,
    integration_whatsapp:false,integration_telegram:false,integration_instagram:false,
    integration_tiktok:false,integration_messenger:false,integration_calendar:false,integration_calendly:false});

  const [sessions, setSessions] = useState([]);
  const [showSessions, setShowSessions] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      // Load clients and users first (fast)
      const [cr,ur] = await Promise.all([
        fetch(`${API}/api/admin/clients`,{headers:authH()}),
        fetch(`${API}/api/admin/users`,{headers:authH()}),
      ]);
      if(cr.ok) setClinics(await cr.json());
      if(ur.ok) setUsers(await ur.json());
      setLoading(false);
      // Load sessions separately (slower, non-blocking)
      fetch(`${API}/api/admin/sessions`,{headers:authH()})
        .then(r=>r.ok?r.json():[]).then(d=>setSessions(d)).catch(()=>{});
    } catch(e) {
      setLoading(false);
    }
  };

  const forceLogout = (userId, username) => {
    setConfirmModal({
      title:`Force logout @${username}?`,
      message:"This will immediately end their session. They'll need to log in again.",
      icon:"⏏️",
      danger:true,
      confirmText:"Yes, Force Logout",
      onConfirm:async()=>{
        const r = await fetch(`${API}/api/admin/sessions/${userId}`,{method:"DELETE",headers:authH()});
        if(r.ok) { flash(`✅ @${username} has been logged out`); load(); }
      }
    });
  };

  useEffect(()=>{
    load();
    loadGlobalSettings();
    // Auto-refresh every 30 seconds
    const interval = setInterval(load, 30000);
    return ()=>clearInterval(interval);
  },[]);
  const flash = m => { setMsg(m); setTimeout(()=>setMsg(""),3000); };

  // Use useCallback to stabilize inp function reference
  const inp = useCallback((val,onChange,ph="",type="text",extra={}) =>
    <input type={type} value={val||""} onChange={onChange} placeholder={ph}
      style={{width:"100%",padding:"10px 12px",borderRadius:10,border:`1px solid ${T.border}`,
        background:T.card2,color:T.text,fontSize:13,fontFamily:"inherit",outline:"none",
        boxSizing:"border-box",...extra}}/>, [T]);

  const field = useCallback((label,node) => <div style={{marginBottom:12}}>
    <div style={{fontSize:11,fontWeight:700,color:T.textMuted,marginBottom:4,letterSpacing:0.5}}>{label}</div>
    {node}
  </div>, [T]);

  const [kbBuilding, setKbBuilding] = useState(false);
  const [kbBuildMsg, setKbBuildMsg] = useState("");

  const saveClinic = async () => {
    if(!editClinic.name?.trim()) return showToast("Company name required","#ef4444");
    const isNew = !editClinic.id;
    const url = isNew ? `${API}/api/admin/clients` : `${API}/api/admin/clients/${editClinic.id}`;
    const method = isNew ? "POST" : "PATCH";
    const website = (editClinic.website_url||editClinic.website||"").trim();

    // Show KB building indicator for new clinics with website
    if(isNew && website) {
      setKbBuilding(true);
      setKbBuildMsg("🌐 Fetching website content...");
      setTimeout(()=>setKbBuildMsg("🤖 AI is extracting Q&A pairs..."), 2000);
      setTimeout(()=>setKbBuildMsg("📚 Building knowledge base..."), 5000);
    }

    const r = await fetch(url,{method,headers:authH(),body:JSON.stringify({
      ...editClinic,
      website_url: website,
      contact_email: editClinic.contact_email||""
    })});
    const d = await r.json();
    setKbBuilding(false);
    if(!r.ok) return showToast(d.error||"Failed","#ef4444");

    // Show KB result
    if(isNew && d.kb_status && d.kb_status.startsWith("built_")) {
      const count = d.kb_status.split("_")[1];
      flash(`✅ "${editClinic.name}" onboarded! 📚 ${count} Q&A pairs auto-built from website`);
    } else if(isNew && website) {
      flash(`✅ "${editClinic.name}" onboarded! (KB will build in background)`);
    } else {
      flash(isNew ? `✅ "${editClinic.name}" onboarded!` : "✅ Client updated!");
    }
    setView("clients"); setEditClinic(null); load();
  };

  const saveUser = async () => {
    const isNew = !editUser.id;
    if(isNew && (!editUser.username?.trim()||!editUser.password?.trim())) return showToast("Username and password required","#ef4444");
    if(isNew && !editUser.clinic_id) return showToast("Select a company","#ef4444");
    const payload = isNew
      ? {...editUser, existing_clinic_id:editUser.clinic_id, role:"client",
          permissions:{can_inbox:editUser.can_inbox,can_leads:editUser.can_leads,
            can_analytics:editUser.can_analytics,can_testbot:editUser.can_testbot,
            can_knowledge:editUser.can_knowledge,can_settings:editUser.can_settings,
            can_broadcast:editUser.can_broadcast||false,
            can_integrations:editUser.can_integrations,
            can_notes:editUser.can_notes||false,
            can_prompt_improver:editUser.can_prompt_improver||false,
            can_prompt_wizard:editUser.can_prompt_wizard||false,
            integration_whatsapp:editUser.integration_whatsapp,integration_telegram:editUser.integration_telegram,
            integration_instagram:editUser.integration_instagram,integration_tiktok:editUser.integration_tiktok,
            integration_messenger:editUser.integration_messenger,integration_calendar:editUser.integration_calendar,
            integration_calendly:editUser.integration_calendly}}
      : {username:editUser.username, active:editUser.active,
          ...(editUser.newPassword?{password:editUser.newPassword}:{}),
          permissions:{
            can_inbox:editUser.can_inbox,
            can_leads:editUser.can_leads,
            can_analytics:editUser.can_analytics,
            can_testbot:editUser.can_testbot,
            can_knowledge:editUser.can_knowledge,
            can_settings:editUser.can_settings,
            can_broadcast:editUser.can_broadcast||false,
            can_integrations:editUser.can_integrations,
            can_notes:editUser.can_notes||false,
            can_prompt_improver:editUser.can_prompt_improver||false,
            can_prompt_wizard:editUser.can_prompt_wizard||false,
            integration_whatsapp:editUser.integration_whatsapp,
            integration_telegram:editUser.integration_telegram,
            integration_instagram:editUser.integration_instagram,
            integration_tiktok:editUser.integration_tiktok,
            integration_messenger:editUser.integration_messenger,
            integration_calendar:editUser.integration_calendar,
            integration_calendly:editUser.integration_calendly,
          }};
    const url = isNew ? `${API}/api/admin/users` : `${API}/api/admin/users/${editUser.id}`;
    try {
      const r = await fetch(url,{method:isNew?"POST":"PATCH",headers:authH(),body:JSON.stringify(payload)});
      const d = await r.json();
      if(!r.ok) { showToast(d.error||"Save failed","#ef4444"); return; }
      flash(isNew?`✅ User "@${editUser.username}" created!`:"✅ User updated!");
      setView("clients"); setEditUser(null); load();
    } catch(e) {
      showToast("Error: "+e.message,"#ef4444");
    }
  };

  const deleteUser = uid => {
    setConfirmModal({title:"Delete User?",message:"This permanently deletes the user account and all their access.",icon:"🗑️",danger:true,confirmText:"Yes, Delete",
      onConfirm:async()=>{
        try {
          const r = await fetch(`${API}/api/admin/users/${uid}`,{method:"DELETE",headers:authH()});
          if(r.ok) { flash("✅ User deleted"); load(); }
          else { const d=await r.json(); flash("❌ "+(d.error||"Delete failed")); }
        } catch(e) { flash("❌ Error: "+e.message); }
      }});
  };

  // SectionCard and PermGrid defined outside AdminPanel — see below

  // ── CLINIC FORM — Step wizard ─────────────────────────────────────────────
  const [clinicStep, setClinicStep] = useState(0);
  const CLINIC_STEPS = [
    {label:"Company Info", icon:"🏢", desc:"Basic details about the client"},
    {label:"WhatsApp", icon:"📱", desc:"Connect their WhatsApp Business account"},
    {label:"AI & Settings", icon:"🤖", desc:"Configure AI provider and API keys"},
  ];
  const inputStyle = {width:"100%",padding:"12px 14px",borderRadius:10,
    border:`1.5px solid ${T.border}`,background:T.card,color:T.text,
    fontSize:14,fontFamily:"inherit",outline:"none",boxSizing:"border-box"};
  const selectStyle = {...inputStyle,cursor:"pointer"};
  const labelStyle = {display:"block",fontSize:12,fontWeight:600,color:T.textMuted,marginBottom:6,letterSpacing:0.3};

  if(view==="clinic_form") return (
    <div style={{flex:1,overflowY:"auto",overflowX:"hidden",paddingBottom:80}}>
    <div style={{maxWidth:560,margin:"0 auto",padding:"16px 16px 40px"}}>
      {/* KB Building overlay */}
      {kbBuilding&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
        <div style={{background:"#1e293b",borderRadius:20,padding:"32px 40px",textAlign:"center",maxWidth:340}}>
          <div style={{fontSize:40,marginBottom:12}}>🤖</div>
          <div style={{fontWeight:800,fontSize:18,color:"#fff",marginBottom:8}}>Building Knowledge Base</div>
          <div style={{fontSize:13,color:"rgba(255,255,255,.7)",marginBottom:20,lineHeight:1.6}}>{kbBuildMsg}</div>
          <div style={{height:4,borderRadius:2,background:"rgba(255,255,255,.1)",overflow:"hidden"}}>
            <div style={{height:4,borderRadius:2,background:WA_GREEN,animation:"kbprogress 8s linear forwards"}}/>
          </div>
          <div style={{fontSize:11,color:"rgba(255,255,255,.4)",marginTop:12}}>This may take 10-20 seconds...</div>
        </div>
        <style>{`@keyframes kbprogress{from{width:0%}to{width:95%}}`}</style>
      </div>}

      {/* Step progress */}
      <div style={{background:T.card,borderRadius:16,padding:"20px 24px",marginBottom:14,border:`1px solid ${T.border}`}}>
        <div style={{display:"flex",alignItems:"flex-start",position:"relative"}}>
          <div style={{position:"absolute",top:19,left:"calc(16.6% + 4px)",width:"66.6%",height:2,background:T.border,zIndex:0}}/>
          <div style={{position:"absolute",top:19,left:"calc(16.6% + 4px)",height:2,zIndex:1,
            width:"0%",background:WA_GREEN,transition:"width .35s ease"}}/>
          {CLINIC_STEPS.map((s,i)=>(
            <div key={i} onClick={()=>setClinicStep(i)}
              style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:6,zIndex:2,cursor:"pointer"}}>
              <div style={{width:40,height:40,borderRadius:"50%",
                background:i<clinicStep?"#22c55e":i===clinicStep?WA_GREEN:T.card2,
                border:`2px solid ${i===clinicStep?WA_GREEN:i<clinicStep?"#22c55e":T.border}`,
                display:"flex",alignItems:"center",justifyContent:"center",
                fontWeight:800,fontSize:i<clinicStep?16:14,
                color:i<=clinicStep?"#fff":T.textFaint,transition:"all .3s",
                boxShadow:i===clinicStep?"0 0 0 4px rgba(37,211,102,.15)":"none"}}>
                {i<clinicStep?"✓":i+1}
              </div>
              <div style={{fontSize:11,fontWeight:i===clinicStep?700:500,color:i===clinicStep?T.text:T.textMuted,textAlign:"center"}}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Step card */}
      <div style={{background:T.card,borderRadius:16,border:`1px solid ${T.border}`,overflow:"hidden",marginBottom:12}}>
        <div style={{padding:"18px 24px",borderBottom:`1px solid ${T.border}`,background:`${WA_GREEN}06`}}>
          <div style={{fontSize:20,marginBottom:2}}>{CLINIC_STEPS[clinicStep].icon}</div>
          <div style={{fontWeight:800,fontSize:17,color:T.text}}>{CLINIC_STEPS[clinicStep].label}</div>
          <div style={{fontSize:12,color:T.textMuted,marginTop:2}}>{CLINIC_STEPS[clinicStep].desc}</div>
        </div>
        <div style={{padding:"22px 24px"}}>

          {/* STEP 0 — Company Info */}
          {clinicStep===0&&<div style={{display:"flex",flexDirection:"column",gap:14}}>

            {/* Logo upload — top and prominent */}
            <div style={{display:"flex",alignItems:"center",gap:16,padding:16,borderRadius:12,border:`2px dashed ${T.border}`,background:T.card2}}>
              <div style={{flexShrink:0}}>
                {editClinic?.logo_url
                  ?<img src={editClinic.logo_url} style={{width:64,height:64,borderRadius:14,objectFit:"cover",border:`2px solid ${WA_GREEN}`}} alt=""/>
                  :<div style={{width:64,height:64,borderRadius:14,background:T.card,border:`2px dashed ${T.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28}}>🏢</div>}
              </div>
              <div>
                <div style={{fontWeight:700,fontSize:13,marginBottom:4}}>Company Logo</div>
                <label style={{display:"inline-flex",alignItems:"center",gap:6,padding:"7px 14px",borderRadius:8,border:`1px solid ${WA_GREEN}`,background:`${WA_GREEN}10`,cursor:"pointer",fontSize:12,fontWeight:600,color:WA_GREEN}}>
                  📎 Upload Logo
                  <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{
                    const f=e.target.files[0]; if(!f) return;
                    if(f.size>500000){showToast("Max file size is 500KB","#ef4444");return;}
                    const r=new FileReader(); r.onload=ev=>setEditClinic(p=>({...p,logo_url:ev.target.result})); r.readAsDataURL(f);
                  }}/>
                </label>
                <div style={{fontSize:10,color:T.textFaint,marginTop:4}}>PNG, JPG · Max 500KB{editClinic?.logo_url&&<span onClick={()=>setEditClinic(p=>({...p,logo_url:""}))} style={{color:"#ef4444",cursor:"pointer",marginLeft:8}}>✕ Remove</span>}</div>
              </div>
            </div>

            {/* Company Name */}
            <div>
              <label style={labelStyle}>Company Name *</label>
              <input autoFocus value={editClinic?.name||""} onChange={e=>setEditClinic(p=>({...p,name:e.target.value}))} placeholder="e.g. Evera Health Clinic" style={inputStyle}/>
            </div>



            {/* Industry + Seats */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div>
                <label style={labelStyle}>Industry</label>
                <select value={INDUSTRIES.includes(editClinic?.industry||"")?editClinic?.industry||"":"Other"} onChange={e=>{
                  if(e.target.value==="Other") setEditClinic(p=>({...p,industry:""}));
                  else setEditClinic(p=>({...p,industry:e.target.value}));
                }} style={selectStyle}>
                  <option value="">— Select Industry —</option>
                  {INDUSTRIES.map(i=><option key={i} value={i}>{i}</option>)}
                </select>
                {(!INDUSTRIES.includes(editClinic?.industry||"")&&(editClinic?.industry!==undefined))&&
                  <input value={editClinic?.industry||""} onChange={e=>setEditClinic(p=>({...p,industry:e.target.value}))}
                    placeholder="Enter your industry..." style={{...inputStyle,marginTop:6}}/>}
              </div>
              <div>
                <label style={labelStyle}>Max Login Seats</label>
                <input type="number" min="1" value={editClinic?.max_seats||1} onChange={e=>setEditClinic(p=>({...p,max_seats:e.target.value}))} style={inputStyle}/>
              </div>
            </div>

            {/* Owner Email + Contact Phone */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div>
                <label style={labelStyle}>📧 Owner Email <span style={{color:"#e11d48",fontSize:10}}>(for reports)</span></label>
                <input type="email" value={editClinic?.contact_email||""} onChange={e=>setEditClinic(p=>({...p,contact_email:e.target.value}))} placeholder="owner@company.com" style={inputStyle}/>
              </div>
              <div>
                <label style={labelStyle}>Contact Phone</label>
                <input value={editClinic?.contact_phone||""} onChange={e=>setEditClinic(p=>({...p,contact_phone:e.target.value}))} placeholder="+60123456789" style={inputStyle}/>
              </div>
            </div>

            {/* Report Frequency + Session Timeout */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div>
                <label style={labelStyle}>📊 Report Frequency</label>
                <select value={editClinic?.report_frequency||"weekly"} onChange={e=>setEditClinic(p=>({...p,report_frequency:e.target.value}))} style={inputStyle}>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="off">Off — Don't send</option>
                </select>
                <div style={{fontSize:10,color:T.textFaint,marginTop:4}}>How often this client gets performance reports</div>
              </div>
              <div>
                <label style={labelStyle}>Session Timeout (mins)</label>
                <input type="number" min="1" value={editClinic?.session_timeout_mins||30} onChange={e=>setEditClinic(p=>({...p,session_timeout_mins:e.target.value}))} style={inputStyle}/>
                <div style={{fontSize:10,color:T.textFaint,marginTop:4}}>Auto-logout after inactivity</div>
              </div>
            </div>

            {/* Website */}
            <div>
              <label style={labelStyle}>Website URL</label>
              <input value={editClinic?.website_url||editClinic?.website||""} onChange={e=>setEditClinic(p=>({...p,website_url:e.target.value,website:e.target.value}))} placeholder="https://company.com" style={inputStyle}/>
              <div style={{fontSize:10,color:T.textFaint,marginTop:4}}>We'll use this for your client's knowledge base</div>
            </div>


          </div>}

          {/* STEP 1 — WhatsApp */}
          {clinicStep===1&&<div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={{padding:"11px 14px",borderRadius:10,background:`${WA_GREEN}08`,border:`1px solid ${WA_GREEN}25`,fontSize:12,color:T.textMuted,lineHeight:1.7}}>
              📌 Get these values from <strong style={{color:T.text}}>Meta Business Manager</strong> → WhatsApp → API Setup
            </div>
            <div>
              <label style={labelStyle}>WhatsApp Phone Number</label>
              <input value={editClinic?.whatsapp_number||""} onChange={e=>setEditClinic(p=>({...p,whatsapp_number:e.target.value}))} placeholder="+60 11 1050 7200" style={inputStyle}/>
            </div>
            <div>
              <label style={labelStyle}>Phone Number ID</label>
              <input value={editClinic?.phone_number_id||""} onChange={e=>setEditClinic(p=>({...p,phone_number_id:e.target.value}))} placeholder="985068241357564" style={inputStyle}/>
            </div>
            <div>
              <label style={labelStyle}>Access Token</label>
              <input type="password" value={editClinic?.whatsapp_token||""} onChange={e=>setEditClinic(p=>({...p,whatsapp_token:e.target.value}))} placeholder="EAAxxxxxxxxxxxxxxxx" style={inputStyle}/>
              <div style={{fontSize:11,color:T.textFaint,marginTop:5}}>Your permanent WA token — keep it confidential</div>
            </div>
          </div>}

          {/* STEP 2 — AI */}
          {clinicStep===2&&<div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={{padding:"11px 14px",borderRadius:10,background:"#eff6ff",border:"1px solid #bfdbfe",fontSize:12,color:"#1e40af",lineHeight:1.7}}>
              🤖 The AI will handle all WhatsApp conversations for this client using their own API key — costs come from their own account
            </div>
            <div>
              <label style={labelStyle}>AI Provider</label>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                {PROVIDERS.map(p=>(
                  <div key={p.id} onClick={()=>setEditClinic(prev=>({...prev,ai_provider:p.id}))}
                    style={{padding:"12px 8px",borderRadius:10,border:`2px solid ${editClinic?.ai_provider===p.id?WA_GREEN:T.border}`,
                      background:editClinic?.ai_provider===p.id?`${WA_GREEN}10`:T.card2,
                      cursor:"pointer",textAlign:"center",transition:"all .15s"}}>
                    <div style={{fontSize:11,fontWeight:700,color:editClinic?.ai_provider===p.id?WA_GREEN:T.textMuted}}>{p.label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <label style={labelStyle}>API Key</label>
              <input type="password" value={editClinic?.ai_api_key||""} onChange={e=>setEditClinic(p=>({...p,ai_api_key:e.target.value}))} placeholder="sk-ant-api03-..." style={inputStyle}/>
              <div style={{fontSize:11,color:T.textFaint,marginTop:5}}>Used for AI replies, smart follow-ups and lead scoring</div>
            </div>
          </div>}

        </div>
      </div>

      {/* Navigation */}
      <div style={{display:"flex",gap:10,marginBottom:24}}>
        {clinicStep>0&&<button onClick={()=>setClinicStep(s=>s-1)}
          style={{flex:1,padding:"13px",borderRadius:12,border:`1px solid ${T.border}`,background:"transparent",color:T.textMuted,fontSize:14,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>
          ← Back
        </button>}
        <button onClick={()=>{setView("clients");setEditClinic(null);setClinicStep(0);}}
          style={{flex:1,padding:"13px",borderRadius:12,border:`1px solid #ef444440`,background:"#ef444408",color:"#ef4444",fontSize:14,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>
          ✕ Cancel
        </button>
        <button onClick={clinicStep<CLINIC_STEPS.length-1?()=>setClinicStep(s=>s+1):saveClinic}
            style={{flex:2,padding:"13px",borderRadius:12,border:"none",background:`linear-gradient(135deg,${WA_GREEN},#1da851)`,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 14px rgba(37,211,102,.35)"}}>
            {clinicStep<CLINIC_STEPS.length-1?"Next →":editClinic?.id?"💾 Save Changes":"🚀 Onboard Client"}
          </button>
      </div>
    </div>
    </div>
  );

  // ── USER FORM ───────────────────────────────────────────────────────────────
  // ── USER FORM ───────────────────────────────────────────────────────────────
  if(view==="user_form") return (
    <div style={{flex:1,overflowY:"auto",overflowX:"hidden"}}>
    <div style={{maxWidth:480,margin:"0 auto",padding:"16px 16px 40px"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
        <button onClick={()=>{setView("clients");setEditUser(null);}} style={{border:"none",background:"none",cursor:"pointer",fontSize:22,color:T.textMuted,padding:0}}>←</button>
        <div style={{fontWeight:800,fontSize:18}}>{editUser?.id?`✏️ Edit @${editUser.username}`:"👤 Add New User"}</div>
      </div>

      <SectionCard T={T} title="👤 USER DETAILS">
        {/* Active toggle — edit only */}
        {editUser?.id&&<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 12px",borderRadius:10,background:T.card2,border:`1px solid ${T.border}`,marginBottom:12}}>
          <div>
            <div style={{fontWeight:700,fontSize:13}}>Account Status</div>
            <div style={{fontSize:11,color:T.textMuted}}>{editUser.active?"Active — can login":"Disabled"}</div>
          </div>
          <div onClick={()=>setEditUser(p=>({...p,active:!p.active}))}
            style={{width:44,height:24,borderRadius:12,cursor:"pointer",background:editUser.active?WA_GREEN:"#ef4444",position:"relative",flexShrink:0}}>
            <div style={{position:"absolute",top:2,left:editUser.active?20:2,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left .15s"}}/>
          </div>
        </div>}

        {/* Company selector — new user only */}
        {!editUser?.id&&field("CLIENT COMPANY *",
          <select value={editUser?.clinic_id||""} onChange={e=>setEditUser(p=>({...p,clinic_id:e.target.value}))}
            style={{width:"100%",padding:"10px 12px",borderRadius:10,border:`1px solid ${T.border}`,background:T.card2,color:T.text,fontSize:13,fontFamily:"inherit",outline:"none"}}>
            <option value="">— Select Company —</option>
            {clinics.filter(c=>c.active!==false).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}

        {field("USERNAME *", inp(editUser?.username, e=>setEditUser(p=>({...p,username:e.target.value})), "e.g. evera_staff1"))}

        <div style={{marginBottom:4}}>
          <div style={{fontSize:11,fontWeight:700,color:T.textMuted,marginBottom:4,letterSpacing:0.5}}>
            {editUser?.id?"NEW PASSWORD (leave blank to keep)":"PASSWORD *"}
          </div>
          <div style={{position:"relative"}}>
            {inp(editUser?.id?editUser.newPassword:editUser?.password,
              e=>setEditUser(p=>({...p,[editUser?.id?"newPassword":"password"]:e.target.value})),
              editUser?.id?"Enter new password...":"Set password...", showPw?"text":"password", {paddingRight:40})}
            <button onClick={()=>setShowPw(p=>!p)} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",border:"none",background:"none",cursor:"pointer",fontSize:15,color:T.textMuted}}>{showPw?"🙈":"👁️"}</button>
          </div>
        </div>
      </SectionCard>

      <SectionCard T={T} title="🔐 TAB PERMISSIONS">
        <PermGrid data={editUser||{}} setData={setEditUser} PERM_TABS={PERM_TABS} WA_GREEN={WA_GREEN} T={T}
          INTEGRATION_CONNECTORS={INTEGRATION_CONNECTORS}
          onIntegrationToggle={(val)=>{if(val)setShowIntegrationPerms(true);}}/>

        {/* Integration sub-permissions popup */}
        {showIntegrationPerms&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center"}}
          onClick={e=>{if(e.target===e.currentTarget)setShowIntegrationPerms(false);}}>
          <div style={{background:"#fff",borderRadius:20,padding:28,width:340,boxShadow:"0 20px 60px rgba(0,0,0,.2)",animation:"fadeInScale .2s ease"}}>
            <div style={{textAlign:"center",marginBottom:20}}>
              <div style={{fontSize:36,marginBottom:8}}>🔌</div>
              <div style={{fontWeight:800,fontSize:17,marginBottom:4}}>Integrations Access</div>
              <div style={{fontSize:12,color:T.textMuted}}>Select which connectors this user can see and manage</div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:20}}>
              {INTEGRATION_CONNECTORS.map(c=>{
                const isOn = editUser?.[c.key]||false;
                return (
                  <div key={c.key} onClick={()=>setEditUser(p=>({...p,[c.key]:!p[c.key]}))}
                    style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                      padding:"10px 14px",borderRadius:10,cursor:"pointer",
                      background:isOn?"#f0fdf4":"#f8fafc",
                      border:`1px solid ${isOn?"#86efac":"#e2e8f0"}`}}>
                    <span style={{fontWeight:600,fontSize:13,color:isOn?"#166534":"#374151"}}>{c.label}</span>
                    <div style={{width:40,height:22,borderRadius:11,background:isOn?"#25D366":"#cbd5e1",position:"relative",transition:"background .2s",flexShrink:0}}>
                      <div style={{position:"absolute",top:3,left:isOn?20:3,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,.2)"}}/>
                    </div>
                  </div>
                );
              })}
            </div>
            <button onClick={()=>setShowIntegrationPerms(false)}
              style={{width:"100%",padding:"11px",borderRadius:12,border:"none",background:"#25D366",color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer"}}>
              ✅ Done
            </button>
          </div>
        </div>}
      </SectionCard>

      <div style={{display:"flex",gap:10,marginBottom:20}}>
        <button onClick={()=>{setView("clients");setEditUser(null);}}
          style={{flex:1,padding:"12px",borderRadius:12,border:`1px solid ${T.border}`,background:T.card2,color:T.textMuted,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>
          Cancel
        </button>
        <button onClick={saveUser}
          style={{flex:2,padding:"12px",borderRadius:12,border:"none",background:WA_GREEN,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
          💾 {editUser?.id?"Save Changes":"Create User"}
        </button>
      </div>
    </div>
    </div>
  );

  // ── MAIN CLIENTS LIST ───────────────────────────────────────────────────────

  return (
    <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden"}}>

      {/* Page header */}
      <div className="nx-page-header" style={{flexShrink:0}}>
        <i className="ti ti-crown" style={{fontSize:20,color:"#f59e0b"}}/>
        <div>
          <div className="nx-page-title">Admin Panel</div>
          <div className="nx-page-sub">Manage all clients and users</div>
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:8}}>
          <button onClick={()=>{setEditUser(emptyUser());setView("user_form");}} className="nx-btn">
            <i className="ti ti-user-plus" style={{fontSize:14}}/> New User
          </button>
          <button onClick={()=>{setEditClinic({...emptyClinic});setClinicStep(0);setView("clinic_form");}} className="nx-btn primary">
            <i className="ti ti-plus" style={{fontSize:14}}/> Add Client
          </button>
        </div>
      </div>

      <div style={{flex:1,overflowY:"auto",padding:"20px 24px",paddingBottom:40}}>

        {msg&&<div style={{background:"#dcfce7",border:"1px solid #86efac",borderRadius:10,padding:"10px 16px",marginBottom:16,fontSize:13,fontWeight:600,color:"#166534"}}>{msg}</div>}

        {/* Stat cards */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
          {[
            {label:"Active Clients",      val:clinics.filter(c=>c.active!==false).length,                                                                                             icon:"ti ti-building",  color:"#f59e0b"},
            {label:"Total Contacts",      val:adminOverview.reduce((s,c)=>s+(c.total_contacts||0),0),                                                                                 icon:"ti ti-users",     color:"#3b82f6"},
            {label:"Avg Bot Performance", val:(()=>{const a=adminOverview.filter(c=>c.active!==false);return a.length?Math.round(a.reduce((s,c)=>s+(c.bot_performance||0),0)/a.length):0})()+"%", icon:"ti ti-robot",  color:WA_GREEN},
            {label:"Online Now",          val:sessions.length,                                                                                                                        icon:"ti ti-wifi",      color:"#8b5cf6"},
          ].map(s=>(
            <div key={s.label} style={{background:T.card,borderRadius:12,border:`1px solid ${T.border}`,padding:"16px 18px",display:"flex",alignItems:"center",gap:14}}>
              <div style={{width:40,height:40,borderRadius:10,background:s.color+"15",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <i className={s.icon} style={{fontSize:18,color:s.color}}/>
              </div>
              <div>
                <div style={{fontSize:11,color:T.textMuted,fontWeight:500,marginBottom:2}}>{s.label}</div>
                <div style={{fontSize:22,fontWeight:800,color:T.text,lineHeight:1}}>{s.val}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Global fallback API key */}
        <div style={{background:T.card,borderRadius:12,border:`1px solid ${T.border}`,padding:"14px 18px",marginBottom:20}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <i className="ti ti-key" style={{fontSize:16,color:"#f59e0b"}}/>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:T.text}}>Fallback API Key</div>
                <div style={{fontSize:11,color:T.textMuted}}>Used when a client has no own API key</div>
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              {globalSettings.fallback_enabled==="true"&&<>
                <select value={globalSettings.fallback_provider||"anthropic"}
                  onChange={e=>setGlobalSettings(p=>({...p,fallback_provider:e.target.value}))}
                  style={{padding:"6px 10px",borderRadius:8,border:`1px solid ${T.border}`,background:T.card2,color:T.text,fontSize:12,fontFamily:"inherit",outline:"none"}}>
                  <option value="anthropic">Claude (Anthropic)</option>
                  <option value="openai">OpenAI (GPT-4o)</option>
                </select>
                <input type="password" value={globalSettings.fallback_api_key||""}
                  onChange={e=>setGlobalSettings(p=>({...p,fallback_api_key:e.target.value}))}
                  placeholder="sk-ant-... or sk-..."
                  style={{width:220,padding:"6px 12px",borderRadius:8,border:`1px solid ${T.border}`,background:T.card2,color:T.text,fontSize:12,fontFamily:"monospace",outline:"none"}}/>
                <button onClick={()=>saveGlobalSettings(globalSettings)} disabled={savingGlobal}
                  className="nx-btn primary" style={{padding:"6px 14px",fontSize:12,flexShrink:0}}>
                  {savingGlobal?"Saving...":"Save"}
                </button>
              </>}
              <div onClick={()=>saveGlobalSettings({fallback_enabled:globalSettings.fallback_enabled==="true"?"false":"true"})}
                style={{width:40,height:22,borderRadius:11,background:globalSettings.fallback_enabled==="true"?WA_GREEN:"#d1d5db",
                  cursor:"pointer",position:"relative",transition:"background .2s",flexShrink:0}}>
                <div style={{position:"absolute",top:2,left:globalSettings.fallback_enabled==="true"?20:2,width:18,height:18,
                  borderRadius:"50%",background:"#fff",transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,.2)"}}/>
              </div>
            </div>
          </div>
        </div>

        {/* Clients table */}
        {loading?<div style={{textAlign:"center",padding:40,color:T.textMuted}}>
          <div style={{width:28,height:28,borderRadius:"50%",border:`3px solid ${WA_GREEN}30`,borderTop:`3px solid ${WA_GREEN}`,
            animation:"spin .8s linear infinite",margin:"0 auto 10px"}}/>
          Loading...
        </div>:<div style={{background:T.card,borderRadius:12,border:`1px solid ${T.border}`,overflow:"hidden"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr style={{borderBottom:`1px solid ${T.border}`}}>
                {["Client","WhatsApp","Bot","Contacts","Messages","Performance",""].map(h=>(
                  <th key={h} style={{padding:"11px 14px",textAlign:"left",fontSize:11,fontWeight:700,
                    color:T.textMuted,textTransform:"uppercase",letterSpacing:.5,whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clinics.length===0&&<tr><td colSpan={7} style={{padding:40,textAlign:"center",color:T.textMuted,fontSize:13}}>
                No clients yet — click "Add Client" to get started
              </td></tr>}
              {clinics.map(clinic=>{
                const ov = adminOverview.find(o=>o.clinic_id===clinic.id||o.id===clinic.id)||{};
                const total = ov.total_messages||0;
                const botMsgs = ov.bot_messages||0;
                const perf = total>0?Math.round(botMsgs/total*100):0;
                const clinicUsers = users.filter(u=>u.clinic_id===clinic.id);
                const isExpanded = selectedClinicRow===clinic.id;
                const inactive = clinic.active===false;

                return <React.Fragment key={clinic.id}>
                  <tr style={{borderBottom:`1px solid ${T.border}`,
                    background:isExpanded?T.card2:inactive?T.card2+"80":"transparent",transition:"background .15s",cursor:"pointer"}}
                    onClick={()=>setSelectedClinicRow(isExpanded?null:clinic.id)}
                    onMouseEnter={e=>{if(!isExpanded)e.currentTarget.style.background=T.card2;}}
                    onMouseLeave={e=>{if(!isExpanded)e.currentTarget.style.background=inactive?T.card2+"80":"transparent";}}>

                    {/* Client */}
                    <td style={{padding:"12px 14px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <div style={{width:34,height:34,borderRadius:9,overflow:"hidden",flexShrink:0,
                          background:WA_GREEN+"20",display:"flex",alignItems:"center",justifyContent:"center"}}>
                          {clinic.logo_url
                            ?<img src={clinic.logo_url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>
                            :<span style={{fontSize:11,fontWeight:800,color:WA_GREEN}}>{(clinic.name||"?").slice(0,2).toUpperCase()}</span>}
                        </div>
                        <div>
                          <div style={{fontSize:13,fontWeight:700,color:inactive?T.textMuted:T.text,display:"flex",alignItems:"center",gap:6}}>
                            {clinic.name}
                            {inactive&&<span style={{fontSize:9,padding:"2px 6px",borderRadius:10,background:"#fee2e2",color:"#dc2626",fontWeight:700}}>DISABLED</span>}
                          </div>
                          <div style={{fontSize:10,color:T.textMuted}}>clinic_id: {clinic.id}</div>
                        </div>
                      </div>
                    </td>

                    {/* WhatsApp */}
                    <td style={{padding:"12px 14px",fontSize:12,color:T.textMuted}}>{clinic.whatsapp_number||"—"}</td>

                    {/* Bot */}
                    <td style={{padding:"12px 14px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <div style={{width:7,height:7,borderRadius:"50%",
                          background:clinic.bot_enabled!==false?WA_GREEN:"#ef4444"}}/>
                        <span style={{fontSize:12,fontWeight:600,color:clinic.bot_enabled!==false?WA_GREEN:"#ef4444"}}>
                          {clinic.bot_enabled!==false?"ON":"OFF"}
                        </span>
                      </div>
                    </td>

                    {/* Contacts */}
                    <td style={{padding:"12px 14px",fontSize:13,fontWeight:600,color:T.text}}>{ov.total_contacts||0}</td>

                    {/* Messages */}
                    <td style={{padding:"12px 14px",fontSize:13,fontWeight:600,color:T.text}}>{total}</td>

                    {/* Performance */}
                    <td style={{padding:"12px 14px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{width:64,height:4,borderRadius:2,background:T.border,overflow:"hidden",flexShrink:0}}>
                          <div style={{height:4,borderRadius:2,transition:"width .5s",
                            width:`${perf}%`,background:perf>=70?WA_GREEN:perf>=40?"#f59e0b":"#ef4444"}}/>
                        </div>
                        <span style={{fontSize:12,fontWeight:600,color:T.text,minWidth:30}}>{perf}%</span>
                      </div>
                    </td>

                    {/* Actions */}
                    <td style={{padding:"12px 14px"}} onClick={e=>e.stopPropagation()}>
                      <div style={{display:"flex",gap:5,alignItems:"center"}}>
                        <button onClick={()=>{setEditClinic({...clinic});setClinicStep(0);setView("clinic_form");}}
                          style={{padding:"5px 12px",borderRadius:8,border:`1px solid ${T.border}`,background:"transparent",
                            color:T.text,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                          Edit
                        </button>
                        <button onClick={(e)=>{e.stopPropagation();setConfirmModal({title:"Delete Client?",
                          message:`This permanently deletes "${clinic.name}" and ALL their data — contacts, messages, KB. This cannot be undone.`,
                          icon:"🗑️",danger:true,confirmText:"Yes, Delete",
                          onConfirm:async()=>{
                            try {
                              const r = await fetch(`${API}/api/admin/clients/${clinic.id}`,{method:"DELETE",headers:authH()});
                              if(r.ok) { flash(`✅ "${clinic.name}" deleted`); load(); }
                              else { const d=await r.json(); flash("❌ "+(d.error||"Delete failed")); }
                            } catch(e) { flash("❌ Error: "+e.message); }
                          }});}}
                          style={{padding:"5px 10px",borderRadius:8,border:"1px solid #ef444460",background:"transparent",
                            color:"#ef4444",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                          <i className="ti ti-trash" style={{fontSize:13}}/>
                        </button>
                        <button onClick={()=>setSelectedClinicRow(isExpanded?null:clinic.id)}
                          style={{padding:"5px 12px",borderRadius:8,fontSize:12,cursor:"pointer",fontFamily:"inherit",
                            border:`1px solid ${isExpanded?WA_GREEN:T.border}`,
                            background:isExpanded?`${WA_GREEN}10`:"transparent",
                            color:isExpanded?WA_GREEN:T.textMuted}}>
                          {isExpanded?"▲ Close":"▼ Manage"}
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Expanded panel — client toggle + staff list */}
                  {isExpanded&&<tr style={{borderBottom:`1px solid ${T.border}`}}>
                    <td colSpan={7} style={{padding:0}}>
                      <div style={{background:T.card2}}>

                        {/* Client enable/disable toggle row */}
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                          padding:"12px 20px",borderBottom:`1px solid ${T.border}`}}>
                          <div style={{display:"flex",alignItems:"center",gap:10}}>
                            <div style={{width:8,height:8,borderRadius:"50%",background:inactive?"#ef4444":WA_GREEN,flexShrink:0}}/>
                            <div>
                              <div style={{fontSize:13,fontWeight:600,color:T.text}}>
                                {clinic.name} — {inactive?"Disabled":"Active"}
                              </div>
                              <div style={{fontSize:11,color:T.textMuted}}>
                                {inactive?"Users cannot login":"All users can login and use the system"}
                              </div>
                            </div>
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:10}}>
                            <span style={{fontSize:11,color:T.textMuted}}>{inactive?"Enable":"Disable"}</span>
                            <div onClick={()=>setConfirmModal({
                              title:(inactive?"Enable":"Disable")+" "+clinic.name+"?",
                              message:inactive?"Users will be able to login again.":"Users won't be able to login.",
                              icon:inactive?"🟢":"🔴",danger:!inactive,
                              confirmText:"Yes, "+(inactive?"Enable":"Disable"),
                              onConfirm:async()=>{
                                await fetch(`${API}/api/admin/clients/${clinic.id}`,{method:"PATCH",headers:authH(),body:JSON.stringify({active:!!inactive})});
                                flash("✅ Done");load();
                              }})}
                              style={{width:44,height:24,borderRadius:12,cursor:"pointer",flexShrink:0,
                                background:inactive?"#d1d5db":WA_GREEN,position:"relative",transition:"background .25s"}}>
                              <div style={{position:"absolute",top:3,left:inactive?3:22,width:18,height:18,
                                borderRadius:"50%",background:"#fff",transition:"left .25s",
                                boxShadow:"0 1px 4px rgba(0,0,0,.2)"}}/>
                            </div>
                          </div>
                        </div>

                        {/* Staff header */}
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                          padding:"10px 20px 8px",borderBottom:`1px solid ${T.border}`}}>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <span style={{fontSize:12,fontWeight:700,color:T.textMuted,textTransform:"uppercase",letterSpacing:.5}}>Staff</span>
                            <span style={{fontSize:11,padding:"1px 7px",borderRadius:20,
                              background:T.card,border:`1px solid ${T.border}`,color:T.textMuted}}>
                              {clinicUsers.length}/{clinic.max_seats||1} seats
                            </span>
                          </div>
                          <button onClick={()=>{setEditUser(emptyUser(clinic.id));setView("user_form");}}
                            style={{fontSize:12,fontWeight:600,color:WA_GREEN,background:"none",border:"none",cursor:"pointer",padding:0,fontFamily:"inherit"}}>
                            + Add User
                          </button>
                        </div>

                        {/* Staff vertical list */}
                        {clinicUsers.length===0
                          ?<div style={{padding:"14px 20px",fontSize:12,color:T.textFaint,fontStyle:"italic"}}>No staff yet</div>
                          :clinicUsers.map((u,idx)=>{
                            const sess = sessions.find(s=>s.user_id===u.id);
                            const online = !!sess;
                            return <div key={u.id} style={{
                              display:"flex",alignItems:"center",gap:12,
                              padding:"10px 20px",
                              borderBottom:idx<clinicUsers.length-1?`1px solid ${T.border}40`:"none",
                              background:"transparent",transition:"background .1s"}}
                              onMouseEnter={e=>e.currentTarget.style.background=T.card+"80"}
                              onMouseLeave={e=>e.currentTarget.style.background="transparent"}>

                              {/* Avatar */}
                              <div style={{width:32,height:32,borderRadius:"50%",flexShrink:0,
                                background:online?WA_GREEN:"#94a3b8",
                                display:"flex",alignItems:"center",justifyContent:"center",
                                fontSize:12,fontWeight:700,color:"#fff",position:"relative"}}>
                                {(u.username||"?")[0].toUpperCase()}
                                <div style={{position:"absolute",bottom:0,right:0,width:9,height:9,
                                  borderRadius:"50%",border:"2px solid "+T.card2,
                                  background:online?"#22c55e":u.active?"#cbd5e1":"#ef4444"}}/>
                              </div>

                              {/* Name + status */}
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontSize:13,fontWeight:600,color:u.active?T.text:T.textMuted}}>
                                  @{u.username}
                                </div>
                                <div style={{fontSize:11,color:online?WA_GREEN:T.textFaint,marginTop:1}}>
                                  {online?"Online now":"Offline"}
                                </div>
                                {sess?.location&&<div style={{fontSize:11,color:T.textMuted,marginTop:1}}>
                                  📍 {sess.location}
                                </div>}
                                {/* Permission pills */}
                                <div style={{display:"flex",flexWrap:"wrap",gap:3,marginTop:5}}>
                                  {PERM_TABS.filter(p=>u[p.key]).map(p=>(
                                    <span key={p.key} style={{fontSize:9,padding:"2px 6px",borderRadius:8,
                                      background:`${WA_GREEN}15`,color:WA_GREEN,fontWeight:600}}>
                                      {p.label}
                                    </span>
                                  ))}
                                </div>
                              </div>

                              {/* User active toggle */}
                              <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                                <span style={{fontSize:11,color:T.textFaint}}>{u.active?"Active":"Off"}</span>
                                <div onClick={async()=>{
                                  await fetch(`${API}/api/admin/users/${u.id}`,{method:"PATCH",headers:authH(),body:JSON.stringify({active:!u.active})});
                                  flash(`✅ @${u.username} ${u.active?"deactivated":"activated"}`);load();
                                }} style={{width:36,height:20,borderRadius:10,cursor:"pointer",flexShrink:0,
                                  background:u.active?WA_GREEN:"#d1d5db",position:"relative",transition:"background .2s"}}>
                                  <div style={{position:"absolute",top:2,left:u.active?17:2,width:16,height:16,
                                    borderRadius:"50%",background:"#fff",transition:"left .2s",
                                    boxShadow:"0 1px 3px rgba(0,0,0,.2)"}}/>
                                </div>
                              </div>

                              {/* Action buttons */}
                              <div style={{display:"flex",gap:4,flexShrink:0}}>
                                <button onClick={()=>{setEditUser({...u,newPassword:""});setView("user_form");}}
                                  title="Edit user"
                                  style={{padding:"4px 10px",borderRadius:6,border:`1px solid ${T.border}`,
                                    background:"transparent",color:T.text,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                                  Edit
                                </button>
                                {online&&<button onClick={()=>forceLogout(u.id,u.username)}
                                  title="Force logout"
                                  style={{padding:"4px 10px",borderRadius:6,border:"1px solid #fca5a5",
                                    background:"transparent",color:"#ef4444",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                                  Logout
                                </button>}
                                <button onClick={()=>setConfirmModal({title:"Delete @"+u.username+"?",
                                  message:"This permanently deletes the user account.",icon:"🗑️",danger:true,
                                  confirmText:"Yes, Delete",onConfirm:async()=>{
                                    try {
                                      const r = await fetch(`${API}/api/admin/users/${u.id}`,{method:"DELETE",headers:authH()});
                                      if(r.ok){flash(`✅ @${u.username} deleted`);load();}
                                      else{const d=await r.json();flash("❌ "+(d.error||"Delete failed"));}
                                    } catch(e){flash("❌ Error: "+e.message);}
                                  }})}
                                  title="Delete user"
                                  style={{padding:"4px 10px",borderRadius:6,border:"1px solid #fca5a5",
                                    background:"transparent",color:"#ef4444",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                                  Delete
                                </button>
                              </div>
                            </div>;
                          })}

                      </div>
                    </td>
                  </tr>}
                </React.Fragment>;
              })}
            </tbody>
          </table>
        </div>}

      </div>
    </div>
  );
}

// ── ANALYTICS TAB COMPONENT ───────────────────────────────────────────────────
function AnalyticsTab({T, WA_GREEN, dark, isAdmin, selectedClinic, setSelectedClinicWithRef,
  fetchAnalytics, fetchAdminOverview, adminOverview, overviewLoading,
  analyticsLoading, analytics, dateFrom, dateTo, datePreset, setDatePreset,
  setDateFrom, setDateTo, daysAgo, today, API, authHeaders, contacts, adSummary, adData=[],
  countryData=[], setCountryData}) {

  // Fetch country data when analytics loads
  React.useEffect(()=>{
    if(!analytics) return;
    const cid = selectedClinic?.clinic_id||null;
    const url = API+"/api/analytics/leads-by-country?"+(cid?"clinic_id="+cid+"&":"")+"from="+dateFrom+"&to="+dateTo;
    fetch(url,{headers:authHeaders()}).then(r=>r.ok?r.json():null).then(d=>{if(d&&setCountryData)setCountryData(d.countries||[]);}).catch(()=>{});
  },[analytics]);

  const [drillOpen, setDrillOpen] = React.useState(false);
  const [hoveredHour, setHoveredHour] = React.useState(null);
  const [drillType, setDrillType] = React.useState(null);
  const [drillData, setDrillData] = React.useState(null);
  const [drillLoading, setDrillLoading] = React.useState(false);
  const [adExpanded, setAdExpanded] = React.useState(false);
  const [drillSearch, setDrillSearch] = React.useState("");
  const [selectedBar, setSelectedBar] = React.useState(null);

  const openDrill = async (type) => {
    setDrillType(type);
    setDrillOpen(true);
    setDrillSearch("");
    setDrillData(null);
    if(type==="ads") {
      setDrillLoading(true);
      try {
        const _adsUrl = API+"/api/analytics/ads?from="+(a?.dateFrom||"")+"&to="+(a?.dateTo||"")+(selectedClinic?"&clinic_id="+selectedClinic.clinic_id:"");
        const r = await fetch(_adsUrl, {headers:authHeaders()});
        if(r.ok) setDrillData(await r.json());
      } catch {}
      setDrillLoading(false);
    } else {
      setDrillData(analytics);
    }
  };

  const closeDrill = () => { setDrillOpen(false); setDrillType(null); setDrillData(null); };

  function setPreset(p) {
    setDatePreset(p);
    const t = today();
    let from, to = t;
    if(p==="7d")  from = daysAgo(6);
    if(p==="30d") from = daysAgo(29);
    if(p==="90d") from = daysAgo(89);
    if(from) {
      setDateFrom(from);
      setDateTo(to);
      fetchAnalytics(from, to, selectedClinic?.clinic_id||null);
    }
  }

  const a = analytics;
  const totals = a?.totals || {};
  const growth = a?.growth || {};
  const totalMsgs = (totals.botMessages||0)+(totals.userMessages||0)+(totals.agentMessages||0);
  const botRate = totalMsgs>0 ? Math.round((totals.botMessages||0)/totalMsgs*100) : 0;
  const hot = totals.hot||0;
  const warm = totals.warm||0;
  const total = totals.contacts||0;
  const cold = Math.max(0, total-hot-warm);
  const done = totals.done||0;

  // Filtered contacts for drilldown
  const hotContacts = contacts.filter(c=>c.lead==="hot"&&(c.pipelineStage||"new")!=="done");
  const bookedContacts = contacts.filter(c=>(c.pipelineStage||c.pipeline_stage)==="done"||c.booking_confirmed);

  const drillTitles = {
    contacts:`All Contacts (${total})`,
    hot:`Hot Leads (${hot})`,
    bookings:`Bookings Closed (${done})`,
    bot:`Bot Performance`,
    ads:`Ad Sources`,
    day:`Day Detail`,
  };

  // KPI card — matches mockup stat-card style, keeps drilldown
  const KpiCard = ({icon,val,label,sub,color,bg,trend,type}) => (
    <div onClick={()=>openDrill(type)} className="nx-stat"
      style={{cursor:"pointer",transition:"all .15s",flex:1,minWidth:0,position:"relative"}}
      onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 4px 16px rgba(0,0,0,.08)";}}
      onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="none";}}>
      <div className="nx-stat-label">{label}</div>
      <div className="nx-stat-val" style={{color,marginBottom:4}}>{val??"-"}</div>
      <div style={{fontSize:11,color:T.textMuted}}>{sub}</div>
      {trend&&<div style={{display:"inline-flex",alignItems:"center",gap:3,fontSize:10,fontWeight:600,padding:"2px 7px",borderRadius:6,background:"#f0fdf4",color:"#15803d",marginTop:6}}>{trend}</div>}
      <div style={{position:"absolute",bottom:0,left:0,right:0,height:3,borderRadius:"0 0 12px 12px",background:color,opacity:.3}}/>
      <div style={{position:"absolute",top:10,right:10,fontSize:9,color:T.textFaint}}>↗</div>
    </div>
  );

  return (
    <div style={{maxWidth:1100,margin:"0 auto",width:"100%",position:"relative"}}>
      <style>{`
        @keyframes _fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes _slideIn{from{opacity:0;transform:translateX(30px)}to{opacity:1;transform:translateX(0)}}
        @keyframes _slideInL{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:translateX(0)}}
        @keyframes _barGrow{from{height:0}to{height:100%}}
        @keyframes _ringFill{from{stroke-dashoffset:276}to{stroke-dashoffset:var(--offset)}}
        .an1{animation:_fadeUp .4s cubic-bezier(.22,1,.36,1) both}
        .an2{animation:_fadeUp .4s .08s cubic-bezier(.22,1,.36,1) both}
        .an3{animation:_fadeUp .4s .16s cubic-bezier(.22,1,.36,1) both}
        .an4{animation:_fadeUp .4s .24s cubic-bezier(.22,1,.36,1) both}
        .an5{animation:_fadeUp .4s .32s cubic-bezier(.22,1,.36,1) both}
        .kpi-hover:hover{transform:translateY(-3px)!important}
        .bar-hover:hover{opacity:.75}
        .drill-row:hover{background:${dark?"#ffffff08":T.card2}!important}
      `}</style>

      {/* ── DRILLDOWN OVERLAY ── */}
      {drillOpen&&<>
        <div onClick={closeDrill} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.45)",zIndex:300,backdropFilter:"blur(4px)",animation:"_fadeUp .2s both"}}/>
        <div style={{position:"fixed",top:0,right:0,bottom:0,width:460,background:T.card,boxShadow:"-4px 0 40px rgba(0,0,0,.15)",zIndex:400,display:"flex",flexDirection:"column",overflow:"hidden",animation:"_slideIn .3s cubic-bezier(.22,1,.36,1) both"}}>
          {/* Drill header */}
          <div style={{padding:"18px 22px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:12,flexShrink:0,background:T.nav}}>
            <button onClick={closeDrill} style={{width:32,height:32,borderRadius:8,border:`1px solid ${T.border}`,background:T.card2,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>←</button>
            <div>
              <div style={{fontWeight:800,fontSize:15,letterSpacing:-.3}}>{drillTitles[drillType]||"Details"}</div>
              <div style={{fontSize:11,color:T.textFaint,marginTop:1}}>{a?.dateFrom} → {a?.dateTo}</div>
            </div>
          </div>
          {/* Drill body */}
          <div style={{flex:1,overflowY:"auto",padding:"18px 22px"}}>
            {drillLoading&&<div style={{textAlign:"center",padding:40,color:T.textMuted}}>Loading...</div>}

            {/* ── CONTACTS DRILL ── */}
            {drillType==="contacts"&&!drillLoading&&<>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:16}}>
                {[{v:hot,l:"Hot",c:"#ef4444"},{v:warm,l:"Warm",c:"#f59e0b"},{v:cold,l:"Cold",c:"#3b82f6"}].map(s=>(
                  <div key={s.l} style={{background:T.card2,borderRadius:10,padding:"10px",textAlign:"center"}}>
                    <div style={{fontSize:20,fontWeight:900,color:s.c}}>{s.v}</div>
                    <div style={{fontSize:10,color:T.textFaint,marginTop:2}}>{s.l}</div>
                  </div>
                ))}
              </div>
              <input value={drillSearch} onChange={e=>setDrillSearch(e.target.value)}
                placeholder="Search name or phone..."
                style={{width:"100%",padding:"8px 12px",borderRadius:8,border:`1px solid ${T.border}`,background:T.card2,color:T.text,fontSize:12,fontFamily:"inherit",outline:"none",marginBottom:12,boxSizing:"border-box"}}/>
              <div style={{fontSize:10,fontWeight:700,color:T.textFaint,textTransform:"uppercase",letterSpacing:.8,marginBottom:8}}>All Contacts</div>
              {contacts.filter(c=>{
                if(!drillSearch) return true;
                const s=drillSearch.toLowerCase();
                return c.name?.toLowerCase().includes(s)||c.phone?.includes(s);
              }).map((c,i)=>(
                <div key={c.id} className="drill-row" style={{display:"flex",alignItems:"center",gap:10,padding:"9px 6px",borderBottom:`1px solid ${T.border}40`,borderRadius:8,cursor:"pointer",transition:"background .1s",animation:`_slideInL .3s ${i*0.03}s both`}}>
                  <div style={{width:34,height:34,borderRadius:"50%",background:c.lead==="hot"?"#ef4444":c.lead==="warm"?"#f59e0b":"#3b82f6",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#fff",flexShrink:0}}>{c.avatar||"?"}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:600,color:T.text}}>{c.name||c.phone}</div>
                    <div style={{fontSize:10,color:T.textFaint,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.phone} · {c.lastDate||""}</div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3}}>
                    <span style={{fontSize:9,padding:"2px 7px",borderRadius:20,fontWeight:700,background:c.lead==="hot"?"#fef2f2":c.lead==="warm"?"#fffbeb":"#eff6ff",color:c.lead==="hot"?"#ef4444":c.lead==="warm"?"#f59e0b":"#3b82f6"}}>{c.lead==="hot"?"🔥 Hot":c.lead==="warm"?"🟡 Warm":"🔵 Cold"}</span>
                    <span style={{fontSize:10,fontWeight:700,color:c.lead==="hot"?"#ef4444":c.lead==="warm"?"#f59e0b":"#3b82f6"}}>{c.leadScore||0}/100</span>
                  </div>
                </div>
              ))}
            </>}

            {/* ── HOT LEADS DRILL ── */}
            {drillType==="hot"&&!drillLoading&&<>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:16}}>
                {[{v:hot,l:"Total Hot",c:"#ef4444"},{v:done,l:"Converted",c:"#22c55e"},{v:Math.max(0,hot-done),l:"Pending",c:"#f59e0b"}].map(s=>(
                  <div key={s.l} style={{background:T.card2,borderRadius:10,padding:"10px",textAlign:"center"}}>
                    <div style={{fontSize:20,fontWeight:900,color:s.c}}>{s.v}</div>
                    <div style={{fontSize:10,color:T.textFaint,marginTop:2}}>{s.l}</div>
                  </div>
                ))}
              </div>
              {hot>0&&<div style={{padding:"9px 12px",background:"#fef2f2",borderRadius:8,fontSize:11,color:"#dc2626",marginBottom:14,border:"1px solid #fca5a5"}}>
                🔥 <strong>{Math.max(0,hot-done)} hot leads still open</strong> — follow up before 24hr window expires
              </div>}
              <div style={{fontSize:10,fontWeight:700,color:T.textFaint,textTransform:"uppercase",letterSpacing:.8,marginBottom:8}}>Hot leads — follow up now</div>
              {hotContacts.length===0&&<div style={{textAlign:"center",padding:30,color:T.textFaint,fontSize:12}}>No hot leads right now</div>}
              {hotContacts.map((c,i)=>(
                <div key={c.id} className="drill-row" style={{display:"flex",alignItems:"center",gap:10,padding:"10px 6px",borderBottom:`1px solid ${T.border}40`,borderRadius:8,cursor:"pointer",transition:"background .1s",animation:`_slideInL .3s ${i*0.04}s both`}}>
                  <div style={{width:36,height:36,borderRadius:"50%",background:"#ef4444",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:"#fff",flexShrink:0}}>{c.avatar||"?"}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:700,color:T.text}}>{c.name||c.phone}</div>
                    <div style={{fontSize:11,color:T.textFaint,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginTop:1}}>{c.lastMessage||"No message"}</div>
                    <div style={{fontSize:10,color:T.textFaint,marginTop:1}}>{c.phone} · {c.lastDate||""}</div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
                    <span style={{fontSize:12,fontWeight:800,color:"#ef4444"}}>{c.leadScore||0}/100</span>
                    <div style={{height:4,width:50,borderRadius:2,background:T.border}}><div style={{height:4,borderRadius:2,background:"#ef4444",width:`${c.leadScore||0}%`}}/></div>
                  </div>
                </div>
              ))}
            </>}

            {/* ── BOOKINGS DRILL ── */}
            {drillType==="bookings"&&!drillLoading&&<>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
                {[{v:done,l:"Total Booked",c:"#22c55e"},{v:totals.followups||0,l:"Follow-ups Sent",c:"#f59e0b"}].map(s=>(
                  <div key={s.l} style={{background:T.card2,borderRadius:10,padding:"12px",textAlign:"center"}}>
                    <div style={{fontSize:22,fontWeight:900,color:s.c}}>{s.v}</div>
                    <div style={{fontSize:10,color:T.textFaint,marginTop:2}}>{s.l}</div>
                  </div>
                ))}
              </div>
              <div style={{fontSize:10,fontWeight:700,color:T.textFaint,textTransform:"uppercase",letterSpacing:.8,marginBottom:10}}>Confirmed bookings</div>
              {bookedContacts.length===0&&<div style={{textAlign:"center",padding:30,color:T.textFaint,fontSize:12}}>No bookings in this period</div>}
              {bookedContacts.map((c,i)=>(
                <div key={c.id} style={{background:T.card2,borderRadius:12,padding:14,marginBottom:10,border:`1px solid ${T.border}`,animation:`_slideInL .3s ${i*0.05}s both`}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                    <div style={{width:34,height:34,borderRadius:"50%",background:"#22c55e",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#fff",flexShrink:0}}>{c.avatar||"?"}</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:700,color:T.text}}>{c.name||c.phone}</div>
                      <div style={{fontSize:11,color:T.textFaint}}>{c.phone}</div>
                    </div>
                    <span style={{background:"#f0fdf4",color:"#166534",fontSize:10,padding:"3px 8px",borderRadius:20,fontWeight:700,border:"1px solid #86efac"}}>✅ Booked</span>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                    {[
                      {l:"Lead Score",v:`${c.leadScore||0}/100`},
                      {l:"Pipeline Stage",v:c.pipelineStage||"done"},
                      {l:"Assigned To",v:c.assignedTo?"Agent #"+c.assignedTo:"Unassigned"},
                      {l:"Last Contact",v:c.lastDate||"—"},
                    ].map(r=>(
                      <div key={r.l}>
                        <div style={{fontSize:10,color:T.textFaint}}>{r.l}</div>
                        <div style={{fontSize:11,fontWeight:600,color:T.text}}>{r.v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </>}

            {/* ── BOT PERFORMANCE DRILL ── */}
            {drillType==="bot"&&!drillLoading&&a&&<>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:16}}>
                {[
                  {v:totals.botMessages||0,l:"Bot Replies",c:"#00c853"},
                  {v:totals.userMessages||0,l:"Customer",c:"#6366f1"},
                  {v:totals.agentMessages||0,l:"Agent",c:"#f59e0b"},
                ].map(s=>(
                  <div key={s.l} style={{background:T.card2,borderRadius:10,padding:"10px",textAlign:"center"}}>
                    <div style={{fontSize:18,fontWeight:900,color:s.c}}>{s.v}</div>
                    <div style={{fontSize:10,color:T.textFaint,marginTop:2}}>{s.l}</div>
                  </div>
                ))}
              </div>
              {/* Donut */}
              <div style={{display:"flex",alignItems:"center",gap:20,background:T.card2,borderRadius:12,padding:16,marginBottom:16}}>
                <div style={{position:"relative",width:90,height:90,flexShrink:0}}>
                  <svg width="90" height="90" style={{transform:"rotate(-90deg)"}}>
                    <circle cx="45" cy="45" r="38" fill="none" stroke={T.border} strokeWidth="10"/>
                    <circle cx="45" cy="45" r="38" fill="none" stroke="#00c853" strokeWidth="10"
                      strokeDasharray="238.8"
                      strokeDashoffset={238.8*(1-botRate/100)}
                      strokeLinecap="round"
                      style={{transition:"stroke-dashoffset 1s ease"}}/>
                  </svg>
                  <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column"}}>
                    <div style={{fontSize:18,fontWeight:900,color:"#00c853"}}>{botRate}%</div>
                    <div style={{fontSize:9,color:T.textFaint}}>auto</div>
                  </div>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>Bot handled {botRate}% automatically</div>
                  <div style={{fontSize:11,color:T.textFaint,lineHeight:1.6}}>Saved approx <strong style={{color:"#00c853"}}>{Math.round((totals.botMessages||0)*2/60)} hours</strong> of manual replies this period.</div>
                </div>
              </div>
              {/* Daily breakdown */}
              <div style={{fontSize:10,fontWeight:700,color:T.textFaint,textTransform:"uppercase",letterSpacing:.8,marginBottom:10}}>Daily message breakdown</div>
              {(a.messagesPerDay||[]).slice(-14).map((d,i)=>{
                const tot = (d.bot||0)+(d.user||0)+(d.agent||0);
                const bPct = tot>0?Math.round((d.bot||0)/tot*100):0;
                return (
                  <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:7,animation:`_slideInL .3s ${i*0.02}s both`}}>
                    <div style={{fontSize:10,color:T.textFaint,width:42,flexShrink:0}}>{d.date?.slice(5)}</div>
                    <div style={{flex:1,height:6,borderRadius:3,background:T.border,overflow:"hidden"}}>
                      <div style={{height:6,borderRadius:3,background:"#00c853",width:`${bPct}%`,transition:"width .6s"}}/>
                    </div>
                    <div style={{fontSize:10,color:"#00c853",fontWeight:600,width:32,textAlign:"right"}}>{bPct}%</div>
                    <div style={{fontSize:10,color:T.textFaint,width:40,textAlign:"right"}}>{tot} msgs</div>
                  </div>
                );
              })}
            </>}

            {/* ── ADS DRILL ── */}
            {drillType==="ads"&&!drillLoading&&<>
              {(!drillData||drillData.length===0)&&<div style={{textAlign:"center",padding:40,color:T.textFaint}}>
                <div style={{fontSize:32,marginBottom:8}}>📢</div>
                <div style={{fontSize:13,fontWeight:600,marginBottom:4}}>No ad data yet</div>
                <div style={{fontSize:11}}>Ad clicks appear when customers message from Facebook/Instagram ads</div>
              </div>}
              {drillData&&drillData.length>0&&<>
                {/* Summary row */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:14}}>
                  {[
                    {v:drillData.length,l:"Campaigns",c:"#7c3aed"},
                    {v:drillData.reduce((s,a)=>s+(a.total_clicks||a.total_leads||0),0),l:"Total Clicks",c:"#2563eb"},
                    {v:drillData.reduce((s,a)=>s+(a.hot_leads||0),0),l:"Hot Leads",c:"#e11d48"},
                    {v:drillData.reduce((s,a)=>s+(a.bookings||0),0),l:"Bookings",c:"#16a34a"},
                  ].map(s=>(
                    <div key={s.l} style={{background:T.card2,borderRadius:10,padding:"10px 6px",textAlign:"center",border:`1px solid ${T.border}`}}>
                      <div style={{fontSize:18,fontWeight:900,color:s.c,lineHeight:1}}>{s.v}</div>
                      <div style={{fontSize:9,color:T.textFaint,marginTop:3}}>{s.l}</div>
                    </div>
                  ))}
                </div>
                {/* Best performer */}
                {(()=>{
                  const byBook=[...drillData].filter(a=>a.bookings>0).sort((a,b)=>b.bookings-a.bookings)[0];
                  const byConv=[...drillData].filter(a=>(a.total_clicks||a.total_leads||0)>0).sort((a,b)=>b.conversion_rate-a.conversion_rate)[0];
                  const byHot=[...drillData].filter(a=>(a.total_clicks||a.total_leads||0)>0).sort((a,b)=>{
                    const ta=a.total_clicks||a.total_leads||0; const tb=b.total_clicks||b.total_leads||0;
                    return (tb>0?(b.hot_leads||0)/tb:0)-(ta>0?(a.hot_leads||0)/ta:0);
                  })[0];
                  return <div style={{background:`${WA_GREEN}10`,borderRadius:10,padding:"10px 12px",marginBottom:14,border:"1px solid #ddd6fe",fontSize:11,color:"#6d28d9",lineHeight:1.7}}>
                    {byBook&&<div style={{display:"flex",alignItems:"flex-start",gap:6,cursor:"help"}} title={`Most bookings winner: ${byBook.bookings} patients confirmed their booking after coming from this ad. This is your best ad for closing deals — the most patients actually committed to a consultation.`}>
                      <span>🏆</span>
                      <span><strong>{byBook.ad_headline}</strong> — most bookings ({byBook.bookings}) <span style={{fontSize:10,color:T.textFaint}}>ⓘ</span></span>
                    </div>}
                    {byConv&&<div style={{display:"flex",alignItems:"flex-start",gap:6,cursor:"help"}} title={`Best conversion winner: ${byConv.conversion_rate}% of people who messaged from this ad ended up booking. Meaning if 10 people messaged, ${Math.round(byConv.conversion_rate/10)} booked. High conversion = ad attracts serious patients who are ready to commit.`}>
                      <span>📈</span>
                      <span>Best conversion: <strong>{byConv.ad_headline}</strong> ({byConv.conversion_rate}%) <span style={{fontSize:10,color:T.textFaint}}>ⓘ</span></span>
                    </div>}
                    {byHot&&<div style={{display:"flex",alignItems:"flex-start",gap:6,cursor:"help"}} title={`Best hot rate winner: ${(byHot.total_clicks||byHot.total_leads||0)>0?Math.round((byHot.hot_leads||0)/(byHot.total_clicks||byHot.total_leads||1)*100):0}% of people from this ad became hot leads — meaning they showed strong intent to book (asked for dates, prices, ready to come in). High hot rate = ad is attracting the right audience with real health needs.`}>
                      <span>🔥</span>
                      <span>Best hot rate: <strong>{byHot.ad_headline}</strong> ({(byHot.total_clicks||byHot.total_leads||0)>0?Math.round((byHot.hot_leads||0)/(byHot.total_clicks||byHot.total_leads||1)*100):0}%) <span style={{fontSize:10,color:T.textFaint}}>ⓘ</span></span>
                    </div>}
                  </div>;
                })()}
                <div style={{fontSize:10,fontWeight:700,color:T.textFaint,textTransform:"uppercase",letterSpacing:.8,marginBottom:10}}>All Campaigns</div>
                {drillData.map((ad,i)=>{
                  const total = ad.total_clicks||ad.total_leads||0;
                  const firstDate = ad.first_seen||ad.first_click;
                  const lastDate = ad.last_seen||ad.last_click;
                  const daysActive = firstDate&&lastDate ? Math.max(1,Math.round((new Date(lastDate)-new Date(firstDate))/(1000*60*60*24))+1) : 30;
                  const dailyAvg = total>0&&daysActive>0 ? (total/daysActive).toFixed(1) : "0";
                  const hotRate = total>0 ? Math.round((ad.hot_leads||0)/total*100) : 0;
                  const qualityScore = total>0 ? Math.round(((ad.hot_leads||0)*3+(ad.warm_leads||0)*1)/total*10) : 0;
                  const maxClicks = drillData.reduce((m,a)=>Math.max(m,a.total_clicks||a.total_leads||0),1);
                  const convColor = ad.conversion_rate>=8?"#16a34a":ad.conversion_rate>=4?"#d97706":"#e11d48";
                  const convBg = ad.conversion_rate>=8?"#f0fdf4":ad.conversion_rate>=4?"#fffbeb":"#fef2f2";
                  return (
                    <div key={i} style={{background:T.card2,borderRadius:14,marginBottom:12,border:`1px solid ${T.border}`,overflow:"hidden",animation:`_slideInL .3s ${i*0.04}s both`,transition:"all .15s"}}
                      onMouseEnter={e=>{e.currentTarget.style.borderColor=WA_GREEN;e.currentTarget.style.transform="translateX(3px)";}}
                      onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.transform="none";}}>
                      {/* Header */}
                      <div style={{padding:"12px 14px 10px",borderBottom:`1px solid ${T.border}`}}>
                        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8,marginBottom:8}}>
                          <div style={{flex:1}}>
                            <div style={{fontSize:13,fontWeight:700,color:T.text,marginBottom:4,lineHeight:1.4}}>{ad.ad_headline||"Organic / Direct"}</div>
                            <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}}>
                              <span style={{fontSize:9,padding:"2px 7px",borderRadius:20,background:"#eff6ff",color:"#2563eb",border:"1px solid #bfdbfe",fontWeight:600}}>
                                {ad.ad_source_type==="ad"?"📘 Facebook":ad.ad_source_type==="instagram"?"📸 Instagram":ad.ad_source_type||"📢 Ad"}
                              </span>
                              {ad.ad_url&&<a href={ad.ad_url} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()}
                                style={{fontSize:9,color:WA_GREEN,fontWeight:600,textDecoration:"none"}}>🔗 View Ad ↗</a>}
                            </div>
                          </div>
                          <span style={{fontSize:11,padding:"3px 10px",borderRadius:20,fontWeight:700,flexShrink:0,background:convBg,color:convColor,border:`1px solid ${convColor}25`}}>
                            {ad.conversion_rate||0}% booked
                          </span>
                        </div>
                        {/* Click volume bar */}
                        <div style={{height:5,borderRadius:3,background:T.border,overflow:"hidden",marginBottom:4}}>
                          <div style={{height:5,borderRadius:3,background:"linear-gradient(90deg,#6c63ff,#8b5cf6)",width:`${maxClicks>0?Math.round((total/maxClicks)*100):0}%`,transition:"width .8s"}}/>
                        </div>
                      </div>
                      {/* Stats */}
                      <div style={{padding:"10px 14px"}}>
                        {/* 6 stat boxes */}
                        <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:5,marginBottom:10}}>
                          {[
                            {v:total,l:"Clicks",c:WA_GREEN,tip:"People who clicked this ad AND sent a WhatsApp message. This is real engagement — not just impressions."},
                            {v:ad.hot_leads||0,l:"🔥 Hot",c:"#e11d48",tip:"Leads marked Hot — showed strong booking intent (asked for dates, prices, ready to come in)."},
                            {v:ad.warm_leads||0,l:"🟡 Warm",c:"#d97706",tip:"Leads marked Warm — showed genuine interest but not ready to book yet."},
                            {v:ad.cold_leads||0,l:"🔵 Cold",c:"#3b82f6",tip:"Leads marked Cold — just browsing, no specific health concern mentioned."},
                            {v:ad.bookings||0,l:"✅ Booked",c:"#16a34a",tip:"Confirmed bookings from this ad — patient gave their name and phone number to book."},
                            {v:ad.needed_agent||0,l:"👤 Agent",c:"#7c3aed",tip:"Leads where a human agent had to step in. High number means bot needs improvement for this ad audience."},
                          ].map(s=>(
                            <div key={s.l} title={s.tip}
                              style={{textAlign:"center",background:T.card,borderRadius:8,padding:"6px 2px",border:`1px solid ${T.border}`,cursor:"help",transition:"all .15s"}}
                              onMouseEnter={e=>{e.currentTarget.style.borderColor=s.c;e.currentTarget.style.boxShadow=`0 2px 8px ${s.c}20`;}}
                              onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.boxShadow="none";}}>
                              <div style={{fontSize:13,fontWeight:800,color:s.c,lineHeight:1}}>{s.v}</div>
                              <div style={{fontSize:8,color:T.textFaint,marginTop:2,lineHeight:1.2}}>{s.l}</div>
                            </div>
                          ))}
                        </div>
                        {/* Key metrics row */}
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:6,marginBottom:10}}>
                          {[
                            {icon:"🔥",label:"Hot Rate",val:hotRate+"%",color:hotRate>=15?"#e11d48":hotRate>=8?"#d97706":T.textMuted,
                              tip:`${hotRate}% of people who messaged from this ad became hot leads. Target: 15%+. Low = ad attracting wrong audience or bot not qualifying leads well.`},
                            {icon:"📊",label:"Quality Score",val:qualityScore+"/10",color:qualityScore>=6?"#16a34a":qualityScore>=3?"#d97706":"#e11d48",
                              tip:`Quality score based on hot+warm leads ratio. Score = (hot×3 + warm×1) ÷ total × 10. 6+/10 is good, below 3 means mostly cold leads.`},
                            {icon:"📈",label:"Daily Avg",val:dailyAvg+" leads",color:WA_GREEN,
                              tip:`Average leads per day this ad was active. Total ${total} clicks ÷ ${daysActive} active days = ${dailyAvg} leads/day.`},
                            {icon:"📅",label:"Active Days",val:daysActive+" days",color:T.textMuted,
                              tip:`How many days this ad has been running based on first and last lead received.`},
                          ].map(m=>(
                            <div key={m.label} title={m.tip}
                              style={{background:T.card,borderRadius:8,padding:"7px 6px",border:`1px solid ${T.border}`,textAlign:"center",cursor:"help",transition:"all .15s"}}
                              onMouseEnter={e=>{e.currentTarget.style.background=T.card2;e.currentTarget.style.borderColor=T.border2;}}
                              onMouseLeave={e=>{e.currentTarget.style.background=T.card;e.currentTarget.style.borderColor=T.border;}}>
                              <div style={{fontSize:9,color:T.textFaint,marginBottom:2}}>{m.icon} {m.label}</div>
                              <div style={{fontSize:12,fontWeight:700,color:m.color}}>{m.val}</div>
                            </div>
                          ))}
                        </div>
                        {/* Dates */}
                        {ad.first_click&&<div style={{fontSize:10,color:T.textFaint,marginBottom:8}}>
                          📅 Active: {ad.first_click} → {ad.last_click}
                        </div>}
                        {/* Lead quality bar */}
                        {total>0&&<>
                          <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:T.textFaint,marginBottom:3}}>
                            <span>Lead quality breakdown</span>
                            <span>{hotRate}% hot · {total>0?Math.round((ad.warm_leads||0)/total*100):0}% warm · {total>0?Math.round((ad.cold_leads||0)/total*100):0}% cold</span>
                          </div>
                          <div style={{height:7,borderRadius:4,overflow:"hidden",background:T.border,display:"flex",marginBottom:8}}>
                            <div style={{height:7,background:"#e11d48",width:`${Math.round((ad.hot_leads||0)/total*100)}%`,transition:"width .8s"}}/>
                            <div style={{height:7,background:"#d97706",width:`${Math.round((ad.warm_leads||0)/total*100)}%`,transition:"width .8s"}}/>
                            <div style={{height:7,background:"#3b82f6",width:`${Math.round((ad.cold_leads||0)/total*100)}%`,transition:"width .8s"}}/>
                          </div>
                        </>}
                        {/* Warnings */}
                        {ad.agent_rate>30&&<div style={{fontSize:10,color:"#d97706",background:"#fffbeb",borderRadius:6,padding:"4px 8px",border:"1px solid #fde68a",marginBottom:4}}>
                          ⚠️ {ad.agent_rate}% of leads needed human agent — consider improving bot KB for this ad audience
                        </div>}
                        {hotRate<3&&total>10&&<div style={{fontSize:10,color:"#e11d48",background:"#fff1f3",borderRadius:6,padding:"4px 8px",border:"1px solid #fecdd3"}}>
                          📉 Low hot rate — ad may be attracting wrong audience or bot needs better follow-up
                        </div>}
                      </div>
                    </div>
                  );
                })}
              </>}
            </>}

            {/* ── DAY DRILL ── */}
            {drillType==="day"&&drillData&&<>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:16}}>
                {[
                  {v:drillData.bot||0,l:"Bot msgs",c:"#00c853"},
                  {v:drillData.user||0,l:"Customer",c:"#6366f1"},
                  {v:drillData.agent||0,l:"Agent",c:"#f59e0b"},
                ].map(s=>(
                  <div key={s.l} style={{background:T.card2,borderRadius:10,padding:"10px",textAlign:"center"}}>
                    <div style={{fontSize:20,fontWeight:900,color:s.c}}>{s.v}</div>
                    <div style={{fontSize:10,color:T.textFaint,marginTop:2}}>{s.l}</div>
                  </div>
                ))}
              </div>
              <div style={{fontSize:10,fontWeight:700,color:T.textFaint,textTransform:"uppercase",letterSpacing:.8,marginBottom:10}}>Conversations active that day</div>
              {contacts.filter(c=>c.lastDate===drillData.date).slice(0,20).map((c,i)=>(
                <div key={c.id} className="drill-row" style={{display:"flex",alignItems:"center",gap:10,padding:"8px 6px",borderBottom:`1px solid ${T.border}40`,borderRadius:8,cursor:"pointer",transition:"background .1s",animation:`_slideInL .3s ${i*0.03}s both`}}>
                  <div style={{width:32,height:32,borderRadius:"50%",background:c.lead==="hot"?"#ef4444":c.lead==="warm"?"#f59e0b":"#3b82f6",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#fff",flexShrink:0}}>{c.avatar||"?"}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:600}}>{c.name||c.phone}</div>
                    <div style={{fontSize:10,color:T.textFaint,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.lastMessage||""}</div>
                  </div>
                  <span style={{fontSize:9,padding:"2px 7px",borderRadius:20,fontWeight:700,background:c.lead==="hot"?"#fef2f2":c.lead==="warm"?"#fffbeb":"#eff6ff",color:c.lead==="hot"?"#ef4444":c.lead==="warm"?"#f59e0b":"#3b82f6"}}>{c.lead==="hot"?"🔥":c.lead==="warm"?"🟡":"🔵"}</span>
                </div>
              ))}
            </>}
          </div>
        </div>
      </>}

      {/* ── HEADER — matches mockup ── */}
      <div className="nx-page-header an1" style={{marginBottom:20,borderRadius:12,border:`1px solid ${T.border}`}}>
        <i className="ti ti-chart-bar" style={{fontSize:20,color:WA_GREEN}}/>
        <div>
          <div className="nx-page-title">Analytics</div>
          <div className="nx-page-sub">{selectedClinic?selectedClinic.company_name||selectedClinic.username:dateFrom+" → "+dateTo}</div>
        </div>
        <button onClick={()=>fetchAnalytics(dateFrom,dateTo,selectedClinic?.id||selectedClinic?.clinic_id||null)}
          style={{marginLeft:"auto",padding:"6px 14px",borderRadius:8,border:`1px solid ${T.border}`,
            background:"transparent",color:T.text,fontSize:12,cursor:"pointer",fontFamily:"inherit",
            display:"flex",alignItems:"center",gap:6}}>
          <i className="ti ti-refresh" style={{fontSize:14}}/> Refresh
        </button>
        {isAdmin&&adminOverview.length>0&&<div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center",marginLeft:12}}>
          <button onClick={()=>{setSelectedClinicWithRef(null);fetchAnalytics(dateFrom,dateTo,null);fetchAdminOverview();}}
            style={{padding:"3px 10px",borderRadius:20,border:`1px solid ${!selectedClinic?WA_GREEN:T.border}`,background:!selectedClinic?`${WA_GREEN}15`:"transparent",color:!selectedClinic?WA_GREEN:T.textMuted,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
            All
          </button>
          {adminOverview.map(c=>{
            const sel = selectedClinic?.clinic_id===c.clinic_id||selectedClinic?.id===c.id;
            return <div key={c.id} onClick={()=>{setSelectedClinicWithRef(c);fetchAnalytics(dateFrom,dateTo,c.id||c.clinic_id);}}
              style={{display:"flex",alignItems:"center",gap:5,padding:"3px 10px",borderRadius:20,cursor:"pointer",
                border:`1px solid ${sel?WA_GREEN:T.border}`,background:sel?`${WA_GREEN}15`:"transparent",
                opacity:(c.active===false||c.active===0)?0.5:1}}>
              <div style={{width:14,height:14,borderRadius:3,overflow:"hidden",background:`${WA_GREEN}15`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                {c.logo_url?<img src={c.logo_url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:<span style={{fontSize:9}}>🏢</span>}
              </div>
              <span style={{fontSize:11,fontWeight:700,color:sel?WA_GREEN:T.text}}>{c.company_name||c.username}</span>
            </div>;
          })}
        </div>}

        <div style={{marginLeft:"auto",display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
          {[{id:"7d",label:"7 days"},{id:"30d",label:"30 days"},{id:"90d",label:"90 days"},{id:"custom",label:"Custom"}].map(p=>(
            <button key={p.id} onClick={()=>setPreset(p.id)}
              className={`nx-filter${datePreset===p.id?" active":""}`}>
              {p.label}
            </button>
          ))}
          {datePreset==="custom"&&<>
            <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:8,padding:"5px 8px",color:T.text,fontSize:12,outline:"none"}}/>
            <span style={{color:T.textMuted,fontSize:12}}>→</span>
            <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:8,padding:"5px 8px",color:T.text,fontSize:12,outline:"none"}}/>
            <button onClick={()=>fetchAnalytics(dateFrom,dateTo,selectedClinic?.clinic_id||null)} className="nx-btn primary" style={{fontSize:12}}>Apply</button>
          </>}
        </div>
      </div>

      {/* Admin all-clients view */}
      {isAdmin&&!selectedClinic&&<>
        <div style={{fontWeight:700,fontSize:15,marginBottom:12}} className="an2">All Clients Performance</div>
        {overviewLoading&&<div style={{textAlign:"center",padding:40,color:T.textMuted}}>Loading...</div>}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:12,marginBottom:20}}>
          {adminOverview.map((c,i)=>(
            <div key={c.id} className="cc" style={{padding:16,cursor:"pointer",animation:`_fadeUp .4s ${i*0.05}s both`}}
              onClick={()=>{setSelectedClinicWithRef(c);fetchAnalytics(dateFrom,dateTo,c.id||c.clinic_id);}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                <div style={{width:36,height:36,borderRadius:10,overflow:"hidden",background:`${WA_GREEN}15`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  {c.logo_url?<img src={c.logo_url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:<span style={{fontSize:18}}>🏢</span>}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.company_name||c.username}</div>
                  <div style={{fontSize:10,color:T.textMuted}}>{c.industry||"—"}</div>
                </div>
                <span style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:6,background:c.active?"#dcfce7":"#fee2e2",color:c.active?"#166534":"#dc2626"}}>{c.active?"Live":"Off"}</span>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {[
                  {icon:"💬",label:"Messages",value:c.total_messages||0,color:"#3b82f6"},
                  {icon:"🎯",label:"Leads",value:(c.hot_leads||0)+(c.warm_leads||0),color:"#f59e0b"},
                  {icon:"🤖",label:"Bot %",value:`${c.bot_performance||0}%`,color:WA_GREEN},
                  {icon:"✅",label:"Resolved",value:c.resolved_convos||0,color:"#8b5cf6"},
                ].map(s=>(
                  <div key={s.label} style={{background:T.card2,borderRadius:8,padding:"8px 10px"}}>
                    <div style={{fontSize:10,color:T.textMuted,marginBottom:2}}>{s.icon} {s.label}</div>
                    <div style={{fontWeight:800,fontSize:16,color:s.color}}>{s.value}</div>
                  </div>
                ))}
              </div>
              <div style={{marginTop:8,fontSize:11,color:WA_GREEN,fontWeight:600,textAlign:"right"}}>View details →</div>
            </div>
          ))}
        </div>
      </>}

      {/* Selected client / client user view */}
      {(!isAdmin||selectedClinic)&&<>

        {/* Selected client header */}


        {analyticsLoading&&<div style={{textAlign:"center",padding:60,color:T.textFaint}}>
          <div style={{width:36,height:36,borderRadius:"50%",border:`3px solid ${WA_GREEN}20`,borderTop:`3px solid ${WA_GREEN}`,animation:"spin .8s linear infinite",margin:"0 auto 12px"}}/>
          Loading analytics...
        </div>}

        {!analyticsLoading&&a&&<>
          {/* HERO BANNER */}
          <div className="an2" style={{background:`linear-gradient(135deg,#0d1117 0%,#1a2332 50%,#0d1b2a 100%)`,borderRadius:18,padding:"24px 28px",marginBottom:20,color:"#fff",position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",top:-30,right:-30,width:180,height:180,borderRadius:"50%",background:"radial-gradient(circle,rgba(0,200,83,.1),transparent 70%)",pointerEvents:"none"}}/>
            <div style={{display:"flex",alignItems:"center",position:"relative",zIndex:1,flexWrap:"wrap",gap:16}}>
              <div style={{flex:1}}>
                <div style={{fontSize:11,color:"rgba(255,255,255,.4)",letterSpacing:1.2,textTransform:"uppercase",marginBottom:8}}>{a.dateFrom} → {a.dateTo}</div>
                <div style={{fontSize:30,fontWeight:900,letterSpacing:-1,lineHeight:1}}>{growth.thisperiod||0} <span style={{fontSize:15,fontWeight:400,color:"rgba(255,255,255,.5)"}}>new conversations</span></div>
                <div style={{display:"flex",alignItems:"center",gap:8,marginTop:10,flexWrap:"wrap"}}>
                  {growth.pct!==0&&growth.prevperiod>50&&<div style={{background:growth.pct>0?"rgba(0,200,83,.2)":"rgba(239,68,68,.2)",color:growth.pct>0?"#4ade80":"#f87171",padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:600}}>
                    {growth.pct>0?"▲":"▼"} {Math.abs(growth.pct)}% vs previous period
                  </div>}
                  {growth.prevperiod>0&&growth.prevperiod<=50&&<div style={{background:"rgba(99,102,241,.2)",color:"#a5b4fc",padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:600}}>
                    🚀 Growing fast
                  </div>}
                  <div style={{fontSize:12,color:"rgba(255,255,255,.55)"}}>Bot handled <strong style={{color:"#4ade80"}}>{totals.botMessages||0}</strong> msgs</div>
                </div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:11,color:"rgba(255,255,255,.4)",textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Conversion Rate</div>
                <div style={{fontSize:44,fontWeight:900,color:"#00c853",lineHeight:1}}>{growth.conversionRate||0}%</div>
                <div style={{fontSize:11,color:"rgba(255,255,255,.4)",marginTop:4}}>Contacts → Hot Leads</div>
              </div>
            </div>
          </div>

          {/* KPI CARDS — matches mockup stats-grid */}
          <div className="an3" style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,marginBottom:20}}>
            <KpiCard icon="👥" val={total} label="Total Contacts" sub="Active in period" color="#2563eb" bg="#eff6ff" trend={`▲ ${growth.pct||0}%`} type="contacts"/>
            <KpiCard icon="🤖" val={`${botRate}%`} label="Bot Automation" sub={`${totals.botMessages||0} msgs in period`} color={WA_GREEN} bg="#f0fdf4" trend={`${Math.round((totals.botMessages||0)*2/60)}hrs saved`} type="bot"/>
            <KpiCard icon="🔥" val={hot} label="Hot Leads" sub="Active in period" color="#ef4444" bg="#fef2f2" trend={`${warm} warm`} type="hot"/>
            <KpiCard icon="✅" val={done} label="Bookings" sub="In selected period" color="#22c55e" bg="#f0fdf4" trend="Date filtered" type="bookings"/>
            <KpiCard icon="📢" val={adSummary.count||0} label="Ad Sources" sub={`${adSummary.totalClicks||0} clicks`} color="#7c3aed" bg="#f5f3ff" trend={`${adSummary.totalBookings||0} booked`} type="ads"/>
          </div>

          {/* AD PERFORMANCE BREAKDOWN — all time, no date filter */}
          {adData.length>0&&<div style={{background:T.card,borderRadius:12,border:`1px solid ${T.border}`,padding:20,marginBottom:20}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer"}}
              onClick={()=>setAdExpanded(p=>!p)}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <i className="ti ti-ad" style={{fontSize:16,color:"#7c3aed"}}/>
                <div>
                  <div style={{fontWeight:700,fontSize:13,color:T.text}}>Ad Performance</div>
                  <div style={{fontSize:11,color:T.textMuted}}>{dateFrom} → {dateTo} · {adData.length} ads · click to {adExpanded?"collapse":"expand"}</div>
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:16}}>
                {[
                  {label:"Total Leads",val:adData.reduce((s,a)=>s+(a.total_clicks||0),0),color:"#7c3aed"},
                  {label:"Hot Leads",val:adData.reduce((s,a)=>s+(a.hot_leads||0),0),color:"#ef4444"},
                  {label:"Converted",val:adData.reduce((s,a)=>s+(a.bookings||0),0),color:WA_GREEN},
                ].map(s=>(
                  <div key={s.label} style={{textAlign:"center"}}>
                    <div style={{fontSize:18,fontWeight:800,color:s.color}}>{s.val}</div>
                    <div style={{fontSize:10,color:T.textMuted}}>{s.label}</div>
                  </div>
                ))}
                <i className={`ti ti-chevron-${adExpanded?"up":"down"}`} style={{fontSize:16,color:T.textMuted,marginLeft:8}}/>
              </div>
            </div>
            {adExpanded&&<div style={{marginTop:16,display:"flex",flexDirection:"column",gap:10}}>
              {[...adData].sort((a,b)=>(b.total_clicks||0)-(a.total_clicks||0)).map((ad,i)=>{
                const clicks = ad.total_clicks||0;
                const hot = ad.hot_leads||0;
                const booked = ad.bookings||0;
                const convRate = clicks>0?Math.round(booked/clicks*100):0;
                const hotRate = clicks>0?Math.round(hot/clicks*100):0;
                const maxClicks = adData.reduce((m,a)=>Math.max(m,a.total_clicks||0),1);
                return <div key={i} style={{padding:"12px 14px",borderRadius:10,background:T.card2,border:`1px solid ${T.border}`}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:700,color:T.text,marginBottom:2}}>{ad.ad_headline}</div>
                      <span style={{fontSize:10,padding:"2px 7px",borderRadius:20,fontWeight:600,
                        background:ad.ad_source_type==="ad"?"#dbeafe":"#fce7f3",
                        color:ad.ad_source_type==="ad"?"#1d4ed8":"#9d174d"}}>
                        {ad.ad_source_type==="ad"?"📘 Facebook":"📸 Instagram"}
                      </span>
                    </div>
                    <div style={{display:"flex",gap:16,flexShrink:0,marginLeft:12}}>
                      <div style={{textAlign:"center"}}>
                        <div style={{fontSize:16,fontWeight:800,color:"#7c3aed"}}>{clicks}</div>
                        <div style={{fontSize:10,color:T.textMuted}}>Leads</div>
                      </div>
                      <div style={{textAlign:"center"}}>
                        <div style={{fontSize:16,fontWeight:800,color:"#ef4444"}}>{hot}</div>
                        <div style={{fontSize:10,color:T.textMuted}}>Hot ({hotRate}%)</div>
                      </div>
                      <div style={{textAlign:"center"}}>
                        <div style={{fontSize:16,fontWeight:800,color:WA_GREEN}}>{booked}</div>
                        <div style={{fontSize:10,color:T.textMuted}}>Converted ({convRate}%)</div>
                      </div>
                    </div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{flex:1,height:5,borderRadius:3,background:T.border,overflow:"hidden"}}>
                      <div style={{height:5,borderRadius:3,background:"#7c3aed",
                        width:`${Math.round(clicks/maxClicks*100)}%`,transition:"width .5s"}}/>
                    </div>
                    <span style={{fontSize:10,color:T.textMuted,flexShrink:0}}>{Math.round(clicks/maxClicks*100)}% reach</span>
                  </div>
                </div>;
              })}
            </div>}
          </div>}

          {/* DAILY CHART + LEAD BREAKDOWN — matches mockup 2fr 1fr grid */}
          <div className="an4" style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:14,marginBottom:20}}>
            {/* Daily bar chart */}
            <div style={{background:T.card,borderRadius:12,padding:20,border:`1px solid ${T.border}`}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <i className="ti ti-chart-line" style={{fontSize:16,color:WA_GREEN}}/>
                  <div style={{fontWeight:700,fontSize:13,color:T.text}}>Messages per day</div>
                </div>
                <div style={{display:"flex",gap:12}}>
                  {[{c:WA_GREEN,l:"Bot"},{c:"#6366f1",l:"Customer"},{c:"#f59e0b",l:"Agent"}].map(l=>(
                    <div key={l.l} style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:T.textMuted}}>
                      <div style={{width:8,height:8,borderRadius:"50%",background:l.c}}/>
                      {l.l}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{position:"relative",paddingLeft:36,paddingBottom:4}}>
                {/* Y axis labels */}
                {(()=>{
                  const days=(a.messagesPerDay||[]).slice(-21);
                  const maxV=Math.max(...days.map(x=>(x.bot||0)+(x.user||0)+(x.agent||0)),1);
                  const ticks=[0,Math.round(maxV*0.5),maxV];
                  return <div style={{position:"absolute",left:0,top:0,bottom:20,display:"flex",flexDirection:"column-reverse",justifyContent:"space-between",width:32}}>
                    {ticks.map((t,i)=><div key={i} style={{fontSize:9,color:T.textFaint,textAlign:"right",lineHeight:1}}>{t}</div>)}
                  </div>;
                })()}
                {/* Y axis grid lines */}
                {(()=>{
                  return <div style={{position:"absolute",left:36,right:0,top:0,bottom:20,pointerEvents:"none"}}>
                    {[0,50,100].map(pct=>(
                      <div key={pct} style={{position:"absolute",bottom:`${pct}%`,left:0,right:0,borderTop:`1px dashed ${T.border}`,opacity:.4}}/>
                    ))}
                  </div>;
                })()}
                {/* Bars — slimmer with gaps */}
                <div style={{display:"flex",alignItems:"flex-end",gap:2,height:110,borderBottom:`1px solid ${T.border}`,paddingBottom:2}}>
                  {(a.messagesPerDay||[]).slice(-21).map((d,i)=>{
                    const tot=(d.bot||0)+(d.user||0)+(d.agent||0);
                    const maxV=Math.max(...(a.messagesPerDay||[]).slice(-21).map(x=>(x.bot||0)+(x.user||0)+(x.agent||0)),1);
                    const pct=tot/maxV;
                    const botH=Math.round(((d.bot||0)/Math.max(tot,1))*pct*106);
                    const userH=Math.round(((d.user||0)/Math.max(tot,1))*pct*106);
                    const agentH=Math.round(((d.agent||0)/Math.max(tot,1))*pct*106);
                    const isSelected=selectedBar===i;
                    return (
                      <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",height:"100%",cursor:"pointer",position:"relative",maxWidth:18}}
                        onClick={()=>{setSelectedBar(i);setDrillType("day");setDrillData(d);setDrillOpen(true);}}
                        title={`${d.date}: ${tot} msgs`}>
                        {isSelected&&tot>0&&<div style={{position:"absolute",top:-14,fontSize:8,color:WA_GREEN,fontWeight:700,whiteSpace:"nowrap"}}>{tot}</div>}
                        <div style={{flex:1,width:"70%",display:"flex",flexDirection:"column",justifyContent:"flex-end",gap:"1px",
                          opacity:isSelected?1:.75,transition:"all .15s",
                          filter:isSelected?"drop-shadow(0 1px 3px rgba(0,0,0,.2))":"none"}}>
                          {agentH>0&&<div style={{width:"100%",height:`${agentH}px`,background:"#f59e0b",borderRadius:"2px 2px 0 0",minHeight:1}}/>}
                          {userH>0&&<div style={{width:"100%",height:`${userH}px`,background:"#818cf8",minHeight:1}}/>}
                          {botH>0&&<div style={{width:"100%",height:`${botH}px`,background:isSelected?WA_GREEN:`${WA_GREEN}cc`,borderRadius:agentH===0&&userH===0?"2px 2px 0 0":"0",minHeight:1}}/>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* X axis date labels */}
                <div style={{display:"flex",gap:2,marginTop:3}}>
                  {(a.messagesPerDay||[]).slice(-21).map((d,i)=>{
                    const days=(a.messagesPerDay||[]).slice(-21);
                    const show=days.length<=7||(i%(days.length<=14?2:3)===0);
                    return <div key={i} style={{flex:1,maxWidth:18,textAlign:"center",fontSize:7,color:selectedBar===i?WA_GREEN:T.textFaint,fontWeight:selectedBar===i?700:400,overflow:"hidden",whiteSpace:"nowrap"}}>
                      {show?(d.date?.slice(5)||""):""}
                    </div>;
                  })}
                </div>
              </div>

              {/* INTERACTIVE DETAILS BELOW CHART */}
              {selectedBar!==null&&(a.messagesPerDay||[]).slice(-21)[selectedBar]&&(()=>{
                const d=(a.messagesPerDay||[]).slice(-21)[selectedBar];
                const tot=(d.bot||0)+(d.user||0)+(d.agent||0);
                return <div style={{marginTop:10,padding:"10px 14px",background:T.card2,borderRadius:10,border:`1px solid ${T.border}`,display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
                  <div style={{fontSize:11,fontWeight:700,color:T.text,minWidth:60}}>{d.date}</div>
                  <div style={{display:"flex",gap:10,flex:1,flexWrap:"wrap"}}>
                    {[{l:"Total",v:tot,c:T.text},{l:"Bot",v:d.bot||0,c:WA_GREEN},{l:"Customer",v:d.user||0,c:"#818cf8"},{l:"Agent",v:d.agent||0,c:"#f59e0b"}].map(s=>(
                      <div key={s.l} style={{display:"flex",alignItems:"center",gap:4,fontSize:11}}>
                        <div style={{width:7,height:7,borderRadius:"50%",background:s.c,flexShrink:0}}/>
                        <span style={{color:T.textMuted}}>{s.l}:</span>
                        <strong style={{color:s.c}}>{s.v}</strong>
                      </div>
                    ))}
                    {tot>0&&<div style={{fontSize:10,color:T.textMuted,marginLeft:"auto"}}>Bot rate: <strong style={{color:WA_GREEN}}>{Math.round((d.bot||0)/tot*100)}%</strong></div>}
                  </div>
                  <button onClick={()=>setSelectedBar(null)} style={{fontSize:9,color:T.textFaint,background:"none",border:"none",cursor:"pointer",padding:"2px 4px"}}>✕</button>
                </div>;
              })()}
              {selectedBar===null&&<div style={{marginTop:8,fontSize:10,color:T.textFaint,textAlign:"center"}}>
                👆 Click any bar to see that day's breakdown
              </div>}
            </div>
            {/* Lead breakdown — matches mockup */}
            <div style={{background:T.card,borderRadius:12,padding:20,border:`1px solid ${T.border}`,display:"flex",flexDirection:"column"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
                <i className="ti ti-target" style={{fontSize:16,color:WA_GREEN}}/>
                <div style={{fontWeight:700,fontSize:13,color:T.text}}>Lead breakdown</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
                {[
                  {l:`🔥 Hot (${hot})`,v:total>0?Math.round(hot/total*100):0,c:"#ef4444"},
                  {l:`🟡 Warm (${warm})`,v:total>0?Math.round(warm/total*100):0,c:"#f59e0b"},
                  {l:`🔵 Cold (${cold})`,v:total>0?Math.round(cold/total*100):0,c:"#3b82f6"},
                ].map(s=>(
                  <div key={s.l}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:4}}>
                      <span style={{color:T.text}}>{s.l}</span>
                      <span style={{fontWeight:600,color:s.c}}>{s.v}%</span>
                    </div>
                    <div style={{height:6,background:T.card2,borderRadius:3,overflow:"hidden"}}>
                      <div style={{height:6,background:s.c,borderRadius:3,width:`${s.v}%`,transition:"width .8s ease"}}/>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{borderTop:`1px solid ${T.border}`,paddingTop:14}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                  <i className="ti ti-robot" style={{fontSize:14,color:WA_GREEN}}/>
                  <span style={{fontWeight:600,fontSize:12,color:T.text}}>Top performing</span>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:5,fontSize:11,color:T.textMuted}}>
                  <div>🤖 Bot handled: <strong style={{color:T.text}}>{totals.botMessages||0} msgs</strong></div>
                  <div>👤 Human: <strong style={{color:T.text}}>{(totals.agentMessages||0)} msgs</strong></div>
                  <div>📊 Bot rate: <strong style={{color:WA_GREEN}}>{botRate}%</strong></div>
                  <div>✅ Bookings: <strong style={{color:T.text}}>{done}</strong></div>
                </div>
              </div>
            </div>
          </div>

          {/* BOTTOM ROW */}
          <div className="an5" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14,marginBottom:20}}>
            {/* Funnel */}
            <div style={{background:T.card,borderRadius:14,padding:18,border:`1px solid ${T.border}`}}>
              <div style={{fontWeight:700,fontSize:14,marginBottom:2}}>🎯 Conversion Funnel</div>
              <div style={{fontSize:11,color:T.textFaint,marginBottom:14}}>First message → booking</div>
              {[
                {l:"New Contacts",v:total,pct:100,c:"#6366f1"},
                {l:"Warm Interest",v:warm,pct:total>0?Math.round(warm/total*100):0,c:"#f59e0b"},
                {l:"Hot Intent",v:hot,pct:total>0?Math.round(hot/total*100):0,c:"#ef4444"},
                {l:"✅ Converted",v:done,pct:total>0?Math.round(done/total*100):0,c:"#22c55e"},
              ].map(f=>(
                <div key={f.l} style={{marginBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:3,fontSize:11}}>
                    <span style={{fontWeight:600}}>{f.l}</span>
                    <span style={{color:f.c,fontWeight:700}}>{f.v} · {f.pct}%</span>
                  </div>
                  <div style={{height:7,borderRadius:4,background:T.card2}}>
                    <div style={{height:7,borderRadius:4,width:`${f.pct}%`,background:f.c,transition:"width .8s ease"}}/>
                  </div>
                </div>
              ))}
              <div style={{marginTop:10,padding:"8px 10px",background:`${WA_GREEN}08`,borderRadius:8,fontSize:10,color:T.textMuted,border:`1px solid ${WA_GREEN}20`}}>
                🤖 AI tagged <strong style={{color:WA_GREEN}}>{hot+warm}</strong> potential patients from {total} conversations
              </div>
            </div>
            {/* Peak hours */}
            <div style={{background:T.card,borderRadius:14,padding:18,border:`1px solid ${T.border}`}}>
              <div style={{fontWeight:700,fontSize:14,marginBottom:2}}>⏰ Peak Activity Hours</div>
              <div style={{fontSize:11,color:T.textFaint,marginBottom:14}}>When customers message most</div>
              {(()=>{
                const maxH=Math.max(...(a.peakHours||[]).map(p=>p.count),1);
                const hoveredData = hoveredHour!==null ? {
                  cnt:(a.peakHours||[]).find(p=>p.hour===hoveredHour)?.count||0,
                  time:String(hoveredHour).padStart(2,"0")+":00 – "+String(hoveredHour+1).padStart(2,"0")+":00"
                } : null;
                const peakHour=(a.peakHours||[]).reduce((a,b)=>b.count>a.count?b:a,{hour:0,count:0});
                return <>
                  {/* Hover info — compact inline strip */}
                  <div style={{marginBottom:8,height:24,display:"flex",alignItems:"center"}}>
                    {hoveredData&&hoveredData.cnt>0
                      ?<div style={{display:"flex",alignItems:"center",gap:8,padding:"3px 10px",background:WA_GREEN,borderRadius:20,fontSize:11,fontWeight:700,color:"#fff"}}>
                        <span>{hoveredData.time}</span>
                        <span style={{opacity:.7}}>·</span>
                        <span>{hoveredData.cnt} msg{hoveredData.cnt>1?"s":""}</span>
                        {hoveredData.cnt===maxH&&<span>🔥</span>}
                      </div>
                      :<span style={{fontSize:10,color:T.textMuted}}>Hover a bar to see details</span>
                    }
                  </div>
                  <div style={{display:"flex",alignItems:"flex-end",gap:2,height:70,position:"relative"}}>
                    {Array.from({length:24},(_,h)=>{
                      const cnt=(a.peakHours||[]).find(p=>p.hour===h)?.count||0;
                      const isPeak=cnt===maxH&&cnt>0;
                      const isHovered=hoveredHour===h;
                      return <div key={h} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",cursor:cnt>0?"pointer":"default"}}
                        onMouseEnter={()=>setHoveredHour(h)}
                        onMouseLeave={()=>setHoveredHour(null)}>
                        <div style={{width:"100%",borderRadius:"3px 3px 0 0",
                          height:`${Math.max(2,(cnt/maxH)*66)}px`,
                          transition:"all .2s",
                          background:isHovered?"#fff":isPeak?WA_GREEN:cnt>0?WA_GREEN+"60":T.border,
                          transform:isHovered?"scaleY(1.08)":"scaleY(1)",
                          transformOrigin:"bottom",
                          boxShadow:isHovered?"0 0 10px rgba(255,255,255,.5)":isPeak?"0 0 6px "+WA_GREEN+"80":"none"}}/>
                        {h%6===0&&<div style={{fontSize:7,color:isHovered?"#fff":T.textFaint,marginTop:2,fontWeight:isHovered?700:400}}>{h}h</div>}
                      </div>;
                    })}
                  </div>
                </>;
              })()}
              {(()=>{const p=(a.peakHours||[]).reduce((a,b)=>b.count>a.count?b:a,{hour:0,count:0});return p.count>0&&<div style={{marginTop:10,fontSize:11,color:T.textMuted}}>Peak: <strong style={{color:WA_GREEN}}>{p.hour}:00–{p.hour+1}:00</strong> · {p.count} messages</div>;})()}
            </div>
            {/* Lead quality */}
            <div style={{background:T.card,borderRadius:14,padding:18,border:`1px solid ${T.border}`}}>
              <div style={{fontWeight:700,fontSize:14,marginBottom:2}}>📊 Lead Quality Split</div>
              <div style={{fontSize:11,color:T.textFaint,marginBottom:14}}>AI classification breakdown</div>
              {[
                {l:"🔥 High Intent",v:hot,pct:total>0?Math.round(hot/total*100):0,c:"#ef4444"},
                {l:"🟡 Interested",v:warm,pct:total>0?Math.round(warm/total*100):0,c:"#f59e0b"},
                {l:"🔵 Browsing",v:cold,pct:total>0?Math.round(cold/total*100):0,c:"#3b82f6"},
              ].map(l=>(
                <div key={l.l} style={{marginBottom:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:4}}>
                    <span style={{fontWeight:600}}>{l.l}</span>
                    <span style={{color:l.c,fontWeight:700}}>{l.v} ({l.pct}%)</span>
                  </div>
                  <div style={{height:8,borderRadius:4,background:T.card2}}>
                    <div style={{height:8,borderRadius:4,width:`${l.pct}%`,background:l.c,transition:"width .8s"}}/>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* STAFF LEADERBOARD */}
          {a.staffStats?.length>0&&<div className="an5" style={{background:T.card,borderRadius:14,padding:18,border:`1px solid ${T.border}`,marginBottom:20}}>
            <div style={{fontWeight:700,fontSize:14,marginBottom:2}}>👥 Team Leaderboard</div>
            <div style={{fontSize:11,color:T.textFaint,marginBottom:14}}>Who handled what this period</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12}}>
              {a.staffStats.map((s,i)=>{
                const rate=s.assigned_count>0?Math.round((s.done_count||0)/s.assigned_count*100):0;
                const medals=["🥇","🥈","🥉"];
                return (
                  <div key={s.id} style={{padding:14,background:T.card2,borderRadius:12,border:`1px solid ${T.border}`}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                      <div style={{width:34,height:34,borderRadius:"50%",background:`linear-gradient(135deg,${WA_GREEN},#1da851)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:"#fff",flexShrink:0}}>
                        {medals[i]||s.username?.charAt(0)?.toUpperCase()||"?"}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:700,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>@{s.username}</div>
                        <div style={{fontSize:10,color:T.textMuted}}>{s.assigned_count||0} assigned</div>
                      </div>
                      <div style={{fontSize:16,fontWeight:900,color:rate>=50?WA_GREEN:"#f59e0b"}}>{rate}%</div>
                    </div>
                    <div style={{height:5,borderRadius:3,background:T.border,marginBottom:8}}>
                      <div style={{height:5,borderRadius:3,width:`${rate}%`,background:rate>=70?WA_GREEN:rate>=40?"#f59e0b":"#ef4444",transition:"width .6s"}}/>
                    </div>
                    <div style={{display:"flex",gap:8,fontSize:10,color:T.textMuted}}>
                      <span>🔥 {s.hot_count||0}</span><span>🟡 {s.warm_count||0}</span><span>✅ {s.done_count||0}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>}

          {/* LEADS BY COUNTRY MAP */}
          {countryData.length>0
            ?(()=>{try{return <LeadsMap T={T} WA_GREEN={WA_GREEN} countryData={countryData} dark={dark}/>;}catch(e){return null;}})()
            :<div style={{background:T.card,borderRadius:16,border:"1px solid "+T.border,padding:"24px 20px",marginBottom:20,textAlign:"center"}}>
              <div style={{fontSize:28,marginBottom:8}}>🌍</div>
              <div style={{fontWeight:700,fontSize:14,color:T.text,marginBottom:4}}>Leads by Country</div>
              <div style={{fontSize:12,color:T.textMuted}}>No contacts yet — data will appear once customers start messaging</div>
            </div>
          }

        </>}

        {!analyticsLoading&&!a&&<div style={{textAlign:"center",padding:80,color:T.textFaint}}>
          <div style={{fontSize:40,marginBottom:12}}>📊</div>
          <div style={{fontSize:14,fontWeight:600}}>No analytics data yet</div>
          <div style={{fontSize:12,marginTop:6}}>Data appears as customers message in</div>
        </div>}
      </>}
    </div>
  );
}

// ── PROMPT WIZARD COMPONENT ──────────────────────────────────────────────────
function PromptWizard({T, WA_GREEN, dark, API, authHeaders, kbClinic, systemPrompt, setSystemPrompt, setConfirmModal}) {
  const [mode, setMode] = React.useState(null);
  const [step, setStep] = React.useState(1);
  const [businessDesc, setBusinessDesc] = React.useState("");
  const [questions, setQuestions] = React.useState([]);
  const [answers, setAnswers] = React.useState({});
  const [extra, setExtra] = React.useState("");
  const [newLogic, setNewLogic] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [loadingMsg, setLoadingMsg] = React.useState("");
  const [generatedPrompt, setGeneratedPrompt] = React.useState("");
  const [enhanceResult, setEnhanceResult] = React.useState(null);
  const [error, setError] = React.useState("");
  const [suggestWelcome, setSuggestWelcome] = React.useState("");
  const clinicId = kbClinic?.clinic_id||kbClinic?.id||null;

  const callAPI = async (payload) => {
    const body = {...payload};
    if(clinicId) body.clinic_id = clinicId;
    const ctrl = new AbortController();
    const tmo = setTimeout(()=>ctrl.abort(), 120000); // 120s timeout for AI generation
    try {
      const r = await fetch(API+"/api/knowledge/generate-prompt", {
        method:"POST", headers:authHeaders(), body:JSON.stringify(body), signal:ctrl.signal
      });
      clearTimeout(tmo);
      return r.json();
    } catch(e) {
      clearTimeout(tmo);
      if(e.name==="AbortError") throw new Error("Request timed out — please try again");
      throw e;
    }
  };

  const loadingMessages = {
    questions: ["🔍 Analysing your business...", "🧠 Thinking about the right questions...", "✍️ Crafting specific questions for you..."],
    generate: ["📝 Reading your answers...", "🧠 Building your bot personality...", "✨ Crafting your system prompt...", "🔧 Adding conversation rules...", "📋 Writing objection handling...", "🌟 Adding language preferences...", "⚡ Finalising your prompt...", "🔍 Almost ready..."],
    enhance: ["📖 Reading your existing prompt...", "🧠 Understanding the new rule...", "📍 Finding the best place to add it...", "✍️ Writing the updated prompt..."],
  };

  const startLoading = (type) => {
    setLoading(true); setError("");
    const msgs = loadingMessages[type]||[];
    let i = 0;
    setLoadingMsg(msgs[0]||"Processing...");
    const interval = setInterval(()=>{
      i = (i+1)%msgs.length;
      setLoadingMsg(msgs[i]);
    }, 2000);
    return interval;
  };

  const generateQuestions = async (force=false) => {
    if(!businessDesc.trim()) return;
    // Use cached questions if already generated
    if(!force && questions.length>0) { setStep(2); return; }
    const timer = startLoading("questions");
    try {
      const d = await callAPI({mode:"questions", business_desc:businessDesc});
      clearInterval(timer);
      if(d.error){
        if(d.error.includes("No API key")) setError("⚠️ No API key found. Ask your admin to configure one in Settings or enable the Fallback API Key in Admin Panel.");
        else setError(d.error);
        return;
      }
      setQuestions(d.result?.questions||[]);
      setStep(2);
    } catch(e){ clearInterval(timer); setError("Connection error: "+e.message+". Please check your internet and try again."); }
    finally{ setLoading(false); setLoadingMsg(""); }
  };

  const generatePrompt = async () => {
    const timer = startLoading("generate");
    try {
      const d = await callAPI({mode:"generate", business_desc:businessDesc, answers, extra});
      clearInterval(timer);
      if(d.error){setError(d.error);return;}
      setGeneratedPrompt(d.prompt||"");
      setStep(3);
    } catch(e){ clearInterval(timer); setError("Connection error: "+e.message+". Please check your internet and try again."); }
    finally{ setLoading(false); setLoadingMsg(""); }
  };

  const enhancePrompt = async () => {
    if(!newLogic.trim()) return;
    const timer = startLoading("enhance");
    try {
      const d = await callAPI({mode:"enhance", new_logic:newLogic});
      clearInterval(timer);
      if(d.error){setError(d.error);return;}
      setEnhanceResult(d.result);
      setStep(3);
    } catch(e){ clearInterval(timer); setError(e.message||"Failed — please try again"); }
    finally{ setLoading(false); setLoadingMsg(""); }
  };

  const extractWelcome = (prompt) => {
    const lines = prompt.split("\n");
    for(const line of lines) {
      const l = line.toLowerCase();
      if(l.includes("hi!") || l.includes("hello!") || l.includes("hi,") || l.includes("assalamualaikum")) {
        const clean = line.replace(/^[-*"\s]+|["]+$/g,"").trim();
        if(clean.length > 10 && clean.length < 300) return clean;
      }
    }
    return "";
  };

  const applyPrompt = (newPrompt) => {
    setConfirmModal({
      title:"Apply New Prompt?",
      message:"This updates the bot personality immediately. Make sure you copied your current prompt first!",
      icon:"🤖", danger:false, confirmText:"Yes, Apply Now",
      onConfirm: async () => {
        const body = {prompt:newPrompt};
        if(clinicId) body.clinic_id = clinicId;
        await fetch(API+"/api/knowledge/prompt", {method:"PATCH", headers:authHeaders(), body:JSON.stringify(body)});
        setSystemPrompt(newPrompt);
        const welcome = extractWelcome(newPrompt);
        if(welcome) setSuggestWelcome(welcome);
        setMode(null); setStep(1); setGeneratedPrompt(""); setEnhanceResult(null);
        setNewLogic(""); setAnswers({}); setExtra(""); setBusinessDesc("");
        const t=document.createElement("div");
        t.style.cssText="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:99999;background:#fff;border-radius:20px;padding:28px 36px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.2);border:2px solid #86efac";
        t.innerHTML="<div style='font-size:32px;margin-bottom:8px'>✅</div><div style='font-weight:800;font-size:16px;color:#166534'>Prompt Applied!</div>";
        document.body.appendChild(t); setTimeout(()=>t.remove(),2500);
      }
    });
  };

  const reset = () => {setMode(null);setStep(1);setGeneratedPrompt("");setQuestions([]);setAnswers({});setEnhanceResult(null);setNewLogic("");setError("");};

  // Shared styles
  const IS = {width:"100%",padding:"10px 14px",borderRadius:10,border:"1.5px solid "+T.border,background:T.card2,color:T.text,fontSize:13,fontFamily:"inherit",outline:"none",resize:"vertical",lineHeight:1.6};
  const BP = {padding:"11px 22px",borderRadius:11,border:"none",background:"linear-gradient(135deg,#6c63ff,#8b5cf6)",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 2px 12px rgba(108,99,255,.3)",display:"flex",alignItems:"center",gap:8};
  const BS = {padding:"10px 16px",borderRadius:10,border:"1px solid "+T.border,background:T.card2,color:T.text,fontSize:13,cursor:"pointer",fontFamily:"inherit"};

  // Loading overlay
  const LoadingOverlay = () => (
    <div style={{textAlign:"center",padding:"40px 20px"}}>
      <div style={{width:56,height:56,margin:"0 auto 20px",position:"relative"}}>
        <div style={{position:"absolute",inset:0,borderRadius:"50%",border:"3px solid #f0effe"}}/>
        <div style={{position:"absolute",inset:0,borderRadius:"50%",border:"3px solid transparent",borderTopColor:WA_GREEN,animation:"spin .8s linear infinite"}}/>
        <div style={{position:"absolute",inset:6,borderRadius:"50%",background:"linear-gradient(135deg,#6c63ff20,#8b5cf620)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>🤖</div>
      </div>
      <div style={{fontWeight:700,fontSize:14,color:T.text,marginBottom:6}}>{loadingMsg}</div>
      <div style={{fontSize:11,color:T.textMuted}}>AI is working — this takes 30-60 seconds ☕</div>
      <div style={{marginTop:16,height:3,borderRadius:2,background:T.border,overflow:"hidden",maxWidth:200,margin:"16px auto 0"}}>
        <div style={{height:3,borderRadius:2,background:"linear-gradient(90deg,#6c63ff,#8b5cf6)",animation:"shimmer 1.5s ease-in-out infinite",backgroundSize:"200% 100%"}}/>
      </div>
      <style>{`@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}`}</style>
    </div>
  );

  // MODE SELECTION
  if(!mode) return (
    <div style={{animation:"_slideInL .3s both"}}>
      <div style={{fontWeight:900,fontSize:17,letterSpacing:"-.3px",marginBottom:4,color:T.text}}>✨ Prompt Wizard</div>
      <div style={{fontSize:12,color:T.textMuted,marginBottom:20}}>Build or improve your bot personality with AI — in any language</div>

      {/* Welcome suggestion banner */}
      {suggestWelcome&&<div style={{marginBottom:16,padding:"14px 16px",background:"#eff6ff",borderRadius:12,border:"1px solid #bfdbfe"}}>
        <div style={{fontWeight:700,fontSize:12,color:"#1d4ed8",marginBottom:4}}>💡 Update Welcome Message too?</div>
        <div style={{fontSize:11,color:"#1e40af",marginBottom:8}}>Your new prompt includes this greeting. Set it as the auto-send Welcome Message for new customers:</div>
        <div style={{background:"#fff",borderRadius:8,padding:"8px 12px",fontSize:12,color:T.text,marginBottom:10,border:"1px solid #bfdbfe",fontStyle:"italic"}}>"{suggestWelcome}"</div>
        <div style={{display:"flex",gap:6}}>
          <button onClick={async()=>{
            const body={welcome:suggestWelcome};
            if(clinicId) body.clinic_id=clinicId;
            await fetch(API+"/api/knowledge/welcome",{method:"PATCH",headers:authHeaders(),body:JSON.stringify(body)});
            setSuggestWelcome("");
            const t=document.createElement("div");
            t.style.cssText="position:fixed;bottom:24px;right:24px;z-index:99999;background:#166534;color:#fff;border-radius:12px;padding:12px 20px;font-size:13px;font-weight:700";
            t.innerHTML="✅ Welcome message updated!";
            document.body.appendChild(t); setTimeout(()=>t.remove(),2500);
          }} style={{padding:"6px 14px",borderRadius:8,border:"none",background:"#2563eb",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
            ✅ Yes, Update It
          </button>
          <button onClick={()=>setSuggestWelcome("")} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #bfdbfe",background:"#fff",color:T.textMuted,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Skip</button>
        </div>
      </div>}

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
        {[
          {id:"generate",icon:"🆕",title:"Generate Fresh Prompt",desc:"Describe your business, answer AI-generated questions, get a complete bot personality",badge:"Best for new setup",color:WA_GREEN},
          {id:"enhance",icon:"✏️",title:"Add New Rule",desc:"Type what you want to change in plain English — AI finds the right place and adds it perfectly",badge:"Best for updates",color:"#0891b2"},
        ].map(m=>(
          <div key={m.id} onClick={()=>setMode(m.id)}
            style={{background:T.card2,border:"2px solid "+T.border,borderRadius:16,padding:20,cursor:"pointer",transition:"all .2s",position:"relative",overflow:"hidden"}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=m.color;e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow="0 8px 24px rgba(0,0,0,.08)";}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="none";}}>
            <div style={{fontSize:32,marginBottom:10}}>{m.icon}</div>
            <div style={{fontWeight:800,fontSize:13,marginBottom:6,color:T.text}}>{m.title}</div>
            <div style={{fontSize:11,color:T.textMuted,lineHeight:1.6,marginBottom:10}}>{m.desc}</div>
            <div style={{display:"inline-block",padding:"3px 10px",borderRadius:20,background:m.color+"15",color:m.color,fontSize:10,fontWeight:700,border:"1px solid "+m.color+"30"}}>{m.badge}</div>
          </div>
        ))}
      </div>
      {systemPrompt
        ? <div style={{padding:"10px 14px",background:"#f0fdf4",borderRadius:10,border:"1px solid #bbf7d0",fontSize:11,color:"#166534"}}>✅ You have an existing prompt ({systemPrompt.length} chars) — both modes will read it</div>
        : <div style={{padding:"10px 14px",background:"#fffbeb",borderRadius:10,border:"1px solid #fde68a",fontSize:11,color:"#92400e"}}>⚠️ No existing prompt yet — start with Generate Fresh</div>
      }
    </div>
  );

  // ENHANCE MODE
  if(mode==="enhance") return (
    <div style={{animation:"_slideInL .3s both"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:20}}>
        <button onClick={reset} style={{...BS,padding:"6px 12px",fontSize:11}}>← Back</button>
        <div style={{fontWeight:800,fontSize:15,color:T.text}}>✏️ Add New Rule</div>
      </div>

      {loading&&<LoadingOverlay/>}

      {!loading&&step===1&&<>
        <div style={{padding:"12px 14px",background:"#fff7ed",borderRadius:10,border:"1px solid #fed7aa",marginBottom:16,fontSize:11,color:"#9a3412"}}>
          ⚠️ <strong>Save a copy of your current prompt first!</strong>
          {systemPrompt&&<button onClick={()=>navigator.clipboard.writeText(systemPrompt)} style={{marginLeft:8,padding:"2px 8px",borderRadius:6,border:"1px solid #fed7aa",background:"#fff",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>📋 Copy Now</button>}
        </div>
        <div style={{fontWeight:700,fontSize:13,color:T.text,marginBottom:4}}>What do you want to add or change?</div>
        <div style={{fontSize:11,color:T.textMuted,marginBottom:12,lineHeight:1.6}}>
          Write in <strong>any language</strong> — plain English, Malay, Chinese. AI will convert it to proper prompt language and insert it in the right place.
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
          {["If customer asks about price, don't tell them — ask them to come in first","Kalau customer cakap Melayu, balas dalam Melayu","Never mention competitor clinics by name","If customer seems angry, apologise sincerely before helping"].map(ex=>(
            <button key={ex} onClick={()=>setNewLogic(ex)}
              style={{padding:"8px 12px",borderRadius:9,border:"1px solid "+T.border,background:newLogic===ex?`${WA_GREEN}10`:T.card2,color:newLogic===ex?WA_GREEN:T.textMuted,fontSize:11,cursor:"pointer",fontFamily:"inherit",textAlign:"left",transition:"all .15s"}}>
              💡 {ex}
            </button>
          ))}
        </div>
        <textarea value={newLogic} onChange={e=>setNewLogic(e.target.value)} rows={4}
          placeholder="Or write your own rule here..."
          style={{...IS,minHeight:100,marginBottom:12}}/>
        {error&&<div style={{color:"#e11d48",fontSize:11,marginBottom:10,padding:"8px 12px",background:"#fff1f3",borderRadius:8,border:"1px solid #fecdd3"}}>❌ {error}</div>}
        <button onClick={enhancePrompt} disabled={!newLogic.trim()} style={{...BP,opacity:!newLogic.trim()?0.5:1}}>
          ✨ Find Best Place & Add →
        </button>
      </>}

      {!loading&&step===3&&enhanceResult&&<>
        <div style={{marginBottom:12,padding:"12px 14px",background:`${WA_GREEN}10`,borderRadius:12,border:"1px solid #ddd6fe"}}>
          <div style={{fontWeight:700,fontSize:12,color:"#6d28d9",marginBottom:4}}>📍 Added to: <strong>{enhanceResult.added_to_section}</strong></div>
          <div style={{fontSize:11,color:"#7c3aed"}}>Rule written as: <em>{enhanceResult.converted_rule}</em></div>
        </div>
        <div style={{fontWeight:700,fontSize:12,color:T.text,marginBottom:6}}>Review updated prompt:</div>
        <textarea value={enhanceResult.updated_prompt||""} onChange={e=>setEnhanceResult({...enhanceResult,updated_prompt:e.target.value})}
          rows={10} style={{...IS,minHeight:200,marginBottom:12,fontFamily:"monospace",fontSize:11}}/>
        {enhanceResult.test_messages?.length>0&&<div style={{marginBottom:12,padding:"12px 14px",background:"#f0fdf4",borderRadius:10,border:"1px solid #bbf7d0"}}>
          <div style={{fontWeight:700,fontSize:11,color:"#166534",marginBottom:8}}>🧪 Test your new rule — send these to WhatsApp:</div>
          {enhanceResult.test_messages.map((m,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0",fontSize:11,color:"#166534"}}>
              <span style={{background:"#dcfce7",borderRadius:4,padding:"1px 6px",fontWeight:700,fontSize:10}}>{i+1}</span>
              "{m}"
            </div>
          ))}
        </div>}
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button onClick={()=>applyPrompt(enhanceResult.updated_prompt)} style={BP}>✅ Apply Changes</button>
          <button onClick={()=>{setStep(1);setEnhanceResult(null);}} style={BS}>✏️ Try Again</button>
          <button onClick={()=>navigator.clipboard.writeText(enhanceResult.updated_prompt||"")} style={{...BS,fontSize:11}}>📋 Copy</button>
        </div>
      </>}
    </div>
  );

  // GENERATE MODE
  if(mode==="generate") return (
    <div style={{animation:"_slideInL .3s both"}}>
      {/* Header with progress */}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
        <button onClick={reset} style={{...BS,padding:"6px 12px",fontSize:11}}>← Back</button>
        <div style={{fontWeight:800,fontSize:15,color:T.text}}>🆕 Generate Fresh Prompt</div>
        <div style={{marginLeft:"auto",display:"flex",gap:6,alignItems:"center"}}>
          {[1,2,3].map(s=>(
            <div key={s} style={{display:"flex",alignItems:"center",gap:4}}>
              <div style={{width:24,height:24,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,
                background:step>=s?"linear-gradient(135deg,#6c63ff,#8b5cf6)":T.card2,
                color:step>=s?"#fff":T.textMuted,
                border:"2px solid "+(step>=s?WA_GREEN:T.border),
                transition:"all .3s"}}>
                {step>s?"✓":s}
              </div>
              {s<3&&<div style={{width:16,height:2,borderRadius:1,background:step>s?WA_GREEN:T.border,transition:"background .3s"}}/>}
            </div>
          ))}
        </div>
      </div>

      {/* Step labels */}
      <div style={{display:"flex",gap:4,marginBottom:20,fontSize:10,color:T.textMuted}}>
        {["Describe Business","Answer Questions","Review & Apply"].map((l,i)=>(
          <span key={l} style={{flex:1,textAlign:i===0?"left":i===2?"right":"center",fontWeight:step===i+1?700:400,color:step===i+1?WA_GREEN:T.textMuted}}>{l}</span>
        ))}
      </div>

      {loading&&<LoadingOverlay/>}

      {/* STEP 1 */}
      {!loading&&step===1&&<>
        {systemPrompt&&<div style={{padding:"10px 14px",background:"#fff7ed",borderRadius:10,border:"1px solid #fed7aa",marginBottom:14,fontSize:11,color:"#9a3412"}}>
          ⚠️ This replaces your existing prompt.
          <button onClick={()=>navigator.clipboard.writeText(systemPrompt)} style={{marginLeft:8,padding:"2px 8px",borderRadius:6,border:"1px solid #fed7aa",background:"#fff",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>📋 Copy Current First</button>
        </div>}
        <div style={{fontWeight:700,fontSize:14,color:T.text,marginBottom:4}}>Describe your business</div>
        <div style={{fontSize:12,color:T.textMuted,marginBottom:12,lineHeight:1.6}}>Write in any language — AI will generate specific questions for your exact business type</div>

        {/* Quick examples */}
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
          {[
            "Dental clinic in KL",
            "Real estate agent Mont Kiara",
            "Beauty salon Subang",
            "F&B restaurant Bangsar",
          ].map(ex=>(
            <button key={ex} onClick={()=>setBusinessDesc(ex)}
              style={{padding:"5px 12px",borderRadius:20,border:"1px solid "+T.border,background:T.card2,color:T.textMuted,fontSize:11,cursor:"pointer",fontFamily:"inherit",transition:"all .15s"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=WA_GREEN;e.currentTarget.style.color=WA_GREEN;}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.color=T.textMuted;}}>
              {ex}
            </button>
          ))}
        </div>

        <textarea value={businessDesc} onChange={e=>setBusinessDesc(e.target.value)} rows={4}
          placeholder={"Describe your business in a few sentences. Include:\n• What you do and your main services\n• Who your typical customers are\n• Where you are located\n• Anything special about your business"}
          style={{...IS,minHeight:110,marginBottom:14}}/>
        {error&&<div style={{color:"#e11d48",fontSize:11,marginBottom:10,padding:"8px 12px",background:"#fff1f3",borderRadius:8,border:"1px solid #fecdd3"}}>❌ {error}</div>}
        <button onClick={()=>generateQuestions(false)} disabled={!businessDesc.trim()} style={{...BP,opacity:!businessDesc.trim()?0.5:1}}>
          {questions.length>0?"📋 Continue with My Questions →":"🚀 Generate My Questions →"}
        </button>
        {questions.length>0&&<button onClick={()=>generateQuestions(true)} style={{...BS,fontSize:11,marginTop:6}}>
          🔄 Generate New Questions Instead
        </button>}
      </>}

      {/* STEP 2 */}
      {!loading&&step===2&&questions.length>0&&<>
        <div style={{marginBottom:16,padding:"10px 14px",background:`${WA_GREEN}10`,borderRadius:10,border:"1px solid #ddd6fe",fontSize:11,color:"#6d28d9"}}>
          🧠 AI generated <strong>{questions.length} questions</strong> specific to your business. Answer what you can — skip anything that doesn't apply.
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
          {questions.map((q,i)=>(
            <div key={q.id||i} style={{background:T.card2,borderRadius:14,padding:"14px 16px",border:"1px solid "+T.border,transition:"border-color .15s"}}
              onMouseEnter={e=>e.currentTarget.style.borderColor="#6c63ff30"}
              onMouseLeave={e=>e.currentTarget.style.borderColor=T.border}>
              <div style={{fontWeight:700,fontSize:12,color:T.text,marginBottom:10,display:"flex",gap:8,alignItems:"flex-start"}}>
                <span style={{background:"linear-gradient(135deg,#6c63ff,#8b5cf6)",color:"#fff",borderRadius:6,padding:"1px 7px",fontSize:10,fontWeight:700,flexShrink:0,marginTop:1}}>{i+1}</span>
                {q.question}
              </div>
              {q.type==="options"&&(q.options||[]).length>0&&<div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:8}}>
                {(q.options||[]).map(opt=>(
                  <button key={opt} onClick={()=>setAnswers(p=>({...p,[q.id]:p[q.id]===opt?"":opt}))}
                    style={{padding:"5px 12px",borderRadius:20,fontFamily:"inherit",fontSize:11,cursor:"pointer",transition:"all .15s",
                      border:"1.5px solid "+(answers[q.id]===opt?WA_GREEN:T.border),
                      background:answers[q.id]===opt?`${WA_GREEN}10`:T.card,
                      color:answers[q.id]===opt?WA_GREEN:T.text,
                      fontWeight:answers[q.id]===opt?700:400}}>
                    {answers[q.id]===opt?"✓ ":""}{opt}
                  </button>
                ))}
              </div>}
              {q.type==="multiselect"&&(q.options||[]).length>0&&<div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:8}}>
                {(q.options||[]).map(opt=>{
                  const sel = (answers[q.id]||[]);
                  const isOn = Array.isArray(sel)?sel.includes(opt):false;
                  return <button key={opt} onClick={()=>setAnswers(p=>{
                    const cur = Array.isArray(p[q.id])?p[q.id]:[];
                    return {...p,[q.id]:isOn?cur.filter(x=>x!==opt):[...cur,opt]};
                  })} style={{padding:"5px 12px",borderRadius:20,fontFamily:"inherit",fontSize:11,cursor:"pointer",transition:"all .15s",
                    border:"1.5px solid "+(isOn?WA_GREEN:T.border),
                    background:isOn?`${WA_GREEN}10`:T.card,color:isOn?WA_GREEN:T.text,fontWeight:isOn?700:400}}>
                    {isOn?"✓ ":""}{opt}
                  </button>;
                })}
              </div>}
              <input value={typeof answers[q.id]==="string"?answers[q.id]:(Array.isArray(answers[q.id])?answers[q.id].join(", "):"null"===typeof answers[q.id]?"":"")}
                onChange={e=>setAnswers(p=>({...p,[q.id]:e.target.value}))}
                placeholder={q.placeholder||(q.type==="options"||q.type==="multiselect"?"Add details (optional)...":"Your answer (optional)...")}
                style={{...IS,resize:"none",padding:"7px 10px",fontSize:11,minHeight:"auto"}}/>
            </div>
          ))}
        </div>
        <div style={{fontWeight:700,fontSize:12,color:T.text,marginBottom:6}}>💬 Anything else to add?</div>
        <textarea value={extra} onChange={e=>setExtra(e.target.value)} rows={3}
          placeholder="Special rules, promotions, things bot must know or never say..."
          style={{...IS,minHeight:70,marginBottom:14}}/>
        {error&&<div style={{color:"#e11d48",fontSize:11,marginBottom:10,padding:"8px 12px",background:"#fff1f3",borderRadius:8,border:"1px solid #fecdd3"}}>❌ {error}</div>}
        <div style={{display:"flex",gap:8}}>
          <button onClick={generatePrompt} style={BP}>✨ Generate My Bot Prompt →</button>
          <button onClick={()=>{setStep(1);setError("");}} style={BS}>← Back</button>
        </div>
      </>}

      {/* STEP 3 */}
      {!loading&&step===3&&generatedPrompt&&<>
        <div style={{marginBottom:12,padding:"12px 14px",background:"#f0fdf4",borderRadius:10,border:"1px solid #bbf7d0",fontSize:11,color:"#166534"}}>
          ✅ Your bot prompt is ready! Review and edit below before applying.
        </div>
        <textarea value={generatedPrompt} onChange={e=>setGeneratedPrompt(e.target.value)} rows={12}
          style={{...IS,minHeight:240,marginBottom:14,fontFamily:"monospace",fontSize:11}}/>
        {systemPrompt&&<div style={{marginBottom:12,padding:"10px 14px",background:"#fff7ed",borderRadius:10,border:"1px solid #fed7aa",fontSize:11,color:"#9a3412"}}>
          ⚠️ <strong>Existing prompt will be replaced!</strong> Copy it first as backup.
          <button onClick={()=>navigator.clipboard.writeText(systemPrompt||"")} style={{marginLeft:8,padding:"2px 8px",borderRadius:6,border:"1px solid #fed7aa",background:"#fff",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>📋 Copy Current</button>
        </div>}
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button onClick={()=>applyPrompt(generatedPrompt)} style={BP}>✅ Apply New Prompt</button>
          <button onClick={()=>setStep(2)} style={BS}>← Edit Answers</button>
          <button onClick={()=>navigator.clipboard.writeText(generatedPrompt)} style={{...BS,fontSize:11}}>📋 Copy</button>
          <button onClick={generatePrompt} disabled={loading} style={{...BS,fontSize:11,opacity:loading?0.6:1}}>🔄 Regenerate</button>
        </div>
      </>}
    </div>
  );

  return null;
}


// ── LEADS BY COUNTRY COMPONENT ──────────────────────────────────────────────
function LeadsMap({T, WA_GREEN, countryData, dark}) {
  const total = countryData.reduce((s,c)=>s+c.total,0);
  const top10 = countryData.slice(0,10);
  const maxVal = top10[0]?.total||1;

  return (
    <div style={{background:T.card,borderRadius:16,border:"1px solid "+T.border,padding:20,marginBottom:20,animation:"_fadeUp .4s both"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:8}}>
        <div>
          <div style={{fontWeight:800,fontSize:15,color:T.text}}>🌍 Leads by Country</div>
          <div style={{fontSize:11,color:T.textMuted,marginTop:2}}>{total} contacts across {countryData.length} countries</div>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        {top10.map((c,i)=>{
          const pct=Math.round(c.total/total*100);
          const hotPct=c.total>0?Math.round(c.hot/c.total*100):0;
          const barColor=i===0?"linear-gradient(90deg,"+WA_GREEN+",#00c853)":i<=2?"linear-gradient(90deg,#6366f1,#818cf8)":"linear-gradient(90deg,#94a3b8,#cbd5e1)";
          return (
            <div key={c.code} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:12,background:T.card2,border:"1px solid "+T.border}}>
              <div style={{fontSize:11,color:T.textMuted,width:16,textAlign:"right",fontWeight:700,flexShrink:0}}>{i+1}</div>
              <div style={{fontSize:22,flexShrink:0}}>{c.flag}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                  <span style={{fontSize:12,fontWeight:700,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.name}</span>
                  <span style={{fontSize:13,fontWeight:800,color:i===0?WA_GREEN:i<=2?"#6366f1":T.text,flexShrink:0,marginLeft:6}}>{c.total}</span>
                </div>
                <div style={{height:6,borderRadius:3,background:T.border}}>
                  <div style={{height:6,borderRadius:3,width:(c.total/maxVal*100)+"%",background:barColor,transition:"width .6s ease"}}/>
                </div>
                <div style={{display:"flex",gap:8,marginTop:4,fontSize:10,color:T.textMuted}}>
                  <span>🔥 {c.hot} hot</span>
                  <span>🟡 {c.warm} warm</span>
                  <span style={{marginLeft:"auto"}}>{pct}%{hotPct>0?" · "+hotPct+"% hot":""}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{display:"flex",gap:10,marginTop:14,flexWrap:"wrap"}}>
        {[
          {l:"🔥 Hot Leads",v:countryData.reduce((s,c)=>s+c.hot,0),c:"#ef4444"},
          {l:"🟡 Warm Leads",v:countryData.reduce((s,c)=>s+c.warm,0),c:"#f59e0b"},
          {l:"🌍 Countries",v:countryData.length,c:"#6366f1"},
          {l:"🏆 Top Country",v:(top10[0]?.flag||"")+" "+(top10[0]?.name||"-"),c:WA_GREEN},
        ].map(s=>(
          <div key={s.l} style={{flex:1,minWidth:100,padding:"8px 12px",background:T.card2,borderRadius:10,border:"1px solid "+T.border}}>
            <div style={{fontSize:10,color:T.textMuted,marginBottom:3}}>{s.l}</div>
            <div style={{fontSize:13,fontWeight:800,color:s.c}}>{s.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}


// ── CREATE TEMPLATE PANEL ─────────────────────────────────────────────────────
function BroadcastHistoryPanel({T, WA_GREEN, API, authHeaders, isAdmin, broadcastClinic}) {
  const [history, setHistory] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [expanded, setExpanded] = React.useState({});
  const [sortKey, setSortKey] = React.useState("sent_at");
  const [sortDir, setSortDir] = React.useState("desc");

  React.useEffect(()=>{
    const clinicId = isAdmin&&broadcastClinic?(broadcastClinic.clinic_id||broadcastClinic.id):null;
    const url = clinicId ? `${API}/api/broadcast/history?clinic_id=${clinicId}&limit=500` : `${API}/api/broadcast/history?limit=500`;
    setLoading(true);
    fetch(url,{headers:authHeaders()}).then(r=>r.json()).then(d=>{
      setHistory(Array.isArray(d)?d:[]);
      setLoading(false);
    }).catch(()=>setLoading(false));
  },[broadcastClinic]);

  const statusConfig = {
    read:     {color:"#8b5cf6", bg:"#f5f3ff", label:"Read",      icon:"ti-eye"},
    delivered:{color:WA_GREEN,  bg:"#f0fdf4", label:"Delivered",  icon:"ti-checks"},
    failed:   {color:"#ef4444", bg:"#fef2f2", label:"Failed",     icon:"ti-x"},
    accepted: {color:"#f59e0b", bg:"#fffbeb", label:"Sent",       icon:"ti-clock"},
  };
  const sc = s => statusConfig[s] || statusConfig.accepted;

  const filtered = history.filter(h=>
    !search||(h.name||"").toLowerCase().includes(search.toLowerCase())||
    h.phone?.includes(search)||h.template_name?.toLowerCase().includes(search.toLowerCase())
  );

  // Group by template + date
  const grouped = filtered.reduce((acc,h)=>{
    const key = `${h.template_name}__${(h.sent_at||"").slice(0,10)}`;
    if(!acc[key]) acc[key]={key, template:h.template_name, date:(h.sent_at||"").slice(0,10), contacts:[], total:0, delivered:0, read:0, failed:0, sent:0};
    acc[key].contacts.push(h);
    acc[key].total++;
    if(h.status==="read") acc[key].read++;
    else if(h.status==="delivered") acc[key].delivered++;
    else if(h.status==="failed") acc[key].failed++;
    else acc[key].sent++;
    return acc;
  },{});

  const groups = Object.values(grouped).sort((a,b)=>b.date.localeCompare(a.date));
  const totalSent = filtered.length;
  const totalDelivered = filtered.filter(h=>h.status==="delivered"||h.status==="read").length;
  const totalRead = filtered.filter(h=>h.status==="read").length;
  const totalFailed = filtered.filter(h=>h.status==="failed").length;

  const thStyle = {padding:"10px 14px",fontSize:11,fontWeight:700,color:T.textMuted,textAlign:"left",
    letterSpacing:.5,textTransform:"uppercase",borderBottom:`2px solid ${T.border}`,whiteSpace:"nowrap",userSelect:"none"};

  const fmtTime = ts => ts ? new Date(ts).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}) : "";

  return <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",padding:20,gap:16}}>
    {/* KPI row */}
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
      {[
        {label:"Total Sent",    value:totalSent,      color:"#3b82f6", icon:"ti-send"},
        {label:"Delivered",     value:totalDelivered, color:WA_GREEN,  icon:"ti-checks"},
        {label:"Read",          value:totalRead,      color:"#8b5cf6", icon:"ti-eye"},
        {label:"Failed",        value:totalFailed,    color:"#ef4444", icon:"ti-x"},
      ].map((k,i)=>(
        <div key={i} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:"12px 16px",display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:36,height:36,borderRadius:10,background:`${k.color}15`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <i className={`ti ${k.icon}`} style={{fontSize:16,color:k.color}}/>
          </div>
          <div>
            <div style={{fontSize:20,fontWeight:700,color:T.text,lineHeight:1}}>{k.value}</div>
            <div style={{fontSize:11,color:T.textMuted,marginTop:2}}>{k.label}</div>
          </div>
        </div>
      ))}
    </div>

    {/* Search */}
    <div style={{display:"flex",gap:10,alignItems:"center"}}>
      <div style={{flex:1,position:"relative"}}>
        <i className="ti ti-search" style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:14,color:T.textMuted}}/>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, phone or template…"
          style={{width:"100%",padding:"9px 12px 9px 34px",borderRadius:10,border:`1px solid ${T.border}`,
            background:T.card2,color:T.text,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
      </div>
      <div style={{fontSize:12,color:T.textMuted,whiteSpace:"nowrap",padding:"0 4px"}}>{totalSent} records · {groups.length} campaigns</div>
    </div>

    {/* Table */}
    <div style={{flex:1,overflowY:"auto",borderRadius:12,border:`1px solid ${T.border}`,background:T.card}}>
      {loading?<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:200,color:T.textMuted,gap:8}}>
        <i className="ti ti-loader" style={{fontSize:20}}/> Loading…
      </div>:groups.length===0?<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:200,color:T.textMuted,gap:8}}>
        <i className="ti ti-send" style={{fontSize:32,opacity:.3}}/>
        <div style={{fontSize:14}}>No broadcast history yet</div>
        <div style={{fontSize:12}}>Send your first broadcast to see results here</div>
      </div>:groups.map((g,gi)=>{
        const isOpen = expanded[g.key]!==false;
        const delivRate = g.total>0?Math.round((g.delivered+g.read)/g.total*100):0;
        const readRate = g.total>0?Math.round(g.read/g.total*100):0;
        return <div key={gi} style={{borderBottom:gi<groups.length-1?`1px solid ${T.border}`:"none"}}>
          {/* Group header */}
          <div onClick={()=>setExpanded(p=>({...p,[g.key]:!isOpen}))}
            style={{display:"grid",gridTemplateColumns:"1fr auto auto auto auto auto",gap:12,padding:"12px 16px",
              alignItems:"center",cursor:"pointer",background:isOpen?T.card2:"transparent",
              transition:"background .15s"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
              <div style={{width:32,height:32,borderRadius:8,background:`${WA_GREEN}15`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <i className="ti ti-speakerphone" style={{fontSize:15,color:WA_GREEN}}/>
              </div>
              <div style={{minWidth:0}}>
                <div style={{fontWeight:600,fontSize:13,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.template}</div>
                <div style={{fontSize:11,color:T.textMuted}}>{g.date} · {g.total} recipients</div>
              </div>
            </div>
            {/* Delivery rate bar */}
            <div style={{width:80,display:"flex",flexDirection:"column",gap:3}}>
              <div style={{fontSize:10,color:T.textMuted,textAlign:"center"}}>Delivery</div>
              <div style={{height:4,borderRadius:2,background:T.border,overflow:"hidden"}}>
                <div style={{height:4,borderRadius:2,background:WA_GREEN,width:`${delivRate}%`}}/>
              </div>
              <div style={{fontSize:10,fontWeight:600,color:WA_GREEN,textAlign:"center"}}>{delivRate}%</div>
            </div>
            {/* Read rate */}
            <div style={{width:70,display:"flex",flexDirection:"column",gap:3}}>
              <div style={{fontSize:10,color:T.textMuted,textAlign:"center"}}>Read</div>
              <div style={{height:4,borderRadius:2,background:T.border,overflow:"hidden"}}>
                <div style={{height:4,borderRadius:2,background:"#8b5cf6",width:`${readRate}%`}}/>
              </div>
              <div style={{fontSize:10,fontWeight:600,color:"#8b5cf6",textAlign:"center"}}>{readRate}%</div>
            </div>
            {/* Status pills */}
            <div style={{display:"flex",gap:6,flexWrap:"nowrap"}}>
              {g.read>0&&<span style={{fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:20,background:"#f5f3ff",color:"#8b5cf6"}}>👁 {g.read}</span>}
              {g.delivered>0&&<span style={{fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:20,background:"#f0fdf4",color:WA_GREEN}}>✓✓ {g.delivered}</span>}
              {g.sent>0&&<span style={{fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:20,background:"#fffbeb",color:"#f59e0b"}}>✓ {g.sent}</span>}
              {g.failed>0&&<span style={{fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:20,background:"#fef2f2",color:"#ef4444"}}>✗ {g.failed}</span>}
            </div>
            <i className={`ti ti-chevron-${isOpen?"up":"down"}`} style={{fontSize:13,color:T.textMuted}}/>
          </div>

          {/* Expanded contact table */}
          {isOpen&&<div style={{borderTop:`1px solid ${T.border}`}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead>
                <tr style={{background:T.card2}}>
                  <th style={thStyle}>Contact</th>
                  <th style={thStyle}>Phone</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Sent</th>
                  <th style={thStyle}>Delivered</th>
                  <th style={thStyle}>Read</th>
                  <th style={{...thStyle,minWidth:160}}>Failure Reason</th>
                </tr>
              </thead>
              <tbody>
                {g.contacts.map((h,i)=>{
                  const cfg = sc(h.status);
                  return <tr key={i} style={{borderTop:`1px solid ${T.border}`,transition:"background .1s"}}
                    onMouseEnter={e=>e.currentTarget.style.background=T.card2}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <td style={{padding:"10px 14px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{width:28,height:28,borderRadius:"50%",background:`${cfg.color}15`,
                          display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
                          fontSize:11,fontWeight:700,color:cfg.color}}>
                          {(h.name||h.phone||"?")[0].toUpperCase()}
                        </div>
                        <span style={{fontSize:13,fontWeight:600,color:T.text}}>{h.name||"—"}</span>
                      </div>
                    </td>
                    <td style={{padding:"10px 14px",fontSize:12,color:T.textMuted,fontFamily:"monospace"}}>{h.phone}</td>
                    <td style={{padding:"10px 14px"}}>
                      <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"3px 10px",borderRadius:20,
                        background:cfg.bg,color:cfg.color,fontSize:11,fontWeight:600}}>
                        <i className={`ti ${cfg.icon}`} style={{fontSize:11}}/>{cfg.label}
                      </span>
                    </td>
                    <td style={{padding:"10px 14px",fontSize:12,color:T.textMuted}}>{fmtTime(h.sent_at)}</td>
                    <td style={{padding:"10px 14px",fontSize:12,color:T.textMuted}}>{h.delivered_at?fmtTime(h.delivered_at):"—"}</td>
                    <td style={{padding:"10px 14px",fontSize:12,color:T.textMuted}}>{h.read_at?fmtTime(h.read_at):"—"}</td>
                    <td style={{padding:"10px 14px",fontSize:12,color:"#ef4444",maxWidth:200}}>{h.failed_reason||"—"}</td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>}
        </div>;
      })}
    </div>
  </div>;
}


function CreateTemplatePanel({T, WA_GREEN, dark, API, authHeaders, authToken, isAdmin, broadcastClinic, step, setStep, submitting, setSubmitting, result, setResult, onSuccess}) {
  const inputStyle = {width:"100%",background:T.input,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 12px",color:T.text,fontSize:12,fontFamily:"inherit",boxSizing:"border-box",outline:"none",transition:"border-color .15s"};
  const labelStyle = {fontSize:11,fontWeight:600,color:T.textMuted,marginBottom:5,display:"block",letterSpacing:.2};

  const [category, setCategory] = React.useState("MARKETING");
  const [name, setName] = React.useState("");
  const [language, setLanguage] = React.useState("en");
  const [headerType, setHeaderType] = React.useState("none");
  const [headerText, setHeaderText] = React.useState("");
  const [headerSampleUrl, setHeaderSampleUrl] = React.useState("");
  const [bodyText, setBodyText] = React.useState("");
  const [footerText, setFooterText] = React.useState("");
  const [buttons, setButtons] = React.useState([]);
  const [varSamples, setVarSamples] = React.useState({}); // {1:"John", 2:"50%"}
  const [headerVarSample, setHeaderVarSample] = React.useState("");
  const [uploadingMedia, setUploadingMedia] = React.useState(false);
  const [localError, setLocalError] = React.useState("");
  const [mediaFile, setMediaFile] = React.useState(null); // stored locally until submit
  const [mediaPreview, setMediaPreview] = React.useState("");
  const [showEmojiPicker, setShowEmojiPicker] = React.useState(false);
  const showError = (msg) => {
    setLocalError(msg);
    setTimeout(()=>setLocalError(""),4000);
    // Also show as center toast
    const t=document.createElement("div");
    t.style.cssText=`position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:99999;background:#ef4444;color:#fff;padding:12px 24px;border-radius:12px;font-size:13px;font-weight:600;font-family:inherit;box-shadow:0 4px 20px rgba(0,0,0,.3);max-width:360px;text-align:center;`;
    t.textContent="❌ "+msg;
    document.body.appendChild(t);
    setTimeout(()=>{t.style.opacity="0";t.style.transition="opacity .3s";setTimeout(()=>document.body.removeChild(t),300);},4000);
  };

  // Detect variables in text
  const getVars = (text) => {
    const matches = [...new Set((text.match(/{{(\d+)}}/g)||[]).map(m=>m.replace(/[{}]/g,"")))];
    return matches.sort((a,b)=>parseInt(a)-parseInt(b));
  };

  const bodyVars = getVars(bodyText);
  const headerVars = headerType==="none" ? getVars(headerText) : [];
  const hasVars = bodyVars.length>0 || headerVars.length>0;
  const hasMedia = ["IMAGE","VIDEO","DOCUMENT"].includes(headerType);

  const addButton = (type) => {
    if(buttons.length>=10) return;
    const defaults = {
      QUICK_REPLY:{type:"QUICK_REPLY",text:""},
      URL:{type:"URL",text:"",url:"",urlVar:false},
      PHONE_NUMBER:{type:"PHONE_NUMBER",text:"",phone_number:""},
      COPY_CODE:{type:"COPY_CODE",example:""},
    };
    setButtons(prev=>[...prev, defaults[type]||{type,text:""}]);
  };

  const updateButton = (i, field, val) => setButtons(prev=>prev.map((b,idx)=>idx===i?{...b,[field]:val}:b));
  const removeButton = (i) => setButtons(prev=>prev.filter((_,idx)=>idx!==i));

  // Live preview
  const previewText = (text) => text.replace(/{{(\d+)}}/g, (_, n) => varSamples[n]||`[Variable ${n}]`);

  const handleSubmit = async () => {
    if(!name.trim()||!bodyText.trim()) return showError("Template name and body are required");
    if(name.length<3) return showError("Template name must be at least 3 characters");
    if(!/^[a-z0-9_]+$/.test(name)) return showError("Template name: lowercase letters, numbers and underscores only. No spaces.");
    if(/^\s*{{/.test(bodyText)) return showError("Variable cannot be at the start of the message. Add text before {{1}}.");
    if(/}}\s*$/.test(bodyText)) return showError("Variable cannot be at the end of the message. Add text after the variable.");
    // Check variable ratio — Meta requires at least 5 words per variable
    const varCount = bodyVars.length;
    const wordCount = bodyText.replace(/{{(\d+)}}/g,"").trim().split(/\s+/).filter(Boolean).length;
    if(varCount>0 && wordCount/varCount < 5) return showError(`Message too short for ${varCount} variable(s). Add more text or reduce variables. Meta requires at least 5 words per variable.`);
    if(hasMedia&&!headerSampleUrl.trim()) {
      if(mediaFile) return showError("File selected but upload failed. Please try again or paste a URL manually in the Sample field.");
      return showError("Please upload a file or paste a public URL in the Sample field.");
    }
    setSubmitting(true);

    // File already uploaded when selected — use the URL
    let finalMediaUrl = headerSampleUrl;
    try {
      const clinicId = isAdmin&&broadcastClinic ? (broadcastClinic.clinic_id||broadcastClinic.id) : null;
      const url = clinicId ? API+"/api/admin/clients/"+clinicId+"/templates/submit" : API+"/api/templates/submit";
      const payload = {
        template_name: name,
        language,
        category,
        header_type: headerType,
        header_value: headerText,
        header_sample_url: finalMediaUrl,
        header_var_sample: headerVarSample,
        body_text: bodyText,
        footer_text: footerText,
        buttons,
        var_samples: varSamples,
      };
      const token = sessionStorage.getItem("crm_token");
      const submitHeaders = {"Content-Type":"application/json","Authorization":"Bearer "+token};
      const r = await fetch(url, {method:"POST", headers:submitHeaders, body:JSON.stringify(payload)});
      const d = await r.json();
      if(r.ok) { setResult({success:true, status:d.status||"PENDING", currentStatus:d.status||"PENDING", name}); setStep(3); }
      else { setResult({success:false, error:d.error||d.message||"Submission failed"}); setStep(3); }
    } catch(e) { setResult({success:false, error:e.message}); setStep(3); }
    setSubmitting(false);
  };

  const categories = [
    {id:"MARKETING", icon:"📣", label:"Marketing", desc:"Promotions, offers, coupons, newsletters, announcements"},
    {id:"UTILITY", icon:"🔔", label:"Utility", desc:"Order updates, appointment reminders, shipping notifications"},
    {id:"AUTHENTICATION", icon:"🔐", label:"Authentication", desc:"OTP codes, verification messages"},
  ];

  const stepLabels = ["1. Set up","2. Edit template","3. Submit"];

  return (
    <div style={{flex:1,overflowY:"auto",padding:"0 20px 20px"}}>
      <div style={{padding:"16px 0 14px",borderBottom:`1px solid ${T.border}`,marginBottom:20,display:"flex",alignItems:"center",gap:10}}>
        <i className="ti ti-template" style={{fontSize:18,color:WA_GREEN}}/>
        <div>
          <div style={{fontWeight:700,fontSize:15,color:T.text}}>Create Template</div>
          <div style={{fontSize:11,color:T.textMuted}}>Submit a WhatsApp template to Meta for approval</div>
        </div>
      </div>

      {/* Step indicator */}
      <div style={{display:"flex",gap:0,marginBottom:24,background:T.card2,borderRadius:12,padding:4,border:`1px solid ${T.border}`}}>
        {stepLabels.map((l,i)=>(
          <div key={i} style={{flex:1,textAlign:"center",padding:"8px 4px",borderRadius:8,fontSize:11,fontWeight:700,
            background:step===i+1?WA_GREEN:"transparent",color:step===i+1?"#fff":step>i+1?WA_GREEN:T.textMuted,transition:"all .2s"}}>
            {step>i+1?"✅ ":""}{l}
          </div>
        ))}
      </div>

      {/* STEP 1 — Category */}
      {step===1&&<div>
        <div style={{fontWeight:700,fontSize:15,marginBottom:4,color:T.text}}>Choose a category</div>
        <div style={{fontSize:12,color:T.textMuted,marginBottom:16}}>Select the type that best describes your message template.</div>
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:20}}>
          {categories.map(c=>(
            <div key={c.id} onClick={()=>setCategory(c.id)}
              style={{padding:"12px 14px",borderRadius:10,border:`1px solid ${category===c.id?WA_GREEN:T.border}`,
                background:category===c.id?`${WA_GREEN}08`:T.card,cursor:"pointer",display:"flex",alignItems:"center",gap:12,transition:"all .15s"}}
              onMouseEnter={e=>{if(category!==c.id)e.currentTarget.style.borderColor=T.textFaint;}}
              onMouseLeave={e=>{if(category!==c.id)e.currentTarget.style.borderColor=T.border;}}>
              <div style={{width:18,height:18,borderRadius:"50%",border:`2px solid ${category===c.id?WA_GREEN:T.border}`,
                background:category===c.id?WA_GREEN:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all .15s"}}>
                {category===c.id&&<div style={{width:6,height:6,borderRadius:"50%",background:"#fff"}}/>}
              </div>
              <div style={{fontSize:18,flexShrink:0}}>{c.icon}</div>
              <div style={{flex:1}}>
                <div style={{fontWeight:600,fontSize:13,color:T.text}}>{c.label}</div>
                <div style={{fontSize:11,color:T.textMuted,marginTop:1}}>{c.desc}</div>
              </div>
              {category===c.id&&<i className="ti ti-check" style={{fontSize:16,color:WA_GREEN,flexShrink:0}}/>}
            </div>
          ))}
        </div>
        <button onClick={()=>setStep(2)} className="nx-btn primary"
          style={{width:"100%",justifyContent:"center",padding:"11px",fontSize:13,fontWeight:600}}>
          <i className="ti ti-arrow-right" style={{fontSize:14}}/> Continue
        </button>
      </div>}

      {/* STEP 2 — Edit template */}
      {step===2&&<div style={{display:"flex",gap:20,alignItems:"flex-start"}}>
        {/* Left — Form */}
        <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:14}}>

          {/* Name + Language */}
          <div style={{background:T.card,borderRadius:12,padding:16,border:`1px solid ${T.border}`}}>
            <div style={{fontWeight:600,fontSize:12,marginBottom:12,color:T.textMuted,textTransform:"uppercase",letterSpacing:.6}}>Template name and language</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div>
                <label style={labelStyle}>Name your template</label>
                <div style={{position:"relative"}}>
                  <input value={name} onChange={e=>setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,""))}
                    placeholder="e.g. welcome_offer_v1" maxLength={512}
                    style={{...inputStyle,borderColor:name&&name.length>0?(name.length>=3?"#16a34a":T.inputBorder):T.inputBorder}}/>
                  {name.length>=3&&<span style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",fontSize:14}}>✅</span>}
                </div>
                <div style={{fontSize:10,marginTop:4,color:name.length>0&&name.length<3?"#ef4444":T.textFaint}}>
                  {name.length>0&&name.length<3?"⚠️ Minimum 3 characters":"Lowercase letters, numbers, underscores only. No spaces."}
                </div>
              </div>
              <div>
                <label style={labelStyle}>Language</label>
                <select value={language} onChange={e=>setLanguage(e.target.value)} style={inputStyle}>
                  <option value="en">English</option>
                  <option value="en_US">English (US)</option>
                  <option value="ms">Malay</option>
                  <option value="zh_CN">Chinese (Simplified)</option>
                  <option value="zh_TW">Chinese (Traditional)</option>
                  <option value="hi">Hindi</option>
                  <option value="ta">Tamil</option>
                  <option value="ar">Arabic</option>
                  <option value="es">Spanish</option>
                  <option value="pt_BR">Portuguese (Brazil)</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                  <option value="id">Indonesian</option>
                  <option value="th">Thai</option>
                  <option value="vi">Vietnamese</option>
                  <option value="ko">Korean</option>
                  <option value="ja">Japanese</option>
                </select>
              </div>
            </div>
          </div>

          {/* Header */}
          <div style={{background:T.card,borderRadius:12,padding:16,border:`1px solid ${T.border}`}}>
            <div style={{fontWeight:700,fontSize:13,marginBottom:4,color:T.text}}>Header <span style={{fontSize:10,color:T.textFaint,fontWeight:400}}>Optional</span></div>
            {/* Media type selector — None means text header, Image/Video/Document means media */}
            <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
              {[{id:"none",label:"None"},{id:"IMAGE",label:"🖼️ Image"},{id:"VIDEO",label:"🎥 Video"},{id:"DOCUMENT",label:"📄 Document"}].map(ht=>(
                <button key={ht.id} onClick={()=>{setHeaderType(ht.id);setHeaderText("");setHeaderSampleUrl("");setHeaderVarSample("");setMediaFile(null);setMediaPreview("");}}
                  style={{padding:"5px 12px",borderRadius:20,border:`1px solid ${headerType===ht.id?WA_GREEN:T.border}`,
                    background:headerType===ht.id?WA_GREEN+"15":"transparent",color:headerType===ht.id?WA_GREEN:T.text,
                    fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                  {ht.label}
                </button>
              ))}
            </div>
            {/* None selected — show optional text input like Meta */}
            {headerType==="none"&&<>
              <input value={headerText} onChange={e=>setHeaderText(e.target.value)} maxLength={60}
                placeholder="Add a short line of text to the header of your message in English" style={inputStyle}/>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
                <button type="button" onClick={()=>{
                  const _hv=getVars(headerText);
                  const _hn=_hv.length>0?String(Math.max(..._hv.map(Number))+1):"1";
                  setHeaderText(prev=>prev+" {{"+_hn+"}}");
                }}
                  style={{fontSize:11,fontWeight:700,color:WA_GREEN,background:"none",border:`1px solid ${WA_GREEN}40`,
                    borderRadius:8,padding:"2px 8px",cursor:"pointer",fontFamily:"inherit"}}>
                  + Add variable
                </button>
                <span style={{fontSize:10,color:headerText.length>50?"#ef4444":T.textFaint}}>{headerText.length}/60</span>
              </div>
              {headerVars.length>0&&<div style={{marginTop:10,padding:"10px 12px",background:T.card2,borderRadius:8,border:`1px solid ${T.border}`}}>
                <div style={{fontSize:11,fontWeight:700,color:T.text,marginBottom:6}}>📋 Header variable sample</div>
                <div style={{fontSize:11,color:T.textMuted,marginBottom:8}}>Provide a sample value for Meta to review</div>
                {headerVars.map(v=>(
                  <div key={v} style={{marginBottom:6}}>
                    <label style={labelStyle}>Sample for {"{{"}{v}{"}}"}</label>
                    <input value={headerVarSample} onChange={e=>setHeaderVarSample(e.target.value)}
                      placeholder={`e.g. John`} style={inputStyle}/>
                  </div>
                ))}
              </div>}
            </>}
            {hasMedia&&<div style={{marginTop:8}}>
              <div style={{fontSize:10,color:T.textMuted,marginBottom:6}}>
                {headerType==="IMAGE"&&"✅ Supported: JPG, PNG, WEBP · Max 5MB"}
                {headerType==="VIDEO"&&"✅ Supported: MP4, 3GPP · Max 16MB"}
                {headerType==="DOCUMENT"&&"✅ Supported: PDF only · Max 100MB"}
              </div>
              <label style={labelStyle}>Sample {headerType.charAt(0)+headerType.slice(1).toLowerCase()} <span style={{color:"#ef4444"}}>*</span> <span style={{fontSize:10,color:T.textFaint,fontWeight:400}}>(used for Meta review only)</span></label>
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}>
                <input value={headerSampleUrl} onChange={e=>setHeaderSampleUrl(e.target.value)}
                  placeholder={headerType==="IMAGE"?"https://example.com/image.jpg":headerType==="VIDEO"?"https://example.com/video.mp4":"https://example.com/doc.pdf"}
                  style={{...inputStyle,flex:1}}/>
                <input type="file" id="tmpl-media-upload"
                  accept={headerType==="IMAGE"?"image/jpeg,image/jpg,image/png,image/webp":headerType==="VIDEO"?"video/mp4,video/3gpp,video/quicktime,video/*":"application/pdf"}
                  style={{display:"none"}}
                  onChange={async e=>{
                    const file = e.target.files[0];
                    if(!file) return;
                    // Validate format
                    const allowedImage = ["image/jpeg","image/jpg","image/png","image/webp"];
                    const allowedVideo = ["video/mp4","video/3gpp","video/3gp","video/quicktime","video/x-mp4"];
                    const allowedDoc = ["application/pdf"];
                    if(headerType==="IMAGE"&&!allowedImage.includes(file.type)){
                      showError("Invalid format. Image must be JPG, PNG or WEBP.");
                      e.target.value=""; return;
                    }
                    if(headerType==="VIDEO"&&!file.type.startsWith("video/")){
                      showError("Invalid format ("+file.type+"). Please upload a video file (MP4 recommended).");
                      e.target.value=""; return;
                    }
                    if(headerType==="DOCUMENT"&&!allowedDoc.includes(file.type)){
                      showError("Invalid format. Document must be PDF.");
                      e.target.value=""; return;
                    }
                    // Validate size
                    const maxSize = headerType==="IMAGE"?5:headerType==="VIDEO"?16:100;
                    if(file.size > maxSize*1024*1024){
                      showError(`File too large. Max size for ${headerType.toLowerCase()} is ${maxSize}MB.`);
                      e.target.value=""; return;
                    }
                    setMediaFile(file);
                    setUploadingMedia(true);
                    // Show local preview
                    if(headerType==="IMAGE"){const r=new FileReader();r.onload=ev=>setMediaPreview(ev.target.result);r.readAsDataURL(file);}
                    else if(headerType==="VIDEO"){setMediaPreview(URL.createObjectURL(file));}
                    else setMediaPreview(file.name);
                    // Upload using XHR to bypass service worker size limits
                    try {
                      const fd = new FormData();
                      fd.append("file", file);
                      const token = sessionStorage.getItem("crm_token");
                      const ext = file.name.split(".").pop().toLowerCase();
                      let uploadedUrl = "";
                      await new Promise((resolve) => {
                        const xhr = new XMLHttpRequest();
                        xhr.open("POST", API+"/api/upload/media");
                        xhr.setRequestHeader("Authorization", "Bearer "+token);
                        xhr.timeout = 60000;
                        xhr.onload = () => {
                          try {
                            const ud = JSON.parse(xhr.responseText);
                            if(ud.url) uploadedUrl = ud.url;
                            else if(ud.filename) uploadedUrl = "https://api.codt.my/media/"+ud.filename;
                          } catch(e) {}
                          resolve();
                        };
                        xhr.onerror = () => resolve();
                        xhr.ontimeout = () => resolve();
                        xhr.send(fd);
                      });
                      if(uploadedUrl) {
                        setHeaderSampleUrl(uploadedUrl);
                      } else {
                        try {
                          const r2 = await fetch(API+"/api/upload/last?ext="+ext, {headers:{"Authorization":"Bearer "+token}});
                          const d2 = await r2.json();
                          if(d2.url) setHeaderSampleUrl(d2.url);
                        } catch(e) {}
                      }
                    } catch(err) { showError("Upload failed: "+err.message); }
                    setUploadingMedia(false);
                    e.target.value="";
                  }}/>
                <button type="button" onClick={()=>document.getElementById("tmpl-media-upload").click()}
                  disabled={uploadingMedia}
                  style={{padding:"9px 14px",borderRadius:8,border:`1px solid ${T.border}`,background:uploadingMedia?"#f0fdf4":T.card2,color:T.text,fontSize:11,fontWeight:700,cursor:uploadingMedia?"wait":"pointer",whiteSpace:"nowrap",flexShrink:0,fontFamily:"inherit"}}>
                  {uploadingMedia?"⏳ Uploading...":mediaFile?"Change":"📎 Upload"}
                </button>
              </div>
              {mediaFile&&<div style={{padding:"8px 12px",background:T.card2,borderRadius:8,border:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                {headerType==="IMAGE"&&mediaPreview?<img src={mediaPreview} alt="preview" style={{height:40,borderRadius:6,objectFit:"cover"}}/>:<span>📄</span>}
                <div style={{flex:1}}>
                  <div style={{fontSize:11,fontWeight:700,color:T.text}}>{mediaFile.name}</div>
                  <div style={{fontSize:10,color:T.textMuted}}>{(mediaFile.size/1024).toFixed(1)} KB</div>
                </div>
                <button onClick={()=>{setMediaFile(null);setMediaPreview("");}} style={{border:"none",background:"none",cursor:"pointer",color:"#ef4444"}}>✕</button>
              </div>}
              <div style={{fontSize:10,color:T.textFaint}}>Upload a file from your device or paste a public URL. Will be uploaded to Meta during submission.</div>
            </div>}
          </div>

          {/* Body */}
          <div style={{background:T.card,borderRadius:12,padding:16,border:`1px solid ${T.border}`}}>
            <div style={{fontWeight:700,fontSize:13,marginBottom:4,color:T.text}}>Body <span style={{fontSize:10,color:"#ef4444",fontWeight:400}}>Required</span></div>
            <textarea value={bodyText} onChange={e=>setBodyText(e.target.value)} maxLength={1024} rows={5}
              placeholder={"Hello {{1}}, your appointment is confirmed for {{2}}."}
              style={{...inputStyle,resize:"vertical",minHeight:100,
                borderColor:bodyText&&(/^\s*{{/.test(bodyText)||/}}\s*$/.test(bodyText))?"#ef4444":T.inputBorder}}/>
            {bodyText&&/^\s*{{/.test(bodyText)&&<div style={{fontSize:10,color:"#ef4444",marginTop:4}}>⚠️ Variable cannot be at the start of the message. Add text before {"{{1}}"}.</div>}
            {bodyText&&/}}\s*$/.test(bodyText)&&<div style={{fontSize:10,color:"#ef4444",marginTop:4}}>⚠️ Variable cannot be at the end of the message. Add text after the variable.</div>}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:6}}>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                {[["B","*"],["I","_"],["S","~"]].map(([lbl])=>(
                  <div key={lbl} style={{width:26,height:26,borderRadius:6,border:`1px solid ${T.border}`,background:T.card2,
                    color:T.text,fontSize:11,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",
                    fontStyle:lbl==="I"?"italic":"normal",textDecoration:lbl==="S"?"line-through":"none"}}>{lbl}</div>
                ))}
                {/* Emoji picker button */}
                <div style={{position:"relative"}}>
                  <button type="button" onClick={()=>setShowEmojiPicker(p=>!p)}
                    style={{width:26,height:26,borderRadius:6,border:`1px solid ${T.border}`,background:T.card2,
                      fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
                    😊
                  </button>
                  {showEmojiPicker&&<div style={{position:"absolute",bottom:32,left:0,background:T.card,border:`1px solid ${T.border}`,
                    borderRadius:10,padding:8,zIndex:999,display:"flex",flexWrap:"wrap",gap:4,width:200,boxShadow:"0 4px 16px rgba(0,0,0,.15)"}}>
                    {["😊","👋","🎉","✅","🔥","💪","🌟","❤️","👍","📞","📅","💰","🏥","🎁","⚡","😍","🙏","💯","🚀","⭐","😄","💚","🎯","📢","🔔","💡","⏰","🌺","🤝","🎊","💫","😎","🌈","📱","💊","🏃","🌸","🍀","💎","🔑"].map(em=>(
                      <button key={em} type="button" onClick={()=>{setBodyText(prev=>prev+em);setShowEmojiPicker(false);}}
                        style={{width:28,height:28,borderRadius:6,border:"none",background:"transparent",fontSize:16,cursor:"pointer"}}>
                        {em}
                      </button>
                    ))}
                  </div>}
                </div>
              </div>
              <button type="button" onClick={()=>{
                const _vars=getVars(bodyText);
                const _next=_vars.length>0?String(Math.max(..._vars.map(Number))+1):"1";
                setBodyText(prev=>prev+" {{"+_next+"}}");
              }}
                style={{fontSize:11,fontWeight:700,color:WA_GREEN,background:"none",border:`1px solid ${WA_GREEN}40`,
                  borderRadius:8,padding:"4px 10px",cursor:"pointer",fontFamily:"inherit"}}>
                + Add variable
              </button>
            </div>
            <div style={{fontSize:10,color:bodyText.length>900?"#ef4444":bodyText.length>700?"#d97706":T.textFaint,marginTop:4,textAlign:"right"}}>{bodyText.length}/1024</div>
          </div>

          {/* Variable Samples */}
          {bodyVars.length>0&&<div style={{background:T.card2,borderRadius:12,padding:16,border:`1px solid ${T.border}`}}>
            <div style={{fontWeight:700,fontSize:13,marginBottom:4,color:T.text}}>Variable Samples</div>
            <div style={{fontSize:11,color:T.textMuted,marginBottom:12}}>Include samples of all variables to help Meta review your template. Do not include real customer information.</div>
            <div style={{fontWeight:600,fontSize:11,color:T.text,marginBottom:8}}>Body</div>
            {bodyVars.map(v=>(
              <div key={v} style={{display:"grid",gridTemplateColumns:"120px 1fr",gap:8,marginBottom:8,alignItems:"center"}}>
                <div style={{background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:8,padding:"7px 10px",fontSize:12,color:T.textMuted,fontFamily:"monospace"}}>{"{{"+v+"}}"}</div>
                <input value={varSamples[v]||""} onChange={e=>setVarSamples(p=>({...p,[v]:e.target.value}))}
                  placeholder={"Enter content for {{"+v+"}}"} style={inputStyle}/>
              </div>
            ))}
          </div>}

          {/* Footer */}
          <div style={{background:T.card,borderRadius:12,padding:16,border:`1px solid ${T.border}`}}>
            <div style={{fontWeight:700,fontSize:13,marginBottom:4,color:T.text}}>Footer <span style={{fontSize:10,color:T.textFaint,fontWeight:400}}>Optional / 60 chars</span></div>
            <input value={footerText} onChange={e=>setFooterText(e.target.value)} maxLength={60}
              placeholder="e.g. Reply STOP to unsubscribe" style={inputStyle}/>
            <div style={{fontSize:10,color:footerText.length>50?"#ef4444":T.textFaint,marginTop:4,textAlign:"right"}}>{footerText.length}/60</div>
          </div>

          {/* Buttons */}
          <div style={{background:T.card,borderRadius:12,padding:16,border:`1px solid ${T.border}`}}>
            <div style={{fontWeight:700,fontSize:13,marginBottom:4,color:T.text}}>Buttons <span style={{fontSize:10,color:T.textFaint,fontWeight:400}}>Optional — up to 3</span></div>
            <div style={{fontSize:11,color:T.textMuted,marginBottom:10}}>Create buttons that let customers respond or take action.</div>
            {buttons.map((btn,i)=>(
              <div key={i} style={{background:T.card2,borderRadius:10,padding:12,marginBottom:8,border:`1px solid ${T.border}`}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                  <span style={{fontSize:11,fontWeight:700,color:T.text}}>
                    {btn.type==="QUICK_REPLY"?"💬 Quick Reply":btn.type==="URL"?"🔗 Visit Website":btn.type==="PHONE_NUMBER"?"📞 Call Phone Number":btn.type==="COPY_CODE"?"📋 Copy Offer Code":"Button"}
                  </span>
                  <button onClick={()=>removeButton(i)} style={{border:"none",background:"none",cursor:"pointer",color:"#ef4444",fontSize:14}}>✕</button>
                </div>
                {btn.type!=="COPY_CODE"&&<>
                  <label style={labelStyle}>Button text</label>
                  <input value={btn.text||""} onChange={e=>updateButton(i,"text",e.target.value)}
                    placeholder="Button label (max 25 chars)" maxLength={25} style={{...inputStyle,marginBottom:8}}/>
                </>}
                {btn.type==="URL"&&<>
                  <label style={labelStyle}>Website URL</label>
                  <input value={btn.url||""} onChange={e=>updateButton(i,"url",e.target.value)}
                    placeholder="https://example.com" style={inputStyle}/>
                </>}
                {btn.type==="PHONE_NUMBER"&&<>
                  <label style={labelStyle}>Phone number</label>
                  <input value={btn.phone_number||""} onChange={e=>updateButton(i,"phone_number",e.target.value)}
                    placeholder="+601234567890" style={inputStyle}/>
                </>}
                {btn.type==="COPY_CODE"&&<>
                  <label style={labelStyle}>Sample offer code <span style={{color:"#ef4444"}}>*</span></label>
                  <input value={btn.example||""} onChange={e=>updateButton(i,"example",e.target.value)}
                    placeholder="e.g. SAVE20" style={inputStyle}/>
                  <div style={{marginTop:6,padding:"8px 10px",background:"#fffbeb",borderRadius:8,border:"1px solid #fde68a",fontSize:10,color:"#92400e"}}>
                    ⚠️ When sending broadcast, you'll need to enter the actual coupon code for each campaign.
                  </div>
                </>}
              </div>
            ))}
            {buttons.length<3&&<div>
              <div style={{fontSize:11,color:T.textMuted,marginBottom:8}}>Add button:</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {[
                  {type:"QUICK_REPLY",label:"💬 Quick Reply"},
                  {type:"URL",label:"🔗 Visit Website"},
                  {type:"PHONE_NUMBER",label:"📞 Call Phone Number"},
                  {type:"COPY_CODE",label:"📋 Copy Offer Code"},
                ].map(bt=>(
                  <button key={bt.type} onClick={()=>addButton(bt.type)}
                    style={{padding:"6px 12px",borderRadius:8,border:`1px solid ${T.border}`,background:T.card2,
                      color:T.text,fontSize:11,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>
                    {bt.label}
                  </button>
                ))}
              </div>
            </div>}
          </div>

          {/* Error message */}
          {localError&&<div style={{padding:"10px 14px",background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:10,fontSize:12,color:"#dc2626",fontWeight:600}}>
            ❌ {localError}
          </div>}

          {/* Actions */}
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>setStep(1)} className="nx-btn" style={{flex:1,justifyContent:"center",padding:"11px"}}>
              ← Back
            </button>
            <button onClick={handleSubmit} disabled={submitting||!name||!bodyText}
              className="nx-btn primary" style={{flex:2,justifyContent:"center",padding:"11px",
                opacity:submitting||!name||!bodyText?0.5:1,
                cursor:submitting||!name||!bodyText?"not-allowed":"pointer"}}>
              {submitting?(uploadingMedia?"⏳ Uploading...":"⏳ Submitting..."):"🚀 Submit for Review →"}
            </button>
          </div>
        </div>

        {/* Right — Live Preview (Phone) */}
        <div style={{width:240,flexShrink:0,position:"sticky",top:0}}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:10,color:T.text}}>📱 Preview</div>
          {/* Phone frame */}
          <div style={{width:260,margin:"0 auto",background:"#1a1a1a",borderRadius:36,padding:"12px 8px",boxShadow:"0 8px 32px rgba(0,0,0,.4)"}}>
            {/* Phone top bar */}
            <div style={{display:"flex",justifyContent:"center",marginBottom:8}}>
              <div style={{width:60,height:5,borderRadius:3,background:"#333"}}/>
            </div>
            {/* Screen */}
            <div style={{background:"#e5ddd5",borderRadius:24,overflow:"hidden",minHeight:480}}>
              {/* WhatsApp header bar */}
              <div style={{background:"#075e54",padding:"10px 12px",display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:28,height:28,borderRadius:"50%",background:"#128c7e",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"#fff",fontWeight:700}}>
                  {name?name[0].toUpperCase():"B"}
                </div>
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:"#fff"}}>{name||"Business"}</div>
                  <div style={{fontSize:9,color:"#b2dfdb"}}>template preview</div>
                </div>
              </div>
              {/* Chat area */}
              <div style={{padding:"10px 8px",minHeight:320}}>
                {/* Message bubble */}
                <div style={{maxWidth:"85%",background:"#fff",borderRadius:"0 10px 10px 10px",overflow:"hidden",boxShadow:"0 1px 2px rgba(0,0,0,.1)"}}>
                  {/* Header */}
                  {(headerType==="none"||headerType==="TEXT")&&previewText(headerText)&&
                    <div style={{padding:"8px 10px 4px",fontWeight:700,fontSize:11,color:"#1a1a1a"}}>{previewText(headerText)}</div>}
                  {headerType==="IMAGE"&&
                    <div style={{height:120,background:"#f0f0f0",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
                      {(mediaPreview||headerSampleUrl)
                        ?<img src={mediaPreview||headerSampleUrl} alt="header" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                        :<div style={{color:"#999",fontSize:11,textAlign:"center"}}>🖼️<br/>Image</div>}
                    </div>}
                  {headerType==="VIDEO"&&
                    <div style={{height:100,background:"#000",display:"flex",alignItems:"center",justifyContent:"center",position:"relative",overflow:"hidden"}}>
                      {mediaPreview?<video src={mediaPreview} style={{width:"100%",height:"100%",objectFit:"cover"}}/>:null}
                      <div style={{position:"absolute",width:32,height:32,borderRadius:"50%",background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                        <span style={{color:"#fff",fontSize:14}}>▶</span>
                      </div>
                    </div>}
                  {headerType==="DOCUMENT"&&
                    <div style={{padding:"8px 10px",background:"#f5f5f5",display:"flex",alignItems:"center",gap:6,borderBottom:"1px solid #eee"}}>
                      <span style={{fontSize:18}}>📄</span>
                      <span style={{fontSize:10,color:"#555"}}>{mediaFile?.name||"document.pdf"}</span>
                    </div>}
                  {/* Body */}
                  <div style={{padding:"6px 10px",fontSize:11,color:"#1a1a1a",lineHeight:1.5,whiteSpace:"pre-wrap"}}>
                    {previewText(bodyText)||<span style={{color:"#999",fontStyle:"italic"}}>Message body...</span>}
                  </div>
                  {/* Footer */}
                  {footerText&&<div style={{padding:"2px 10px 6px",fontSize:9,color:"#888"}}>{footerText}</div>}
                  {/* Timestamp */}
                  <div style={{padding:"0 10px 6px",fontSize:9,color:"#999",textAlign:"right"}}>11:59 ✓✓</div>
                </div>
                {/* Buttons */}
                {buttons.length>0&&<div style={{marginTop:4,display:"flex",flexDirection:"column",gap:3}}>
                  {buttons.slice(0,3).map((btn,i)=>(
                    <div key={i} style={{background:"#fff",borderRadius:8,padding:"8px",textAlign:"center",fontSize:10,fontWeight:600,color:"#0088cc",boxShadow:"0 1px 2px rgba(0,0,0,.1)"}}>
                      {btn.type==="URL"?"🔗 ":btn.type==="PHONE_NUMBER"?"📞 ":btn.type==="COPY_CODE"?"📋 ":"↩️ "}{btn.text||btn.example||"Button"}
                    </div>
                  ))}
                  {buttons.length>3&&<div style={{background:"#fff",borderRadius:8,padding:"8px",textAlign:"center",fontSize:10,color:"#0088cc"}}>
                    ☰ See all options
                  </div>}
                </div>}
              </div>
            </div>
            {/* Phone bottom */}
            <div style={{display:"flex",justifyContent:"center",marginTop:8}}>
              <div style={{width:40,height:5,borderRadius:3,background:"#333"}}/>
            </div>
          </div>
          <div style={{marginTop:10,padding:"10px 12px",background:T.card2,borderRadius:10,border:`1px solid ${T.border}`}}>
            <div style={{fontSize:11,fontWeight:700,color:T.text,marginBottom:4}}>Good for</div>
            <div style={{fontSize:11,color:T.textMuted}}>
              {category==="MARKETING"?"Promotions, offers, newsletters":
               category==="UTILITY"?"Order updates, reminders":
               "OTP codes, verification"}
            </div>
          </div>
        </div>
      </div>}

      {/* STEP 3 — Result */}
      {step===3&&result&&<div style={{textAlign:"center",padding:"40px 20px"}}>
        {result.success
          ?<>
            <div style={{fontSize:64,marginBottom:16}}>🎉</div>
            <div style={{fontWeight:800,fontSize:20,color:WA_GREEN,marginBottom:8}}>Template Submitted!</div>
            <div style={{fontSize:13,color:T.textMuted,marginBottom:6}}><strong>"{result.name}"</strong> has been submitted to Meta for review.</div>
            <div style={{display:"inline-flex",alignItems:"center",gap:8,padding:"6px 14px",borderRadius:20,
              background:result.currentStatus==="APPROVED"?"#dcfce7":result.currentStatus==="REJECTED"?"#fef2f2":"#fef3c7",
              color:result.currentStatus==="APPROVED"?"#16a34a":result.currentStatus==="REJECTED"?"#dc2626":"#d97706",
              fontSize:12,fontWeight:700,marginBottom:8}}>
              {result.currentStatus==="APPROVED"?"✅ APPROVED":result.currentStatus==="REJECTED"?"❌ REJECTED":"⏳ "+(result.currentStatus||"PENDING REVIEW")}
              <button onClick={async()=>{
                try {
                  const clinicId = isAdmin&&broadcastClinic?(broadcastClinic.clinic_id||broadcastClinic.id):null;
                  const url = clinicId ? `${API}/api/admin/clients/${clinicId}/templates/status?name=${result.name}` : `${API}/api/templates/status?name=${result.name}`;
                  const r = await fetch(url, {headers:authHeaders()});
                  const d = await r.json();
                  if(d.status) setResult(prev=>({...prev,currentStatus:d.status}));
                } catch(e) {}
              }} style={{border:"none",background:"none",cursor:"pointer",fontSize:12,padding:"0 4px"}}>
                🔄
              </button>
            </div>
            {result.currentStatus==="APPROVED"&&<div style={{fontSize:12,color:"#16a34a",fontWeight:600,marginBottom:12}}>Template is now available in Send Broadcast!</div>}
            <div style={{fontSize:12,color:T.textMuted,marginBottom:24}}>Meta usually reviews templates within a few minutes to 24 hours.</div>
            <div style={{display:"flex",gap:10,justifyContent:"center"}}>
              <button onClick={()=>{setStep(1);setName("");setBodyText("");setHeaderText("");setFooterText("");setButtons([]);setVarSamples({});setResult(null);setHeaderSampleUrl("");setMediaFile(null);setMediaPreview("");}}
                style={{padding:"10px 20px",borderRadius:10,border:`1px solid ${T.border}`,background:T.card,color:T.text,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                Create Another
              </button>
              <button onClick={onSuccess}
                style={{padding:"10px 20px",borderRadius:10,border:"none",background:WA_GREEN,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                View All Templates →
              </button>
            </div>
          </>
          :<>
            <div style={{fontSize:64,marginBottom:16}}>❌</div>
            <div style={{fontWeight:800,fontSize:20,color:"#ef4444",marginBottom:8}}>Submission Failed</div>
            <div style={{fontSize:12,color:T.textMuted,background:T.card2,padding:"10px 14px",borderRadius:8,marginBottom:20,textAlign:"left"}}>{result.error}</div>
            <button onClick={()=>setStep(2)}
              style={{padding:"10px 20px",borderRadius:10,border:"none",background:WA_GREEN,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
              ← Try Again
            </button>
          </>
        }
      </div>}
    </div>
  );
}

// ── AI PROMPT IMPROVER COMPONENT ─────────────────────────────────────────────
function AIPromptImprover({T, WA_GREEN, dark, API, authHeaders, kbClinic, systemPrompt, setSystemPrompt, qaData, setQaData, fetchKnowledge, authToken, onViewChat, improverResult, setImproverResult, improverDays, setImproverDays, isAdmin=false, appliedQAIds, setAppliedQAIds}) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  // Use parent-level state so applied items persist across tab switches
  const appliedQA = appliedQAIds || new Set();
  const setAppliedQA = setAppliedQAIds || (() => {});
  const [duplicateQA, setDuplicateQA] = React.useState(new Set()); // tracks duplicate attempts
  const [appliedPrompt, setAppliedPrompt] = React.useState(new Set());
  const [savingPrompt, setSavingPrompt] = React.useState(false);

  // Use lifted state — survives tab switches
  const result = improverResult;
  const setResult = setImproverResult;
  const days = improverDays;
  const setDays = setImproverDays;

  const caseLabels = {
    case1:{icon:"👤",label:"Agent Takeover",color:"#2563eb",bg:"#eff6ff",border:"#bfdbfe"},
    case2:{icon:"😶",label:"Silent Lead",color:"#7c3aed",bg:"#f5f3ff",border:"#ddd6fe"},
    case3:{icon:"❌",label:"No Booking",color:"#d97706",bg:"#fffbeb",border:"#fde68a"},
    case4:{icon:"🔁",label:"Repeated Question",color:"#0891b2",bg:"#ecfeff",border:"#a5f3fc"},
    case5:{icon:"🔧",label:"Bot Correction",color:"#e11d48",bg:"#fff1f3",border:"#fecdd3"},
    case6:{icon:"😤",label:"Frustrated Customer",color:"#dc2626",bg:"#fef2f2",border:"#fca5a5"},
  };

  const getCaseStyle = (label) => {
    for(const [k,v] of Object.entries(caseLabels)){
      if(v.label===label||(label||"").toLowerCase().includes(v.label.toLowerCase())) return v;
    }
    return {icon:"⚠️",label:label||"Issue",color:T.textMuted,bg:T.card2,border:"#e8eaef"};
  };

  const analyse = async () => {
    setLoading(true); setResult(null); setError(""); setAppliedQA(new Set()); setAppliedPrompt(new Set()); // fresh analysis clears applied state
    try {
      const r = await fetch(`${API}/api/knowledge/analyse-and-improve`, {
        method:"POST", headers:authHeaders(),
        body: JSON.stringify({clinic_id: kbClinic?.clinic_id||undefined, days})
      });
      const d = await r.json();
      if(!r.ok) { setError(d.error||"Failed"); return; }
      setResult(d);
    } catch(e) { setError("Network error — " + e.message); }
    setLoading(false);
  };

  const applyQA = async (qa, idx) => {
    // Check for duplicate in existing KB
    const isDuplicate = qaData && qaData.some(existing =>
      existing.question?.toLowerCase().trim() === qa.question?.toLowerCase().trim()
    );
    if(isDuplicate) {
      setDuplicateQA(p=>new Set([...p, idx]));
      setTimeout(()=>setDuplicateQA(p=>{const n=new Set(p);n.delete(idx);return n;}), 3000);
      return;
    }
    try {
      const clinicId = kbClinic?.clinic_id || kbClinic?.id || null;
      const r = await fetch(`${API}/api/knowledge/qa`, {
        method:"POST", headers:authHeaders(),
        body: JSON.stringify({question:qa.question, answer:qa.answer, ...(clinicId?{clinic_id:clinicId}:{})})
      });
      if(r.ok) { setAppliedQA(p=>new Set([...p, idx])); fetchKnowledge(clinicId); }
    } catch {}
  };

  const applyPromptChange = async (suggestion, idx) => {
    const newPrompt = systemPrompt + "\n\n" + suggestion.suggested_rule;
    setSystemPrompt(newPrompt);
    setAppliedPrompt(p=>new Set([...p, idx]));
    setSavingPrompt(true);
    try {
      const clinicId = kbClinic?.clinic_id || kbClinic?.id || null;
      const body = {prompt: newPrompt};
      if(clinicId) body.clinic_id = clinicId;
      await fetch(`${API}/api/knowledge/prompt`, {method:"PATCH", headers:authHeaders(), body:JSON.stringify(body)});
    } catch {}
    setSavingPrompt(false);
  };

  const statsTotal = result ? Object.values(result.stats||{}).reduce((a,b)=>a+b,0) : 0;

  return (
    <div style={{background:dark?"#1a1f2e":`${WA_GREEN}10`,border:"2px solid rgba(108,99,255,.2)",borderRadius:16,padding:20,marginBottom:20}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:16}}>
        <div style={{width:42,height:42,borderRadius:12,background:"linear-gradient(135deg,#6c63ff,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0,boxShadow:"0 2px 10px rgba(108,99,255,.25)"}}>🤖</div>
        <div style={{flex:1}}>
          <div style={{fontWeight:800,fontSize:15,color:T.text}}>AI Prompt Improver</div>
          <div style={{fontSize:11,color:T.textMuted,marginTop:2,lineHeight:1.6}}>Analyses 6 types of bot failures from real conversations — suggests exact prompt rules and Q&A to fix them.</div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
          <select value={days} onChange={e=>setDays(parseInt(e.target.value))}
            style={{padding:"6px 10px",borderRadius:8,border:`1px solid ${T.border}`,background:T.card,color:T.text,fontSize:12,fontFamily:"inherit",outline:"none"}}>
            <option value={3}>Last 3 days</option>
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
          </select>
          <button onClick={analyse} disabled={loading}
            style={{padding:"8px 18px",borderRadius:10,border:"none",background:loading?"#94a3b8":"linear-gradient(135deg,#6c63ff,#5a52e0)",color:"#fff",fontSize:12,fontWeight:700,cursor:loading?"not-allowed":"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:6,boxShadow:loading?"none":"0 2px 10px rgba(108,99,255,.25)"}}>
            {loading?"⏳ Analysing...":"🔍 Analyse & Suggest"}
          </button>
          {result&&!loading&&<button onClick={()=>{setResult(null);setAppliedQA(new Set());setAppliedPrompt(new Set());setError("");}}
            style={{padding:"8px 14px",borderRadius:10,border:"1px solid #fecdd3",background:"#fff1f3",color:"#e11d48",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
            🗑️ Clear
          </button>}
        </div>
      </div>

      {!kbClinic&&isAdmin&&<div style={{padding:"10px 14px",background:"#fffbeb",borderRadius:8,fontSize:12,color:"#92400e",border:"1px solid #fde68a"}}>⚠️ Select a client from the sidebar first</div>}
      {error&&<div style={{padding:"10px 14px",background:"#fef2f2",borderRadius:8,fontSize:12,color:"#dc2626",border:"1px solid #fca5a5"}}>❌ {error}</div>}

      {loading&&<div style={{textAlign:"center",padding:32}}>
        <div style={{fontSize:36,marginBottom:10}}>🤖</div>
        <div style={{fontWeight:700,fontSize:14,color:T.text,marginBottom:4}}>Analysing conversations...</div>
        <div style={{fontSize:11,color:T.textMuted}}>Checking 6 types of bot failures across last {days} days</div>
      </div>}

      {result&&!loading&&<>
        {/* Stats row */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:6,marginBottom:16}}>
          {Object.entries(caseLabels).map(([k,v])=>(
            <div key={k} style={{background:T.card,borderRadius:10,padding:"8px 6px",border:`1px solid ${T.border}`,textAlign:"center"}}>
              <div style={{fontSize:16}}>{v.icon}</div>
              <div style={{fontSize:16,fontWeight:800,color:result.stats?.[k]>0?v.color:T.textFaint,lineHeight:1,marginTop:2}}>{result.stats?.[k]||0}</div>
              <div style={{fontSize:8,color:T.textFaint,marginTop:2,lineHeight:1.3}}>{v.label}</div>
            </div>
          ))}
        </div>

        {statsTotal===0&&<div style={{textAlign:"center",padding:24,color:T.textMuted}}>
          <div style={{fontSize:28,marginBottom:8}}>✅</div>
          <div style={{fontWeight:600}}>No issues found in this period!</div>
          <div style={{fontSize:11,marginTop:4}}>Bot is handling conversations well.</div>
        </div>}

        {result.message&&<div style={{padding:"10px 14px",background:"#f0fdf4",borderRadius:8,fontSize:12,color:"#16a34a",border:"1px solid #bbf7d0",marginBottom:12}}>{result.message}</div>}

        {/* Side by side diff */}
        {(result.prompt_suggestions?.length>0||result.qa_suggestions?.length>0)&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>

          {/* LEFT — Prompt Changes */}
          <div>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}>
              <span style={{background:"#fffbeb",color:"#d97706",border:"1px solid #fde68a",borderRadius:6,padding:"2px 8px",fontSize:10,fontWeight:700}}>PROMPT CHANGES</span>
              {savingPrompt&&<span style={{fontSize:10,color:T.textMuted}}>Saving...</span>}
            </div>
            {result.prompt_suggestions?.length===0&&<div style={{padding:16,background:T.card,borderRadius:10,border:`1px solid ${T.border}`,fontSize:11,color:T.textMuted,textAlign:"center"}}>No prompt changes needed</div>}
            {result.prompt_suggestions?.map((s,i)=>{
              const cs = getCaseStyle(s.case_label);
              return (
              <div key={i} style={{background:T.card,borderRadius:12,border:`1px solid ${appliedPrompt.has(i)?"#86efac":T.border}`,marginBottom:10,overflow:"hidden",opacity:appliedPrompt.has(i)?.7:1,transition:"all .2s"}}>
                {/* Case badge */}
                <div style={{padding:"8px 12px",background:cs.bg,borderBottom:`1px solid ${cs.border}`,display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:12}}>{cs.icon}</span>
                  <span style={{fontSize:10,fontWeight:700,color:cs.color}}>{cs.label}</span>
                </div>
                {/* Issue */}
                <div style={{padding:"8px 12px",borderBottom:`1px solid ${T.border}`,background:"#fef2f2"}}>
                  <div style={{fontSize:10,fontWeight:700,color:"#e11d48",marginBottom:2}}>❌ ISSUE</div>
                  <div style={{fontSize:12,color:T.text,fontWeight:600}}>{s.issue}</div>
                </div>
                {s.current_rule&&<div style={{padding:"8px 12px",borderBottom:`1px solid ${T.border}`,background:"#fff7ed"}}>
                  <div style={{fontSize:10,fontWeight:700,color:"#d97706",marginBottom:2}}>📋 CURRENT RULE</div>
                  <div style={{fontSize:11,color:"#92400e",fontStyle:"italic",lineHeight:1.5}}>{s.current_rule}</div>
                </div>}
                <div style={{padding:"8px 12px",borderBottom:`1px solid ${T.border}`,background:"#f0fdf4"}}>
                  <div style={{fontSize:10,fontWeight:700,color:"#16a34a",marginBottom:2}}>✅ SUGGESTED RULE</div>
                  <div style={{fontSize:11,color:"#166534",lineHeight:1.5}}>{s.suggested_rule}</div>
                </div>
                {/* Affected contacts */}
                {s.affected_contacts?.length>0&&<div style={{padding:"8px 12px",borderBottom:`1px solid ${T.border}`,background:T.card2}}>
                  <div style={{fontSize:10,fontWeight:700,color:T.textMuted,marginBottom:5}}>👤 Triggered by {s.affected_contacts.length} conversation{s.affected_contacts.length>1?"s":""}:</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                    {s.affected_contacts.slice(0,4).map((name,j)=>(
                      <button key={j} onClick={()=>onViewChat&&onViewChat(name)}
                        style={{fontSize:10,padding:"2px 8px",borderRadius:20,border:"1px solid #bfdbfe",background:"#eff6ff",color:"#2563eb",cursor:"pointer",fontFamily:"inherit",fontWeight:600,transition:"all .15s"}}
                        onMouseEnter={e=>{e.currentTarget.style.background="#dbeafe"}} onMouseLeave={e=>{e.currentTarget.style.background="#eff6ff"}}>
                        {name} →
                      </button>
                    ))}
                    {s.affected_contacts.length>4&&<span style={{fontSize:10,color:T.textFaint}}>+{s.affected_contacts.length-4} more</span>}
                  </div>
                </div>}
                <div style={{padding:"8px 12px",display:"flex",alignItems:"center",gap:8}}>
                  <div style={{fontSize:10,color:T.textMuted,flex:1,lineHeight:1.5}}>💡 {s.reason}</div>
                  {appliedPrompt.has(i)
                    ?<span style={{fontSize:11,color:"#16a34a",fontWeight:700,flexShrink:0}}>✅ Applied</span>
                    :<button onClick={()=>applyPromptChange(s,i)}
                      style={{padding:"5px 14px",borderRadius:8,border:"none",background:"linear-gradient(135deg,#6c63ff,#5a52e0)",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>
                      ✅ Apply
                    </button>}
                </div>
              </div>
            );})}
          </div>

          {/* RIGHT — Q&A to Add */}
          <div>
            <div style={{marginBottom:10}}>
              <span style={{background:"#f0fdf4",color:"#16a34a",border:"1px solid #bbf7d0",borderRadius:6,padding:"2px 8px",fontSize:10,fontWeight:700}}>Q&A TO ADD</span>
            </div>
            {result.qa_suggestions?.length===0&&<div style={{padding:16,background:T.card,borderRadius:10,border:`1px solid ${T.border}`,fontSize:11,color:T.textMuted,textAlign:"center"}}>No Q&A additions needed</div>}
            {result.qa_suggestions?.map((q,i)=>{
              const cs = getCaseStyle(q.case_label);
              return (
              <div key={i} style={{background:T.card,borderRadius:12,border:`1px solid ${appliedQA.has(i)?"#86efac":T.border}`,marginBottom:10,overflow:"hidden",opacity:appliedQA.has(i)?.7:1,transition:"all .2s"}}>
                {/* Case badge */}
                <div style={{padding:"8px 12px",background:cs.bg,borderBottom:`1px solid ${cs.border}`,display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:12}}>{cs.icon}</span>
                  <span style={{fontSize:10,fontWeight:700,color:cs.color}}>{cs.label}</span>
                </div>
                <div style={{padding:"8px 12px",borderBottom:`1px solid ${T.border}`}}>
                  <div style={{fontSize:10,fontWeight:700,color:WA_GREEN,marginBottom:2}}>Q:</div>
                  <div style={{fontSize:12,fontWeight:600,color:T.text}}>{q.question}</div>
                </div>
                <div style={{padding:"8px 12px",borderBottom:`1px solid ${T.border}`,background:T.card2}}>
                  <div style={{fontSize:10,fontWeight:700,color:"#16a34a",marginBottom:2}}>A:</div>
                  <div style={{fontSize:11,color:T.text,lineHeight:1.5}}>{q.answer}</div>
                </div>
                {/* Affected contacts */}
                {q.affected_contacts?.length>0&&<div style={{padding:"8px 12px",borderBottom:`1px solid ${T.border}`,background:T.card2}}>
                  <div style={{fontSize:10,fontWeight:700,color:T.textMuted,marginBottom:5}}>👤 Triggered by {q.affected_contacts.length} conversation{q.affected_contacts.length>1?"s":""}:</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                    {q.affected_contacts.slice(0,4).map((name,j)=>(
                      <button key={j} onClick={()=>onViewChat&&onViewChat(name)}
                        style={{fontSize:10,padding:"2px 8px",borderRadius:20,border:"1px solid #bfdbfe",background:"#eff6ff",color:"#2563eb",cursor:"pointer",fontFamily:"inherit",fontWeight:600,transition:"all .15s"}}
                        onMouseEnter={e=>{e.currentTarget.style.background="#dbeafe"}} onMouseLeave={e=>{e.currentTarget.style.background="#eff6ff"}}>
                        {name} →
                      </button>
                    ))}
                    {q.affected_contacts.length>4&&<span style={{fontSize:10,color:T.textFaint}}>+{q.affected_contacts.length-4} more</span>}
                  </div>
                </div>}
                <div style={{padding:"8px 12px",display:"flex",alignItems:"center",gap:8}}>
                  <div style={{fontSize:10,color:T.textMuted,flex:1,lineHeight:1.5}}>💡 {q.reason}</div>
                  {appliedQA.has(i)
                    ?<span style={{fontSize:11,color:"#16a34a",fontWeight:700,flexShrink:0}}>✅ Added</span>
                    :duplicateQA.has(i)
                      ?<span style={{fontSize:11,color:"#d97706",fontWeight:700,flexShrink:0,background:"#fffbeb",padding:"4px 10px",borderRadius:8,border:"1px solid #fde68a"}}>⚠️ Already in KB</span>
                      :<button onClick={()=>applyQA(q,i)}
                        style={{padding:"5px 14px",borderRadius:8,border:"none",background:"#16a34a",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>
                        ➕ Add to KB
                      </button>}
                </div>
              </div>
            );})}
          </div>
        </div>}
      </>}
    </div>
  );
}

