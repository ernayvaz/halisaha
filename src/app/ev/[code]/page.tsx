import { redirect } from 'next/navigation';

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return redirect(`/ev/${code}/landing`);
}


