import type { CSSProperties } from 'react'
import {
  Briefcase,
  Calculator,
  CalendarClock,
  CalendarRange,
  Clock,
  Coins,
  FileSpreadsheet,
  Filter,
  Gauge,
  Globe,
  Grid3x3,
  HandCoins,
  KeyRound,
  Landmark,
  LineChart,
  ListChecks,
  ListOrdered,
  Megaphone,
  Percent,
  PiggyBank,
  Receipt,
  Ruler,
  Scale,
  ScrollText,
  Shuffle,
  Tags,
  Timer,
  TrendingUp,
  Type,
  Users,
  Wallet,
  type LucideIcon
} from 'lucide-react'
import { TOOL_STORE } from './ui'
import { BreakEvenTool, InvestTool, LoanTool, MarginTool, NpvTool, SalaryTool, UnitEconomicsTool, VatTool } from './FinanceTools'
import { AmountWordsTool, QuoteTool, WithholdingTool } from './TaxTools'
import { LeaveTool, SeveranceTool, WorkHoursTool } from './PeopleTools'
import { AdMetricsTool, FunnelTool } from './GrowthTools'
import { DecisionMatrixTool, PertTool, RiceTool } from './PlanTools'
import { DateTool, MeetingCostTool, TimerTool, TimezoneTool } from './TimeTools'
import { CalculatorTool, PercentTool, PickerTool, TextCountTool, UnitTool } from './GeneralTools'
import { ListCleanTool, PasswordTool } from './TextTools'

/** The tool catalogue, shared by the 도구 page and the floating tools button. */

export type GroupId = 'general' | 'finance' | 'people' | 'growth' | 'plan' | 'time'

export const GROUPS: Record<GroupId, { name: string; blurb: string; color: string; icon: LucideIcon }> = {
  general: { name: '일상 업무', blurb: '계산, 변환, 텍스트 정리', color: '#0284c7', icon: Briefcase },
  finance: { name: '재무·세무', blurb: '견적, 세금, 가격, 투자 판단', color: '#059669', icon: Coins },
  people: { name: '인사·급여', blurb: '급여 환산, 연차, 퇴직금, 근무시간', color: '#e11d48', icon: Users },
  growth: { name: '마케팅·성장', blurb: '광고 성과, 전환, 고객 가치', color: '#c026d3', icon: Megaphone },
  plan: { name: '기획·의사결정', blurb: '일정 추정, 우선순위, 대안 비교', color: '#6366f1', icon: ListOrdered },
  time: { name: '시간·일정', blurb: '날짜, 시차, 집중, 회의', color: '#d97706', icon: CalendarClock }
}
export const GROUP_ORDER = Object.keys(GROUPS) as GroupId[]

export interface Tool {
  /** Also the prefix of its saved inputs ('<id>.<field>'), which 초기화 clears. */
  id: string
  group: GroupId
  name: string
  blurb: string
  icon: LucideIcon
  Component: () => JSX.Element
}

