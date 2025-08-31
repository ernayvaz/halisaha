import { redirect } from 'next/navigation';

export default function EventEntry({ params }: { params: { code: string } }) {
  redirect(`/ev/${params.code}/landing`);
}


