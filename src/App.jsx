import { useState, useEffect, useRef } from "react";

const EXCEL_QA = [
  { id: "qa1", question: "Where is the clinic located?", answer: "Our clinic is located in Kuala Lumpur, specifically at Jalan Ampang, KL. We are open 6 days a week!" },
  { id: "qa2", question: "What are your operating hours?", answer: "We are open Monday to Saturday, 9:00 AM – 6:00 PM. Closed on Sundays and public holidays." },
  { id: "qa3", question: "What treatments do you offer?", answer: "We offer facial rejuvenation, skin whitening, anti-aging therapy, hair loss treatment, and body slimming." },
  { id: "qa4", question: "How much does a consultation cost?", answer: "Our initial consultation is FREE! You only pay for treatments recommended by our doctor." },
  { id: "qa5", question: "Do I need to make an appointment?", answer: "Yes, we strongly recommend booking in advance. Walk-ins are welcome but subject to availability." },
  { id: "qa6", question: "Is the doctor qualified?", answer: "Yes! Our doctor is a certified aesthetic physician registered with MMC with over 10 years of experience." },
  { id: "qa7", question: "What is the price for skin whitening?", answer: "Skin whitening starts from RM 350 per session. Packages available for better savings!" },
  { id: "qa8", question: "Is the treatment painful?", answer: "Most treatments are minimally invasive and virtually painless. Your comfort is our priority." },
  { id: "qa9", question: "How many sessions do I need?", answer: "Most patients see results in 3–6 sessions. Our doctor will advise during your free consultation." },
  { id: "qa10", question: "Do you offer payment plans?", answer: "Yes! We offer flexible installment payment options. Ask our staff for details during your visit." },
  { id: "qa11", question: "Can men visit the clinic?", answer: "Absolutely! We welcome both male and female patients for all treatments." },
  { id: "qa12", question: "What is Botox?", answer: "Botox reduces fine lines and wrinkles. Results last 4–6 months. Safe and minimally invasive." },
  { id: "qa13", question: "Do you treat acne scars?", answer: "Yes! We treat acne scars with laser therapy and chemical peels. A consultation is the best first step." },
  { id: "qa14", question: "How do I book an appointment?", answer: "Book via WhatsApp, call us, or visit: https://booking.clinic.com. We confirm your slot within 1 hour!" },
  { id: "qa15", question: "What should I do before my appointment?", answer: "Arrive with a clean face, stay hydrated, and bring medical records if you have existing skin conditions." },
];

const SYSTEM_PROMPT = `You are a friendly clinic assistant chatbot for an aesthetic clinic in Kuala Lumpur, Malaysia.

PRIMARY GOAL: Guide every conversation naturally toward booking a clinic visit appointment.

LANGUAGE: Auto-detect. Reply in Malay if Malay, English if English, Manglish if mixed.

PERSONALITY: Caring, professional, friendly. Never pushy but always gently steering toward booking.

STRICT RULES:
- You are NOT a doctor. Do NOT diagnose.
- Do NOT guarantee treatment outcomes.
- Do NOT recommend stopping medication.
- If unsure: "Our doctor can best answer that during your free consultation!"
- If someone is from another city, acknowledge warmly and invite them to plan a KL visit.

KNOWLEDGE BASE:
{QA_DATA}

IMPORTANT: At the end of your response, on the last line ONLY append:
{"sources":[{"id":"qa1","relevance":"high"}]}
Max 3 sources. If no match: {"sources":[]}

Always end with a soft booking call-to-action when natural.`;

const INIT_CONTACTS = [
  {
    id: "1", name: "Ahmad Rizal", phone: "+60123456789", status: "open",
    lastMessage: "Apa treatment untuk jerawat?", lastTime: "10:42 AM", unread: 2, avatar: "AR", botActive: true,
    messages: [
      { id: 1, from: "user", text: "Assalamualaikum, nak tanya pasal treatment jerawat", time: "10:40 AM" },
      { id: 2, from: "user", text: "Apa treatment untuk jerawat?", time: "10:42 AM" },
    ],
  },
  {
    id: "2", name: "Priya Sharma", phone: "+60198765432", status: "open",
    lastMessage: "I'm from Melaka, can I still visit?", lastTime: "9:15 AM", unread: 1, avatar: "PS", botActive: true,
    messages: [{ id: 1, from: "user", text: "Hi! I'm from Melaka. Can I still come to your clinic?", time: "9:15 AM" }],
  },
  {
    id: "3", name: "Lim Wei Jian", phone: "+60112233445", status: "resolved",
    lastMessage: "Thank you! Will book soon.", lastTime: "Yesterday", unread: 0, avatar: "LW", botActive: false,
    messages: [
      { id: 1, from: "user", text: "How much is skin whitening?", time: "Yesterday 2:00 PM" },
      { id: 2, from: "bot", text: "Skin whitening starts from RM 350 per session 🌟 Book a FREE consultation: https://booking.clinic.com", time: "Yesterday 2:01 PM", sources: [{ id: "qa7", relevance: "high" }] },
      { id: 3, from: "user", text: "Thank you! Will book soon.", time: "Yesterday 2:03 PM" },
    ],
  },
  {
    id: "4", name: "Siti Nurhaliza", phone: "+60165432198", status: "open",
    lastMessage: "What time do you open?", lastTime: "8:30 AM", unread: 1, avatar: "SN", botActive: true,
    messages: [{ id: 1, from: "user", text: "Hello, what time do you open?", time: "8:30 AM" }],
  },
];

