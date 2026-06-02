import {
  Bot,
  FileText,
  FolderOpen,
  LayoutDashboard,
  Network,
  Radar,
  ShieldAlert,
} from 'lucide-react'
import { type SidebarData } from '../types'

export const sidebarData: SidebarData = {
  user: {
    name: 'security-analyst',
    email: 'soc / appsec',
    avatar: '',
  },
  teams: [
    {
      name: 'SupplyGuard KG',
      logo: ShieldAlert,
      plan: 'LLM + Knowledge Graph',
    },
    {
      name: 'Security Operations',
      logo: Radar,
      plan: 'Code / SBOM / Logs',
    },
    {
      name: 'Evidence Graph',
      logo: Network,
      plan: 'Attack Path / Report',
    },
  ],
  navGroups: [
    {
      title: 'Security Platform',
      items: [
        {
          title: 'Project Import',
          url: '/project-import',
          icon: FolderOpen,
        },
        {
          title: 'Overview',
          url: '/#overview',
          icon: LayoutDashboard,
        },
        {
          title: 'Evidence Analysis',
          url: '/#code',
          icon: Radar,
        },
      ],
    },
    {
      title: 'Evidence Chain',
      items: [
        {
          title: 'Knowledge Graph',
          url: '/#graph',
          icon: Network,
        },
        {
          title: 'Copilot Report',
          url: '/#copilot',
          icon: Bot,
        },
        {
          title: 'Reports',
          url: '/#copilot',
          icon: FileText,
        },
      ],
    },
  ],
}
