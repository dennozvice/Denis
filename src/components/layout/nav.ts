import {
  CalendarDays,
  ChartLine,
  FolderOpen,
  LayoutDashboard,
  ListChecks,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { PageId } from '../../router/router'

export interface NavItem {
  page: PageId
  label: string
  icon: LucideIcon
}

export const NAV_ITEMS: NavItem[] = [
  { page: 'home', label: 'Panoramica', icon: LayoutDashboard },
  { page: 'agenda', label: 'Agenda', icon: CalendarDays },
  { page: 'attivita', label: 'Attività', icon: ListChecks },
  { page: 'clienti', label: 'Clienti', icon: Users },
  { page: 'fondi', label: 'Fondi e mercati', icon: ChartLine },
  { page: 'pratiche', label: 'Pratiche', icon: FolderOpen },
]

export const SETTINGS_ITEM: NavItem = { page: 'impostazioni', label: 'Impostazioni', icon: Settings }
