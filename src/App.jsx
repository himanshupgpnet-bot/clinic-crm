import { useState, useEffect, useRef, useCallback } from "react";

const API = "https://clinic-bot-oy48.onrender.com";

const WA_GREEN = "#25D366";
const WA_DARK  = "#128C7E";
const WA_BG    = "#ECE5DD";

const LEAD_CONFIG = {
  hot:  { label:"🔥 Hot",  color:"#ef4444", bg:"#fef2f2", darkBg:"#2d1515", border:"#fca5a5" },
  warm: { label:"🟡 Warm", color:"#f59e0b", bg:"#fffbeb", darkBg:"#2d2010", border:"#fcd34d" },
  cold: { label:"🔵 Cold", color:"#3b82f6", bg:"#eff6ff", darkBg:"#0f1e35", border:"#93c5fd" },
};

const COLORS = ["#25D366","#128C7E","#34B7F1","#FF6B6B","#FFA726","#AB47BC","#42A5F5","#26A69A"];
const getColor = n => { let h=0; for(let c of n) h=c.charCodeAt(0)+((h<<5)-h); return COLORS[Math.abs(h)%COLORS.length]; };
const ts = () => new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});

const DEFAULT_SETTINGS = {
  hot_keywords:  "book,appointment,price,cost,how much,berapa,nak,want to,can i come,available,bila,when,package,session,ready",
  warm_keywords: "interested,maybe,consider,think about,tell me more,what is,how does,treatment,procedure,result,effect",
  cold_keywords: "just curious,nevermind,wrong number,no thanks,not interested,just asking,takpe,taknak",
  followup_enabled:   "true",
  followup_1_delay:   "2",
  followup_1_message: "Hi {name}! 😊 Just checking in — do you have any questions about our treatments? We'd love to help you!",
  followup_2_delay:   "24",
  followup_2_message: "Hello {name}! 👋 We still have slots available this week. Book your FREE consultation today → https://booking.clinic.com",
  followup_max:       "2",
};

