import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Briefcase, Brain, ClipboardList, Plus, PanelLeftClose, PanelLeft, X, Scale } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useSidebar } from '../../hooks/useSidebar';
import { caseStatusNav } from '../../config/navigation';
import { researchTools, practiceTools } from '../../config/toolsRegistry';

// Only tools with a working implementation are linked. Placeholder entries
// stay in the registry as roadmap data but are hidden here, so the sidebar
// never advertises a page that would render an empty "coming soon" screen.
const visibleResearchTools = researchTools.filter((item) => item.live);
const visiblePracticeTools = practiceTools.filter((item) => item.live);

function SectionHeading({ icon: Icon, label, collapsed }) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 pb-1 pt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground',
        collapsed && 'justify-center px-0'
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {!collapsed && <span>{label}</span>}
    </div>
  );
}

function NavItem({ to, icon: Icon, label, collapsed, onClick }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted',
          isActive ? 'bg-primary/10 font-medium text-primary' : 'text-foreground/80',
          collapsed && 'justify-center px-0'
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  );
}

export default function Sidebar() {
  const { t } = useTranslation('nav');
  const { isCollapsed, toggleCollapsed, isMobileOpen, closeMobile } = useSidebar();

  const content = (
    <div className="flex h-full flex-col">
      <div className={cn('flex items-center gap-2 px-3 py-4', isCollapsed && 'justify-center px-0')}>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-primary text-primary-foreground">
          <Scale className="h-4 w-4" />
        </span>
        {!isCollapsed && <span className="font-display text-lg font-semibold tracking-tight">LawGPT</span>}
        <button
          onClick={toggleCollapsed}
          className="ml-auto hidden rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground lg:inline-flex"
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
        <button
          onClick={closeMobile}
          className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-muted lg:hidden"
          aria-label="Close menu"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <NavLink
        to="/app/cases/new"
        onClick={closeMobile}
        className={cn(
          'mx-3 mb-2 flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90',
          isCollapsed && 'justify-center px-0'
        )}
        title={isCollapsed ? t('cases.newCase') : undefined}
      >
        <Plus className="h-4 w-4 shrink-0" />
        {!isCollapsed && <span>{t('cases.newCase')}</span>}
      </NavLink>

      <div className="flex-1 space-y-1 overflow-y-auto px-2 pb-4">
        <SectionHeading
  icon={Briefcase}
  label={t('sections.caseWorkspace')}
  collapsed={isCollapsed}
/>

{caseStatusNav
  .filter((item) =>
    ['ongoing', 'closed', 'archived', 'recent', 'pinned'].includes(item.status)
  )
  .map((item) => (
    <NavItem
      key={item.status}
      to={`/app/cases/${item.status}`}
      icon={item.icon}
      label={t(item.labelKey)}
      collapsed={isCollapsed}
      onClick={closeMobile}
    />
  ))}
      

        <div className="my-2 border-t border-border" />

        <SectionHeading icon={Brain} label={t('sections.legalResearch')} collapsed={isCollapsed} />
        {visibleResearchTools.map((item) => (
          <NavItem
            key={item.slug}
            to={`/app/research/${item.slug}`}
            icon={item.icon}
            label={t(item.labelKey)}
            collapsed={isCollapsed}
            onClick={closeMobile}
          />
        ))}

        {visiblePracticeTools.length > 0 && (
          <>
            <div className="my-2 border-t border-border" />
            <SectionHeading icon={ClipboardList} label={t('sections.practiceManagement')} collapsed={isCollapsed} />
            {visiblePracticeTools.map((item) => (
              <NavItem
                key={item.slug}
                to={`/app/practice/${item.slug}`}
                icon={item.icon}
                label={t(item.labelKey)}
                collapsed={isCollapsed}
                onClick={closeMobile}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop fixed rail */}
      <aside
        className={cn(
          'hidden shrink-0 border-r border-border bg-card transition-[width] duration-200 lg:block',
          isCollapsed ? 'w-16' : 'w-64'
        )}
      >
        {content}
      </aside>

      {/* Mobile drawer */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-foreground/20" onClick={closeMobile} />
          <aside className="absolute inset-y-0 left-0 w-72 border-r border-border bg-card shadow-lg">{content}</aside>
        </div>
      )}
    </>
  );
}
