import { useState, useEffect, useRef, useCallback } from "react";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from "recharts";

const API = "https://clinic-bot-oy48.onrender.com";
const CRM_VERSION = "2.6.1";
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
];

export default function App() {
  const [dark, setDark] = useState(false);
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
  const [botConvo, setBotConvo] = useState([{from:"bot",text:"👋 Hi! I'm Sara from Evera Health 😊\nHow can I help you today?",time:ts(),sources:[]}]);
  const [botInput, setBotInput] = useState("");
  const [botLoading, setBotLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState({});

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
            <div style={{fontWeight:700,fontSize:13}}>Evera Health CRM</div>
            <div style={{fontSize:10,color:T.textMuted}}>WhatsApp Business</div>
          </div>
        </div>

        {/* Desktop tabs */}
        <div className="hide-mobile" style={{display:"flex",gap:2}}>
          {TABS.map(t=>(
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
              <div><div style={{fontWeight:700,fontSize:13}}>Sara — Evera Health Bot</div><div style={{fontSize:11,color:T.textMuted}}>Test with live Knowledge Base</div></div>
            </div>
            <button onClick={()=>setBotConvo([{from:"bot",text:"👋 Hi! I'm Sara from Evera Health 😊\nHow can I help you today?",time:ts(),sources:[]}])} style={{padding:"5px 12px",borderRadius:16,border:`1px solid ${T.border}`,background:T.card2,color:T.textMuted,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>↺ Reset</button>
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
                        onClick={()=>{ if(hasKey) setAppSettings(prev=>({...prev,ai_provider:p.id})); }}
                        style={{
                          borderRadius:10, padding:"12px 10px", textAlign:"center",
                          cursor:hasKey?"pointer":"not-allowed",
                          border:`2px solid ${isSelected?WA_GREEN:hasKey?T.border:"#ef444440"}`,
                          background:isSelected?`${WA_GREEN}15`:hasKey?T.card:"#ef444408",
                          opacity:hasKey?1:0.6, transition:"all .15s", position:"relative"
                        }}>
                        {p.free&&<div style={{position:"absolute",top:-8,right:8,background:"#10b981",color:"#fff",fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:8}}>FREE</div>}
                        {isSelected&&<div style={{position:"absolute",top:-8,left:8,background:WA_GREEN,color:"#fff",fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:8}}>ACTIVE</div>}
                        <div style={{fontSize:22,marginBottom:4}}>{p.icon}</div>
                        <div style={{fontWeight:700,fontSize:13,color:isSelected?WA_GREEN:T.text}}>{p.label}</div>
                        <div style={{fontSize:10,color:T.textMuted,marginTop:2}}>{p.company}</div>
                        <div style={{fontSize:10,color:T.textMuted}}>{p.model}</div>
                        <div style={{marginTop:6,fontSize:10,fontWeight:600,color:hasKey===undefined?"#6b7280":hasKey?"#10b981":"#ef4444"}}>
                          {hasKey===undefined?"⏳ checking...":hasKey?"✅ Key set":"❌ No key in Render"}
                        </div>
                      </div>;
                    })}
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

      </div>
    </div>
  );
}