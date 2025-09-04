"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useParams, useRouter } from "next/navigation";
import { subscribe, type RealtimeEvent } from '@/lib/realtime';
import MatchInfo from '@/components/MatchInfo';


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
  const [asgnTeam1, setAsgnTeam1] = useState<Assignment[]>([]);
  const [asgnTeam2, setAsgnTeam2] = useState<Assignment[]>([]);
  const [posTeam1, setPosTeam1] = useState<Position[]>([]);
  const [posTeam2, setPosTeam2] = useState<Position[]>([]);
  const [assignmentsByTeam, setAssignmentsByTeam] = useState<Record<string, number>>({});
  const [isOwner, setIsOwner] = useState<boolean>(false);
  const [busy, setBusy] = useState(false);
  const [optimisticUpdate, setOptimisticUpdate] = useState<any>(null);
  const [addingGuest, setAddingGuest] = useState(false);
  const [lastGuestAddedAt, setLastGuestAddedAt] = useState<number>(0);
  const [guestOpen, setGuestOpen] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState<Participant | null>(null);
  const [playerCard, setPlayerCard] = useState<any>(null);
  const [debounceTimers, setDebounceTimers] = useState<Record<string, NodeJS.Timeout>>({});
  const eventUnsubRef = useRef<() => void>(() => {});
  const teamUnsubsRef = useRef<Record<string, () => void>>({});

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

  function positionsForFormation(formation: string): { x:number; y:number; role: 'goalkeeper' | 'defender' | 'midfielder' | 'forward' }[] {
    const parts = formation.split('-').map((n)=>parseInt(n,10));
    const a = parts[1]||0, b = parts[2]||0, c = parts[3]||0;
    // Rotated: y positions for vertical layout (goal top, midfield bottom)
    const ys = [0.28, 0.56, 0.86];
    const roles = ['defender', 'midfielder', 'forward'] as const;
    const spread = (count: number): number[] => {
      if (count <= 0) return [];
      if (count === 1) return [0.5];
      const xs: number[] = [];
      for (let i=0;i<count;i++) xs.push(0.2 + (i*(0.6/(count-1))));
      return xs;
    };
    const out: {x:number;y:number; role: 'goalkeeper' | 'defender' | 'midfielder' | 'forward'}[] = [];
    // Goalkeeper at top center
    out.push({ x: 0.5, y: 0.14, role: 'goalkeeper' });
    [a,b,c].forEach((cnt, idx)=>{
      const xs = spread(cnt);
      xs.forEach((x)=>out.push({ x, y: ys[idx], role: roles[idx] }));
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
      const [plist, initialTlist, me] = await Promise.all([
        fetch(`/api/events/${e.id}/participants`).then((r)=>r.json()),
        fetch(`/api/events/${e.id}/teams`).then((r)=>r.json()),
        fetch('/api/me').then(r=>r.ok?r.json():null).catch(()=>null),
      ]);
      setParticipants(plist); 
      
      // Ensure teams exist immediately
      let tlist = initialTlist;
      if (tlist.length === 0) {
        // Create default teams if none exist
        const [t1, t2] = await Promise.all([
          fetch(`/api/events/${e.id}/teams`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ index: 1, name: 'Team 1', color: '#dc2626' }) }).then(r=>r.json()),
          fetch(`/api/events/${e.id}/teams`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ index: 2, name: 'Team 2', color: '#f59e0b' }) }).then(r=>r.json())
        ]);
        tlist = [t1, t2];
      }
      setTeams(tlist);
      
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
    // Event-level subscription (participants/teams/flags)
    eventUnsubRef.current?.();
    (async () => {
      const e = await fetch(`/api/events?code=${encodeURIComponent(code)}`).then(x=>x.json());
      eventUnsubRef.current = subscribe(e.id, (evt: RealtimeEvent) => {
        // Skip updates during optimistic windows to prevent assignment resets, but allow non-assignment updates
        if (optimisticUpdate && Date.now() - optimisticUpdate < 1500 && (evt.type === 'assignments_updated' || evt.type === 'teams_updated')) return;
        if (lastGuestAddedAt && Date.now() - lastGuestAddedAt < 2000) return;
        
        if (evt.type === 'participants_updated') {
          fetch(`/api/events/${e.id}/participants`).then(r => r.json()).then(setParticipants).catch(() => {});
        } else if (evt.type === 'teams_updated') {
          (async () => {
            const tlist = await fetch(`/api/events/${e.id}/teams`).then(r => r.json());
            setTeams(tlist);
            // Rewire team-level subscriptions on team changes
            setupTeamSubscriptions(tlist);
          })().catch(()=>{});
        } else if (evt.type === 'assignments_updated') {
          // handled by team-level subscriptions as well; keep as fallback
          setTimeout(() => {
            if (team1?.id) fetch(`/api/teams/${team1.id}/assignments`).then(r=>r.json()).then(setAsgnTeam1).catch(()=>{});
            if (team2?.id) fetch(`/api/teams/${team2.id}/assignments`).then(r=>r.json()).then(setAsgnTeam2).catch(()=>{});
          }, 100);
        } else if (evt.type === 'positions_updated') {
          if (team1?.id) fetch(`/api/teams/${team1.id}/positions`).then(r=>r.json()).then(setPosTeam1).catch(()=>{});
          if (team2?.id) fetch(`/api/teams/${team2.id}/positions`).then(r=>r.json()).then(setPosTeam2).catch(()=>{});
        } else if (evt.type === 'flags_updated') {
          fetch(`/api/events?code=${encodeURIComponent(code)}`).then(r=>r.json()).then(setEventData).catch(()=>{});
        }
      });
    })();
    return () => {
      try { eventUnsubRef.current?.(); } catch {}
      // Teardown team subscriptions
      const subs = teamUnsubsRef.current; teamUnsubsRef.current = {};
      Object.values(subs).forEach((u)=>{ try { u(); } catch {} });
    };
  }, [params?.code]);

  const setupTeamSubscriptions = (tlist: Team[]) => {
    // Unsubscribe from teams that are no longer present
    const current = teamUnsubsRef.current;
    const nextIds = new Set(tlist.map(t=>t.id));
    for (const [tid, unsub] of Object.entries(current)) {
      if (!nextIds.has(tid)) { try { unsub(); } catch {} delete current[tid]; }
    }
    // Subscribe to new teams
    for (const t of tlist) {
      if (!current[t.id]) {
        current[t.id] = subscribe(t.id, (evt: RealtimeEvent) => {
          if (evt.type === 'assignments_updated' && evt.teamId === t.id) {
            fetch(`/api/teams/${t.id}/assignments`).then(r=>r.json()).then((list)=>{
              if (t.index===1) setAsgnTeam1(list); else setAsgnTeam2(list);
            }).catch(()=>{});
          } else if (evt.type === 'positions_updated' && evt.teamId === t.id) {
            fetch(`/api/teams/${t.id}/positions`).then(r=>r.json()).then((list)=>{
              if (t.index===1) setPosTeam1(list); else setPosTeam2(list);
            }).catch(()=>{});
          }
        });
      }
    }
    teamUnsubsRef.current = current;
  };

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

  const assign = (idx: 1|2, participantId: string) => {
    const t = team(idx);
    if (!t) return;
    
    // Check if player is already in the selected team
    const from1 = asgnTeam1.find(a=>a.participantId===participantId);
    const from2 = asgnTeam2.find(a=>a.participantId===participantId);
    const participant = participants.find(p=>p.id===participantId);
    if (!participant) return;
    
    // If player is already in the selected team, do nothing
    if ((idx === 1 && from1) || (idx === 2 && from2)) return;
    
    // Immediate UI feedback for all users
    const mkAssignment = (teamId: string): Assignment => ({ id: `local-${participantId}-${teamId}`, teamId, participantId, participant });
    
    setOptimisticUpdate(Date.now());
    if (idx === 1) {
      setAsgnTeam1(prev => [...prev, mkAssignment(t.id)]);
      if (from2) setAsgnTeam2(prev => prev.filter(a => a.participantId !== participantId));
    } else {
      setAsgnTeam2(prev => [...prev, mkAssignment(t.id)]);
      if (from1) setAsgnTeam1(prev => prev.filter(a => a.participantId !== participantId));
    }
    
    // Counts will be updated by useEffect below

    if (isOwner) {
      // Debounced API call for owners
      const key = `assign-${participantId}`;
      if (debounceTimers[key]) {
        clearTimeout(debounceTimers[key]);
      }
      
      const timer = setTimeout(async () => {
        try {
          if (from1 || from2) {
            const otherTeamId = from1 ? team1?.id : team2?.id;
            if (otherTeamId) {
              await fetch(`/api/teams/${otherTeamId}/assignments?participantId=${participantId}`, { method: 'DELETE' });
            }
          }
          await fetch(`/api/teams/${t.id}/assignments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ participantId }) });
        } catch (error) {
          console.error('Assignment failed:', error);
        } finally {
          setTimeout(()=>setOptimisticUpdate(null), 200);
        }
      }, 300); // 300ms debounce
      
      setDebounceTimers(prev => ({ ...prev, [key]: timer }));
    }
  };

  const addGuest = async () => {
    if (!eventData) return;
    // Determine next sequential guest name from current list
    const existingGuests = participants.filter(p => p.isGuest);
    const nextNumber = (() => {
      const numbers = existingGuests.map(p => {
        const m = /^Guest\s+(\d+)$/.exec(p.guestName || '');
        return m ? parseInt(m[1], 10) : 0;
      }).filter(n => n > 0);
      return numbers.length ? Math.max(...numbers) + 1 : 1;
    })();
    const name = `Guest ${nextNumber}`;

    // Optimistic local insert
    const tmpId = `tmp-${Date.now()}`;
    const tmpGuest: Participant = { id: tmpId, isGuest: true, guestName: name, user: undefined };
    setParticipants(prev => [...prev, tmpGuest]);
    setAddingGuest(true);
    try {
      const r = await fetch(`/api/events/${eventData.id}/participants`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'join', guestName: name }) });
      if (!r.ok) throw new Error('guest_create_failed');
      const created = await r.json();
      setParticipants(prev => prev.map(p => p.id === tmpId ? created : p));
      setLastGuestAddedAt(Date.now());
    } catch (e) {
      // Revert on failure
      setParticipants(prev => prev.filter(p => p.id !== tmpId));
      console.error('Guest creation error:', e);
    } finally {
      setAddingGuest(false);
    }
  };

  const removePlayer = async (participantId: string) => {
    if (!eventData || !isOwner) return;
    if (!confirm('Remove this player from the event?')) return;
    
    try {
      // Remove from both teams
      await fetch(`/api/teams/${team1?.id}/assignments?participantId=${participantId}`, { method:'DELETE' }).catch(()=>{});
      await fetch(`/api/teams/${team2?.id}/assignments?participantId=${participantId}`, { method:'DELETE' }).catch(()=>{});
      
      // Remove participant from event
      await fetch(`/api/events/${eventData.id}/participants/${participantId}`, { method:'DELETE' });
      
      // Refresh participants list
      const plist = await fetch(`/api/events/${eventData.id}/participants`).then(r=>r.json());
      setParticipants(plist);
    } catch (error) {
      console.error('Failed to remove player:', error);
    }
  };

  const team1 = useMemo(()=>team(1), [teams]);
  const team2 = useMemo(()=>team(2), [teams]);
  const size1 = team1 ? (assignmentsByTeam[team1.id] || 0) : 0;
  const size2 = team2 ? (assignmentsByTeam[team2.id] || 0) : 0;

  // Auto-update assignment counts when assignments change
  useEffect(() => {
    if (team1 && team2) {
      setAssignmentsByTeam(prev => ({
        ...prev,
        [team1.id]: asgnTeam1.length,
        [team2.id]: asgnTeam2.length
      }));
    }
  }, [asgnTeam1.length, asgnTeam2.length, team1?.id, team2?.id]);

  // Auto-update formations when team sizes change
  useEffect(() => {
    if (!isOwner || !eventData) return;
    
    const updateFormationIfNeeded = async (team: Team, currentSize: number) => {
      const autoFormation = getAutoFormation(currentSize);
      if (team.formation !== autoFormation) {
        await upsertTeam(team.index as 1|2, { formation: autoFormation });
      }
    };

    if (team1 && size1 > 0) {
      updateFormationIfNeeded(team1, size1);
    }
    if (team2 && size2 > 0) {
      updateFormationIfNeeded(team2, size2);
    }
  }, [size1, size2, team1?.id, team2?.id, isOwner, eventData?.id]);

  const getAutoFormation = (playerCount: number): string => {
    // Always goalkeeper first, then distribute symmetrically
    if (playerCount <= 1) return '1-0-0-0'; // Just goalkeeper
    if (playerCount === 2) return '1-1-0-0'; // Goalkeeper + 1 defender
    if (playerCount === 3) return '1-1-1-0'; // Goalkeeper + 1 defender + 1 midfielder
    if (playerCount === 4) return '1-1-1-1'; // Goalkeeper + 1 defender + 1 midfielder + 1 forward
    if (playerCount === 5) return '1-2-1-1'; // Goalkeeper + 2 defenders + 1 midfielder + 1 forward
    if (playerCount === 6) return '1-2-2-1'; // Goalkeeper + 2 defenders + 2 midfielders + 1 forward
    if (playerCount === 7) return '1-2-2-2'; // Goalkeeper + 2 defenders + 2 midfielders + 2 forwards
    if (playerCount === 8) return '1-3-2-2'; // Goalkeeper + 3 defenders + 2 midfielders + 2 forwards
    if (playerCount === 9) return '1-3-3-2'; // Goalkeeper + 3 defenders + 3 midfielders + 2 forwards
    if (playerCount === 10) return '1-3-3-3'; // Goalkeeper + 3 defenders + 3 midfielders + 3 forwards
    // For 11+ players, keep adding in cycles: defender, midfielder, forward
    const excess = playerCount - 10;
    const base = [3, 3, 3]; // [defenders, midfielders, forwards]
    for (let i = 0; i < excess; i++) {
      base[i % 3]++; // Add to defender, midfielder, forward in cycle
    }
    return `1-${base[0]}-${base[1]}-${base[2]}`;
  };

  const optionsForSize = (n: number) => {
    const autoFormation = getAutoFormation(n);
    const res: { v: string; label: string }[] = [
      { v: autoFormation, label: `${autoFormation} (Auto)` }
    ];
    
    // Add some manual options for flexibility
    const seen = new Set<string>([autoFormation]);
    
    if (n >= 3) {
      // Add a few common formations as alternatives
      const common = ['1-2-2-1', '1-1-2-1', '1-2-1-1'];
      for (const formation of common) {
        if (!seen.has(formation)) {
          seen.add(formation);
          res.push({ v: formation, label: formation });
        }
      }
    }
    
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

  const getPlayerStats = async (participant: Participant) => {
    if (participant.isGuest) {
      // Default stats for guest players
      return { pace: 3, shoot: 3, pass: 3, defend: 3 };
    }
    if (!participant.user?.id) {
      return { pace: 1, shoot: 1, pass: 1, defend: 1 };
    }
    try {
      const response = await fetch(`/api/users/${participant.user.id}/card`);
      if (response.ok) {
        const card = await response.json();
        return {
          pace: card.pace || 1,
          shoot: card.shoot || 1,
          pass: card.pass || 1,
          defend: card.defend || 1
        };
      }
    } catch (error) {
      console.error('Failed to load player stats:', error);
    }
    return { pace: 1, shoot: 1, pass: 1, defend: 1 };
  };

  const calculateOptimalPositions = async (assignments: Assignment[], formation: string) => {
    const preset = positionsForFormation(formation);
    if (assignments.length === 0) return [];

    // Get stats for all players
    const playersWithStats = await Promise.all(
      assignments.map(async (assignment) => {
        const stats = await getPlayerStats(assignment.participant);
        return { assignment, stats };
      })
    );

    // Categorize positions by role
    const positionsByRole = {
      goalkeeper: preset.filter(p => p.role === 'goalkeeper'),
      defender: preset.filter(p => p.role === 'defender'),
      midfielder: preset.filter(p => p.role === 'midfielder'),
      forward: preset.filter(p => p.role === 'forward')
    };

    // Sort players by their best stat for each role
    const sortPlayersByRole = (players: typeof playersWithStats, statKey: keyof typeof players[0]['stats']) => {
      return players.sort((a, b) => {
        const aStat = a.stats[statKey];
        const bStat = b.stats[statKey];
        
        if (aStat !== bStat) {
          return bStat - aStat; // Higher stat first
        }
        
        // Tiebreaker: average of other 3 stats
        const aOtherStats = Object.values(a.stats).filter((_, i) => Object.keys(a.stats)[i] !== statKey);
        const bOtherStats = Object.values(b.stats).filter((_, i) => Object.keys(b.stats)[i] !== statKey);
        const aAvgOther = aOtherStats.reduce((sum, stat) => sum + stat, 0) / aOtherStats.length;
        const bAvgOther = bOtherStats.reduce((sum, stat) => sum + stat, 0) / bOtherStats.length;
        const aTotalScore = aStat + aAvgOther;
        const bTotalScore = bStat + bAvgOther;
        
        if (Math.abs(aTotalScore - bTotalScore) < 0.001) {
          // Random tiebreaker if still equal
          return Math.random() - 0.5;
        }
        
        return bTotalScore - aTotalScore;
      });
    };

    const assignedPlayers = new Set<string>();
    const result: { participantId: string; x: number; y: number; role: string }[] = [];

    // Assign goalkeeper first (highest defend)
    if (positionsByRole.goalkeeper.length > 0 && playersWithStats.length > 0) {
      const sortedByDefend = sortPlayersByRole(playersWithStats, 'defend');
      const goalkeeper = sortedByDefend.find(p => !assignedPlayers.has(p.assignment.participantId));
      if (goalkeeper) {
        const pos = positionsByRole.goalkeeper[0];
        result.push({
          participantId: goalkeeper.assignment.participantId,
          x: pos.x,
          y: pos.y,
          role: 'goalkeeper'
        });
        assignedPlayers.add(goalkeeper.assignment.participantId);
      }
    }

    // Assign forwards (highest shoot)
    const availablePlayers = playersWithStats.filter(p => !assignedPlayers.has(p.assignment.participantId));
    const sortedByShoot = sortPlayersByRole(availablePlayers, 'shoot');
    for (let i = 0; i < Math.min(positionsByRole.forward.length, sortedByShoot.length); i++) {
      const player = sortedByShoot[i];
      const pos = positionsByRole.forward[i];
      result.push({
        participantId: player.assignment.participantId,
        x: pos.x,
        y: pos.y,
        role: 'forward'
      });
      assignedPlayers.add(player.assignment.participantId);
    }

    // Assign midfielders (highest pass)
    const remainingAfterForwards = playersWithStats.filter(p => !assignedPlayers.has(p.assignment.participantId));
    const sortedByPass = sortPlayersByRole(remainingAfterForwards, 'pass');
    for (let i = 0; i < Math.min(positionsByRole.midfielder.length, sortedByPass.length); i++) {
      const player = sortedByPass[i];
      const pos = positionsByRole.midfielder[i];
      result.push({
        participantId: player.assignment.participantId,
        x: pos.x,
        y: pos.y,
        role: 'midfielder'
      });
      assignedPlayers.add(player.assignment.participantId);
    }

    // Assign defenders (highest defend)
    const remainingAfterMidfielders = playersWithStats.filter(p => !assignedPlayers.has(p.assignment.participantId));
    const sortedByDefend = sortPlayersByRole(remainingAfterMidfielders, 'defend');
    for (let i = 0; i < Math.min(positionsByRole.defender.length, sortedByDefend.length); i++) {
      const player = sortedByDefend[i];
      const pos = positionsByRole.defender[i];
      result.push({
        participantId: player.assignment.participantId,
        x: pos.x,
        y: pos.y,
        role: 'defender'
      });
      assignedPlayers.add(player.assignment.participantId);
    }

    // Assign any remaining players to available positions
    const stillRemaining = playersWithStats.filter(p => !assignedPlayers.has(p.assignment.participantId));
    const availablePositions = preset.filter((_, idx) => !result.some(r => {
      const pos = preset[idx];
      return Math.abs(r.x - pos.x) < 0.01 && Math.abs(r.y - pos.y) < 0.01;
    }));
    
    for (let i = 0; i < Math.min(stillRemaining.length, availablePositions.length); i++) {
      const player = stillRemaining[i];
      const pos = availablePositions[i];
      result.push({
        participantId: player.assignment.participantId,
        x: pos.x,
        y: pos.y,
        role: pos.role
      });
    }

    return result;
  };

  const HalfField = ({ team, asgn, pos, setPos }: { team?: Team; asgn: Assignment[]; pos: Position[]; setPos: Dispatch<SetStateAction<Position[]>> }) => {
    const fieldRef = useRef<HTMLDivElement | null>(null);
    const draggingRef = useRef<{ id: string } | null>(null);
    if (!team) return null;
    
    // Auto-position players when assignments change
    useEffect(() => {
      if (asgn.length > 0 && isOwner) {
        calculateOptimalPositions(asgn, team.formation).then(optimalPositions => {
          const newPositions = optimalPositions.map(op => ({
            id: `auto-${op.participantId}`,
            teamId: team.id,
            participantId: op.participantId,
            x: team.index === 2 ? op.x : op.x, // Team 2 gets inverted field
            y: team.index === 2 ? 1 - op.y : op.y
          }));
          setPos(newPositions);
          
          // Save positions to backend if owner
          if (isOwner) {
            newPositions.forEach(async (position) => {
              try {
                await fetch(`/api/teams/${team.id}/positions`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    participantId: position.participantId,
                    x: position.x,
                    y: position.y
                  })
                });
              } catch (error) {
                console.error('Failed to save position:', error);
              }
            });
          }
        });
      }
    }, [asgn.length, team.formation, isOwner, team.id, team.index]);
    
    const labelFor = (pid: string) => {
      const a = asgn.find(x=>x.participantId===pid);
      if (!a) return 'Player';
      if (a.participant.isGuest) return a.participant.guestName || 'Guest';
      return a.participant.user?.displayName || a.participant.user?.handle || 'Player';
    };
    
    const tokenPos = (idx: number, pid: string) => {
      const p = pos.find(x=>x.participantId===pid);
      if (p) return { x: p.x, y: p.y };
      const preset = positionsForFormation(team.formation);
      if (idx < preset.length) {
        const basePos = preset[idx];
        // Team 2 gets inverted field (goal bottom, midfield top)
        if (team.index === 2) {
          return { x: basePos.x, y: 1 - basePos.y };
        }
        return basePos;
      }
      const k = idx - preset.length; const row = k % 4; const col = Math.floor(k/4);
      return { x: Math.min(0.95, 0.65 + col*0.1), y: 0.2 + row*0.2 };
    };
    const clamp = (v:number,min:number,max:number)=>Math.min(Math.max(v,min),max);
    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>, pid: string) => {
      if (!fieldRef.current) return;
      if (eventData?.lineupLocked && !isOwner) return;
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
      if (!eventData?.lineupLocked || isOwner) {
        if (isOwner) {
        await fetch(`/api/teams/${team.id}/positions`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ participantId:id, x: posi.x, y: posi.y }) });
        const fresh = await fetch(`/api/teams/${team.id}/positions`).then(r=>r.json()); setPos(fresh);
        }
        // For non-owners, just update local state for preview
      }
    };

    const isTeam2 = team.index === 2;

    return (
      <div ref={fieldRef} onPointerMove={onPointerMove} onPointerUp={onPointerUp} className="relative w-full h-48 bg-green-700 rounded overflow-hidden border-2 border-gray-300">
        {/* Main field boundary */}
        <div className="absolute inset-2 border-2 border-white rounded-sm" />
        
        {isTeam2 ? (
          /* Team 2: Goal bottom, midfield top */
          <>
            {/* Goal area (bottom) */}
            <div className="absolute bottom-2 left-[15%] w-[70%] h-[28%] border-2 border-white" />
            {/* 6-yard box (bottom) */}
            <div className="absolute bottom-2 left-[35%] w-[30%] h-[12%] border-2 border-white" />
            {/* Penalty spot */}
            <div className="absolute w-1.5 h-1.5 bg-white rounded-full" style={{ left: '50%', bottom: '18%', transform: 'translateX(-50%)' }} />
            {/* Center circle */}
            <div className="absolute left-1/2 -translate-x-1/2 -top-8 w-20 h-20 border-2 border-white rounded-full" />
          </>
        ) : (
          /* Team 1: Goal top, midfield bottom */
          <>
            {/* Goal area (top) */}
            <div className="absolute top-2 left-[15%] w-[70%] h-[28%] border-2 border-white" />
            {/* 6-yard box (top) */}
            <div className="absolute top-2 left-[35%] w-[30%] h-[12%] border-2 border-white" />
            {/* Penalty spot */}
            <div className="absolute w-1.5 h-1.5 bg-white rounded-full" style={{ left: '50%', top: '18%', transform: 'translateX(-50%)' }} />
            {/* Center circle */}
            <div className="absolute left-1/2 -translate-x-1/2 -bottom-8 w-20 h-20 border-2 border-white rounded-full" />
          </>
        )}

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
              <div className="relative cursor-pointer flex flex-col items-center">
              <div className="relative">
                {bubble(label, team.color)}
                {!part.isGuest && (
                  <span className="absolute -top-2 -right-2 text-[10px]">{(part.user as any)?.badges?.length? '🏅':''}</span>
                )}
                </div>
                <div className="text-[8px] text-white font-medium mt-1 max-w-[50px] truncate bg-black/70 rounded px-1 text-center">
                  {label}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  if (!eventData) return <main className="p-6 max-w-4xl mx-auto">Loading…</main>;

  return (
    <main className="p-6 max-w-4xl mx-auto space-y-6">
      <MatchInfo eventCode={params.code} title="Teams" />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={toggleRosterLock} disabled={!isOwner} className="border px-3 py-1 rounded disabled:opacity-50">Roster Lock: {eventData.rosterLocked? 'On':'Off'}</button>
          <button onClick={resetEvent} disabled={!isOwner} className="border px-3 py-1 rounded text-red-600 disabled:opacity-50">Reset Event</button>
        </div>
      </div>
      <p className="text-sm text-gray-500">Assign players via → buttons. Players are automatically positioned based on their stats: Shoot→Forward, Pass→Midfielder, Defend→Defender. Only the creator can change teams and positions.</p>
      {!isOwner && <p className="text-xs text-gray-500">You can rearrange locally for preview. Changes are not saved.</p>}

      {/* Players Section - Top */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border rounded p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium">Players</h3>
            <button onClick={addGuest} disabled={addingGuest || !!eventData?.rosterLocked} className="text-xs border rounded px-2 py-1 disabled:opacity-50 hover:bg-gray-50">
              {addingGuest ? 'Adding...' : '+1 Guest'}
            </button>
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
                    <span className="text-sm">{p.guestName || `Guest ${participants.filter(x=>x.isGuest).indexOf(p)+1}`}</span>
                  ) : (
                    <span className="text-sm cursor-pointer hover:text-blue-600" onClick={() => showPlayerCard(p)}>{p.user?.displayName || p.user?.handle}</span>
                  )}
                  {!p.isGuest && <MVPBadge p={p} />}
                </span>
                <div className="flex gap-2">
                  {(() => { 
                    const inTeam1 = asgnTeam1.some(a=>a.participantId===p.id);
                    const inTeam2 = asgnTeam2.some(a=>a.participantId===p.id);
                    const c = inTeam1 ? (team1?.color || '#dc2626') : '#000000'; 
                    const teamName = team1?.name || 'Team 1';
                    return <button 
                      onClick={()=>assign(1,p.id)} 
                      className={`text-xs border rounded px-2 py-1 font-medium ${inTeam1 ? 'ring-2 ring-offset-1 ring-gray-400' : ''}`}
                      style={{ backgroundColor: c, color: textColorFor(c) }}
                      disabled={inTeam1}
                    >
                      {teamName}
                    </button>; 
                  })()}
                  {(() => { 
                    const inTeam1 = asgnTeam1.some(a=>a.participantId===p.id);
                    const inTeam2 = asgnTeam2.some(a=>a.participantId===p.id);
                    const c = inTeam2 ? (team2?.color || '#f59e0b') : '#000000'; 
                    const teamName = team2?.name || 'Team 2';
                    return <button 
                      onClick={()=>assign(2,p.id)} 
                      className={`text-xs border rounded px-2 py-1 font-medium ${inTeam2 ? 'ring-2 ring-offset-1 ring-gray-400' : ''}`}
                      style={{ backgroundColor: c, color: textColorFor(c) }}
                      disabled={inTeam2}
                    >
                      {teamName}
                    </button>; 
                  })()}
                  {isOwner && <button onClick={()=>removePlayer(p.id)} className="text-xs border rounded px-2 py-1 text-red-600 hover:bg-red-50">Remove</button>}
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

      {/* Teams Layout: Aligned boxes and fields with matching heights */}
      <section className="space-y-6">
        {/* Top Row: Team 1 Box + Team 1 Field (same height) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Team 1 Box */}
          <div className="border rounded p-3 grid grid-cols-1 md:grid-cols-2 gap-4 h-48">
            {/* Team 1 Left: Settings */}
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
              <p className="text-[10px] text-gray-500">Players: {size1}</p>
            </div>
              
            {/* Team 1 Right: Roster */}
            <div className="space-y-2 overflow-y-auto">
              <h3 className="font-medium">Team 1 Roster</h3>
              <ul className="space-y-1">
                {asgnTeam1.map(a=> (
                  <li key={a.id} className="py-1 text-xs flex justify-between items-center">
                    <span>{a.participant.isGuest ? (a.participant.guestName||'Guest Player') : (a.participant.user?.displayName || a.participant.user?.handle)}</span>
                    {isOwner && <button className="text-xs border rounded px-1 py-0.5 text-red-600 hover:bg-red-50" onClick={async()=>{ await fetch(`/api/teams/${team1!.id}/assignments?participantId=${a.participantId}`, { method:'DELETE' }); const plist = await fetch(`/api/events/${eventData!.id}/participants`).then(r=>r.json()); setParticipants(plist); await refreshTeamData(eventData!.id, teams); }}>×</button>}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          
          {/* Team 1 Field - matching height */}
          <div className="h-48">
            <HalfField team={team1} asgn={asgnTeam1} pos={posTeam1} setPos={setPosTeam1} />
          </div>
        </div>

        {/* Bottom Row: Team 2 Field + Team 2 Box (same height) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Team 2 Field - matching height */}
          <div className="h-48">
            <HalfField team={team2} asgn={asgnTeam2} pos={posTeam2} setPos={setPosTeam2} />
          </div>
          
          {/* Team 2 Box */}
          <div className="border rounded p-3 grid grid-cols-1 md:grid-cols-2 gap-4 h-48">
            {/* Team 2 Left: Settings */}
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
              <p className="text-[10px] text-gray-500">Players: {size2}</p>
            </div>
              
            {/* Team 2 Right: Roster */}
            <div className="space-y-2 overflow-y-auto">
              <h3 className="font-medium">Team 2 Roster</h3>
              <ul className="space-y-1">
                {asgnTeam2.map(a=> (
                  <li key={a.id} className="py-1 text-xs flex justify-between items-center">
                    <span>{a.participant.isGuest ? (a.participant.guestName||'Guest Player') : (a.participant.user?.displayName || a.participant.user?.handle)}</span>
                    {isOwner && <button className="text-xs border rounded px-1 py-0.5 text-red-600 hover:bg-red-50" onClick={async()=>{ await fetch(`/api/teams/${team2!.id}/assignments?participantId=${a.participantId}`, { method:'DELETE' }); const plist = await fetch(`/api/events/${eventData!.id}/participants`).then(r=>r.json()); setParticipants(plist); await refreshTeamData(eventData!.id, teams); }}>×</button>}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Modern Dark Player Card Modal */}
      {selectedPlayer && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setSelectedPlayer(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl max-w-sm w-full transform transition-all" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="relative px-6 py-4 border-b border-gray-700">
              <button 
                onClick={() => setSelectedPlayer(null)} 
                className="absolute top-3 right-3 w-6 h-6 rounded-full hover:bg-gray-700 flex items-center justify-center transition-colors"
              >
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-500 to-green-600 text-white text-lg font-bold flex items-center justify-center ring-2 ring-green-400/30">
                  {(selectedPlayer.isGuest ? (selectedPlayer.guestName || 'G') : (selectedPlayer.user?.displayName || selectedPlayer.user?.handle || 'P')).slice(0,1).toUpperCase()}
                </div>
                <div>
                  <h4 className="font-semibold text-white text-lg">
                    {selectedPlayer.isGuest ? (selectedPlayer.guestName || 'Guest Player') : (selectedPlayer.user?.displayName || selectedPlayer.user?.handle)}
                  </h4>
                  {(selectedPlayer as any).role === 'owner' && (
                    <span className="inline-flex items-center gap-1 bg-yellow-500 text-black px-2 py-1 rounded-full text-xs font-bold">
                      ⚡ Owner
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 bg-gray-900">
                             {selectedPlayer.isGuest ? (
                 <div className="space-y-4">
                   {/* Guest Stats */}
                   <div className="grid grid-cols-2 gap-3">
                     <div className="bg-gray-800 rounded-lg p-3 text-center">
                       <div className="text-2xl font-bold text-red-400 mb-1">3</div>
                       <div className="text-xs text-gray-400 uppercase tracking-wide">Pace</div>
                     </div>
                     <div className="bg-gray-800 rounded-lg p-3 text-center">
                       <div className="text-2xl font-bold text-orange-400 mb-1">3</div>
                       <div className="text-xs text-gray-400 uppercase tracking-wide">Shoot</div>
                     </div>
                     <div className="bg-gray-800 rounded-lg p-3 text-center">
                       <div className="text-2xl font-bold text-blue-400 mb-1">3</div>
                       <div className="text-xs text-gray-400 uppercase tracking-wide">Pass</div>
                     </div>
                     <div className="bg-gray-800 rounded-lg p-3 text-center">
                       <div className="text-2xl font-bold text-green-400 mb-1">3</div>
                       <div className="text-xs text-gray-400 uppercase tracking-wide">Defend</div>
                     </div>
                   </div>
                   <div className="text-center pt-3 border-t border-gray-700">
                     <div className="bg-gradient-to-r from-green-500 to-blue-500 text-white px-4 py-2 rounded-full inline-flex items-center gap-2">
                       <span className="text-sm font-medium">Overall</span>
                       <span className="text-lg font-bold">3.0</span>
                       <span className="text-sm opacity-80">/5</span>
                     </div>
                   </div>
                 </div>
               ) : playerCard ? (
                 <div className="space-y-4">
                   {/* Player Stats */}
                   <div className="grid grid-cols-2 gap-3">
                     <div className="bg-gray-800 rounded-lg p-3 text-center">
                       <div className="text-2xl font-bold text-red-400 mb-1">{playerCard.pace || 1}</div>
                       <div className="text-xs text-gray-400 uppercase tracking-wide">Pace</div>
                     </div>
                     <div className="bg-gray-800 rounded-lg p-3 text-center">
                       <div className="text-2xl font-bold text-orange-400 mb-1">{playerCard.shoot || 1}</div>
                       <div className="text-xs text-gray-400 uppercase tracking-wide">Shoot</div>
                     </div>
                     <div className="bg-gray-800 rounded-lg p-3 text-center">
                       <div className="text-2xl font-bold text-blue-400 mb-1">{playerCard.pass || 1}</div>
                       <div className="text-xs text-gray-400 uppercase tracking-wide">Pass</div>
                     </div>
                     <div className="bg-gray-800 rounded-lg p-3 text-center">
                       <div className="text-2xl font-bold text-green-400 mb-1">{playerCard.defend || 1}</div>
                       <div className="text-xs text-gray-400 uppercase tracking-wide">Defend</div>
                     </div>
                   </div>
                   <div className="text-center pt-3 border-t border-gray-700">
                     <div className="bg-gradient-to-r from-green-500 to-blue-500 text-white px-4 py-2 rounded-full inline-flex items-center gap-2">
                       <span className="text-sm font-medium">Overall</span>
                       <span className="text-lg font-bold">
                         {Math.round(((playerCard.pace || 1) + (playerCard.shoot || 1) + (playerCard.pass || 1) + (playerCard.defend || 1)) / 4 * 10) / 10}
                       </span>
                       <span className="text-sm opacity-80">/5</span>
                     </div>
                   </div>
                   {playerCard.foot && (
                     <div className="text-center pt-2">
                       <span className="text-xs text-gray-400 bg-gray-800 px-3 py-1 rounded-full">
                         {playerCard.foot === 'L' ? '👈 Left Foot' : '👉 Right Foot'}
                       </span>
                     </div>
                   )}
                 </div>
               ) : (
                 <div className="text-center py-8">
                   <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mx-auto mb-3"></div>
                   <p className="text-sm text-gray-400">Loading stats...</p>
                 </div>
               )}
              
              {/* Badges */}
              {!selectedPlayer.isGuest && (selectedPlayer.user as any)?.badges?.length > 0 && (
                <div className="pt-4 border-t border-gray-700">
                  <div className="text-center">
                    <div className="flex justify-center gap-2 flex-wrap">
                      {(selectedPlayer.user as any).badges.map((badge: any, i: number) => (
                        <span key={i} className="bg-gradient-to-r from-yellow-500 to-orange-500 text-black px-3 py-1 rounded-full text-xs font-bold shadow-lg">
                          🏆 MVP Lv{badge.level}
                        </span>
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


