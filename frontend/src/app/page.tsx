import { redirect } from 'next/navigation';

// The authenticated shell resolves the role-appropriate landing page; this
// only needs to get the visitor out of the bare root.
export default function RootPage() {
  redirect('/dashboard');
}
