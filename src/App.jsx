import React, { useState, useEffect, useRef, useCallback } from "react";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from "recharts";

const API = "https://api.codt.my";
const CRM_VERSION = "2.9.8";

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
  // Server returns Malaysia time directly
  return timeStr;
};

const getColor = n => { let h=0; for(let c of (n||"?")) h=c.charCodeAt(0)+((h<<5)-h); return COLORS[Math.abs(h)%COLORS.length]; };
const ts = () => new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",hour12:true});
const today = () => new Date().toISOString().split("T")[0];
const daysAgo = n => { const d=new Date(); d.setDate(d.getDate()-n); return d.toISOString().split("T")[0]; };

const TABS = [
  {id:"crm",          icon:"💬", label:"Inbox"},
  {id:"leads",        icon:"🎯", label:"Leads"},
  {id:"analytics",    icon:"📊", label:"Analytics"},
  {id:"bot",          icon:"🤖", label:"Test Bot"},
  {id:"kb",           icon:"📋", label:"Knowledge"},
  {id:"integrations", icon:"🔌", label:"Integrations"},
  {id:"settings",     icon:"⚙️", label:"Settings"},
  {id:"broadcast",    icon:"📢", label:"Broadcast"},
  {id:"admin",        icon:"👑", label:"Admin", adminOnly:true},
];