export default function App() {
  const [dark, setDark] = useState(false);
  const [tab, setTab] = useState("crm");
  const [contacts, setContacts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [backendStatus, setBackendStatus] = useState("checking");
  const [reply, setReply] = useState("");
  const [filter, setFilter] = useState("all");
  const [leadFilter, setLeadFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [qaData, setQaData] = useState([]);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editQ, setEditQ] = useState("");
  const [editA, setEditA] = useState("");
  const [newQ, setNewQ] = useState("");
  const [newA, setNewA] = useState("");
  const [appSettings, setAppSettings] = useState(DEFAULT_SETTINGS);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [hoveredSource, setHoveredSource] = useState(null);
  const [highlightedQA, setHighlightedQA] = useState(null);
  const [botConvo, setBotConvo] = useState([{from:"bot",text:"👋 Hello! Welcome to our clinic.\n\nSaya boleh bantu dalam Bahasa Malaysia atau English! 😊",time:ts(),sources:[]}]);
  const [botInput, setBotInput] = useState("");
  const [botLoading, setBotLoading] = useState(false);

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
      if (selected) {
        const updated = data.find(c => c.id === selected.id);
        if (updated) setSelected(updated);
      }
    } catch { setBackendStatus("offline"); }
    finally { setLoading(false); }
  }, [selected]);

  const fetchKnowledge = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/knowledge`);
      if (!res.ok) return;
      const data = await res.json();
      setQaData(data.qa || []);
      setSystemPrompt(data.systemPrompt || "");
    } catch {}
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/settings`);
      if (!res.ok) return;
      const data = await res.json();
      setAppSettings({...DEFAULT_SETTINGS,...data});
    } catch {}
  }, []);

  useEffect(() => {
    fetchConversations();
    fetchKnowledge();
    fetchSettings();
    const poll = setInterval(fetchConversations, 5000);
    return () => clearInterval(poll);
  }, []);

  async function selectContact(c) {
    setSelected(c);
    try {
      await fetch(`${API}/api/conversations/${c.id}/read`, {method:"PATCH"});
      setContacts(p => p.map(x => x.id===c.id ? {...x,unread:0} : x));
    } catch {}
  }

  async function sendAgentReply() {
    if (!reply.trim() || !selected) return;
    const text = reply.trim(); setReply("");
    try {
      const res = await fetch(`${API}/api/conversations/${selected.id}/reply`, {
        method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({text}),
      });
      if (res.ok) fetchConversations();
    } catch {}
  }

  async function toggleStatus(id) {
    const c = contacts.find(x => x.id===id);
    const newStatus = c?.status==="open" ? "resolved" : "open";
    try {
      await fetch(`${API}/api/conversations/${id}/status`, {
        method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify({status:newStatus}),
      });
      fetchConversations();
    } catch {}
  }

  async function toggleBot(id) {
    const c = contacts.find(x => x.id===id);
    try {
      await fetch(`${API}/api/conversations/${id}/bot`, {
        method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify({botActive:!c?.botActive}),
      });
      fetchConversations();
    } catch {}
  }

  async function setManualLead(id, lead) {
    try {
      await fetch(`${API}/api/conversations/${id}/lead`, {
        method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify({lead}),
      });
      fetchConversations();
    } catch {}
  }

  async function saveSettings() {
    try {
      await fetch(`${API}/api/settings`, {
        method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify(appSettings),
      });
      setSettingsSaved(true);
      setTimeout(()=>setSettingsSaved(false), 2500);
    } catch { alert("Failed to save settings"); }
  }

  async function addQA() {
    if (!newQ.trim() || !newA.trim()) return;
    try {
      await fetch(`${API}/api/knowledge/qa`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({question:newQ.trim(), answer:newA.trim()}),
      });
      setNewQ(""); setNewA(""); fetchKnowledge();
    } catch {}
  }

  async function saveEdit(id) {
    try {
      await fetch(`${API}/api/knowledge/qa/${id}`, {
        method:"PATCH", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({question:editQ, answer:editA}),
      });
      setEditingId(null); fetchKnowledge();
    } catch {}
  }

  async function deleteQA(id) {
    if (!confirm("Delete this Q&A?")) return;
    try { await fetch(`${API}/api/knowledge/qa/${id}`, {method:"DELETE"}); fetchKnowledge(); } catch {}
  }

  async function saveSystemPrompt() {
    try {
      await fetch(`${API}/api/knowledge/prompt`, {
        method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify({prompt:systemPrompt}),
      });
      alert("Saved! ✅");
    } catch { alert("Failed"); }
  }

  function parseBotResponse(raw) {
    const lines = raw.trim().split("\n");
    let sources=[], text=raw.trim();
    try {
      const last=lines[lines.length-1].trim();
      if(last.startsWith('{"sources"')) { sources=JSON.parse(last).sources||[]; text=lines.slice(0,-1).join("\n").trim(); }
    } catch{}
    return {text,sources};
  }

  async function sendBotMessage() {
    if (!botInput.trim() || botLoading) return;
    const userMsg = {from:"user",text:botInput.trim(),time:ts(),sources:[]};
    setBotConvo(p=>[...p,userMsg]); setBotInput(""); setBotLoading(true);
    try {
      const history = [...botConvo, userMsg].map(m=>({
        role: m.from==="user"?"user":"assistant",
        content: m.from==="user" ? m.text : m.text+(m.sources?.length?`\n${JSON.stringify({sources:m.sources})}`:`\n{"sources":[]}`),
      }));
      const res = await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,messages:history}),
      });
      const data = await res.json();
      const raw = data.content?.[0]?.text || "⚠️ No response";
      const {text,sources} = parseBotResponse(raw);
      setBotConvo(p=>[...p,{from:"bot",text,time:ts(),sources}]);
    } catch { setBotConvo(p=>[...p,{from:"bot",text:"⚠️ Error connecting.",time:ts(),sources:[]}]); }
    setBotLoading(false);
  }

  function highlightQA(qaId) {
    setHighlightedQA(qaId); setTab("kb");
    setTimeout(()=>{ qaRefs.current[qaId]?.scrollIntoView({behavior:"smooth",block:"center"}); },150);
    setTimeout(()=>setHighlightedQA(null),3000);
  }

  const filtered = contacts.filter(c =>
    (filter==="all" || c.status===filter) &&
    (leadFilter==="all" || c.lead===leadFilter) &&
    (c.name?.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search))
  );

  const totalUnread  = contacts.reduce((s,c)=>s+c.unread, 0);
  const hotCount     = contacts.filter(c=>c.lead==="hot").length;
  const warmCount    = contacts.filter(c=>c.lead==="warm").length;
  const openCount    = contacts.filter(c=>c.status==="open").length;

  const T = dark ? {
    bg:"#0b141a", sidebar:"#111b21", nav:"#202c33", border:"#2a3942",
    card:"#182229", card2:"#2a3942", input:"#2a3942", inputBorder:"#3b4a54",
    text:"#e9edef", textMuted:"#8696a0", textFaint:"#667781",
    msgOut:"#005c4b", msgIn:"#182229", chatBg:"#0b141a",
    sidebarHover:"#202c33", selectedBg:"#2a3942",
  } : {
    bg:"#f0f2f5", sidebar:"#ffffff", nav:"#ffffff", border:"#e9edef",
    card:"#ffffff", card2:"#f0f2f5", input:"#f0f2f5", inputBorder:"#e9edef",
    text:"#111b21", textMuted:"#667781", textFaint:"#8696a0",
    msgOut:"#d9fdd3", msgIn:"#ffffff", chatBg:WA_BG,
    sidebarHover:"#f5f6f6", selectedBg:"#f0f2f5",
  };

  function LeadBadge({lead, score, reason, small}) {
    const cfg = LEAD_CONFIG[lead] || LEAD_CONFIG.cold;
    return (
      <div title={reason||""} style={{
        display:"inline-flex",alignItems:"center",gap:3,
        background:dark?cfg.darkBg:cfg.bg,border:`1px solid ${cfg.border}`,
        borderRadius:10,padding:small?"1px 6px":"3px 8px",
        fontSize:small?9:11,fontWeight:700,color:cfg.color,whiteSpace:"nowrap",
      }}>
        {cfg.label}{score>0&&!small&&<span style={{opacity:.7,fontWeight:400}}>· {score}</span>}
      </div>
    );
  }

  function SourceBadge({s}) {
    const qa = qaData.find(q=>q.id===s.id);
    if (!qa) return null;
    const color = s.relevance==="high"?WA_GREEN:s.relevance==="medium"?"#FFA726":"#8696a0";
    return (
      <div onMouseEnter={()=>setHoveredSource(s.id)} onMouseLeave={()=>setHoveredSource(null)}
        onClick={()=>highlightQA(s.id)}
        style={{position:"relative",display:"inline-flex",alignItems:"center",gap:4,
          background:dark?"#1a2e23":"#dcfce7",border:`1px solid ${color}40`,
          borderRadius:12,padding:"2px 8px",cursor:"pointer",marginRight:4,marginTop:4}}>
        <span style={{width:6,height:6,borderRadius:"50%",background:color,display:"inline-block"}}/>
        <span style={{fontSize:10,color,fontWeight:600}}>{qa.question.slice(0,28)}{qa.question.length>28?"…":""}</span>
        {hoveredSource===s.id&&(
          <div style={{position:"absolute",bottom:"calc(100% + 6px)",left:0,zIndex:99,
            background:T.card,border:`1px solid ${T.border}`,borderRadius:10,padding:10,width:260,
            boxShadow:"0 4px 20px rgba(0,0,0,.15)"}}>
            <div style={{fontSize:11,color:WA_GREEN,fontWeight:700,marginBottom:4}}>📌 {qa.question}</div>
            <div style={{fontSize:11,color:T.textMuted,lineHeight:1.5}}>{qa.answer}</div>
            <div style={{fontSize:10,color:T.textFaint,marginTop:6,paddingTop:5,borderTop:`1px solid ${T.border}`}}>
              Click to view in Knowledge Base →
            </div>
          </div>
        )}
      </div>
    );
  }

  function SettingInput({label, hint, settingKey, type="text", rows}) {
    return (
      <div style={{marginBottom:14}}>
        <div style={{fontWeight:600,fontSize:12,color:T.text,marginBottom:3}}>{label}</div>
        {hint&&<div style={{fontSize:11,color:T.textFaint,marginBottom:5}}>{hint}</div>}
        {rows ? (
          <textarea value={appSettings[settingKey]||""} rows={rows}
            onChange={e=>setAppSettings(p=>({...p,[settingKey]:e.target.value}))}
            style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,
              borderRadius:8,padding:"8px 12px",color:T.text,fontSize:12,fontFamily:"inherit"}}/>
        ) : (
          <input type={type} value={appSettings[settingKey]||""}
            onChange={e=>setAppSettings(p=>({...p,[settingKey]:e.target.value}))}
            style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,
              borderRadius:8,padding:"8px 12px",color:T.text,fontSize:12}}/>
        )}
      </div>
    );
  }

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:T.bg,
      fontFamily:"'Segoe UI',system-ui,sans-serif",color:T.text,overflow:"hidden"}}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#8696a040;border-radius:4px}
        textarea:focus,input:focus{outline:none}textarea{resize:none}
        .contact-item{transition:background .15s;cursor:pointer}
        .contact-item:hover{background:${T.sidebarHover}}
        .contact-item.active{background:${T.selectedBg}}
        .msg-bubble{animation:fadeUp .2s ease}
        @keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        .stat-card{transition:transform .15s}.stat-card:hover{transform:translateY(-2px)}
        .tab-btn{transition:all .15s;cursor:pointer;border:none;background:transparent;font-family:inherit}
        .send-btn:active{transform:scale(.92)}
        .qa-row.hl{background:#dcfce7!important;border-color:${WA_GREEN}!important}
        input::placeholder,textarea::placeholder{color:${T.textFaint}}
        @keyframes bounce{0%,80%,100%{transform:scale(0)}40%{transform:scale(1)}}
      `}</style>

      {/* ── NAV ── */}
      <div style={{height:56,background:T.nav,borderBottom:`1px solid ${T.border}`,
        display:"flex",alignItems:"center",padding:"0 16px",gap:6,flexShrink:0,
        boxShadow:"0 1px 3px rgba(0,0,0,.07)"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginRight:12}}>
          <div style={{width:36,height:36,borderRadius:10,
            background:`linear-gradient(135deg,${WA_GREEN},${WA_DARK})`,
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🏥</div>
          <div>
            <div style={{fontWeight:700,fontSize:13}}>Clinic CRM</div>
            <div style={{fontSize:10,color:T.textMuted}}>WhatsApp Business</div>
          </div>
        </div>

        {[
          {id:"crm",  icon:"💬", label:"Inbox",    badge:totalUnread},
          {id:"bot",  icon:"🤖", label:"Test Bot"},
          {id:"kb",   icon:"📋", label:`Knowledge (${qaData.length})`},
          {id:"settings", icon:"⚙️", label:"Settings"},
        ].map(t=>(
          <button key={t.id} className="tab-btn" onClick={()=>setTab(t.id)}
            style={{display:"flex",alignItems:"center",gap:5,padding:"6px 12px",borderRadius:20,
              background:tab===t.id?`${WA_GREEN}18`:"transparent",
              color:tab===t.id?WA_GREEN:T.textMuted,fontWeight:tab===t.id?700:500,fontSize:12}}>
            <span>{t.icon}</span><span>{t.label}</span>
            {t.badge>0&&<span style={{background:WA_GREEN,color:"#fff",borderRadius:10,
              padding:"1px 5px",fontSize:10,fontWeight:700}}>{t.badge}</span>}
          </button>
        ))}

        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:10}}>
          {hotCount>0&&<div style={{background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:20,
            padding:"3px 10px",fontSize:11,color:"#ef4444",fontWeight:700}}>🔥 {hotCount} Hot</div>}
          {warmCount>0&&<div style={{background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:20,
            padding:"3px 10px",fontSize:11,color:"#f59e0b",fontWeight:700}}>🟡 {warmCount} Warm</div>}
          <div style={{display:"flex",alignItems:"center",gap:5,fontSize:11}}>
            <div style={{width:7,height:7,borderRadius:"50%",
              background:backendStatus==="online"?WA_GREEN:backendStatus==="offline"?"#ef4444":"#f59e0b"}}/>
            <span style={{color:T.textMuted}}>{backendStatus==="online"?"Live":backendStatus==="offline"?"Offline":"..."}</span>
          </div>
          <button onClick={()=>setDark(d=>!d)}
            style={{padding:"4px 10px",borderRadius:20,border:`1px solid ${T.border}`,
              background:T.card2,color:T.textMuted,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>
            {dark?"☀️":"🌙"}
          </button>
        </div>
      </div>

      <div style={{flex:1,display:"flex",overflow:"hidden"}}>

        {/* ══════════ CRM TAB ══════════ */}
        {tab==="crm"&&<>
          {/* Sidebar */}
          <div style={{width:300,background:T.sidebar,borderRight:`1px solid ${T.border}`,display:"flex",flexDirection:"column"}}>
            <div style={{padding:"10px 10px 8px",borderBottom:`1px solid ${T.border}`}}>

              {/* Stats */}
              <div style={{display:"flex",gap:5,marginBottom:8}}>
                {[
                  {label:"Total",  value:contacts.length, color:T.textMuted},
                  {label:"Open",   value:openCount,        color:WA_GREEN},
                  {label:"🔥 Hot", value:hotCount,         color:"#ef4444"},
                  {label:"🟡 Warm",value:warmCount,        color:"#f59e0b"},
                ].map(s=>(
                  <div key={s.label} className="stat-card"
                    style={{flex:1,background:T.card2,borderRadius:8,padding:"5px 3px",textAlign:"center",
                      border:`1px solid ${T.border}`}}>
                    <div style={{fontSize:14,fontWeight:700,color:s.color}}>{s.value}</div>
                    <div style={{fontSize:9,color:T.textFaint}}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Search */}
              <div style={{position:"relative",marginBottom:6}}>
                <span style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",fontSize:12,color:T.textFaint}}>🔍</span>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..."
                  style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,
                    borderRadius:18,padding:"6px 10px 6px 28px",color:T.text,fontSize:12}}/>
              </div>

              {/* Status filter */}
              <div style={{display:"flex",gap:3,marginBottom:5}}>
                {["all","open","resolved"].map(f=>(
                  <button key={f} onClick={()=>setFilter(f)}
                    style={{flex:1,padding:"4px 0",borderRadius:14,border:"none",cursor:"pointer",
                      background:filter===f?WA_GREEN:T.input,
                      color:filter===f?"#fff":T.textMuted,fontSize:10,fontWeight:600,
                      textTransform:"capitalize",fontFamily:"inherit"}}>
                    {f}
                  </button>
                ))}
              </div>

              {/* Lead filter */}
              <div style={{display:"flex",gap:3}}>
                {["all","hot","warm","cold"].map(f=>(
                  <button key={f} onClick={()=>setLeadFilter(f)}
                    style={{flex:1,padding:"4px 0",borderRadius:14,border:"none",cursor:"pointer",
                      background:leadFilter===f?(f==="all"?WA_GREEN:LEAD_CONFIG[f]?.color||WA_GREEN):T.input,
                      color:leadFilter===f?"#fff":T.textMuted,fontSize:10,fontWeight:600,fontFamily:"inherit"}}>
                    {f==="all"?"All":f==="hot"?"🔥":f==="warm"?"🟡":"🔵"}
                  </button>
                ))}
              </div>
            </div>

            {/* Contact list */}
            <div style={{flex:1,overflowY:"auto"}}>
              {loading&&<div style={{padding:20,textAlign:"center",color:T.textFaint,fontSize:12}}>Loading...</div>}
              {!loading&&filtered.length===0&&(
                <div style={{padding:24,textAlign:"center",color:T.textFaint,fontSize:12}}>
                  <div style={{fontSize:32,marginBottom:8}}>💬</div>
                  {backendStatus==="offline"?"⚠️ Backend offline":"No conversations"}
                </div>
              )}
              {filtered.map(c=>(
                <div key={c.id} className={`contact-item ${selected?.id===c.id?"active":""}`}
                  onClick={()=>selectContact(c)}
                  style={{padding:"9px 12px",display:"flex",alignItems:"center",gap:9,
                    borderBottom:`1px solid ${T.border}40`,
                    borderLeft:c.lead==="hot"?`3px solid #ef4444`:c.lead==="warm"?`3px solid #f59e0b`:"3px solid transparent"}}>
                  <div style={{position:"relative",flexShrink:0}}>
                    <div style={{width:42,height:42,borderRadius:"50%",background:getColor(c.name||"?"),
                      display:"flex",alignItems:"center",justifyContent:"center",
                      fontWeight:700,fontSize:13,color:"#fff"}}>
                      {c.avatar||"?"}
                    </div>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}>
                      <span style={{fontWeight:600,fontSize:13,color:T.text}}>{c.name}</span>
                      <span style={{fontSize:10,color:T.textFaint,flexShrink:0}}>{c.lastTime}</span>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
                      <span style={{fontSize:11,color:T.textMuted,overflow:"hidden",
                        textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:150}}>
                        {c.botActive&&<span style={{color:WA_GREEN,marginRight:2}}>🤖</span>}
                        {c.lastMessage||"No messages"}
                      </span>
                      {c.unread>0&&<span style={{background:WA_GREEN,color:"#fff",borderRadius:10,
                        padding:"1px 5px",fontSize:10,fontWeight:700,flexShrink:0}}>{c.unread}</span>}
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:4}}>
                      <LeadBadge lead={c.lead} score={c.leadScore} reason={c.leadReason} small/>
                      {c.leadReason&&<span style={{fontSize:9,color:T.textFaint,
                        overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:100}}>
                        {c.leadReason}
                      </span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Chat Area */}
          {selected ? (
            <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>
              {/* Chat Header */}
              <div style={{padding:"10px 16px",background:T.nav,borderBottom:`1px solid ${T.border}`,
                display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:38,height:38,borderRadius:"50%",background:getColor(selected.name||"?"),
                    display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:13,color:"#fff"}}>
                    {selected.avatar}
                  </div>
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontWeight:700,fontSize:14}}>{selected.name}</span>
                      <LeadBadge lead={selected.lead} score={selected.leadScore} reason={selected.leadReason}/>
                    </div>
                    <div style={{fontSize:11,color:T.textMuted}}>{selected.phone}</div>
                  </div>
                </div>
                <div style={{display:"flex",gap:6,alignItems:"center"}}>
                  {/* Manual lead override */}
                  <select value={selected.lead}
                    onChange={e=>setManualLead(selected.id, e.target.value)}
                    style={{background:T.card2,border:`1px solid ${T.border}`,borderRadius:16,
                      padding:"5px 10px",color:T.text,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>
                    <option value="hot">🔥 Hot</option>
                    <option value="warm">🟡 Warm</option>
                    <option value="cold">🔵 Cold</option>
                  </select>
                  <button onClick={()=>toggleBot(selected.id)}
                    style={{padding:"6px 12px",borderRadius:20,border:"none",cursor:"pointer",
                      background:selected.botActive?`${WA_GREEN}20`:T.card2,
                      color:selected.botActive?WA_GREEN:T.textMuted,
                      fontSize:12,fontWeight:600,fontFamily:"inherit"}}>
                    🤖 {selected.botActive?"Bot ON":"Bot OFF"}
                  </button>
                  <button onClick={()=>toggleStatus(selected.id)}
                    style={{padding:"6px 12px",borderRadius:20,border:`1px solid ${T.border}`,
                      background:T.card2,color:T.textMuted,fontSize:12,fontWeight:600,
                      cursor:"pointer",fontFamily:"inherit"}}>
                    {selected.status==="open"?"✓ Resolve":"↺ Reopen"}
                  </button>
                </div>
              </div>

              {selected.botActive&&(
                <div style={{background:`${WA_GREEN}12`,borderBottom:`1px solid ${WA_GREEN}25`,
                  padding:"5px 16px",fontSize:11,color:WA_DARK,display:"flex",alignItems:"center",gap:6}}>
                  🤖 Bot is handling this conversation — toggle off to reply manually
                </div>
              )}

              {/* Lead reason banner for hot leads */}
              {selected.lead==="hot"&&selected.leadReason&&(
                <div style={{background:"#fef2f2",borderBottom:"1px solid #fca5a5",
                  padding:"5px 16px",fontSize:11,color:"#ef4444",display:"flex",alignItems:"center",gap:6}}>
                  🔥 <strong>Hot Lead:</strong> {selected.leadReason}
                </div>
              )}

              {/* Messages */}
              <div style={{flex:1,overflowY:"auto",padding:16,background:T.chatBg,
                display:"flex",flexDirection:"column",gap:6}}>
                {selected.messages?.map((msg,i)=>{
                  const isOut = msg.from!=="user";
                  return (
                    <div key={msg.id||i} className="msg-bubble"
                      style={{display:"flex",justifyContent:isOut?"flex-end":"flex-start",
                        alignItems:"flex-end",gap:6}}>
                      {!isOut&&(
                        <div style={{width:26,height:26,borderRadius:"50%",
                          background:getColor(selected.name||"?"),flexShrink:0,
                          display:"flex",alignItems:"center",justifyContent:"center",
                          fontSize:10,fontWeight:700,color:"#fff",marginBottom:2}}>
                          {selected.avatar}
                        </div>
                      )}
                      <div style={{maxWidth:"65%"}}>
                        <div style={{background:isOut?T.msgOut:T.msgIn,
                          borderRadius:isOut?"16px 4px 16px 16px":"4px 16px 16px 16px",
                          padding:"8px 12px",boxShadow:"0 1px 2px rgba(0,0,0,.1)"}}>
                          {isOut&&<div style={{fontSize:10,
                            color:msg.from==="bot"?WA_GREEN:"#34B7F1",
                            fontWeight:700,marginBottom:2}}>
                            {msg.from==="bot"?"🤖 Bot":"👤 You"}
                          </div>}
                          <div style={{fontSize:13,lineHeight:1.5,whiteSpace:"pre-wrap",color:T.text}}>
                            {msg.text}
                          </div>
                          <div style={{fontSize:10,color:T.textFaint,textAlign:"right",marginTop:2}}>
                            {msg.time}
                          </div>
                        </div>
                        {msg.sources?.length>0&&(
                          <div style={{marginTop:4,paddingLeft:4}}>
                            {msg.sources.map(s=><SourceBadge key={s.id} s={s}/>)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef}/>
              </div>

              {/* Reply input */}
              <div style={{padding:"8px 12px",background:T.nav,borderTop:`1px solid ${T.border}`,
                display:"flex",gap:8,alignItems:"flex-end"}}>
                <textarea value={reply} onChange={e=>setReply(e.target.value)}
                  onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendAgentReply();}}}
                  placeholder={selected.botActive?"Bot is active — toggle off to reply manually":"Type a message..."}
                  disabled={selected.botActive} rows={1}
                  style={{flex:1,background:T.input,border:`1px solid ${T.inputBorder}`,
                    borderRadius:20,padding:"9px 16px",
                    color:selected.botActive?T.textFaint:T.text,fontSize:13,maxHeight:100}}/>
                <button className="send-btn" onClick={sendAgentReply}
                  disabled={selected.botActive||!reply.trim()}
                  style={{width:40,height:40,borderRadius:"50%",border:"none",
                    background:selected.botActive||!reply.trim()?T.card2:WA_GREEN,
                    color:selected.botActive||!reply.trim()?T.textFaint:"#fff",
                    fontSize:16,cursor:selected.botActive?"not-allowed":"pointer",flexShrink:0}}>➤</button>
              </div>
            </div>
          ):(
            <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",
              flexDirection:"column",gap:10,background:T.chatBg}}>
              <div style={{fontSize:48}}>💬</div>
              <div style={{fontSize:15,fontWeight:600,color:T.text}}>Select a conversation</div>
              <div style={{fontSize:12,color:T.textFaint}}>
                {backendStatus==="offline"?"⚠️ Cannot connect to backend":"Choose from the sidebar"}
              </div>
            </div>
          )}
        </>}

        {/* ══════════ BOT TEST TAB ══════════ */}
        {tab==="bot"&&(
          <div style={{flex:1,display:"flex",flexDirection:"column",maxWidth:680,margin:"0 auto",width:"100%"}}>
            <div style={{padding:"10px 16px",background:T.nav,borderBottom:`1px solid ${T.border}`,
              display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:36,height:36,borderRadius:"50%",
                  background:`linear-gradient(135deg,${WA_GREEN},${WA_DARK})`,
                  display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🤖</div>
                <div>
                  <div style={{fontWeight:700,fontSize:13}}>Bot Preview</div>
                  <div style={{fontSize:11,color:T.textMuted}}>Test with live Knowledge Base</div>
                </div>
              </div>
              <button onClick={()=>setBotConvo([{from:"bot",text:"👋 Hello! How can I help?\nSaya boleh bantu dalam Bahasa Malaysia atau English! 😊",time:ts(),sources:[]}])}
                style={{padding:"5px 12px",borderRadius:18,border:`1px solid ${T.border}`,
                  background:T.card2,color:T.textMuted,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>
                ↺ Reset
              </button>
            </div>
            <div style={{flex:1,overflowY:"auto",padding:14,background:T.chatBg,display:"flex",flexDirection:"column",gap:7}}>
              {botConvo.map((msg,i)=>(
                <div key={i} className="msg-bubble"
                  style={{display:"flex",justifyContent:msg.from==="user"?"flex-end":"flex-start"}}>
                  <div style={{maxWidth:"70%",background:msg.from==="user"?T.msgOut:T.msgIn,
                    borderRadius:msg.from==="user"?"16px 4px 16px 16px":"4px 16px 16px 16px",
                    padding:"9px 13px",boxShadow:"0 1px 2px rgba(0,0,0,.1)"}}>
                    <div style={{fontSize:10,color:msg.from==="user"?"#34B7F1":WA_GREEN,fontWeight:700,marginBottom:3}}>
                      {msg.from==="user"?"👤 You":"🤖 Bot"}
                    </div>
                    <div style={{fontSize:13,lineHeight:1.6,whiteSpace:"pre-wrap",color:T.text}}>{msg.text}</div>
                    <div style={{fontSize:10,color:T.textFaint,textAlign:"right",marginTop:2}}>{msg.time}</div>
                  </div>
                </div>
              ))}
              {botLoading&&(
                <div style={{display:"flex"}}>
                  <div style={{background:T.msgIn,borderRadius:"4px 16px 16px 16px",
                    padding:"12px 16px",display:"flex",gap:5,alignItems:"center"}}>
                    {[0,1,2].map(i=>(
                      <div key={i} style={{width:8,height:8,borderRadius:"50%",background:WA_GREEN,
                        animation:`bounce 1s ${i*.15}s infinite`}}/>
                    ))}
                  </div>
                </div>
              )}
              <div ref={botEndRef}/>
            </div>
            <div style={{padding:"6px 10px",background:T.nav,display:"flex",gap:5,flexWrap:"wrap",
              borderTop:`1px solid ${T.border}`}}>
              {["Where are you located?","How much is consultation?","I want to book","Skin whitening price?","I'm from Melaka"].map(q=>(
                <button key={q} onClick={()=>setBotInput(q)}
                  style={{background:T.card2,border:`1px solid ${T.border}`,borderRadius:14,
                    padding:"3px 10px",color:T.textMuted,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>
                  {q}
                </button>
              ))}
            </div>
            <div style={{padding:"8px 10px",background:T.nav,display:"flex",gap:6,alignItems:"flex-end"}}>
              <textarea value={botInput} onChange={e=>setBotInput(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendBotMessage();}}}
                placeholder="Type a test message..." rows={1}
                style={{flex:1,background:T.input,border:`1px solid ${T.inputBorder}`,
                  borderRadius:20,padding:"8px 14px",color:T.text,fontSize:13}}/>
              <button className="send-btn" onClick={sendBotMessage} disabled={botLoading||!botInput.trim()}
                style={{width:38,height:38,borderRadius:"50%",border:"none",flexShrink:0,
                  background:botLoading||!botInput.trim()?T.card2:WA_GREEN,
                  color:botLoading||!botInput.trim()?T.textFaint:"#fff",fontSize:15,cursor:"pointer"}}>➤</button>
            </div>
          </div>
        )}

        {/* ══════════ KNOWLEDGE BASE TAB ══════════ */}
        {tab==="kb"&&(
          <div style={{flex:1,overflowY:"auto",padding:20,background:T.bg}}>
            <div style={{maxWidth:780,margin:"0 auto"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18}}>
                <div>
                  <div style={{fontWeight:700,fontSize:17}}>📋 Knowledge Base</div>
                  <div style={{fontSize:11,color:T.textMuted,marginTop:2}}>{qaData.length} Q&A pairs · Auto-saves to Excel</div>
                </div>
                <div style={{background:`${WA_GREEN}15`,border:`1px solid ${WA_GREEN}30`,
                  borderRadius:18,padding:"4px 12px",fontSize:11,color:WA_GREEN,fontWeight:600}}>
                  💾 Auto-saves to Excel
                </div>
              </div>

              {/* System Prompt */}
              <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:16,marginBottom:16}}>
                <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>⚙️ System Prompt</div>
                <textarea value={systemPrompt} onChange={e=>setSystemPrompt(e.target.value)} rows={7}
                  style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,
                    borderRadius:8,padding:"9px 12px",color:T.text,fontSize:11,
                    fontFamily:"'Courier New',monospace",lineHeight:1.7,marginBottom:10}}/>
                <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                  <button onClick={saveSystemPrompt}
                    style={{padding:"7px 16px",borderRadius:18,border:"none",background:WA_GREEN,
                      color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                    💾 Save Prompt
                  </button>
                </div>
              </div>

              {/* Add Q&A */}
              <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:16,marginBottom:16}}>
                <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>➕ Add New Q&A</div>
                <input value={newQ} onChange={e=>setNewQ(e.target.value)} placeholder="Question..."
                  style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,
                    borderRadius:8,padding:"8px 12px",color:T.text,fontSize:13,marginBottom:7}}/>
                <textarea value={newA} onChange={e=>setNewA(e.target.value)} placeholder="Answer..." rows={2}
                  style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,
                    borderRadius:8,padding:"8px 12px",color:T.text,fontSize:13,marginBottom:10}}/>
                <button onClick={addQA}
                  style={{padding:"7px 18px",borderRadius:18,border:"none",background:WA_GREEN,
                    color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                  ➕ Add Q&A
                </button>
              </div>

              {/* Q&A List */}
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {qaData.map((qa,i)=>(
                  <div key={qa.id} ref={el=>qaRefs.current[qa.id]=el}
                    className={`qa-row ${highlightedQA===qa.id?"hl":""}`}
                    style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:14,
                      transition:"all .3s"}}>
                    {editingId===qa.id?(
                      <div>
                        <input value={editQ} onChange={e=>setEditQ(e.target.value)}
                          style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,
                            borderRadius:8,padding:"8px 12px",color:T.text,fontSize:13,marginBottom:7}}/>
                        <textarea value={editA} onChange={e=>setEditA(e.target.value)} rows={3}
                          style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,
                            borderRadius:8,padding:"8px 12px",color:T.text,fontSize:13,marginBottom:9}}/>
                        <div style={{display:"flex",gap:7}}>
                          <button onClick={()=>saveEdit(qa.id)}
                            style={{padding:"6px 14px",borderRadius:16,border:"none",background:WA_GREEN,
                              color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Save</button>
                          <button onClick={()=>setEditingId(null)}
                            style={{padding:"6px 14px",borderRadius:16,border:`1px solid ${T.border}`,
                              background:T.card2,color:T.textMuted,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
                        </div>
                      </div>
                    ):(
                      <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                        <div style={{width:26,height:26,borderRadius:7,background:`${WA_GREEN}15`,
                          display:"flex",alignItems:"center",justifyContent:"center",
                          fontSize:10,fontWeight:700,color:WA_GREEN,flexShrink:0}}>{i+1}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:600,fontSize:13,marginBottom:3}}>{qa.question}</div>
                          <div style={{fontSize:12,color:T.textMuted,lineHeight:1.5}}>{qa.answer}</div>
                        </div>
                        <div style={{display:"flex",gap:5,flexShrink:0}}>
                          <button onClick={()=>{setEditingId(qa.id);setEditQ(qa.question);setEditA(qa.answer);}}
                            style={{padding:"4px 10px",borderRadius:14,border:`1px solid ${WA_GREEN}40`,
                              background:`${WA_GREEN}10`,color:WA_GREEN,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>✏️</button>
                          <button onClick={()=>deleteQA(qa.id)}
                            style={{padding:"4px 10px",borderRadius:14,border:"1px solid #ef444440",
                              background:"#ef444410",color:"#ef4444",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>✕</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══════════ SETTINGS TAB ══════════ */}
        {tab==="settings"&&(
          <div style={{flex:1,overflowY:"auto",padding:20,background:T.bg}}>
            <div style={{maxWidth:720,margin:"0 auto"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
                <div>
                  <div style={{fontWeight:700,fontSize:17}}>⚙️ Settings</div>
                  <div style={{fontSize:11,color:T.textMuted,marginTop:2}}>Saved to settings.xlsx — survives restarts</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  {settingsSaved&&<div style={{background:`${WA_GREEN}15`,border:`1px solid ${WA_GREEN}30`,
                    borderRadius:18,padding:"4px 12px",fontSize:11,color:WA_GREEN,fontWeight:600}}>
                    ✅ Saved!
                  </div>}
                  <button onClick={saveSettings}
                    style={{padding:"8px 20px",borderRadius:20,border:"none",background:WA_GREEN,
                      color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                    💾 Save All Settings
                  </button>
                </div>
              </div>

              {/* Lead Scoring */}
              <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:20,marginBottom:16}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
                  <div style={{width:36,height:36,borderRadius:10,background:"#fef2f2",
                    display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🎯</div>
                  <div>
                    <div style={{fontWeight:700,fontSize:14}}>Lead Scoring Keywords</div>
                    <div style={{fontSize:11,color:T.textMuted}}>Claude uses these as hints when scoring leads. Comma-separated.</div>
                  </div>
                </div>

                <SettingInput label="🔥 Hot Keywords" settingKey="hot_keywords"
                  hint="If customer message contains these → likely Hot lead"
                  rows={2}/>
                <SettingInput label="🟡 Warm Keywords" settingKey="warm_keywords"
                  hint="If customer message contains these → likely Warm lead"
                  rows={2}/>
                <SettingInput label="🔵 Cold Keywords" settingKey="cold_keywords"
                  hint="If customer message contains these → likely Cold lead"
                  rows={2}/>

                <div style={{background:dark?"#1a2235":"#f8fafc",borderRadius:10,padding:12,marginTop:4}}>
                  <div style={{fontSize:11,color:T.textMuted,lineHeight:1.6}}>
                    ℹ️ <strong>How it works:</strong> After every customer message, Claude analyses the full conversation
                    and assigns a lead score. Keywords above are used as a fast fallback if Claude API is unavailable.
                    You can also manually override any lead score from the chat header dropdown.
                  </div>
                </div>
              </div>

              {/* Follow-up Settings */}
              <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:20,marginBottom:16}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
                  <div style={{width:36,height:36,borderRadius:10,background:"#eff6ff",
                    display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>⏰</div>
                  <div>
                    <div style={{fontWeight:700,fontSize:14}}>Auto Follow-up Messages</div>
                    <div style={{fontSize:11,color:T.textMuted}}>Bot sends follow-ups if customer goes silent</div>
                  </div>
                  <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:12,color:T.textMuted}}>Enabled</span>
                    <div onClick={()=>setAppSettings(p=>({...p,followup_enabled:p.followup_enabled==="true"?"false":"true"}))}
                      style={{width:42,height:24,borderRadius:12,cursor:"pointer",transition:"background .2s",
                        background:appSettings.followup_enabled==="true"?WA_GREEN:T.card2,
                        border:`1px solid ${T.border}`,position:"relative"}}>
                      <div style={{position:"absolute",top:2,
                        left:appSettings.followup_enabled==="true"?20:2,
                        width:18,height:18,borderRadius:"50%",background:"#fff",
                        transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,.2)"}}/>
                    </div>
                  </div>
                </div>

                <div style={{opacity:appSettings.followup_enabled==="true"?1:.4,
                  pointerEvents:appSettings.followup_enabled==="true"?"auto":"none"}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                    <SettingInput label="Follow-up 1 — Delay (hours)" settingKey="followup_1_delay" type="number"/>
                    <SettingInput label="Follow-up 2 — Delay (hours)" settingKey="followup_2_delay" type="number"/>
                  </div>
                  <SettingInput label="Follow-up 1 Message" settingKey="followup_1_message" rows={2}
                    hint="Use {name} for customer name"/>
                  <SettingInput label="Follow-up 2 Message" settingKey="followup_2_message" rows={2}
                    hint="Use {name} for customer name"/>
                  <SettingInput label="Max follow-ups per customer" settingKey="followup_max" type="number"/>
                </div>

                <div style={{background:dark?"#1a2235":"#f8fafc",borderRadius:10,padding:12,marginTop:8}}>
                  <div style={{fontSize:11,color:T.textMuted,lineHeight:1.6}}>
                    ℹ️ <strong>Coming soon:</strong> The auto follow-up scheduler will be activated in the next update.
                    Settings are saved and ready — the backend will pick them up automatically once enabled.
                  </div>
                </div>
              </div>

              <div style={{display:"flex",justifyContent:"flex-end"}}>
                <button onClick={saveSettings}
                  style={{padding:"10px 28px",borderRadius:22,border:"none",background:WA_GREEN,
                    color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit",
                    boxShadow:`0 4px 14px ${WA_GREEN}50`}}>
                  💾 Save All Settings
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}