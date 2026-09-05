import { redirect } from 'next/navigation';

// Attendance is what people open this module for day to day; leave is periodic.
export default function TimeOffIndexPage() {
  redirect('/time-off/attendance');
}
