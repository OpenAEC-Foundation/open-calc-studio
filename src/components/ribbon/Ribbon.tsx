import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import RibbonTab from "./RibbonTab";
import HomeTab from "./HomeTab";
import IfcTab from "./IfcTab";
import RapportageTab from "./RapportageTab";
import OfferteTab from "./OfferteTab";
import SpreadsheetTab from "./SpreadsheetTab";
import { useAppStore } from "../../state/appStore";

import type { ContentTab } from "../../state/slices/uiSlice";
import "./Ribbon.css";

interface RibbonProps {
  onFileTabClick?: () => void;
}

const HIDE_EXP = import.meta.env.VITE_HIDE_EXPERIMENTAL === 'true';
const ALL_TABS = ["home", "offerte", "rapportage", "spreadsheet", "viewer3d", "pdf", "ifc"] as const;
const EXPERIMENTAL_TABS = ["offerte", "viewer3d", "pdf"] as const;
const TABS = (HIDE_EXP
  ? ALL_TABS.filter((t) => !(EXPERIMENTAL_TABS as readonly string[]).includes(t))
  : ALL_TABS) as readonly (typeof ALL_TABS)[number][];
type TabId = (typeof ALL_TABS)[number];

export default function Ribbon({ onFileTabClick }: RibbonProps) {
  const { t, i18n } = useTranslation("ribbon");
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [prevTab, setPrevTab] = useState<TabId | null>(null);
  const [animating, setAnimating] = useState(false);
  const [direction, setDirection] = useState<"left" | "right">("right");
  const { setActiveContentTab, setActiveSubSheet } = useAppStore();
  const subSheets = useAppStore((s) => s.subSheets);
  const activeSubSheetId = useAppStore((s) => s.activeSubSheetId);
  const addSubSheet = useAppStore((s) => s.addSubSheet);
  const tabsRef = useRef<HTMLDivElement>(null);
  const borderRef = useRef<HTMLDivElement>(null);
  const gapRef = useRef<HTMLDivElement>(null);

  const updateHighlight = useCallback(() => {
    const tabsEl = tabsRef.current;
    const borderEl = borderRef.current;
    const gapEl = gapRef.current;
    if (!tabsEl || !borderEl || !gapEl) return;

    const activeEl = tabsEl.querySelector(".ribbon-tab.active") as HTMLElement | null;
    if (!activeEl) {
      borderEl.style.opacity = "0";
      gapEl.style.opacity = "0";
      return;
    }

    const tabsRect = tabsEl.getBoundingClientRect();
    const activeRect = activeEl.getBoundingClientRect();
    const left = activeRect.left - tabsRect.left;
    const top = activeRect.top - tabsRect.top;
    const width = activeRect.width;
    const height = activeRect.height;

    borderEl.style.opacity = "1";
    borderEl.style.left = `${left}px`;
    borderEl.style.top = `${top}px`;
    borderEl.style.width = `${width}px`;
    borderEl.style.height = `${height + 1}px`;

    gapEl.style.opacity = "1";
    gapEl.style.left = `${left + 1}px`;
    gapEl.style.width = `${width - 2}px`;
  }, []);

  const switchTab = useCallback((newTab: TabId) => {
    if (newTab === activeTab) return;
    const oldIndex = TABS.indexOf(activeTab);
    const newIndex = TABS.indexOf(newTab);
    setDirection(newIndex > oldIndex ? "right" : "left");
    setPrevTab(activeTab);
    setActiveTab(newTab);
    setAnimating(true);
    const tab: ContentTab = newTab === "home" ? "grid" : newTab === "rapportage" ? "rapport" : newTab === "offerte" ? "offerte" : newTab === "spreadsheet" ? "spreadsheet" : newTab === "viewer3d" ? "viewer3d" : newTab === "pdf" ? "pdf" : "ifc";
    setActiveContentTab(tab);
    // When switching away from spreadsheet, clear activeSubSheet so grid shows
    if (newTab !== "spreadsheet") {
      setActiveSubSheet(null);
    } else {
      // Auto-create a sheet if none exists or none is active, so the user
      // lands directly in an editable spreadsheet rather than the empty hint.
      if (subSheets.length === 0) {
        const id = addSubSheet();
        setActiveSubSheet(id);
      } else if (!activeSubSheetId) {
        setActiveSubSheet(subSheets[0].id);
      }
    }
  }, [activeTab, setActiveContentTab, setActiveSubSheet, subSheets, activeSubSheetId, addSubSheet]);

  useEffect(() => {
    updateHighlight();
    requestAnimationFrame(updateHighlight);
  }, [activeTab, i18n.language, updateHighlight]);

  useEffect(() => {
    window.addEventListener("resize", updateHighlight);
    return () => window.removeEventListener("resize", updateHighlight);
  }, [updateHighlight]);

  useEffect(() => {
    if (!animating) return;
    const timer = setTimeout(() => {
      setAnimating(false);
      setPrevTab(null);
    }, 250);
    return () => clearTimeout(timer);
  }, [animating]);

  const renderContent = (tab: TabId) => {
    switch (tab) {
      case "home": return <HomeTab />;
      case "rapportage": return <RapportageTab />;
      case "offerte": return <OfferteTab />;
      case "spreadsheet": return <SpreadsheetTab />;
      case "viewer3d": return <div className="ribbon-content"><div style={{ padding: 12, fontSize: 12, color: 'var(--theme-text-muted)' }}>3D IFC Viewer — sleep een .ifc bestand naar het canvas of klik "Open IFC..."</div></div>;
      case "pdf": return <div className="ribbon-content"><div style={{ padding: 12, fontSize: 12, color: 'var(--theme-text-muted)' }}>PDF Viewer met meetfuncties — open een PDF en gebruik de tools voor lengte/oppervlak</div></div>;
      case "ifc": return <IfcTab />;
    }
  };

  return (
    <div className="ribbon-container">
      <div className="ribbon-tabs" ref={tabsRef}>
        <RibbonTab label={t("tabs.file")} isFileTab onClick={() => onFileTabClick?.()} />
        {TABS.map((tab) => (
          <RibbonTab
            key={tab}
            label={t(`tabs.${tab}`)}
            isActive={activeTab === tab}
            onClick={() => switchTab(tab)}
          />
        ))}
        <div className="ribbon-tab-border" ref={borderRef} />
        <div className="ribbon-tab-gap" ref={gapRef} />
      </div>

      <div className="ribbon-content-wrapper">
        {animating && prevTab && (
          <div
            className={`ribbon-content-panel ribbon-panel-exit-${direction}`}
            key={`prev-${prevTab}`}
          >
            {renderContent(prevTab)}
          </div>
        )}
        <div
          className={`ribbon-content-panel${animating ? ` ribbon-panel-enter-${direction}` : ""}`}
          key={`active-${activeTab}`}
        >
          {renderContent(activeTab)}
        </div>
      </div>
    </div>
  );
}
