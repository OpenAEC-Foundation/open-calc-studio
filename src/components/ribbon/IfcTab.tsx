import { useTranslation } from "react-i18next";
import RibbonButton from "./RibbonButton";
import RibbonGroup from "./RibbonGroup";
import { reportIcon } from "./icons";
import { useAppStore } from "../../state/appStore";
import { generateReport } from "../../services/report/reportGenerator";

export default function IfcTab() {
  const { t } = useTranslation("ribbon");
  const { schedule, items } = useAppStore();

  const handleGenerateReport = () => {
    const html = generateReport(schedule, items);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${schedule.name || 'budget'}-rapport.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="ribbon-content">
      <div className="ribbon-groups">
        <RibbonGroup label={t("ifc.report")}>
          <RibbonButton icon={reportIcon} label={t("ifc.generateReport")} onClick={handleGenerateReport} />
        </RibbonGroup>
      </div>
    </div>
  );
}
