import { useState, useEffect, useCallback } from "react";

const OWNER = "Sergio1990-1";
const REPOS = ["moncassa","solotax-kg","sewing-erp","content-factory","makeit-website","makeit-dashboard","accounting-bot"];
const GQL = "https://api.github.com/graphql";

const Q = `query($owner:String!){
${REPOS.map((r,i)=>`r${i}:repository(owner:$owner,name:"${r}"){name description url isPrivate updatedAt
defaultBranchRef{target{...on Commit{history(first:1){nodes{committedDate message author{name}}}}}}
issues(states:OPEN){totalCount} closedIssues:issues(states:CLOSED){totalCount} pullRequests(states:OPEN){totalCount}
milestones(first:20,states:OPEN,orderBy:{field:DUE_DATE,direction:ASC}){nodes{title description dueOn state number url
ci:issues(states:CLOSED){totalCount} oi:issues(states:OPEN){totalCount}}}
cm:milestones(first:10,states:CLOSED,orderBy:{field:DUE_DATE,direction:DESC}){nodes{title dueOn state number url
ci:issues(states:CLOSED){totalCount} oi:issues(states:OPEN){totalCount}}}}`).join("\n")}
}`;

const dUntil=d=>d?Math.ceil((new Date(d)-new Date())/864e5):null;
const fDate=d=>d?new Date(d).toLocaleDateString("ru-RU",{day:"numeric",month:"short",year:"numeric"}):"—";
const tAgo=d=>{if(!d)return"";const m=Math.floor((Date.now()-new Date(d))/6e4);if(m<60)return m+"м";const h=Math.floor(m/60);return h<24?h+"ч":Math.floor(h/24)+"д"};

function DB({dueOn}){const d=dUntil(dueOn);if(d===null)return<span style={S.bN}>без дедлайна</span>;if(d<0)return<span style={{...S.bD,animation:"pulse 2s infinite"}}>просрочен {Math.abs(d)}д</span>;if(d<=3)return<span style={S.bW}>{d}д осталось</span>;if(d<=14)return<span style={S.bI}>{d}д</span>;return<span style={S.bN}>{d}д</span>}

function PB({c,o,sz="md"}){const t=c+o,p=t?Math.round(c/t*100):0,h=sz==="sm"?5:8,hu=p<30?0:p<70?40:142;
return<div style={{display:"flex",alignItems:"center",gap:8,width:"100%"}}><div style={{flex:1,height:h,borderRadius:h,background:"rgba(255,255,255,.06)",overflow:"hidden"}}><div style={{width:p+"%",height:"100%",borderRadius:h,background:`hsl(${hu},72%,56%)`,transition:"width .8s cubic-bezier(.4,0,.2,1)"}}/></div><span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:sz==="sm"?10:12,color:`hsl(${hu},72%,66%)`,minWidth:56,textAlign:"right"}}>{c}/{t} ({p}%)</span></div>}

