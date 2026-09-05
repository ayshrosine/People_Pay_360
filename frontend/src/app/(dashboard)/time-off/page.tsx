import { redirect } from 'next/navigation';

// The module has no landing content of its own; requests are what people open it for.
export default function TimeOffIndexPage() {
  redirect('/time-off/requests');
}
