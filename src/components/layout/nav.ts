import {
  LayoutDashboard, Users, Share2, Wallet, ListChecks, FileText, Calendar,
  Palette, Video, Megaphone, CreditCard, BarChart3, Bell, ScrollText, Settings,
  FileBarChart,
  type LucideIcon,
} from 'lucide-react';
import type { UserRole } from '@/types/models';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: UserRole[];
  group: 'Operacao' | 'Criacao' | 'Publicidade' | 'Gestao';
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/painel', label: 'Dashboard', icon: LayoutDashboard, roles: ['ADMIN', 'MANAGER', 'CLIENT'], group: 'Operacao' },
  { href: '/clientes', label: 'Clientes', icon: Users, roles: ['ADMIN', 'MANAGER'], group: 'Operacao' },
  { href: '/redes-sociais', label: 'Redes Sociais', icon: Share2, roles: ['ADMIN', 'MANAGER'], group: 'Operacao' },
  { href: '/contas-publicitarias', label: 'Contas Publicitarias', icon: Wallet, roles: ['ADMIN', 'MANAGER'], group: 'Operacao' },
  { href: '/tarefas', label: 'Tarefas', icon: ListChecks, roles: ['ADMIN', 'MANAGER'], group: 'Operacao' },

  { href: '/conteudo', label: 'Conteudo', icon: FileText, roles: ['ADMIN', 'MANAGER', 'CLIENT'], group: 'Criacao' },
  { href: '/calendario', label: 'Calendario', icon: Calendar, roles: ['ADMIN', 'MANAGER', 'CLIENT'], group: 'Criacao' },
  { href: '/creative-studio', label: 'Creative Studio', icon: Palette, roles: ['ADMIN', 'MANAGER'], group: 'Criacao' },
  { href: '/video-studio', label: 'Video Studio', icon: Video, roles: ['ADMIN', 'MANAGER'], group: 'Criacao' },

  { href: '/ads', label: 'Ads Manager', icon: Megaphone, roles: ['ADMIN', 'MANAGER'], group: 'Publicidade' },
  { href: '/billing', label: 'Billing & Pagamentos', icon: CreditCard, roles: ['ADMIN', 'MANAGER'], group: 'Publicidade' },
  { href: '/analytics', label: 'Analytics', icon: BarChart3, roles: ['ADMIN', 'MANAGER', 'CLIENT'], group: 'Publicidade' },
  { href: '/relatorios', label: 'Relatorios', icon: FileBarChart, roles: ['ADMIN', 'MANAGER', 'CLIENT'], group: 'Publicidade' },

  { href: '/notificacoes', label: 'Notificacoes', icon: Bell, roles: ['ADMIN', 'MANAGER', 'CLIENT'], group: 'Gestao' },
  { href: '/logs', label: 'Logs', icon: ScrollText, roles: ['ADMIN', 'MANAGER'], group: 'Gestao' },
  { href: '/definicoes', label: 'Definicoes', icon: Settings, roles: ['ADMIN', 'MANAGER', 'CLIENT'], group: 'Gestao' },
];

export const NAV_GROUPS: NavItem['group'][] = ['Operacao', 'Criacao', 'Publicidade', 'Gestao'];

export function navForRole(role: UserRole): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
