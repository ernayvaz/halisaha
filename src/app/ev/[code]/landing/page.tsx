"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import MatchInfo from '@/components/MatchInfo';

type Event = {
  id: string;
  code: string;
  name?: string | null;
  date?: string | null;
  startTime?: string | null;
  durationMinutes?: number | null;
  status: string;
};

type User = {
  id: string;
  handle: string;
  displayName: string;
};

type Participant = {
  id: string;
  isGuest: boolean;
  guestName?: string | null;
  role: string;
  joinedAt: string;
  user?: {
    id: string;
    handle: string;
    displayName: string;
  } | null;
};

export default function EventLandingPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [eventData, setEventData] = useState<Event | null>(null);
  const [me, setMe] = useState<User | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddGuest, setShowAddGuest] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [isAddingGuest, setIsAddingGuest] = useState(false);

  useEffect(() => {
    const code = params?.code as string;
    if (!code) return;

    const loadData = async () => {
      try {
        // Load event data
        const eventResp = await fetch(`/api/events?code=${encodeURIComponent(code)}`);
        if (!eventResp.ok) {
          setError('Event not found');
          setLoading(false);
          return;
        }
        const event = await eventResp.json();
        setEventData(event);

        // Load participants
        const participantsResp = await fetch(`/api/events/${event.id}/participants`);
        if (participantsResp.ok) {
          const participantsData = await participantsResp.json();
          setParticipants(participantsData);
        }

        // Check if user is logged in
        try {
          const meResp = await fetch('/api/me');
          if (meResp.ok) {
            const userData = await meResp.json();
            setMe(userData);
          }
        } catch {}

        setLoading(false);
      } catch (err) {
        console.error('Failed to load event:', err);
        setError('Failed to load event');
        setLoading(false);
      }
    };

    loadData();
  }, [params?.code]);

  const handleJoin = () => {
    if (!me) {
      // Redirect to nickname page for anonymous users
      router.push(`/ev/${params.code}/nickname?mode=join`);
    } else {
      // Redirect directly to teams for authenticated users
      router.push(`/ev/${params.code}/teams`);
    }
  };

  const handleView = () => {
    if (!me) {
      // Redirect to nickname page for anonymous users
      router.push(`/ev/${params.code}/nickname?mode=view`);
    } else {
      // Redirect directly to lobby for authenticated users
      router.push(`/ev/${params.code}/lobby`);
    }
  };

  const handleAddGuest = async () => {
    if (!eventData || isAddingGuest) return;
    
    setIsAddingGuest(true);
    try {
      const response = await fetch(`/api/events/${eventData.id}/participants`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mode: 'join',
          guestName: guestName.trim() || null
        })
      });

      if (response.ok) {
        // Reload participants
        const participantsResp = await fetch(`/api/events/${eventData.id}/participants`);
        if (participantsResp.ok) {
          const participantsData = await participantsResp.json();
          setParticipants(participantsData);
        }
        
        setGuestName('');
        setShowAddGuest(false);
      } else {
        console.error('Failed to add guest');
      }
    } catch (error) {
      console.error('Error adding guest:', error);
    } finally {
      setIsAddingGuest(false);
    }
  };

  // Generate guest display name with sequential numbering
  const getGuestDisplayName = (participant: Participant, index: number) => {
    if (participant.guestName) {
      return participant.guestName;
    }
    
    // Count guests before this one
    const guestsBefore = participants
      .slice(0, index)
      .filter(p => p.isGuest).length;
    
    return `Guest ${guestsBefore + 1}`;
  };

  if (loading) {
    return (
      <main className="p-6 max-w-2xl mx-auto space-y-6">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-gray-500">Loading event...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="p-6 max-w-2xl mx-auto space-y-6">
        <div className="text-center py-12">
          <div className="text-red-600 mb-4">
            <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Event Not Found</h1>
          <p className="text-gray-500 mb-6">{error}</p>
          <button 
            onClick={() => router.push('/')}
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg"
          >
            Go Home
          </button>
        </div>
      </main>
    );
  }

  if (!eventData) return null;

  return (
    <main className="p-6 max-w-2xl mx-auto space-y-6">
      <MatchInfo eventCode={params.code} title={eventData.name || 'Football Event'} />
      
      <div className="bg-white rounded-xl shadow-lg border overflow-hidden">
        <div className="bg-gradient-to-r from-green-600 to-green-700 px-6 py-8 text-white text-center">
          <div className="text-4xl mb-3">⚽</div>
          <h1 className="text-2xl font-bold mb-2">{eventData.name || 'Football Event'}</h1>
          <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full text-sm">
            <span className="font-mono font-bold">{eventData.code}</span>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {eventData.status === 'finished' && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-yellow-800">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <span className="font-medium">Event Finished</span>
              </div>
              <p className="text-sm text-yellow-700 mt-1">
                This match has ended. You can still view the teams and history.
              </p>
            </div>
          )}

          <div className="text-center space-y-4">
            <p className="text-gray-600">
              {me ? `Welcome back, ${me.displayName}!` : 'Welcome to the event!'}
            </p>
            
            <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-sm mx-auto">
              <button
                onClick={handleJoin}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Join Event
              </button>
              
              <button
                onClick={handleView}
                className="border border-gray-300 hover:bg-gray-50 text-gray-700 px-6 py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                View Only
              </button>
            </div>

            {/* Add Guest Button */}
            <div className="mt-4 text-center">
              <button
                onClick={() => setShowAddGuest(true)}
                className="text-green-600 hover:text-green-700 text-sm font-medium flex items-center justify-center gap-1 mx-auto"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add Guest Player
              </button>
            </div>

            {/* Add Guest Modal */}
            {showAddGuest && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowAddGuest(false)}>
                <div className="bg-white p-6 rounded-xl max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
                  <h3 className="text-lg font-semibold mb-4">Add Guest Player</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Guest Name (optional)
                      </label>
                      <input
                        type="text"
                        value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
                        placeholder="Leave empty for auto-naming"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                        maxLength={50}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        If left empty, will be named "Guest 1", "Guest 2", etc.
                      </p>
                    </div>
                    <div className="flex gap-3 justify-end">
                      <button
                        onClick={() => {
                          setShowAddGuest(false);
                          setGuestName('');
                        }}
                        className="px-4 py-2 text-gray-600 hover:text-gray-800"
                        disabled={isAddingGuest}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleAddGuest}
                        disabled={isAddingGuest}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-2"
                      >
                        {isAddingGuest && (
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        )}
                        {isAddingGuest ? 'Adding...' : 'Add Guest'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Participants List */}
          {participants.length > 0 && (
            <div className="border-t pt-4">
              <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5 0a4 4 0 11-8-4 4 4 0 018 4z" />
                </svg>
                Participants ({participants.length})
              </h3>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {participants.map((participant, index) => (
                  <div key={participant.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${participant.role === 'owner' ? 'bg-yellow-500' : 'bg-green-500'}`}></div>
                      <span className="text-sm font-medium">
                        {participant.isGuest 
                          ? getGuestDisplayName(participant, index)
                          : participant.user?.displayName || participant.user?.handle || 'Unknown'
                        }
                      </span>
                      {participant.role === 'owner' && (
                        <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">
                          Owner
                        </span>
                      )}
                      {participant.isGuest && (
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                          Guest
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="border-t pt-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="text-center">
                <div className="font-medium text-gray-900">Status</div>
                <div className="text-gray-500 capitalize">{eventData.status}</div>
              </div>
              <div className="text-center">
                <div className="font-medium text-gray-900">Duration</div>
                <div className="text-gray-500">{eventData.durationMinutes || 60} min</div>
              </div>
            </div>
          </div>

          <div className="text-center">
            <p className="text-xs text-gray-500">
              Share this code with others: <span className="font-mono font-bold">{eventData.code}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Quick navigation */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <button
          onClick={() => router.push(`/ev/${params.code}/lobby`)}
          className="p-3 border rounded-lg hover:bg-gray-50 text-center"
        >
          <div className="text-2xl mb-1">👥</div>
          <div>Lobby</div>
        </button>
        
        <button
          onClick={() => router.push(`/ev/${params.code}/teams`)}
          className="p-3 border rounded-lg hover:bg-gray-50 text-center"
        >
          <div className="text-2xl mb-1">⚽</div>
          <div>Teams</div>
        </button>
        
        <button
          onClick={() => router.push(`/ev/${params.code}/lineup`)}
          className="p-3 border rounded-lg hover:bg-gray-50 text-center"
        >
          <div className="text-2xl mb-1">📋</div>
          <div>Lineup</div>
        </button>
        
        <button
          onClick={() => router.push(`/ev/${params.code}/history`)}
          className="p-3 border rounded-lg hover:bg-gray-50 text-center"
        >
          <div className="text-2xl mb-1">📊</div>
          <div>History</div>
        </button>
      </div>
    </main>
  );
}
