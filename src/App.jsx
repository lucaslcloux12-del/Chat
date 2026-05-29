import { useState, useEffect, useRef } from "react";
import { db } from "./firebase";
import { ref, onValue, set, push, remove } from "firebase/database";

// ─── USERS ───────────────────────────────────────────────────
const USERS_DEF = {
  Lucas:    { password: "012012", color: "#fddb92" },
  Renan:    { password: "252011", color: "#ff6b6b" },
  Lucca:    { password: "768798", color: "#a8ff78" },
  Giovanni: { password: "112509", color: "#f7971e" },
  Cristian: { password: "032311", color: "#c471ed" },
  Ruan:     { password: "094578", color: "#12c2e9" },
  Diego:    { password: "378901", color: "#f64f59" },
  Théo:     { password: "769840", color: "#00e5ff" },
};
const ALL_USERS = Object.keys(USERS_DEF);

const INITIAL_ROLES = {
  Lucas: "dono", Renan: "leadAdmin",
  Lucca: "normal", Giovanni: "normal",
  Cristian: "normal", Ruan: "normal",
  Diego: "normal", Théo: "normal",
};

const GROUP_NAMES = ["Chat Geral", "Chat 1", "Resenha 1", "Chat 3"];

// ─── HELPERS ─────────────────────────────────────────────────
function rankPower(r) { return { dono:5, leadAdmin:4, admin:3, membro:2, normal:1 }[r]||1; }
function rankLabel(r) { return { dono:"👑 Dono", leadAdmin:"⭐ Lead Admin", admin:"🛡 Admin", membro:"🔑 Membro", normal:"👤 Normal" }[r]||"👤 Normal"; }
function rankColor(r) { return { dono:"#fddb92", leadAdmin:"#ff6b6b", admin:"#c471ed", membro:"#12c2e9", normal:"#555" }[r]||"#555"; }
function canAccess(u, g, members, roles) {
  const r = roles[u];
  if (r==="dono"||r==="leadAdmin"||r==="admin") return true;
  return (members[g]||[]).includes(u);
}
function dmKey(a, b) { return [a,b].sort().join("__"); }
function fmtTime(ts) { return new Date(ts).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}); }
function arrToObj(arr) {
  if (!arr) return {};
  return Object.fromEntries(arr.map((v,i)=>[i,v]));
}

