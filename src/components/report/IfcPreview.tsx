import './ifc.css';
import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import { generateIfcCostFile } from '@/services/ifc/ifcCostGenerator';
import { generateIfcxJson } from '@/services/ifc/ifcxJsonGenerator';

// ── Syntax highlighting for STEP lines ──

/** Syntax-highlight a single STEP line */
function highlightStepLine(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  // Section keywords
  if (/^(ISO-10303-21|HEADER|ENDSEC|DATA|END-ISO-10303-21);?\s*$/.test(remaining.trim())) {
    return <span key={key} className="step-keyword">{text}</span>;
  }

  // FILE_DESCRIPTION, FILE_NAME, FILE_SCHEMA
  if (/^FILE_(DESCRIPTION|NAME|SCHEMA)\b/.test(remaining.trim())) {
    const match = remaining.match(/^(FILE_\w+)/);
    if (match) {
      parts.push(<span key={key++} className="step-keyword">{match[1]}</span>);
      remaining = remaining.slice(match[1].length);
    }
  }

  let i = 0;
  let buf = '';

  const flushBuf = () => {
    if (buf) {
      parts.push(<span key={key++}>{buf}</span>);
      buf = '';
    }
  };

  while (i < remaining.length) {
    const ch = remaining[i];

    // Entity reference: #123
    if (ch === '#' && i + 1 < remaining.length && /\d/.test(remaining[i + 1])) {
      flushBuf();
      let ref = '#';
      i++;
      while (i < remaining.length && /\d/.test(remaining[i])) {
        ref += remaining[i++];
      }
      parts.push(<span key={key++} className="step-entity-ref">{ref}</span>);
      continue;
    }

    // String literal: '...'
    if (ch === "'") {
      flushBuf();
      let str = "'";
      i++;
      while (i < remaining.length && remaining[i] !== "'") {
        str += remaining[i++];
      }
      if (i < remaining.length) str += remaining[i++];
      parts.push(<span key={key++} className="step-string">{str}</span>);
      continue;
    }

    // IFC entity type after = sign: =IFCWALLSTANDARDCASE(
    if (ch === '=' && i + 1 < remaining.length && /[A-Z]/.test(remaining[i + 1])) {
      flushBuf();
      buf = '=';
      i++;
      let entityType = '';
      while (i < remaining.length && /[A-Z0-9_]/.test(remaining[i])) {
        entityType += remaining[i++];
      }
      parts.push(<span key={key++}>=</span>);
      parts.push(<span key={key++} className="step-entity-type">{entityType}</span>);
      buf = '';
      continue;
    }

    // Enum values: .VALUE.
    if (ch === '.' && i + 1 < remaining.length && /[A-Z$_]/.test(remaining[i + 1])) {
      flushBuf();
      let enumVal = '.';
      i++;
      while (i < remaining.length && remaining[i] !== '.' && /[A-Z0-9$_]/.test(remaining[i])) {
        enumVal += remaining[i++];
      }
      if (i < remaining.length && remaining[i] === '.') {
        enumVal += '.';
        i++;
      }
      parts.push(<span key={key++} className="step-enum">{enumVal}</span>);
      continue;
    }

    // Comment: /* ... */
    if (ch === '/' && i + 1 < remaining.length && remaining[i + 1] === '*') {
      flushBuf();
      let comment = '/*';
      i += 2;
      while (i < remaining.length - 1 && !(remaining[i] === '*' && remaining[i + 1] === '/')) {
        comment += remaining[i++];
      }
      if (i < remaining.length - 1) {
        comment += '*/';
        i += 2;
      }
      parts.push(<span key={key++} className="step-comment">{comment}</span>);
      continue;
    }

    // Number literals
    if (/[\d]/.test(ch) && (i === 0 || /[=,(]/.test(remaining[i - 1]))) {
      flushBuf();
      let num = '';
      while (i < remaining.length && /[\d.eE\-+]/.test(remaining[i])) {
        num += remaining[i++];
      }
      parts.push(<span key={key++} className="step-number">{num}</span>);
      continue;
    }

    buf += ch;
    i++;
  }

  flushBuf();
  return <>{parts}</>;
}

// ── Collapsible JSON tree ──

/** Parsed JSON node for tree rendering */
interface JsonTreeNode {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  key?: string;
  value?: unknown;
  children?: JsonTreeNode[];
  itemCount?: number;
  /** The ifcGuid found inside this node (for entity mapping) */
  ifcGuid?: string;
  /** Path-based id for scrolling/highlighting */
  nodeId?: string;
}

/** Parse a JSON value into a tree structure */
function parseJsonTree(value: unknown, key?: string, pathPrefix?: string): JsonTreeNode {
  const nodePath = pathPrefix ? (key ? `${pathPrefix}.${key}` : pathPrefix) : (key || 'root');

  if (value === null) {
    return { type: 'null', key, value: null, nodeId: nodePath };
  }
  if (typeof value === 'string') {
    return { type: 'string', key, value, nodeId: nodePath };
  }
  if (typeof value === 'number') {
    return { type: 'number', key, value, nodeId: nodePath };
  }
  if (typeof value === 'boolean') {
    return { type: 'boolean', key, value, nodeId: nodePath };
  }
  if (Array.isArray(value)) {
    const children = value.map((item, i) => parseJsonTree(item, String(i), nodePath));
    return { type: 'array', key, children, itemCount: value.length, nodeId: nodePath };
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const children = Object.entries(obj).map(([k, v]) => parseJsonTree(v, k, nodePath));
    const node: JsonTreeNode = {
      type: 'object',
      key,
      children,
      itemCount: Object.keys(obj).length,
      nodeId: nodePath,
    };
    // Capture ifcGuid if present
    if ('ifcx::ocs::ifcGuid' in obj && typeof obj['ifcx::ocs::ifcGuid'] === 'string') {
      node.ifcGuid = obj['ifcx::ocs::ifcGuid'];
    }
    return node;
  }
  return { type: 'null', key, value, nodeId: nodePath };
}

/** Collect all ifcGuid -> nodeId mappings from the tree */
function collectGuidMappings(node: JsonTreeNode, map: Map<string, string>): void {
  if (node.ifcGuid && node.nodeId) {
    map.set(node.ifcGuid, node.nodeId);
  }
  if (node.children) {
    for (const child of node.children) {
      collectGuidMappings(child, map);
    }
  }
}

/** Highlight a JSON value inline */
function renderJsonValue(value: unknown): React.ReactNode {
  if (value === null) return <span className="step-keyword">null</span>;
  if (typeof value === 'boolean') return <span className="step-keyword">{String(value)}</span>;
  if (typeof value === 'number') return <span className="step-number">{value}</span>;
  if (typeof value === 'string') {
    // Special coloring for IFC types
    if (/^Ifc\w+$/.test(value)) {
      return <span className="step-entity-type">"{value}"</span>;
    }
    if (/^(MATERIAL|LABOR|BUDGET|ESTIMATE|TENDER|DRAFT|FINAL|REVISED)$/.test(value)) {
      return <span className="step-enum">"{value}"</span>;
    }
    return <span className="step-string">"{value}"</span>;
  }
  return <span>{String(value)}</span>;
}

interface JsonTreeRowProps {
  node: JsonTreeNode;
  depth: number;
  collapsed: Set<string>;
  onToggle: (nodeId: string) => void;
  highlightedNodeId: string | null;
  onNodeClick?: (ifcGuid: string) => void;
  isLast: boolean;
}

const JsonTreeRow: React.FC<JsonTreeRowProps> = ({
  node, depth, collapsed, onToggle, highlightedNodeId, onNodeClick, isLast,
}) => {
  const nodeId = node.nodeId || '';
  const isCollapsible = node.type === 'object' || node.type === 'array';
  const isCollapsed = collapsed.has(nodeId);
  const isHighlighted = highlightedNodeId === nodeId;
  const indent = depth * 16;
  const comma = isLast ? '' : ',';

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isCollapsible) onToggle(nodeId);
  };

  const handleEntityClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.ifcGuid && onNodeClick) {
      onNodeClick(node.ifcGuid);
    }
  };

  const rows: React.ReactNode[] = [];
  const rowRef = isHighlighted ? 'highlighted' : undefined;

  if (!isCollapsible) {
    // Leaf value
    rows.push(
      <div
        key={nodeId}
        className={`json-tree-row${isHighlighted ? ' json-tree-highlight' : ''}`}
        style={{ paddingLeft: indent }}
        data-highlight={rowRef}
      >
        {node.key !== undefined && (
          <><span className="json-key">"{node.key}"</span>: </>
        )}
        {renderJsonValue(node.value)}{comma}
      </div>
    );
  } else {
    // Object or array
    const openBrace = node.type === 'object' ? '{' : '[';
    const closeBrace = node.type === 'object' ? '}' : ']';
    const hasIfcGuid = !!node.ifcGuid;

    rows.push(
      <div
        key={`${nodeId}-open`}
        className={`json-tree-row json-tree-collapsible${isHighlighted ? ' json-tree-highlight' : ''}${hasIfcGuid ? ' json-tree-entity' : ''}`}
        style={{ paddingLeft: indent }}
        data-node-id={nodeId}
        data-highlight={rowRef}
        onClick={hasIfcGuid ? handleEntityClick : undefined}
      >
        <span className="json-tree-toggle" onClick={handleToggle}>
          {isCollapsed ? '\u25B6' : '\u25BC'}
        </span>
        {node.key !== undefined && (
          <><span className="json-key">"{node.key}"</span>: </>
        )}
        {isCollapsed ? (
          <span className="json-tree-collapsed-preview">
            {openBrace}<span className="step-comment">
              {node.type === 'object' ? `\u2026${node.itemCount} props` : `\u2026${node.itemCount} items`}
            </span>{closeBrace}{comma}
          </span>
        ) : (
          <span>{openBrace}</span>
        )}
      </div>
    );

    if (!isCollapsed && node.children) {
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        rows.push(
          <JsonTreeRow
            key={child.nodeId || `${nodeId}-${i}`}
            node={child}
            depth={depth + 1}
            collapsed={collapsed}
            onToggle={onToggle}
            highlightedNodeId={highlightedNodeId}
            onNodeClick={onNodeClick}
            isLast={i === node.children.length - 1}
          />
        );
      }
      rows.push(
        <div
          key={`${nodeId}-close`}
          className="json-tree-row"
          style={{ paddingLeft: indent }}
        >
          {closeBrace}{comma}
        </div>
      );
    }
  }

  return <>{rows}</>;
};

