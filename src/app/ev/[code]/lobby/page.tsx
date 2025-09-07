"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { subscribe, type RealtimeEvent } from '@/lib/realtime';

type Participant = { id: string; isGuest: boolean; guestName: string|null; role?: string; user?: { id: string; handle: string; displayName: string; badges?: { level: number; count: number }[] } };
type UserCard = { id: string; foot: "L"|"R"|null; pace: number|null; shoot: number|null; pass: number|null; defend: number|null };

export default function Lobby() {
  const params = useParams<{ code: string }>();
  const [eventId, setEventId] = useState<string | null>(null);
  const [eventData, setEventData] = useState<any>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [selected, setSelected] = useState<Participant | null>(null);
  const [selectedCard, setSelectedCard] = useState<UserCard | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    const code = params?.code as string;
    if (!code) return;
    const run = async () => {
      const r = await fetch(`/api/events?code=${encodeURIComponent(code)}`);
      if (!r.ok) return;
      const e = await r.json();
      setEventId(e.id);
      setEventData(e);
      const plist = await fetch(`/api/events/${e.id}/participants`).then(x=>x.json());
      setParticipants(plist);
    };
    run();
    let unsub = () => {};
    (async () => {
      const e = await fetch(`/api/events?code=${encodeURIComponent(code)}`).then(x=>x.json());
      unsub = subscribe(e.id, (evt: RealtimeEvent)=>{
        if (evt.type==='participants_updated' || evt.type==='flags_updated') {
          fetch(`/api/events/${e.id}/participants`).then(x=>x.json()).then(setParticipants);
        }
      });
    })();
    return () => unsub();
  }, [params?.code]);

  useEffect(() => {
    const loadCard = async () => {
      setSelectedCard(null);
      if (!selected?.user?.id) return;
      const r = await fetch(`/api/users/${selected.user.id}/card`);
      if (r.ok) setSelectedCard(await r.json());
    };
    loadCard();
  }, [selected?.user?.id]);

  const MVPBadge = ({ p }: { p: Participant }) => {
    const b = p.user?.badges && p.user.badges[0];
    if (!b) return null;
    return <span title={`MVP Lv${b.level}`} className="ml-2 text-xs inline-flex items-center">🏅 Lv{b.level}</span>;
  };

  const joinTeam = async () => {
    if (!eventId || joining) return;
    setJoining(true);
    try {
      const response = await fetch(`/api/events/${eventId}/participants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'join' })
      });
      if (response.ok) {
        window.location.href = `/ev/${params?.code}/teams`;
      } else {
        throw new Error('Failed to join');
      }
    } catch (error) {
      console.error('Join failed:', error);
      alert('Failed to join the event');
    } finally {
      setJoining(false);
    }
  };

  const continueAsViewer = () => {
    window.location.href = `/ev/${params?.code}/teams`;
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-3xl font-bold text-gray-900">{eventData?.name || 'Football Event'}</h1>
          <p className="text-gray-600 max-w-2xl mx-auto">
            {eventData?.description || 'Join the team to participate in team selection and lineup management, or continue as a viewer to watch the action.'}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <button 
            onClick={joinTeam}
            disabled={joining || eventData?.rosterLocked}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-3 rounded-lg font-semibold shadow-lg transform hover:scale-105 transition-all duration-200 flex items-center gap-2"
          >
            {joining ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Joining...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Join Team
              </>
            )}
          </button>
          
          <button 
            onClick={continueAsViewer}
            className="bg-gray-600 hover:bg-gray-700 text-white px-8 py-3 rounded-lg font-semibold shadow-lg transform hover:scale-105 transition-all duration-200 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Continue as Viewer
          </button>
        </div>

        {/* Participants List */}
        {participants.length > 0 && (
          <div className="bg-white rounded-2xl shadow-xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Current Participants</h2>
                <p className="text-sm text-gray-500">{participants.length} player{participants.length !== 1 ? 's' : ''} joined</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {participants.map((p) => (
                <div 
                  key={p.id} 
                  className="bg-gray-50 hover:bg-gray-100 rounded-xl p-4 transition-all duration-200 cursor-pointer transform hover:scale-105 shadow-sm hover:shadow-md"
                  onClick={() => setSelected(p)}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg ${
                      p.role === 'owner' ? 'bg-yellow-600' : 'bg-green-600'
                    }`}>
                      {(p.isGuest ? (p.guestName || 'G') : (p.user?.displayName || p.user?.handle || 'P')).slice(0,1).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-medium truncate ${
                        p.role === 'owner' ? 'text-yellow-700' : 'text-gray-900'
                      }`}>
                        {p.isGuest ? (p.guestName || 'Guest Player') : (p.user?.displayName || p.user?.handle)}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        {p.role === 'owner' && (
                          <span className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full text-xs font-medium">
                            👑 Owner
                          </span>
                        )}
                        <MVPBadge p={p} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Player Card Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
          <div className="bg-gray-900 rounded-xl shadow-2xl max-w-xs w-full transform transition-all border border-gray-700" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="relative px-4 py-3 border-b border-gray-700">
              <button 
                onClick={() => setSelected(null)} 
                className="absolute top-2 right-2 w-6 h-6 rounded-full hover:bg-gray-700 flex items-center justify-center transition-colors"
              >
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-600 text-white text-sm font-bold flex items-center justify-center">
                  {(selected.isGuest ? (selected.guestName || 'G') : (selected.user?.displayName || selected.user?.handle || 'P')).slice(0,1).toUpperCase()}
                </div>
                <div>
                  <h4 className="font-medium text-white text-sm">
                    {selected.isGuest ? (selected.guestName || 'Guest Player') : (selected.user?.displayName || selected.user?.handle)}
                  </h4>
                  {selected.role === 'owner' && (
                    <span className="inline-flex items-center gap-1 bg-yellow-600 text-yellow-100 px-2 py-0.5 rounded text-xs">
                      👑 Owner
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-4 bg-gray-900">
              {selected.isGuest ? (
                <div className="space-y-2">
                  {/* Guest Stats */}
                  <div className="grid grid-cols-4 gap-1">
                    <div className="text-center p-2 bg-gray-800 rounded">
                      <div className="text-sm font-bold text-red-400">3</div>
                      <div className="text-xs text-gray-400">Pace</div>
                    </div>
                    
                    <div className="text-center p-2 bg-gray-800 rounded">
                      <div className="text-sm font-bold text-orange-400">3</div>
                      <div className="text-xs text-gray-400">Shoot</div>
                    </div>
                    
                    <div className="text-center p-2 bg-gray-800 rounded">
                      <div className="text-sm font-bold text-blue-400">3</div>
                      <div className="text-xs text-gray-400">Pass</div>
                    </div>
                    
                    <div className="text-center p-2 bg-gray-800 rounded">
                      <div className="text-sm font-bold text-green-400">3</div>
                      <div className="text-xs text-gray-400">Defend</div>
                    </div>
                  </div>
                  
                  <div className="text-center pt-2 border-t border-gray-700">
                    <span className="text-xs text-gray-400">Overall: </span>
                    <span className="text-sm font-bold text-white">3.0</span>
                    <span className="text-xs text-gray-400">/5</span>
                  </div>
                </div>
              ) : selectedCard ? (
                <div className="space-y-2">
                  {/* Player Stats */}
                  <div className="grid grid-cols-4 gap-1">
                    <div className="text-center p-2 bg-gray-800 rounded">
                      <div className="text-sm font-bold text-red-400">{selectedCard.pace || 1}</div>
                      <div className="text-xs text-gray-400">Pace</div>
                    </div>
                    <div className="text-center p-2 bg-gray-800 rounded">
                      <div className="text-sm font-bold text-orange-400">{selectedCard.shoot || 1}</div>
                      <div className="text-xs text-gray-400">Shoot</div>
                    </div>
                    <div className="text-center p-2 bg-gray-800 rounded">
                      <div className="text-sm font-bold text-blue-400">{selectedCard.pass || 1}</div>
                      <div className="text-xs text-gray-400">Pass</div>
                    </div>
                    <div className="text-center p-2 bg-gray-800 rounded">
                      <div className="text-sm font-bold text-green-400">{selectedCard.defend || 1}</div>
                      <div className="text-xs text-gray-400">Defend</div>
                    </div>
                  </div>
                  
                  <div className="text-center pt-2 border-t border-gray-700">
                    <span className="text-xs text-gray-400">Overall: </span>
                    <span className="text-sm font-bold text-white">
                      {Math.round(((selectedCard.pace || 1) + (selectedCard.shoot || 1) + (selectedCard.pass || 1) + (selectedCard.defend || 1)) / 4 * 10) / 10}
                    </span>
                    <span className="text-xs text-gray-400">/5</span>
                  </div>
                  
                  {selectedCard.foot && (
                    <div className="text-center pt-1">
                      <span className="text-xs text-gray-400">
                        {selectedCard.foot === 'L' ? '🦶 Left Foot' : '🦶 Right Foot'}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-400 mx-auto mb-2"></div>
                  <p className="text-xs text-gray-400">Loading...</p>
                </div>
              )}
              
              {/* Badges */}
              {!selected.isGuest && (selected.user as any)?.badges?.length > 0 && (
                <div className="pt-2 border-t border-gray-700">
                  <div className="text-center">
                    <div className="flex justify-center gap-1 flex-wrap">
                      {(selected.user as any).badges.map((badge: any, i: number) => (
                        <span key={i} className="bg-yellow-600 text-yellow-100 px-2 py-0.5 rounded text-xs">
                          🏅 MVP Lv{badge.level}
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
    </main>
  );
}
