import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import RibbonTab from "./RibbonTab";
import HomeTab from "./HomeTab";
import IfcTab from "./IfcTab";
import RapportageTab from "./RapportageTab";
import OfferteTab from "./OfferteTab";
import SpreadsheetTab from "./SpreadsheetTab";
import TekstopmaakTab, { isOpmaakbareRegel } from "./TekstopmaakTab";
import { useAppStore } from "@/state/appStore";
import { uiText } from "@/i18n/uiText";
import "./Ribbon.css";

interface RibbonProps {
  onFileTabClick?: () => void;
}

const HIDE_EXP = import.meta.env.VITE_HIDE_EXPERIMENTAL === 'true';
const ALL_TABS = ["home", "offerte", "rapportage", "spreadsheet", "viewer3d", "pdf", "ifc", "tekstopmaak"] as const;
/** Contextueel: verschijnt alleen als de cursor op een tekst- of witregel staat. */
const CONTEXT_TABS = ["tekstopmaak"] as const;
const EXPERIMENTAL_TABS = ["offerte"] as const;
const BASE_TABS = (HIDE_EXP
  ? ALL_TABS.filter((t) => !(EXPERIMENTAL_TABS as readonly string[]).includes(t))
  : ALL_TABS
).filter((t) => !(CONTEXT_TABS as readonly string[]).includes(t)) as readonly (typeof ALL_TABS)[number][];
type TabId = (typeof ALL_TABS)[number];

export default function Ribbon({ onFileTabClick }: RibbonProps) {
  const { t, i18n } = useTranslation("ribbon");
  const [activeTab, setActiveTab] = useState<TabId>("home");

  // Contextueel tabblad: verschijnt zodra de cursor op een tekst- of witregel
  // staat, zoals de tabelhulpmiddelen in Office.
  const items = useAppStore((s) => s.items);
  const activeItemId = useAppStore((s) => s.activeItemId);
  const toonTekstopmaak = isOpmaakbareRegel(
    activeItemId ? items.find((i) => i.id === activeItemId) : undefined
  );
  const TABS = toonTekstopmaak
    ? ([...BASE_TABS, "tekstopmaak"] as readonly TabId[])
    : BASE_TABS;

  // Verlaat je de tekstregel terwijl dat tabblad openstaat, dan valt het lint
  // terug op Start — anders blijft er een leeg lint staan zonder actieve tab.
  useEffect(() => {
    if (!toonTekstopmaak && activeTab === 'tekstopmaak') setActiveTab('home');
  }, [toonTekstopmaak, activeTab]);
  const [prevTab, setPrevTab] = useState<TabId | null>(null);
  const [animating, setAnimating] = useState(false);
  const [direction, setDirection] = useState<"left" | "right">("right");
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
    // Ribbon tabs only swap the command groups; the content view is driven by
    // the bottom navigation bar (Data | Uren & Staart | Rapport | Spreadsheet | IFC).
  }, [activeTab]);

  useEffect(() => {
    updateHighlight();
    requestAnimationFrame(updateHighlight);
  }, [activeTab, i18n.language, updateHighlight]);

  useEffect(() => {
    window.addEventListener("resize", updateHighlight);
    return () => window.removeEventListener("resize", updateHighlight);
  }, [updateHighlight]);

  // Past het lint niet in het venster (bv. een laptop met 150% schaal), dan
  // kun je het opzij schuiven met de pijltjes of het muiswiel. Anders vielen
  // de groepen rechts weg en waren hun knoppen onbereikbaar.
  const [panelEl, setPanelEl] = useState<HTMLDivElement | null>(null);
  const [scrollable, setScrollable] = useState({ left: false, right: false });
  const updateScrollable = useCallback(() => {
    if (!panelEl) return;
    const { scrollLeft, scrollWidth, clientWidth } = panelEl;
    const left = scrollLeft > 1, right = scrollLeft + clientWidth < scrollWidth - 1;
    setScrollable(s => (s.left === left && s.right === right ? s : { left, right }));
  }, [panelEl]);

  useEffect(() => {
    if (!panelEl) return;
    updateScrollable();
    const observer = new ResizeObserver(updateScrollable);
    observer.observe(panelEl);
    if (panelEl.firstElementChild) observer.observe(panelEl.firstElementChild);
    return () => observer.disconnect();
  }, [panelEl, updateScrollable]);

  const scrollRibbon = (direction: -1 | 1) => {
    panelEl?.scrollBy({ left: direction * panelEl.clientWidth * 0.75, behavior: 'smooth' });
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    // deltaMode 1 = regels i.p.v. pixels (o.a. Linux); reken om naar pixels.
    el.scrollLeft += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
  };

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
      case "viewer3d": return <div className="ribbon-content"><div style={{ padding: 12, fontSize: 12, color: 'var(--theme-text-muted)' }}>{t('placeholders.viewer3d')}</div></div>;
      case "pdf": return <div className="ribbon-content"><div style={{ padding: 12, fontSize: 12, color: 'var(--theme-text-muted)' }}>{t('placeholders.pdf')}</div></div>;
      case "ifc": return <IfcTab />;
      case "tekstopmaak": return <TekstopmaakTab />;
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
          ref={setPanelEl}
          onScroll={updateScrollable}
          onWheel={handleWheel}
        >
          {renderContent(activeTab)}
        </div>
        {scrollable.left && (
          <button className="ribbon-scroll-btn ribbon-scroll-left" tabIndex={-1} onClick={() => scrollRibbon(-1)}
            aria-label={uiText("ribbon.scrollLeft", "Scroll ribbon left")} title={uiText("ribbon.scrollLeft", "Scroll ribbon left")}>
            <svg width="10" height="16" viewBox="0 0 10 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M8 2 2 8l6 6" /></svg>
          </button>
        )}
        {scrollable.right && (
          <button className="ribbon-scroll-btn ribbon-scroll-right" tabIndex={-1} onClick={() => scrollRibbon(1)}
            aria-label={uiText("ribbon.scrollRight", "Scroll ribbon right")} title={uiText("ribbon.scrollRight", "Scroll ribbon right")}>
            <svg width="10" height="16" viewBox="0 0 10 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="m2 2 6 6-6 6" /></svg>
          </button>
        )}
      </div>
    </div>
  );
}
