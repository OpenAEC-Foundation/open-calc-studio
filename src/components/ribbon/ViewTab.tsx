import { useTranslation } from "react-i18next";
import RibbonButton from "./RibbonButton";
import RibbonGroup from "./RibbonGroup";
import { panelLeftIcon, panelRightIcon, settingsIcon } from "./icons";
import { useAppStore } from "../../state/appStore";

export default function ViewTab() {
  const { t } = useTranslation("ribbon");
  const { toggleSchedulePanel, togglePropertiesPanel, showSchedulePanel, showPropertiesPanel, openDialog } = useAppStore();

  return (
    <div className="ribbon-content">
      <div className="ribbon-groups">
        <RibbonGroup label={t("view.panels")}>
          <RibbonButton
            icon={panelLeftIcon}
            label={t("view.structure")}
            onClick={toggleSchedulePanel}
            active={showSchedulePanel}
          />
          <RibbonButton
            icon={panelRightIcon}
            label={t("view.propertiesPanel")}
            onClick={togglePropertiesPanel}
            active={showPropertiesPanel}
          />
        </RibbonGroup>

        <RibbonGroup label={t("view.preferences")}>
          <RibbonButton icon={settingsIcon} label={t("view.settings")} onClick={() => openDialog('settings')} />
        </RibbonGroup>
      </div>
    </div>
  );
}
