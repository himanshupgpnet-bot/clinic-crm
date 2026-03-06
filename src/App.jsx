import { useState, useEffect, useRef, useCallback } from "react";

const API = "https://clinic-bot-oy48.onrender.com";

const SYSTEM_PROMPT = `You are a friendly clinic assistant chatbot for an aesthetic clinic in Kuala Lumpur, Malaysia.
PRIMARY GOAL: Guide every conversation naturally toward booking a clinic visit appointment.
LANGUAGE: Auto-detect. Reply in Malay if Malay, English if English, Manglish if mixed.
PERSONALITY: Caring, professional, friendly. Never pushy but always gently steering toward booking.
STRICT RULES:
- You are NOT a doctor. Do NOT diagnose.
- Do NOT guarantee treatment outcomes.
- Do NOT recommend stopping medication.
- If unsure: "Our doctor can best answer that during your free consultation!"
KNOWLEDGE BASE:
{QA_DATA}
IMPORTANT: At the end of your response, on the last line ONLY append:
{"sources":[{"id":"qa1","relevance":"high"}]}
Max 3 sources. If no match: {"sources":[]}
Always end with a soft booking call-to-action when natural.`;

const WA_GREEN = "#25D366";
const WA_DARK = "#128C7E";
const WA_LIGHT_GREEN = "#dcfce7";
const WA_BG = "#ECE5DD";

const COLORS = ["#25D366","#128C7E","#34B7F1","#FF6B6B","#FFA726","#AB47BC","#42A5F5","#26A69A"];
const getColor = n => { let h=0; for(let c of n) h=c.charCodeAt(0)+((h<<5)-h); return COLORS[Math.abs(h)%COLORS.length]; };
const ts = () => new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});

