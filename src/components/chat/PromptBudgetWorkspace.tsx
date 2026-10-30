import { useTranslation } from 'react-i18next';
import { uiText } from '@/i18n/uiText';
import { ChatPanel } from './ChatPanel';
import { CostGrid } from '@/components/grid/CostGrid';
import { useAppStore } from '@/state/appStore';
import { getGrandTotal } from '@/services/calculation/calculator';
import './PromptBudgetWorkspace.css';

export function PromptBudgetWorkspace() {
  const { i18n } = useTranslation();
  const items = useAppStore(s => s.items);
  const name = useAppStore(s => s.schedule.projectName || s.schedule.name || uiText("newBudget", "New estimate"));
  const total = getGrandTotal(items);

  return <div className="prompt-budget-workspace">
    <header className="prompt-budget-header">
      <div><strong>{uiText("prompt.title", "Prompt & Estimate")}</strong><span> {uiText("prompt.help", "Describe the work on the left; review and edit the estimate on the right.")}</span></div>
      <div className="prompt-budget-total" title={name}>{name} · € {total.toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
    </header>
    <div className="prompt-budget-columns">
      <aside className="prompt-budget-assistant" aria-label={uiText("prompt.assistant", "Estimating assistant")}><ChatPanel embedded /></aside>
      <section className="prompt-budget-grid" aria-label={uiText("budget", "Estimate")}><CostGrid /></section>
    </div>
  </div>;
}
