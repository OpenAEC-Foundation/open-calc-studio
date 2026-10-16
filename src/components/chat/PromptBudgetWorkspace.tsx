import { ChatPanel } from './ChatPanel';
import { CostGrid } from '@/components/grid/CostGrid';
import { useAppStore } from '@/state/appStore';
import { getGrandTotal } from '@/services/calculation/calculator';
import './PromptBudgetWorkspace.css';

export function PromptBudgetWorkspace() {
  const items = useAppStore(s => s.items);
  const name = useAppStore(s => s.schedule.projectName || s.schedule.name || 'Nieuwe begroting');
  const total = getGrandTotal(items);

  return <div className="prompt-budget-workspace">
    <header className="prompt-budget-header">
      <div><strong>Prompt &amp; Begroot</strong><span> Beschrijf het werk links; bekijk en bewerk de begroting rechts.</span></div>
      <div className="prompt-budget-total" title={name}>{name} · € {total.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
    </header>
    <div className="prompt-budget-columns">
      <aside className="prompt-budget-assistant" aria-label="Calculatieassistent"><ChatPanel embedded /></aside>
      <section className="prompt-budget-grid" aria-label="Begroting"><CostGrid /></section>
    </div>
  </div>;
}