export default function App() {
  const [dark, setDark] = useState(false);
  const [tab, setTab] = useState("crm");
  const [contacts, setContacts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [backendStatus, setBackendStatus] = useState("checking");
  const [lastRefresh, setLastRefresh] = useState(null);
  const [reply, setReply] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [qaData, setQaData] = useState([]);
  const [systemPrompt, setSystemPrompt] = useState(SYSTEM_PROMPT);
  const [editingId, setEditingId] = useState(null);
  const [editQ, setEditQ] = useState("");
  const [editA, setEditA] = useState("");
  const [newQ, setNewQ] = useState("");
  const [newA, setNewA] = useState("");
  const [botConvo, setBotConvo] = useState([{from:"bot",text:"👋 Hello! Welcome to our clinic.\n\nSaya boleh bantu dalam Bahasa Malaysia atau English! 😊",time:ts(),sources:[]}]);
  const [botInput, setBotInput] = useState("");
  const [botLoading, setBotLoading] = useState(false);
  const [hoveredSource, setHoveredSource] = useState(null);
  const [highlightedQA, setHighlightedQA] = useState(null);

  const messagesEndRef = useRef(null);
  const botEndRef = useRef(null);
  const qaRefs = useRef({});
  const pollRef = useRef(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({behavior:"smooth"}); });
  useEffect(() => { botEndRef.current?.scrollIntoView({behavior:"smooth"}); }, [botConvo]);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/conversations`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setContacts(data);
      setBackendStatus("online");
      setLastRefresh(new Date());
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
      setSystemPrompt(data.systemPrompt || SYSTEM_PROMPT);
    } catch {}
  }, []);

  useEffect(() => {
    fetchConversations();
    fetchKnowledge();
    pollRef.current = setInterval(fetchConversations, 5000);
    return () => clearInterval(pollRef.current);
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
    } catch { alert("Failed to send"); }
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
    try { await fetch(`${API}/api/knowledge/qa/${id}`, {method:"DELETE"}); fetchKnowledge(); } catch {}
  }

  async function saveSystemPrompt() {
    try {
      await fetch(`${API}/api/knowledge/prompt`, {
        method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify({prompt:systemPrompt}),
      });
      alert("Saved! ✅");
    } catch { alert("Failed to save"); }
  }

  function buildSystemPrompt() {
    const qa = qaData.map(q=>`[${q.id}] Q: ${q.question}\nA: ${q.answer}`).join("\n\n");
    return systemPrompt.replace("{QA_DATA}", qa);
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
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,system:buildSystemPrompt(),messages:history}),
      });
      const data = await res.json();
      const raw = data.content?.[0]?.text || "";
      const {text,sources} = parseBotResponse(raw);
      setBotConvo(p=>[...p,{from:"bot",text,time:ts(),sources}]);
    } catch { setBotConvo(p=>[...p,{from:"bot",text:"⚠️ Error.",time:ts(),sources:[]}]); }
    setBotLoading(false);
  }

  function highlightQA(qaId) {
    setHighlightedQA(qaId); setTab("kb");
    setTimeout(()=>{ qaRefs.current[qaId]?.scrollIntoView({behavior:"smooth",block:"center"}); },100);
    setTimeout(()=>setHighlightedQA(null),3000);
  }

  const filtered = contacts.filter(c =>
    (filter==="all"||c.status===filter) &&
    (c.name?.toLowerCase().includes(search.toLowerCase())||c.phone?.includes(search))
  );
  const totalUnread = contacts.reduce((s,c)=>s+c.unread,0);
  const totalOpen = contacts.filter(c=>c.status==="open").length;
  const totalResolved = contacts.filter(c=>c.status==="resolved").length;
  const botActiveCount = contacts.filter(c=>c.botActive).length;

  const T = dark ? {
    bg:"#0b141a", sidebar:"#111b21", nav:"#202c33", border:"#2a3942",
    card:"#182229", card2:"#2a3942", input:"#2a3942", inputBorder:"#3b4a54",
    text:"#e9edef", textMuted:"#8696a0", textFaint:"#667781",
    msgOut:"#005c4b", msgIn:"#182229", msgOutText:"#e9edef", msgInText:"#e9edef",
    chatBg:"#0b141a", sidebarHover:"#2a3942", selectedBg:"#2a3942",
  } : {
    bg:"#f0f2f5", sidebar:"#ffffff", nav:"#ffffff", border:"#e9edef",
    card:"#ffffff", card2:"#f0f2f5", input:"#f0f2f5", inputBorder:"#e9edef",
    text:"#111b21", textMuted:"#667781", textFaint:"#8696a0",
    msgOut:"#d9fdd3", msgIn:"#ffffff", msgOutText:"#111b21", msgInText:"#111b21",
    chatBg:WA_BG, sidebarHover:"#f5f6f6", selectedBg:"#f0f2f5",
  };

  function SourceBadge({s}) {
    const qa = qaData.find(q=>q.id===s.id);
    if (!qa) return null;
    const color = s.relevance==="high"?WA_GREEN:s.relevance==="medium"?"#FFA726":"#8696a0";
    return (
      <div onMouseEnter={()=>setHoveredSource(s.id)} onMouseLeave={()=>setHoveredSource(null)}
        onClick={()=>highlightQA(s.id)}
        style={{position:"relative",display:"inline-flex",alignItems:"center",gap:4,background:dark?"#1a2e23":"#dcfce7",
          border:`1px solid ${color}40`,borderRadius:12,padding:"2px 8px",cursor:"pointer",marginRight:4,marginTop:4}}>
        <span style={{width:6,height:6,borderRadius:"50%",background:color,display:"inline-block"}}/>
        <span style={{fontSize:10,color,fontWeight:600}}>{qa.question.slice(0,28)}{qa.question.length>28?"…":""}</span>
        {hoveredSource===s.id&&(
          <div style={{position:"absolute",bottom:"calc(100% + 6px)",left:0,zIndex:99,background:T.card,
            border:`1px solid ${T.border}`,borderRadius:10,padding:10,width:260,
            boxShadow:"0 4px 20px rgba(0,0,0,.15)"}}>
            <div style={{fontSize:11,color:WA_GREEN,fontWeight:700,marginBottom:4}}>📌 {qa.question}</div>
            <div style={{fontSize:11,color:T.textMuted,lineHeight:1.5}}>{qa.answer}</div>
            <div style={{fontSize:10,color:T.textFaint,marginTop:6,paddingTop:5,borderTop:`1px solid ${T.border}`}}>Click to view in Knowledge Base →</div>
          </div>
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
        .stat-card{transition:transform .2s,box-shadow .2s}.stat-card:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.1)}
        .tab-btn{transition:all .15s;cursor:pointer;border:none;background:transparent;font-family:inherit}
        .send-btn{transition:transform .1s}.send-btn:active{transform:scale(.92)}
        .qa-row{transition:all .3s}.qa-row.hl{background:#dcfce7!important;border-color:${WA_GREEN}!important}
        input::placeholder,textarea::placeholder{color:${T.textFaint}}
      `}</style>

      {/* ── TOP NAV ── */}
      <div style={{height:56,background:T.nav,borderBottom:`1px solid ${T.border}`,
        display:"flex",alignItems:"center",padding:"0 16px",gap:8,flexShrink:0,
        boxShadow:"0 1px 3px rgba(0,0,0,.08)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginRight:16}}>
          <div style={{width:36,height:36,borderRadius:10,background:`linear-gradient(135deg,${WA_GREEN},${WA_DARK})`,
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,boxShadow:`0 2px 8px ${WA_GREEN}40`}}>🏥</div>
          <div>
            <div style={{fontWeight:700,fontSize:14,letterSpacing:"-.3px"}}>Clinic CRM</div>
            <div style={{fontSize:10,color:T.textMuted}}>WhatsApp Business Dashboard</div>
          </div>
        </div>

        {/* Tabs */}
        {[
          {id:"crm",icon:"💬",label:"Inbox",badge:totalUnread},
          {id:"bot",icon:"🤖",label:"Test Bot"},
          {id:"kb",icon:"📋",label:`Knowledge (${qaData.length})`},
        ].map(t=>(
          <button key={t.id} className="tab-btn" onClick={()=>setTab(t.id)}
            style={{display:"flex",alignItems:"center",gap:6,padding:"6px 14px",borderRadius:20,
              background:tab===t.id?`${WA_GREEN}15`:"transparent",
              color:tab===t.id?WA_GREEN:T.textMuted,fontWeight:tab===t.id?700:500,fontSize:13}}>
            <span>{t.icon}</span><span>{t.label}</span>
            {t.badge>0&&<span style={{background:WA_GREEN,color:"#fff",borderRadius:10,
              padding:"1px 6px",fontSize:10,fontWeight:700,marginLeft:2}}>{t.badge}</span>}
          </button>
        ))}

        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:12}}>
          <div style={{display:"flex",alignItems:"center",gap:6,fontSize:11}}>
            <div style={{width:8,height:8,borderRadius:"50%",
              background:backendStatus==="online"?WA_GREEN:backendStatus==="offline"?"#ef4444":"#FFA726",
              boxShadow:backendStatus==="online"?`0 0 6px ${WA_GREEN}`:""}}/>
            <span style={{color:T.textMuted,fontWeight:500}}>
              {backendStatus==="online"?"Live":backendStatus==="offline"?"Offline":"Connecting"}
            </span>
          </div>
          <button onClick={()=>setDark(d=>!d)}
            style={{padding:"5px 12px",borderRadius:20,border:`1px solid ${T.border}`,
              background:T.card2,color:T.textMuted,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
            {dark?"☀️ Light":"🌙 Dark"}
          </button>
        </div>
      </div>

      <div style={{flex:1,display:"flex",overflow:"hidden"}}>

        {/* ══════════ CRM TAB ══════════ */}
        {tab==="crm"&&<>
          {/* Sidebar */}
          <div style={{width:300,background:T.sidebar,borderRight:`1px solid ${T.border}`,display:"flex",flexDirection:"column"}}>

            {/* Stats Row */}
            <div style={{padding:"12px 12px 8px",borderBottom:`1px solid ${T.border}`}}>
              <div style={{display:"flex",gap:6,marginBottom:10}}>
                {[
                  {label:"Total",value:contacts.length,color:"#667781"},
                  {label:"Active",value:totalOpen,color:WA_GREEN},
                  {label:"Resolved",value:totalResolved,color:"#34B7F1"},
                  {label:"Bot On",value:botActiveCount,color:"#FFA726"},
                ].map(s=>(
                  <div key={s.label} className="stat-card"
                    style={{flex:1,background:T.card2,borderRadius:10,padding:"6px 4px",textAlign:"center",
                      border:`1px solid ${T.border}`}}>
                    <div style={{fontSize:15,fontWeight:700,color:s.color}}>{s.value}</div>
                    <div style={{fontSize:9,color:T.textFaint,marginTop:1}}>{s.label}</div>
                  </div>
                ))}
              </div>
              <div style={{position:"relative",marginBottom:8}}>
                <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",
                  fontSize:13,color:T.textFaint}}>🔍</span>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search conversations..."
                  style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,
                    borderRadius:20,padding:"7px 12px 7px 32px",color:T.text,fontSize:12}}/>
              </div>
              <div style={{display:"flex",gap:4}}>
                {["all","open","resolved"].map(f=>(
                  <button key={f} onClick={()=>setFilter(f)}
                    style={{flex:1,padding:"5px 0",borderRadius:16,border:"none",cursor:"pointer",
                      background:filter===f?WA_GREEN:T.input,
                      color:filter===f?"#fff":T.textMuted,fontSize:11,fontWeight:600,
                      textTransform:"capitalize",fontFamily:"inherit"}}>
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {/* Contact List */}
            <div style={{flex:1,overflowY:"auto"}}>
              {loading&&<div style={{padding:20,textAlign:"center",color:T.textFaint,fontSize:12}}>Loading...</div>}
              {!loading&&filtered.length===0&&(
                <div style={{padding:24,textAlign:"center",color:T.textFaint,fontSize:12}}>
                  <div style={{fontSize:32,marginBottom:8}}>💬</div>
                  {backendStatus==="offline"?"⚠️ Backend offline":"No conversations yet"}
                </div>
              )}
              {filtered.map(c=>(
                <div key={c.id} className={`contact-item ${selected?.id===c.id?"active":""}`}
                  onClick={()=>selectContact(c)}
                  style={{padding:"10px 14px",display:"flex",alignItems:"center",gap:10,
                    borderBottom:`1px solid ${T.border}40`}}>
                  {/* Avatar */}
                  <div style={{position:"relative",flexShrink:0}}>
                    <div style={{width:44,height:44,borderRadius:"50%",background:getColor(c.name||"?"),
                      display:"flex",alignItems:"center",justifyContent:"center",
                      fontWeight:700,fontSize:14,color:"#fff",letterSpacing:"-.5px"}}>
                      {c.avatar||"?"}
                    </div>
                    {c.status==="open"&&<div style={{position:"absolute",bottom:1,right:1,width:10,height:10,
                      borderRadius:"50%",background:WA_GREEN,border:`2px solid ${T.sidebar}`}}/>}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
                      <span style={{fontWeight:600,fontSize:13,color:T.text}}>{c.name}</span>
                      <span style={{fontSize:10,color:T.textFaint}}>{c.lastTime}</span>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontSize:12,color:T.textMuted,overflow:"hidden",
                        textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:160}}>
                        {c.botActive&&<span style={{color:WA_GREEN,marginRight:3}}>🤖</span>}
                        {c.lastMessage||"No messages yet"}
                      </span>
                      {c.unread>0&&<span style={{background:WA_GREEN,color:"#fff",borderRadius:10,
                        padding:"1px 6px",fontSize:10,fontWeight:700,flexShrink:0}}>{c.unread}</span>}
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
                display:"flex",alignItems:"center",justifyContent:"space-between",
                boxShadow:"0 1px 3px rgba(0,0,0,.06)"}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:38,height:38,borderRadius:"50%",background:getColor(selected.name||"?"),
                    display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:13,color:"#fff"}}>
                    {selected.avatar}
                  </div>
                  <div>
                    <div style={{fontWeight:600,fontSize:14}}>{selected.name}</div>
                    <div style={{fontSize:11,color:selected.status==="open"?WA_GREEN:T.textFaint}}>
                      {selected.status==="open"?"● Active":"○ Resolved"} · {selected.phone}
                    </div>
                  </div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>toggleBot(selected.id)}
                    style={{display:"flex",alignItems:"center",gap:5,padding:"6px 12px",borderRadius:20,border:"none",
                      background:selected.botActive?`${WA_GREEN}20`:`${T.card2}`,
                      color:selected.botActive?WA_GREEN:T.textMuted,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                    🤖 {selected.botActive?"Bot ON":"Bot OFF"}
                  </button>
                  <button onClick={()=>toggleStatus(selected.id)}
                    style={{padding:"6px 12px",borderRadius:20,border:`1px solid ${T.border}`,
                      background:T.card2,color:T.textMuted,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                    {selected.status==="open"?"✓ Resolve":"↺ Reopen"}
                  </button>
                </div>
              </div>

              {selected.botActive&&(
                <div style={{background:`${WA_GREEN}15`,borderBottom:`1px solid ${WA_GREEN}30`,
                  padding:"6px 16px",fontSize:11,color:WA_DARK,display:"flex",alignItems:"center",gap:6}}>
                  <span>🤖</span> Bot is handling this conversation — toggle off to reply manually
                </div>
              )}

              {/* Messages */}
              <div style={{flex:1,overflowY:"auto",padding:"16px",background:T.chatBg,
                backgroundImage:dark?"none":"url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23d0d0d0' fill-opacity='0.15'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
                display:"flex",flexDirection:"column",gap:6}}>
                {selected.messages?.map((msg,i)=>{
                  const isOut = msg.from!=="user";
                  return (
                    <div key={msg.id||i} className="msg-bubble"
                      style={{display:"flex",justifyContent:isOut?"flex-end":"flex-start",alignItems:"flex-end",gap:6}}>
                      {!isOut&&(
                        <div style={{width:28,height:28,borderRadius:"50%",background:getColor(selected.name||"?"),
                          flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",
                          fontSize:10,fontWeight:700,color:"#fff",marginBottom:2}}>
                          {selected.avatar}
                        </div>
                      )}
                      <div style={{maxWidth:"65%"}}>
                        {!isOut&&<div style={{fontSize:11,color:WA_GREEN,fontWeight:600,marginBottom:2,marginLeft:4}}>{selected.name}</div>}
                        <div style={{background:isOut?T.msgOut:T.msgIn,color:isOut?T.msgOutText:T.msgInText,
                          borderRadius:isOut?"16px 4px 16px 16px":"4px 16px 16px 16px",
                          padding:"8px 12px",boxShadow:"0 1px 2px rgba(0,0,0,.12)"}}>
                          {isOut&&<div style={{fontSize:10,color:msg.from==="bot"?WA_GREEN:"#34B7F1",
                            fontWeight:700,marginBottom:3}}>{msg.from==="bot"?"🤖 Bot":"👤 You"}</div>}
                          <div style={{fontSize:13,lineHeight:1.5,whiteSpace:"pre-wrap"}}>{msg.text}</div>
                          <div style={{fontSize:10,color:isOut?(dark?"#8696a0":"#667781"):T.textFaint,
                            textAlign:"right",marginTop:3}}>{msg.time}</div>
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

              {/* Input */}
              <div style={{padding:"10px 12px",background:T.nav,borderTop:`1px solid ${T.border}`,
                display:"flex",gap:8,alignItems:"flex-end"}}>
                <textarea value={reply} onChange={e=>setReply(e.target.value)}
                  onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendAgentReply();}}}
                  placeholder={selected.botActive?"Bot is active — toggle off to reply manually":"Type a message..."}
                  disabled={selected.botActive} rows={1}
                  style={{flex:1,background:T.input,border:`1px solid ${T.inputBorder}`,
                    borderRadius:20,padding:"9px 16px",color:selected.botActive?T.textFaint:T.text,
                    fontSize:13,maxHeight:100,overflowY:"auto"}}/>
                <button className="send-btn" onClick={sendAgentReply} disabled={selected.botActive||!reply.trim()}
                  style={{width:40,height:40,borderRadius:"50%",border:"none",
                    background:selected.botActive||!reply.trim()?T.card2:WA_GREEN,
                    color:selected.botActive||!reply.trim()?T.textFaint:"#fff",
                    fontSize:16,cursor:selected.botActive?"not-allowed":"pointer",flexShrink:0}}>➤</button>
              </div>
            </div>
          ):(
            <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",
              flexDirection:"column",gap:12,background:T.chatBg}}>
              <div style={{width:80,height:80,borderRadius:"50%",background:`${WA_GREEN}15`,
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:36}}>💬</div>
              <div style={{fontSize:16,fontWeight:600,color:T.text}}>
                {backendStatus==="online"&&contacts.length===0?"No messages yet":"Select a conversation"}
              </div>
              <div style={{fontSize:13,color:T.textFaint,textAlign:"center",maxWidth:280}}>
                {backendStatus==="online"&&contacts.length===0
                  ?"Send a WhatsApp message to your bot number to get started!"
                  :"Choose a conversation from the sidebar to start chatting"}
              </div>
              {backendStatus==="offline"&&(
                <div style={{fontSize:12,color:"#ef4444",background:"#fef2f2",padding:"8px 16px",
                  borderRadius:20,border:"1px solid #fee2e2"}}>⚠️ Cannot connect to backend</div>
              )}
            </div>
          )}
        </>}

        {/* ══════════ BOT TEST TAB ══════════ */}
        {tab==="bot"&&(
          <div style={{flex:1,display:"flex",flexDirection:"column",maxWidth:700,margin:"0 auto",width:"100%"}}>
            <div style={{padding:"12px 16px",background:T.nav,borderBottom:`1px solid ${T.border}`,
              display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:38,height:38,borderRadius:"50%",
                  background:`linear-gradient(135deg,${WA_GREEN},${WA_DARK})`,
                  display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🤖</div>
                <div>
                  <div style={{fontWeight:700,fontSize:14}}>Bot Preview</div>
                  <div style={{fontSize:11,color:T.textMuted}}>Test your bot with live Knowledge Base</div>
                </div>
              </div>
              <button onClick={()=>setBotConvo([{from:"bot",text:"👋 Hello! How can I help?\nSaya boleh bantu dalam Bahasa Malaysia atau English! 😊",time:ts(),sources:[]}])}
                style={{padding:"6px 14px",borderRadius:20,border:`1px solid ${T.border}`,
                  background:T.card2,color:T.textMuted,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                ↺ Reset
              </button>
            </div>

            <div style={{flex:1,overflowY:"auto",padding:16,background:T.chatBg,display:"flex",flexDirection:"column",gap:8}}>
              {botConvo.map((msg,i)=>(
                <div key={i} className="msg-bubble"
                  style={{display:"flex",justifyContent:msg.from==="user"?"flex-end":"flex-start"}}>
                  <div style={{maxWidth:"70%"}}>
                    <div style={{background:msg.from==="user"?T.msgOut:T.msgIn,
                      borderRadius:msg.from==="user"?"16px 4px 16px 16px":"4px 16px 16px 16px",
                      padding:"9px 13px",boxShadow:"0 1px 2px rgba(0,0,0,.1)"}}>
                      <div style={{fontSize:10,color:msg.from==="user"?"#34B7F1":WA_GREEN,
                        fontWeight:700,marginBottom:3}}>{msg.from==="user"?"👤 You":"🤖 Clinic Bot"}</div>
                      <div style={{fontSize:13,lineHeight:1.6,whiteSpace:"pre-wrap",color:T.text}}>{msg.text}</div>
                      <div style={{fontSize:10,color:T.textFaint,textAlign:"right",marginTop:3}}>{msg.time}</div>
                    </div>
                    {msg.sources?.length>0&&<div style={{marginTop:4}}>{msg.sources.map(s=><SourceBadge key={s.id} s={s}/>)}</div>}
                  </div>
                </div>
              ))}
              {botLoading&&(
                <div style={{display:"flex"}}>
                  <div style={{background:T.msgIn,borderRadius:"4px 16px 16px 16px",padding:"12px 16px",
                    boxShadow:"0 1px 2px rgba(0,0,0,.1)",display:"flex",gap:5,alignItems:"center"}}>
                    {[0,1,2].map(i=>(
                      <div key={i} style={{width:8,height:8,borderRadius:"50%",background:WA_GREEN,
                        animation:`bounce 1s ${i*.15}s infinite`}}/>
                    ))}
                  </div>
                </div>
              )}
              <style>{`@keyframes bounce{0%,80%,100%{transform:scale(0)}40%{transform:scale(1)}}`}</style>
              <div ref={botEndRef}/>
            </div>

            <div style={{padding:"8px 12px",background:T.nav,borderTop:`1px solid ${T.border}`,
              display:"flex",gap:6,flexWrap:"wrap"}}>
              {["Where are you located?","How much is consultation?","I'm from Melaka","Skin whitening price?","Book appointment"].map(q=>(
                <button key={q} onClick={()=>setBotInput(q)}
                  style={{background:T.card2,border:`1px solid ${T.border}`,borderRadius:16,
                    padding:"4px 12px",color:T.textMuted,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>
                  {q}
                </button>
              ))}
            </div>

            <div style={{padding:"10px 12px",background:T.nav,display:"flex",gap:8,alignItems:"flex-end"}}>
              <textarea value={botInput} onChange={e=>setBotInput(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendBotMessage();}}}
                placeholder="Type a test message..." rows={1}
                style={{flex:1,background:T.input,border:`1px solid ${T.inputBorder}`,
                  borderRadius:20,padding:"9px 16px",color:T.text,fontSize:13}}/>
              <button className="send-btn" onClick={sendBotMessage} disabled={botLoading||!botInput.trim()}
                style={{width:40,height:40,borderRadius:"50%",border:"none",
                  background:botLoading||!botInput.trim()?T.card2:WA_GREEN,
                  color:botLoading||!botInput.trim()?T.textFaint:"#fff",fontSize:16,cursor:"pointer",flexShrink:0}}>➤</button>
            </div>
          </div>
        )}

        {/* ══════════ KNOWLEDGE BASE TAB ══════════ */}
        {tab==="kb"&&(
          <div style={{flex:1,overflowY:"auto",padding:20,background:T.bg}}>
            <div style={{maxWidth:800,margin:"0 auto"}}>

              {/* Header */}
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
                <div>
                  <div style={{fontWeight:700,fontSize:18,letterSpacing:"-.5px"}}>📋 Knowledge Base</div>
                  <div style={{fontSize:12,color:T.textMuted,marginTop:2}}>{qaData.length} Q&A pairs · Changes auto-save to Excel</div>
                </div>
                <div style={{display:"flex",gap:6,alignItems:"center"}}>
                  <div style={{background:`${WA_GREEN}15`,border:`1px solid ${WA_GREEN}30`,
                    borderRadius:20,padding:"5px 12px",fontSize:12,color:WA_GREEN,fontWeight:600}}>
                    💾 Auto-saves to Excel
                  </div>
                </div>
              </div>

              {/* System Prompt */}
              <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:16,
                padding:18,marginBottom:20,boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                  <div style={{width:32,height:32,borderRadius:8,background:`${WA_GREEN}15`,
                    display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>⚙️</div>
                  <div>
                    <div style={{fontWeight:700,fontSize:13}}>System Prompt</div>
                    <div style={{fontSize:11,color:T.textMuted}}>Bot personality & rules</div>
                  </div>
                </div>
                <textarea value={systemPrompt} onChange={e=>setSystemPrompt(e.target.value)} rows={8}
                  style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,
                    borderRadius:10,padding:"10px 14px",color:T.text,fontSize:12,
                    fontFamily:"'Courier New',monospace",lineHeight:1.7,marginBottom:10}}/>
                <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                  <button onClick={()=>setSystemPrompt(SYSTEM_PROMPT)}
                    style={{padding:"7px 16px",borderRadius:20,border:`1px solid ${T.border}`,
                      background:T.card2,color:T.textMuted,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                    ↺ Reset
                  </button>
                  <button onClick={saveSystemPrompt}
                    style={{padding:"7px 16px",borderRadius:20,border:"none",
                      background:WA_GREEN,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                    💾 Save Prompt
                  </button>
                </div>
              </div>

              {/* Add New Q&A */}
              <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:16,
                padding:18,marginBottom:20,boxShadow:"0 1px 4px rgba(0,0,0,.06)"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                  <div style={{width:32,height:32,borderRadius:8,background:"#34B7F115",
                    display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>➕</div>
                  <div style={{fontWeight:700,fontSize:13}}>Add New Q&A</div>
                </div>
                <input value={newQ} onChange={e=>setNewQ(e.target.value)} placeholder="Question..."
                  style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,
                    borderRadius:10,padding:"9px 14px",color:T.text,fontSize:13,marginBottom:8}}/>
                <textarea value={newA} onChange={e=>setNewA(e.target.value)} placeholder="Answer..." rows={2}
                  style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,
                    borderRadius:10,padding:"9px 14px",color:T.text,fontSize:13,marginBottom:10}}/>
                <button onClick={addQA}
                  style={{padding:"8px 20px",borderRadius:20,border:"none",
                    background:WA_GREEN,color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                  ➕ Add to Knowledge Base
                </button>
              </div>

              {/* Q&A List */}
              {qaData.length===0&&(
                <div style={{textAlign:"center",padding:40,color:T.textFaint,fontSize:13}}>
                  <div style={{fontSize:40,marginBottom:12}}>📭</div>
                  No Q&A pairs yet. Add some above!
                </div>
              )}
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {qaData.map((qa,i)=>(
                  <div key={qa.id} ref={el=>qaRefs.current[qa.id]=el}
                    className={`qa-row ${highlightedQA===qa.id?"hl":""}`}
                    style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,
                      padding:16,boxShadow:"0 1px 4px rgba(0,0,0,.05)"}}>
                    {editingId===qa.id?(
                      <div>
                        <div style={{fontSize:11,color:"#34B7F1",fontWeight:700,marginBottom:8}}>✏️ Editing</div>
                        <input value={editQ} onChange={e=>setEditQ(e.target.value)}
                          style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,
                            borderRadius:10,padding:"9px 14px",color:T.text,fontSize:13,marginBottom:8}}/>
                        <textarea value={editA} onChange={e=>setEditA(e.target.value)} rows={3}
                          style={{width:"100%",background:T.input,border:`1px solid ${T.inputBorder}`,
                            borderRadius:10,padding:"9px 14px",color:T.text,fontSize:13,marginBottom:10}}/>
                        <div style={{display:"flex",gap:8}}>
                          <button onClick={()=>saveEdit(qa.id)}
                            style={{padding:"7px 16px",borderRadius:20,border:"none",background:WA_GREEN,
                              color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Save</button>
                          <button onClick={()=>setEditingId(null)}
                            style={{padding:"7px 16px",borderRadius:20,border:`1px solid ${T.border}`,
                              background:T.card2,color:T.textMuted,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
                        </div>
                      </div>
                    ):(
                      <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
                        <div style={{width:28,height:28,borderRadius:8,background:`${WA_GREEN}15`,
                          display:"flex",alignItems:"center",justifyContent:"center",
                          fontSize:11,fontWeight:700,color:WA_GREEN,flexShrink:0}}>
                          {i+1}
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:600,fontSize:13,color:T.text,marginBottom:4}}>
                            {qa.question}
                          </div>
                          <div style={{fontSize:12,color:T.textMuted,lineHeight:1.5}}>{qa.answer}</div>
                        </div>
                        <div style={{display:"flex",gap:6,flexShrink:0}}>
                          <button onClick={()=>{setEditingId(qa.id);setEditQ(qa.question);setEditA(qa.answer);}}
                            style={{padding:"5px 12px",borderRadius:16,border:`1px solid ${WA_GREEN}40`,
                              background:`${WA_GREEN}10`,color:WA_GREEN,fontSize:11,fontWeight:600,
                              cursor:"pointer",fontFamily:"inherit"}}>✏️ Edit</button>
                          <button onClick={()=>deleteQA(qa.id)}
                            style={{padding:"5px 12px",borderRadius:16,border:"1px solid #ef444440",
                              background:"#ef444410",color:"#ef4444",fontSize:11,fontWeight:600,
                              cursor:"pointer",fontFamily:"inherit"}}>✕</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}