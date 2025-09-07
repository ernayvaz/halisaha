import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';

export async function ensureOwner(eventId: string): Promise<boolean> {
  const cookieStore = await cookies();
  const deviceToken = cookieStore.get('device_token')?.value;
  if (!deviceToken) return false;
  
  const device = await prisma.device.findUnique({ 
    where: { deviceToken }, 
    select: { userId: true } 
  });
  if (!device?.userId) return false;
  
  const participant = await prisma.participant.findFirst({ 
    where: { eventId, userId: device.userId } 
  });
  return participant?.role === 'owner';
}
