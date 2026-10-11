import {
  Activity,
  ArrowRightLeft,
  ChartBarStacked,
  ChartColumn,
  ChartColumnBig,
  ChartColumnDecreasing,
  ChartLine,
  ChartNetwork,
  ChartPie,
  ChartScatter,
  ChartSpline,
  FlaskConical,
  Grid3x3,
  Layers,
  LayoutGrid,
  Radar,
  Scale,
  Sigma,
  Table2,
  Target,
  TrendingUp,
  Users,
  type LucideIcon
} from 'lucide-react'
import type { ChartKind } from '@shared/chart/kinds'

export const KIND_ICONS: Record<ChartKind, LucideIcon> = {
  bar: ChartColumn,
  line: ChartLine,
  pie: ChartPie,
  scatter: ChartScatter,
  histogram: ChartColumnBig,
  box: ChartBarStacked,
  pareto: ChartColumnDecreasing,
  waterfall: ChartSpline,
  radar: Radar,
  heatmap: Grid3x3,
  bullet: Target,
  treemap: LayoutGrid,
  dumbbell: ArrowRightLeft,
  describe: Sigma,
  corr: ChartNetwork,
  ttest: Scale,
  anova: Layers,
  abtest: FlaskConical,
  chisq: Table2,
  forecast: TrendingUp,
  samplesize: Users,
  normal: Activity
}

/** The 통계·그래프 group colour (also --tool inside memo chart blocks). */
export const STATS_COLOR = '#2a78d6'
