'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Search, Globe, Settings, MapPin, FileSearch2,
  TrendingUp, Link2, Users, BarChart2, Activity, GitMerge, Clock, FolderKanban, Anchor,
  Gauge, Lightbulb, BrainCircuit, MessageSquare, Star, Flame, Cpu, ShieldCheck, Grid3X3,
  Sparkles, Target, Layers, Network, LineChart, Tag, ScanText,
  History, Copy, BarChart3, BookOpen, Server,
} from 'lucide-react';

const sections = [
  {
    label: 'Overview',
    items: [
      { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, exact: true },
      { name: 'Rank Tracker', href: '/dashboard/rank-tracker', icon: Activity },
    ],
  },
  {
    label: 'Analytics',
    items: [
      { name: 'Ranked Keywords', href: '/dashboard/ranked-keywords', icon: TrendingUp },
      { name: 'Keyword Overview', href: '/dashboard/keyword-overview', icon: BarChart2 },
      { name: 'Competitors', href: '/dashboard/competitors', icon: Users },
      { name: 'Domain Intersection', href: '/dashboard/domain-intersection', icon: GitMerge },
      { name: 'Historical Rank', href: '/dashboard/historical-rank', icon: Clock },
      { name: 'Related Keywords', href: '/dashboard/related-keywords', icon: Lightbulb },
      { name: 'Top Searches', href: '/dashboard/top-searches', icon: Flame },
    ],
  },
  {
    label: 'Domain Analytics',
    items: [
      { name: 'Technologies', href: '/dashboard/domain-analytics/technologies', icon: Cpu },
      { name: 'Whois', href: '/dashboard/domain-analytics/whois', icon: ShieldCheck },
      { name: 'Categories', href: '/dashboard/domain-analytics/categories', icon: Tag },
    ],
  },
  {
    label: 'Labs',
    items: [
      { name: 'Keyword Ideas', href: '/dashboard/keyword-ideas', icon: Sparkles },
      { name: 'Search Intent', href: '/dashboard/search-intent', icon: Target },
      { name: 'Page Intersection', href: '/dashboard/page-intersection', icon: Layers },
      { name: 'Subdomains', href: '/dashboard/subdomains', icon: Network },
      { name: 'Traffic Estimation', href: '/dashboard/traffic-estimation', icon: LineChart },
    ],
  },
  {
    label: 'Backlinks',
    items: [
      { name: 'Backlinks', href: '/dashboard/backlinks', icon: Link2, exact: true },
      { name: 'Referring Domains', href: '/dashboard/backlinks/referring-domains', icon: FolderKanban },
      { name: 'Anchors', href: '/dashboard/backlinks/anchors', icon: Anchor },
      { name: 'Referring Networks', href: '/dashboard/backlinks/referring-networks', icon: Server },
      { name: 'Page Intersection', href: '/dashboard/backlinks/page-intersection', icon: Copy },
      { name: 'Domain Intersection', href: '/dashboard/backlinks/domain-intersection', icon: BookOpen },
      { name: 'History', href: '/dashboard/backlinks/history', icon: History },
      { name: 'Bulk Backlinks', href: '/dashboard/backlinks/bulk-backlinks', icon: BarChart3 },
      { name: 'Bulk Ref. Domains', href: '/dashboard/backlinks/bulk-referring-domains', icon: Layers },
    ],
  },
  {
    label: 'SERP',
    items: [
      { name: 'SERP Checker', href: '/dashboard/serp', icon: Globe },
      { name: 'Local Finder', href: '/dashboard/local-finder', icon: MapPin },
      { name: 'Geo-Grid Ranking', href: '/dashboard/geo-grid', icon: Grid3X3 },
    ],
  },
  {
    label: 'AI',
    items: [
      { name: 'AI Optimization', href: '/dashboard/ai-optimization', icon: BrainCircuit },
    ],
  },
  {
    label: 'Business',
    items: [
      { name: 'Google Reviews', href: '/dashboard/google-reviews', icon: Star },
    ],
  },
  {
    label: 'Social Media',
    items: [
      { name: 'Reddit', href: '/dashboard/social-media/reddit', icon: MessageSquare },
    ],
  },
  {
    label: 'Tools',
    items: [
      { name: 'Keyword Data', href: '/dashboard/keyword-data', icon: Search },
      { name: 'Keyword Difficulty', href: '/dashboard/keyword-difficulty', icon: Gauge },
      { name: 'On Page', href: '/dashboard/on-page', icon: FileSearch2 },
      { name: 'Content Parsing', href: '/dashboard/on-page/content-parsing', icon: ScanText },
      { name: 'Settings', href: '/dashboard/settings', icon: Settings },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex h-full w-60 flex-col bg-sba-navy text-slate-200 select-none overflow-y-auto shrink-0 scrollbar-thin">
      {/* Logo */}
      <div className="flex h-14 items-center px-5 border-b border-white/10 shrink-0">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/sba-emblem-white.png"
            alt="Scholar Basketball Academy"
            width={26}
            height={26}
            className="h-[26px] w-[26px] shrink-0 object-contain"
          />
          <span className="font-display text-[15px] font-bold uppercase tracking-[0.08em] leading-none text-white">
            Scholar Basketball
          </span>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-4">
        {sections.map((section) => (
          <div key={section.label}>
            <p className="font-display text-[11px] font-bold text-sba-orange uppercase tracking-[0.18em] px-3 mb-1.5">
              {section.label}
            </p>
            <div className="space-y-px">
              {section.items.map((item) => {
                const isActive = item.exact
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    aria-current={isActive ? 'page' : undefined}
                    className={`group relative flex items-center px-3 py-2 text-sm rounded-lg transition-all duration-150 ${
                      isActive
                        ? 'bg-white/10 text-white font-semibold'
                        : 'text-slate-300/80 hover:bg-white/5 hover:text-white font-medium'
                    }`}
                  >
                    {/* Orange active indicator bar */}
                    <span
                      className={`absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-sba-orange transition-opacity duration-150 ${
                        isActive ? 'opacity-100' : 'opacity-0'
                      }`}
                      aria-hidden="true"
                    />
                    <item.icon className={`mr-2.5 h-[15px] w-[15px] shrink-0 transition-colors ${
                      isActive
                        ? 'text-sba-orange'
                        : 'text-slate-400/70 group-hover:text-slate-200'
                    }`} />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );
}