// ─── APP ─────────────────────────────────────────────────────
export default function App() {
  const [user, setUser]           = useState(null);
  const [nameInput, setNameInput] = useState("");
  const [pwdInput, setPwdInput]   = useState("");
  const [loginErr, setLoginErr]   = useState("");

  // Firebase state
  const [roles, setRoles]         = useState(INITIAL_ROLES);
  const [suspended, setSuspended] = useState({});
  const [members, setMembers]     = useState({ "Chat Geral": ALL_USERS.slice() });
  const [groupMsgs, setGroupMsgs] = useState({});
  const [dmMsgs, setDmMsgs]       = useState({});
  const [requests, setRequests]   = useState([]);

  const [active, setActive]       = useState(null); // {type:"group"|"dm", name/with}
  const [input, setInput]         = useState("");
  const [panel, setPanel]         = useState("chat");
  const [adminTab, setAdminTab]   = useState("usuarios");
  const [isMobile, setIsMobile]   = useState(window.innerWidth < 640);
  const [showSidebar, setShowSidebar] = useState(true);
  const [dmSearch, setDmSearch]   = useState("");
  const [sideTab, setSideTab]     = useState("grupos");
  const [confirmClear, setConfirmClear] = useState(false);
  const bottomRef = useRef(null);

  // ── Resize ──────────────────────────────────────────────
  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);

  useEffect(() => { if (isMobile && active) setShowSidebar(false); }, [active, isMobile]);
  useEffect(() => { setConfirmClear(false); }, [active]);
  useEffect(() => { bottomRef.current?.scrollIntoView({behavior:"smooth"}); }, [groupMsgs, dmMsgs, active]);

  // ── Firebase listeners ───────────────────────────────────
  useEffect(() => {
    const unsubs = [];

    unsubs.push(onValue(ref(db,"roles"), snap => {
      setRoles(snap.val() || INITIAL_ROLES);
    }));
    unsubs.push(onValue(ref(db,"suspended"), snap => {
      setSuspended(snap.val() || {});
    }));
    unsubs.push(onValue(ref(db,"members"), snap => {
      const val = snap.val() || {};
      // Chat Geral always has all users
      setMembers({ "Chat Geral": ALL_USERS.slice(), ...val });
    }));
    unsubs.push(onValue(ref(db,"groupMsgs"), snap => {
      setGroupMsgs(snap.val() || {});
    }));
    unsubs.push(onValue(ref(db,"dmMsgs"), snap => {
      setDmMsgs(snap.val() || {});
    }));
    unsubs.push(onValue(ref(db,"requests"), snap => {
      const val = snap.val();
      setRequests(val ? Object.values(val) : []);
    }));

    return () => unsubs.forEach(u => u());
  }, []);

  // ── Login ────────────────────────────────────────────────
  function doLogin() {
    const key = ALL_USERS.find(k => k.toLowerCase()===nameInput.trim().toLowerCase());
    if (!key) { setLoginErr("Usuário não encontrado."); return; }
    if (pwdInput !== USERS_DEF[key].password) { setLoginErr("Senha incorreta."); return; }
    if (suspended[key]) { setLoginErr("Conta suspensa."); return; }
    setUser(key);
    setActive({ type:"group", name:"Chat Geral" });
    setLoginErr(""); setNameInput(""); setPwdInput("");
  }

  // ── Send message ─────────────────────────────────────────
  function doSend() {
    const text = input.trim();
    if (!text || !active) return;
    setInput("");
    const msg = { user, text, ts: Date.now() };
    if (active.type === "group") {
      push(ref(db, `groupMsgs/${active.name}`), msg);
    } else {
      push(ref(db, `dmMsgs/${dmKey(user, active.with)}`), msg);
    }
  }

  // ── Delete message ───────────────────────────────────────
  function deleteMsg(msgId) {
    if (active.type === "group") {
      remove(ref(db, `groupMsgs/${active.name}/${msgId}`));
    } else {
      remove(ref(db, `dmMsgs/${dmKey(user, active.with)}/${msgId}`));
    }
  }

  // ── Clear DM ─────────────────────────────────────────────
  function clearDM() {
    set(ref(db, `dmMsgs/${dmKey(user, active.with)}`), null);
    setConfirmClear(false);
  }

  function openDM(target) {
    setActive({type:"dm", with:target});
    setDmSearch("");
    setSideTab("dms");
    if (isMobile) setShowSidebar(false);
  }

  // ── Current messages ─────────────────────────────────────
  let msgs = [];
  if (active?.type === "group") {
    const raw = groupMsgs[active.name];
    msgs = raw ? Object.entries(raw).map(([id,m])=>({...m,id})) : [];
  } else if (active?.type === "dm") {
    const raw = dmMsgs[dmKey(user, active.with)];
    msgs = raw ? Object.entries(raw).map(([id,m])=>({...m,id})) : [];
  }

  // ── DM list ──────────────────────────────────────────────
  const myDMs = ALL_USERS.filter(u => u!==user && dmMsgs[dmKey(user,u)]);
  const dmResults = dmSearch.trim()
    ? ALL_USERS.filter(u => u!==user && u.toLowerCase().includes(dmSearch.toLowerCase()))
    : [];

  // ── LOGIN SCREEN ─────────────────────────────────────────
  if (!user) return (
    <div style={{minHeight:"100vh",background:"#0a0a0a",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"monospace",padding:16}}>
      <div style={{background:"#111",border:"1px solid #1e1e1e",borderRadius:20,padding:"40px 32px",width:"100%",maxWidth:300,display:"flex",flexDirection:"column",gap:14,boxShadow:"0 20px 60px #000"}}>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:22,fontWeight:700,letterSpacing:6,color:"#f0f0f0"}}>CHATSEC</div>
          <div style={{fontSize:10,color:"#444",letterSpacing:3,marginTop:4}}>CANAL PRIVADO</div>
        </div>
        <input type="text" placeholder="Nome" value={nameInput}
          onChange={e=>setNameInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doLogin()}
          style={{width:"100%",boxSizing:"border-box",background:"#1a1a1a",border:"1.5px solid #2a2a2a",borderRadius:10,padding:"12px 16px",color:"#eee",fontSize:14,fontFamily:"monospace",outline:"none"}}/>
        <input type="password" placeholder="Senha" value={pwdInput}
          onChange={e=>setPwdInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doLogin()}
          style={{width:"100%",boxSizing:"border-box",background:"#1a1a1a",border:"1.5px solid #2a2a2a",borderRadius:10,padding:"12px 16px",color:"#eee",fontSize:14,fontFamily:"monospace",outline:"none"}}/>
        {loginErr && <div style={{color:"#ff6b6b",fontSize:12,textAlign:"center"}}>{loginErr}</div>}
        <button onClick={doLogin} style={{width:"100%",padding:"13px 0",borderRadius:10,border:"none",fontWeight:700,fontSize:14,letterSpacing:3,cursor:"pointer",fontFamily:"monospace",background:"#fddb92",color:"#0d0d0d"}}>ENTRAR</button>
      </div>
    </div>
  );

  const role    = roles[user] || "normal";
  const power   = rankPower(role);
  const myColor = USERS_DEF[user].color;

  // ── ADMIN PANEL ──────────────────────────────────────────
  if (panel === "admin") return (
    <AdminPanel user={user} role={role} power={power} myColor={myColor}
      roles={roles} suspended={suspended} members={members} requests={requests}
      ALL_USERS={ALL_USERS} rankLabel={rankLabel} rankColor={rankColor} rankPower={rankPower}
      adminTab={adminTab} setAdminTab={setAdminTab} onBack={()=>setPanel("chat")} />
  );

  // ── SIDEBAR ──────────────────────────────────────────────
  const Sidebar = (
    <div style={{width:isMobile?"100%":170,background:"#0d0d0d",borderRight:isMobile?"none":"1px solid #1a1a1a",borderBottom:isMobile?"1px solid #1a1a1a":"none",display:"flex",flexDirection:"column",flexShrink:0,overflow:"hidden"}}>
      <div style={{display:"flex",borderBottom:"1px solid #151515",flexShrink:0}}>
        {["grupos","dms"].map(t=>(
          <button key={t} onClick={()=>setSideTab(t)} style={{flex:1,padding:"9px 0",border:"none",fontFamily:"monospace",fontSize:10,letterSpacing:1,cursor:"pointer",background:sideTab===t?"#141414":"transparent",color:sideTab===t?myColor:"#555",borderBottom:sideTab===t?`2px solid ${myColor}`:"2px solid transparent"}}>
            {t==="grupos"?"GRUPOS":"PRIVADO"}
          </button>
        ))}
      </div>

      {sideTab==="grupos" && (
        <div style={{overflowY:"auto",flex:1}}>
          {GROUP_NAMES.map(g=>{
            const accessible = canAccess(user, g, members, roles);
            const isActive = active?.type==="group" && active.name===g;
            const raw = groupMsgs[g];
            const gMsgs = raw ? Object.values(raw) : [];
            const last = gMsgs.length>0 ? gMsgs[gMsgs.length-1] : null;
            return (
              <button key={g} onClick={()=>{if(!accessible)return;setActive({type:"group",name:g});if(isMobile)setShowSidebar(false);}} style={{background:isActive?"#1e1e1e":"transparent",border:"none",borderLeft:!isMobile?(isActive?`3px solid ${myColor}`:"3px solid transparent"):"none",borderBottom:"1px solid #111",padding:"10px 12px",textAlign:"left",cursor:accessible?"pointer":"default",fontFamily:"monospace",width:"100%",boxSizing:"border-box"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:11,fontWeight:isActive?700:400,color:isActive?myColor:accessible?"#ccc":"#444"}}>{g}</span>
                  {last&&<span style={{fontSize:9,color:"#444",marginLeft:4,flexShrink:0}}>{fmtTime(last.ts)}</span>}
                </div>
                {last
                  ?<div style={{fontSize:9,color:"#444",marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{accessible?`${last.user[0]}: ${last.text}`:last.text}</div>
                  :accessible&&<div style={{fontSize:9,color:"#252525",marginTop:2}}>Sem mensagens</div>
                }
              </button>
            );
          })}
        </div>
      )}

      {sideTab==="dms" && (
        <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden"}}>
          <div style={{padding:"8px 10px",borderBottom:"1px solid #111",flexShrink:0}}>
            <input value={dmSearch} onChange={e=>setDmSearch(e.target.value)} placeholder="Buscar usuário..."
              style={{width:"100%",boxSizing:"border-box",background:"#1a1a1a",border:"1px solid #252525",borderRadius:8,padding:"7px 10px",color:"#eee",fontSize:11,fontFamily:"monospace",outline:"none"}}/>
          </div>
          <div style={{overflowY:"auto",flex:1}}>
            {dmSearch.trim() ? (
              dmResults.length===0
                ?<div style={{fontSize:10,color:"#333",textAlign:"center",marginTop:20}}>Nenhum usuário encontrado</div>
                :dmResults.map(u=>(
                  <button key={u} onClick={()=>openDM(u)} style={{background:"transparent",border:"none",borderBottom:"1px solid #111",padding:"10px 12px",textAlign:"left",cursor:"pointer",fontFamily:"monospace",width:"100%",boxSizing:"border-box",display:"flex",alignItems:"center",gap:8}}>
                    <div style={{width:24,height:24,borderRadius:"50%",background:USERS_DEF[u].color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:"#0d0d0d",flexShrink:0}}>{u[0]}</div>
                    <span style={{fontSize:11,color:"#bbb"}}>{u}</span>
                  </button>
                ))
            ) : (
              myDMs.length===0
                ?<div style={{fontSize:10,color:"#333",textAlign:"center",marginTop:30,padding:"0 12px"}}>Nenhuma conversa.<br/>Busque um usuário acima.</div>
                :myDMs.map(u=>{
                  const raw = dmMsgs[dmKey(user,u)];
                  const dms = raw ? Object.values(raw) : [];
                  const last = dms.length>0?dms[dms.length-1]:null;
                  const isActive = active?.type==="dm"&&active.with===u;
                  return (
                    <button key={u} onClick={()=>openDM(u)} style={{background:isActive?"#1e1e1e":"transparent",border:"none",borderLeft:!isMobile?(isActive?`3px solid ${myColor}`:"3px solid transparent"):"none",borderBottom:"1px solid #111",padding:"10px 12px",textAlign:"left",cursor:"pointer",fontFamily:"monospace",width:"100%",boxSizing:"border-box"}}>
                      <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:last?2:0}}>
                        <div style={{width:22,height:22,borderRadius:"50%",background:USERS_DEF[u].color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:"#0d0d0d",flexShrink:0}}>{u[0]}</div>
                        <span style={{fontSize:11,fontWeight:isActive?700:400,color:isActive?myColor:"#ccc",flex:1}}>{u}</span>
                        {last&&<span style={{fontSize:9,color:"#444"}}>{fmtTime(last.ts)}</span>}
                      </div>
                      {last&&<div style={{fontSize:9,color:"#444",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",paddingLeft:29}}>{last.user===user?"Você: ":""}{last.text}</div>}
                    </button>
                  );
                })
            )}
          </div>
        </div>
      )}
    </div>
  );

  const isDM = active?.type==="dm";
  const otherColor = isDM ? USERS_DEF[active.with]?.color : null;

  // ── CHAT SCREEN ──────────────────────────────────────────
  return (
    <div style={{height:"100vh",display:"flex",flexDirection:"column",background:"#0a0a0a",fontFamily:"monospace"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",borderBottom:"1px solid #1a1a1a",background:"#0f0f0f",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {isMobile&&active&&!showSidebar&&(
            <button onClick={()=>setShowSidebar(true)} style={{background:"none",border:"none",color:"#555",fontSize:18,cursor:"pointer",padding:"0 6px 0 0"}}>←</button>
          )}
          <span style={{width:8,height:8,borderRadius:"50%",background:myColor,display:"inline-block"}}/>
          <span style={{color:myColor,fontWeight:700,fontSize:12}}>{user}</span>
          <span style={{fontSize:9,color:rankColor(role),background:"#1a1a1a",borderRadius:6,padding:"2px 7px"}}>{rankLabel(role)}</span>
        </div>
        <div style={{display:"flex",gap:8}}>
          {power>=3&&<button onClick={()=>setPanel("admin")} style={{background:"#1a1a1a",border:"1px solid #2a2a2a",color:"#aaa",borderRadius:8,padding:"5px 10px",fontSize:11,cursor:"pointer",fontFamily:"monospace"}}>⚙</button>}
          <button onClick={()=>{setUser(null);setActive(null);}} style={{background:"transparent",border:"1px solid #222",color:"#555",borderRadius:8,padding:"5px 10px",fontSize:11,cursor:"pointer",fontFamily:"monospace"}}>Sair</button>
        </div>
      </div>

      <div style={{flex:1,display:"flex",flexDirection:isMobile?"column":"row",overflow:"hidden"}}>
        {(!isMobile||showSidebar) && Sidebar}
        {(!isMobile||!showSidebar) && (
          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
            {!active ? (
              <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:"#2a2a2a",fontSize:12}}>Selecione um grupo ou conversa</div>
            ) : (
              <>
                <div style={{padding:"8px 14px",borderBottom:"1px solid #1a1a1a",background:"#0f0f0f",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    {isDM&&<div style={{width:22,height:22,borderRadius:"50%",background:otherColor,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:"#0d0d0d"}}>{active.with[0]}</div>}
                    <span style={{fontSize:11,color:"#888",fontWeight:700,letterSpacing:1}}>{isDM?active.with:active.name}</span>
                    {isDM&&<span style={{fontSize:9,color:"#444"}}>conversa privada</span>}
                  </div>
                  {isDM&&(
                    confirmClear
                      ?<div style={{display:"flex",gap:6,alignItems:"center"}}>
                        <span style={{fontSize:10,color:"#f64f59"}}>Apagar tudo?</span>
                        <button onClick={clearDM} style={{background:"#2a1a1a",border:"1px solid #f64f59",color:"#f64f59",borderRadius:6,padding:"3px 8px",fontSize:10,cursor:"pointer",fontFamily:"monospace"}}>Sim</button>
                        <button onClick={()=>setConfirmClear(false)} style={{background:"#1a1a1a",border:"1px solid #333",color:"#666",borderRadius:6,padding:"3px 8px",fontSize:10,cursor:"pointer",fontFamily:"monospace"}}>Não</button>
                      </div>
                      :<button onClick={()=>setConfirmClear(true)} style={{background:"transparent",border:"1px solid #2a2a2a",color:"#555",borderRadius:6,padding:"4px 10px",fontSize:10,cursor:"pointer",fontFamily:"monospace"}}>🗑 Apagar</button>
                  )}
                </div>

                <div style={{flex:1,overflowY:"auto",padding:"14px 12px 6px",display:"flex",flexDirection:"column",gap:12}}>
                  {msgs.length===0&&<div style={{color:"#222",textAlign:"center",marginTop:40,fontSize:11}}>Nenhuma mensagem ainda.</div>}
                  {msgs.map(m=>{
                    const isMe=m.user===user;
                    const c=USERS_DEF[m.user]?.color||"#aaa";
                    const canDel=power>=3||isDM;
                    return (
                      <div key={m.id} style={{display:"flex",alignItems:"flex-end",gap:6,justifyContent:isMe?"flex-end":"flex-start"}}>
                        {!isMe&&<div style={{width:26,height:26,borderRadius:"50%",background:c,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#0d0d0d",flexShrink:0}}>{m.user[0]}</div>}
                        <div style={{maxWidth:"70%",display:"flex",flexDirection:"column",alignItems:isMe?"flex-end":"flex-start"}}>
                          <div style={{padding:"7px 12px 9px",wordBreak:"break-word",fontSize:13,lineHeight:1.6,borderRadius:14,borderBottomRightRadius:isMe?3:14,borderBottomLeftRadius:isMe?14:3,background:isMe?myColor:"#1c1c1c",color:isMe?"#0d0d0d":"#ddd",display:"inline-block",minWidth:"fit-content"}}>
                            {!isMe&&!isDM&&<div style={{fontSize:10,fontWeight:700,color:c,marginBottom:2,whiteSpace:"nowrap"}}>{m.user}</div>}
                            {m.text}
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:5,marginTop:2}}>
                            <span style={{fontSize:9,color:"#333"}}>{fmtTime(m.ts)}</span>
                            {canDel&&<button onClick={()=>deleteMsg(m.id)} style={{background:"none",border:"none",color:"#f64f59",fontSize:9,cursor:"pointer",padding:0,fontFamily:"monospace"}}>✕</button>}
                          </div>
                        </div>
                        {isMe&&<div style={{width:26,height:26,borderRadius:"50%",background:myColor,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#0d0d0d",flexShrink:0}}>{m.user[0]}</div>}
                      </div>
                    );
                  })}
                  <div ref={bottomRef}/>
                </div>

                <div style={{display:"flex",gap:8,padding:"10px 12px",borderTop:"1px solid #1a1a1a",background:"#0f0f0f",flexShrink:0}}>
                  <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doSend()} placeholder="Escreva uma mensagem..."
                    style={{flex:1,boxSizing:"border-box",background:"#1a1a1a",border:"1.5px solid #252525",borderRadius:12,padding:"10px 14px",color:"#eee",fontSize:13,fontFamily:"monospace",outline:"none"}}/>
                  <button onClick={doSend} disabled={!input.trim()} style={{width:40,height:40,borderRadius:12,border:"none",fontSize:16,cursor:input.trim()?"pointer":"default",fontWeight:700,flexShrink:0,background:input.trim()?myColor:"#1a1a1a",color:input.trim()?"#0d0d0d":"#444"}}>↑</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ADMIN PANEL ─────────────────────────────────────────────
function AdminPanel({user,role,power,myColor,roles,suspended,members,requests,ALL_USERS,rankLabel,rankColor,rankPower,adminTab,setAdminTab,onBack}) {

  function setRole(target, newRole) {
    const newRoles = {...roles};
    if (newRole==="leadAdmin") Object.keys(newRoles).forEach(u=>{if(newRoles[u]==="leadAdmin")newRoles[u]="normal";});
    if (newRole==="dono") Object.keys(newRoles).forEach(u=>{if(newRoles[u]==="dono")newRoles[u]="leadAdmin";});
    newRoles[target]=newRole;
    set(ref(db,"roles"), newRoles);
  }

  function toggleSuspend(target) {
    set(ref(db,`suspended/${target}`), !suspended[target] || null);
  }

  function toggleMember(group, target) {
    const cur = members[group]||[];
    const updated = cur.includes(target) ? cur.filter(u=>u!==target) : [...cur, target];
    set(ref(db,`members/${group}`), updated.length>0 ? updated : null);
  }

  function setGroupMember(group, target) {
    // stored in members as-is, groupMember is just metadata
    set(ref(db,`groupMeta/${group}/groupMember`), target||null);
  }

  function approveReq(req) {
    const cur = members[req.group]||[];
    if (!cur.includes(req.from)) set(ref(db,`members/${req.group}`), [...cur, req.from]);
    remove(ref(db,`requests/${req.id}`));
  }

  function rejectReq(req) {
    remove(ref(db,`requests/${req.id}`));
  }

  return (
    <div style={{height:"100vh",display:"flex",flexDirection:"column",background:"#0a0a0a",fontFamily:"monospace"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",borderBottom:"1px solid #1a1a1a",background:"#0f0f0f"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button onClick={onBack} style={{background:"none",border:"none",color:"#555",fontSize:18,cursor:"pointer"}}>←</button>
          <span style={{color:myColor,fontWeight:700,fontSize:13,letterSpacing:2}}>PAINEL ADMIN</span>
        </div>
        <span style={{fontSize:9,color:rankColor(role),background:"#1a1a1a",borderRadius:6,padding:"2px 8px"}}>{rankLabel(role)}</span>
      </div>

      <div style={{display:"flex",borderBottom:"1px solid #1a1a1a"}}>
        {["usuarios","grupos","pedidos"].map(t=>(
          <button key={t} onClick={()=>setAdminTab(t)} style={{flex:1,padding:"10px 0",border:"none",fontFamily:"monospace",fontSize:11,letterSpacing:1,cursor:"pointer",background:adminTab===t?"#1a1a1a":"#0d0d0d",color:adminTab===t?myColor:"#555",borderBottom:adminTab===t?`2px solid ${myColor}`:"2px solid transparent"}}>{t.toUpperCase()}</button>
        ))}
      </div>

      <div style={{flex:1,overflowY:"auto",padding:14}}>

        {adminTab==="usuarios"&&(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {ALL_USERS.map(u=>{
              const uRole=roles[u]||"normal";
              const uPower=rankPower(uRole);
              const isSusp=!!suspended[u];
              const canEdit=power>uPower||power===5;
              const isMe=u===user;
              return (
                <div key={u} style={{background:"#111",border:"1px solid #1e1e1e",borderRadius:12,padding:"12px 14px"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:canEdit&&!isMe?8:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:28,height:28,borderRadius:"50%",background:USERS_DEF[u].color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:"#0d0d0d"}}>{u[0]}</div>
                      <div>
                        <div style={{color:USERS_DEF[u].color,fontWeight:700,fontSize:12}}>{u}{isMe?" (você)":""}</div>
                        <div style={{fontSize:9,color:rankColor(uRole)}}>{rankLabel(uRole)}{isSusp?" 🚫 SUSPENSO":""}</div>
                      </div>
                    </div>
                    {canEdit&&!isMe&&(
                      <button onClick={()=>toggleSuspend(u)} style={{background:isSusp?"#2a1a1a":"#1a1a1a",border:`1px solid ${isSusp?"#f64f59":"#555"}`,color:isSusp?"#f64f59":"#777",borderRadius:7,padding:"4px 10px",fontSize:10,cursor:"pointer",fontFamily:"monospace"}}>
                        {isSusp?"Reativar":"Suspender"}
                      </button>
                    )}
                  </div>
                  {canEdit&&!isMe&&(
                    <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                      {["normal","membro","admin","leadAdmin","dono"].map(r=>{
                        if(r==="dono"&&power<5)return null;
                        if(r==="leadAdmin"&&power<5)return null;
                        if(r==="admin"&&power<4)return null;
                        return <button key={r} onClick={()=>setRole(u,r)} style={{padding:"4px 9px",borderRadius:6,fontSize:9,cursor:"pointer",fontFamily:"monospace",border:"none",background:uRole===r?rankColor(r):"#1a1a1a",color:uRole===r?"#0d0d0d":"#555"}}>{rankLabel(r)}</button>;
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {adminTab==="grupos"&&(
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            {["Chat Geral","Chat 1","Resenha 1","Chat 3"].map(g=>{
              const grpMembers=members[g]||[];
              const isExtra=g!=="Chat Geral";
              return (
                <div key={g} style={{background:"#111",border:"1px solid #1e1e1e",borderRadius:12,padding:"12px 14px"}}>
                  <div style={{color:"#eee",fontWeight:700,fontSize:12,marginBottom:10}}>{g} <span style={{color:"#444",fontWeight:400,fontSize:10}}>({grpMembers.length} membros)</span></div>
                  {isExtra&&(
                    <>
                      <div style={{fontSize:9,color:"#555",marginBottom:5,letterSpacing:1}}>MEMBRO RESPONSÁVEL</div>
                      <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:10}}>
                        {ALL_USERS.map(u=>(
                          <button key={u} onClick={()=>power>=3&&setGroupMember(g,u)} style={{padding:"4px 9px",borderRadius:6,fontSize:9,cursor:power>=3?"pointer":"default",fontFamily:"monospace",border:"none",background:grpMembers.includes(u)?USERS_DEF[u].color:"#1a1a1a",color:grpMembers.includes(u)?"#0d0d0d":"#555"}}>{u}</button>
                        ))}
                      </div>
                    </>
                  )}
                  <div style={{fontSize:9,color:"#555",marginBottom:5,letterSpacing:1}}>MEMBROS</div>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    {ALL_USERS.map(u=>{
                      const isMem=grpMembers.includes(u);
                      const canToggle=isExtra&&power>=3;
                      return <button key={u} onClick={()=>canToggle&&toggleMember(g,u)} style={{padding:"4px 9px",borderRadius:6,fontSize:9,cursor:canToggle?"pointer":"default",fontFamily:"monospace",border:"none",background:isMem?USERS_DEF[u].color:"#1a1a1a",color:isMem?"#0d0d0d":"#444"}}>{u}</button>;
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {adminTab==="pedidos"&&(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {requests.length===0&&<div style={{color:"#333",textAlign:"center",marginTop:40,fontSize:11}}>Nenhum pedido pendente.</div>}
            {requests.map(req=>(
              <div key={req.id} style={{background:"#111",border:"1px solid #1e1e1e",borderRadius:12,padding:"12px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
                <div>
                  <div style={{color:USERS_DEF[req.from]?.color||"#eee",fontWeight:700,fontSize:12}}>{req.from}</div>
                  <div style={{fontSize:10,color:"#555"}}>quer entrar em <span style={{color:"#aaa"}}>{req.group}</span></div>
                </div>
                <div style={{display:"flex",gap:6,flexShrink:0}}>
                  <button onClick={()=>approveReq(req)} style={{background:"#1a2a1a",border:"1px solid #a8ff78",color:"#a8ff78",borderRadius:7,padding:"5px 10px",fontSize:10,cursor:"pointer",fontFamily:"monospace"}}>✓</button>
                  <button onClick={()=>rejectReq(req)} style={{background:"#2a1a1a",border:"1px solid #f64f59",color:"#f64f59",borderRadius:7,padding:"5px 10px",fontSize:10,cursor:"pointer",fontFamily:"monospace"}}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