export default function App() {
  // ── AUTH ──
  const {w:winW} = useWindowSize();
  const isMobile = winW < 640;
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [backendStatus, setBackendStatus] = useState("checking");
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
  const setSelectedClinicWithRef = (c) => {
    selectedClinicRef.current = c;
    setSelectedClinic(c);
  };
  // For admin viewing KB/Settings of a specific client
  const [adminViewClinic, setAdminViewClinic] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [leadsClinic, setLeadsClinic] = useState(null);
  const [settingsClinic, setSettingsClinic] = useState(null);
  const [clientSettings, setClientSettings] = useState(null);
  const [inboxClinic, setInboxClinic] = useState(null);
  const [kbClinic, setKbClinic] = useState(null);
  const [dateFrom, setDateFrom] = useState(daysAgo(29));
  const [dateTo, setDateTo] = useState(today());
  const [datePreset, setDatePreset] = useState("30d");
  const [archiveConfirm, setArchiveConfirm] = useState(null);
  const [bulkBotModal, setBulkBotModal] = useState(null);
  const [exportModal, setExportModal] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [newTemplate, setNewTemplate] = useState({template_name:"",language:"en",category:"MARKETING",header_type:"none",header_value:"",body_text:"",footer_text:"",variables:[],status:"pending"});
  const [broadcastContacts, setBroadcastContacts] = useState([]);
  const [broadcastProgress, setBroadcastProgress] = useState(null);
  const [broadcastFile, setBroadcastFile] = useState(null);
  const [exportKeywords, setExportKeywords] = useState("");
  const [exportDateFrom, setExportDateFrom] = useState("");
  const [exportDateTo, setExportDateTo] = useState("");
  const [exportLoading, setExportLoading] = useState(false); // {total, done, active}
  const [botConvo, setBotConvo] = useState([{from:"bot",text:"👋 Hi! I'm Sara from Nexora 😊\nHow can I help you today?",time:ts(),sources:[]}]);
  const [botInput, setBotInput] = useState("");
  const [botLoading, setBotLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState({});
  const [showChangelog, setShowChangelog] = useState(false);
  const [changelogSeen, setChangelogSeen] = useState("");
  const [dark, setDark] = useState(false);

  const isAdmin = currentUser?.role === "admin";

  function safeSetTab(newTab) {
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
    const map = { crm:"can_inbox", leads:"can_leads", analytics:"can_analytics", bot:"can_testbot", kb:"can_knowledge", settings:"can_settings", integrations:"can_integrations", broadcast:"can_integrations", admin:false };
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

  // Session guard — runs immediately and every 10 seconds
  useEffect(() => {
    if(!authToken || !currentUser || currentUser.role==="admin") return;

    const kickOut = (msg) => {
      sessionStorage.clear();
      alert(msg);
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
      const res = await fetch(`${API}/api/conversations${clinicParam}`, {headers:authHeaders()});
      if (!res.ok) throw new Error();
      const data = await res.json();
      setContacts(prev => {
        return data.map(newC => {
          if (selected?.id === newC.id) return {...newC, unread: 0};
          return newC;
        });
      });
      setBackendStatus("online");
      try {
        const vr = await fetch(`${API}/version`);
        if (vr.ok) { const vd = await vr.json(); setBackendVersion(vd.version||""); }
      } catch {}
      if (selected) { const u = data.find(c=>c.id===selected.id); if (u) setSelected(prev => ({...prev, botActive: u.botActive, status: u.status, lead: u.lead})); }
    } catch { setBackendStatus("offline"); }
    finally { setLoading(false); }
  }, [selected]);

const fetchTemplates = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/templates`, {headers:authHeaders()});
      if(r.ok) setTemplates(await r.json());
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
        alert("⚠️ You have been logged out because this account was logged in on another device.");
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
          ai_enabled:           d.bot_enabled===false?"false":"true",
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

  useEffect(() => {
    fetchConversations(); fetchKnowledge(); fetchSettings(); fetchClinicUsers(); refreshPermissions();
  }, []);

  useEffect(() => {
    fetchConversations();
    fetch(`${API}/api/ai-status`).then(r=>r.json()).then(setAiStatus).catch(()=>{});
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(fetchConversations, 10000); // 10s — easier on backend
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  useEffect(() => {
    if(newTab==="broadcast") { fetchTemplates(); }
    if(tab==="analytics") {
      fetchAnalytics(dateFrom, dateTo, selectedClinicRef.current?.clinic_id||null);
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
      if(newTab==="broadcast") { fetchTemplates(); }
    if(tab==="analytics") {
        // Use ref to get current selectedClinic value
        fetchAnalytics(dateFrom, dateTo, selectedClinicRef.current?.clinic_id||null);
        if(isAdmin) fetchAdminOverview();
      }
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

  async function selectContact(c) {
    setSelected(c); setMenuOpen(false);
    try { await fetch(`${API}/api/conversations/${c.id}/read`,{method:"PATCH",headers:authHeaders()}); } catch {}
    setContacts(p=>p.map(x=>x.id===c.id?{...x,unread:0}:x));
  }

  async function archiveContact(id) {
    try {
      await fetch(`${API}/api/conversations/${id}/archive`,{method:"PATCH",headers:authHeaders(),body:JSON.stringify({archived:true})});
      setContacts(p=>p.filter(x=>x.id!==id));
      if(selected?.id===id) setSelected(null);
    } catch {}
    setArchiveConfirm(null);
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
        alert(`❌ Failed to send: ${err.error||r.status}\n\nCheck:\n1. WhatsApp token not expired\n2. Customer messaged within last 24 hours`);
        // Remove temp message on failure
        setSelected(prev => ({ ...prev, messages: prev.messages.filter(m=>m.id!==tempMsg.id) }));
      }
    } catch(e) {
      alert("❌ Network error — backend may be offline. Check: " + API + "/health");
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
    try { await fetch(`${API}/api/conversations/${id}/lead`,{method:"PATCH",headers:authHeaders(),body:JSON.stringify({lead})}); fetchConversations(); } catch {}
  }

  async function setPipelineStage(id,stage) {
    try { await fetch(`${API}/api/conversations/${id}/pipeline`,{method:"PATCH",headers:authHeaders(),body:JSON.stringify({stage})}); fetchConversations(); } catch {}
  }

  async function sendFollowup(phone,followupNum) {
    setSendingFollowup(phone);
    try { const r=await fetch(`${API}/api/conversations/${phone}/followup`,{method:"POST",headers:authHeaders(),body:JSON.stringify({followupNum})}); if(r.ok){fetchConversations();alert("✅ Follow-up sent!");}else alert("❌ Failed"); } catch{alert("❌ Error");}
    setSendingFollowup(null);
  }

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
            anthropic_key:        appSettings.anthropic_key||"",
            openai_key:           appSettings.openai_key||"",
            groq_key:             appSettings.groq_key||"",
            bot_enabled:          appSettings.ai_enabled!=="false",
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
        alert("Please select a client from the sidebar first before saving settings.");
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
    if(!confirm("Delete?")) return;
    try { await fetch(`${API}/api/knowledge/qa/${id}`,{method:"DELETE",headers:authHeaders()}); fetchKnowledge(kbClinic?.clinic_id); } catch {}
  }

  function parseBotResponse(raw) {
    const lines=raw.trim().split("\n"); let sources=[],text=raw.trim();
    try{const l=lines[lines.length-1].trim();if(l.startsWith('{"sources"')){sources=JSON.parse(l).sources||[];text=lines.slice(0,-1).join("\n").trim();}}catch{}
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
  async function onDrop(e,stage){e.preventDefault();setDragOver(null);const id=e.dataTransfer.getData("contactId");if(id)await setPipelineStage(id,stage);}

  const filtered = contacts.filter(c=>
    (filter==="all"||c.status===filter)&&
    (leadFilter==="all"||c.lead===leadFilter)&&
    (c.name?.toLowerCase().includes(search.toLowerCase())||c.phone?.includes(search))&&
    (!isAdmin||!inboxClinic||String(c.clinicId||c.clinic_id||1)===String(inboxClinic))
  ).filter(c=>{
    if(inboxFilter==="unread") return c.unread>0;
    if(inboxFilter==="manual") return !c.botActive;
    return true;
  }).filter(c=>{
    if(!inboxDateFilter) return true;
    return c.lastDate===inboxDateFilter;
  }).sort((a,b)=>{
    if(b.unread!==a.unread) return b.unread-a.unread;
    const ta = a.lastDate&&a.lastTime ? new Date(`${a.lastDate} ${a.lastTime}`) : new Date(0);
    const tb = b.lastDate&&b.lastTime ? new Date(`${b.lastDate} ${b.lastTime}`) : new Date(0);
    return tb-ta;
  });

  const totalUnread = contacts.reduce((s,c)=>s+c.unread,0);
  const hotCount    = contacts.filter(c=>c.lead==="hot"&&(c.pipelineStage||"new")!=="done").length;
  const warmCount   = contacts.filter(c=>c.lead==="warm"&&(c.pipelineStage||"new")!=="done").length;

  const T = dark ? {
    bg:"#0b141a",sidebar:"#111b21",nav:"#202c33",border:"#2a3942",
    card:"#182229",card2:"#2a3942",input:"#2a3942",inputBorder:"#3b4a54",
    text:"#e9edef",textMuted:"#8696a0",textFaint:"#667781",
    msgOut:"#005c4b",msgIn:"#182229",chatBg:"#0b141a",
    sidebarHover:"#202c33",selectedBg:"#2a3942",overlay:"rgba(0,0,0,.7)",
  } : {
    bg:"#f0f2f5",sidebar:"#ffffff",nav:"#ffffff",border:"#e9edef",
    card:"#ffffff",card2:"#f0f2f5",input:"#f0f2f5",inputBorder:"#e9edef",
    text:"#111b21",textMuted:"#667781",textFaint:"#8696a0",
    msgOut:"#d9fdd3",msgIn:"#ffffff",chatBg:WA_BG,
    sidebarHover:"#f5f6f6",selectedBg:"#f0f2f5",overlay:"rgba(0,0,0,.5)",
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

  const navStyle = {height:56,background:T.nav,borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",padding:"0 12px",gap:4,flexShrink:0,boxShadow:"0 1px 3px rgba(0,0,0,.07)"};

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100dvh",background:T.bg,fontFamily:"'Segoe UI',system-ui,sans-serif",color:T.text,overflow:"hidden"}}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#8696a040;border-radius:4px}
        textarea:focus,input:focus,select:focus{outline:none}textarea{resize:none}
        .ci{transition:background .15s;cursor:pointer;position:relative}.ci:hover{background:${T.sidebarHover}}.ci.active{background:${T.selectedBg}}.ci .unread-btn{opacity:0;transition:opacity .2s}.ci:hover .unread-btn{opacity:1}
        .mb{animation:fadeUp .2s ease}@keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        .sc{transition:transform .15s}.sc:hover{transform:translateY(-2px)}
        .tb{transition:all .15s;cursor:pointer;border:none;background:transparent;font-family:inherit}
        .sb:active{transform:scale(.92)}
        .qa-row.hl{background:#dcfce7!important;border-color:${WA_GREEN}!important}
        input::placeholder,textarea::placeholder{color:${T.textFaint}}
        @keyframes bounce{0%,80%,100%{transform:scale(0)}40%{transform:scale(1)}}
        .kc{border-radius:12px;min-height:200px;transition:background .15s}.kc.over{background:${dark?"#1a2e23":"#dcfce7"}!important}
        .kcard{cursor:grab;transition:transform .15s,box-shadow .15s}.kcard:hover{transform:translateY(-2px);box-shadow:0 4px 16px rgba(0,0,0,.15)}.kcard:active{cursor:grabbing}
        .cc{background:${T.card};border:1px solid ${T.border};border-radius:14px;padding:20px;margin-bottom:16px}
        @media(max-width:639px){
          .hide-mobile{display:none!important}
          .mobile-full{width:100%!important}
          .cc{padding:14px!important}
          .kc{min-height:120px!important}
          input,textarea,select{font-size:16px!important} /* prevent iOS zoom */
        }
        @media(max-width:1023px){
          .hide-tablet{display:none!important}
          .tablet-full{width:100%!important}
        }
        @media(min-width:640px) and (max-width:1023px){
          .tablet-stack{flex-direction:column!important}
        }
      `}</style>

      {/* EXPORT CSV MODAL */}
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
              const csv = [header.join(","), ...rows.map(r=>r.join(","))].join("\n");
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
      <div style={navStyle}>
        {/* Hamburger */}
        <button className="tb" onClick={()=>setMenuOpen(m=>!m)}
          style={{width:38,height:38,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:4,padding:8,flexShrink:0}}>
          {[0,1,2].map(i=><div key={i} style={{width:18,height:2,background:menuOpen?WA_GREEN:T.textMuted,borderRadius:2,transition:"all .2s",transform:menuOpen?(i===0?"rotate(45deg) translate(4px,4px)":i===2?"rotate(-45deg) translate(4px,-4px)":"scaleX(0)"):"none"}}/>)}
        </button>

        <div style={{display:"flex",alignItems:"center",gap:8,marginLeft:4,flex:1}}>
          <div style={{width:34,height:34,borderRadius:8,overflow:"hidden",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",background:currentUser?.logo_url?"transparent":`linear-gradient(135deg,${WA_GREEN},${WA_GREEN})`}}>
            {currentUser?.logo_url
              ? <img src={currentUser.logo_url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt="logo"/>
              : <span style={{fontSize:16}}>🤖</span>}
          </div>
          <div className="hide-mobile">
            <div style={{fontWeight:700,fontSize:13}}>{currentUser?.company_name||"Nexora CRM"}</div>
            <div style={{fontSize:10,color:T.textMuted}}>{isAdmin?"Admin Dashboard":"WhatsApp Business"}</div>
          </div>
        </div>

        {/* Desktop tabs */}
        <div className="hide-mobile" style={{display:"flex",gap:2}}>
          {TABS.filter(t=>!t.adminOnly||isAdmin).filter(t=>canSee(t.id)).map(t=>(
            <button key={t.id} className="tb" onClick={()=>safeSetTab(t.id)}
              style={{display:"flex",alignItems:"center",gap:4,padding:"6px 10px",borderRadius:18,
                background:tab===t.id?`${WA_GREEN}18`:"transparent",
                color:tab===t.id?WA_GREEN:T.textMuted,fontWeight:tab===t.id?700:500,fontSize:12}}>
              <span>{t.icon}</span><span>{t.label}</span>
              {t.id==="crm"&&totalUnread>0&&<span style={{background:WA_GREEN,color:"#fff",borderRadius:10,padding:"1px 5px",fontSize:10,fontWeight:700}}>{totalUnread}</span>}
              {t.id==="leads"&&(hotCount+warmCount)>0&&<span style={{background:"#ef4444",color:"#fff",borderRadius:10,padding:"1px 5px",fontSize:10,fontWeight:700}}>{hotCount+warmCount}</span>}
            </button>
          ))}
        </div>

        <div style={{display:"flex",alignItems:"center",gap:6,marginLeft:8}}>
          <div style={{display:"flex",alignItems:"center",gap:4,fontSize:11}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:backendStatus==="online"?WA_GREEN:backendStatus==="offline"?"#ef4444":"#f59e0b"}}/>
            <span className="hide-mobile" style={{color:T.textMuted,fontSize:10}}>{backendStatus==="online"?"Live":"Offline"}</span>
          </div>
          <div className="hide-mobile" style={{fontSize:10,color:T.textFaint,background:T.card2,border:`1px solid ${T.border}`,borderRadius:12,padding:"2px 8px"}}>
            v{CRM_VERSION}{backendVersion&&` · API v${backendVersion}`}
          </div>
          <button onClick={()=>setDark(d=>!d)} style={{padding:"4px 8px",borderRadius:18,border:`1px solid ${T.border}`,background:T.card2,color:T.textMuted,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>{dark?"☀️":"🌙"}</button>
          {/* User info + logout */}
          <div style={{display:"flex",alignItems:"center",gap:6,padding:"3px 10px",borderRadius:18,background:T.card2,border:`1px solid ${T.border}`}}>
            <span style={{fontSize:11,color:T.textMuted}}>{isAdmin?"👑":"👤"} {currentUser?.username}</span>
            <button onClick={()=>setConfirmModal({
              title:"Log Out?",
              message:"Are you sure you want to log out of Nexora CRM?",
              icon:"🔐",
              danger:false,
              confirmText:"Yes, Log Out",
              onConfirm:()=>doLogout()
            })} style={{padding:"2px 8px",borderRadius:10,border:"none",background:"#ef444420",color:"#ef4444",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Logout</button>
          </div>
          {/* Notification Bell */}
          <div style={{position:"relative"}}>
            <button onClick={()=>{setShowChangelog(c=>!c); if(hasUnread){setChangelogSeen(latestVersion);}}}
              style={{padding:"4px 8px",borderRadius:18,border:`1px solid ${hasUnread?"#f59e0b":T.border}`,background:hasUnread?"#fef3c7":T.card2,color:hasUnread?"#d97706":T.textMuted,fontSize:13,cursor:"pointer",fontFamily:"inherit",position:"relative"}}>
              🔔
              {hasUnread&&<span style={{position:"absolute",top:-4,right:-4,width:8,height:8,borderRadius:"50%",background:"#ef4444",border:"2px solid white"}}/>}
            </button>
            {/* Changelog dropdown */}
            {showChangelog&&<div style={{position:"absolute",right:0,top:36,width:340,background:T.card,border:`1px solid ${T.border}`,borderRadius:14,boxShadow:"0 8px 32px rgba(0,0,0,.15)",zIndex:200,overflow:"hidden"}}>
              <div style={{padding:"12px 16px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{fontWeight:700,fontSize:14}}>🔔 What's New</div>
                <button onClick={()=>setShowChangelog(false)} style={{border:"none",background:"none",cursor:"pointer",fontSize:16,color:T.textMuted}}>✕</button>
              </div>
              <div style={{maxHeight:400,overflowY:"auto"}}>
                {CHANGELOG.map((c,i)=><div key={c.version} style={{padding:"12px 16px",borderBottom:i<CHANGELOG.length-1?`1px solid ${T.border}`:"none"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                    <span style={{background:c.color,color:"#fff",fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:8}}>{c.tag}</span>
                    <span style={{fontWeight:700,fontSize:13}}>v{c.version}</span>
                    <span style={{fontSize:11,color:T.textMuted,marginLeft:"auto"}}>{c.date}</span>
                    {i===0&&<span style={{background:"#ef4444",color:"#fff",fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:8}}>LATEST</span>}
                  </div>
                  {c.items.map((item,j)=><div key={j} style={{fontSize:12,color:T.textMuted,marginBottom:3,paddingLeft:4}}>{item}</div>)}
                </div>)}
              </div>
            </div>}
          </div>
        </div>
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
              <span style={{fontSize:18}}>{t.icon}</span>
              <span style={{flex:1}}>{t.label}</span>
              {t.id==="crm"&&totalUnread>0&&<span style={{background:WA_GREEN,color:"#fff",borderRadius:10,padding:"1px 6px",fontSize:11,fontWeight:700}}>{totalUnread}</span>}
              {t.id==="leads"&&(hotCount+warmCount)>0&&<span style={{background:"#ef4444",color:"#fff",borderRadius:10,padding:"1px 6px",fontSize:11,fontWeight:700}}>{hotCount+warmCount}</span>}
            </button>
          ))}
          <div style={{marginTop:"auto",padding:"8px",fontSize:11,color:T.textFaint,borderTop:`1px solid ${T.border}`,paddingTop:12}}>
            <div>CRM v{CRM_VERSION} · API v{backendVersion||"..."}</div>
            <div style={{marginTop:2}}>Backend: <span style={{color:backendStatus==="online"?WA_GREEN:"#ef4444"}}>{backendStatus}</span></div>
          </div>
        </div>
      </>}

      <div style={{flex:1,display:"flex",overflow:"hidden"}}>

        {/* ══ CRM TAB ══ */}
        {tab==="crm"&&<>
          <div style={{width:isMobile?"100%":isTablet?260:300,background:T.sidebar,borderRight:`1px solid ${T.border}`,display:"flex",flexDirection:"column",flexShrink:0,
            ...(isMobile&&selected?{display:"none"}:{})}}>
            <div style={{padding:"10px 10px 8px",borderBottom:`1px solid ${T.border}`}}>
              {/* Admin client selector dropdown */}
              {isAdmin&&adminOverview.length>0&&<div style={{marginBottom:8}}>
                <select value={inboxClinic||""} onChange={e=>{setInboxClinic(e.target.value||null);}}
                  style={{width:"100%",padding:"6px 10px",borderRadius:10,border:`1px solid ${T.border}`,background:T.card2,color:T.text,fontSize:12,fontFamily:"inherit",outline:"none"}}>
                  {/* Deduplicate by clinic_id — show only clinic names */}
                  {[...new Map(adminOverview.filter(c=>c.company_name).map(c=>[c.clinic_id,c])).values()].map(c=>(
                    <option key={c.clinic_id} value={c.clinic_id}>{c.company_name}</option>
                  ))}
                </select>
              </div>}
              <div style={{display:"flex",gap:5,marginBottom:8}}>
                {[{label:"Total",value:contacts.length,color:T.textMuted},{label:"Open",value:contacts.filter(c=>c.status==="open").length,color:WA_GREEN},{label:"🔥",value:hotCount,color:"#ef4444"},{label:"🟡",value:warmCount,color:"#f59e0b"}].map(s=>(
                  <div key={s.label} className="sc" style={{flex:1,background:T.card2,borderRadius:8,padding:"5px 3px",textAlign:"center",border:`1px solid ${T.border}`}}>
                    <div style={{fontSize:14,fontWeight:700,color:s.color}}>{s.value}</div>
                    <div style={{fontSize:9,color:T.textFaint}}>{s.label}</div>
                  </div>
                ))}
              </div>
              <button onClick={()=>setExportModal(true)} style={{width:"100%",padding:"6px",borderRadius:8,border:`1px solid ${T.border}`,
                background:T.card2,color:T.textMuted,fontSize:11,cursor:"pointer",
                fontFamily:"inherit",marginBottom:4,display:"flex",alignItems:"center",
                justifyContent:"center",gap:4}}>
                📥 Download All Chats (CSV)
              </button>
              <div style={{position:"relative",marginBottom:6}}>
                <span style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",fontSize:12,color:T.textFaint}}>🔍</span>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..."
                  style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:18,padding:"6px 10px 6px 28px",color:T.text,fontSize:12}}/>
              </div>
              <div style={{display:"flex",gap:3,marginBottom:5}}>
                {["all","open","resolved"].map(f=><button key={f} onClick={()=>setFilter(f)} style={{flex:1,padding:"4px 0",borderRadius:14,border:"none",cursor:"pointer",background:filter===f?WA_GREEN:T.input,color:filter===f?"#fff":T.textMuted,fontSize:10,fontWeight:600,textTransform:"capitalize",fontFamily:"inherit"}}>{f}</button>)}
              </div>
              <div style={{display:"flex",gap:3,marginBottom:5}}>
                {[{id:"all",label:"All"},{id:"unread",label:"🔔 Unread"},{id:"manual",label:"👤 Manual"}].map(f=><button key={f.id} onClick={()=>setInboxFilter(f.id)} style={{flex:1,padding:"4px 0",borderRadius:14,border:"none",cursor:"pointer",background:inboxFilter===f.id?WA_GREEN:T.input,color:inboxFilter===f.id?"#fff":T.textMuted,fontSize:10,fontWeight:600,fontFamily:"inherit"}}>{f.label}</button>)}
              </div>
              {inboxFilter==="manual"&&<div style={{marginBottom:6}}>
                <button onClick={()=>{
                  const offContacts = filtered.filter(c=>!c.botActive);
                  if(offContacts.length===0) return;
                  setConfirmModal({
                    title:"Turn Bot ON for All?",
                    message:`This will turn the bot ON for ${offContacts.length} chat${offContacts.length>1?"s":""} that are currently in manual mode.`,
                    icon:"🤖",
                    danger:false,
                    confirmText:`Yes, Turn ON ${offContacts.length} Bots`,
                    onConfirm:async()=>{
                      const total = offContacts.length;
                      setBulkBotModal({total, done:0, active:true});
                      for(let i=0; i<offContacts.length; i++){
                        try { await fetch(`${API}/api/conversations/${offContacts[i].id}/bot`,{method:"PATCH",headers:authHeaders(),body:JSON.stringify({botActive:true})}); } catch {}
                        setBulkBotModal({total, done:i+1, active:true});
                      }
                      await fetchConversations();
                      setBulkBotModal(null);
                    }
                  });
                }} style={{width:"100%",padding:"5px",borderRadius:8,border:`1px solid ${WA_GREEN}40`,
                  background:`${WA_GREEN}10`,color:WA_GREEN,fontSize:11,fontWeight:700,
                  cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
                  🤖 Turn Bot ON for All ({filtered.filter(c=>!c.botActive).length} chats)
                </button>
              </div>}
              <div style={{display:"flex",alignItems:"center",gap:5}}>
                <input type="date" value={inboxDateFilter} onChange={e=>setInboxDateFilter(e.target.value)}
                  style={{flex:1,background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:14,padding:"5px 10px",color:T.text,fontSize:11,fontFamily:"inherit"}}/>
                {inboxDateFilter&&<button onClick={()=>setInboxDateFilter("")} style={{background:"none",border:"none",cursor:"pointer",color:T.textMuted,fontSize:14,padding:"0 4px"}}>✕</button>}
              </div>
            </div>
            <div style={{flex:1,overflowY:"auto"}}>
              {loading&&<div style={{padding:20,textAlign:"center",color:T.textFaint,fontSize:12}}>Loading...</div>}
              {!loading&&filtered.length===0&&<div style={{padding:24,textAlign:"center",color:T.textFaint,fontSize:12}}><div style={{fontSize:32,marginBottom:8}}>💬</div>{backendStatus==="offline"?"⚠️ Backend offline":"No conversations"}</div>}
              {filtered.map(c=>(
                <div key={c.id} className={`ci ${selected?.id===c.id?"active":""}`} onClick={()=>selectContact(c)}
                  style={{padding:"9px 12px",display:"flex",alignItems:"center",gap:9,borderBottom:`1px solid ${T.border}40`}}>
                  <div style={{width:42,height:42,borderRadius:"50%",background:getColor(c.name||"?"),display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:13,color:"#fff",flexShrink:0}}>{c.avatar||"?"}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}>
                      <span style={{fontWeight:600,fontSize:13,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:140}}>{c.name}</span>
                      <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:1}}>
                        <span style={{fontSize:10,color:c.unread>0?WA_GREEN:T.textFaint,fontWeight:c.unread>0?600:400}}>{c.lastTime}</span>
                        {c.lastDate&&<span style={{fontSize:9,color:T.textFaint}}>{c.lastDate.split("-").reverse().join("/")}</span>}
                      </div>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}>
                      <span style={{fontSize:11,color:T.textMuted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:160}}>{c.lastMessage||"No messages"}</span>
                      <div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
                        {!c.botActive&&<span style={{fontSize:9,color:"#f59e0b",fontWeight:700,background:"#fffbeb",padding:"1px 5px",borderRadius:6,border:"1px solid #fcd34d"}}>👤 Manual</span>}
                        {c.unread>0&&<span style={{background:WA_GREEN,color:"#fff",borderRadius:10,padding:"1px 6px",fontSize:10,fontWeight:700}}>{c.unread}</span>}
                      </div>
                    </div>
                    {/* Show Turn Bot ON button when in Manual filter */}
                    {inboxFilter==="manual"&&!c.botActive&&<div onClick={e=>{e.stopPropagation();toggleBot(c.id);}} style={{marginTop:4,display:"flex",alignItems:"center",gap:4,padding:"3px 8px",borderRadius:8,background:`${WA_GREEN}10`,border:`1px solid ${WA_GREEN}30`,cursor:"pointer",width:"fit-content"}}>
                      <span style={{fontSize:10,color:WA_GREEN,fontWeight:700}}>🤖 Turn Bot ON</span>
                    </div>}

                  </div>
                  {/* Mark as unread button — shows on hover */}
                  <button className="unread-btn" onClick={e=>{
                    e.stopPropagation();
                    setContacts(p=>p.map(x=>x.id===c.id?{...x,unread:x.unread>0?0:1}:x));
                  }} title={c.unread>0?"Mark as read":"Mark as unread"}
                    style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",
                      background:"none",border:"none",cursor:"pointer",
                      fontSize:13,color:T.textMuted,padding:"4px 6px",borderRadius:6,
                      background:T.card2}}>
                    {c.unread>0?"✓":"●"}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {selected?(
            <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>
              <div style={{padding:"8px 12px",background:T.nav,borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  {isMobile&&<button onClick={()=>setSelected(null)} style={{background:"none",border:"none",cursor:"pointer",color:WA_GREEN,fontSize:26,padding:"0 4px 0 0",display:"flex",alignItems:"center",lineHeight:1}}>‹</button>}
                  <div style={{width:36,height:36,borderRadius:"50%",background:getColor(selected.name||"?"),display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:13,color:"#fff",flexShrink:0}}>{selected.avatar}</div>
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{fontWeight:700,fontSize:14}}>{selected.name}</span>


                    </div>
                    <div style={{fontSize:11,color:T.textMuted}}>{selected.phone}</div>
                  </div>
                </div>
                <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}}>
                  <select value={selected.lead} onChange={e=>setManualLead(selected.id,e.target.value)} style={{background:T.card2,border:`1px solid ${T.border}`,borderRadius:14,padding:"4px 8px",color:T.text,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>
                    <option value="hot">🔥 Hot</option><option value="warm">🟡 Warm</option><option value="cold">🔵 Cold</option>
                  </select>
                  <select value={selected.pipelineStage||"new"} onChange={e=>setPipelineStage(selected.id,e.target.value)} style={{background:T.card2,border:`1px solid ${T.border}`,borderRadius:14,padding:"4px 8px",color:T.text,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>
                    {PIPELINE.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                  <button onClick={()=>toggleBot(selected.id)} style={{padding:"5px 10px",borderRadius:18,border:"none",cursor:"pointer",background:selected.botActive?`${WA_GREEN}20`:T.card2,color:selected.botActive?WA_GREEN:T.textMuted,fontSize:11,fontWeight:600,fontFamily:"inherit"}}>🤖 {selected.botActive?"ON":"OFF"}</button>
                  <button onClick={()=>toggleStatus(selected.id)} style={{padding:"5px 10px",borderRadius:18,border:`1px solid ${T.border}`,background:T.card2,color:T.textMuted,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>{selected.status==="open"?"✓ Resolve":"↺ Reopen"}</button>
                  <button onClick={()=>{
                      const rows = [["Time","Date","From","Message"]];
                      (selected.messages||[]).forEach(m=>{
                        rows.push([m.time||"",m.date||"",m.from==="user"?selected.name:m.from==="bot"?"Bot":m.agentName||"Agent",'"'+(m.text||"").replace(/"/g,'""')+'"']);
                      });
                      const csv = rows.map(r=>r.join(",")).join("\n");
                      const blob = new Blob([csv],{type:"text/csv"});
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `chat_${selected.name}_${new Date().toISOString().slice(0,10)}.csv`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }} style={{padding:"5px 10px",borderRadius:18,border:"1px solid #10b98140",background:"#10b98110",color:"#10b981",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>📥 Export</button>
                  <button onClick={()=>setArchiveConfirm(selected.id)} style={{padding:"5px 10px",borderRadius:18,border:"1px solid #f59e0b40",background:"#f59e0b10",color:"#f59e0b",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>📦 Archive</button>
                </div>
              </div>

              {selected.botActive&&<div style={{background:`${WA_GREEN}12`,borderBottom:`1px solid ${WA_GREEN}25`,padding:"4px 14px",fontSize:11,color:WA_DARK}}>🤖 Bot is handling this — toggle off to reply manually</div>}
              {(selected.lead==="hot"||selected.lead==="warm")&&<div style={{background:selected.lead==="hot"?"#fef2f2":"#fffbeb",borderBottom:`1px solid ${selected.lead==="hot"?"#fca5a5":"#fcd34d"}`,padding:"4px 14px",fontSize:11,color:selected.lead==="hot"?"#ef4444":"#f59e0b",display:"flex",alignItems:"center",gap:6}}>
                {selected.lead==="hot"?"🔥":"🟡"} <strong>{selected.lead==="hot"?"Hot":"Warm"} Lead:</strong> {selected.leadReason||"Keyword match"}
                <button onClick={()=>sendFollowup(selected.id,1)} disabled={sendingFollowup===selected.id}
                  style={{marginLeft:"auto",padding:"3px 10px",borderRadius:12,border:"none",background:selected.lead==="hot"?"#ef4444":"#f59e0b",color:"#fff",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>
                  {sendingFollowup===selected.id?"⏳ Sending...":"📤 Follow-up"}
                </button>
              </div>}
              <div ref={chatContainerRef} onScroll={()=>{
                const el = chatContainerRef.current;
                if(!el) return;
                userScrolled.current = (el.scrollHeight - el.scrollTop - el.clientHeight) > 120;
              }} style={{flex:1,overflowY:"auto",padding:14,paddingBottom:80,background:T.chatBg,display:"flex",flexDirection:"column",gap:6}}>
                {selected.messages?.map((msg,i)=>{
                  const isOut=msg.from!=="user";
                  return <div key={msg.id||i} className="mb" style={{display:"flex",justifyContent:isOut?"flex-end":"flex-start",alignItems:"flex-end",gap:6}}>
                    {!isOut&&<div style={{width:26,height:26,borderRadius:"50%",background:getColor(selected.name||"?"),flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:"#fff",marginBottom:2}}>{selected.avatar}</div>}
                    <div style={{maxWidth:"65%"}}>
                      <div style={{background:isOut?T.msgOut:T.msgIn,borderRadius:isOut?"16px 4px 16px 16px":"4px 16px 16px 16px",padding:"8px 12px",boxShadow:"0 1px 2px rgba(0,0,0,.1)"}}>
                        {isOut&&<div style={{fontSize:10,color:msg.from==="bot"?WA_GREEN:"#34B7F1",fontWeight:700,marginBottom:2}}>{msg.from==="bot"?"🤖 Sara":msg.agentName?`👤 ${msg.agentName}`:"👤 Agent"}</div>}
                        {msg.mediaUrl && msg.text?.startsWith("[Image") ? (
                          <div>
                            <img src={msg.mediaUrl} alt="image" style={{maxWidth:"100%",maxHeight:220,borderRadius:8,display:"block",cursor:"pointer"}} onClick={()=>window.open(msg.mediaUrl,"_blank")}/>
                            {msg.text!=="[Image]"&&<div style={{fontSize:12,color:T.textMuted,marginTop:4}}>{msg.text.replace("[Image]: ","")}</div>}
                          </div>
                        ) : msg.mediaUrl && msg.text?.startsWith("[Document") ? (
                          <a href={msg.mediaUrl} target="_blank" rel="noreferrer" style={{display:"flex",alignItems:"center",gap:8,textDecoration:"none",background:T.card2,borderRadius:8,padding:"8px 12px"}}>
                            <span style={{fontSize:20}}>📄</span>
                            <span style={{fontSize:12,color:WA_GREEN,fontWeight:600}}>{msg.text.replace("[Document: ","").replace("]","")}</span>
                          </a>
                        ) : msg.mediaUrl && msg.text?.startsWith("[Voice") ? (
                          <div>
                            <audio controls src={msg.mediaUrl} style={{width:"100%",height:36}}/>
                          </div>
                        ) : msg.mediaUrl && msg.text?.startsWith("[Video") ? (
                          <video controls src={msg.mediaUrl} style={{maxWidth:"100%",maxHeight:200,borderRadius:8}}/>
                        ) : (
                          <div style={{fontSize:13,lineHeight:1.5,whiteSpace:"pre-wrap",color:T.text}}>{msg.text}</div>
                        )}
                        <div style={{fontSize:10,color:T.textFaint,textAlign:"right",marginTop:2}}>{formatMsgTime(msg.time, msg.date)}</div>
                      </div>
                      {msg.sources?.length>0&&<div style={{marginTop:4,paddingLeft:4}}>{msg.sources.map(s=><SourceBadge key={s.id} s={s}/>)}</div>}
                    </div>
                  </div>;
                })}
                <div ref={messagesEndRef}/>
              </div>
              <div style={{padding:"8px 10px",background:T.nav,borderTop:`1px solid ${T.border}`,display:"flex",gap:6,alignItems:"flex-end"}}>
                <textarea value={reply} onChange={e=>setReply(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendAgentReply();}}}
                  placeholder={selected.botActive?"Bot is active — toggle off to reply":"Type a message..."} disabled={selected.botActive} rows={1}
                  style={{flex:1,background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:20,padding:"9px 14px",color:selected.botActive?T.textFaint:T.text,fontSize:13,maxHeight:100}}/>
                <button className="sb" onClick={sendAgentReply} disabled={selected.botActive||!reply.trim()} style={{width:40,height:40,borderRadius:"50%",border:"none",background:selected.botActive||!reply.trim()?T.card2:WA_GREEN,color:selected.botActive||!reply.trim()?T.textFaint:"#fff",fontSize:16,cursor:selected.botActive?"not-allowed":"pointer",flexShrink:0}}>➤</button>
              </div>
            </div>
          ):<div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:10,background:T.chatBg}}><div style={{fontSize:48}}>💬</div><div style={{fontSize:15,fontWeight:600}}>Select a conversation</div></div>}
        </>}

        {/* ══ LEADS KANBAN ══ */}
        {tab==="leads"&&<div style={{flex:1,display:"flex",background:T.bg,overflow:"hidden"}}>

          {/* Admin sidebar — client picker */}
          {isAdmin&&!isMobile&&<div style={{width:isTablet?180:220,borderRight:`1px solid ${T.border}`,overflowY:"auto",flexShrink:0,background:T.card}}>
            <div style={{padding:"12px 14px",borderBottom:`1px solid ${T.border}`,fontWeight:700,fontSize:11,color:T.textMuted,letterSpacing:1,textTransform:"uppercase"}}>Clients</div>
            <div onClick={()=>setLeadsClinic(null)}
              style={{padding:"10px 14px",cursor:"pointer",background:!leadsClinic?`${WA_GREEN}15`:"transparent",borderLeft:!leadsClinic?`3px solid ${WA_GREEN}`:"3px solid transparent",display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:28,height:28,borderRadius:8,background:`${WA_GREEN}20`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>🌐</div>
              <div style={{fontSize:12,fontWeight:700,color:!leadsClinic?WA_GREEN:T.text}}>All Clients</div>
            </div>
            {adminOverview.map(c=>(
              <div key={c.id} onClick={()=>setLeadsClinic(c)}
                style={{padding:"10px 14px",cursor:"pointer",background:leadsClinic?.id===c.id?`${WA_GREEN}15`:"transparent",borderLeft:leadsClinic?.id===c.id?`3px solid ${WA_GREEN}`:"3px solid transparent",display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:28,height:28,borderRadius:8,overflow:"hidden",background:`${WA_GREEN}15`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  {c.logo_url?<img src={c.logo_url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:<span style={{fontSize:12}}>🏢</span>}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:700,color:leadsClinic?.id===c.id?WA_GREEN:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.company_name||c.username}</div>
                  <div style={{fontSize:10,color:T.textMuted}}>{c.hot_leads||0} hot · {c.warm_leads||0} warm</div>
                </div>
              </div>
            ))}
          </div>}

          {/* Leads content - New Lead-based Kanban */}
          <div style={{flex:1,overflow:"auto",padding:16}}>
            {isAdmin&&leadsClinic&&<div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,padding:"10px 14px",borderRadius:12,background:T.card,border:`1px solid ${T.border}`}}>
              <div style={{width:32,height:32,borderRadius:8,overflow:"hidden",background:`${WA_GREEN}15`,display:"flex",alignItems:"center",justifyContent:"center"}}>
                {leadsClinic.logo_url?<img src={leadsClinic.logo_url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:<span style={{fontSize:16}}>🏢</span>}
              </div>
              <div style={{fontWeight:700,fontSize:14}}>{leadsClinic.company_name||leadsClinic.username}</div>
              <button onClick={()=>setLeadsClinic(null)} style={{marginLeft:"auto",padding:"5px 10px",borderRadius:8,border:`1px solid ${T.border}`,background:T.card2,color:T.text,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>← All</button>
            </div>}

            {/* Header */}
            <div style={{marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
              <div>
                <div style={{fontWeight:800,fontSize:17}}>🎯 Lead Board</div>
                <div style={{fontSize:11,color:T.textMuted,marginTop:2}}>AI-classified leads · Assign to team · Track performance</div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <div style={{background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:20,padding:"4px 12px",fontSize:11,color:"#ef4444",fontWeight:700}}>🔥 {hotCount} Hot</div>
                <div style={{background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:20,padding:"4px 12px",fontSize:11,color:"#f59e0b",fontWeight:700}}>🟡 {warmCount} Warm</div>
              </div>
            </div>

            {/* 4 Lead Columns */}
            <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":isTablet?"1fr 1fr":"repeat(4,minmax(220px,1fr))",gap:12,minWidth:isMobile?"auto":isTablet?"auto":900}}>
              {[
                {id:"hot",  label:"🔥 Hot Leads",  sub:"Ready to close",    color:"#ef4444", bg:"#fef2f2", dark:"#2d1515", border:"#fca5a5"},
                {id:"warm", label:"🟡 Warm Leads", sub:"Needs nurturing",   color:"#f59e0b", bg:"#fffbeb", dark:"#2d2010", border:"#fcd34d"},
                {id:"cold", label:"🔵 Browsing",   sub:"Low priority",      color:"#3b82f6", bg:"#eff6ff", dark:"#0f1e35", border:"#93c5fd"},
                {id:"done", label:"✅ Done",        sub:"Auto-archives 24h", color:"#22c55e", bg:"#f0fdf4", dark:"#0f2d1a", border:"#86efac"},
              ].map(col=>{
                const colContacts = contacts.filter(c=>{
                  if(col.id==="done") return (c.pipelineStage||"new")==="done";
                  return c.lead===col.id && (c.pipelineStage||"new")!=="done";
                });
                return (
                  <div key={col.id} style={{background:dark?col.dark+"60":col.bg,borderRadius:14,border:`1.5px solid ${col.border}`,overflow:"hidden"}}>
                    {/* Column header */}
                    <div style={{padding:"12px 14px",borderBottom:`1px solid ${col.border}`,background:dark?col.dark+"80":col.bg}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                        <div style={{fontWeight:800,fontSize:13,color:col.color}}>{col.label}</div>
                        <div style={{background:col.color,color:"#fff",borderRadius:10,padding:"1px 8px",fontSize:11,fontWeight:700,minWidth:22,textAlign:"center"}}>{colContacts.length}</div>
                      </div>
                      <div style={{fontSize:10,color:col.color,opacity:.7,marginTop:2}}>{col.sub}</div>
                    </div>

                    {/* Cards */}
                    <div style={{padding:"10px",display:"flex",flexDirection:"column",gap:8,maxHeight:"calc(100vh - 280px)",overflowY:"auto"}}>
                      {colContacts.length===0&&<div style={{textAlign:"center",padding:"24px 0",color:col.color,opacity:.4,fontSize:12}}>No leads here</div>}
                      {colContacts.map(c=>{
                        const assignedUser = contacts._users?.find(u=>u.id===c.assignedTo);
                        const silentMins = c.lastTime ? Math.round((Date.now()-new Date(c.lastTime).getTime())/60000) : null;
                        const silentText = silentMins ? silentMins<60?`${silentMins}m ago`:silentMins<1440?`${Math.floor(silentMins/60)}h ago`:`${Math.floor(silentMins/1440)}d ago` : "";
                        return (
                          <div key={c.id} onClick={()=>{setTab("crm");selectContact(c);}}
                            style={{background:T.card,borderRadius:10,padding:12,border:`1px solid ${T.border}`,
                              borderLeft:`3px solid ${col.color}`,cursor:"pointer",
                              boxShadow:"0 1px 4px rgba(0,0,0,.06)",transition:"box-shadow .15s"}}
                            onMouseEnter={e=>e.currentTarget.style.boxShadow="0 3px 12px rgba(0,0,0,.12)"}
                            onMouseLeave={e=>e.currentTarget.style.boxShadow="0 1px 4px rgba(0,0,0,.06)"}>

                            {/* Name + avatar */}
                            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                              <div style={{width:32,height:32,borderRadius:"50%",background:getColor(c.name||"?"),flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:"#fff"}}>{c.avatar||"?"}</div>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontWeight:700,fontSize:13,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.name||"Unknown"}</div>
                                <div style={{fontSize:10,color:T.textFaint}}>{c.phone} {silentText&&<span>· {silentText}</span>}</div>
                              </div>
                              {c.needsHuman&&<span style={{fontSize:14}} title="Needs Human">🚨</span>}
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
                                  const phone = c.id; // c.id is the phone number
                                  const r = await fetch(`${API}/api/conversations/${phone}/assign`,{
                                    method:"PATCH",
                                    headers:{"Content-Type":"application/json","Authorization":`Bearer ${authToken}`},
                                    body:JSON.stringify({assigned_to:uid})
                                  });
                                  if(r.ok) fetchConversations();
                                }}
                                style={{width:"100%",fontSize:10,padding:"4px 8px",borderRadius:8,
                                  border:`1px solid ${T.border}`,background:T.card2,color:T.text,
                                  fontFamily:"inherit",cursor:"pointer"}}>
                                <option value="">👤 Unassigned</option>
                                {clinicUsers.map(u=>(
                                  <option key={u.id} value={String(u.id)}>@{u.username}</option>
                                ))}
                              </select>
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
        </div>}

        {/* ══ ANALYTICS TAB ══ */}
        {tab==="analytics"&&<div style={{flex:1,display:"flex",background:T.bg,overflow:"hidden"}}>

          {/* Admin sidebar — client list */}
          {isAdmin&&<div style={{width:220,borderRight:`1px solid ${T.border}`,overflowY:"auto",flexShrink:0,background:T.card}}>
            <div style={{padding:"12px 14px",borderBottom:`1px solid ${T.border}`,fontWeight:700,fontSize:11,color:T.textMuted,letterSpacing:1,textTransform:"uppercase"}}>Clients</div>
            <div onClick={()=>{setSelectedClinicWithRef(null);fetchAnalytics(dateFrom,dateTo,null);fetchAdminOverview();}}
              style={{padding:"10px 14px",cursor:"pointer",background:!selectedClinic?`${WA_GREEN}15`:"transparent",borderLeft:!selectedClinic?`3px solid ${WA_GREEN}`:"3px solid transparent",display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:28,height:28,borderRadius:8,background:`${WA_GREEN}20`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>🌐</div>
              <div>
                <div style={{fontSize:12,fontWeight:700,color:!selectedClinic?WA_GREEN:T.text}}>All Clients</div>
                <div style={{fontSize:10,color:T.textMuted}}>{adminOverview.length} total</div>
              </div>
            </div>
            {overviewLoading&&<div style={{padding:16,textAlign:"center",fontSize:12,color:T.textMuted}}>Loading...</div>}
            {adminOverview.map(c=>(
              <div key={c.id} onClick={()=>{setSelectedClinicWithRef(c);fetchAnalytics(dateFrom,dateTo,c.clinic_id);}}
                style={{padding:"10px 14px",cursor:"pointer",background:selectedClinic?.clinic_id===c.clinic_id?`${WA_GREEN}15`:"transparent",borderLeft:selectedClinic?.clinic_id===c.clinic_id?`3px solid ${WA_GREEN}`:"3px solid transparent",display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:28,height:28,borderRadius:8,overflow:"hidden",background:`${WA_GREEN}15`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  {c.logo_url?<img src={c.logo_url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:<span style={{fontSize:12}}>🏢</span>}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:700,color:selectedClinic?.id===c.id?WA_GREEN:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.company_name||c.username}</div>
                  <div style={{fontSize:10,color:T.textMuted}}>{c.total_contacts||0} contacts</div>
                </div>
                <div style={{width:6,height:6,borderRadius:"50%",background:c.active?"#22c55e":"#ef4444",flexShrink:0}}/>
              </div>
            ))}
          </div>}

          {/* Main analytics content */}
          <div style={{flex:1,overflowY:"auto",padding:16,paddingBottom:80}}>
            <div style={{maxWidth:1100,margin:"0 auto"}}>

              {/* Admin overview cards — all clients */}
              {isAdmin&&!selectedClinic&&<>
                <div style={{fontWeight:800,fontSize:16,marginBottom:12}}>📊 All Clients Performance</div>
                {overviewLoading&&<div style={{textAlign:"center",padding:40,color:T.textMuted}}>Loading...</div>}
                {!overviewLoading&&adminOverview.length===0&&<div style={{textAlign:"center",padding:40,color:T.textMuted}}>No client users yet</div>}
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:12,marginBottom:20}}>
                  {adminOverview.map(c=>(
                    <div key={c.id} className="cc" style={{padding:16,cursor:"pointer"}}
                      onClick={()=>{setSelectedClinicWithRef(c);fetchAnalytics(dateFrom,dateTo,c.clinic_id);}}>
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
                      <div style={{marginTop:8,display:"flex",justifyContent:"space-between",fontSize:10,color:T.textMuted}}>
                        <span>🔥 {c.hot_leads||0} hot · 🌡️ {c.warm_leads||0} warm</span>
                        <span style={{color:WA_GREEN,fontWeight:600}}>{c.conversion_rate||0}% conv.</span>
                      </div>
                      <div style={{marginTop:8,fontSize:11,color:WA_GREEN,fontWeight:600,textAlign:"right"}}>View details →</div>
                    </div>
                  ))}
                </div>
              </>}

              {/* Selected client header */}
              {isAdmin&&selectedClinic&&<div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16,padding:"12px 16px",borderRadius:14,background:T.card,border:`1px solid ${T.border}`}}>
                <div style={{width:40,height:40,borderRadius:10,overflow:"hidden",background:`${WA_GREEN}15`,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  {selectedClinic.logo_url?<img src={selectedClinic.logo_url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:<span style={{fontSize:20}}>🏢</span>}
                </div>
                <div>
                  <div style={{fontWeight:800,fontSize:15}}>{selectedClinic.company_name||selectedClinic.username}</div>
                  <div style={{fontSize:11,color:T.textMuted}}>{selectedClinic.industry||""}</div>
                </div>
                <button onClick={()=>{setSelectedClinicWithRef(null);fetchAnalytics(dateFrom,dateTo,null);}} style={{marginLeft:"auto",padding:"6px 12px",borderRadius:10,border:`1px solid ${T.border}`,background:T.card2,color:T.text,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>← All Clients</button>
              </div>}

              {/* Show detailed analytics when client selected or for client user */}
              {(!isAdmin||selectedClinic)&&<>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:10}}>
                  <div><div style={{fontWeight:700,fontSize:17}}>📊 Analytics</div></div>
                  <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                    {[{id:"7d",label:"7D"},{id:"30d",label:"30D"},{id:"90d",label:"90D"},{id:"custom",label:"Custom"}].map(p=>(
                      <button key={p.id} onClick={()=>setPreset(p.id)} style={{padding:"5px 12px",borderRadius:16,border:`1px solid ${T.border}`,background:datePreset===p.id?WA_GREEN:T.card,color:datePreset===p.id?"#fff":T.textMuted,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{p.label}</button>
                    ))}
                    {datePreset==="custom"&&<>
                      <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:8,padding:"4px 8px",color:T.text,fontSize:12}}/>
                      <span style={{color:T.textMuted}}>→</span>
                      <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:8,padding:"4px 8px",color:T.text,fontSize:12}}/>
                    </>}
                    <button onClick={()=>fetchAnalytics(dateFrom,dateTo,selectedClinic?.clinic_id||null)} style={{padding:"5px 12px",borderRadius:16,border:"none",background:WA_GREEN,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>🔄</button>
                  </div>
                </div>

                {analyticsLoading&&<div style={{textAlign:"center",padding:60,color:T.textFaint}}>Loading analytics...</div>}

                {!analyticsLoading&&analytics&&<>
                  {/* Hero Banner */}
                  {analytics.growth&&<div style={{background:`linear-gradient(135deg,#0f172a,#1e3a5f)`,borderRadius:16,padding:"24px 28px",marginBottom:20,color:"#fff",position:"relative",overflow:"hidden"}}>
                    <div style={{position:"absolute",top:-20,right:-20,width:120,height:120,borderRadius:"50%",background:"rgba(255,255,255,.04)"}}/>
                    <div style={{position:"absolute",bottom:-30,right:60,width:80,height:80,borderRadius:"50%",background:"rgba(255,255,255,.03)"}}/>
                    <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:16,position:"relative"}}>
                      <div>
                        <div style={{fontSize:12,color:"rgba(255,255,255,.6)",marginBottom:4,letterSpacing:1,textTransform:"uppercase"}}>Period: {analytics.dateFrom} → {analytics.dateTo}</div>
                        <div style={{fontSize:28,fontWeight:800,marginBottom:4}}>{analytics.growth.thisperiod} <span style={{fontSize:16,fontWeight:400,color:"rgba(255,255,255,.7)"}}>new conversations</span></div>
                        <div style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:"rgba(255,255,255,.8)"}}>
                          {analytics.growth.pct!==0&&<span style={{background:analytics.growth.pct>0?"rgba(34,197,94,.2)":"rgba(239,68,68,.2)",color:analytics.growth.pct>0?"#86efac":"#fca5a5",borderRadius:20,padding:"2px 10px",fontWeight:700,fontSize:12}}>
                            {analytics.growth.pct>0?"▲":"▼"} {Math.abs(analytics.growth.pct)}% vs previous period
                          </span>}
                          <span style={{color:"rgba(255,255,255,.5)"}}>·</span>
                          <span>Bot handled <strong style={{color:"#86efac"}}>{analytics.totals?.botMessages||0}</strong> messages automatically</span>
                        </div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:42,fontWeight:900,color:WA_GREEN}}>{analytics.growth.conversionRate}%</div>
                        <div style={{fontSize:12,color:"rgba(255,255,255,.6)"}}>Conversion Rate</div>
                        <div style={{fontSize:11,color:"rgba(255,255,255,.4)",marginTop:2}}>Contacts → Hot Leads</div>
                      </div>
                    </div>
                  </div>}

                  {/* ── PITCH-READY ANALYTICS DASHBOARD ──────────── */}
                  {(()=>{
                    const total   = analytics.totals?.contacts||0;
                    const hot     = analytics.totals?.hot||0;
                    const warm    = analytics.totals?.warm||0;
                    const cold    = Math.max(0,total-hot-warm);
                    const done    = analytics.totals?.done||0;
                    const botMsgs = analytics.totals?.botMessages||0;
                    const userMsgs= analytics.totals?.userMessages||0;
                    const totalMsgs = botMsgs+userMsgs;
                    const botRate = totalMsgs>0?Math.round(botMsgs/totalMsgs*100):0;
                    const followups = analytics.totals?.followups||0;
                    const convRate  = analytics.growth?.conversionRate||0;

                    return <>
                      {/* ROW 1 — KPI Cards */}
                      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":isTablet?"1fr 1fr":"repeat(4,1fr)",gap:10,marginBottom:16}}>
                        {[
                          {label:"Total Contacts",  value:total,         sub:"All conversations",     color:"#6366f1",icon:"👥",bg:"#eef2ff"},
                          {label:"Hot Leads",       value:hot,           sub:`${convRate}% conversion rate`, color:"#ef4444",icon:"🔥",bg:"#fef2f2"},
                          {label:"Bookings Closed", value:done,          sub:"Pipeline done",          color:"#22c55e",icon:"✅",bg:"#f0fdf4"},
                          {label:"Bot Automation",  value:`${botRate}%`, sub:`${botMsgs} msgs handled`,color:WA_GREEN, icon:"🤖",bg:`${WA_GREEN}12`},
                        ].map(k=>(
                          <div key={k.label} style={{background:T.card,borderRadius:14,padding:"16px 14px",border:`1px solid ${T.border}`,position:"relative",overflow:"hidden"}}>
                            <div style={{position:"absolute",top:10,right:10,width:36,height:36,borderRadius:10,background:k.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>{k.icon}</div>
                            <div style={{fontSize:30,fontWeight:900,color:k.color,lineHeight:1}}>{k.value}</div>
                            <div style={{fontSize:12,fontWeight:700,color:T.text,marginTop:4}}>{k.label}</div>
                            <div style={{fontSize:10,color:T.textMuted,marginTop:2}}>{k.sub}</div>
                          </div>
                        ))}
                      </div>

                      {/* ROW 2 — Funnel + Bot Donut */}
                      <div style={{display:"grid",gridTemplateColumns:isSmall?"1fr":"1fr 1fr",gap:12,marginBottom:16}}>
                        {/* Lead Funnel */}
                        <div style={{background:T.card,borderRadius:14,padding:18,border:`1px solid ${T.border}`}}>
                          <div style={{fontWeight:800,fontSize:14,marginBottom:2}}>🎯 Conversion Funnel</div>
                          <div style={{fontSize:11,color:T.textMuted,marginBottom:14}}>First message → booked consultation</div>
                          {[
                            {label:"New Contacts",  value:total, color:"#6366f1", pct:100},
                            {label:"Warm Interest", value:warm,  color:"#f59e0b", pct:total>0?Math.round(warm/total*100):0},
                            {label:"Hot Intent",    value:hot,   color:"#ef4444", pct:total>0?Math.round(hot/total*100):0},
                            {label:"✅ Converted",  value:done,  color:"#22c55e", pct:total>0?Math.round(done/total*100):0},
                          ].map(f=>(
                            <div key={f.label} style={{marginBottom:10}}>
                              <div style={{display:"flex",justifyContent:"space-between",marginBottom:3,fontSize:11}}>
                                <span style={{fontWeight:600,color:T.text}}>{f.label}</span>
                                <span style={{color:f.color,fontWeight:700}}>{f.value} · {f.pct}%</span>
                              </div>
                              <div style={{height:7,borderRadius:4,background:T.border}}>
                                <div style={{height:7,borderRadius:4,width:`${f.pct}%`,background:f.color,transition:"width .6s ease"}}/>
                              </div>
                            </div>
                          ))}
                          <div style={{marginTop:10,padding:"8px 12px",background:`${WA_GREEN}08`,borderRadius:10,border:`1px solid ${WA_GREEN}20`,fontSize:10,color:T.textMuted}}>
                            🤖 AI tagged <strong style={{color:WA_GREEN}}>{hot+warm}</strong> potential patients from {total} conversations
                          </div>
                        </div>

                        {/* Bot Performance Donut */}
                        <div style={{background:T.card,borderRadius:14,padding:18,border:`1px solid ${T.border}`}}>
                          <div style={{fontWeight:800,fontSize:14,marginBottom:2}}>🤖 Bot Performance</div>
                          <div style={{fontSize:11,color:T.textMuted,marginBottom:14}}>Automation saves your team hours daily</div>
                          <div style={{display:"flex",alignItems:"center",gap:20,marginBottom:16}}>
                            <div style={{position:"relative",width:90,height:90,flexShrink:0}}>
                              <svg width="90" height="90" style={{transform:"rotate(-90deg)"}}>
                                <circle cx="45" cy="45" r="36" fill="none" stroke={T.border} strokeWidth="10"/>
                                <circle cx="45" cy="45" r="36" fill="none" stroke={WA_GREEN} strokeWidth="10"
                                  strokeDasharray={`${2*Math.PI*36}`}
                                  strokeDashoffset={`${2*Math.PI*36*(1-botRate/100)}`}
                                  strokeLinecap="round" style={{transition:"stroke-dashoffset .8s ease"}}/>
                              </svg>
                              <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column"}}>
                                <div style={{fontSize:18,fontWeight:900,color:WA_GREEN,lineHeight:1}}>{botRate}%</div>
                                <div style={{fontSize:8,color:T.textMuted}}>auto</div>
                              </div>
                            </div>
                            <div style={{flex:1,display:"flex",flexDirection:"column",gap:8}}>
                              {[
                                {label:"Bot replies",     value:botMsgs,  color:WA_GREEN},
                                {label:"Customer msgs",   value:userMsgs, color:"#6366f1"},
                                {label:"Follow-ups sent", value:followups, color:"#f59e0b"},
                              ].map(s=>(
                                <div key={s.label} style={{display:"flex",justifyContent:"space-between",fontSize:12}}>
                                  <span style={{color:T.textMuted}}><span style={{color:s.color}}>●</span> {s.label}</span>
                                  <strong style={{color:s.color}}>{s.value}</strong>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div style={{padding:"8px 12px",background:"#eff6ff",borderRadius:10,border:"1px solid #bfdbfe",fontSize:10,color:"#1d4ed8"}}>
                            💡 Bot saves approx <strong>{Math.round(botMsgs*2/60)} hrs</strong> of manual replies this period
                          </div>
                        </div>
                      </div>

                      {/* ROW 3 — Daily Messages Bar Chart */}
                      {analytics.messagesPerDay?.length>0&&<div style={{background:T.card,borderRadius:14,padding:18,marginBottom:16,border:`1px solid ${T.border}`}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
                          <div>
                            <div style={{fontWeight:800,fontSize:14}}>📅 Daily Activity</div>
                            <div style={{fontSize:11,color:T.textMuted,marginTop:2}}>Bot vs customer messages per day</div>
                          </div>
                          <div style={{display:"flex",gap:14,fontSize:11,color:T.textMuted}}>
                            <span><span style={{color:WA_GREEN,fontWeight:700}}>■</span> Bot</span>
                            <span><span style={{color:"#6366f1",fontWeight:700}}>■</span> Customer</span>
                          </div>
                        </div>
                        <div style={{display:"flex",alignItems:"flex-end",gap:3,height:100,paddingBottom:4}}>
                          {analytics.messagesPerDay.slice(-21).map((d,i)=>{
                            const maxV=Math.max(...analytics.messagesPerDay.slice(-21).map(x=>x.total||0),1);
                            return (
                              <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:1}} title={`${d.date}: ${d.total||0} total`}>
                                <div style={{width:"100%",display:"flex",flexDirection:"column",justifyContent:"flex-end",height:90}}>
                                  <div style={{width:"100%",minHeight:2,background:"#6366f1",borderRadius:"2px 2px 0 0",opacity:.75,height:`${Math.max(2,((d.user||0)/maxV)*86)}px`}}/>
                                  <div style={{width:"100%",minHeight:2,background:WA_GREEN,opacity:.9,height:`${Math.max(2,((d.bot||0)/maxV)*86)}px`}}/>
                                </div>
                                {analytics.messagesPerDay.slice(-21).length<=10&&<div style={{fontSize:7,color:T.textFaint,marginTop:2}}>{d.date?.slice(5)}</div>}
                              </div>
                            );
                          })}
                        </div>
                      </div>}

                      {/* ROW 4 — Peak Hours + Lead Quality */}
                      <div style={{display:"grid",gridTemplateColumns:isSmall?"1fr":"1fr 1fr",gap:12,marginBottom:16}}>
                        {/* Peak Hours */}
                        <div style={{background:T.card,borderRadius:14,padding:18,border:`1px solid ${T.border}`}}>
                          <div style={{fontWeight:800,fontSize:14,marginBottom:2}}>⏰ Peak Activity Hours</div>
                          <div style={{fontSize:11,color:T.textMuted,marginBottom:14}}>When customers message most</div>
                          <div style={{display:"flex",alignItems:"flex-end",gap:2,height:60}}>
                            {Array.from({length:24},(_,h)=>{
                              const cnt=(analytics.peakHours||[]).find(p=>p.hour===h)?.count||0;
                              const maxH=Math.max(...(analytics.peakHours||[]).map(p=>p.count),1);
                              const isPeak=cnt===maxH&&cnt>0;
                              return <div key={h} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center"}} title={`${h}:00 — ${cnt} msgs`}>
                                <div style={{width:"100%",background:isPeak?WA_GREEN:cnt>0?`${WA_GREEN}50`:T.border,borderRadius:"2px 2px 0 0",height:`${Math.max(2,(cnt/maxH)*55)}px`}}/>
                                {h%6===0&&<div style={{fontSize:7,color:T.textFaint,marginTop:2}}>{h}h</div>}
                              </div>;
                            })}
                          </div>
                          {(()=>{const p=(analytics.peakHours||[]).reduce((a,b)=>b.count>a.count?b:a,{hour:0,count:0});return p.count>0&&<div style={{marginTop:10,fontSize:11,color:T.textMuted}}>Peak: <strong style={{color:WA_GREEN}}>{p.hour}:00–{p.hour+1}:00</strong> · {p.count} messages</div>;})()}
                        </div>

                        {/* Lead Quality */}
                        <div style={{background:T.card,borderRadius:14,padding:18,border:`1px solid ${T.border}`}}>
                          <div style={{fontWeight:800,fontSize:14,marginBottom:2}}>📊 Lead Quality Split</div>
                          <div style={{fontSize:11,color:T.textMuted,marginBottom:14}}>AI classification breakdown</div>
                          {[
                            {label:"🔥 High Intent", value:hot,  pct:total>0?Math.round(hot/total*100):0,  color:"#ef4444"},
                            {label:"🟡 Interested",  value:warm, pct:total>0?Math.round(warm/total*100):0, color:"#f59e0b"},
                            {label:"🔵 Browsing",    value:cold, pct:total>0?Math.round(cold/total*100):0, color:"#3b82f6"},
                          ].map(l=>(
                            <div key={l.label} style={{marginBottom:10}}>
                              <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:3}}>
                                <span style={{fontWeight:600}}>{l.label}</span>
                                <span style={{color:l.color,fontWeight:700}}>{l.value} ({l.pct}%)</span>
                              </div>
                              <div style={{height:7,borderRadius:4,background:T.border}}>
                                <div style={{height:7,borderRadius:4,width:`${l.pct}%`,background:l.color}}/>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* ROW 5 — Staff Leaderboard */}
                      {analytics.staffStats?.length>0&&<div style={{background:T.card,borderRadius:14,padding:18,border:`1px solid ${T.border}`}}>
                        <div style={{fontWeight:800,fontSize:14,marginBottom:2}}>👥 Team Leaderboard</div>
                        <div style={{fontSize:11,color:T.textMuted,marginBottom:14}}>Who handled what this period</div>
                        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":isTablet?"1fr 1fr":"repeat(auto-fit,minmax(200px,1fr))",gap:10}}>
                          {analytics.staffStats.map((s,i)=>{
                            const rate=s.assigned_count>0?Math.round((s.done_count||0)/s.assigned_count*100):0;
                            const medals=["🥇","🥈","🥉"];
                            return (
                              <div key={s.id} style={{padding:"14px",background:T.card2,borderRadius:12,border:`1px solid ${T.border}`}}>
                                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                                  <div style={{width:36,height:36,borderRadius:"50%",background:`linear-gradient(135deg,${WA_GREEN},#1da851)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:"#fff",flexShrink:0}}>
                                    {medals[i]||s.username?.charAt(0)?.toUpperCase()||"?"}
                                  </div>
                                  <div>
                                    <div style={{fontWeight:700,fontSize:13}}>@{s.username}</div>
                                    <div style={{fontSize:10,color:T.textMuted}}>{s.assigned_count||0} assigned</div>
                                  </div>
                                  <div style={{marginLeft:"auto",textAlign:"right"}}>
                                    <div style={{fontSize:18,fontWeight:900,color:rate>=50?WA_GREEN:"#f59e0b"}}>{rate}%</div>
                                    <div style={{fontSize:9,color:T.textMuted}}>close rate</div>
                                  </div>
                                </div>
                                <div style={{height:5,borderRadius:3,background:T.border,marginBottom:8}}>
                                  <div style={{height:5,borderRadius:3,width:`${rate}%`,background:rate>=70?WA_GREEN:rate>=40?"#f59e0b":"#ef4444"}}/>
                                </div>
                                <div style={{display:"flex",gap:8,fontSize:10,color:T.textMuted}}>
                                  <span>🔥 {s.hot_count||0}</span>
                                  <span>🟡 {s.warm_count||0}</span>
                                  <span>✅ {s.done_count||0}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>}
                    </>;
                  })()}
                </>}
              </>}


            {!analyticsLoading&&!analytics&&<div style={{textAlign:"center",padding:80,color:T.textFaint}}>
              <div style={{fontSize:40,marginBottom:12}}>📊</div>
              <div style={{fontSize:14,fontWeight:600}}>No analytics data yet</div>
              <div style={{fontSize:12,marginTop:6}}>Data appears as customers message in</div>
            </div>}

            </div>
          </div>
        </div>}

        {tab==="bot"&&<div style={{flex:1,display:"flex",flexDirection:"column",maxWidth:680,margin:"0 auto",width:"100%"}}>
          <div style={{padding:"10px 14px",background:T.nav,borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:36,height:36,borderRadius:"50%",background:`linear-gradient(135deg,${WA_GREEN},${WA_GREEN})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🤖</div>
              <div><div style={{fontWeight:700,fontSize:13}}>Sara — Nexora Bot</div><div style={{fontSize:11,color:T.textMuted}}>Test with live Knowledge Base</div></div>
            </div>
            <button onClick={()=>setBotConvo([{from:"bot",text:"👋 Hi! I'm Sara from Nexora 😊\nHow can I help you today?",time:ts(),sources:[]}])} style={{padding:"5px 12px",borderRadius:16,border:`1px solid ${T.border}`,background:T.card2,color:T.textMuted,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>↺ Reset</button>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:14,paddingBottom:80,background:T.chatBg,display:"flex",flexDirection:"column",gap:7}}>
            {botConvo.map((msg,i)=>(
              <div key={i} className="mb" style={{display:"flex",justifyContent:msg.from==="user"?"flex-end":"flex-start"}}>
                <div style={{maxWidth:"72%",background:msg.from==="user"?T.msgOut:T.msgIn,borderRadius:msg.from==="user"?"16px 4px 16px 16px":"4px 16px 16px 16px",padding:"9px 13px",boxShadow:"0 1px 2px rgba(0,0,0,.1)"}}>
                  <div style={{fontSize:10,color:msg.from==="user"?"#34B7F1":WA_GREEN,fontWeight:700,marginBottom:3}}>{msg.from==="user"?"👤 You":"🤖 Sara"}</div>
                  <div style={{fontSize:13,lineHeight:1.5,whiteSpace:"pre-wrap",color:T.text}}>{msg.text}</div>
                  <div style={{fontSize:10,color:T.textFaint,textAlign:"right",marginTop:2}}>{formatMsgTime(msg.time, msg.date)}</div>
                  {msg.sources?.length>0&&<div style={{marginTop:4}}>{msg.sources.map(s=><SourceBadge key={s.id} s={s}/>)}</div>}
                </div>
              </div>
            ))}
            {botLoading&&<div style={{display:"flex",justifyContent:"flex-start"}}>
              <div style={{background:T.msgIn,borderRadius:"4px 16px 16px 16px",padding:"10px 14px"}}>
                <div style={{display:"flex",gap:4}}>{[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:T.textMuted,animation:`bounce 1.2s ${i*0.2}s infinite`}}/>)}</div>
              </div>
            </div>}
            <div ref={botEndRef}/>
          </div>
          <div style={{padding:"8px 10px",background:T.nav,borderTop:`1px solid ${T.border}`,display:"flex",gap:6,alignItems:"center"}}>
            <input value={botInput} onChange={e=>setBotInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendBotMessage();}}}
              placeholder="Ask the bot anything..." disabled={botLoading}
              style={{flex:1,background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:20,padding:"9px 14px",color:T.text,fontSize:13}}/>
            <button className="sb" onClick={sendBotMessage} disabled={botLoading||!botInput.trim()} style={{width:40,height:40,borderRadius:"50%",border:"none",background:botLoading||!botInput.trim()?T.card2:WA_GREEN,color:botLoading||!botInput.trim()?T.textFaint:"#fff",fontSize:16,cursor:botLoading?"not-allowed":"pointer",flexShrink:0}}>➤</button>
          </div>
        </div>}

        {tab==="kb"&&<div style={{flex:1,display:"flex",background:T.bg,overflow:"hidden"}}>

          {/* Admin sidebar */}
          {isAdmin&&<div style={{width:220,borderRight:`1px solid ${T.border}`,overflowY:"auto",flexShrink:0,background:T.card}}>
            <div style={{padding:"12px 14px",borderBottom:`1px solid ${T.border}`,fontWeight:700,fontSize:11,color:T.textMuted,letterSpacing:1,textTransform:"uppercase"}}>Knowledge For</div>
            {adminOverview.map(c=>(
              <div key={c.id} onClick={()=>loadKbForClient(c)}
                style={{padding:"11px 14px",cursor:"pointer",background:kbClinic?.id===c.id?`${WA_GREEN}15`:"transparent",borderLeft:kbClinic?.id===c.id?`3px solid ${WA_GREEN}`:"3px solid transparent",display:"flex",alignItems:"center",gap:8}}>
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
                      Leave blank to skip. Example: "Hi! I'm Sara from Evera Health 😊 How can I help you today?"
                    </div>
                  </div>
                </div>
                <textarea value={welcomeMessage} onChange={e=>setWelcomeMessage(e.target.value)} rows={3}
                  placeholder={"Hi! I'm Sara from Evera Health 😊 How can I help you today?"}
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
                    if(!urlVal||!urlVal.startsWith("http")) return alert("Please enter a valid URL starting with https://");
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
                {(()=>{
                  const [m2tab, setM2tab] = window._m2state || (window._m2state = ["paste", ()=>{}]);
                  return null;
                })()}

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
                  if(!text) return alert("Please paste some text or upload a document first");
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
                  if(!newQ.trim()||!newA.trim()) return alert("Please fill in both question and answer");
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

        {tab==="broadcast"&&<div style={{flex:1,overflowY:"auto",padding:24,background:T.bg}}>
          <div style={{maxWidth:700,margin:"0 auto"}}>
            <div style={{fontWeight:800,fontSize:22,marginBottom:4,color:T.text}}>📢 Broadcast</div>
            <div style={{fontSize:13,color:T.textMuted,marginBottom:24}}>Send WhatsApp template messages to multiple contacts at once.</div>

            {/* Template selector */}
            <div style={{background:T.card,borderRadius:16,padding:20,marginBottom:16,border:`1px solid ${T.border}`}}>
              <div style={{fontWeight:700,fontSize:14,marginBottom:12,color:T.text}}>1. Select Template</div>
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:12}}>
                <select value={selectedTemplate?.id||""} onChange={e=>{
                  const t = templates.find(x=>x.id===parseInt(e.target.value));
                  setSelectedTemplate(t||null);
                }} style={{flex:1,padding:"8px 12px",borderRadius:8,border:`1px solid ${T.border}`,background:T.input,color:T.text,fontSize:13,fontFamily:"inherit"}}>
                  <option value="">— Select a template —</option>
                  {templates.map(t=>(
                    <option key={t.id} value={t.id}>{t.template_name} ({t.language}) {t.status==="approved"?"✅":"⏳"}</option>
                  ))}
                </select>
                <button onClick={()=>setShowTemplateForm(p=>!p)} style={{padding:"8px 14px",borderRadius:8,border:`1px solid ${WA_GREEN}`,background:showTemplateForm?WA_GREEN:"transparent",color:showTemplateForm?"#fff":WA_GREEN,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                  {showTemplateForm?"✕ Close":"+ Add Template"}
                </button>
              </div>

              {/* Selected template preview */}
              {selectedTemplate&&<div style={{background:T.card2,borderRadius:10,padding:14,border:`1px solid ${T.border}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <span style={{fontWeight:700,fontSize:13,color:T.text}}>{selectedTemplate.template_name}</span>
                  <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:selectedTemplate.status==="approved"?"#dcfce7":"#fef9c3",color:selectedTemplate.status==="approved"?"#16a34a":"#854d0e",fontWeight:600}}>
                    {selectedTemplate.status==="approved"?"✅ Approved":"⏳ "+selectedTemplate.status}
                  </span>
                </div>
                <div style={{fontSize:12,color:T.textMuted,marginBottom:4}}>Language: {selectedTemplate.language} · Category: {selectedTemplate.category}</div>
                {selectedTemplate.header_type!=="none"&&<div style={{fontSize:12,color:T.textMuted,marginBottom:4}}>Header: {selectedTemplate.header_type} — {selectedTemplate.header_value}</div>}
                <div style={{fontSize:13,color:T.text,background:T.bg,borderRadius:8,padding:"10px 12px",whiteSpace:"pre-wrap",lineHeight:1.6}}>{selectedTemplate.body_text}</div>
                {selectedTemplate.footer_text&&<div style={{fontSize:11,color:T.textFaint,marginTop:6}}>{selectedTemplate.footer_text}</div>}
              </div>}

              {/* Add template form */}
              {showTemplateForm&&<div style={{marginTop:14,borderTop:`1px solid ${T.border}`,paddingTop:14}}>
                <div style={{fontWeight:700,fontSize:13,marginBottom:12,color:T.text}}>New Template</div>
                {[
                  {label:"Template Name *",key:"template_name",ph:"e.g. evera_health_outreach"},
                  {label:"Header Value (URL if image/doc)",key:"header_value",ph:"https://... or leave blank"},
                  {label:"Footer Text",key:"footer_text",ph:"Optional footer text"},
                ].map(f=>(
                  <div key={f.key} style={{marginBottom:10}}>
                    <div style={{fontSize:11,fontWeight:600,color:T.text,marginBottom:4}}>{f.label}</div>
                    <input value={newTemplate[f.key]||""} onChange={e=>setNewTemplate(p=>({...p,[f.key]:e.target.value}))}
                      placeholder={f.ph} style={{width:"100%",background:T.input,border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 12px",color:T.text,fontSize:12,fontFamily:"inherit",boxSizing:"border-box"}}/>
                  </div>
                ))}
                <div style={{display:"flex",gap:8,marginBottom:10}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:11,fontWeight:600,color:T.text,marginBottom:4}}>Language</div>
                    <select value={newTemplate.language} onChange={e=>setNewTemplate(p=>({...p,language:e.target.value}))}
                      style={{width:"100%",padding:"7px 12px",borderRadius:8,border:`1px solid ${T.border}`,background:T.input,color:T.text,fontSize:12,fontFamily:"inherit"}}>
                      <option value="en">English</option>
                      <option value="ms">Malay</option>
                      <option value="en_US">English (US)</option>
                    </select>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:11,fontWeight:600,color:T.text,marginBottom:4}}>Category</div>
                    <select value={newTemplate.category} onChange={e=>setNewTemplate(p=>({...p,category:e.target.value}))}
                      style={{width:"100%",padding:"7px 12px",borderRadius:8,border:`1px solid ${T.border}`,background:T.input,color:T.text,fontSize:12,fontFamily:"inherit"}}>
                      <option value="MARKETING">Marketing</option>
                      <option value="UTILITY">Utility</option>
                      <option value="AUTHENTICATION">Authentication</option>
                    </select>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:11,fontWeight:600,color:T.text,marginBottom:4}}>Header Type</div>
                    <select value={newTemplate.header_type} onChange={e=>setNewTemplate(p=>({...p,header_type:e.target.value}))}
                      style={{width:"100%",padding:"7px 12px",borderRadius:8,border:`1px solid ${T.border}`,background:T.input,color:T.text,fontSize:12,fontFamily:"inherit"}}>
                      <option value="none">None</option>
                      <option value="text">Text</option>
                      <option value="image">Image</option>
                      <option value="document">Document</option>
                      <option value="video">Video</option>
                    </select>
                  </div>
                </div>
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:11,fontWeight:600,color:T.text,marginBottom:4}}>Message Body *</div>
                  <div style={{fontSize:11,color:T.textFaint,marginBottom:4}}>Use {"{{Name}}"} for customer name variable</div>
                  <textarea value={newTemplate.body_text} onChange={e=>setNewTemplate(p=>({...p,body_text:e.target.value}))}
                    placeholder={"Hi {{Name}}! We noticed you enquired about our wellness treatments..."}
                    rows={5} style={{width:"100%",background:T.input,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:12,fontFamily:"inherit",resize:"vertical",boxSizing:"border-box"}}/>
                </div>
                <div style={{marginBottom:14}}>
                  <div style={{fontSize:11,fontWeight:600,color:T.text,marginBottom:4}}>Status</div>
                  <select value={newTemplate.status} onChange={e=>setNewTemplate(p=>({...p,status:e.target.value}))}
                    style={{width:"100%",padding:"7px 12px",borderRadius:8,border:`1px solid ${T.border}`,background:T.input,color:T.text,fontSize:12,fontFamily:"inherit"}}>
                    <option value="pending">Pending Approval</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
                <button onClick={async()=>{
                  if(!newTemplate.template_name||!newTemplate.body_text) return alert("Template name and body are required");
                  const r = await fetch(`${API}/api/templates`,{method:"POST",headers:authHeaders(),body:JSON.stringify(newTemplate)});
                  if(r.ok){
                    const t = await r.json();
                    setTemplates(p=>[t,...p]);
                    setSelectedTemplate(t);
                    setShowTemplateForm(false);
                    setNewTemplate({template_name:"",language:"en",category:"MARKETING",header_type:"none",header_value:"",body_text:"",footer_text:"",variables:[],status:"pending"});
                  }
                }} style={{width:"100%",padding:"10px",borderRadius:10,border:"none",background:WA_GREEN,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                  💾 Save Template
                </button>
              </div>}
            </div>

            {/* Upload contacts */}
            <div style={{background:T.card,borderRadius:16,padding:20,marginBottom:16,border:`1px solid ${T.border}`}}>
              <div style={{fontWeight:700,fontSize:14,marginBottom:4,color:T.text}}>2. Upload Contacts</div>
              <div style={{fontSize:12,color:T.textMuted,marginBottom:12}}>CSV file with columns: <strong>Phone</strong> and <strong>Name</strong> (header row required)</div>
              <input type="file" accept=".csv" onChange={e=>{
                const file = e.target.files[0];
                if(!file) return;
                setBroadcastFile(file);
                const reader = new FileReader();
                reader.onload = ev => {
                  const lines = ev.target.result.split("\n").filter(l=>l.trim());
                  const headers = lines[0].split(",").map(h=>h.trim().toLowerCase().replace(/"/g,""));
                  const phoneIdx = headers.findIndex(h=>h.includes("phone")||h.includes("number"));
                  const nameIdx = headers.findIndex(h=>h.includes("name"));
                  const contacts = [];
                  for(let i=1;i<lines.length;i++){
                    const cols = lines[i].split(",").map(c=>c.trim().replace(/"/g,""));
                    const phone = phoneIdx>=0?cols[phoneIdx]:"";
                    const name = nameIdx>=0?cols[nameIdx]:"";
                    if(phone) contacts.push({phone,name:name||phone});
                  }
                  setBroadcastContacts(contacts);
                };
                reader.readAsText(file);
              }} style={{display:"none"}} id="broadcast-file-input"/>
              <label htmlFor="broadcast-file-input" style={{display:"inline-flex",alignItems:"center",gap:8,padding:"8px 16px",borderRadius:8,border:`1.5px dashed ${T.border}`,cursor:"pointer",color:T.textMuted,fontSize:12,fontWeight:600}}>
                📎 Choose CSV File
              </label>
              {broadcastContacts.length>0&&<div style={{marginTop:10,fontSize:12,color:WA_GREEN,fontWeight:600}}>
                ✅ {broadcastContacts.length} contacts loaded
                <div style={{marginTop:6,maxHeight:100,overflowY:"auto",background:T.card2,borderRadius:8,padding:8}}>
                  {broadcastContacts.slice(0,5).map((c,i)=>(
                    <div key={i} style={{fontSize:11,color:T.textMuted}}>{c.name} — {c.phone}</div>
                  ))}
                  {broadcastContacts.length>5&&<div style={{fontSize:11,color:T.textFaint}}>...and {broadcastContacts.length-5} more</div>}
                </div>
              </div>}
            </div>

            {/* Send button */}
            <div style={{background:T.card,borderRadius:16,padding:20,border:`1px solid ${T.border}`}}>
              <div style={{fontWeight:700,fontSize:14,marginBottom:12,color:T.text}}>3. Send Broadcast</div>
              {selectedTemplate&&selectedTemplate.status!=="approved"&&<div style={{background:"#fef9c3",border:"1px solid #fcd34d",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#854d0e",marginBottom:12}}>
                ⚠️ This template is not approved yet. Only approved templates can be sent.
              </div>}
              <button onClick={async()=>{
                if(!selectedTemplate) return alert("Please select a template first");
                if(selectedTemplate.status!=="approved") return alert("Template must be approved before sending");
                if(broadcastContacts.length===0) return alert("Please upload a contacts CSV first");
                if(!confirm(`Send to ${broadcastContacts.length} contacts?`)) return;
                
                setBroadcastProgress({total:broadcastContacts.length, done:0, failed:0, active:true});
                const cs = await fetch(`${API}/api/client-settings`,{headers:authHeaders()}).then(r=>r.json()).catch(()=>({}));
                
                for(let i=0;i<broadcastContacts.length;i++){
                  const contact = broadcastContacts[i];
                  const msg = (selectedTemplate.body_text||"").replace(/\{\{Name\}\}/gi, contact.name);
                  try {
                    await fetch(`${API}/api/broadcast/send`,{method:"POST",headers:authHeaders(),body:JSON.stringify({
                      phone: contact.phone,
                      name: contact.name,
                      template_id: selectedTemplate.id,
                      message: msg,
                    })});
                    setBroadcastProgress(p=>({...p, done:p.done+1}));
                  } catch {
                    setBroadcastProgress(p=>({...p, failed:p.failed+1, done:p.done+1}));
                  }
                  await new Promise(r=>setTimeout(r,300));
                }
                setBroadcastProgress(p=>({...p, active:false}));
              }} disabled={!selectedTemplate||broadcastContacts.length===0}
                style={{width:"100%",padding:"12px",borderRadius:10,border:"none",
                  background:(!selectedTemplate||broadcastContacts.length===0)?"#ccc":WA_GREEN,
                  color:"#fff",fontSize:14,fontWeight:700,cursor:(!selectedTemplate||broadcastContacts.length===0)?"not-allowed":"pointer",fontFamily:"inherit"}}>
                📤 Send to {broadcastContacts.length} Contacts
              </button>

              {/* Progress */}
              {broadcastProgress&&<div style={{marginTop:14,background:T.card2,borderRadius:10,padding:14}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                  <span style={{fontSize:12,fontWeight:600,color:T.text}}>
                    {broadcastProgress.active?"Sending...":"Done!"}
                  </span>
                  <span style={{fontSize:12,color:T.textMuted}}>{broadcastProgress.done}/{broadcastProgress.total}</span>
                </div>
                <div style={{height:6,borderRadius:3,background:T.border,overflow:"hidden"}}>
                  <div style={{height:6,borderRadius:3,background:WA_GREEN,width:`${(broadcastProgress.done/broadcastProgress.total)*100}%`,transition:"width .3s"}}/>
                </div>
                {broadcastProgress.failed>0&&<div style={{fontSize:11,color:"#ef4444",marginTop:4}}>{broadcastProgress.failed} failed</div>}
                {!broadcastProgress.active&&<div style={{fontSize:12,color:WA_GREEN,marginTop:6,fontWeight:600}}>✅ Broadcast complete!</div>}
              </div>}
            </div>
          </div>
        </div>}

        {tab==="integrations"&&<IntegrationsTab
          T={T} WA_GREEN={WA_GREEN} dark={dark} isAdmin={isAdmin}
          currentUser={currentUser} authToken={authToken}
          permissions={permissions} API={API}/>}


        {tab==="settings"&&<div style={{flex:1,display:"flex",background:T.bg,overflow:"hidden"}}>

          {/* Admin sidebar */}
          {isAdmin&&<div style={{width:220,borderRight:`1px solid ${T.border}`,overflowY:"auto",flexShrink:0,background:T.card}}>
            <div style={{padding:"12px 14px",borderBottom:`1px solid ${T.border}`,fontWeight:700,fontSize:11,color:T.textMuted,letterSpacing:1,textTransform:"uppercase"}}>Settings For</div>
            {adminOverview.map(c=>(
              <div key={c.id} onClick={()=>loadClientSettings(c)}
                style={{padding:"11px 14px",cursor:"pointer",background:settingsClinic?.id===c.id?`${WA_GREEN}15`:"transparent",borderLeft:settingsClinic?.id===c.id?`3px solid ${WA_GREEN}`:"3px solid transparent",display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:32,height:32,borderRadius:9,overflow:"hidden",background:`${WA_GREEN}12`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  {c.logo_url?<img src={c.logo_url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:<span style={{fontSize:15}}>🏢</span>}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:700,color:settingsClinic?.id===c.id?WA_GREEN:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.company_name||c.username}</div>
                  <div style={{fontSize:10,color:T.textMuted,marginTop:1}}>{c.industry||"Client"}</div>
                </div>
              </div>
            ))}
            {adminOverview.length===0&&<div style={{padding:20,fontSize:12,color:T.textMuted,textAlign:"center"}}>No clients yet</div>}
          </div>}

          {/* Main settings area */}
          <div style={{flex:1,overflowY:"auto",padding:16,paddingBottom:80}}>

            {/* Admin must pick client */}
            {isAdmin&&!settingsClinic&&<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"60%",color:T.textMuted}}>
              <div style={{fontSize:48,marginBottom:12}}>👈</div>
              <div style={{fontWeight:700,fontSize:16,marginBottom:6}}>Select a client</div>
              <div style={{fontSize:13}}>Choose from the sidebar to edit their settings</div>
            </div>}
            {isAdmin&&settingsClinic&&settingsLoading&&<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"60%",gap:16}}>
              <div style={{width:44,height:44,borderRadius:"50%",border:`4px solid ${WA_GREEN}20`,borderTop:`4px solid ${WA_GREEN}`,animation:"spin 0.8s linear infinite"}}/>
              <div style={{fontWeight:600,fontSize:14,color:T.textMuted}}>Loading {settingsClinic.company_name||"client"} settings...</div>
            </div>}

            {(!isAdmin||settingsClinic)&&!settingsLoading&&<div style={{maxWidth:720,margin:"0 auto",width:"100%"}}>

              {/* ── STICKY SAVE BAR ── */}
              <div style={{position:"sticky",top:0,zIndex:10,background:T.bg,paddingBottom:10,paddingTop:2,marginBottom:14}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderRadius:14,
                  background:settingsDirty?`${WA_GREEN}10`:T.card,
                  border:`2px solid ${settingsDirty?WA_GREEN:T.border}`,
                  boxShadow:settingsDirty?"0 4px 20px rgba(37,211,102,.15)":"0 1px 4px rgba(0,0,0,.05)",
                  transition:"all .3s"}}>
                  <div>
                    <div style={{fontWeight:800,fontSize:15}}>⚙️ Settings</div>
                    {settingsDirty
                      ?<div style={{fontSize:11,color:WA_GREEN,marginTop:2,fontWeight:600,display:"flex",alignItems:"center",gap:4}}>
                          <div style={{width:6,height:6,borderRadius:"50%",background:WA_GREEN,animation:"pulse 1.5s infinite"}}/>
                          Unsaved changes — click Save All
                        </div>
                      :<div style={{fontSize:11,color:T.textMuted,marginTop:2}}>✅ All settings saved</div>}
                  </div>
                  <button onClick={saveSettings}
                    style={{padding:"10px 28px",borderRadius:12,border:"none",
                      background:settingsDirty?WA_GREEN:"#94a3b8",
                      color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",
                      fontFamily:"inherit",
                      boxShadow:settingsDirty?"0 4px 14px rgba(37,211,102,.4)":"none",
                      transform:settingsDirty?"scale(1.02)":"scale(1)",
                      transition:"all .3s"}}>
                    💾 Save All
                  </button>
                </div>
              </div>

              {/* Client header bar */}
              {isAdmin&&settingsClinic&&<div style={{padding:"12px 16px",background:`${WA_GREEN}10`,borderRadius:12,border:`1px solid ${WA_GREEN}30`,marginBottom:16,display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:32,height:32,borderRadius:8,overflow:"hidden",background:`${WA_GREEN}15`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  {settingsClinic.logo_url?<img src={settingsClinic.logo_url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:<span style={{fontSize:16}}>🏢</span>}
                </div>
                <div style={{fontWeight:700,fontSize:14,color:WA_GREEN}}>{settingsClinic.company_name||settingsClinic.username}</div>
                <div style={{fontSize:11,color:T.textMuted,marginLeft:4}}>Changes save to their account only</div>
              </div>}

              {/* ── TELEGRAM NOTIFICATIONS ── */}
              <div className="cc" style={{marginBottom:16}}>
                <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:16}}>
                  <div style={{width:40,height:40,borderRadius:12,background:"#eff6ff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>📱</div>
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:12}}>
                      <div style={{fontWeight:800,fontSize:15}}>Telegram Notifications</div>
                      
                    </div>
                    <div style={{fontSize:11,color:T.textMuted,lineHeight:1.6}}>
                      Get instant alerts on Telegram when hot leads appear, customers want to book, or a human is needed.
                      Works with any Telegram group or personal chat.
                    </div>
                  </div>
                </div>

                {/* Connection status - read only, configured in Integrations tab */}
                {(appSettings.telegram_token||"").length>5&&(appSettings.telegram_chat_id||"").length>3
                  ?<div style={{padding:"8px 12px",borderRadius:8,background:"#f0fdf4",border:"1px solid #86efac",fontSize:11,color:"#166534",fontWeight:600,marginBottom:14,display:"flex",alignItems:"center",gap:6}}>
                    ✅ Telegram connected — alerts will be sent to your group
                  </div>
                  :<div style={{padding:"8px 12px",borderRadius:8,background:"#fffbeb",border:"1px solid #fcd34d",fontSize:11,color:"#92400e",marginBottom:14,display:"flex",alignItems:"center",gap:6}}>
                    ⚠️ Not connected — go to <strong style={{marginLeft:4}}>🔌 Integrations</strong> tab to connect Telegram
                  </div>}

                {/* Notify triggers */}
                <div style={{fontSize:11,fontWeight:700,color:T.textMuted,marginBottom:8,textTransform:"uppercase",letterSpacing:0.5}}>Notify me when:</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
                  {[
                    {key:"telegram_notify_hot",    label:"🔥 Hot Lead detected",      def:"true",  desc:"High intent customer"},
                    {key:"telegram_notify_warm",   label:"🟡 Warm Lead detected",     def:"false", desc:"Interested customer"},
                    {key:"telegram_notify_human",  label:"🚨 Human needed",           def:"true",  desc:"Complex medical question"},
                    {key:"telegram_notify_booking",label:"📅 Booking intent detected", def:"true",  desc:"Customer wants appointment"},
                  ].map(t=>(
                    <div key={t.key} onClick={()=>{setAppSettings(p=>({...p,[t.key]:p[t.key]==="false"?"true":"false"}));setSettingsDirtyWithRef(true);}}
                      style={{padding:"10px 12px",borderRadius:10,border:`1px solid ${(appSettings[t.key]||t.def)!=="false"?WA_GREEN:T.border}`,
                        background:(appSettings[t.key]||t.def)!=="false"?`${WA_GREEN}08`:T.card2,
                        cursor:"pointer",display:"flex",alignItems:"center",gap:8,transition:"all .15s"}}>
                      <div style={{width:36,height:20,borderRadius:10,
                        background:(appSettings[t.key]||t.def)!=="false"?WA_GREEN:"#94a3b8",
                        position:"relative",transition:"background .2s",flexShrink:0}}>
                        <div style={{position:"absolute",top:2,left:(appSettings[t.key]||t.def)!=="false"?18:2,
                          width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,.3)"}}/>
                      </div>
                      <div>
                        <div style={{fontSize:12,fontWeight:600,color:T.text}}>{t.label}</div>
                        <div style={{fontSize:10,color:T.textMuted}}>{t.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Test button */}
<button
                  onClick={async()=>{
                    // Get values from DOM in case not saved to state yet
                    const tokenEl = document.getElementById("tg-token-input");
                    const chatEl = document.getElementById("tg-chat-input");
                    const token = tokenEl?.value || appSettings.telegram_token;
                    const chatId = chatEl?.value || appSettings.telegram_chat_id;
                    if(!token||!chatId) return alert("Please enter Bot Token and Chat ID first");
                    // Save first
                    await fetch(`${API}/api/settings`,{method:"PATCH",headers:authHeaders(),
                      body:JSON.stringify({...appSettings,telegram_token:token,telegram_chat_id:chatId})});
                    setSettingsDirtyWithRef(false);
                    // Then test
                    const r = await fetch(`${API}/api/settings/test-telegram`,{method:"POST",headers:authHeaders()});
                    const d = await r.json();
                    if(d.ok) {
                      setConfirmModal({
                        title:"Test Sent! ✅",
                        message:"Check your Telegram group — you should see a message from your bot right now.",
                        icon:"📨",
                        danger:false,
                        confirmText:"Got it!",
                        onConfirm:()=>{}
                      });
                    } else {
                      setConfirmModal({
                        title:"Failed to Send ❌",
                        message:"Could not send to Telegram. Please check: Bot Token is correct, Chat ID starts with -, Bot is added to group as Admin, and Settings are saved.",
                        icon:"⚠️",
                        danger:true,
                        confirmText:"OK, I'll check",
                        onConfirm:()=>{}
                      });
                    }
                  }}
                  style={{padding:"8px 18px",borderRadius:10,border:"none",background:"#0088cc",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:6}}>
                  📨 Send Test Message
                </button>
              </div>

              {/* API Key status */}
              {isAdmin&&settingsClinic&&(()=>{
                const activeKey = appSettings.anthropic_key||appSettings.openai_key||appSettings.groq_key||"";
                return <div style={{background:activeKey?"#f0fdf4":"#fef9c3",border:`1px solid ${activeKey?"#86efac":"#fde68a"}`,borderRadius:12,padding:"12px 16px",marginBottom:16}}>
                  {activeKey
                    ?<div style={{fontSize:13,color:"#166534",fontWeight:600}}>✅ API Key set for {settingsClinic.company_name||settingsClinic.username}</div>
                    :<div style={{fontSize:13,color:"#854d0e",fontWeight:600}}>⚠️ No API key set — add one in AI Provider section below and save</div>}
                </div>;
              })()}

              {/* AI Bot section */}
              <div className="cc" style={{marginBottom:14}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:15}}>🤖 AI Bot</div>
                      <div style={{fontSize:12,color:T.textMuted,marginTop:2}}>{appSettings.ai_enabled!=="false"?"Active — bot replies automatically":"Disabled — manual replies only"}</div>
                    </div>
                    
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:13,fontWeight:700,color:appSettings.ai_enabled!=="false"?WA_GREEN:"#ef4444"}}>{appSettings.ai_enabled!=="false"?"ON":"OFF"}</span>
                    <div onClick={()=>{setAppSettings(p=>({...p,ai_enabled:p.ai_enabled==="false"?"true":"false"}));setSettingsDirtyWithRef(true);}}
                      style={{width:48,height:26,borderRadius:13,cursor:"pointer",background:appSettings.ai_enabled!=="false"?WA_GREEN:"#ef4444",position:"relative",transition:"background .2s",flexShrink:0}}>
                      <div style={{position:"absolute",top:3,left:appSettings.ai_enabled!=="false"?23:3,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,.3)"}}/>
                    </div>
                  </div>
                </div>

                {/* AI Provider cards — per provider key */}
                <AIProviderCards
                  appSettings={appSettings}
                  setAppSettings={setAppSettings}
                  setSettingsDirtyWithRef={setSettingsDirtyWithRef}
                  T={T}
                />
              </div>

              {/* Lead Keywords */}
              <div className="cc" style={{marginBottom:14}}>
                <div style={{fontWeight:700,fontSize:14,marginBottom:14}}>🎯 Lead Scoring Keywords</div>
                {[
                  {key:"hot_keywords", label:"🔥 Hot Keywords", color:"#ef4444", bg:"#fef2f2", border:"#fca5a5", hint:"Type keywords separated by commas — e.g. book, appointment, price, how much", ph:"book, appointment, price, cost, how much, register"},
                  {key:"warm_keywords", label:"🟡 Warm Keywords", color:"#f59e0b", bg:"#fffbeb", border:"#fcd34d", hint:"Keywords showing interest but not ready to book yet", ph:"interested, tell me more, what services, diabetes, treatment"},
                  {key:"cold_keywords", label:"🔵 Cold Keywords", color:"#3b82f6", bg:"#eff6ff", border:"#93c5fd", hint:"Keywords from people just browsing", ph:"just looking, maybe later, not sure, just curious"},
                ].map(kw=>(
                  <div key={kw.key} style={{marginBottom:16}}>
                    <div style={{fontWeight:700,fontSize:12,color:T.text,marginBottom:4}}>{kw.label}</div>
                    <div style={{fontSize:11,color:T.textFaint,marginBottom:6}}>{kw.hint}</div>
                    <textarea
                      value={appSettings[kw.key]||""}
                      onChange={e=>{setAppSettings(p=>({...p,[kw.key]:e.target.value}));setSettingsDirtyWithRef(true);}}
                      placeholder={kw.ph}
                      rows={3}
                      style={{width:"100%",background:T.input,border:`2px solid ${kw.border}`,borderRadius:10,
                        padding:"10px 14px",color:T.text,fontSize:13,fontFamily:"inherit",
                        resize:"vertical",boxSizing:"border-box",lineHeight:1.6,
                        outline:"none",transition:"border-color .2s"}}
                      onFocus={e=>e.target.style.borderColor=kw.color}
                      onBlur={e=>e.target.style.borderColor=kw.border}
                    />
                    {/* Show keyword chips preview */}
                    {(appSettings[kw.key]||"").trim()&&<div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:6}}>
                      {(appSettings[kw.key]||"").split(",").map(k=>k.trim()).filter(k=>k).map((k,i)=>(
                        <span key={i} style={{fontSize:11,padding:"2px 8px",borderRadius:20,
                          background:kw.bg,color:kw.color,border:`1px solid ${kw.border}`,fontWeight:600}}>
                          {k}
                        </span>
                      ))}
                    </div>}
                  </div>
                ))}
              </div>

              {/* Follow-up */}
              <div className="cc" style={{marginBottom:14}}>
                {/* Header + toggle */}
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:15}}>⏰ Smart Auto Follow-up</div>
                      <div style={{fontSize:11,color:T.textMuted,marginTop:2}}>{appSettings.followup_enabled==="true"?"Active — sends automatically when customer goes silent":"Disabled — only manual follow-ups"}</div>
                    </div>
                    
                  </div>
                  <div onClick={()=>{setAppSettings(p=>({...p,followup_enabled:p.followup_enabled==="true"?"false":"true"}));setSettingsDirtyWithRef(true);}}
                    style={{width:48,height:26,borderRadius:13,cursor:"pointer",background:appSettings.followup_enabled==="true"?WA_GREEN:"#ef4444",position:"relative",transition:"background .2s",flexShrink:0}}>
                    <div style={{position:"absolute",top:3,left:appSettings.followup_enabled==="true"?23:3,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,.3)"}}/>
                  </div>
                </div>

                {/* How it works info */}
                <div style={{background:`${WA_GREEN}08`,border:`1px solid ${WA_GREEN}25`,borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:11,color:T.textMuted,lineHeight:1.6}}>
                  🤖 <strong style={{color:T.text}}>How it works:</strong> AI reads the full conversation → decides if follow-up is needed → writes personalized message in customer's language.<br/>
                  ⏸️ <strong style={{color:T.text}}>Auto-stops</strong> if customer said thanks/bye/confirmed/booked.<br/>
                  📋 <strong style={{color:T.text}}>Fallback messages</strong> below are only sent if AI API fails.
                </div>

                <div style={{opacity:appSettings.followup_enabled==="true"?1:.5,pointerEvents:appSettings.followup_enabled==="true"?"auto":"none"}}>

                  {/* Follow-up 1 */}
                  <div style={{background:T.card2,borderRadius:12,padding:14,marginBottom:12,border:`1px solid ${appSettings.followup_1_enabled!=="false"?WA_GREEN:T.border}`}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                      <div style={{fontWeight:700,fontSize:13,color:appSettings.followup_1_enabled!=="false"?WA_GREEN:T.textMuted}}>
                        📨 Follow-up 1 {appSettings.followup_1_enabled!=="false"?"✅ Enabled":"⏸️ Disabled"}
                      </div>
                      <div onClick={()=>{setAppSettings(p=>({...p,followup_1_enabled:p.followup_1_enabled==="false"?"true":"false"}));setSettingsDirtyWithRef(true);}}
                        style={{width:44,height:24,borderRadius:12,cursor:"pointer",background:appSettings.followup_1_enabled!=="false"?WA_GREEN:"#94a3b8",position:"relative",transition:"background .2s",flexShrink:0}}>
                        <div style={{position:"absolute",top:2,left:appSettings.followup_1_enabled!=="false"?22:2,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,.3)"}}/>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10}}>
                      <div style={{fontSize:12,color:T.textMuted,whiteSpace:"nowrap"}}>Send after</div>
                      <input type="number" value={appSettings.followup_1_delay||"2"} onChange={e=>{setAppSettings(p=>({...p,followup_1_delay:e.target.value}));setSettingsDirtyWithRef(true);}}
                        style={{width:70,background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:8,padding:"7px 10px",color:T.text,fontSize:13,textAlign:"center"}}/>
                      <select value={appSettings.followup_1_delay_unit||"hours"} onChange={e=>{setAppSettings(p=>({...p,followup_1_delay_unit:e.target.value}));setSettingsDirtyWithRef(true);}}
                        style={{background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:8,padding:"7px 10px",color:T.text,fontSize:13,fontFamily:"inherit"}}>
                        <option value="mins">Minutes</option>
                        <option value="hours">Hours</option>
                        <option value="days">Days</option>
                      </select>
                      <div style={{fontSize:11,color:T.textMuted}}>of silence</div>
                    </div>
                    <div style={{fontSize:11,fontWeight:700,color:T.textMuted,marginBottom:5}}>FALLBACK MESSAGE (if AI fails)</div>
                    <textarea value={appSettings.followup_1_message||""} rows={2}
                      onChange={e=>setAppSettings(p=>({...p,followup_1_message:e.target.value}))}
                      placeholder="Hi {name}! Just checking in..."
                      style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:12,fontFamily:"inherit",boxSizing:"border-box"}}/>
                    <div style={{fontSize:10,color:T.textFaint,marginTop:4}}>Use {"{name}"} for customer name</div>
                  </div>

                  {/* Follow-up 2 */}
                  <div style={{background:T.card2,borderRadius:12,padding:14,marginBottom:12,border:`1px solid ${appSettings.followup_2_enabled==="true"?"#f59e0b":T.border}`}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                      <div style={{fontWeight:700,fontSize:13,color:appSettings.followup_2_enabled==="true"?"#f59e0b":T.textMuted}}>
                        📨 Follow-up 2 {appSettings.followup_2_enabled==="true"?"✅ Enabled":"⏸️ Disabled"}
                      </div>
                      <div onClick={()=>{setAppSettings(p=>({...p,followup_2_enabled:p.followup_2_enabled==="true"?"false":"true"}));setSettingsDirtyWithRef(true);}}
                        style={{width:44,height:24,borderRadius:12,cursor:"pointer",background:appSettings.followup_2_enabled==="true"?"#f59e0b":"#94a3b8",position:"relative",transition:"background .2s",flexShrink:0}}>
                        <div style={{position:"absolute",top:2,left:appSettings.followup_2_enabled==="true"?22:2,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,.3)"}}/>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10}}>
                      <div style={{fontSize:12,color:T.textMuted,whiteSpace:"nowrap"}}>Send after</div>
                      <input type="number" value={appSettings.followup_2_delay||"24"} onChange={e=>{setAppSettings(p=>({...p,followup_2_delay:e.target.value}));setSettingsDirtyWithRef(true);}}
                        style={{width:70,background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:8,padding:"7px 10px",color:T.text,fontSize:13,textAlign:"center"}}/>
                      <select value={appSettings.followup_2_delay_unit||"hours"} onChange={e=>{setAppSettings(p=>({...p,followup_2_delay_unit:e.target.value}));setSettingsDirtyWithRef(true);}}
                        style={{background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:8,padding:"7px 10px",color:T.text,fontSize:13,fontFamily:"inherit"}}>
                        <option value="mins">Minutes</option>
                        <option value="hours">Hours</option>
                        <option value="days">Days</option>
                      </select>
                      <div style={{fontSize:11,color:T.textMuted}}>after follow-up 1</div>
                    </div>
                    <div style={{fontSize:11,fontWeight:700,color:T.textMuted,marginBottom:5}}>FALLBACK MESSAGE (if AI fails)</div>
                    <textarea value={appSettings.followup_2_message||""} rows={2}
                      onChange={e=>setAppSettings(p=>({...p,followup_2_message:e.target.value}))}
                      placeholder="Hello {name}! We still have slots available..."
                      style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:12,fontFamily:"inherit",boxSizing:"border-box"}}/>
                    <div style={{fontSize:10,color:T.textFaint,marginTop:4}}>Use {"{name}"} for customer name</div>
                  </div>



                </div>
              </div>

            </div>}
          </div>
        </div>}

        {/* ══ CONFIRM MODAL ══ */}
        <ConfirmModal modal={confirmModal} onClose={()=>setConfirmModal(null)} T={T} WA_GREEN={WA_GREEN}/>

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
              <button onClick={()=>{
                setShowUnsavedModal(false);
                setSettingsDirtyWithRef(false);
                setTab(pendingTab);
                setPendingTab(null);
                fetchSettings(null, true); // Force reload from DB
              }}
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

        {/* ══ ADMIN TAB ══ */}
        {tab==="admin"&&isAdmin&&<div style={{flex:1,overflowY:"auto",overflowX:"hidden",paddingBottom:80}}><AdminPanel authHeaders={authHeaders} T={T} WA_GREEN={WA_GREEN} dark={dark} setConfirmModal={setConfirmModal}/></div>}

      </div>
    </div>
  );
}

// ── INTEGRATIONS TAB ──────────────────────────────────────────────────────────
function IntegrationsTab({T, WA_GREEN, dark, isAdmin, currentUser, authToken, permissions, API}) {
  const authHeaders = () => ({"Content-Type":"application/json","Authorization":`Bearer ${authToken}`});
  const [selClinicId, setSelClinicId] = React.useState(null);
  const [editConn, setEditConn] = React.useState(null);
  const [connForm, setConnForm] = React.useState({});
  const [saving, setSaving] = React.useState(false);
  const [connData, setConnData] = React.useState({});
  const [clientList, setClientList] = React.useState([]);

  // Load clients list
  React.useEffect(()=>{
    if(!authToken) return;
    if(isAdmin) {
      fetch(`${API}/api/admin/clients`,{headers:authHeaders()})
        .then(r=>r.ok?r.json():[]).then(d=>{
          if(Array.isArray(d)&&d.length>0) {
            setClientList(d);
            setSelClinicId(d[0].id); // auto-select first client
          }
        }).catch(()=>{});
    } else {
      setClientList([{id:currentUser?.clinic_id,name:currentUser?.company_name||"Your Clinic",logo_url:currentUser?.logo_url}]);
      setSelClinicId(currentUser?.clinic_id);
    }
  },[authToken]);

  // Load connector data when client selected - clear first
  React.useEffect(()=>{
    if(!selClinicId) return;
    setConnData({}); // clear previous client data
    const url = isAdmin
      ? `${API}/api/admin/clients/${selClinicId}/settings`
      : `${API}/api/settings`;
    fetch(url,{headers:authHeaders()})
      .then(r=>r.ok?r.json():null)
      .then(d=>{if(d) setConnData(d);})
      .catch(()=>{});
  },[selClinicId]);

  const myClient = clientList.find(c=>String(c.id)===String(selClinicId));

  // All connectors with enabled flag (admin can toggle)
  const ALL_CONNECTORS = [
    {id:"whatsapp",  label:"WhatsApp",  color:"#25D366", permKey:"integration_whatsapp",
     desc:"Receive and reply to WhatsApp messages with AI",
     isConnected:(d)=>!!(d.phone_number_id||d.whatsapp_number),
     statusText:(d)=>d.whatsapp_number||"",
     fields:[{key:"phone_number_id",label:"Phone Number ID",ph:"985068241357564"},
             {key:"whatsapp_number",label:"WhatsApp Number",ph:"+60 11 1050 7200"},
             {key:"whatsapp_token",label:"Access Token",ph:"EAAxxxxxxxx",pwd:true}],
     logo:"📱"},
    {id:"telegram",  label:"Telegram",  color:"#229ED9", permKey:"integration_telegram",
     desc:"Get instant lead alerts and notifications",
     isConnected:(d)=>!!(d.telegram_token&&d.telegram_token.length>5),
     statusText:(d)=>d.telegram_chat_id?"Chat: "+d.telegram_chat_id:"",
     fields:[{key:"telegram_token",label:"Bot Token",ph:"8664616537:AAGE9wn...",pwd:true},
             {key:"telegram_chat_id",label:"Group Chat ID",ph:"-5277820778"}],
     logo:"✈️"},
    {id:"instagram", label:"Instagram", color:"#E1306C", permKey:"integration_instagram",
     desc:"Automate Instagram DM replies", isConnected:()=>false, statusText:()=>"",
     fields:[], logo:"📸"},
    {id:"tiktok",    label:"TikTok",    color:"#010101", permKey:"integration_tiktok",
     desc:"Automate TikTok comment replies", isConnected:()=>false, statusText:()=>"",
     fields:[], logo:"🎵"},
    {id:"messenger", label:"Messenger", color:"#0084FF", permKey:"integration_messenger",
     desc:"Facebook Messenger automation", isConnected:()=>false, statusText:()=>"",
     fields:[], logo:"💬"},
    {id:"gcal",      label:"Google Calendar", color:"#4285F4", permKey:"integration_calendar",
     desc:"Auto-create appointments", isConnected:()=>false, statusText:()=>"",
     fields:[], logo:"📅"},
  ];

  // Admin sees all, client sees only what admin enabled
  const visibleConnectors = isAdmin ? ALL_CONNECTORS : ALL_CONNECTORS.filter(c=>{
    if(permissions==="all"||!permissions) return true;
    const hasAny = ALL_CONNECTORS.some(x=>permissions[x.permKey]);
    if(!hasAny) return true; // show all if none set yet
    return permissions[c.permKey];
  });

  const saveConnector = async () => {
    if(!selClinicId) return;
    setSaving(true);
    try {
      const url = isAdmin ? `${API}/api/admin/clients/${selClinicId}/settings` : `${API}/api/settings`;
      const r = await fetch(url,{method:"PATCH",headers:authHeaders(),body:JSON.stringify(connForm)});
      if(r.ok) {
        setConnData(p=>({...p,...connForm}));
        setEditConn(null); setConnForm({});
      }
    } catch(e){ alert("Save failed: "+e.message); }
    setSaving(false);
  };

  return (
    <div style={{flex:1,background:T.bg,overflowY:"auto",paddingBottom:80}}>
      <div style={{maxWidth:800,margin:"0 auto",padding:"20px 16px 40px"}}>
        <div style={{marginBottom:20}}>
          <div style={{fontWeight:900,fontSize:22,marginBottom:4}}>🔌 Integrations</div>
          <div style={{fontSize:13,color:T.textMuted}}>
            {isAdmin?"Connect channels for each client — toggle to enable/disable":"Your connected channels"}
          </div>
        </div>

        {/* Admin client selector */}
        {isAdmin&&<div style={{marginBottom:20}}>
          <div style={{fontSize:11,fontWeight:700,color:T.textMuted,textTransform:"uppercase",letterSpacing:0.5,marginBottom:8}}>Client</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {clientList.map(c=>{
              const sel = String(c.id)===String(selClinicId);
              return <div key={c.id} onClick={()=>setSelClinicId(c.id)}
                style={{display:"flex",alignItems:"center",gap:8,padding:"8px 14px",borderRadius:12,cursor:"pointer",
                  border:`2px solid ${sel?WA_GREEN:T.border}`,background:sel?`${WA_GREEN}10`:T.card}}>
                <div style={{width:26,height:26,borderRadius:7,overflow:"hidden",background:`${WA_GREEN}15`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  {c.logo_url?<img src={c.logo_url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:<span style={{fontSize:13}}>🏢</span>}
                </div>
                <span style={{fontWeight:700,fontSize:13,color:sel?WA_GREEN:T.text}}>{c.name||c.company_name}</span>
                {sel&&<span style={{fontSize:11,color:WA_GREEN}}>✓</span>}
              </div>;
            })}
          </div>
          {!selClinicId&&<div style={{marginTop:12,padding:20,textAlign:"center",color:T.textMuted,fontSize:13,background:T.card,borderRadius:12,border:`1px dashed ${T.border}`}}>
            Select a client above
          </div>}
        </div>}

        {/* Connectors grid */}
        {selClinicId&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:14}}>
          {visibleConnectors.map(conn=>{
            const connected = conn.isConnected(connData);
            const isEnabled = isAdmin ? true : (permissions==="all"||!permissions||permissions[conn.permKey]);
            const canConnect = isAdmin; // only admin can connect
            // notYetBuilt only applies to non-admin users
            const notYetBuilt = !isAdmin && !conn.fields.length && !connected;

            return (
              <div key={conn.id} style={{background:T.card,borderRadius:16,padding:20,textAlign:"center",
                border:`2px solid ${connected?conn.color+"50":T.border}`,
                position:"relative",transition:"all .2s"}}>
                {/* Connected dot */}
                {connected&&<div style={{position:"absolute",top:10,right:10,width:9,height:9,borderRadius:"50%",background:"#22c55e",boxShadow:"0 0 0 2px #fff"}}/>}

                {/* Logo */}
                <div style={{width:54,height:54,borderRadius:14,background:`${conn.color}15`,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  margin:"0 auto 12px",fontSize:26}}>
                  {conn.logo}
                </div>

                <div style={{fontWeight:800,fontSize:14,marginBottom:4}}>{conn.label}</div>
                <div style={{fontSize:11,color:T.textMuted,marginBottom:14,lineHeight:1.5}}>{conn.desc}</div>

                {connected?(
                  <div>
                    <div style={{fontSize:10,padding:"2px 10px",borderRadius:10,background:"#dcfce7",color:"#166534",fontWeight:700,display:"inline-block",marginBottom:8}}>
                      ✅ Connected
                    </div>
                    {conn.statusText(connData)&&<div style={{fontSize:10,color:T.textMuted,marginBottom:8}}>{conn.statusText(connData)}</div>}
                    {canConnect&&<button onClick={()=>{
                      const init={};conn.fields.forEach(f=>{init[f.key]=connData[f.key]||"";});
                      setConnForm(init);setEditConn(conn);
                    }} style={{fontSize:11,padding:"5px 14px",borderRadius:8,border:`1px solid ${T.border}`,background:T.card2,color:T.text,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>
                      ✏️ Edit
                    </button>}
                  </div>
                ):notYetBuilt?(
                  <span style={{fontSize:11,color:"#94a3b8",fontWeight:600}}>
                    {isAdmin?"🔧 Coming soon":"Coming soon"}
                  </span>
                ):canConnect?(
                  <button onClick={()=>{
                    if(!conn.fields.length){
                      alert(conn.label+" integration is coming soon! We are working on it.");
                      return;
                    }
                    const init={};conn.fields.forEach(f=>{init[f.key]="";});
                    setConnForm(init);setEditConn(conn);
                  }} style={{fontSize:12,padding:"8px 20px",borderRadius:10,border:"none",
                    background:conn.color,color:"#fff",cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>
                    🔧 Coming Soon
                  </button>
                ):(
                  <span style={{fontSize:11,color:"#94a3b8"}}>Not configured</span>
                )}
              </div>
            );
          })}
        </div>}

        {/* Connect/Edit modal */}
        {editConn&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center"}}
          onClick={e=>{if(e.target===e.currentTarget){setEditConn(null);setConnForm({});}}}>
          <div style={{background:T.card,borderRadius:20,padding:28,width:380,maxWidth:"90vw",boxShadow:"0 20px 60px rgba(0,0,0,.25)"}}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
              <div style={{width:44,height:44,borderRadius:12,background:`${editConn.color}15`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>
                {editConn.logo}
              </div>
              <div>
                <div style={{fontWeight:800,fontSize:16}}>Connect {editConn.label}</div>
                <div style={{fontSize:11,color:T.textMuted}}>{myClient?.name||myClient?.company_name||""}</div>
              </div>
            </div>
            {editConn.fields.map(f=>(
              <div key={f.key} style={{marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:700,color:T.textMuted,marginBottom:5}}>{f.label}</div>
                <input type={f.pwd?"password":"text"} value={connForm[f.key]||""}
                  onChange={e=>setConnForm(p=>({...p,[f.key]:e.target.value}))}
                  placeholder={f.ph}
                  style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:8,
                    padding:"9px 12px",color:T.text,fontSize:13,fontFamily:"inherit",boxSizing:"border-box"}}/>
              </div>
            ))}
            <div style={{display:"flex",gap:8,marginTop:20}}>
              <button onClick={()=>{setEditConn(null);setConnForm({});}}
                style={{flex:1,padding:"10px",borderRadius:10,border:`1px solid ${T.border}`,background:T.card2,color:T.textMuted,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
                Cancel
              </button>
              <button onClick={saveConnector} disabled={saving}
                style={{flex:2,padding:"10px",borderRadius:10,border:"none",background:editConn.color,
                  color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",opacity:saving?.7:1}}>
                {saving?"Saving...":"💾 Save & Connect"}
              </button>
            </div>
          </div>
        </div>}

        <div style={{marginTop:20,padding:"14px 18px",borderRadius:12,background:T.card2,border:`1px dashed ${T.border}`,fontSize:12,color:T.textMuted,textAlign:"center"}}>
          🚀 More coming soon — Google Calendar, Calendly, Stripe, Zapier
        </div>
      </div>
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

function AIProviderCards({appSettings, setAppSettings, setSettingsDirtyWithRef, T}) {
  const [showKey, setShowKey] = useState({});
  const AI_PROVIDERS = [
    {id:"anthropic", label:"Claude",  company:"Anthropic", color:"#7c3aed", keyField:"anthropic_key", placeholder:"sk-ant-api03-..."},
    {id:"openai",    label:"GPT-4o",  company:"OpenAI",    color:"#10b981", keyField:"openai_key",    placeholder:"sk-..."},
    {id:"groq",      label:"Llama 3", company:"Groq",      color:"#f59e0b", keyField:"groq_key",      placeholder:"gsk_...", free:true},
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
function AdminPanel({authHeaders, T, WA_GREEN, dark, setConfirmModal}) {
  const [view, setView] = useState("clients");
  const [clinics, setClinics] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editClinic, setEditClinic] = useState(null);
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
    {key:"can_integrations",label:"🔌 Integrations"}
  ];
  const emptyClinic = {name:"",industry:"",website:"",client_domain:"",contact_phone:"",logo_url:"",
    whatsapp_number:"",phone_number_id:"",whatsapp_token:"",ai_provider:"anthropic",ai_api_key:"",max_seats:1};
  const emptyUser = (clinic_id="") => ({username:"",password:"",clinic_id,
    can_inbox:true,can_leads:false,can_analytics:false,can_testbot:false,can_knowledge:false,can_settings:false,can_integrations:false,
    integration_whatsapp:false,integration_telegram:false,integration_instagram:false,
    integration_tiktok:false,integration_messenger:false,integration_calendar:false,integration_calendly:false});

  const [sessions, setSessions] = useState([]);
  const [showSessions, setShowSessions] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      // Load clients and users first (fast)
      const [cr,ur] = await Promise.all([
        fetch(`${API}/api/admin/clients`,{headers:authHeaders()}),
        fetch(`${API}/api/admin/users`,{headers:authHeaders()}),
      ]);
      if(cr.ok) setClinics(await cr.json());
      if(ur.ok) setUsers(await ur.json());
      setLoading(false);
      // Load sessions separately (slower, non-blocking)
      fetch(`${API}/api/admin/sessions`,{headers:authHeaders()})
        .then(r=>r.ok?r.json():[]).then(d=>setSessions(d)).catch(()=>{});
    } catch(e) {
      setLoading(false);
    }
  };

  const forceLogout = async (userId, username) => {
    if(!confirm(`Force logout @${username}?`)) return;
    const r = await fetch(`${API}/api/admin/sessions/${userId}`,{method:"DELETE",headers:authHeaders()});
    if(r.ok) { flash(`✅ @${username} has been logged out`); load(); }
  };

  useEffect(()=>{
    load();
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
    if(!editClinic.name?.trim()) return alert("Company name required");
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

    const r = await fetch(url,{method,headers:authHeaders(),body:JSON.stringify({
      ...editClinic,
      website_url: website,
      contact_email: editClinic.contact_email||""
    })});
    const d = await r.json();
    setKbBuilding(false);
    if(!r.ok) return alert(d.error||"Failed");

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
    if(isNew && (!editUser.username?.trim()||!editUser.password?.trim())) return alert("Username and password required");
    if(isNew && !editUser.clinic_id) return alert("Select a company");
    const payload = isNew
      ? {...editUser, existing_clinic_id:editUser.clinic_id, role:"client",
          permissions:{can_inbox:editUser.can_inbox,can_leads:editUser.can_leads,
            can_analytics:editUser.can_analytics,can_testbot:editUser.can_testbot,
            can_knowledge:editUser.can_knowledge,can_settings:editUser.can_settings,
            can_integrations:editUser.can_integrations,
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
            can_integrations:editUser.can_integrations,
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
      const r = await fetch(url,{method:isNew?"POST":"PATCH",headers:authHeaders(),body:JSON.stringify(payload)});
      const d = await r.json();
      if(!r.ok) { alert(d.error||"Save failed — check console"); return; }
      flash(isNew?`✅ User "@${editUser.username}" created!`:"✅ User updated!");
      setView("clients"); setEditUser(null); load();
    } catch(e) {
      alert("Error: " + e.message);
    }
  };

  const deleteUser = async uid => {
    if(!confirm("Delete this user?")) return;
    await fetch(`${API}/api/admin/users/${uid}`,{method:"DELETE",headers:authHeaders()});
    load();
  };

  // SectionCard and PermGrid defined outside AdminPanel — see below

  // ── CLINIC FORM — Step wizard ─────────────────────────────────────────────
  const [clinicStep, setClinicStep] = useState(0);
  const CLINIC_STEPS = [
    {label:"Company Info", icon:"🏢", desc:"Basic details about the client"},
  ];
  const inputStyle = {width:"100%",padding:"12px 14px",borderRadius:10,
    border:`1.5px solid ${T.border}`,background:T.card,color:T.text,
    fontSize:14,fontFamily:"inherit",outline:"none",boxSizing:"border-box"};
  const selectStyle = {...inputStyle,cursor:"pointer"};
  const labelStyle = {display:"block",fontSize:12,fontWeight:600,color:T.textMuted,marginBottom:6,letterSpacing:0.3};

  if(view==="clinic_form") return (
    <div style={{width:"100%",height:"100%",overflowY:"auto",overflowX:"hidden",paddingBottom:80}}>
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
                    if(f.size>500000){alert("Max 500KB");return;}
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

            {/* Contact Phone + Session Timeout */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div>
                <label style={labelStyle}>Contact Phone</label>
                <input value={editClinic?.contact_phone||""} onChange={e=>setEditClinic(p=>({...p,contact_phone:e.target.value}))} placeholder="+60123456789" style={inputStyle}/>
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
        <button onClick={saveClinic}
            style={{flex:2,padding:"13px",borderRadius:12,border:"none",background:`linear-gradient(135deg,${WA_GREEN},#1da851)`,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 14px rgba(37,211,102,.35)"}}>
            {editClinic?.id?"💾 Save Changes":"🚀 Onboard Client"}
          </button>
      </div>
    </div>
    </div>
  );

  // ── USER FORM ───────────────────────────────────────────────────────────────
  // ── USER FORM ───────────────────────────────────────────────────────────────
  if(view==="user_form") return (
    <div style={{width:"100%",height:"100%",overflowY:"auto",overflowX:"hidden"}}>
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
              <div style={{fontSize:12,color:"#6b7280"}}>Select which connectors this user can see and manage</div>
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
    <div style={{maxWidth:860,margin:"0 auto",padding:"0 4px"}}>
      {msg&&<div style={{background:"#dcfce7",border:"1px solid #86efac",borderRadius:10,padding:"10px 16px",marginBottom:12,fontSize:13,fontWeight:600,color:"#166534"}}>{msg}</div>}

      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:8}}>
        <div style={{fontWeight:800,fontSize:18}}>🏢 Client Management</div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>{setEditUser(emptyUser());setView("user_form");}}
            style={{padding:"8px 16px",borderRadius:10,border:`1px solid ${T.border}`,background:T.card2,color:T.text,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
            👤 New User
          </button>
          <button onClick={()=>{setEditClinic({...emptyClinic});setView("clinic_form");}}
            style={{padding:"8px 16px",borderRadius:10,border:"none",background:WA_GREEN,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
            + Onboard Client
          </button>
        </div>
      </div>

      {loading&&<div style={{padding:40,textAlign:"center",color:T.textMuted}}>Loading...</div>}

      {!loading&&clinics.filter(c=>c.active!==false).length===0&&
        <div className="cc" style={{padding:40,textAlign:"center",color:T.textMuted}}>
          <div style={{fontSize:40,marginBottom:8}}>🏢</div>
          <div style={{fontWeight:600,marginBottom:4}}>No clients yet</div>
          <div style={{fontSize:12}}>Click "+ Onboard Client" to get started</div>
        </div>}

      {clinics.filter(c=>c.active!==false).map(clinic=>{
        const clinicUsers = users.filter(u=>u.clinic_id===clinic.id);
        const hasOnline = clinicUsers.some(u=>u.active_session);
        const usedSeats = clinicUsers.filter(u=>u.active).length;
        const hotLeads = 0; // could add later
        return (
          <div key={clinic.id} style={{marginBottom:20}}>

            {/* ── CLINIC CARD (top of hierarchy) ── */}
            <div style={{
              background:`linear-gradient(135deg,${dark?"#0f1e14":"#f0fdf4"},${dark?"#0a1628":"#eff6ff"})`,
              border:`2px solid ${WA_GREEN}30`,borderRadius:20,overflow:"hidden",
              boxShadow:"0 4px 20px rgba(0,0,0,.08)"}}>

              {/* Header */}
              <div style={{padding:"18px 20px",background:dark?"rgba(0,0,0,.2)":"rgba(255,255,255,.6)",backdropFilter:"blur(8px)",borderBottom:`1px solid ${WA_GREEN}20`,display:"flex",alignItems:"center",gap:14}}>
                {/* Logo */}
                <div style={{width:56,height:56,borderRadius:14,overflow:"hidden",
                  background:`linear-gradient(135deg,${WA_GREEN}20,#3b82f620)`,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  flexShrink:0,border:`2px solid ${WA_GREEN}30`,boxShadow:"0 2px 8px rgba(0,0,0,.1)"}}>
                  {clinic.logo_url
                    ?<img src={clinic.logo_url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>
                    :<span style={{fontSize:26}}>🏢</span>}
                </div>

                {/* Info */}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3,flexWrap:"wrap"}}>
                    <div style={{fontWeight:900,fontSize:17,color:T.text}}>{clinic.name}</div>
                    {hasOnline&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:20,background:"#dcfce7",color:"#166534",fontWeight:700,border:"1px solid #86efac"}}>🟢 Online</span>}
                    {!clinic.active&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:20,background:"#fef2f2",color:"#dc2626",fontWeight:700}}>Inactive</span>}
                  </div>
                  <div style={{fontSize:12,color:T.textMuted,marginBottom:6}}>
                    {clinic.industry||"—"}{clinic.client_domain?` · ${clinic.client_domain}`:""} · {usedSeats} of {clinic.max_seats||1} seats used
                    {clinic.contact_phone&&` · ${clinic.contact_phone}`}
                  </div>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    <span style={{fontSize:10,padding:"2px 8px",borderRadius:10,background:`${WA_GREEN}15`,color:WA_GREEN,fontWeight:700,border:`1px solid ${WA_GREEN}25`}}>
                      🤖 {PROVIDERS.find(p=>p.id===clinic.ai_provider)?.label||"Anthropic"}
                    </span>
                    {clinic.ai_api_key&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:10,background:`${WA_GREEN}15`,color:WA_GREEN,fontWeight:700,border:`1px solid ${WA_GREEN}25`}}>🔑 API Key Set</span>}
                    {clinic.phone_number_id&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:10,background:"#eff6ff",color:"#3b82f6",fontWeight:700,border:"1px solid #bfdbfe"}}>📱 WhatsApp Connected</span>}
                    {clinic.website_url&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:10,background:"#faf5ff",color:"#7c3aed",fontWeight:700,border:"1px solid #e9d5ff"}}>🌐 Website Set</span>}
                  </div>
                </div>

                {/* Actions */}
                <div style={{display:"flex",flexDirection:"column",gap:6,flexShrink:0,alignItems:"flex-end"}}>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>{setEditUser(emptyUser(clinic.id));setView("user_form");}}
                      style={{padding:"7px 12px",borderRadius:10,border:`1px solid ${WA_GREEN}`,background:WA_GREEN,color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:4}}>
                      👤 Add User
                    </button>
                    <button onClick={()=>{setEditClinic({...clinic,website:clinic.website_url||clinic.contact_email||""});setView("clinic_form");}}
                      style={{padding:"7px 12px",borderRadius:10,border:`1px solid ${T.border}`,background:T.card2,color:T.text,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                      ✏️ Edit
                    </button>
                    <button onClick={async()=>{
                      const res = await fetch(`${API}/api/conversations/export?clinic_id=${clinic.id}`, {headers:authHeaders()});
                      if(res.ok){
                        const blob = await res.blob();
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `${clinic.name.replace(/\s+/g,"_")}_chats_${new Date().toISOString().slice(0,10)}.csv`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }
                    }} style={{padding:"7px 12px",borderRadius:10,border:"1px solid #7c3aed40",background:"#7c3aed10",color:"#7c3aed",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:4}}>
                      📥 Chats
                    </button>
                    <button onClick={async()=>{
                      setConfirmModal({
                        title:`Reset ${clinic.name}?`,
                        message:`This will permanently delete all contacts, chats, leads and analytics for this client.

This cannot be undone.`,
                        icon:"🗑️",danger:true,confirmText:"Yes, Reset Everything",
                        onConfirm:async()=>{
                          const r=await fetch(`${API}/api/admin/clients/${clinic.id}/reset`,{method:"DELETE",headers:authHeaders()});
                          if(r.ok){const d=await r.json();flash(`✅ Reset — ${d.deleted_contacts} contacts deleted`);load();}
                          else flash("❌ Reset failed");
                        }
                      });
                    }} style={{padding:"7px 10px",borderRadius:10,border:"1px solid #ef444440",background:"#ef444410",color:"#ef4444",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>
                      🗑️
                    </button>
                  </div>
                </div>
              </div>

              {/* ── STAFF HIERARCHY ── */}
              <div style={{padding:"14px 20px"}}>
                {/* Connector line */}
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                  <div style={{width:2,height:16,background:`${WA_GREEN}30`,borderRadius:1,marginLeft:26}}/>
                  <div style={{fontSize:11,color:T.textMuted,fontWeight:600,letterSpacing:0.5,textTransform:"uppercase"}}>
                    Staff Members ({clinicUsers.length})
                  </div>
                </div>

                {clinicUsers.length===0&&<div style={{
                  padding:"16px 20px",borderRadius:12,border:`2px dashed ${T.border}`,
                  textAlign:"center",color:T.textMuted,fontSize:12}}>
                  No staff yet — click "👤 Add User" to add team members
                </div>}

                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {clinicUsers.map((u,i)=>{
                    const session = sessions.find(s=>s.user_id===u.id);
                    const isOnline = !!session;
                    const perms = PERM_TABS.filter(p=>u[p.key]);
                    return (
                      <div key={u.id} style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                        {/* Tree connector */}
                        <div style={{display:"flex",flexDirection:"column",alignItems:"center",width:28,flexShrink:0,paddingTop:4}}>
                          <div style={{width:2,height:i===0?12:24,background:`${WA_GREEN}25`,borderRadius:1}}/>
                          <div style={{width:16,height:2,background:`${WA_GREEN}25`,borderRadius:1,marginBottom:4}}/>
                          {i<clinicUsers.length-1&&<div style={{width:2,flex:1,minHeight:8,background:`${WA_GREEN}25`,borderRadius:1}}/>}
                        </div>

                        {/* User card */}
                        <div style={{flex:1,background:T.card,borderRadius:12,padding:"10px 14px",
                          border:`1px solid ${isOnline?"#86efac":T.border}`,
                          boxShadow:isOnline?"0 0 0 2px rgba(34,197,94,.1)":"none",
                          transition:"box-shadow .2s"}}>
                          <div style={{display:"flex",alignItems:"center",gap:10}}>
                            {/* Avatar */}
                            <div style={{width:34,height:34,borderRadius:10,
                              background:isOnline?`linear-gradient(135deg,${WA_GREEN},#1da851)`:"linear-gradient(135deg,#94a3b8,#64748b)",
                              display:"flex",alignItems:"center",justifyContent:"center",
                              fontSize:14,fontWeight:700,color:"#fff",flexShrink:0,position:"relative"}}>
                              {u.username?.charAt(0)?.toUpperCase()||"?"}
                              {/* Online dot */}
                              <div style={{position:"absolute",bottom:-2,right:-2,width:10,height:10,borderRadius:"50%",
                                background:isOnline?"#22c55e":u.active?"#94a3b8":"#ef4444",
                                border:"2px solid",borderColor:T.card}}/>
                            </div>

                            <div style={{flex:1,minWidth:0}}>
                              <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                                <span style={{fontWeight:700,fontSize:13}}>@{u.username}</span>
                                {!u.active&&<span style={{fontSize:9,padding:"1px 6px",borderRadius:6,background:"#fef2f2",color:"#dc2626",fontWeight:700}}>Deactivated</span>}
                                {isOnline&&<span style={{fontSize:9,padding:"1px 6px",borderRadius:6,background:"#dcfce7",color:"#166534",fontWeight:700}}>🟢 Active Now</span>}
                              </div>
                              {/* Permissions */}
                              <div style={{display:"flex",gap:3,flexWrap:"wrap",marginTop:4}}>
                                {perms.length===0
                                  ?<span style={{fontSize:9,color:T.textFaint,fontStyle:"italic"}}>No permissions set</span>
                                  :perms.map(p=>(
                                    <span key={p.key} style={{fontSize:9,padding:"1px 6px",borderRadius:5,background:`${WA_GREEN}12`,color:WA_GREEN,fontWeight:600,border:`1px solid ${WA_GREEN}20`}}>{p.label}</span>
                                  ))}
                              </div>
                              {/* Session info */}
                              {session&&<div style={{fontSize:10,color:T.textMuted,marginTop:4,display:"flex",gap:8,flexWrap:"wrap"}}>
                                {session.device_info&&<span>📱 {(session.device_info||"").split(" | ")[0]}</span>}
                                {(session.location||session.country)&&<span>📍 {[session.location,session.country].filter(Boolean).join(", ")}</span>}
                              </div>}
                            </div>

                            {/* User actions */}
                            <div style={{display:"flex",gap:4,flexShrink:0}}>
                              {session&&<button onClick={()=>forceLogout(u.id,u.username)}
                                style={{padding:"4px 8px",borderRadius:7,border:"1px solid #ef444430",background:"#ef444410",color:"#ef4444",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}
                                title="Force logout">🔴</button>}
                              <button onClick={()=>{setEditUser({...u,newPassword:""});setView("user_form");}}
                                style={{padding:"4px 8px",borderRadius:7,border:`1px solid ${T.border}`,background:T.card2,color:T.text,fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>✏️</button>
                              <button onClick={()=>deleteUser(u.id)}
                                style={{padding:"4px 8px",borderRadius:7,border:"1px solid #ef444430",background:"#ef444410",color:"#ef4444",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>🗑️</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
