import { ArrowUpRight, BookOpen, CalendarDays, CircleDollarSign, Users, type LucideIcon } from 'lucide-react';
const iconSet: Record<string, LucideIcon> = { Students: Users, Faculty: Users, 'Overall attendance': BookOpen, 'Average attendance': BookOpen, 'Pending fees': CircleDollarSign, 'Upcoming exams': CalendarDays, 'Active notices': CalendarDays, 'Fee collection': CircleDollarSign, default: ArrowUpRight };
export function StatCard({ label, value, tone = 'neutral', note }: { label: string; value: string | number; tone?: string; note?: string }) {
  const Icon = iconSet[label] ?? iconSet.default;
  return <article className={`stat-card tone-${tone}`}><span className="stat-icon"><Icon size={17} /></span><div><p>{label}</p><strong>{value}</strong>{note && <small>{note}</small>}</div></article>;
}
