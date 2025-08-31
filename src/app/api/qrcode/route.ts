import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const text = searchParams.get('text');
  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 });
  const dataUrl = await QRCode.toDataURL(text, { margin: 1, width: 256 });
  const base64 = dataUrl.split(',')[1];
  const buf = Buffer.from(base64, 'base64');
  return new NextResponse(buf, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=60' } });
}