const COLORS = ["#25D366","#128C7E","#34B7F1","#FF6B6B","#FFA726","#AB47BC","#42A5F5","#26A69A"];
const getColor = n => { let h=0; for(let c of n) h=c.charCodeAt(0)+((h<<5)-h); return COLORS[Math.abs(h)%COLORS.length]; };
const ts = () => new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
const RELEVANCE_COLOR = { high:"#25D366", medium:"#FFA726", low:"#7a8499" };
const RELEVANCE_BG_DARK = { high:"#1a3c23", medium:"#2e2010", low:"#1a2235" };
const RELEVANCE_BG_LIGHT = { high:"#dcfce7", medium:"#fef3c7", low:"#f1f5f9" };

// ── THEME DEFINITIONS ──────────────────────────────────────────────────────
const DARK = {
  bg: "#0a0f1a", nav: "#0d1424", sidebar: "#0d1424", border: "#1a2235",
  card: "#111827", card2: "#141b2d", input: "#141b2d", inputBorder: "#1f2937",
  text: "#e8eaf0", textMuted: "#7a8499", textFaint: "#4a5568",
  msgUser: "#141b2d", msgBot: "linear-gradient(135deg,#1a3c23,#1e4529)",
  msgAgent: "linear-gradient(135deg,#1e3a5f,#1a2e4a)",
  msgUserBorder: "#1a2235", msgBotBorder: "#25D36625", msgAgentBorder: "#34B7F125",
  botNotice: "#1a2e1e", botNoticeBorder: "#25D36620", botNoticeText: "#25D366",
  filterActive: "#25D366", filterActiveTxt: "#0a0f1a", filterInactive: "#141b2d", filterInactiveTxt: "#7a8499",
  qaCard: "#111827", qaCardBorder: "#1f2937", qaHighlight: "#1a3c23", qaHighlightBorder: "#25D366",
  sysPromptBg: "#070d1a", sysPromptBorder: "#1a2235", sysPromptText: "#c8d6c0",
  relevanceBg: RELEVANCE_BG_DARK,
  scrollbar: "#2a3447",
};

const LIGHT = {
  bg: "#f0f4f8", nav: "#ffffff", sidebar: "#ffffff", border: "#e2e8f0",
  card: "#ffffff", card2: "#f8fafc", input: "#f1f5f9", inputBorder: "#cbd5e1",
  text: "#1a202c", textMuted: "#4a5568", textFaint: "#94a3b8",
  msgUser: "#f1f5f9", msgBot: "linear-gradient(135deg,#dcfce7,#bbf7d0)",
  msgAgent: "linear-gradient(135deg,#dbeafe,#bfdbfe)",
  msgUserBorder: "#e2e8f0", msgBotBorder: "#25D36640", msgAgentBorder: "#34B7F140",
  botNotice: "#dcfce7", botNoticeBorder: "#25D36640", botNoticeText: "#15803d",
  filterActive: "#25D366", filterActiveTxt: "#ffffff", filterInactive: "#f1f5f9", filterInactiveTxt: "#4a5568",
  qaCard: "#ffffff", qaCardBorder: "#e2e8f0", qaHighlight: "#dcfce7", qaHighlightBorder: "#25D366",
  sysPromptBg: "#f8fafc", sysPromptBorder: "#e2e8f0", sysPromptText: "#334155",
  relevanceBg: RELEVANCE_BG_LIGHT,
  scrollbar: "#cbd5e1",
};

