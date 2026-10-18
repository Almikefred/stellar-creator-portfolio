'use client'

import dynamic from 'next/dynamic'
import { Header } from '@/components/layout/header'
import { Footer } from '@/components/layout/footer'
import { SocialShare } from '@/components/common/social-share'

// Dynamic import keeps Yjs/Worker APIs out of the SSR bundle
const AnalyticsDashboardReal = dynamic(
  () => import('@/components/analytics/analytics-dashboard').then((m) => m.AnalyticsDashboard),
  { ssr: false, loading: () => <div className="h-64 animate-pulse rounded-md bg-muted" /> },
)

export default function ProfileAnalyticsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-grow container max-w-5xl mx-auto px-4 py-10">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
            <p className="text-muted-foreground mt-1">
              Real-time earnings, performance, and insights from connected data sources.
            </p>
          </div>
          <SocialShare
            title="Check out my earnings on Tamgora Creators!"
            description="Creator analytics and milestones"
            url="/profile/analytics"
            hashtags={['TamgoraCreators', 'Web3Earnings', 'Milestone']}
          />
        </div>
        <AnalyticsDashboardReal />
      </main>
      <Footer />
    </div>
  )
}
