import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rateLimit';
import { publish } from '@/lib/realtime';
import { ensureOwner } from '@/lib/auth';

export const runtime = 'nodejs';

type Participant = {
  id: string;
  user?: {
    pace?: number | null;
    shoot?: number | null;
    pass?: number | null;
    defend?: number | null;
  } | null;
};

type BalanceResult = {
  team1: string[];
  team2: string[];
  scoreA: number;
  scoreB: number;
};

function calculatePlayerScore(participant: Participant): number {
  if (!participant.user) return 12; // Default score for guests (3*4=12)
  
  const pace = participant.user.pace || 3;
  const shoot = participant.user.shoot || 3;
  const pass = participant.user.pass || 3;
  const defend = participant.user.defend || 3;
  
  return pace + shoot + pass + defend;
}

function balanceTeamsGreedy(participants: Participant[]): BalanceResult {
  // Sort participants by score (highest first)
  const sorted = [...participants].sort((a, b) => calculatePlayerScore(b) - calculatePlayerScore(a));
  
  const team1: string[] = [];
  const team2: string[] = [];
  let score1 = 0;
  let score2 = 0;
  
  // Greedy assignment: always add to the team with lower total score
  for (const participant of sorted) {
    const playerScore = calculatePlayerScore(participant);
    
    if (score1 <= score2) {
      team1.push(participant.id);
      score1 += playerScore;
    } else {
      team2.push(participant.id);
      score2 += playerScore;
    }
  }
  
  return {
    team1,
    team2,
    scoreA: score1,
    scoreB: score2
  };
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const ip = req.headers.get('x-forwarded-for') || 'local';
  if (!rateLimit(`autobalance:${ip}`, 10, 60_000)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const { id: eventId } = await context.params;
  
  // Check if user is owner
  if (!(await ensureOwner(eventId))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) {
    return NextResponse.json({ error: 'event not found' }, { status: 404 });
  }

  // Parse request body once up-front so we can distinguish preview vs apply
  const { method = 'greedy', apply = false } = (await req.json()) as {
    method?: 'greedy';
    apply?: boolean;
  };

  // When roster is locked: allow previews, block only apply
  if (event.rosterLocked && apply) {
    return NextResponse.json({ error: 'roster_locked' }, { status: 403 });
  }

  // Get all participants with their user stats
  const participants = await prisma.participant.findMany({
    where: { eventId },
    include: {
      user: {
        select: {
          pace: true,
          shoot: true,
          pass: true,
          defend: true
        }
      }
    }
  });

  if (participants.length < 2) {
    return NextResponse.json({ error: 'need at least 2 participants' }, { status: 400 });
  }

  // Balance the teams
  const result = balanceTeamsGreedy(participants);

  // If apply is true, actually assign the teams
  if (apply) {
    try {
      // Get or create teams
      const teams = await prisma.team.findMany({ 
        where: { eventId }, 
        orderBy: { index: 'asc' } 
      });

      let team1, team2;
      
      if (teams.length === 0) {
        // Create default teams
        [team1, team2] = await Promise.all([
          prisma.team.create({
            data: {
              eventId,
              index: 1,
              name: 'Team 1',
              color: '#dc2626',
              formation: '1-2-2-1'
            }
          }),
          prisma.team.create({
            data: {
              eventId,
              index: 2,
              name: 'Team 2', 
              color: '#f59e0b',
              formation: '1-2-2-1'
            }
          })
        ]);
      } else {
        team1 = teams.find(t => t.index === 1);
        team2 = teams.find(t => t.index === 2);
        
        if (!team1) {
          team1 = await prisma.team.create({
            data: {
              eventId,
              index: 1,
              name: 'Team 1',
              color: '#dc2626',
              formation: '1-2-2-1'
            }
          });
        }
        
        if (!team2) {
          team2 = await prisma.team.create({
            data: {
              eventId,
              index: 2,
              name: 'Team 2',
              color: '#f59e0b', 
              formation: '1-2-2-1'
            }
          });
        }
      }

      // Clear existing assignments and positions
      const teamIds = [team1.id, team2.id];
      await prisma.$transaction([
        prisma.lineupPosition.deleteMany({ where: { teamId: { in: teamIds } } }),
        prisma.assignment.deleteMany({ where: { teamId: { in: teamIds } } }),
      ]);

      // Create new assignments
      const assignments = [
        ...result.team1.map(participantId => ({
          teamId: team1.id,
          participantId
        })),
        ...result.team2.map(participantId => ({
          teamId: team2.id,
          participantId
        }))
      ];

      await prisma.assignment.createMany({ data: assignments });

      // Publish updates
      await Promise.all([
        publish({ type: 'teams_updated', eventId }),
        publish({ type: 'assignments_updated', teamId: team1.id }),
        publish({ type: 'assignments_updated', teamId: team2.id })
      ]);
    } catch (error) {
      console.error('Autobalance application failed:', error);
      return NextResponse.json({ error: 'failed to apply balance' }, { status: 500 });
    }
  }

  return NextResponse.json(result);
}
