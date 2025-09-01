import { redirect } from 'next/navigation';

export default function EvLandingWithoutCode() {
  // If someone visits /ev/landing without a code, send them home
  redirect('/');
}