function MC({ms,rn}){const cl=ms.ci.totalCount,op=ms.oi.totalCount,done=cl+op>0&&op===0;
return<div style={{...S.msC,borderLeft:done?"3px solid #2ea043":"3px solid #444"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",mb:8,marginBottom:8}}><div><div style={{fontSize:13,fontWeight:600,color:"#e6edf3",marginBottom:2}}>{ms.title}</div><div style={{fontSize:11,color:"#7d8590"}}>{rn}</div></div><DB dueOn={ms.dueOn}/></div>{ms.description&&<div style={{fontSize:11,color:"#7d8590",marginBottom:8,lineHeight:1.4}}>{ms.description.slice(0,100)}{ms.description.length>100?"…":""}</div>}<PB c={cl} o={op}/>{ms.dueOn&&<div style={{fontSize:11,color:"#7d8590",marginTop:6}}>Дедлайн: {fDate(ms.dueOn)}</div>}</div>}

function RC({r}){const cm=r.defaultBranchRef?.target?.history?.nodes?.[0];
return<div style={S.rC}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}><a href={r.url} target="_blank" rel="noreferrer" style={S.rN}>{r.name}</a>{r.isPrivate&&<span style={S.prv}>private</span>}</div>{r.description&&<div style={{fontSize:12,color:"#7d8590",marginBottom:10,lineHeight:1.4}}>{r.description}</div>}<div style={S.rS}><span style={{color:r.issues.totalCount>0?"#f0883e":"#3fb950"}}>{r.issues.totalCount} open</span><span style={{color:"#7d8590"}}>{r.closedIssues.totalCount} closed</span>{r.pullRequests.totalCount>0&&<span style={{color:"#a371f7"}}>{r.pullRequests.totalCount} PR</span>}{r.milestones.nodes.length>0&&<span style={{color:"#58a6ff"}}>{r.milestones.nodes.length} ms</span>}</div>{cm&&<div style={S.lC}><span style={{color:"#58a6ff"}}>{cm.author?.name}</span>{" · "}{cm.message?.split("\n")[0]?.slice(0,45)}{" · "}<span style={{opacity:.6}}>{tAgo(cm.committedDate)}</span></div>}</div>}

export default function App(){
  const[token,setToken]=useState("");
  const[data,setData]=useState(null);
  const[loading,setLoading]=useState(false);
  const[error,setError]=useState(null);
  const[tab,setTab]=useState("milestones");
  const[inp,setInp]=useState("");

  const load=useCallback(async()=>{if(!token)return;setLoading(true);setError(null);try{const r=await fetch(GQL,{method:"POST",headers:{Authorization:`bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({query:Q,variables:{owner:OWNER}})});const j=await r.json();if(j.errors)throw new Error(j.errors[0].message);setData(j.data)}catch(e){setError(e.message);if(e.message.includes("401"))setToken("")}finally{setLoading(false)}},[token]);

  useEffect(()=>{load();if(token){const iv=setInterval(load,12e4);return()=>clearInterval(iv)}},[load,token]);

  if(!token)return<div style={S.tw}><style>{CSS}</style><div style={S.tc}><div style={{fontSize:28,marginBottom:6}}>⚙️</div><h2 style={S.tt}>MakeIT Tracker</h2><p style={S.td}>GitHub Personal Access Token<br/><span style={{opacity:.5,fontSize:12}}>scopes: repo, read:org, read:project</span></p><input type="password" value={inp} onChange={e=>setInp(e.target.value)} placeholder="ghp_..." style={S.ti}/><button onClick={()=>inp.startsWith("ghp_")&&setToken(inp)} disabled={!inp.startsWith("ghp_")} style={{...S.tb,opacity:inp.startsWith("ghp_")?1:.4}}>Подключить</button></div></div>;

  const repos=data?REPOS.map((_,i)=>data[`r${i}`]).filter(Boolean):[];
  const oMs=repos.flatMap(r=>(r.milestones?.nodes||[]).map(m=>({...m,rn:r.name})));
  const cMs=repos.flatMap(r=>(r.cm?.nodes||[]).map(m=>({...m,rn:r.name})));
  const urg=oMs.filter(m=>m.dueOn&&dUntil(m.dueOn)<=7).sort((a,b)=>new Date(a.dueOn)-new Date(b.dueOn));
  const tO=repos.reduce((s,r)=>s+r.issues.totalCount,0),tC=repos.reduce((s,r)=>s+r.closedIssues.totalCount,0),tP=repos.reduce((s,r)=>s+r.pullRequests.totalCount,0);

  return<div style={S.root}><style>{CSS}</style>
    <div style={S.hdr}><div><h1 style={S.h1}><span style={{color:"#58a6ff"}}>MakeIT</span> Tracker</h1><div style={S.sub}>{repos.length} проектов · {tO} open · {tC} closed · {tP} PRs · {oMs.length} milestones</div></div><div style={{display:"flex",gap:8,alignItems:"center"}}><button onClick={load} disabled={loading} style={S.ref}>{loading?"⏳":"↻"}</button><button onClick={()=>{setToken("");setData(null)}} style={S.out}>Выйти</button></div></div>

    {error&&<div style={S.err}>⚠️ {error}</div>}
    {urg.length>0&&<div style={S.urg}><div style={{fontWeight:600,marginBottom:6}}>🔥 Ближайшие дедлайны ({urg.length})</div>{urg.map((m,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",fontSize:13}}><span>{m.rn} → <strong>{m.title}</strong></span><DB dueOn={m.dueOn}/></div>)}</div>}

    <div style={S.tabs}>{[{id:"milestones",l:`Milestones (${oMs.length})`},{id:"repos",l:`Проекты (${repos.length})`},{id:"done",l:`Завершённые (${cMs.length})`}].map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{...S.tab,...(tab===t.id?S.tabA:{})}}>{t.l}</button>)}</div>

    <div style={{animation:"fadeIn .3s ease"}}>
      {tab==="milestones"&&<>{oMs.length===0&&!loading&&<div style={S.emp}>Нет открытых milestones</div>}<div style={S.msG}>{oMs.sort((a,b)=>{if(a.dueOn&&b.dueOn)return new Date(a.dueOn)-new Date(b.dueOn);return a.dueOn?-1:b.dueOn?1:0}).map((m,i)=><div key={i} style={{animation:`fadeIn .3s ease ${i*.05}s both`}}><MC ms={m} rn={m.rn}/></div>)}</div></>}
      {tab==="repos"&&<div style={S.rG}>{repos.map((r,i)=><div key={i} style={{animation:`fadeIn .3s ease ${i*.05}s both`}}><RC r={r}/></div>)}</div>}
      {tab==="done"&&<>{cMs.length===0&&<div style={S.emp}>Пока нет завершённых</div>}<div style={S.msG}>{cMs.map((m,i)=><div key={i} style={{animation:`fadeIn .3s ease ${i*.05}s both`}}><div style={{...S.msC,borderLeft:"3px solid #2ea043",opacity:.7}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><span style={{fontSize:13,fontWeight:600,color:"#2ea043"}}>✓ {m.title}</span><div style={{fontSize:11,color:"#7d8590"}}>{m.rn}</div></div><span style={S.bN}>{fDate(m.dueOn)}</span></div><div style={{marginTop:6}}><PB c={m.ci.totalCount} o={m.oi.totalCount} sz="sm"/></div></div></div>)}</div></>}
    </div>
  </div>;
}

const CSS=`@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=DM+Sans:wght@400;500;600;700&display=swap');
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.6}}@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
*{box-sizing:border-box}::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#333;border-radius:3px}`;

const S={
  root:{fontFamily:"'DM Sans',sans-serif",background:"#0d1117",color:"#c9d1d9",minHeight:"100vh",padding:"20px 24px"},
  hdr:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:12},
  h1:{margin:0,fontSize:22,fontWeight:700,color:"#e6edf3",fontFamily:"'JetBrains Mono',monospace",letterSpacing:"-.5px"},
  sub:{fontSize:12,color:"#7d8590",marginTop:4,fontFamily:"'JetBrains Mono',monospace"},
  ref:{background:"#21262d",border:"1px solid #30363d",color:"#c9d1d9",padding:"6px 12px",borderRadius:6,cursor:"pointer",fontSize:14},
  out:{background:"transparent",border:"1px solid #30363d",color:"#7d8590",padding:"6px 12px",borderRadius:6,cursor:"pointer",fontSize:12},
  urg:{background:"rgba(248,81,73,.08)",border:"1px solid rgba(248,81,73,.25)",borderRadius:8,padding:"12px 16px",marginBottom:16,fontSize:13,color:"#f0883e"},
  tabs:{display:"flex",gap:4,marginBottom:16,borderBottom:"1px solid #21262d"},
  tab:{background:"transparent",border:"none",color:"#7d8590",padding:"8px 16px",cursor:"pointer",fontSize:13,fontFamily:"'DM Sans',sans-serif",borderBottom:"2px solid transparent",transition:"all .2s"},
  tabA:{color:"#e6edf3",borderBottom:"2px solid #58a6ff"},
  msG:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(340px,1fr))",gap:12},
  msC:{background:"#161b22",border:"1px solid #21262d",borderRadius:8,padding:"14px 16px"},
  rG:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))",gap:12},
  rC:{background:"#161b22",border:"1px solid #21262d",borderRadius:8,padding:"14px 16px"},
  rN:{fontSize:15,fontWeight:600,color:"#58a6ff",textDecoration:"none",fontFamily:"'JetBrains Mono',monospace"},
  prv:{fontSize:10,color:"#7d8590",border:"1px solid #30363d",borderRadius:12,padding:"2px 8px"},
  rS:{display:"flex",gap:12,fontSize:12,fontFamily:"'JetBrains Mono',monospace",marginBottom:8},
  lC:{fontSize:11,color:"#7d8590",borderTop:"1px solid #21262d",paddingTop:8,marginTop:4,lineHeight:1.4},
  bD:{fontSize:11,color:"#f85149",background:"rgba(248,81,73,.12)",padding:"2px 8px",borderRadius:12,fontWeight:600,whiteSpace:"nowrap"},
  bW:{fontSize:11,color:"#d29922",background:"rgba(210,153,34,.12)",padding:"2px 8px",borderRadius:12,fontWeight:600,whiteSpace:"nowrap"},
  bI:{fontSize:11,color:"#58a6ff",background:"rgba(88,166,255,.12)",padding:"2px 8px",borderRadius:12,whiteSpace:"nowrap"},
  bN:{fontSize:11,color:"#7d8590",background:"rgba(125,133,144,.12)",padding:"2px 8px",borderRadius:12,whiteSpace:"nowrap"},
  emp:{textAlign:"center",color:"#7d8590",padding:40,fontSize:14},
  err:{background:"rgba(248,81,73,.1)",border:"1px solid rgba(248,81,73,.3)",borderRadius:8,padding:"10px 16px",marginBottom:16,fontSize:13,color:"#f85149"},
  tw:{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"#0d1117",fontFamily:"'DM Sans',sans-serif"},
  tc:{background:"#161b22",border:"1px solid #21262d",borderRadius:12,padding:"32px 28px",textAlign:"center",maxWidth:380,width:"100%"},
  tt:{color:"#e6edf3",fontSize:20,fontWeight:700,margin:"0 0 8px",fontFamily:"'JetBrains Mono',monospace"},
  td:{color:"#7d8590",fontSize:13,lineHeight:1.5,marginBottom:20},
  ti:{width:"100%",padding:"10px 14px",background:"#0d1117",border:"1px solid #30363d",borderRadius:6,color:"#e6edf3",fontSize:14,fontFamily:"'JetBrains Mono',monospace",marginBottom:12,outline:"none"},
  tb:{width:"100%",padding:"10px",background:"#238636",border:"none",borderRadius:6,color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",transition:"opacity .2s"},
};