// ── STEP panel: extract entity info for click-to-sync ──

interface StepEntityInfo {
  lineNumber: number;
  entityId: number;
  entityType: string;
  ifcGuid: string | null;
}

/** Parse STEP lines to extract entity references and guids */
function parseStepEntities(lines: string[]): StepEntityInfo[] {
  const entities: StepEntityInfo[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^#(\d+)=(\w+)\(/);
    if (match) {
      const entityId = parseInt(match[1], 10);
      const entityType = match[2];
      // Extract ifcGuid (first string argument in single quotes)
      const guidMatch = line.match(/\('([A-Za-z0-9_$]{22})'/);
      entities.push({
        lineNumber: i + 1,
        entityId,
        entityType,
        ifcGuid: guidMatch ? guidMatch[1] : null,
      });
    }
  }
  return entities;
}

// ── Main component ──

interface StepLine {
  lineNumber: number;
  text: string;
}

export const IfcPreview: React.FC = () => {
  const { t } = useTranslation();
  const { schedule, items, offerte } = useAppStore();
  const [splitPos, setSplitPos] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [highlightedStepLine, setHighlightedStepLine] = useState<number | null>(null);
  const [highlightedJsonNodeId, setHighlightedJsonNodeId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const stepPanelRef = useRef<HTMLDivElement>(null);
  const jsonPanelRef = useRef<HTMLDivElement>(null);

  const ifcContent = useMemo(
    () => generateIfcCostFile(schedule, items, offerte),
    [schedule, items, offerte],
  );

  const jsonContent = useMemo(
    () => generateIfcxJson(schedule, items),
    [schedule, items],
  );

  const stepLines: StepLine[] = useMemo(() =>
    ifcContent.split('\n').map((text, i) => ({ lineNumber: i + 1, text })),
    [ifcContent],
  );

  // Parse the JSON content into a tree
  const jsonTree = useMemo(() => {
    try {
      const parsed = JSON.parse(jsonContent);
      return parseJsonTree(parsed);
    } catch {
      return null;
    }
  }, [jsonContent]);

  // Initialize collapsed state: collapse nodes at depth > 3
  const initialCollapsed = useMemo(() => {
    const set = new Set<string>();
    if (!jsonTree) return set;

    function walkForCollapse(node: JsonTreeNode, depth: number) {
      if ((node.type === 'object' || node.type === 'array') && node.nodeId && depth > 3) {
        set.add(node.nodeId);
      }
      if (node.children) {
        for (const child of node.children) {
          walkForCollapse(child, depth + 1);
        }
      }
    }
    walkForCollapse(jsonTree, 0);
    return set;
  }, [jsonTree]);

  // Set initial collapsed state once
  const [collapsedInitialized, setCollapsedInitialized] = useState(false);
  useEffect(() => {
    if (!collapsedInitialized && initialCollapsed.size > 0) {
      setCollapsed(initialCollapsed);
      setCollapsedInitialized(true);
    }
  }, [initialCollapsed, collapsedInitialized]);

  // Build guid -> JSON nodeId mapping
  const guidToJsonNodeId = useMemo(() => {
    const map = new Map<string, string>();
    if (jsonTree) collectGuidMappings(jsonTree, map);
    return map;
  }, [jsonTree]);

  // Build guid -> STEP line number mapping
  const stepEntities = useMemo(
    () => parseStepEntities(ifcContent.split('\n')),
    [ifcContent],
  );
  const guidToStepLine = useMemo(() => {
    const map = new Map<string, number>();
    for (const entity of stepEntities) {
      if (entity.ifcGuid) {
        map.set(entity.ifcGuid, entity.lineNumber);
      }
    }
    return map;
  }, [stepEntities]);

  // Build step entity line set for clickable detection
  const stepEntityLines = useMemo(() => {
    const set = new Set<number>();
    for (const e of stepEntities) {
      if (e.entityType === 'IFCCOSTITEM' || e.entityType === 'IFCCOSTSCHEDULE') {
        set.add(e.lineNumber);
      }
    }
    return set;
  }, [stepEntities]);

  // Build step line -> guid mapping
  const stepLineToGuid = useMemo(() => {
    const map = new Map<number, string>();
    for (const entity of stepEntities) {
      if (entity.ifcGuid) {
        map.set(entity.lineNumber, entity.ifcGuid);
      }
    }
    return map;
  }, [stepEntities]);

  const handleToggle = useCallback((nodeId: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  // STEP line click -> highlight corresponding JSON node
  const handleStepLineClick = useCallback((lineNumber: number) => {
    const guid = stepLineToGuid.get(lineNumber);
    if (!guid) return;

    const jsonNodeId = guidToJsonNodeId.get(guid);
    if (!jsonNodeId) return;

    setHighlightedStepLine(lineNumber);
    setHighlightedJsonNodeId(jsonNodeId);

    // Expand parent nodes so the target is visible
    setCollapsed(prev => {
      const next = new Set(prev);
      // Expand all ancestors of the target node
      const parts = jsonNodeId.split('.');
      for (let i = 1; i < parts.length; i++) {
        const ancestorPath = parts.slice(0, i).join('.');
        next.delete(ancestorPath);
      }
      return next;
    });

    // Scroll to the highlighted node in the JSON panel after a short delay
    requestAnimationFrame(() => {
      const el = jsonPanelRef.current?.querySelector('[data-highlight="highlighted"]');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }, [stepLineToGuid, guidToJsonNodeId]);

  // JSON node click -> highlight corresponding STEP line
  const handleJsonNodeClick = useCallback((ifcGuid: string) => {
    const stepLine = guidToStepLine.get(ifcGuid);
    if (!stepLine) return;

    const jsonNodeId = guidToJsonNodeId.get(ifcGuid);
    setHighlightedStepLine(stepLine);
    setHighlightedJsonNodeId(jsonNodeId || null);

    // Scroll to the highlighted line in the STEP panel
    requestAnimationFrame(() => {
      const el = stepPanelRef.current?.querySelector(`[data-step-line="${stepLine}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }, [guidToStepLine, guidToJsonNodeId]);

  const stepFileSize = useMemo(() => {
    const bytes = new Blob([ifcContent]).size;
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  }, [ifcContent]);

  const jsonFileSize = useMemo(() => {
    const bytes = new Blob([jsonContent]).size;
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  }, [jsonContent]);

  const jsonLineCount = useMemo(() => jsonContent.split('\n').length, [jsonContent]);

  const handleDownloadStep = () => {
    const blob = new Blob([ifcContent], { type: 'application/x-step' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${schedule.name || 'begroting'}.ifc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadJson = () => {
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${schedule.name || 'begroting'}.ifcx.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyStep = () => navigator.clipboard.writeText(ifcContent);
  const handleCopyJson = () => navigator.clipboard.writeText(jsonContent);

  // Splitter drag handlers
  const handleSplitterMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);

    const container = (e.target as HTMLElement).parentElement!;
    const rect = container.getBoundingClientRect();

    const onMouseMove = (ev: MouseEvent) => {
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setSplitPos(Math.min(80, Math.max(20, pct)));
    };
    const onMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, []);

  return (
    <div className={`ifc-preview ifc-split${isDragging ? ' ifc-dragging' : ''}`}>
      {/* Left panel: IFC STEP */}
      <div className="ifc-panel" style={{ width: `${splitPos}%` }}>
        <div className="ifc-toolbar">
          <div className="ifc-toolbar-info">
            <span className="ifc-toolbar-label">{t('ifc.stepFormat')}</span>
            <span className="ifc-toolbar-meta">{t('lines', { count: stepLines.length })}</span>
            <span className="ifc-toolbar-meta">{stepFileSize}</span>
          </div>
          <div className="ifc-toolbar-actions">
            <button className="ifc-toolbar-btn" onClick={handleCopyStep}>{t('copyBtn')}</button>
            <button className="ifc-toolbar-btn" onClick={handleDownloadStep}>{t('downloadIfc')}</button>
          </div>
        </div>
        <div className="ifc-code" ref={stepPanelRef}>
          <table className="ifc-step-table">
            <tbody>
              {stepLines.map((line) => {
                const isEntity = stepEntityLines.has(line.lineNumber);
                const isHighlighted = highlightedStepLine === line.lineNumber;
                return (
                  <tr
                    key={line.lineNumber}
                    className={`${isEntity ? 'ifc-step-clickable' : ''}${isHighlighted ? ' ifc-step-highlight' : ''}`}
                    data-step-line={line.lineNumber}
                    onClick={isEntity ? () => handleStepLineClick(line.lineNumber) : undefined}
                  >
                    <td className="ifc-step-linenum">{line.lineNumber}</td>
                    <td className="ifc-step-text">{highlightStepLine(line.text)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Splitter */}
      <div className="ifc-splitter" onMouseDown={handleSplitterMouseDown} />

      {/* Right panel: IfcX */}
      <div className="ifc-panel" style={{ width: `${100 - splitPos}%` }}>
        <div className="ifc-toolbar">
          <div className="ifc-toolbar-info">
            <span className="ifc-toolbar-label">{t('ifc.jsonFormat')}</span>
            <span className="ifc-toolbar-meta">{t('lines', { count: jsonLineCount })}</span>
            <span className="ifc-toolbar-meta">{jsonFileSize}</span>
          </div>
          <div className="ifc-toolbar-actions">
            <button className="ifc-toolbar-btn" onClick={handleCopyJson}>{t('copyBtn')}</button>
            <button className="ifc-toolbar-btn" onClick={handleDownloadJson}>{t('download')}</button>
          </div>
        </div>
        <div className="ifc-code ifc-json-tree" ref={jsonPanelRef}>
          {jsonTree ? (
            <JsonTreeRow
              node={jsonTree}
              depth={0}
              collapsed={collapsed}
              onToggle={handleToggle}
              highlightedNodeId={highlightedJsonNodeId}
              onNodeClick={handleJsonNodeClick}
              isLast={true}
            />
          ) : (
            <div className="ifc-json-error">Failed to parse JSON</div>
          )}
        </div>
      </div>
    </div>
  );
};