export default function App() {
  const [dark, setDark] = useState(true);
  const T = dark ? DARK : LIGHT;

  const [contacts, setContacts] = useState(INIT_CONTACTS);
  const [selected, setSelected] = useState(null);
  const [reply, setReply] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("crm");
  const [qaData, setQaData] = useState(EXCEL_QA);
  const [editingId, setEditingId] = useState(null);
  const [editQ, setEditQ] = useState(""); const [editA, setEditA] = useState("");
  const [newQ, setNewQ] = useState(""); const [newA, setNewA] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(SYSTEM_PROMPT);
  const [botConvo, setBotConvo] = useState([{ from:"bot", text:"👋 Hello! Welcome to our clinic.\n\nSaya boleh bantu dalam Bahasa Malaysia atau English! 😊", time:ts(), sources:[] }]);
  const [botInput, setBotInput] = useState("");
  const [botLoading, setBotLoading] = useState(false);
  const [hoveredSource, setHoveredSource] = useState(null);
  const [highlightedQA, setHighlightedQA] = useState(null);
  const messagesEndRef = useRef(null);
  const botEndRef = useRef(null);
  const qaRefs = useRef({});

  useEffect(() => { messagesEndRef.current?.scrollIntoView({behavior:"smooth"}); }, [selected?.messages]);
  useEffect(() => { botEndRef.current?.scrollIntoView({behavior:"smooth"}); }, [botConvo]);

  const filtered = contacts.filter(c =>
    (filter==="all"||c.status===filter) &&
    (c.name.toLowerCase().includes(search.toLowerCase())||c.phone.includes(search))
  );

  function selectContact(c) {
    setContacts(p=>p.map(x=>x.id===c.id?{...x,unread:0}:x));
    setSelected({...c,unread:0});
  }

  function sendAgentReply() {
    if (!reply.trim()||!selected) return;
    const msg={id:Date.now(),from:"agent",text:reply.trim(),time:ts(),sources:[]};
    setContacts(p=>p.map(c=>c.id===selected.id?{...c,messages:[...c.messages,msg],lastMessage:reply.trim(),lastTime:"Now"}:c));
    setSelected(p=>({...p,messages:[...p.messages,msg]}));
    setReply("");
  }

  function toggleStatus(id) {
    setContacts(p=>p.map(c=>c.id===id?{...c,status:c.status==="open"?"resolved":"open"}:c));
    setSelected(p=>({...p,status:p.status==="open"?"resolved":"open"}));
  }

  function toggleBot(id) {
    setContacts(p=>p.map(c=>c.id===id?{...c,botActive:!c.botActive}:c));
    setSelected(p=>({...p,botActive:!p.botActive}));
  }

  function buildSystemPrompt() {
    const qaText = qaData.map(q=>`[${q.id}] Q: ${q.question}\nA: ${q.answer}`).join("\n\n");
    return systemPrompt.replace("{QA_DATA}", qaText);
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

  async function callClaude(messages) {
    const res = await fetch("https://api.anthropic.com/v1/messages",{
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:1000, system:buildSystemPrompt(), messages }),
    });
    const data = await res.json();
    return data.content?.[0]?.text||"";
  }

  async function sendBotMessage() {
    if(!botInput.trim()||botLoading) return;
    const userMsg={from:"user",text:botInput.trim(),time:ts(),sources:[]};
    setBotConvo(p=>[...p,userMsg]); setBotInput(""); setBotLoading(true);
    try {
      const history=[...botConvo,userMsg].map(m=>({
        role:m.from==="user"?"user":"assistant",
        content:m.from==="user"?m.text:m.text+(m.sources?.length?`\n${JSON.stringify({sources:m.sources})}`:`\n{"sources":[]}`),
      }));
      const raw=await callClaude(history);
      const {text,sources}=parseBotResponse(raw);
      setBotConvo(p=>[...p,{from:"bot",text,time:ts(),sources}]);
    } catch {
      setBotConvo(p=>[...p,{from:"bot",text:"⚠️ Error connecting to AI.",time:ts(),sources:[]}]);
    }
    setBotLoading(false);
  }

  function highlightQA(qaId) {
    setHighlightedQA(qaId); setTab("kb");
    setTimeout(()=>{ qaRefs.current[qaId]?.scrollIntoView({behavior:"smooth",block:"center"}); },100);
    setTimeout(()=>setHighlightedQA(null),3000);
  }

  function startEdit(qa) { setEditingId(qa.id); setEditQ(qa.question); setEditA(qa.answer); }
  function saveEdit(id) { setQaData(p=>p.map(q=>q.id===id?{...q,question:editQ,answer:editA}:q)); setEditingId(null); }
  function addQA() {
    if(!newQ.trim()||!newA.trim()) return;
    setQaData(p=>[...p,{id:"qa"+Date.now(),question:newQ.trim(),answer:newA.trim()}]);
    setNewQ(""); setNewA("");
  }

  // ── Source Badges ──────────────────────────────────────────────────────────
  function SourceBadges({sources, onJump}) {
    if(!sources?.length) return null;
    return (
      <div style={{marginTop:6,display:"flex",flexWrap:"wrap",gap:5,alignItems:"center"}}>
        <span style={{fontSize:10,color:T.textFaint}}>📎 Source:</span>
        {sources.map(s=>{
          const qa=qaData.find(q=>q.id===s.id); if(!qa) return null;
          return (
            <div key={s.id} onMouseEnter={()=>setHoveredSource(s.id)} onMouseLeave={()=>setHoveredSource(null)} onClick={()=>onJump&&onJump(s.id)}
              style={{position:"relative",background:T.relevanceBg[s.relevance]||T.card2,border:`1px solid ${RELEVANCE_COLOR[s.relevance]||T.border}40`,borderRadius:6,padding:"3px 8px",cursor:"pointer",transition:"all .15s",transform:hoveredSource===s.id?"scale(1.03)":"scale(1)"}}>
              <span style={{fontSize:10,color:RELEVANCE_COLOR[s.relevance]||T.textMuted,fontWeight:600}}>
                {s.relevance==="high"?"🟢":s.relevance==="medium"?"🟡":"⚪"} {qa.question.length>32?qa.question.slice(0,32)+"…":qa.question}
              </span>
              {hoveredSource===s.id&&(
                <div style={{position:"absolute",bottom:"calc(100% + 6px)",left:0,zIndex:99,background:T.card,border:`1px solid ${T.border}`,borderRadius:8,padding:10,width:260,boxShadow:"0 8px 24px rgba(0,0,0,.2)"}}>
                  <div style={{fontSize:11,color:"#25D366",fontWeight:700,marginBottom:4}}>📌 {qa.question}</div>
                  <div style={{fontSize:11,color:T.textMuted,lineHeight:1.5}}>{qa.answer}</div>
                  <div style={{fontSize:10,color:T.textFaint,marginTop:6,borderTop:`1px solid ${T.border}`,paddingTop:5}}>Click to view & edit →</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ── Shared styles ──────────────────────────────────────────────────────────
  const inp = {background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:8,padding:"8px 12px",color:T.text,fontSize:13,width:"100%",fontFamily:"inherit"};
  const btn = (bg="#25D366",c="#fff") => ({padding:"7px 14px",borderRadius:8,border:"none",background:bg,color:c,fontSize:12,fontWeight:700,cursor:"pointer"});

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:T.bg,fontFamily:"'Segoe UI',system-ui,sans-serif",color:T.text,overflow:"hidden",transition:"all .3s"}}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:${T.scrollbar};border-radius:4px}
        .ci:hover{background:${T.card2}!important}.ci.on{background:${T.card2}!important;border-left:3px solid #25D366!important}
        textarea:focus,input:focus{outline:none}textarea{resize:none}
        .pulse{animation:pulse 2s infinite}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        .fadeup{animation:fu .2s ease}@keyframes fu{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
        .qa-card{transition:all .3s}.qa-card.hl{background:${T.qaHighlight}!important;border-color:${T.qaHighlightBorder}!important;box-shadow:0 0 0 2px #25D36640}
        .tab-btn{transition:all .15s;cursor:pointer;border-radius:8px;padding:6px 14px;font-size:13px;font-weight:600;border:none}
        .toggle-theme{transition:all .2s;cursor:pointer;border:none;border-radius:20px;padding:4px 12px;font-size:13px;display:flex;align-items:center;gap:6px}
        .toggle-theme:hover{opacity:.85}
      `}</style>

      {/* ── NAV ── */}
      <div style={{display:"flex",alignItems:"center",padding:"0 18px",background:T.nav,borderBottom:`1px solid ${T.border}`,height:50,gap:4,flexShrink:0,boxShadow:dark?"none":"0 1px 4px rgba(0,0,0,.08)"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginRight:20}}>
          <div style={{width:28,height:28,borderRadius:8,background:"linear-gradient(135deg,#25D366,#128C7E)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>🏥</div>
          <span style={{fontWeight:700,fontSize:14,color:T.text}}>Clinic Bot CRM</span>
        </div>

        {[
          {id:"crm",label:"📥 Inbox",badge:contacts.reduce((s,c)=>s+c.unread,0)},
          {id:"bot",label:"🤖 Test Bot"},
          {id:"kb",label:`📊 Knowledge Base (${qaData.length})`},
        ].map(t=>(
          <button key={t.id} className="tab-btn" onClick={()=>setTab(t.id)}
            style={{background:tab===t.id?(dark?"#1a2e1e":"#dcfce7"):"transparent",color:tab===t.id?"#25D366":T.textMuted}}>
            {t.label}
            {t.badge>0&&<span style={{marginLeft:5,background:"#25D366",color:"#fff",borderRadius:10,padding:"1px 6px",fontSize:10,fontWeight:700}}>{t.badge}</span>}
          </button>
        ))}

        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:12}}>
          {/* ── DARK/LIGHT TOGGLE ── */}
          <button className="toggle-theme" onClick={()=>setDark(d=>!d)}
            style={{background:dark?"#1a2235":"#f1f5f9",color:T.textMuted,border:`1px solid ${T.border}`}}>
            {dark ? "☀️ Light" : "🌙 Dark"}
          </button>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:"#25D366"}} className="pulse"/>
            <span style={{fontSize:11,color:T.textFaint}}>{contacts.filter(c=>c.status==="open").length} active</span>
          </div>
        </div>
      </div>

      <div style={{flex:1,display:"flex",overflow:"hidden"}}>

        {/* ══════════ CRM TAB ══════════ */}
        {tab==="crm"&&<>
          {/* Sidebar */}
          <div style={{width:280,background:T.sidebar,borderRight:`1px solid ${T.border}`,display:"flex",flexDirection:"column"}}>
            <div style={{padding:"10px 10px 8px",borderBottom:`1px solid ${T.border}`}}>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search…" style={{...inp,marginBottom:7}}/>
              <div style={{display:"flex",gap:4}}>
                {["all","open","resolved"].map(f=>(
                  <button key={f} onClick={()=>setFilter(f)}
                    style={{flex:1,padding:"4px 0",borderRadius:6,border:"none",background:filter===f?T.filterActive:T.filterInactive,color:filter===f?T.filterActiveTxt:T.filterInactiveTxt,fontSize:11,fontWeight:600,cursor:"pointer",textTransform:"capitalize"}}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <div style={{flex:1,overflowY:"auto"}}>
              {filtered.map(c=>(
                <div key={c.id} className={`ci ${selected?.id===c.id?"on":""}`} onClick={()=>selectContact(c)}
                  style={{padding:"10px",cursor:"pointer",display:"flex",alignItems:"center",gap:9,borderLeft:"3px solid transparent",borderBottom:`1px solid ${T.border}`,transition:"all .15s"}}>
                  <div style={{position:"relative",flexShrink:0}}>
                    <div style={{width:36,height:36,borderRadius:9,background:getColor(c.name),display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:12,color:"#fff"}}>{c.avatar}</div>
                    {c.status==="open"&&<div style={{position:"absolute",bottom:-1,right:-1,width:8,height:8,borderRadius:"50%",background:"#25D366",border:`2px solid ${T.sidebar}`}}/>}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                      <span style={{fontWeight:600,fontSize:12,color:T.text}}>{c.name}</span>
                      <span style={{fontSize:10,color:T.textFaint}}>{c.lastTime}</span>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontSize:11,color:T.textMuted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:130}}>
                        {c.botActive?"🤖 ":""}{c.lastMessage}
                      </span>
                      {c.unread>0&&<span style={{background:"#25D366",color:"#fff",borderRadius:10,padding:"1px 5px",fontSize:10,fontWeight:700}}>{c.unread}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Chat panel */}
          {selected?(
            <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>
              <div style={{padding:"10px 16px",background:T.nav,borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{display:"flex",alignItems:"center",gap:9}}>
                  <div style={{width:34,height:34,borderRadius:9,background:getColor(selected.name),display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:12,color:"#fff"}}>{selected.avatar}</div>
                  <div>
                    <div style={{fontWeight:600,fontSize:13,color:T.text}}>{selected.name}</div>
                    <div style={{fontSize:11,color:T.textFaint}}>{selected.phone}</div>
                  </div>
                </div>
                <div style={{display:"flex",gap:7}}>
                  <button onClick={()=>toggleBot(selected.id)}
                    style={{...btn(selected.botActive?(dark?"#1a3c23":"#dcfce7"):(dark?"#141b2d":"#f1f5f9"),selected.botActive?"#25D366":T.textMuted),border:`1px solid ${selected.botActive?"#25D36640":T.border}`}}>
                    {selected.botActive?"🤖 Bot ON":"🤖 Bot OFF"}
                  </button>
                  <button onClick={()=>toggleStatus(selected.id)}
                    style={{...btn(selected.status==="open"?(dark?"#1a2e1e":"#dcfce7"):(dark?"#141b2d":"#f1f5f9"),selected.status==="open"?"#25D366":T.textMuted)}}>
                    {selected.status==="open"?"✓ Resolve":"↺ Reopen"}
                  </button>
                </div>
              </div>

              {selected.botActive&&(
                <div style={{background:T.botNotice,borderBottom:`1px solid ${T.botNoticeBorder}`,padding:"5px 16px",fontSize:11,color:T.botNoticeText,display:"flex",alignItems:"center",gap:5}}>
                  <span className="pulse">🤖</span> Bot is handling this chat
                </div>
              )}

              <div style={{flex:1,overflowY:"auto",padding:14,background:T.bg,display:"flex",flexDirection:"column",gap:8}}>
                {selected.messages.map(msg=>(
                  <div key={msg.id} className="fadeup" style={{display:"flex",justifyContent:msg.from==="user"?"flex-start":"flex-end"}}>
                    {msg.from==="user"&&<div style={{width:26,height:26,borderRadius:7,background:getColor(selected.name),display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:"#fff",marginRight:7,flexShrink:0,alignSelf:"flex-end"}}>{selected.avatar}</div>}
                    <div style={{maxWidth:"62%"}}>
                      <div style={{background:msg.from==="user"?T.msgUser:msg.from==="bot"?T.msgBot:T.msgAgent,borderRadius:msg.from==="user"?"14px 14px 14px 3px":"14px 14px 3px 14px",padding:"9px 12px",border:`1px solid ${msg.from==="user"?T.msgUserBorder:msg.from==="bot"?T.msgBotBorder:T.msgAgentBorder}`}}>
                        {msg.from!=="user"&&<div style={{fontSize:9,color:msg.from==="bot"?"#25D366":"#34B7F1",marginBottom:3,fontWeight:700}}>{msg.from==="bot"?"🤖 Bot":"👤 You"}</div>}
                        <div style={{fontSize:12,lineHeight:1.6,whiteSpace:"pre-wrap",color:T.text}}>{msg.text}</div>
                        <div style={{fontSize:9,color:T.textFaint,marginTop:3,textAlign:"right"}}>{msg.time}</div>
                      </div>
                      {msg.sources?.length>0&&<SourceBadges sources={msg.sources} onJump={highlightQA}/>}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef}/>
              </div>

              <div style={{padding:"10px 14px",background:T.nav,borderTop:`1px solid ${T.border}`,display:"flex",gap:7,alignItems:"flex-end"}}>
                <textarea value={reply} onChange={e=>setReply(e.target.value)}
                  onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendAgentReply();}}}
                  placeholder={selected.botActive?"Bot is active — toggle off to reply":"Reply… (Enter to send)"}
                  disabled={selected.botActive} rows={2}
                  style={{flex:1,background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:9,padding:"8px 11px",color:selected.botActive?T.textFaint:T.text,fontSize:12,fontFamily:"inherit"}}/>
                <button onClick={sendAgentReply} disabled={selected.botActive}
                  style={{width:38,height:38,borderRadius:9,border:"none",background:selected.botActive?T.card2:"#25D366",color:selected.botActive?T.textFaint:"#fff",fontSize:15,cursor:selected.botActive?"not-allowed":"pointer"}}>➤</button>
              </div>
            </div>
          ):(
            <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:10,color:T.textFaint}}>
              <div style={{fontSize:36}}>💬</div>
              <div style={{fontSize:13}}>Select a conversation</div>
            </div>
          )}
        </>}

        {/* ══════════ BOT TEST TAB ══════════ */}
        {tab==="bot"&&(
          <div style={{flex:1,display:"flex",flexDirection:"column",maxWidth:720,margin:"0 auto",width:"100%"}}>
            <div style={{padding:"12px 18px",background:T.nav,borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{display:"flex",alignItems:"center",gap:9}}>
                <div style={{width:32,height:32,borderRadius:9,background:"linear-gradient(135deg,#25D366,#128C7E)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>🤖</div>
                <div>
                  <div style={{fontWeight:700,fontSize:13,color:T.text}}>Live Bot Preview</div>
                  <div style={{fontSize:11,color:T.textFaint}}>Watch which Q&A the bot uses in real time</div>
                </div>
              </div>
              <button onClick={()=>setBotConvo([{from:"bot",text:"👋 Hello! How can I help you today?\n\nSaya boleh bantu dalam Bahasa Malaysia atau English! 😊",time:ts(),sources:[]}])}
                style={{...btn(T.card2,T.textMuted),border:`1px solid ${T.border}`,fontSize:11}}>↺ Reset</button>
            </div>

            <div style={{flex:1,overflowY:"auto",padding:16,background:T.bg,display:"flex",flexDirection:"column",gap:10}}>
              {botConvo.map((msg,i)=>(
                <div key={i} className="fadeup" style={{display:"flex",justifyContent:msg.from==="user"?"flex-end":"flex-start"}}>
                  <div style={{maxWidth:"70%"}}>
                    <div style={{background:msg.from==="user"?T.msgAgent:T.msgBot,borderRadius:msg.from==="user"?"14px 14px 3px 14px":"14px 14px 14px 3px",padding:"10px 13px",border:`1px solid ${msg.from==="user"?T.msgAgentBorder:T.msgBotBorder}`}}>
                      <div style={{fontSize:9,color:msg.from==="user"?"#34B7F1":"#25D366",marginBottom:3,fontWeight:700}}>{msg.from==="user"?"👤 You (Test)":"🤖 Clinic Bot"}</div>
                      <div style={{fontSize:13,lineHeight:1.6,whiteSpace:"pre-wrap",color:T.text}}>{msg.text}</div>
                      <div style={{fontSize:9,color:T.textFaint,marginTop:3,textAlign:"right"}}>{msg.time}</div>
                    </div>
                    {msg.sources?.length>0&&<div style={{marginTop:6}}><div style={{fontSize:10,color:T.textFaint,marginBottom:4}}>📎 Bot used these from Knowledge Base:</div><SourceBadges sources={msg.sources} onJump={highlightQA}/></div>}
                    {msg.from==="bot"&&msg.sources?.length===0&&i>0&&<div style={{marginTop:4,fontSize:10,color:T.textFaint}}>💡 No direct Q&A match — bot used general knowledge</div>}
                  </div>
                </div>
              ))}
              {botLoading&&(
                <div style={{display:"flex"}}>
                  <div style={{background:T.card2,borderRadius:"14px 14px 14px 3px",padding:"10px 14px",border:`1px solid ${T.border}`}}>
                    <div style={{fontSize:9,color:"#25D366",marginBottom:4,fontWeight:700}}>🤖 Clinic Bot</div>
                    <div style={{display:"flex",gap:4}}>{[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:"#25D366",animation:`pulse 1s ${i*.2}s infinite`}}/>)}</div>
                  </div>
                </div>
              )}
              <div ref={botEndRef}/>
            </div>

            <div style={{padding:"8px 16px",background:T.bg,borderTop:`1px solid ${T.border}`,display:"flex",gap:6,flexWrap:"wrap"}}>
              {["Where are you located?","I'm from Melaka","How much for skin whitening?","Nak buat appointment","Do you treat acne?"].map(q=>(
                <button key={q} onClick={()=>setBotInput(q)}
                  style={{background:T.card2,border:`1px solid ${T.border}`,borderRadius:16,padding:"4px 10px",color:T.textMuted,fontSize:11,cursor:"pointer"}}>
                  {q}
                </button>
              ))}
            </div>

            <div style={{padding:"10px 16px",background:T.nav,borderTop:`1px solid ${T.border}`,display:"flex",gap:7,alignItems:"flex-end"}}>
              <textarea value={botInput} onChange={e=>setBotInput(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendBotMessage();}}}
                placeholder="Type a test message… (Enter to send)" rows={2}
                style={{flex:1,background:T.input,border:`1px solid ${T.inputBorder}`,borderRadius:9,padding:"8px 11px",color:T.text,fontSize:13,fontFamily:"inherit"}}/>
              <button onClick={sendBotMessage} disabled={botLoading}
                style={{width:38,height:38,borderRadius:9,border:"none",background:botLoading?T.card2:"#25D366",color:botLoading?T.textFaint:"#fff",fontSize:15,cursor:"pointer"}}>➤</button>
            </div>
          </div>
        )}

        {/* ══════════ KNOWLEDGE BASE TAB ══════════ */}
        {tab==="kb"&&(
          <div style={{flex:1,overflowY:"auto",padding:20,background:T.bg}}>
            <div style={{maxWidth:780,margin:"0 auto"}}>
              <div style={{marginBottom:16}}>
                <div style={{fontWeight:700,fontSize:16,marginBottom:3,color:T.text}}>📊 Knowledge Base</div>
                <div style={{fontSize:12,color:T.textMuted}}>{qaData.length} Q&A pairs · Click source tags in bot to jump here · Edit inline</div>
              </div>

              {/* System Prompt */}
              <div style={{background:T.nav,border:`1px solid #25D36640`,borderRadius:12,padding:16,marginBottom:18}}>
                <div style={{fontWeight:700,fontSize:13,color:"#25D366",marginBottom:4}}>⚙️ System Prompt</div>
                <div style={{fontSize:11,color:T.textFaint,marginBottom:10}}>Defines bot personality, goal, language rules and medical restrictions.</div>
                <div style={{background:T.sysPromptBg,border:`1px solid ${T.sysPromptBorder}`,borderRadius:8,padding:2,marginBottom:10}}>
                  <textarea value={systemPrompt} onChange={e=>setSystemPrompt(e.target.value)} rows={10}
                    style={{width:"100%",background:"transparent",border:"none",padding:"10px 12px",color:T.sysPromptText,fontSize:12,fontFamily:"'Courier New',monospace",lineHeight:1.7}}/>
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <div style={{flex:1,fontSize:11,color:T.textFaint}}>
                    💡 Use <code style={{background:T.card2,padding:"1px 5px",borderRadius:4,color:"#FFA726"}}>{"{"+"QA_DATA}"+"}"}</code> to inject Q&A pairs automatically.
                  </div>
                  <button onClick={()=>setSystemPrompt(SYSTEM_PROMPT)} style={{...btn(T.card2,T.textMuted),border:`1px solid ${T.border}`,fontSize:11}}>↺ Reset</button>
                </div>
              </div>

              {/* Add new Q&A */}
              <div style={{background:T.card,border:`1px solid ${T.qaCardBorder}`,borderRadius:12,padding:14,marginBottom:16}}>
                <div style={{fontWeight:700,fontSize:12,marginBottom:9,color:"#34B7F1"}}>➕ Add New Q&A</div>
                <input value={newQ} onChange={e=>setNewQ(e.target.value)} placeholder="Question" style={{...inp,marginBottom:7}}/>
                <textarea value={newA} onChange={e=>setNewA(e.target.value)} placeholder="Answer" rows={2} style={{...inp,marginBottom:9}}/>
                <button onClick={addQA} style={btn()}>Add to Knowledge Base</button>
              </div>

              {/* Legend */}
              <div style={{display:"flex",gap:12,marginBottom:12,fontSize:11,color:T.textFaint,alignItems:"center"}}>
                <span>Relevance:</span>
                {Object.entries(RELEVANCE_COLOR).map(([k,v])=>(
                  <span key={k} style={{display:"flex",alignItems:"center",gap:4}}>
                    <span style={{width:8,height:8,borderRadius:"50%",background:v,display:"inline-block"}}/>
                    <span style={{color:v,textTransform:"capitalize"}}>{k}</span>
                  </span>
                ))}
              </div>

              {/* Q&A List */}
              {qaData.map((qa,i)=>(
                <div key={qa.id} ref={el=>qaRefs.current[qa.id]=el}
                  className={`qa-card ${highlightedQA===qa.id?"hl":""}`}
                  style={{background:T.qaCard,border:`1px solid ${T.qaCardBorder}`,borderRadius:10,padding:13,marginBottom:9}}>
                  {editingId===qa.id?(
                    <div>
                      <div style={{fontSize:10,color:"#34B7F1",fontWeight:700,marginBottom:6}}>✏️ Editing [{qa.id}]</div>
                      <input value={editQ} onChange={e=>setEditQ(e.target.value)} style={{...inp,marginBottom:7}}/>
                      <textarea value={editA} onChange={e=>setEditA(e.target.value)} rows={3} style={{...inp,marginBottom:9}}/>
                      <div style={{display:"flex",gap:7}}>
                        <button onClick={()=>saveEdit(qa.id)} style={btn()}>Save</button>
                        <button onClick={()=>setEditingId(null)} style={{...btn(T.card2,T.textMuted),border:`1px solid ${T.border}`}}>Cancel</button>
                      </div>
                    </div>
                  ):(
                    <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:5}}>
                          <span style={{fontSize:9,color:T.textFaint,fontFamily:"monospace",background:T.card2,padding:"2px 6px",borderRadius:4}}>{qa.id}</span>
                          <span style={{fontWeight:600,fontSize:13,color:T.text}}>Q: {qa.question}</span>
                        </div>
                        <div style={{fontSize:12,color:T.textMuted,lineHeight:1.5}}>A: {qa.answer}</div>
                      </div>
                      <div style={{display:"flex",gap:6,flexShrink:0}}>
                        <button onClick={()=>startEdit(qa)} style={{...btn(dark?"#1a2e1e":"#dcfce7","#25D366"),border:"1px solid #25D36630",fontSize:11}}>✏️ Edit</button>
                        <button onClick={()=>setQaData(p=>p.filter((_,j)=>j!==i))} style={{...btn(dark?"#2d1a1a":"#fee2e2","#ef4444"),border:"1px solid #ff4d4d30",fontSize:11}}>✕</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}