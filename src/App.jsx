import { useState, useEffect, useRef, useCallback } from "react";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from "recharts";

const API = "https://clinic-bot-oy48.onrender.com";
const CRM_VERSION = "2.9.1";
const WA_GREEN = "#25D366";
const WA_DARK  = "#128C7E";
const WA_BG    = "#ECE5DD";

const LEAD_CFG = {
  hot:  { label:"🔥 Hot",  color:"#ef4444", bg:"#fef2f2", dark:"#2d1515", border:"#fca5a5" },
  warm: { label:"🟡 Warm", color:"#f59e0b", bg:"#fffbeb", dark:"#2d2010", border:"#fcd34d" },
  cold: { label:"🔵 Cold", color:"#3b82f6", bg:"#eff6ff", dark:"#0f1e35", border:"#93c5fd" },
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
  try {
    if (dateStr && timeStr) {
      // Parse as UTC and convert to local browser time
      // timeStr format: "02:47 AM", dateStr: "2026-03-17"
      const [timePart, period] = timeStr.split(" ");
      const [hours, mins] = timePart.split(":");
      let h = parseInt(hours);
      if (period === "PM" && h !== 12) h += 12;
      if (period === "AM" && h === 12) h = 0;
      // Create UTC date
      const utcDate = new Date(`${dateStr}T${String(h).padStart(2,"0")}:${mins}:00Z`);
      if (!isNaN(utcDate)) {
        return utcDate.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit", hour12:true});
      }
    }
    return timeStr;
  } catch {
    return timeStr;
  }
};

const getColor = n => { let h=0; for(let c of (n||"?")) h=c.charCodeAt(0)+((h<<5)-h); return COLORS[Math.abs(h)%COLORS.length]; };
const ts = () => new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",hour12:true});
const today = () => new Date().toISOString().split("T")[0];
const daysAgo = n => { const d=new Date(); d.setDate(d.getDate()-n); return d.toISOString().split("T")[0]; };

const TABS = [
  {id:"crm",       icon:"💬", label:"Inbox"},
  {id:"leads",     icon:"🎯", label:"Leads"},
  {id:"analytics", icon:"📊", label:"Analytics"},
  {id:"bot",       icon:"🤖", label:"Test Bot"},
  {id:"kb",        icon:"📋", label:"Knowledge"},
  {id:"settings",  icon:"⚙️", label:"Settings"},
  {id:"admin",     icon:"👑", label:"Admin", adminOnly:true},
];

