import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  
  const participant = await prisma.participant.findUnique({ 
    where: { id },
    select: { isGuest: true, guestName: true, user: { select: { id: true, foot: true, pace: true, shoot: true, pass: true, defend: true } } }
  });
  
  if (!participant) return NextResponse.json({ error: 'participant not found' }, { status: 404 });
  
  if (participant.isGuest) {
    // Return default stats for guest players
    return NextResponse.json({
      id: id,
      foot: 'R',
      pace: 3,
      shoot: 3,
      pass: 3,
      defend: 3
    });
  }
  
  // For regular users, return their actual card
  if (!participant.user) return NextResponse.json({ error: 'user not found' }, { status: 404 });
  
  return NextResponse.json({
    id: participant.user.id,
    foot: participant.user.foot,
    pace: participant.user.pace,
    shoot: participant.user.shoot,
    pass: participant.user.pass,
    defend: participant.user.defend
  });
}
