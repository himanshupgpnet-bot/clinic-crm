import { useState, useEffect, useRef, useCallback } from "react";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from "recharts";

const API = "https://clinic-bot-oy48.onrender.com";
const CRM_VERSION = "2.7.0";
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

const getColor = n => { let h=0; for(let c of (n||"?")) h=c.charCodeAt(0)+((h<<5)-h); return COLORS[Math.abs(h)%COLORS.length]; };
const ts = () => new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
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
  const [hoveredSource, setHoveredSource] = useState(null);
  const [highlightedQA, setHighlightedQA] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [sendingFollowup, setSendingFollowup] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
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
  const canSee = (tab) => {
    if (!currentUser) return false;
    if (isAdmin) return true;
    if (!permissions || permissions === "all") return true;
    const map = { crm:"can_inbox", leads:"can_leads", analytics:"can_analytics", bot:"can_testbot", kb:"can_knowledge", settings:false, admin:false };
    return map[tab] ? permissions[map[tab]] : false;
  };

  const authHeaders = () => ({ "Content-Type":"application/json", "Authorization":`Bearer ${authToken}` });

  async function doLogin() {
    setLoginLoading(true); setLoginError("");
    try {
      const r = await fetch(`${API}/api/auth/login`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify(loginForm)
      });
      const d = await r.json();
      if (!r.ok) { setLoginError(d.error||"Login failed"); return; }
      setAuthToken(d.token);
      setCurrentUser(d.user);
      setPermissions(d.permissions);
      sessionStorage.setItem("crm_token", d.token);
      sessionStorage.setItem("crm_user", JSON.stringify(d.user));
      sessionStorage.setItem("crm_perms", JSON.stringify(d.permissions));
      window.location.reload();
    } catch { setLoginError("Cannot connect to server"); }
    finally { setLoginLoading(false); }
  }

  function doLogout() {
    setAuthToken(""); setCurrentUser(null); setPermissions(null);
    sessionStorage.clear();
  }

  function doLogout() {
    sessionStorage.clear();
    window.location.reload();
  }


  // ── LOGIN PAGE ──
  if (!currentUser) {
    return (
      <div style={{minHeight:"100vh",display:"flex",fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",background:"#f8faff"}}>
        <style>{`
          @keyframes bob1{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
          @keyframes bob2{0%,100%{transform:translateY(0)}50%{transform:translateY(-18px)}}
          @keyframes bob3{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
          @keyframes bob4{0%,100%{transform:translateY(0)}50%{transform:translateY(-15px)}}
          @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
          @keyframes floatCard{0%,100%{transform:translateY(0) rotate(-2deg)}50%{transform:translateY(-10px) rotate(-2deg)}}
          @keyframes floatCard2{0%,100%{transform:translateY(0) rotate(2deg)}50%{transform:translateY(-8px) rotate(2deg)}}
          @keyframes pulse{0%,100%{transform:scale(1);opacity:0.6}50%{transform:scale(1.08);opacity:1}}
          @keyframes dash{to{stroke-dashoffset:-40}}
          .ani{animation:fadeUp 0.6s ease forwards}
          .btn-wa:hover{filter:brightness(1.08);transform:translateY(-2px);transition:all 0.2s}
          .btn-ig:hover{filter:brightness(1.08);transform:translateY(-2px);transition:all 0.2s}
          .btn-tk:hover{filter:brightness(1.08);transform:translateY(-2px);transition:all 0.2s}
          .btn-fb:hover{filter:brightness(1.08);transform:translateY(-2px);transition:all 0.2s}
          .login-input:focus{border-color:#4f46e5!important;box-shadow:0 0 0 3px rgba(79,70,229,0.1)!important;outline:none}
        `}</style>

        {/* LEFT — login form */}
        <div style={{width:"45%",minWidth:380,padding:"48px 56px",display:"flex",flexDirection:"column",justifyContent:"center",background:"#fff",boxShadow:"4px 0 40px rgba(0,0,0,0.06)",position:"relative",zIndex:2}}>

          {/* Logo */}
          <div className="ani" style={{marginBottom:40,animationDelay:"0s"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:40,height:40,borderRadius:12,background:"linear-gradient(135deg,#4f46e5,#7c3aed)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>🤖</div>
              <div style={{fontWeight:900,fontSize:22,letterSpacing:-0.5}}>
                <span style={{color:"#4f46e5"}}>Nexo</span><span style={{color:"#111"}}>ra</span>
              </div>
            </div>
          </div>

          <div className="ani" style={{marginBottom:32,animationDelay:"0.1s"}}>
            <div style={{fontWeight:800,fontSize:28,color:"#111",marginBottom:6}}>Welcome back 👋</div>
            <div style={{fontSize:14,color:"#888"}}>Sign in to your omnichannel dashboard</div>
          </div>

          {/* Social login buttons */}
          <div className="ani" style={{display:"flex",flexDirection:"column",gap:12,marginBottom:24,animationDelay:"0.2s"}}>

            {/* WhatsApp */}
            <button className="btn-wa" onClick={()=>{}} style={{display:"flex",alignItems:"center",gap:14,padding:"13px 20px",borderRadius:14,border:"none",background:"#25D366",color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all 0.2s"}}>
              <div style={{width:28,height:28,borderRadius:8,background:"rgba(255,255,255,0.2)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              </div>
              Connect with WhatsApp
            </button>

            {/* Instagram */}
            <button className="btn-ig" onClick={()=>{}} style={{display:"flex",alignItems:"center",gap:14,padding:"13px 20px",borderRadius:14,border:"none",background:"linear-gradient(90deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)",color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all 0.2s"}}>
              <div style={{width:28,height:28,borderRadius:8,background:"rgba(255,255,255,0.2)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
              </div>
              Connect with Instagram
            </button>

            {/* TikTok */}
            <button className="btn-tk" onClick={()=>{}} style={{display:"flex",alignItems:"center",gap:14,padding:"13px 20px",borderRadius:14,border:"none",background:"#010101",color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all 0.2s",border:"1px solid #333"}}>
              <div style={{width:28,height:28,borderRadius:8,background:"rgba(255,255,255,0.1)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#69c9d0"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.27 8.27 0 004.84 1.56V6.78a4.85 4.85 0 01-1.07-.09z"/></svg>
              </div>
              Connect with TikTok
            </button>

            {/* Facebook */}
            <button className="btn-fb" onClick={()=>{}} style={{display:"flex",alignItems:"center",gap:14,padding:"13px 20px",borderRadius:14,border:"none",background:"#1877f2",color:"#fff",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all 0.2s"}}>
              <div style={{width:28,height:28,borderRadius:8,background:"rgba(255,255,255,0.2)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              </div>
              Connect with Facebook
            </button>
          </div>

          {/* Divider */}
          <div className="ani" style={{display:"flex",alignItems:"center",gap:12,marginBottom:24,animationDelay:"0.3s"}}>
            <div style={{flex:1,height:1,background:"#e5e7eb"}}/>
            <span style={{fontSize:13,color:"#aaa",fontWeight:500}}>or sign in with credentials</span>
            <div style={{flex:1,height:1,background:"#e5e7eb"}}/>
          </div>

          {/* Username + password */}
          <div className="ani" style={{animationDelay:"0.35s"}}>
            {loginError&&<div style={{background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:10,padding:"10px 14px",fontSize:13,color:"#dc2626",marginBottom:14}}>⚠ {loginError}</div>}
            <div style={{marginBottom:12}}>
              <div style={{fontSize:12,fontWeight:700,color:"#555",marginBottom:5,letterSpacing:0.3}}>Username</div>
              <input className="login-input" value={loginForm.username}
                onChange={e=>setLoginForm(p=>({...p,username:e.target.value}))}
                onKeyDown={e=>e.key==="Enter"&&doLogin()}
                placeholder="Enter your username"
                style={{width:"100%",padding:"12px 14px",borderRadius:12,border:"1.5px solid #e5e7eb",fontSize:14,boxSizing:"border-box",fontFamily:"inherit",transition:"all 0.2s",color:"#111"}}/>
            </div>
            <div style={{marginBottom:20}}>
              <div style={{fontSize:12,fontWeight:700,color:"#555",marginBottom:5,letterSpacing:0.3}}>Password</div>
              <div style={{position:"relative"}}>
                <input className="login-input" type={showPw?"text":"password"} value={loginForm.password}
                  onChange={e=>setLoginForm(p=>({...p,password:e.target.value}))}
                  onKeyDown={e=>e.key==="Enter"&&doLogin()}
                  placeholder="Enter your password"
                  style={{width:"100%",padding:"12px 44px 12px 14px",borderRadius:12,border:"1.5px solid #e5e7eb",fontSize:14,boxSizing:"border-box",fontFamily:"inherit",transition:"all 0.2s",color:"#111"}}/>
                <button onClick={()=>setShowPw(p=>!p)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",border:"none",background:"none",cursor:"pointer",fontSize:16,color:"#aaa",padding:0}}>{showPw?"🙈":"👁️"}</button>
              </div>
            </div>
            <button onClick={doLogin} disabled={loginLoading}
              style={{width:"100%",padding:"13px",borderRadius:14,border:"none",background:"linear-gradient(135deg,#4f46e5,#7c3aed)",color:"#fff",fontSize:15,fontWeight:800,cursor:loginLoading?"wait":"pointer",fontFamily:"inherit",boxShadow:"0 8px 24px rgba(79,70,229,0.35)",transition:"all 0.2s"}}>
              {loginLoading?"Signing in...":"Sign In →"}
            </button>
          </div>

          <div style={{marginTop:24,fontSize:11,color:"#ccc",textAlign:"center"}}>Nexora CRM · v{CRM_VERSION}</div>
        </div>

        {/* RIGHT — animated illustration */}
        <div style={{flex:1,background:"linear-gradient(135deg,#f0f4ff 0%,#faf0ff 50%,#f0fff8 100%)",display:"flex",alignItems:"center",justifyContent:"center",position:"relative",overflow:"hidden"}}>

          {/* Background blobs */}
          <div style={{position:"absolute",top:"-10%",right:"-5%",width:400,height:400,borderRadius:"50%",background:"radial-gradient(circle,rgba(79,70,229,0.08),transparent 70%)"}}/>
          <div style={{position:"absolute",bottom:"-10%",left:"-5%",width:350,height:350,borderRadius:"50%",background:"radial-gradient(circle,rgba(124,58,237,0.07),transparent 70%)"}}/>

          <div style={{position:"relative",width:"80%",maxWidth:520}}>

            {/* Main chat UI card */}
            <div style={{background:"#fff",borderRadius:24,padding:24,boxShadow:"0 20px 60px rgba(79,70,229,0.12)",animation:"floatCard 5s ease-in-out infinite"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
                <div style={{width:36,height:36,borderRadius:10,background:"linear-gradient(135deg,#4f46e5,#7c3aed)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🤖</div>
                <div>
                  <div style={{fontWeight:700,fontSize:13,color:"#111"}}>Nexora AI</div>
                  <div style={{fontSize:11,color:"#25D366",fontWeight:600}}>● Online</div>
                </div>
              </div>
              {/* Chat messages */}
              {[
                {from:"bot",text:"Hi! How can I help you today? 😊",color:"#f3f4f6",tc:"#111"},
                {from:"user",text:"I want to book an appointment",color:"#4f46e5",tc:"#fff"},
                {from:"bot",text:"Sure! What date works for you? 📅",color:"#f3f4f6",tc:"#111"},
              ].map((m,i)=>(
                <div key={i} style={{display:"flex",justifyContent:m.from==="user"?"flex-end":"flex-start",marginBottom:8}}>
                  <div style={{background:m.color,color:m.tc,padding:"9px 14px",borderRadius:m.from==="user"?"14px 14px 4px 14px":"14px 14px 14px 4px",fontSize:13,fontWeight:500,maxWidth:"75%"}}>{m.text}</div>
                </div>
              ))}
              <div style={{marginTop:12,display:"flex",gap:8}}>
                <div style={{flex:1,background:"#f9fafb",borderRadius:10,padding:"9px 14px",fontSize:12,color:"#aaa",border:"1px solid #e5e7eb"}}>Type a message...</div>
                <div style={{width:36,height:36,borderRadius:10,background:"#4f46e5",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:16,cursor:"pointer"}}>↑</div>
              </div>
            </div>

            {/* Floating WhatsApp badge */}
            <div style={{position:"absolute",top:-20,right:-20,background:"#fff",borderRadius:16,padding:"10px 14px",boxShadow:"0 8px 30px rgba(37,211,102,0.2)",display:"flex",alignItems:"center",gap:8,animation:"bob1 4s ease-in-out infinite"}}>
              <div style={{width:32,height:32,borderRadius:10,background:"#25D366",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              </div>
              <div><div style={{fontSize:11,fontWeight:700,color:"#111"}}>WhatsApp</div><div style={{fontSize:10,color:"#25D366",fontWeight:600}}>Connected ✓</div></div>
            </div>

            {/* Floating Instagram badge */}
            <div style={{position:"absolute",bottom:-16,left:-24,background:"#fff",borderRadius:16,padding:"10px 14px",boxShadow:"0 8px 30px rgba(225,48,108,0.2)",display:"flex",alignItems:"center",gap:8,animation:"bob2 5s ease-in-out infinite 0.5s"}}>
              <div style={{width:32,height:32,borderRadius:10,background:"linear-gradient(135deg,#f09433,#dc2743,#bc1888)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
              </div>
              <div><div style={{fontSize:11,fontWeight:700,color:"#111"}}>Instagram</div><div style={{fontSize:10,color:"#E1306C",fontWeight:600}}>Connected ✓</div></div>
            </div>

            {/* Floating TikTok badge */}
            <div style={{position:"absolute",top:"40%",right:-30,background:"#fff",borderRadius:16,padding:"10px 14px",boxShadow:"0 8px 30px rgba(105,201,208,0.2)",display:"flex",alignItems:"center",gap:8,animation:"bob3 6s ease-in-out infinite 1s"}}>
              <div style={{width:32,height:32,borderRadius:10,background:"#010101",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#69c9d0"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.27 8.27 0 004.84 1.56V6.78a4.85 4.85 0 01-1.07-.09z"/></svg>
              </div>
              <div><div style={{fontSize:11,fontWeight:700,color:"#111"}}>TikTok</div><div style={{fontSize:10,color:"#69c9d0",fontWeight:600}}>Connected ✓</div></div>
            </div>

            {/* Floating Facebook badge */}
            <div style={{position:"absolute",top:-10,left:"30%",background:"#fff",borderRadius:16,padding:"10px 14px",boxShadow:"0 8px 30px rgba(24,119,242,0.2)",display:"flex",alignItems:"center",gap:8,animation:"bob4 4.5s ease-in-out infinite 0.8s"}}>
              <div style={{width:32,height:32,borderRadius:10,background:"#1877f2",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              </div>
              <div><div style={{fontSize:11,fontWeight:700,color:"#111"}}>Facebook</div><div style={{fontSize:10,color:"#1877f2",fontWeight:600}}>Connected ✓</div></div>
            </div>

            {/* Stats card */}
            <div style={{position:"absolute",bottom:-50,right:20,background:"#fff",borderRadius:16,padding:"12px 16px",boxShadow:"0 8px 30px rgba(79,70,229,0.15)",animation:"floatCard2 6s ease-in-out infinite"}}>
              <div style={{fontSize:10,color:"#888",fontWeight:600,marginBottom:6,letterSpacing:0.5}}>TODAY'S MESSAGES</div>
              <div style={{display:"flex",gap:12}}>
                {[{c:"#25D366",n:"48"},{c:"#E1306C",n:"23"},{c:"#69c9d0",n:"31"},{c:"#1877f2",n:"17"}].map((s,i)=>(
                  <div key={i} style={{textAlign:"center"}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:s.c,margin:"0 auto 3px"}}/>
                    <div style={{fontSize:13,fontWeight:800,color:"#111"}}>{s.n}</div>
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

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/conversations`);
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
    try { const r=await fetch(`${API}/api/knowledge`); if(!r.ok)return; const d=await r.json(); setQaData(d.qa||[]); setSystemPrompt(d.systemPrompt||""); } catch {}
  }, []);

  const fetchSettings = useCallback(async () => {
    try { const r=await fetch(`${API}/api/settings`); if(!r.ok)return; setAppSettings(await r.json()); } catch {}
  }, []);

  const fetchAnalytics = useCallback(async (from, to) => {
    setAnalyticsLoading(true);
    try { const r=await fetch(`${API}/api/analytics?from=${from}&to=${to}`); if(r.ok) setAnalytics(await r.json()); } catch {}
    setAnalyticsLoading(false);
  }, []);

  const pollRef = useRef(null);

  useEffect(() => {
    fetchConversations(); fetchKnowledge(); fetchSettings();
    fetch(`${API}/api/ai-status`).then(r=>r.json()).then(setAiStatus).catch(()=>{});
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(fetchConversations, 10000); // 10s — easier on backend
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  useEffect(() => { if(tab==="analytics") fetchAnalytics(dateFrom, dateTo); }, [tab]);

  function setPreset(p) {
    setDatePreset(p); const t=today();
    if(p==="7d")  { setDateFrom(daysAgo(6));  setDateTo(t); }
    if(p==="30d") { setDateFrom(daysAgo(29)); setDateTo(t); }
    if(p==="90d") { setDateFrom(daysAgo(89)); setDateTo(t); }
  }

  async function selectContact(c) {
    setSelected(c); setMenuOpen(false);
    try { await fetch(`${API}/api/conversations/${c.id}/read`,{method:"PATCH"}); } catch {}
    setContacts(p=>p.map(x=>x.id===c.id?{...x,unread:0}:x));
  }

  async function archiveContact(id) {
    try {
      await fetch(`${API}/api/conversations/${id}/archive`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({archived:true})});
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
        headers: { "Content-Type": "application/json" },
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
    try { await fetch(`${API}/api/conversations/${id}/bot`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({botActive:!c?.botActive})}); fetchConversations(); } catch {}
  }

  async function toggleStatus(id) {
    const c=contacts.find(x=>x.id===id); const s=c?.status==="open"?"resolved":"open";
    try { await fetch(`${API}/api/conversations/${id}/status`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:s})}); fetchConversations(); } catch {}
  }

  async function setManualLead(id,lead) {
    try { await fetch(`${API}/api/conversations/${id}/lead`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({lead})}); fetchConversations(); } catch {}
  }

  async function setPipelineStage(id,stage) {
    try { await fetch(`${API}/api/conversations/${id}/pipeline`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({stage})}); fetchConversations(); } catch {}
  }

  async function sendFollowup(phone,followupNum) {
    setSendingFollowup(phone);
    try { const r=await fetch(`${API}/api/conversations/${phone}/followup`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({followupNum})}); if(r.ok){fetchConversations();alert("✅ Follow-up sent!");}else alert("❌ Failed"); } catch{alert("❌ Error");}
    setSendingFollowup(null);
  }

  async function saveSettings() {
    try { await fetch(`${API}/api/settings`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(appSettings)}); setSettingsSaved(true); setTimeout(()=>setSettingsSaved(false),2500); } catch{alert("Failed");}
  }

  async function addQA() {
    if(!newQ.trim()||!newA.trim()) return;
    try { await fetch(`${API}/api/knowledge/qa`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question:newQ.trim(),answer:newA.trim()})}); setNewQ(""); setNewA(""); fetchKnowledge(); } catch {}
  }

  async function saveEdit(id) {
    try { await fetch(`${API}/api/knowledge/qa/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({question:editQ,answer:editA})}); setEditingId(null); fetchKnowledge(); } catch {}
  }

  async function deleteQA(id) {
    if(!confirm("Delete?")) return;
    try { await fetch(`${API}/api/knowledge/qa/${id}`,{method:"DELETE"}); fetchKnowledge(); } catch {}
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
    (c.name?.toLowerCase().includes(search.toLowerCase())||c.phone?.includes(search))
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
      {rows?<textarea value={appSettings[settingKey]||""} rows={rows} onChange={e=>setAppSettings(p=>({...p,[settingKey]:e.target.value}))} style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:12,fontFamily:"inherit"}}/>
      :<input type={type} value={appSettings[settingKey]||""} onChange={e=>setAppSettings(p=>({...p,[settingKey]:e.target.value}))} style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:12}}/>}
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
          <div style={{width:32,height:32,borderRadius:8,background:`linear-gradient(135deg,${WA_GREEN},${WA_DARK})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>🏥</div>
          <div className="hide-mobile">
            <div style={{fontWeight:700,fontSize:13}}>Nexora CRM</div>
            <div style={{fontSize:10,color:T.textMuted}}>WhatsApp Business</div>
          </div>
        </div>

        {/* Desktop tabs */}
        <div className="hide-mobile" style={{display:"flex",gap:2}}>
          {TABS.filter(t=>!t.adminOnly||isAdmin).filter(t=>canSee(t.id)).map(t=>(
            <button key={t.id} className="tb" onClick={()=>setTab(t.id)}
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
            <button key={t.id} onClick={()=>{setTab(t.id);setMenuOpen(false);}}
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
              {selected.lead==="hot"&&selected.leadReason&&<div style={{background:"#fef2f2",borderBottom:"1px solid #fca5a5",padding:"4px 14px",fontSize:11,color:"#ef4444",display:"flex",alignItems:"center",gap:6}}>🔥 <strong>Hot Lead:</strong> {selected.leadReason}<button onClick={()=>sendFollowup(selected.id,1)} disabled={sendingFollowup===selected.id} style={{marginLeft:"auto",padding:"3px 10px",borderRadius:12,border:"none",background:"#ef4444",color:"#fff",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>{sendingFollowup===selected.id?"...":"📤 Follow-up"}</button></div>}
              <div style={{flex:1,overflowY:"auto",padding:14,background:T.chatBg,display:"flex",flexDirection:"column",gap:6}}>
                {selected.messages?.map((msg,i)=>{
                  const isOut=msg.from!=="user";
                  return <div key={msg.id||i} className="mb" style={{display:"flex",justifyContent:isOut?"flex-end":"flex-start",alignItems:"flex-end",gap:6}}>
                    {!isOut&&<div style={{width:26,height:26,borderRadius:"50%",background:getColor(selected.name||"?"),flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:"#fff",marginBottom:2}}>{selected.avatar}</div>}
                    <div style={{maxWidth:"65%"}}>
                      <div style={{background:isOut?T.msgOut:T.msgIn,borderRadius:isOut?"16px 4px 16px 16px":"4px 16px 16px 16px",padding:"8px 12px",boxShadow:"0 1px 2px rgba(0,0,0,.1)"}}>
                        {isOut&&<div style={{fontSize:10,color:msg.from==="bot"?WA_GREEN:"#34B7F1",fontWeight:700,marginBottom:2}}>{msg.from==="bot"?"🤖 Sara":"👤 You"}</div>}
                        <div style={{fontSize:13,lineHeight:1.5,whiteSpace:"pre-wrap",color:T.text}}>{msg.text}</div>
                        <div style={{fontSize:10,color:T.textFaint,textAlign:"right",marginTop:2}}>{msg.time}</div>
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
        {tab==="leads"&&<div style={{flex:1,overflowY:"auto",padding:16,background:T.bg}}>
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
                        {(c.lead==="hot"||c.lead==="warm")&&stage.id!=="done"&&<button onClick={e=>{e.stopPropagation();sendFollowup(c.id,1);}} disabled={sendingFollowup===c.id} style={{padding:"3px 8px",borderRadius:10,border:"none",background:"#ef444420",color:"#ef4444",fontSize:10,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>{sendingFollowup===c.id?"...":"📤 Follow-up"}</button>}
                        <button onClick={e=>{e.stopPropagation();setArchiveConfirm(c.id);}} style={{padding:"3px 8px",borderRadius:10,border:`1px solid ${T.border}`,background:T.card2,color:"#f59e0b",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>📦</button>
                      </div>
                    </div>
                  ))}
                  {sc.length===0&&<div style={{textAlign:"center",padding:"20px 0",color:T.textFaint,fontSize:11}}>Drop cards here</div>}
                </div>
              </div>;
            })}
          </div>
        </div>}

        {/* ══ ANALYTICS TAB ══ */}
        {tab==="analytics"&&<div style={{flex:1,overflowY:"auto",padding:16,background:T.bg}}>
          <div style={{maxWidth:1100,margin:"0 auto"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:10}}>
              <div><div style={{fontWeight:700,fontSize:17}}>📊 Analytics</div><div style={{fontSize:11,color:T.textMuted,marginTop:2}}>Client-ready overview — all data permanent in Supabase</div></div>
              <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                {[{id:"7d",label:"7D"},{id:"30d",label:"30D"},{id:"90d",label:"90D"},{id:"custom",label:"Custom"}].map(p=>(
                  <button key={p.id} onClick={()=>setPreset(p.id)} style={{padding:"5px 12px",borderRadius:16,border:`1px solid ${T.border}`,background:datePreset===p.id?WA_GREEN:T.card,color:datePreset===p.id?"#fff":T.textMuted,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{p.label}</button>
                ))}
                {datePreset==="custom"&&<>
                  <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:8,padding:"4px 8px",color:T.text,fontSize:12}}/>
                  <span style={{color:T.textMuted}}>→</span>
                  <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:8,padding:"4px 8px",color:T.text,fontSize:12}}/>
                </>}
                <button onClick={()=>fetchAnalytics(dateFrom,dateTo)} style={{padding:"5px 12px",borderRadius:16,border:"none",background:WA_GREEN,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>🔄</button>
              </div>
            </div>

            {analyticsLoading&&<div style={{textAlign:"center",padding:60,color:T.textFaint}}>Loading analytics...</div>}

            {!analyticsLoading&&analytics&&<>
              {/* Summary Banner */}
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

              {/* Stat Cards */}
              <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
                <StatCard icon="👥" label="Total Contacts" value={analytics.totals?.contacts} color={WA_GREEN} sub="All time"/>
                <StatCard icon="🔥" label="Hot Leads" value={analytics.totals?.hot} color="#ef4444" sub="Current"
                  badge={analytics.growth?.conversionRate?{value:analytics.growth.conversionRate,positive:true}:null}/>
                <StatCard icon="💬" label="Messages Received" value={analytics.totals?.userMessages} color="#3b82f6" sub="This period"/>
                <StatCard icon="🤖" label="Bot Replies" value={analytics.totals?.botMessages} color="#8b5cf6" sub="Automated"/>
                <StatCard icon="✅" label="Deals Done" value={analytics.totals?.done} color="#10b981" sub="Pipeline done"/>
              </div>

              {/* Lead Trends */}
              <div className="cc">
                <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>🔥 Lead Quality Over Time</div>
                <div style={{fontSize:11,color:T.textMuted,marginBottom:14}}>How many hot, warm and cold leads were generated each day</div>
                {analytics.leadTrends?.length>0?<ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={analytics.leadTrends} margin={{top:5,right:20,left:0,bottom:5}}>
                    <defs>
                      <linearGradient id="hot" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/><stop offset="95%" stopColor="#ef4444" stopOpacity={0}/></linearGradient>
                      <linearGradient id="warm" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/><stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.border}/>
                    <XAxis dataKey="date" tick={{fontSize:10,fill:T.textFaint}} tickFormatter={d=>d.slice(5)}/>
                    <YAxis tick={{fontSize:10,fill:T.textFaint}} allowDecimals={false}/>
                    <Tooltip contentStyle={{background:T.card,border:`1px solid ${T.border}`,borderRadius:10,fontSize:12}}/>
                    <Legend wrapperStyle={{fontSize:12}}/>
                    <Area type="monotone" dataKey="hot"  stroke="#ef4444" fill="url(#hot)"  strokeWidth={2} name="🔥 Hot"/>
                    <Area type="monotone" dataKey="warm" stroke="#f59e0b" fill="url(#warm)" strokeWidth={2} name="🟡 Warm"/>
                    <Line type="monotone" dataKey="cold" stroke="#3b82f6" strokeWidth={1.5} dot={false} name="🔵 Cold"/>
                  </AreaChart>
                </ResponsiveContainer>:<div style={{textAlign:"center",padding:40,color:T.textFaint,fontSize:12}}>No lead history yet — data builds up as customers message each day</div>}
              </div>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:0}}>
                {/* Active Users per day */}
                <div className="cc">
                  <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>👥 New Visitors / Day</div>
                  <div style={{fontSize:11,color:T.textMuted,marginBottom:14}}>Unique customers who messaged the bot</div>
                  {analytics.activePerDay?.length>0?<ResponsiveContainer width="100%" height={200}>
                    <BarChart data={analytics.activePerDay} margin={{top:5,right:10,left:0,bottom:5}}>
                      <CartesianGrid strokeDasharray="3 3" stroke={T.border}/>
                      <XAxis dataKey="date" tick={{fontSize:10,fill:T.textFaint}} tickFormatter={d=>d.slice(5)}/>
                      <YAxis tick={{fontSize:10,fill:T.textFaint}} allowDecimals={false}/>
                      <Tooltip contentStyle={{background:T.card,border:`1px solid ${T.border}`,borderRadius:10,fontSize:12}}/>
                      <Bar dataKey="count" fill={WA_GREEN} radius={[4,4,0,0]} name="Visitors"/>
                    </BarChart>
                  </ResponsiveContainer>:<div style={{textAlign:"center",padding:40,color:T.textFaint,fontSize:12}}>No data yet</div>}
                </div>

                {/* Bot vs Human replies */}
                <div className="cc">
                  <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>🤖 Bot vs Human Replies</div>
                  <div style={{fontSize:11,color:T.textMuted,marginBottom:14}}>How messages were handled each day</div>
                  {analytics.messagesPerDay?.length>0?<ResponsiveContainer width="100%" height={200}>
                    <BarChart data={analytics.messagesPerDay} margin={{top:5,right:10,left:0,bottom:5}}>
                      <CartesianGrid strokeDasharray="3 3" stroke={T.border}/>
                      <XAxis dataKey="date" tick={{fontSize:10,fill:T.textFaint}} tickFormatter={d=>d.slice(5)}/>
                      <YAxis tick={{fontSize:10,fill:T.textFaint}} allowDecimals={false}/>
                      <Tooltip contentStyle={{background:T.card,border:`1px solid ${T.border}`,borderRadius:10,fontSize:12}}/>
                      <Legend wrapperStyle={{fontSize:11}}/>
                      <Bar dataKey="bot"   stackId="a" fill="#8b5cf6" radius={[0,0,0,0]} name="🤖 Bot"/>
                      <Bar dataKey="agent" stackId="a" fill="#34B7F1" radius={[4,4,0,0]} name="👤 Agent"/>
                    </BarChart>
                  </ResponsiveContainer>:<div style={{textAlign:"center",padding:40,color:T.textFaint,fontSize:12}}>No data yet</div>}
                </div>
              </div>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                {/* Peak Hours */}
                <div className="cc">
                  <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>⏰ Peak Hours</div>
                  <div style={{fontSize:11,color:T.textMuted,marginBottom:14}}>When do most customers message?</div>
                  {analytics.peakHours?.length>0?<ResponsiveContainer width="100%" height={200}>
                    <BarChart data={analytics.peakHours.map(h=>({...h,label:HOUR_LABELS[h.hour]||`${h.hour}h`}))} margin={{top:5,right:10,left:0,bottom:5}}>
                      <CartesianGrid strokeDasharray="3 3" stroke={T.border}/>
                      <XAxis dataKey="label" tick={{fontSize:9,fill:T.textFaint}}/>
                      <YAxis tick={{fontSize:10,fill:T.textFaint}} allowDecimals={false}/>
                      <Tooltip contentStyle={{background:T.card,border:`1px solid ${T.border}`,borderRadius:10,fontSize:12}}/>
                      <Bar dataKey="count" fill="#f59e0b" radius={[4,4,0,0]} name="Messages"/>
                    </BarChart>
                  </ResponsiveContainer>:<div style={{textAlign:"center",padding:40,color:T.textFaint,fontSize:12}}>Not enough data yet</div>}
                </div>

                {/* Pipeline Pie */}
                <div className="cc">
                  <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>🎯 Pipeline Breakdown</div>
                  <div style={{fontSize:11,color:T.textMuted,marginBottom:14}}>Current lead stage distribution</div>
                  {analytics.pipelineBreakdown?.length>0?<div style={{display:"flex",alignItems:"center",gap:20,flexWrap:"wrap"}}>
                    <ResponsiveContainer width={180} height={180}>
                      <PieChart>
                        <Pie data={analytics.pipelineBreakdown} dataKey="count" nameKey="stage" cx="50%" cy="50%" outerRadius={80} innerRadius={45} paddingAngle={3} label={({percent})=>`${(percent*100).toFixed(0)}%`} labelLine={false}>
                          {analytics.pipelineBreakdown.map((e,i)=><Cell key={i} fill={PIE_COLORS[e.stage]||"#6b7280"}/>)}
                        </Pie>
                        <Tooltip contentStyle={{background:T.card,border:`1px solid ${T.border}`,borderRadius:10,fontSize:12}} formatter={(v,n)=>[v,PIE_LABELS[n]||n]}/>
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      {analytics.pipelineBreakdown.map(r=><div key={r.stage} style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{width:10,height:10,borderRadius:2,background:PIE_COLORS[r.stage]||"#6b7280"}}/>
                        <div style={{fontSize:12,fontWeight:600}}>{PIE_LABELS[r.stage]||r.stage}</div>
                        <div style={{fontSize:12,color:T.textMuted}}>{r.count}</div>
                      </div>)}
                    </div>
                  </div>:<div style={{textAlign:"center",padding:40,color:T.textFaint,fontSize:12}}>No data yet</div>}
                </div>
              </div>
            </>}

            {!analyticsLoading&&!analytics&&<div style={{textAlign:"center",padding:80,color:T.textFaint}}>
              <div style={{fontSize:40,marginBottom:12}}>📊</div>
              <div style={{fontSize:14,fontWeight:600}}>No analytics data yet</div>
              <div style={{fontSize:12,marginTop:6}}>Data appears as customers message in</div>
            </div>}
          </div>
        </div>}

        {/* ══ BOT TEST ══ */}
        {tab==="bot"&&<div style={{flex:1,display:"flex",flexDirection:"column",maxWidth:680,margin:"0 auto",width:"100%"}}>
          <div style={{padding:"10px 14px",background:T.nav,borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:36,height:36,borderRadius:"50%",background:`linear-gradient(135deg,${WA_GREEN},${WA_DARK})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🤖</div>
              <div><div style={{fontWeight:700,fontSize:13}}>Sara — Nexora Bot</div><div style={{fontSize:11,color:T.textMuted}}>Test with live Knowledge Base</div></div>
            </div>
            <button onClick={()=>setBotConvo([{from:"bot",text:"👋 Hi! I'm Sara from Nexora 😊\nHow can I help you today?",time:ts(),sources:[]}])} style={{padding:"5px 12px",borderRadius:16,border:`1px solid ${T.border}`,background:T.card2,color:T.textMuted,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>↺ Reset</button>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:14,background:T.chatBg,display:"flex",flexDirection:"column",gap:7}}>
            {botConvo.map((msg,i)=><div key={i} className="mb" style={{display:"flex",justifyContent:msg.from==="user"?"flex-end":"flex-start"}}>
              <div style={{maxWidth:"72%",background:msg.from==="user"?T.msgOut:T.msgIn,borderRadius:msg.from==="user"?"16px 4px 16px 16px":"4px 16px 16px 16px",padding:"9px 13px",boxShadow:"0 1px 2px rgba(0,0,0,.1)"}}>
                <div style={{fontSize:10,color:msg.from==="user"?"#34B7F1":WA_GREEN,fontWeight:700,marginBottom:3}}>{msg.from==="user"?"👤 You":"🤖 Sara"}</div>
                <div style={{fontSize:13,lineHeight:1.6,whiteSpace:"pre-wrap",color:T.text}}>{msg.text}</div>
                <div style={{fontSize:10,color:T.textFaint,textAlign:"right",marginTop:2}}>{msg.time}</div>
              </div>
            </div>)}
            {botLoading&&<div style={{display:"flex"}}><div style={{background:T.msgIn,borderRadius:"4px 16px 16px 16px",padding:"12px 16px",display:"flex",gap:5,alignItems:"center"}}>{[0,1,2].map(i=><div key={i} style={{width:8,height:8,borderRadius:"50%",background:WA_GREEN,animation:`bounce 1s ${i*.15}s infinite`}}/>)}</div></div>}
            <div ref={botEndRef}/>
          </div>
          <div style={{padding:"6px 10px",background:T.nav,display:"flex",gap:5,flexWrap:"wrap",borderTop:`1px solid ${T.border}`}}>
            {["I have diabetes, can you help?","How much is consultation?","I want to book Tuesday","I'm in Johor Bahru"].map(q=><button key={q} onClick={()=>setBotInput(q)} style={{background:T.card2,border:`1px solid ${T.border}`,borderRadius:14,padding:"3px 10px",color:T.textMuted,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>{q}</button>)}
          </div>
          <div style={{padding:"8px 10px",background:T.nav,display:"flex",gap:6,alignItems:"flex-end"}}>
            <textarea value={botInput} onChange={e=>setBotInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendBotMessage();}}} placeholder="Type a test message..." rows={1}
              style={{flex:1,background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:20,padding:"8px 14px",color:T.text,fontSize:13}}/>
            <button className="sb" onClick={sendBotMessage} disabled={botLoading||!botInput.trim()} style={{width:38,height:38,borderRadius:"50%",border:"none",flexShrink:0,background:botLoading||!botInput.trim()?T.card2:WA_GREEN,color:botLoading||!botInput.trim()?T.textFaint:"#fff",fontSize:15,cursor:"pointer"}}>➤</button>
          </div>
        </div>}

        {/* ══ KNOWLEDGE BASE ══ */}
        {tab==="kb"&&<div style={{flex:1,overflowY:"auto",padding:16,background:T.bg}}>
          <div style={{maxWidth:780,margin:"0 auto"}}>
            <div style={{marginBottom:16}}><div style={{fontWeight:700,fontSize:17}}>📋 Knowledge Base</div><div style={{fontSize:11,color:T.textMuted,marginTop:2}}>{qaData.length} Q&A pairs · Sara uses these as background context</div></div>
            <div className="cc">
              <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>⚙️ System Prompt (Sara's personality)</div>
              <textarea value={systemPrompt} onChange={e=>setSystemPrompt(e.target.value)} rows={8}
                style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:8,padding:"9px 12px",color:T.text,fontSize:11,fontFamily:"'Courier New',monospace",lineHeight:1.7,marginBottom:10}}/>
              <button onClick={async()=>{await fetch(`${API}/api/knowledge/prompt`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt:systemPrompt})});alert("Saved! ✅");}}
                style={{padding:"7px 16px",borderRadius:16,border:"none",background:WA_GREEN,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>💾 Save Prompt</button>
            </div>
            <div className="cc">
              <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>➕ Add New Q&A</div>
              <input value={newQ} onChange={e=>setNewQ(e.target.value)} placeholder="Question..." style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:13,marginBottom:7}}/>
              <textarea value={newA} onChange={e=>setNewA(e.target.value)} placeholder="Answer..." rows={2} style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:13,marginBottom:10}}/>
              <button onClick={addQA} style={{padding:"7px 16px",borderRadius:16,border:"none",background:WA_GREEN,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>➕ Add Q&A</button>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {qaData.map((qa,i)=>(
                <div key={qa.id} ref={el=>qaRefs.current[qa.id]=el} className={`qa-row ${highlightedQA===qa.id?"hl":""}`}
                  style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:14,transition:"all .3s"}}>
                  {editingId===qa.id?<div>
                    <input value={editQ} onChange={e=>setEditQ(e.target.value)} style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:13,marginBottom:7}}/>
                    <textarea value={editA} onChange={e=>setEditA(e.target.value)} rows={3} style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:13,marginBottom:9}}/>
                    <div style={{display:"flex",gap:7}}>
                      <button onClick={()=>saveEdit(qa.id)} style={{padding:"6px 14px",borderRadius:14,border:"none",background:WA_GREEN,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Save</button>
                      <button onClick={()=>setEditingId(null)} style={{padding:"6px 14px",borderRadius:14,border:`1px solid ${T.border}`,background:T.card2,color:T.textMuted,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
                    </div>
                  </div>:<div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                    <div style={{width:24,height:24,borderRadius:6,background:`${WA_GREEN}15`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:WA_GREEN,flexShrink:0}}>{i+1}</div>
                    <div style={{flex:1,minWidth:0}}><div style={{fontWeight:600,fontSize:13,marginBottom:3}}>{qa.question}</div><div style={{fontSize:12,color:T.textMuted,lineHeight:1.5}}>{qa.answer}</div></div>
                    <div style={{display:"flex",gap:4,flexShrink:0}}>
                      <button onClick={()=>{setEditingId(qa.id);setEditQ(qa.question);setEditA(qa.answer);}} style={{padding:"4px 10px",borderRadius:12,border:`1px solid ${WA_GREEN}40`,background:`${WA_GREEN}10`,color:WA_GREEN,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>✏️</button>
                      <button onClick={()=>deleteQA(qa.id)} style={{padding:"4px 10px",borderRadius:12,border:"1px solid #ef444440",background:"#ef444410",color:"#ef4444",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>✕</button>
                    </div>
                  </div>}
                </div>
              ))}
            </div>
          </div>
        </div>}

        {/* ══ SETTINGS ══ */}
        {tab==="settings"&&<div style={{flex:1,overflowY:"auto",padding:16,background:T.bg}}>
          <div style={{maxWidth:720,margin:"0 auto"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18,flexWrap:"wrap",gap:8}}>
              <div><div style={{fontWeight:700,fontSize:17}}>⚙️ Settings</div><div style={{fontSize:11,color:T.textMuted,marginTop:2}}>Saved to settings.xlsx</div></div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                {settingsSaved&&<div style={{background:`${WA_GREEN}15`,border:`1px solid ${WA_GREEN}30`,borderRadius:16,padding:"4px 12px",fontSize:11,color:WA_GREEN,fontWeight:600}}>✅ Saved!</div>}
                <button onClick={saveSettings} style={{padding:"8px 18px",borderRadius:18,border:"none",background:WA_GREEN,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>💾 Save All</button>
              </div>
            </div>
            {/* AI Provider Selector */}
            {(()=>{
              const provider = appSettings.ai_provider || "anthropic";
              const aiOn = appSettings.ai_enabled !== "false";
              const providers = [
                { id:"anthropic", label:"Claude",  icon:"🟣", company:"Anthropic", model:"claude-sonnet-4", envKey:"ANTHROPIC_API_KEY" },
                { id:"openai",    label:"GPT-4o",  icon:"🟢", company:"OpenAI",    model:"gpt-4o-mini",     envKey:"OPENAI_API_KEY"    },
                { id:"groq",      label:"Llama 3", icon:"🟡", company:"Groq",      model:"llama-3.3-70b",   envKey:"GROQ_API_KEY", free:true },
              ];
              const active = providers.find(p=>p.id===provider);
              const missingKeys = providers.filter(p=>aiStatus[p.id]===false);
              const availableKeys = providers.filter(p=>aiStatus[p.id]===true);
              return <>
                {/* Missing key warning */}
                {missingKeys.length>0&&aiOn&&<div style={{background:"#fff3cd",border:"1px solid #ffc107",borderRadius:12,padding:"14px 16px",marginBottom:12}}>
                  <div style={{fontWeight:700,fontSize:13,color:"#856404",marginBottom:8}}>⚠️ Missing API Keys in Render</div>
                  {missingKeys.map(p=><div key={p.id} style={{fontSize:12,color:"#856404",marginBottom:4,display:"flex",alignItems:"center",gap:6}}>
                    {p.icon} <b>{p.label} ({p.company})</b> — <code style={{background:"#ffeeba",padding:"1px 5px",borderRadius:4}}>{p.envKey}</code> not set in Render
                  </div>)}
                  {availableKeys.length>0&&<div style={{marginTop:8,fontSize:12,color:"#155724",fontWeight:600}}>
                    ✅ Available: {availableKeys.map(p=>`${p.icon} ${p.label}`).join(" · ")}
                  </div>}
                </div>}

                <div className="cc" style={{border:`2px solid ${aiOn?WA_GREEN:"#ef4444"}30`,background:aiOn?`${WA_GREEN}08`:"#ef444408"}}>
                  {/* ON/OFF toggle */}
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:aiOn?16:0}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:15}}>🤖 Sara AI Bot</div>
                      <div style={{fontSize:12,color:T.textMuted,marginTop:2}}>
                        {aiOn ? `Active — using ${active?.label} (${active?.company})` : "Disabled — no AI calls, zero cost"}
                      </div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <span style={{fontSize:13,fontWeight:700,color:aiOn?WA_GREEN:"#ef4444"}}>{aiOn?"ON":"OFF"}</span>
                      <div onClick={()=>setAppSettings(p=>({...p,ai_enabled:p.ai_enabled==="false"?"true":"false"}))}
                        style={{width:48,height:26,borderRadius:13,cursor:"pointer",background:aiOn?WA_GREEN:"#ef4444",position:"relative",transition:"background .2s",flexShrink:0}}>
                        <div style={{position:"absolute",top:3,left:aiOn?23:3,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,.3)"}}/>
                      </div>
                    </div>
                  </div>

                  {/* Provider cards */}
                  {aiOn&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                    {providers.map(p=>{
                      const hasKey = aiStatus[p.id];
                      const isSelected = provider===p.id;
                      return <div key={p.id}
                        onClick={()=>setAppSettings(prev=>({...prev,ai_provider:p.id}))}
                        style={{
                          borderRadius:10, padding:"12px 10px", textAlign:"center",
                          cursor:"pointer",
                          border:`2px solid ${isSelected?WA_GREEN:hasKey?T.border:"#f59e0b40"}`,
                          background:isSelected?`${WA_GREEN}15`:T.card,
                          transition:"all .15s", position:"relative",
                          boxShadow:isSelected?"0 0 0 3px "+WA_GREEN+"30":""
                        }}>
                        {p.free&&<div style={{position:"absolute",top:-8,right:8,background:"#10b981",color:"#fff",fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:8}}>FREE</div>}
                        {isSelected&&<div style={{position:"absolute",top:-8,left:8,background:WA_GREEN,color:"#fff",fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:8}}>ACTIVE</div>}
                        <div style={{fontSize:22,marginBottom:4}}>{p.icon}</div>
                        <div style={{fontWeight:700,fontSize:13,color:isSelected?WA_GREEN:T.text}}>{p.label}</div>
                        <div style={{fontSize:10,color:T.textMuted,marginTop:2}}>{p.company}</div>
                        <div style={{fontSize:10,color:T.textMuted}}>{p.model}</div>
                        <div style={{marginTop:6,fontSize:10,fontWeight:600,color:hasKey===undefined?"#6b7280":hasKey?"#10b981":"#f59e0b"}}>
                          {hasKey===undefined?"⏳ checking...":hasKey?"✅ Key set":"⚠️ Add key to Render"}
                        </div>
                      </div>;
                    })}
                  </div>}
                  {/* Warning if selected provider has no key */}
                  {aiOn&&aiStatus[provider]===false&&<div style={{marginTop:10,padding:"8px 12px",borderRadius:8,background:"#fff3cd",border:"1px solid #ffc10740",fontSize:12,color:"#856404"}}>
                    ⚠️ <b>{providers.find(p=>p.id===provider)?.label}</b> is selected but <code>{providers.find(p=>p.id===provider)?.envKey}</code> is not set in Render. Bot will fail until you add the key.
                  </div>}

                  {!aiOn&&<div style={{marginTop:10,padding:"8px 12px",borderRadius:8,background:"#ef444415",fontSize:12,color:"#ef4444",fontWeight:500}}>
                    ⚠️ Bot is OFF globally — Sara will not reply to any customer. Manual agent replies still work.
                  </div>}
                </div>
              </>;
            })()}

            <div className="cc">
              <div style={{fontWeight:700,fontSize:14,marginBottom:14}}>🎯 Lead Scoring Keywords</div>
              <SettingInput label="🔥 Hot Keywords" settingKey="hot_keywords" rows={2} hint="Comma-separated → Hot lead (booking intent)"/>
              <SettingInput label="🟡 Warm Keywords" settingKey="warm_keywords" rows={2} hint="Comma-separated → Warm lead (general interest)"/>
              <SettingInput label="🔵 Cold Keywords" settingKey="cold_keywords" rows={2} hint="Comma-separated → Cold lead"/>
              <div style={{background:dark?"#1a2235":"#f8fafc",borderRadius:10,padding:10,fontSize:11,color:T.textMuted}}>ℹ️ Keywords only — no AI cost for scoring. Lead stays hot/warm even if next message has no keywords.</div>
            </div>
            <div className="cc">
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                <div style={{fontWeight:700,fontSize:14}}>⏰ Auto Follow-up</div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:12,color:T.textMuted}}>Enabled</span>
                  <div onClick={()=>setAppSettings(p=>({...p,followup_enabled:p.followup_enabled==="true"?"false":"true"}))}
                    style={{width:42,height:24,borderRadius:12,cursor:"pointer",background:appSettings.followup_enabled==="true"?WA_GREEN:T.card2,border:`1px solid ${T.border}`,position:"relative",transition:"background .2s"}}>
                    <div style={{position:"absolute",top:2,left:appSettings.followup_enabled==="true"?20:2,width:18,height:18,borderRadius:"50%",background:"#fff",transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,.2)"}}/>
                  </div>
                </div>
              </div>
              <div style={{opacity:appSettings.followup_enabled==="true"?1:.4,pointerEvents:appSettings.followup_enabled==="true"?"auto":"none"}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <SettingInput label="Follow-up 1 Delay (hours)" settingKey="followup_1_delay" type="number"/>
                  <SettingInput label="Follow-up 2 Delay (hours)" settingKey="followup_2_delay" type="number"/>
                </div>
                <SettingInput label="Follow-up 1 Message" settingKey="followup_1_message" rows={2} hint="Use {name} for customer name"/>
                <SettingInput label="Follow-up 2 Message" settingKey="followup_2_message" rows={2} hint="Use {name} for customer name"/>
                <SettingInput label="Max follow-ups per customer" settingKey="followup_max" type="number"/>
              </div>
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
function AdminPanel({authHeaders, T, WA_GREEN, dark}) {
  const [users, setUsers] = useState([]);
  const [clinics, setClinics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewUser, setShowNewUser] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [newUser, setNewUser] = useState({username:"",password:"",company_name:"",industry:"",role:"client",clinic_id:1,ai_provider:"anthropic",ai_api_key:""});
  const [editUser, setEditUser] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [showNewPw, setShowNewPw] = useState(false);
  const [showEditPw, setShowEditPw] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showEditApiKey, setShowEditApiKey] = useState(false);
  const [showCurrPw, setShowCurrPw] = useState(false);
  const [showNewCPw, setShowNewCPw] = useState(false);
  const [showConfPw, setShowConfPw] = useState(false);
  const [pwForm, setPwForm] = useState({current_password:"",new_password:"",confirm:""});
  const [pwMsg, setPwMsg] = useState("");

  const PROVIDERS = [
    {id:"anthropic", label:"Claude (Anthropic)", color:"#7c3aed"},
    {id:"openai",    label:"GPT-4o (OpenAI)",   color:"#10b981"},
    {id:"groq",      label:"Llama 3 (Groq)",    color:"#f59e0b"},
  ];
  const PERM_TABS = [
    {key:"can_inbox",     label:"💬 Inbox"},
    {key:"can_leads",     label:"🎯 Leads"},
    {key:"can_analytics", label:"📊 Analytics"},
    {key:"can_testbot",   label:"🤖 Test Bot"},
    {key:"can_knowledge", label:"📋 Knowledge"},
  ];

  async function load() {
    setLoading(true);
    try {
      const [ur, cr] = await Promise.all([
        fetch(`${API}/api/admin/users`, {headers:authHeaders()}),
        fetch(`${API}/api/admin/clinics`, {headers:authHeaders()}),
      ]);
      setUsers(await ur.json());
      setClinics(await cr.json());
    } catch {}
    setLoading(false);
  }
  useEffect(()=>{ load(); },[]);

  function showMsg(m) { setMsg(m); setTimeout(()=>setMsg(""),3500); }

  async function createUser() {
    if(!newUser.username||!newUser.password) return showMsg("❌ Username and password required");
    if(newUser.password.length<6) return showMsg("❌ Password must be at least 6 characters");
    setSaving(true);
    try {
      const r = await fetch(`${API}/api/admin/users`, {method:"POST",headers:authHeaders(),body:JSON.stringify(newUser)});
      const d = await r.json();
      if(r.ok){ showMsg("✅ User created!"); setShowNewUser(false); setNewUser({username:"",password:"",company_name:"",industry:"",role:"client",clinic_id:1,ai_provider:"anthropic",ai_api_key:""}); load(); }
      else showMsg("❌ "+d.error);
    } catch { showMsg("❌ Network error"); }
    setSaving(false);
  }

  async function saveUser() {
    setSaving(true);
    try {
      const payload = {
        active:       editUser.active,
        company_name: editUser.company_name,
        industry:     editUser.industry||"",
        ai_provider:  editUser.ai_provider,
        ai_api_key:   editUser.ai_api_key||"",
        permissions: {
          can_inbox:     editUser.can_inbox,
          can_leads:     editUser.can_leads,
          can_analytics: editUser.can_analytics,
          can_testbot:   editUser.can_testbot,
          can_knowledge: editUser.can_knowledge,
          ai_provider:   editUser.ai_provider,
        }
      };
      if(editUser.newPassword) {
        if(editUser.newPassword.length<6) { showMsg("❌ Password must be at least 6 characters"); setSaving(false); return; }
        payload.password = editUser.newPassword;
      }
      const r = await fetch(`${API}/api/admin/users/${editUser.id}`, {method:"PATCH",headers:authHeaders(),body:JSON.stringify(payload)});
      if(r.ok){ showMsg("✅ User updated!"); setEditUser(null); load(); }
      else { const d=await r.json(); showMsg("❌ "+d.error); }
    } catch { showMsg("❌ Network error"); }
    setSaving(false);
  }

  async function deleteUser(id) {
    if(!confirm("Delete this user? This cannot be undone.")) return;
    await fetch(`${API}/api/admin/users/${id}`, {method:"DELETE",headers:authHeaders()});
    showMsg("✅ User deleted"); load();
  }

  async function changePassword() {
    if(!pwForm.current_password||!pwForm.new_password) return setPwMsg("❌ All fields required");
    if(pwForm.new_password!==pwForm.confirm) return setPwMsg("❌ Passwords do not match");
    if(pwForm.new_password.length<6) return setPwMsg("❌ Min 6 characters");
    setSaving(true);
    try {
      const r = await fetch(`${API}/api/admin/change-password`, {method:"POST",headers:authHeaders(),body:JSON.stringify(pwForm)});
      const d = await r.json();
      if(r.ok){ setPwMsg("✅ Password changed!"); setTimeout(()=>{ setShowChangePassword(false); setPwForm({current_password:"",new_password:"",confirm:""}); setPwMsg(""); },1500); }
      else setPwMsg("❌ "+d.error);
    } catch { setPwMsg("❌ Network error"); }
    setSaving(false);
  }

  const inp = (val, onChange, placeholder, type="text", extra={}) => (
    <input type={type} value={val||""} onChange={onChange} placeholder={placeholder}
      style={{width:"100%",padding:"10px 12px",borderRadius:10,border:`1px solid ${T.border}`,background:T.card2,color:T.text,fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit",...extra}}/>
  );

  const providerColor = (id) => PROVIDERS.find(p=>p.id===id)?.color||WA_GREEN;

  if(loading) return <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:T.textMuted,fontSize:14}}>Loading...</div>;

  return (
    <div style={{flex:1,overflowY:"auto",padding:16,background:T.bg}}>
      <div style={{maxWidth:860,margin:"0 auto"}}>

        {msg&&<div style={{background:msg.startsWith("✅")?"#f0fdf4":"#fef2f2",border:`1px solid ${msg.startsWith("✅")?"#86efac":"#fca5a5"}`,borderRadius:10,padding:"10px 14px",marginBottom:12,fontSize:13,color:msg.startsWith("✅")?"#166534":"#dc2626"}}>{msg}</div>}

        {/* Header */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
          <div>
            <div style={{fontWeight:800,fontSize:20}}>👑 User Management</div>
            <div style={{fontSize:12,color:T.textMuted,marginTop:2}}>Create and manage client accounts, permissions and API keys</div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setShowChangePassword(true)} style={{padding:"9px 16px",borderRadius:12,border:`1px solid ${T.border}`,background:T.card2,color:T.text,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>🔑 My Password</button>
            <button onClick={()=>setShowNewUser(true)} style={{padding:"9px 16px",borderRadius:12,border:"none",background:WA_GREEN,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>＋ New User</button>
          </div>
        </div>

        {/* Stats */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:20}}>
          {[{icon:"👥",label:"Total Users",value:users.length},{icon:"✅",label:"Active",value:users.filter(u=>u.active).length},{icon:"🏥",label:"Clinics",value:clinics.length}].map(s=>(
            <div key={s.label} className="cc" style={{textAlign:"center",padding:"14px 10px"}}>
              <div style={{fontSize:22,marginBottom:4}}>{s.icon}</div>
              <div style={{fontWeight:800,fontSize:22,color:WA_GREEN}}>{s.value}</div>
              <div style={{fontSize:11,color:T.textMuted}}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Users list */}
        <div className="cc" style={{padding:0,overflow:"hidden"}}>
          <div style={{padding:"14px 16px",borderBottom:`1px solid ${T.border}`,fontWeight:700,fontSize:14}}>👥 Client Users ({users.length})</div>
          {users.length===0&&<div style={{padding:40,textAlign:"center",color:T.textMuted}}>
            <div style={{fontSize:40,marginBottom:8}}>👤</div>
            <div style={{fontWeight:600,marginBottom:4}}>No users yet</div>
            <div style={{fontSize:12}}>Click "+ New User" to create your first client account</div>
          </div>}
          {users.map((u,i)=>(
            <div key={u.id} style={{padding:"14px 16px",borderBottom:i<users.length-1?`1px solid ${T.border}`:"none",display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:42,height:42,borderRadius:12,background:`${WA_GREEN}18`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>👤</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                  <span style={{fontWeight:700,fontSize:14}}>{u.username}</span>
                  {u.company_name&&<span style={{fontSize:11,color:T.textMuted}}>· {u.company_name}</span>}
                  <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:6,background:u.active?"#dcfce7":"#fee2e2",color:u.active?"#166534":"#dc2626"}}>{u.active?"Active":"Inactive"}</span>
                </div>
                <div style={{display:"flex",gap:4,marginTop:6,flexWrap:"wrap",alignItems:"center"}}>
                  {PERM_TABS.map(p=>(
                    <span key={p.key} style={{fontSize:10,padding:"2px 8px",borderRadius:6,background:u[p.key]?`${WA_GREEN}18`:`${T.border}`,color:u[p.key]?WA_GREEN:T.textMuted,fontWeight:600}}>{p.label}</span>
                  ))}
                  <span style={{fontSize:10,padding:"2px 8px",borderRadius:6,background:`${providerColor(u.ai_provider)}18`,color:providerColor(u.ai_provider),fontWeight:700,border:`1px solid ${providerColor(u.ai_provider)}30`}}>
                    🤖 {PROVIDERS.find(p=>p.id===u.ai_provider)?.label||u.ai_provider}
                  </span>
                  {u.ai_api_key&&<span style={{fontSize:10,color:T.textMuted}}>🔑 Key set</span>}
                </div>
              </div>
              <div style={{display:"flex",gap:8,flexShrink:0}}>
                <button onClick={()=>setEditUser({...u,newPassword:"",ai_api_key:u.ai_api_key||""})}
                  style={{padding:"6px 14px",borderRadius:8,border:`1px solid ${T.border}`,background:T.card2,color:T.text,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>✏️ Edit</button>
                <button onClick={()=>deleteUser(u.id)}
                  style={{padding:"6px 12px",borderRadius:8,border:"1px solid #ef444430",background:"#ef444410",color:"#ef4444",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>🗑️</button>
              </div>
            </div>
          ))}
        </div>

        {/* ── NEW USER MODAL ── */}
        {showNewUser&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:T.card,borderRadius:20,padding:28,width:"100%",maxWidth:480,boxShadow:"0 24px 60px rgba(0,0,0,.3)",maxHeight:"90vh",overflowY:"auto"}}>
            <div style={{fontWeight:800,fontSize:17,marginBottom:20}}>➕ Create New User</div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>

              <div>
                <div style={{fontSize:11,fontWeight:700,color:T.textMuted,marginBottom:5,letterSpacing:0.5}}>USERNAME *</div>
                {inp(newUser.username, e=>setNewUser(p=>({...p,username:e.target.value})), "e.g. john_clinic")}
              </div>

              <div>
                <div style={{fontSize:11,fontWeight:700,color:T.textMuted,marginBottom:5,letterSpacing:0.5}}>PASSWORD *</div>
                <div style={{position:"relative"}}>
                  {inp(newUser.password, e=>setNewUser(p=>({...p,password:e.target.value})), "Min 6 characters", showNewPw?"text":"password", {paddingRight:40})}
                  <button onClick={()=>setShowNewPw(p=>!p)} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",border:"none",background:"none",cursor:"pointer",fontSize:15,color:T.textMuted}}>{showNewPw?"🙈":"👁️"}</button>
                </div>
              </div>

              <div>
                <div style={{fontSize:11,fontWeight:700,color:T.textMuted,marginBottom:5,letterSpacing:0.5}}>COMPANY / SERVICE NAME</div>
                {inp(newUser.company_name, e=>setNewUser(p=>({...p,company_name:e.target.value})), "e.g. Nexora Health Clinic")}
              </div>

              <div>
                <div style={{fontSize:11,fontWeight:700,color:T.textMuted,marginBottom:5,letterSpacing:0.5}}>AI PROVIDER</div>
                <select value={newUser.ai_provider} onChange={e=>setNewUser(p=>({...p,ai_provider:e.target.value}))}
                  style={{width:"100%",padding:"10px 12px",borderRadius:10,border:`1px solid ${T.border}`,background:T.card2,color:T.text,fontSize:13,fontFamily:"inherit",outline:"none"}}>
                  {PROVIDERS.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </div>

              <div>
                <div style={{fontSize:11,fontWeight:700,color:T.textMuted,marginBottom:5,letterSpacing:0.5}}>API KEY FOR {newUser.ai_provider.toUpperCase()}</div>
                <div style={{position:"relative"}}>
                  {inp(newUser.ai_api_key, e=>setNewUser(p=>({...p,ai_api_key:e.target.value})), "Paste API key here...", showApiKey?"text":"password", {paddingRight:40,fontFamily:"monospace",fontSize:12})}
                  <button onClick={()=>setShowApiKey(p=>!p)} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",border:"none",background:"none",cursor:"pointer",fontSize:15,color:T.textMuted}}>{showApiKey?"🙈":"👁️"}</button>
                </div>
                <div style={{fontSize:10,color:T.textMuted,marginTop:4}}>
                  {newUser.ai_provider==="anthropic"&&"Get from console.anthropic.com → API Keys"}
                  {newUser.ai_provider==="openai"&&"Get from platform.openai.com → API Keys"}
                  {newUser.ai_provider==="groq"&&"Get from console.groq.com → API Keys (FREE)"}
                </div>
              </div>

              <div>
                <div style={{fontSize:11,fontWeight:700,color:T.textMuted,marginBottom:5,letterSpacing:0.5}}>INDUSTRY</div>
                <select value={newUser.industry||""} onChange={e=>setNewUser(p=>({...p,industry:e.target.value}))}
                  style={{width:"100%",padding:"10px 12px",borderRadius:10,border:`1px solid ${T.border}`,background:T.card2,color:T.text,fontSize:13,fontFamily:"inherit",outline:"none"}}>
                  <option value="">— Select Industry —</option>
                  <option value="Healthcare & Clinic">🏥 Healthcare & Clinic</option>
                  <option value="Dental">🦷 Dental</option>
                  <option value="Beauty & Salon">💅 Beauty & Salon</option>
                  <option value="Spa & Wellness">🧖 Spa & Wellness</option>
                  <option value="Fitness & Gym">🏋️ Fitness & Gym</option>
                  <option value="Legal & Law Firm">⚖️ Legal & Law Firm</option>
                  <option value="Real Estate">🏠 Real Estate</option>
                  <option value="Education & Tuition">📚 Education & Tuition</option>
                  <option value="Restaurant & Food">🍽️ Restaurant & Food</option>
                  <option value="Retail & E-commerce">🛍️ Retail & E-commerce</option>
                  <option value="Finance & Accounting">💰 Finance & Accounting</option>
                  <option value="Insurance">🛡️ Insurance</option>
                  <option value="Logistics & Delivery">🚚 Logistics & Delivery</option>
                  <option value="Hotel & Hospitality">🏨 Hotel & Hospitality</option>
                  <option value="Automotive">🚗 Automotive</option>
                  <option value="Technology & IT">💻 Technology & IT</option>
                  <option value="Other">📦 Other</option>
                </select>
              </div>
            </div>

            <div style={{display:"flex",gap:10,marginTop:20}}>
              <button onClick={()=>setShowNewUser(false)} style={{flex:1,padding:"11px",borderRadius:12,border:`1px solid ${T.border}`,background:T.card2,color:T.text,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
              <button onClick={createUser} disabled={saving} style={{flex:2,padding:"11px",borderRadius:12,border:"none",background:WA_GREEN,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{saving?"Creating...":"Create User"}</button>
            </div>
          </div>
        </div>}

        {/* ── EDIT USER MODAL ── */}
        {editUser&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:T.card,borderRadius:20,padding:28,width:"100%",maxWidth:480,boxShadow:"0 24px 60px rgba(0,0,0,.3)",maxHeight:"90vh",overflowY:"auto"}}>
            <div style={{fontWeight:800,fontSize:17,marginBottom:4}}>✏️ Edit User</div>
            <div style={{fontSize:12,color:T.textMuted,marginBottom:20}}>@{editUser.username}</div>

            <div style={{display:"flex",flexDirection:"column",gap:12}}>

              {/* Active toggle */}
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 14px",borderRadius:12,background:T.card2,border:`1px solid ${T.border}`}}>
                <div>
                  <div style={{fontSize:13,fontWeight:700}}>Account Status</div>
                  <div style={{fontSize:11,color:T.textMuted}}>{editUser.active?"User can login":"User is blocked"}</div>
                </div>
                <div onClick={()=>setEditUser(p=>({...p,active:!p.active}))}
                  style={{width:44,height:24,borderRadius:12,cursor:"pointer",background:editUser.active?WA_GREEN:"#ef4444",position:"relative",transition:"background .2s",flexShrink:0}}>
                  <div style={{position:"absolute",top:3,left:editUser.active?22:3,width:18,height:18,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
                </div>
              </div>

              {/* Company name */}
              <div>
                <div style={{fontSize:11,fontWeight:700,color:T.textMuted,marginBottom:5,letterSpacing:0.5}}>COMPANY / SERVICE NAME</div>
                {inp(editUser.company_name, e=>setEditUser(p=>({...p,company_name:e.target.value})), "Enter company name")}
              </div>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:T.textMuted,marginBottom:5,letterSpacing:0.5}}>INDUSTRY</div>
                <select value={editUser.industry||""} onChange={e=>setEditUser(p=>({...p,industry:e.target.value}))}
                  style={{width:"100%",padding:"10px 12px",borderRadius:10,border:`1px solid ${T.border}`,background:T.card2,color:T.text,fontSize:13,fontFamily:"inherit",outline:"none"}}>
                  <option value="">— Select Industry —</option>
                  <option value="Healthcare & Clinic">🏥 Healthcare & Clinic</option>
                  <option value="Dental">🦷 Dental</option>
                  <option value="Beauty & Salon">💅 Beauty & Salon</option>
                  <option value="Spa & Wellness">🧖 Spa & Wellness</option>
                  <option value="Fitness & Gym">🏋️ Fitness & Gym</option>
                  <option value="Legal & Law Firm">⚖️ Legal & Law Firm</option>
                  <option value="Real Estate">🏠 Real Estate</option>
                  <option value="Education & Tuition">📚 Education & Tuition</option>
                  <option value="Restaurant & Food">🍽️ Restaurant & Food</option>
                  <option value="Retail & E-commerce">🛍️ Retail & E-commerce</option>
                  <option value="Finance & Accounting">💰 Finance & Accounting</option>
                  <option value="Insurance">🛡️ Insurance</option>
                  <option value="Logistics & Delivery">🚚 Logistics & Delivery</option>
                  <option value="Hotel & Hospitality">🏨 Hotel & Hospitality</option>
                  <option value="Automotive">🚗 Automotive</option>
                  <option value="Technology & IT">💻 Technology & IT</option>
                  <option value="Other">📦 Other</option>
                </select>
              </div>

              {/* New password */}
              <div>
                <div style={{fontSize:11,fontWeight:700,color:T.textMuted,marginBottom:5,letterSpacing:0.5}}>NEW PASSWORD (leave blank to keep current)</div>
                <div style={{position:"relative"}}>
                  {inp(editUser.newPassword, e=>setEditUser(p=>({...p,newPassword:e.target.value})), "Enter new password...", showEditPw?"text":"password", {paddingRight:40})}
                  <button onClick={()=>setShowEditPw(p=>!p)} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",border:"none",background:"none",cursor:"pointer",fontSize:15,color:T.textMuted}}>{showEditPw?"🙈":"👁️"}</button>
                </div>
              </div>

              {/* AI Provider */}
              <div>
                <div style={{fontSize:11,fontWeight:700,color:T.textMuted,marginBottom:5,letterSpacing:0.5}}>AI PROVIDER</div>
                <select value={editUser.ai_provider||"anthropic"} onChange={e=>setEditUser(p=>({...p,ai_provider:e.target.value}))}
                  style={{width:"100%",padding:"10px 12px",borderRadius:10,border:`1px solid ${T.border}`,background:T.card2,color:T.text,fontSize:13,fontFamily:"inherit",outline:"none"}}>
                  {PROVIDERS.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </div>

              {/* API Key */}
              <div>
                <div style={{fontSize:11,fontWeight:700,color:T.textMuted,marginBottom:5,letterSpacing:0.5}}>API KEY</div>
                <div style={{position:"relative"}}>
                  {inp(editUser.ai_api_key, e=>setEditUser(p=>({...p,ai_api_key:e.target.value})), "Paste API key...", showEditApiKey?"text":"password", {paddingRight:40,fontFamily:"monospace",fontSize:12})}
                  <button onClick={()=>setShowEditApiKey(p=>!p)} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",border:"none",background:"none",cursor:"pointer",fontSize:15,color:T.textMuted}}>{showEditApiKey?"🙈":"👁️"}</button>
                </div>
              </div>

              {/* Tab permissions */}
              <div>
                <div style={{fontSize:11,fontWeight:700,color:T.textMuted,marginBottom:8,letterSpacing:0.5}}>TAB PERMISSIONS</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  {PERM_TABS.map(p=>(
                    <div key={p.key} onClick={()=>setEditUser(prev=>({...prev,[p.key]:!prev[p.key]}))}
                      style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 12px",borderRadius:10,border:`1px solid ${editUser[p.key]?WA_GREEN:T.border}`,cursor:"pointer",background:editUser[p.key]?`${WA_GREEN}10`:T.card2,transition:"all 0.15s"}}>
                      <span style={{fontSize:12,fontWeight:600,color:editUser[p.key]?WA_GREEN:T.textMuted}}>{p.label}</span>
                      <div style={{width:32,height:18,borderRadius:9,background:editUser[p.key]?WA_GREEN:T.border,position:"relative",transition:"background .2s",flexShrink:0}}>
                        <div style={{position:"absolute",top:2,left:editUser[p.key]?14:2,width:14,height:14,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{display:"flex",gap:10,marginTop:20}}>
              <button onClick={()=>setEditUser(null)} style={{flex:1,padding:"11px",borderRadius:12,border:`1px solid ${T.border}`,background:T.card2,color:T.text,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
              <button onClick={saveUser} disabled={saving} style={{flex:2,padding:"11px",borderRadius:12,border:"none",background:WA_GREEN,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{saving?"Saving...":"Save Changes"}</button>
            </div>
          </div>
        </div>}

        {/* ── CHANGE OWN PASSWORD MODAL ── */}
        {showChangePassword&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:T.card,borderRadius:20,padding:28,width:"100%",maxWidth:400,boxShadow:"0 24px 60px rgba(0,0,0,.3)"}}>
            <div style={{fontWeight:800,fontSize:17,marginBottom:4}}>🔑 Change My Password</div>
            <div style={{fontSize:12,color:T.textMuted,marginBottom:20}}>Update your admin account password</div>
            {pwMsg&&<div style={{background:pwMsg.startsWith("✅")?"#f0fdf4":"#fef2f2",border:`1px solid ${pwMsg.startsWith("✅")?"#86efac":"#fca5a5"}`,borderRadius:10,padding:"10px 14px",fontSize:13,color:pwMsg.startsWith("✅")?"#166534":"#dc2626",marginBottom:14}}>{pwMsg}</div>}
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:T.textMuted,marginBottom:5,letterSpacing:0.5}}>CURRENT PASSWORD</div>
                <div style={{position:"relative"}}>
                  {inp(pwForm.current_password, e=>setPwForm(p=>({...p,current_password:e.target.value})), "Enter current password", showCurrPw?"text":"password", {paddingRight:40})}
                  <button onClick={()=>setShowCurrPw(p=>!p)} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",border:"none",background:"none",cursor:"pointer",fontSize:15,color:T.textMuted}}>{showCurrPw?"🙈":"👁️"}</button>
                </div>
              </div>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:T.textMuted,marginBottom:5,letterSpacing:0.5}}>NEW PASSWORD</div>
                <div style={{position:"relative"}}>
                  {inp(pwForm.new_password, e=>setPwForm(p=>({...p,new_password:e.target.value})), "Min 6 characters", showNewCPw?"text":"password", {paddingRight:40})}
                  <button onClick={()=>setShowNewCPw(p=>!p)} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",border:"none",background:"none",cursor:"pointer",fontSize:15,color:T.textMuted}}>{showNewCPw?"🙈":"👁️"}</button>
                </div>
              </div>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:T.textMuted,marginBottom:5,letterSpacing:0.5}}>CONFIRM NEW PASSWORD</div>
                <div style={{position:"relative"}}>
                  {inp(pwForm.confirm, e=>setPwForm(p=>({...p,confirm:e.target.value})), "Repeat new password", showConfPw?"text":"password", {paddingRight:40})}
                  <button onClick={()=>setShowConfPw(p=>!p)} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",border:"none",background:"none",cursor:"pointer",fontSize:15,color:T.textMuted}}>{showConfPw?"🙈":"👁️"}</button>
                </div>
              </div>
            </div>
            <div style={{display:"flex",gap:10,marginTop:20}}>
              <button onClick={()=>{setShowChangePassword(false);setPwMsg("");}} style={{flex:1,padding:"11px",borderRadius:12,border:`1px solid ${T.border}`,background:T.card2,color:T.text,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
              <button onClick={changePassword} disabled={saving} style={{flex:2,padding:"11px",borderRadius:12,border:"none",background:WA_GREEN,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{saving?"Saving...":"Change Password"}</button>
            </div>
          </div>
        </div>}

      </div>
    </div>
  );
}