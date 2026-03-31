import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabase.js";

const DAYS = ["일","월","화","수","목","금","토"];
const genId = () => Math.random().toString(36).slice(2, 10);
const slotId = (date, hour) => `${date}|${hour}`;
function fmtDate(s) {
  const d = new Date(s + "T12:00:00");
  return { month: d.getMonth()+1, date: d.getDate(), day: DAYS[d.getDay()] };
}
function fmtHour(h) { return `${String(h).padStart(2,"0")}:00`; }
function fmtTime(ts) { const d = new Date(ts); return `${d.getHours()}:${String(d.getMinutes()).padStart(2,"0")}`; }
function getOffsetDay(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0,10); }
function isPast(s) { const t = new Date(); t.setHours(0,0,0,0); return new Date(s + "T00:00:00") < t; }
function dateRangeLabel(dates) {
  if (!dates || dates.length === 0) return "";
  const s = fmtDate(dates[0]), e = fmtDate(dates[dates.length-1]);
  return `${s.month}/${s.date} ~ ${e.month}/${e.date}`;
}

async function loadEvent(id) {
  const { data, error } = await supabase.from("events").select("*").eq("id", id).single();
  return error ? null : data;
}
async function createEvent(event) {
  const { error } = await supabase.from("events").insert(event);
  return !error;
}
async function updateParticipants(eventId, participants) {
  const { error } = await supabase.from("events").update({ participants }).eq("id", eventId);
  return !error;
}
async function loadChats(eventId) {
  const { data } = await supabase.from("chats").select("*").eq("event_id", eventId).order("created_at", { ascending: true });
  return data || [];
}
async function sendChatMsg(eventId, name, text) {
  const { error } = await supabase.from("chats").insert({ event_id: eventId, name, text });
  return !error;
}
async function notifyDiscord(webhookUrl, eventTitle, name, action, slotCount) {
  if (!webhookUrl) return;
  try {
    await fetch(webhookUrl, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [{ title: `🎮 GAMEPLAN · ${eventTitle}`,
        description: action === "join" ? `**${name}** 님이 참가했습니다` : `**${name}** 님이 가능한 시간을 저장했습니다 · ${slotCount}칸`,
        color: 0x00ff88, footer: { text: "GAMEPLAN // set it. fix it." } }] })
    });
  } catch(e) { console.error(e); }
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#06060e;--bg2:#0d0d1c;--bg3:#14142a;--green:#00ff88;--green-dim:#00ff8822;--purple:#7c3aed;--muted:#3d4a60;--text:#b8cce0;--border:#1a1a30;--past:#0e0e1a;--past-text:#252538;}
body{background:var(--bg);color:var(--text);font-family:'Share Tech Mono',monospace;}
::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-track{background:var(--bg2)}::-webkit-scrollbar-thumb{background:var(--muted);border-radius:2px}
.c-wrap{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2rem;background:radial-gradient(ellipse 80% 60% at 50% 0%,#0a0a2a,var(--bg))}
.c-card{width:100%;max-width:560px;background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:2.5rem;box-shadow:0 0 80px #00ff8812}
.c-logo{font-family:'Orbitron',monospace;font-weight:900;font-size:2rem;color:var(--green);letter-spacing:.08em}
.c-sub{color:var(--muted);font-size:.75rem;letter-spacing:.1em;margin-top:.3rem;margin-bottom:2.5rem}
.c-label{display:block;font-size:.7rem;color:var(--green);letter-spacing:.15em;margin-bottom:.5rem}
.c-field{margin-bottom:1.75rem}
.c-input{width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:.7rem 1rem;color:var(--text);font-family:inherit;font-size:.9rem;outline:none;transition:border-color .2s}
.c-input:focus{border-color:var(--green)}.c-input::placeholder{color:var(--muted)}.c-input-opt{border-color:#1e1e38}.c-input-opt:focus{border-color:#5b4fa0}
.days-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:5px}
.month-sep{grid-column:1/-1;font-family:'Orbitron',monospace;font-size:.62rem;color:var(--green);letter-spacing:.15em;padding:.3rem 0 .15rem;border-bottom:1px solid var(--border);margin-bottom:2px}
.day-btn{aspect-ratio:1;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--bg3);border:1px solid var(--border);border-radius:6px;cursor:pointer;transition:all .15s;font-family:inherit;color:var(--text);font-size:.6rem;line-height:1.3}
.day-btn .dm{font-size:.72rem;font-weight:bold}.day-btn.sel{background:var(--green-dim);border-color:var(--green);color:var(--green)}.day-btn.weekend:not(.sel){color:#7c5ce0}.day-btn:hover:not(.sel){border-color:#2a2a50}
.time-row{display:flex;gap:.75rem;align-items:center}
.c-select{flex:1;background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:.6rem .8rem;color:var(--text);font-family:inherit;font-size:.85rem;outline:none;cursor:pointer}.c-select option{background:var(--bg3)}.time-sep{color:var(--muted)}
.btn-make{width:100%;padding:.9rem;background:var(--green);color:#000;font-family:'Orbitron',monospace;font-weight:700;font-size:.85rem;letter-spacing:.1em;border:none;border-radius:8px;cursor:pointer;transition:all .2s;margin-top:.5rem}
.btn-make:hover{box-shadow:0 0 20px #00ff8844,0 0 40px #00ff8820}.btn-make:disabled{opacity:.3;cursor:not-allowed}
.error-msg{color:#ff4466;font-size:.75rem;margin-top:.5rem;text-align:center}
.range-toggle{display:flex;border:1px solid var(--border);border-radius:4px;overflow:hidden}
.rt-btn{padding:.25rem .65rem;background:transparent;border:none;font-family:inherit;font-size:.65rem;cursor:pointer;letter-spacing:.05em;transition:all .15s}
.rt-btn.active{background:var(--green-dim);color:var(--green)}.rt-btn:not(.active){color:var(--muted)}.rt-btn+.rt-btn{border-left:1px solid var(--border)}
.ctrl-btn{padding:.25rem .55rem;background:transparent;border:1px solid var(--border);color:var(--muted);font-family:inherit;font-size:.65rem;border-radius:4px;cursor:pointer;transition:all .15s}.ctrl-btn:hover{border-color:var(--green);color:var(--green)}
.discord-wrap{border:1px solid #1e1e38;border-radius:8px;padding:1rem;background:#090914}
.discord-label{font-size:.7rem;color:#6d5adb;letter-spacing:.1em;margin-bottom:.5rem;display:block}.discord-hint{font-size:.65rem;color:var(--muted);margin-top:.4rem}
.room{display:flex;flex-direction:column;height:100vh;overflow:hidden}
.room-header{padding:.9rem 1.5rem;background:var(--bg2);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem;flex-shrink:0}
.room-title{font-family:'Orbitron',monospace;font-size:1rem;color:var(--green);display:flex;align-items:center;gap:.75rem}
.live-dot{width:8px;height:8px;border-radius:50%;background:var(--green);box-shadow:0 0 8px var(--green);animation:pulse 2s infinite;flex-shrink:0}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
.btn-share{padding:.35rem .9rem;background:transparent;border:1px solid var(--green);color:var(--green);font-family:inherit;font-size:.7rem;border-radius:4px;cursor:pointer;letter-spacing:.08em;transition:all .2s}.btn-share:hover{background:var(--green-dim)}.btn-share.copied{border-color:#00aaff;color:#00aaff}
.room-body{display:grid;grid-template-columns:270px 1fr;flex:1;min-height:0;overflow:hidden}
.panel-l{background:var(--bg2);border-right:1px solid var(--border);padding:1.25rem;overflow-y:auto;display:flex;flex-direction:column;gap:1.5rem}
.panel-r{padding:1.25rem;overflow:auto}
.s-title{font-family:'Orbitron',monospace;font-size:.68rem;color:var(--green);letter-spacing:.15em;margin-bottom:.75rem;display:flex;align-items:center;gap:.5rem}.s-title::after{content:'';flex:1;height:1px;background:var(--border)}
.name-row{display:flex;gap:.5rem}
.name-input{flex:1;background:var(--bg3);border:1px solid var(--border);border-radius:5px;padding:.5rem .75rem;color:var(--text);font-family:inherit;font-size:.85rem;outline:none;transition:border-color .2s}.name-input:focus{border-color:var(--green)}
.btn-enter{padding:.5rem .75rem;background:transparent;border:1px solid var(--green);color:var(--green);font-family:'Orbitron',monospace;font-size:.6rem;border-radius:5px;cursor:pointer;transition:all .2s}.btn-enter:hover{background:var(--green-dim)}
.participants{display:flex;flex-direction:column;gap:.35rem}
.p-tag{display:flex;align-items:center;gap:.6rem;padding:.4rem .7rem;background:var(--bg3);border:1px solid var(--border);border-radius:5px;font-size:.78rem}
.p-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}.p-me{border-color:var(--green);color:var(--green)}.p-count{margin-left:auto;color:var(--muted);font-size:.7rem}
.hint{font-size:.7rem;color:var(--muted);line-height:1.6}
.btn-save{width:100%;padding:.6rem;background:transparent;border:1px solid var(--green);color:var(--green);font-family:'Orbitron',monospace;font-size:.68rem;letter-spacing:.1em;border-radius:5px;cursor:pointer;transition:all .2s}.btn-save:hover{background:var(--green-dim)}.btn-save.saved{border-color:#00aaff;color:#00aaff}.btn-save:disabled{opacity:.3;cursor:not-allowed}
.grid-scroll{overflow-x:auto}.g-table{border-collapse:collapse;width:fit-content}
.g-th{padding:.35rem .4rem;font-size:.65rem;color:var(--text);text-align:center;border:1px solid var(--border);background:var(--bg3);white-space:nowrap;font-weight:normal;line-height:1.4;min-width:48px}
.g-th.past-h{background:var(--past)}.g-th .gm{display:block;font-size:.58rem;color:var(--green);font-family:'Orbitron',monospace;letter-spacing:.04em}.g-th .gd{display:block;font-size:.82rem;font-weight:bold}.g-th .gw{display:block;font-size:.6rem;color:var(--muted)}
.g-th.past-h .gm,.g-th.past-h .gd,.g-th.past-h .gw{color:var(--past-text)}
.past-badge{display:inline-block;font-size:.55rem;background:#13132a;color:#33334a;border:1px solid #22223a;border-radius:3px;padding:0 .3rem;margin-left:.25rem;vertical-align:middle}
.g-td-time{padding:.2rem .5rem;font-size:.62rem;color:var(--muted);border:1px solid var(--border);background:var(--bg3);text-align:right;white-space:nowrap}
.g-td{width:48px;height:27px;border:1px solid var(--border);cursor:pointer;transition:background .1s}.g-td.mine{background:#00ff8840;border-color:#00ff8830}.g-td.mine:hover{background:#00ff8866}.g-td:not(.mine):not(.past-col):hover{background:#ffffff0a}.g-td.past-col{background:var(--past);cursor:default}.g-td.mine.past-col{background:#00ff8815;cursor:default}
.g-td-heat{width:48px;height:27px;border:1px solid var(--border);transition:background .3s;display:flex;align-items:center;justify-content:center;font-size:.65rem;font-weight:bold}.g-td-heat.past-col{opacity:.35}
.legend{display:flex;align-items:center;gap:.5rem;margin-bottom:.75rem;font-size:.7rem;color:var(--muted)}.leg-grad{width:80px;height:10px;border-radius:2px;background:linear-gradient(to right,var(--bg3),var(--green))}
.tab-row{display:flex;gap:.5rem;margin-bottom:.75rem}.tab{padding:.3rem .8rem;background:transparent;border:1px solid var(--border);color:var(--muted);font-family:inherit;font-size:.7rem;border-radius:4px;cursor:pointer;transition:all .2s}.tab.active{border-color:var(--green);color:var(--green);background:var(--green-dim)}
.pg-nav{display:flex;align-items:center;gap:.5rem;margin-bottom:.6rem}.pg-btn{padding:.25rem .6rem;background:transparent;border:1px solid var(--border);font-family:inherit;font-size:.7rem;border-radius:4px;cursor:pointer;transition:all .2s}.pg-btn:not(:disabled){color:var(--green);border-color:var(--green)}.pg-btn:not(:disabled):hover{background:var(--green-dim)}.pg-btn:disabled{color:var(--muted);cursor:default}.pg-label{font-size:.72rem;color:var(--text);flex:1;text-align:center;letter-spacing:.03em}
.chat-panel{border-top:1px solid var(--border);background:var(--bg2);flex-shrink:0}.chat-top{padding:.5rem 1.25rem;border-bottom:1px solid var(--border)}.chat-title{font-family:'Orbitron',monospace;font-size:.68rem;color:var(--green);letter-spacing:.15em}
.chat-msgs{height:140px;overflow-y:auto;padding:.75rem 1.25rem;display:flex;flex-direction:column;gap:.5rem}.chat-msg{font-size:.78rem;line-height:1.5}.chat-msg .au{color:var(--green);margin-right:.4rem}.chat-msg .tm{color:var(--muted);font-size:.65rem;margin-left:.3rem}
.chat-row{display:flex;border-top:1px solid var(--border)}.chat-in{flex:1;background:var(--bg3);border:none;border-right:1px solid var(--border);padding:.6rem 1rem;color:var(--text);font-family:inherit;font-size:.8rem;outline:none}.chat-in:focus{background:#0f0f22}
.btn-send{padding:.6rem 1.25rem;background:var(--green);color:#000;font-family:'Orbitron',monospace;font-size:.65rem;font-weight:700;border:none;cursor:pointer;transition:all .2s}.btn-send:hover{box-shadow:0 0 12px var(--green)}
.center-msg{display:flex;align-items:center;justify-content:center;height:100vh;font-family:'Orbitron',monospace;color:var(--green);font-size:1rem;letter-spacing:.1em;background:var(--bg)}
.no-event{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:1rem;font-family:'Orbitron',monospace;color:#ff4466;background:var(--bg)}
@media(max-width:720px){.room{height:auto;min-height:100vh;overflow:auto}.room-body{grid-template-columns:1fr;overflow:visible}.panel-l{border-right:none;border-bottom:1px solid var(--border);overflow-y:visible}.panel-r{overflow:visible}}
`;

function GridTable({ useDates, hours, mySlots, participants, pNames, total, onCellClick, isMine }) {
  const heatVal = (date, hour) => pNames.filter(n => participants[n]?.includes(slotId(date, hour))).length;
  const heatColor = v => {
    if (v === 0 || total === 0) return "var(--bg3)";
    const r = v / total;
    if (r < 0.33) return `rgba(0,200,100,${0.15+r*0.5})`;
    if (r < 0.67) return `rgba(0,255,136,${0.3+r*0.4})`;
    return `rgba(0,255,136,${0.55+r*0.4})`;
  };
  return (
    <div className="grid-scroll">
      <table className="g-table">
        <thead><tr>
          <th className="g-th" />
          {useDates.map((d,i) => {
            const {month,date,day} = fmtDate(d); const past = isPast(d);
            const showMonth = i===0 || fmtDate(useDates[i-1]).month !== month;
            return (
              <th key={d} className={`g-th${past?" past-h":""}`}>
                {showMonth ? <span className="gm">{month}월</span> : <span className="gm" style={{visibility:"hidden"}}>-</span>}
                <span className="gd">{date}일</span>
                <span className="gw">{day}{past && <span className="past-badge">종료</span>}</span>
              </th>
            );
          })}
        </tr></thead>
        <tbody>
          {hours.map(h => (
            <tr key={h}>
              <td className="g-td-time">{fmtHour(h)}</td>
              {useDates.map(d => {
                const past = isPast(d); const id = slotId(d,h);
                if (isMine) return <td key={d} className={`g-td${mySlots.has(id)?" mine":""}${past?" past-col":""}`} onClick={() => !past && onCellClick && onCellClick(d,h)} />;
                const v = heatVal(d,h);
                const names = pNames.filter(n => participants[n]?.includes(id));
                return <td key={d} className={`g-td-heat${past?" past-col":""}`} style={{background:heatColor(v)}} title={v>0?`${v}명: ${names.join(", ")}`:""}>
                  {v>0 && <span style={{color:v/total>0.5?"#000a":"#fff6"}}>{v}</span>}
                </td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PagNav({ page, setPage, totalPages, visibleDates }) {
  if (totalPages <= 1) return null;
  return (
    <div className="pg-nav">
      <button className="pg-btn" onClick={() => setPage(p=>Math.max(0,p-1))} disabled={page===0}>← 이전</button>
      <span className="pg-label">{dateRangeLabel(visibleDates)}</span>
      <button className="pg-btn" onClick={() => setPage(p=>Math.min(totalPages-1,p+1))} disabled={page===totalPages-1}>다음 →</button>
    </div>
  );
}

function CreateEvent({ onCreated }) {
  const [title,setTitle]=useState(""); const [rangeMode,setRangeMode]=useState(14);
  const [selDates,setSelDates]=useState([]); const [startH,setStartH]=useState(18);
  const [endH,setEndH]=useState(23); const [webhook,setWebhook]=useState("");
  const [creating,setCreating]=useState(false); const [err,setErr]=useState("");
  const nextDays = Array.from({length:rangeMode},(_,i)=>getOffsetDay(i));
  const toggleDate = d => setSelDates(p=>p.includes(d)?p.filter(x=>x!==d):[...p,d].sort());
  const selectAll = () => setSelDates([...nextDays]);
  const clearAll = () => setSelDates([]);
  const hours = Array.from({length:24},(_,i)=>i);
  const dayItems = []; let lastMonth = null;
  nextDays.forEach(d => {
    const {month} = fmtDate(d);
    if (month !== lastMonth) { lastMonth=month; dayItems.push({type:"sep",month,key:`sep-${d}`}); }
    dayItems.push({type:"day",date:d,key:d});
  });
  const create = async () => {
    if (!title.trim()) return setErr("이벤트 이름을 입력해주세요");
    if (selDates.length===0) return setErr("날짜를 하나 이상 선택해주세요");
    if (startH>=endH) return setErr("종료 시간이 시작 시간보다 커야 해요");
    setErr(""); setCreating(true);
    const id = genId();
    const ok = await createEvent({ id, title:title.trim(), dates:selDates,
      hours:Array.from({length:endH-startH},(_,i)=>startH+i), participants:{}, webhook:webhook.trim() });
    if (ok) onCreated(id);
    else { setErr("생성 실패. Supabase 연결을 확인해주세요."); setCreating(false); }
  };
  return (
    <div className="c-wrap"><div className="c-card">
      <div className="c-logo">GAME<span style={{color:"#7c3aed"}}>PLAN</span></div>
      <div className="c-sub">// set it. fix it.</div>
      <div className="c-field">
        <label className="c-label">이벤트 이름</label>
        <input className="c-input" placeholder="예: 롤 내전, 배그 스쿼드..." value={title}
          onChange={e=>setTitle(e.target.value)} onKeyDown={e=>e.key==="Enter"&&create()} />
      </div>
      <div className="c-field">
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:".6rem",flexWrap:"wrap",gap:".4rem"}}>
          <label className="c-label" style={{marginBottom:0}}>날짜 선택 ({selDates.length}일 선택됨)</label>
          <div style={{display:"flex",gap:".4rem",alignItems:"center"}}>
            <div className="range-toggle">
              <button className={`rt-btn${rangeMode===14?" active":""}`} onClick={()=>{setRangeMode(14);clearAll()}}>2주</button>
              <button className={`rt-btn${rangeMode===31?" active":""}`} onClick={()=>{setRangeMode(31);clearAll()}}>1달</button>
            </div>
            <button className="ctrl-btn" onClick={selectAll}>전체</button>
            <button className="ctrl-btn" onClick={clearAll}>초기화</button>
          </div>
        </div>
        <div className="days-grid">
          {dayItems.map(item => item.type==="sep"
            ? <div key={item.key} className="month-sep">{item.month}월</div>
            : (() => { const {month,date,day}=fmtDate(item.date); const isW=["토","일"].includes(day); const isSel=selDates.includes(item.date);
                return <button key={item.key} className={`day-btn${isSel?" sel":""}${isW&&!isSel?" weekend":""}`} onClick={()=>toggleDate(item.date)}>
                  <span className="dm">{month}/{date}</span><span>{day}</span></button>; })()
          )}
        </div>
      </div>
      <div className="c-field">
        <label className="c-label">시간대</label>
        <div className="time-row">
          <select className="c-select" value={startH} onChange={e=>setStartH(+e.target.value)}>
            {hours.slice(0,23).map(h=><option key={h} value={h}>{fmtHour(h)}</option>)}</select>
          <span className="time-sep">~</span>
          <select className="c-select" value={endH} onChange={e=>setEndH(+e.target.value)}>
            {hours.slice(1).map(h=><option key={h} value={h}>{fmtHour(h)}</option>)}</select>
        </div>
      </div>
      <div className="c-field">
        <div className="discord-wrap">
          <label className="discord-label">🎮 DISCORD 알림 (선택사항)</label>
          <input className="c-input c-input-opt" placeholder="웹훅 URL 붙여넣기..." value={webhook} onChange={e=>setWebhook(e.target.value)} />
          <div className="discord-hint">디스코드 채널 설정 → 연동 → 웹훅에서 URL 발급</div>
        </div>
      </div>
      {err && <div className="error-msg">{err}</div>}
      <button className="btn-make" onClick={create} disabled={creating}>{creating?"CREATING...":"방 만들기 →"}</button>
    </div></div>
  );
}

function EventRoom({ eventId }) {
  const [event,setEvent]=useState(null); const [chats,setChats]=useState([]);
  const [myName,setMyName]=useState(""); const [nameInput,setNameInput]=useState("");
  const [mySlots,setMySlots]=useState(new Set()); const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false); const [copied,setCopied]=useState(false);
  const [tab,setTab]=useState("heat"); const [chatInput,setChatInput]=useState("");
  const [heatPage,setHeatPage]=useState(0); const [minePage,setMinePage]=useState(0);
  const [notFound,setNotFound]=useState(false);
  const PAGE_SIZE=7; const chatEndRef=useRef(null);

  const load = useCallback(async () => {
    const e = await loadEvent(eventId);
    if (!e) { setNotFound(true); return; }
    setEvent(e);
    const c = await loadChats(eventId); setChats(c);
  }, [eventId]);

  useEffect(() => { load(); const t=setInterval(load,8000); return ()=>clearInterval(t); }, [load]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({behavior:"smooth"}); }, [chats]);

  const enterName = async () => {
    const n=nameInput.trim(); if(!n) return; setMyName(n);
    if (event?.participants?.[n]) setMySlots(new Set(event.participants[n]));
    await notifyDiscord(event?.webhook,event?.title,n,"join",0);
  };
  const toggleSlot = (date,hour) => {
    if (!myName) return; const id=slotId(date,hour);
    setMySlots(p=>{const ns=new Set(p);ns.has(id)?ns.delete(id):ns.add(id);return ns;}); setSaved(false);
  };
  const saveAvailability = async () => {
    if (!myName||!event||saving) return; setSaving(true);
    const updated = {...event.participants,[myName]:[...mySlots]};
    const ok = await updateParticipants(eventId,updated);
    if (ok) { setEvent(e=>({...e,participants:updated})); setSaved(true);
      await notifyDiscord(event.webhook,event.title,myName,"save",mySlots.size);
      setTimeout(()=>setSaved(false),2500); }
    setSaving(false);
  };
  const handleSendChat = async () => {
    const txt=chatInput.trim(); if(!txt||!myName) return;
    setChatInput(""); await sendChatMsg(eventId,myName,txt);
    const c=await loadChats(eventId); setChats(c);
  };
  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);});
  };

  if (notFound) return <div className="no-event"><div>// 이벤트를 찾을 수 없습니다</div>
    <button className="btn-share" onClick={()=>{window.location.hash="";window.location.reload();}}>새 이벤트 만들기</button></div>;
  if (!event) return <div className="center-msg">LOADING...</div>;

  const {dates,hours,participants,title}=event;
  const pNames=Object.keys(participants||{}); const total=pNames.length;
  const totalPages=Math.ceil((dates?.length||0)/PAGE_SIZE);
  const heatDates=(dates||[]).slice(heatPage*PAGE_SIZE,(heatPage+1)*PAGE_SIZE);
  const mineDates=(dates||[]).slice(minePage*PAGE_SIZE,(minePage+1)*PAGE_SIZE);

  return (
    <div className="room">
      <div className="room-header">
        <div className="room-title"><span className="live-dot"/>{title}</div>
        <div style={{display:"flex",gap:".5rem",alignItems:"center"}}>
          <span style={{fontSize:".72rem",color:"var(--muted)"}}>{total}명 참가</span>
          <button className={`btn-share${copied?" copied":""}`} onClick={copyLink}>{copied?"COPIED ✓":"링크 복사"}</button>
        </div>
      </div>
      <div className="room-body">
        <div className="panel-l">
          <div>
            <div className="s-title">내 이름</div>
            {!myName ? (
              <div className="name-row">
                <input className="name-input" placeholder="닉네임 입력..." value={nameInput}
                  onChange={e=>setNameInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&enterName()} />
                <button className="btn-enter" onClick={enterName}>입장</button>
              </div>
            ) : (
              <div className="p-tag p-me">
                <span className="p-dot" style={{background:"var(--green)",boxShadow:"0 0 6px var(--green)"}}/>
                <span>{myName}</span>
                <span style={{marginLeft:"auto",fontSize:".7rem",color:"var(--muted)"}}>(나)</span>
              </div>
            )}
          </div>
          <div>
            <div className="s-title">참가자 ({total})</div>
            <div className="participants">
              {pNames.length===0 ? <div className="hint">아직 아무도 없어요</div>
                : pNames.map(n=>(
                  <div key={n} className={`p-tag${n===myName?" p-me":""}`}>
                    <span className="p-dot" style={{background:n===myName?"var(--green)":"var(--purple)",boxShadow:n===myName?"0 0 6px var(--green)":"0 0 6px var(--purple)"}}/>
                    <span>{n}</span><span className="p-count">{participants[n]?.length??0}칸</span>
                  </div>
                ))
              }
            </div>
          </div>
          {myName && (
            <div>
              <div className="s-title">내 가능 시간</div>
              <div className="hint" style={{marginBottom:".75rem"}}>클릭으로 선택 · 지난 날짜는 수정 불가</div>
              <GridTable useDates={dates} hours={hours} mySlots={mySlots} participants={participants} pNames={pNames} total={total} onCellClick={toggleSlot} isMine={true}/>
              <button className={`btn-save${saved?" saved":""}`} onClick={saveAvailability} disabled={saving} style={{marginTop:".75rem"}}>
                {saving?"SAVING...":saved?"저장됨 ✓":"가능 시간 저장"}
              </button>
            </div>
          )}
        </div>
        <div className="panel-r">
          <div className="tab-row">
            <button className={`tab${tab==="heat"?" active":""}`} onClick={()=>setTab("heat")}>🔥 히트맵</button>
            <button className={`tab${tab==="mine"?" active":""}`} onClick={()=>setTab("mine")}>👤 내 선택</button>
          </div>
          {tab==="heat" && (
            <>
              <div className="legend"><span>0명</span><div className="leg-grad"/><span>{total}명</span><span style={{marginLeft:".5rem",color:"var(--muted)"}}>// 겹치는 시간대</span></div>
              {total===0 ? <div className="hint">링크를 복사해서 친구들에게 공유하세요!</div>
                : <><PagNav page={heatPage} setPage={setHeatPage} totalPages={totalPages} visibleDates={heatDates}/>
                    <GridTable useDates={heatDates} hours={hours} mySlots={mySlots} participants={participants} pNames={pNames} total={total} isMine={false}/></>}
            </>
          )}
          {tab==="mine" && (!myName ? <div className="hint">이름을 먼저 입력해주세요</div>
            : <><PagNav page={minePage} setPage={setMinePage} totalPages={totalPages} visibleDates={mineDates}/>
                <GridTable useDates={mineDates} hours={hours} mySlots={mySlots} participants={participants} pNames={pNames} total={total} onCellClick={toggleSlot} isMine={true}/></>
          )}
        </div>
      </div>
      <div className="chat-panel">
        <div className="chat-top"><span className="chat-title">// CHAT</span></div>
        <div className="chat-msgs">
          {chats.length===0 ? <div style={{color:"var(--muted)",fontSize:".75rem"}}>대화를 시작해보세요</div>
            : chats.map((m,i)=>(
              <div key={i} className="chat-msg">
                <span className="au">{m.name}</span><span>{m.text}</span>
                <span className="tm">{fmtTime(new Date(m.created_at).getTime())}</span>
              </div>
            ))
          }
          <div ref={chatEndRef}/>
        </div>
        <div className="chat-row">
          <input className="chat-in" placeholder={myName?"메시지 입력...":"먼저 이름을 입력해주세요"} value={chatInput} disabled={!myName}
            onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSendChat()}/>
          <button className="btn-send" onClick={handleSendChat} disabled={!myName}>전송</button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [page,setPage]=useState("loading"); const [eventId,setEventId]=useState(null);
  useEffect(() => {
    const init = () => { const h=window.location.hash.replace("#",""); if(h){setEventId(h);setPage("event");}else setPage("create"); };
    init(); window.addEventListener("hashchange",init); return ()=>window.removeEventListener("hashchange",init);
  }, []);
  return (
    <><style>{CSS}</style>
      {page==="loading"&&<div className="center-msg">LOADING...</div>}
      {page==="create"&&<CreateEvent onCreated={id=>{window.location.hash=id;setEventId(id);setPage("event");}}/>}
      {page==="event"&&eventId&&<EventRoom eventId={eventId}/>}
    </>
  );
}
