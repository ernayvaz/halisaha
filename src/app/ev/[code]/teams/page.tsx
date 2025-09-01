"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useParams, useRouter } from "next/navigation";
import { subscribe, type RealtimeEvent } from '@/lib/realtime';


type Event = { id: string; code: string; name?: string|null; rosterLocked?: boolean; lineupLocked?: boolean };
type Participant = { id: string; isGuest: boolean; guestName: string|null; user?: { id: string; handle: string; displayName: string } };
type Team = { id: string; eventId: string; index: 1|2; name: string; color: string; formation: string };
type Assignment = { id: string; teamId: string; participantId: string; participant: Participant };
type Position = { id: string; teamId: string; participantId: string; x: number; y: number };

export default function TeamsPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const [eventData, setEventData] = useState<Event | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [assignmentsByTeam, setAssignmentsByTeam] = useState<Record<string, number>>({});
  const [asgnTeam1, setAsgnTeam1] = useState<Assignment[]>([]);
  const [asgnTeam2, setAsgnTeam2] = useState<Assignment[]>([]);
  const [posTeam1, setPosTeam1] = useState<Position[]>([]);
  const [posTeam2, setPosTeam2] = useState<Position[]>([]);
  const [isOwner, setIsOwner] = useState<boolean>(false);
  const [busy, setBusy] = useState(false);
  const [optimisticUpdate, setOptimisticUpdate] = useState<any>(null);
  const [guestOpen, setGuestOpen] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState<Participant | null>(null);
  const [playerCard, setPlayerCard] = useState<any>(null);

  const showPlayerCard = async (participant: Participant) => {
    setSelectedPlayer(participant);
    setPlayerCard(null);
    
    if (!participant.isGuest && participant.user?.id) {
      try {
        const response = await fetch(`/api/users/${participant.user.id}/card`);
        if (response.ok) {
          const card = await response.json();
          setPlayerCard(card);
        }
      } catch (error) {
        console.error('Failed to load player card:', error);
      }
    }
  };

  function positionsForFormation(formation: string): { x:number; y:number }[] {
    const parts = formation.split('-').map((n)=>parseInt(n,10));
    const a = parts[1]||0, b = parts[2]||0, c = parts[3]||0;
    const xs = [0.28, 0.56, 0.86];
    const spread = (count: number): number[] => {
      if (count <= 0) return [];
      if (count === 1) return [0.5];
      const ys: number[] = [];
      for (let i=0;i<count;i++) ys.push(0.2 + (i*(0.6/(count-1))));
      return ys;
    };
    const out: {x:number;y:number}[] = [];
    out.push({ x: 0.14, y: 0.5 });
    [a,b,c].forEach((cnt, idx)=>{
      const ys = spread(cnt);
      ys.forEach((y)=>out.push({ x: xs[idx], y }));
    });
    return out;
  }

  async function gateIfNeeded(code: string) {
    try {
      const e = await fetch(`/api/events?code=${encodeURIComponent(code)}`).then(r=>r.json());
      const pr = await fetch(`/api/events/${e.id}/poll`);
      if (!pr.ok) return;
      const poll = await pr.json();
      const now = new Date();
      const startsAt = new Date(poll.startsAt);
      const endsAt = new Date(poll.endsAt);
      if (poll.finalized || now < startsAt || now > endsAt) return;
      const me = await fetch('/api/me').then(r=>r.ok?r.json():null).catch(()=>null);
      if (!me?.id) return;
      const plist: Participant[] = await fetch(`/api/events/${e.id}/participants`).then(r=>r.json());
      const mine = plist.find(p=>p.user?.id===me.id);
      if (!mine) return;
      const hasVoted = Array.isArray(poll.votes) && poll.votes.some((v:any)=>v.voterParticipantId===mine.id);
      if (!hasVoted) router.push(`/ev/${code}/mvp`);
    } catch {}
  }

  useEffect(() => {
    const code = params?.code as string;
    if (!code) return;
    gateIfNeeded(code);
    const run = async () => {
      const e = await fetch(`/api/events?code=${encodeURIComponent(code)}`).then(r=>r.json());
      setEventData(e);
      const [plist, tlist, me] = await Promise.all([
        fetch(`/api/events/${e.id}/participants`).then((r)=>r.json()),
        fetch(`/api/events/${e.id}/teams`).then((r)=>r.json()),
        fetch('/api/me').then(r=>r.ok?r.json():null).catch(()=>null),
      ]);
      setParticipants(plist); setTeams(tlist);
      if (me?.id) {
        const mine = plist.find((p: Participant)=>p.user?.id === me.id);
        setIsOwner(mine?.role === 'owner');
      } else setIsOwner(false);
      const counts = Object.fromEntries(await Promise.all(tlist.map(async (t: Team)=>{
        const asg = await fetch(`/api/teams/${t.id}/assignments`).then(r=>r.json());
        return [t.id, asg.length];
      })));
      setAssignmentsByTeam(counts);
      await ensureFormationIfMissing(e.id, tlist, counts);
      await refreshTeamData(e.id, tlist);
    };
    run();
    let unsub = () => {};
    (async () => {
      const e = await fetch(`/api/events?code=${encodeURIComponent(code)}`).then(x=>x.json());
      unsub = subscribe(e.id, (evt: RealtimeEvent)=>{
        if (evt.type==='teams_updated' || evt.type==='assignments_updated' || evt.type==='flags_updated' || evt.type==='positions_updated') {
          gateIfNeeded(code);
          Promise.all([
            fetch(`/api/events/${e.id}/participants`).then((r)=>r.json()).then(setParticipants),
            fetch(`/api/events/${e.id}/teams`).then((r)=>r.json()).then(async (tlist: Team[])=>{
              setTeams(tlist);
              const counts = Object.fromEntries(await Promise.all(tlist.map(async (t: Team)=>{
                const asg = await fetch(`/api/teams/${t.id}/assignments`).then(r=>r.json());
                return [t.id, asg.length];
              })));
              setAssignmentsByTeam(counts);
              await ensureFormationIfMissing(e.id, tlist, counts);
              await refreshTeamData(e.id, tlist);
            }),
          ]);
        }
      });
    })();
    return () => unsub();
  }, [params?.code]);

  const ensureFormationIfMissing = async (eventId: string, tlist: Team[], counts: Record<string, number>) => {
    for (const t of tlist) {
      if (!t.formation) {
        const n = counts[t.id] || 0;
        const opts = optionsForSize(n).map(o=>o.v);
        const pick = opts.length ? opts[Math.floor(Math.random()*opts.length)] : '1-2-2-1';
        await fetch(`/api/events/${eventId}/teams`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ index: t.index, name: t.name, formation: pick }) });
      }
    }
  };

  const refreshTeamData = async (eventId: string, tlist: Team[]) => {
    const t1 = tlist.find(t=>t.index===1);
    const t2 = tlist.find(t=>t.index===2);
    if (t1) {
      const [a, p] = await Promise.all([
        fetch(`/api/teams/${t1.id}/assignments`).then(r=>r.json()),
        fetch(`/api/teams/${t1.id}/positions`).then(r=>r.json()),
      ]);
      setAsgnTeam1(a);
      setPosTeam1(p);
    }
    if (t2) {
      const [a, p] = await Promise.all([
        fetch(`/api/teams/${t2.id}/assignments`).then(r=>r.json()),
        fetch(`/api/teams/${t2.id}/positions`).then(r=>r.json()),
      ]);
      setAsgnTeam2(a);
      setPosTeam2(p);
    }
  };

  const team = (idx: 1|2) => teams.find(t=>t.index===idx) as Team | undefined;

  const upsertTeam = async (index: 1|2, partial: Partial<Pick<Team,'name'|'color'|'formation'>>) => {
    if (!eventData || !isOwner || busy) return;
    setBusy(true);
    
          // Optimistic update
      const currentTeam = team(index);
      const defaultColors = { 1: '#dc2626', 2: '#f59e0b' }; // dark red, sunset yellow
      const updatedTeam = { 
        ...currentTeam, 
        name: partial.name ?? currentTeam?.name ?? `Team ${index}`, 
        color: partial.color ?? currentTeam?.color ?? defaultColors[index],
        formation: partial.formation ?? currentTeam?.formation ?? '1-2-2-1'
      };
    const other = teams.filter(x=>x.index!==index);
    setTeams([...other, updatedTeam as Team].sort((a,b)=>a.index-b.index));
    
    try {
    const body = { index, name: partial.name ?? team(index)?.name ?? `Team ${index}`, color: partial.color ?? team(index)?.color, formation: partial.formation ?? team(index)?.formation };
    const r = await fetch(`/api/events/${eventData.id}/teams`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const t = await r.json();
      const finalOther = teams.filter(x=>x.index!==index);
      setTeams([...finalOther, t].sort((a,b)=>a.index-b.index));
    } catch (error) {
      console.error('Team update failed:', error);
      // Revert optimistic update on error
      const revertOther = teams.filter(x=>x.index!==index);
      setTeams([...revertOther, currentTeam as Team].sort((a,b)=>a.index-b.index));
    }
    setBusy(false);
  };

  const assign = async (idx: 1|2, participantId: string) => {
    const t = team(idx);
    if (!t) return;
    
    // Check if player is already in the selected team
      const from1 = asgnTeam1.find(a=>a.participantId===participantId);
      const from2 = asgnTeam2.find(a=>a.participantId===participantId);
      const participant = participants.find(p=>p.id===participantId);
      if (!participant) return;
    
    // If player is already in the selected team, do nothing
    if ((idx === 1 && from1) || (idx === 2 && from2)) return;
    
      const mkAssignment = (teamId: string): Assignment => ({ id: `local-${participantId}-${teamId}`, teamId, participantId, participant });
    
    // Remove from other team and add to selected team
    if (idx === 1) {
      setAsgnTeam1(prev => [...prev, mkAssignment(t.id)]);
      if (from2) setAsgnTeam2(prev => prev.filter(a => a.participantId !== participantId));
      } else {
      setAsgnTeam2(prev => [...prev, mkAssignment(t.id)]);
      if (from1) setAsgnTeam1(prev => prev.filter(a => a.participantId !== participantId));
      }
    
    // Update counts immediately
      const t1 = team1; const t2 = team2;
      if (t1 && t2) {
      const c1 = idx === 1 ? asgnTeam1.length + 1 - (from1 ? 0 : 0) - (from2 ? 1 : 0) : asgnTeam1.length - (from1 ? 1 : 0);
      const c2 = idx === 2 ? asgnTeam2.length + 1 - (from2 ? 0 : 0) - (from1 ? 1 : 0) : asgnTeam2.length - (from2 ? 1 : 0);
      setAssignmentsByTeam({ ...(assignmentsByTeam||{}), [t1.id]: Math.max(0, c1), [t2.id]: Math.max(0, c2) });
    }

    if (isOwner) {
      // Background API call - first remove from other team, then add to selected team
      try {
        if (from1 || from2) {
          const otherTeamId = from1 ? team1?.id : team2?.id;
          if (otherTeamId) {
            await fetch(`/api/teams/${otherTeamId}/assignments?participantId=${participantId}`, { method: 'DELETE' });
          }
        }
        await fetch(`/api/teams/${t.id}/assignments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ participantId }) });
      } catch (error) {
        // Revert on error
        console.error('Assignment failed:', error);
        await refreshTeamData(eventData!.id, teams);
      }
    }
  };

  const toggleRosterLock = async () => {
    if (!eventData || !isOwner) return;
    const r = await fetch(`/api/events/${eventData.id}/flags`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rosterLocked: !eventData.rosterLocked }) });
    if (r.ok) {
      const d = await r.json();
      setEventData({ ...eventData, rosterLocked: d.rosterLocked });
    }
  };

  const resetEvent = async () => {
    if (!eventData || !isOwner) return;
    if (!confirm('Reset teams and positions? Players will be kept.')) return;
    setBusy(true);
    const r = await fetch(`/api/events/${eventData.id}`, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action: 'soft_reset' }) });
    if (r.ok) {
      const [plist, tlist] = await Promise.all([
        fetch(`/api/events/${eventData.id}/participants`).then((r)=>r.json()),
        fetch(`/api/events/${eventData.id}/teams`).then((r)=>r.json()),
      ]);
      setParticipants(plist);
      setTeams(tlist);
      const counts = Object.fromEntries(await Promise.all(tlist.map(async (t: Team)=>{
        const asg = await fetch(`/api/teams/${t.id}/assignments`).then(r=>r.json());
        return [t.id, asg.length];
      })));
      setAssignmentsByTeam(counts);
      await refreshTeamData(eventData.id, tlist);
    }
    setBusy(false);
  };

  const team1 = useMemo(()=>team(1), [teams]);
  const team2 = useMemo(()=>team(2), [teams]);
  const size1 = team1 ? (assignmentsByTeam[team1.id] || 0) : 0;
  const size2 = team2 ? (assignmentsByTeam[team2.id] || 0) : 0;

  const optionsForSize = (n: number) => {
    const outfield = Math.max(0, n - 1);
    const res: { v: string; label: string }[] = [];
    const seen = new Set<string>();
    for (let d=1; d<=outfield-2; d++) {
      for (let m=1; m<=outfield-d-1; m++) {
        const f = outfield - d - m;
        if (f < 1) continue;
        const tuples = [
          [d,m,f], [d,f,m], [m,d,f], [m,f,d], [f,d,m], [f,m,d],
        ];
        for (const [x,y,z] of tuples) {
          const key = `1-${x}-${y}-${z}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const labelPrefix = `${n}v${n}`;
          res.push({ v: key, label: `${labelPrefix}: ${key}` });
        }
      }
    }
    res.sort((a,b)=>{
      const pa = a.v.split('-').map(Number); const pb = b.v.split('-').map(Number);
      if (pa[1]!==pb[1]) return pa[1]-pb[1];
      if (pa[2]!==pb[2]) return pa[2]-pb[2];
      return pa[3]-pb[3];
    });
    if (res.length===0) res.push({ v: '1-1-1-1', label: `${n}v${n}` });
    return res;
  };

  function textColorFor(bg: string): string {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(bg);
    if (!m) return '#000';
    const r = parseInt(m[1],16), g = parseInt(m[2],16), b = parseInt(m[3],16);
    const lum = (0.2126*r + 0.7152*g + 0.0722*b)/255;
    return lum < 0.5 ? '#fff' : '#000';
  }
  const bubble = (name: string, color?: string) => {
    const bg = color || '#86efac';
    const fg = textColorFor(bg);
    return (
      <div className="w-6 h-6 rounded-full border-2 border-white shadow flex items-center justify-center text-[10px] font-semibold" style={{ backgroundColor: bg, color: fg }} title={name}>
        {(name||'?').slice(0,1).toUpperCase()}
      </div>
    );
  };

  const MVPBadge = ({ p }: { p: Participant }) => {
    const b = (p.user as any)?.badges && (p.user as any).badges[0];
    if (!b) return null;
    return <span title={`MVP Lv${b.level}`} className="ml-1 text-[10px]">🏅</span>;
  };

  const HalfField = ({ team, asgn, pos, setPos }: { team?: Team; asgn: Assignment[]; pos: Position[]; setPos: Dispatch<SetStateAction<Position[]>> }) => {
    const fieldRef = useRef<HTMLDivElement | null>(null);
    const draggingRef = useRef<{ id: string } | null>(null);
    if (!team) return null;
    const labelFor = (pid: string) => {
      const a = asgn.find(x=>x.participantId===pid);
      const label = a?.participant.isGuest ? (a?.participant.guestName||'Guest') : (a?.participant.user?.displayName || a?.participant.user?.handle || 'Player');
      return label;
    };
    const tokenPos = (idx: number, pid: string) => {
      const p = pos.find(x=>x.participantId===pid);
      if (p) return { x: p.x, y: p.y };
      const preset = positionsForFormation(team.formation);
      if (idx < preset.length) return preset[idx];
      const k = idx - preset.length; const row = k % 4; const col = Math.floor(k/4);
      return { x: Math.min(0.95, 0.65 + col*0.1), y: 0.2 + row*0.2 };
    };
    const clamp = (v:number,min:number,max:number)=>Math.min(Math.max(v,min),max);
    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>, pid: string) => {
      if (!fieldRef.current) return;
      if (eventData?.lineupLocked) return;
      draggingRef.current = { id: pid };
      try { (e.target as Element).setPointerCapture(e.pointerId); } catch {}
    };
    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      if (!fieldRef.current || !draggingRef.current) return;
      const rect = fieldRef.current.getBoundingClientRect();
      const x = clamp((e.clientX - rect.left)/rect.width,0,1);
      const y = clamp((e.clientY - rect.top)/rect.height,0,1);
      const id = draggingRef.current.id;
      setPos(prev=>{
        const idx = prev.findIndex(p=>p.participantId===id);
        if (idx>=0){ const copy=[...prev]; copy[idx] = { ...copy[idx], x, y }; return copy; }
        return [...prev, { id: `tmp-${id}`, teamId: team.id, participantId: id, x, y }];
      });
    };
    const onPointerUp = async () => {
      if (!draggingRef.current || !team) return;
      const id = draggingRef.current.id; draggingRef.current = null;
      const posi = pos.find(p=>p.participantId===id);
      if (!posi) return;
      if (!eventData?.lineupLocked) {
        await fetch(`/api/teams/${team.id}/positions`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ participantId:id, x: posi.x, y: posi.y }) });
        const fresh = await fetch(`/api/teams/${team.id}/positions`).then(r=>r.json()); setPos(fresh);
      }
    };

    return (
      <div ref={fieldRef} onPointerMove={onPointerMove} onPointerUp={onPointerUp} className="relative w-full h-56 bg-green-700 rounded overflow-hidden">
        <div className="absolute inset-2 border-2 border-white rounded-sm" />
        <div className="absolute right-2 top-[15%] h-[70%] w-[28%] border-2 border-white" />
        <div className="absolute right-2 top-[35%] h-[30%] w-[12%] border-2 border-white" />
        <div className="absolute w-1.5 h-1.5 bg-white rounded-full" style={{ right: '18%', top: '50%', transform: 'translateY(-50%)' }} />
        <div className="absolute top-1/2 -translate-y-1/2 -left-8 w-20 h-20 border-2 border-white rounded-full" />

        {asgn.map((a, i)=>{
          const posi = tokenPos(i, a.participantId);
          const label = labelFor(a.participantId);
          const part = a.participant;
          return (
            <div key={a.id} className="absolute" style={{ left: `${posi.x*100}%`, top: `${posi.y*100}%`, transform:'translate(-50%,-50%)' }} 
                 onPointerDown={(e)=>onPointerDown(e, a.participantId)}
                 onClick={(e) => {
                   e.stopPropagation();
                   showPlayerCard(part);
                 }}>
              <div className="relative cursor-pointer">
                {bubble(label, team.color)}
                {!part.isGuest && (
                  <span className="absolute -top-2 -right-2 text-[10px]">{(part.user as any)?.badges?.length? '🏅':''}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const addGuest = async (name: string) => {
    if (!eventData || !name) return;
    try {
      const r = await fetch(`/api/events/${eventData.id}/participants`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'join', guestName: name }) });
      if (!r.ok) throw new Error('guest add failed');
    } finally {
      // Always refresh lists to reflect latest state
      const [plist, tlist] = await Promise.all([
        fetch(`/api/events/${eventData.id}/participants`).then(r=>r.json()),
        fetch(`/api/events/${eventData.id}/teams`).then(r=>r.json()),
      ]);
      setParticipants(plist);
      await refreshTeamData(eventData.id, tlist);
    }
  };

  if (!eventData) return <main className="p-6 max-w-4xl mx-auto">Loading…</main>;

  return (
    <main className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Teams</h1>
        <div className="flex items-center gap-2">
          <button onClick={toggleRosterLock} disabled={!isOwner} className="border px-3 py-1 rounded disabled:opacity-50">Roster Lock: {eventData.rosterLocked? 'On':'Off'}</button>
          <button onClick={resetEvent} disabled={!isOwner} className="border px-3 py-1 rounded text-red-600 disabled:opacity-50">Reset Event</button>
        </div>
      </div>
      <p className="text-sm text-gray-500">Assign players via → buttons or use Auto-balance. Only the creator can change teams and positions.</p>
      {!isOwner && <p className="text-xs text-gray-500">You can rearrange locally for preview. Changes are not saved.</p>}

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="space-y-4">
          <div className="border rounded p-3">
            <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="font-medium">Team 1</h2>
            <input disabled={!isOwner} type="color" defaultValue={team1?.color||'#dc2626'} onChange={(e)=>{ const v=e.target.value.toLowerCase(); // forbid pitch-like dark green
              if (['#166534','#14532d','#065f46','#064e3b'].includes(v)) { e.target.value = '#dc2626'; upsertTeam(1,{color:'#dc2626'}); } else { upsertTeam(1,{color:v}); } }} />
          </div>
          <input disabled={!isOwner} className="border rounded p-2 w-full disabled:opacity-50" placeholder="Team name" defaultValue={team1?.name||''} onBlur={(e)=>upsertTeam(1,{name:e.target.value||'Team 1'})} />
          <select disabled={!isOwner} className="border rounded p-2 w-full disabled:opacity-50" value={team1?.formation||''} onChange={(e)=>upsertTeam(1,{formation:e.target.value})}>
            {optionsForSize(size1).map(o=> (
              <option key={o.v} value={o.v}>{o.label}</option>
            ))}
          </select>
          <p className="text-[11px] text-gray-500">Players: {size1} • Allowed formations depend on team size.</p>
            </div>
            <div className="space-y-2">
              <h3 className="font-medium">Team 1 Roster</h3>
              <ul className="space-y-1">
                {asgnTeam1.map(a=> (
                  <li key={a.id} className="py-1 text-sm flex justify-between items-center">
                    <span>{a.participant.isGuest ? (a.participant.guestName||'Guest Player') : (a.participant.user?.displayName || a.participant.user?.handle)}</span>
                    <button className="text-xs border rounded px-2 py-0.5" onClick={async()=>{ await fetch(`/api/teams/${team1!.id}/assignments?participantId=${a.participantId}`, { method:'DELETE' }); const plist = await fetch(`/api/events/${eventData!.id}/participants`).then(r=>r.json()); setParticipants(plist); await refreshTeamData(eventData!.id, teams); }}>Remove</button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <HalfField team={team1} asgn={asgnTeam1} pos={posTeam1} setPos={setPosTeam1} />
          
          <div className="border rounded p-3">
          <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="font-medium">Team 2</h2>
            <input disabled={!isOwner} type="color" defaultValue={team2?.color||'#f59e0b'} onChange={(e)=>{ const v=e.target.value.toLowerCase(); if (['#166534','#14532d','#065f46','#064e3b'].includes(v)) { e.target.value = '#f59e0b'; upsertTeam(2,{color:'#f59e0b'}); } else { upsertTeam(2,{color:v}); } }} />
          </div>
          <input disabled={!isOwner} className="border rounded p-2 w-full disabled:opacity-50" placeholder="Team name" defaultValue={team2?.name||''} onBlur={(e)=>upsertTeam(2,{name:e.target.value||'Team 2'})} />
          <select disabled={!isOwner} className="border rounded p-2 w-full disabled:opacity-50" value={team2?.formation||''} onChange={(e)=>upsertTeam(2,{formation:e.target.value})}>
            {optionsForSize(size2).map(o=> (
              <option key={o.v} value={o.v}>{o.label}</option>
            ))}
          </select>
          <p className="text-[11px] text-gray-500">Players: {size2} • Allowed formations depend on team size.</p>
            </div>
            <div className="space-y-2">
              <h3 className="font-medium">Team 2 Roster</h3>
              <ul className="space-y-1">
                {asgnTeam2.map(a=> (
                  <li key={a.id} className="py-1 text-sm flex justify-between items-center">
                    <span>{a.participant.isGuest ? (a.participant.guestName||'Guest Player') : (a.participant.user?.displayName || a.participant.user?.handle)}</span>
                    <button className="text-xs border rounded px-2 py-0.5" onClick={async()=>{ await fetch(`/api/teams/${team2!.id}/assignments?participantId=${a.participantId}`, { method:'DELETE' }); const plist = await fetch(`/api/events/${eventData!.id}/participants`).then(r=>r.json()); setParticipants(plist); await refreshTeamData(eventData!.id, teams); }}>Remove</button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <HalfField team={team2} asgn={asgnTeam2} pos={posTeam2} setPos={setPosTeam2} />
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border rounded p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium">Players</h3>
            <button onClick={async()=>{ if (!eventData) return; const count = participants.filter(p=>p.isGuest).length + 1; const defaultName = `Guest ${count}`; await addGuest(defaultName); }} className="text-xs border rounded px-2 py-1">+1 Guest</button>
          </div>
          <ul className="space-y-2">
            {participants.map((p)=> (
              <li key={p.id} className="py-2 flex justify-between items-center">
                <span className="flex items-center gap-1">
                  <div className="w-6 h-6 rounded-full bg-green-600 text-white text-[11px] flex items-center justify-center cursor-pointer" 
                       title={p.isGuest ? (p.guestName || 'Guest Player') : (p.user?.displayName || p.user?.handle)}
                       onClick={() => showPlayerCard(p)}>
                    {(p.isGuest ? (p.guestName || 'G') : (p.user?.displayName || p.user?.handle || 'P')).slice(0,1).toUpperCase()}
                  </div>
                  {p.isGuest ? (
                    <input className="text-sm bg-transparent border-b border-dashed focus:outline-none" defaultValue={p.guestName || `Guest ${participants.filter(x=>x.isGuest).indexOf(p)+1}`} onBlur={async(e)=>{ const val=e.target.value.trim(); if (!val) return; await fetch(`/api/participants/${p.id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ guestName: val }) }); const plist = await fetch(`/api/events/${eventData!.id}/participants`).then(r=>r.json()); setParticipants(plist); }} />
                  ) : (
                    <span className="text-sm cursor-pointer hover:text-blue-600" onClick={() => showPlayerCard(p)}>{p.user?.displayName || p.user?.handle}</span>
                  )}
                  {!p.isGuest && <MVPBadge p={p} />}
                </span>
                <div className="flex gap-2">
                    {(() => { 
                      const inTeam1 = asgnTeam1.some(a=>a.participantId===p.id);
                      const inTeam2 = asgnTeam2.some(a=>a.participantId===p.id);
                      const c = team1?.color || '#dc2626'; 
                      return <button 
                        onClick={()=>assign(1,p.id)} 
                        className={`text-xs border rounded px-2 py-1 ${inTeam1 ? 'ring-2 ring-offset-1 ring-gray-400' : ''}`}
                        style={{ backgroundColor: c, color: textColorFor(c), opacity: inTeam2 ? 0.5 : 1 }}
                        disabled={inTeam1}
                      >
                        Team 1
                      </button>; 
                    })()}
                    {(() => { 
                      const inTeam1 = asgnTeam1.some(a=>a.participantId===p.id);
                      const inTeam2 = asgnTeam2.some(a=>a.participantId===p.id);
                      const c = team2?.color || '#f59e0b'; 
                      return <button 
                        onClick={()=>assign(2,p.id)} 
                        className={`text-xs border rounded px-2 py-1 ${inTeam2 ? 'ring-2 ring-offset-1 ring-gray-400' : ''}`}
                        style={{ backgroundColor: c, color: textColorFor(c), opacity: inTeam1 ? 0.5 : 1 }}
                        disabled={inTeam2}
                      >
                        Team 2
                      </button>; 
                    })()}
                  <button onClick={async()=>{ if (!eventData || !isOwner) return; await fetch(`/api/teams/${team1?.id}/assignments?participantId=${p.id}`, { method:'DELETE' }).catch(()=>{}); await fetch(`/api/teams/${team2?.id}/assignments?participantId=${p.id}`, { method:'DELETE' }).catch(()=>{}); await fetch(`/api/events/${eventData.id}/participants`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ mode:'view' }) }).catch(()=>{}); const plist = await fetch(`/api/events/${eventData.id}/participants`).then(r=>r.json()); setParticipants(plist); }} className="text-xs border rounded px-2 py-1">Remove</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <TeamBalance eventId={eventData.id} rosterLocked={Boolean(eventData.rosterLocked)} isOwner={isOwner} />
            <button onClick={async()=>{ if (!eventData) return; await fetch(`/api/events/${eventData.id}/snapshot`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ note: 'manual-save' }) }); alert('Saved'); }} className="border px-3 py-2 rounded">Save</button>
          </div>
        </div>
      </section>
      
      {/* Modern Player Card Modal */}
      {selectedPlayer && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setSelectedPlayer(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden transform transition-all" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="relative bg-gradient-to-br from-blue-600 to-purple-700 px-6 py-8 text-white">
              <button 
                onClick={() => setSelectedPlayer(null)} 
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              
              <div className="text-center">
                <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm text-white text-3xl font-bold flex items-center justify-center mx-auto mb-3 ring-4 ring-white/30">
                  {(selectedPlayer.isGuest ? (selectedPlayer.guestName || 'G') : (selectedPlayer.user?.displayName || selectedPlayer.user?.handle || 'P')).slice(0,1).toUpperCase()}
                </div>
                <h4 className="text-xl font-bold mb-1">
                  {selectedPlayer.isGuest ? (selectedPlayer.guestName || 'Guest Player') : (selectedPlayer.user?.displayName || selectedPlayer.user?.handle)}
                </h4>
                {(selectedPlayer as any).role === 'owner' && (
                  <div className="inline-flex items-center gap-1 bg-yellow-400 text-yellow-900 px-2 py-1 rounded-full text-xs font-medium">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217z" clipRule="evenodd" />
                    </svg>
                    Owner
                  </div>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              {selectedPlayer.isGuest ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <p className="text-gray-500 text-sm">Guest player - no stats available</p>
                </div>
              ) : playerCard ? (
                <div className="space-y-6">
                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-blue-50 rounded-xl p-4 text-center">
                      <div className="text-blue-600 mb-2">
                        <svg className="w-6 h-6 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </div>
                      <div className="text-2xl font-bold text-blue-600 mb-1">{playerCard.pace || '-'}</div>
                      <div className="text-xs font-medium text-blue-700">PACE</div>
                    </div>
                    
                    <div className="bg-red-50 rounded-xl p-4 text-center">
                      <div className="text-red-600 mb-2">
                        <svg className="w-6 h-6 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                        </svg>
                      </div>
                      <div className="text-2xl font-bold text-red-600 mb-1">{playerCard.shoot || '-'}</div>
                      <div className="text-xs font-medium text-red-700">SHOOT</div>
                    </div>
                    
                    <div className="bg-green-50 rounded-xl p-4 text-center">
                      <div className="text-green-600 mb-2">
                        <svg className="w-6 h-6 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                      </div>
                      <div className="text-2xl font-bold text-green-600 mb-1">{playerCard.pass || '-'}</div>
                      <div className="text-xs font-medium text-green-700">PASS</div>
                    </div>
                    
                    <div className="bg-purple-50 rounded-xl p-4 text-center">
                      <div className="text-purple-600 mb-2">
                        <svg className="w-6 h-6 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="text-2xl font-bold text-purple-600 mb-1">{playerCard.defend || '-'}</div>
                      <div className="text-xs font-medium text-purple-700">DEFEND</div>
                    </div>
                  </div>

                  {/* Preferred Foot */}
                  <div className="bg-gray-50 rounded-xl p-4 text-center">
                    <div className="text-gray-600 mb-2">
                      <svg className="w-6 h-6 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zM21 5a2 2 0 00-2-2h-4a2 2 0 00-2 2v12a4 4 0 004 4 4 4 0 004-4V5z" />
                      </svg>
                    </div>
                    <div className="text-lg font-semibold text-gray-800 mb-1">
                      {playerCard.foot === 'L' ? 'Left Foot' : playerCard.foot === 'R' ? 'Right Foot' : 'Not specified'}
                    </div>
                    <div className="text-xs font-medium text-gray-600">PREFERRED FOOT</div>
                  </div>

                  {/* Overall Rating */}
                  <div className="text-center">
                    <div className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white px-4 py-2 rounded-full">
                      <span className="text-sm font-medium">Overall Rating:</span>
                      <span className="text-lg font-bold">
                        {Math.round(((playerCard.pace || 0) + (playerCard.shoot || 0) + (playerCard.pass || 0) + (playerCard.defend || 0)) / 4 * 10) / 10}
                      </span>
                      <span className="text-sm">/5</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-gray-500">Loading player stats...</p>
                </div>
              )}
              
              {/* Badges */}
              {!selectedPlayer.isGuest && (selectedPlayer.user as any)?.badges?.length > 0 && (
                <div className="mt-6 pt-6 border-t border-gray-100">
                  <div className="text-center">
                    <h5 className="text-sm font-semibold text-gray-700 mb-3">Achievements</h5>
                    <div className="flex justify-center gap-2 flex-wrap">
                      {(selectedPlayer.user as any).badges.map((badge: any, i: number) => (
                        <div key={i} className="bg-gradient-to-r from-yellow-400 to-yellow-500 text-yellow-900 px-3 py-1 rounded-full text-xs font-bold shadow-sm">
                          🏅 MVP Level {badge.level}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {busy && <p className="text-sm text-gray-500">Processing…</p>}
    </main>
  );
}

function TeamBalance({ eventId, rosterLocked, isOwner }: { eventId: string; rosterLocked: boolean; isOwner: boolean }) {
  const [preview, setPreview] = useState<{ scoreA: number; scoreB: number } | null>(null);
  const run = async () => {
    const r = await fetch(`/api/events/${eventId}/autobalance`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: 'greedy', apply: true }) });
    const d = await r.json();
    setPreview({ scoreA: d.scoreA, scoreB: d.scoreB });
  };
  return (
    <div className="space-y-2">
      <button onClick={run} disabled={rosterLocked || !isOwner} className="bg-green-600 disabled:opacity-50 text-white px-3 py-2 rounded">Team-Balance</button>
      {rosterLocked && <p className="text-xs text-gray-500">Roster is locked. Auto-balance is disabled.</p>}
      {preview && <p className="text-sm text-gray-600">Balanced • Score A: {preview.scoreA} • Score B: {preview.scoreB}</p>}
    </div>
  );
}