export const TOOLS: Tool[] = [
  { id: 'calculator', group: 'general', name: '계산기', blurb: '수식 입력, 괄호·퍼센트, 계산 기록', icon: Calculator, Component: CalculatorTool },
  { id: 'percent', group: 'general', name: '퍼센트·증감률', blurb: '성장률, A의 B%, 비중', icon: Percent, Component: PercentTool },
  { id: 'units', group: 'general', name: '단위 변환', blurb: '평↔㎡, 길이, 무게, 데이터, 온도', icon: Ruler, Component: UnitTool },
  { id: 'text', group: 'general', name: '글자 수 세기', blurb: '공백 포함/제외, 바이트, SMS 한도', icon: Type, Component: TextCountTool },
  { id: 'list-clean', group: 'general', name: '목록 정리', blurb: '중복 제거, 정렬, 번호, 쉼표↔줄바꿈', icon: ListChecks, Component: ListCleanTool },
  { id: 'password', group: 'general', name: '비밀번호 생성', blurb: '안전한 무작위 비밀번호', icon: KeyRound, Component: PasswordTool },
  { id: 'picker', group: 'general', name: '추첨·순서·팀 나누기', blurb: '발표 순서, 당번, 조 편성', icon: Shuffle, Component: PickerTool },
  { id: 'quote', group: 'finance', name: '견적 합계', blurb: '품목별 금액, 할인, 부가세, 한글 금액', icon: FileSpreadsheet, Component: QuoteTool },
  { id: 'vat', group: 'finance', name: '부가세', blurb: '공급가액과 세액 나누기·더하기', icon: Receipt, Component: VatTool },
  { id: 'withholding', group: 'finance', name: '원천징수 3.3%', blurb: '프리랜서 지급액 ↔ 실수령액', icon: HandCoins, Component: WithholdingTool },
  { id: 'amount-words', group: 'finance', name: '금액 한글 표기', blurb: '일금 ○○원정, 한자 갖은자', icon: ScrollText, Component: AmountWordsTool },
  { id: 'margin', group: 'finance', name: '마진·할인', blurb: '마진율, 마크업, 목표 마진 판매가', icon: Tags, Component: MarginTool },
  { id: 'breakeven', group: 'finance', name: '손익분기점', blurb: '몇 개를 팔아야 본전인지', icon: Scale, Component: BreakEvenTool },
  { id: 'loan', group: 'finance', name: '대출 상환', blurb: '원리금균등·원금균등·만기일시', icon: Landmark, Component: LoanTool },
  { id: 'invest', group: 'finance', name: '복리·성장률', blurb: '적립식 평가액, CAGR', icon: TrendingUp, Component: InvestTool },
  { id: 'npv', group: 'finance', name: 'NPV·IRR', blurb: '투자안의 현재가치와 수익률', icon: LineChart, Component: NpvTool },
  { id: 'salary', group: 'people', name: '시급·월급·연봉', blurb: '주휴 포함 209시간 환산', icon: Wallet, Component: SalaryTool },
  { id: 'leave', group: 'people', name: '연차 일수', blurb: '입사일 기준 법정 연차', icon: CalendarRange, Component: LeaveTool },
  { id: 'severance', group: 'people', name: '퇴직금', blurb: '평균임금으로 예상 퇴직금', icon: PiggyBank, Component: SeveranceTool },
  { id: 'work-hours', group: 'people', name: '주간 근무시간', blurb: '출퇴근으로 연장근로, 52시간 확인', icon: Clock, Component: WorkHoursTool },
  { id: 'ad-metrics', group: 'growth', name: '광고 성과', blurb: 'ROAS, CTR, CPC, CPA 한 번에', icon: Megaphone, Component: AdMetricsTool },
  { id: 'funnel', group: 'growth', name: '퍼널 전환율', blurb: '단계별 이탈 구간 찾기', icon: Filter, Component: FunnelTool },
  { id: 'unit-economics', group: 'growth', name: 'LTV·CAC', blurb: '고객 생애가치와 획득 비용', icon: Users, Component: UnitEconomicsTool },
  { id: 'pert', group: 'plan', name: 'PERT 일정 추정', blurb: '낙관·보통·비관으로 기간과 확률', icon: Gauge, Component: PertTool },
  { id: 'rice', group: 'plan', name: 'RICE 우선순위', blurb: '도달·영향·확신·노력 점수화', icon: ListOrdered, Component: RiceTool },
  { id: 'decision', group: 'plan', name: '의사결정 매트릭스', blurb: '가중치 기준으로 대안 비교', icon: Grid3x3, Component: DecisionMatrixTool },
  { id: 'dates', group: 'time', name: '날짜 계산', blurb: 'D-day, 기간, 영업일 더하기', icon: CalendarRange, Component: DateTool },
  { id: 'timezone', group: 'time', name: '세계 시간', blurb: '해외 미팅 시간 맞추기', icon: Globe, Component: TimezoneTool },
  { id: 'timer', group: 'time', name: '집중 타이머', blurb: '포모도로, 집중·휴식 알림', icon: Timer, Component: TimerTool },
  { id: 'meeting', group: 'time', name: '회의 비용', blurb: '지금 이 회의가 얼마인지 실시간으로', icon: Clock, Component: MeetingCostTool }
]

export const findTool = (id: string | null): Tool | null => TOOLS.find((t) => t.id === id) ?? null

/** Per-group colour as CSS variables the tool UI reads (--tool, --tool-soft, --tool-line). */
export const toolVars = (group: GroupId): CSSProperties =>
  ({
    '--tool': GROUPS[group].color,
    '--tool-soft': `${GROUPS[group].color}14`,
    '--tool-line': `${GROUPS[group].color}2e`
  }) as CSSProperties

export const matchesTool = (t: Tool, q: string): boolean => !q.trim() || `${t.name} ${t.blurb} ${GROUPS[t.group].name}`.toLowerCase().includes(q.trim().toLowerCase())

// --- Per-viewer memory: last open tool and recently used ---------------------------

export const ACTIVE_KEY = 'aop-tools-active'
const RECENT_KEY = 'aop-tools-recent'
const RECENT_MAX = 6

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}
const writeJson = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* not remembered */
  }
}

export const readActiveTool = (): string | null => readJson<string | null>(ACTIVE_KEY, null)
export const writeActiveTool = (id: string | null): void => writeJson(ACTIVE_KEY, id)
export const readRecent = (): string[] => readJson<string[]>(RECENT_KEY, []).filter((id) => findTool(id))

/** Moves `id` to the front of the recent list and returns the new list. */
export function pushRecent(id: string): string[] {
  const next = [id, ...readRecent().filter((r) => r !== id)].slice(0, RECENT_MAX)
  writeJson(RECENT_KEY, next)
  return next
}

/** Clears a tool's saved inputs (the caller remounts the tool so it re-reads them). */
export function clearToolInputs(id: string): void {
  const prefix = `${TOOL_STORE}${id}.`
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(prefix))
      .forEach((k) => localStorage.removeItem(k))
  } catch {
    /* storage unavailable: nothing saved to clear */
  }
}
