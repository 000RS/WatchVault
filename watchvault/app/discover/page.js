import { redirect } from 'next/navigation';

// The v1 "New" page now lives in Explore.
export default function DiscoverRedirect() {
  redirect('/explore');
}