export default function App() {
  // ── AUTH ──
  const [authToken, setAuthToken] = useState(()=>sessionStorage.getItem("crm_token")||"");
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
  const [search, setSearch] = useState("");
  const [qaData, setQaData] = useState([]);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editQ, setEditQ] = useState(""); const [editA, setEditA] = useState("");
  const [newQ, setNewQ] = useState(""); const [newA, setNewA] = useState("");
  const [appSettings, setAppSettings] = useState({});
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [pendingTab, setPendingTab] = useState(null);
  const [hoveredSource, setHoveredSource] = useState(null);
  const [highlightedQA, setHighlightedQA] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [sendingFollowup, setSendingFollowup] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [adminOverview, setAdminOverview] = useState([]);
  const [selectedClinic, setSelectedClinic] = useState(null);
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
    const map = { crm:"can_inbox", leads:"can_leads", analytics:"can_analytics", bot:"can_testbot", kb:"can_knowledge", settings:"can_settings", admin:false };
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
                <div style={{marginTop:4}}>📅 <strong>Logged in at:</strong> {sessionConflict.logged_in_at ? new Date(sessionConflict.logged_in_at + (sessionConflict.logged_in_at.endsWith("Z")?"":"Z")).toLocaleString([],{dateStyle:"medium",timeStyle:"short"}) : "—"}</div>
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

  useEffect(() => { messagesEndRef.current?.scrollIntoView({behavior:"smooth"}); });
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

    // Run immediately on mount
    checkSession();
    // Then every 10 seconds
    const interval = setInterval(checkSession, 10000);

    // Check when tab/app becomes visible again (handles Safari background suspension)
    const onVisible = () => {
      if(document.visibilityState === "visible") checkSession();
    };
    document.addEventListener("visibilitychange", onVisible);

    // Check when window gets focus (switching back to this window/tab)
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
      try { bc?.close(); } catch(e) {}
    };
  }, [authToken]);

  const fetchConversations = useCallback(async () => {
    try {
      const clinicParam = inboxClinic ? `?clinic_id=${inboxClinic}` : "";
      const res = await fetch(`${API}/api/conversations${clinicParam}`, {headers:authHeaders()});
      if (!res.ok) throw new Error();
      const data = await res.json();
      setContacts(data);
      setBackendStatus("online");
      try {
        const vr = await fetch(`${API}/version`);
        if (vr.ok) { const vd = await vr.json(); setBackendVersion(vd.version||""); }
      } catch {}
      if (selected) { const u = data.find(c=>c.id===selected.id); if (u) setSelected(u); }
    } catch { setBackendStatus("offline"); }
    finally { setLoading(false); }
  }, [selected]);

  const fetchKnowledge = useCallback(async () => {
    try { const r=await fetch(`${API}/api/knowledge`, {headers:authHeaders()}); if(!r.ok)return; const d=await r.json(); setQaData(d.qa||[]); setSystemPrompt(d.systemPrompt||""); } catch {}
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const r=await fetch(`${API}/api/settings`, {headers:authHeaders()});
      if(!r.ok)return;
      const d=await r.json();
      setAppSettings(d);
      setSettingsDirty(false);
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

  async function loadClientSettings(client) {
    setSettingsClinic(client);
    setClientSettings(null);
    setSettingsDirty(false);
    try {
      const r = await fetch(`${API}/api/admin/users/${client.id}/settings`, {headers:authHeaders()});
      if(r.ok) {
        const d = await r.json();
        setClientSettings(d);
        // Load ALL client settings into appSettings so every SettingInput works
        setAppSettings(prev=>({
          ...prev,
          ai_provider:          d.ai_provider||"anthropic",
          ai_api_key:           d.ai_api_key||"",
          ai_enabled:           d.bot_enabled===false?"false":"true",
          hot_keywords:         d.lead_keywords||d.hot_keywords||"",
          warm_keywords:        d.warm_keywords||"",
          cold_keywords:        d.cold_keywords||"",
          system_prompt:        d.system_prompt||"",
          followup_enabled:     d.followup_enabled||"true",
          followup_1_delay:     d.followup_1_delay||"2",
          followup_1_delay_unit:d.followup_1_delay_unit||"hours",
          followup_1_message:   d.followup_1_message||"",
          followup_2_delay:     d.followup_2_delay||"24",
          followup_2_delay_unit:d.followup_2_delay_unit||"hours",
          followup_2_message:   d.followup_2_message||"",
          followup_max:         d.followup_max||"2",
        }));
      }
    } catch(e) {
      console.error("loadClientSettings failed:", e);
    }
  }

  async function loadKbForClient(client) {
    setKbClinic(client);
    // Fetch this client's knowledge into qaData and systemPrompt
    try {
      const r = await fetch(`${API}/api/admin/users/${client.id}/knowledge`, {headers:authHeaders()});
      if(r.ok) {
        const d = await r.json();
        setQaData(d.qa||[]);
        setSystemPrompt(d.systemPrompt||"");
      }
    } catch(e) {
      // Fallback — fetch via standard endpoint with clinic param
      try {
        const r2 = await fetch(`${API}/api/knowledge?clinic_id=${client.clinic_id}`, {headers:authHeaders()});
        if(r2.ok) { const d=await r2.json(); setQaData(d.qa||[]); setSystemPrompt(d.systemPrompt||""); }
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
    fetchConversations(); fetchKnowledge(); fetchSettings();
  }, []);

  useEffect(() => {
    fetchConversations();
    fetch(`${API}/api/ai-status`).then(r=>r.json()).then(setAiStatus).catch(()=>{});
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(fetchConversations, 10000); // 10s — easier on backend
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  useEffect(() => {
    if(tab==="analytics") {
      fetchAnalytics(dateFrom, dateTo, selectedClinic?.clinic_id||null);
      if(isAdmin) fetchAdminOverview();
    }
    if((tab==="crm"||tab==="leads"||tab==="settings"||tab==="kb") && isAdmin && adminOverview.length===0) {
      fetchAdminOverview();
    }
  }, [tab]);

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

    // Show message instantly in UI
    const tempMsg = { id: "temp_" + Date.now(), from: "agent", text, time: ts(), sources: [], date: today() };
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
    try { await fetch(`${API}/api/conversations/${id}/bot`,{method:"PATCH",headers:authHeaders(),body:JSON.stringify({botActive:!c?.botActive})}); fetchConversations(); } catch {}
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
      if(isAdmin && settingsClinic) {
        // Save ALL settings to this specific client's account
        await fetch(`${API}/api/admin/users/${settingsClinic.id}/settings`, {
          method:"PATCH", headers:authHeaders(),
          body:JSON.stringify({
            ai_provider:          appSettings.ai_provider,
            ai_api_key:           appSettings.ai_api_key||"",
            bot_enabled:          appSettings.ai_enabled!=="false",
            system_prompt:        appSettings.system_prompt||"",
            hot_keywords:         appSettings.hot_keywords||"",
            warm_keywords:        appSettings.warm_keywords||"",
            cold_keywords:        appSettings.cold_keywords||"",
            followup_enabled:     appSettings.followup_enabled||"true",
            followup_1_delay:     appSettings.followup_1_delay||"2",
            followup_1_delay_unit:appSettings.followup_1_delay_unit||"hours",
            followup_1_message:   appSettings.followup_1_message||"",
            followup_2_delay:     appSettings.followup_2_delay||"24",
            followup_2_delay_unit:appSettings.followup_2_delay_unit||"hours",
            followup_2_message:   appSettings.followup_2_message||"",
            followup_max:         appSettings.followup_max||"2",
          })
        });
      } else {
        // Client saving their own settings
        await fetch(`${API}/api/settings`,{method:"PATCH",headers:authHeaders(),body:JSON.stringify(appSettings)});
      }
      setSettingsSaved(true); setSettingsDirty(false); setTimeout(()=>setSettingsSaved(false),2500);
    } catch{alert("Failed");}
  }

  async function addQA() {
    if(!newQ.trim()||!newA.trim()) return;
    try { await fetch(`${API}/api/knowledge/qa`,{method:"POST",headers:authHeaders(),body:JSON.stringify({question:newQ.trim(),answer:newA.trim()})}); setNewQ(""); setNewA(""); fetchKnowledge(); } catch {}
  }

  async function saveEdit(id) {
    try { await fetch(`${API}/api/knowledge/qa/${id}`,{method:"PATCH",headers:authHeaders(),body:JSON.stringify({question:editQ,answer:editA})}); setEditingId(null); fetchKnowledge(); } catch {}
  }

  async function deleteQA(id) {
    if(!confirm("Delete?")) return;
    try { await fetch(`${API}/api/knowledge/qa/${id}`,{method:"DELETE",headers:authHeaders()}); fetchKnowledge(); } catch {}
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
  );

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
    const qa=qaData.find(q=>q.id===s.id); if(!qa) return null;
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
      {rows?<textarea value={appSettings[settingKey]||""} rows={rows} onChange={e=>{setAppSettings(p=>({...p,[settingKey]:e.target.value}));setSettingsDirty(true);}} style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:12,fontFamily:"inherit"}}/>
      :<input type={type} value={appSettings[settingKey]||""} onChange={e=>{setAppSettings(p=>({...p,[settingKey]:e.target.value}));setSettingsDirty(true);}} style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:12}}/>}
    </div>;
  }

  const navStyle = {height:56,background:T.nav,borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",padding:"0 12px",gap:4,flexShrink:0,boxShadow:"0 1px 3px rgba(0,0,0,.07)"};

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:T.bg,fontFamily:"'Segoe UI',system-ui,sans-serif",color:T.text,overflow:"hidden"}}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#8696a040;border-radius:4px}
        textarea:focus,input:focus,select:focus{outline:none}textarea{resize:none}
        .ci{transition:background .15s;cursor:pointer}.ci:hover{background:${T.sidebarHover}}.ci.active{background:${T.selectedBg}}
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
        @media(max-width:768px){.hide-mobile{display:none!important}.mobile-full{width:100%!important}}
      `}</style>

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
          <div style={{width:34,height:34,borderRadius:8,overflow:"hidden",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",background:currentUser?.logo_url?"transparent":`linear-gradient(135deg,${WA_GREEN},${WA_DARK})`}}>
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
            <button onClick={doLogout} style={{padding:"2px 8px",borderRadius:10,border:"none",background:"#ef444420",color:"#ef4444",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Logout</button>
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
          {TABS.map(t=>(
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
          <div style={{width:300,background:T.sidebar,borderRight:`1px solid ${T.border}`,display:"flex",flexDirection:"column",flexShrink:0}}>
            <div style={{padding:"10px 10px 8px",borderBottom:`1px solid ${T.border}`}}>
              {/* Admin client selector dropdown */}
              {isAdmin&&adminOverview.length>0&&<div style={{marginBottom:8}}>
                <select value={inboxClinic||""} onChange={e=>{setInboxClinic(e.target.value||null);}}
                  style={{width:"100%",padding:"6px 10px",borderRadius:10,border:`1px solid ${T.border}`,background:T.card2,color:T.text,fontSize:12,fontFamily:"inherit",outline:"none"}}>
                  <option value="">🌐 All Clients</option>
                  {adminOverview.map(c=>(
                    <option key={c.id} value={c.clinic_id}>{c.company_name||c.username}</option>
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
              <div style={{position:"relative",marginBottom:6}}>
                <span style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",fontSize:12,color:T.textFaint}}>🔍</span>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..."
                  style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:18,padding:"6px 10px 6px 28px",color:T.text,fontSize:12}}/>
              </div>
              <div style={{display:"flex",gap:3,marginBottom:5}}>
                {["all","open","resolved"].map(f=><button key={f} onClick={()=>setFilter(f)} style={{flex:1,padding:"4px 0",borderRadius:14,border:"none",cursor:"pointer",background:filter===f?WA_GREEN:T.input,color:filter===f?"#fff":T.textMuted,fontSize:10,fontWeight:600,textTransform:"capitalize",fontFamily:"inherit"}}>{f}</button>)}
              </div>
              <div style={{display:"flex",gap:3}}>
                {["all","hot","warm","cold"].map(f=><button key={f} onClick={()=>setLeadFilter(f)} style={{flex:1,padding:"4px 0",borderRadius:14,border:"none",cursor:"pointer",background:leadFilter===f?(f==="all"?WA_GREEN:LEAD_CFG[f]?.color||WA_GREEN):T.input,color:leadFilter===f?"#fff":T.textMuted,fontSize:10,fontWeight:600,fontFamily:"inherit"}}>{f==="all"?"All":f==="hot"?"🔥":f==="warm"?"🟡":"🔵"}</button>)}
              </div>
            </div>
            <div style={{flex:1,overflowY:"auto"}}>
              {loading&&<div style={{padding:20,textAlign:"center",color:T.textFaint,fontSize:12}}>Loading...</div>}
              {!loading&&filtered.length===0&&<div style={{padding:24,textAlign:"center",color:T.textFaint,fontSize:12}}><div style={{fontSize:32,marginBottom:8}}>💬</div>{backendStatus==="offline"?"⚠️ Backend offline":"No conversations"}</div>}
              {filtered.map(c=>(
                <div key={c.id} className={`ci ${selected?.id===c.id?"active":""}`} onClick={()=>selectContact(c)}
                  style={{padding:"9px 12px",display:"flex",alignItems:"center",gap:9,borderBottom:`1px solid ${T.border}40`,borderLeft:c.lead==="hot"?"3px solid #ef4444":c.lead==="warm"?"3px solid #f59e0b":"3px solid transparent"}}>
                  <div style={{width:42,height:42,borderRadius:"50%",background:getColor(c.name||"?"),display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:13,color:"#fff",flexShrink:0}}>{c.avatar||"?"}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}>
                      <span style={{fontWeight:600,fontSize:13,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:140}}>{c.name}</span>
                      <span style={{fontSize:10,color:T.textFaint,flexShrink:0,marginLeft:4}}>{c.lastTime}</span>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
                      <span style={{fontSize:11,color:T.textMuted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:150}}>{c.botActive&&<span style={{color:WA_GREEN,marginRight:2}}>🤖</span>}{c.lastMessage||"No messages"}</span>
                      {c.unread>0&&<span style={{background:WA_GREEN,color:"#fff",borderRadius:10,padding:"1px 5px",fontSize:10,fontWeight:700,flexShrink:0}}>{c.unread}</span>}
                    </div>
                    <LeadBadge lead={c.lead} score={c.leadScore} reason={c.leadReason} small/>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {selected?(
            <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>
              <div style={{padding:"8px 12px",background:T.nav,borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:36,height:36,borderRadius:"50%",background:getColor(selected.name||"?"),display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:13,color:"#fff",flexShrink:0}}>{selected.avatar}</div>
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{fontWeight:700,fontSize:14}}>{selected.name}</span>
                      <LeadBadge lead={selected.lead} score={selected.leadScore} reason={selected.leadReason}/>
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
              <div style={{flex:1,overflowY:"auto",padding:14,background:T.chatBg,display:"flex",flexDirection:"column",gap:6}}>
                {selected.messages?.map((msg,i)=>{
                  const isOut=msg.from!=="user";
                  return <div key={msg.id||i} className="mb" style={{display:"flex",justifyContent:isOut?"flex-end":"flex-start",alignItems:"flex-end",gap:6}}>
                    {!isOut&&<div style={{width:26,height:26,borderRadius:"50%",background:getColor(selected.name||"?"),flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:"#fff",marginBottom:2}}>{selected.avatar}</div>}
                    <div style={{maxWidth:"65%"}}>
                      <div style={{background:isOut?T.msgOut:T.msgIn,borderRadius:isOut?"16px 4px 16px 16px":"4px 16px 16px 16px",padding:"8px 12px",boxShadow:"0 1px 2px rgba(0,0,0,.1)"}}>
                        {isOut&&<div style={{fontSize:10,color:msg.from==="bot"?WA_GREEN:"#34B7F1",fontWeight:700,marginBottom:2}}>{msg.from==="bot"?"🤖 Sara":"👤 You"}</div>}
                        <div style={{fontSize:13,lineHeight:1.5,whiteSpace:"pre-wrap",color:T.text}}>{msg.text}</div>
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
          {isAdmin&&<div style={{width:220,borderRight:`1px solid ${T.border}`,overflowY:"auto",flexShrink:0,background:T.card}}>
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

          {/* Leads content */}
          <div style={{flex:1,overflowY:"auto",padding:16}}>
            {isAdmin&&leadsClinic&&<div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,padding:"10px 14px",borderRadius:12,background:T.card,border:`1px solid ${T.border}`}}>
              <div style={{width:32,height:32,borderRadius:8,overflow:"hidden",background:`${WA_GREEN}15`,display:"flex",alignItems:"center",justifyContent:"center"}}>
                {leadsClinic.logo_url?<img src={leadsClinic.logo_url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:<span style={{fontSize:16}}>🏢</span>}
              </div>
              <div style={{fontWeight:700,fontSize:14}}>{leadsClinic.company_name||leadsClinic.username}</div>
              <button onClick={()=>setLeadsClinic(null)} style={{marginLeft:"auto",padding:"5px 10px",borderRadius:8,border:`1px solid ${T.border}`,background:T.card2,color:T.text,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>← All</button>
            </div>}
            <div style={{flex:1}}>
          <div style={{marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
            <div><div style={{fontWeight:700,fontSize:17}}>🎯 Lead Pipeline</div><div style={{fontSize:11,color:T.textMuted,marginTop:2}}>Drag cards between stages</div></div>
            <div style={{display:"flex",gap:8}}>
              <div style={{background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:20,padding:"4px 12px",fontSize:11,color:"#ef4444",fontWeight:700}}>🔥 {hotCount} Hot</div>
              <div style={{background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:20,padding:"4px 12px",fontSize:11,color:"#f59e0b",fontWeight:700}}>🟡 {warmCount} Warm</div>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12}}>
            {PIPELINE.map(stage=>{
              const sc=contacts.filter(c=>(c.pipelineStage||"new")===stage.id);
              return <div key={stage.id} className={`kc ${dragOver===stage.id?"over":""}`}
                style={{background:dark?stage.dark+"40":stage.bg,border:`2px dashed ${stage.color}40`,padding:12}}
                onDragOver={e=>{e.preventDefault();setDragOver(stage.id);}} onDragLeave={()=>setDragOver(null)} onDrop={e=>onDrop(e,stage.id)}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                  <div style={{fontWeight:700,fontSize:13,color:stage.color}}>{stage.label}</div>
                  <div style={{background:stage.color,color:"#fff",borderRadius:12,padding:"1px 8px",fontSize:11,fontWeight:700}}>{sc.length}</div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {sc.map(c=>(
                    <div key={c.id} className="kcard" draggable onDragStart={e=>onDragStart(e,c.id)} onClick={()=>{setTab("crm");selectContact(c);}}
                      style={{background:T.card,borderRadius:10,padding:12,border:`1px solid ${T.border}`,borderLeft:`3px solid ${LEAD_CFG[c.lead]?.color||"#6b7280"}`}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                        <div style={{width:30,height:30,borderRadius:"50%",background:getColor(c.name||"?"),flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#fff"}}>{c.avatar||"?"}</div>
                        <div style={{flex:1,minWidth:0}}><div style={{fontWeight:600,fontSize:12,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.name}</div><div style={{fontSize:10,color:T.textFaint}}>{c.phone}</div></div>
                      </div>
                      <LeadBadge lead={c.lead} score={c.leadScore} reason={c.leadReason} small/>
                      {c.lastMessage&&<div style={{fontSize:10,color:T.textFaint,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginTop:6,fontStyle:"italic"}}>"{c.lastMessage}"</div>}
                      <div style={{display:"flex",gap:4,marginTop:8,flexWrap:"wrap"}}>
                        {(c.lead==="hot"||c.lead==="warm")&&stage.id!=="done"&&<button onClick={e=>{e.stopPropagation();sendFollowup(c.id,1);}} disabled={sendingFollowup===c.id} style={{padding:"3px 8px",borderRadius:10,border:"none",background:c.lead==="hot"?"#ef444420":"#f59e0b20",color:c.lead==="hot"?"#ef4444":"#f59e0b",fontSize:10,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>{sendingFollowup===c.id?"⏳":"📤 Follow-up"}</button>}
                        <button onClick={e=>{e.stopPropagation();setArchiveConfirm(c.id);}} style={{padding:"3px 8px",borderRadius:10,border:`1px solid ${T.border}`,background:T.card2,color:"#f59e0b",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>📦</button>
                      </div>
                    </div>
                  ))}
                  {sc.length===0&&<div style={{textAlign:"center",padding:"20px 0",color:T.textFaint,fontSize:11}}>Drop cards here</div>}
                </div>
              </div>;
            })}
          </div>
                </div>
            </div>
        </div>}

        {/* ══ ANALYTICS TAB ══ */}
        {tab==="analytics"&&<div style={{flex:1,display:"flex",background:T.bg,overflow:"hidden"}}>

          {/* Admin sidebar — client list */}
          {isAdmin&&<div style={{width:220,borderRight:`1px solid ${T.border}`,overflowY:"auto",flexShrink:0,background:T.card}}>
            <div style={{padding:"12px 14px",borderBottom:`1px solid ${T.border}`,fontWeight:700,fontSize:11,color:T.textMuted,letterSpacing:1,textTransform:"uppercase"}}>Clients</div>
            <div onClick={()=>{setSelectedClinic(null);fetchAnalytics(dateFrom,dateTo,null);fetchAdminOverview();}}
              style={{padding:"10px 14px",cursor:"pointer",background:!selectedClinic?`${WA_GREEN}15`:"transparent",borderLeft:!selectedClinic?`3px solid ${WA_GREEN}`:"3px solid transparent",display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:28,height:28,borderRadius:8,background:`${WA_GREEN}20`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>🌐</div>
              <div>
                <div style={{fontSize:12,fontWeight:700,color:!selectedClinic?WA_GREEN:T.text}}>All Clients</div>
                <div style={{fontSize:10,color:T.textMuted}}>{adminOverview.length} total</div>
              </div>
            </div>
            {overviewLoading&&<div style={{padding:16,textAlign:"center",fontSize:12,color:T.textMuted}}>Loading...</div>}
            {adminOverview.map(c=>(
              <div key={c.id} onClick={()=>{setSelectedClinic(c);fetchAnalytics(dateFrom,dateTo,c.clinic_id);}}
                style={{padding:"10px 14px",cursor:"pointer",background:selectedClinic?.id===c.id?`${WA_GREEN}15`:"transparent",borderLeft:selectedClinic?.id===c.id?`3px solid ${WA_GREEN}`:"3px solid transparent",display:"flex",alignItems:"center",gap:8}}>
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
          <div style={{flex:1,overflowY:"auto",padding:16}}>
            <div style={{maxWidth:1100,margin:"0 auto"}}>

              {/* Admin overview cards — all clients */}
              {isAdmin&&!selectedClinic&&<>
                <div style={{fontWeight:800,fontSize:16,marginBottom:12}}>📊 All Clients Performance</div>
                {overviewLoading&&<div style={{textAlign:"center",padding:40,color:T.textMuted}}>Loading...</div>}
                {!overviewLoading&&adminOverview.length===0&&<div style={{textAlign:"center",padding:40,color:T.textMuted}}>No client users yet</div>}
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:12,marginBottom:20}}>
                  {adminOverview.map(c=>(
                    <div key={c.id} className="cc" style={{padding:16,cursor:"pointer"}}
                      onClick={()=>{setSelectedClinic(c);fetchAnalytics(dateFrom,dateTo,c.clinic_id);}}>
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
                <button onClick={()=>{setSelectedClinic(null);fetchAnalytics(dateFrom,dateTo,null);}} style={{marginLeft:"auto",padding:"6px 12px",borderRadius:10,border:`1px solid ${T.border}`,background:T.card2,color:T.text,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>← All Clients</button>
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
                  {analytics.growth&&<div style={{background:`linear-gradient(135deg,${WA_GREEN}15,${WA_DARK}10)`,border:`1px solid ${WA_GREEN}30`,borderRadius:14,padding:"16px 20px",marginBottom:16,display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
                    <div style={{fontSize:28}}>📈</div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,fontSize:15,color:T.text}}>Period Summary: {analytics.dateFrom} → {analytics.dateTo}</div>
                      <div style={{fontSize:13,color:T.textMuted,marginTop:4}}>
                        <strong style={{color:WA_GREEN}}>{analytics.growth.thisperiod}</strong> people messaged the bot ·
                        <strong style={{color:"#ef4444"}}> {analytics.totals?.hot}</strong> hot leads ·
                        <strong style={{color:"#10b981"}}> {analytics.growth.conversionRate}%</strong> conversion rate
                        {analytics.growth.pct!==0&&<span style={{marginLeft:8,background:analytics.growth.pct>0?"#dcfce7":"#fef2f2",color:analytics.growth.pct>0?WA_GREEN:"#ef4444",borderRadius:10,padding:"2px 8px",fontSize:12,fontWeight:700}}>{analytics.growth.pct>0?"▲":"▼"} {Math.abs(analytics.growth.pct)}% vs prev period</span>}
                      </div>
                    </div>
                  </div>}
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
              <div style={{width:36,height:36,borderRadius:"50%",background:`linear-gradient(135deg,${WA_GREEN},${WA_DARK})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🤖</div>
              <div><div style={{fontWeight:700,fontSize:13}}>Sara — Nexora Bot</div><div style={{fontSize:11,color:T.textMuted}}>Test with live Knowledge Base</div></div>
            </div>
            <button onClick={()=>setBotConvo([{from:"bot",text:"👋 Hi! I'm Sara from Nexora 😊\nHow can I help you today?",time:ts(),sources:[]}])} style={{padding:"5px 12px",borderRadius:16,border:`1px solid ${T.border}`,background:T.card2,color:T.textMuted,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>↺ Reset</button>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:14,background:T.chatBg,display:"flex",flexDirection:"column",gap:7}}>
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
          <div style={{flex:1,overflowY:"auto",padding:16}}>

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

            {(!isAdmin||kbClinic)&&<div style={{maxWidth:800}}>
              {/* System Prompt */}
              <div className="cc" style={{marginBottom:16}}>
                <div style={{fontWeight:700,fontSize:14,marginBottom:10}}>⚙️ System Prompt (Bot personality)</div>
                <textarea value={systemPrompt} onChange={e=>setSystemPrompt(e.target.value)} rows={6}
                  style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:8,padding:"10px 12px",color:T.text,fontSize:12,fontFamily:"inherit",resize:"vertical"}}/>
                <button onClick={async()=>{await fetch(`${API}/api/knowledge/prompt`,{method:"PATCH",headers:authHeaders(),body:JSON.stringify({prompt:systemPrompt})});alert("Saved! ✅");}}
                  style={{marginTop:10,padding:"8px 20px",borderRadius:12,border:"none",background:WA_GREEN,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>💾 Save Prompt</button>
              </div>

              {/* Add new Q&A */}
              <div className="cc" style={{marginBottom:16}}>
                <div style={{fontWeight:700,fontSize:14,marginBottom:10}}>➕ Add New Q&A</div>
                <input value={newQ} onChange={e=>setNewQ(e.target.value)} placeholder="Question..."
                  style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:12,marginBottom:8}}/>
                <textarea value={newA} onChange={e=>setNewA(e.target.value)} placeholder="Answer..." rows={3}
                  style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:12,fontFamily:"inherit",resize:"vertical",marginBottom:8}}/>
                <button onClick={async()=>{
                  try{await fetch(`${API}/api/knowledge/qa`,{method:"POST",headers:authHeaders(),body:JSON.stringify({question:newQ.trim(),answer:newA.trim()})});setNewQ("");setNewA("");fetchKnowledge();}catch{}
                }} style={{padding:"8px 20px",borderRadius:12,border:"none",background:WA_GREEN,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Add Q&A</button>
              </div>

              {/* Q&A list */}
              <div style={{fontSize:12,color:T.textMuted,marginBottom:8}}>{qaData.length} Q&A pairs</div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {qaData.map((qa,i)=>(
                  <div key={qa.id} className="cc" ref={el=>qaRefs.current[qa.id]=el}
                    style={{padding:14,borderLeft:highlightedQA===qa.id?`3px solid ${WA_GREEN}`:"3px solid transparent"}}>
                    {editingId===qa.id
                      ?<div>
                        <input value={editQ} onChange={e=>setEditQ(e.target.value)}
                          style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:12,marginBottom:8}}/>
                        <textarea value={editA} onChange={e=>setEditA(e.target.value)} rows={3}
                          style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:12,fontFamily:"inherit",resize:"vertical",marginBottom:8}}/>
                        <div style={{display:"flex",gap:7}}>
                          <button onClick={()=>saveEdit(qa.id)} style={{padding:"6px 14px",borderRadius:14,border:"none",background:WA_GREEN,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Save</button>
                          <button onClick={()=>setEditingId(null)} style={{padding:"6px 14px",borderRadius:14,border:`1px solid ${T.border}`,background:T.card2,color:T.textMuted,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
                        </div>
                      </div>
                      :<div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                        <div style={{width:24,height:24,borderRadius:6,background:`${WA_GREEN}15`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:WA_GREEN,flexShrink:0}}>{i+1}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:600,fontSize:13,marginBottom:3}}>{qa.question}</div>
                          <div style={{fontSize:12,color:T.textMuted,lineHeight:1.5}}>{qa.answer}</div>
                        </div>
                        <div style={{display:"flex",gap:4,flexShrink:0}}>
                          <button onClick={()=>{setEditingId(qa.id);setEditQ(qa.question);setEditA(qa.answer);}} style={{padding:"4px 10px",borderRadius:12,border:`1px solid ${WA_GREEN}40`,background:`${WA_GREEN}10`,color:WA_GREEN,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>✏️</button>
                          <button onClick={()=>deleteQA(qa.id)} style={{padding:"4px 10px",borderRadius:12,border:"1px solid #ef444440",background:"#ef444410",color:"#ef4444",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>✕</button>
                        </div>
                      </div>}
                  </div>
                ))}
              </div>
            </div>}
          </div>
        </div>}

        {/* ══ SETTINGS ══ */}
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
          <div style={{flex:1,overflowY:"auto",padding:16}}>

            {/* Admin must pick client */}
            {isAdmin&&!settingsClinic&&<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"60%",color:T.textMuted}}>
              <div style={{fontSize:48,marginBottom:12}}>👈</div>
              <div style={{fontWeight:700,fontSize:16,marginBottom:6}}>Select a client</div>
              <div style={{fontSize:13}}>Choose from the sidebar to edit their settings</div>
            </div>}

            {(!isAdmin||settingsClinic)&&<div style={{maxWidth:720,margin:"0 auto"}}>

              {/* Client header bar */}
              {isAdmin&&settingsClinic&&<div style={{padding:"12px 16px",background:`${WA_GREEN}10`,borderRadius:12,border:`1px solid ${WA_GREEN}30`,marginBottom:16,display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:32,height:32,borderRadius:8,overflow:"hidden",background:`${WA_GREEN}15`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  {settingsClinic.logo_url?<img src={settingsClinic.logo_url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>:<span style={{fontSize:16}}>🏢</span>}
                </div>
                <div style={{fontWeight:700,fontSize:14,color:WA_GREEN}}>{settingsClinic.company_name||settingsClinic.username}</div>
                <div style={{fontSize:11,color:T.textMuted,marginLeft:4}}>Changes save to their account only</div>
              </div>}

              {/* Save button row */}
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18,flexWrap:"wrap",gap:8}}>
                <div><div style={{fontWeight:700,fontSize:17}}>⚙️ Settings</div></div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  {settingsSaved&&<div style={{background:`${WA_GREEN}15`,border:`1px solid ${WA_GREEN}30`,borderRadius:16,padding:"4px 12px",fontSize:11,color:WA_GREEN,fontWeight:600}}>✅ Saved!</div>}
                  <button onClick={saveSettings} style={{padding:"8px 20px",borderRadius:20,border:"none",background:WA_GREEN,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>💾 Save All</button>
                </div>
              </div>

              {/* API Key status */}
              {isAdmin&&settingsClinic&&<div style={{background:clientSettings?.ai_api_key?"#f0fdf4":"#fef9c3",border:`1px solid ${clientSettings?.ai_api_key?"#86efac":"#fde68a"}`,borderRadius:12,padding:"12px 16px",marginBottom:16}}>
                {clientSettings?.ai_api_key
                  ?<div style={{fontSize:13,color:"#166534",fontWeight:600}}>✅ API Key saved in DB for {settingsClinic.company_name||settingsClinic.username}</div>
                  :<div style={{fontSize:13,color:"#854d0e",fontWeight:600}}>⚠️ No API key set — add one below and save</div>}
              </div>}

              {/* AI Bot section */}
              <div className="cc" style={{marginBottom:14}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:15}}>🤖 AI Bot</div>
                    <div style={{fontSize:12,color:T.textMuted,marginTop:2}}>{appSettings.ai_enabled!=="false"?"Active — bot replies automatically":"Disabled — manual replies only"}</div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:13,fontWeight:700,color:appSettings.ai_enabled!=="false"?WA_GREEN:"#ef4444"}}>{appSettings.ai_enabled!=="false"?"ON":"OFF"}</span>
                    <div onClick={()=>{setAppSettings(p=>({...p,ai_enabled:p.ai_enabled==="false"?"true":"false"}));setSettingsDirty(true);}}
                      style={{width:48,height:26,borderRadius:13,cursor:"pointer",background:appSettings.ai_enabled!=="false"?WA_GREEN:"#ef4444",position:"relative",transition:"background .2s",flexShrink:0}}>
                      <div style={{position:"absolute",top:3,left:appSettings.ai_enabled!=="false"?23:3,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,.3)"}}/>
                    </div>
                  </div>
                </div>

                {/* AI Provider cards */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:12}}>
                  {[
                    {id:"anthropic",label:"Claude",company:"Anthropic",color:"#7c3aed"},
                    {id:"openai",label:"GPT-4o",company:"OpenAI",color:"#10b981"},
                    {id:"groq",label:"Llama 3",company:"Groq",color:"#f59e0b",free:true},
                  ].map(p=>{
                    const isSelected = appSettings.ai_provider===p.id;
                    return <div key={p.id} onClick={()=>{setAppSettings(prev=>({...prev,ai_provider:p.id}));setSettingsDirty(true);}}
                      style={{padding:"14px 10px",borderRadius:14,border:`2px solid ${isSelected?p.color:T.border}`,background:isSelected?`${p.color}12`:T.card2,cursor:"pointer",textAlign:"center",position:"relative",transition:"all .15s"}}>
                      {p.free&&<div style={{position:"absolute",top:-8,right:8,background:"#10b981",color:"#fff",fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:8}}>FREE</div>}
                      {isSelected&&<div style={{position:"absolute",top:-8,left:8,background:p.color,color:"#fff",fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:8}}>ACTIVE</div>}
                      <div style={{fontWeight:700,fontSize:14,color:isSelected?p.color:T.text}}>{p.label}</div>
                      <div style={{fontSize:11,color:T.textMuted,marginTop:2}}>{p.company}</div>
                    </div>;
                  })}
                </div>

                {/* API Key input */}
                <div style={{marginBottom:8}}>
                  <div style={{fontSize:11,fontWeight:700,color:T.textMuted,marginBottom:5,letterSpacing:0.5}}>API KEY</div>
                  <input type="password" value={appSettings.ai_api_key||""} onChange={e=>{setAppSettings(p=>({...p,ai_api_key:e.target.value}));setSettingsDirty(true);}}
                    placeholder="Paste API key here..."
                    style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:12,fontFamily:"monospace",boxSizing:"border-box"}}/>
                </div>
              </div>

              {/* Lead Keywords */}
              <div className="cc" style={{marginBottom:14}}>
                <div style={{fontWeight:700,fontSize:14,marginBottom:14}}>🎯 Lead Scoring Keywords</div>
                <SettingInput label="🔥 Hot Keywords" settingKey="hot_keywords" rows={2} hint="Comma-separated → Hot lead (booking intent)"/>
                <SettingInput label="🟡 Warm Keywords" settingKey="warm_keywords" rows={2} hint="Comma-separated → Warm lead (general interest)"/>
                <SettingInput label="🔵 Cold Keywords" settingKey="cold_keywords" rows={2} hint="Comma-separated → Cold lead"/>
              </div>

              {/* Follow-up */}
              <div className="cc" style={{marginBottom:14}}>
                {/* Header + toggle */}
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:15}}>⏰ Smart Auto Follow-up</div>
                    <div style={{fontSize:11,color:T.textMuted,marginTop:2}}>{appSettings.followup_enabled==="true"?"Active — sends automatically when customer goes silent":"Disabled — only manual follow-ups"}</div>
                  </div>
                  <div onClick={()=>{setAppSettings(p=>({...p,followup_enabled:p.followup_enabled==="true"?"false":"true"}));setSettingsDirty(true);}}
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
                  <div style={{background:T.card2,borderRadius:12,padding:14,marginBottom:12,border:`1px solid ${T.border}`}}>
                    <div style={{fontWeight:700,fontSize:13,marginBottom:10,color:WA_GREEN}}>📨 Follow-up 1</div>
                    <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10}}>
                      <div style={{fontSize:12,color:T.textMuted,whiteSpace:"nowrap"}}>Send after</div>
                      <input type="number" value={appSettings.followup_1_delay||"2"} onChange={e=>{setAppSettings(p=>({...p,followup_1_delay:e.target.value}));setSettingsDirty(true);}}
                        style={{width:70,background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:8,padding:"7px 10px",color:T.text,fontSize:13,textAlign:"center"}}/>
                      <select value={appSettings.followup_1_delay_unit||"hours"} onChange={e=>{setAppSettings(p=>({...p,followup_1_delay_unit:e.target.value}));setSettingsDirty(true);}}
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
                  <div style={{background:T.card2,borderRadius:12,padding:14,marginBottom:12,border:`1px solid ${T.border}`}}>
                    <div style={{fontWeight:700,fontSize:13,marginBottom:10,color:"#f59e0b"}}>📨 Follow-up 2</div>
                    <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10}}>
                      <div style={{fontSize:12,color:T.textMuted,whiteSpace:"nowrap"}}>Send after</div>
                      <input type="number" value={appSettings.followup_2_delay||"24"} onChange={e=>{setAppSettings(p=>({...p,followup_2_delay:e.target.value}));setSettingsDirty(true);}}
                        style={{width:70,background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:8,padding:"7px 10px",color:T.text,fontSize:13,textAlign:"center"}}/>
                      <select value={appSettings.followup_2_delay_unit||"hours"} onChange={e=>{setAppSettings(p=>({...p,followup_2_delay_unit:e.target.value}));setSettingsDirty(true);}}
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

                  {/* Max follow-ups */}
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <div style={{fontSize:12,color:T.text,fontWeight:600}}>Max follow-ups per customer</div>
                    <select value={appSettings.followup_max||"2"} onChange={e=>setAppSettings(p=>({...p,followup_max:e.target.value}))}
                      style={{background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:8,padding:"7px 10px",color:T.text,fontSize:13,fontFamily:"inherit"}}>
                      <option value="1">1 follow-up</option>
                      <option value="2">2 follow-ups</option>
                    </select>
                  </div>

                </div>
              </div>

            </div>}
          </div>
        </div>}

        {/* ══ UNSAVED SETTINGS MODAL ══ */}
        {showUnsavedModal&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:T.card,borderRadius:20,padding:28,width:"100%",maxWidth:380,boxShadow:"0 24px 60px rgba(0,0,0,.3)"}}>
            <div style={{fontSize:24,marginBottom:12,textAlign:"center"}}>⚠️</div>
            <div style={{fontWeight:800,fontSize:17,marginBottom:8,textAlign:"center"}}>Unsaved Changes</div>
            <div style={{fontSize:13,color:T.textMuted,marginBottom:24,textAlign:"center",lineHeight:1.6}}>
              You have unsaved settings changes.<br/>Do you want to save before leaving?
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>{setShowUnsavedModal(false);setSettingsDirty(false);setTab(pendingTab);setPendingTab(null);}}
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
        {tab==="admin"&&isAdmin&&<AdminPanel authHeaders={authHeaders} T={T} WA_GREEN={WA_GREEN} dark={dark}/>}

      </div>
    </div>
  );
}

