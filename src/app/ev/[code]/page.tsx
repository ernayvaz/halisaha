import { redirect } from 'next/navigation';
import { NextRequest } from 'next/server';

export default function Page({ params }: { params: { code: string } }) {
  return redirect(`/ev/${params.code}/landing`);
}