// ── ADMIN PANEL COMPONENT ─────────────────────────────────────────────────────

// ── ADMIN SUB-COMPONENTS (defined outside to prevent focus loss) ─────────────
function SectionCard({title, children, T}) {
  return (
    <div className="cc" style={{marginBottom:12,padding:16}}>
      <div style={{fontWeight:700,fontSize:12,color:T.textMuted,letterSpacing:0.8,marginBottom:14}}>{title}</div>
      {children}
    </div>
  );
}

function PermGrid({data, setData, PERM_TABS, WA_GREEN, T}) {
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
function AdminPanel({authHeaders, T, WA_GREEN, dark}) {
  const [view, setView] = useState("clients");
  const [clinics, setClinics] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editClinic, setEditClinic] = useState(null);
  const [editUser, setEditUser] = useState(null);
  const [newUser, setNewUser] = useState(null);
  const [showPw, setShowPw] = useState(false);
  const [msg, setMsg] = useState("");
  const API = window.location.hostname==="localhost" ? "http://localhost:5000" : "https://clinic-bot-oy48.onrender.com";

  const INDUSTRIES = ["Healthcare & Clinic","Dental","Beauty & Salon","Spa & Wellness",
    "Fitness & Gym","Legal & Law Firm","Real Estate","Education","Restaurant & F&B","Other"];
  const PROVIDERS = [{id:"anthropic",label:"Claude (Anthropic)"},{id:"openai",label:"GPT (OpenAI)"},{id:"groq",label:"Groq"}];
  const PERM_TABS = [
    {key:"can_inbox",label:"💬 Inbox"},{key:"can_leads",label:"🎯 Leads"},
    {key:"can_analytics",label:"📊 Analytics"},{key:"can_testbot",label:"🤖 Test Bot"},
    {key:"can_knowledge",label:"📋 Knowledge"},{key:"can_settings",label:"⚙️ Settings"}
  ];
  const emptyClinic = {name:"",industry:"",website:"",contact_phone:"",logo_url:"",
    whatsapp_number:"",phone_number_id:"",whatsapp_token:"",ai_provider:"anthropic",ai_api_key:"",max_seats:1};
  const emptyUser = (clinic_id="") => ({username:"",password:"",clinic_id,
    can_inbox:true,can_leads:false,can_analytics:false,can_testbot:false,can_knowledge:false,can_settings:false});

  const [sessions, setSessions] = useState([]);
  const [showSessions, setShowSessions] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [cr,ur,sr] = await Promise.all([
        fetch(`${API}/api/admin/clinics`,{headers:authHeaders()}),
        fetch(`${API}/api/admin/users`,{headers:authHeaders()}),
        fetch(`${API}/api/admin/sessions`,{headers:authHeaders()})
      ]);
      if(cr.ok) setClinics(await cr.json());
      if(ur.ok) setUsers(await ur.json());
      if(sr.ok) setSessions(await sr.json());
    } finally { setLoading(false); }
  };

  const forceLogout = async (userId, username) => {
    if(!confirm(`Force logout @${username}?`)) return;
    const r = await fetch(`${API}/api/admin/sessions/${userId}`,{method:"DELETE",headers:authHeaders()});
    if(r.ok) { flash(`✅ @${username} has been logged out`); load(); }
  };

  useEffect(()=>{load();},[]);
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

  const saveClinic = async () => {
    if(!editClinic.name?.trim()) return alert("Company name required");
    const isNew = !editClinic.id;
    const url = isNew ? `${API}/api/admin/clinics` : `${API}/api/admin/clinics/${editClinic.id}`;
    const method = isNew ? "POST" : "PATCH";
    const r = await fetch(url,{method,headers:authHeaders(),body:JSON.stringify({
      ...editClinic,
      contact_email: editClinic.website  // reuse contact_email field for website
    })});
    const d = await r.json();
    if(!r.ok) return alert(d.error||"Failed");
    flash(isNew ? `✅ "${editClinic.name}" onboarded!` : "✅ Client updated!");
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
            can_knowledge:editUser.can_knowledge,can_settings:editUser.can_settings}}
      : {username:editUser.username, active:editUser.active,
          ...(editUser.newPassword?{password:editUser.newPassword}:{}),
          can_inbox:editUser.can_inbox,can_leads:editUser.can_leads,
          can_analytics:editUser.can_analytics,can_testbot:editUser.can_testbot,
          can_knowledge:editUser.can_knowledge,can_settings:editUser.can_settings};
    const url = isNew ? `${API}/api/admin/users` : `${API}/api/admin/users/${editUser.id}`;
    const r = await fetch(url,{method:isNew?"POST":"PATCH",headers:authHeaders(),body:JSON.stringify(payload)});
    const d = await r.json();
    if(!r.ok) return alert(d.error||"Failed");
    flash(isNew?`✅ User "@${editUser.username}" created!`:"✅ User updated!");
    setView("clients"); setEditUser(null); load();
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
    {label:"WhatsApp", icon:"📱", desc:"Connect their WhatsApp number"},
    {label:"AI Setup", icon:"🤖", desc:"Configure the AI assistant"},
  ];
  const inputStyle = {width:"100%",padding:"12px 14px",borderRadius:10,
    border:`1.5px solid ${T.border}`,background:T.card,color:T.text,
    fontSize:14,fontFamily:"inherit",outline:"none",boxSizing:"border-box"};
  const selectStyle = {...inputStyle,cursor:"pointer"};
  const labelStyle = {display:"block",fontSize:12,fontWeight:600,color:T.textMuted,marginBottom:6,letterSpacing:0.3};

  if(view==="clinic_form") return (
    <div style={{maxWidth:580,margin:"0 auto",paddingBottom:20}}>

      {/* Step progress */}
      <div style={{background:T.card,borderRadius:16,padding:"20px 24px",marginBottom:14,border:`1px solid ${T.border}`}}>
        <div style={{display:"flex",alignItems:"flex-start",position:"relative"}}>
          <div style={{position:"absolute",top:19,left:"calc(16.6% + 4px)",width:"66.6%",height:2,background:T.border,zIndex:0}}/>
          <div style={{position:"absolute",top:19,left:"calc(16.6% + 4px)",height:2,zIndex:1,
            width:`${clinicStep===0?0:clinicStep===1?"33.3%":"66.6%"}`,background:WA_GREEN,transition:"width .35s ease"}}/>
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
            <div>
              <label style={labelStyle}>Company Name *</label>
              <input autoFocus value={editClinic?.name||""} onChange={e=>setEditClinic(p=>({...p,name:e.target.value}))} placeholder="e.g. Evera Health Clinic" style={inputStyle}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div>
                <label style={labelStyle}>Industry</label>
                <select value={editClinic?.industry||""} onChange={e=>setEditClinic(p=>({...p,industry:e.target.value}))} style={selectStyle}>
                  <option value="">— Select Industry —</option>
                  {INDUSTRIES.map(i=><option key={i} value={i}>{i}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Max Login Seats</label>
                <input type="number" min="1" value={editClinic?.max_seats||1} onChange={e=>setEditClinic(p=>({...p,max_seats:e.target.value}))} style={inputStyle}/>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div>
                <label style={labelStyle}>Website</label>
                <input value={editClinic?.website||editClinic?.contact_email||""} onChange={e=>setEditClinic(p=>({...p,website:e.target.value}))} placeholder="https://company.com" style={inputStyle}/>
              </div>
              <div>
                <label style={labelStyle}>Contact Phone</label>
                <input value={editClinic?.contact_phone||""} onChange={e=>setEditClinic(p=>({...p,contact_phone:e.target.value}))} placeholder="+60123456789" style={inputStyle}/>
              </div>
            </div>
            <div>
              <label style={labelStyle}>Company Logo</label>
              <div style={{display:"flex",gap:12,alignItems:"center",padding:"14px",borderRadius:10,border:`1.5px dashed ${T.border}`,background:T.card2}}>
                {editClinic?.logo_url
                  ?<img src={editClinic.logo_url} style={{width:50,height:50,borderRadius:10,objectFit:"cover",flexShrink:0}} alt=""/>
                  :<div style={{width:50,height:50,borderRadius:10,background:T.card,border:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>🏢</div>}
                <div>
                  <label style={{display:"inline-flex",alignItems:"center",gap:6,padding:"8px 14px",borderRadius:8,border:`1px solid ${T.border}`,background:T.card,cursor:"pointer",fontSize:12,fontWeight:600,color:T.text}}>
                    📎 Upload Logo
                    <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{
                      const f=e.target.files[0]; if(!f) return;
                      if(f.size>500000){alert("Max 500KB");return;}
                      const r=new FileReader(); r.onload=ev=>setEditClinic(p=>({...p,logo_url:ev.target.result})); r.readAsDataURL(f);
                    }}/>
                  </label>
                  <div style={{fontSize:10,color:T.textFaint,marginTop:4}}>PNG, JPG · Max 500KB</div>
                  {editClinic?.logo_url&&<button onClick={()=>setEditClinic(p=>({...p,logo_url:""}))} style={{fontSize:11,color:"#ef4444",border:"none",background:"none",cursor:"pointer",padding:0,marginTop:3,display:"block"}}>✕ Remove</button>}
                </div>
              </div>
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
        <button onClick={()=>{
          if(clinicStep===0){setView("clients");setEditClinic(null);setClinicStep(0);}
          else setClinicStep(s=>s-1);
        }} style={{flex:1,padding:"13px",borderRadius:12,border:`1px solid ${T.border}`,background:"transparent",color:T.textMuted,fontSize:14,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>
          {clinicStep===0?"Cancel":"← Back"}
        </button>
        {clinicStep<2
          ?<button onClick={()=>setClinicStep(s=>s+1)}
            style={{flex:2,padding:"13px",borderRadius:12,border:"none",background:WA_GREEN,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 14px rgba(37,211,102,.25)"}}>
            Continue →
          </button>
          :<button onClick={saveClinic}
            style={{flex:2,padding:"13px",borderRadius:12,border:"none",background:`linear-gradient(135deg,${WA_GREEN},#1da851)`,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 14px rgba(37,211,102,.35)"}}>
            {editClinic?.id?"💾 Save Changes":"🚀 Onboard Client"}
          </button>}
      </div>
    </div>
  );

  // ── USER FORM ───────────────────────────────────────────────────────────────
  // ── USER FORM ───────────────────────────────────────────────────────────────
  if(view==="user_form") return (
    <div style={{maxWidth:480,margin:"0 auto"}}>
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
        <PermGrid data={editUser||{}} setData={setEditUser} PERM_TABS={PERM_TABS} WA_GREEN={WA_GREEN} T={T}/>
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

      {/* Live Sessions Panel */}
      <div className="cc" style={{marginBottom:16,padding:0,overflow:"hidden"}}>
        <div onClick={()=>setShowSessions(p=>!p)}
          style={{padding:"14px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",
            background:sessions.length>0?`${WA_GREEN}06`:T.card}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:10,height:10,borderRadius:"50%",background:sessions.length>0?"#22c55e":"#94a3b8",
              boxShadow:sessions.length>0?"0 0 0 3px rgba(34,197,94,.2)":"none"}}/>
            <span style={{fontWeight:700,fontSize:14}}>Live Sessions</span>
            <span style={{fontSize:12,padding:"2px 8px",borderRadius:6,
              background:sessions.length>0?"#dcfce7":"#f1f5f9",
              color:sessions.length>0?"#166534":"#64748b",fontWeight:700}}>
              {sessions.length} active
            </span>
          </div>
          <span style={{fontSize:12,color:T.textMuted}}>{showSessions?"▲":"▼"}</span>
        </div>

        {showSessions&&<div>
          {sessions.length===0
            ?<div style={{padding:"16px",fontSize:12,color:T.textFaint,textAlign:"center"}}>No active sessions</div>
            :sessions.map(s=>{
              const friendly = (s.device_info||"").split(" | ")[0] || "Unknown";
              const inactiveMins = Math.round(s.inactive_mins||0);
              const timeAgo = inactiveMins < 1 ? "just now" : inactiveMins < 60 ? `${inactiveMins}m ago` : `${Math.floor(inactiveMins/60)}h ago`;
              const loggedInTime = s.logged_in_at ? new Date(s.logged_in_at+"Z").toLocaleString([],{dateStyle:"short",timeStyle:"short"}) : "—";
              return (
                <div key={s.user_id} style={{padding:"12px 16px",borderTop:`1px solid ${T.border}`,
                  display:"flex",alignItems:"center",gap:12}}>
                  <div style={{width:10,height:10,borderRadius:"50%",flexShrink:0,
                    background:inactiveMins<2?"#22c55e":inactiveMins<10?"#f59e0b":"#94a3b8"}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                      <span style={{fontWeight:700,fontSize:13}}>@{s.username}</span>
                      <span style={{fontSize:11,color:T.textMuted}}>{s.company_name}</span>
                      {inactiveMins<2&&<span style={{fontSize:10,padding:"1px 6px",borderRadius:5,background:"#dcfce7",color:"#166534",fontWeight:700}}>🟢 Active</span>}
                    </div>
                    <div style={{fontSize:11,color:T.textMuted,marginTop:3,display:"flex",gap:10,flexWrap:"wrap"}}>
                      <span>📱 {friendly}</span>
                      {(s.location||s.country)&&<span>📍 {[s.location,s.country].filter(Boolean).join(", ")}</span>}
                      {s.ip_address&&<span>🌐 {s.ip_address}</span>}
                      <span>🕐 {timeAgo}</span>
                      <span>🔑 Logged in: {loggedInTime}</span>
                    </div>
                  </div>
                  <button onClick={()=>forceLogout(s.user_id, s.username)}
                    style={{padding:"6px 12px",borderRadius:8,border:"1px solid #ef444430",
                      background:"#ef444410",color:"#ef4444",fontSize:11,fontWeight:700,
                      cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",flexShrink:0}}>
                    🔴 Logout
                  </button>
                </div>
              );
            })
          }
        </div>}
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
        return (
          <div key={clinic.id} className="cc" style={{marginBottom:12,padding:0,overflow:"hidden"}}>
            {/* Company header */}
            <div style={{padding:"14px 16px",background:`${WA_GREEN}06`,borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:46,height:46,borderRadius:12,overflow:"hidden",background:`${WA_GREEN}15`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,border:`1px solid ${T.border}`}}>
                {clinic.logo_url
                  ?<img src={clinic.logo_url} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>
                  :<span style={{fontSize:22}}>🏢</span>}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:800,fontSize:15,marginBottom:2}}>{clinic.name}</div>
                <div style={{fontSize:11,color:T.textMuted}}>
                  {clinic.industry||"—"} · {usedSeats}/{clinic.max_seats||1} seats used
                  {clinic.contact_phone&&` · ${clinic.contact_phone}`}
                </div>
                <div style={{display:"flex",gap:5,marginTop:5,flexWrap:"wrap"}}>
                  <span style={{fontSize:10,padding:"1px 7px",borderRadius:6,background:`${WA_GREEN}12`,color:WA_GREEN,fontWeight:700}}>
                    🤖 {PROVIDERS.find(p=>p.id===clinic.ai_provider)?.label||clinic.ai_provider||"anthropic"}
                  </span>
                  {clinic.ai_api_key&&<span style={{fontSize:10,padding:"1px 7px",borderRadius:6,background:`${WA_GREEN}12`,color:WA_GREEN,fontWeight:700}}>🔑 Key set</span>}
                  {clinic.phone_number_id&&<span style={{fontSize:10,padding:"1px 7px",borderRadius:6,background:"#eff6ff",color:"#3b82f6",fontWeight:700}}>📱 WA connected</span>}
                  {hasOnline&&<span style={{fontSize:10,padding:"1px 7px",borderRadius:6,background:"#dcfce7",color:"#166534",fontWeight:700}}>🟢 Online</span>}
                </div>
              </div>
              <div style={{display:"flex",gap:6,flexShrink:0}}>
                <button onClick={()=>{setEditUser(emptyUser(clinic.id));setView("user_form");}}
                  style={{padding:"6px 12px",borderRadius:8,border:`1px solid ${WA_GREEN}`,background:`${WA_GREEN}10`,color:WA_GREEN,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                  + User
                </button>
                <button onClick={()=>{setEditClinic({...clinic,website:clinic.contact_email||""});setView("clinic_form");}}
                  style={{padding:"6px 12px",borderRadius:8,border:`1px solid ${T.border}`,background:T.card2,color:T.text,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                  ✏️ Edit
                </button>
              </div>
            </div>

            {/* Users */}
            {clinicUsers.length===0
              ?<div style={{padding:"12px 16px",fontSize:12,color:T.textFaint,fontStyle:"italic"}}>No users yet — click "+ User" to add</div>
              :clinicUsers.map((u,i)=>(
                <div key={u.id} style={{padding:"10px 16px",paddingLeft:24,borderBottom:i<clinicUsers.length-1?`1px solid ${T.border}`:"none",display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:8,height:8,borderRadius:"50%",flexShrink:0,
                    background:u.active_session?"#22c55e":u.active?"#94a3b8":"#ef4444"}}/>
                  <div style={{width:30,height:30,borderRadius:8,background:`${WA_GREEN}10`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,flexShrink:0}}>👤</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:3}}>
                      <span style={{fontWeight:700,fontSize:13}}>@{u.username}</span>
                      {u.active_session&&<span style={{fontSize:9,padding:"1px 6px",borderRadius:5,background:"#dcfce7",color:"#166534",fontWeight:700}}>🟢 Online</span>}
                      {!u.active&&<span style={{fontSize:9,padding:"1px 6px",borderRadius:5,background:"#fee2e2",color:"#dc2626",fontWeight:700}}>Inactive</span>}
                    </div>
                    <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                      {PERM_TABS.filter(p=>u[p.key]).map(p=>(
                        <span key={p.key} style={{fontSize:9,padding:"1px 6px",borderRadius:5,
                          background:`${WA_GREEN}12`,color:WA_GREEN,fontWeight:600,border:`1px solid ${WA_GREEN}20`}}>
                          {p.label}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:6,flexShrink:0}}>
                    <button onClick={()=>{setEditUser({...u,newPassword:""});setView("user_form");}}
                      style={{padding:"4px 10px",borderRadius:7,border:`1px solid ${T.border}`,background:T.card2,color:T.text,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>✏️</button>
                    <button onClick={()=>deleteUser(u.id)}
                      style={{padding:"4px 10px",borderRadius:7,border:"1px solid #ef444430",background:"#ef444410",color:"#ef4444",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>🗑️</button>
                  </div>
                </div>
              ))
            }
          </div>
        );
      })}
    </div>
  );
}
